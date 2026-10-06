"""casparser wrapper, normalization, plan classification, error classification.

Ported from CAS Parsers/mf-import/backend/app/parser.py (tightened per
PRD-01 FR-5-8) and re-targeted at the monolith's TransactionType enum.

ADR-004 reopened 2026-09-18: PAN is now persisted, encrypted, per household
member (see Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md).
`pan_masked` still exists on ParsedInvestor purely for the transient,
display-only parse-preview response -- but the raw `pan` field is now also
present on ParsedInvestor, and is precisely how the raw PAN reaches
persistence via pan_claims.claim_pan_for_member at upload time. Do not
read this docstring as "PAN is never persisted" -- that invariant no longer
holds; see crypto.py for how it's encrypted at rest.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime

from decimal import Decimal

import casparser
from casparser.enums import CASFileType, FileType, TransactionType as CasTxnType
from casparser.types import CASData, NSDLCASData

from app.core.decimal_utils import quantize_amount, quantize_nav, quantize_units, to_decimal
from app.models.enums import TransactionType
from app.services.lot_rules import apply_lot_rules
from app.services.import_.people import (
    ParsedPerson,
    extract_folio_holders,
    folio_key,
    group_people,
    name_warnings,
    read_pdf_lines,
)

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
    # #3: these used to fall through to MISC and be ignored.
    "REVERSAL": TransactionType.REVERSAL,
    "GIFT_IN": TransactionType.GIFT_IN,
    "GIFT_OUT": TransactionType.GIFT_OUT,
    "TDS_TAX": TransactionType.MISC,
    "UNKNOWN": TransactionType.MISC,
}

# Informational tax rows: skipped silently when they carry no units.
_SILENT_TAX_TYPES = {"STAMP_DUTY_TAX", "STT_TAX", "TDS_TAX"}

SOURCE_CAS_TYPE_MAP = {"CAMS": "cams", "KFINTECH": "kfintech"}

SchemeKey = tuple[str, str, str]


def scheme_key(folio: str, amc: str, isin: str | None, name: str) -> SchemeKey:
    return folio, amc, isin or name


def _optional_decimal(value: object) -> Decimal | None:
    return to_decimal(value) if isinstance(value, (str, Decimal, int)) else None

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
    # First two + last two, so a household can tell two similar PANs apart.
    # Under 5 chars there is nothing to hide between them: mask all.
    if len(pan) < 5:
        return "*" * len(pan)
    return f"{pan[:2]}{'*' * (len(pan) - 4)}{pan[-2:]}"


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


def parse_statement_date(value: object) -> date | None:
    """casparser's statement_period dates ("01-Apr-2025"), ISO strings, or
    dates. Anything else is None: a missing or unreadable period must never
    fail an import (staging-QA fix 6)."""
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
    # Slice to each format's own length so a trailing time ("…T00:00") is ignored.
    for fmt, width in (("%d-%b-%Y", 11), ("%Y-%m-%d", 10)):
        try:
            return datetime.strptime(value.strip()[:width], fmt).date()
        except ValueError:
            continue
    return None


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
    person_key: str | None = None
    balance: Decimal | None = None
    conversion_from_opening: bool = False
    # #3: a gift row the CAS printed without a NAV; priced at preview time
    # from the fund's NAV history (service.build_import_preview).
    needs_price: bool = False
    # False when the NAV was computed here (a conversion leg's cost basis, a
    # gift priced from history), not printed by the CAS: only printed NAVs
    # become a CAS-only fund's price history (6 Oct review M3).
    nav_printed: bool = True

    @property
    def key(self) -> SchemeKey:
        return scheme_key(self.folio, self.amc, self.isin, self.scheme_name)


@dataclass
class ParsedInvestor:
    name: str | None
    email: str | None
    pan_masked: str | None
    pan: str | None = None


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
    person_key: str | None = None
    open_units: Decimal = Decimal("0")
    close_units: Decimal | None = None
    valuation_cost: Decimal | None = None
    valuation_nav: Decimal | None = None
    valuation_date: date | None = None

    @property
    def key(self) -> SchemeKey:
        return scheme_key(self.folio, self.amc, self.isin, self.name)


@dataclass
class ParseResult:
    investor: ParsedInvestor
    schemes: list[ParsedScheme]
    transactions: list[NormalizedTransaction]
    raw_json: str
    parse_warnings: list[str] = field(default_factory=list)
    cas_type: str = "DETAILED"
    file_type: str = "UNKNOWN"
    people: list[ParsedPerson] = field(default_factory=list)
    unassigned_folio_keys: list[tuple[str, str]] = field(default_factory=list)
    statement_from: date | None = None
    statement_to: date | None = None


class ParseError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


from casparser.exceptions import CASParseError, IncorrectPasswordError
import pypdfium2

_UNKNOWN_ISSUER = "could not identify the cas issuer"
MESSAGES = {
    "wrong_password": "That password didn’t open the file. It’s usually your PAN in capitals, or the password you set when requesting the CAS.",
    "scanned_pdf": "We can’t read this PDF. It looks like a scan or a photo, so there’s no text in it to read. Download the statement again from CAMS or KFintech as a PDF; don’t print or scan it.",
    "damaged_pdf": "This file looks incomplete. Download it again.",
    "unknown_issuer": "This isn’t a CAMS or KFintech statement. Download your Consolidated Account Statement from CAMS or KFintech.",
    "demat_cas": "Demat statements aren’t supported yet; use the CAMS/KFintech CAS.",
}


def classify_parse_error(exc: Exception, *, has_text: bool = True) -> ParseError:
    """#22: by exception type, never by keywords in the message (the old rule
    sent any message containing "text" to "scanned")."""
    if isinstance(exc, IncorrectPasswordError):
        return ParseError("wrong_password", MESSAGES["wrong_password"])
    if isinstance(exc, CASParseError) and _UNKNOWN_ISSUER in str(exc).lower():
        code = "unknown_issuer" if has_text else "scanned_pdf"
        return ParseError(code, MESSAGES[code])
    if isinstance(exc, CASParseError) and "nsdl/cdsl" in str(exc).lower():
        # casparser knew it was a demat statement but couldn't read it.
        return ParseError("demat_cas", MESSAGES["demat_cas"])
    pending = [(exc, 0)]
    seen: set[int] = set()
    while pending:
        link, depth = pending.pop()
        if id(link) in seen or depth >= 5:
            continue
        seen.add(id(link))
        if isinstance(link, pypdfium2.PdfiumError):
            code = "wrong_password" if "password" in str(link).lower() else "damaged_pdf"
            return ParseError(code, MESSAGES[code])
        if link.__context__ is not None:
            pending.append((link.__context__, depth + 1))
        if link.__cause__ is not None:
            pending.append((link.__cause__, depth + 1))
    if isinstance(exc, CASParseError) and "pdfium" in str(exc).lower():
        code = "wrong_password" if "password" in str(exc).lower() else "damaged_pdf"
        return ParseError(code, MESSAGES[code])
    return ParseError("parse_failed", str(exc)[:500])


def _has_text_layer(path: str, password: str) -> bool:
    try:
        doc = pypdfium2.PdfDocument(path, password=password)
    except Exception:
        return True  # can't tell; don't claim "scanned"
    try:
        for i in range(min(len(doc), 3)):
            if doc[i].get_textpage().get_text_range().strip():
                return True
        return False
    finally:
        doc.close()


_CONVERSION_TYPES = {"SWITCH_OUT", "SWITCH_OUT_MERGER", "SWITCH_IN", "SWITCH_IN_MERGER"}


def _is_conversion(raw_type: str, description: str) -> bool:
    key = str(raw_type).split(".")[-1].upper()
    return key in _CONVERSION_TYPES or any(label in (description or "").lower() for label in ("face value", "merger"))


def _fifo_cost(rows: list[NormalizedTransaction], opening_units: Decimal, consume: Decimal) -> tuple[Decimal, bool]:
    """Cost of `consume` units taken FIFO from this scheme's lots before the
    conversion, replaying rows with the shared lot rules (lot_rules.py).
    Returns (cost, from_opening): from_opening is True when any consumed unit
    is from the opening lot, whose cost is only known after opening_balance
    prices it (preview time)."""
    lots: list[list] = [[opening_units, Decimal("0"), True]] if opening_units > 0 else []
    for r in rows:
        apply_lot_rules(lots, r.txn_type, r.units, r.nav, lambda u, n: [u, n, False])
    pieces = apply_lot_rules(lots, TransactionType.SWITCH_OUT, consume, Decimal("0"), lambda u, n: [u, n, False])
    cost = sum((take * lot[1] for lot, take in pieces if not lot[2]), Decimal("0"))
    return cost, any(lot[2] for lot, _ in pieces)


def _pair_conversions(amountless, transactions, scheme_map, parse_warnings):
    for group_key in sorted(amountless, key=lambda k: k[1]):
        group = amountless[group_key]
        outs = [t for t, units, raw_type in group if units < 0]
        ins = [t for t, units, raw_type in group if units > 0]
        if len(group) == 2 and len(outs) == len(ins) == 1:
            out, incoming = outs[0], ins[0]
            before = sorted(
                [t for t in transactions if t.key == out.key and t.txn_date < out.txn_date],
                key=lambda t: t.txn_date,
            )
            cost, from_opening = _fifo_cost(before, scheme_map[out.key].open_units, out.units)
            for row, kind in ((out, TransactionType.SWITCH_OUT), (incoming, TransactionType.SWITCH_IN)):
                row.txn_type = kind
                row.amount = Decimal("0.00") if from_opening else quantize_amount(cost)
                row.nav = Decimal("0.0000") if from_opening or not row.units else quantize_nav(cost / row.units)
                row.conversion_from_opening = from_opening
                row.nav_printed = False
                transactions.append(row)
                scheme_map[row.key].transaction_count += 1
        else:
            for row, units, raw_type in group:
                parse_warnings.append(
                    f"Skipped transaction on {row.txn_date} for {row.scheme_name} (folio {row.folio}): "
                    f"missing amount, units, or NAV — {row.description}"
                )
    transactions.sort(key=lambda t: t.txn_date)


def _raw_key(raw_type) -> str:
    return str(raw_type).split(".")[-1].upper()


def _retain(
    raw_type, description: str, amount: Decimal | None, units: Decimal | None, nav: Decimal | None,
) -> tuple[TransactionType, Decimal, Decimal, Decimal, bool] | None:
    """#3: rows casparser gives without amount, units or NAV that still mean
    something. Returns (type, amount, units, nav, needs_price), or None to
    skip. Conversion legs are handled before this (phase 2 pairing)."""
    key = _raw_key(raw_type)
    desc = (description or "").lower()
    zero_amt, zero_nav = Decimal("0.00"), Decimal("0.0000")
    if key == "DIVIDEND_PAYOUT" and amount is not None and units is None:
        return TransactionType.DIVIDEND_PAYOUT, amount, Decimal("0.000"), zero_nav, False
    if units is None:
        return None
    # Only a unit-adding row can be a bonus (review finding 4): a gift-out or
    # reversal whose description mentions "bonus" keeps its own meaning.
    if "bonus" in desc and key in ("PURCHASE", "MISC", "UNKNOWN") and (amount is None or amount == 0):
        return TransactionType.BONUS, zero_amt, units, zero_nav, False
    if key == "SEGREGATION":
        return TransactionType.SEGREGATION, amount or zero_amt, units, nav or zero_nav, False
    if key in ("GIFT_IN", "GIFT_OUT"):
        ttype = CAS_TO_CANONICAL[key]
        if nav is not None:
            return ttype, quantize_amount(units * nav), units, nav, False
        return ttype, zero_amt, units, zero_nav, True
    if key == "REVERSAL" and amount is not None and units:
        return TransactionType.REVERSAL, amount, units, quantize_nav(amount / units), False
    return None


def _normalize_cas_data(data: CASData, lines: list[str] | None = None) -> ParseResult:
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
        pan=pan,
    )

    # People: folios keyed by (amc, folio_key) like casparser itself. casparser
    # gives PAN="" for a header without a PAN; that means "no PAN" (None).
    # `lines` is optional: without them no holder names are read.
    holders = extract_folio_holders(lines) if lines else {}
    folio_ids: list[tuple[tuple[str, str], str | None]] = []
    seen_ids: set[tuple[str, str]] = set()
    for f in data.folios:
        fid = (f.amc, folio_key(f.folio))
        if fid not in seen_ids:
            seen_ids.add(fid)
            folio_ids.append((fid, f.PAN or None))
    addressee = investor_info.name if investor_info and isinstance(investor_info.name, str) else None
    people, unassigned = group_people(folio_ids, holders, addressee)
    person_of: dict[tuple[str, str], str] = {
        fid: p.key for p in people for fid in p.folio_keys
    }

    transactions: list[NormalizedTransaction] = []
    scheme_map: dict[SchemeKey, ParsedScheme] = {}
    amountless: dict[tuple[str, date], list[tuple[NormalizedTransaction, Decimal, str]]] = {}
    parse_warnings: list[str] = list(data.parse_warnings or [])
    parse_warnings.extend(name_warnings(people))

    for folio in data.folios:
        pkey = person_of.get((folio.amc, folio_key(folio.folio)))
        for scheme in folio.schemes:
            key = scheme_key(folio.folio, folio.amc, scheme.isin, scheme.scheme)
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
                    person_key=pkey,
                    open_units=_optional_decimal(getattr(scheme, "open", None)) or Decimal("0"),
                    close_units=_optional_decimal(getattr(scheme, "close", None)),
                    valuation_cost=_optional_decimal(getattr(scheme.valuation, "cost", None)),
                    valuation_nav=_optional_decimal(getattr(scheme.valuation, "nav", None)),
                    valuation_date=parse_statement_date(getattr(scheme.valuation, "date", None)),
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
                    if amount is None and nav is None and units is not None and _is_conversion(txn.type, txn.description):
                        candidate = NormalizedTransaction(
                            folio=folio.folio, amc=folio.amc, scheme_name=scheme.scheme,
                            isin=scheme.isin, amfi=scheme.amfi, scheme_type=scheme.type,
                            txn_date=_parse_date(txn.date), txn_type=normalize_txn_type(txn.type),
                            description=txn.description, amount=amount, units=units, nav=nav,
                            person_key=pkey,
                            balance=quantize_units(_optional_decimal(getattr(txn, "balance", None)))
                            if _optional_decimal(getattr(txn, "balance", None)) is not None else None,
                        )
                        amountless.setdefault((folio.amc, candidate.txn_date), []).append(
                            (candidate, to_decimal(txn.units), str(txn.type)))
                        continue
                    printed_nav = nav  # what casparser read, before any derivation
                    kept = _retain(txn.type, txn.description, amount, units, nav)
                    if kept is None:
                        if _raw_key(txn.type) not in _SILENT_TAX_TYPES:
                            parse_warnings.append(
                                f"Skipped transaction on {txn.date} for {scheme.scheme} (folio {folio.folio}): "
                                f"missing amount, units, or NAV — {txn.description}"
                            )
                        continue
                    ttype, amount, units, nav, needs_price = kept
                    # A derived NAV (a reversal's amount/units) isn't a printed price.
                    nav_printed = printed_nav is not None and nav == printed_nav
                else:
                    nav_printed = nav is not None
                    ttype, needs_price = normalize_txn_type(txn.type), False
                    if ttype == TransactionType.PURCHASE and amount == 0 and "bonus" in (txn.description or "").lower():
                        ttype = TransactionType.BONUS
                norm = NormalizedTransaction(
                    folio=folio.folio, amc=folio.amc, scheme_name=scheme.scheme,
                    isin=scheme.isin, amfi=scheme.amfi, scheme_type=scheme.type,
                    txn_date=_parse_date(txn.date), txn_type=ttype,
                    description=txn.description, amount=amount, units=units, nav=nav,
                    person_key=pkey, needs_price=needs_price, nav_printed=nav_printed,
                    balance=quantize_units(_optional_decimal(txn.balance))
                    if _optional_decimal(getattr(txn, "balance", None)) is not None else None,
                )
                transactions.append(norm)
                scheme_map[key].transaction_count += 1

    _pair_conversions(amountless, transactions, scheme_map, parse_warnings)

    # Raw PAN never reaches raw_json specifically: raw_json is persisted
    # verbatim into imports.raw_parser_output by confirm_import, so redact
    # before serializing rather than relying on callers to scrub it later.
    # This is narrower than "PAN never leaves this function unmasked" --
    # since ADR-004 reopened 2026-09-18, the raw PAN does leave via
    # investor.pan (ParsedInvestor above), which is intentional: it's how
    # pan_claims.claim_pan_for_member reaches persistence at upload time.
    redacted = data.model_copy(deep=True)
    for f in redacted.folios:
        f.PAN = None
    raw_json = redacted.model_dump_json()

    return ParseResult(
        investor=investor,
        schemes=[s for s in scheme_map.values()
                 if s.open_units != 0 or s.close_units not in (None, 0) or s.transaction_count != 0],
        transactions=transactions,
        raw_json=raw_json,
        parse_warnings=parse_warnings,
        cas_type=str(data.cas_type),
        file_type=str(data.file_type),
        people=people,
        unassigned_folio_keys=unassigned,
        statement_from=parse_statement_date(getattr(data.statement_period, "from_", None)),
        statement_to=parse_statement_date(getattr(data.statement_period, "to", None)),
    )


def parse_cas_pdf_bytes(pdf_bytes: bytes, password: str) -> ParseResult:
    """Parse CAS bytes and delete the temporary parsing file afterwards."""
    import tempfile
    from pathlib import Path

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    lines: list[str] | None = None
    try:
        result = casparser.read_cas_pdf(tmp_path, password)
        try:
            # Holder names come from the raw text lines; failure here must not
            # fail the import, people just fall back to placeholders/addressee.
            lines = read_pdf_lines(pdf_bytes, password)  # PDFium bytes input avoids a Windows file lock.
        except Exception:
            lines = None
    except Exception as exc:
        raise classify_parse_error(exc, has_text=_has_text_layer(tmp_path, password)) from exc
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    if isinstance(result, NSDLCASData):
        raise ParseError(
            "demat_cas",
            MESSAGES["demat_cas"],
        )
    if not isinstance(result, CASData):
        raise ParseError("parse_failed", "Unexpected parser output type.")

    return _normalize_cas_data(result, lines)
