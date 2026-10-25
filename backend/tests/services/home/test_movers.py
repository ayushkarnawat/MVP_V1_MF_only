import random
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import event

from app.models.enums import AssetType, DisclosureBatchStatus
from app.models.reference import DisclosureBatch, Scheme, SchemeHolding, StockMaster
from app.services.home.movers import (
    FundInput,
    compute_movers,
    distribute_cents,
    load_sector_weights,
    spread_cents,
)


AS_OF = date(2026, 10, 23)


def _fund(name, category, units, navs, *, weights=None, statement_priced=False, scheme_id=None):
    return FundInput(
        scheme_id=scheme_id or uuid.uuid4(),
        name=name,
        category=category,
        units_timeline=units,
        navs=navs,
        statement_priced=statement_priced,
        sector_weights=weights,
    )


def _hand_fixture():
    return (
        _fund(
            "Alpha Equity", "Flexi Cap", [(date(2026, 10, 1), Decimal("100"))],
            [(date(2026, 10, 21), Decimal("50")), (date(2026, 10, 22), Decimal("51")),
             (AS_OF, Decimal("52"))], weights={"Banks": Decimal("60"), "IT": Decimal("40")},
        ),
        _fund(
            "Beta Debt", "Short Duration", [(date(2026, 10, 1), Decimal("200"))],
            [(date(2026, 10, 22), Decimal("20")), (AS_OF, Decimal("19.90"))],
        ),
        _fund(
            "Gamma Small", "Small Cap", [(AS_OF, Decimal("50"))],
            [(date(2026, 10, 22), Decimal("10")), (AS_OF, Decimal("9"))],
        ),
        _fund(
            "Delta Mid", "Flexi Cap",
            [(date(2026, 9, 1), Decimal("30")), (AS_OF, Decimal("10"))],
            [(date(2026, 10, 22), Decimal("100")), (AS_OF, Decimal("103"))],
            weights={"Banks": Decimal("50"), "Autos": Decimal("30"), "Other": Decimal("20")},
        ),
        _fund(
            "Epsilon", "Large Cap", [(date(2026, 10, 1), Decimal("10"))],
            [(date(2026, 10, 21), Decimal("5")), (date(2026, 10, 22), Decimal("5.50"))],
        ),
    )


def _bar_pairs(bars):
    return [(bar.label, bar.change) for bar in bars]


def _assert_identity(movers):
    visible = sum((bar.change for bar in movers.result.gains), Decimal("0"))
    visible += sum((bar.change for bar in movers.result.losses), Decimal("0"))
    assert visible + movers.result.others_change == movers.net_change


def test_distribute_cents_examples_and_negative_tie():
    assert distribute_cents({"a": Decimal("33.333"), "b": Decimal("33.333"),
                             "c": Decimal("33.334")}) == (
        {"a": Decimal("33.33"), "b": Decimal("33.33"), "c": Decimal("33.34")},
        Decimal("100.00"),
    )
    assert distribute_cents({"a": Decimal("-10.005"), "b": Decimal("-10.005")}) == (
        {"a": Decimal("-10.00"), "b": Decimal("-10.01")}, Decimal("-20.01")
    )


def test_spread_cents_examples_and_sum_invariants():
    weights = {"A": Decimal("1"), "B": Decimal("1"), "C": Decimal("1")}
    assert spread_cents(Decimal("10.00"), weights) == {
        "A": Decimal("3.34"), "B": Decimal("3.33"), "C": Decimal("3.33")
    }
    assert spread_cents(Decimal("-10.00"), weights) == {
        "A": Decimal("-3.34"), "B": Decimal("-3.33"), "C": Decimal("-3.33")
    }
    assert spread_cents(
        Decimal("90.00"), {"Banks": Decimal("50"), "Autos": Decimal("30"), "Other": Decimal("20")}
    ) == {"Banks": Decimal("45.00"), "Autos": Decimal("27.00"), "Other": Decimal("18.00")}
    assert spread_cents(Decimal("0.00"), weights) == {
        "A": Decimal("0.00"), "B": Decimal("0.00"), "C": Decimal("0.00")
    }


def test_hand_fixture_fund_view_uses_previous_close_units():
    funds = _hand_fixture()
    result = compute_movers(funds, AS_OF, "fund")

    assert result.as_of_nav_date == AS_OF
    assert result.previous_nav_date == date(2026, 10, 22)
    assert result.partial is True
    assert result.stale_scheme_ids == (funds[4].scheme_id,)
    assert result.missing_scheme_ids == ()
    assert result.net_change == Decimal("170.00")
    assert result.previous_value == Decimal("12100")
    assert result.net_pct == Decimal("1.4050")
    assert _bar_pairs(result.result.gains) == [("Alpha Equity", Decimal("100.00")),
                                               ("Delta Mid", Decimal("90.00"))]
    assert _bar_pairs(result.result.losses) == [("Beta Debt", Decimal("-20.00"))]
    assert result.result.others_count == 1
    assert result.result.others_change == Decimal("0.00")
    assert [(fund.name, fund.change, fund.current_value, fund.previous_value) for fund in result.funds] == [
        ("Alpha Equity", Decimal("100.00"), Decimal("5200"), Decimal("5100")),
        ("Delta Mid", Decimal("90.00"), Decimal("1030"), Decimal("3000")),
        ("Beta Debt", Decimal("-20.00"), Decimal("3980.00"), Decimal("4000")),
        ("Gamma Small", Decimal("0.00"), Decimal("450"), Decimal("0")),
    ]
    _assert_identity(result)


def test_hand_fixture_category_view_groups_and_keeps_zero_bar():
    result = compute_movers(_hand_fixture(), AS_OF, "category")

    assert _bar_pairs(result.result.gains) == [("Flexi Cap", Decimal("190.00"))]
    assert _bar_pairs(result.result.losses) == [("Short Duration", Decimal("-20.00"))]
    assert result.result.others_count == 1
    assert result.result.others_change == Decimal("0.00")
    _assert_identity(result)


def test_hand_fixture_sector_view_coverage_and_exact_reconciliation():
    result = compute_movers(_hand_fixture(), AS_OF, "sector")

    assert result.view == "sector"
    assert result.fell_back is False
    assert result.estimated is True
    assert result.coverage_pct == Decimal("56.51")
    assert _bar_pairs(result.result.gains) == [("Banks", Decimal("105.00")),
                                               ("IT", Decimal("40.00"))]
    assert _bar_pairs(result.result.losses) == [("Other", Decimal("-2.00"))]
    assert result.result.others_count == 1
    assert result.result.others_change == Decimal("27.00")
    _assert_identity(result)


def test_sector_request_falls_back_below_fifty_percent_coverage():
    funds = tuple(
        FundInput(**{**fund.__dict__, "sector_weights": None}) if fund.name in {"Alpha Equity", "Delta Mid"}
        else fund
        for fund in _hand_fixture()
    )
    result = compute_movers(funds, AS_OF, "sector")

    assert result.requested_view == "sector"
    assert result.view == "category"
    assert result.fell_back is True
    assert result.estimated is False
    assert result.coverage_pct == Decimal("0.00")


def test_holiday_one_fund_and_all_down_edges():
    friday = date(2026, 10, 23)
    saturday = date(2026, 10, 24)
    one = _fund("Only", "", [(date(2026, 1, 1), Decimal("10"))],
                [(date(2026, 10, 22), Decimal("10")), (friday, Decimal("9"))])
    result = compute_movers([one], saturday, "fund")

    assert result.as_of_nav_date == friday
    assert result.previous_nav_date == date(2026, 10, 22)
    assert result.result.gains == ()
    assert _bar_pairs(result.result.losses) == [("Only", Decimal("-10.00"))]
    assert result.result.others_count == 0


def test_redeemed_on_latest_nav_still_counts_statement_price_does_not():
    redeemed = _fund(
        "Redeemed", "Equity", [(date(2026, 1, 1), Decimal("10")), (AS_OF, Decimal("0"))],
        [(date(2026, 10, 22), Decimal("10")), (AS_OF, Decimal("12"))],
    )
    statement = _fund(
        "Statement", "Other", [(date(2026, 1, 1), Decimal("10"))],
        [(date(2026, 10, 22), Decimal("10")), (AS_OF, Decimal("20"))], statement_priced=True,
    )
    result = compute_movers([redeemed, statement], AS_OF, "fund")

    assert {fund.name: fund.change for fund in result.funds} == {
        "Redeemed": Decimal("20.00"), "Statement": Decimal("0.00")
    }


def test_missing_nav_one_nav_and_no_eligible_funds():
    missing = _fund("Missing", "Equity", [(date(2026, 1, 1), Decimal("10"))], [])
    one_nav = _fund("One NAV", "Equity", [(date(2026, 1, 1), Decimal("10"))],
                    [(AS_OF, Decimal("5"))])
    result = compute_movers([missing, one_nav], AS_OF, "fund")

    assert result.missing_scheme_ids == (missing.scheme_id,)
    assert result.partial is True
    assert result.net_change == Decimal("0.00")
    assert result.funds[0].change == Decimal("0.00")

    empty = compute_movers(
        [_fund("Redeemed Earlier", "Equity", [(date(2026, 1, 1), Decimal("0"))],
               [(date(2026, 10, 22), Decimal("10")), (AS_OF, Decimal("11"))])], AS_OF, "fund"
    )
    assert empty.as_of_nav_date is None
    assert empty.previous_nav_date is None
    assert empty.net_change == Decimal("0.00")
    assert empty.net_pct is None
    assert empty.result.gains == empty.result.losses == ()


def test_seeded_inputs_reconcile_every_view_without_negative_zero():
    rng = random.Random(8147)
    for _ in range(250):
        funds = []
        for index in range(rng.randint(1, 8)):
            units = Decimal(rng.randint(0, 500))
            previous_nav = Decimal(rng.randint(1, 10000)) / Decimal("100")
            latest_nav = previous_nav + Decimal(rng.randint(-1000, 1000)) / Decimal("1000")
            funds.append(_fund(
                f"Fund {index}", rng.choice(["Equity", "Debt", ""]),
                [(date(2026, 1, 1), units)],
                [(date(2026, 10, 22), previous_nav), (AS_OF, latest_nav)],
                weights={"Banks": Decimal(rng.randint(0, 100)), "IT": Decimal(rng.randint(0, 100))},
            ))
        for view in ("fund", "category", "sector"):
            result = compute_movers(funds, AS_OF, view)
            _assert_identity(result)
            amounts = [result.net_change, result.result.others_change]
            amounts += [fund.change for fund in result.funds]
            amounts += [bar.change for bar in (*result.result.gains, *result.result.losses)]
            assert all(not (amount.is_zero() and amount.is_signed()) for amount in amounts)


def _scheme(db, name):
    row = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:8], name=name,
                 amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(row)
    db.flush()
    return row


def _batch(db, scheme, day, status):
    row = DisclosureBatch(id=uuid.uuid4(), scheme_id=scheme.id, as_of_date=day,
                          amc_name=scheme.amc_name, status=status,
                          written_at=datetime.now(timezone.utc))
    db.add(row)
    db.flush()
    return row


def _holding(db, batch, isin, weight, sector_raw="AAA"):
    db.add(SchemeHolding(batch_id=batch.id, instrument_name=isin or "Cash", isin=isin,
                         sector_raw=sector_raw, asset_type=AssetType.EQUITY_DOMESTIC,
                         market_value=Decimal("100"), pct_to_nav=Decimal(weight)))


def test_load_sector_weights_uses_newest_written_batch_and_stock_master_only(db_session):
    scheme = _scheme(db_session, "Mapped")
    old = _batch(db_session, scheme, date(2026, 8, 31), DisclosureBatchStatus.WRITTEN)
    newest = _batch(db_session, scheme, date(2026, 9, 30), DisclosureBatchStatus.WRITTEN)
    _holding(db_session, old, "INE000000001", "99")
    _holding(db_session, newest, "INE000000001", "60")
    _holding(db_session, newest, "INE000000002", "30", sector_raw="AA")
    _holding(db_session, newest, None, "10", sector_raw="Government Securities")
    db_session.add(StockMaster(isin="INE000000001", name="Bank", sector="Banks",
                               as_of_date=AS_OF, source="NSE"))
    pending = _batch(db_session, scheme, date(2026, 10, 15), DisclosureBatchStatus.PENDING)
    future = _batch(db_session, scheme, date(2026, 10, 31), DisclosureBatchStatus.WRITTEN)
    _holding(db_session, pending, "INE000000001", "100")
    _holding(db_session, future, "INE000000001", "100")
    db_session.commit()

    assert load_sector_weights(db_session, [scheme.id], AS_OF) == {
        scheme.id: {"Banks": Decimal("60.000"), "Other": Decimal("40.000")}
    }


def test_load_sector_weights_statement_count_same_for_one_and_four_schemes(db_session):
    scheme_ids = []
    for index in range(4):
        scheme = _scheme(db_session, f"Fund {index}")
        scheme_ids.append(scheme.id)
        batch = _batch(db_session, scheme, date(2026, 9, 30), DisclosureBatchStatus.WRITTEN)
        _holding(db_session, batch, None, "100")
    db_session.commit()
    counts = []
    for ids in (scheme_ids[:1], scheme_ids):
        statements = []
        listener = lambda *args: statements.append(args[2])
        event.listen(db_session.bind, "before_cursor_execute", listener)
        load_sector_weights(db_session, ids, AS_OF)
        event.remove(db_session.bind, "before_cursor_execute", listener)
        counts.append(len(statements))
    assert counts == [1, 1]


def test_load_sector_weights_empty_input_runs_no_statement(db_session):
    statements = []
    listener = lambda *args: statements.append(args[2])
    event.listen(db_session.bind, "before_cursor_execute", listener)
    assert load_sector_weights(db_session, [], AS_OF) == {}
    event.remove(db_session.bind, "before_cursor_execute", listener)
    assert statements == []


def _solo_fund(mapped):
    # One fund, so coverage equals its mapped sector weight exactly.
    return _fund("Solo", "Flexi Cap", [(date(2026, 10, 1), Decimal("100"))],
                 [(date(2026, 10, 22), Decimal("10")), (AS_OF, Decimal("11"))],
                 weights={"Banks": Decimal(mapped), "Other": Decimal(100) - Decimal(mapped)})


@pytest.mark.parametrize("mapped,falls_back", [("45", True), ("49", True), ("50", False), ("51", False)])
def test_sector_fallback_happens_only_below_fifty_percent_coverage(mapped, falls_back):
    result = compute_movers([_solo_fund(mapped)], AS_OF, "sector")

    assert result.coverage_pct == Decimal(mapped).quantize(Decimal("0.01"))
    assert result.fell_back is falls_back
    assert result.view == ("category" if falls_back else "sector")
    assert result.estimated is (not falls_back)


def test_empty_category_is_labelled_other_in_the_category_view():
    fund = _fund("Unlabelled", "", [(date(2026, 10, 1), Decimal("100"))],
                 [(date(2026, 10, 22), Decimal("10")), (AS_OF, Decimal("11"))])

    result = compute_movers([fund], AS_OF, "category")

    assert _bar_pairs(result.result.gains) == [("Other", Decimal("100.00"))]


def test_previous_nav_date_is_the_latest_previous_date_among_included_funds():
    units = [(date(2026, 10, 1), Decimal("10"))]
    short_gap = _fund("Short gap", "Equity", units, [(date(2026, 10, 22), Decimal("10")), (AS_OF, Decimal("11"))])
    long_gap = _fund("Long gap", "Equity", units, [(date(2026, 10, 20), Decimal("10")), (AS_OF, Decimal("11"))])

    assert compute_movers([short_gap, long_gap], AS_OF, "fund").previous_nav_date == date(2026, 10, 22)
