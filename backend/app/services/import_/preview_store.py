"""Encrypted write-through review state. Callers own transactions and commits."""
from __future__ import annotations

import base64
import json
import threading
import uuid
from dataclasses import fields, is_dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from typing import Any

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import enums
from app.models.imports import Import
from app.models.enums import ImportStatus
from app.services.import_ import parser, people, people_resolution, opening_balance, identify, schemas, pan_claims
from app.services.import_.crypto import encrypt_bytes, decrypt_bytes

_TYPES = {cls.__name__:cls for module in (enums,parser,people,people_resolution,opening_balance,identify,schemas,pan_claims)
          for cls in vars(module).values() if isinstance(cls,type)
          and (is_dataclass(cls) or issubclass(cls,(BaseModel,Enum)))}


def _encode(value: Any) -> Any:
    if isinstance(value, Enum):
        return {"kind":"enum", "class":type(value).__name__, "value":value.value}
    if isinstance(value, uuid.UUID):
        return {"kind":"uuid", "value":str(value)}
    if isinstance(value, datetime):
        return {"kind":"datetime", "value":value.isoformat()}
    if isinstance(value, date):
        return {"kind":"date", "value":value.isoformat()}
    if isinstance(value, Decimal):
        return {"kind":"decimal", "value":str(value)}
    if isinstance(value, bytes):
        return {"kind":"bytes", "value":base64.b64encode(value).decode("ascii")}
    if is_dataclass(value):
        return {"kind":"dataclass", "class":type(value).__name__,
                "value":{f.name:_encode(getattr(value,f.name)) for f in fields(value)}}
    if isinstance(value, BaseModel):
        return {"kind":"model", "class":type(value).__name__, "value":_encode(value.model_dump(mode="python"))}
    if isinstance(value, dict):
        return {"kind":"dict", "value":[[_encode(k),_encode(v)] for k,v in value.items()]}
    if isinstance(value,(tuple,set,list)):
        return {"kind":type(value).__name__, "value":[_encode(v) for v in value]}
    if value is None or isinstance(value,(str,int,float,bool)):
        return value
    raise TypeError(f"Unsupported preview type: {type(value).__name__}")


def _decode(value: Any) -> Any:
    if not isinstance(value,dict):
        return value
    kind, data = value["kind"],value["value"]
    if kind == "uuid": return uuid.UUID(data)
    if kind == "datetime": return datetime.fromisoformat(data)
    if kind == "date": return date.fromisoformat(data)
    if kind == "decimal": return Decimal(data)
    if kind == "bytes": return base64.b64decode(data,validate=True)
    if kind == "enum": return _TYPES[value["class"]](data)
    if kind == "dataclass": return _TYPES[value["class"]](**{k:_decode(v) for k,v in data.items()})
    if kind == "model": return _TYPES[value["class"]].model_validate(_decode(data))
    if kind == "dict": return {_decode(k):_decode(v) for k,v in data}
    if kind == "tuple": return tuple(_decode(v) for v in data)
    if kind == "set": return {_decode(v) for v in data}
    if kind == "list": return [_decode(v) for v in data]
    raise ValueError("Unknown preview value tag")


def serialize(session: dict) -> dict:
    return _encode({k:v for k,v in session.items() if k != "lock"})


def deserialize(data: dict) -> dict:
    session = _decode(data)
    session["lock"] = threading.Lock()
    return session


def read_state(row: Import) -> dict:
    return deserialize(json.loads(decrypt_bytes(row.preview_state).decode("utf-8")))


def save(db: Session, session: dict[str,Any]) -> None:
    from app.services.import_.service import SESSION_TTL_MINUTES
    sid = uuid.UUID(session["session_id"])
    row = db.get(Import,sid)
    if row is None:
        row = Import(id=sid,household_member_id=session["household_member_id"], status=ImportStatus.PREVIEWING,
                     uploaded_at=session["created_at"])
        db.add(row)
    row.preview_state = encrypt_bytes(json.dumps(serialize(session),separators=(",",":"),ensure_ascii=False).encode("utf-8"))
    row.expires_at = session["created_at"] + timedelta(minutes=SESSION_TTL_MINUTES)
    db.flush()


def load(db: Session, session_id: str) -> dict[str,Any] | None:
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        return None
    row = db.get(Import,sid)
    if row is None or row.status != ImportStatus.PREVIEWING or not row.preview_state or row.expires_at is None:
        return None
    expiry = row.expires_at.replace(tzinfo=timezone.utc) if row.expires_at.tzinfo is None else row.expires_at
    if expiry <= datetime.now(timezone.utc):
        return None
    return read_state(row)


def delete(db: Session, session_id: str) -> None:
    db.query(Import).filter(Import.id == uuid.UUID(session_id)).delete(synchronize_session=False)



PREVIEW_STATUSES = (ImportStatus.PREVIEWING, ImportStatus.PROCESSING)


def discard_member_reviews(db: Session, member_ids: list[uuid.UUID]) -> int:
    """Release pending claims before a member disappears. Caller owns commit."""
    from app.services.import_ import service
    rows = db.query(Import).filter(Import.household_member_id.in_(member_ids),
                                   Import.status.in_(PREVIEW_STATUSES)).with_for_update().all() if member_ids else []
    for row in rows:
        sid = row.id.hex
        with service._sessions_lock:
            cached = service._preview_sessions.pop(sid,None)
        session = cached or (read_state(row) if row.preview_state else None)
        if session is not None:
            service._release_session_claims(db,session)
        db.delete(row)
    db.flush()
    return len(rows)
