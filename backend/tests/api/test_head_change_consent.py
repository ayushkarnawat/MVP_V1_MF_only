"""After a Head of Family swap or undo the sign-up consents are withdrawn. The server must refuse
data routes until they are agreed to again (the front-end gate alone could be skipped), while the
routes needed to agree keep working, and an ordinary outdated consent behaves exactly as before."""

from datetime import datetime, timedelta, timezone

from app.models.enums import ConsentAction
from app.services.legal.consent import SIGNUP_DOCUMENTS, ConsentEvidence, record_consent
from app.services.legal.registry import current_document
from tests.api.test_auth_routes import _consent
from tests.api.test_head_change_routes import _db, _signup


def _withdraw(client, user_id, surface: str, *, minutes_ago: int = 0) -> None:
    import uuid

    db = _db(client)
    record_consent(
        db,
        user_id=uuid.UUID(user_id),
        documents=[current_document(d) for d in SIGNUP_DOCUMENTS],
        action=ConsentAction.WITHDRAWN,
        surface=surface,
        evidence=ConsentEvidence(ip_truncated=None, ip_hmac=None, user_agent=None, device_id=None),
        recorded_at=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
    )
    db.commit()
    db.close()


def _signed_up_and_consented(client, phone):
    token, user_id = _signup(client, phone)
    headers = {"Authorization": f"Bearer {token}"}
    assert (
        client.post("/legal/consents", json={"accepted_documents": _consent()}, headers=headers).status_code
        == 200
    )
    return headers, user_id


def test_data_routes_refuse_an_account_whose_consent_a_head_change_withdrew(client):
    headers, user_id = _signed_up_and_consented(client, "+919300000001")
    assert client.get("/household-members", headers=headers).status_code == 200

    _withdraw(client, user_id, "head_change")

    refused = client.get("/household-members", headers=headers)
    assert refused.status_code == 403
    assert refused.json()["detail"]["code"] == "reconsent_required"
    me = client.get("/auth/me", headers=headers).json()
    assert me["consent_outdated_reason"] == "head_change"
    assert set(me["consent_outdated"]) == {"terms_of_service", "privacy_policy"}


def test_agreeing_again_reopens_the_data_routes(client):
    headers, user_id = _signed_up_and_consented(client, "+919300000002")
    _withdraw(client, user_id, "head_change_undo")
    assert client.get("/household-members", headers=headers).status_code == 403

    agreed = client.post("/legal/consents", json={"accepted_documents": _consent()}, headers=headers)

    assert agreed.status_code == 200
    assert client.get("/household-members", headers=headers).status_code == 200
    assert client.get("/auth/me", headers=headers).json()["consent_outdated_reason"] is None


def test_the_routes_needed_to_agree_stay_reachable(client):
    headers, user_id = _signed_up_and_consented(client, "+919300000003")
    _withdraw(client, user_id, "head_change")

    assert client.get("/auth/me", headers=headers).status_code == 200
    assert client.get("/legal/consents/me", headers=headers).status_code == 200
    assert client.get("/legal/documents").status_code == 200


def test_an_ordinary_outdated_consent_is_not_enforced_on_data_routes(client):
    # The existing behaviour: a new version of the Terms shows the front-end gate only.
    headers, user_id = _signed_up_and_consented(client, "+919300000004")
    _withdraw(client, user_id, "account_deletion")

    me = client.get("/auth/me", headers=headers).json()
    assert me["consent_outdated"]
    assert me["consent_outdated_reason"] is None
    assert client.get("/household-members", headers=headers).status_code == 200


def test_the_reason_is_null_for_an_account_that_never_had_a_head_change(client):
    headers, _ = _signed_up_and_consented(client, "+919300000005")

    me = client.get("/auth/me", headers=headers).json()

    assert me["consent_outdated_reason"] is None
    assert me["consent_outdated"] == []


def test_only_the_most_recent_consent_record_counts(client):
    # An old head-change withdrawal that was agreed to again must not block anything later.
    headers, user_id = _signed_up_and_consented(client, "+919300000006")
    _withdraw(client, user_id, "head_change", minutes_ago=10)
    assert client.post(
        "/legal/consents", json={"accepted_documents": _consent()}, headers=headers
    ).status_code == 200

    assert client.get("/household-members", headers=headers).status_code == 200
    assert client.get("/auth/me", headers=headers).json()["consent_outdated_reason"] is None
