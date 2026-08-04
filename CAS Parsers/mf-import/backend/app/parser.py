"""casparser wrapper, normalization, and error classification."""

from __future__ import annotations

import hashlib
import json
import re
import tempfile
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

import casparser
from casparser.enums import CASFileType, TransactionType as CasTxnType
from casparser.types import CASData, NSDLCASData

from app.calc import TransactionType
from app.decimal_utils import quantize_amount, quantize_nav, quantize_units, to_decimal
from app.models import TxnType

CAS_TO_CANONICAL: dict[str, TxnType] = {
    "PURCHASE": TxnType.PURCHASE,
    "PURCHASE_SIP": TxnType.PURCHASE_SIP,
    "REDEMPTION": TxnType.REDEMPTION,
    "SWITCH_IN": TxnType.SWITCH_IN,
    "SWITCH_IN_MERGER": TxnType.SWITCH_IN,
    "SWITCH_OUT": TxnType.SWITCH_OUT,
    "SWITCH_OUT_MERGER": TxnType.SWITCH_OUT,
    "DIVIDEND_PAYOUT": TxnType.DIVIDEND_PAYOUT,
    "DIVIDEND_REINVEST": TxnType.DIVIDEND_REINVEST,
    "SEGREGATION": TxnType.SEGREGATION,
    "STT_TAX": TxnType.STT,
    "STAMP_DUTY_TAX": TxnType.STAMP_DUTY,
}


def mask_pan(pan: str | None) -> str | None:
    if not pan or len(pan) < 10:
        return pan
    return f"{pan[:5]}****{pan[-1]}"


def classify_plan_from_name(scheme_name: str) -> str:
    """FR-5 primary signal: scheme-name pattern match.

    AMC naming conventions for plan type vary in punctuation/position
    ("- Direct Plan", "-Direct-Growth", "Direct Plan -") but the word itself
    is consistent — case-insensitive substring match is more robust across
    AMCs than a fixed suffix pattern (verified against casparser's own
    Scheme.type/scheme fields; no maintained per-AMC lookup table needed for
    this signal, per PRD-01's open question on this).
    """
    name = scheme_name.upper()
    has_direct = "DIRECT" in name
    has_regular = "REGULAR" in name
    if has_direct and not has_regular:
        return "direct"
    if has_regular and not has_direct:
        return "regular"
    return "unresolved"


def classify_folio_plan_type(name_variant: str, arn_code: str | None) -> str:
    """FR-5: combine name-pattern (primary) with ARN presence (corroborating
    signal for Regular only). Where the two disagree, flag unclassified —
    never silently guess, consistent with the AMFI-match confidence pattern.
    """
    has_arn = bool(arn_code and arn_code.strip())
    if name_variant == "regular":
        return "regular"
    if name_variant == "direct":
        return "unclassified" if has_arn else "direct"
    return "unclassified"


def normalize_txn_type(raw: str | CasTxnType) -> TxnType:
    key = str(raw).split('.')[-1].upper()
    return CAS_TO_CANONICAL.get(key, TxnType.MISC)


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
    txn_type: TxnType
    description: str
    amount: Decimal | None
    units: Decimal | None
    nav: Decimal | None
    pan: str | None = None

    def dedupe_hash(self) -> str:
        key = "|".join(
            [
                self.folio,
                self.scheme_name,
                self.txn_date.isoformat(),
                str(self.amount or ""),
                str(self.units or ""),
            ]
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
    pan = None
    if data.folios and data.folios[0].PAN:
        pan = data.folios[0].PAN

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
                scheme_map[key] = ParsedScheme(
                    name=scheme.scheme,
                    isin=scheme.isin,
                    amfi=scheme.amfi,
                    scheme_type=scheme.type,
                    folio=folio.folio,
                    amc=folio.amc,
                    transaction_count=0,
                )
            for txn in scheme.transactions:
                norm = NormalizedTransaction(
                    folio=folio.folio,
                    amc=folio.amc,
                    scheme_name=scheme.scheme,
                    isin=scheme.isin,
                    amfi=scheme.amfi,
                    scheme_type=scheme.type,
                    txn_date=_parse_date(txn.date),
                    txn_type=normalize_txn_type(txn.type),
                    description=txn.description,
                    amount=quantize_amount(to_decimal(txn.amount)) if txn.amount is not None else None,
                    units=quantize_units(to_decimal(txn.units)) if txn.units is not None else None,
                    nav=quantize_nav(to_decimal(txn.nav)) if txn.nav is not None else None,
                    pan=pan,
                )
                transactions.append(norm)
                scheme_map[key].transaction_count += 1

    raw_json = data.model_dump_json()
    return ParseResult(
        investor=investor,
        schemes=list(scheme_map.values()),
        transactions=transactions,
        raw_json=raw_json,
        parse_warnings=list(data.parse_warnings or []),
        cas_type=str(data.cas_type),
        file_type=str(data.file_type),
    )


def parse_cas_pdf_bytes(pdf_bytes: bytes, password: str) -> ParseResult:
    """Parse CAS PDF from bytes; temp file deleted after parsing."""
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
            "This appears to be an NSDL/CDSL demat CAS. This prototype supports CAMS/KFintech mutual fund CAS only.",
        )
    if not isinstance(result, CASData):
        raise ParseError("parse_failed", "Unexpected parser output type.")

    return _normalize_cas_data(result)


def parse_cas_pdf_path(path: str | Path, password: str) -> ParseResult:
    try:
        result = casparser.read_cas_pdf(str(path), password)
    except Exception as exc:
        raise classify_parse_error(exc) from exc

    if isinstance(result, NSDLCASData):
        raise ParseError(
            "demat_cas",
            "This appears to be an NSDL/CDSL demat CAS. This prototype supports CAMS/KFintech mutual fund CAS only.",
        )
    if not isinstance(result, CASData):
        raise ParseError("parse_failed", "Unexpected parser output type.")

    return _normalize_cas_data(result)


def to_calc_transaction(norm: NormalizedTransaction):
    from app.calc import Transaction

    calc_type = TransactionType(norm.txn_type.value)
    return Transaction(
        txn_date=norm.txn_date,
        txn_type=calc_type,
        amount=norm.amount,
        units=norm.units,
        nav=norm.nav,
        description=norm.description,
    )
