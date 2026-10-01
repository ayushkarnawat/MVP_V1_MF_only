import hashlib
from app.models.enums import ConsentDocumentType as T, ConsentPurpose as P
from app.services.legal.registry import current_document, current_documents


def test_three_documents_with_hashes_of_their_content():
    docs = current_documents()
    assert set(docs) == {T.TERMS_OF_SERVICE, T.PRIVACY_POLICY, T.PAN_DISCLAIMER}
    for d in docs.values():
        assert d.sha256 == hashlib.sha256(d.content.encode("utf-8")).hexdigest()
        assert d.version and d.content.strip()


def test_privacy_covers_two_purposes():
    assert current_document(T.PRIVACY_POLICY).purposes == (P.ACCOUNT_AND_AUTHENTICATION, P.PORTFOLIO_TRACKING_ANALYTICS)
