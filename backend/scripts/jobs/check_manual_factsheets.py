"""Alert when a registry manual house has no fund-manager import this month."""
import argparse
import logging
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal
from app.services.analytics.amfi_factsheet_client import _alert, stale_manual_houses


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Check whether manual factsheets were imported this month.")
    parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    with SessionLocal() as db:
        overdue = stale_manual_houses(db, date.today())
    for house in overdue:
        _alert(house.amc, "manual_import_missing",
               house.last_import.strftime("%Y-%m") if house.last_import is not None else "never")
    sys.exit(1 if overdue else 0)


if __name__ == "__main__":
    main()
