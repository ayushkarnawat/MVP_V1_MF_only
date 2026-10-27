from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.api.planning_fixture import SCENARIO_IDS, build_planning_fixture


@dataclass(frozen=True)
class FixtureSpec:
    path: str
    variant: str = "base"


REQUESTS = {
    "scenarios_list_curated.json": FixtureSpec("/scenarios?curated=true"),
    "results_family_standard.json": FixtureSpec("/scenarios/{a}/results"),
    "results_member_dev.json": FixtureSpec("/scenarios/{a}/results?member_id={dev}"),
    "results_family_multi_phase.json": FixtureSpec("/scenarios/{b}/results"),
    "results_family_freeze.json": FixtureSpec("/scenarios/{c}/results"),
    "results_family_no_fund_data.json": FixtureSpec("/scenarios/{d}/results"),
    "results_family_no_holdings.json": FixtureSpec("/scenarios/{a}/results", "empty"),
}


def write_fixture_set(destination: Path, *, write: bool = True) -> dict[str, object]:
    if write:
        destination.mkdir(parents=True, exist_ok=True)
    generated = {}
    for filename, spec in REQUESTS.items():
        runtime = build_planning_fixture(variant=spec.variant)
        try:
            path = spec.path.format(
                a=SCENARIO_IDS["a"],
                b=SCENARIO_IDS["b"],
                c=SCENARIO_IDS["c"],
                d=SCENARIO_IDS["d"],
                asha=runtime.household.asha_id,
                dev=runtime.household.dev_id,
            )
            response = runtime.client.get(path)
            if response.status_code != 200:
                raise RuntimeError(f"{path}: {response.status_code} {response.text}")
            payload = response.json()
            fixture_path = destination / filename
            rendered = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
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
    destination = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "planning"
    write_fixture_set(destination)
    print(f"wrote {len(REQUESTS)} Planning fixtures to {destination}")


if __name__ == "__main__":
    main()
