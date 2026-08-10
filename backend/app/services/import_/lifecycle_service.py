"""CAS Import lifecycle orchestration per Updated-CAS-PRD and Updated-CAS-App-Flow.

Handles:
- Magic-byte & file size validation (FR-3).
- Ephemeral encrypted buffer retention for password retries (FR-3).
- Attribution resolution & confirmation gating (FR-4).
- State transitions (FR-5).
- 5-column composite fingerprint deduplication (FR-6).
- Statement date range extraction (FR-9).
"""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.enums import ImportStatus, PlanNameVariant, PlanType, SourceCasType
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.services.import_.attribution import AttributionDecision, AttributionStatus, resolve_attribution
from app.services.import_.buffer_cache import get_pdf_buffer, remove_pdf_buffer, store_pdf_buffer
from app.services.import_.parser import ParseError, ParseResult, parse_cas_pdf_bytes, source_cas_type_from_file_type
from app.services.import_.state_machine import transition_status

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25MB


class InvalidFileFormatError(ValueError):
    """Raised when file magic bytes do not match PDF."""


class FileTooLargeError(ValueError):
    """Raised when file exceeds size cap."""


class SessionExpiredError(ValueError):
    """Raised when cached PDF buffer is expired or not found for password retry."""


def _map_source_cas_type(file_type: str) -> SourceCasType | None:
    mapped = source_cas_type_from_file_type(file_type)
    return SourceCasType(mapped) if mapped else None


def validate_file_payload(file_bytes: bytes) -> None:
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise FileTooLargeError("File too large. Maximum supported file size is 25MB.")
    if not file_bytes.startswith(b"%PDF-"):
        raise InvalidFileFormatError("PDF only — please upload a CAS statement in PDF format.")


def _commit_parsed_transactions(
    db: Session,
    import_rec: Import,
    parse_result: ParseResult,
    target_member_id: uuid.UUID,
) -> tuple[int, int]:
    """Deduplicates and commits transactions for the given parse result."""
    scheme_cache: dict[str, Scheme] = {}
    folio_cache: dict[tuple[uuid.UUID, uuid.UUID, str], Folio] = {}
    added_keys: set[tuple] = set()
    added = 0
    skipped = 0

    dates: list[date] = []

    for norm in parse_result.transactions:
        dates.append(norm.txn_date)
        amfi_code = norm.amfi or f"UN_{uuid.uuid4().hex[:8]}"

        if amfi_code not in scheme_cache:
            existing = db.query(Scheme).filter_by(amfi_code=amfi_code).first()
            if existing:
                scheme_cache[amfi_code] = existing
            else:
                new_scheme = Scheme(
                    id=uuid.uuid4(),
                    amfi_code=amfi_code,
                    isin=norm.isin,
                    name=norm.scheme_name,
                    amc_name=norm.amc,
                    sebi_category=norm.scheme_type or "Unclassified",
                )
                db.add(new_scheme)
                db.flush()
                scheme_cache[amfi_code] = new_scheme

        scheme = scheme_cache[amfi_code]
        folio_key = (target_member_id, scheme.id, norm.folio)
        if folio_key not in folio_cache:
            existing_folio = (
                db.query(Folio)
                .filter_by(household_member_id=target_member_id, scheme_id=scheme.id, folio_number=norm.folio)
                .first()
            )
            if existing_folio:
                folio_cache[folio_key] = existing_folio
            else:
                new_folio = Folio(
                    id=uuid.uuid4(),
                    household_member_id=target_member_id,
                    scheme_id=scheme.id,
                    folio_number=norm.folio,
                    plan_type=PlanType.DIRECT,
                )
                db.add(new_folio)
                db.flush()
                folio_cache[folio_key] = new_folio

        folio = folio_cache[folio_key]
        dedupe_key = (folio.id, norm.txn_date, norm.amount, norm.units, norm.txn_type)

        if dedupe_key in added_keys:
            skipped += 1
            continue

        dup = (
            db.query(Transaction)
            .filter_by(
                folio_id=folio.id,
                date=norm.txn_date,
                amount=norm.amount,
                units=norm.units,
                type=norm.txn_type,
            )
            .first()
        )
        if dup:
            skipped += 1
            continue

        db.add(
            Transaction(
                id=uuid.uuid4(),
                folio_id=folio.id,
                import_id=import_rec.id,
                type=norm.txn_type,
                date=norm.txn_date,
                amount=norm.amount,
                units=norm.units,
                nav=norm.nav,
                raw_description=norm.description,
            )
        )
        added_keys.add(dedupe_key)
        added += 1

    if dates:
        import_rec.statement_from_date = min(dates)
        import_rec.statement_to_date = max(dates)

    db.flush()
    # Evaluate coverage gaps on all affected folios
    from app.services.import_.coverage_gap import evaluate_folio_coverage_gaps
    for folio in folio_cache.values():
        evaluate_folio_coverage_gaps(db, folio.id)

    return added, skipped


def create_cas_import(
    db: Session,
    user_id: uuid.UUID,
    household_member_id: uuid.UUID,
    file_bytes: bytes,
    filename: str,
    password: str,
    source_tab: str = "upload",
) -> Import:
    """Ingest a CAS PDF file, manage state transitions, parse, and commit."""
    validate_file_payload(file_bytes)

    import_rec = Import(
        id=uuid.uuid4(),
        household_member_id=household_member_id,
        status=ImportStatus.UPLOAD_STARTED,
        source_tab=source_tab,
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(import_rec)
    db.flush()

    try:
        parse_result = parse_cas_pdf_bytes(file_bytes, password)
    except ParseError as exc:
        if exc.code == "wrong_password":
            store_pdf_buffer(str(import_rec.id), file_bytes)
            import_rec.status = transition_status(import_rec.status, ImportStatus.PASSWORD_REQUIRED)
            import_rec.error_code = "wrong_password"
            import_rec.error_message = exc.message
        elif exc.code in ("summary_cas", "demat_cas", "unreadable_pdf"):
            import_rec.status = transition_status(import_rec.status, ImportStatus.VALIDATION_FAILED)
            import_rec.error_code = exc.code
            import_rec.error_message = exc.message
        else:
            import_rec.status = transition_status(import_rec.status, ImportStatus.IMPORT_FAILED)
            import_rec.error_code = exc.code
            import_rec.error_message = exc.message
        db.commit()
        return import_rec

    # Parse succeeded -> Transition to Processing
    import_rec.status = transition_status(import_rec.status, ImportStatus.PROCESSING)
    import_rec.source_cas_type = _map_source_cas_type(parse_result.file_type)
    import_rec.raw_parser_output = json.loads(parse_result.raw_json)

    # Attribution resolution
    attribution = resolve_attribution(db, user_id, household_member_id, parse_result)
    target_member_id = attribution.resolved_member_id or household_member_id
    import_rec.household_member_id = target_member_id

    # Commit transactions & deduplicate
    added, skipped = _commit_parsed_transactions(db, import_rec, parse_result, target_member_id)

    import_rec.new_transactions_count = added
    import_rec.duplicate_transactions_count = skipped
    import_rec.confirmed_at = datetime.now(timezone.utc)
    import_rec.status = transition_status(import_rec.status, ImportStatus.IMPORT_SUCCESSFUL)

    remove_pdf_buffer(str(import_rec.id))
    db.commit()
    return import_rec


def retry_cas_import_password(
    db: Session,
    import_id: uuid.UUID,
    user_id: uuid.UUID,
    new_password: str,
) -> Import:
    """In-place password retry against cached encrypted PDF buffer."""
    import_rec = db.query(Import).filter_by(id=import_id).first()
    if not import_rec:
        raise ValueError("Import record not found.")

    pdf_bytes = get_pdf_buffer(str(import_id))
    if not pdf_bytes:
        raise SessionExpiredError("Session expired or file no longer cached. Please re-upload your CAS statement.")

    import_rec.status = transition_status(import_rec.status, ImportStatus.UPLOAD_STARTED)

    try:
        parse_result = parse_cas_pdf_bytes(pdf_bytes, new_password)
    except ParseError as exc:
        if exc.code == "wrong_password":
            import_rec.status = transition_status(import_rec.status, ImportStatus.PASSWORD_REQUIRED)
            import_rec.error_code = "wrong_password"
            import_rec.error_message = exc.message
        else:
            import_rec.status = transition_status(import_rec.status, ImportStatus.IMPORT_FAILED)
            import_rec.error_code = exc.code
            import_rec.error_message = exc.message
            remove_pdf_buffer(str(import_rec.id))
        db.commit()
        return import_rec

    # Succeeded
    import_rec.status = transition_status(import_rec.status, ImportStatus.PROCESSING)
    import_rec.source_cas_type = _map_source_cas_type(parse_result.file_type)
    import_rec.raw_parser_output = json.loads(parse_result.raw_json)

    attribution = resolve_attribution(db, user_id, import_rec.household_member_id, parse_result)
    target_member_id = attribution.resolved_member_id or import_rec.household_member_id
    import_rec.household_member_id = target_member_id

    added, skipped = _commit_parsed_transactions(db, import_rec, parse_result, target_member_id)

    import_rec.new_transactions_count = added
    import_rec.duplicate_transactions_count = skipped
    import_rec.confirmed_at = datetime.now(timezone.utc)
    import_rec.error_code = None
    import_rec.error_message = None
    import_rec.status = transition_status(import_rec.status, ImportStatus.IMPORT_SUCCESSFUL)

    remove_pdf_buffer(str(import_rec.id))
    db.commit()
    return import_rec
