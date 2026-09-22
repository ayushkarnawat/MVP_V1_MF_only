import logging
from unittest.mock import MagicMock, patch

import httpx
import pytest
from botocore.exceptions import ClientError

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

    monkeypatch.setattr(email_provider_module.settings, "email_delivery_mode", "stub")
    provider = get_email_provider()
    assert isinstance(provider, StubEmailProvider)


def test_get_email_provider_raises_outside_stub_mode(monkeypatch):
    import app.services.auth.email_provider as email_provider_module

    monkeypatch.setattr(email_provider_module.settings, "email_delivery_mode", "sms")
    with pytest.raises(NoEmailProviderConfiguredError, match="Postmark"):
        get_email_provider()


def test_get_email_provider_returns_postmark_in_postmark_mode(monkeypatch):
    import app.services.auth.email_provider as email_provider_module

    monkeypatch.setattr(email_provider_module.settings, "email_delivery_mode", "postmark")
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


def test_postmark_email_provider_raises_email_send_error_on_error_response(monkeypatch):
    import app.services.auth.email_provider as email_provider_module

    monkeypatch.setattr(email_provider_module.settings, "postmark_api_token", "test-token")
    monkeypatch.setattr(email_provider_module.settings, "postmark_from_email", "noreply@unifolio.in")

    def fake_post(url, headers=None, json=None, timeout=None):
        request = httpx.Request("POST", url)
        return httpx.Response(422, request=request, json={"Message": "Invalid 'From' address"})

    with patch.object(email_provider_module.httpx, "post", side_effect=fake_post):
        with pytest.raises(email_provider_module.EmailSendError):
            PostmarkEmailProvider().send_email(to="user@example.com", subject="s", body="b")


def test_ses_email_provider_sends_expected_request(monkeypatch):
    import app.services.auth.email_provider as email_provider_module

    monkeypatch.setattr(email_provider_module.settings, "aws_region", "ap-south-1")
    monkeypatch.setattr(email_provider_module.settings, "ses_from_email", "otp@unifolio.in")

    mock_client = MagicMock()
    with patch.object(email_provider_module.boto3, "client", return_value=mock_client) as mock_boto_client:
        email_provider_module.SesEmailProvider().send_email(to="user@example.com", subject="Your code", body="123456")

    mock_boto_client.assert_called_once_with("ses", region_name="ap-south-1")
    mock_client.send_email.assert_called_once_with(
        Source="otp@unifolio.in",
        Destination={"ToAddresses": ["user@example.com"]},
        Message={
            "Subject": {"Data": "Your code", "Charset": "UTF-8"},
            "Body": {"Text": {"Data": "123456", "Charset": "UTF-8"}},
        },
    )


def test_ses_email_provider_raises_email_send_error_on_client_error(monkeypatch):
    import app.services.auth.email_provider as email_provider_module

    monkeypatch.setattr(email_provider_module.settings, "aws_region", "ap-south-1")
    monkeypatch.setattr(email_provider_module.settings, "ses_from_email", "otp@unifolio.in")

    mock_client = MagicMock()
    mock_client.send_email.side_effect = ClientError(
        {"Error": {"Code": "MessageRejected", "Message": "Email address not verified"}},
        "SendEmail",
    )
    with patch.object(email_provider_module.boto3, "client", return_value=mock_client):
        with pytest.raises(email_provider_module.EmailSendError):
            email_provider_module.SesEmailProvider().send_email(to="user@example.com", subject="s", body="b")


def test_ses_email_provider_raises_when_region_unconfigured(monkeypatch):
    import app.services.auth.email_provider as email_provider_module

    monkeypatch.setattr(email_provider_module.settings, "aws_region", "")
    with pytest.raises(email_provider_module.EmailSendError, match="not configured"):
        email_provider_module.SesEmailProvider().send_email(to="user@example.com", subject="s", body="b")
