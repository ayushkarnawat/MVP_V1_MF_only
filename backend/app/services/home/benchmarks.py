from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from sqlalchemy.orm import Session

from app.models.enums import BenchmarkIndex
from app.services.home.stored import load_fresh_sections, scope_key_for


SMALL_HEAVY_PCT = Decimal("35")
MID_HEAVY_PCT = Decimal("50")
LARGE_HEAVY_PCT = Decimal("65")
LARGE_MID_COMBINED_PCT = Decimal("85")
LARGE_MID_MIN_BUCKET_PCT = Decimal("20")
HUNDRED = Decimal("100")


@dataclass(frozen=True)
class BenchmarkOption:
    index: BenchmarkIndex
    label: str


HOME_BENCHMARKS: tuple[BenchmarkOption, ...] = (
    BenchmarkOption(BenchmarkIndex.NIFTY_50, "Nifty 50"),
    BenchmarkOption(BenchmarkIndex.NIFTY_500, "Nifty 500"),
    BenchmarkOption(BenchmarkIndex.NIFTY_LARGEMIDCAP_250, "Nifty LargeMidcap 250"),
    BenchmarkOption(BenchmarkIndex.NIFTY_MIDCAP_150, "Nifty Midcap 150"),
    BenchmarkOption(BenchmarkIndex.NIFTY_SMALLCAP_250, "Nifty Smallcap 250"),
)


@dataclass(frozen=True)
class Recommendation:
    index: BenchmarkIndex
    reason: Literal[
        "large_cap_heavy",
        "large_and_mid",
        "mid_heavy",
        "small_heavy",
        "broad_mixed",
        "unavailable",
    ]


def recommend_benchmark(cap_mix: Mapping[str, Decimal] | None) -> Recommendation:
    if cap_mix is None:
        return Recommendation(BenchmarkIndex.NIFTY_500, "unavailable")
    large = cap_mix.get("LARGE", Decimal("0"))
    mid = cap_mix.get("MID", Decimal("0"))
    small = cap_mix.get("SMALL", Decimal("0"))
    total = large + mid + small
    if total <= 0:
        return Recommendation(BenchmarkIndex.NIFTY_500, "unavailable")
    large = large / total * HUNDRED
    mid = mid / total * HUNDRED
    small = small / total * HUNDRED
    if small >= SMALL_HEAVY_PCT:
        return Recommendation(BenchmarkIndex.NIFTY_SMALLCAP_250, "small_heavy")
    if mid >= MID_HEAVY_PCT:
        return Recommendation(BenchmarkIndex.NIFTY_MIDCAP_150, "mid_heavy")
    if large >= LARGE_HEAVY_PCT:
        return Recommendation(BenchmarkIndex.NIFTY_50, "large_cap_heavy")
    if (
        large + mid >= LARGE_MID_COMBINED_PCT
        and large >= LARGE_MID_MIN_BUCKET_PCT
        and mid >= LARGE_MID_MIN_BUCKET_PCT
    ):
        return Recommendation(BenchmarkIndex.NIFTY_LARGEMIDCAP_250, "large_and_mid")
    return Recommendation(BenchmarkIndex.NIFTY_500, "broad_mixed")


def load_cap_mix(
    db: Session,
    user_id: uuid.UUID,
    *,
    scope: Literal["aggregate", "member"],
    household_member_ids: Sequence[uuid.UUID],
) -> dict[str, Decimal] | None:
    sections = load_fresh_sections(
        db,
        user_id,
        scope_key=scope_key_for(scope, household_member_ids),
        sections=["cap_allocation"],
        household_member_ids=household_member_ids,
    )
    section = sections.get("cap_allocation")
    if section is None or section.payload.get("hide_headlines"):
        return None
    cap_mix = {
        row["key"]: Decimal(row["percentage_equity"])
        for row in section.payload.get("buckets", [])
        if row.get("key") in {"LARGE", "MID", "SMALL"}
    }
    return cap_mix if set(cap_mix) == {"LARGE", "MID", "SMALL"} else None
