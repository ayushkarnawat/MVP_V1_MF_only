from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.reference import NavHistory
from app.services.dashboard.holdings import _holdings_cache
from tests.api.home_fixture import FIXED_NOW, build_home_fixture


@dataclass(frozen=True)
class FixtureSpec:
    path: str
    variant: str = "base"
    now: datetime = FIXED_NOW
    sips: bool = True
    drop_all_prices: bool = False


REQUESTS = {
    "insights_family.json": FixtureSpec("/household/aggregate/portfolio-insights"),
    "insights_member.json": FixtureSpec("/household-members/{member_id}/portfolio-insights"),
    "insights_empty.json": FixtureSpec("/household/aggregate/portfolio-insights", "empty", sips=False),
    "insights_partial.json": FixtureSpec("/household/aggregate/portfolio-insights", "partial"),
    "insights_no_sips.json": FixtureSpec("/household/aggregate/portfolio-insights", sips=False),
    # Holdings exist but no fund has a stored price: every NAV row is removed.
    "insights_no_prices.json": FixtureSpec(
        "/household/aggregate/portfolio-insights", sips=False, drop_all_prices=True,
    ),
}


def _build(spec: FixtureSpec):
    # Imported here: the route tests import this module, and they own the SIP seeding helper.
    from tests.api.test_portfolio_insights_routes import seed_insight_sips

    runtime = build_home_fixture(variant=spec.variant, now=spec.now)
    if spec.sips and spec.variant != "empty":
        seed_insight_sips(runtime)
    if spec.drop_all_prices:
        from app.db.session import get_db

        db = next(runtime.client.app.dependency_overrides[get_db]())
        db.query(NavHistory).delete()
        db.commit()
        db.close()
        _holdings_cache.clear()
    return runtime


def write_fixture_set(destination: Path, *, write: bool = True) -> dict[str, dict]:
    if write:
        destination.mkdir(parents=True, exist_ok=True)
    written = {}
    for filename, spec in REQUESTS.items():
        runtime = _build(spec)
        try:
            # The member fixture is Dev (two parallel SIP twins), the same member the Portfolio fixtures use.
            path = spec.path.format(member_id=runtime.household.dev_id)
            response = runtime.client.get(path)
            if response.status_code != 200:
                raise RuntimeError(f"{path}: {response.status_code} {response.text}")
            payload = response.json()
            fixture_path = destination / filename
            rendered = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
            if write and (
                not fixture_path.exists() or fixture_path.read_text(encoding="utf-8") != rendered
            ):
                fixture_path.write_text(rendered, encoding="utf-8", newline="\n")
            written[filename] = payload
        finally:
            runtime.close()
    return written


def main() -> None:
    destination = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "portfolio"
    write_fixture_set(destination)
    print(f"wrote {len(REQUESTS)} Portfolio insights fixtures to {destination}")


if __name__ == "__main__":
    main()
