from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.api.home_fixture import FIXED_NOW, build_home_fixture


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
