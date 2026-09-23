import logging
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

from app.services.auth.email_provider import (
    NoEmailProviderConfiguredError,
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
    with pytest.raises(NoEmailProviderConfiguredError, match="ses"):
        get_email_provider()


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


def test_get_email_provider_returns_ses_in_ses_mode(monkeypatch):
    import app.services.auth.email_provider as email_provider_module

    monkeypatch.setattr(email_provider_module.settings, "email_delivery_mode", "ses")
    provider = get_email_provider()
    assert isinstance(provider, email_provider_module.SesEmailProvider)
