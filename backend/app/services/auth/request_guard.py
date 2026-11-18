"""Limit distinct OTP recipients and account checks from one client address."""

import hmac
import logging
import re
import uuid
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from ipaddress import ip_address, ip_network
from math import ceil
from threading import Lock
from typing import Literal, cast

from sqlalchemy import func, select, text, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.auth import AuthRequestGuard
from app.services.auth.schemas import normalize_email, normalize_phone, strip_phone_noise

logger = logging.getLogger(__name__)
_empty_secret_lock = Lock()
_logged_empty_secret = False

Channel = Literal["email", "phone"]
# "send_failed": the provider refused or errored after the slot was reserved; it gives the slot back.
Outcome = Literal["unknown_account", "account_exists", "held", "code_sent", "send_failed"]


@dataclass(frozen=True)
class GuardTicket:
    row_id: uuid.UUID
    ip_hash: str
    identifier_hash: str
    route: str


class RequestGuardLimited(Exception):
    def __init__(self, retry_after_seconds: int):
        super().__init__("Auth request guard limit reached.")
        self.retry_after_seconds = retry_after_seconds


def _warn_empty_secret() -> None:
    global _logged_empty_secret
    with _empty_secret_lock:
        if not _logged_empty_secret:
            logger.error("Auth request guard skipped because AUTH_GUARD_SECRET is empty.")
            _logged_empty_secret = True


def _canonical_identifier(identifier: str, channel: Channel) -> str:
    if channel == "email":
        return cast(str, normalize_email(identifier))

    # The same canonical form the request bodies now store. Bodies are already canonical by the time they reach here; this keeps
    # the guard right for any other caller. A value that is not an Indian mobile keeps the old behaviour: spaces, dashes and
    # brackets removed, nothing else changed.
    return cast(str, normalize_phone(strip_phone_noise(identifier)))


def _digest(secret: str, namespace: str, value: str) -> str:
    return hmac.digest(secret.encode(), f"{namespace}:{value}".encode(), "sha256").hex()


# First key of this guard's advisory locks (the letters AGRD). A fixed class keeps them clear of any other use of advisory locks.
LOCK_CLASS = 1096041028
# How long one request waits for another request from the same address. Past this the guard fails open, like every other guard
# failure, rather than hold a sign-in hostage to a stuck sender.
LOCK_WAIT = "5s"


def _lock_address(db: Session, ip_hash: str) -> None:
    """Serialise the count and the write for one client address (independent review of B-2, finding 2).

    Two simultaneous requests used to count before either had written, so 12 of 12 got through at a limit of 4. The lock is held
    to the end of the transaction, and both `begin` and `before_code` COMMIT inside it: `begin` stores the attempt, `before_code`
    stores the code reservation. So the next request from this address always counts what this one did, and the lock is NOT held
    while the code is being sent (a slow provider must not make other requests wait or use up the connection pool: independent
    Codex review of B-2, findings 1 and 3). Different addresses use different keys and never wait for each other.

    Postgres only. SQLite (local development and tests) has a single writer and no concurrent sign-ins to protect. The lock
    wait is capped for this statement alone, then put back, so the route's own queries keep the database's setting.
    """
    if db.get_bind().dialect.name != "postgresql":
        return
    previous = db.execute(text("SHOW lock_timeout")).scalar()
    db.execute(text("SELECT set_config('lock_timeout', :wait, true)"), {"wait": LOCK_WAIT})
    db.execute(text("SELECT pg_advisory_xact_lock(:cls, hashtext(:key))"), {"cls": LOCK_CLASS, "key": ip_hash})
    db.execute(text("SELECT set_config('lock_timeout', :previous, true)"), {"previous": previous})


def _limit_wait(
    db: Session, ticket: GuardTicket, now: datetime, *, codes_only: bool = False
) -> int | None:
    window = timedelta(minutes=settings.auth_guard_window_minutes)
    # The check limit counts when an address last touched a recipient (`created_at`); the code limit counts when a code slot was
    # reserved (`code_at`, NULL = no charge). Separate clocks: a check-only repeat neither erases nor revives a code charge.
    stamp = AuthRequestGuard.code_at if codes_only else AuthRequestGuard.created_at
    active = select(
        AuthRequestGuard.identifier_hash,
        func.max(stamp).label("last_request"),
    ).where(
        AuthRequestGuard.ip_hash == ticket.ip_hash,
        stamp > now - window,
    )
    identifiers = active.group_by(AuthRequestGuard.identifier_hash).subquery()

    # A distinct identifier stays counted until its most recent row expires.
    count, seen, oldest = db.execute(select(
        func.count(),
        func.count().filter(identifiers.c.identifier_hash == ticket.identifier_hash),
        func.min(identifiers.c.last_request),
    )).one()
    limit = settings.auth_guard_code_limit if codes_only else settings.auth_guard_check_limit
    if seen or count < limit or oldest is None:
        return None
    if oldest.tzinfo is None:
        oldest = oldest.replace(tzinfo=timezone.utc)
    # Never more than the window: a row stamped slightly ahead of this request (clock skew, or `now` sampled before waiting
    # on the lock) must not advertise 11 minutes for a 10-minute window.
    return min(max(1, ceil((oldest + window - now).total_seconds())), int(window.total_seconds()))


def _reject(ticket: GuardTicket, wait: int) -> None:
    logger.warning("Auth request guard limited %s for %s", ticket.route, ticket.ip_hash[:8])
    raise RequestGuardLimited(wait)


def _log_table_failure(route: str) -> None:
    # Database exception text may contain bound values.
    logger.warning("Auth request guard table unavailable on %s", route)


def begin(
    db: Session,
    *,
    client_ip: str | None,
    identifier: str,
    channel: Channel,
    route: str,
    now: datetime | None = None,
) -> GuardTicket | None:
    """Record the attempt before any identity work starts on this session."""
    if not settings.auth_guard_enabled:
        return None
    secret = settings.auth_guard_secret
    if not secret:
        _warn_empty_secret()
        return None
    if client_ip is None:
        logger.info("Auth request guard skipped on %s: client address unavailable", route)
        return None

    address = ip_address(client_ip)
    if address.version == 6 and address.ipv4_mapped is not None:
        # ::ffff:1.2.3.4 is the IPv4 address 1.2.3.4. Cut to /64 it would become "::" for every IPv4 client and put them all
        # in one bucket (independent review of B-2, finding 3).
        address = address.ipv4_mapped
    if address.version == 6:
        address = ip_network((address, 64), strict=False).network_address
    ticket = GuardTicket(
        row_id=uuid.uuid4(),
        ip_hash=_digest(secret, "ip", str(address)),
        identifier_hash=_digest(secret, channel, _canonical_identifier(identifier, channel)),
        route=route,
    )
    now = now or datetime.now(timezone.utc)
    try:
        _lock_address(db, ticket.ip_hash)
        wait = _limit_wait(db, ticket, now)
        if wait is None:
            # One row per address and identifier (the table enforces it): a repeat refreshes the row's time and keeps its last
            # outcome and code charge, so one address hammering one identifier cannot grow the table (review finding 4). The
            # refresh and the "was there a row?" answer are ONE statement, so a purge that removed the row a moment earlier
            # simply means a fresh row is inserted instead (Codex review of B-2, finding 6).
            refreshed = db.execute(
                update(AuthRequestGuard)
                .where(AuthRequestGuard.ip_hash == ticket.ip_hash, AuthRequestGuard.identifier_hash == ticket.identifier_hash)
                .values(created_at=now)
                .returning(AuthRequestGuard.id)
            ).scalar()
            if refreshed is not None:
                ticket = replace(ticket, row_id=refreshed)
            else:
                db.add(AuthRequestGuard(
                    id=ticket.row_id,
                    ip_hash=ticket.ip_hash,
                    identifier_hash=ticket.identifier_hash,
                    route=ticket.route,
                    outcome="pending",
                    created_at=now,
                ))
            # A later 401 or 422 also counts even though the route never sends a code.
            db.commit()
    except SQLAlchemyError:
        db.rollback()
        _log_table_failure(route)
        return None
    if wait is not None:
        _reject(ticket, wait)
    return ticket


def before_code(db: Session, ticket: GuardTicket | None, *, now: datetime | None = None) -> GuardTicket | None:
    """Check the code quota and, in the same locked step, RESERVE the slot and commit it.

    Call it before the route writes anything of its own: it commits the session (every caller does: the three routes call it
    right after their last read). Reserving here, not when the outcome is recorded, closes the window the routes' own commits
    left open (Codex review of B-2, finding 1), and committing releases the address lock before the slow part (the provider
    call), so one slow send cannot hold other requests or the connection pool (finding 3). If the send then fails, record
    `send_failed` to give the slot back. Returns None (guard skipped) if the table cannot be used."""
    if ticket is None:
        return None
    now = now or datetime.now(timezone.utc)
    try:
        with db.begin_nested():
            _lock_address(db, ticket.ip_hash)
            wait = _limit_wait(db, ticket, now, codes_only=True)
            if wait is None:
                db.execute(update(AuthRequestGuard).where(AuthRequestGuard.id == ticket.row_id).values(code_at=now))
        if wait is None:
            db.commit()
    except SQLAlchemyError:
        db.rollback()
        _log_table_failure(ticket.route)
        return None
    if wait is not None:
        db.rollback()  # let go of the address lock at once; nothing of the route's is pending here
        _reject(ticket, wait)
    return ticket


def record_outcome(
    db: Session, ticket: GuardTicket | None, outcome: Outcome, *, now: datetime | None = None
) -> None:
    """Persist the final outcome after the route has finished its own writes. The outcome is what the last request ended as; the
    code charge lives in `code_at`: `held` and `code_sent` keep (or, if none, start) it, `send_failed` clears it, anything
    else leaves it alone."""
    if ticket is None:
        return
    values: dict = {"outcome": outcome}
    if outcome == "send_failed":
        values["code_at"] = None
    elif outcome in ("code_sent", "held"):
        values["code_at"] = func.coalesce(AuthRequestGuard.code_at, now or datetime.now(timezone.utc))
    try:
        db.execute(update(AuthRequestGuard).where(AuthRequestGuard.id == ticket.row_id).values(**values))
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        _log_table_failure(ticket.route)


def purge_older_than(db: Session, hours: int = 24, *, now: datetime | None = None) -> int:
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(hours=hours)
    deleted = db.query(AuthRequestGuard).filter(AuthRequestGuard.created_at < cutoff).delete(synchronize_session=False)
    db.commit()
    return deleted
