from __future__ import annotations

import json
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.dashboard.holdings import _holdings_cache, _holdings_cache_generation
from app.services.fund_page.peer_cache import peer_cache
from tests.api.fund_fixture import FIXED_NOW, build_fund_fixture


@contextmanager
def pinned_dashboard_clock(day: date):
    class _PinnedDate(date):
        @classmethod
        def today(cls):
            return day

    with (
        patch("app.services.dashboard.xirr.date", _PinnedDate),
        patch("app.services.dashboard.holdings.date", _PinnedDate),
        patch("app.services.dashboard.nav.date", _PinnedDate),
    ):
        yield


@dataclass(frozen=True)
class FixtureSpec:
    path: str
    variant: str = "base"
    now: datetime = FIXED_NOW


REQUESTS = {
    "summary_family.json": FixtureSpec("/fund-page/{scheme_id}/summary"),
    "summary_member.json": FixtureSpec("/fund-page/{scheme_id}/summary?scope={member_id}"),
    "summary_not_held.json": FixtureSpec(
        "/fund-page/{scheme_id}/summary?scope={member_id}", "not_held_by_member"
    ),
    "summary_cas_only.json": FixtureSpec("/fund-page/{cas_scheme_id}/summary", "cas_only"),
    "folio_number.json": FixtureSpec("/fund-page/{scheme_id}/folios/{folio_id}/number"),
    "performance_1y_equity.json": FixtureSpec("/fund-page/{scheme_id}/performance?period=1Y"),
    "performance_1y_debt_no_benchmark.json": FixtureSpec(
        "/fund-page/{debt_scheme_id}/performance?period=1Y"
    ),
    "performance_all_young_fund.json": FixtureSpec(
        "/fund-page/{young_scheme_id}/performance?period=All"
    ),
    "returns_inception.json": FixtureSpec("/fund-page/{scheme_id}/returns?mode=inception"),
    "returns_current.json": FixtureSpec("/fund-page/{scheme_id}/returns?mode=current"),
    "returns_current_not_held.json": FixtureSpec(
        "/fund-page/{scheme_id}/returns?mode=current&scope={member_id}", "not_held_by_member"
    ),
    "risk_equity.json": FixtureSpec("/fund-page/{scheme_id}/risk"),
    "risk_life_window.json": FixtureSpec("/fund-page/{debt_scheme_id}/risk", "debt_fund"),
    "risk_no_history.json": FixtureSpec("/fund-page/{young_scheme_id}/risk", "young_fund"),
    "composition.json": FixtureSpec("/fund-page/{scheme_id}/portfolio-composition"),
    "composition_no_disclosure.json": FixtureSpec(
        "/fund-page/{scheme_id}/portfolio-composition", "no_disclosure"
    ),
    "holdings_all.json": FixtureSpec("/fund-page/{scheme_id}/holdings"),
    "manager.json": FixtureSpec("/fund-page/{scheme_id}/manager"),
    "manager_none.json": FixtureSpec("/fund-page/{scheme_id}/manager", "no_managers"),
    "score_stored.json": FixtureSpec("/fund-page/{scheme_id}/score"),
    "score_computed.json": FixtureSpec("/fund-page/{scheme_id}/score", "no_sections"),
    "peers_series_1y.json": FixtureSpec("/fund-page/{scheme_id}/peers/series?period=1Y"),
    "peers_returns.json": FixtureSpec("/fund-page/{scheme_id}/peers/returns"),
    "peers_unavailable.json": FixtureSpec("/fund-page/{scheme_id}/peers/returns", "no_peers"),
    "rolling_3y.json": FixtureSpec("/fund-page/{scheme_id}/peers/rolling?window=3"),
    "rolling_no_history.json": FixtureSpec(
        "/fund-page/{young_scheme_id}/peers/rolling?window=3", "young_fund"
    ),
    "period_returns_1y.json": FixtureSpec(
        "/fund-page/{scheme_id}/peers/period-returns?period=1Y"
    ),
    "period_returns_5y.json": FixtureSpec(
        "/fund-page/{scheme_id}/peers/period-returns?period=5Y"
    ),
    "scatter.json": FixtureSpec("/fund-page/{scheme_id}/peers/scatter"),
    "scatter_thin.json": FixtureSpec("/fund-page/{scheme_id}/peers/scatter", "thin_category"),
    "insights_full.json": FixtureSpec("/fund-page/{scheme_id}/insights"),
    "insights_sparse.json": FixtureSpec("/fund-page/{scheme_id}/insights", "no_sections"),
    "overlap_fund.json": FixtureSpec("/fund-page/{scheme_id}/overlap"),
    "overlap_unavailable.json": FixtureSpec(
        "/fund-page/{scheme_id}/overlap", "no_disclosure"
    ),
    "overlap_compare.json": FixtureSpec(
        "/fund-page/{scheme_id}/overlap/{other_scheme_id}"
    ),
}


def _path(spec: FixtureSpec, runtime) -> str:
    return spec.path.format(
        scheme_id=runtime.scheme_id,
        other_scheme_id=runtime.other_scheme_id,
        debt_scheme_id=runtime.debt_scheme_id,
        young_scheme_id=runtime.young_scheme_id,
        cas_scheme_id=runtime.cas_scheme_id,
        member_id=runtime.household.dev_id,
        folio_id=runtime.folio_id,
    )


def write_fixture_set(destination: Path, *, write: bool = True) -> dict[str, dict]:
    if write:
        destination.mkdir(parents=True, exist_ok=True)
    generated = {}
    for filename, spec in REQUESTS.items():
        _holdings_cache.clear()
        _holdings_cache_generation.clear()
        peer_cache.clear()
        runtime = build_fund_fixture(spec.variant, spec.now)
        try:
            path = _path(spec, runtime)
            with pinned_dashboard_clock(spec.now.date()):
                response = runtime.client.get(path)
            if response.status_code != 200:
                raise RuntimeError(f"{path}: {response.status_code} {response.text}")
            payload = response.json()
            rendered = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
            fixture_path = destination / filename
            if write and (
                not fixture_path.exists()
                or fixture_path.read_text(encoding="utf-8") != rendered
            ):
                fixture_path.write_text(rendered, encoding="utf-8", newline="\n")
            generated[filename] = payload
        finally:
            runtime.close()
    return generated


def main() -> None:
    destination = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "fund"
    write_fixture_set(destination)
    print(f"wrote {len(REQUESTS)} fund fixtures to {destination}")


if __name__ == "__main__":
    main()
