"""Reported fund P/E and P/B, read only from verified house-specific labels."""
from dataclasses import dataclass, replace
from decimal import Decimal, InvalidOperation
import logging
import re

from app.services.analytics.fund_manager_layouts import Word, _brand_line_heading, _invesco_heading

logger = logging.getLogger(__name__)
NEEDS_BOXES = frozenset({"iti", "kotak"})


@dataclass(frozen=True)
class ValuationReading:
    heading: str
    pe: Decimal | None
    pb: Decimal | None
    pe_basis: str
    pb_basis: str
    method: str
    page: int
    source_file: str = ""


def _value(raw: str | None, metric: str, layout: str, heading: str) -> Decimal | None:
    if raw is None:
        return None
    cleaned = raw.strip().replace(",", "")
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        value = None
    low, high = (Decimal("3"), Decimal("200")) if metric == "pe" else (Decimal("0.2"), Decimal("40"))
    if (value is None or not value.is_finite() or not low <= value <= high
            or not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", cleaned)):
        logger.warning("reported valuation not found layout=%s heading=%r metric=%s value=%r",
                       layout, heading, metric, raw)
        return None
    return value


def _label_value(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text, re.M)
    return match.group(1).strip() if match else None


def _reading(heading, pe, pb, layout, pe_basis="not_stated", pb_basis="not_stated", method="not_stated"):
    pe, pb = _value(pe, "pe", layout, heading), _value(pb, "pb", layout, heading)
    return [ValuationReading(heading, pe, pb, pe_basis, pb_basis, method, 0)] if heading and (pe is not None or pb is not None) else []


def _invesco(page: str, words) -> list[ValuationReading]:
    # Real labels: "Fund P/E - FY27E" and "Fund P/B". The footnote says
    # "Fund P/E - FY27E is current price to earnings for FY26E," (year conflicts,
    # both forward), "Fund P/B is 12 months trailing price to book value" and
    # "arrived at using Weighted Harmonic Mean". Never infer a forecast year.
    pe = _label_value(r"^Fund P/E - FY\d{2}E[ \t]+([^\n]+)", page)
    pb = _label_value(r"^Fund P/B[ \t]+([^\n]+)", page)
    return _reading(_invesco_heading(page), pe, pb, "invesco",
                    "forward" if pe is not None else "not_stated",
                    "trailing" if "12 months trailing price to book value" in page else "not_stated",
                    "harmonic" if "Weighted Harmonic Mean" in page else "not_stated")


def _row_value(words: list[Word] | None, label: str, left: int, right: int,
               *, average: bool = False) -> str | None:
    if not words:
        return None
    anchors = [w for w in words if w[4] == label and w[0] < left]
    if len(anchors) != 1:
        return None
    anchor = anchors[0]
    same_row = lambda w: abs((w[1] + w[3]) / 2 - (anchor[1] + anchor[3]) / 2) < 3
    if average and not any(w[4] == "Average" and w[0] < anchor[0] and same_row(w) for w in words):
        return None
    values = [w[4] for w in words if left <= w[0] < right and same_row(w)]
    # More than one value in the metric's own column is ambiguous; never take
    # a neighbouring holdings column or try to recover from text stream order.
    return values[0] if len(values) == 1 else None


def _iti(page: str, words) -> list[ValuationReading]:
    # Real rows: "Average P/B", then "Average P/E". Their right-aligned
    # values occupy x=100..235; holdings columns start beyond x=240. Text
    # extraction emits all labels before all values. No basis/method is stated.
    return _reading(_brand_line_heading(page, "ITI "),
                    _row_value(words, "P/E", 100, 235, average=True),
                    _row_value(words, "P/B", 100, 235, average=True), "iti")


def _kotak(page: str, words) -> list[ValuationReading]:
    # Real labels: "^^P/E", "^^P/BV", with separate numeric text runs
    # at x=70..145 in the left panel; portfolio columns begin beyond x=150.
    # "^^ Source: $ ICRA MFI Explorer, Bloomberg" states neither basis nor method.
    return _reading(_brand_line_heading(page, "KOTAK "),
                    _row_value(words, "^^P/E", 70, 145),
                    _row_value(words, "^^P/BV", 70, 145), "kotak")


def _absl(page: str, words) -> list[ValuationReading]:
    # "Equity Snapshot" has one row per scheme, including wrapped names and
    # "Avg. P/E – 33.97," / "Avg P/BV – 4.24, Avg". "Avg" does not specify
    # harmonic vs arithmetic weighting, nor trailing vs forward earnings.
    if "Equity Snapshot" not in page:
        return []
    readings = []
    for block in re.split(r"(?=Aditya Birla Sun Life)", page)[1:]:
        name = re.match(r"(Aditya Birla Sun Life\s+.+?)\s*\(\d{2}-", block, re.S)
        if not name:
            continue
        heading = " ".join(name[1].split())
        readings.extend(_reading(
            heading, _label_value(r"Avg\. P/E\s*[–-]\s*([^,\n]+)", block),
            _label_value(r"Avg P/BV\s*[–-]\s*([^,\n]+)", block), "absl",
        ))
    return readings


LAYOUTS = {"invesco": _invesco, "iti": _iti, "kotak": _kotak, "absl": _absl}


def read_valuation(layout: str, pages: list[str], boxes=None) -> list[ValuationReading]:
    # ABSL's current manager layout uses this suffix; its valuation layout is
    # still the same verified Equity Snapshot. UTI deliberately has no reader.
    layout = "absl" if layout == "absl_september" else layout
    reader = LAYOUTS.get(layout)
    if reader is None:
        return []
    readings = []
    for index, page in enumerate(pages):
        words = boxes[index] if boxes is not None and index < len(boxes) else None
        page_number = getattr(pages, "page_numbers", range(1, len(pages) + 1))[index]
        source_file = getattr(pages, "source_files", [""] * len(pages))[index]
        readings.extend(replace(row, page=page_number, source_file=source_file)
                        for row in reader(page, words))
    return readings
