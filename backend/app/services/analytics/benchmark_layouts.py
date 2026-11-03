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
# UTI prints "Nifty200 Momentum 30" and "NIFTY50 Equal Weight" with the number straight after the
# family name, and "Price of Gold" as the Gold ETF's benchmark.
_START = re.compile(r"^(?:NIFTY|S&P|BSE|CRISIL|Domestic|Gold|Silver|Price of (?:Gold|Silver)|MSCI|NASDAQ|FTSE|SENSEX|\d+(?:\.\d+)?\s*%)(?:\b|(?<=%)|(?<=NIFTY)(?=\d))", re.I)
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


def unique_words(words: list[Word]) -> list[Word]:
    """Drop exact overlay duplicates (some pages draw the same text twice)."""
    seen, kept = set(), []
    for word in words:
        key = (round(word[0]), round(word[1]), word[4])
        if key not in seen:
            seen.add(key)
            kept.append(word)
    return kept


def row_groups(words: list[Word], tol: float = 3.5) -> list[tuple[float, list[Word]]]:
    """(vertical centre, words left to right), top row first. Rows on these pages are
    at least 7 points apart, but words on one printed row differ by up to 4 points."""
    rows: list[list] = []
    for word in sorted(words, key=lambda w: -(w[1] + w[3]) / 2):
        centre = (word[1] + word[3]) / 2
        if rows and abs(centre - rows[-1][0]) <= tol:
            rows[-1][1].append(word)
        else:
            rows.append([centre, [word]])
    return [(centre, sorted(row, key=lambda w: w[0])) for centre, row in rows]


def _cy(word: Word) -> float:
    return (word[1] + word[3]) / 2


# --- UTI "Fund Watch" and Groww monthly factsheet (checked 3 Nov 2026 against the real
# --- Sept/Oct 2026 files: 83 UTI scheme pages, 62 Groww scheme pages). Both read from
# --- word boxes: UTI's text stream separates labels from values; Groww's wrapped names
# --- are not in reading order in the stream.
_MARKS = "*#^@†‡§¹²³⁰⁴⁵⁶⁷⁸⁹"
_NO_VALUE = {"N.A", "N.A.", "NA", "N/A", "-", "–"}
_UTI_PCT = re.compile(r"-?\d+\.\d{2}")
_UTI_AMOUNT = re.compile(r"\d{1,3}(?:,\d{2,3})*")
_GROWW_PCT = re.compile(r"-?\d+\.\d{4}")
_GROWW_AMOUNT = re.compile(r"\d{1,3}(?:,\d{3})*\.\d{2}")
_UTI_LEFT = 213  # the right-hand tables start at x=215..220 on every checked page


def _same_name(a: str, b: str) -> bool:
    from app.services.analytics.benchmark_names import _canonical
    strip = lambda s: re.sub(r"\((?![^)]*%)[^)]*\)", " ", s)  # remarks like "(based on ...)"; never a weight
    return bool(_canonical(strip(a))) and _canonical(strip(a)) == _canonical(strip(b))


def _ties(ret: Decimal, value: Decimal, years: int) -> bool:
    """The printed 'value of 10,000' must equal compounding the printed return (UTI and
    Groww print both). A shifted column or a misread cell breaks this tie."""
    base = Decimal(1) + ret / 100
    return base > 0 and value > 0 and abs(Decimal(10000) * base ** years / value - 1) < Decimal("0.01")


def _cell(token: str, pct: re.Pattern, amount: re.Pattern, ret: bool) -> Decimal | None | bool:
    """Decimal when the cell is a well-formed number, None when it prints 'no value',
    False when it is anything else (for example a footnote digit glued to the number)."""
    token = token.rstrip(_MARKS)
    if token.upper() in _NO_VALUE:
        return None
    if (pct if ret else amount).fullmatch(token):
        return Decimal(token.replace(",", ""))
    return False


def _printed_triplet(cells: dict[int, tuple[str, str]], pct: re.Pattern, amount: re.Pattern):
    """{years: (return token, value token)} -> (1y, 3y, 5y), all None unless every
    printed return ties to its printed value."""
    out = {1: None, 3: None, 5: None}
    for years, (ret_token, value_token) in cells.items():
        ret, value = _cell(ret_token, pct, amount, True), _cell(value_token, pct, amount, False)
        if ret is False or value is False:
            continue  # one unreadable cell leaves that period empty
        if ret is None or value is None:
            continue
        if not _ties(ret, value, years):
            return (None, None, None)  # misaligned columns: trust none of the table
        out[years] = ret
    return (out[1], out[3], out[5])


def _uti_block(words: list[Word]) -> tuple[str | None, str | None]:
    """Left panel: 'Benchmark Index' label, then the name (one to four rows, blends wrap),
    then the 'Fund Manager' label. Anything else leaves the stored mapping alone."""
    rows = row_groups([w for w in unique_words(words) if w[0] < _UTI_LEFT])
    labels = [i for i, (_, row) in enumerate(rows) if [w[4] for w in row] == ["Benchmark", "Index"] and row[0][0] < 60]
    if len(labels) != 1:
        return None, None
    block, previous = [], rows[labels[0]][0]
    for centre, row in rows[labels[0] + 1:labels[0] + 7]:
        if [w[4] for w in row[:2]] == ["Fund", "Manager"]:
            break
        if previous - centre > 14:
            return None, None
        block.append(row)
        previous = centre
    else:
        return None, None
    text = " ".join(w[4] for row in block for w in row)
    return (text, None) if block and len(block) <= 4 and _START.match(text) else (None, None)


def _uti_returns(text: str, words: list[Word] | None, declared: str):
    """The 'Fund Performance Vs Benchmark (CAGR)' table: Period | Fund % | Benchmark % |
    [Additional % |] value columns. The benchmark column is proven by its own header."""
    empty = ((None, None, None, None), None)
    if not words:
        return empty
    words = unique_words(words)
    titles = [w for w in words if w[4] == "Vs"
              and any(p[4] == "Performance" and 0 <= w[0] - p[2] <= 10 and abs(_cy(p) - _cy(w)) < 6 for p in words)
              and any(b[4] == "Benchmark" and 0 <= b[0] - w[2] <= 10 and abs(_cy(b) - _cy(w)) < 6 for b in words)]
    if len(titles) != 1:
        return empty
    title = titles[0]
    perf = next(p for p in words if p[4] == "Performance" and 0 <= title[0] - p[2] <= 10 and abs(_cy(p) - _cy(title)) < 6)
    fund = [w for w in words if w[4] == "Fund" and 0 <= perf[0] - w[2] <= 12 and abs(_cy(w) - _cy(perf)) < 6]
    if len(fund) != 1:
        return empty
    left = fund[0][0]
    below = row_groups([w for w in words if w[0] >= left - 10 and _cy(w) < _cy(title) - 3])
    first = next((i for i, (_, row) in enumerate(below) if abs(row[0][0] - left) < 12
                  and re.fullmatch(r"\d+|SI\*?|Last", row[0][4])), None)
    if first is None:
        return empty
    header, data = below[:first], []
    for centre, row in below[first:]:
        if abs(row[0][0] - left) >= 12 or not re.fullmatch(r"\d+|SI\*?|Last", row[0][4]):
            break
        data.append(row)
    widths = {len(row) - 2 for row in data if len(row) > 2 and row[1][4] == "Y"}
    cols = max(widths, default=0)
    if cols not in (4, 6):
        return empty
    reference = next((row for row in data if len(row) - 2 == cols and row[1][4] == "Y"), None)
    if reference is None:
        return empty
    k = cols // 2
    centres = [(w[0] + w[2]) / 2 for w in reference[2:]]
    def header_text(j: int) -> str:
        low = (centres[j - 1] + centres[j]) / 2
        high = (centres[j] + centres[j + 1]) / 2
        picked = [w for _, row in header for w in row if low <= (w[0] + w[2]) / 2 < high]
        return " ".join(w[4] for _, row in row_groups(picked) for w in row)
    benchmark_header = re.sub(r"\(%\)", " ", header_text(1)).strip()
    if not (_same_name(benchmark_header, declared) or re.fullmatch(r"Benchmark[@*#^]*", benchmark_header)):
        return empty
    extra = re.sub(r"\([^)]*\)", " ", header_text(2)).strip() if k == 3 else ""
    additional = " ".join(extra.split()) if extra and _START.match(extra) else None
    cells = {}
    for row in data:
        found = re.fullmatch(r"(\d+)", row[0][4])
        if found and int(found[1]) in (1, 3, 5) and len(row) > 1 and row[1][4] == "Y" and len(row) - 2 == cols:
            tokens = [w[4] for w in row[2:]]
            cells[int(found[1])] = (tokens[1], tokens[k + 1])
    stated = re.search(r"Fund Performance Vs Benchmark \(CAGR\) as on ([^\n]+?) Growth of", " ".join(text.split()))
    from app.services.analytics.amfi_factsheet_client import _latest_as_on
    as_of = _latest_as_on(["as on " + stated[1]], date.today()) if stated else None
    triplet = _printed_triplet(cells, _UTI_PCT, _UTI_AMOUNT)
    return ((*triplet, as_of) if as_of else (None, None, None, None)), additional


def _groww_block(words: list[Word]) -> tuple[str | None, str | None]:
    """Snapshot panel: a centred 'BENCHMARK' label, then the name on one to three centred
    rows (7 points apart), then the next label ('PORTFOLIO DETAILS' or similar) 14+ points on."""
    words = [w for w in unique_words(words) if 55 <= w[0] < 185]
    labels = [w for w in words if w[4] == "BENCHMARK" and 85 <= w[0] <= 120]
    if len(labels) != 1:
        return None, None
    label = labels[0]
    rows = [(c, r) for c, r in row_groups([w for w in words if _cy(w) < _cy(label) - 4])]
    block, previous = [], _cy(label)
    for centre, row in rows:
        if previous - centre > (20 if not block else 10):
            break
        block.append(row)
        previous = centre
    text = " ".join(w[4] for row in block for w in row)
    return (text, None) if block and len(block) <= 3 and _START.match(text) else (None, None)


def _groww_returns(text: str, declared: str):
    """Regular and Direct tables share one benchmark column; its 1/3/5 year returns are
    identical across the two plans, so a difference between plans means a misread."""
    empty = ((None, None, None, None), None)
    lines = [line.strip() for line in text.replace("\r", "").split("\n") if line.strip()]
    start = next((i for i, line in enumerate(lines)
                  if re.fullmatch(r"Scheme\s+Benchmark\*\s+Add[a-z]*onal\s+Benchmark\*\*", line)), None)
    if start is None:
        return empty
    gathered: dict[int, set] = {1: set(), 3: set(), 5: set()}
    foot = None
    for line in lines[start + 1:]:
        if line.startswith("*"):
            foot = line
            break
        row = re.fullmatch(r"(?:Last\s+)?(1|3|5)\s+Years?\s+(.+)", line)
        if row:
            tokens = row[2].split()
            if len(tokens) == 6:
                gathered[int(row[1])].add((tokens[2], tokens[3]))
    names = re.fullmatch(r"\*\s*([^*]+?)\s*,?\s*(?:\*\*\s*(.*))?", foot or "")
    if not names or not _same_name(names[1], declared):
        return empty
    additional = None
    if names[2]:
        candidate = re.split(r"\.\s+(?=[A-Z])", names[2].strip())[0].strip(" .,")
        additional = candidate if _START.match(candidate) else None
    cells = {}
    for years, found in gathered.items():
        if len(found) == 1:
            cells[years] = next(iter(found))
        elif len(found) > 1:
            cells[years] = ("x", "x")  # plans disagree: leaves the period empty
    stated = re.search(r"Data as on\s+([^\n.]+\d{4})", text)
    from app.services.analytics.amfi_factsheet_client import _latest_as_on
    as_of = _latest_as_on(["as on " + stated[1]], date.today()) if stated else None
    triplet = _printed_triplet(cells, _GROWW_PCT, _GROWW_AMOUNT)
    return ((*triplet, as_of) if as_of else (None, None, None, None)), additional


def benchmark_block(layout: str, text: str, words: list[Word] | None) -> tuple[str | None, str | None]:
    if layout in ("uti", "groww"):
        if not words:
            return None, None
        return _uti_block(words) if layout == "uti" else _groww_block(words)
    if layout not in NEEDS_BOXES:
        return _text_block(text)
    if not words:
        return None, None
    # WhiteOak and Franklin: accept only
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
        if layout == "uti":
            printed, printed_additional = _uti_returns(text, words, primary)
        elif layout == "groww":
            printed, printed_additional = _groww_returns(text, primary)
        else:
            printed, printed_additional = read_printed_returns(text, primary), None
        result.append(BenchmarkReading(schemes[0].heading, primary, additional or printed_additional,
                                       tracked_name, secondary, *printed))
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
