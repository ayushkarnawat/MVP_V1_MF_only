from __future__ import annotations

import argparse
import asyncio
import shutil
import sys
import tempfile
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.home import get_now_ist
from app.core.decimal_utils import quantize_amount
from app.db.session import get_db
from app.main import app
from app.models.user import HouseholdMember, User
from app.services.auth.session import get_active_user
from app.services.dashboard.holdings import _holdings_cache, compute_holdings
from scripts.home_synthetic_gate import FRIDAY, MONDAY, ScenarioResult, _mutate, _sha256


SCENARIOS = (
    "base", "member_rohan", "member_priya", "weekend",
    "partial_data", "one_fund_only", "all_funds_down", "no_holdings",
)


def _run_scenario(source: Path, temp_dir: Path, scenario: str) -> ScenarioResult:
    copy = temp_dir / f"{scenario}.db"
    shutil.copy2(source, copy)
    engine = create_engine(f"sqlite:///{copy}", connect_args={"check_same_thread": False})
    sessions = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    with sessions() as db:
        _mutate(db, scenario)
        user = db.query(User).one()
        members = (
            db.query(HouseholdMember)
            .filter(HouseholdMember.user_id == user.id)
            .order_by(HouseholdMember.created_at, HouseholdMember.id)
            .all()
        )
        user_id = user.id
        member_ids = [member.id for member in members]

    def override_db():
        with sessions() as session:
            yield session

    now = MONDAY if scenario == "weekend" else FRIDAY
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_active_user] = lambda: SimpleNamespace(id=user_id)
    app.dependency_overrides[get_now_ist] = lambda: now
    _holdings_cache.clear()
    client = TestClient(app)
    if scenario == "member_rohan":
        root = f"/household-members/{member_ids[0]}"
        selected_member_ids = [member_ids[0]]
    elif scenario == "member_priya":
        root = f"/household-members/{member_ids[1]}"
        selected_member_ids = [member_ids[1]]
    else:
        root = "/household/aggregate"
        selected_member_ids = member_ids
    try:
        summary = client.get(f"{root}/portfolio-summary").json()
        allocation = client.get(f"{root}/portfolio-allocation").json()
        series = client.get(f"{root}/portfolio-value-series?days=30").json()
        home_summary = client.get(f"{root}/home/summary").json()
        home_movers = client.get(f"{root}/home/movers?by=fund").json()
        with sessions() as db:
            _holdings_cache.clear()
            rows = asyncio.run(compute_holdings(db, selected_member_ids, allow_stale_today=True))
            direct_total = sum(
                (quantize_amount(Decimal(row.current_value)) for row in rows
                 if row.current_value is not None and not row.nav_unavailable),
                Decimal("0.00"),
            )
        series_last = None if series["empty"] else series["points"][-1]["value"]
        checks = {
            "value_chain": (
                summary["total_value"] == home_summary["total_value"]
                == allocation["buckets"][0]["current_value"]
                == str(direct_total)
                and (series["empty"] or series_last == summary["total_value"])
            ),
            "today_gain_parity": (
                summary["today_gain"] == home_summary["change_amount"]
                and summary["today_pct"] == home_movers["net_pct"]
            ),
            "unrealized_identity": Decimal(summary["unrealized_gain"]) == (
                Decimal(summary["total_value"]) - Decimal(summary["total_invested"])
            ),
        }
        details = {
            "value_chain": (
                f"summary={summary['total_value']} home={home_summary['total_value']} "
                f"allocation={allocation['buckets'][0]['current_value']} "
                f"holdings_row_sum={direct_total} series_last={series_last}"
            ),
            "today_gain_parity": (
                f"today_gain={summary['today_gain']} home_change={home_summary['change_amount']} "
                f"today_pct={summary['today_pct']} home_net_pct={home_movers['net_pct']}"
            ),
            "unrealized_identity": (
                f"unrealized_gain={summary['unrealized_gain']} "
                f"value={summary['total_value']} invested={summary['total_invested']}"
            ),
        }
        lines = tuple(
            f"{scenario} {name}: {'PASS' if passed else 'FAIL'} ({details[name]})"
            for name, passed in checks.items()
        )
        return ScenarioResult(scenario, lines, checks)
    finally:
        client.close()
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_active_user, None)
        app.dependency_overrides.pop(get_now_ist, None)
        _holdings_cache.clear()
        engine.dispose()


def _run_all_scenarios(source: Path, temp_dir: Path, scenarios: tuple[str, ...]) -> list[ScenarioResult]:
    results = []
    for scenario in scenarios:
        try:
            result = _run_scenario(source, temp_dir, scenario)
        except Exception as exc:
            result = ScenarioResult(
                scenario=scenario,
                lines=(f"{scenario} execution: FAIL (error={type(exc).__name__}: {exc})",),
                checks={"execution": False},
            )
        results.append(result)
        for line in result.lines:
            print(line)
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("db_path", type=Path)
    args = parser.parse_args()
    source = args.db_path.resolve()
    before = _sha256(source)
    print(f"source_sha256_before: {before}")
    with tempfile.TemporaryDirectory(prefix="unifolio-portfolio-gate-") as directory:
        results = _run_all_scenarios(source, Path(directory), SCENARIOS)
    after = _sha256(source)
    print(f"source_sha256_after: {after}")
    print("FINAL RESULTS")
    for result in results:
        failed = ",".join(name for name, passed in result.checks.items() if not passed) or "none"
        print(f"{result.scenario}: {'PASS' if result.passed else 'FAIL'} failed_checks={failed}")
    source_unchanged = before == after
    print(f"source_hash: {'PASS' if source_unchanged else 'FAIL'} before={before} after={after}")
    if not source_unchanged or not all(result.passed for result in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
