import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from sqlalchemy import or_

from app.models.account_deletion import AccountDeletionSurvey
from app.models.analytics import AnalyticsRecomputeStatus, AnalyticsSection
from app.models.auth import AuthIdentity, OtpRequest, PendingIdentityVerification, Session as SessionModel
from app.models.enums import AuthIdentityProvider, ConsentAction
from app.models.folio import Folio
from app.models.imports import Import
from app.services.import_.preview_store import PREVIEW_STATUSES, discard_member_reviews
from app.models.member_history import HouseholdMemberMerge, HouseholdMemberNameChange
from app.models.snapshot import PortfolioSnapshot
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.analytics.recompute import bump_recompute_generation
from app.services.import_.file_storage import FileStorage, default_file_storage
from app.services.legal.consent import ConsentEvidence, record_consent
from app.services.legal.registry import current_documents

logger = logging.getLogger(__name__)

DELETION_GRACE_PERIOD = timedelta(days=30)


def schedule_account_deletion(
    db: Session,
    user: User,
    *,
    reason: str,
    feedback: str | None = None,
    now: datetime | None = None,
    evidence: ConsentEvidence | None = None,
) -> datetime:
    requested_at = now or datetime.now(timezone.utc)
    scheduled_at = requested_at + DELETION_GRACE_PERIOD
    db.add(
        AccountDeletionSurvey(
            reason=reason,
            feedback=feedback.strip() if feedback and feedback.strip() else None,
            created_at=requested_at,
        )
    )
    user.pending_deletion = True
    user.deletion_scheduled_at = scheduled_at
    # Scheduling deletion withdraws every purpose, for every document type --
    # including ones this user never consented to (a legacy account, or one
    # that never uploaded a CAS). Those extra WITHDRAWN rows are harmless and
    # keep the trail uniform: every deletion request reads the same way.
    record_consent(
        db,
        user_id=user.id,
        documents=list(current_documents().values()),
        action=ConsentAction.WITHDRAWN,
        surface="account_deletion",
        evidence=evidence or ConsentEvidence(ip_truncated=None, ip_hmac=None, user_agent=None, device_id=None),
        recorded_at=requested_at,
    )
    db.commit()
    return scheduled_at


def reactivate_account(db: Session, user: User) -> None:
    # The caller may have added consent rows to this session first; this
    # commit lands them atomically with the reactivation.
    user.pending_deletion = False
    user.deletion_scheduled_at = None
    db.commit()


def hard_delete_expired_accounts(
    db: Session, *, now: datetime | None = None, storage: FileStorage = default_file_storage
) -> int:
    cutoff = now or datetime.now(timezone.utc)
    expired_users = (
        db.query(User)
        .filter(
            User.pending_deletion.is_(True),
            User.deletion_scheduled_at.is_not(None),
            User.deletion_scheduled_at <= cutoff,
        )
        .all()
    )

    file_references: set[str] = set()
    for user in expired_users:
        # Make an already-running analytics worker stale in the same
        # transaction that removes the household graph.
        bump_recompute_generation(db, user.id)
        member_ids = [row[0] for row in db.query(HouseholdMember.id).filter_by(user_id=user.id).all()]
        if member_ids:
            discard_member_reviews(db, member_ids)
            file_references.update(
                ref
                for (ref,) in db.query(Import.file_reference)
                .filter(Import.household_member_id.in_(member_ids), Import.file_reference.isnot(None), Import.status.notin_(PREVIEW_STATUSES))
                .distinct()
                .all()
            )
            db.query(HouseholdMemberNameChange).filter(
                HouseholdMemberNameChange.household_member_id.in_(member_ids)
            ).delete(synchronize_session=False)
            import_ids = [row[0] for row in db.query(Import.id).filter(Import.household_member_id.in_(member_ids), Import.status.notin_(PREVIEW_STATUSES)).all()]
            if import_ids:
                db.query(Transaction).filter(Transaction.import_id.in_(import_ids)).delete(synchronize_session=False)
            db.query(Import).filter(Import.household_member_id.in_(member_ids)).delete(synchronize_session=False)
            db.query(PortfolioSnapshot).filter(PortfolioSnapshot.household_member_id.in_(member_ids)).delete(
                synchronize_session=False
            )
            db.query(AnalyticsSection).filter(AnalyticsSection.household_member_id.in_(member_ids)).delete(
                synchronize_session=False
            )
            db.query(Folio).filter(Folio.household_member_id.in_(member_ids)).delete(synchronize_session=False)

        db.query(HouseholdMemberMerge).filter_by(user_id=user.id).delete(synchronize_session=False)
        db.query(AnalyticsSection).filter_by(user_id=user.id).delete(synchronize_session=False)
        db.query(AnalyticsRecomputeStatus).filter_by(user_id=user.id).delete(synchronize_session=False)
        db.query(PendingIdentityVerification).filter_by(matched_user_id=user.id).delete(synchronize_session=False)
        db.query(SessionModel).filter_by(user_id=user.id).delete(synchronize_session=False)

        # otp_requests has no user_id FK -- OTPs are looked up by the raw
        # phone/email identifier (see services/auth/otp.py), so every
        # identifier this user ever verified must be collected from the
        # user row and their identities before those rows are gone.
        identifiers: set[str] = {user.phone_number}
        if user.email:
            identifiers.add(user.email)
        identities = db.query(AuthIdentity).filter_by(user_id=user.id).all()
        for identity in identities:
            if identity.provider in (AuthIdentityProvider.PHONE_OTP, AuthIdentityProvider.EMAIL_OTP):
                identifiers.add(identity.provider_subject)
            if identity.email:
                identifiers.add(identity.email)
        if identifiers:
            db.query(OtpRequest).filter(
                or_(OtpRequest.phone_number.in_(identifiers), OtpRequest.email.in_(identifiers))
            ).delete(synchronize_session=False)

        db.query(AuthIdentity).filter_by(user_id=user.id).delete(synchronize_session=False)
        db.query(HouseholdMember).filter_by(user_id=user.id).delete(synchronize_session=False)
        db.delete(user)

    db.commit()
    # After commit (F15): a failed commit must not leave rows pointing at
    # deleted objects. One delete per distinct file -- a family CAS is shared
    # by several Import rows. A failure is logged, not raised: the account is
    # already gone and the bucket's 30-day lifecycle rule reaps the object.
    for reference in sorted(file_references):
        try:
            storage.delete(reference)
        except Exception:
            logger.exception("Could not delete stored CAS file %s during account deletion", reference)
    return len(expired_users)
