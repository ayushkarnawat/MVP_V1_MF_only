"""Deleting imported data by person, by statement (upload group) or by member
portfolio (spec M17). One transaction for the rows; stored CAS files are
deleted only AFTER the commit (F15) -- otherwise a failed commit would leave
rows pointing at an already-deleted object."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy.orm import Session

from app.models.analytics import AnalyticsSection
from app.models.enums import MemberOrigin, Relationship
from app.models.folio import Folio
from app.models.imports import Import
from app.models.member_history import HouseholdMemberNameChange
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.analytics.recompute import bump_recompute_generation
from app.services.dashboard.holdings import invalidate_holdings_cache
from app.services.dashboard.snapshots import invalidate_member_snapshots
from app.services.import_.coverage_gap import evaluate_folio_coverage_gaps
from app.services.import_.file_storage import FileStorage, default_file_storage, release_file_if_unreferenced

logger = logging.getLogger(__name__)

DeleteScope = Literal["person", "group"]


class ImportNotFoundError(Exception):
    pass


@dataclass
class DeleteResult:
    deleted_transactions_count: int
    removed_member_ids: list[uuid.UUID] = field(default_factory=list)
    deleted_file: bool = False


def _remove_member(db: Session, member: HouseholdMember) -> None:
    member_id = member.id
    db.query(Folio).filter(Folio.household_member_id == member_id).delete(synchronize_session=False)
    db.query(HouseholdMemberNameChange).filter(
        HouseholdMemberNameChange.household_member_id == member_id
    ).delete(synchronize_session=False)
    invalidate_member_snapshots(db, [member_id])
    db.query(AnalyticsSection).filter(AnalyticsSection.household_member_id == member_id).delete(
        synchronize_session=False
    )
    member.detected_from_import_id = None
    db.flush()
    db.delete(member)


def _delete_imports(
    db: Session,
    user_id: uuid.UUID,
    imports: list[Import],
    *,
    remove_member_ids: set[uuid.UUID],
    storage: FileStorage,
) -> DeleteResult:
    import_ids = [i.id for i in imports]
    member_ids = list(dict.fromkeys(i.household_member_id for i in imports))
    references = list(dict.fromkeys(i.file_reference for i in imports if i.file_reference))

    folio_ids = [
        folio_id
        for (folio_id,) in db.query(Transaction.folio_id)
        .filter(Transaction.import_id.in_(import_ids)).distinct().all()
    ]
    deleted_count = (
        db.query(Transaction).filter(Transaction.import_id.in_(import_ids)).delete(synchronize_session=False)
    )
    for folio_id in folio_ids:
        folio = db.get(Folio, folio_id)
        if folio is None:
            continue
        if db.query(Transaction.id).filter(Transaction.folio_id == folio_id).first() is None:
            db.delete(folio)
        else:
            evaluate_folio_coverage_gaps(db, folio_id)
    db.query(Import).filter(Import.id.in_(import_ids)).delete(synchronize_session=False)
    db.flush()
    for stale in imports:
        db.expunge(stale)

    removed: list[uuid.UUID] = []
    for member_id in member_ids:
        member = db.get(HouseholdMember, member_id)
        if member is None or member.relationship == Relationship.SELF:
            continue  # self is never removed, and its PAN is left alone
        left = db.query(Import.id).filter(Import.household_member_id == member_id).first() is not None
        if left:
            continue
        # A detected person exists only because of a statement; a completed
        # member is the user's own record and stays unless asked to go.
        if member_id in remove_member_ids or (member.is_locked and member.origin == MemberOrigin.CAS_DETECTED):
            _remove_member(db, member)
            removed.append(member_id)

    invalidate_member_snapshots(db, member_ids)
    # Bump first: the upsert row-locks analytics_recompute_status so a running
    # worker either waits and sees the new generation or has already written a
    # section that the delete below then removes.
    bump_recompute_generation(db, user_id)
    db.query(AnalyticsSection).filter(AnalyticsSection.user_id == user_id).delete(synchronize_session=False)
    db.commit()

    # After commit: cache invalidation (a racing read could otherwise publish
    # a pre-delete result under the new generation) and the stored files.
    for member_id in member_ids:
        invalidate_holdings_cache(member_id)
    deleted_file = False
    for reference in references:
        try:
            deleted_file = release_file_if_unreferenced(db, reference, storage) or deleted_file
        except Exception:
            # Rows are already gone; the 30-day lifecycle rule reaps the object.
            logger.exception("Could not delete stored CAS file %s after import deletion", reference)
    return DeleteResult(deleted_count, removed, deleted_file)


def delete_import(
    db: Session,
    user_id: uuid.UUID,
    import_id: uuid.UUID,
    scope: DeleteScope,
    storage: FileStorage = default_file_storage,
) -> DeleteResult:
    owned = db.query(Import).join(HouseholdMember, HouseholdMember.id == Import.household_member_id).filter(
        HouseholdMember.user_id == user_id
    )
    target = owned.filter(Import.id == import_id).first()
    if target is None:
        raise ImportNotFoundError()
    if scope == "group" and target.upload_group_id is not None:
        imports = owned.filter(Import.upload_group_id == target.upload_group_id).all()
    else:
        imports = [target]
    return _delete_imports(db, user_id, imports, remove_member_ids=set(), storage=storage)


def delete_member_portfolio(
    db: Session,
    user_id: uuid.UUID,
    member_id: uuid.UUID,
    remove_member: bool,
    storage: FileStorage = default_file_storage,
) -> DeleteResult:
    member = db.query(HouseholdMember).filter_by(id=member_id, user_id=user_id).first()
    if member is None:
        raise ImportNotFoundError()
    imports = db.query(Import).filter(Import.household_member_id == member_id).all()
    if not imports:
        # Nothing imported: still honour remove_member for a non-self member.
        result = DeleteResult(0)
        if remove_member and member.relationship != Relationship.SELF:
            _remove_member(db, member)
            bump_recompute_generation(db, user_id)
            db.query(AnalyticsSection).filter(AnalyticsSection.user_id == user_id).delete(synchronize_session=False)
            db.commit()
            invalidate_holdings_cache(member_id)
            result.removed_member_ids = [member_id]
        return result
    return _delete_imports(
        db, user_id, imports, remove_member_ids={member_id} if remove_member else set(), storage=storage
    )
