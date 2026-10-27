"""Handoff section 3: no `float` in the news package or its route. Money,
percentages and exposures are Decimal; ranking uses tiers, timestamps and ids
only. A word-boundary grep (comments included) keeps a stray float, even as a
type annotation, from creeping back in."""

import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[3]
NEWS_FILES = [*(BACKEND / "app" / "services" / "news").glob("*.py"), BACKEND / "app" / "api" / "home_news.py", BACKEND / "app" / "models" / "news.py"]
FLOAT = re.compile(r"\bfloat\b", re.IGNORECASE)


def test_news_code_has_no_float():
    assert NEWS_FILES, "news files not found; the glob is wrong"
    offenders = [
        f"{path.relative_to(BACKEND)}:{number}: {line.strip()}"
        for path in NEWS_FILES
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if FLOAT.search(line)
    ]
    assert not offenders, offenders
