import base64
import hashlib
import hmac
import json
import multiprocessing
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from app.config import settings
from app.services.export import pass_token as passes

SECRET = "invented-export-test-key-32-characters-only"
NOW = datetime(2026, 11, 24, 12, tzinfo=timezone.utc)
USER = UUID(int=101)
JOB = UUID(int=201)


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setattr(settings, "export_pass_secret", SECRET)


def _issued(scope="family", now=NOW):
    return passes.issue_export_pass(USER, scope, JOB, now)


def _encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _claims(token):
    payload = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def _sign(claims):
    payload = _encode(json.dumps(claims, separators=(",", ":")).encode())
    signature = hmac.digest(SECRET.encode(), ("exp1." + payload).encode(), "sha256")
    return "exp1." + payload + "." + _encode(signature)


def test_valid_pass_verifies():
    issued = _issued()
    result = passes.verify_export_pass(issued.token, NOW)
    assert result.user_id == USER and result.scope == "family" and result.job == str(JOB)
    assert result.expires_at == NOW + timedelta(seconds=180) == issued.expires_at
    claims = _claims(issued.token)
    assert set(claims) == {"sub", "scope", "job", "jti", "aud", "iat", "exp"}
    assert claims["aud"] == "export-render"
    assert claims["iat"] == 1795521600 and claims["exp"] == 1795521780
    passes.check_proof(result, issued.proof)
    member = str(UUID(int=301))
    assert passes.verify_export_pass(_issued(member).token, NOW).scope == member
    assert passes.verify_export_pass(_sign(dict(reversed(list(claims.items())))), NOW).user_id == USER


@pytest.mark.parametrize("seconds", [180, 181])
def test_expired_pass_rejected_with_zero_leeway(seconds):
    with pytest.raises(passes.ExportPassError, match=r"^Not allowed\.$"):
        passes.verify_export_pass(_issued().token, NOW + timedelta(seconds=seconds))


def test_future_iat_rejected():
    passes.verify_export_pass(_issued(now=NOW + timedelta(seconds=5)).token, NOW)
    with pytest.raises(passes.ExportPassError):
        passes.verify_export_pass(_issued(now=NOW + timedelta(seconds=6)).token, NOW)


def test_tampered_payload_rejected():
    issued = _issued()
    claims = _claims(issued.token)
    claims["sub"] = str(UUID(int=999))
    payload = _encode(json.dumps(claims).encode())
    with pytest.raises(passes.ExportPassError):
        passes.verify_export_pass("exp1." + payload + "." + issued.token.split(".")[2], NOW)


def test_tampered_signature_rejected():
    token = _issued().token
    prefix, payload, signature = token.split(".")
    changed = ("A" if signature[0] != "A" else "B") + signature[1:]
    with pytest.raises(passes.ExportPassError):
        passes.verify_export_pass(".".join((prefix, payload, changed)), NOW)


@pytest.mark.parametrize("token", [
    "eyJhbGciOiJub25lIn0.e30.", "header.payload.signature", "exp1.e30.",
    "exp1.!.!", "exp1.e30=.AAAA", "exp1.e30.AAAA.extra", "exp1._w.AAAA",
])
def test_wrong_algorithm_style_tokens_rejected(token):
    with pytest.raises(passes.ExportPassError):
        passes.verify_export_pass(token, NOW)


@pytest.mark.parametrize("change", ["extra", "sub", "scope", "job", "jti", "aud", "iat", "exp"])
def test_extra_or_missing_claim_rejected(change):
    claims = _claims(_issued().token)
    if change == "extra":
        claims["alg"] = "none"
    else:
        claims.pop(change)
    with pytest.raises(passes.ExportPassError):
        passes.verify_export_pass(_sign(claims), NOW)


def test_wrong_aud_rejected():
    claims = _claims(_issued().token)
    claims["aud"] = "ordinary-session"
    with pytest.raises(passes.ExportPassError):
        passes.verify_export_pass(_sign(claims), NOW)


def test_oversized_token_rejected():
    with pytest.raises(passes.ExportPassError):
        passes.verify_export_pass("exp1." + "x" * 1024, NOW)


def _verify_in_child(token, connection):
    settings.export_pass_secret = SECRET
    try:
        result = passes.verify_export_pass(token, NOW)
        connection.send(result.user_id == USER and result.job == str(JOB))
    except passes.ExportPassError:
        connection.send(False)
    finally:
        connection.close()


def test_pass_works_in_a_different_process():
    context = multiprocessing.get_context("spawn")
    parent, child = context.Pipe()
    process = context.Process(target=_verify_in_child, args=(_issued().token, child))
    process.start()
    child.close()
    try:
        assert parent.poll(30), "verification child did not respond"
        assert parent.recv() is True
        process.join(30)
        assert process.exitcode == 0
    finally:
        if process.is_alive():
            process.kill()
        process.join(30)
        parent.close()


def test_empty_secret_refuses_to_issue(monkeypatch):
    issued = _issued()
    monkeypatch.setattr(settings, "export_pass_secret", "")
    with pytest.raises(passes.ExportPassError):
        _issued()
    with pytest.raises(passes.ExportPassError):
        passes.verify_export_pass(issued.token, NOW)


def test_proof_must_match_jti_and_job():
    issued = _issued()
    result = passes.verify_export_pass(issued.token, NOW)
    expected = hmac.new(SECRET.encode(), ("proof:" + result.jti + ":" + str(JOB)).encode(), hashlib.sha256).hexdigest()
    assert hmac.compare_digest(issued.proof, expected)
    for changed, proof in ((result, None), (result, "bad"), (result, "\u00e9"),
                           (replace(result, jti="different"), issued.proof),
                           (replace(result, job="different"), issued.proof)):
        with pytest.raises(passes.ExportPassError) as exc:
            passes.check_proof(changed, proof)
        assert exc.value.reason == "proof"


def test_error_message_is_generic():
    issued = _issued()
    result = passes.verify_export_pass(issued.token, NOW)
    actions = [lambda: passes.verify_export_pass(issued.token, NOW + timedelta(seconds=180)),
               lambda: passes.verify_export_pass("exp1.e30.AAAA", NOW),
               lambda: passes.check_proof(result, None)]
    for action in actions:
        with pytest.raises(passes.ExportPassError) as exc:
            action()
        assert str(exc.value) == "Not allowed."


@pytest.mark.parametrize(("claim", "value"), [
    ("iat", True), ("exp", "1795521780"), ("exp", 10**100),
    ("sub", "invalid"), ("scope", "aggregate"), ("jti", "bad\nnonce"),
    ("job", None), ("exp", 1795521600 + 301),
])
def test_malformed_signed_claims_rejected(claim, value):
    claims = _claims(_issued().token)
    claims[claim] = value
    with pytest.raises(passes.ExportPassError, match=r"^Not allowed\.$"):
        passes.verify_export_pass(_sign(claims), NOW)
