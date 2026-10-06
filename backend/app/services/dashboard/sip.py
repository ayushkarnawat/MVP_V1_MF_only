"""Monthly SIP series, active through three missed instalments.

Recency is measured against the folio's latest confirmed statement end,
falling back to today. Amounts distinguish series, within a small tolerance
(stamp duty, decided 6 Oct); twins remain parallel.
"""

from __future__ import annotations

import calendar
import uuid
from collections import defaultdict
from datetime import date
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.enums import TransactionType, ImportStatus
from app.models.imports import Import
from app.models.transaction_import import TransactionImport
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.dashboard.holdings import _LOT_CONSUMING_TYPES, _process_folio_lots
from app.services.dashboard.schemas import SipMonthlyRow, SipRow


def _add_months_clamped(anchor: date, months: int) -> date:
    """anchor's day-of-month, `months` months later (negative allowed, for
    projecting backward), clamped to the target month's actual length."""
    month_index = anchor.month - 1 + months
    year = anchor.year + month_index // 12
    month = month_index % 12 + 1
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _next_due_on_or_after(anchor: date, today: date) -> date:
    """First monthly-cadence occurrence of anchor's day-of-month that
    falls on or after today. Loop bound is small in practice — an anchor
    a decade stale is ~120 iterations of pure date arithmetic."""
    months = 0
    candidate = anchor
    while candidate < today:
        months += 1
        candidate = _add_months_clamped(anchor, months)
    return candidate

def _folio_transactions_by_id(
    db: Session, folios: list[Folio]
) -> dict[uuid.UUID, list[Transaction]]:
    """Single batched query for every given folio's transactions, ordered
    exactly like holdings.py's per-folio query (same-date redemptions
    sorted after purchases, so _process_folio_lots gets correctly-ordered
    input) — replaces what would otherwise be one query per folio."""
    folio_ids = [f.id for f in folios]
    if not folio_ids:
        return {}
    transactions = (
        db.query(Transaction)
        .filter(Transaction.folio_id.in_(folio_ids))
        .order_by(
            Transaction.date,
            case((Transaction.type.in_(_LOT_CONSUMING_TYPES), 1), else_=0),
            Transaction.id,
        )
        .all()
    )
    by_folio: dict[uuid.UUID, list[Transaction]] = defaultdict(list)
    for txn in transactions:
        by_folio[txn.folio_id].append(txn)
    return by_folio


def _schemes_by_id(db: Session, folios: list[Folio]) -> dict[uuid.UUID, Scheme]:
    """Single batched query for every distinct scheme referenced by the
    given folios — replaces a per-folio `db.get(Scheme, ...)`, which would
    otherwise emit one query per folio (SQLAlchemy's default
    expire_on_commit forces a reload on every db.get() call once the
    session has committed, so identity-map caching doesn't save this)."""
    scheme_ids = {f.scheme_id for f in folios}
    if not scheme_ids:
        return {}
    schemes = db.query(Scheme).filter(Scheme.id.in_(scheme_ids)).all()
    return {s.id: s for s in schemes}


@dataclass(frozen=True)
class SipSeries:
    amount: Decimal          # the latest instalment's amount
    parallel: int
    last_date: date
    first_date: date
    amounts: frozenset = frozenset()  # every amount this series was paid at


def _same_sip(a: Decimal, b: Decimal) -> bool:
    """From 1 July 2020 a 0.005% stamp duty is taken from each instalment
    (53,712.50 -> 53,709.81), so one SIP's amount shifts slightly. Amounts
    within 0.01% (at least Rs 0.05, for paisa rounding) are one SIP; clearly
    different amounts stay separate series (decided 6 Oct)."""
    return abs(a - b) <= max(max(a, b) * Decimal("0.0001"), Decimal("0.05"))


def sip_series(transactions: list[Transaction]) -> list[SipSeries]:
    grouped = defaultdict(list)
    for txn in transactions:
        if txn.type == TransactionType.PURCHASE_SIP:
            grouped[txn.amount].append(txn.date)
    clusters: list[list[Decimal]] = []
    for amount in sorted(grouped):
        # Compared with the series' first amount, so small steps can't chain
        # two different SIPs together (review L6).
        if clusters and _same_sip(clusters[-1][0], amount):
            clusters[-1].append(amount)
        else:
            clusters.append([amount])
    out = []
    for cluster in clusters:
        dated = [(day, amount) for amount in cluster for day in grouped[amount]]
        counts = defaultdict(int)
        for day, _ in dated:
            counts[day.year, day.month] += 1
        last_day = max(day for day, _ in dated)
        latest = max(amount for day, amount in dated if day == last_day)
        out.append(SipSeries(latest, max(counts.values()), last_day, min(day for day, _ in dated),
                             frozenset(cluster)))
    return out


def missed_instalments(last_date: date, reference: date) -> int:
    return max(0, (reference.year-last_date.year)*12 + reference.month-last_date.month-1)


def _references(db: Session, folios: list[Folio]) -> dict[uuid.UUID, date]:
    if not folios:
        return {}
    return dict(db.query(Transaction.folio_id, func.max(Import.statement_to_date))
                .join(TransactionImport, (TransactionImport.transaction_id == Transaction.id)
                      & (TransactionImport.transaction_date == Transaction.date))
                .join(Import, Import.id == TransactionImport.import_id)
                .filter(Transaction.folio_id.in_([f.id for f in folios]),
                        Import.status == ImportStatus.CONFIRMED)
                .group_by(Transaction.folio_id).all())


def compute_active_sips(db: Session, household_member_ids: list[uuid.UUID], *,
                        include_stopped: bool = False) -> list[SipRow]:
    if not household_member_ids:
        return []
    members = {m.id:m for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()}
    folios = db.query(Folio).filter(Folio.household_member_id.in_(household_member_ids)).all()
    by_folio = _folio_transactions_by_id(db, folios)
    schemes = _schemes_by_id(db, folios)
    references = _references(db, folios)
    rows = []
    for folio in folios:
        transactions = by_folio.get(folio.id, [])
        units, _, _ = _process_folio_lots(transactions)
        for series in sip_series(transactions):
            active = units > 0 and missed_instalments(series.last_date, references.get(folio.id) or date.today()) <= 3
            if not active and not include_stopped:
                continue
            scheme = schemes[folio.scheme_id]
            rows.append(SipRow(scheme_id=str(scheme.id), scheme_name=scheme.name,
                               household_member_id=str(folio.household_member_id),
                               household_member_name=members[folio.household_member_id].name,
                               sip_date=series.last_date, sip_amount=f"{series.amount:.2f}",
                               next_due_date=_next_due_on_or_after(series.last_date, date.today()),
                               series_count=series.parallel, status="active" if active else "stopped"))
    return rows


def compute_sips_for_month(db: Session, household_member_ids: list[uuid.UUID], year: int, month: int) -> list[SipMonthlyRow]:
    if not household_member_ids:
        return []
    members = {m.id:m for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()}
    folios = db.query(Folio).filter(Folio.household_member_id.in_(household_member_ids)).all()
    by_folio = _folio_transactions_by_id(db, folios)
    schemes = _schemes_by_id(db, folios)
    references = _references(db, folios)
    rows = []
    counts = defaultdict(int)
    for folio in folios:
        transactions = by_folio.get(folio.id, [])
        units, _, _ = _process_folio_lots(transactions)
        scheme = schemes[folio.scheme_id]
        for series in sip_series(transactions):
            actual = [t for t in transactions if t.type == TransactionType.PURCHASE_SIP
                      and t.amount in series.amounts and (t.date.year,t.date.month) == (year,month)]
            # A month already paid shows what was paid then (stamp duty can make
            # it differ slightly from the series' latest amount).
            dates = [(t.date, t.amount) for t in actual]
            if not dates:
                if units <= 0 or missed_instalments(series.last_date, references.get(folio.id) or date.today()) > 3:
                    continue
                if (year,month) < (series.first_date.year,series.first_date.month):
                    continue
                offset = (year-series.last_date.year)*12 + month-series.last_date.month
                dates = [(_add_months_clamped(series.last_date, offset), series.amount)] * series.parallel
            for day, amount in dates:
                key = (scheme.id, folio.household_member_id, day, amount)
                counts[key] += 1
                rows.append(SipMonthlyRow(scheme_id=str(scheme.id), scheme_name=scheme.name,
                                          household_member_id=str(folio.household_member_id),
                                          household_member_name=members[folio.household_member_id].name,
                                          date=day, amount=f"{amount:.2f}", instalment=counts[key]))
    return rows
