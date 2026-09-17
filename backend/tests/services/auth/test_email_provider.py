import logging
from unittest.mock import patch

import httpx
import pytest

from app.services.auth.email_provider import (
    NoEmailProviderConfiguredError,
    PostmarkEmailProvider,
    StubEmailProvider,
    get_email_provider,
)


def test_stub_email_provider_does_not_raise(caplog):
    caplog.set_level(logging.INFO)
    provider = StubEmailProvider()
    provider.send_email(to="a@example.com", subject="Test", body="Hello")
    assert "a@example.com" in caplog.text


def test_get_email_provider_returns_stub_in_stub_mode(monkeypatch):
    import app.services.auth.email_provider as email_provider_module

    monkeypatch.setattr(email_provider_module.settings, "otp_delivery_mode", "stub")
    provider = get_email_provider()
    assert isinstance(provider, StubEmailProvider)


def test_get_email_provider_raises_outside_stub_mode(monkeypatch):
    import app.services.auth.email_provider as email_provider_module

    monkeypatch.setattr(email_provider_module.settings, "otp_delivery_mode", "sms")
    with pytest.raises(NoEmailProviderConfiguredError, match="Postmark"):
        get_email_provider()


def test_get_email_provider_returns_postmark_in_postmark_mode(monkeypatch):
    import app.services.auth.email_provider as email_provider_module

    monkeypatch.setattr(email_provider_module.settings, "otp_delivery_mode", "postmark")
    provider = get_email_provider()
    assert isinstance(provider, PostmarkEmailProvider)


def test_postmark_email_provider_sends_expected_request(monkeypatch):
    import app.services.auth.email_provider as email_provider_module

    monkeypatch.setattr(email_provider_module.settings, "postmark_api_token", "test-token")
    monkeypatch.setattr(email_provider_module.settings, "postmark_from_email", "noreply@unifolio.in")

    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return httpx.Response(200, request=httpx.Request("POST", url))

    with patch.object(email_provider_module.httpx, "post", side_effect=fake_post):
        PostmarkEmailProvider().send_email(to="user@example.com", subject="Your code", body="123456")

    assert captured["url"] == "https://api.postmarkapp.com/email"
    assert captured["headers"]["X-Postmark-Server-Token"] == "test-token"
    assert captured["json"]["From"] == "noreply@unifolio.in"
    assert captured["json"]["To"] == "user@example.com"
    assert captured["json"]["Subject"] == "Your code"
    assert captured["json"]["TextBody"] == "123456"


def test_postmark_email_provider_raises_on_error_response(monkeypatch):
    import app.services.auth.email_provider as email_provider_module

    monkeypatch.setattr(email_provider_module.settings, "postmark_api_token", "test-token")
    monkeypatch.setattr(email_provider_module.settings, "postmark_from_email", "noreply@unifolio.in")

    def fake_post(url, headers=None, json=None, timeout=None):
        request = httpx.Request("POST", url)
        return httpx.Response(422, request=request, json={"Message": "Invalid 'From' address"})

    with patch.object(email_provider_module.httpx, "post", side_effect=fake_post):
        with pytest.raises(httpx.HTTPStatusError):
            PostmarkEmailProvider().send_email(to="user@example.com", subject="s", body="b")
