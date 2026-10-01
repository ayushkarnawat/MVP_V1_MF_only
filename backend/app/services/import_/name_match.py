"""Name comparison and validation for CAS member detection.

Names are never used to *identify* a person across accounts (PAN HMAC does
that); they only find Me, label people, place no-PAN folios and decide renames.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

NameMatch = Literal["exact", "variant", "mismatch"]

HONORIFICS = {"MR", "MRS", "MS", "MISS", "DR", "SHRI", "SMT", "KUM", "MASTER", "LATE"}
WEAK = {"KUMAR", "KUMARI", "DEVI", "BAI", "BHAI", "BEN", "BEGUM"}

# iOS/macOS smart punctuation types D’Souza with U+2019 (or U+2018): treat as '.
_CURLY_APOSTROPHES = str.maketrans({"’": "'", "‘": "'"})
_SEPARATORS_RE = re.compile(r"[.,'\-]")
_VALID_CHARS_RE = re.compile(r"^[A-Za-z .']+$")

_MIN_LEN, _MAX_LEN = 2, 85
_MSG_EMPTY = "Enter your name as per PAN."
_MSG_CHARS = "Use letters, spaces, dots and apostrophes only."
_MSG_LENGTH = "Name must be 2 to 85 characters."


@dataclass(frozen=True)
class NameComparison:
    result: NameMatch
    shared: tuple[str, ...]
    reason: str


class InvalidPersonNameError(ValueError):
    code = "invalid_name"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NameNotEditableError(InvalidPersonNameError):
    """2026-10-01 rule: names come from the CAS. Typing a different name for a
    person the statement already names is refused (only U9 `needs_name`
    people may be named by hand, decision QB)."""

    code = "name_not_editable"


def normalise_name(name: str) -> list[str]:
    cleaned = _SEPARATORS_RE.sub(" ", name.translate(_CURLY_APOSTROPHES).upper())
    return [t for t in cleaned.split() if t not in HONORIFICS]


def _edit_distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _same_token(a: str, b: str) -> bool:
    if a == b:
        return True
    # An initial matches any token it prefixes ("A" ~ "AYUSH").
    if (len(a) == 1 and b.startswith(a)) or (len(b) == 1 and a.startswith(b)):
        return True
    # Spelling variants only for longer tokens; short ones would over-match.
    return len(a) >= 5 and len(b) >= 5 and _edit_distance(a, b) <= 1


def _is_full(a: str, b: str) -> bool:
    return len(a) > 1 and len(b) > 1 and a not in WEAK and b not in WEAK


def _match_all(short: list[str], long: list[str]) -> list[tuple[str, str]] | None:
    """Assign every token of `short` to a distinct token of `long` (backtracking;
    names are a handful of tokens, so this is cheap)."""
    used: set[int] = set()
    pairs: list[tuple[str, str]] = []

    def go(i: int) -> bool:
        if i == len(short):
            return True
        for j, tok in enumerate(long):
            if j not in used and _same_token(short[i], tok):
                used.add(j)
                pairs.append((short[i], tok))
                if go(i + 1):
                    return True
                pairs.pop()
                used.discard(j)
        return False

    return pairs if go(0) else None


def compare_names(a: str, b: str) -> NameComparison:
    ta, tb = normalise_name(a), normalise_name(b)
    if not ta or not tb:
        return NameComparison("mismatch", (), "empty name")
    if sorted(ta) == sorted(tb):
        return NameComparison("exact", tuple(sorted(ta)), "same tokens")
    short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    pairs = _match_all(short, long_)
    if pairs is None:
        return NameComparison("mismatch", (), "tokens do not line up")
    if not any(_is_full(x, y) for x, y in pairs):
        return NameComparison("mismatch", (), "only initials or weak tokens shared")
    return NameComparison("variant", tuple(y for _, y in pairs), "shorter name contained in longer")


def has_more_tokens(statement_name: str, current_name: str) -> bool:
    return len(normalise_name(statement_name)) > len(normalise_name(current_name))


def validate_person_name(raw: str) -> str:
    name = " ".join(raw.translate(_CURLY_APOSTROPHES).split())
    if not name:
        raise InvalidPersonNameError(_MSG_EMPTY)
    # A string of only dots/apostrophes ("..") passes the charset but is not a name.
    if not _VALID_CHARS_RE.match(name) or not any(c.isalpha() for c in name):
        raise InvalidPersonNameError(_MSG_CHARS)
    if not _MIN_LEN <= len(name) <= _MAX_LEN:
        raise InvalidPersonNameError(_MSG_LENGTH)
    return name
