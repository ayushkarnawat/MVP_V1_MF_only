from __future__ import annotations

import json
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.api.home_fixture import FIXED_NOW, build_home_fixture


@contextmanager
def pinned_xirr_clock(day: date):
    """Make the Dashboard XIRR module's `date.today()` return `day`.

    The Dashboard XIRR (reused by Portfolio and deliberately left unchanged) ends its cash flows at the real
    `date.today()`, while every other Portfolio input follows the injected clock. Without this pin the golden
    XIRR strings drift every calendar day and the golden-fixture test goes red with no code change (review H1).
    Only the XIRR module needs the pin: holdings and nav read the real date only through "on or before" price
    lookups, which return the same rows for any real date after the fixture's clock (re-review L7).
    """

    class _PinnedDate(date):
        @classmethod
        def today(cls):
            return day

    with patch("app.services.dashboard.xirr.date", _PinnedDate):
        yield


@dataclass(frozen=True)
class FixtureSpec:
    path: str
    variant: str = "base"
    now: datetime = FIXED_NOW


REQUESTS = {
    "allocation_family.json": FixtureSpec("/household/aggregate/portfolio-allocation"),
    "allocation_member.json": FixtureSpec("/household-members/{member_id}/portfolio-allocation"),
    "allocation_empty.json": FixtureSpec("/household/aggregate/portfolio-allocation", "empty"),
    "summary_family.json": FixtureSpec("/household/aggregate/portfolio-summary"),
    "summary_member.json": FixtureSpec("/household-members/{member_id}/portfolio-summary"),
    "summary_empty.json": FixtureSpec("/household/aggregate/portfolio-summary", "empty"),
    "summary_partial.json": FixtureSpec("/household/aggregate/portfolio-summary", "partial"),
    "series_family_30d.json": FixtureSpec("/household/aggregate/portfolio-value-series?days=30"),
    "series_member_30d.json": FixtureSpec(
        "/household-members/{member_id}/portfolio-value-series?days=30"
    ),
    "series_empty.json": FixtureSpec("/household/aggregate/portfolio-value-series?days=30", "empty"),
}


def write_fixture_set(destination: Path, *, write: bool = True) -> dict[str, dict]:
    if write:
        destination.mkdir(parents=True, exist_ok=True)
    written = {}
    for filename, spec in REQUESTS.items():
        runtime = build_home_fixture(variant=spec.variant, now=spec.now)
        try:
            path = spec.path.format(member_id=runtime.household.dev_id)
            with pinned_xirr_clock(spec.now.date()):
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
    print(f"wrote {len(REQUESTS)} Portfolio fixtures to {destination}")


if __name__ == "__main__":
    main()
