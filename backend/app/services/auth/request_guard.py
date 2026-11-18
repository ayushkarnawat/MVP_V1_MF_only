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
from app.services.auth.schemas import normalize_email, normalize_phone

logger = logging.getLogger(__name__)
_empty_secret_lock = Lock()
_logged_empty_secret = False

Channel = Literal["email", "phone"]
Outcome = Literal["unknown_account", "account_exists", "held", "code_sent"]


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
    return cast(str, normalize_phone(re.sub(r"[\s()-]", "", identifier)))


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
    to the end of the transaction, which is the commit that stores the attempt (`begin`) or the commit that stores the code
    outcome (`record_outcome`, after the code is sent), so the next request from this address always counts what this one did.
    Different addresses use different keys and never wait for each other.

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
    active = select(
        AuthRequestGuard.identifier_hash,
        func.max(AuthRequestGuard.created_at).label("last_request"),
    ).where(
        AuthRequestGuard.ip_hash == ticket.ip_hash,
        AuthRequestGuard.created_at > now - window,
    )
    if codes_only:
        active = active.where(AuthRequestGuard.outcome.in_(("code_sent", "held")))
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
    return max(1, ceil((oldest + window - now).total_seconds()))


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
            # One row per address and identifier: a repeat refreshes the row's time and keeps its last outcome until the route
            # records the new one, so one address hammering one identifier cannot grow the table (review finding 4). The old
            # outcome stays meanwhile so the code quota still sees the identifier as already used.
            existing = db.execute(
                select(AuthRequestGuard.id)
                .where(AuthRequestGuard.ip_hash == ticket.ip_hash, AuthRequestGuard.identifier_hash == ticket.identifier_hash)
                .order_by(AuthRequestGuard.created_at.desc())
                .limit(1)
            ).scalar()
            if existing is not None:
                ticket = replace(ticket, row_id=existing)
                db.execute(update(AuthRequestGuard).where(AuthRequestGuard.id == existing).values(created_at=now))
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
    """Check the separate code quota and clear the ticket if that check fails open."""
    if ticket is None:
        return None
    try:
        with db.begin_nested():
            # Taken here and kept until the route's commit, so no other request from this address counts the code quota
            # between this check and the moment this request's outcome is stored.
            _lock_address(db, ticket.ip_hash)
            wait = _limit_wait(db, ticket, now or datetime.now(timezone.utc), codes_only=True)
    except SQLAlchemyError:
        _log_table_failure(ticket.route)
        return None
    if wait is not None:
        _reject(ticket, wait)
    return ticket


def record_outcome(db: Session, ticket: GuardTicket | None, outcome: Outcome) -> None:
    """Persist the final outcome after the route has finished its own writes."""
    if ticket is None:
        return
    try:
        db.execute(update(AuthRequestGuard).where(AuthRequestGuard.id == ticket.row_id).values(outcome=outcome))
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        _log_table_failure(ticket.route)


def purge_older_than(db: Session, hours: int = 24, *, now: datetime | None = None) -> int:
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(hours=hours)
    deleted = db.query(AuthRequestGuard).filter(AuthRequestGuard.created_at < cutoff).delete(synchronize_session=False)
    db.commit()
    return deleted
