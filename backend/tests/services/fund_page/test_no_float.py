"""D-money guard: app/services/fund_page/** and app/api/fund_page.py must
stay Decimal-only. tokenize (not a text grep) so a docstring/comment that
merely *mentions* a decimal (e.g. "quantize to 0.01") is never a false
positive -- only real `float` names and real float-literal tokens count."""
from __future__ import annotations

import ast
import io
import tokenize
from decimal import Decimal
from pathlib import Path

from app.services.fund_page.schemas import plain

BACKEND_ROOT = Path(__file__).resolve().parents[3]
FUND_PAGE_FILES = [
    *sorted((BACKEND_ROOT / "app/services/fund_page").rglob("*.py")),
    BACKEND_ROOT / "app/api/fund_page.py",
]


def _violations(path: Path) -> list[str]:
    tokens = tokenize.generate_tokens(io.StringIO(path.read_text()).readline)
    violations = []
    for tok in tokens:
        if tok.type == tokenize.NAME and tok.string == "float":
            violations.append(f"{path.name}:{tok.start[0]}: bare `float`")
        elif tok.type == tokenize.NUMBER and isinstance(ast.literal_eval(tok.string), float):
            violations.append(f"{path.name}:{tok.start[0]}: float literal {tok.string!r}")
    return violations


def test_fund_page_has_no_float_usage():
    violations = [v for path in FUND_PAGE_FILES for v in _violations(path)]
    assert violations == []


def test_plain_never_returns_negative_zero():
    assert plain(Decimal("-0.00001"), 4) == "0.0000"
