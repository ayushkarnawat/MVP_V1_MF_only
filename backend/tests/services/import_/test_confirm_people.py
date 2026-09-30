"""Task 9 (CAS member detection): multi-person Confirm imports in one
transaction (confirm_people.confirm_people_import) and the old single-member
confirm_import adapter."""

from __future__ import annotations

import asyncio
import json
import threading
import uuid
from dataclasses import replace
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.orm import sessionmaker

import app.services.import_.file_storage as file_storage_module
from app.models.enums import (
    MemberLockReason,
    MemberNameSource,
    MemberOrigin,
    MemberPanSource,
    NameChangeReason,
    Relationship,
)
from app.models.folio import Folio
from app.models.imports import Import
from app.models.member_history import HouseholdMemberNameChange
from app.models.user import HouseholdMember, User
from app.services.import_ import confirm_people
from app.services.import_.confirm_people import ConfirmInvalidError, confirm_people_import
from app.services.import_.crypto import encrypt_pan, hash_pan
from app.services.import_.lifecycle_service import SessionExpiredError
from app.services.import_.schemas import PersonConfirmation
from app.services.import_.service import _preview_sessions, confirm_import, start_import_session
from tests.api.import_helpers import SCHEME_NAME, family_result

ADITI_PAN = "ABCDE1234K"
RAMESH_PAN = "BXQPS5678L"
KIRAN_PAN = "DLKMN4321N"


@pytest.fixture(autouse=True)
def isolate_cas_file_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage_module.default_file_storage, "_base_dir", tmp_path)


def _mocked_client():
    from app.services.import_.enrich import SchemeMatch

    client = AsyncMock()
    client.resolve_scheme.return_value = (SchemeMatch(amfi_code="125497", scheme_name=SCHEME_NAME, confidence=1.0), "confirmed")
    client.get_scheme_category.return_value = "Equity Scheme - Flexi Cap Fund"
    return client


def _user(db) -> User:
    user = User(id=uuid.uuid4(), phone_number=f"+91{uuid.uuid4().int % 10**10:010d}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    return user


def _member(db, user, name, *, relationship=Relationship.SELF, pan=None, **kwargs) -> HouseholdMember:
    m = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name=name, relationship=relationship,
                        created_at=datetime.now(timezone.utc), **kwargs)
    if pan:
        m.pan_encrypted = encrypt_pan(pan)
        m.pan_lookup_hash = hash_pan(pan)
        m.pan_source = MemberPanSource.CAS
        m.pan_verified_at = datetime.now(timezone.utc)
    db.add(m)
    db.commit()
    return m


def _start(db, member, parse_result):
    return asyncio.run(start_import_session(
        db, member.user_id, member, parse_result, "cas.pdf", b"%PDF family", client=_mocked_client(),
    ))


def _family(*extra, unassigned=0):
    persons = [
        {"name": "ADITI SHARMA", "pan": ADITI_PAN},
        {"name": "RAMESH SHARMA", "pan": RAMESH_PAN},
        {"name": "MEERA SHARMA", "pan": None},
    ]
    return family_result(persons + list(extra), addressee="ADITI SHARMA", unassigned=unassigned)


def _everyone(preview) -> list[PersonConfirmation]:
    return [PersonConfirmation(person_key=p.person_key) for p in preview.people]


def _confirm(db, preview, user_id, people=None, moved_funds=None):
    return confirm_people_import(db, preview.session_id, user_id, people or _everyone(preview), moved_funds=moved_funds)


def _detected(db, user_id) -> list[HouseholdMember]:
    return (
        db.query(HouseholdMember)
        .filter(HouseholdMember.user_id == user_id, HouseholdMember.origin == MemberOrigin.CAS_DETECTED)
        .order_by(HouseholdMember.name)
        .all()
    )


# ----------------------------------------------------------------- happy path


def test_confirm_family_cas_creates_locked_members_and_grouped_imports(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())

    result = _confirm(db_session, preview, me.user_id)

    detected = _detected(db_session, me.user_id)
    assert [m.name for m in detected] == ["MEERA SHARMA", "RAMESH SHARMA"]
    for m in detected:
        assert m.relationship is None
        assert m.details_completed_at is None
        assert m.lock_reason == MemberLockReason.DETAILS_NEEDED
        assert m.name_source == MemberNameSource.CAS
        assert m.pan_lookup_hash is None  # a locked person never holds the unique PAN claim
    imports = db_session.query(Import).all()
    assert len(imports) == 3
    assert len({i.upload_group_id for i in imports}) == 1
    assert imports[0].upload_group_id is not None
    assert len({i.file_reference for i in imports}) == 1
    assert imports[0].file_reference == f"{me.user_id}/{imports[0].upload_group_id}.pdf"
    ramesh = next(m for m in detected if m.name == "RAMESH SHARMA")
    assert ramesh.detected_pan_hash == hash_pan(RAMESH_PAN)
    ramesh_import = next(i for i in imports if i.household_member_id == ramesh.id)
    assert ramesh.detected_from_import_id == ramesh_import.id

    assert len(result.people) == 3
    assert result.upload_group_id == str(imports[0].upload_group_id)
    assert result.people[0].person_key == "p1" and result.people[0].member_id == str(me.id)
    me_import = next(i for i in imports if i.household_member_id == me.id)
    assert result.import_id == str(me_import.id)
    assert result.added == 3 and result.skipped == 0
    assert db_session.query(Folio).filter_by(household_member_id=ramesh.id).count() == 1

    db_session.refresh(me)
    assert me.pan_lookup_hash == hash_pan(ADITI_PAN)
    assert me.pan_pending_until is None
    assert me.pan_source == MemberPanSource.CAS
    assert me.pan_verified_at is not None
    assert preview.session_id not in _preview_sessions


def test_confirm_name_only_person_has_no_detected_pan(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())

    _confirm(db_session, preview, me.user_id)

    meera = next(m for m in _detected(db_session, me.user_id) if m.name == "MEERA SHARMA")
    assert meera.detected_pan_encrypted is None
    assert meera.detected_pan_hash is None
    assert meera.lock_reason == MemberLockReason.DETAILS_NEEDED


# ------------------------------------------------------ Review Focus 1 / F5


def test_confirm_twice_is_410_and_writes_nothing_more(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())
    _confirm(db_session, preview, me.user_id)
    members_before = db_session.query(HouseholdMember).count()

    with pytest.raises(SessionExpiredError):
        _confirm(db_session, preview, me.user_id)

    assert db_session.query(Import).count() == 3
    assert db_session.query(HouseholdMember).count() == members_before


def test_concurrent_second_confirm_is_410_while_first_is_running(db_session, monkeypatch):
    # F5: the session is claimed atomically at the start of confirm, so a
    # double-press that arrives while the first confirm is still writing sees
    # no session (410) instead of writing a second set of members/imports.
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())
    people = _everyone(preview)
    entered, release = threading.Event(), threading.Event()
    real = confirm_people._write_person_rows

    def slow_write(*args, **kwargs):
        entered.set()
        assert release.wait(10)
        return real(*args, **kwargs)

    monkeypatch.setattr(confirm_people, "_write_person_rows", slow_write)
    errors: list[BaseException] = []

    def first():
        try:
            confirm_people_import(db_session, preview.session_id, me.user_id, people)
        except BaseException as exc:  # pragma: no cover - surfaced below
            errors.append(exc)

    t = threading.Thread(target=first)
    t.start()
    assert entered.wait(10)
    other_db = sessionmaker(autoflush=False, bind=db_session.get_bind())()
    try:
        with pytest.raises(SessionExpiredError):
            confirm_people_import(other_db, preview.session_id, me.user_id, people)
    finally:
        other_db.close()
        release.set()
        t.join(10)

    assert errors == []
    assert db_session.query(Import).count() == 3
    assert len({i.upload_group_id for i in db_session.query(Import).all()}) == 1


# ---------------------------------------------------------- Review Focus 2


def test_parallel_session_confirm_attaches_to_existing_locked_member(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    two = family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN},
        {"name": "RAMESH SHARMA", "pan": RAMESH_PAN},
    ], addressee="ADITI SHARMA")
    first = _start(db_session, me, two)
    second = _start(db_session, me, two)
    assert next(p for p in second.people if p.person_key == "p2").status == "new"

    _confirm(db_session, first, me.user_id)
    result = _confirm(db_session, second, me.user_id)

    rameshes = [m for m in _detected(db_session, me.user_id) if m.name == "RAMESH SHARMA"]
    assert len(rameshes) == 1
    ramesh_result = next(p for p in result.people if p.person_key == "p2")
    assert ramesh_result.member_id == str(rameshes[0].id)
    assert result.added == 0 and result.skipped == 2


# ------------------------------------------------------------------- names


def _add_data_session(db, stored_name, statement_name, *, member_kwargs=None):
    """Self has a permanent PAN (not a first upload); Ramesh is an unlocked
    member with a permanent PAN; the statement names Ramesh differently."""
    user = _user(db)
    me = _member(db, user, "Aditi Sharma", pan=ADITI_PAN)
    ramesh = _member(db, user, stored_name, relationship=Relationship.PARENT, pan=RAMESH_PAN, **(member_kwargs or {}))
    pr = family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN},
        {"name": statement_name, "pan": RAMESH_PAN},
    ], addressee="ADITI SHARMA")
    return me, ramesh, _start(db, me, pr)


def test_confirm_applies_update_notice_and_logs_name_change(db_session):
    me, ramesh, preview = _add_data_session(db_session, "Ramesh Sharma", "RAMESH KUMAR SHARMA")
    assert [n.kind for n in preview.name_notices] == ["update"]

    _confirm(db_session, preview, me.user_id)

    db_session.refresh(ramesh)
    assert ramesh.name == "RAMESH KUMAR SHARMA"
    assert ramesh.name_source == MemberNameSource.CAS
    assert ramesh.name_updated_at is not None
    change = db_session.query(HouseholdMemberNameChange).one()
    assert (change.old_name, change.new_name, change.reason) == (
        "Ramesh Sharma", "RAMESH KUMAR SHARMA", NameChangeReason.CAS_VARIANT,
    )
    ramesh_import = db_session.query(Import).filter_by(household_member_id=ramesh.id).one()
    assert change.import_id == ramesh_import.id


def test_confirm_keeps_longer_stored_name(db_session):
    # I9: the statement has fewer tokens -- keep ours, even when the client
    # echoes the displayed statement name back as `name`.
    me, ramesh, preview = _add_data_session(db_session, "Ramesh Kumar Sharma", "RAMESH SHARMA")

    _confirm(db_session, preview, me.user_id, [
        PersonConfirmation(person_key="p1"),
        PersonConfirmation(person_key="p2", name="RAMESH SHARMA"),
    ])

    db_session.refresh(ramesh)
    assert ramesh.name == "Ramesh Kumar Sharma"
    assert db_session.query(HouseholdMemberNameChange).count() == 0


def test_confirm_ask_renames_only_when_accepted(db_session):
    me, ramesh, preview = _add_data_session(db_session, "Priya Sharma", "PRIYA KARNAWAT")
    assert [n.kind for n in preview.name_notices] == ["ask"]

    _confirm(db_session, preview, me.user_id, [
        PersonConfirmation(person_key="p1"),
        PersonConfirmation(person_key="p2", accept_name_update=True),
    ])

    db_session.refresh(ramesh)
    assert ramesh.name == "PRIYA KARNAWAT"
    assert db_session.query(HouseholdMemberNameChange).one().reason == NameChangeReason.USER_CORRECTED_TO_CAS


def test_confirm_ask_not_accepted_keeps_name(db_session):
    me, ramesh, preview = _add_data_session(db_session, "Priya Sharma", "PRIYA KARNAWAT")

    _confirm(db_session, preview, me.user_id)

    db_session.refresh(ramesh)
    assert ramesh.name == "Priya Sharma"
    assert db_session.query(HouseholdMemberNameChange).count() == 0


def test_confirm_popup_name_edits(db_session):
    # F32: an edited name on a new person is user_entered; on an existing
    # member it is a rename logged as user_edit.
    me, ramesh, preview = _add_data_session(db_session, "Ramesh Sharma", "RAMESH SHARMA")
    session = _preview_sessions[preview.session_id]
    assert session  # sanity

    _confirm(db_session, preview, me.user_id, [
        PersonConfirmation(person_key="p1"),
        PersonConfirmation(person_key="p2", name="Ramesh K. Sharma"),
    ])

    db_session.refresh(ramesh)
    assert ramesh.name == "Ramesh K. Sharma"
    assert ramesh.name_source == MemberNameSource.USER_ENTERED
    assert db_session.query(HouseholdMemberNameChange).one().reason == NameChangeReason.USER_EDIT


def test_confirm_new_person_edited_name_is_user_entered(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())

    _confirm(db_session, preview, me.user_id, [
        PersonConfirmation(person_key="p1"),
        PersonConfirmation(person_key="p2", name="Ramesh K Sharma"),
        PersonConfirmation(person_key="p3"),
    ])

    ramesh = next(m for m in _detected(db_session, me.user_id) if m.detected_pan_hash == hash_pan(RAMESH_PAN))
    assert ramesh.name == "Ramesh K Sharma"
    assert ramesh.name_source == MemberNameSource.USER_ENTERED
    assert db_session.query(HouseholdMemberNameChange).count() == 0


def test_confirm_recased_name_echo_is_not_an_edit(db_session):
    # A re-cased echo of the statement name is not a user edit (new or existing).
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())

    _confirm(db_session, preview, me.user_id, [
        PersonConfirmation(person_key="p1", name="aditi sharma"),
        PersonConfirmation(person_key="p2", name="Ramesh Sharma"),
        PersonConfirmation(person_key="p3"),
    ])

    ramesh = next(m for m in _detected(db_session, me.user_id) if m.detected_pan_hash == hash_pan(RAMESH_PAN))
    assert ramesh.name_source == MemberNameSource.CAS
    db_session.refresh(me)
    assert me.name == "Aditi Sharma"
    assert db_session.query(HouseholdMemberNameChange).count() == 0


# ------------------------------------------------------------------- moves


def test_confirm_moved_fund_lands_on_target_person(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family(unassigned=2))
    moved, stays = preview.unassigned_temp_ids
    moved_folio = next(s.folio for s in preview.schemes if s.temp_id == moved)
    stays_folio = next(s.folio for s in preview.schemes if s.temp_id == stays)

    result = _confirm(db_session, preview, me.user_id, moved_funds={moved: "p2"})

    ramesh = next(m for m in _detected(db_session, me.user_id) if m.name == "RAMESH SHARMA")
    assert db_session.query(Folio).filter_by(folio_number=moved_folio).one().household_member_id == ramesh.id
    # U10: an unassigned fund nobody moved defaults to Me.
    assert db_session.query(Folio).filter_by(folio_number=stays_folio).one().household_member_id == me.id
    assert next(p for p in result.people if p.person_key == "p2").added == 2


def test_confirm_existing_member_whose_funds_all_moved_gets_no_empty_import(db_session):
    from app.models.imports import Import

    me = _member(db_session, _user(db_session), "Aditi Sharma")
    persons = [
        {"name": "ADITI SHARMA", "pan": ADITI_PAN, "funds": 0},
        {"name": "RAMESH SHARMA", "pan": RAMESH_PAN},
    ]
    preview = _start(db_session, me, family_result(persons, addressee="ADITI SHARMA", unassigned=1))
    (moved,) = preview.unassigned_temp_ids

    _confirm(db_session, preview, me.user_id, moved_funds={moved: "p2"})

    # Me has no fund left: no 0-transaction Import row in her history.
    assert db_session.query(Import).filter_by(household_member_id=me.id).count() == 0
    assert db_session.query(Import).count() == 1


def test_confirm_rejects_moving_a_pan_matched_fund(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())
    ramesh_fund = next(s.temp_id for s in preview.schemes if s.person_key == "p2")

    with pytest.raises(ConfirmInvalidError):
        _confirm(db_session, preview, me.user_id, moved_funds={ramesh_fund: "p1"})
    assert preview.session_id in _preview_sessions


# ------------------------------------------------------------ C1 / F14


def test_confirm_rolls_back_everything_on_failure(db_session, monkeypatch):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())
    real = confirm_people._write_person_rows
    calls = {"n": 0}

    def fail_on_second(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("boom")
        return real(*args, **kwargs)

    monkeypatch.setattr(confirm_people, "_write_person_rows", fail_on_second)
    with pytest.raises(RuntimeError):
        _confirm(db_session, preview, me.user_id)

    assert db_session.query(Import).count() == 0
    assert _detected(db_session, me.user_id) == []
    assert db_session.query(Folio).count() == 0
    assert preview.session_id in _preview_sessions  # C1: Try again works
    db_session.refresh(me)
    assert me.pan_pending_until is not None  # the claim finalisation rolled back too

    monkeypatch.setattr(confirm_people, "_write_person_rows", real)
    result = _confirm(db_session, preview, me.user_id)
    assert len(result.people) == 3
    assert db_session.query(Import).count() == 3


def test_confirm_finalises_claims_even_if_a_claim_rolls_back(db_session, monkeypatch):
    # F14: confirm_pan_claim's lost-race path does a full db.rollback(); a
    # claim finalised before it must not be silently left pending.
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())
    real = confirm_people.confirm_pan_claim
    state = {"rolled": False}

    def claim_then_rollback(db, member, pan):
        real(db, member, pan)
        if not state["rolled"]:
            state["rolled"] = True
            db.rollback()

    monkeypatch.setattr(confirm_people, "confirm_pan_claim", claim_then_rollback)
    _confirm(db_session, preview, me.user_id)

    db_session.refresh(me)
    assert me.pan_pending_until is None
    assert me.pan_source == MemberPanSource.CAS
    assert db_session.query(Import).count() == 3


# ------------------------------------------------------------- raw output


def test_confirm_raw_parser_output_has_only_that_persons_folios_and_no_pan(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    pr = _family()
    raw = {
        "investor_info": {"name": "ADITI SHARMA"},
        "folios": [
            # A raw PAN planted on purpose: confirm must null every folio PAN
            # even if an upstream redaction ever regresses.
            {"folio": s.folio, "amc": s.amc, "PAN": RAMESH_PAN, "schemes": [{"scheme": s.name, "transactions": []}]}
            for s in pr.schemes
        ],
    }
    preview = _start(db_session, me, replace(pr, raw_json=json.dumps(raw)))

    _confirm(db_session, preview, me.user_id)

    ramesh = next(m for m in _detected(db_session, me.user_id) if m.name == "RAMESH SHARMA")
    out = db_session.query(Import).filter_by(household_member_id=ramesh.id).one().raw_parser_output
    ramesh_folio = next(s.folio for s in pr.schemes if s.person_key == "p2")
    assert [f["folio"] for f in out["folios"]] == [ramesh_folio]
    for imp in db_session.query(Import).all():
        dumped = json.dumps(imp.raw_parser_output)
        assert RAMESH_PAN not in dumped and ADITI_PAN not in dumped


# --------------------------------------------------------- old body (F12)


def test_confirm_old_single_member_body_still_works(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, family_result([{"name": "ADITI SHARMA", "pan": ADITI_PAN}]))

    result = confirm_import(db_session, preview.session_id, me.id, scheme_confirmations=[], user_id=me.user_id)

    assert result.added == 1
    assert [p.member_id for p in result.people] == [str(me.id)]
    assert db_session.query(Import).one().household_member_id == me.id


def test_confirm_old_body_for_multi_person_file_is_invalid(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())

    with pytest.raises(ConfirmInvalidError):
        confirm_import(db_session, preview.session_id, me.id, scheme_confirmations=[], user_id=me.user_id)
    assert db_session.query(Import).count() == 0
    assert preview.session_id in _preview_sessions


# -------------------------------------------------------------- validation


def test_confirm_placeholder_without_name_is_invalid(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    pr = family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN},
        {"name": None, "pan": RAMESH_PAN, "needs_name": True},
    ], addressee="ADITI SHARMA")
    preview = _start(db_session, me, pr)

    with pytest.raises(ConfirmInvalidError):
        _confirm(db_session, preview, me.user_id)

    result = _confirm(db_session, preview, me.user_id, [
        PersonConfirmation(person_key="p1"), PersonConfirmation(person_key="p2", name="Ramesh Sharma"),
    ])
    assert len(result.people) == 2
    ramesh = _detected(db_session, me.user_id)[0]
    assert ramesh.name == "Ramesh Sharma"
    assert ramesh.name_source == MemberNameSource.USER_ENTERED


def test_confirm_unknown_person_key_is_invalid(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())

    with pytest.raises(ConfirmInvalidError):
        _confirm(db_session, preview, me.user_id, _everyone(preview) + [PersonConfirmation(person_key="p9")])
    assert db_session.query(Import).count() == 0


# ------------------------------------------------------- other account (U8)


def _kiran_elsewhere(db):
    other = _user(db)
    _member(db, other, "Kiran Sharma", pan=KIRAN_PAN)


def test_confirm_included_other_account_person_is_locked_pan_on_other_account(db_session):
    _kiran_elsewhere(db_session)
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    pr = family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN},
        {"name": "KIRAN SHARMA", "pan": KIRAN_PAN},
    ], addressee="ADITI SHARMA")
    preview = _start(db_session, me, pr)
    assert next(p for p in preview.people if p.person_key == "p2").status == "other_account"

    result = _confirm(db_session, preview, me.user_id, [
        PersonConfirmation(person_key="p1"), PersonConfirmation(person_key="p2", include=True),
    ])

    kiran = _detected(db_session, me.user_id)[0]
    assert kiran.lock_reason == MemberLockReason.PAN_ON_OTHER_ACCOUNT
    assert kiran.detected_pan_hash == hash_pan(KIRAN_PAN)
    assert kiran.pan_lookup_hash is None
    assert len(result.people) == 2


def test_confirm_excluded_other_account_person_is_not_imported(db_session):
    _kiran_elsewhere(db_session)
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    pr = family_result([
        {"name": "ADITI SHARMA", "pan": ADITI_PAN},
        {"name": "KIRAN SHARMA", "pan": KIRAN_PAN},
    ], addressee="ADITI SHARMA")
    preview = _start(db_session, me, pr)

    result = _confirm(db_session, preview, me.user_id, [
        PersonConfirmation(person_key="p1"), PersonConfirmation(person_key="p2", include=False),
    ])

    assert _detected(db_session, me.user_id) == []
    assert [p.person_key for p in result.people] == ["p1"]
    assert db_session.query(Import).count() == 1


# ------------------------------------------- resolve routes share the F5 lock


def test_concurrent_resolve_name_logs_one_name_change(db_session, monkeypatch):
    from app.services.import_ import service
    from app.services.import_.service import ImportPromptError, resolve_name

    me = _member(db_session, _user(db_session), "Ayush Karnawat")
    with pytest.raises(ImportPromptError) as prompt:
        _start(db_session, me, family_result([{"name": "ROHAN MEHTA", "pan": ADITI_PAN}]))
    sid = prompt.value.session_id
    entered, release = threading.Event(), threading.Event()
    real = service.validate_person_name
    first_call = {"done": False}

    def slow_validate(name):
        if not first_call["done"]:
            first_call["done"] = True
            entered.set()
            assert release.wait(10)
        return real(name)

    monkeypatch.setattr(service, "validate_person_name", slow_validate)
    factory = sessionmaker(autoflush=False, bind=db_session.get_bind())
    results: list[object] = []

    def press():
        db = factory()
        try:
            results.append(resolve_name(db, sid, me.user_id, "Rohan Mehta"))
        except BaseException as exc:  # pragma: no cover - surfaced below
            results.append(exc)
        finally:
            db.close()

    t1 = threading.Thread(target=press)
    t1.start()
    assert entered.wait(10)
    t2 = threading.Thread(target=press)
    t2.start()
    t2.join(0.5)
    release.set()
    t1.join(10)
    t2.join(10)

    assert all(not isinstance(r, BaseException) for r in results), results
    assert db_session.query(HouseholdMemberNameChange).count() == 1



# ------------------------------------------------------- review fixes


class _CountingStorage:
    def __init__(self):
        self.saved: list[str] = []
        self.deleted: list[str] = []

    def save(self, key, data):
        self.saved.append(key)
        return key

    def read(self, reference):  # pragma: no cover
        raise FileNotFoundError(reference)

    def delete(self, reference):
        self.deleted.append(reference)


def test_failed_commit_deletes_the_stored_group_file(db_session, monkeypatch):
    storage = _CountingStorage()
    monkeypatch.setattr(file_storage_module, "default_file_storage", storage)
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())
    real_commit = db_session.commit

    def failing_commit():
        raise RuntimeError("commit failed")

    monkeypatch.setattr(db_session, "commit", failing_commit)
    with pytest.raises(RuntimeError):
        _confirm(db_session, preview, me.user_id)

    assert len(storage.saved) == 1
    assert storage.deleted == storage.saved  # no orphaned group file
    assert preview.session_id in _preview_sessions

    monkeypatch.setattr(db_session, "commit", real_commit)
    _confirm(db_session, preview, me.user_id)
    assert len(storage.saved) == 2 and storage.deleted == storage.saved[:1]


def test_confirm_raises_when_pan_claims_never_settle(db_session, monkeypatch):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())
    real = confirm_people.confirm_pan_claim

    def always_rolls_back(db, member, pan):
        real(db, member, pan)
        db.rollback()

    monkeypatch.setattr(confirm_people, "confirm_pan_claim", always_rolls_back)
    with pytest.raises(RuntimeError):
        _confirm(db_session, preview, me.user_id)

    assert db_session.query(Import).count() == 0
    assert preview.session_id in _preview_sessions


def test_confirm_makes_u4_switched_member_pan_verified(db_session):
    from app.services.import_.service import ImportPromptError, resolve_pan

    user = _user(db_session)
    me = _member(db_session, user, "Aditi Sharma", pan=ADITI_PAN)
    ramesh = _member(db_session, user, "Ramesh Sharma", relationship=Relationship.PARENT)
    ramesh.pan_encrypted = encrypt_pan("BXQPS1111T")
    ramesh.pan_lookup_hash = hash_pan("BXQPS1111T")
    ramesh.pan_source = MemberPanSource.USER_ENTERED
    db_session.commit()
    with pytest.raises(ImportPromptError) as prompt:
        _start(db_session, ramesh, family_result([{"name": "RAMESH SHARMA", "pan": RAMESH_PAN}]))
    assert prompt.value.code == "member_pan_mismatch"
    preview = resolve_pan(db_session, prompt.value.session_id, me.user_id)

    _confirm(db_session, preview, me.user_id)

    db_session.refresh(ramesh)
    assert ramesh.pan_lookup_hash == hash_pan(RAMESH_PAN)
    assert ramesh.pan_pending_until is None
    assert ramesh.pan_source == MemberPanSource.CAS
    assert ramesh.pan_verified_at is not None


def test_post_commit_failure_keeps_file_and_does_not_reinsert_session(db_session, monkeypatch):
    storage = _CountingStorage()
    monkeypatch.setattr(file_storage_module, "default_file_storage", storage)
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, _family())

    def boom(*args, **kwargs):
        raise RuntimeError("after commit")

    monkeypatch.setattr(confirm_people, "ImportConfirmResponse", boom)
    with pytest.raises(RuntimeError):
        _confirm(db_session, preview, me.user_id)

    assert db_session.query(Import).count() == 3  # committed
    assert storage.deleted == []  # committed rows still reference the file
    assert preview.session_id not in _preview_sessions  # a second press stays 410


def test_confirm_writes_the_statement_period_on_every_import(db_session):
    """Staging-QA fix 6: imports.statement_from_date/_to_date were never written."""
    from datetime import date

    me = _member(db_session, _user(db_session), "Aditi Sharma")
    parsed = _family()
    parsed.statement_from, parsed.statement_to = date(2025, 4, 1), date(2025, 9, 30)
    preview = _start(db_session, me, parsed)

    _confirm(db_session, preview, me.user_id)

    imports = db_session.query(Import).all()
    assert imports and all(
        (i.statement_from_date, i.statement_to_date) == (date(2025, 4, 1), date(2025, 9, 30)) for i in imports
    )


def test_confirm_reclassifies_name_only_person_by_exact_name(db_session):
    """Staging-QA fix 5A: a same-named member created after this review was
    built (another tab's confirm) is attached at Confirm, not duplicated."""
    from app.services.import_.confirm_people import _resolve_member
    from app.services.import_.people import ParsedPerson
    from app.services.import_.people_resolution import PersonPlan

    user = _user(db_session)
    person = ParsedPerson(key="p3", pan=None, pan_masked=None, name="Kavita Shanbhag", name_source="holder_line",
                          needs_name=False, folio_keys=[("Tata Mutual Fund", "12705694/27")], matched_by_name=[])
    plan = PersonPlan("p3", "new", None, "Kavita Shanbhag", "none", None, None)
    kavita = _member(db_session, user, "Kavita Shanbhag", relationship=None, details_completed_at=None,
                     lock_reason=MemberLockReason.DETAILS_NEEDED)
    work = _resolve_member(db_session, user.id, person, plan, PersonConfirmation(person_key="p3"), [])
    assert work.member_id == kavita.id
