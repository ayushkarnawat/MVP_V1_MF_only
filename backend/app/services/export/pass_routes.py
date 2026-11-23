from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class PassRoute:
    scope_in: Literal["query", "path", "none"]
    scope_name: str | None
    pass_safe: bool


# I-5/I-6 add real print routes and document any public-reference cache writes.
# User-owned result replacement and job dispatch require a pass-safe guard first.
# Tests inject their own routes; no production route accepts a pass yet.
PASS_READ_ROUTES: dict[str, PassRoute] = {}
