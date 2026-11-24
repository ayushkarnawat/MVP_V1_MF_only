from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock

from app.api import export as exports
from app.config import settings
from app.db.session import get_db
from app.models.enums import AuthIdentityProvider
from app.models.user import User, HouseholdMember
from app.services.auth.session import create_session
from app.services.export import jobs
from app.services.export.pass_token import issue_export_pass
from app.services.export.render import ExportOptions
from tests.services.export.test_browser_pool import FakeSlotBackend, Clock


@pytest.fixture
def access(db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "export_job_dir", str(tmp_path / "jobs"))
    monkeypatch.setattr(settings, "export_lock_dir", str(tmp_path / "locks"))
    monkeypatch.setattr(settings, "export_pass_secret", "invented-export-route-secret-32-characters")
    user = User(id=UUID(int=1), phone_number="+919900000201", created_at=datetime.now(timezone.utc))
    other = User(id=UUID(int=2), phone_number="+919900000202", created_at=datetime.now(timezone.utc))
    db_session.add_all([user, other])
    db_session.commit()
    member = HouseholdMember(id=UUID(int=11), user_id=other.id, name="Invented member", created_at=datetime.now(timezone.utc))
    db_session.add(member)
    db_session.commit()
    _, token = create_session(db_session, user.id, AuthIdentityProvider.PHONE_OTP)
    backend = FakeSlotBackend(Clock())
    monkeypatch.setattr(exports, "FlockSlotBackend", lambda: backend)
    monkeypatch.setattr(exports, "run_export", AsyncMock())
    def app():
        result = FastAPI()
        result.include_router(exports.router)
        result.dependency_overrides[get_db] = lambda: db_session
        return result
    with TestClient(app()) as client:
        yield SimpleNamespace(client=client, app=app, user=user, other=other, foreign=member, backend=backend,
                              headers={"Authorization": "Bearer " + token})


BODY = {"scope": "family", "section_ids": ["overview-summary"]}


def create(access):
    response = access.client.post("/export/report", headers=access.headers, json=BODY)
    assert response.status_code == 200
    return response.json()["job_id"]


def test_create_requires_a_signed_in_user_and_an_owned_scope(access):
    assert access.client.post("/export/report", json=BODY).status_code == 401
    assert access.client.post("/export/report", headers=access.headers,
                              json={**BODY, "scope": str(access.foreign.id)}).status_code == 404


def test_a_pass_is_refused_on_every_export_route(access):
    job_id = jobs.create_job(access.user.id, "family", 1)
    issued = issue_export_pass(access.user.id, "family", UUID(int=99), datetime.now(timezone.utc))
    headers = {"Authorization": "Bearer " + issued.token, "X-Export-Proof": issued.proof}
    for method, path in (("POST", "/export/report"), ("GET", f"/export/report/{job_id}"),
                         ("GET", f"/export/report/{job_id}/file"), ("DELETE", f"/export/report/{job_id}")):
        response = access.client.request(method, path, headers=headers, json=BODY if method == "POST" else None)
        assert response.status_code == 403 and response.json() == {"detail": "Not allowed."}


def test_a_second_create_while_one_runs_is_409_with_the_running_job_id(access):
    job_id = create(access)
    response = access.client.post("/export/report", headers=access.headers, json=BODY)
    assert response.status_code == 409
    assert response.json() == {"code": "export_in_progress", "job_id": job_id}


def test_cooldown_is_429(access):
    access.backend.mark_done(jobs.user_hash(access.user.id))
    response = access.client.post("/export/report", headers=access.headers, json=BODY)
    assert response.status_code == 429 and response.json() == {"code": "export_cooldown"}


def test_status_across_workers(access):
    job_id = create(access)
    with TestClient(access.app()) as other_worker:
        response = other_worker.get(f"/export/report/{job_id}", headers=access.headers)
    assert response.status_code == 200 and response.json()["status"] == "preparing"
    assert "user_hash" not in response.json() and "cancel" not in response.json()


def test_a_job_of_another_user_is_404_with_the_same_body_as_a_missing_job(access):
    job_id = jobs.create_job(access.other.id, "family", 1)
    missing = access.client.get("/export/report/" + "f" * 32, headers=access.headers)
    foreign = access.client.get(f"/export/report/{job_id}", headers=access.headers)
    assert missing.status_code == foreign.status_code == 404
    assert missing.json() == foreign.json()


def test_file_is_served_once_then_404(access):
    job_id = create(access)
    jobs.store_pdf(job_id, b"%PDF invented")
    jobs.update_job(job_id, status="ready", pdf_bytes=13)
    assert access.client.get(f"/export/report/{job_id}/file", headers=access.headers).content == b"%PDF invented"
    assert access.client.get(f"/export/report/{job_id}/file", headers=access.headers).status_code == 404


def test_file_headers_have_the_date_only_filename_and_no_store(access):
    from zoneinfo import ZoneInfo
    job_id = create(access)
    jobs.store_pdf(job_id, b"%PDF invented")
    jobs.update_job(job_id, status="ready")
    response = access.client.get(f"/export/report/{job_id}/file", headers=access.headers)
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    assert response.headers["content-disposition"] == f'attachment; filename="Unifolio-portfolio-report-{today}.pdf"'
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-type"] == "application/pdf"


def test_file_not_available_before_ready_is_404(access):
    job_id = create(access)
    assert access.client.get(f"/export/report/{job_id}/file", headers=access.headers).status_code == 404


def test_cancel_is_idempotent_and_owner_only(access):
    job_id = create(access)
    for _ in range(2):
        assert access.client.delete(f"/export/report/{job_id}", headers=access.headers).json() == {"status": "cancelled"}
    foreign = jobs.create_job(access.other.id, "family", 1)
    assert access.client.delete(f"/export/report/{foreign}", headers=access.headers).status_code == 404


def test_section_ids_are_validated_for_shape_count_and_duplicates():
    from pydantic import ValidationError
    assert ExportOptions(scope="family", section_ids=["a", "a", "b"]).section_ids == ["a", "b"]
    for ids in ([], ["a"] * 41, ["../x"], ["A"], ["a" * 61]):
        with pytest.raises(ValidationError):
            ExportOptions(scope="family", section_ids=ids)


@pytest.mark.parametrize("scope", ["unknown", str(UUID(int=999))])
def test_unknown_scope_or_foreign_member_is_404(access, scope):
    assert access.client.post("/export/report", headers=access.headers, json={**BODY, "scope": scope}).status_code == 404


def test_old_export_route_still_works_unchanged(monkeypatch):
    monkeypatch.setattr("app.services.auth.head_change_consent.consent_outdated_reason", lambda db, user_id: None)
    from tests.api.test_analytics_export_route import test_export_pdf_aggregate_scope_skips_member_ownership_check
    test_export_pdf_aggregate_scope_skips_member_ownership_check()


@pytest.mark.parametrize("origin", ["", "http://api.example.test", "https://", "https://api.example.test/path"])
def test_startup_refuses_missing_or_non_https_export_api_origin_in_production(monkeypatch, origin):
    from app.main import _assert_export_api_origin_configured
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "export_api_origin", origin)
    with pytest.raises(RuntimeError):
        _assert_export_api_origin_configured()
