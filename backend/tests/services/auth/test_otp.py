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
    first, _ = create_otp_request(db, "+919999999999")
    first.created_at = datetime.now(timezone.utc) - timedelta(seconds=61)
    db.commit()
    _, second_otp = create_otp_request(db, "+919999999999")

    verified = verify_otp(db, "+919999999999", second_otp)

    assert verified.verified_at is not None


def test_create_otp_request_throttles_rapid_repeat_requests(monkeypatch):
    import app.services.auth.otp as otp_module

    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "stub")
    db = _session()
    create_otp_request(db, "+919999999999")

    with pytest.raises(otp_module.OtpRequestThrottledError, match="wait"):
        create_otp_request(db, "+919999999999")


def test_create_otp_request_allows_repeat_after_throttle_window_passes(monkeypatch):
    import app.services.auth.otp as otp_module

    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "stub")
    db = _session()
    first, _ = create_otp_request(db, "+919999999999")
    first.created_at = datetime.now(timezone.utc) - timedelta(seconds=61)
    db.commit()

    request, raw_otp = create_otp_request(db, "+919999999999")

    assert raw_otp is not None  # did not raise


def test_create_otp_request_throttle_is_per_identifier():
    db = _session()
    create_otp_request(db, "+919999999999")

    request, raw_otp = create_otp_request(db, "+918888888888")  # different number, not throttled

    assert raw_otp is not None


# --- Email channel: mirrors every phone-channel case above (handoff spec §2) ---


def test_create_otp_request_email_channel_returns_raw_otp_in_stub_mode(monkeypatch):
    import app.services.auth.otp as otp_module

    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "stub")
    db = _session()
    request, raw_otp = create_otp_request(db, "person@example.com", channel="email")

    assert raw_otp is not None
    assert len(raw_otp) == 6
    assert raw_otp.isdigit()
    assert request.email == "person@example.com"
    assert request.phone_number is None
    assert request.otp_hash != raw_otp


def test_create_otp_request_email_channel_hides_otp_and_dispatches_outside_stub_mode(monkeypatch):
    import app.services.auth.otp as otp_module

    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "postmark")
    monkeypatch.setattr(otp_module.settings, "database_url", "sqlite:///:memory:")

    sent = {}

    class FakeProvider:
        def send_email(self, to, subject, body):
            sent["to"] = to
            sent["subject"] = subject
            sent["body"] = body

    monkeypatch.setattr(otp_module, "get_email_provider", lambda: FakeProvider())
    db = _session()

    request, raw_otp = create_otp_request(db, "person@example.com", channel="email")

    assert raw_otp is None
    assert sent["to"] == "person@example.com"
    assert request.otp_hash != sent["body"]  # sanity: body isn't the raw hash


def test_create_otp_request_email_channel_raises_when_no_real_provider_configured(monkeypatch):
    import app.services.auth.otp as otp_module

    # otp_delivery_mode='stub' is the only mode get_email_provider()
    # currently knows how to serve (StubEmailProvider); anything else is
    # "no real provider configured yet" (Postmark integration is a later,
    # separate task per email_provider.py).
    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "postmark")
    monkeypatch.setattr(otp_module.settings, "database_url", "sqlite:///:memory:")
    db = _session()

    from app.services.auth.email_provider import NoEmailProviderConfiguredError

    with pytest.raises(NoEmailProviderConfiguredError):
        create_otp_request(db, "person@example.com", channel="email")


def test_create_otp_request_email_channel_does_not_dispatch_in_stub_mode(monkeypatch, caplog):
    import app.services.auth.otp as otp_module

    # Stub mode's "delivery" is the raw_otp echoed in the response, not a
    # second side channel -- mirrors how phone stub mode never dispatches
    # an SMS.
    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "stub")
    db = _session()
    with caplog.at_level("INFO"):
        create_otp_request(db, "person@example.com", channel="email")
    assert not any("StubEmailProvider" in record.message for record in caplog.records)


def test_verify_otp_email_channel_succeeds_with_correct_code():
    db = _session()
    _, raw_otp = create_otp_request(db, "person@example.com", channel="email")

    verified = verify_otp(db, "person@example.com", raw_otp, channel="email")

    assert verified.verified_at is not None


def test_verify_otp_email_channel_rejects_wrong_code_and_increments_attempts():
    db = _session()
    create_otp_request(db, "person@example.com", channel="email")

    with pytest.raises(OtpVerificationError, match="Incorrect OTP"):
        verify_otp(db, "person@example.com", "000000", channel="email")

    request = db.query(OtpRequest).filter_by(email="person@example.com").one()
    assert request.attempt_count == 1


def test_verify_otp_email_channel_locks_out_after_max_attempts():
    db = _session()
    create_otp_request(db, "person@example.com", channel="email")

    for _ in range(MAX_ATTEMPTS):
        with pytest.raises(OtpVerificationError):
            verify_otp(db, "person@example.com", "000000", channel="email")

    with pytest.raises(OtpVerificationError, match="Too many"):
        verify_otp(db, "person@example.com", "000000", channel="email")


def test_verify_otp_email_channel_rejects_expired_request():
    db = _session()
    request, raw_otp = create_otp_request(db, "person@example.com", channel="email")
    request.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    with pytest.raises(OtpVerificationError, match="expired"):
        verify_otp(db, "person@example.com", raw_otp, channel="email")


def test_verify_otp_email_channel_rejects_unknown_email():
    db = _session()

    with pytest.raises(OtpVerificationError, match="No pending"):
        verify_otp(db, "nobody@example.com", "123456", channel="email")


def test_create_otp_request_email_channel_throttles_rapid_repeat_requests(monkeypatch):
    import app.services.auth.otp as otp_module

    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "stub")
    db = _session()
    create_otp_request(db, "person@example.com", channel="email")

    with pytest.raises(otp_module.OtpRequestThrottledError, match="wait"):
        create_otp_request(db, "person@example.com", channel="email")


def test_create_otp_request_email_and_phone_channels_do_not_share_throttle_state():
    db = _session()
    create_otp_request(db, "+919999999999")  # phone

    # Same 60s window, but a different identifier/channel entirely -- not throttled.
    request, raw_otp = create_otp_request(db, "person@example.com", channel="email")

    assert raw_otp is not None


def test_verify_otp_email_and_phone_channels_do_not_cross_match_the_same_string():
    """A phone-channel OTP request for a string must not be verifiable via
    the email channel query path, and vice versa -- the two channels filter
    on different columns (handoff spec §2)."""
    db = _session()
    _, raw_otp = create_otp_request(db, "+919999999999")  # phone channel

    with pytest.raises(OtpVerificationError, match="No pending"):
        verify_otp(db, "+919999999999", raw_otp, channel="email")
