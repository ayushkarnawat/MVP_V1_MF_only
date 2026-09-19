import base64
import os

import pytest

from app.services.import_.crypto import (
    EnvVarKeyProvider,
    decrypt_pan,
    encrypt_pan,
    hash_pan,
    normalize_pan,
)


class FixedKeyProvider:
    def __init__(self, key: bytes, pepper: bytes):
        self._key = key
        self._pepper = pepper

    def encryption_key(self) -> bytes:
        return self._key

    def lookup_pepper(self) -> bytes:
        return self._pepper


@pytest.fixture
def key_provider():
    return FixedKeyProvider(os.urandom(32), os.urandom(32))


def test_normalize_pan_strips_whitespace_and_uppercases():
    assert normalize_pan(" abcde1234f ") == "ABCDE1234F"
    assert normalize_pan("ABCDE1234F") == "ABCDE1234F"


def test_encrypt_then_decrypt_round_trips(key_provider):
    ciphertext = encrypt_pan("ABCDE1234F", key_provider)
    assert decrypt_pan(ciphertext, key_provider) == "ABCDE1234F"


def test_encryption_is_nondeterministic(key_provider):
    first = encrypt_pan("ABCDE1234F", key_provider)
    second = encrypt_pan("ABCDE1234F", key_provider)
    assert first != second


def test_decrypt_with_wrong_key_raises(key_provider):
    ciphertext = encrypt_pan("ABCDE1234F", key_provider)
    wrong_provider = FixedKeyProvider(os.urandom(32), key_provider.lookup_pepper())
    with pytest.raises(Exception):
        decrypt_pan(ciphertext, wrong_provider)


def test_hash_pan_is_deterministic(key_provider):
    assert hash_pan("ABCDE1234F", key_provider) == hash_pan("abcde1234f", key_provider)


def test_hash_pan_differs_for_different_pans(key_provider):
    assert hash_pan("ABCDE1234F", key_provider) != hash_pan("ZYXWV9876G", key_provider)


def test_env_var_key_provider_rejects_missing_key(monkeypatch):
    monkeypatch.setattr("app.services.import_.crypto.settings.pan_encryption_key", "")
    with pytest.raises(RuntimeError, match="PAN_ENCRYPTION_KEY"):
        EnvVarKeyProvider().encryption_key()


def test_env_var_key_provider_rejects_wrong_length_key(monkeypatch):
    short_key = base64.b64encode(b"too-short").decode()
    monkeypatch.setattr("app.services.import_.crypto.settings.pan_encryption_key", short_key)
    with pytest.raises(RuntimeError, match="32 bytes"):
        EnvVarKeyProvider().encryption_key()
