from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.services.fund_page.sections import scheme_flows, stored_section
from tests.services.fund_page.factories import (
    add_import,
    add_user_household,
    fx_hold,
    make_session,
    put_section,
    uid,
)


@pytest.fixture
def db():
    session = make_session()
    yield session
    session.close()


@pytest.fixture
def household(db):
    return add_user_household(db)


def _confirmed_import(db, household, *, confirmed_at):
    return add_import(db, household.asha_id, confirmed_at=confirmed_at)


def test_combined_benchmark_funds_row_unwraps_via_comparison(db, household):
    _confirmed_import(db, household, confirmed_at=datetime(2026, 9, 1, tzinfo=timezone.utc))
    payload = {"members": ["a", "b"], "comparison": {"funds": [{"scheme_id": "x"}]}}
    put_section(db, household.user_id, "combined", "benchmark_funds", payload, datetime(2026, 10, 1, tzinfo=timezone.utc))
    db.commit()

    result = stored_section(db, household.user_id, "combined", "benchmark_funds", [household.asha_id, household.dev_id])
    assert result is not None
    assert result.payload == {"funds": [{"scheme_id": "x"}]}


def test_member_scope_row_returned_as_is(db, household):
    _confirmed_import(db, household, confirmed_at=datetime(2026, 9, 1, tzinfo=timezone.utc))
    payload = {"funds": [{"scheme_id": "x"}]}
    put_section(db, household.user_id, str(household.asha_id), "benchmark_funds", payload, datetime(2026, 10, 1, tzinfo=timezone.utc))
    db.commit()

    result = stored_section(db, household.user_id, str(household.asha_id), "benchmark_funds", [household.asha_id])
    assert result.payload == payload


def test_missing_row_is_none(db, household):
    assert stored_section(db, household.user_id, "combined", "benchmark_funds", [household.asha_id]) is None


def test_failed_at_set_is_none(db, household):
    put_section(
        db, household.user_id, "combined", "allocation", {"allocation": {"total": "1"}},
        datetime(2026, 10, 1, tzinfo=timezone.utc), failed_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
    )
    db.commit()
    assert stored_section(db, household.user_id, "combined", "allocation", [household.asha_id]) is None


def test_computed_at_older_than_latest_confirmed_import_is_none(db, household):
    _confirmed_import(db, household, confirmed_at=datetime(2026, 10, 5, tzinfo=timezone.utc))
    put_section(
        db, household.user_id, "combined", "allocation", {"allocation": {"total": "1"}},
        datetime(2026, 10, 1, tzinfo=timezone.utc),
    )
    db.commit()
    assert stored_section(db, household.user_id, "combined", "allocation", [household.asha_id]) is None


def test_computed_at_equal_or_newer_than_latest_confirmed_import_is_the_section(db, household):
    _confirmed_import(db, household, confirmed_at=datetime(2026, 10, 1, tzinfo=timezone.utc))
    payload = {"allocation": {"total": "1"}}
    put_section(db, household.user_id, "combined", "allocation", payload, datetime(2026, 10, 1, tzinfo=timezone.utc))
    db.commit()
    result = stored_section(db, household.user_id, "combined", "allocation", [household.asha_id])
    assert result.payload == {"total": "1"}


def test_no_import_at_all_is_the_section(db, household):
    payload = {"allocation": {"total": "1"}}
    put_section(db, household.user_id, "combined", "allocation", payload, datetime(2026, 10, 1, tzinfo=timezone.utc))
    db.commit()
    result = stored_section(db, household.user_id, "combined", "allocation", [household.asha_id])
    assert result.payload == {"total": "1"}


def test_scheme_flows_only_fund_relevant_types_ordered(db, household):
    hold = fx_hold(db, household)
    extra_import = add_import(db, household.asha_id, confirmed_at=datetime(2026, 10, 10, tzinfo=timezone.utc))
    db.add(Transaction(
        id=uid("txn-stt"), folio_id=hold.asha_folio.id, import_id=extra_import.id,
        type=TransactionType.STT, date=date(2025, 1, 2),
        amount=Decimal("5.00"), units=Decimal("0"), nav=Decimal("10.00"),
    ))
    db.add(Transaction(
        id=uid("txn-redemption"), folio_id=hold.asha_folio.id, import_id=extra_import.id,
        type=TransactionType.REDEMPTION, date=date(2025, 2, 1),
        amount=Decimal("110.00"), units=Decimal("10"), nav=Decimal("11.00"),
    ))
    db.commit()

    rows = scheme_flows(db, [household.asha_id, household.dev_id], hold.scheme.id)

    assert [(row.type, row.date) for row in rows] == [
        (TransactionType.PURCHASE, date(2025, 1, 1)),
        (TransactionType.REDEMPTION, date(2025, 2, 1)),
        (TransactionType.PURCHASE, date(2025, 6, 1)),
    ]


def test_combined_payload_missing_wrapper_key_is_none_not_keyerror(db, household):
    put_section(
        db, household.user_id, "combined", "benchmark_funds", {"unexpected": {}},
        datetime(2026, 10, 1, tzinfo=timezone.utc),
    )

    assert stored_section(
        db, household.user_id, "combined", "benchmark_funds", [household.asha_id],
    ) is None
