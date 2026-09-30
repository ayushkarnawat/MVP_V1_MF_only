from datetime import datetime, timezone
import uuid

from app.models.enums import MemberLockReason, MemberPanSource, Relationship
from app.models.user import HouseholdMember, User
from app.services.import_.crypto import encrypt_pan, hash_pan
from app.services.import_.people import ParsedPerson
from app.services.import_.people_resolution import plan_people, resolve_self

NOW = datetime(2026, 9, 29, 12, 0, tzinfo=timezone.utc)


def _user(db):
    user = User(id=uuid.uuid4(), phone_number=f"+91{uuid.uuid4().int % 10**10:010d}", created_at=NOW)
    db.add(user)
    db.flush()
    return user


def _member(db, user, name, *, pan=None, relationship=Relationship.SELF, **kw):
    m = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name=name, relationship=relationship, created_at=NOW,
        pan_encrypted=encrypt_pan(pan) if pan else None,
        pan_lookup_hash=hash_pan(pan) if pan else None, **kw,
    )
    db.add(m)
    db.commit()
    return m


def _person(key, name, pan=None, needs_name=False):
    return ParsedPerson(
        key=key, pan=pan, pan_masked=None, name=name, name_source="holder_line",
        needs_name=needs_name, folio_keys=[("AMC", f"{key}1")], matched_by_name=[],
    )


def _self(name, pan=None):
    return HouseholdMember(
        id=uuid.uuid4(), user_id=uuid.uuid4(), name=name, relationship=Relationship.SELF, created_at=NOW,
        pan_encrypted=encrypt_pan(pan) if pan else None,
        pan_lookup_hash=hash_pan(pan) if pan else None,
    )


def test_resolve_self_by_permanent_pan():
    people = [_person("p1", "ROHAN MEHTA", "AAAPA1111A"), _person("p2", "SOMEONE", "BBBPB2222B")]
    r = resolve_self(_self("Ayush", "BBBPB2222B"), people)
    assert (r.kind, r.person_key) == ("pan", "p2")


def test_resolve_self_absent_when_pan_not_in_file_no_name_fallback():
    people = [_person("p1", "AYUSH KARNAWAT", "AAAPA1111A")]
    r = resolve_self(_self("Ayush Karnawat", "BBBPB2222B"), people)
    assert (r.kind, r.person_key, r.candidate_keys) == ("absent", None, [])


def test_resolve_self_exact_beats_variant():
    people = [_person("p1", "ADITI SHARMA"), _person("p2", "A SHARMA")]
    r = resolve_self(_self("Aditi Sharma"), people)
    assert (r.kind, r.person_key) == ("exact", "p1")


def test_resolve_self_single_variant():
    r = resolve_self(_self("Ayush Karnawat"), [_person("p1", "AYUSH ANAND KARNAWAT")])
    assert (r.kind, r.person_key) == ("variant", "p1")


def test_resolve_self_ambiguous():
    people = [_person("p1", "ADITI SHARMA"), _person("p2", "ARJUN SHARMA")]
    r = resolve_self(_self("A Sharma"), people)
    assert r.kind == "ambiguous" and r.person_key is None
    assert r.candidate_keys == ["p1", "p2"]


def test_resolve_self_mismatch():
    r = resolve_self(_self("Ayush Karnawat"), [_person("p1", "ROHAN MEHTA")])
    assert (r.kind, r.person_key, r.candidate_keys) == ("mismatch", None, [])


def test_plan_existing_member_longer_name_updates(db_session):
    user = _user(db_session)
    _member(db_session, user, "Me", pan="AAAPA1111A")
    dad = _member(db_session, user, "Ayush Karnawat", pan="BBBPB2222B", relationship=Relationship.PARENT)
    plans = plan_people(
        db_session, user.id,
        [_person("p1", "ME", "AAAPA1111A"), _person("p2", "AYUSH ANAND KARNAWAT", "BBBPB2222B")],
        "p1",
    )
    p2 = plans[1]
    assert (p2.status, p2.member_id, p2.name_update, p2.current_name) == (
        "existing_member", dad.id, "update", "Ayush Karnawat",
    )


def test_plan_existing_member_shorter_name_is_kept(db_session):
    user = _user(db_session)
    dad = _member(db_session, user, "Ayush Anand Karnawat", pan="BBBPB2222B", relationship=Relationship.PARENT)
    plans = plan_people(db_session, user.id, [_person("p1", "AYUSH KARNAWAT", "BBBPB2222B")], None)
    assert (plans[0].member_id, plans[0].name_update) == (dad.id, "none")


def test_plan_pan_match_name_mismatch_asks(db_session):
    user = _user(db_session)
    _member(db_session, user, "Ayush Karnawat", pan="BBBPB2222B", relationship=Relationship.PARENT)
    plans = plan_people(db_session, user.id, [_person("p1", "ROHAN MEHTA", "BBBPB2222B")], None)
    assert plans[0].name_update == "ask"


def test_plan_locked_member_and_other_account(db_session):
    user = _user(db_session)
    locked = HouseholdMember(
        id=uuid.uuid4(), user_id=user.id, name="Ramesh Sharma", created_at=NOW,
        details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED,
        detected_pan_encrypted=encrypt_pan("CCCPC3333C"), detected_pan_hash=hash_pan("CCCPC3333C"),
    )
    db_session.add(locked)
    _member(db_session, _user(db_session), "Stranger", pan="DDDPD4444D")
    db_session.commit()
    plans = plan_people(
        db_session, user.id,
        [_person("p1", "RAMESH KUMAR SHARMA", "CCCPC3333C"), _person("p2", "STRANGER", "DDDPD4444D"),
         _person("p3", "NEW PERSON", "EEEPE5555E")],
        None,
    )
    assert (plans[0].status, plans[0].member_id, plans[0].name_update) == ("locked_member", locked.id, "update")
    assert (plans[1].status, plans[1].member_id) == ("other_account", None)
    assert (plans[2].status, plans[2].member_id, plans[2].name_update) == ("new", None, "none")


def test_plan_flags_possible_same_person(db_session):
    user = _user(db_session)
    typed = _member(
        db_session, user, "Ramesh Sharma", pan="FFFPF6666F", relationship=Relationship.PARENT,
        pan_source=MemberPanSource.USER_ENTERED,
    )
    plans = plan_people(db_session, user.id, [_person("p1", "RAMESH SHARMA", "GGGPG7777G")], None)
    assert plans[0].status == "new"
    assert plans[0].same_person_member_id == typed.id


def test_plan_no_same_person_when_verified_or_same_pan(db_session):
    user = _user(db_session)
    _member(
        db_session, user, "Ramesh Sharma", pan="FFFPF6666F", relationship=Relationship.PARENT,
        pan_source=MemberPanSource.USER_ENTERED, pan_verified_at=NOW,
    )
    plans = plan_people(db_session, user.id, [_person("p1", "RAMESH SHARMA", "GGGPG7777G")], None)
    assert plans[0].same_person_member_id is None


def test_plan_me_placeholder_takes_self_name(db_session):
    user = _user(db_session)
    me = _member(db_session, user, "Aditi Sharma", pan="AAAPA1111A")
    plans = plan_people(
        db_session, user.id, [_person("p1", "Person 1", "AAAPA1111A", needs_name=True)], "p1",
    )
    assert (plans[0].status, plans[0].member_id, plans[0].name, plans[0].name_update) == (
        "me", me.id, "Aditi Sharma", "none",
    )


def test_plan_me_first_upload_variant_updates(db_session):
    user = _user(db_session)
    _member(db_session, user, "Ayush Karnawat")
    plans = plan_people(db_session, user.id, [_person("p1", "AYUSH ANAND KARNAWAT", "AAAPA1111A")], "p1")
    assert (plans[0].status, plans[0].name_update, plans[0].current_name) == ("me", "update", "Ayush Karnawat")


def test_plan_without_me_key_has_no_me(db_session):
    user = _user(db_session)
    _member(db_session, user, "Aditi Sharma", pan="AAAPA1111A")
    plans = plan_people(db_session, user.id, [_person("p1", "DAD", "BBBPB2222B")], None)
    assert plans[0].status == "new"


# ------------------------------------------- name-only person (staging-QA fix 5A)

def _locked(db, user, name):
    return _member(db, user, name, relationship=None, details_completed_at=None,
                   lock_reason=MemberLockReason.DETAILS_NEEDED)


def test_plan_name_only_person_attaches_to_exact_name_member(db_session):
    user = _user(db_session)
    _member(db_session, user, "Aditi Shanbhag")
    kavita = _locked(db_session, user, "Kavita Shanbhag")
    plans = plan_people(db_session, user.id, [_person("p3", "Kavita Shanbhag")], None)
    assert (plans[0].status, plans[0].member_id, plans[0].matched_by_name) == ("locked_member", kavita.id, True)


def test_plan_name_only_person_attaches_to_unlocked_member_as_existing(db_session):
    user = _user(db_session)
    kavita = _member(db_session, user, "Kavita Shanbhag", relationship=Relationship.PARENT)
    plans = plan_people(db_session, user.id, [_person("p3", "KAVITA SHANBHAG")], None)
    assert (plans[0].status, plans[0].member_id, plans[0].matched_by_name) == ("existing_member", kavita.id, True)


def test_plan_name_only_person_variant_name_stays_new(db_session):
    user = _user(db_session)
    _member(db_session, user, "Kavita Shanbhag", relationship=Relationship.PARENT)
    plans = plan_people(db_session, user.id, [_person("p3", "K Shanbhag")], None)
    assert (plans[0].status, plans[0].member_id) == ("new", None)


def test_two_exact_matches_stay_new(db_session):
    user = _user(db_session)
    _member(db_session, user, "Kavita Shanbhag", relationship=Relationship.PARENT)
    _member(db_session, user, "Kavita Shanbhag", relationship=Relationship.SIBLING)
    plans = plan_people(db_session, user.id, [_person("p3", "Kavita Shanbhag")], None)
    assert (plans[0].status, plans[0].member_id) == ("new", None)


def test_placeholder_name_never_attaches(db_session):
    user = _user(db_session)
    _member(db_session, user, "Person 3", relationship=Relationship.PARENT)
    plans = plan_people(db_session, user.id, [_person("p3", "Person 3", needs_name=True)], None)
    assert plans[0].status == "new"


# ------------------------------ PAN person vs name-only member (staging-QA fix 5B)

def test_plan_pan_person_flags_name_only_member_as_possible_same(db_session):
    user = _user(db_session)
    kavita = _locked(db_session, user, "Kavita Shanbhag")
    plans = plan_people(db_session, user.id, [_person("p3", "Kavita Shanbhag", "BNZPK4321M")], None)
    assert (plans[0].status, plans[0].member_id, plans[0].same_person_member_id) == ("new", None, kavita.id)


def test_two_name_only_matches_no_prompt(db_session):
    user = _user(db_session)
    for rel in (Relationship.PARENT, Relationship.SIBLING):
        _member(db_session, user, "Kavita Shanbhag", relationship=rel)
    plans = plan_people(db_session, user.id, [_person("p3", "Kavita Shanbhag", "BNZPK4321M")], None)
    assert plans[0].same_person_member_id is None


def test_member_with_a_detected_pan_is_not_name_only(db_session):
    user = _user(db_session)
    _member(db_session, user, "Kavita Shanbhag", relationship=None, details_completed_at=None,
            lock_reason=MemberLockReason.DETAILS_NEEDED,
            detected_pan_encrypted=encrypt_pan("ZZZPZ9999Z"), detected_pan_hash=hash_pan("ZZZPZ9999Z"))
    plans = plan_people(db_session, user.id, [_person("p3", "Kavita Shanbhag", "BNZPK4321M")], None)
    assert plans[0].same_person_member_id is None


def test_name_lookups_never_match_the_self_member(db_session):
    """Final review I-2 / F11: Me is found by PAN (or resolve_self), never by
    these name lookups."""
    user = _user(db_session)
    _member(db_session, user, "Aditi Shanbhag", pan="AAAPA1111A")
    plans = plan_people(db_session, user.id, [_person("p9", "Aditi Shanbhag")], None)
    assert (plans[0].status, plans[0].member_id) == ("new", None)


def test_pan_person_is_not_asked_about_a_pan_free_self_member(db_session):
    user = _user(db_session)
    _member(db_session, user, "Aditi Shanbhag")
    plans = plan_people(db_session, user.id, [_person("p9", "Aditi Shanbhag", "BNZPS1234K")], None)
    assert plans[0].same_person_member_id is None
