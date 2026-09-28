from unittest.mock import MagicMock

from app.services.auth.device_info import capture_request_metadata, get_client_ip


def _request(headers: dict[str, str], client_host: str | None = "10.0.0.5"):
    request = MagicMock()
    request.headers = headers
    request.client = MagicMock(host=client_host) if client_host else None
    return request


IPHONE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)
WINDOWS_CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)


def test_get_client_ip_prefers_x_forwarded_for():
    request = _request({"x-forwarded-for": "203.0.113.5, 10.0.0.1"}, client_host="10.0.0.1")

    assert get_client_ip(request) == "203.0.113.5"


def test_get_client_ip_falls_back_to_request_client_host_when_no_forwarded_header():
    request = _request({}, client_host="192.0.2.9")

    assert get_client_ip(request) == "192.0.2.9"


def test_get_client_ip_returns_none_when_neither_is_available():
    request = _request({}, client_host=None)

    assert get_client_ip(request) is None


def test_capture_request_metadata_parses_iphone_user_agent():
    request = _request({"user-agent": IPHONE_UA, "x-forwarded-for": "203.0.113.5"})

    meta = capture_request_metadata(request)

    assert meta.ip_address == "203.0.113.5"
    assert meta.user_agent == IPHONE_UA
    assert meta.device_type == "mobile"
    assert meta.os_family == "iOS"
    assert meta.browser_family == "Mobile Safari"


def test_capture_request_metadata_parses_windows_desktop_user_agent():
    request = _request({"user-agent": WINDOWS_CHROME_UA})

    meta = capture_request_metadata(request)

    assert meta.device_type == "desktop"
    assert meta.os_family == "Windows"
    assert meta.browser_family == "Chrome"


def test_capture_request_metadata_handles_missing_user_agent_header():
    request = _request({})

    meta = capture_request_metadata(request)

    assert meta.user_agent is None
    assert meta.device_type is None
    assert meta.os_family is None


def test_capture_request_metadata_reads_device_id_header():
    request = _request({"x-device-id": "a1b2c3d4-0000-0000-0000-000000000000"})

    meta = capture_request_metadata(request)

    assert meta.device_id == "a1b2c3d4-0000-0000-0000-000000000000"
