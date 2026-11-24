from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class PassRoute:
    scope_in: Literal["query", "path", "none"]
    scope_name: str | None
    pass_safe: bool


# Holdings/allocation may fill idempotent NAV rows and the shared holdings cache.
# SIPs read stored data. Snapshots and analytics have explicit stored-only guards.
# Home reads stored prices and may fill the shared in-process holdings cache.
# Names come from the fragment; member management is deliberately excluded.
PASS_READ_ROUTES: dict[str, PassRoute] = {
    "/household/aggregate/holdings": PassRoute("none", None, True),
    "/household-members/{member_id}/holdings": PassRoute("path", "member_id", True),
    "/household/aggregate/allocation": PassRoute("none", None, True),
    "/household-members/{member_id}/allocation": PassRoute("path", "member_id", True),
    "/household/aggregate/sips": PassRoute("none", None, True),
    "/household-members/{member_id}/sips": PassRoute("path", "member_id", True),
    "/household/aggregate/snapshots": PassRoute("none", None, True),
    "/household-members/{member_id}/snapshots": PassRoute("path", "member_id", True),
    "/analytics/{scope}": PassRoute("path", "scope", True),
    "/household/aggregate/home/benchmarks": PassRoute("none", None, True),
    "/household-members/{member_id}/home/benchmarks": PassRoute("path", "member_id", True),
    "/household/aggregate/home/wealth-series": PassRoute("none", None, True),
    "/household-members/{member_id}/home/wealth-series": PassRoute("path", "member_id", True),
}
