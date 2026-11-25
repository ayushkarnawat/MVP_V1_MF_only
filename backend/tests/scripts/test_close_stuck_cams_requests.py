from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
import uuid

import pytest
from sqlalchemy import event, text

from app.models.enums import ImportStatus
from app.models.imports import Import
from tests.services.import_.test_confirm_people import _member, _user


def _seed(db):
    from app.models.enums import Relationship

    user = _user(db)
    head = _member(db, user, "Aditi Sharma", is_head=True)
    member = _member(db, user, "Meera Sharma", relationship=Relationship.PARENT)
    now = datetime.now(timezone.utc)
    expired = Import(household_member_id=head.id, status=ImportStatus.WAITING_FOR_USER,
                     uploaded_at=now - timedelta(days=3), expires_at=now - timedelta(days=1))
    superseded = Import(household_member_id=member.id, status=ImportStatus.WAITING_FOR_USER,
                        uploaded_at=now - timedelta(hours=2), expires_at=now + timedelta(hours=46))
    live = Import(household_member_id=member.id, status=ImportStatus.WAITING_FOR_USER,
                  uploaded_at=now, expires_at=now + timedelta(hours=48))
    confirmed = Import(household_member_id=member.id, status=ImportStatus.CONFIRMED,
                       uploaded_at=now - timedelta(hours=1), confirmed_at=now - timedelta(hours=1))
    db.add_all([expired, superseded, live, confirmed])
    db.commit()
    return user, head, member, expired, superseded, live


def _run(db, monkeypatch, args):
    from scripts import close_stuck_cams_requests as script

    monkeypatch.setattr(script, "SessionLocal", lambda: nullcontext(db))
    assert script.main(args) == 0


def test_dry_run_counts_and_writes_nothing(db_session, monkeypatch, capsys):
    _, _, _, expired, superseded, live = _seed(db_session)
    _run(db_session, monkeypatch, [])
    assert capsys.readouterr().out.splitlines() == [
        "past_expiry=1", "later_import=1", "would_close=2", "left_open=1",
    ]
    for row in (expired, superseded, live):
        db_session.refresh(row)
        assert row.status == ImportStatus.WAITING_FOR_USER
    assert not db_session.new and not db_session.dirty and not db_session.deleted


def test_apply_closes_expired_and_superseded_requests_and_leaves_live_ones(db_session, monkeypatch, capsys):
    _, head, _, expired, superseded, live = _seed(db_session)
    # One expired request also has a later confirmed import: count the union once.
    db_session.add(Import(household_member_id=head.id, status=ImportStatus.CONFIRMED,
                          uploaded_at=expired.uploaded_at, confirmed_at=datetime.now(timezone.utc)))
    # Exercise the 200-row commit bound as well as a live sibling on the same member.
    db_session.add_all([Import(household_member_id=head.id, status=ImportStatus.WAITING_FOR_USER,
                              uploaded_at=expired.uploaded_at, expires_at=expired.expires_at)
                        for _ in range(200)])
    db_session.commit()
    batch_sizes = []
    def before_commit(db):
        batch_sizes.append(sum(isinstance(row, Import) and row.status == ImportStatus.EXPIRED
                               for row in db.dirty))
    event.listen(db_session, "before_commit", before_commit)
    try:
        _run(db_session, monkeypatch, ["--apply"])
    finally:
        event.remove(db_session, "before_commit", before_commit)
    assert capsys.readouterr().out.splitlines() == [
        "past_expiry=201", "later_import=202", "closed=202", "left_open=1",
    ]
    assert sum(batch_sizes) == 202 and max(batch_sizes) <= 200
    for row in (expired, superseded, live):
        db_session.refresh(row)
    assert expired.status == superseded.status == ImportStatus.EXPIRED
    assert live.status == ImportStatus.WAITING_FOR_USER


def test_other_members_requests_are_not_touched(db_session, monkeypatch, capsys):
    _, _, _, expired, superseded, live = _seed(db_session)
    expired.expires_at = datetime.now(timezone.utc) + timedelta(hours=48)
    db_session.commit()
    from scripts.close_stuck_cams_requests import find_stuck_requests
    assert [row.id for row in find_stuck_requests(db_session, datetime.now(timezone.utc))] == [superseded.id]
    _run(db_session, monkeypatch, ["--apply"])
    db_session.refresh(expired)
    db_session.refresh(live)
    assert expired.status == live.status == ImportStatus.WAITING_FOR_USER


def test_output_has_no_names_or_ids(db_session, monkeypatch, capsys):
    user, head, member, *rows = _seed(db_session)
    _run(db_session, monkeypatch, [])
    output = capsys.readouterr().out
    assert output.splitlines() == ["past_expiry=1", "later_import=1", "would_close=2", "left_open=1"]
    for obj in (user, head, member, *rows):
        assert str(obj.id) not in output
    assert head.name not in output and member.name not in output


@pytest.mark.parametrize("attempt", ["flush", "INSERT", "UPDATE", "DELETE"])
def test_aborts_on_any_write_attempt_in_dry_run(db_session, monkeypatch, attempt):
    from scripts import close_stuck_cams_requests as script

    _seed(db_session)
    def write(db, now):
        if attempt == "flush":
            db.add(Import(id=uuid.uuid4(), status=ImportStatus.WAITING_FOR_USER))
            db.flush()
        else:
            statements = {"INSERT": "INSERT INTO imports (id) VALUES ('guard-probe')",
                          "UPDATE": "UPDATE imports SET source_tab = 'guard-probe'",
                          "DELETE": "DELETE FROM imports"}
            db.execute(text(statements[attempt]))
        raise AssertionError("write guard did not abort")
    monkeypatch.setattr(script, "find_stuck_requests", write)
    monkeypatch.setattr(script, "SessionLocal", lambda: nullcontext(db_session))
    with pytest.raises(script.WriteAttempted):
        script.main([])
    db_session.rollback()


def test_dry_run_guard_blocks_a_write_hidden_behind_a_comment(db_session):
    from scripts import close_stuck_cams_requests as script

    _seed(db_session)
    with pytest.raises(script.WriteAttempted), script.guard(db_session):
        db_session.execute(text("-- maintenance\nUPDATE imports SET source_tab = 'probe'"))


def test_dry_run_guard_blocks_a_write_after_a_cte(db_session):
    from scripts import close_stuck_cams_requests as script

    _seed(db_session)
    with pytest.raises(script.WriteAttempted), script.guard(db_session):
        db_session.execute(text("WITH marker AS (SELECT 1) UPDATE imports SET source_tab = 'probe'"))


def test_dry_run_guard_blocks_a_block_comment_prefix(db_session):
    from scripts import close_stuck_cams_requests as script

    _seed(db_session)
    with pytest.raises(script.WriteAttempted), script.guard(db_session):
        db_session.execute(text("/* x */ DELETE FROM imports"))


def test_dry_run_guard_allows_a_plain_select_and_a_select_for_update(db_session):
    from scripts import close_stuck_cams_requests as script

    with script.guard(db_session):
        assert db_session.scalar(text("SELECT 1")) == 1
        # SQLite cannot execute lock clauses; exercise the SQL listener directly.
        for clause in ("FOR UPDATE", "FOR NO KEY UPDATE", "FOR SHARE", "FOR KEY SHARE"):
            for listener in db_session.get_bind().dispatch.before_cursor_execute:
                listener(None, None, f"SELECT 1 {clause}", (), None, False)


def test_dry_run_guard_does_not_trip_on_column_names_like_updated_at_or_on_string_literals(db_session):
    from scripts import close_stuck_cams_requests as script

    with script.guard(db_session):
        result = db_session.execute(text("SELECT 'update' AS updated_at, 'can''t delete -- /* x */' AS note")).one()
        assert result.updated_at == "update"
        assert result.note == "can't delete -- /* x */"


def test_dry_run_runs_in_a_read_only_session_on_sqlite(db_session, monkeypatch, capsys):
    import sqlite3
    from scripts import close_stuck_cams_requests as script

    _seed(db_session)
    original = script.find_stuck_requests
    def check_read_only(db, now):
        assert db.scalar(text("PRAGMA query_only")) == 1
        # Bypass SQLAlchemy's listener to verify the database's own protection.
        raw = db.connection().connection.driver_connection
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            raw.execute("UPDATE imports SET source_tab = 'probe'")
        return original(db, now)
    monkeypatch.setattr(script, "find_stuck_requests", check_read_only)
    _run(db_session, monkeypatch, [])
    assert db_session.scalar(text("PRAGMA query_only")) == 0


def test_apply_does_not_close_a_request_renewed_after_selection(db_session, monkeypatch, capsys):
    from scripts import close_stuck_cams_requests as script
    from app.services.import_.cams_portal import initiate_cams_request

    user, head, _, expired, superseded, live = _seed(db_session)
    superseded.status = ImportStatus.EXPIRED
    db_session.commit()
    original = script.find_stuck_requests
    def select_then_renew(db, now):
        selected = original(db, now)
        assert [row.id for row in selected] == [expired.id]
        initiate_cams_request(db, user.id, head.id)
        return selected
    monkeypatch.setattr(script, "find_stuck_requests", select_then_renew)
    _run(db_session, monkeypatch, ["--apply"])
    db_session.refresh(expired)
    assert expired.status == ImportStatus.WAITING_FOR_USER
    assert capsys.readouterr().out.splitlines() == [
        "past_expiry=0", "later_import=0", "closed=0", "left_open=2",
    ]


def test_apply_still_closes_a_row_that_is_still_expired_at_apply_time(db_session, monkeypatch, capsys):
    _, _, _, expired, _, live = _seed(db_session)
    _run(db_session, monkeypatch, ["--apply"])
    db_session.refresh(expired)
    db_session.refresh(live)
    assert expired.status == ImportStatus.EXPIRED
    assert live.status == ImportStatus.WAITING_FOR_USER
    assert capsys.readouterr().out.splitlines() == [
        "past_expiry=1", "later_import=1", "closed=2", "left_open=1",
    ]
