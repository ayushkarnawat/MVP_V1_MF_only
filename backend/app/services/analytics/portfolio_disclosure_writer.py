# backend/app/services/analytics/portfolio_disclosure_writer.py
"""Write stage: delete-all-rows-for-batch_id-then-reinsert, never a partial upsert --
re-running Write for the same batch is always safe, since nothing partial is ever left
behind to merge with (spec's Write-stage constraint)."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.enums import AssetType, DisclosureBatchStatus
from app.models.reference import DisclosureBatch, SchemeHolding
from app.services.analytics.amfi_factsheet_client import FundFamily
from app.services.analytics.portfolio_disclosure_parsing import ParsedHolding, SUM_CHECK_MIN, SUM_CHECK_MAX

# Deliberately wide (Q9's deepened fix): exists to catch a header/terminator mismatch
# the fixture set didn't cover (an entire section silently dropped), not to flag normal
# day-to-day variation in a fund's actual disclosed total.
_SUM_CHECK_MIN = SUM_CHECK_MIN
_SUM_CHECK_MAX = SUM_CHECK_MAX
HEDGE_BALANCE_TOLERANCE = Decimal("5")  # percentage points: net risk exposure may not be below -this
RECONCILIATION_TOLERANCE = Decimal("1.5")  # percentage points; never adjusts source weights


def declared_total_reconciles(holdings: list[ParsedHolding], declared_total: Decimal) -> bool:
    """True when the sheet's Grand Total is in the 90-101 band and the parsed rows reconcile
    to it within RECONCILIATION_TOLERANCE on the signed basis or (hedge balanced) the
    non-derivative basis."""
    total_pct = sum((h.pct_to_nav for h in holdings), Decimal("0"))
    if not (total_pct.is_finite() and declared_total.is_finite()):
        return False
    nav_pct = sum((h.pct_to_nav for h in holdings if h.asset_type is not AssetType.DERIVATIVE), Decimal("0"))
    deriv_pct = total_pct - nav_pct
    risk_pct = sum((h.pct_to_nav for h in holdings if h.asset_type not in (AssetType.DERIVATIVE, AssetType.CASH_EQUIVALENT)), Decimal("0"))
    # The non-derivative basis is only trusted when net risk exposure (non-cash,
    # non-derivative rows plus derivative legs) is not negative: a real fund is not net short,
    # so a negative net means the risk assets were dropped while its short legs survived
    # (a fund that nets futures into cash would otherwise still reconcile).
    # AMCs differ on whether futures sit inside NAV (Axis) or are memo exposure (DSP).
    hedge_balanced = deriv_pct == 0 or (risk_pct + deriv_pct) >= -HEDGE_BALANCE_TOLERANCE
    return (
        _SUM_CHECK_MIN <= declared_total <= _SUM_CHECK_MAX
        and (abs(total_pct - declared_total) <= RECONCILIATION_TOLERANCE
             or (hedge_balanced and abs(nav_pct - declared_total) <= RECONCILIATION_TOLERANCE))
    )


def write_disclosure_batch(
    db: Session, family: FundFamily, as_of_date: date, amc_name: str, source_url: str,
    holdings: list[ParsedHolding], match_method: str, match_confidence: Decimal,
    parse_errors: list[dict] | None = None,
    declared_total: Decimal | None = None,
) -> int:
    """Writes to every plan/option row of the matched family -- holdings are identical
    across a fund's plan variants, the same precedent as attribute 04's
    `upsert_scheme_fund_managers`. Returns the number of scheme batches written.

    A failed re-parse replaces the prior rows and marks the existing batch FAILED;
    consumers read WRITTEN only. The refresh caller skips an already-WRITTEN URL.
    """
    total_pct = sum((h.pct_to_nav for h in holdings), Decimal("0"))
    valid_total = total_pct.is_finite()
    if declared_total is not None:
        valid_total = valid_total and declared_total_reconciles(holdings, declared_total)
    else:
        valid_total = valid_total and _SUM_CHECK_MIN <= total_pct <= _SUM_CHECK_MAX
    status = (
        DisclosureBatchStatus.WRITTEN
        if holdings and not parse_errors and valid_total
        else DisclosureBatchStatus.FAILED
    )
    written = 0
    for scheme in family.schemes:
        batch = (
            db.query(DisclosureBatch)
            .filter_by(scheme_id=scheme.id, as_of_date=as_of_date)
            .one_or_none()
        )
        if batch is None:
            batch = DisclosureBatch(
                id=uuid.uuid4(), scheme_id=scheme.id, as_of_date=as_of_date, amc_name=amc_name,
                status=DisclosureBatchStatus.PENDING,
            )
            db.add(batch)
            db.flush()
        else:
            db.query(SchemeHolding).filter_by(batch_id=batch.id).delete()
        batch.source_url = source_url
        batch.amc_name = amc_name
        batch.match_method = match_method
        batch.match_confidence = match_confidence
        batch.parse_errors = parse_errors
        batch.status = status
        if status is DisclosureBatchStatus.WRITTEN:
            batch.raw_file_reference = None
        batch.written_at = datetime.now(timezone.utc)
        for holding in holdings:
            db.add(SchemeHolding(
                id=uuid.uuid4(), batch_id=batch.id, instrument_name=holding.instrument_name,
                isin=holding.isin, sector_raw=holding.sector_raw, asset_type=holding.asset_type,
                quantity=holding.quantity, market_value=holding.market_value, pct_to_nav=holding.pct_to_nav,
            ))
        written += 1
    db.flush()
    return written
