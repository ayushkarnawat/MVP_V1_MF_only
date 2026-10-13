"""Human-downloaded portfolio intake; shared parsing/matching/writing pipeline."""
from __future__ import annotations

import io
import zipfile
from datetime import date
from pathlib import PureWindowsPath

from sqlalchemy.orm import Session

from app.models.enums import DisclosureBatchStatus as Status
from app.models.reference import DisclosureBatch, Scheme
from app.services.analytics.amfi_factsheet_client import build_families
from app.services.analytics.portfolio_disclosure_client import _filename_as_of_date, _latest_month_end
from app.services.analytics.portfolio_disclosure_matching import match_scheme_name
from app.services.analytics.portfolio_disclosure_parsing import extract_zip_members, parse_workbook, read_index_sheet, sniff_workbook_format
from app.services.analytics.portfolio_disclosure_resolvers import AMC_DISCLOSURE_RESOLVERS, DisclosureResolverKind
from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch


def ensure_manual_queue_rows(db: Session, today: date) -> int:
    as_of = _latest_month_end(today)
    count = 0
    for amc, entry in AMC_DISCLOSURE_RESOLVERS.items():
        if entry.kind is not DisclosureResolverKind.MANUAL:
            continue
        for scheme in db.query(Scheme).filter_by(amc_name=amc).all():
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
                        as_of: date | None, today: date, *, allow_old: bool = False) -> dict[str, int]:
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
            sheets_with_maps.append((sheets, read_index_sheet(body)))
        prepared.append((filename, disclosed, sheets_with_maps))
    families = build_families(db.query(Scheme).filter_by(amc_name=amc_name).all())
    matched = unmatched = written = 0
    with db.begin_nested():
        for filename, disclosed, members in prepared:
            for sheets, index_map in members:
                for sheet in sheets:
                    if not sheet.holdings:
                        continue
                    key = sheet.scheme_title or index_map.get(sheet.sheet_name, sheet.sheet_name)
                    match = match_scheme_name(key, families)
                    if match is None:
                        unmatched += 1
                        continue
                    family, method, confidence = match
                    written += write_disclosure_batch(db, family, disclosed, amc_name,
                        'manual:'+filename, sheet.holdings, method, confidence,
                        declared_total=sheet.declared_total)
                    matched += 1
    return {'matched': matched, 'unmatched': unmatched, 'schemes_written': written}
