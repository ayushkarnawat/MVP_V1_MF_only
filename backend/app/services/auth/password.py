"""Password hashing for email+password auth — bcrypt via passlib. A
single cost-factor knob (unlike Argon2's three), the most battle-tested,
zero-surprise choice for a standard FastAPI backend (Design Spec §2).
"""

from __future__ import annotations

from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(raw: str) -> str:
    return _pwd_context.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return _pwd_context.verify(raw, hashed)
