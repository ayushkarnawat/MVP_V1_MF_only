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
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal
from app.services.analytics.amfi_factsheet_client import FactsheetPages, extract_page_text, extract_page_words, import_pages, looks_like_current_factsheet
from app.services.analytics.fund_manager_layouts import LAYOUTS
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverKind


def run(db, amc_name: str, pdfs: list[Path], today: date) -> dict[str, int]:
    entry = AMC_RESOLVERS.get(amc_name)
    if entry is None or entry.kind is not ResolverKind.MANUAL:
        sys.exit(f"{amc_name!r} isn't a manual-import AMC; the monthly job handles it.")
    reader = LAYOUTS[entry.layout]
    pages_per_file = []
    for pdf in pdfs:
        pdf_bytes = pdf.read_bytes()
        pages = extract_page_text(pdf_bytes)
        if entry.needs_boxes:
            pages = FactsheetPages(pages, extract_page_words(pdf_bytes))
        ok, reason = looks_like_current_factsheet(pages, reader, today, as_on_pattern=entry.as_on_pattern)
        if not ok:
            # Checked for every file before writing anything, so a wrong file changes nothing.
            sys.exit(f"{pdf.name}: {reason} -- download this month's factsheet and run again.")
        pages_per_file.append(pages)
    # One import over every file: a fund printed in both files keeps both files' managers.
    all_pages = [page for pages in pages_per_file for page in pages]
    if entry.needs_boxes:
        all_pages = FactsheetPages(all_pages, [words for pages in pages_per_file for words in pages.words])
    matched, unmatched = import_pages(db, amc_name, all_pages, reader, today.replace(day=1), manual=True)
    db.commit()
    return {"matched": matched, "unmatched": unmatched}


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Import fund managers from downloaded AMC factsheet PDFs.")
    parser.add_argument("--amc", required=True, help='Exact fund-house name, e.g. "HDFC Mutual Fund"')
    parser.add_argument("--pdf", required=True, type=Path, action="append", help="A downloaded factsheet; repeat for HDFC's two files")
    args = parser.parse_args()
    with SessionLocal() as db:
        result = run(db, args.amc, args.pdf, date.today())
    print(f"matched={result['matched']} unmatched={result['unmatched']}")


if __name__ == "__main__":
    main()
