"""seed_scenario_library: 31 scenarios + 5 hypothetical assumption sets (attribute 11)

Revision ID: 0037
Revises: 0036

Seed data only -- see 2026-10-07-sub-project-1-planning.md's "Seed data" section
for the full verification trail behind every date/stat below. A future date
correction is a plain UPDATE against the named row, not a new migration.
"""
from decimal import Decimal

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


# Typed inserts and Python UUIDs keep the seed portable to SQLite.
import uuid

_scenarios = sa.table(
    "scenarios",
    sa.column("id", sa.Uuid()), sa.column("parent_scenario_id", sa.Uuid()),
    sa.column("name", sa.String()), sa.column("description", sa.String()),
    sa.column("start_date", sa.Date()), sa.column("end_date", sa.Date()),
    sa.column("scenario_type", sa.String()), sa.column("is_ongoing", sa.Boolean()),
    sa.column("display_rank", sa.Integer()), sa.column("phase_label", sa.String()),
    sa.column("phase_order", sa.Integer()),
    sa.column("had_redemption_freeze_schemes", sa.JSON().with_variant(postgresql.ARRAY(sa.Text()), "postgresql")),
)
_assumptions = sa.table(
    "scenario_hypothetical_assumptions",
    sa.column("scenario_id", sa.Uuid()), sa.column("asset_class", sa.String()),
    sa.column("assumed_pct_change", sa.Numeric(6, 2)), sa.column("assumption_note", sa.String()),
)


def _insert_scenario(conn, **values) -> uuid.UUID:
    from datetime import date as _date
    for key in ("start_date", "end_date"):
        if isinstance(values.get(key), str):
            values[key] = _date.fromisoformat(values[key])
    values["id"] = uuid.uuid4()
    conn.execute(_scenarios.insert().values(**values))
    return values["id"]


def upgrade() -> None:
    conn = op.get_bind()
    plain_scenarios = [
        ("Dot-com bust", "Tests IT/tech concentration.", "2000-03-01", "2002-10-31", "CRASH", False, None),
        ("Global Financial Crisis (2008)", "Sensex ~-60% peak-to-trough; crude spiked beforehand.", "2008-01-01", "2008-10-31", "CRASH", False, 3),
        ("Eurozone debt crisis (2011)", "Slow grind down, weak rupee.", "2010-11-01", "2011-12-31", "CRASH", False, None),
        ("Taper tantrum (2013)", "Rupee ~55->68, bond yields spiked. Tests debt funds/INR exposure.", "2013-05-01", "2013-09-30", "CRASH", False, None),
        ("China crash / yuan devaluation", "EM risk-off.", "2015-08-01", "2016-01-31", "CRASH", False, None),
        ("Demonetisation (2016)", "Domestic cash shock -- real estate, small caps, NBFCs hit hardest.", "2016-11-01", "2017-01-31", "CRASH", False, None),
        ("Budget 2018 LTCG reintroduction", "Tax-policy shock, tests tax-drag modelling.", "2018-02-01", "2018-02-02", "POLICY_RATE", False, None),
        ("IL&FS / NBFC crisis (2018)", "Credit event (27-28 Aug 2018 CP default, 21-24 Sep sector sell-off) + small/midcap drawdown after.", "2018-08-01", "2018-11-30", "CRASH", False, None),
        ("2019 pre-COVID slowdown", "Carried over from the original library.", "2019-06-01", "2019-11-30", "CRASH", False, None),
        ("COVID crash", "Nifty ~-38% in ~45 trading days (20 Jan 2020 ATH 12,430 to 23 Mar 2020 low 7,511).", "2020-01-20", "2020-03-31", "CRASH", False, 1),
        ("2022 global tightening", "Russia-Ukraine + Fed hikes + record FPI outflows. Nifty ~-18.4% (18,604 to 15,183).", "2021-10-01", "2022-06-30", "CRASH", False, 2),
        ("Adani-Hindenburg (2023)", "Single-group collapse.", "2023-01-01", "2023-02-28", "CRASH", False, 6),
        ("SVB / Credit Suisse (2023)", "Global banking scare, mild India impact.", "2023-03-01", "2023-03-31", "CRASH", False, None),
        ("Oct 2024 - Mar 2025 correction", "Nifty ~-10.4% off its 27 Sep 2024 ATH (26,277), -6.2% in Oct alone.", "2024-09-01", "2025-03-31", "CRASH", False, None),
        ("Trump tariff shock (2025)", "\"Liberation Day\" tariffs announced 2 Apr; deepest crash 6-7 Apr; fully recovered by 15 Apr.", "2025-04-02", "2025-04-15", "CRASH", False, None),
        ("2003-07 India bull run", "Sensex ~6-7x. Tests secular-rally compounding.", "2003-04-01", "2008-01-31", "BULL_RUN", False, None),
        ("Post-GFC rebound", "V-shaped recovery, rewards staying invested.", "2009-03-01", "2010-11-30", "BULL_RUN", False, None),
        ("Post-COVID bull run", "Nifty ~+140-145% (7,511 to ~18,600). Small caps and new-age IPOs ran far ahead.", "2020-03-23", "2021-10-31", "BULL_RUN", False, 4),
        ("2023 - Sep 2024 broad rally", "Midcap/smallcap + SIP-boom phase.", "2023-01-01", "2024-09-27", "BULL_RUN", False, None),
        ("Gold and silver rally (2024-26)", "Gold +23% (2024), +60%+ (2025), fresh ATH 29 Jan 2026. Still ongoing.", "2024-01-01", None, "BULL_RUN", True, None),
        ("2004 election result", "Sensex -15.52% intraday, Nifty -17.47%; circuit breaker triggered twice.", "2004-05-17", "2004-05-17", "POLICY_RATE", False, None),
        ("2024 election result", "Sensex -5.74%, Nifty -5.93%; fresh ATHs again within 2-3 trading days.", "2024-06-04", "2024-06-04", "POLICY_RATE", False, None),
        ("RBI hiking cycle (2022-23)", "Repo 4.0% -> 6.5% over 6 MPC hikes. Tests debt-fund mark-to-market losses.", "2022-05-04", "2023-02-08", "POLICY_RATE", False, None),
        ("Rate cut cycle (2025)", "Reverse case: duration funds win. Repo 6.5%->5.25%. Concluded, reversed to a hike 7 Oct 2026.", "2025-02-07", "2025-12-05", "POLICY_RATE", False, None),
    ]
    scenario_ids = {}
    for name, description, start, end, scenario_type, is_ongoing, display_rank in plain_scenarios:
        scenario_ids[name] = _insert_scenario(conn, name=name, description=description, start_date=start, end_date=end, scenario_type=scenario_type, is_ongoing=is_ongoing, display_rank=display_rank)
    franklin_id = _insert_scenario(conn, name="Franklin Templeton wind-up (2020)", description="Debt fund liquidity freeze, kept separate from COVID to test illiquid debt specifically.", start_date="2020-04-01", end_date="2020-06-30", scenario_type="CRASH", is_ongoing=False, display_rank=5, had_redemption_freeze_schemes=["Franklin India Low Duration Fund", "Franklin India Ultra Short Bond Fund", "Franklin India Short Term Income Plan", "Franklin India Credit Risk Fund", "Franklin India Dynamic Accrual Fund", "Franklin India Income Opportunities Fund"])
    scenario_ids["Franklin Templeton wind-up (2020)"] = franklin_id
    group_id = _insert_scenario(conn, name="US-Iran war (2026)", description="Multi-phase -- see phases. Verify current status again before treating as closed.", start_date="2026-02-28", end_date=None, scenario_type="CRASH", is_ongoing=True, display_rank=7)
    for name, description, start, end, is_ongoing, phase_label, phase_order in [
        ("US-Iran war -- Shock", "Sensex/Nifty ~-12% by 2 Apr; US crude +27% to ~$115 in early March.", "2026-02-28", "2026-04-02", False, "Shock", 1),
        ("US-Iran war -- Partial recovery", "Markets rallied sharply 12 Jun when Trump declared the war over.", "2026-04-02", "2026-07-08", False, "Partial recovery", 2),
        ("US-Iran war -- Relapse", "Nifty fell >2% on 8 Jul when the interim deal was called off; rupee past 95.50. Still unresolved.", "2026-07-08", None, True, "Relapse", 3),
    ]:
        _insert_scenario(conn, parent_scenario_id=group_id, name=name, description=description, start_date=start, end_date=end, scenario_type="CRASH", is_ongoing=is_ongoing, phase_label=phase_label, phase_order=phase_order)
    hypothetical_scenarios = [
        ("Strait of Hormuz closure", "Crude above $150.", None),
        ("US recession + Fed pivot", "US GDP contracts, Fed cuts rates aggressively.", None),
        ("AI/tech valuation bust", "US tech -40%, spillover to Indian IT.", 8),
        ("Rupee sharp depreciation", "Rupee past 105.", None),
        ("Indian equity \"lost decade\"", "Prolonged sideways market, tests SIP discipline.", None),
    ]
    for name, description, display_rank in hypothetical_scenarios:
        scenario_ids[name] = _insert_scenario(conn, name=name, description=description, start_date=None, end_date=None, scenario_type="HYPOTHETICAL", is_ongoing=False, display_rank=display_rank)
    assumptions = {
        "Strait of Hormuz closure": [
            ("Equity", Decimal("-25.0"), "Anchored to 2022 global tightening (-18.4%) scaled up ~35% for a full chokepoint closure disrupting ~20% of global oil supply."),
            ("Index/ETF", Decimal("-25.0"), "Same as Equity -- a Nifty/Sensex index fund is passive equity exposure, not a distinct risk."),
            ("Debt-short", Decimal("-1.0"), "Liquid/overnight/money-market/ultra-short funds carry almost no duration risk."),
            ("Debt-long", Decimal("-4.0"), "RBI likely hikes/holds hard to defend the rupee against imported inflation."),
            ("Hybrid", Decimal("-16.6"), "0.6 x Equity (-25.0) + 0.4 x Debt-long (-4.0), computed not eyeballed."),
            ("Gold", Decimal("8.0"), "Oil-shock safe-haven demand plus a weaker rupee tailwind."),
            ("Silver", Decimal("4.0"), "Safe-haven bid, cut by the industrial slowdown an oil shock brings."),
            ("Overseas", Decimal("-10.0"), "Global equity also falls, but a diversified overseas fund is less exposed than India to India-specific oil-import pain."),
            ("Other", Decimal("-15.0"), "Residual bucket, follows the broad domestic market moderately."),
        ],
        "US recession + Fed pivot": [
            ("Equity", Decimal("-15.0"), "A US recession dampens global growth/FII flows, but India's domestic-consumption story partially decouples."),
            ("Index/ETF", Decimal("-15.0"), "Same as Equity."),
            ("Debt-short", Decimal("1.0"), "Barely moves, mild positive drift from rate-cut expectations."),
            ("Debt-long", Decimal("4.0"), "A Fed pivot to rate cuts is a tailwind for duration/debt funds."),
            ("Hybrid", Decimal("-7.4"), "0.6 x Equity (-15.0) + 0.4 x Debt-long (+4.0), computed not eyeballed."),
            ("Gold", Decimal("6.0"), "A Fed pivot to lower real rates is historically bullish for gold."),
            ("Silver", Decimal("0.0"), "Lower real rates help; a US recession hits industrial demand. Roughly cancels."),
            ("Overseas", Decimal("-18.0"), "This shock originates IN the US market -- direct hit, not diluted spillover."),
            ("Other", Decimal("-10.0"), "Residual bucket, moderate drag."),
        ],
        "AI/tech valuation bust": [
            ("Equity", Decimal("-22.0"), "Assumes Indian equity falls ~55% as much as a 40% US tech crash, via IT-sector spillover."),
            ("Index/ETF", Decimal("-22.0"), "Same as Equity."),
            ("Debt-short", Decimal("0.0"), "No real linkage -- this is an equity-specific valuation shock."),
            ("Debt-long", Decimal("-2.0"), "Minor mark-to-market drag from a broader risk-off move."),
            ("Hybrid", Decimal("-14.0"), "0.6 x Equity (-22.0) + 0.4 x Debt-long (-2.0), computed not eyeballed."),
            ("Gold", Decimal("5.0"), "Modest safe-haven bid, smaller than a macro/oil shock."),
            ("Silver", Decimal("-5.0"), "Electronics and solar demand weakens; a smaller haven bid than gold."),
            ("Overseas", Decimal("-35.0"), "This IS a US-tech-concentrated shock -- close to the full US-market hit."),
            ("Other", Decimal("-18.0"), "Residual bucket, follows the broader risk-off move."),
        ],
        "Rupee sharp depreciation": [
            ("Equity", Decimal("-12.0"), "Anchored to Taper Tantrum (2013): FII outflows and import-cost inflation hurt the broad market."),
            ("Index/ETF", Decimal("-12.0"), "Same as Equity."),
            ("Debt-short", Decimal("-2.0"), "Mild -- RBI defends the currency with some front-end rate action."),
            ("Debt-long", Decimal("-6.0"), "RBI likely hikes/holds hard to defend the currency, same mechanism as Taper Tantrum."),
            ("Hybrid", Decimal("-9.6"), "0.6 x Equity (-12.0) + 0.4 x Debt-long (-6.0), computed not eyeballed."),
            ("Gold", Decimal("10.0"), "Gold is dollar-denominated, INR price rises mechanically when the rupee weakens."),
            ("Silver", Decimal("10.0"), "Priced in dollars: the same currency translation as gold."),
            ("Overseas", Decimal("8.0"), "Foreign-currency-denominated assets gain in INR terms purely from currency translation."),
            ("Other", Decimal("-5.0"), "Residual bucket, modest negative."),
        ],
        "Indian equity \"lost decade\"": [
            ("Equity", Decimal("-8.0"), "A prolonged sideways/low-return market, not a single trough. Known limitation: applied instantaneously like every other hypothetical, not amortized over years."),
            ("Index/ETF", Decimal("-8.0"), "Same as Equity."),
            ("Debt-short", Decimal("2.0"), "Accrues normally, slightly muted versus long debt."),
            ("Debt-long", Decimal("3.0"), "Positive -- debt keeps accruing normally regardless of equity stagnation."),
            ("Hybrid", Decimal("-3.6"), "0.6 x Equity (-8.0) + 0.4 x Debt-long (+3.0), computed not eyeballed."),
            ("Gold", Decimal("2.0"), "Mixed historically, kept modest rather than assumed reliably positive."),
            ("Silver", Decimal("2.0"), "No India-specific link; modest, like gold."),
            ("Overseas", Decimal("3.0"), "Overseas diversification is the thing that helps in a domestic-equity-stagnation scenario."),
            ("Other", Decimal("-5.0"), "Residual bucket, least confident number in this row."),
        ],
    }
    for scenario_name, rows in assumptions.items():
        for asset_class, pct, note in rows:
            conn.execute(_assumptions.insert().values(
                scenario_id=scenario_ids[scenario_name], asset_class=asset_class,
                assumed_pct_change=Decimal(str(pct)), assumption_note=note,
            ))


def downgrade() -> None:
    # Computed results reference the seeded scenarios once compute_all_scenarios has run.
    op.execute("DELETE FROM scenario_scheme_results")
    op.execute("DELETE FROM scenario_category_averages")
    op.execute("DELETE FROM scenario_hypothetical_assumptions")
    op.execute("DELETE FROM scenarios")
