import uuid
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DatabaseError

from app.models.consent import ConsentRecord
from app.models.enums import ConsentAction as A, ConsentDocumentType as T, ConsentPurpose as P
from app.services.legal.consent import (
    AcceptedDocument, ConsentEvidence, ConsentRequiredError, SIGNUP_DOCUMENTS,
    ip_hmac, outdated_documents, record_consent, truncate_ip, validate_accepted,
)
from app.services.legal.registry import current_document

EV = ConsentEvidence(ip_truncated="203.0.113.0", ip_hmac="x" * 64, user_agent="ua", device_id="dev")


def _accepted(*types):
    return [AcceptedDocument(document_type=t, document_version=current_document(t).version) for t in types]


def test_truncate_ip():
    assert truncate_ip("203.0.113.77") == "203.0.113.0"
    assert truncate_ip("2001:db8:abcd:12:1:2:3:4") == "2001:db8:abcd::"
    assert truncate_ip(None) is None and truncate_ip("not-an-ip") is None


def test_ip_hmac_is_keyed_and_stable():
    assert ip_hmac("203.0.113.77") == ip_hmac("203.0.113.77")
    assert ip_hmac("203.0.113.77") != ip_hmac("203.0.113.78")
    assert "203.0.113.77" not in ip_hmac("203.0.113.77")


def test_ip_hmac_is_domain_separated_from_pan_lookup_hashes():
    # Same pepper, different derived key: an IP hash must never equal the
    # plain pepper-keyed HMAC that PAN lookups use.
    import hashlib, hmac
    from app.services.import_.crypto import default_key_provider

    ip = "203.0.113.77"
    plain = hmac.new(default_key_provider.lookup_pepper(), ip.encode(), hashlib.sha256).hexdigest()
    assert ip_hmac(ip) != plain


def test_ip_hmac_changes_with_the_pepper(monkeypatch):
    from app.services.legal import consent as consent_module

    before = ip_hmac("203.0.113.77")
    monkeypatch.setattr(consent_module.settings, "pan_lookup_pepper", "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=")
    assert ip_hmac("203.0.113.77") != before


def test_ip_hmac_missing_key_none_in_development_raises_elsewhere(monkeypatch):
    from app.services.legal import consent as consent_module

    monkeypatch.setattr(consent_module.settings, "pan_lookup_pepper", "")
    monkeypatch.setattr(consent_module.settings, "environment", "development")
    assert ip_hmac("203.0.113.77") is None
    monkeypatch.setattr(consent_module.settings, "environment", "staging")
    with pytest.raises(RuntimeError):
        ip_hmac("203.0.113.77")


def test_validate_accepted_requires_current_versions():
    docs = validate_accepted(_accepted(*SIGNUP_DOCUMENTS), SIGNUP_DOCUMENTS)
    assert [d.document_type for d in docs] == list(SIGNUP_DOCUMENTS)
    with pytest.raises(ConsentRequiredError) as e:
        validate_accepted(_accepted(T.TERMS_OF_SERVICE), SIGNUP_DOCUMENTS)
    assert e.value.missing == ["privacy_policy"]
    stale = [AcceptedDocument(document_type=T.TERMS_OF_SERVICE, document_version="old"), *_accepted(T.PRIVACY_POLICY)]
    with pytest.raises(ConsentRequiredError):
        validate_accepted(stale, SIGNUP_DOCUMENTS)
    with pytest.raises(ConsentRequiredError):
        validate_accepted(None, SIGNUP_DOCUMENTS)


def test_record_consent_writes_one_row_per_purpose(db_session):
    uid = uuid.uuid4()
    rows = record_consent(db_session, user_id=uid, documents=validate_accepted(_accepted(*SIGNUP_DOCUMENTS), SIGNUP_DOCUMENTS),
                          action=A.GIVEN, surface="signup_phone", evidence=EV)
    db_session.commit()
    assert sorted(r.purpose_code.value for r in rows) == ["account_and_authentication", "portfolio_tracking_analytics", "service_agreement"]
    assert all(r.document_sha256 == current_document(r.document_type).sha256 for r in rows)
    assert outdated_documents(db_session, uid, SIGNUP_DOCUMENTS) == []


def test_outdated_when_missing_or_withdrawn(db_session):
    uid = uuid.uuid4()
    assert outdated_documents(db_session, uid, SIGNUP_DOCUMENTS) == list(SIGNUP_DOCUMENTS)
    docs = validate_accepted(_accepted(*SIGNUP_DOCUMENTS), SIGNUP_DOCUMENTS)
    record_consent(db_session, user_id=uid, documents=docs, action=A.GIVEN, surface="signup_phone", evidence=EV)
    db_session.commit()
    record_consent(db_session, user_id=uid, documents=docs, action=A.WITHDRAWN, surface="account_deletion", evidence=EV)
    db_session.commit()
    assert outdated_documents(db_session, uid, SIGNUP_DOCUMENTS) == list(SIGNUP_DOCUMENTS)


def test_rows_cannot_be_updated_or_deleted(db_session):
    uid = uuid.uuid4()
    record_consent(db_session, user_id=uid, documents=[current_document(T.PAN_DISCLAIMER)], action=A.GIVEN,
                   surface="import_upload", evidence=EV)
    db_session.commit()
    with pytest.raises(DatabaseError):
        db_session.execute(text("UPDATE consent_records SET surface = 'x'")); db_session.commit()
    db_session.rollback()
    with pytest.raises(DatabaseError):
        db_session.execute(text("DELETE FROM consent_records")); db_session.commit()
    db_session.rollback()
    assert db_session.query(ConsentRecord).count() == 1
