import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.services.analytics.ter as ter_module
from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme, SchemeTer
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.analytics.ter import compute_direct_regular_ter_comparison, compute_weighted_ter


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _household_member(db):
    user = User(id=uuid.uuid4(), phone_number=f"+9199999{uuid.uuid4().hex[:5]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Self", relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add(member)
    db.commit()
    return member


def _scheme(db, name="Test Fund"):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name=name, amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    return scheme


def _folio_with_purchase(db, member, scheme, amount, units, nav, plan_type=PlanType.DIRECT):
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=plan_type)
    db.add(folio)
    db.commit()
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=date(2024, 1, 1), amount=amount, units=units, nav=nav))
    db.commit()
    return folio


def _current_month_start():
    return date.today().replace(day=1)


def test_compute_weighted_ter_empty_when_no_holdings():
    db = _session()
    member = _household_member(db)
    summary = asyncio.run(compute_weighted_ter(db, [member.id]))
    assert summary.weighted_ter is None
    assert Decimal(summary.total_value) == Decimal("0")
    assert summary.uncovered_schemes == []


def _mock_holdings(scheme_a, scheme_b):
    return (
        patch(
            "app.services.dashboard.holdings.get_nav_on_or_before",
            new=AsyncMock(side_effect=lambda db_, scheme, on_date: (Decimal("60.0000"), date(2024, 6, 1)) if scheme.id == scheme_a.id else (Decimal("40.0000"), date(2024, 6, 1))),
        ),
        patch("app.services.dashboard.holdings.get_previous_nav_from_cache", return_value=None),
    )


def test_compute_weighted_ter_computes_holding_value_weighted_average():
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    scheme_b = _scheme(db, "Fund B")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    _folio_with_purchase(db, member, scheme_b, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"))
    db.add(SchemeTer(scheme_id=scheme_a.id, reference_period=_current_month_start(), ter_value=Decimal("1.00")))
    db.add(SchemeTer(scheme_id=scheme_b.id, reference_period=_current_month_start(), ter_value=Decimal("2.00")))
    db.commit()

    p1, p2 = _mock_holdings(scheme_a, scheme_b)
    with p1, p2:
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    # current_value: scheme_a 100*60=6000, scheme_b 100*40=4000, total 10000.
    # weighted TER = (6000*1.00 + 4000*2.00) / 10000 = (6000+8000)/10000 = 1.40
    assert Decimal(summary.weighted_ter) == Decimal("1.40")
    assert Decimal(summary.total_value) == Decimal("10000.00")
    assert Decimal(summary.covered_value) == Decimal("10000.00")
    assert summary.reference_period == _current_month_start()
    assert summary.uncovered_schemes == []


def test_missing_current_month_ter_falls_back_to_last_saved_month_without_refreshing():
    """A fund without this month's TER uses its latest saved real TER (e.g.
    last month's) and never triggers a refresh (7 Oct fix A)."""
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    last_month = (_current_month_start().replace(day=1) - timedelta(days=1)).replace(day=1)
    db.add(SchemeTer(scheme_id=scheme_a.id, reference_period=last_month, ter_value=Decimal("1.20")))
    db.commit()

    p1, p2 = _mock_holdings(scheme_a, scheme_a)
    with p1, p2:
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    assert Decimal(summary.weighted_ter) == Decimal("1.20")
    assert summary.reference_period == last_month


def test_compute_weighted_ter_flags_uncovered_scheme_without_crashing():
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    scheme_b = _scheme(db, "Fund B (no TER ever resolved)")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    _folio_with_purchase(db, member, scheme_b, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"))
    db.add(SchemeTer(scheme_id=scheme_a.id, reference_period=_current_month_start(), ter_value=Decimal("1.00")))
    db.commit()

    p1, p2 = _mock_holdings(scheme_a, scheme_b)
    with p1, p2:
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    assert Decimal(summary.weighted_ter) == Decimal("1.00")
    assert Decimal(summary.covered_value) == Decimal("6000.00")
    assert Decimal(summary.total_value) == Decimal("10000.00")
    assert summary.uncovered_schemes == ["Fund B (no TER ever resolved)"]


def test_compute_weighted_ter_returns_none_weighted_ter_when_nothing_covered():
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))

    p1, p2 = _mock_holdings(scheme_a, scheme_a)
    with p1, p2:
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    assert summary.weighted_ter is None
    assert Decimal(summary.covered_value) == Decimal("0")
    assert summary.uncovered_schemes == ["Fund A"]


def test_compute_direct_regular_ter_comparison_splits_by_plan_type():
    db = _session()
    member = _household_member(db)
    direct_scheme = _scheme(db, "Direct Fund")
    regular_scheme = _scheme(db, "Regular Fund")
    _folio_with_purchase(db, member, direct_scheme, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"), plan_type=PlanType.DIRECT)
    _folio_with_purchase(db, member, regular_scheme, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"), plan_type=PlanType.REGULAR)
    db.add(SchemeTer(scheme_id=direct_scheme.id, reference_period=_current_month_start(), ter_value=Decimal("0.50")))
    db.add(SchemeTer(scheme_id=regular_scheme.id, reference_period=_current_month_start(), ter_value=Decimal("1.75")))
    db.commit()

    p1, p2 = _mock_holdings(direct_scheme, regular_scheme)
    with p1, p2:
        comparison = asyncio.run(compute_direct_regular_ter_comparison(db, [member.id]))

    assert Decimal(comparison.direct.weighted_ter) == Decimal("0.50")
    assert Decimal(comparison.direct.total_value) == Decimal("6000.00")
    assert Decimal(comparison.regular.weighted_ter) == Decimal("1.75")
    assert Decimal(comparison.regular.total_value) == Decimal("4000.00")


def test_compute_direct_regular_ter_comparison_empty_bucket_when_no_regular_holdings():
    db = _session()
    member = _household_member(db)
    direct_scheme = _scheme(db, "Direct Fund")
    _folio_with_purchase(db, member, direct_scheme, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"), plan_type=PlanType.DIRECT)
    db.add(SchemeTer(scheme_id=direct_scheme.id, reference_period=_current_month_start(), ter_value=Decimal("0.50")))
    db.commit()

    p1, p2 = _mock_holdings(direct_scheme, direct_scheme)
    with p1, p2:
        comparison = asyncio.run(compute_direct_regular_ter_comparison(db, [member.id]))

    assert comparison.regular.weighted_ter is None
    assert Decimal(comparison.regular.total_value) == Decimal("0")


def test_analytics_never_refreshes_ter():
    """7 Oct fix A: scheme_ter is written only by the ter-daily job. Analytics
    reading it must not be able to start the 8,665-scheme refresh."""
    import app.services.analytics.scorer as scorer_module

    assert not hasattr(ter_module, "refresh_ter_data")
    assert not hasattr(ter_module, "_ensure_ter_fresh")
    assert not hasattr(scorer_module, "_ensure_ter_fresh")


def test_weighted_ter_and_comparison_never_reach_amfi():
    """Review finding 8: stronger than the hasattr guard. Any path from the
    TER sections to AMFI's feed fails this test."""
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    boom = AsyncMock(side_effect=AssertionError("Analytics reached AMFI"))
    p1, p2 = _mock_holdings(scheme_a, scheme_a)
    with (p1, p2,
          patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=boom),
          patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=boom)):
        asyncio.run(compute_weighted_ter(db, [member.id]))
        asyncio.run(compute_direct_regular_ter_comparison(db, [member.id]))
    boom.assert_not_awaited()



def _cost_summaries(specs):
    """(name, value, TER, plan, optional shared scheme id); no database access."""
    from types import SimpleNamespace
    holdings = []
    ter_values = {}
    for name, value, ter, plan, *shared_id in specs:
        scheme_id = shared_id[0] if shared_id else str(uuid.uuid4())
        holdings.append(SimpleNamespace(scheme_id=scheme_id, scheme_name=name,
                                       current_value=value, plan_type=plan))
        if ter is not None:
            ter_values[uuid.UUID(scheme_id)] = (Decimal(ter), date(2026, 10, 1))
    with patch.object(ter_module, "compute_holdings", new=AsyncMock(return_value=holdings)), \
         patch.object(ter_module, "_latest_ter_for_scheme", side_effect=lambda db, sid: ter_values.get(sid)):
        portfolio = asyncio.run(compute_weighted_ter(None, []))
        comparison = asyncio.run(compute_direct_regular_ter_comparison(None, []))
    return portfolio, comparison


def _cost_example():
    return [("A", "400000.00", "0.65", PlanType.DIRECT),
            ("B", "350000.00", "1.10", PlanType.REGULAR),
            ("C", "200000.00", "0.90", PlanType.REGULAR),
            ("Missing", "50000.00", None, PlanType.DIRECT)]


def test_yearly_cost_is_value_times_ter_per_fund():
    summary, _ = _cost_summaries(_cost_example()[:1])
    assert (summary.cost_1y, summary.cost_3y, summary.cost_5y) == ("2600.00", "7800.00", "13000.00")
    assert summary.funds[0].plan_type == "direct"


def test_totals_equal_the_sum_of_the_fund_rows():
    summary, _ = _cost_summaries(_cost_example())
    assert (summary.cost_1y, summary.cost_3y, summary.cost_5y) == ("8250.00", "24750.00", "41250.00")
    assert summary.weighted_ter == "0.87"
    assert len(summary.funds) == 4
    assert summary.funds[-1].ter is None
    for field in ("cost_1y", "cost_3y", "cost_5y"):
        assert sum(Decimal(getattr(f, field)) for f in summary.funds if getattr(f, field) is not None) == Decimal(getattr(summary, field))


def test_direct_plus_regular_costs_add_up_to_the_portfolio():
    summary, comparison = _cost_summaries(_cost_example())
    assert comparison.direct.cost_1y == "2600.00"
    assert comparison.regular.cost_1y == "5650.00"
    for field in ("cost_1y", "cost_3y", "cost_5y"):
        assert Decimal(getattr(comparison.direct, field)) + Decimal(getattr(comparison.regular, field)) == Decimal(getattr(summary, field))
    assert comparison.direct.funds == comparison.regular.funds == []


def test_a_fund_without_ter_is_listed_and_left_out_of_totals():
    summary, _ = _cost_summaries(_cost_example())
    row = summary.funds[-1]
    assert row.scheme_name == "Missing"
    assert row.value == "50000.00"
    assert row.ter is row.cost_1y is row.cost_3y is row.cost_5y is None
    assert Decimal(summary.covered_value) == Decimal("950000.00")


def test_a_fund_held_by_two_members_is_one_row_with_combined_value():
    sid = str(uuid.uuid4())
    summary, comparison = _cost_summaries([
        ("Shared", "0.50", "1.00", PlanType.DIRECT, sid),
        ("Shared", "0.50", "1.00", PlanType.DIRECT, sid)])
    assert len(summary.funds) == 1
    assert summary.funds[0].value == "1.00"
    # Round after combining members, not 0.005 -> 0.01 for each member.
    assert summary.cost_1y == comparison.direct.cost_1y == "0.01"


def test_nothing_covered_gives_no_costs():
    summary, comparison = _cost_summaries([("Missing", "50000", None, PlanType.DIRECT)])
    assert summary.cost_1y is summary.cost_3y is summary.cost_5y is None
    assert len(summary.funds) == 1
    assert comparison.direct.cost_1y is comparison.regular.cost_1y is None


def test_rounding_adds_exactly():
    summary, _ = _cost_summaries([("A", "333333.33", "0.75", PlanType.DIRECT)])
    assert (summary.cost_1y, summary.cost_3y, summary.cost_5y) == ("2500.00", "7500.00", "12500.00")
    # This distinguishes half-up from half-even and per-fund from total rounding.
    summary, _ = _cost_summaries([("A", "0.50", "1.00", PlanType.DIRECT),
                                ("B", "0.50", "1.00", PlanType.REGULAR)])
    assert [f.cost_1y for f in summary.funds] == ["0.01", "0.01"]
    assert (summary.cost_1y, summary.cost_3y, summary.cost_5y) == ("0.02", "0.06", "0.10")


def test_new_fields_default_for_old_payloads():
    from app.services.analytics.schemas import WeightedTerSummary
    summary = WeightedTerSummary(weighted_ter=None, covered_value="0", total_value="0",
                                 reference_period=None, uncovered_schemes=[])
    assert summary.cost_1y is summary.cost_3y is summary.cost_5y is None
    assert summary.funds == []


def test_zero_ter_is_covered_and_single_plan_portfolios_have_costs():
    for plan in (PlanType.DIRECT, PlanType.REGULAR):
        summary, comparison = _cost_summaries([("Zero fee", "100.00", "0.00", plan)])
        assert summary.cost_1y == "0.00"
        assert summary.funds[0].ter == "0.00"
        assert getattr(comparison, plan.value).cost_1y == "0.00"



def test_fund_value_keeps_nav_precision_until_display_rounding():
    summary, _ = _cost_summaries([("Precise NAV", "100.4999", "1.00", PlanType.DIRECT)])
    assert summary.funds[0].value == "100.4999"
    assert summary.cost_1y == "1.00"


def test_direct_fund_rows_carry_the_annual_saving_against_the_regular_sibling():
    from app.models.enums import SchemePlanType
    db = _session()
    member = _household_member(db)
    direct = _scheme(db, "Alpha Fund - Direct")
    direct.base_name, direct.plan_type = "Alpha Fund", SchemePlanType.DIRECT
    regular = _scheme(db, "Alpha Fund - Regular")
    regular.base_name, regular.plan_type = "Alpha Fund", SchemePlanType.REGULAR
    held_regular = _scheme(db, "Beta Fund - Regular")
    held_regular.base_name, held_regular.plan_type = "Beta Fund", SchemePlanType.REGULAR
    db.commit()
    _folio_with_purchase(db, member, direct, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    _folio_with_purchase(db, member, held_regular, Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000"), plan_type=PlanType.REGULAR)
    for scheme, ter in ((direct, "0.50"), (regular, "1.30"), (held_regular, "1.50")):
        db.add(SchemeTer(scheme_id=scheme.id, reference_period=_current_month_start(), ter_value=Decimal(ter)))
    db.commit()

    p1, p2 = _mock_holdings(direct, held_regular)
    with p1, p2:
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    rows = {row.scheme_name: row for row in summary.funds}
    # hand check: value 100 units x 60 = 6000; Regular sibling costs 1.30% against 0.50%, so 6000 x 0.80 / 100 = 48.00 a year
    assert rows["Alpha Fund - Direct"].annual_ter_saving == "48.00"
    assert rows["Beta Fund - Regular"].annual_ter_saving is None
    assert summary.model_dump(mode="json")["funds"][0]["annual_ter_saving"] in ("48.00", None)


def test_direct_fund_without_a_cheaper_gap_or_ter_has_no_saving():
    from app.models.enums import SchemePlanType
    db = _session()
    member = _household_member(db)
    direct = _scheme(db, "Gamma Fund - Direct")
    direct.base_name, direct.plan_type = "Gamma Fund", SchemePlanType.DIRECT
    regular = _scheme(db, "Gamma Fund - Regular")
    regular.base_name, regular.plan_type = "Gamma Fund", SchemePlanType.REGULAR
    db.commit()
    _folio_with_purchase(db, member, direct, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    db.add(SchemeTer(scheme_id=direct.id, reference_period=_current_month_start(), ter_value=Decimal("0.50")))
    db.commit()  # the Regular sibling has no TER row
    p1, p2 = _mock_holdings(direct, direct)
    with p1, p2:
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))
    assert summary.funds[0].annual_ter_saving is None
