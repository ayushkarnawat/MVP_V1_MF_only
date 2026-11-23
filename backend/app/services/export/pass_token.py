import base64
import binascii
import hashlib
import hmac
import json
import logging
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import NoReturn

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.models.user import HouseholdMember, User
from app.services.export.pass_routes import PASS_READ_ROUTES

EXPORT_PASS_TTL_SECONDS = 180
PASS_PREFIX = "exp1."
MAX_PASS_LENGTH = 1024
AUD = "export-render"
ExportScope = str
_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
_CLAIMS = {"sub", "scope", "job", "jti", "aud", "iat", "exp"}
_logger = logging.getLogger(__name__)


class ExportPassError(Exception):
    def __init__(self, reason: str):
        self.reason = reason
        super().__init__("Not allowed.")


@dataclass(frozen=True)
class ExportPass:
    user_id: uuid.UUID
    scope: str
    job: str
    jti: str
    expires_at: datetime


@dataclass(frozen=True)
class IssuedPass:
    token: str
    proof: str
    expires_at: datetime


def _secret() -> bytes:
    if not settings.export_pass_secret:
        raise ExportPassError("secret")
    return settings.export_pass_secret.encode("utf-8")


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    if not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ExportPassError("format")
    decoded = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
    if _encode(decoded) != value:
        raise ExportPassError("format")
    return decoded


def _utc(now: datetime) -> datetime:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ExportPassError("time")
    return now.astimezone(timezone.utc)


def _scope(value: str) -> str:
    return value if value == "family" else str(uuid.UUID(value))


def _proof(jti: str, job: str) -> str:
    return hmac.new(_secret(), ("proof:" + jti + ":" + job).encode("utf-8"), hashlib.sha256).hexdigest()


def issue_export_pass(user_id: uuid.UUID, scope: ExportScope, job_id: uuid.UUID | str, now: datetime) -> IssuedPass:
    try:
        key = _secret()
        delta = _utc(now) - _EPOCH
        issued_at = delta.days * 86400 + delta.seconds
        expires_at = _EPOCH + timedelta(seconds=issued_at + EXPORT_PASS_TTL_SECONDS)
        job = str(job_id)
        if not job:
            raise ExportPassError("claims")
        jti = secrets.token_urlsafe(16)
        claims = {"sub": str(uuid.UUID(str(user_id))), "scope": _scope(scope), "job": job,
                  "jti": jti, "aud": AUD, "iat": issued_at, "exp": issued_at + EXPORT_PASS_TTL_SECONDS}
        payload = _encode(json.dumps(claims, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))
        signed = PASS_PREFIX + payload
        signature = _encode(hmac.new(key, signed.encode("ascii"), hashlib.sha256).digest())
        token = signed + "." + signature
        if len(token) > MAX_PASS_LENGTH:
            raise ExportPassError("length")
        return IssuedPass(token, _proof(jti, job), expires_at)
    except (ValueError, TypeError, OverflowError, AttributeError):
        raise ExportPassError("claims") from None


def _unique_claims(pairs: list[tuple[str, object]]) -> dict[str, object]:
    claims: dict[str, object] = {}
    for name, value in pairs:
        if name in claims:
            raise ExportPassError("claims")
        claims[name] = value
    return claims


def verify_export_pass(token: str, now: datetime) -> ExportPass:
    try:
        key = _secret()
        if not isinstance(token, str) or len(token) > MAX_PASS_LENGTH:
            raise ExportPassError("length")
        if not token.startswith(PASS_PREFIX) or token.count(".") != 2:
            raise ExportPassError("format")
        _, payload, signature = token.split(".")
        raw = _decode(payload)
        digest = _decode(signature)
        expected = hmac.new(key, (PASS_PREFIX + payload).encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(digest, expected):
            raise ExportPassError("signature")
        claims = json.loads(raw, object_pairs_hook=_unique_claims)
        if not isinstance(claims, dict) or set(claims) != _CLAIMS:
            raise ExportPassError("claims")
        if any(not isinstance(claims[name], str) or not claims[name]
               for name in ("sub", "scope", "job", "jti", "aud")):
            raise ExportPassError("claims")
        if type(claims["iat"]) is not int or type(claims["exp"]) is not int:
            raise ExportPassError("claims")
        if claims["aud"] != AUD or not re.fullmatch(r"[A-Za-z0-9_-]{22}", claims["jti"]):
            raise ExportPassError("claims")
        user_id = uuid.UUID(claims["sub"])
        scope = _scope(claims["scope"])
        if str(user_id) != claims["sub"] or scope != claims["scope"]:
            raise ExportPassError("claims")
        iat = _EPOCH + timedelta(seconds=claims["iat"])
        exp = _EPOCH + timedelta(seconds=claims["exp"])
        current = _utc(now)
        if exp <= current or iat > current + timedelta(seconds=5):
            raise ExportPassError("time")
        if not 0 < claims["exp"] - claims["iat"] <= EXPORT_PASS_TTL_SECONDS:
            raise ExportPassError("time")
        return ExportPass(user_id, scope, claims["job"], claims["jti"], exp)
    except (ValueError, TypeError, OverflowError, AttributeError, RecursionError, binascii.Error):
        raise ExportPassError("format") from None


def check_proof(p: ExportPass, proof: str | None) -> None:
    try:
        if not isinstance(proof, str) or not hmac.compare_digest(_proof(p.jti, p.job), proof):
            raise ExportPassError("proof")
    except (TypeError, UnicodeError):
        raise ExportPassError("proof") from None


def _log_refusal(reason: str, jti: str | None) -> None:
    _logger.warning("export pass refused: reason=%s jti=%s", reason, jti or "-")


def _refuse(reason: str, jti: str | None = None, status: int = 403) -> NoReturn:
    _log_refusal(reason, jti)
    raise HTTPException(status_code=status, detail="Not allowed.")


def is_export_pass(request: Request) -> bool:
    return getattr(request.state, "export_pass", False) is True


def user_from_pass(request: Request, token: str, proof: str | None, db: DbSession,
                   now: datetime | None = None) -> User:
    from app.services.auth.head_change_consent import consent_outdated_reason

    route = request.scope.get("route")
    entry = PASS_READ_ROUTES.get(getattr(route, "path", None))
    if request.method not in {"GET", "HEAD"}:
        _refuse("method")
    if entry is None or not entry.pass_safe:
        _refuse("route")
    try:
        p = verify_export_pass(token, now if now is not None else datetime.now(timezone.utc))
    except ExportPassError as exc:
        _refuse(exc.reason, status=401)
    try:
        check_proof(p, proof)
    except ExportPassError as exc:
        _refuse(exc.reason, p.jti)
    user = db.get(User, p.user_id)
    if user is None:
        _refuse("user", p.jti, 401)
    if user.pending_deletion:
        _refuse("deletion", p.jti)
    if consent_outdated_reason(db, user.id) is not None:
        _refuse("consent", p.jti)
    requested = None
    if entry.scope_in != "none":
        if entry.scope_name is None:
            _refuse("scope", p.jti)
        if entry.scope_in == "path":
            requested = request.path_params.get(entry.scope_name)
        elif entry.scope_in == "query":
            values = request.query_params.getlist(entry.scope_name)
            if len(values) > 1:
                _refuse("scope", p.jti)
            requested = values[0] if values else None
        else:
            _refuse("scope", p.jti)
    if p.scope != "family":
        member = db.query(HouseholdMember.id).filter(
            HouseholdMember.id == uuid.UUID(p.scope), HouseholdMember.user_id == user.id,
        ).first()
        if member is None or requested != p.scope:
            _refuse("scope", p.jti)
    elif requested not in (None, "family", "aggregate", "combined"):
        try:
            member_id = uuid.UUID(str(requested))
        except (ValueError, TypeError):
            _refuse("scope", p.jti)
        if db.query(HouseholdMember.id).filter(
            HouseholdMember.id == member_id, HouseholdMember.user_id == user.id,
        ).first() is None:
            _refuse("scope", p.jti)
    request.state.export_pass = True
    return user
