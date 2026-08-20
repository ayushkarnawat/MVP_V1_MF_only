import secrets
import time
from typing import Any

_TOKEN_TTL_SECONDS = 120

# ponytail: in-process dict, not shared across worker processes and lost on
# restart — fine for a single-Uvicorn-process deployment (current state);
# move to Redis/similar if/when this backend ever runs multiple workers.
_export_payloads: dict[str, tuple[dict[str, Any], float, bool]] = {}


def store_export_payload(payload: dict[str, Any]) -> str:
    token = secrets.token_urlsafe(32)
    _export_payloads[token] = (payload, time.monotonic() + _TOKEN_TTL_SECONDS, False)
    return token


def consume_export_payload(token: str) -> dict[str, Any] | None:
    entry = _export_payloads.pop(token, None)
    if entry is None:
        return None
    payload, expires_at, _used = entry
    if time.monotonic() > expires_at:
        return None
    return payload
