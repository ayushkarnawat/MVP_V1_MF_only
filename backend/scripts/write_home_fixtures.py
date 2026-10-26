from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.api.home_fixture import FIXED_NOW, WEEKEND_NOW, build_home_fixture


@dataclass(frozen=True)
class FixtureSpec:
    path: str
    variant: str = "base"
    now: datetime = FIXED_NOW


REQUESTS = {
    "summary_family.json": FixtureSpec("/household/aggregate/home/summary"),
    "summary_member.json": FixtureSpec("/household-members/{member_id}/home/summary"),
    "summary_empty.json": FixtureSpec("/household/aggregate/home/summary", "empty"),
    "summary_partial.json": FixtureSpec("/household/aggregate/home/summary", "partial"),
    "summary_weekend.json": FixtureSpec("/household/aggregate/home/summary", now=WEEKEND_NOW),
    "wealth_1d_family.json": FixtureSpec("/household/aggregate/home/wealth-series?period=1D"),
    "wealth_1m_family_benchmark.json": FixtureSpec(
        "/household/aggregate/home/wealth-series?period=1M&benchmark=nifty_50"
    ),
    "wealth_1y_member_clipped.json": FixtureSpec(
        "/household-members/{member_id}/home/wealth-series?period=1Y&benchmark=nifty_smallcap_250"
    ),
    "wealth_custom_empty_range.json": FixtureSpec(
        "/household/aggregate/home/wealth-series?period=custom&from=2016-01-01&to=2016-12-31"
    ),
    "wealth_partial.json": FixtureSpec(
        "/household/aggregate/home/wealth-series?period=1M", "partial"
    ),
    # Added by the independent review (register C101): the cases that were wrong before the fix.
    "wealth_1m_fund_sold_in_period.json": FixtureSpec(
        "/household/aggregate/home/wealth-series?period=1M", "sold_fund"
    ),
    "wealth_custom_past_range.json": FixtureSpec(
        "/household/aggregate/home/wealth-series?period=custom&from=2026-09-20&to=2026-10-01"
    ),
    "wealth_1m_statement_priced_fund.json": FixtureSpec(
        "/household/aggregate/home/wealth-series?period=1M", "cas_only"
    ),
    "summary_statement_priced_fund.json": FixtureSpec("/household/aggregate/home/summary", "cas_only"),
    "allocation_family.json": FixtureSpec("/household/aggregate/home/allocation"),
    "allocation_member.json": FixtureSpec("/household-members/{member_id}/home/allocation"),
    "allocation_fallback.json": FixtureSpec("/household/aggregate/home/allocation", "no_sections"),
    "allocation_empty.json": FixtureSpec("/household/aggregate/home/allocation", "empty"),
    "movers_sector.json": FixtureSpec("/household/aggregate/home/movers?by=sector"),
    "movers_category_fallback.json": FixtureSpec(
        "/household/aggregate/home/movers?by=sector", "no_disclosures"
    ),
    "movers_fund.json": FixtureSpec("/household/aggregate/home/movers?by=fund"),
    "movers_all_down.json": FixtureSpec("/household/aggregate/home/movers?by=fund", "all_down"),
    "movers_empty.json": FixtureSpec("/household/aggregate/home/movers?by=fund", "empty"),
    "worth_three_cards.json": FixtureSpec("/household/aggregate/home/worth-a-look"),
    "worth_none.json": FixtureSpec("/household/aggregate/home/worth-a-look", "nothing_flagged"),
    "worth_unavailable.json": FixtureSpec("/household/aggregate/home/worth-a-look", "no_sections"),
    "worth_concentration_with_earlier.json": FixtureSpec(
        "/household/aggregate/home/worth-a-look", "earlier"
    ),
    "benchmarks_family.json": FixtureSpec("/household/aggregate/home/benchmarks"),
    "benchmarks_no_mix.json": FixtureSpec(
        "/household-members/{member_id}/home/benchmarks", "no_sections"
    ),
}


def write_fixture_set(destination: Path, *, write: bool = True) -> dict[str, dict]:
    if write:
        destination.mkdir(parents=True, exist_ok=True)
    written = {}
    for filename, spec in REQUESTS.items():
        runtime = build_home_fixture(variant=spec.variant, now=spec.now)
        try:
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
    destination = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "home"
    write_fixture_set(destination)
    print(f"wrote {len(REQUESTS)} Home fixtures to {destination}")


if __name__ == "__main__":
    main()
