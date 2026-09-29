# Auth Flow Redesign (Phone-First, Sequential Signup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make phone verification the mandatory first step of signup (email second), fix the known phone-login silent-account-creation bug as a side effect, capture device/platform + IP metadata on every OTP send, and bound `otp_requests`'s growth — all with zero new tables and zero new AWS infrastructure.

**Architecture:** Reuse `pending_identity_verifications` exactly as it already works for the email/Google-first path, just entering from the opposite side (`provider=phone_otp` as the *first* verified leg instead of the second). Generalize the one function that currently assumes a fixed role (`complete_phone_gate_signup`) into a symmetric completion function. Add eight nullable metadata columns to `otp_requests`, and three application-logic behaviors to its write path (upsert-on-resend, delete-on-completion, a 30-day sweep) — no new table, no scheduled job.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic (backend), React + Vite + TypeScript (frontend), pytest with in-memory SQLite (backend tests).

**Spec:**
- `Docs/PRDs/PRD-05-Auth-Flow-Redesign.md`
- `Docs/superpowers/specs/2026-09-28-auth-flow-redesign-database-schema-changes.md`
- `Docs/superpowers/specs/2026-09-28-auth-flow-redesign-tables-changed.md`
- `DEFERRED_FEATURES.md` (§PRD-05, for what's explicitly *not* in this plan)

## Global Constraints

- `Decimal`, never `float`, for money/units/NAV — not touched by this plan, but stated per AGENTS.md non-negotiable.
- No new database table. No new AWS infrastructure (no EventBridge Scheduler entry, no new ECS task).
- `otp_delivery_mode` stays `"stub"` — do not wire a real SMS provider as part of this plan (out of scope, see DEFERRED_FEATURES.md).
- `pending_identity_verifications`'s 10-minute TTL and its deletion-on-completion behavior must not change at all.
- Every existing test in `backend/tests/` that calls `/auth/otp/verify` without a `flow` field (37 call sites across 15 files, almost all unrelated to auth — dashboard/imports/analytics test setup) must keep passing unmodified. See Task 7's design note.
- `ip_address` is stored raw only — no GeoIP lookup/enrichment in this plan.
- Google sign-in's backend behavior is completely unchanged; only its frontend visibility on the signup screen changes (Task 12).

## Review Focus

- **Concurrent resend race:** two near-simultaneous "Send OTP" clicks for the same identifier could each read "no existing unverified row" before either commits, producing two rows despite the upsert design. Accepted limitation (would need `SELECT ... FOR UPDATE`, out of scope for this pass) — not a task to fix, but Task 3's tests confirm the *sequential* case works and the module docstring states this limitation explicitly.
- **Missing `X-Forwarded-For` header** (a direct local/dev request, not behind the ALB) — `get_client_ip` must fall back to `request.client.host` without raising. Covered in Task 2.
- **Malformed or absent User-Agent header** — `capture_request_metadata` must not crash on a missing header or a string the `user-agents` library can't confidently parse; it should return `None`s for the parsed fields rather than raising. Covered in Task 2.
- **Someone abandons the phone-first email step and comes back with a different email** — `attach_email_to_pending` must overwrite `pending.email`, not append or reject, so the pending record always reflects the *last* email actually entered. Covered in Task 6.
- **`flow="signup"` submitted for a phone number that already has an account** (person forgot they'd signed up) — must log them in gracefully rather than erroring, since the number itself proves nothing malicious. Covered in Task 7.

---

## Task 1: `otp_requests` metadata columns (migration + model)

**Files:**
- Create: `backend/alembic/versions/0017_otp_request_metadata.py`
- Modify: `backend/app/models/auth.py`
- Test: `backend/tests/models/test_auth_identity_models.py`

**Interfaces:**
- Produces: `OtpRequest.ip_address: str | None`, `.user_agent: str | None`, `.device_type: str | None`, `.os_family: str | None`, `.os_version: str | None`, `.browser_family: str | None`, `.browser_version: str | None`, `.device_id: str | None` — all nullable columns later tasks read/write.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/models/test_auth_identity_models.py` (check the existing imports at the top of that file and extend them rather than duplicating; it already imports `OtpRequest` and has a `_session()`-style helper — match whatever pattern is already there):

```python
def test_otp_request_metadata_columns_default_to_none():
    db = _session()
    request = OtpRequest(
        phone_number="+919999999999",
        otp_hash="hash",
        expires_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
    )
    db.add(request)
    db.commit()

    assert request.ip_address is None
    assert request.user_agent is None
    assert request.device_type is None
    assert request.os_family is None
    assert request.os_version is None
    assert request.browser_family is None
    assert request.browser_version is None
    assert request.device_id is None


def test_otp_request_metadata_columns_persist_when_set():
    db = _session()
    request = OtpRequest(
        phone_number="+919999999999",
        otp_hash="hash",
        expires_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        ip_address="203.0.113.5",
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
        device_type="mobile",
        os_family="iOS",
        os_version="17.5",
        browser_family="Mobile Safari",
        browser_version="17.5",
        device_id="a1b2c3d4-0000-0000-0000-000000000000",
    )
    db.add(request)
    db.commit()
    db.refresh(request)

    assert request.ip_address == "203.0.113.5"
    assert request.device_type == "mobile"
    assert request.os_family == "iOS"
    assert request.device_id == "a1b2c3d4-0000-0000-0000-000000000000"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/models/test_auth_identity_models.py -k test_otp_request_metadata -v`
Expected: FAIL with `TypeError: 'ip_address' is an invalid keyword argument for OtpRequest` (column doesn't exist yet).

- [ ] **Step 3: Add the columns to the model**

In `backend/app/models/auth.py`, change the import line and the `OtpRequest` class:

```python
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
```

```python
class OtpRequest(Base):
    __tablename__ = "otp_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Exactly one of phone_number/email is set (ck_otp_requests_exactly_one_identifier,
    # migration 0007) -- phone and email OTPs share this one table/code path.
    phone_number: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    otp_hash: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Auth-flow-redesign FR-2/FR-9 (migration 0017): device/platform
    # analytics, not fraud prevention -- see the schema doc's §1 purpose
    # note for why these fields, not IP/MAC, answer "what device."
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(Text)
    device_type: Mapped[str | None] = mapped_column(String)
    os_family: Mapped[str | None] = mapped_column(String)
    os_version: Mapped[str | None] = mapped_column(String)
    browser_family: Mapped[str | None] = mapped_column(String)
    browser_version: Mapped[str | None] = mapped_column(String)
    device_id: Mapped[str | None] = mapped_column(String)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/models/test_auth_identity_models.py -k test_otp_request_metadata -v`
Expected: PASS

- [ ] **Step 5: Write the migration**

Create `backend/alembic/versions/0017_otp_request_metadata.py`:

```python
"""otp request metadata

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("otp_requests", sa.Column("ip_address", sa.String(length=45), nullable=True))
    op.add_column("otp_requests", sa.Column("user_agent", sa.Text(), nullable=True))
    op.add_column("otp_requests", sa.Column("device_type", sa.String(), nullable=True))
    op.add_column("otp_requests", sa.Column("os_family", sa.String(), nullable=True))
    op.add_column("otp_requests", sa.Column("os_version", sa.String(), nullable=True))
    op.add_column("otp_requests", sa.Column("browser_family", sa.String(), nullable=True))
    op.add_column("otp_requests", sa.Column("browser_version", sa.String(), nullable=True))
    op.add_column("otp_requests", sa.Column("device_id", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("otp_requests", "device_id")
    op.drop_column("otp_requests", "browser_version")
    op.drop_column("otp_requests", "browser_family")
    op.drop_column("otp_requests", "os_version")
    op.drop_column("otp_requests", "os_family")
    op.drop_column("otp_requests", "device_type")
    op.drop_column("otp_requests", "user_agent")
    op.drop_column("otp_requests", "ip_address")
```

- [ ] **Step 6: Apply the migration against local dev DB and verify it round-trips**

Run: `cd backend && alembic upgrade head`
Expected: no errors; `alembic current` shows `0017`.

Run: `cd backend && alembic downgrade -1 && alembic upgrade head`
Expected: no errors either direction — confirms the downgrade path is correct before it's ever needed for real.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/auth.py backend/alembic/versions/0017_otp_request_metadata.py backend/tests/models/test_auth_identity_models.py
git commit -m "feat(auth): add otp_requests metadata columns (migration 0017)"
```

---

## Task 2: Request-metadata capture module

**Files:**
- Create: `backend/app/services/auth/device_info.py`
- Test: `backend/tests/services/auth/test_device_info.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `RequestMetadata` (NamedTuple with 8 fields, all defaulting to `None`), `get_client_ip(request: Request) -> str | None`, `capture_request_metadata(request: Request) -> RequestMetadata` — Task 3 and Task 7 both import these.

- [ ] **Step 1: Add the dependency**

Add this line to `backend/requirements.txt`, alphabetically ordered with the rest of the pinned list (it belongs between `typing_extensions` and `urllib3`... actually alphabetically `user-agents` sorts after `urllib3` and before `uvicorn` — place it there):

```
user-agents==2.2.0
```

Run: `cd backend && pip install -r requirements.txt`

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/services/auth/test_device_info.py`:

```python
from unittest.mock import MagicMock

from app.services.auth.device_info import capture_request_metadata, get_client_ip


def _request(headers: dict[str, str], client_host: str | None = "10.0.0.5"):
    request = MagicMock()
    request.headers = headers
    request.client = MagicMock(host=client_host) if client_host else None
    return request


IPHONE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)
WINDOWS_CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)


def test_get_client_ip_prefers_x_forwarded_for():
    request = _request({"x-forwarded-for": "203.0.113.5, 10.0.0.1"}, client_host="10.0.0.1")

    assert get_client_ip(request) == "203.0.113.5"


def test_get_client_ip_falls_back_to_request_client_host_when_no_forwarded_header():
    request = _request({}, client_host="192.0.2.9")

    assert get_client_ip(request) == "192.0.2.9"


def test_get_client_ip_returns_none_when_neither_is_available():
    request = _request({}, client_host=None)

    assert get_client_ip(request) is None


def test_capture_request_metadata_parses_iphone_user_agent():
    request = _request({"user-agent": IPHONE_UA, "x-forwarded-for": "203.0.113.5"})

    meta = capture_request_metadata(request)

    assert meta.ip_address == "203.0.113.5"
    assert meta.user_agent == IPHONE_UA
    assert meta.device_type == "mobile"
    assert meta.os_family == "iOS"
    assert meta.browser_family == "Mobile Safari"


def test_capture_request_metadata_parses_windows_desktop_user_agent():
    request = _request({"user-agent": WINDOWS_CHROME_UA})

    meta = capture_request_metadata(request)

    assert meta.device_type == "desktop"
    assert meta.os_family == "Windows"
    assert meta.browser_family == "Chrome"


def test_capture_request_metadata_handles_missing_user_agent_header():
    request = _request({})

    meta = capture_request_metadata(request)

    assert meta.user_agent is None
    assert meta.device_type is None
    assert meta.os_family is None


def test_capture_request_metadata_reads_device_id_header():
    request = _request({"x-device-id": "a1b2c3d4-0000-0000-0000-000000000000"})

    meta = capture_request_metadata(request)

    assert meta.device_id == "a1b2c3d4-0000-0000-0000-000000000000"
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && pytest tests/services/auth/test_device_info.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.auth.device_info'`

- [ ] **Step 4: Write the module**

Create `backend/app/services/auth/device_info.py`:

```python
"""Request-metadata capture for OTP requests (auth-flow-redesign FR-2/FR-9)
-- this is for device/platform analytics ("what are our users signing up
on -- phone, tablet, Windows, Mac"), not fraud prevention. Neither MAC nor
raw IP address answers that question; the parsed User-Agent fields do. See
Docs/superpowers/specs/2026-09-28-auth-flow-redesign-database-schema-changes.md
§1 for the full reasoning.

Concurrency note: this module has no locking of its own -- it's a pure,
stateless read of the incoming request. The upsert-on-resend race documented
in otp.py is a property of the caller, not of this module.
"""

from __future__ import annotations

from typing import NamedTuple

from fastapi import Request
from user_agents import parse as parse_user_agent


class RequestMetadata(NamedTuple):
    ip_address: str | None = None
    user_agent: str | None = None
    device_type: str | None = None
    os_family: str | None = None
    os_version: str | None = None
    browser_family: str | None = None
    browser_version: str | None = None
    device_id: str | None = None


def get_client_ip(request: Request) -> str | None:
    """The backend sits behind an ALB (ADR-005) -- request.client.host is
    the ALB's own internal IP, not the caller's. The ALB puts the real
    client IP first in X-Forwarded-For (format: client, proxy1, proxy2...).
    This header is trustworthy here specifically because ECS tasks aren't
    reachable directly (all traffic is forced through the ALB) -- don't
    reuse this helper in a deployment where the app is directly
    internet-facing without re-checking that assumption."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def capture_request_metadata(request: Request) -> RequestMetadata:
    """Reads everything available from a single incoming request -- no
    external calls, no DB access. Safe to call unconditionally; every field
    degrades to None rather than raising when its source header is absent
    or unparseable."""
    ua_string = request.headers.get("user-agent")
    device_type = os_family = os_version = browser_family = browser_version = None
    if ua_string:
        parsed = parse_user_agent(ua_string)
        if parsed.is_mobile:
            device_type = "mobile"
        elif parsed.is_tablet:
            device_type = "tablet"
        elif parsed.is_pc:
            device_type = "desktop"
        else:
            device_type = "other"
        os_family = parsed.os.family or None
        os_version = parsed.os.version_string or None
        browser_family = parsed.browser.family or None
        browser_version = parsed.browser.version_string or None

    return RequestMetadata(
        ip_address=get_client_ip(request),
        user_agent=ua_string,
        device_type=device_type,
        os_family=os_family,
        os_version=os_version,
        browser_family=browser_family,
        browser_version=browser_version,
        device_id=request.headers.get("x-device-id"),
    )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/services/auth/test_device_info.py -v`
Expected: PASS (all 7 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/app/services/auth/device_info.py backend/tests/services/auth/test_device_info.py
git commit -m "feat(auth): add request-metadata capture (IP + parsed User-Agent)"
```

---

## Task 3: `otp_requests` retention — upsert on resend, 30-day sweep, delete-by-value helper

**Files:**
- Modify: `backend/app/services/auth/otp.py`
- Test: `backend/tests/services/auth/test_otp.py`

**Interfaces:**
- Consumes: `RequestMetadata` from `app.services.auth.device_info` (Task 2).
- Produces: `create_otp_request(db, identifier, channel="sms", metadata: RequestMetadata | None = None)` — signature gains one new optional kwarg, existing positional callers unaffected. New export `delete_otp_requests_for_identifiers(db, *, phone_number, email, commit=True) -> None` — Task 4 imports this.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/services/auth/test_otp.py` (append; keep the existing imports, add `RequestMetadata`):

```python
from app.services.auth.device_info import RequestMetadata


def test_create_otp_request_stores_provided_metadata():
    db = _session()
    meta = RequestMetadata(ip_address="203.0.113.5", user_agent="ua-string", device_type="mobile")

    request, _ = create_otp_request(db, "+919999999999", metadata=meta)

    assert request.ip_address == "203.0.113.5"
    assert request.user_agent == "ua-string"
    assert request.device_type == "mobile"


def test_create_otp_request_defaults_metadata_to_none_when_omitted():
    db = _session()

    request, _ = create_otp_request(db, "+919999999999")

    assert request.ip_address is None
    assert request.device_id is None


def test_create_otp_request_resend_updates_existing_row_instead_of_inserting(monkeypatch):
    """FR-9 part 1: a resend after the throttle window must UPDATE the
    existing unverified row, not insert a second one -- bounds repeat
    attempts (typo, resend, ten retries) to one row per identifier."""
    db = _session()
    first, _ = create_otp_request(db, "+919999999999")
    first_id = first.id
    first.created_at = datetime.now(timezone.utc) - timedelta(seconds=61)
    db.commit()

    second, second_otp = create_otp_request(db, "+919999999999")

    assert second.id == first_id  # same row, not a new insert
    assert db.query(OtpRequest).filter_by(phone_number="+919999999999").count() == 1
    verified = verify_otp(db, "+919999999999", second_otp)
    assert verified.id == first_id


def test_create_otp_request_resend_resets_attempt_count():
    db = _session()
    request, _ = create_otp_request(db, "+919999999999")
    with pytest.raises(OtpVerificationError):
        verify_otp(db, "+919999999999", "000000")
    assert request.attempt_count == 1
    request.created_at = datetime.now(timezone.utc) - timedelta(seconds=61)
    db.commit()

    resent, _ = create_otp_request(db, "+919999999999")

    assert resent.attempt_count == 0


def test_create_otp_request_resend_overwrites_metadata():
    db = _session()
    old_meta = RequestMetadata(device_type="mobile")
    request, _ = create_otp_request(db, "+919999999999", metadata=old_meta)
    request.created_at = datetime.now(timezone.utc) - timedelta(seconds=61)
    db.commit()

    new_meta = RequestMetadata(device_type="desktop")
    resent, _ = create_otp_request(db, "+919999999999", metadata=new_meta)

    assert resent.device_type == "desktop"


def test_create_otp_request_sweeps_unverified_rows_older_than_30_days():
    """FR-9 part 3: ordinary OTP-request traffic is the trigger -- no
    scheduled job. A stale, never-verified row from a different identifier
    is swept as a side effect of any otp_requests write."""
    db = _session()
    stale, _ = create_otp_request(db, "+918888888888")
    stale.expires_at = datetime.now(timezone.utc) - timedelta(days=31)
    db.commit()

    create_otp_request(db, "+919999999999")  # unrelated call triggers the sweep

    assert db.query(OtpRequest).filter_by(phone_number="+918888888888").first() is None


def test_create_otp_request_sweep_does_not_touch_verified_rows():
    db = _session()
    old, raw_otp = create_otp_request(db, "+918888888888")
    verify_otp(db, "+918888888888", raw_otp)
    old.expires_at = datetime.now(timezone.utc) - timedelta(days=31)  # aged AFTER verifying, not before
    db.commit()

    create_otp_request(db, "+919999999999")

    assert db.query(OtpRequest).filter_by(phone_number="+918888888888").first() is not None


def test_create_otp_request_sweep_does_not_touch_recent_unverified_rows():
    db = _session()
    recent, _ = create_otp_request(db, "+918888888888")

    create_otp_request(db, "+919999999999")

    assert db.query(OtpRequest).filter_by(phone_number="+918888888888").first() is not None


def test_delete_otp_requests_for_identifiers_removes_matching_rows_by_value():
    """FR-9 part 2: value match, not a foreign key -- otp_requests has
    never had a user_id column."""
    db = _session()
    create_otp_request(db, "+919999999999")
    create_otp_request(db, "person@example.com", channel="email")
    create_otp_request(db, "+918888888888")  # a different identifier, must survive

    delete_otp_requests_for_identifiers(db, phone_number="+919999999999", email="person@example.com")

    assert db.query(OtpRequest).filter_by(phone_number="+919999999999").first() is None
    assert db.query(OtpRequest).filter_by(email="person@example.com").first() is None
    assert db.query(OtpRequest).filter_by(phone_number="+918888888888").first() is not None


def test_delete_otp_requests_for_identifiers_handles_none_email():
    db = _session()
    create_otp_request(db, "+919999999999")

    delete_otp_requests_for_identifiers(db, phone_number="+919999999999", email=None)

    assert db.query(OtpRequest).filter_by(phone_number="+919999999999").first() is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/services/auth/test_otp.py -k "metadata or resend or sweep or delete_otp_requests" -v`
Expected: FAIL — `metadata` is an unexpected keyword argument, and `delete_otp_requests_for_identifiers` doesn't exist yet.

- [ ] **Step 3: Rewrite `create_otp_request` and add `delete_otp_requests_for_identifiers`**

In `backend/app/services/auth/otp.py`, update the imports and `__all__`:

```python
from app.config import settings
from app.models.auth import OtpRequest
from app.services.auth.device_info import RequestMetadata
from app.services.auth.email_provider import get_email_provider
from app.services.auth.email_templates import otp_email_html

OTP_LENGTH = 6
OTP_TTL_MINUTES = 5
MAX_ATTEMPTS = 5
RESEND_THROTTLE_SECONDS = 60
STALE_UNVERIFIED_RETENTION_DAYS = 30

Channel = Literal["sms", "email"]

__all__ = [
    "OtpVerificationError",
    "OtpRequestThrottledError",
    "create_otp_request",
    "delete_otp_requests_for_identifiers",
    "verify_otp",
]
```

Replace the body of `create_otp_request` (keep `_hash_otp`, `generate_otp`, `_identifier_filter`, `_delivery_mode` unchanged above it):

```python
def create_otp_request(
    db: DbSession,
    identifier: str,
    channel: Channel = "sms",
    metadata: RequestMetadata | None = None,
) -> tuple[OtpRequest, str | None]:
    """Creates or reuses an OtpRequest for either channel. Returns
    (request, raw_otp) — raw_otp is only non-None in dev-stub delivery
    mode.

    FR-9 (auth-flow-redesign, 2026-09-28), all application logic, no
    scheduled job and no new table:
    1. Resend/retry updates the existing unverified row instead of
       inserting a new one (concurrency note: two near-simultaneous
       resends can each read "no existing row" before either commits and
       still produce two rows — an accepted limitation of this pass; a
       real fix needs `SELECT ... FOR UPDATE`, out of scope here).
    2. A 30-day sweep of unverified rows runs as a side effect of every
       call, riding on ordinary traffic instead of a schedule.
    3. See `delete_otp_requests_for_identifiers` below for the third part
       (delete on signup completion), called from identity.py, not here.
    """
    delivery_mode = _delivery_mode(channel)
    if delivery_mode == "stub" and settings.environment == "production":
        raise RuntimeError(
            "Delivery mode 'stub' is not allowed in production for this "
            "channel — this would leak real OTPs in the API response. Set "
            "OTP_DELIVERY_MODE (phone) / EMAIL_DELIVERY_MODE (email) to a "
            "real delivery mode before deploying to production."
        )

    now = datetime.now(timezone.utc)

    # FR-9 part 3: opportunistic sweep, before the throttle lookup below so
    # a just-swept stale row never masks a legitimate resend for the same
    # identifier.
    db.query(OtpRequest).filter(
        OtpRequest.verified_at.is_(None),
        OtpRequest.expires_at < now - timedelta(days=STALE_UNVERIFIED_RETENTION_DAYS),
    ).delete(synchronize_session=False)

    existing = (
        db.query(OtpRequest)
        .filter_by(verified_at=None, **_identifier_filter(channel, identifier))
        .order_by(OtpRequest.created_at.desc())
        .first()
    )
    if existing is not None:
        created_at = existing.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        seconds_since = (now - created_at).total_seconds()
        if seconds_since < RESEND_THROTTLE_SECONDS:
            raise OtpRequestThrottledError(
                f"Please wait {int(RESEND_THROTTLE_SECONDS - seconds_since)}s before requesting another code."
            )

    otp = generate_otp()

    if channel == "email" and delivery_mode != "stub":
        # Attempt the real send BEFORE persisting anything: if this raises
        # (EmailSendError), nothing is written to the DB, so a failed send
        # never engages the resend throttle against the user's next attempt.
        get_email_provider().send_email(
            to=identifier,
            subject="Your Unifolio verification code",
            body=f"Your Unifolio verification code is {otp}. It expires in {OTP_TTL_MINUTES} minutes.",
            html_body=otp_email_html(otp, OTP_TTL_MINUTES),
        )

    meta = metadata or RequestMetadata()

    if existing is not None:
        # FR-9 part 1: upsert on resend — same row, same id, not a new
        # insert. Resets attempt_count to 0, matching today's de facto
        # behavior (a resend already reset it, as a side effect of the old
        # insert-always design).
        request = existing
        request.otp_hash = _hash_otp(otp)
        request.expires_at = now + timedelta(minutes=OTP_TTL_MINUTES)
        request.attempt_count = 0
    else:
        request = OtpRequest(
            phone_number=identifier if channel == "sms" else None,
            email=identifier if channel == "email" else None,
            otp_hash=_hash_otp(otp),
            expires_at=now + timedelta(minutes=OTP_TTL_MINUTES),
            created_at=now,
        )
        db.add(request)

    request.ip_address = meta.ip_address
    request.user_agent = meta.user_agent
    request.device_type = meta.device_type
    request.os_family = meta.os_family
    request.os_version = meta.os_version
    request.browser_family = meta.browser_family
    request.browser_version = meta.browser_version
    request.device_id = meta.device_id

    db.commit()

    raw_otp = otp if delivery_mode == "stub" else None
    return request, raw_otp


def delete_otp_requests_for_identifiers(
    db: DbSession, *, phone_number: str | None, email: str | None, commit: bool = True
) -> None:
    """FR-9 part 2: on signup completion, deletes every otp_requests row
    matching the now-verified phone/email — by value, not a foreign key.
    otp_requests has never had a user_id column (most rows never
    correspond to an account at all); this is the same value-match
    reasoning applied at cleanup time. Called from
    identity.complete_gated_signup, in the same transaction as the
    pending_identity_verifications delete."""
    if phone_number is not None:
        db.query(OtpRequest).filter_by(phone_number=phone_number).delete()
    if email is not None:
        db.query(OtpRequest).filter_by(email=email).delete()
    if commit:
        db.commit()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/services/auth/test_otp.py -v`
Expected: PASS — every pre-existing test in this file plus every new one (the full file, since this is a shared module other tests in the file depend on).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth/otp.py backend/tests/services/auth/test_otp.py
git commit -m "feat(auth): otp_requests retention — upsert on resend, 30-day sweep, delete-by-value helper"
```

---

## Task 4: Generalize signup completion (`complete_gated_signup`)

**Files:**
- Modify: `backend/app/services/auth/identity.py`
- Test: `backend/tests/services/auth/test_identity.py`

**Interfaces:**
- Consumes: `delete_otp_requests_for_identifiers` from `app.services.auth.otp` (Task 3).
- Produces: `complete_gated_signup(db, raw_token, second_provider: AuthIdentityProvider, second_provider_subject: str) -> uuid.UUID` — replaces `complete_phone_gate_signup`; Task 7 is the only caller to update.

**Design note:** `complete_phone_gate_signup(db, raw_token, phone_number)` hardcodes `phone_number` as the `PHONE_OTP` identity and `pending.provider`/`pending.provider_subject` as the *other* identity — correct only because `pending.provider` was never `PHONE_OTP`. Once phone-first signups create `pending.provider = PHONE_OTP` records, this function needs to accept **both** identities explicitly rather than inferring roles from which argument is named `phone_number`. This task replaces it with a symmetric function; there is exactly one caller in the whole codebase (`verify_otp_route`'s pending-token branch in `api/auth.py`), updated in Task 7.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/services/auth/test_identity.py` (extend the existing imports at the top — add `complete_gated_signup`, remove `complete_phone_gate_signup` if present, and add `AuthIdentity`, `OtpRequest` if not already imported):

```python
from app.models.auth import AuthIdentity, OtpRequest
from app.services.auth.identity import complete_gated_signup
from app.services.auth.otp import create_otp_request


def test_complete_gated_signup_email_first_direction_matches_today():
    """The existing email/Google-first shape: pending.provider is
    EMAIL_OTP, the second (completing) identity is PHONE_OTP."""
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.EMAIL_OTP, "person@example.com", "person@example.com", True, matched_user_id=None
    )

    user_id = complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919999999999")

    user = db.get(User, user_id)
    assert user.phone_number == "+919999999999"
    assert user.email == "person@example.com"
    identities = db.query(AuthIdentity).filter_by(user_id=user_id).all()
    assert {i.provider for i in identities} == {AuthIdentityProvider.PHONE_OTP, AuthIdentityProvider.EMAIL_OTP}
    assert db.query(PendingIdentityVerification).count() == 0


def test_complete_gated_signup_phone_first_direction():
    """The new shape: pending.provider is PHONE_OTP, the second
    (completing) identity is EMAIL_OTP."""
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.PHONE_OTP, "+919999999999", "person@example.com", False, matched_user_id=None
    )

    user_id = complete_gated_signup(db, raw_token, AuthIdentityProvider.EMAIL_OTP, "person@example.com")

    user = db.get(User, user_id)
    assert user.phone_number == "+919999999999"
    assert user.email == "person@example.com"
    identities = db.query(AuthIdentity).filter_by(user_id=user_id).all()
    assert {i.provider for i in identities} == {AuthIdentityProvider.PHONE_OTP, AuthIdentityProvider.EMAIL_OTP}
    phone_identity = next(i for i in identities if i.provider == AuthIdentityProvider.PHONE_OTP)
    email_identity = next(i for i in identities if i.provider == AuthIdentityProvider.EMAIL_OTP)
    assert phone_identity.provider_subject == "+919999999999"
    assert email_identity.provider_subject == "person@example.com"
    assert email_identity.email == "person@example.com"
    assert phone_identity.email is None


def test_complete_gated_signup_rejects_a_step_up_link_token():
    db = _session()
    existing = _user(db)
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub", "person@example.com", True, matched_user_id=existing.id
    )

    with pytest.raises(PendingVerificationError, match="linking to an existing account"):
        complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919999999999")


def test_complete_gated_signup_deletes_matching_otp_requests_by_value():
    """FR-9 part 2, exercised end-to-end through the completion function."""
    db = _session_with_otp_requests()
    create_otp_request(db, "+919999999999")
    create_otp_request(db, "person@example.com", channel="email")
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.PHONE_OTP, "+919999999999", "person@example.com", False, matched_user_id=None
    )

    complete_gated_signup(db, raw_token, AuthIdentityProvider.EMAIL_OTP, "person@example.com")

    assert db.query(OtpRequest).filter_by(phone_number="+919999999999").first() is None
    assert db.query(OtpRequest).filter_by(email="person@example.com").first() is None


def test_complete_gated_signup_does_not_persist_an_unverified_email_claim():
    """Same guard complete_phone_gate_signup always had: an unverified
    email claim (email_verified=False) is never written into
    auth_identities.email or users.email."""
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub", "unverified@example.com", False, matched_user_id=None
    )

    user_id = complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919999999999")

    user = db.get(User, user_id)
    assert user.email is None
    google_identity = db.query(AuthIdentity).filter_by(user_id=user_id, provider=AuthIdentityProvider.GOOGLE).one()
    assert google_identity.email is None


def test_complete_gated_signup_sets_google_identity_email_when_verified():
    """Regression test for the pending_identity_email formula above: a
    GOOGLE-pending completion (verified email) must still get its own
    auth_identities.email set, exactly like EMAIL_OTP does and exactly like
    the pre-existing complete_phone_gate_signup always did — only PHONE_OTP
    should ever get None here. Fails if pending_identity_email is computed
    as `verified_email if pending.provider == EMAIL_OTP else None` instead
    of the correct `None if pending.provider == PHONE_OTP else verified_email`."""
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.GOOGLE, "g-sub", "verified@example.com", True, matched_user_id=None
    )

    user_id = complete_gated_signup(db, raw_token, AuthIdentityProvider.PHONE_OTP, "+919999999999")

    google_identity = db.query(AuthIdentity).filter_by(user_id=user_id, provider=AuthIdentityProvider.GOOGLE).one()
    assert google_identity.email == "verified@example.com"
```

Add these two helpers near the top of the file, alongside the existing `_session()`/`_user()` helpers (check whether `Base.metadata.create_all(engine)` in the existing `_session()` already includes `otp_requests` — if `Base.metadata.create_all(engine)` with no `tables=` filter is used, as it appears to be in this file already, it already creates every table including `otp_requests`, so `_session_with_otp_requests` can simply be an alias):

```python
_session_with_otp_requests = _session
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/services/auth/test_identity.py -k complete_gated_signup -v`
Expected: FAIL with `ImportError: cannot import name 'complete_gated_signup'`

- [ ] **Step 3: Replace `complete_phone_gate_signup` with `complete_gated_signup`**

In `backend/app/services/auth/identity.py`, add the import at the top:

```python
from app.services.auth.otp import delete_otp_requests_for_identifiers
```

Replace the entire `complete_phone_gate_signup` function with:

```python
def complete_gated_signup(
    db: DbSession,
    raw_token: str,
    second_provider: AuthIdentityProvider,
    second_provider_subject: str,
) -> uuid.UUID:
    """Only for a brand-new-signup pending record (matched_user_id IS
    NULL) — atomically creates the User plus both identities, whichever
    order they were verified in. Design Spec §1's mandatory second-step
    gate, generalized (auth-flow-redesign, 2026-09-28) to work symmetrically
    in either direction: email/Google-first (pending.provider is
    EMAIL_OTP/GOOGLE, second_provider is PHONE_OTP — today's existing
    shape) or phone-first (pending.provider is PHONE_OTP, second_provider
    is EMAIL_OTP — the new shape). `second_provider`/`second_provider_subject`
    identify whichever identity is being verified RIGHT NOW to complete
    signup; the pending record's own (provider, provider_subject) is
    whichever identity was verified FIRST."""
    pending = _consume_pending_verification(db, raw_token)
    if pending.matched_user_id is not None:
        raise PendingVerificationError(
            "This verification is for linking to an existing account, not creating a new one."
        )

    # An UNVERIFIED email claim (a Google account whose `email_verified` is
    # false) must never be persisted into either `users.email` or
    # `auth_identities.email`: resolve_email_collision treats ANY matching
    # AuthIdentity.email as proof of independent verified ownership
    # (kind="auto_link"), so storing an unverified claim here would let this
    # signup silently capture the real owner's later, genuinely-verified
    # email-OTP signup. Design Spec §2 step 5 / §4.
    #
    # If the identity verified just now (second_provider) is itself the
    # email leg, that email IS verified by definition — its own OTP just
    # succeeded. This only matters for phone-first: pending.email_verified
    # is never flipped for a PHONE_OTP pending record (mark_pending_email_verified
    # is only ever called for the email/Google-first direction).
    if second_provider == AuthIdentityProvider.EMAIL_OTP:
        verified_email = second_provider_subject
    else:
        verified_email = pending.email if pending.email_verified else None

    phone_number = (
        second_provider_subject
        if second_provider == AuthIdentityProvider.PHONE_OTP
        else pending.provider_subject
    )
    second_identity_email = second_provider_subject if second_provider == AuthIdentityProvider.EMAIL_OTP else None
    # NOT `verified_email if pending.provider == EMAIL_OTP else None` -- that
    # would silently drop the email on a GOOGLE-pending completion, breaking
    # resolve_email_collision's ability to find that identity later (it
    # queries AuthIdentity.email across every provider). The original
    # complete_phone_gate_signup set this unconditionally for EMAIL_OTP and
    # GOOGLE alike; PHONE_OTP is the only provider that should ever get None
    # here, since a phone identity has no email of its own.
    pending_identity_email = None if pending.provider == AuthIdentityProvider.PHONE_OTP else verified_email

    now = datetime.now(timezone.utc)
    user = User(phone_number=phone_number, email=verified_email, created_at=now)
    db.add(user)
    db.flush()
    record_identity(db, user.id, second_provider, second_provider_subject, second_identity_email, now, commit=False)
    record_identity(
        db, user.id, pending.provider, pending.provider_subject, pending_identity_email, now, commit=False
    )
    db.delete(pending)
    delete_otp_requests_for_identifiers(db, phone_number=phone_number, email=verified_email, commit=False)
    db.commit()
    return user.id
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/services/auth/test_identity.py -v`
Expected: PASS — the whole file, since `complete_phone_gate_signup` no longer exists and any lingering old references would now fail to import.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth/identity.py backend/tests/services/auth/test_identity.py
git commit -m "refactor(auth): generalize complete_phone_gate_signup into complete_gated_signup"
```

---

## Task 5: `attach_email_to_pending` (phone-first's email-request step)

**Files:**
- Modify: `backend/app/services/auth/identity.py`
- Test: `backend/tests/services/auth/test_identity.py`

**Interfaces:**
- Consumes: `_consume_pending_verification` (existing, same file).
- Produces: `attach_email_to_pending(db, raw_token, email) -> PendingIdentityVerification` — Task 7's `/auth/email-otp/request` handler is the only caller.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/services/auth/test_identity.py`:

```python
from app.services.auth.identity import attach_email_to_pending


def test_attach_email_to_pending_sets_email_on_a_phone_first_record():
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.PHONE_OTP, "+919999999999", None, False, matched_user_id=None
    )

    pending = attach_email_to_pending(db, raw_token, "person@example.com")

    assert pending.email == "person@example.com"
    still_there = db.query(PendingIdentityVerification).filter_by(id=pending.id).first()
    assert still_there is not None
    assert still_there.email == "person@example.com"


def test_attach_email_to_pending_overwrites_a_previously_attached_email():
    """Covers the abandon-and-retry-with-a-different-email case: the
    pending record must reflect the LAST email actually entered, not the
    first."""
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.PHONE_OTP, "+919999999999", "typo@example.com", False, matched_user_id=None
    )

    pending = attach_email_to_pending(db, raw_token, "corrected@example.com")

    assert pending.email == "corrected@example.com"
    still_there = db.query(PendingIdentityVerification).filter_by(id=pending.id).first()
    assert still_there is not None
    assert still_there.email == "corrected@example.com"


def test_attach_email_to_pending_rejects_an_email_or_google_first_record():
    db = _session()
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.EMAIL_OTP, "person@example.com", "person@example.com", False, matched_user_id=None
    )

    with pytest.raises(PendingVerificationError, match="phone-first signup"):
        attach_email_to_pending(db, raw_token, "person@example.com")


def test_attach_email_to_pending_rejects_a_step_up_link_token():
    db = _session()
    existing = _user(db)
    _, raw_token = create_pending_verification(
        db, AuthIdentityProvider.PHONE_OTP, "+919999999999", None, False, matched_user_id=existing.id
    )

    with pytest.raises(PendingVerificationError, match="linking to an existing account"):
        attach_email_to_pending(db, raw_token, "person@example.com")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/services/auth/test_identity.py -k attach_email_to_pending -v`
Expected: FAIL with `ImportError: cannot import name 'attach_email_to_pending'`

- [ ] **Step 3: Write the function**

In `backend/app/services/auth/identity.py`, add directly after `mark_pending_email_verified`:

```python
def attach_email_to_pending(db: DbSession, raw_token: str, email: str) -> PendingIdentityVerification:
    """Phone-first signup's email step (FR-4): records which email the
    caller is about to verify against an already-phone-verified pending
    record, so complete_gated_signup can use it once the email OTP
    succeeds. Only valid for a fresh phone-first pending record — never a
    step-up link (matched_user_id set) or an email/Google-first record
    (those set `email` at creation time via create_pending_verification,
    not here). Overwrites any previously-attached email, so an abandon-
    and-retry with a corrected address always reflects the last one
    entered."""
    pending = _consume_pending_verification(db, raw_token)
    if pending.matched_user_id is not None:
        raise PendingVerificationError(
            "This verification is for linking to an existing account, not creating a new one."
        )
    if pending.provider != AuthIdentityProvider.PHONE_OTP:
        raise PendingVerificationError("This verification token isn't for a phone-first signup.")
    pending.email = email
    db.commit()
    return pending
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/services/auth/test_identity.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth/identity.py backend/tests/services/auth/test_identity.py
git commit -m "feat(auth): add attach_email_to_pending for the phone-first email step"
```

---

## Task 6: Schemas — `flow`, `pending_token` on email request, `EmailRequiredResponse`

**Files:**
- Modify: `backend/app/services/auth/schemas.py`
- Test: `backend/tests/services/auth/test_schemas.py`

**Interfaces:**
- Produces: `OtpVerifyBody.flow: Literal["signup", "login"] | None = None`, `EmailOtpRequestBody.pending_token: str | None = None`, `EmailRequiredDetail`, `EmailRequiredResponse` — Task 7 imports and uses all four.

- [ ] **Step 1: Write the failing tests**

Check `backend/tests/services/auth/test_schemas.py`'s existing style first (open it and match its import/assertion pattern), then add:

```python
from app.services.auth.schemas import EmailOtpRequestBody, EmailRequiredDetail, EmailRequiredResponse, OtpVerifyBody


def test_otp_verify_body_flow_defaults_to_none():
    body = OtpVerifyBody(phone_number="+919999999999", otp="123456")
    assert body.flow is None


def test_otp_verify_body_accepts_signup_flow():
    body = OtpVerifyBody(phone_number="+919999999999", otp="123456", flow="signup")
    assert body.flow == "signup"


def test_otp_verify_body_accepts_login_flow():
    body = OtpVerifyBody(phone_number="+919999999999", otp="123456", flow="login")
    assert body.flow == "login"


def test_email_otp_request_body_pending_token_defaults_to_none():
    body = EmailOtpRequestBody(email="person@example.com")
    assert body.pending_token is None


def test_email_otp_request_body_accepts_pending_token():
    body = EmailOtpRequestBody(email="person@example.com", pending_token="tok")
    assert body.pending_token == "tok"


def test_email_required_response_shape():
    response = EmailRequiredResponse(email_required=EmailRequiredDetail(token="tok", prefill_phone="+919999999999"))
    assert response.email_required.token == "tok"
    assert response.email_required.prefill_phone == "+919999999999"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/services/auth/test_schemas.py -k "flow or pending_token or email_required" -v`
Expected: FAIL — `flow`/`pending_token` are unexpected keyword arguments, `EmailRequiredDetail`/`EmailRequiredResponse` don't exist.

- [ ] **Step 3: Update the schemas**

In `backend/app/services/auth/schemas.py`, change `OtpVerifyBody`:

```python
class OtpVerifyBody(BaseModel):
    phone_number: str
    otp: str
    pending_token: str | None = None
    # auth-flow-redesign FR-3/FR-8a (2026-09-28): disambiguates "signup" vs
    # "login" ONLY when pending_token is absent (when present, the existing
    # pending-token branch logic already knows what it's doing regardless
    # of flow). Omitted entirely preserves the exact legacy behavior every
    # existing test/internal caller relies on — see otp/verify's own
    # docstring in api/auth.py for which branch that is.
    flow: Literal["signup", "login"] | None = None
```

Change `EmailOtpRequestBody`:

```python
class EmailOtpRequestBody(BaseModel):
    email: str
    # auth-flow-redesign FR-4 (2026-09-28): set only when this is the email
    # step of a phone-first signup, attaching the email to the
    # already-phone-verified pending record before the OTP is sent.
    pending_token: str | None = None

    @field_validator("email", mode="before")
    @classmethod
    def _normalize_email(cls, value: object) -> object:
        return normalize_email(value)
```

Add these two new classes directly after `PhoneRequiredResponse`:

```python
class EmailRequiredDetail(BaseModel):
    token: str
    prefill_phone: str | None


class EmailRequiredResponse(BaseModel):
    email_required: EmailRequiredDetail
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/services/auth/test_schemas.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth/schemas.py backend/tests/services/auth/test_schemas.py
git commit -m "feat(auth): add flow, email-request pending_token, and EmailRequiredResponse schemas"
```

---

## Task 7: Wire the routes — metadata capture, phone-first flow, the bug fix

**Files:**
- Modify: `backend/app/api/auth.py`
- Test: `backend/tests/api/test_auth_routes.py`, `backend/tests/api/test_email_otp_routes.py`

**Interfaces:**
- Consumes: `capture_request_metadata` (Task 2), `create_otp_request(..., metadata=...)` and `delete_otp_requests_for_identifiers` (Task 3, the latter used indirectly via Task 4), `complete_gated_signup` and `attach_email_to_pending` (Tasks 4–5), `OtpVerifyBody.flow`, `EmailOtpRequestBody.pending_token`, `EmailRequiredDetail`/`EmailRequiredResponse` (Task 6).
- Produces: the actual HTTP contract change other systems (the frontend, Tasks 9–13) depend on.

**Design note — why the legacy no-`flow` branch stays:** 37 existing test call sites across 15 files (`test_auth_routes.py`, `test_email_otp_routes.py`, `test_account_deletion_routes.py`, `test_contact_change_routes.py`, and 11 dashboard/analytics/imports route test files) call `/auth/otp/verify` with no `pending_token` and no `flow`, purely as boilerplate to obtain an authenticated session for an unrelated test. Making `flow` required, or changing the no-`flow` default, would force editing all 37 call sites for no behavioral benefit — none of them are testing signup semantics. Instead: **`flow=None` preserves today's exact behavior** (existing identity → log in; no existing identity → create a user unconditionally). The bug is fixed for every *real* caller because the redesigned frontend (Task 13) always sends `flow` explicitly. This is a deliberate, scoped backward-compatibility carve-out, not an oversight — do not "finish the job" by making `flow` required without re-auditing all 37 call sites first.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/api/test_auth_routes.py`:

```python
def test_otp_verify_with_flow_signup_for_new_phone_returns_email_required(client):
    phone = "+919444444444"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]

    response = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": otp, "flow": "signup"}
    )

    assert response.status_code == 200
    body = response.json()
    assert "email_required" in body
    assert body["email_required"]["token"]
    assert body["email_required"]["prefill_phone"] == phone


def test_otp_verify_with_flow_login_for_unknown_phone_returns_401(client):
    phone = "+919333322222"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]

    response = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": otp, "flow": "login"}
    )

    assert response.status_code == 401
    assert "sign up instead" in response.json()["detail"]


def test_otp_verify_with_flow_login_for_known_phone_logs_in(client):
    """A phone that already completed the full phone-first flow (see
    test_email_otp_routes.py for that full path) still logs in normally
    with flow=login."""
    phone = "+919222211111"
    otp1 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    signup_result = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": otp1, "flow": "signup"}
    ).json()
    email_token = signup_result["email_required"]["token"]
    email_otp = client.post(
        "/auth/email-otp/request", json={"email": "known@example.com", "pending_token": email_token}
    ).json()["otp"]
    first_session = client.post(
        "/auth/email-otp/verify", json={"email": "known@example.com", "otp": email_otp, "pending_token": email_token}
    ).json()

    otp2 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    response = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp2, "flow": "login"})

    assert response.status_code == 200
    assert response.json()["user_id"] == first_session["user_id"]


def test_otp_verify_with_flow_signup_for_already_registered_phone_logs_in_instead_of_erroring(client):
    """Review Focus: someone who forgot they already have an account
    shouldn't be blocked -- the number proves nothing malicious, so
    flow=signup gracefully logs them in rather than erroring."""
    phone = "+919111133333"
    otp1 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp1})  # legacy path creates the account
    otp2 = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]

    response = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp2, "flow": "signup"})

    assert response.status_code == 200
    assert "session_token" in response.json()


def test_otp_verify_without_flow_or_pending_token_still_creates_a_user_unconditionally(client):
    """Legacy behavior, deliberately preserved — see this task's design
    note. This is NOT the redesigned frontend's behavior; it's what every
    other route test's auth-setup boilerplate (and any un-updated caller)
    still gets."""
    phone = "+919111100000"
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]

    response = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp})

    assert response.status_code == 200
    assert "session_token" in response.json()
```

Add to `backend/tests/api/test_email_otp_routes.py`:

```python
def test_phone_first_signup_end_to_end(client):
    """The full new flow: phone verifies first, then email, then the
    account exists with both identities."""
    phone = "+919777788888"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    phone_result = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": phone_otp, "flow": "signup"}
    ).json()
    pending_token = phone_result["email_required"]["token"]

    email_otp = client.post(
        "/auth/email-otp/request", json={"email": "phonefirst@example.com", "pending_token": pending_token}
    ).json()["otp"]

    response = client.post(
        "/auth/email-otp/verify",
        json={"email": "phonefirst@example.com", "otp": email_otp, "pending_token": pending_token},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["session_token"]


def test_phone_first_signup_deletes_otp_requests_on_completion(client):
    """Confirmed pattern: the `client` fixture overrides `get_db` with its
    own TestSessionLocal bound to the test engine (see conftest.py) --
    `app.db.session.SessionLocal` is bound to the *production* engine and
    would silently query the wrong database here. Reach the test database
    through the override itself, exactly as
    tests/api/test_analytics_route.py's `_seed_section` helper already
    does."""
    from app.db.session import get_db
    from app.main import app
    from app.models.auth import OtpRequest

    phone = "+919777799999"
    phone_otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    pending_token = client.post(
        "/auth/otp/verify", json={"phone_number": phone, "otp": phone_otp, "flow": "signup"}
    ).json()["email_required"]["token"]
    email_otp = client.post(
        "/auth/email-otp/request", json={"email": "cleanup@example.com", "pending_token": pending_token}
    ).json()["otp"]

    client.post(
        "/auth/email-otp/verify",
        json={"email": "cleanup@example.com", "otp": email_otp, "pending_token": pending_token},
    )

    override = app.dependency_overrides[get_db]
    db = next(override())
    assert db.query(OtpRequest).filter_by(phone_number=phone).first() is None
    assert db.query(OtpRequest).filter_by(email="cleanup@example.com").first() is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/api/test_auth_routes.py tests/api/test_email_otp_routes.py -k "flow or phone_first" -v`
Expected: FAIL — `flow` unrecognized, `email_required` never returned.

- [ ] **Step 3: Update the imports in `api/auth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session as DbSession

from app.db.session import get_db #dependency for database session
from app.models.auth import AuthIdentity, Session as SessionModel
from app.models.enums import AuthIdentityProvider
from app.models.user import User
from app.services.auth.device_info import capture_request_metadata
from app.services.auth.identity import (
    PendingVerificationError,
    attach_email_to_pending,
    attach_pending_identity,
    complete_gated_signup,
    create_pending_verification,
    find_identity_by_subject,
    find_or_backfill_phone_identity,
    mark_pending_email_verified,
    peek_pending_link_info,
    record_identity,
    resolve_new_verified_identity,
)
from app.services.auth.account_deletion import reactivate_account, schedule_account_deletion
from app.services.auth.email_provider import EmailSendError
from app.services.auth.google_oauth import GoogleTokenVerificationError, verify_google_id_token
from app.services.auth.otp import OtpRequestThrottledError, OtpVerificationError, create_otp_request, verify_otp
from app.services.auth.schemas import (
    EmailOtpRequestBody,
    EmailOtpRequiredDetail,
    EmailOtpRequiredResponse,
    EmailOtpVerifyBody,
    EmailRequiredDetail,
    EmailRequiredResponse,
    GoogleAuthBody,
    LinkRequiredDetail,
    LinkRequiredResponse,
    MeResponse,
    OtpRequestBody,
    OtpRequestResponse,
    OtpVerifyBody,
    OtpVerifyResponse,
    PhoneRequiredDetail,
    PhoneRequiredResponse,
    PROVIDER_TO_METHOD_LABEL,
    SessionRefreshResponse,
    SignupEmailBody,
    UpdateMeBody,
    AccountDeletionBody,
    ContactChangeRequestBody,
    ContactChangeVerifyBody,
) #to validate api requests
from app.services.auth.session import create_session, get_active_user, get_current_session, get_current_user, refresh_session
```

- [ ] **Step 4: Update `/auth/otp/request` to capture metadata**

```python
@router.post("/otp/request", response_model=OtpRequestResponse)
def request_otp(body: OtpRequestBody, request: Request, db: DbSession = Depends(get_db)):
    # Same collision this route's own verify step already rejects (see
    # verify_otp_route below) -- checked here too, before an OTP is even sent,
    # so a fresh email signup's phone gate matches signup_email's own UX: the
    # "already exists" error shows immediately on the number-entry screen
    # instead of only after the caller types a code. Only applies to the
    # EMAIL_OTP phone-gate case; other pending-token providers (e.g. Google
    # linking a second method) legitimately proceed to send the OTP.
    if body.pending_token:
        try:
            link_info = peek_pending_link_info(db, body.pending_token)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

        if link_info.provider == AuthIdentityProvider.EMAIL_OTP:
            existing = find_or_backfill_phone_identity(db, body.phone_number)
            if existing is not None:
                raise HTTPException(
                    status_code=409,
                    detail="An account with this phone number already exists.",
                )

    try:
        _, raw_otp = create_otp_request(db, body.phone_number, metadata=capture_request_metadata(request))
    except OtpRequestThrottledError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    return OtpRequestResponse(message="OTP sent.", otp=raw_otp)
```

(Only the `def request_otp(...)` line and the `create_otp_request(...)` call change — everything else in this function is unchanged from today.)

- [ ] **Step 5: Update `verify_otp_route`**

```python
@router.post(
    "/otp/verify",
    response_model=OtpVerifyResponse | LinkRequiredResponse | PhoneRequiredResponse | EmailRequiredResponse,
)
def verify_otp_route(body: OtpVerifyBody, db: DbSession = Depends(get_db)):
    try:
        verify_otp(db, body.phone_number, body.otp)
    except OtpVerificationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    if body.pending_token:
        try:
            link_info = peek_pending_link_info(db, body.pending_token)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

        existing = find_or_backfill_phone_identity(db, body.phone_number)
        if existing is not None:
            if link_info.provider == AuthIdentityProvider.EMAIL_OTP:
                # Fresh email signup's mandatory phone gate: signup_email
                # already proved this email is brand-new (no existing
                # identity), so a phone match here belongs to a DIFFERENT,
                # unrelated account -- attaching would silently sign the
                # caller into someone else's account. Mirrors signup_email's
                # own already-exists 409. Other providers (e.g. Google) reach
                # this same branch legitimately to link a second login
                # method to an existing account they just proved they own
                # via phone OTP -- left untouched, see peek_pending_link_info.
                raise HTTPException(
                    status_code=409,
                    detail="An account with this phone number already exists.",
                )
            try:
                user_id = attach_pending_identity(db, body.pending_token, existing.user_id)
            except PendingVerificationError as exc:
                raise HTTPException(status_code=401, detail=str(exc)) from exc
        else:
            try:
                user_id = complete_gated_signup(
                    db, body.pending_token, AuthIdentityProvider.PHONE_OTP, body.phone_number
                )
            except PendingVerificationError as exc:
                raise HTTPException(status_code=401, detail=str(exc)) from exc
        return _session_response(user_id, AuthIdentityProvider.PHONE_OTP, db)

    # Phone uses find_or_backfill_phone_identity so a pre-0005-backfill `users`
    # row (identity row missing) logs in normally instead of falling through to
    # the branches below and violating users.phone_number UNIQUE.
    existing = find_or_backfill_phone_identity(db, body.phone_number)
    if existing is not None:
        return _session_response(existing.user_id, AuthIdentityProvider.PHONE_OTP, db)

    if body.flow == "login":
        raise HTTPException(status_code=401, detail="No account found for that phone number — sign up instead.")

    if body.flow == "signup":
        # FR-3 (auth-flow-redesign, 2026-09-28): phone verifies first now --
        # stage a pending record and wait for email, instead of completing
        # signup on the spot. This is what retires the old
        # unconditional-creation bug for every caller that declares its
        # flow explicitly (the redesigned frontend always does) -- see the
        # flow-omitted legacy branch below for who's still exempt.
        _, raw_token = create_pending_verification(
            db, AuthIdentityProvider.PHONE_OTP, body.phone_number, None, False, matched_user_id=None
        )
        return EmailRequiredResponse(
            email_required=EmailRequiredDetail(token=raw_token, prefill_phone=body.phone_number)
        )

    # Legacy path, flow omitted entirely (no pending_token either) -- see
    # this task's "Design note" above. Every internal test fixture that
    # uses a bare phone-verify call purely to obtain an authenticated
    # session for unrelated tests lands here, unchanged. The redesigned
    # frontend always sends an explicit flow; only an un-updated caller
    # reaches this branch.
    now = datetime.now(timezone.utc)
    user = User(phone_number=body.phone_number, created_at=now)
    db.add(user)
    db.flush()
    record_identity(db, user.id, AuthIdentityProvider.PHONE_OTP, body.phone_number, None, now)
    db.commit()
    return _session_response(user.id, AuthIdentityProvider.PHONE_OTP, db)
```

- [ ] **Step 6: Update `/auth/email-otp/request` and `/auth/email-otp/verify`**

```python
@router.post("/email-otp/request", response_model=OtpRequestResponse)
def request_email_otp(body: EmailOtpRequestBody, request: Request, db: DbSession = Depends(get_db)):
    if body.pending_token:
        # FR-4: this is the email step of a phone-first signup -- attach the
        # email to the already-phone-verified pending record before sending
        # the code, so complete_gated_signup can use it once verified.
        try:
            attach_email_to_pending(db, body.pending_token, body.email)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

    try:
        _, raw_otp = create_otp_request(db, body.email, channel="email", metadata=capture_request_metadata(request))
    except OtpRequestThrottledError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except EmailSendError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return OtpRequestResponse(message="OTP sent.", otp=raw_otp)


@router.post("/email-otp/verify", response_model=OtpVerifyResponse | PhoneRequiredResponse)
def verify_email_otp(body: EmailOtpVerifyBody, db: DbSession = Depends(get_db)):
    try:
        verify_otp(db, body.email, body.otp, channel="email")
    except OtpVerificationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    if body.pending_token:
        try:
            link_info = peek_pending_link_info(db, body.pending_token)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

        if link_info.matched_user_id is not None:
            # Step-up re-auth (LinkAccountPrompt's email branch): this is a
            # genuine link_required collision token, already tied to a
            # specific account by resolve_new_verified_identity against an
            # email independently verified earlier (e.g. by Google) --
            # attach directly to that account. Deliberately NOT looked up
            # via find_identity_by_subject(body.email): an EMAIL_OTP
            # pending token's own provider_subject is self-chosen at
            # signup_email time with no ownership check, so looking up
            # "does an account already exist for this email" here would
            # let an attacker pre-claim an arbitrary victim email by
            # verifying their own unrelated, genuinely-valid OTP.
            #
            # matched_user_id itself can't be forged (it's server-derived
            # from Google's own verified claim), but that alone only
            # proves *some* email collided with *some* account -- not that
            # THIS request just verified control of the SPECIFIC contested
            # address. Require that too, or any OTP the caller can pass
            # for any email they control would satisfy this step-up.
            if link_info.email != body.email:
                raise HTTPException(status_code=401, detail="This verification code doesn't match this signup.")
            try:
                user_id = attach_pending_identity(db, body.pending_token, link_info.matched_user_id)
            except PendingVerificationError as exc:
                raise HTTPException(status_code=401, detail=str(exc)) from exc
            return _session_response(user_id, AuthIdentityProvider.EMAIL_OTP, db)

        if link_info.provider == AuthIdentityProvider.PHONE_OTP:
            # FR-5: phone-first signup's mandatory email gate -- email is
            # the final step here, so this completes signup directly
            # instead of flipping an intermediate flag and handing off to
            # another step.
            try:
                user_id = complete_gated_signup(
                    db, body.pending_token, AuthIdentityProvider.EMAIL_OTP, body.email
                )
            except PendingVerificationError as exc:
                raise HTTPException(status_code=401, detail=str(exc)) from exc
            return _session_response(user_id, AuthIdentityProvider.EMAIL_OTP, db)

        # Fresh signup (matched_user_id is None, provider is EMAIL_OTP or
        # GOOGLE): flip the pending record's verified flag, hand off to the
        # existing mandatory phone gate -- unchanged from today. Never
        # eligible to attach to an existing account, no matter whose email
        # it claims.
        try:
            pending = mark_pending_email_verified(db, body.pending_token, body.email)
        except PendingVerificationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        return PhoneRequiredResponse(phone_required=PhoneRequiredDetail(token=body.pending_token, prefill_email=pending.email))

    # Plain login: no pending record involved at all, just an existing identity.
    existing = find_identity_by_subject(db, AuthIdentityProvider.EMAIL_OTP, body.email)
    if existing is None:
        raise HTTPException(status_code=401, detail="No account found for that email — sign up instead.")
    return _session_response(existing.user_id, AuthIdentityProvider.EMAIL_OTP, db)
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && pytest tests/api/ -v`
Expected: PASS — the entire `tests/api/` directory, not just the new tests. This is the step that proves the 37 pre-existing no-`flow` call sites across 15 files are genuinely unaffected.

- [ ] **Step 8: Run the full backend test suite**

Run: `cd backend && pytest -v`
Expected: PASS, all files — confirms `test_identity.py`'s removal of `complete_phone_gate_signup` (Task 4) hasn't broken anything importing it elsewhere, and every other unrelated suite (dashboard, imports, analytics) still passes using the legacy no-`flow` phone-verify path.

- [ ] **Step 9: Commit**

```bash
git add backend/app/api/auth.py backend/tests/api/test_auth_routes.py backend/tests/api/test_email_otp_routes.py
git commit -m "feat(auth): wire phone-first flow, metadata capture, and the login/signup disambiguation fix into the routes"
```

---

## Task 8: Frontend types — `EmailRequiredResponse`

**Files:**
- Modify: `frontend/src/features/auth/types.ts`

**Interfaces:**
- Produces: `EmailRequiredDetail`, `EmailRequiredResponse`, `isEmailRequired`, widened `OtpVerifyResult` — Tasks 10–13 use all four.

This task has no backend/pytest equivalent (a pure type-definition file, verified by the TypeScript compiler in the tasks that consume it) — its "test" is Task 13 compiling and running cleanly.

- [ ] **Step 1: Add the new types**

In `frontend/src/features/auth/types.ts`, add after `PhoneRequiredResponse`:

```typescript
export interface EmailRequiredDetail {
  token: string;
  prefill_phone: string | null;
}

export interface EmailRequiredResponse {
  email_required: EmailRequiredDetail;
}
```

Change the `OtpVerifyResult` union and add the new type guard, directly below the existing ones:

```typescript
export type OtpVerifyResult = OtpVerifyResponse | LinkRequiredResponse | PhoneRequiredResponse | EmailRequiredResponse;

export type EmailOtpVerifyResult = OtpVerifyResponse | PhoneRequiredResponse;

export function isLinkRequired(result: OtpVerifyResult): result is LinkRequiredResponse {
  return "link_required" in result;
}

export function isPhoneRequired(result: OtpVerifyResult): result is PhoneRequiredResponse {
  return "phone_required" in result;
}

export function isEmailRequired(result: OtpVerifyResult): result is EmailRequiredResponse {
  return "email_required" in result;
}
```

(`EmailOtpVerifyResult` is unchanged — email verify's own response never grows a new shape, only phone verify's does.)

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors (existing unrelated errors, if any, are out of scope — compare against a baseline run before this change if the codebase isn't currently clean).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/auth/types.ts
git commit -m "feat(auth): add EmailRequiredResponse frontend type"
```

---

## Task 9: Device-ID generation utility

**Files:**
- Create: `frontend/src/features/auth/deviceId.ts`
- Test: `frontend/src/features/auth/deviceId.test.ts`

**Interfaces:**
- Produces: `getOrCreateDeviceId(): string` — Task 10 uses this in `api.ts`.

Confirmed: this repo already runs Vitest (`frontend/vitest.config.ts`, `"test": "vitest run"` in `package.json`, existing `*.test.tsx` files under `frontend/src/`) — use it directly, no new framework needed.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/auth/deviceId.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { getOrCreateDeviceId } from "./deviceId";

describe("getOrCreateDeviceId", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("generates and persists a device id on first call", () => {
    const id = getOrCreateDeviceId();

    expect(id).toBeTruthy();
    expect(window.localStorage.getItem("unifolio_device_id")).toBe(id);
  });

  it("returns the same id on subsequent calls", () => {
    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();

    expect(second).toBe(first);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/auth/deviceId.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write the module**

Create `frontend/src/features/auth/deviceId.ts`:

```typescript
// Client-generated device identifier for OTP-request metadata
// (auth-flow-redesign FR-2, 2026-09-28). This is a self-issued marker the
// browser cooperates in carrying around, not a hardware identifier -- it's
// cleared by clearing site data or private browsing, which is expected.
const DEVICE_ID_STORAGE_KEY = "unifolio_device_id";

export function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const generated = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    // Private browsing / blocked storage: fall back to a fresh,
    // non-persisted id rather than failing the request.
    return crypto.randomUUID();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/auth/deviceId.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/auth/deviceId.ts frontend/src/features/auth/deviceId.test.ts
git commit -m "feat(auth): add client-side device-id generator"
```

---

## Task 10: Frontend API client — `flow`, email-request `pendingToken`, device-id header

**Files:**
- Modify: `frontend/src/features/auth/api.ts`

**Interfaces:**
- Consumes: `getOrCreateDeviceId` (Task 9), `EmailRequiredResponse`/widened `OtpVerifyResult` (Task 8).
- Produces: widened `verifyOtp(phoneNumber, otp, pendingToken?, flow?)`, widened `requestEmailOtp(email, pendingToken?)` — Task 13 calls both with their new parameters.

- [ ] **Step 1: Update `requestOtp` and `requestEmailOtp` to send the device-id header**

In `frontend/src/features/auth/api.ts`, add the import:

```typescript
import { getOrCreateDeviceId } from "./deviceId";
```

Update `requestOtp`:

```typescript
export async function requestOtp(phoneNumber: string, pendingToken?: string): Promise<OtpRequestResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": getOrCreateDeviceId() },
    body: JSON.stringify({
      phone_number: phoneNumber,
      ...(pendingToken ? { pending_token: pendingToken } : {}),
    }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpRequestResponse;
}
```

Update `requestEmailOtp` to add both the device-id header and the new `pendingToken` parameter:

```typescript
export async function requestEmailOtp(email: string, pendingToken?: string): Promise<OtpRequestResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/email-otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": getOrCreateDeviceId() },
    body: JSON.stringify({
      email,
      ...(pendingToken ? { pending_token: pendingToken } : {}),
    }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpRequestResponse;
}
```

- [ ] **Step 2: Update `verifyOtp` to accept `flow`**

```typescript
export async function verifyOtp(
  phoneNumber: string,
  otp: string,
  pendingToken?: string,
  flow?: "signup" | "login",
): Promise<OtpVerifyResult> {
  const response = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone_number: phoneNumber,
      otp,
      ...(pendingToken ? { pending_token: pendingToken } : {}),
      ...(flow ? { flow } : {}),
    }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpVerifyResult;
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors ONLY at `AuthEntryFlow.tsx`'s existing call sites for `requestEmailOtp`/`verifyOtp` if any pass fewer/more args than TypeScript now expects — there should be none yet, since both new parameters are optional and every existing call site already compiles against the old signature. If `tsc` reports anything here, stop and re-check this task's diff before moving on; Task 13 is where call sites actually change.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/auth/api.ts
git commit -m "feat(auth): thread flow and pendingToken through the API client, attach device-id header"
```

---

## Task 11: `EmailEntry` — new `emailGate` context

**Files:**
- Modify: `frontend/src/features/auth/EmailEntry.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `EmailEntryProps.context` gains `"emailGate"` — Task 13 renders `<EmailEntry context="emailGate" .../>`.

- [ ] **Step 1: Add the new context value and its copy**

In `frontend/src/features/auth/EmailEntry.tsx`, update the props type and the heading logic:

```typescript
interface EmailEntryProps {
  /** "login": direct email login from landing. "link": step-up re-authentication
    * against an account that already exists. "primary": legacy entry point with
    * both actions. "emailGate": completing the mandatory email step after a
    * phone-first signup — different copy, no "Log in instead" button
    * (auth-flow-redesign FR-4, 2026-09-28), mirroring PhoneEntry's
    * "phoneGate" context for the opposite direction. Defaults to "login". */
  context?: "primary" | "login" | "link" | "emailGate";
  onSignup?: (email: string) => void;
  onLogin: (email: string) => void;
  onBack?: () => void;
  submitting: boolean;
  error: string | null;
}

export function EmailEntry({ context = "login", onSignup, onLogin, onBack, submitting, error }: EmailEntryProps) {
  const [email, setEmail] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isTouched, setIsTouched] = useState(false);

  const isLoginOnly = context === "login" || context === "link";
  const isEmailGate = context === "emailGate";
```

Update the heading + add a description line (the existing component has no description paragraph at all today — add one, directly below the `<h1>`, matching `PhoneEntry`'s pattern):

```tsx
        <div>
          <h1 className="font-display font-bold text-[30px] xs:text-[32px] sm:text-[36px] text-[var(--color-ink)] tracking-tight leading-[1.08]">
            {isEmailGate ? "One more step" : isLoginOnly ? "Log in with email" : "Continue with email"}
          </h1>
          {isEmailGate && (
            <p className="text-[13px] sm:text-[14px] text-[#5C5C5C] dark:text-[#A3A3A3] font-normal leading-relaxed pt-2">
              Verify your email to finish creating your account.
            </p>
          )}
        </div>
```

(No change needed to the `submit()` function or the "Log in instead" button's `{context === "primary" && ...}` guard — `isEmailGate` already falls through to the "signup" action via the existing `isLoginOnly ? "login" : "signup"` ternary, and the secondary button already only renders for `context === "primary"`, so `emailGate` naturally shows just the one submit button.)

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors — this is an additive change to a union type, and no existing caller passes `context="emailGate"` yet.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/auth/EmailEntry.tsx
git commit -m "feat(auth): add emailGate context to EmailEntry for the phone-first email step"
```

---

## Task 12: `Landing` — phone-first signup CTA, Google hidden from signup mode

**Files:**
- Modify: `frontend/src/features/auth/Landing.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `LandingProps` drops `onSignup` (no longer called from this component) and gains `onStartPhoneSignup: () => void` — Task 13 wires this to a new handler.

**Assumption to confirm on review:** email-first entry's *frontend* UI is removed from the signup screen (matching Google's "hidden from signup UI" treatment) but its backend (`/auth/signup/email` and everything behind it) is left completely intact, exactly like Google — PRD-05 only explicitly addressed Google's hidden-not-removed status; this task extends the same treatment to email-first entry's UI by inference, since "reordering the mandatory signup sequence to phone-first" (PRD-05 §Scope) means email-first is no longer *an entry option* in the signup UI at all. If this reading is wrong, this task is a one-file, easily-reverted change.

- [ ] **Step 1: Replace the signup-mode branch**

In `frontend/src/features/auth/Landing.tsx`, remove the `email`/`validationError`/`isTouched` state and the `handleEmailChange`/`handleEmailBlur`/`handleSignupSubmit` functions (all three `validateEmail` call sites in the file live inside these three functions, and only these — confirmed by inspection). `GoogleButton`, `Mail`, and `isAccountExistsError` are each used elsewhere in the file (login mode's own `<GoogleButton>` and `<Mail>` icon, and the shared error-alert block) — keep all three imports.

Update the props interface:

```typescript
interface LandingProps {
  initialMode?: "login" | "signup";
  onModeChange?: (mode: "login" | "signup") => void;
  onStartPhoneSignup: () => void;
  onSelectEmail: () => void;
  onSelectPhone: () => void;
  onGoogleCredential: (idToken: string) => void;
  error: string | null;
  submitting: boolean;
}

export function Landing({
  initialMode = "signup",
  onModeChange,
  onStartPhoneSignup,
  onSelectEmail,
  onSelectPhone,
  onGoogleCredential,
  error,
  submitting,
}: LandingProps) {
  // Mode state initialized from prop to preserve auth context on back navigation
  const [mode, setMode] = useState<"login" | "signup">(initialMode);

  const goToLogin = () => {
    setMode("login");
    onModeChange?.("login");
  };
```

Replace the entire signup-mode JSX block (everything from `{mode === "signup" ? (` through its matching `) : (` for login mode) with:

```tsx
      {mode === "signup" ? (
        /* Sign Up Experience (Default) -- phone-first, sequential
           (auth-flow-redesign, 2026-09-28): a single CTA into the existing
           phone step, no email input and no Google button on this screen.
           Google's backend path is untouched, just not offered here. */
        <div key="signup-mode" className="space-y-4 animate-in fade-in duration-200">
          <Button
            type="button"
            onClick={onStartPhoneSignup}
            disabled={submitting}
            aria-label="Continue with phone"
            className="w-full h-14 sm:h-[58px] px-8 rounded-full font-bold text-[15px] sm:text-base bg-[#22C55E] hover:bg-[#22C55E]/90 dark:bg-[#22C55E] dark:hover:bg-[#22C55E]/90 text-white shadow-xl shadow-[#22C55E]/25 dark:shadow-[#22C55E]/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5 border border-[#22C55E]/40 min-h-[52px]"
          >
            <span>Continue with phone</span>
            <ArrowRight className="h-4.5 w-4.5" />
          </Button>

          {/* Toggle Helper Link */}
          <div className="text-center text-xs text-[#5C5C5C] dark:text-[#A3A3A3] pt-1.5 font-body">
            <span>Already have an account? </span>
            <button
              type="button"
              onClick={goToLogin}
              className="font-bold text-[#22C55E] hover:underline cursor-pointer transition-colors focus-visible:outline-none py-1"
            >
              <HandDrawnUnderline>Log in</HandDrawnUnderline>
            </button>
          </div>
        </div>
      ) : (
```

(Leave the rest of the file — the login-mode branch, the header, the error-alert block above the form — exactly as it is. The error-alert block references `isAccountExistsError`/`validationError`; since signup mode no longer produces a `validationError`, that local variable simply stays `null` for signup mode now, which the existing `{error && !validationError && (...)}` guard already handles correctly with no code change needed there.)

- [ ] **Step 2: Remove the now-dead `validateEmail` import**

At the top of the file, change:

```typescript
import { isAccountExistsError, validateEmail } from "./validation";
```

to:

```typescript
import { isAccountExistsError } from "./validation";
```

(`GoogleButton` and `Mail` stay imported — both still used by the login-mode branch below, untouched by this task.)

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors at `AuthEntryFlow.tsx`'s `<Landing onSignup={...} .../>` call site (prop no longer exists) — expected and fixed in Task 13, not here.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/auth/Landing.tsx
git commit -m "feat(auth): replace Landing's signup-mode email form with a phone-first CTA"
```

---

## Task 13: `AuthEntryFlow` — wire the new phone-first path end to end

**Files:**
- Modify: `frontend/src/features/auth/AuthEntryFlow.tsx`

**Interfaces:**
- Consumes: everything from Tasks 8–12.
- Produces: the actual working UI — this is the task where the feature becomes usable.

- [ ] **Step 1: Update imports and add new state**

```typescript
import { useState } from "react";
import { Landing } from "./Landing";
import { EmailEntry } from "./EmailEntry";
import { PhoneEntry } from "./PhoneEntry";
import { OtpVerify } from "./OtpVerify";
import { LinkAccountPrompt } from "./LinkAccountPrompt";
import { AuthShowcasePanel } from "./AuthShowcasePanel";
import { AuthShell } from "./AuthShell";
import type { AuthStep } from "./AuthShell";
import {
  requestEmailOtp,
  requestOtp,
  signupEmail,
  verifyEmailOtp,
  verifyGoogleCredential,
  verifyOtp,
} from "./api";
import { isEmailRequired, isLinkRequired, isPhoneRequired } from "./types";
import type { ExistingMethod } from "./types";
import { useAuth } from "./AuthContext";
import { formatAuthErrorMessage } from "./validation";
```

Add new state, directly after the existing `phoneGateToken`/`phoneGatePrefillEmail` pair:

```typescript
  // Phone-first email gate (auth-flow-redesign FR-3/FR-4, 2026-09-28): set
  // when a phone verification returns email_required -- the mirror image
  // of phoneGateToken/phoneGatePrefillEmail above, for the opposite
  // direction.
  const [emailGateToken, setEmailGateToken] = useState<string | null>(null);
  const [emailGatePrefillPhone, setEmailGatePrefillPhone] = useState<string | null>(null);
```

Update the `emailOtpFlow` type to add the new value:

```typescript
  const [emailOtpFlow, setEmailOtpFlow] = useState<"signup" | "login" | "phone_first">("signup");
```

- [ ] **Step 2: Add `handleSignupPhoneStart`, remove `handleEmailSignup`'s Landing wiring**

`handleEmailSignup` stays defined exactly as it is today (email-first signup's backend path is kept intact, per Task 12's stated assumption) — it simply has no button calling it anymore after Task 12. Add a new handler directly after `handleSelectPhone`:

```typescript
  const handleSignupPhoneStart = () => {
    setAuthMode("signup");
    setPhoneGateToken(null);
    setPhoneGatePrefillEmail(null);
    goToStep("phone");
  };
```

- [ ] **Step 3: Rewrite `handlePhoneOtpSubmit`**

```typescript
  const handlePhoneOtpSubmit = async (otp: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyOtp(
        identifier,
        otp,
        phoneGateToken ?? undefined,
        phoneGateToken ? undefined : authMode,
      );
      if (isEmailRequired(result)) {
        setEmailOtpFlow("phone_first");
        setEmailGateToken(result.email_required.token);
        setEmailGatePrefillPhone(result.email_required.prefill_phone);
        goToStep("email");
        return;
      }
      if (isLinkRequired(result) || isPhoneRequired(result)) {
        setError("Something unexpected happened. Please try again.");
        return;
      }
      await login(result.session_token);
    } catch (err) {
      setError(errorMessage(err, "That code didn't work. Try again."));
    } finally {
      setSubmitting(false);
    }
  };
```

- [ ] **Step 4: Add `handleEmailGateSubmit`, rewrite `handleEmailOtpSubmit` and `handleEmailOtpResend`**

Add a new handler directly after `handleEmailLoginRequest`:

```typescript
  const handleEmailGateSubmit = async (email: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestEmailOtp(email, emailGateToken ?? undefined);
      setEmailOtpFlow("phone_first");
      setEmailOtpEmail(email);
      goToStep("email_otp");
      setDevOtp(result.otp);
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the code. Try again."));
    } finally {
      setSubmitting(false);
    }
  };
```

Rewrite `handleEmailOtpSubmit`:

```typescript
  const handleEmailOtpSubmit = async (otp: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyEmailOtp(
        emailOtpEmail,
        otp,
        emailOtpFlow === "phone_first" ? emailGateToken ?? undefined : emailOtpToken ?? undefined,
      );
      if ("session_token" in result) {
        await login(result.session_token);
        return;
      }
      if ("phone_required" in result) {
        // Only reachable for the email/Google-first direction -- phone-first's
        // email step always completes signup directly (session_token above).
        setPhoneGateToken(result.phone_required.token);
        setPhoneGatePrefillEmail(result.phone_required.prefill_email);
        goToStep("phone");
        return;
      }
      setError("Something unexpected happened. Please try again.");
    } catch (err) {
      setError(errorMessage(err, "That code didn't work. Try again."));
    } finally {
      setSubmitting(false);
    }
  };
```

Rewrite `handleEmailOtpResend`:

```typescript
  const handleEmailOtpResend = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestEmailOtp(
        emailOtpEmail,
        emailOtpFlow === "phone_first" ? emailGateToken ?? undefined : undefined,
      );
      setDevOtp(result.otp);
    } catch (err) {
      setError(errorMessage(err, "Couldn't resend the code. Try again."));
    } finally {
      setSubmitting(false);
    }
  };
```

- [ ] **Step 5: Update `renderFormSlot`'s `landing`, `email`, and `email_otp` cases**

```typescript
      case "landing":
        return (
          <Landing
            initialMode={authMode}
            onModeChange={(newMode) => {
              setError(null);
              setDevOtp(null);
              setAuthMode(newMode);
            }}
            onStartPhoneSignup={handleSignupPhoneStart}
            onSelectEmail={handleSelectEmail}
            onSelectPhone={handleSelectPhone}
            onGoogleCredential={handleGoogleCredential}
            error={error}
            submitting={submitting}
          />
        );

      case "email":
        return emailGateToken ? (
          <EmailEntry
            context="emailGate"
            onSignup={handleEmailGateSubmit}
            onLogin={handleEmailGateSubmit}
            submitting={submitting}
            error={error}
          />
        ) : (
          <EmailEntry
            context="login"
            onLogin={handleEmailLoginRequest}
            onSignup={handleEmailSignup}
            onBack={() => goToStep("landing")}
            submitting={submitting}
            error={error}
          />
        );

      case "email_otp":
        return (
          <OtpVerify
            phoneNumber={emailOtpEmail}
            channel="email"
            onSubmit={handleEmailOtpSubmit}
            onResend={handleEmailOtpResend}
            onBack={() => {
              if (emailOtpFlow === "login" || emailOtpFlow === "phone_first" || authMode === "login") {
                goToStep("email");
              } else {
                goToStep("landing");
              }
            }}
            submitting={submitting}
            error={error}
            devOtp={devOtp}
          />
        );
```

(`EmailEntry`'s `emailGate` branch passes `handleEmailGateSubmit` to both `onSignup` and `onLogin` because `EmailEntry`'s internal `submit()` always calls `onSignup` for a non-`login`/`link` context — per Task 11, `isEmailGate` falls into the "signup" action branch — so `onLogin` is structurally required by the props type but never actually invoked for this context; passing the same handler to both is simpler than making `onLogin` optional-but-required-except-when on a shared component used by five different contexts.)

- [ ] **Step 6: Update `getStepIndex` for the new phone-first progression**

The existing `switch (step)` block for signup mode needs its `phone`/`email`/`email_otp` cases to also account for the phone-first order (phone now comes before email, not after):

```typescript
    switch (step) {
      case "landing":
        return 0;

      case "email":
        if (emailGateToken) {
          return 2; // phone-first: landing(0) -> phone(1) -> email(2)
        }
        return 1;

      case "email_otp":
        if (emailOtpFlow === "phone_first") {
          return 3;
        }
        return emailOtpFlow === "signup" ? 1 : 2;

      case "phone":
        if (phoneGateToken) {
          return emailOtpEmail ? 2 : 1;
        }
        return 1; // phone-first's own first step

      case "otp":
        if (phoneGateToken) {
          return emailOtpEmail ? 3 : 2;
        }
        if (authMode === "signup" && !phoneGateToken) {
          return 2; // phone-first: landing(0) -> phone(1) -> phone otp(2)
        }
        return 2;

      case "link_account":
        return 3;

      default:
        return 0;
    }
```

- [ ] **Step 7: Manually verify the new flow in the browser**

Run: `cd frontend && npm run dev` (or the project's established dev-server command — check `Docs/superpowers/specs/` or `package.json` scripts if `npm run dev` isn't it)

In the browser: open the signup screen, click "Continue with phone," enter a test number, verify the OTP (shown on-screen in stub mode), confirm the email-gate screen appears ("One more step"), enter a test email, verify that OTP, and confirm you land on onboarding with a real session. Then reload and try "Log in" → "Continue with Phone" with the same number and confirm it logs you straight in without re-asking for email.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/auth/AuthEntryFlow.tsx
git commit -m "feat(auth): wire the phone-first sequential signup flow end to end"
```

---

## Post-implementation checklist (not a task — do this after Task 13)

- [ ] Run the full backend suite once more: `cd backend && pytest -v` — must be 100% green.
- [ ] Run frontend type-check once more: `cd frontend && npx tsc --noEmit` — must be clean.
- [ ] Re-read PRD-05's Open Questions section — only the stale `AGENTS.md` line remains, unrelated to this plan; nothing here should be blocked on it.
- [ ] Confirm with the person who reviewed this plan on Landing.tsx's "email-first UI removed, backend kept" assumption (Task 12) before merging, since it's inferred rather than explicitly stated in PRD-05.
