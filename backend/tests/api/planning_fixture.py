from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.db.session import get_db
from app.models.enums import BenchmarkIndex, BenchmarkReturnType, SchemePlanType
from app.models.reference import (
    BenchmarkIndexHistory,
    Scenario,
    ScenarioSchemeResult,
    Scheme,
)
from tests.api.home_fixture import HomeFixtureRuntime, build_home_fixture, uid


SCENARIO_IDS = {
    key: uid(f"scenario-{key}") for key in ("a", "b", "b1", "b2", "c", "d", "e")
}

_SCHEMES = {
    "large": ("Asha Large Cap", "Equity Scheme - Large Cap Fund"),
    "flexi": ("Asha Flexi Cap", "Equity Scheme - Flexi Cap Fund"),
    "debt": ("Dev Short Duration Debt", "Debt Scheme - Short Duration Fund"),
    "gold": ("Dev Gold Fund", "Gold ETF"),
}


def _schemes(db) -> dict[str, Scheme]:
    schemes = {}
    for key, (name, category) in _SCHEMES.items():
        scheme = db.get(Scheme, uid(f"scheme-{key}"))
        if scheme is None:
            scheme = Scheme(
                id=uid(f"scheme-{key}"),
                amfi_code=f"HOME-{key}",
                name=name,
                amc_name="Home Test AMC",
                sebi_category=category,
                plan_type=SchemePlanType.DIRECT,
            )
            db.add(scheme)
            db.flush()
        schemes[key] = scheme
    schemes["debt"].amc_name = "Franklin Templeton Mutual Fund"
    return schemes


def _scenarios() -> dict[str, Scenario]:
    rows = {
        "a": Scenario(
            id=SCENARIO_IDS["a"],
            name="Fixture scenario A",
            description="Fixture description for scenario a.",
            start_date=date(2025, 11, 3),
            end_date=date(2025, 12, 31),
            scenario_type="CRASH",
            is_ongoing=False,
            display_rank=1,
            quick_market_pct=Decimal("0.43"),
        ),
        "b": Scenario(
            id=SCENARIO_IDS["b"],
            name="Fixture scenario B",
            description="Fixture description for scenario b.",
            start_date=date(2025, 11, 3),
            end_date=date(2025, 12, 31),
            scenario_type="CRASH",
            is_ongoing=False,
            display_rank=2,
        ),
        "b1": Scenario(
            id=SCENARIO_IDS["b1"],
            name="Fixture scenario B phase 1",
            description="Fixture scenario B phase 1.",
            start_date=date(2025, 11, 3),
            end_date=date(2025, 11, 28),
            scenario_type="CRASH",
            is_ongoing=False,
            parent_scenario_id=SCENARIO_IDS["b"],
            phase_label="Phase 1",
            phase_order=1,
        ),
        "b2": Scenario(
            id=SCENARIO_IDS["b2"],
            name="Fixture scenario B phase 2",
            description="Fixture scenario B phase 2.",
            start_date=date(2025, 12, 1),
            end_date=date(2025, 12, 31),
            scenario_type="CRASH",
            is_ongoing=False,
            parent_scenario_id=SCENARIO_IDS["b"],
            phase_label="Phase 2",
            phase_order=2,
        ),
        "c": Scenario(
            id=SCENARIO_IDS["c"],
            name="Fixture scenario C",
            description="Fixture description for scenario c.",
            start_date=date(2025, 11, 3),
            end_date=date(2025, 12, 31),
            scenario_type="CRASH",
            is_ongoing=False,
            display_rank=3,
            had_redemption_freeze_schemes=["Dev Short Duration Debt"],
        ),
        "d": Scenario(
            id=SCENARIO_IDS["d"],
            name="Fixture scenario D",
            description="Fixture description for scenario d.",
            start_date=date(2005, 1, 3),
            end_date=date(2005, 6, 30),
            scenario_type="CRASH",
            is_ongoing=False,
            display_rank=4,
            quick_market_pct=Decimal("12.50"),
        ),
        "e": Scenario(
            id=SCENARIO_IDS["e"],
            name="Fixture scenario E",
            description="",
            start_date=date(2025, 11, 3),
            end_date=date(2025, 12, 31),
            scenario_type="CRASH",
            is_ongoing=False,
            display_rank=5,
        ),
    }
    return rows


def _add_result(
    db,
    scenario_id,
    scheme: Scheme,
    pct: str | None,
    *,
    proxied: bool = False,
    basis: str | None = None,
) -> None:
    db.add(ScenarioSchemeResult(
        scenario_id=scenario_id,
        scheme_id=scheme.id,
        pct_change=Decimal(pct) if pct is not None else None,
        is_proxied=proxied,
        proxy_basis=basis,
    ))


def _seed_results(db, scenarios: dict[str, Scenario], schemes: dict[str, Scheme]) -> None:
    for key, pct in {"large": "-38", "flexi": "-30", "debt": "1"}.items():
        _add_result(db, scenarios["a"].id, schemes[key], pct)
    _add_result(
        db, scenarios["a"].id, schemes["gold"], "8",
        proxied=True, basis="asset_class_average:Gold",
    )

    for scenario_key, pcts in {
        "b": {"large": "-20", "flexi": "-10", "debt": "2", "gold": "4"},
        "b1": {"large": "-17", "flexi": "-8", "debt": "1.5", "gold": "3"},
        "b2": {"large": "-3", "flexi": "-2", "debt": "0.5", "gold": "1"},
    }.items():
        for key, pct in pcts.items():
            _add_result(
                db, scenarios[scenario_key].id, schemes[key], pct,
                proxied=key == "gold",
                basis="asset_class_average:Gold" if key == "gold" else None,
            )

    for key, pct in {"large": "-10", "flexi": "-8", "debt": "1", "gold": "2"}.items():
        _add_result(db, scenarios["c"].id, schemes[key], pct)

    # The compute job persists an explicit no-data row for every active scheme.
    for scheme in schemes.values():
        _add_result(
            db, scenarios["d"].id, scheme, None,
            proxied=True, basis="no_comparable_data",
        )

    _add_result(db, scenarios["e"].id, schemes["large"], "-1")


def _add_benchmark(db, on: date, value: str) -> None:
    identity = (BenchmarkIndex.NIFTY_50, on, BenchmarkReturnType.TRI)
    if db.get(BenchmarkIndexHistory, identity) is None:
        db.add(BenchmarkIndexHistory(
            index_name=BenchmarkIndex.NIFTY_50,
            date=on,
            return_type=BenchmarkReturnType.TRI,
            value=Decimal(value),
        ))


def build_planning_fixture(*, variant: str = "base") -> HomeFixtureRuntime:
    runtime = build_home_fixture(variant=variant)
    override = runtime.client.app.dependency_overrides[get_db]()
    db = next(override)
    try:
        schemes = _schemes(db)
        scenarios = _scenarios()
        db.add_all(scenarios.values())
        db.flush()
        _seed_results(db, scenarios, schemes)

        # Scenario A mirrors the benchmark rows in the base Home fixture; the
        # empty variant needs the same market data even though it has no folios.
        _add_benchmark(db, date(2025, 10, 31), "10022")
        _add_benchmark(db, date(2025, 12, 31), "10065")
        # Pre-2006 funds lack NAV coverage, but the index history remains useful.
        _add_benchmark(db, date(2004, 12, 31), "1000")
        _add_benchmark(db, date(2005, 6, 30), "1125")
        db.commit()
    finally:
        override.close()
    return runtime
