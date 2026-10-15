"""Calendar retention and optional private failed-file archive."""
import logging
import os
import re
from datetime import date
from pathlib import PureWindowsPath

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.enums import DisclosureBatchStatus
from app.models.reference import DisclosureBatch, SchemeHolding
from app.services.import_.file_storage import build_s3_client

logger = logging.getLogger(__name__)


def prune_old_batches(db: Session, today: date) -> int:
    # Handoff: newest three calendar months *per scheme*, not relative to the
    # job's current month (a September monthly disclosure must keep July too).
    newest = dict(db.query(DisclosureBatch.scheme_id, func.max(DisclosureBatch.as_of_date))
                  .filter(DisclosureBatch.as_of_date <= today)
                  .group_by(DisclosureBatch.scheme_id).all())
    cutoffs = {}
    for scheme_id, disclosed in newest.items():
        month = disclosed.year * 12 + disclosed.month - 3
        cutoffs[scheme_id] = date(month // 12, month % 12 + 1, 1)
    latest = dict(db.query(DisclosureBatch.scheme_id, func.max(DisclosureBatch.as_of_date))
                  .filter(DisclosureBatch.status == DisclosureBatchStatus.WRITTEN, DisclosureBatch.as_of_date <= today)
                  .group_by(DisclosureBatch.scheme_id).all())
    ids = [batch.id for batch in db.query(DisclosureBatch)
           if batch.as_of_date <= today and batch.as_of_date < cutoffs[batch.scheme_id]
           and not (batch.status is DisclosureBatchStatus.WRITTEN
                   and batch.as_of_date == latest.get(batch.scheme_id))]
    for offset in range(0, len(ids), 400):
        chunk = ids[offset:offset+400]
        db.query(SchemeHolding).filter(SchemeHolding.batch_id.in_(chunk)).delete(synchronize_session=False)
        db.query(DisclosureBatch).filter(DisclosureBatch.id.in_(chunk)).delete(synchronize_session=False)
    db.flush()
    return len(ids)


def archive_failed_file(data: bytes, amc_name: str, as_of: date, filename: str) -> str | None:
    bucket = os.environ.get('PORTFOLIO_DISCLOSURE_ARCHIVE_BUCKET')
    if not bucket:
        return None
    slug = re.sub(r'[^a-z0-9]+', '-', amc_name.lower()).strip('-') or 'unknown'
    filename = PureWindowsPath(filename).name or 'disclosure.bin'
    key = f'failed/{as_of.year:04d}/{as_of.month:02d}/{slug}/{filename}'
    try:
        build_s3_client().put_object(Bucket=bucket, Key=key, Body=data)
    except Exception as exc:
        logger.warning('portfolio disclosure archive failed: %s', exc)
        return None
    return f's3://{bucket}/{key}'
