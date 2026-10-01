"""0022 on real Postgres: consent_records is append-only, enforced by the
server-side trigger (not just app code). Skipped without TEST_DATABASE_URL,
same as the other postgres tests."""

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

pytestmark = pytest.mark.postgres


@pytest.fixture()
def postgres_url():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL not set — no local Postgres to test against")
    return url


def _alembic(*args):
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR, capture_output=True, text=True,
    )


def test_0022_consent_records_append_only_on_postgres(postgres_url, monkeypatch):
    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import DatabaseError
    from sqlalchemy.orm import sessionmaker

    from app.models.enums import ConsentAction, ConsentDocumentType
    from app.services.legal.consent import ConsentEvidence, record_consent
    from app.services.legal.registry import current_document

    monkeypatch.setenv("DATABASE_URL", postgres_url)
    _alembic("downgrade", "base")
    up = _alembic("upgrade", "head")
    assert up.returncode == 0, up.stderr

    engine = create_engine(postgres_url)
    try:
        db = sessionmaker(bind=engine)()
        evidence = ConsentEvidence(ip_truncated="203.0.113.0", ip_hmac="a" * 64,
                                   user_agent="ua", device_id="dev")
        record_consent(db, user_id=uuid.uuid4(),
                       documents=[current_document(ConsentDocumentType.PAN_DISCLAIMER)],
                       action=ConsentAction.GIVEN, surface="import_upload", evidence=evidence)
        db.commit()

        with pytest.raises(DatabaseError, match="consent_records_append_only"):
            db.execute(text("UPDATE consent_records SET surface = 'x'"))
            db.commit()
        db.rollback()
        with pytest.raises(DatabaseError, match="consent_records_append_only"):
            db.execute(text("DELETE FROM consent_records"))
            db.commit()
        db.rollback()
        assert db.execute(text("SELECT count(*) FROM consent_records")).scalar_one() == 1
        db.close()
    finally:
        engine.dispose()
        # The append-only trigger would block a later test's cleanup DELETE;
        # dropping the schema back to base removes table, trigger and function.
        _alembic("downgrade", "base")
