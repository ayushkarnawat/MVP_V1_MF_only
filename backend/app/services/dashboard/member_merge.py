"""Merge a CAS-detected duplicate into an existing member (spec M11): one
with no statement PAN, or one whose statement PAN is the target's. One
transaction; the caller-visible commit happens here."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.analytics import AnalyticsSection
from app.models.enums import MemberOrigin, MemberPanSource, Relationship
from app.models.folio import Folio
from app.models.imports import Import
from app.models.member_history import HouseholdMemberMerge, HouseholdMemberNameChange
from app.models.transaction import Transaction
from app.models.user import HouseholdMember
from app.services.analytics.recompute import bump_recompute_generation
from app.services.dashboard.holdings import invalidate_holdings_cache
from app.services.dashboard.member_details import MemberDetailsError, MemberNotFoundError, is_name_only
from app.services.dashboard.snapshots import invalidate_member_snapshots
from app.services.import_.coverage_gap import evaluate_folio_coverage_gaps


class MergeNotAllowedError(MemberDetailsError):
    status_code = 409
    code = "merge_not_allowed"

    def __init__(self):
        super().__init__("These two people can’t be merged.")


@dataclass
class MergeResult:
    folios_moved: int
    transactions_dropped: int


def _txn_key(t: Transaction) -> tuple:
    # The same 5-column identity as uq_transactions_folio_date_amount_units_type.
    return (t.date, t.amount, t.units, t.type)


def merge_member_into(
    db: Session, user_id: uuid.UUID, source_id: uuid.UUID, target_id: uuid.UUID
) -> MergeResult:
    source = db.query(HouseholdMember).filter_by(id=source_id, user_id=user_id).first()
    target = db.query(HouseholdMember).filter_by(id=target_id, user_id=user_id).first()
    if source is None or target is None:
        raise MemberNotFoundError()
    # Staging-QA fix 5C: a source whose statement PAN is the target's PAN is
    # provably the same person, even though it isn't name-only. Since 0023 a
    # statement PAN sits in detected_pan_* only on a pan_conflict row or a
    # backfill leftover (a duplicate of an already-promoted PAN), so this is
    # reachable only for those. The target's own conflict PAN counts too:
    # refresh_pan_conflicts leaves a same-hash pair as conflicts for a merge
    # (final review I-1), and neither PAN is editable.
    same_pan = source.detected_pan_hash is not None and source.detected_pan_hash in (
        target.pan_lookup_hash,
        target.detected_pan_hash,
    )
    # M11: only a CAS-detected source with no statement PAN (or one that is
    # the target's) can be merged away. The origin check means manual and
    # onboarding members are never merged away.
    if (
        source.id == target.id
        or source.origin != MemberOrigin.CAS_DETECTED
        or not (is_name_only(source) or same_pan)
        or source.relationship == Relationship.SELF
    ):
        raise MergeNotAllowedError()

    target_folios = {
        (f.scheme_id, f.folio_number): f
        for f in db.query(Folio).filter(Folio.household_member_id == target.id).all()
    }
    folios_moved = 0
    dropped = 0
    touched_target_folios: set[uuid.UUID] = set()
    for folio in db.query(Folio).filter(Folio.household_member_id == source.id).all():
        twin = target_folios.get((folio.scheme_id, folio.folio_number))
        if twin is None:
            folio.household_member_id = target.id
            folios_moved += 1
            continue
        existing = {
            _txn_key(t) for t in db.query(Transaction).filter(Transaction.folio_id == twin.id).all()
        }
        for txn in db.query(Transaction).filter(Transaction.folio_id == folio.id).all():
            if _txn_key(txn) in existing:
                db.delete(txn)
                dropped += 1
            else:
                txn.folio_id = twin.id
                existing.add(_txn_key(txn))
        db.flush()
        db.delete(folio)
        touched_target_folios.add(twin.id)
        folios_moved += 1
    db.flush()
    for folio_id in touched_target_folios:
        evaluate_folio_coverage_gaps(db, folio_id)

    db.query(Import).filter(Import.household_member_id == source.id).update(
        {Import.household_member_id: target.id}, synchronize_session=False
    )
    invalidate_member_snapshots(db, [source.id, target.id])
    db.query(AnalyticsSection).filter(AnalyticsSection.household_member_id == source.id).delete(
        synchronize_session=False
    )
    db.query(HouseholdMemberNameChange).filter(
        HouseholdMemberNameChange.household_member_id == source.id
    ).delete(synchronize_session=False)
    db.add(
        HouseholdMemberMerge(
            user_id=user_id, kept_member_id=target.id, removed_member_id=source.id,
            removed_member_name=source.name, folios_moved=folios_moved,
            transactions_dropped=dropped, merged_at=datetime.now(timezone.utc),
        )
    )
    # A locked source can point at an import that now belongs to the target;
    # clear it so the member row deletes cleanly.
    source.detected_from_import_id = None
    db.flush()
    db.delete(source)
    if same_pan and target.pan_source == MemberPanSource.USER_ENTERED:
        # The merged statement shows the PAN the user typed: it's verified now.
        target.pan_source = MemberPanSource.CAS
        target.pan_verified_at = datetime.now(timezone.utc)
    bump_recompute_generation(db, user_id)
    db.commit()
    # After commit (see delete_household_import's note on cache races).
    invalidate_holdings_cache(source_id)
    invalidate_holdings_cache(target_id)
    return MergeResult(folios_moved=folios_moved, transactions_dropped=dropped)
