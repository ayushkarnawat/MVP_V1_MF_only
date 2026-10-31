# backend/scripts/jobs/import_manual_fund_managers.py
"""Monthly manual import of fund managers for AMCs whose factsheet can't be fetched
automatically (HDFC, Kotak; attribute 04, card 5). Ops downloads the factsheet(s) in a browser
and runs, once per AMC:

    python scripts/jobs/import_manual_fund_managers.py --amc "HDFC Mutual Fund" \
        --pdf HDFC_active_2026-09.pdf --pdf HDFC_passive_2026-09.pdf

Same reader, matcher and month check as the monthly job; rows are marked MANUAL. Prints
matched=N: compare it with last month's number for the AMC (in the ops guide)."""
import argparse
import logging
import re
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal
from app.services.analytics.amfi_factsheet_client import FactsheetPages, _latest_as_on, _parse_managing_since, extract_page_text, extract_page_words, import_pages, import_reported_valuation, looks_like_current_factsheet
from app.services.analytics.fund_manager_layouts import LAYOUTS
from app.services.analytics.fund_valuation_layouts import NEEDS_BOXES, read_valuation
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverKind


def _file_as_on(pages, entry, today: date) -> date | None:
    if entry.as_on_pattern is None:
        return _latest_as_on(pages, today)
    dates = [_parse_managing_since(match.group(1)) for page in pages
             for match in re.finditer(entry.as_on_pattern, page, re.I)]
    return max((value for value in dates if value is not None and value <= today + timedelta(days=7)), default=None)


def run(db, amc_name: str, pdfs: list[Path], today: date,
        this_month_only: bool = False, as_of: date | None = None) -> dict[str, int]:
    entry = AMC_RESOLVERS.get(amc_name)
    if entry is None or (entry.kind is not ResolverKind.MANUAL and not this_month_only):
        sys.exit(f"{amc_name!r} isn't a manual-import AMC; the monthly job handles it.")
    if entry.layout is None:
        sys.exit(f"{amc_name!r} has no factsheet reader; no managers were imported.")
    reader = LAYOUTS[entry.layout]
    needs_boxes = entry.needs_boxes or entry.layout in NEEDS_BOXES
    pages_per_file = []
    file_dates = []
    needs_warning = False
    for pdf in pdfs:
        pdf_bytes = pdf.read_bytes()
        pages = extract_page_text(pdf_bytes)
        pages = FactsheetPages(pages, extract_page_words(pdf_bytes) if entry.needs_boxes else [[] for _ in pages],
                               source_files=[pdf.name] * len(pages))
        ok, reason = looks_like_current_factsheet(pages, reader, as_of if as_of is not None else today, as_on_pattern=entry.as_on_pattern, min_schemes=entry.min_schemes)
        if not ok:
            # Checked for every file before writing anything, so a wrong file changes nothing.
            sys.exit(f"{pdf.name}: {reason} -- download this month's factsheet and run again.")
        file_date = _file_as_on(pages, entry, today)
        if as_of is not None and (file_date is None or (as_of - file_date).days > 45):
            # --as-of may only relax the 45-day age limit for the file's own real-clock date; a caption later
            # than the real today (+7 days) never counts, so a stray future date cannot make an old file look current.
            sys.exit(f"{pdf.name}: stale_month (no usable 'as on' date within 45 days of --as-of; a future date is not accepted) -- download this month's factsheet and run again.")
        file_dates.append((pdf.name, file_date))
        if as_of is not None and file_date is not None and (today - file_date).days > 45:
            needs_warning = True
        # Valuation-only geometry is unnecessary for a refused file. Existing
        # positional manager readers still receive boxes during validation.
        if needs_boxes and not entry.needs_boxes:
            pages = FactsheetPages(pages, extract_page_words(pdf_bytes), source_files=pages.source_files)
        pages_per_file.append(pages)
    # One import over every file: a fund printed in both files keeps both files' managers.
    all_pages = [page for pages in pages_per_file for page in pages]
    all_pages = FactsheetPages(all_pages, [words for pages in pages_per_file for words in pages.words],
                               source_files=[source for pages in pages_per_file for source in pages.source_files],
                               page_numbers=[number for pages in pages_per_file for number in pages.page_numbers])
    matched, unmatched = import_pages(db, amc_name, all_pages, reader, today.replace(day=1), manual=True)
    readings = read_valuation(entry.layout, all_pages, all_pages.words)
    # A manager-overridden old file keeps its own month, so its ratios age out under the 75-day rule
    # instead of being relabelled as this month's.
    dated = [file_date for _, file_date in file_dates if file_date is not None]
    valuation_month = min(dated).replace(day=1) if needs_warning and dated else today.replace(day=1)
    import_reported_valuation(db, amc_name, readings, valuation_month)
    db.commit()
    for filename, file_date in file_dates:
        print(f"{filename}: as on {file_date.isoformat() if file_date else 'date not found'}")
    if needs_warning:
        print(f"Warning: --as-of {as_of.isoformat()} was needed because the file's own date is more than 45 days before {today.isoformat()}; the data date shown above is unchanged.")
    if this_month_only and entry.kind is not ResolverKind.MANUAL:
        print(f"this-month-only import: {amc_name} stays automatic in the registry; the monthly job will be tried again next month")
    return {"matched": matched, "unmatched": unmatched}


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Import fund managers from downloaded AMC factsheet PDFs.")
    parser.add_argument("--amc", required=True, help='Exact fund-house name, e.g. "HDFC Mutual Fund"')
    parser.add_argument("--pdf", required=True, type=Path, action="append", help="A downloaded factsheet; repeat for HDFC's two files")
    parser.add_argument("--this-month-only", action="store_true", help="Import this month while keeping the fund house automatic in the registry")
    parser.add_argument("--as-of", type=date.fromisoformat, metavar="YYYY-MM-DD", help="Date used only to check whether the factsheet is more than 45 days old")
    args = parser.parse_args()
    with SessionLocal() as db:
        result = run(db, args.amc, args.pdf, date.today(), this_month_only=args.this_month_only, as_of=args.as_of)
    print(f"matched={result['matched']} unmatched={result['unmatched']}")


if __name__ == "__main__":
    main()
