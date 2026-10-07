"""Persisted reviews survive restart without exposing PAN or losing row state."""
import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from app.models.imports import Import
from app.models.enums import ImportStatus, CostSource
from app.services.import_ import preview_store
from app.services.import_.service import _preview_sessions, _sweep_expired_sessions, start_import_session
from app.services.import_.confirm_people import confirm_people_import
from app.services.import_.lifecycle_service import SessionExpiredError
from tests.services.import_.test_confirm_people import _member, _user, _everyone
from tests.api.import_helpers import family_result, seed_master_scheme


@pytest.fixture(autouse=True)
def isolated_review(monkeypatch, tmp_path):
    from app.services.import_ import file_storage
    _preview_sessions.clear()
    monkeypatch.setattr(file_storage.default_file_storage, "_base_dir", tmp_path)
    monkeypatch.setattr("app.services.import_.service._fetch_nav_history", AsyncMock(return_value=[
        (date(2015,1,1),Decimal("30")),(date(2015,12,31),Decimal("45")),(date(2024,1,1),Decimal("500"))]))
    yield
    _preview_sessions.clear()


def review(db):
    me = _member(db, _user(db), "Aditi Sharma")
    seed_master_scheme(db)
    result = family_result([{"name":"ADITI SHARMA", "pan":"ABCDE1234K"}])
    scheme = result.schemes[0]
    scheme.open_units,scheme.close_units = Decimal("100"),Decimal("110")
    scheme.valuation_cost,scheme.valuation_nav,scheme.valuation_date = Decimal("9000"),Decimal("500"),date(2024,1,1)
    result.statement_from = date(2016,1,1)
    result.transactions[0].balance = Decimal("110")
    preview = asyncio.run(start_import_session(db,me.user_id,me,result,"cas.pdf",b"%PDF encrypted review"))
    return me,preview


def test_round_trip_preserves_session(db_session):
    me,preview = review(db_session)
    original = _preview_sessions[preview.session_id]
    restored = preview_store.load(db_session,preview.session_id)
    for key in original.keys()-{"lock"}:
        assert restored[key] == original[key], key
    assert restored["opening_lots"][preview.schemes[0].temp_id].cost_source == CostSource.CAS_COST
    assert restored["identifications"]
    assert next(iter(restored["identifications"].values())).nav_matched is True
    assert restored["nav_histories"]
    assert restored["lock"] is not original["lock"]
    assert restored["lock"].acquire(blocking=False)
    restored["lock"].release()


def test_blob_is_encrypted(db_session):
    me,preview = review(db_session)
    row = db_session.get(Import,uuid.UUID(preview.session_id))
    assert row.status == ImportStatus.PREVIEWING
    assert "ABCDE1234K" not in row.preview_state
    assert "%PDF" not in row.preview_state


def test_confirm_after_restart_uses_persisted_session(db_session):
    me,preview = review(db_session)
    _preview_sessions.clear()
    result = confirm_people_import(db_session,preview.session_id,me.user_id,_everyone(preview))
    assert result.added == 2  # one real row and its restored opening
    assert db_session.get(Import,uuid.UUID(preview.session_id)) is None
    _preview_sessions.clear()
    with pytest.raises(SessionExpiredError):
        confirm_people_import(db_session,preview.session_id,me.user_id,_everyone(preview))
    assert db_session.query(Import).count() == 1


def test_expired_session_after_restart_releases_claims(db_session):
    me,preview = review(db_session)
    session = _preview_sessions[preview.session_id]
    session["created_at"] = datetime.now(timezone.utc)-timedelta(minutes=61)
    preview_store.save(db_session,session)
    db_session.commit()
    _preview_sessions.clear()
    assert preview_store.load(db_session,preview.session_id) is None
    assert _sweep_expired_sessions(db=db_session)
    db_session.commit()
    db_session.refresh(me)
    assert me.pan_lookup_hash is None and me.pan_pending_until is None
    assert db_session.get(Import,uuid.UUID(preview.session_id)) is None


def test_other_user_cannot_claim_persisted_review(db_session):
    me,preview = review(db_session)
    _preview_sessions.clear()
    with pytest.raises(SessionExpiredError):
        confirm_people_import(db_session,preview.session_id,uuid.uuid4(),_everyone(preview))
    row = db_session.get(Import,uuid.UUID(preview.session_id))
    assert row.status == ImportStatus.PREVIEWING



def test_confirm_without_persisted_preview_is_rejected(db_session):
    me,preview = review(db_session)
    preview_store.delete(db_session,preview.session_id)
    db_session.commit()
    with pytest.raises(SessionExpiredError):
        confirm_people_import(db_session,preview.session_id,me.user_id,_everyone(preview))
    from app.models.transaction import Transaction
    assert db_session.query(Import).count() == db_session.query(Transaction).count() == 0



def test_pan_race_rollback_reacquires_processing_before_writes(db_session, monkeypatch):
    me,preview = review(db_session)
    from app.services.import_ import confirm_people
    real_finalize = confirm_people._finalise_pan_claims
    real_write = confirm_people._write_person_rows
    def rolled_back(db,session,target):
        db.rollback()
        real_finalize(db,session,target)
    def checked_write(db,*args,**kwargs):
        assert db.query(Import.status).filter(Import.id == uuid.UUID(preview.session_id)).scalar() == ImportStatus.PROCESSING
        return real_write(db,*args,**kwargs)
    monkeypatch.setattr(confirm_people,"_finalise_pan_claims",rolled_back)
    monkeypatch.setattr(confirm_people,"_write_person_rows",checked_write)
    result = confirm_people_import(db_session,preview.session_id,me.user_id,_everyone(preview))
    assert result.added == 2
    assert db_session.query(Import).count() == 1


def test_preview_consumed_between_pan_finalization_and_reclaim_is_410(db_session, monkeypatch):
    me,preview = review(db_session)
    from app.services.import_ import confirm_people
    real_finalize = confirm_people._finalise_pan_claims
    def consumed(db,session,target):
        real_finalize(db,session,target)
        preview_store.delete(db,preview.session_id)
        db.commit()  # another worker's completed claim removes the row
    monkeypatch.setattr(confirm_people,"_finalise_pan_claims",consumed)
    with pytest.raises(SessionExpiredError):
        confirm_people_import(db_session,preview.session_id,me.user_id,_everyone(preview))
    from app.models.transaction import Transaction
    assert db_session.query(Import).count() == db_session.query(Transaction).count() == 0



def test_prompt_resolve_and_switched_pan_restore_survive_restart(db_session):
    from app.services.import_.service import ImportPromptError,resolve_pan,discard_import_session
    from app.services.import_.crypto import hash_pan
    from app.models.enums import MemberPanSource, Relationship
    user = _user(db_session)
    _member(db_session,user,"Self",pan="DLKMN4321N")
    me = _member(db_session,user,"Aditi Sharma",relationship=Relationship.PARENT,pan="BCDEF2222B")
    me.pan_source = MemberPanSource.USER_ENTERED
    me.pan_verified_at = None
    db_session.commit()
    seed_master_scheme(db_session)
    parsed = family_result([{"name":"ADITI SHARMA","pan":"ABCDE1234K"}])
    with pytest.raises(ImportPromptError) as prompt:
        asyncio.run(start_import_session(db_session,me.user_id,me,parsed,"cas.pdf",b"%PDF test"))
    assert prompt.value.code == "member_pan_mismatch"
    sid = prompt.value.session_id
    _preview_sessions.clear()
    preview = resolve_pan(db_session,sid,me.user_id)
    original = _preview_sessions[sid]
    restored = preview_store.load(db_session,sid)
    assert restored["pan_restore"] == original["pan_restore"]
    assert restored["people_plan"] == original["people_plan"]
    _preview_sessions.clear()
    discard_import_session(db_session,sid,me.user_id)
    db_session.refresh(me)
    assert me.pan_lookup_hash == hash_pan("BCDEF2222B") and me.pan_pending_until is None
    assert db_session.get(Import,uuid.UUID(sid)) is None
