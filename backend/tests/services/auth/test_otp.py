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


def test_create_otp_request_allows_stub_mode_on_staging_postgres(monkeypatch):
    import app.services.auth.otp as otp_module

    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "stub")
    monkeypatch.setattr(otp_module.settings, "database_url", "postgresql+psycopg2://x")
    monkeypatch.setattr(otp_module.settings, "environment", "staging")
    db = _session()

    _, raw_otp = create_otp_request(db, "+919999999999")

    assert raw_otp is not None


def test_create_otp_request_refuses_stub_mode_in_production_even_with_sqlite(monkeypatch):
    import app.services.auth.otp as otp_module

    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "stub")
    monkeypatch.setattr(otp_module.settings, "database_url", "sqlite:///:memory:")
    monkeypatch.setattr(otp_module.settings, "environment", "production")
    db = _session()

    with pytest.raises(RuntimeError, match="not allowed in production"):
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

    monkeypatch.setattr(otp_module.settings, "email_delivery_mode", "stub")
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

    monkeypatch.setattr(otp_module.settings, "email_delivery_mode", "ses")
    monkeypatch.setattr(otp_module.settings, "database_url", "sqlite:///:memory:")

    sent = {}

    class FakeProvider:
        def send_email(self, to, subject, body, html_body=None):
            sent["to"] = to
            sent["subject"] = subject
            sent["body"] = body

    monkeypatch.setattr(otp_module, "get_email_provider", lambda: FakeProvider())
    db = _session()

    request, raw_otp = create_otp_request(db, "person@example.com", channel="email")

    assert raw_otp is None
    assert sent["to"] == "person@example.com"
    assert request.otp_hash != sent["body"]  # sanity: body isn't the raw hash


def test_create_otp_request_email_channel_passes_html_body_containing_the_otp(monkeypatch):
    import app.services.auth.otp as otp_module

    monkeypatch.setattr(otp_module.settings, "email_delivery_mode", "ses")
    monkeypatch.setattr(otp_module.settings, "database_url", "sqlite:///:memory:")
    monkeypatch.setattr(otp_module, "generate_otp", lambda: "555555")

    sent = {}

    class FakeProvider:
        def send_email(self, to, subject, body, html_body=None):
            sent["html_body"] = html_body

    monkeypatch.setattr(otp_module, "get_email_provider", lambda: FakeProvider())
    db = _session()

    create_otp_request(db, "person@example.com", channel="email")

    assert sent["html_body"] is not None
    assert "555555" in sent["html_body"]


def test_create_otp_request_email_channel_raises_when_no_real_provider_configured(monkeypatch):
    import app.services.auth.otp as otp_module

    # "sms" isn't a real email-provider mode either (same placeholder the
    # phone-channel tests above use) -- anything other than "stub" or
    # "ses" has no EmailProvider behind it (email_provider.py).
    monkeypatch.setattr(otp_module.settings, "email_delivery_mode", "sms")
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
    monkeypatch.setattr(otp_module.settings, "email_delivery_mode", "stub")
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

    monkeypatch.setattr(otp_module.settings, "email_delivery_mode", "stub")
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


def test_create_otp_request_refuses_stub_mode_in_production_for_email_channel(monkeypatch):
    import app.services.auth.otp as otp_module

    # Mirrors test_create_otp_request_refuses_stub_mode_in_production_even_with_sqlite
    # above, but for the email channel's own (now-independent) setting.
    monkeypatch.setattr(otp_module.settings, "email_delivery_mode", "stub")
    monkeypatch.setattr(otp_module.settings, "database_url", "sqlite:///:memory:")
    monkeypatch.setattr(otp_module.settings, "environment", "production")
    db = _session()

    with pytest.raises(RuntimeError, match="not allowed in production"):
        create_otp_request(db, "person@example.com", channel="email")


def test_phone_and_email_channels_use_independent_delivery_modes(monkeypatch):
    """The actual point of this plan: OTP_DELIVERY_MODE (phone) and
    EMAIL_DELIVERY_MODE (email) must not affect each other -- e.g. email can
    be switched to a real provider while phone stays in dev-stub mode (until
    a real SMS provider is added later), and vice versa."""
    import app.services.auth.otp as otp_module

    monkeypatch.setattr(otp_module.settings, "otp_delivery_mode", "stub")
    monkeypatch.setattr(otp_module.settings, "email_delivery_mode", "ses")
    monkeypatch.setattr(otp_module.settings, "database_url", "sqlite:///:memory:")

    sent = {}

    class FakeProvider:
        def send_email(self, to, subject, body, html_body=None):
            sent["to"] = to

    monkeypatch.setattr(otp_module, "get_email_provider", lambda: FakeProvider())
    db = _session()

    _, phone_raw_otp = create_otp_request(db, "+919999999999")
    _, email_raw_otp = create_otp_request(db, "person@example.com", channel="email")

    assert phone_raw_otp is not None  # phone stays in dev-echo stub mode
    assert email_raw_otp is None  # email is "live" -- no echo
    assert sent["to"] == "person@example.com"  # and actually dispatched via the real-provider path


def test_create_otp_request_does_not_persist_when_email_send_fails(monkeypatch):
    import app.services.auth.otp as otp_module
    from app.services.auth.email_provider import EmailSendError

    monkeypatch.setattr(otp_module.settings, "email_delivery_mode", "ses")

    class FailingProvider:
        def send_email(self, to, subject, body, html_body=None):
            raise EmailSendError("boom")

    monkeypatch.setattr(otp_module, "get_email_provider", lambda: FailingProvider())
    db = _session()

    with pytest.raises(EmailSendError):
        create_otp_request(db, "failed-send@example.com", channel="email")

    assert db.query(OtpRequest).filter_by(email="failed-send@example.com").first() is None


def test_create_otp_request_allows_immediate_retry_after_a_failed_send(monkeypatch):
    import app.services.auth.otp as otp_module
    from app.services.auth.email_provider import EmailSendError

    monkeypatch.setattr(otp_module.settings, "email_delivery_mode", "ses")

    attempt = {"count": 0}

    class FlakyThenWorkingProvider:
        def send_email(self, to, subject, body, html_body=None):
            attempt["count"] += 1
            if attempt["count"] == 1:
                raise EmailSendError("boom")

    monkeypatch.setattr(otp_module, "get_email_provider", lambda: FlakyThenWorkingProvider())
    db = _session()

    with pytest.raises(EmailSendError):
        create_otp_request(db, "retry@example.com", channel="email")

    # Immediately retrying (no 60s wait) must succeed, not raise
    # OtpRequestThrottledError -- the failed first attempt persisted nothing.
    request, raw_otp = create_otp_request(db, "retry@example.com", channel="email")
    assert request is not None


def test_conftest_forces_stub_delivery_modes_by_default():
    """Proves the autouse fixture in conftest.py is active: even though this
    test does zero monkeypatching itself, both delivery-mode settings must
    read "stub" -- this is what protects every other test from a local
    .env that has EMAIL_DELIVERY_MODE=ses set permanently."""
    from app.config import settings

    assert settings.otp_delivery_mode == "stub"
    assert settings.email_delivery_mode == "stub"
