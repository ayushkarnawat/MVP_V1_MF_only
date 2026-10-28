from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.reference import Scheme, SchemeFundManager
from app.services.fund_page.schemas import ManagerOut, ManagerResponse, Unavailable, plain


def build_manager(
    db: Session, scheme: Scheme, today: date,
) -> ManagerResponse | Unavailable:
    reference_period = db.query(func.max(SchemeFundManager.reference_period)).filter(
        SchemeFundManager.scheme_id == scheme.id,
    ).scalar()
    if reference_period is None:
        return Unavailable(reason="no_manager_data")
    rows = db.query(SchemeFundManager).filter(
        SchemeFundManager.scheme_id == scheme.id,
        SchemeFundManager.reference_period == reference_period,
    ).order_by(SchemeFundManager.sequence_order, SchemeFundManager.manager_name).all()
    managers = []
    for row in rows:
        tenure = None
        if row.managing_since is not None:
            tenure = plain(
                # A future start date (data entry/lead time) would read negative; clamp to 0.
                max(Decimal((today - row.managing_since).days), Decimal("0")) / Decimal("365.25"), 1,
            )
        managers.append(ManagerOut(
            name=row.manager_name, role=row.role, managing_since=row.managing_since,
            tenure_years=tenure,
        ))
    return ManagerResponse(
        scheme_id=str(scheme.id), reference_period=reference_period, managers=managers,
    )
