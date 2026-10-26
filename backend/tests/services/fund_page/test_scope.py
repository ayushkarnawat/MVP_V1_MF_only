import uuid

import pytest
from fastapi import HTTPException

from app.services.fund_page.scope import resolve_scope
from tests.services.fund_page.factories import add_user_household, make_session


@pytest.fixture
def db():
    session = make_session()
    yield session
    session.close()


@pytest.fixture
def household(db):
    return add_user_household(db)


def test_combined_resolves_all_members(db, household):
    ctx = resolve_scope(db, household.user_id, "combined")
    assert set(ctx.member_ids) == {household.asha_id, household.dev_id}
    assert ctx.is_combined is True
    assert ctx.scope_key == "combined"


def test_member_id_resolves_one_member(db, household):
    ctx = resolve_scope(db, household.user_id, str(household.asha_id))
    assert ctx.member_ids == [household.asha_id]
    assert ctx.is_combined is False
    assert ctx.scope_key == str(household.asha_id)


def test_foreign_member_id_is_404(db, household):
    other_household = add_user_household(db, key="other")
    with pytest.raises(HTTPException) as excinfo:
        resolve_scope(db, household.user_id, str(other_household.asha_id))
    assert excinfo.value.status_code == 404


def test_malformed_scope_is_400(db, household):
    with pytest.raises(HTTPException) as excinfo:
        resolve_scope(db, household.user_id, "abc")
    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == 'scope must be "combined" or a household member id.'


def test_upper_cased_id_resolves_to_canonical_key(db, household):
    ctx = resolve_scope(db, household.user_id, str(household.asha_id).upper())
    assert ctx.scope_key == str(household.asha_id)
    assert ctx.member_ids == [household.asha_id]
