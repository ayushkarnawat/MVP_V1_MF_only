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
