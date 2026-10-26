from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class FundModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Unavailable(FundModel):
    status: Literal["unavailable"] = "unavailable"
    reason: str


def plain(value: Decimal, places: int) -> str:
    """Quantize to `places` decimals, HALF_UP, string form -- never a
    negative-zero string (`-0.0000`/`-0.00`)."""
    quantized = value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    if quantized == 0:
        quantized = abs(quantized)
    return format(quantized, "f")
