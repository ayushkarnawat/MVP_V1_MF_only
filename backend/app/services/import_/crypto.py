"""Envelope encryption and deterministic lookup hashing for PAN persistence.

ADR-004 reopened 2026-09-18: PAN is now persisted, encrypted, recoverable.
Matching uses pan_lookup_hash (an HMAC, never reversible) so the app never
needs to decrypt another household's PAN just to check for a match. See
Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
from typing import Protocol

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings


class KeyProvider(Protocol):
    def encryption_key(self) -> bytes: ...
    def lookup_pepper(self) -> bytes: ...


def decode_key(value: str, var_name: str) -> bytes:
    """Decode and validate a base64-encoded 32-byte key. Raises RuntimeError
    with a message naming `var_name` if unset or the wrong length. Exported
    (not module-private) so app.main's startup fail-fast check can reuse this
    exact validation instead of duplicating it -- see Fix 2 of the 2026-09-18
    whole-branch review."""
    if not value:
        raise RuntimeError(f"{var_name} is not set.")
    key = base64.b64decode(value)
    if len(key) != 32:
        raise RuntimeError(f"{var_name} must decode to 32 bytes, got {len(key)}.")
    return key


# Backwards-compatible private alias -- keeps existing internal call sites
# below unchanged.
_decode_key = decode_key


class EnvVarKeyProvider:
    """Local/demo key source. Production maps this to a Secrets Manager
    secret encrypted by the KMS key already staged in infra/modules/security
    — swap the provider, not the callers (see design spec's "Production
    mapping")."""

    def encryption_key(self) -> bytes:
        return _decode_key(settings.pan_encryption_key, "PAN_ENCRYPTION_KEY")

    def lookup_pepper(self) -> bytes:
        return _decode_key(settings.pan_lookup_pepper, "PAN_LOOKUP_PEPPER")


default_key_provider = EnvVarKeyProvider()


def normalize_pan(pan: str) -> str:
    return "".join(pan.split()).upper()


def encrypt_pan(pan: str, key_provider: KeyProvider = default_key_provider) -> str:
    aesgcm = AESGCM(key_provider.encryption_key())
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, normalize_pan(pan).encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt_pan(pan_encrypted: str, key_provider: KeyProvider = default_key_provider) -> str:
    raw = base64.b64decode(pan_encrypted)
    nonce, ciphertext = raw[:12], raw[12:]
    aesgcm = AESGCM(key_provider.encryption_key())
    return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")


def hash_pan(pan: str, key_provider: KeyProvider = default_key_provider) -> str:
    digest = hmac.new(
        key_provider.lookup_pepper(),
        normalize_pan(pan).encode("utf-8"),
        hashlib.sha256,
    )
    return digest.hexdigest()
