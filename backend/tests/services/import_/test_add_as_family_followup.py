from __future__ import annotations

import asyncio
import copy
import sys
import uuid
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from app.models.enums import PlanNameVariant, SchemePlanType
from app.models.reference import Scheme
from app.models.user import HouseholdMember
from app.services.import_ import file_storage
from app.services.import_.crypto import hash_pan
from app.services.import_.parser import parse_cas_pdf_bytes
from app.services.import_.pan_claims import classify_detected_pan
from app.services.import_.service import ImportPromptError, _preview_sessions, start_import_session
from tests.services.import_.test_service import (
    _db_member, _resolve_family, _confirm_family_review, _identity_snapshot,
)

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "Docs" / "CAS Files" / "synthetic"))
from pdf_dir import pdf_path


@pytest.fixture(scope="module")
def synthetic_statements():
    return tuple(
        parse_cas_pdf_bytes(pdf_path(name).read_bytes(), "MF@123")
        for name in ("r2_couple_rohan_priya_10yr.pdf", "r1_first_jobber_riya_3yr.pdf")
    )


@pytest.fixture(autouse=True)
def isolated_storage_and_network(tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage.default_file_storage, "_base_dir", tmp_path)
    monkeypatch.setattr("app.services.import_.service._fetch_nav_history", AsyncMock(return_value=None))


def _seed_statement_schemes(db, statements):
    for statement in statements:
        for index, parsed in enumerate(statement.schemes):
            if parsed.isin and db.query(Scheme).filter_by(isin=parsed.isin).first():
                continue
            if parsed.amfi and db.query(Scheme).filter_by(amfi_code=parsed.amfi).first():
                continue
            plan = parsed.plan_type if parsed.plan_type in ("direct", "regular") else "direct"
            db.add(Scheme(
                amfi_code=parsed.amfi or f"S3-{len(db.new)}-{index}",
                isin=parsed.isin, name=parsed.name, amc_name=parsed.amc,
                sebi_category="Equity Scheme - Flexi Cap Fund",
                plan_type=SchemePlanType(plan), plan_name_variant=PlanNameVariant(plan),
            ))
            db.flush()
    db.commit()


def _start_statement(db, member, statement):
    name = "r2_couple_rohan_priya_10yr.pdf" if len(statement.people) == 2 else "r1_first_jobber_riya_3yr.pdf"
    return asyncio.run(start_import_session(
        db, member.user_id, member, statement, name, pdf_path(name).read_bytes(),
    ))


def _family_then_self(db, statements, *, typed_name=None):
    family, own = copy.deepcopy(statements)
    member = _db_member(db, name=typed_name or own.people[0].name.title())
    before = _identity_snapshot(member)
    _seed_statement_schemes(db, (family, own))
    with pytest.raises(ImportPromptError) as error:
        _start_statement(db, member, family)
    assert error.value.code == "self_name_mismatch"
    preview = _resolve_family(db, member, error.value.session_id)
    confirmed = _confirm_family_review(db, member, preview)
    relatives = [db.get(HouseholdMember, uuid.UUID(person.member_id))
                 for person in confirmed.people]
    assert all(relative.id != member.id for relative in relatives)
    db.refresh(member)
    assert _identity_snapshot(member) == before
    assert member.pan_lookup_hash is None
    return member, relatives, own


def test_account_holders_own_file_after_add_as_family_matches_the_self_member_by_name_and_stores_the_pan_on_them(
    db_session, synthetic_statements,
):
    member, relatives, own = _family_then_self(db_session, synthetic_statements)
    family_hashes = {relative.id: relative.pan_lookup_hash for relative in relatives}
    preview = _start_statement(db_session, member, own)
    me, = [person for person in preview.people if person.is_me]
    assert me.member_id == str(member.id)
    assert classify_detected_pan(db_session, member.user_id, own.people[0].pan) == ("existing_member", member.id)
    assert _preview_sessions[preview.session_id]["pending_claims"] == [(member.id, own.people[0].pan)]
    confirmed = _confirm_family_review(db_session, member, preview)
    assert confirmed.people[0].created is False
    db_session.refresh(member)
    assert member.pan_lookup_hash == hash_pan(own.people[0].pan)
    assert member.pan_pending_until is None
    for relative in relatives:
        db_session.refresh(relative)
        assert relative.pan_lookup_hash == family_hashes[relative.id]


def test_a_variant_typo_gets_the_name_update_notice_not_the_mismatch_prompt(
    db_session, synthetic_statements,
):
    member, _, own = _family_then_self(
        db_session, synthetic_statements, typed_name="Riya Anil Sharmma",
    )
    preview = _start_statement(db_session, member, own)
    assert preview.people[0].is_me is True
    notice, = preview.name_notices
    assert notice.member_id == str(member.id)
    # The typed name is provisional (QB/QE): the statement's name replaces it without asking.
    # The plan expected "ask" here; owner decision 2026-11-03 keeps the existing policy.
    assert notice.kind == "update"


def test_the_family_members_pan_is_not_moved_to_the_account_holder(db_session, synthetic_statements):
    member, relatives, own = _family_then_self(db_session, synthetic_statements)
    hashes = {relative.id: relative.pan_lookup_hash for relative in relatives}
    preview = _start_statement(db_session, member, own)
    _confirm_family_review(db_session, member, preview)
    db_session.refresh(member)
    assert member.pan_lookup_hash not in set(hashes.values())
    for relative in relatives:
        db_session.refresh(relative)
        assert relative.pan_lookup_hash == hashes[relative.id]


def test_a_large_typo_shows_the_mismatch_prompt_again(db_session, synthetic_statements):
    member, relatives, own = _family_then_self(
        db_session, synthetic_statements, typed_name="Kavya Vikram Desai",
    )
    before = _identity_snapshot(member)
    with pytest.raises(ImportPromptError) as error:
        _start_statement(db_session, member, own)
    assert error.value.code == "self_name_mismatch"
    db_session.refresh(member)
    assert _identity_snapshot(member) == before
    assert all(relative.pan_lookup_hash != hash_pan(own.people[0].pan) for relative in relatives)
