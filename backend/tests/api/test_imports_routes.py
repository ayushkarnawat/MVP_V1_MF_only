from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.import_.parser import ParseError

client = TestClient(app)


def test_parse_route_rejects_non_pdf():
    response = client.post(
        "/imports/parse",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        data={"password": "x"},
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid_file"


def test_parse_route_surfaces_parse_error_as_422():
    with patch(
        "app.api.imports.parse_cas_pdf_bytes",
        side_effect=ParseError("wrong_password", "Incorrect PDF password."),
    ):
        response = client.post(
            "/imports/parse",
            files={"file": ("cas.pdf", b"%PDF-fake", "application/pdf")},
            data={"password": "wrong"},
        )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "wrong_password"


def test_confirm_route_404s_on_unknown_session():
    response = client.post(
        "/imports/confirm",
        json={"session_id": "does-not-exist", "household_member_id": "00000000-0000-0000-0000-000000000000", "scheme_confirmations": []},
    )
    assert response.status_code == 404
