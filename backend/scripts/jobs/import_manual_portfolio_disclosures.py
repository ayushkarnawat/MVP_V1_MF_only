"""Import public workbooks downloaded by an operator; no network requests."""
import argparse
import logging
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.db.session import SessionLocal
from app.services.analytics.portfolio_disclosure_manual import import_manual_files


def run(db, amc_name, files, as_of, today, *, allow_old=False, allow_any_date=False):
    result = import_manual_files(db, amc_name, [(p.name, p.read_bytes()) for p in files],
                                 as_of, today, allow_old=allow_old, allow_any_date=allow_any_date)
    db.commit()
    return result


def main():
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--amc', required=True)
    parser.add_argument('--file', required=True, action='append', type=Path)
    parser.add_argument('--as-of', type=date.fromisoformat)
    parser.add_argument('--allow-old', action='store_true')
    parser.add_argument('--allow-any-date', action='store_true', help='Permit an intentional non-month-end disclosure date; ZIP member dates never override --as-of')
    args = parser.parse_args()
    try:
        with SessionLocal() as db:
            result = run(db, args.amc, args.file, args.as_of, date.today(), allow_old=args.allow_old, allow_any_date=args.allow_any_date)
    except (ValueError, OSError) as exc:
        parser.exit(1, str(exc)+'\n')
    print(' '.join(f'{key}={result[key]}' for key in ('matched', 'unmatched', 'schemes_written')))


if __name__ == '__main__':
    main()
