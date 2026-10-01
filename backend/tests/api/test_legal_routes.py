def test_legal_documents_are_public_and_complete(client):
    r = client.get("/legal/documents")
    assert r.status_code == 200
    body = {d["document_type"]: d for d in r.json()}
    assert set(body) == {"terms_of_service", "privacy_policy", "pan_disclaimer"}
    assert body["privacy_policy"]["purposes"] == ["account_and_authentication", "portfolio_tracking_analytics"]
    assert len(body["terms_of_service"]["sha256"]) == 64


def _legacy_headers(client, phone):
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    token = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).json()["session_token"]
    return {"Authorization": f"Bearer {token}"}


def test_reconsent_requires_auth_and_current_versions(client):
    from app.models.enums import ConsentDocumentType as T
    from app.services.legal.registry import current_document

    unauth = client.post("/legal/consents", json={"accepted_documents": []})
    assert unauth.status_code == 401

    headers = _legacy_headers(client, "+919300000101")
    stale = client.post(
        "/legal/consents",
        json={
            "accepted_documents": [
                {"document_type": "terms_of_service", "document_version": "tos-old"},
                {"document_type": "privacy_policy", "document_version": current_document(T.PRIVACY_POLICY).version},
            ]
        },
        headers=headers,
    )
    assert stale.status_code == 422
    detail = stale.json()["detail"]
    assert detail["code"] == "consent_required"
    assert detail["missing"] == ["terms_of_service"]
    # Nothing recorded on a refused re-consent: still both outdated.
    assert client.get("/auth/me", headers=headers).json()["consent_outdated"] == ["terms_of_service", "privacy_policy"]


def test_my_consents_returns_latest_given_per_document(client):
    import uuid
    from datetime import datetime, timedelta, timezone

    from app.db.session import get_db
    from app.models.enums import ConsentAction, ConsentDocumentType as T
    from app.services.legal.consent import ConsentEvidence, record_consent
    from app.services.legal.registry import current_document

    assert client.get("/legal/consents/me").status_code == 401

    headers = _legacy_headers(client, "+919300000102")
    assert client.get("/legal/consents/me", headers=headers).json() == []

    accepted = [
        {"document_type": t.value, "document_version": current_document(t).version}
        for t in (T.TERMS_OF_SERVICE, T.PRIVACY_POLICY)
    ]
    assert client.post("/legal/consents", json={"accepted_documents": accepted}, headers=headers).status_code == 200

    body = client.get("/legal/consents/me", headers=headers).json()
    assert {r["document_type"] for r in body} == {"terms_of_service", "privacy_policy"}
    by_type = {r["document_type"]: r for r in body}
    assert by_type["terms_of_service"]["document_version"] == current_document(T.TERMS_OF_SERVICE).version
    assert by_type["terms_of_service"]["recorded_at"]

    # Withdrawing the privacy policy later omits it; the T&C stays.
    user_id = uuid.UUID(client.get("/auth/me", headers=headers).json()["user_id"])
    db = next(client.app.dependency_overrides[get_db]())
    try:
        record_consent(
            db,
            user_id=user_id,
            documents=[current_document(T.PRIVACY_POLICY)],
            action=ConsentAction.WITHDRAWN,
            surface="test",
            evidence=ConsentEvidence(None, None, None, None),
            recorded_at=datetime.now(timezone.utc) + timedelta(seconds=5),
        )
        db.commit()
    finally:
        db.close()
    after = client.get("/legal/consents/me", headers=headers).json()
    assert [r["document_type"] for r in after] == ["terms_of_service"]
