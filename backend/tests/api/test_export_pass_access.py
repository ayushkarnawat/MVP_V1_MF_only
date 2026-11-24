from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient

from app.api.auth import router as auth_router
from app.config import settings
from app.db.session import get_db
from app.models.enums import AuthIdentityProvider
from app.models.user import HouseholdMember, User
from app.services.auth.session import create_session, get_data_user
from app.services.export.pass_routes import PASS_READ_ROUTES, PassRoute
from app.services.export.pass_token import (
    ExportPassError, is_export_pass, issue_export_pass, verify_export_pass,
)
from tests.api.test_head_change_consent import _signed_up_and_consented, _withdraw

SECRET = "invented-export-api-key-32-characters-only"


@pytest.fixture
def access(db_session, monkeypatch):
    monkeypatch.setattr(settings, "export_pass_secret", SECRET)
    now = datetime.now(timezone.utc)
    owner = User(id=UUID(int=1), phone_number="+919900000101", created_at=now)
    other = User(id=UUID(int=2), phone_number="+919900000102", created_at=now)
    db_session.add_all([owner, other])
    db_session.commit()
    members = [HouseholdMember(id=UUID(int=i), user_id=user.id, name="Invented member", created_at=now)
               for i, user in ((11, owner), (12, owner), (21, other))]
    db_session.add_all(members)
    db_session.commit()
    _, session_token = create_session(db_session, owner.id, AuthIdentityProvider.PHONE_OTP)
    app = FastAPI()
    app.include_router(auth_router)
    app.dependency_overrides[get_db] = lambda: db_session

    @app.get("/_t/read")
    def read(request: Request, member_id: str | None = None, user: User = Depends(get_data_user)):
        return {"allowed": True, "export_pass": is_export_pass(request)}

    @app.get("/_t/member/{member_id}")
    def member(member_id: str, request: Request, user: User = Depends(get_data_user)):
        return {"allowed": True, "export_pass": is_export_pass(request)}

    @app.get("/_t/family")
    def family(user: User = Depends(get_data_user)):
        return {"allowed": True}

    @app.get("/_t/off-list")
    def off_list(user: User = Depends(get_data_user)):
        return {"allowed": True}

    @app.api_route("/_t/write", methods=["POST", "PUT", "PATCH", "DELETE"])
    def write(user: User = Depends(get_data_user)):
        return {"allowed": True}

    for path, route in {
        "/_t/read": PassRoute("query", "member_id", True),
        "/_t/member/{member_id}": PassRoute("path", "member_id", True),
        "/_t/family": PassRoute("none", None, True),
    }.items():
        monkeypatch.setitem(PASS_READ_ROUTES, path, route)
    with TestClient(app) as client:
        yield SimpleNamespace(client=client, db=db_session, owner=owner, members=members,
                              session_headers={"Authorization": "Bearer " + session_token},
                              session_token=session_token)


def _pass(access, scope="family"):
    issued = issue_export_pass(access.owner.id, scope, UUID(int=501), datetime.now(timezone.utc))
    return issued, {"Authorization": "Bearer " + issued.token, "X-Export-Proof": issued.proof}


def _refused(response, status=403):
    assert response.status_code == status
    assert response.json() == {"detail": "Not allowed."}


def test_session_token_still_works_everywhere(access):
    for path in ("/_t/read", "/_t/off-list", "/auth/me"):
        assert access.client.get(path, headers=access.session_headers).status_code == 200
    assert access.client.post("/_t/write", headers=access.session_headers).status_code == 200


def test_pass_works_on_an_allow_listed_get(access):
    _, headers = _pass(access)
    assert access.client.get("/_t/read", headers=headers).status_code == 200


def test_pass_without_proof_header_rejected(access):
    _, headers = _pass(access)
    headers.pop("X-Export-Proof")
    _refused(access.client.get("/_t/read", headers=headers))


def test_pass_refused_off_the_allow_list(access):
    _, headers = _pass(access)
    _refused(access.client.get("/_t/off-list", headers=headers))


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_pass_cannot_call_a_write_route(access, method, monkeypatch):
    monkeypatch.setitem(PASS_READ_ROUTES, "/_t/write", PassRoute("none", None, True))
    _, headers = _pass(access)
    _refused(access.client.request(method, "/_t/write", headers=headers))


def test_pass_refused_on_auth_me(access):
    _, headers = _pass(access)
    _refused(access.client.get("/auth/me", headers=headers))


def test_pass_gets_401_on_session_only_routes(access):
    _, headers = _pass(access)
    response = access.client.post("/auth/session/refresh", headers=headers)
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid or expired session."}


def test_member_pass_cannot_read_aggregate_or_other_members(access):
    _, headers = _pass(access, str(access.members[0].id))
    for path in ("/_t/read", "/_t/read?member_id=aggregate", "/_t/read?member_id=combined",
                 "/_t/read?member_id=" + str(access.members[1].id),
                 "/_t/member/" + str(access.members[1].id),
                 "/_t/read?member_id=" + str(access.members[0].id) + "&member_id=aggregate"):
        _refused(access.client.get(path, headers=headers))
    for path in ("/_t/read?member_id=" + str(access.members[0].id),
                 "/_t/member/" + str(access.members[0].id)):
        assert access.client.get(path, headers=headers).status_code == 200


def test_member_pass_refused_on_a_route_with_no_scope_parameter(access):
    _, headers = _pass(access, str(access.members[0].id))
    _refused(access.client.get("/_t/family", headers=headers))


def test_family_pass_reads_aggregate_and_own_members(access):
    _, headers = _pass(access)
    for path in ("/_t/read", "/_t/read?member_id=aggregate", "/_t/family",
                 "/_t/member/" + str(access.members[0].id)):
        assert access.client.get(path, headers=headers).status_code == 200
    _refused(access.client.get("/_t/member/" + str(access.members[2].id), headers=headers))


def test_pass_for_a_member_of_another_account_rejected(access):
    _, headers = _pass(access, str(access.members[2].id))
    _refused(access.client.get("/_t/member/" + str(access.members[2].id), headers=headers))


def test_family_pass_follows_member_removal(access):
    member_id = str(access.members[0].id)
    _, headers = _pass(access, member_id)
    assert access.client.get("/_t/member/" + member_id, headers=headers).status_code == 200
    access.db.delete(access.members[0])
    access.db.commit()
    _refused(access.client.get("/_t/member/" + member_id, headers=headers))


def test_pass_refused_for_pending_deletion_user(access):
    _, headers = _pass(access)
    access.owner.pending_deletion = True
    access.db.commit()
    _refused(access.client.get("/_t/read", headers=headers))
    ordinary = access.client.get("/_t/read", headers=access.session_headers)
    assert ordinary.status_code == 403
    assert ordinary.json()["detail"] == "Account is pending deletion. Reactivate it to continue."


def test_reconsent_required_blocks_the_pass(client, monkeypatch):
    monkeypatch.setattr(settings, "export_pass_secret", SECRET)
    headers, user_id = _signed_up_and_consented(client, "+919900000103")
    _withdraw(client, user_id, "head_change")
    issued = issue_export_pass(UUID(user_id), "family", UUID(int=502), datetime.now(timezone.utc))
    monkeypatch.setitem(PASS_READ_ROUTES, "/household-members", PassRoute("none", None, True))
    _refused(client.get("/household-members", headers={"Authorization": "Bearer " + issued.token,
                                                     "X-Export-Proof": issued.proof}))
    ordinary = client.get("/household-members", headers=headers)
    assert ordinary.status_code == 403 and ordinary.json()["detail"]["code"] == "reconsent_required"


def test_session_token_is_not_a_pass_and_a_pass_is_not_a_session(access):
    with pytest.raises(ExportPassError):
        verify_export_pass(access.session_token, datetime.now(timezone.utc))
    test_pass_gets_401_on_session_only_routes(access)


def test_pass_and_proof_never_appear_in_logs_or_error_bodies(access, caplog):
    issued, headers = _pass(access)
    headers["X-Export-Proof"] = "incorrect-proof"
    response = access.client.get("/_t/read", headers=headers)
    _refused(response)
    text = caplog.text + response.text
    assert issued.token not in text and issued.proof not in text
    assert str(access.owner.id) not in text and str(access.members[0].id) not in text
    assert "export pass refused: reason=proof jti=" in caplog.text


@pytest.mark.parametrize("secret", ["", "short", "x" * 31, "duplicate" * 4])
def test_start_up_refuses_empty_or_short_secret_in_production(monkeypatch, secret):
    from app.main import _assert_export_pass_secret_configured
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "export_pass_secret", secret)
    monkeypatch.setattr(settings, "auth_guard_secret", "duplicate" * 4)
    with pytest.raises(RuntimeError):
        _assert_export_pass_secret_configured()
    monkeypatch.setattr(settings, "export_pass_secret", SECRET)
    _assert_export_pass_secret_configured()


def test_every_allow_listed_route_exists_and_is_get_only():
    # Read from the OpenAPI document: FastAPI 0.141 does not list included routers' routes in app.routes.
    from app.main import app
    paths = app.openapi()["paths"]
    for template, entry in PASS_READ_ROUTES.items():
        assert template in paths and entry.pass_safe, template
        assert set(paths[template]) <= {"get", "head"}, template


def test_request_state_flag_set_only_for_pass_requests(access):
    _, headers = _pass(access)
    assert access.client.get("/_t/read", headers=headers).json()["export_pass"] is True
    assert access.client.get("/_t/read", headers=access.session_headers).json()["export_pass"] is False


def test_pass_safe_false_refused(access, monkeypatch):
    monkeypatch.setitem(PASS_READ_ROUTES, "/_t/read", PassRoute("query", "member_id", False))
    _, headers = _pass(access)
    _refused(access.client.get("/_t/read", headers=headers))
