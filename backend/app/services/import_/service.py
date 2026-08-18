"""Import Service orchestration: parse preview (no DB writes) and confirm
(persists). Implements PRD-01 FR-9-FR-11.

In-memory preview sessions are a deliberate, prototype-carried
simplification (ponytail: single-process only; move to a DB-backed or
Redis-backed session store if a multi-instance deploy needs this later).
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy.orm import Session

from app.models.enums import PlanNameVariant, PlanType, SourceCasType
from app.models.folio import Folio
from app.models.imports import Import, ImportStatus
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.services.dashboard.holdings import invalidate_holdings_cache
from app.services.import_.enrich import MfApiClient, _normalize_name, mfapi_client
from app.services.import_.parser import ParseResult, source_cas_type_from_file_type
from app.services.import_.schemas import (
    ImportConfirmResponse,
    ImportPreviewResponse,
    SchemeConfirmation,
    SchemeMatchPreview,
    TransactionPreview,
)

_preview_sessions: dict[str, dict[str, Any]] = {}

CONFIDENCE_THRESHOLD = 0.92
SESSION_TTL_MINUTES = 60


class SchemeConfidenceError(Exception):
    """Raised when a scheme needs an explicit AMFI override and didn't get
    one — distinct from ValueError's "session not found" so the route can
    return 409 (fixable by the client) instead of 404 (start over)."""


def _sweep_expired_sessions(ttl_minutes: int = SESSION_TTL_MINUTES) -> None:
    """Evicts preview sessions older than ttl_minutes. Each session holds the
    full ParseResult, including investor name/email — sweeping keeps
    abandoned/rejected parses from accumulating in process memory forever.

    ponytail: sweeps on every build_import_preview call rather than a
    background thread/scheduler — fine for this single-process prototype
    (see module docstring); move to a real TTL cache if that changes.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=ttl_minutes)
    expired = [sid for sid, s in _preview_sessions.items() if s["created_at"] < cutoff]
    for sid in expired:
        del _preview_sessions[sid]


async def build_import_preview(
    parse_result: ParseResult, filename: str, client: MfApiClient | None = None
) -> ImportPreviewResponse:
    _sweep_expired_sessions()
    client = client or mfapi_client
    session_id = uuid.uuid4().hex

    scheme_previews: list[SchemeMatchPreview] = []
    key_to_temp: dict[tuple[str, str, str], str] = {}

    async def resolve(scheme):
        match, status = await client.resolve_scheme(scheme.name, scheme.amfi)
        category = None
        if match and match.amfi_code:
            category = await client.get_scheme_category(match.amfi_code)
        return match, status, category

    resolutions = await asyncio.gather(*(resolve(scheme) for scheme in parse_result.schemes))

    for scheme, (match, status, category) in zip(parse_result.schemes, resolutions, strict=True):
        temp_id = uuid.uuid4().hex[:12]
        key_to_temp[(scheme.folio, scheme.amc, scheme.name)] = temp_id

        scheme_previews.append(
            SchemeMatchPreview(
                temp_id=temp_id, name=scheme.name, isin=scheme.isin, amfi_code=scheme.amfi,
                suggested_amfi_code=match.amfi_code if match else None,
                suggested_name=match.scheme_name if match else None,
                match_confidence=match.confidence if match else 0.0,
                match_status=status, folio=scheme.folio, amc=scheme.amc,
                transaction_count=scheme.transaction_count, plan_type=scheme.plan_type,
                category=category or scheme.scheme_type,
            )
        )

    txn_previews = [
        TransactionPreview(
            folio=t.folio, scheme_name=t.scheme_name, txn_date=t.txn_date, txn_type=t.txn_type.value,
            description=t.description, amount=str(t.amount) if t.amount is not None else None,
            units=str(t.units) if t.units is not None else None, nav=str(t.nav) if t.nav is not None else None,
        )
        for t in parse_result.transactions
    ]

    _preview_sessions[session_id] = {
        "created_at": datetime.now(timezone.utc),
        "filename": filename, "parse_result": parse_result,
        "key_to_temp": key_to_temp,
        "scheme_previews": {s.temp_id: s for s in scheme_previews},
    }

    return ImportPreviewResponse(
        session_id=session_id, filename=filename,
        investor_name=parse_result.investor.name, investor_email=parse_result.investor.email,
        pan_masked=parse_result.investor.pan_masked, schemes=scheme_previews, transactions=txn_previews,
        transaction_count=len(txn_previews), parse_warnings=parse_result.parse_warnings,
        cas_type=parse_result.cas_type, file_type=parse_result.file_type,
    )


def _resolve_category(mfapi_category: str | None, cas_scheme_type: str | None) -> str:
    return mfapi_category or cas_scheme_type or "Unclassified"


def confirm_import(
    db: Session,
    session_id: str,
    household_member_id: uuid.UUID,
    scheme_confirmations: list[SchemeConfirmation],
) -> ImportConfirmResponse:
    session = _preview_sessions.get(session_id)
    if not session:
        raise ValueError("Import session not found or expired.")

    parse_result: ParseResult = session["parse_result"]
    previews: dict[str, SchemeMatchPreview] = session["scheme_previews"]
    key_to_temp = session["key_to_temp"]
    overrides = {c.temp_id: c for c in scheme_confirmations}
    parsed_scheme_by_key = {(s.folio, s.amc, s.name): s for s in parse_result.schemes}

    # Validate every referenced scheme up front — a rejection here makes zero DB
    # writes, instead of leaving earlier schemes/folios/transactions flushed
    # (not committed, but written) to the session for the caller to roll back.
    seen_temp_ids: set[str] = set()
    for norm in parse_result.transactions:
        temp_id = key_to_temp[(norm.folio, norm.amc, norm.scheme_name)]
        if temp_id in seen_temp_ids:
            continue
        seen_temp_ids.add(temp_id)
        preview = previews[temp_id]
        override = overrides.get(temp_id)
        amfi_code = (override.amfi_code if override and override.amfi_code else None) or preview.suggested_amfi_code
        # Gate on the same match_status already shown to the user in the preview
        # (not a fresh confidence comparison) — a scheme the preview labeled
        # "pending" must never be silently confirmed just because its score
        # happens to clear this function's own copy of the threshold.
        confident = preview.match_status == "confirmed" or bool(override and override.amfi_code)
        if not amfi_code or not confident:
            raise SchemeConfidenceError(
                f"Scheme '{preview.name}' requires an explicit AMFI code override (match confidence "
                f"{preview.match_confidence:.2f} below {CONFIDENCE_THRESHOLD})."
            )

        # DATA-001: an override.amfi_code used to be trusted at full confidence
        # with zero cross-check — a code that doesn't exist at all in AMFI's
        # own master list is a data-entry error, not a legitimate correction.
        # Only checked when the master list is already cached this process
        # (populated by the preceding build_import_preview call); a fresh
        # process with nothing cached degrades to trusting the override, same
        # as before this fix, rather than blocking the confirm on a lookup
        # this synchronous function can't perform itself.
        if override and override.amfi_code:
            scheme_list = mfapi_client.cached_scheme_list()
            if scheme_list is not None and mfapi_client._canonical_name_for_code(override.amfi_code, scheme_list) is None:
                raise SchemeConfidenceError(
                    f"Override AMFI code '{override.amfi_code}' for scheme '{preview.name}' was not found "
                    "in AMFI's scheme master list."
                )

        # Combined fix for CLAUDE.md's "no server-side 409 backstop on
        # plan-type override" gap: the scheme's own CAS-parsed name is an
        # unambiguous, structurally-derived signal of Direct vs Regular
        # (unlike the ARN-derived preview.plan_type an override exists to
        # correct in the first place) — a plan_type_override that contradicts
        # it is almost certainly a client-side error, not a real correction.
        if override and override.plan_type_override:
            parsed_scheme = parsed_scheme_by_key.get((norm.folio, norm.amc, norm.scheme_name))
            variant = parsed_scheme.plan_name_variant if parsed_scheme else None
            if variant in (PlanNameVariant.DIRECT.value, PlanNameVariant.REGULAR.value) and (
                variant != override.plan_type_override.value
            ):
                raise SchemeConfidenceError(
                    f"Plan-type override '{override.plan_type_override.value}' for scheme '{preview.name}' "
                    f"contradicts its CAS-parsed plan name ('{variant}')."
                )

    # All schemes validated — safe to start writing.
    import_rec = Import(
        id=uuid.uuid4(), household_member_id=household_member_id, status=ImportStatus.CONFIRMED,
        source_cas_type=_map_source_cas_type(parse_result.file_type),
        raw_parser_output=json.loads(parse_result.raw_json),
        uploaded_at=datetime.now(timezone.utc), confirmed_at=datetime.now(timezone.utc),
    )
    db.add(import_rec)
    db.flush()

    scheme_cache: dict[str, Scheme] = {}
    folio_cache: dict[tuple[uuid.UUID, uuid.UUID, str], Folio] = {}
    added_keys: set[tuple] = set()
    added = 0
    skipped = 0

    for norm in parse_result.transactions:
        temp_id = key_to_temp[(norm.folio, norm.amc, norm.scheme_name)]
        preview = previews[temp_id]
        override = overrides.get(temp_id)

        amfi_code = (override.amfi_code if override and override.amfi_code else None) or preview.suggested_amfi_code

        if amfi_code not in scheme_cache:
            existing = db.query(Scheme).filter_by(amfi_code=amfi_code).first()
            if existing:
                scheme_cache[amfi_code] = existing
            else:
                parsed_scheme = parsed_scheme_by_key.get((norm.folio, norm.amc, norm.scheme_name))
                plan_name_variant = parsed_scheme.plan_name_variant if parsed_scheme else None

                # DATA-001: when an override's amfi_code is genuinely
                # different from what CAS parsing implies, the persisted
                # Scheme.name must describe THAT code, not blindly carry over
                # the original CAS-parsed name — otherwise a legitimate
                # manual correction still produces a Scheme row whose name
                # doesn't match its own amfi_code.
                scheme_name = norm.scheme_name
                if override and override.amfi_code:
                    scheme_list = mfapi_client.cached_scheme_list()
                    canonical_name = (
                        mfapi_client._canonical_name_for_code(override.amfi_code, scheme_list)
                        if scheme_list is not None
                        else None
                    )
                    if canonical_name is not None:
                        similarity = SequenceMatcher(
                            None, _normalize_name(norm.scheme_name), _normalize_name(canonical_name)
                        ).ratio()
                        if similarity < CONFIDENCE_THRESHOLD:
                            scheme_name = canonical_name

                new_scheme = Scheme(
                    id=uuid.uuid4(), amfi_code=amfi_code, isin=norm.isin, name=scheme_name,
                    amc_name=norm.amc, sebi_category=_resolve_category(preview.category, norm.scheme_type),
                    plan_name_variant=PlanNameVariant(plan_name_variant) if plan_name_variant else None,
                )
                db.add(new_scheme)
                db.flush()
                scheme_cache[amfi_code] = new_scheme

        scheme = scheme_cache[amfi_code]
        folio_key = (household_member_id, scheme.id, norm.folio)
        if folio_key not in folio_cache:
            existing_folio = (
                db.query(Folio)
                .filter_by(household_member_id=household_member_id, scheme_id=scheme.id, folio_number=norm.folio)
                .first()
            )
            if existing_folio:
                folio_cache[folio_key] = existing_folio
            else:
                plan_type = (override.plan_type_override if override and override.plan_type_override else preview.plan_type)
                arn_code = next(
                    (s.arn_code for s in parse_result.schemes if s.folio == norm.folio and s.amc == norm.amc and s.name == norm.scheme_name),
                    None,
                )
                new_folio = Folio(
                    id=uuid.uuid4(), household_member_id=household_member_id, scheme_id=scheme.id,
                    folio_number=norm.folio, arn_code=arn_code, plan_type=PlanType(plan_type),
                )
                db.add(new_folio)
                db.flush()
                folio_cache[folio_key] = new_folio

        folio = folio_cache[folio_key]
        dedupe_key = (folio.id, norm.txn_date, norm.amount, norm.units, norm.txn_type)
        # Session with autoflush=False (matches production, see db/session.py)
        # doesn't flush pending db.add()s before this query runs, so a DB
        # lookup alone can't see rows added earlier in THIS same loop — two
        # same-day, same-amount/units rows (e.g. SIP installments, stamp
        # duty/STT sharing a date) would both pass the check and then blow up
        # the UniqueConstraint at commit. Track this call's own adds in memory
        # too.
        if dedupe_key in added_keys:
            skipped += 1
            continue
        dup = (
            db.query(Transaction)
            .filter_by(folio_id=folio.id, date=norm.txn_date, amount=norm.amount, units=norm.units, type=norm.txn_type)
            .first()
        )
        if dup:
            skipped += 1
            continue

        db.add(
            Transaction(
                id=uuid.uuid4(), folio_id=folio.id, import_id=import_rec.id, type=norm.txn_type,
                date=norm.txn_date, amount=norm.amount, units=norm.units, nav=norm.nav,
                raw_description=norm.description,
            )
        )
        added_keys.add(dedupe_key)
        added += 1

    import_rec.new_transactions_count = added
    import_rec.duplicate_transactions_count = skipped
    db.commit()
    invalidate_holdings_cache(household_member_id)

    del _preview_sessions[session_id]
    return ImportConfirmResponse(added=added, skipped=skipped, import_id=str(import_rec.id))


def _map_source_cas_type(file_type: str) -> SourceCasType | None:
    mapped = source_cas_type_from_file_type(file_type)
    return SourceCasType(mapped) if mapped else None
