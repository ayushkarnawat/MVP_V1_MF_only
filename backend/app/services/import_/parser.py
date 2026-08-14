"""casparser wrapper, normalization, plan classification, error classification.

Ported from CAS Parsers/mf-import/backend/app/parser.py (tightened per
PRD-01 FR-5-8) and re-targeted at the monolith's TransactionType enum. Never
persists PAN — pan_masked exists only for the transient parse-preview
response (CLAUDE.md non-negotiable, ADR-004).
"""

from __future__ import annotations

import re
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

# casparser's Scheme.advisor is captured raw from a CAS statement's
# "(Advisor: ...)" annotation and only narrowed to an actual ARN-xxxx/INAxxxx
# code when that pattern is found inside it — some AMC/RTA templates print a
# non-ARN placeholder there instead (e.g. "DIRECT", "NIL") for direct-plan
# folios with no real distributor. Treating that placeholder as a genuine ARN
# was corrupting FR-5 classification (forcing Direct-named schemes with a
# placeholder advisor into "unclassified") and would corrupt the Distributor
# Comparison AMFI lookup (arn_lookup.py) the same way.
_ARN_CODE_RE = re.compile(r"^(ARN-?\d+|INA\d+)$", re.IGNORECASE)


def _as_arn_code(raw_advisor: str | None) -> str | None:
    return raw_advisor if raw_advisor and _ARN_CODE_RE.match(raw_advisor.strip()) else None


def mask_pan(pan: str | None) -> str | None:
    if not pan:
        return pan
    if len(pan) < 3:
        return "*" * len(pan)
    return f"{pan[0]}{'*' * (len(pan) - 2)}{pan[-1]}"


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
    parse_warnings: list[str] = list(data.parse_warnings or [])

    for folio in data.folios:
        for scheme in folio.schemes:
            key = (folio.folio, folio.amc, scheme.scheme)
            if key not in scheme_map:
                name_variant = classify_plan_from_name(scheme.scheme)
                arn_code = _as_arn_code(getattr(scheme, "advisor", None))
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
                # casparser genuinely allows amount/units/nav to be None on some
                # lines; Transaction.amount/units/nav are NOT NULL downstream, so
                # skip and surface why in parse_warnings rather than crash or
                # violate the constraint later in confirm_import.
                # casparser emits negative units/amount for balance-decreasing
                # rows (redemptions/switch-outs); our convention is unsigned
                # magnitudes with TransactionType as the sole direction signal,
                # so normalize the sign away here at the parse boundary.
                amount = abs(quantize_amount(to_decimal(txn.amount))) if txn.amount is not None else None
                units = abs(quantize_units(to_decimal(txn.units))) if txn.units is not None else None
                nav = quantize_nav(to_decimal(txn.nav)) if txn.nav is not None else None
                if amount is None or units is None or nav is None:
                    parse_warnings.append(
                        f"Skipped transaction on {txn.date} for {scheme.scheme} (folio {folio.folio}): "
                        f"missing amount, units, or NAV — {txn.description}"
                    )
                    continue
                norm = NormalizedTransaction(
                    folio=folio.folio, amc=folio.amc, scheme_name=scheme.scheme,
                    isin=scheme.isin, amfi=scheme.amfi, scheme_type=scheme.type,
                    txn_date=_parse_date(txn.date), txn_type=normalize_txn_type(txn.type),
                    description=txn.description, amount=amount, units=units, nav=nav,
                )
                transactions.append(norm)
                scheme_map[key].transaction_count += 1

    # PAN never leaves this function unmasked: raw_json is persisted verbatim
    # into imports.raw_parser_output by confirm_import, so redact before
    # serializing rather than relying on callers to scrub it later.
    redacted = data.model_copy(deep=True)
    for f in redacted.folios:
        f.PAN = None
    raw_json = redacted.model_dump_json()

    return ParseResult(
        investor=investor,
        schemes=list(scheme_map.values()),
        transactions=transactions,
        raw_json=raw_json,
        parse_warnings=parse_warnings,
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
