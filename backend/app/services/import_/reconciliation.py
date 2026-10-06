"""Import health (#6): our units vs the CAS's own closing units, per folio.

Computed on read from imports.raw_parser_output (casparser's JSON, PAN-redacted),
never stored: coverage_gap_details is rewritten by every gap evaluation, and a
stored copy could go stale. Strictly read-only -- the staging page must not
change anything users see."""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.core.decimal_utils import quantize_units, to_decimal
from app.models.enums import ImportStatus
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.services.dashboard.holdings import _LOT_CONSUMING_TYPES, _process_folio_lots, peek_cached_holdings
from app.services.dashboard.nav import _latest_cached_on_or_before
from app.services.import_.enrich import normalize_name
from app.services.import_.people import folio_key

Status = Literal["match", "units_differ", "cache_stale", "no_cas_data"]


@dataclass
class FolioReconciliation:
    folio_id: str
    household_member_id: str
    scheme_name: str
    folio_number: str
    plan_type: str
    cas_close_units: Decimal | None
    cas_statement_to: date | None
    fresh_units: Decimal
    cached_units: Decimal | None
    cas_nav: Decimal | None
    cas_nav_date: date | None
    our_nav: Decimal | None
    status: Status
    diff_units: Decimal | None


def _date(value: Any) -> date | None:
    if not value:
        return None
    return date.fromisoformat(str(value)[:10])


def cas_closings(raw: dict | None) -> list[dict]:
    out: list[dict] = []
    for f in (raw or {}).get("folios") or []:
        for s in f.get("schemes") or []:
            valuation = s.get("valuation") or {}
            out.append({
                "folio": f.get("folio"), "scheme": s.get("scheme"), "isin": s.get("isin"), "amfi": s.get("amfi"),
                "close": quantize_units(to_decimal(s["close"])) if s.get("close") is not None else None,
                "nav": to_decimal(valuation["nav"]) if valuation.get("nav") is not None else None,
                "nav_date": _date(valuation.get("date")),
            })
    return out


def _same_scheme(entry: dict, scheme: Scheme) -> bool:
    if entry.get("isin") and (scheme.isin or scheme.isin_reinvest):
        return entry["isin"] in {scheme.isin, scheme.isin_reinvest}
    if entry.get("amfi") and scheme.amfi_code:
        return str(entry["amfi"]) == scheme.amfi_code
    return normalize_name(entry.get("scheme") or "") == normalize_name(scheme.name)


def reconcile_members(db: Session, member_ids: list[uuid.UUID]) -> list[FolioReconciliation]:
    if not member_ids:
        return []
    folios = db.query(Folio).filter(Folio.household_member_id.in_(member_ids)).all()
    if not folios:
        return []
    schemes = {s.id: s for s in db.query(Scheme).filter(Scheme.id.in_({f.scheme_id for f in folios})).all()}
    imports = (
        db.query(Import)
        .filter(Import.household_member_id.in_(member_ids), Import.status == ImportStatus.CONFIRMED)
        .all()
    )
    # Newest first: statement end, then confirm time (manual opening-balance
    # imports have no raw output and are skipped naturally).
    imports.sort(key=lambda i: (i.statement_to_date or date.min, i.confirmed_at or i.uploaded_at), reverse=True)
    closings = {i.id: cas_closings(i.raw_parser_output) for i in imports}

    txns = (
        db.query(Transaction)
        .filter(Transaction.folio_id.in_([f.id for f in folios]))
        .order_by(Transaction.date, case((Transaction.type.in_(_LOT_CONSUMING_TYPES), 1), else_=0), Transaction.id)
        .all()
    )
    by_folio: dict[uuid.UUID, list[Transaction]] = defaultdict(list)
    for t in txns:
        by_folio[t.folio_id].append(t)

    fresh = {f.id: _process_folio_lots(by_folio.get(f.id, []))[0] for f in folios}
    key_sum: dict[tuple, Decimal] = defaultdict(Decimal)
    for f in folios:
        key_sum[(f.household_member_id, f.scheme_id, f.plan_type)] += fresh[f.id]
    cached_rows = peek_cached_holdings(member_ids) or []
    cached = {
        (uuid.UUID(r.household_member_id), uuid.UUID(r.scheme_id), r.plan_type): Decimal(r.units_held)
        for r in cached_rows
    }

    out: list[FolioReconciliation] = []
    for f in folios:
        scheme = schemes[f.scheme_id]
        entry, statement_to = None, None
        for imp in imports:
            if imp.household_member_id != f.household_member_id:
                continue
            entry = next(
                (e for e in closings[imp.id]
                 if e["folio"] and folio_key(e["folio"]) == folio_key(f.folio_number) and _same_scheme(e, scheme)),
                None,
            )
            if entry is not None:
                statement_to = imp.statement_to_date
                break
        key = (f.household_member_id, f.scheme_id, f.plan_type)
        cached_units = cached.get(key)
        cas_close = entry["close"] if entry else None
        our_nav = None
        if entry and entry["nav_date"]:
            cached_nav = _latest_cached_on_or_before(db, scheme.id, entry["nav_date"])
            our_nav = cached_nav.nav if cached_nav and cached_nav.date == entry["nav_date"] else None
        if cas_close is None:
            status: Status = "no_cas_data"
        elif quantize_units(fresh[f.id]) != cas_close:
            status = "units_differ"
        elif cached_units is not None and quantize_units(cached_units) != quantize_units(key_sum[key]):
            status = "cache_stale"
        else:
            status = "match"
        out.append(FolioReconciliation(
            folio_id=str(f.id), household_member_id=str(f.household_member_id), scheme_name=scheme.name,
            folio_number=f.folio_number, plan_type=f.plan_type.value,
            cas_close_units=cas_close, cas_statement_to=statement_to,
            fresh_units=quantize_units(fresh[f.id]), cached_units=cached_units,
            cas_nav=entry["nav"] if entry else None, cas_nav_date=entry["nav_date"] if entry else None,
            our_nav=our_nav, status=status,
            diff_units=(quantize_units(fresh[f.id]) - cas_close) if cas_close is not None else None,
        ))
    return out
