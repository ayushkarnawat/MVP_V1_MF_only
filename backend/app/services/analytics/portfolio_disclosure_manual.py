"""Human-downloaded portfolio intake; shared parsing/matching/writing pipeline.

The batch date comes only from --as-of or the outer filename. Dates inside ZIP
member names never override it. Non-month-end dates require --allow-any-date;
--allow-old never permits a future date.
"""
from __future__ import annotations

import io
import zipfile
from datetime import date, timedelta
from pathlib import PureWindowsPath

from sqlalchemy.orm import Session

from app.models.enums import DisclosureBatchStatus as Status
from app.models.reference import DisclosureBatch, Scheme
from app.services.analytics.amfi_factsheet_client import build_families
from app.services.analytics.portfolio_disclosure_client import _filename_as_of_date, _latest_month_end, _plan_matches, LocatedFile
from app.services.analytics.portfolio_disclosure_parsing import extract_zip_members, parse_workbook, read_index_sheet, sniff_workbook_format
from app.services.analytics.portfolio_disclosure_resolvers import AMC_DISCLOSURE_RESOLVERS, DisclosureResolverKind
from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch


def ensure_manual_queue_rows(db: Session, today: date) -> int:
    as_of = _latest_month_end(today)
    count = 0
    for amc, entry in AMC_DISCLOSURE_RESOLVERS.items():
        if entry.kind is not DisclosureResolverKind.MANUAL:
            continue
        for scheme in db.query(Scheme).filter_by(amc_name=amc, is_active=True).all():
            if db.query(DisclosureBatch).filter_by(scheme_id=scheme.id, as_of_date=as_of).first() is None:
                db.add(DisclosureBatch(scheme_id=scheme.id, as_of_date=as_of, amc_name=amc,
                                      status=Status.AWAITING_MANUAL_UPLOAD))
                count += 1
    db.flush()
    return count


def manual_queue_summary(db: Session, today: date | None = None) -> dict[str, int]:
    result = {}
    for batch in db.query(DisclosureBatch).filter_by(as_of_date=_latest_month_end(today),
                                                    status=Status.AWAITING_MANUAL_UPLOAD):
        result[batch.amc_name] = result.get(batch.amc_name, 0) + 1
    return result


def import_manual_files(db: Session, amc_name: str, files: list[tuple[str, bytes]],
                        as_of: date | None, today: date, *, allow_old: bool = False, allow_any_date: bool = False) -> dict[str, int]:
    entry = AMC_DISCLOSURE_RESOLVERS.get(amc_name)
    if entry is None or entry.kind is not DisclosureResolverKind.MANUAL:
        raise ValueError(f'{amc_name!r} is not a manual-import AMC')
    if not files:
        raise ValueError('At least one workbook is required')
    prepared = []
    # All files, members and dates are checked before any database write.
    for filename, data in files:
        filename = PureWindowsPath(filename).name
        if not filename.lower().endswith(('.xls', '.xlsx', '.zip')):
            raise ValueError(f'{filename}: expected .xls/.xlsx/.zip')
        disclosed = as_of or _filename_as_of_date('https://manual.invalid/'+filename)
        if disclosed is None:
            raise ValueError(f'{filename}: date missing; supply --as-of')
        if not allow_any_date and (disclosed + timedelta(days=1)).day != 1:
            raise ValueError(f'{filename}: expected a month-end date; use --allow-any-date for an intentional non-month-end import')
        if disclosed > today or (not allow_old and (today-disclosed).days > 45):
            raise ValueError(f'{filename}: future or more than 45 days old; --allow-old permits old dates only')
        try:
            sniff_workbook_format(data)
        except ValueError:
            if not zipfile.is_zipfile(io.BytesIO(data)):
                raise ValueError(f'{filename}: not a workbook or ZIP') from None
            members = extract_zip_members(data)
            if not members:
                raise ValueError(f'{filename}: ZIP has no workbooks')
        else:
            members = [(filename, data)]
        sheets_with_maps = []
        for member, body in members:
            sniff_workbook_format(body)
            sheets = parse_workbook(body)
            if not sheets or any(sheet.error for sheet in sheets):
                raise ValueError(f'{filename}/{member}: unreadable workbook/sheet')
            sheets_with_maps.append((member, sheets, read_index_sheet(body)))
        prepared.append((filename, data, disclosed, sheets_with_maps))
    families = build_families(db.query(Scheme).filter_by(amc_name=amc_name, is_active=True).all())
    matched = unmatched = written = 0
    with db.begin_nested():
        for filename, data, disclosed, members in prepared:
            file = LocatedFile(data, 'manual:'+filename, disclosed)
            # ZIP member filenames identify schemes, never the disclosure date.
            is_zip = len(members) > 1 or members[0][0] != filename
            matching_members = [(member if is_zip else file.source_url, sheets, index_map)
                                for member, sheets, index_map in members]
            plan = _plan_matches(file, amc_name, families, matching_members)
            for member, sheets, index_map in matching_members:
                for sheet in sheets:
                    if not sheet.holdings:
                        continue
                    match = plan.get((member, sheet.sheet_name))
                    if match is None:
                        unmatched += 1
                        continue
                    family, method, confidence = match
                    written += write_disclosure_batch(db, family, disclosed, amc_name,
                        'manual:'+filename, sheet.holdings, method, confidence,
                        declared_total=sheet.declared_total)
                    matched += 1
    return {'matched': matched, 'unmatched': unmatched, 'schemes_written': written}
