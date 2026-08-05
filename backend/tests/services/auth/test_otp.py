from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.auth import OtpRequest
from app.services.auth.otp import MAX_ATTEMPTS, OtpVerificationError, create_otp_request, verify_otp


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine, tables=[OtpRequest.__table__])
    return sessionmaker(autoflush=False, bind=engine)()


def test_create_otp_request_returns_raw_otp_in_stub_mode(monkeypatch):
    import app.services.auth.otp as otp_module

    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "stub")
    db = _session()
    request, raw_otp = create_otp_request(db, "+919999999999")

    assert raw_otp is not None
    assert len(raw_otp) == 6
    assert raw_otp.isdigit()
    assert request.phone_number == "+919999999999"
    assert request.otp_hash != raw_otp


def test_create_otp_request_hides_otp_outside_stub_mode(monkeypatch):
    import app.services.auth.otp as otp_module

    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "sms")
    db = _session()
    _, raw_otp = create_otp_request(db, "+919999999999")

    assert raw_otp is None


def test_verify_otp_succeeds_with_correct_code():
    db = _session()
    _, raw_otp = create_otp_request(db, "+919999999999")

    verified = verify_otp(db, "+919999999999", raw_otp)

    assert verified.verified_at is not None


def test_verify_otp_rejects_wrong_code_and_increments_attempts():
    db = _session()
    create_otp_request(db, "+919999999999")

    with pytest.raises(OtpVerificationError, match="Incorrect OTP"):
        verify_otp(db, "+919999999999", "000000")

    request = db.query(OtpRequest).filter_by(phone_number="+919999999999").one()
    assert request.attempt_count == 1


def test_verify_otp_locks_out_after_max_attempts():
    db = _session()
    create_otp_request(db, "+919999999999")

    for _ in range(MAX_ATTEMPTS):
        with pytest.raises(OtpVerificationError):
            verify_otp(db, "+919999999999", "000000")

    with pytest.raises(OtpVerificationError, match="Too many"):
        verify_otp(db, "+919999999999", "000000")


def test_verify_otp_rejects_expired_request():
    db = _session()
    request, raw_otp = create_otp_request(db, "+919999999999")
    request.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    with pytest.raises(OtpVerificationError, match="expired"):
        verify_otp(db, "+919999999999", raw_otp)


def test_verify_otp_rejects_unknown_phone_number():
    db = _session()

    with pytest.raises(OtpVerificationError, match="No pending"):
        verify_otp(db, "+910000000000", "123456")


def test_create_otp_request_refuses_stub_mode_against_non_sqlite_database(monkeypatch):
    import app.services.auth.otp as otp_module

    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "stub")
    monkeypatch.setattr(otp_module.settings, "database_url", "postgresql+psycopg2://x")
    db = _session()

    with pytest.raises(RuntimeError, match="not allowed against a non-SQLite database"):
        create_otp_request(db, "+919999999999")


def test_verify_otp_uses_latest_request_when_multiple_exist():
    db = _session()
    create_otp_request(db, "+919999999999")
    _, second_otp = create_otp_request(db, "+919999999999")

    verified = verify_otp(db, "+919999999999", second_otp)

    assert verified.verified_at is not None
