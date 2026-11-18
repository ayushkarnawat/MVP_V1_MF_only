import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException, Request
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError

from app.api import auth
from app.config import settings
from app.models.auth import AuthIdentity, AuthRequestGuard
from app.models.enums import AuthIdentityProvider
from app.models.user import User
from app.services.auth import request_guard as guard
from app.services.auth.schemas import EmailOtpRequestBody, SignupEmailBody
from tests.test_migrations import _a11_migration

NOW = datetime(2026, 11, 18, tzinfo=timezone.utc)
CLIENT_ADDRESS = "192.0.2.30"


@pytest.fixture(autouse=True)
def guard_settings(monkeypatch):
    monkeypatch.setattr(settings, "auth_guard_enabled", True)
    monkeypatch.setattr(settings, "auth_guard_secret", "synthetic-test-key")
    monkeypatch.setattr(settings, "auth_guard_check_limit", 30)
    monkeypatch.setattr(settings, "auth_guard_code_limit", 10)
    monkeypatch.setattr(settings, "auth_guard_window_minutes", 10)


def _begin(db, identifier, *, ip=CLIENT_ADDRESS, channel="email", now=NOW):
    return guard.begin(
        db, client_ip=ip, identifier=identifier, channel=channel,
        route="test_request", now=now,
    )


def _code(db, identifier, *, outcome="code_sent", now=NOW):
    ticket = _begin(db, identifier, now=now)
    assert guard.before_code(db, ticket, now=now) is ticket
    guard.record_outcome(db, ticket, outcome)


def _rows(db):
    return db.query(AuthRequestGuard).all()


def _request():
    return Request({"type": "http", "client": (CLIENT_ADDRESS, 1234), "headers": []})


def test_hashes_are_keyed_and_stable(db_session, monkeypatch):
    identifier = "scrambled@example.com"
    first = db_session.get(AuthRequestGuard, _begin(db_session, identifier).row_id)
    repeat = db_session.get(AuthRequestGuard, _begin(db_session, identifier).row_id)
    monkeypatch.setattr(settings, "auth_guard_secret", "another-synthetic-test-key")
    rotated = db_session.get(AuthRequestGuard, _begin(db_session, identifier).row_id)

    assert first.ip_hash == repeat.ip_hash != rotated.ip_hash
    assert first.identifier_hash == repeat.identifier_hash != rotated.identifier_hash
    for digest in (first.ip_hash, first.identifier_hash):
        assert len(digest) == 64
        assert all(character in "0123456789abcdef" for character in digest)


def test_ipv6_uses_first_64_bits(db_session):
    first, same_network, different_network = [
        _begin(db_session, "ipv6@example.com", ip=ip)
        for ip in ("2001:db8:1234:5678::1", "2001:db8:1234:5678:ba::2", "2001:db8:1234:5679::1")
    ]

    assert first.ip_hash == same_network.ip_hash != different_network.ip_hash


@pytest.mark.parametrize(
    ("channel", "variants"),
    [
        ("email", [" A@Example.com ", "a@example.com"]),
        ("phone", ["+91 (90000) 00001", "00919000000001", "09000000001", "9000000001"]),
    ],
)
def test_identifier_variants_count_once(db_session, monkeypatch, channel, variants):
    monkeypatch.setattr(settings, "auth_guard_check_limit", 1)
    for identifier in variants:
        assert _begin(db_session, identifier, channel=channel) is not None

    assert len({row.identifier_hash for row in _rows(db_session)}) == 1


def test_thirty_first_different_address_is_limited_with_seconds_left(db_session):
    for number in range(30):
        _begin(db_session, f"user{number}@example.com", now=NOW + timedelta(seconds=number))

    with pytest.raises(guard.RequestGuardLimited) as limited:
        _begin(db_session, "extra@example.com", now=NOW + timedelta(seconds=42, milliseconds=500))

    assert limited.value.retry_after_seconds == 558
    assert len(_rows(db_session)) == 30
    assert _begin(db_session, "extra@example.com", now=NOW + timedelta(minutes=10)) is not None


def test_eleventh_different_address_asking_for_a_code_is_limited_with_seconds_left(db_session):
    for number in range(10):
        _code(db_session, f"recipient{number}@example.com", outcome="held" if number == 0 else "code_sent")

    now = NOW + timedelta(minutes=9, seconds=59, milliseconds=500)
    ticket = _begin(db_session, "extra@example.com", now=now)
    with pytest.raises(guard.RequestGuardLimited) as limited:
        guard.before_code(db_session, ticket, now=now)

    assert limited.value.retry_after_seconds == 1


def test_probes_that_send_no_code_do_not_use_up_the_code_limit(db_session):
    for number in range(20):
        ticket = _begin(db_session, f"probe{number}@example.com")
        guard.record_outcome(db_session, ticket, "unknown_account" if number < 10 else "account_exists")

    for number in range(10):
        _code(db_session, f"recipient{number}@example.com")

    outcomes = [row.outcome for row in _rows(db_session)]
    assert outcomes.count("code_sent") == outcomes.count("unknown_account") == outcomes.count("account_exists") == 10


def test_same_address_retried_is_never_limited_by_the_guard(db_session, monkeypatch):
    monkeypatch.setattr(settings, "auth_guard_check_limit", 1)
    monkeypatch.setattr(settings, "auth_guard_code_limit", 1)
    _code(db_session, "same@example.com")
    _code(db_session, "same@example.com", outcome="held", now=NOW + timedelta(seconds=30))

    with pytest.raises(guard.RequestGuardLimited) as limited:
        _begin(db_session, "extra@example.com", now=NOW + timedelta(minutes=10))
    assert limited.value.retry_after_seconds == 30


def test_two_client_addresses_are_counted_separately(db_session, monkeypatch):
    monkeypatch.setattr(settings, "auth_guard_check_limit", 1)
    _begin(db_session, "first@example.com")

    assert _begin(db_session, "second@example.com", ip="198.51.100.30") is not None


def test_unknown_email_probe_is_counted_before_the_404(db_session):
    for number in range(30):
        body = EmailOtpRequestBody(email=f"unknown{number}@example.com", flow="login")
        with pytest.raises(HTTPException) as response:
            auth.request_email_otp(body, _request(), db_session)
        assert response.value.status_code == 404

    body = EmailOtpRequestBody(email="probe-over-limit@example.com", flow="login")
    response = auth.request_email_otp(body, _request(), db_session)

    assert response.status_code == 429
    assert json.loads(response.body) == {
        "detail": "Too many attempts from this network. Try again in 10 minutes.",
        "code": "request_limited",
        "retry_after_seconds": 600,
    }
    assert {row.outcome for row in _rows(db_session)} == {"unknown_account"}


def test_existing_email_probe_is_counted_before_the_409(db_session, monkeypatch):
    monkeypatch.setattr(settings, "auth_guard_check_limit", 1)
    email = "registered@example.com"
    user = User(phone_number="+919000000002", created_at=NOW)
    db_session.add(user)
    db_session.flush()
    db_session.add(AuthIdentity(
        user_id=user.id, provider=AuthIdentityProvider.EMAIL_OTP,
        provider_subject=email, email=email, identifier_verified_at=NOW,
        created_at=NOW, last_used_at=NOW,
    ))
    db_session.commit()

    with pytest.raises(HTTPException) as response:
        auth.signup_email(SignupEmailBody(email=email), _request(), db_session)
    assert response.value.status_code == 409

    response = auth.signup_email(SignupEmailBody(email="new@example.com"), _request(), db_session)

    assert response.status_code == 429
    assert {row.outcome for row in _rows(db_session)} == {"account_exists"}


def test_table_unreadable_lets_request_through_and_logs(db_session, monkeypatch, caplog):
    execute = db_session.execute

    def unavailable(statement, *args, **kwargs):
        if "auth_request_guard" in str(statement):
            raise OperationalError(None, None, RuntimeError("private values go here"))
        return execute(statement, *args, **kwargs)

    monkeypatch.setattr(db_session, "execute", unavailable)
    body = EmailOtpRequestBody(email="fail-open@example.com")
    response = auth.request_email_otp(body, _request(), db_session)

    assert response.message == "OTP sent."
    records = [record for record in caplog.records if record.name == guard.__name__]
    assert len(records) == 1
    assert "private values" not in records[0].getMessage()


def test_table_write_failure_lets_request_through_and_logs(db_session, caplog):
    db_session.execute(text(
        "CREATE TRIGGER reject_guard_insert BEFORE INSERT ON auth_request_guard "
        "BEGIN SELECT RAISE(ABORT, 'guard write failed'); END"
    ))
    db_session.commit()

    response = auth.request_email_otp(
        EmailOtpRequestBody(email="write-failure@example.com"), _request(), db_session
    )

    assert response.message == "OTP sent."
    assert sum(record.name == guard.__name__ for record in caplog.records) == 1
    assert _rows(db_session) == []


def test_disabled_setting_skips_guard(db_session, monkeypatch, caplog):
    monkeypatch.setattr(settings, "auth_guard_enabled", False)
    monkeypatch.setattr(settings, "auth_guard_secret", "")

    assert _begin(db_session, "disabled@example.com") is None
    assert _rows(db_session) == []
    assert not any(record.name == guard.__name__ for record in caplog.records)


def test_empty_secret_skips_and_logs_error(db_session, monkeypatch, caplog):
    monkeypatch.setattr(settings, "auth_guard_secret", "")
    monkeypatch.setattr(guard, "_logged_empty_secret", False)

    assert _begin(db_session, "no-key@example.com") is None
    assert _begin(db_session, "another-no-key@example.com") is None
    assert _rows(db_session) == []
    errors = [r for r in caplog.records if r.name == guard.__name__ and r.levelno == logging.ERROR]
    assert len(errors) == 1
    assert "AUTH_GUARD_SECRET" in errors[0].getMessage()


def test_no_client_address_skips(db_session, caplog):
    with caplog.at_level(logging.INFO, logger=guard.__name__):
        assert _begin(db_session, "no-address@example.com", ip=None) is None

    assert _rows(db_session) == []
    assert "client address unavailable" in caplog.text


def test_log_line_has_short_prefix_only(db_session, monkeypatch, caplog):
    monkeypatch.setattr(settings, "auth_guard_check_limit", 1)
    _begin(db_session, "first@example.com")
    ip_hash = _rows(db_session)[0].ip_hash
    phone = "+919000000003"

    with caplog.at_level(logging.INFO, logger=guard.__name__):
        with pytest.raises(guard.RequestGuardLimited):
            _begin(db_session, phone, channel="phone")

    records = [record.getMessage() for record in caplog.records if record.name == guard.__name__]
    assert len(records) == 1
    assert "test_request" in records[0]
    assert ip_hash[:8] in records[0]
    for private_value in (ip_hash, CLIENT_ADDRESS, phone, "first@example.com"):
        assert private_value not in records[0]


def test_purge_deletes_rows_older_than_24h(db_session):
    _begin(db_session, "expired@example.com", now=NOW - timedelta(hours=24, seconds=1))
    _begin(db_session, "boundary@example.com", now=NOW - timedelta(hours=24))
    _begin(db_session, "recent@example.com", now=NOW - timedelta(hours=1))

    assert guard.purge_older_than(db_session, now=NOW) == 1
    assert len(_rows(db_session)) == 2
    assert guard.purge_older_than(db_session, now=NOW) == 0


@pytest.mark.parametrize("dialect", ["sqlite", "postgres"])
def test_auth_request_guard_migration_upgrade_and_downgrade(dialect):
    url = os.environ.get("TEST_DATABASE_URL") if dialect == "postgres" else "sqlite://"
    if not url:
        pytest.skip("TEST_DATABASE_URL unset; Postgres unavailable")
    migration = _a11_migration("0054")
    assert migration.down_revision == "0053"
    engine = create_engine(url)
    try:
        with engine.connect() as connection, connection.begin():
            if dialect == "postgres":
                schema = "auth_guard_0054_" + uuid.uuid4().hex
                connection.execute(text(f'CREATE SCHEMA "{schema}"'))
                connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
                table = "auth_request_guard"
                assert {column["name"] for column in inspect(connection).get_columns(table)} == {
                    "id", "ip_hash", "identifier_hash", "route", "outcome", "created_at",
                }
                assert inspect(connection).get_pk_constraint(table)["constrained_columns"] == ["id"]
                assert any(index["column_names"] == ["ip_hash", "created_at"]
                           for index in inspect(connection).get_indexes(table))
                migration.downgrade()
                assert not inspect(connection).has_table(table)
            if dialect == "postgres":
                connection.execute(text(f'DROP SCHEMA "{schema}"'))
    finally:
        engine.dispose()


# ---- Independent review of B-2 (18 Nov): findings 3 and 4. Written red first, then fixed.
def test_an_ipv4_mapped_ipv6_address_counts_as_the_plain_ipv4_address(db_session):
    plain = _begin(db_session, "a@example.com", ip="192.0.2.30")
    mapped = _begin(db_session, "b@example.com", ip="::ffff:192.0.2.30")
    assert mapped.ip_hash == plain.ip_hash


def test_two_different_ipv4_mapped_addresses_are_not_one_bucket(db_session):
    first = _begin(db_session, "a@example.com", ip="::ffff:192.0.2.30")
    second = _begin(db_session, "a@example.com", ip="::ffff:198.51.100.7")
    assert first.ip_hash != second.ip_hash


def test_a_zone_id_is_ignored_when_hashing_an_address(db_session):
    plain = _begin(db_session, "a@example.com", ip="fe80::1")
    with_zone = _begin(db_session, "a@example.com", ip="fe80::1%eth0")
    assert with_zone.ip_hash == plain.ip_hash


def test_repeating_a_seen_identifier_adds_no_row_and_refreshes_the_one_row(db_session):
    first = _begin(db_session, "repeat@example.com", now=NOW)
    for minute in range(1, 6):
        again = _begin(db_session, "repeat@example.com", now=NOW + timedelta(minutes=minute))
        assert again.row_id == first.row_id
    rows = _rows(db_session)
    assert len(rows) == 1
    created = rows[0].created_at.replace(tzinfo=timezone.utc) if rows[0].created_at.tzinfo is None else rows[0].created_at
    assert created == NOW + timedelta(minutes=5)


def test_a_repeat_keeps_the_identifier_counted_until_its_last_repeat_expires(db_session, monkeypatch):
    monkeypatch.setattr(settings, "auth_guard_check_limit", 1)
    _begin(db_session, "first@example.com", now=NOW)
    _begin(db_session, "first@example.com", now=NOW + timedelta(minutes=9))
    with pytest.raises(guard.RequestGuardLimited):
        _begin(db_session, "second@example.com", now=NOW + timedelta(minutes=11))


def test_the_outcome_of_a_repeat_replaces_the_outcome_on_the_single_row(db_session):
    first = _begin(db_session, "outcome@example.com", now=NOW)
    guard.record_outcome(db_session, first, "code_sent")
    second = _begin(db_session, "outcome@example.com", now=NOW + timedelta(minutes=1))
    guard.record_outcome(db_session, second, "held")
    rows = _rows(db_session)
    assert len(rows) == 1
    assert rows[0].outcome == "held"


def test_a_held_repeat_still_counts_towards_the_code_quota(db_session, monkeypatch):
    monkeypatch.setattr(settings, "auth_guard_code_limit", 1)
    _code(db_session, "held@example.com", outcome="held", now=NOW)
    ticket = _begin(db_session, "other@example.com", now=NOW + timedelta(minutes=1))
    with pytest.raises(guard.RequestGuardLimited):
        guard.before_code(db_session, ticket, now=NOW + timedelta(minutes=1))
