"""casparser wrapper, normalization, plan classification, error classification.

Ported from CAS Parsers/mf-import/backend/app/parser.py (tightened per
PRD-01 FR-5-8) and re-targeted at the monolith's TransactionType enum. Never
persists PAN — pan_masked exists only for the transient parse-preview
response (CLAUDE.md non-negotiable, ADR-004).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date

from decimal import Decimal

import casparser
from casparser.enums import CASFileType, FileType, TransactionType as CasTxnType
from casparser.types import CASData, NSDLCASData

from app.core.decimal_utils import quantize_amount, quantize_nav, quantize_units, to_decimal
from app.models.enums import TransactionType

CAS_TO_CANONICAL: dict[str, TransactionType] = {
    "PURCHASE": TransactionType.PURCHASE,
    "PURCHASE_SIP": TransactionType.PURCHASE_SIP,
    "REDEMPTION": TransactionType.REDEMPTION,
    "SWITCH_IN": TransactionType.SWITCH_IN,
    "SWITCH_IN_MERGER": TransactionType.SWITCH_IN,
    "SWITCH_OUT": TransactionType.SWITCH_OUT,
    "SWITCH_OUT_MERGER": TransactionType.SWITCH_OUT,
    "DIVIDEND_PAYOUT": TransactionType.DIVIDEND_PAYOUT,
    "DIVIDEND_REINVEST": TransactionType.DIVIDEND_REINVEST,
    "SEGREGATION": TransactionType.SEGREGATION,
    "STT_TAX": TransactionType.STT,
    "STAMP_DUTY_TAX": TransactionType.STAMP_DUTY,
}

SOURCE_CAS_TYPE_MAP = {"CAMS": "cams", "KFINTECH": "kfintech"}


def mask_pan(pan: str | None) -> str | None:
    if not pan or len(pan) < 10:
        return pan
    return f"{pan[:5]}****{pan[-1]}"


def normalize_txn_type(raw: str | CasTxnType) -> TransactionType:
    key = str(raw).split(".")[-1].upper()
    return CAS_TO_CANONICAL.get(key, TransactionType.MISC)


def classify_plan_from_name(scheme_name: str) -> str:
    """FR-5 primary signal: scheme-name pattern match. Case-insensitive
    substring match is more robust across AMCs than a fixed suffix pattern —
    no maintained per-AMC lookup table needed for this signal."""
    name = scheme_name.upper()
    has_direct = "DIRECT" in name
    has_regular = "REGULAR" in name
    if has_direct and not has_regular:
        return "direct"
    if has_regular and not has_direct:
        return "regular"
    return "unresolved"


def classify_folio_plan_type(name_variant: str, arn_code: str | None) -> str:
    """FR-5: primary (name) + corroborating (ARN, Regular-only) signal.
    Disagreement -> unclassified. Never silently guess."""
    has_arn = bool(arn_code and arn_code.strip())
    if name_variant == "regular":
        return "regular"
    if name_variant == "direct":
        return "unclassified" if has_arn else "direct"
    return "unclassified"


def source_cas_type_from_file_type(file_type: FileType | str) -> str | None:
    key = str(file_type).split(".")[-1].upper()
    return SOURCE_CAS_TYPE_MAP.get(key)


def _parse_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


@dataclass
class NormalizedTransaction:
    folio: str
    amc: str
    scheme_name: str
    isin: str | None
    amfi: str | None
    scheme_type: str | None
    txn_date: date
    txn_type: TransactionType
    description: str
    amount: Decimal | None
    units: Decimal | None
    nav: Decimal | None

    def dedupe_hash(self) -> str:
        key = "|".join(
            [self.folio, self.scheme_name, self.txn_date.isoformat(), str(self.amount or ""), str(self.units or "")]
        )
        return hashlib.sha256(key.encode()).hexdigest()


@dataclass
class ParsedInvestor:
    name: str | None
    email: str | None
    pan_masked: str | None


@dataclass
class ParsedScheme:
    name: str
    isin: str | None
    amfi: str | None
    scheme_type: str | None
    folio: str
    amc: str
    transaction_count: int
    arn_code: str | None = None
    plan_name_variant: str = "unresolved"
    plan_type: str = "unclassified"


@dataclass
class ParseResult:
    investor: ParsedInvestor
    schemes: list[ParsedScheme]
    transactions: list[NormalizedTransaction]
    raw_json: str
    parse_warnings: list[str] = field(default_factory=list)
    cas_type: str = "DETAILED"
    file_type: str = "UNKNOWN"


class ParseError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def classify_parse_error(exc: Exception) -> ParseError:
    msg = str(exc).lower()
    if "password" in msg or "decrypt" in msg or "incorrect" in msg:
        return ParseError(
            "wrong_password",
            "Incorrect PDF password. CAMS/KFintech CAS passwords are usually your PAN in uppercase.",
        )
    if "image" in msg or "scan" in msg or "extract" in msg or "text" in msg:
        return ParseError(
            "unreadable_pdf",
            "PDF appears scanned or unreadable. Download the original email PDF, not a photo/scan.",
        )
    return ParseError("parse_failed", str(exc)[:500])


def _normalize_cas_data(data: CASData) -> ParseResult:
    if data.cas_type == CASFileType.SUMMARY or str(data.cas_type).upper() == "SUMMARY":
        raise ParseError(
            "summary_cas",
            "This is a Summary CAS. Request a Detailed CAS from camsonline.com → Statements → CAS.",
        )

    investor_info = data.investor_info
    pan = data.folios[0].PAN if data.folios and data.folios[0].PAN else None
    investor = ParsedInvestor(
        name=investor_info.name if investor_info else None,
        email=investor_info.email if investor_info else None,
        pan_masked=mask_pan(pan),
    )

    transactions: list[NormalizedTransaction] = []
    scheme_map: dict[tuple[str, str, str], ParsedScheme] = {}

    for folio in data.folios:
        for scheme in folio.schemes:
            key = (folio.folio, folio.amc, scheme.scheme)
            if key not in scheme_map:
                name_variant = classify_plan_from_name(scheme.scheme)
                arn_code = scheme.advisor if getattr(scheme, "advisor", None) else None
                scheme_map[key] = ParsedScheme(
                    name=scheme.scheme,
                    isin=scheme.isin,
                    amfi=scheme.amfi,
                    scheme_type=scheme.type,
                    folio=folio.folio,
                    amc=folio.amc,
                    transaction_count=0,
                    arn_code=arn_code,
                    plan_name_variant=name_variant,
                    plan_type=classify_folio_plan_type(name_variant, arn_code),
                )
            for txn in scheme.transactions:
                norm = NormalizedTransaction(
                    folio=folio.folio, amc=folio.amc, scheme_name=scheme.scheme,
                    isin=scheme.isin, amfi=scheme.amfi, scheme_type=scheme.type,
                    txn_date=_parse_date(txn.date), txn_type=normalize_txn_type(txn.type),
                    description=txn.description,
                    amount=quantize_amount(to_decimal(txn.amount)) if txn.amount is not None else None,
                    units=quantize_units(to_decimal(txn.units)) if txn.units is not None else None,
                    nav=quantize_nav(to_decimal(txn.nav)) if txn.nav is not None else None,
                )
                transactions.append(norm)
                scheme_map[key].transaction_count += 1

    return ParseResult(
        investor=investor,
        schemes=list(scheme_map.values()),
        transactions=transactions,
        raw_json=data.model_dump_json(),
        parse_warnings=list(data.parse_warnings or []),
        cas_type=str(data.cas_type),
        file_type=str(data.file_type),
    )


def parse_cas_pdf_bytes(pdf_bytes: bytes, password: str) -> ParseResult:
    """Parse CAS PDF from bytes; temp file deleted after parsing — no raw
    CAS PDF storage, ever (CLAUDE.md non-negotiable)."""
    import tempfile
    from pathlib import Path

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        result = casparser.read_cas_pdf(tmp_path, password)
    except Exception as exc:
        raise classify_parse_error(exc) from exc
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if isinstance(result, NSDLCASData):
        raise ParseError(
            "demat_cas",
            "This appears to be an NSDL/CDSL demat CAS. Equity/demat statements aren't supported in this version.",
        )
    if not isinstance(result, CASData):
        raise ParseError("parse_failed", "Unexpected parser output type.")

    return _normalize_cas_data(result)
