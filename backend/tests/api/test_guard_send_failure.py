"""A code that never left (the email provider failed) must give its slot back (independent Codex review of B-2, finding 1)."""

import pytest

from app.config import settings
from app.models.auth import AuthRequestGuard
from app.models.enums import ConsentDocumentType as T
from app.services.auth.email_provider import EmailSendError
from app.services.legal.registry import current_document

CONSENT = [
    {"document_type": t.value, "document_version": current_document(t).version}
    for t in (T.TERMS_OF_SERVICE, T.PRIVACY_POLICY)
]


def _db(client):
    from app.db.session import get_db

    return next(client.app.dependency_overrides[get_db]())


@pytest.mark.parametrize("path,body", [
    ("/auth/email-otp/request", {"email": "gone@example.com"}),
    ("/auth/signup/email", {"email": "gone@example.com", "accepted_documents": CONSENT}),
])
def test_a_failed_send_returns_the_reserved_code_slot(client, monkeypatch, path, body):
    monkeypatch.setattr(settings, "auth_guard_enabled", True)
    monkeypatch.setattr(settings, "auth_guard_secret", "synthetic-test-key")

    def refuse(*args, **kwargs):
        raise EmailSendError("We couldn't send that email right now.")

    monkeypatch.setattr("app.api.auth.create_otp_request", refuse)

    response = client.post(path, json=body, headers={"X-Forwarded-For": "192.0.2.55"})

    assert response.status_code == 502
    rows = _db(client).query(AuthRequestGuard).all()
    assert [(row.outcome, row.code_at) for row in rows] == [("send_failed", None)]
