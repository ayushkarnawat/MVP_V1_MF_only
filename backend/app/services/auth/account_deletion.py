from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from sqlalchemy import or_

from app.models.account_deletion import AccountDeletionSurvey
from app.models.analytics import AnalyticsRecomputeStatus, AnalyticsSection
from app.models.auth import AuthIdentity, OtpRequest, PendingIdentityVerification, Session as SessionModel
from app.models.enums import AuthIdentityProvider
from app.models.folio import Folio
from app.models.imports import Import
from app.models.snapshot import PortfolioSnapshot
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.analytics.recompute import bump_recompute_generation

DELETION_GRACE_PERIOD = timedelta(days=5)


def schedule_account_deletion(
    db: Session,
    user: User,
    *,
    reason: str,
    feedback: str | None = None,
    now: datetime | None = None,
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
    db.commit()
    return scheduled_at


def reactivate_account(db: Session, user: User) -> None:
    user.pending_deletion = False
    user.deletion_scheduled_at = None
    db.commit()


def hard_delete_expired_accounts(db: Session, *, now: datetime | None = None) -> int:
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

    for user in expired_users:
        # Make an already-running analytics worker stale in the same
        # transaction that removes the household graph.
        bump_recompute_generation(db, user.id)
        member_ids = [row[0] for row in db.query(HouseholdMember.id).filter_by(user_id=user.id).all()]
        if member_ids:
            import_ids = [row[0] for row in db.query(Import.id).filter(Import.household_member_id.in_(member_ids)).all()]
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
    return len(expired_users)
