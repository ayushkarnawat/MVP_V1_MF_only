from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.enums import PlanType
from app.models.folio import Folio
from app.models.reference import Scheme, SchemeFundManager
from app.models.transaction import Transaction
from app.services.analytics.fund_manager_allocation import _pick_for_fund
from app.services.dashboard.allocation_labels import asset_class_bucket
from app.services.dashboard.household_members import list_household_members
from app.services.dashboard.sip import compute_active_sips
from app.services.search.positions import open_or_sold
from app.services.search.schemas import SearchFund, SearchHolder, SearchIndexResponse, SearchSip


@dataclass(frozen=True)
class _ManagerFund:
    sebi_category: str | None
    asset_class: str


def build_search_index(db: Session, user_id: uuid.UUID, today: date) -> SearchIndexResponse:
    generated_at = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    members = list_household_members(db, user_id)
    member_ids = [member.id for member in members]
    folios = db.query(Folio).filter(Folio.household_member_id.in_(member_ids)).all() if member_ids else []
    folios_by_id = {folio.id: folio for folio in folios}
    transactions = db.query(Transaction).filter(Transaction.folio_id.in_(list(folios_by_id))).all() if folios else []
    grouped: dict[tuple[uuid.UUID, uuid.UUID], list[Transaction]] = defaultdict(list)
    for txn in transactions:
        folio = folios_by_id[txn.folio_id]
        grouped[folio.household_member_id, folio.scheme_id].append(txn)
    scheme_ids = {scheme_id for _, scheme_id in grouped}
    schemes = db.query(Scheme).filter(Scheme.id.in_(scheme_ids)).all() if scheme_ids else []

    sips: dict[tuple[str, str], SearchSip] = {}
    for row in compute_active_sips(db, member_ids, include_stopped=True, today=today):
        key = (row.household_member_id, row.scheme_id)
        candidate = SearchSip(status=row.status, next_due_date=row.next_due_date if row.status == "active" else None)
        previous = sips.get(key)
        # One holder may have several SIP series or folios. Prefer active, then the nearest due date.
        if previous is None or (candidate.status == "active" and (
            previous.status != "active" or (candidate.next_due_date or date.max) < (previous.next_due_date or date.max)
        )):
            sips[key] = candidate

    manager_rows = db.query(SchemeFundManager).filter(SchemeFundManager.scheme_id.in_(scheme_ids)).all() if scheme_ids else []
    latest: dict[uuid.UUID, date] = {}
    for row in manager_rows:
        latest[row.scheme_id] = max(latest.get(row.scheme_id, row.reference_period), row.reference_period)
    # Match Allocation's current month and previous two months, including year boundaries.
    year, month = divmod(today.year * 12 + today.month - 1 - 2, 12)
    oldest = date(year, month + 1, 1)
    managers: dict[uuid.UUID, list[SchemeFundManager]] = defaultdict(list)
    for row in manager_rows:
        if row.reference_period == latest[row.scheme_id] and row.reference_period >= oldest:
            managers[row.scheme_id].append(row)

    funds = []
    for scheme in sorted(schemes, key=lambda scheme: (scheme.name, str(scheme.id))):
        # Holdings derives asset_class from category; the scheme master has no asset_class column.
        manager = _pick_for_fund(managers[scheme.id], _ManagerFund(
            sebi_category=scheme.sebi_category, asset_class=asset_class_bucket(scheme.sebi_category or ""),
        )).row
        funds.append(SearchFund(
            scheme_id=str(scheme.id), name=scheme.name, amc_name=scheme.amc_name,
            sebi_category=scheme.sebi_category,
            plan_type=scheme.plan_type.value if scheme.plan_type is not None else PlanType.UNCLASSIFIED.value,
            main_manager=manager.manager_name if manager is not None else None,
            holders=[SearchHolder(
                member_id=str(member.id), member_name=member.name,
                state=open_or_sold(grouped[member.id, scheme.id]),
                sip=sips.get((str(member.id), str(scheme.id))),
            ) for member in members if (member.id, scheme.id) in grouped],
        ))
    return SearchIndexResponse(generated_at=generated_at, funds=funds)
