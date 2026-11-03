from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.models.imports import Import
from app.models.user import HouseholdMember, User
from app.services.import_ import file_storage, preview_store
from app.services.import_.schemas import PersonConfirmResult
from app.services.import_.service import _preview_sessions
from tests.api.import_helpers import (
    SCHEME_NAME, _authed_headers, _authed_headers_and_member, _parse, _test_db, family_result,
)


@pytest.fixture()
def upload_session(client, tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage.default_file_storage, "_base_dir", tmp_path)
    monkeypatch.setattr("app.api.imports._prefetch_member_nav_history", AsyncMock())
    monkeypatch.setattr("app.api.imports.rebuild_member_snapshots", lambda *args: None)
    monkeypatch.setattr("app.api.imports.try_claim_recompute", lambda *args: False)
    headers, member_id = _authed_headers_and_member(client, "+919700009801", "ADITI SHARMA")
    db = _test_db()
    owner = db.get(User, db.get(HouseholdMember, uuid.UUID(member_id)).user_id)
    owner.onboarding_completed_at = datetime.now(timezone.utc) - timedelta(days=1)
    db.commit()

    def upload(surface="import_upload", *, family=False):
        request_headers = dict(headers)
        if surface is not None:
            request_headers["x-upload-surface"] = surface
        people = [{"name": "ADITI SHARMA", "pan": "ABCDE1234K"}]
        if family:
            people.append({"name": "RAMESH SHARMA", "pan": "BXQPS5678L"})
        response = _parse(client, request_headers, member_id, family_result(people), tmp_path)
        assert response.status_code == 200, response.text
        return headers, member_id, response.json()

    return upload


def _confirm(client, headers, preview, *, legacy_member_id=None):
    body = {"session_id": preview["session_id"]}
    if legacy_member_id is None:
        body["people"] = [{"person_key": person["person_key"]} for person in preview["people"]]
    else:
        body["household_member_id"] = legacy_member_id
    response = client.post("/imports/confirm", json=body, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("surface", ["import_upload", "mobile_upload", "unknown", None])
def test_confirm_returns_new_funds_for_an_in_app_upload(client, upload_session, surface):
    headers, member_id, preview = upload_session(surface, family=True)
    body = _confirm(client, headers, preview)
    assert body["people"][0]["member_id"] == member_id
    assert [person["created"] for person in body["people"]] == [False, True]
    for person in body["people"]:
        fund, = person["new_funds"]
        assert fund["scheme_name"] == SCHEME_NAME
        assert fund["invested_amount"] == "5000.00"
        assert fund["transaction_count"] == 1
        assert fund["transactions"] == [{
            "date": "2024-01-01", "type": "purchase", "amount": "5000.00", "units": "10.000",
        }]


def test_old_clients_ignore_new_funds():
    old = {
        "person_key": "p1", "member_id": str(uuid.uuid4()), "name": "Synthetic Member",
        "import_id": str(uuid.uuid4()), "added": 1, "skipped": 0,
    }
    person = PersonConfirmResult.model_validate(old)
    assert person.new_funds == []
    assert person.created is False
    assert person.model_dump(exclude={"new_funds", "created"}) == old


def test_history_endpoint_matches_the_confirm_list_for_the_same_import(client, upload_session):
    headers, _, preview = upload_session(family=True)
    body = _confirm(client, headers, preview)
    for person in body["people"]:
        response = client.get(f"/imports/{person["import_id"]}/new-funds", headers=headers)
        assert response.status_code == 200, response.text
        assert response.json() == person["new_funds"]


@pytest.mark.parametrize("completed", ["unfinished", "after", "before", "equal"])
def test_history_endpoint_is_empty_for_a_sign_up_import(client, upload_session, completed):
    headers, member_id, preview = upload_session()
    body = _confirm(client, headers, preview)
    db = _test_db()
    owner = db.get(User, db.get(HouseholdMember, uuid.UUID(member_id)).user_id)
    imported = db.get(Import, uuid.UUID(body["import_id"]))
    imported.uploaded_at = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
    owner.onboarding_completed_at = {
        "unfinished": None,
        "after": datetime(2026, 10, 21, 12, tzinfo=timezone.utc),
        "before": datetime(2026, 10, 19, 12, tzinfo=timezone.utc),
        "equal": datetime(2026, 10, 20, 12, tzinfo=timezone.utc),
    }[completed]
    db.commit()
    with patch("app.api.imports.find_new_funds", create=True) as query:
        if completed in {"unfinished", "after"}:
            response = client.get(f"/imports/{body["import_id"]}/new-funds", headers=headers)
            assert response.status_code == 200
            assert response.json() == []
            query.assert_not_called()
    if completed in {"before", "equal"}:
        response = client.get(f"/imports/{body["import_id"]}/new-funds", headers=headers)
        assert response.status_code == 200
        assert response.json() == body["people"][0]["new_funds"]


def test_history_endpoint_returns_404_for_another_users_import(client, upload_session):
    headers, _, preview = upload_session()
    body = _confirm(client, headers, preview)
    stranger = _authed_headers(client, "+919700009802")
    with patch("app.api.imports.find_new_funds", create=True) as query:
        response = client.get(f"/imports/{body["import_id"]}/new-funds", headers=stranger)
        assert response.status_code == 404
        query.assert_not_called()
        missing = client.get(f"/imports/{uuid.uuid4()}/new-funds", headers=headers)
        assert missing.status_code == 404
        query.assert_not_called()


def test_history_new_funds_requires_authentication(client):
    assert client.get(f"/imports/{uuid.uuid4()}/new-funds").status_code == 401


def test_confirm_old_single_member_body_includes_new_funds(client, upload_session):
    headers, member_id, preview = upload_session()
    body = _confirm(client, headers, preview, legacy_member_id=member_id)
    assert body["people"][0]["created"] is False
    assert body["people"][0]["new_funds"][0]["invested_amount"] == "5000.00"


def test_confirm_without_a_surface_in_an_old_session_defaults_to_import_upload(client, upload_session):
    headers, _, preview = upload_session()
    sid = preview["session_id"]
    session = _preview_sessions[sid]
    session.pop("surface", None)
    db = _test_db()
    preview_store.save(db, session)
    db.commit()
    _preview_sessions.pop(sid, None)
    body = _confirm(client, headers, preview)
    assert body["people"][0]["new_funds"][0]["invested_amount"] == "5000.00"


def test_history_new_funds_legacy_completion_flag_without_timestamp(client, upload_session):
    from app.services.auth.session import get_data_user

    headers, member_id, preview = upload_session()
    body = _confirm(client, headers, preview)
    db = _test_db()
    owner = db.get(User, db.get(HouseholdMember, uuid.UUID(member_id)).user_id)
    owner.onboarding_completed_at = None
    db.commit()
    # Legacy auth context can expose the flag even though the current ORM uses a timestamp.
    owner.onboarding_completed = True
    client.app.dependency_overrides[get_data_user] = lambda: owner
    try:
        response = client.get(f"/imports/{body["import_id"]}/new-funds", headers=headers)
        assert response.status_code == 200
        assert response.json() == body["people"][0]["new_funds"]
    finally:
        client.app.dependency_overrides.pop(get_data_user, None)


def test_history_new_funds_compares_aware_completion_with_naive_sqlite_upload(client, upload_session):
    from app.services.auth.session import get_data_user

    headers, member_id, preview = upload_session()
    body = _confirm(client, headers, preview)
    db = _test_db()
    owner = db.get(User, db.get(HouseholdMember, uuid.UUID(member_id)).user_id)
    owner.onboarding_completed_at = datetime(2020, 1, 1, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    client.app.dependency_overrides[get_data_user] = lambda: owner
    try:
        response = client.get(f"/imports/{body["import_id"]}/new-funds", headers=headers)
        assert response.status_code == 200
        assert response.json() == body["people"][0]["new_funds"]
    finally:
        client.app.dependency_overrides.pop(get_data_user, None)
