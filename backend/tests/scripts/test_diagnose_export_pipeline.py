import uuid
from datetime import datetime, timezone

from app.models.auth import Session as SessionModel
from app.models.user import User
from scripts.diagnose_export_pipeline import (
    INVENTED_PAYLOAD, host_matches, mint_session, remove_minted_session, rss_mb_of, summarise_runs,
)


def test_host_matches_is_exact_on_the_host():
    assert host_matches("https://ls-redesign.unifolio.in", "ls-redesign.unifolio.in")
    assert host_matches("https://LS-Redesign.unifolio.in:443/", "ls-redesign.unifolio.in")
    assert not host_matches("http://localhost:5173", "ls-redesign.unifolio.in")
    assert not host_matches("https://ls-redesign.unifolio.in.evil.example", "ls-redesign.unifolio.in")


def test_rss_is_read_in_megabytes_and_missing_is_zero():
    assert rss_mb_of("Name:\tchrome\nVmRSS:\t   20480 kB\n") == 20
    assert rss_mb_of("Name:\tchrome\n") == 0.0


def test_summary_keeps_the_first_run_apart_and_counts_codes():
    runs = [
        {"ok": True, "status": 200, "ms": 4000.0, "bytes": 90000},
        {"ok": False, "status": 500, "ms": 16000.0, "bytes": 0},
        {"ok": True, "status": 200, "ms": 1000.0, "bytes": 91000},
        {"ok": False, "status": None, "ms": 60000.0, "bytes": 0},
    ]
    out = summarise_runs(runs)
    assert (out["runs"], out["ok"], out["failed"], out["failure_rate_percent"]) == (4, 2, 2, 50)
    assert out["status_codes"] == {"200": 2, "500": 1, "no-answer": 1}
    assert out["first_run_ms"] == 4000 and out["first_run_ok"] is True and out["later_runs_failed"] == 2
    assert out["ok_median_ms"] == 2500 and out["ok_max_ms"] == 4000


def test_summary_of_no_runs_and_of_all_failures():
    assert summarise_runs([]) == {"runs": 0}
    out = summarise_runs([{"ok": False, "status": 500, "ms": 1.0, "bytes": 0}])
    assert out["ok_median_ms"] is None and out["pdf_bytes_median"] is None


def test_invented_payload_holds_no_personal_data():
    assert INVENTED_PAYLOAD["scopeName"] == "Pipeline check"
    assert INVENTED_PAYLOAD["allocation"]["total_value"] == "0"


def test_a_minted_session_is_removed_again_and_nothing_else_is_touched(db_session):
    user = User(phone_number="+919400000077", created_at=datetime(2026, 11, 1, tzinfo=timezone.utc))
    db_session.add(user)
    db_session.commit()
    keep = SessionModel(user_id=user.id, session_token_hash="x" * 64, auth_method="phone_otp",
                        created_at=datetime.now(timezone.utc), expires_at=datetime.now(timezone.utc),
                        last_active_at=datetime.now(timezone.utc))
    db_session.add(keep)
    db_session.commit()
    own_db, session_id, raw = mint_session(user.id, db=db_session)
    assert raw and db_session.query(SessionModel).count() == 2
    remove_minted_session(own_db, session_id)
    remaining = db_session.query(SessionModel).all()
    assert [s.session_token_hash for s in remaining] == ["x" * 64]
