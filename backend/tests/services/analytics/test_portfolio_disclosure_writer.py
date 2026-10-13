# backend/tests/services/analytics/test_portfolio_disclosure_writer.py
import uuid
import pytest
from functools import lru_cache
from pathlib import Path
from datetime import date
from decimal import Decimal

from app.models.enums import AssetType, DisclosureBatchStatus
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding
from app.services.analytics.amfi_factsheet_client import build_families
from app.services.analytics.portfolio_disclosure_parsing import ParsedHolding, extract_zip_members, parse_workbook
from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch

_HOLDINGS = [
    ParsedHolding(
        instrument_name="HDFC Bank Ltd", isin="INE040A01034", sector_raw="Banks",
        asset_type=AssetType.EQUITY_DOMESTIC, quantity=Decimal("1000.0000"),
        market_value=Decimal("1500000.00"), pct_to_nav=Decimal("62.500"),
    ),
    ParsedHolding(
        instrument_name="Net Receivables/Payables", isin=None, sector_raw=None,
        asset_type=AssetType.CASH_EQUIVALENT, quantity=None,
        market_value=Decimal("900000.00"), pct_to_nav=Decimal("35.500"),
    ),
]  # sums to 98.0% -- within the 90-101% plausibility band


def _family(db, amc="Nippon India Mutual Fund", base="Nippon India Large Cap Fund", n_plans=2):
    schemes = [
        Scheme(id=uuid.uuid4(), name=f"{base} - Plan {i}", amc_name=amc, base_name=base,
               sebi_category="Equity Scheme - Large Cap Fund")
        for i in range(n_plans)
    ]
    db.add_all(schemes)
    db.commit()
    return build_families(schemes)[0]


def test_writes_one_batch_per_plan_variant(db_session):
    family = _family(db_session, n_plans=2)
    written = write_disclosure_batch(
        db_session, family, date(2026, 8, 31), "Nippon India Mutual Fund",
        "https://example.test/file.xls", _HOLDINGS, "EXACT", Decimal("1.0"),
    )
    db_session.commit()
    assert written == 2
    batches = db_session.query(DisclosureBatch).filter_by(as_of_date=date(2026, 8, 31)).all()
    assert len(batches) == 2
    assert all(b.status == DisclosureBatchStatus.WRITTEN for b in batches)
    for batch in batches:
        holdings = db_session.query(SchemeHolding).filter_by(batch_id=batch.id).all()
        assert len(holdings) == 2
        assert holdings[0].instrument_name == "HDFC Bank Ltd"
        assert holdings[0].asset_type == AssetType.EQUITY_DOMESTIC


def test_rerun_replaces_holdings_not_duplicates(db_session):
    family = _family(db_session, n_plans=1)
    write_disclosure_batch(
        db_session, family, date(2026, 8, 31), "Nippon India Mutual Fund",
        "https://example.test/file.xls", _HOLDINGS, "EXACT", Decimal("1.0"),
    )
    db_session.commit()
    new_holdings = [ParsedHolding(
        instrument_name="Reliance Industries Ltd", isin="INE002A01018", sector_raw="Petroleum Products",
        asset_type=AssetType.EQUITY_DOMESTIC, quantity=Decimal("500.0000"),
        market_value=Decimal("2000000.00"), pct_to_nav=Decimal("97.300"),
    )]
    write_disclosure_batch(
        db_session, family, date(2026, 8, 31), "Nippon India Mutual Fund",
        "https://example.test/file-v2.xls", new_holdings, "EXACT", Decimal("1.0"),
    )
    db_session.commit()
    batch = db_session.query(DisclosureBatch).filter_by(as_of_date=date(2026, 8, 31)).one()
    holdings = db_session.query(SchemeHolding).filter_by(batch_id=batch.id).all()
    assert len(holdings) == 1
    assert holdings[0].instrument_name == "Reliance Industries Ltd"
    assert batch.source_url == "https://example.test/file-v2.xls"
    assert batch.status == DisclosureBatchStatus.WRITTEN


def test_marks_batch_failed_when_disclosed_weight_sum_is_implausible(db_session):
    family = _family(db_session, n_plans=1)
    low_sum_holding = [ParsedHolding(
        instrument_name="HDFC Bank Ltd", isin="INE040A01034", sector_raw="Banks",
        asset_type=AssetType.EQUITY_DOMESTIC, quantity=Decimal("1000.0000"),
        market_value=Decimal("1500000.00"), pct_to_nav=Decimal("2.500"),
    )]  # a lone 2.5% holding -- the kind of total a missed header/terminator would produce
    write_disclosure_batch(
        db_session, family, date(2026, 8, 31), "Nippon India Mutual Fund",
        "https://example.test/file.xls", low_sum_holding, "EXACT", Decimal("1.0"),
    )
    db_session.commit()
    batch = db_session.query(DisclosureBatch).filter_by(as_of_date=date(2026, 8, 31)).one()
    assert batch.status == DisclosureBatchStatus.FAILED
    # the holdings are still written -- FAILED flags the batch for review, it doesn't
    # hide the data that was actually parsed.
    assert db_session.query(SchemeHolding).filter_by(batch_id=batch.id).count() == 1


@pytest.mark.parametrize("weight,status", [("90", DisclosureBatchStatus.WRITTEN),
                                          ("101", DisclosureBatchStatus.WRITTEN),
                                          ("101.001", DisclosureBatchStatus.FAILED)])
def test_sum_check_boundaries(db_session, weight, status):
    from dataclasses import replace
    family = _family(db_session, n_plans=1)
    write_disclosure_batch(db_session, family, date(2026, 9, 30), family.amc_name,
                           "https://example.test/file.xls", [replace(_HOLDINGS[0], pct_to_nav=Decimal(weight))],
                           "EXACT", Decimal(1))
    assert db_session.query(DisclosureBatch).one().status is status


def test_parse_errors_prevent_written_and_successful_retry_clears_old_archive(db_session):
    family = _family(db_session, n_plans=1)
    args = (db_session, family, date(2026, 9, 30), family.amc_name, "https://example.test/file.xls",
            _HOLDINGS, "EXACT", Decimal(1))
    write_disclosure_batch(*args, parse_errors=[{"error": "bad row"}])
    batch = db_session.query(DisclosureBatch).one()
    assert batch.status is DisclosureBatchStatus.FAILED
    batch.raw_file_reference = "s3://archive/failed/file.xls"
    db_session.commit()
    write_disclosure_batch(*args)
    assert batch.status is DisclosureBatchStatus.WRITTEN
    assert batch.parse_errors is None
    assert batch.raw_file_reference is None


@pytest.mark.parametrize("sum_weight,total,status", [
    ("98.5", "100", DisclosureBatchStatus.WRITTEN),
    ("98.499", "100", DisclosureBatchStatus.FAILED),
    ("101.5", "100", DisclosureBatchStatus.WRITTEN),
    ("101.501", "100", DisclosureBatchStatus.FAILED),
    ("20", "100", DisclosureBatchStatus.FAILED),
    ("50", "50", DisclosureBatchStatus.FAILED),
])
def test_fix_h2_declared_total_is_reconciled_without_changing_rows(db_session, sum_weight, total, status):
    from dataclasses import replace
    family = _family(db_session, n_plans=1)
    holdings = [replace(_HOLDINGS[0], pct_to_nav=Decimal(sum_weight))]
    write_disclosure_batch(db_session, family, date(2026, 9, 30), family.amc_name,
                           "https://example.test/file.xls", holdings, "EXACT", Decimal(1),
                           declared_total=Decimal(total))
    batch = db_session.query(DisclosureBatch).one()
    assert batch.status is status
    assert sorted(h.pct_to_nav for h in db_session.query(SchemeHolding).all()) == sorted(h.pct_to_nav for h in holdings)


@pytest.mark.parametrize("equity,derivative,status", [
    ("100", "-68", DisclosureBatchStatus.WRITTEN),     # DSP/Edelweiss: shorts are memo outside the Grand Total
    ("113.3", "-13.3", DisclosureBatchStatus.WRITTEN),  # Axis: shorts are netted into NAV
    ("80", "-5", DisclosureBatchStatus.FAILED),         # a dropped section shortens both bases
])
def test_declared_total_reconciles_on_either_derivative_basis(db_session, equity, derivative, status):
    from dataclasses import replace
    family = _family(db_session, n_plans=1)
    holdings = [replace(_HOLDINGS[0], pct_to_nav=Decimal(equity)),
                replace(_HOLDINGS[1], asset_type=AssetType.DERIVATIVE, pct_to_nav=Decimal(derivative))]
    write_disclosure_batch(db_session, family, date(2026, 9, 30), family.amc_name,
                           "https://example.test/file.xls", holdings, "EXACT", Decimal(1),
                           declared_total=Decimal(100))
    assert db_session.query(DisclosureBatch).one().status is status


def test_declared_total_cannot_make_an_empty_parse_written(db_session):
    family = _family(db_session, n_plans=1)
    write_disclosure_batch(db_session, family, date(2026, 9, 30), family.amc_name,
                           "https://example.test/file.xls", [], "EXACT", Decimal(1),
                           declared_total=Decimal(100))
    assert db_session.query(DisclosureBatch).one().status is DisclosureBatchStatus.FAILED


@lru_cache(maxsize=1)
def _uti_sheets():
    path = Path(__file__).resolve().parents[2] / "fixtures" / "portfolio_disclosures" / "uti-consolidated_asof_2026-09-30.zip"
    data = next(data for name, data in extract_zip_members(path.read_bytes()) if name.startswith("Sebi Exposure"))
    return {s.sheet_name: s for s in parse_workbook(data)}


@pytest.mark.parametrize("code", ["176", "747", "748"])
def test_allowlisted_real_source_totals_still_fail_the_writer_band(db_session, code):
    sheet = _uti_sheets()[f"EXPOSURE:{code}"]
    assert sheet.holdings
    family = _family(db_session, n_plans=1)
    write_disclosure_batch(db_session, family, date(2026, 9, 30), family.amc_name,
                           "https://example.test/uti.zip", sheet.holdings, "EXACT", Decimal(1),
                           declared_total=sheet.declared_total)
    batch = db_session.query(DisclosureBatch).one()
    assert batch.status is DisclosureBatchStatus.FAILED
    assert db_session.query(SchemeHolding).filter_by(batch_id=batch.id).count() == len(sheet.holdings)


def test_fix_l3_failed_reparse_replaces_written_rows_and_updates_amc(db_session):
    from dataclasses import replace
    family = _family(db_session, n_plans=1)
    args = (db_session, family, date(2026, 9, 30))
    write_disclosure_batch(*args, "Old AMC", "https://example.test/old.xls", _HOLDINGS, "EXACT", Decimal(1))
    db_session.commit()
    old = db_session.query(DisclosureBatch).one()
    batch_id = old.id
    write_disclosure_batch(*args, "Correct AMC", "https://example.test/new.xls",
                           [replace(_HOLDINGS[0], pct_to_nav=Decimal(2))], "EXACT", Decimal(1),
                           declared_total=Decimal(100))
    db_session.commit()
    batch = db_session.query(DisclosureBatch).one()
    assert batch.id == batch_id
    assert batch.amc_name == "Correct AMC"
    assert batch.status is DisclosureBatchStatus.FAILED
    assert db_session.query(SchemeHolding).filter_by(batch_id=batch.id).count() == 1
