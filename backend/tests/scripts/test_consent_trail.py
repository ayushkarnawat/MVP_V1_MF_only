import uuid
from datetime import datetime, timedelta, timezone

from app.models.enums import ConsentAction, ConsentDocumentType
from app.models.user import User
from app.services.legal.consent import ConsentEvidence, record_consent
from app.services.legal.registry import current_document
from scripts.consent_trail import format_row, main, trail_rows

_EVIDENCE = ConsentEvidence(ip_truncated="203.0.113.0", ip_hmac="a" * 64, user_agent="ua", device_id="dev-9")


def _seed(db):
    user = User(phone_number="+919400000001", created_at=datetime(2026, 10, 1, tzinfo=timezone.utc))
    db.add(user)
    db.flush()
    t0 = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
    # Inserted newest first so ordering is proven, not incidental.
    record_consent(
        db, user_id=user.id, documents=[current_document(ConsentDocumentType.PAN_DISCLAIMER)],
        action=ConsentAction.GIVEN, surface="import_upload", evidence=_EVIDENCE, recorded_at=t0 + timedelta(hours=1),
    )
    record_consent(
        db, user_id=user.id, documents=[current_document(ConsentDocumentType.TERMS_OF_SERVICE)],
        action=ConsentAction.GIVEN, surface="signup_phone", evidence=_EVIDENCE, recorded_at=t0,
    )
    # Another user's row must not leak into the trail.
    record_consent(
        db, user_id=uuid.uuid4(), documents=[current_document(ConsentDocumentType.TERMS_OF_SERVICE)],
        action=ConsentAction.GIVEN, surface="signup_phone", evidence=_EVIDENCE, recorded_at=t0,
    )
    db.commit()
    return user


def test_trail_rows_oldest_first(db_session):
    user = _seed(db_session)

    rows = trail_rows(db_session, user.id)

    assert [r.surface for r in rows] == ["signup_phone", "import_upload"]
    line = format_row(rows[0])
    assert line.split() == [
        rows[0].recorded_at.isoformat(), "given", "terms_of_service",
        current_document(ConsentDocumentType.TERMS_OF_SERVICE).version,
        "service_agreement", "signup_phone", "203.0.113.0", "dev-9",
        current_document(ConsentDocumentType.TERMS_OF_SERVICE).sha256, "a" * 64, "-", "-", "ua",
    ]


def test_main_resolves_phone_and_prints_one_line_per_row(db_session, capsys, monkeypatch):
    user = _seed(db_session)
    import scripts.consent_trail as module

    monkeypatch.setattr(module, "_session", lambda: db_session)
    monkeypatch.setattr(db_session, "close", lambda: None)

    assert main(["--phone", "+919400000001"]) == 0
    by_phone = capsys.readouterr().out.strip().splitlines()
    assert main(["--user", str(user.id)]) == 0
    by_user = capsys.readouterr().out.strip().splitlines()

    assert len(by_phone) == 2 and by_phone == by_user
    assert main(["--phone", "+919999999999"]) == 1
