"""Business logic: import sessions, portfolio computation."""

from __future__ import annotations

import json
import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.calc import (
    LTCG_EXEMPTION_NOTE,
    build_cashflows,
    compute_holdings,
    fifo_cost_basis,
    fifo_realized_gains,
    invested_amount,
    unit_events_from_transactions,
    value_at_dates,
    xirr,
)
from app.calc import Transaction as CalcTransaction
from app.calc import TransactionType as CalcTxnType
from app.decimal_utils import quantize_amount, quantize_nav, quantize_pct, quantize_units, to_decimal
from app.enrich import MfApiClient, mfapi_client
from app.models import Folio, ImportRecord, ImportStatus, Investor, MatchStatus, Scheme, Transaction, TxnType
from app.parser import ParseResult, to_calc_transaction
from app.schemas import (
    AllocationSlice,
    HoldingRow,
    ImportConfirmResponse,
    ImportHistoryItem,
    ImportPreviewResponse,
    NavDataPoint,
    PortfolioSummary,
    SchemeDetail,
    SchemeMatchConfirm,
    SchemeMatchPreview,
    TransactionMarker,
    TransactionPreview,
    ValuationPoint,
)

# In-memory preview sessions (prototype)
_preview_sessions: dict[str, dict[str, Any]] = {}


def _calc_txns_from_db(txns: list[Transaction]) -> list[CalcTransaction]:
    result = []
    for t in txns:
        result.append(
            CalcTransaction(
                txn_date=t.txn_date,
                txn_type=CalcTxnType(t.txn_type.value),
                amount=to_decimal(t.amount),
                units=to_decimal(t.units),
                nav=to_decimal(t.nav),
                description=t.description or "",
            )
        )
    return result


async def build_import_preview(
    parse_result: ParseResult,
    filename: str,
    client: MfApiClient | None = None,
) -> ImportPreviewResponse:
    client = client or mfapi_client
    session_id = uuid.uuid4().hex

    scheme_previews: list[SchemeMatchPreview] = []
    scheme_key_to_temp: dict[tuple[str, str, str], str] = {}

    for scheme in parse_result.schemes:
        temp_id = uuid.uuid4().hex[:12]
        scheme_key_to_temp[(scheme.folio, scheme.amc, scheme.name)] = temp_id

        match, status = await client.resolve_scheme(scheme.name, scheme.amfi)
        latest_nav = None
        category = None
        suggested_code = match.amfi_code if match else None
        suggested_name = match.scheme_name if match else None
        confidence = match.confidence if match else 0.0

        if match and match.amfi_code:
            try:
                nav_series = await client.get_nav_series(match.amfi_code)
                latest_nav = str(nav_series.latest_nav) if nav_series.latest_nav else None
                category = client.category_from_meta(nav_series.meta)
            except Exception:
                pass

        scheme_previews.append(
            SchemeMatchPreview(
                temp_id=temp_id,
                name=scheme.name,
                isin=scheme.isin,
                amfi_code=scheme.amfi,
                suggested_amfi_code=suggested_code,
                suggested_name=suggested_name,
                match_confidence=confidence,
                match_status=status,
                folio=scheme.folio,
                amc=scheme.amc,
                transaction_count=scheme.transaction_count,
                latest_nav=latest_nav,
                category=category,
            )
        )

    txn_previews = [
        TransactionPreview(
            folio=t.folio,
            scheme_name=t.scheme_name,
            txn_date=t.txn_date,
            txn_type=t.txn_type.value,
            description=t.description,
            amount=str(t.amount) if t.amount is not None else None,
            units=str(t.units) if t.units is not None else None,
            nav=str(t.nav) if t.nav is not None else None,
        )
        for t in parse_result.transactions
    ]

    _preview_sessions[session_id] = {
        "filename": filename,
        "parse_result": parse_result,
        "scheme_key_to_temp": scheme_key_to_temp,
        "scheme_previews": {s.temp_id: s for s in scheme_previews},
    }

    return ImportPreviewResponse(
        session_id=session_id,
        filename=filename,
        investor_name=parse_result.investor.name,
        investor_email=parse_result.investor.email,
        pan_masked=parse_result.investor.pan_masked,
        schemes=scheme_previews,
        transactions=txn_previews,
        transaction_count=len(txn_previews),
        parse_warnings=parse_result.parse_warnings,
        cas_type=parse_result.cas_type,
        file_type=parse_result.file_type,
    )


def confirm_import(
    db: Session,
    session_id: str,
    scheme_matches: list[SchemeMatchConfirm],
) -> ImportConfirmResponse:
    session = _preview_sessions.get(session_id)
    if not session:
        raise ValueError("Import session not found or expired.")

    parse_result: ParseResult = session["parse_result"]
    match_overrides = {m.temp_id: m.amfi_code for m in scheme_matches}

    investor = db.query(Investor).first()
    if not investor:
        investor = Investor(
            name=parse_result.investor.name,
            email=parse_result.investor.email,
            pan_masked=parse_result.investor.pan_masked,
        )
        db.add(investor)
        db.flush()
    else:
        if parse_result.investor.name:
            investor.name = parse_result.investor.name
        if parse_result.investor.email:
            investor.email = parse_result.investor.email
        if parse_result.investor.pan_masked:
            investor.pan_masked = parse_result.investor.pan_masked

    import_rec = ImportRecord(
        session_id=session_id,
        filename=session["filename"],
        schemes_found=len(parse_result.schemes),
        raw_json=parse_result.raw_json,
        status=ImportStatus.COMPLETED,
    )
    db.add(import_rec)
    db.flush()

    scheme_cache: dict[tuple[str, str], Scheme] = {}
    folio_cache: dict[tuple[str, str], Folio] = {}
    added = 0
    skipped = 0

    previews: dict[str, SchemeMatchPreview] = session["scheme_previews"]
    key_to_temp = session["scheme_key_to_temp"]

    for norm in parse_result.transactions:
        folio_key = (norm.folio, norm.amc)
        if folio_key not in folio_cache:
            folio = db.query(Folio).filter_by(folio_number=norm.folio, amc=norm.amc).first()
            if not folio:
                folio = Folio(
                    folio_number=norm.folio,
                    amc=norm.amc,
                    pan_masked=parse_result.investor.pan_masked,
                )
                db.add(folio)
                db.flush()
            folio_cache[folio_key] = folio

        scheme_key = (norm.scheme_name, norm.isin or "")
        if scheme_key not in scheme_cache:
            scheme = db.query(Scheme).filter_by(name=norm.scheme_name, isin=norm.isin).first()
            temp_id = key_to_temp.get((norm.folio, norm.amc, norm.scheme_name))
            preview = previews.get(temp_id) if temp_id else None
            amfi = norm.amfi
            confidence = 1.0 if norm.amfi else 0.0
            status = MatchStatus.CONFIRMED if norm.amfi else MatchStatus.PENDING
            if temp_id and temp_id in match_overrides:
                amfi = match_overrides[temp_id]
                status = MatchStatus.CONFIRMED
                confidence = 1.0
            elif preview:
                amfi = preview.suggested_amfi_code or amfi
                confidence = preview.match_confidence
                status = MatchStatus.CONFIRMED if preview.match_status == "confirmed" else MatchStatus.PENDING

            if not scheme:
                scheme = Scheme(
                    name=norm.scheme_name,
                    isin=norm.isin,
                    amfi_code=amfi,
                    category=preview.category if preview else norm.scheme_type,
                    match_confidence=confidence,
                    match_status=status,
                )
                db.add(scheme)
                db.flush()
            scheme_cache[scheme_key] = scheme

        dedupe = norm.dedupe_hash()
        existing = db.query(Transaction).filter_by(dedupe_hash=dedupe).first()
        if existing:
            skipped += 1
            continue

        txn = Transaction(
            scheme_id=scheme_cache[scheme_key].id,
            folio_id=folio_cache[folio_key].id,
            import_id=import_rec.id,
            txn_date=norm.txn_date,
            txn_type=TxnType(norm.txn_type.value),
            description=norm.description,
            amount=norm.amount,
            units=norm.units,
            nav=norm.nav,
            dedupe_hash=dedupe,
        )
        db.add(txn)
        added += 1

    import_rec.txns_added = added
    import_rec.txns_skipped = skipped
    from datetime import datetime

    import_rec.imported_at = datetime.utcnow()
    db.commit()

    del _preview_sessions[session_id]
    return ImportConfirmResponse(added=added, skipped=skipped, import_id=import_rec.id)


async def get_portfolio_summary(db: Session, client: MfApiClient | None = None) -> PortfolioSummary:
    client = client or mfapi_client
    holdings = await _compute_all_holdings(db, client)
    current_value = sum((h["value"] for h in holdings), Decimal("0"))
    invested = sum((h["invested"] for h in holdings), Decimal("0"))
    gain = current_value - invested

    all_txns = db.query(Transaction).all()
    calc_txns = _calc_txns_from_db(all_txns)
    flows = build_cashflows(calc_txns, current_value, date.today())
    rate = xirr(flows)
    xirr_str = str(quantize_pct(rate)) if rate is not None else None

    return PortfolioSummary(
        current_value=str(quantize_amount(current_value)),
        invested=str(quantize_amount(invested)),
        absolute_gain=str(quantize_amount(gain)),
        xirr=xirr_str,
    )


async def _compute_all_holdings(db: Session, client: MfApiClient) -> list[dict[str, Any]]:
    txns = db.query(Transaction).all()
    groups: dict[tuple[int, int], list[Transaction]] = defaultdict(list)
    for t in txns:
        groups[(t.scheme_id, t.folio_id)].append(t)

    results = []
    for (scheme_id, folio_id), group_txns in groups.items():
        scheme = db.get(Scheme, scheme_id)
        folio = db.get(Folio, folio_id)
        calc_txns = _calc_txns_from_db(group_txns)
        units = compute_holdings(calc_txns)
        if units <= 0:
            continue
        inv = invested_amount(calc_txns)
        latest_nav = Decimal("0")
        if scheme and scheme.amfi_code:
            try:
                nav = await client.get_latest_nav(scheme.amfi_code)
                if nav:
                    latest_nav = nav
            except Exception:
                pass
        if latest_nav == 0:
            _, avg = fifo_cost_basis(calc_txns)
            latest_nav = avg
        value = quantize_amount(units * latest_nav)
        results.append(
            {
                "scheme_id": scheme_id,
                "folio_id": folio_id,
                "scheme": scheme,
                "folio": folio,
                "units": units,
                "invested": inv,
                "value": value,
                "latest_nav": latest_nav,
                "calc_txns": calc_txns,
            }
        )
    return results


async def get_holdings(db: Session, client: MfApiClient | None = None) -> list[HoldingRow]:
    client = client or mfapi_client
    holdings = await _compute_all_holdings(db, client)
    rows = []
    for h in holdings:
        scheme = h["scheme"]
        folio = h["folio"]
        calc_txns = h["calc_txns"]
        _, avg_cost = fifo_cost_basis(calc_txns)
        flows = build_cashflows(calc_txns, h["value"], date.today())
        rate = xirr(flows)
        gain = h["value"] - h["invested"]
        rows.append(
            HoldingRow(
                scheme_id=h["scheme_id"],
                scheme_name=scheme.name if scheme else "",
                folio=folio.folio_number if folio else "",
                units=str(h["units"]),
                avg_cost=str(quantize_nav(avg_cost)),
                current_nav=str(h["latest_nav"]),
                current_value=str(h["value"]),
                gain=str(quantize_amount(gain)),
                xirr=str(quantize_pct(rate)) if rate else None,
                category=scheme.category if scheme else None,
            )
        )
    return rows


async def get_allocation(db: Session, client: MfApiClient | None = None) -> list[AllocationSlice]:
    client = client or mfapi_client
    holdings = await _compute_all_holdings(db, client)
    buckets: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    total = Decimal("0")
    for h in holdings:
        cat = (h["scheme"].category if h["scheme"] else "other") or "other"
        from app.calc import map_category_from_mfapi

        bucket = map_category_from_mfapi(cat)
        buckets[bucket] += h["value"]
        total += h["value"]
    if total == 0:
        return []
    return [
        AllocationSlice(category=k, weight=str(quantize_amount(v / total)))
        for k, v in sorted(buckets.items(), key=lambda x: -x[1])
    ]


async def get_scheme_detail(
    db: Session, scheme_id: int, client: MfApiClient | None = None
) -> SchemeDetail | None:
    client = client or mfapi_client
    scheme = db.get(Scheme, scheme_id)
    if not scheme:
        return None

    txns = db.query(Transaction).filter_by(scheme_id=scheme_id).order_by(Transaction.txn_date).all()
    if not txns:
        return None

    folio = db.get(Folio, txns[0].folio_id)
    calc_txns = _calc_txns_from_db(txns)
    units = compute_holdings(calc_txns)
    inv = invested_amount(calc_txns)
    nav_history = []
    latest_nav = Decimal("0")
    if scheme.amfi_code:
        try:
            series = await client.get_nav_series(scheme.amfi_code)
            nav_history = series.history
            latest_nav = series.latest_nav or Decimal("0")
        except Exception:
            pass
    if latest_nav == 0:
        _, latest_nav = fifo_cost_basis(calc_txns)

    value = quantize_amount(units * latest_nav)
    gain = value - inv
    flows = build_cashflows(calc_txns, value, date.today())
    rate = xirr(flows)

    fifo = fifo_realized_gains(calc_txns, scheme.category, nav_history)
    tax_notes = [LTCG_EXEMPTION_NOTE]
    if fifo.ltcg > 0:
        tax_notes.append("Equity LTCG above ₹1.25L exemption may be taxable at 12.5% (estimate).")
    if fifo.slab_gains > 0:
        tax_notes.append("Debt fund gains (post Apr 2023 purchases) taxed at slab rate.")

    return SchemeDetail(
        scheme_id=scheme_id,
        scheme_name=scheme.name,
        folio=folio.folio_number if folio else "",
        units=str(units),
        current_nav=str(latest_nav),
        current_value=str(value),
        invested=str(inv),
        gain=str(quantize_amount(gain)),
        xirr=str(quantize_pct(rate)) if rate else None,
        category=scheme.category,
        nav_history=[
            NavDataPoint(date=p.nav_date, nav=str(p.nav)) for p in nav_history[:365]
        ],
        transactions=[
            TransactionMarker(
                date=t.txn_date,
                txn_type=t.txn_type.value,
                amount=str(t.amount) if t.amount else None,
                units=str(t.units) if t.units else None,
            )
            for t in txns
        ],
        capital_gains={
            "stcg": str(fifo.stcg),
            "ltcg": str(fifo.ltcg),
            "slab": str(fifo.slab_gains),
            "total_realized": str(fifo.total_realized_gain),
        },
        tax_notes=tax_notes,
    )


async def get_valuation_history(db: Session, client: MfApiClient | None = None) -> list[ValuationPoint]:
    client = client or mfapi_client
    txns = db.query(Transaction).all()
    if not txns:
        return []

    events = unit_events_from_transactions(_calc_txns_from_db(txns))
    scheme_ids = {t.scheme_id for t in txns}
    combined_nav: dict[date, Decimal] = defaultdict(lambda: Decimal("0"))

    for sid in scheme_ids:
        scheme = db.get(Scheme, sid)
        if not scheme or not scheme.amfi_code:
            continue
        try:
            series = await client.get_nav_series(scheme.amfi_code)
        except Exception:
            continue
        scheme_txns = [t for t in txns if t.scheme_id == sid]
        scheme_events = unit_events_from_transactions(_calc_txns_from_db(scheme_txns))
        points = value_at_dates(scheme_events, series.history)
        for pt in points:
            combined_nav[pt.val_date] += pt.value

    return [
        ValuationPoint(date=d, value=str(quantize_amount(v)))
        for d, v in sorted(combined_nav.items())
    ]


def get_import_history(db: Session) -> list[ImportHistoryItem]:
    records = db.query(ImportRecord).order_by(ImportRecord.id.desc()).all()
    return [
        ImportHistoryItem(
            id=r.id,
            filename=r.filename,
            imported_at=r.imported_at,
            schemes_found=r.schemes_found,
            txns_added=r.txns_added,
            txns_skipped=r.txns_skipped,
            status=r.status.value,
        )
        for r in records
        if r.status == ImportStatus.COMPLETED
    ]


def confirm_scheme_match(db: Session, scheme_id: int, amfi_code: str) -> None:
    scheme = db.get(Scheme, scheme_id)
    if scheme:
        scheme.amfi_code = amfi_code
        scheme.match_status = MatchStatus.CONFIRMED
        scheme.match_confidence = 1.0
        db.commit()
