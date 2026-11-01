"""Read explicit benchmark declarations inside a known house's scheme page.

Heading rules are reused from the existing house readers. A page with multiple
schemes is never attached to one scheme by text-stream proximity. Positional
houses require boxes; absent/ambiguous geometry leaves the stored mapping alone.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
import inspect
import logging
import re

from app.services.analytics.fund_manager_layouts import LAYOUTS, SchemePage, Word, _position_lines

logger = logging.getLogger(__name__)
NEEDS_BOXES = frozenset({"whiteoak", "uti", "groww", "franklin"})
_LABEL = re.compile(r"^\s*[#*]*(?:(?:AMFI\s+)?Tier\s*(?:I|1)\s+|First\s+Tier\s+|Scheme\s+)?Benchmark(?:\s+(?:Name|Index))?\s*[:–-]?\s*(.*)$", re.I)
_EXTRA = re.compile(r"^\s*[#*]*(?:Additional|Addl\.?)\s*(?:Benchmark)(?:\s+Index)?\s*[:–-]?\s*(.*)$", re.I)
_START = re.compile(r"^(?:NIFTY|S&P|BSE|CRISIL|Domestic|Gold|Silver|MSCI|NASDAQ|FTSE|SENSEX|\d+(?:\.\d+)?\s*%)(?:\b|(?<=%))", re.I)
_STOP = re.compile(r"^(?:NAV|FUND|MANAGER|MONTH|MINIMUM|ALLOTMENT|DATE|INCEPTION|EXIT|ENTRY|LOAD|AUM|TOTAL|SCHEME|RISK|RETURNS?|PERFORMANCE|REGULAR|DIRECT|AS ON|MR\.|MS\.|TRACKING|INVESTMENT|EXPENSE|OPTION|TYPE|PORTFOLIO)", re.I)


@dataclass(frozen=True)
class BenchmarkReading:
    heading: str
    tier1_name: str
    additional_name: str | None = None
    tracked_index_name: str | None = None
    tier2_name: str | None = None
    printed_return_1y: Decimal | None = None
    printed_return_3y: Decimal | None = None
    printed_return_5y: Decimal | None = None
    printed_as_of: date | None = None


def mapping_age_days(row, today: date) -> int:
    return max(0, (today - row.verified_on).days)


def _name(lines: list[str], start: str, offset: int) -> str | None:
    collected = [start.strip()] if start.strip() else []
    for next_line in lines[offset:offset + 7]:
        line = next_line.strip()
        if not line:
            continue
        if _STOP.match(line) or _LABEL.match(line) or _EXTRA.match(line):
            break
        continues_blend = re.match(r"^(?:\(?\d+(?:\.\d+)?\s*%|\+|&)", line)
        if collected and not continues_blend and re.search(r"(?:TRI\)?|Index)\s*(?:\(Tier 1\))?$", collected[-1], re.I) and not re.search(r"[%+]", " ".join(collected)):
            break
        collected.append(line)
    text = " ".join(collected).strip()
    # SBI/Axis performance rows put numbers after the declared name. Never
    # mistake a SIP value for a return (printed returns have a separate reader).
    text = re.split(r"(?<=TRI)\)?\s+(?=(?:NA|N/A|[+-]?\d+(?:\.\d+)?(?:%|\s)))", text, maxsplit=1)[0]
    text = re.sub(r"\s*\(Tier 1\)\s*$", "", text, flags=re.I).strip()
    return text if _START.match(text) else None


def _text_block(text: str) -> tuple[str | None, str | None]:
    lines = text.splitlines()
    primary, additional = [], []
    for i, line in enumerate(lines):
        extra = _EXTRA.match(line)
        label = _LABEL.match(line)
        match = extra or label
        if match:
            name = _name(lines, match[1], i + 1)
            if name:
                (additional if extra else primary).append(name)
    # Some houses explicitly suffix the label rather than prefixing it.
    if not primary:
        for line in lines:
            match = re.match(r"^(.+?)\s*\(Benchmark\)", line, re.I)
            if match and _START.match(match[1]):
                primary.append(match[1].strip())
    distinct = list(dict.fromkeys(primary))
    return (distinct[0] if len(distinct) == 1 else None,
            additional[0] if len(set(additional)) == 1 and additional else None)


def benchmark_block(layout: str, text: str, words: list[Word] | None) -> tuple[str | None, str | None]:
    if layout not in NEEDS_BOXES:
        return _text_block(text)
    if not words:
        return None, None
    # WhiteOak, UTI and Groww: UNVERIFIED against real geometry. Accept only
    # an unambiguous contiguous same-row label/value run; no guessed column
    # widths or vertical reading order. Owner checks their real PDFs in review.
    # Franklin's left-panel width (132 points) is the existing real-box reader's
    # boundary; benchmark values are immediately below its label.
    blocks = []
    lines = _position_lines(words)
    for i, line in enumerate(lines):
        labels = [w for w in line if w[4].casefold().rstrip(":") == "benchmark"]
        for label in labels:
            left = label[0] - 2
            contiguous = [label]
            for word in sorted((w for w in line if w[0] >= label[2]), key=lambda w: w[0]):
                if word[0] - contiguous[-1][2] > 4 * (label[3] - label[1]):
                    break
                contiguous.append(word)
            if layout == "franklin":
                right = max(left + 132, contiguous[-1][2] + 1)
                panel = [w for w in words if left <= w[0] < right and label[1] - 65 < w[1] <= label[3]]
            else:
                if len(contiguous) == 1:
                    if layout != "whiteoak":
                        continue
                    # Real WhiteOak pages (checked 1 Nov on the 31 Aug 2026 file): the name is the single
                    # line directly above its lone "Benchmark" label, same left edge, 10 to 16 points up.
                    above = [w for w in words if label[0] - 3 <= w[0] < label[0] + 130
                             and label[1] - 16 <= w[1] <= label[1] - 8 and w[3] <= label[1] + 1]
                    if not above:
                        continue
                    top = max(w[1] for w in above)
                    panel = [w for w in above if abs(w[1] - top) < 3]
                else:
                    panel = contiguous
            block = "\n".join(" ".join(w[4] for w in row) for row in _position_lines(panel))
            if layout == "whiteoak" and len(contiguous) == 1:
                block = f"Benchmark: {block}"  # the label sits below the name on this layout
            found = _text_block(block)
            if found[0]:
                # Two nearby unweighted names are ambiguous, not a blend.
                if "%" not in found[0] and len(re.findall(r"\b(?:Nifty|BSE|CRISIL|MSCI|NASDAQ|FTSE)\b", found[0], re.I)) > 1:
                    continue
                blocks.append(found)
    return blocks[0] if len(set(blocks)) == 1 else (None, None)


def read_benchmarks(layout: str, pages, boxes=None) -> list[BenchmarkReading]:
    reader = LAYOUTS.get(layout)
    if reader is None:
        return []
    result = []
    for i, text in enumerate(pages):
        words = boxes[i] if boxes is not None and i < len(boxes) else None
        found = reader(text, words) if len(inspect.signature(reader).parameters) > 1 else reader(text)
        schemes = [found] if isinstance(found, SchemePage) else found or []
        if len(schemes) != 1:
            # Multi-scheme summaries require proven per-block boundaries. Do
            # not spread one page's benchmark across every named fund.
            continue
        primary, additional = benchmark_block(layout, text, words)
        if not primary:
            continue
        tracking = re.finditer(r"(?:replicating\s*/?\s*tracking|tracking|replicating)\s+(?:the\s+)?(.+?)(?:[.)\n]|$)", text, re.I)
        tracked_name = next((m[1].strip() for m in tracking if _START.match(m[1])), None)
        secondary = None
        for j, line in enumerate(text.splitlines()):
            tier2 = re.match(r"^\s*Tier\s*(?:II|2)\s+Benchmark(?: Index)?\s*[:–-]?\s*(.*)", line, re.I)
            if tier2:
                secondary = _name(text.splitlines(), tier2[1], j + 1)
                break
        printed = read_printed_returns(text, primary)
        result.append(BenchmarkReading(schemes[0].heading, primary, additional, tracked_name,
                                       secondary, *printed))
    return result


def read_printed_returns(text: str, declared: str):
    """Fail closed unless the printed period order and benchmark row are clear.

    Verified Axis excerpt: 'Period / 1 Year 3 Years 5 Years Since Inception',
    then 'BSE 100 TRI (Benchmark) 1.99% 10,200 10.58% 13,526 9.63% ...'.
    Investment amounts are ignored. SIP tables and other column orders are
    not inferred; those house layouts need their own verified table reader.
    """
    empty = (None, None, None, None)
    header = re.search(r"\bPeriod\s+1 Year\s+3 Years\s+5 Years\s+Since Inception", text, re.I)
    if not header:
        return empty
    after = text[header.end():]
    # Limit to this table; never continue into a later SIP-performance table.
    after = re.split(r"SIP Performance|Past performance", after, maxsplit=1, flags=re.I)[0]
    pattern = re.compile(r"^" + re.escape(declared) + r"\s*\(Benchmark\)\s+(.+)$", re.I | re.M)
    readings = []
    for match in pattern.finditer(after):
        numbers = re.findall(r"(?<![A-Za-z0-9])(?:NA|N/A|[-+]?\d+(?:\.\d+)?%)", match[1], re.I)
        if len(numbers) < 3:
            continue
        readings.append(tuple(None if n.upper() in {"NA", "N/A"} else Decimal(n.rstrip("%")) for n in numbers[:3]))
    if not readings or len(set(readings)) != 1:
        return empty
    from app.services.analytics.amfi_factsheet_client import _latest_as_on
    as_of = _latest_as_on([text], date.today())
    return (*readings[0], as_of) if as_of else empty
