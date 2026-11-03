from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models.enums import ImportStatus, Relationship, TransactionType
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.transaction_import import TransactionImport
from app.models.user import HouseholdMember, User


def _find(db: Session, import_id: uuid.UUID, member_id: uuid.UUID):
    from app.services.import_.new_funds import find_new_funds

    return find_new_funds(db, import_id, member_id)


@pytest.fixture()
def member(db_session):
    user = User(phone_number="+919700000001", created_at=datetime.now(timezone.utc))
    db_session.add(user)
    db_session.flush()
    member = HouseholdMember(
        user_id=user.id, name="Synthetic Member", relationship=Relationship.SELF,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(member)
    db_session.flush()
    return member


def _import(db: Session, member: HouseholdMember, group: uuid.UUID | None = None) -> Import:
    row = Import(
        household_member_id=member.id, status=ImportStatus.CONFIRMED,
        uploaded_at=datetime.now(timezone.utc), upload_group_id=group,
    )
    db.add(row)
    db.flush()
    return row


def _scheme(db: Session, name: str = "Synthetic Fund") -> Scheme:
    row = Scheme(
        amfi_code=uuid.uuid4().hex[:8], name=name, amc_name="Synthetic AMC",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(row)
    db.flush()
    return row


def _folio(db: Session, member_id: uuid.UUID, scheme: Scheme) -> Folio:
    row = Folio(
        household_member_id=member_id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex,
    )
    db.add(row)
    db.flush()
    return row


def _tx(
    db: Session, imported: Import, scheme: Scheme,
    kind: TransactionType = TransactionType.PURCHASE, *,
    day: date = date(2026, 10, 1), amount: str = "100.00", units: str = "10.000",
    folio: Folio | None = None,
) -> Transaction:
    if folio is None:
        folio = db.query(Folio).filter_by(
            household_member_id=imported.household_member_id, scheme_id=scheme.id,
        ).first()
        if folio is None:
            folio = _folio(db, imported.household_member_id, scheme)
    row = Transaction(
        folio_id=folio.id, import_id=imported.id, type=kind, date=day,
        amount=Decimal(amount), units=Decimal(units), nav=Decimal("10.0000"),
    )
    db.add(row)
    db.flush()
    return row


def test_first_import_lists_every_fund_as_new(db_session, member):
    imported = _import(db_session, member)
    schemes = [_scheme(db_session, f"Fund {number}") for number in range(3)]
    for scheme in schemes:
        _tx(db_session, imported, scheme)
    result = _find(db_session, imported.id, member.id)
    assert {fund.scheme_id for fund in result} == {scheme.id for scheme in schemes}
    assert all(fund.amc_name == "Synthetic AMC" for fund in result)


def test_later_import_lists_only_the_fund_the_member_did_not_hold(db_session, member):
    old, current = _import(db_session, member), _import(db_session, member)
    held, new = _scheme(db_session, "Held"), _scheme(db_session, "New")
    _tx(db_session, old, held)
    _tx(db_session, current, held, day=date(2026, 10, 2),
        folio=_folio(db_session, member.id, held))
    _tx(db_session, current, new)
    assert [fund.scheme_id for fund in _find(db_session, current.id, member.id)] == [new.id]


def test_a_repeat_of_the_same_file_lists_nothing(db_session, member):
    old, repeated = _import(db_session, member), _import(db_session, member)
    row = _tx(db_session, old, _scheme(db_session))
    db_session.add(TransactionImport(
        transaction_id=row.id, transaction_date=row.date, import_id=repeated.id,
    ))
    db_session.flush()
    assert _find(db_session, repeated.id, member.id) == []


def test_sold_then_bought_again_is_not_new(db_session, member):
    old, current = _import(db_session, member), _import(db_session, member)
    scheme = _scheme(db_session)
    _tx(db_session, old, scheme)
    _tx(db_session, old, scheme, TransactionType.REDEMPTION, day=date(2026, 10, 2))
    _tx(db_session, current, scheme, day=date(2026, 10, 3))
    assert _find(db_session, current.id, member.id) == []


def test_two_members_in_one_file_get_separate_lists(db_session, member):
    spouse = HouseholdMember(
        user_id=member.user_id, name="Synthetic Spouse", relationship=Relationship.SPOUSE,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(spouse)
    db_session.flush()
    group = uuid.uuid4()
    first, second = _import(db_session, member, group), _import(db_session, spouse, group)
    shared = _scheme(db_session, "Shared")
    _tx(db_session, first, shared, amount="120.00")
    _tx(db_session, second, shared, amount="450.00")
    mine, theirs = _find(db_session, first.id, member.id), _find(db_session, second.id, spouse.id)
    assert [(fund.scheme_id, fund.invested_amount) for fund in mine] == [(shared.id, Decimal("120.00"))]
    assert [(fund.scheme_id, fund.invested_amount) for fund in theirs] == [(shared.id, Decimal("450.00"))]
    assert _find(db_session, first.id, spouse.id) == []


def test_invested_amount_totals_purchases_sips_and_switch_ins_only(db_session, member):
    imported, scheme = _import(db_session, member), _scheme(db_session)
    for kind, amount in (
        (TransactionType.PURCHASE, "100.01"), (TransactionType.PURCHASE_SIP, "200.02"),
        (TransactionType.SWITCH_IN, "300.03"), (TransactionType.REDEMPTION, "50.00"),
        (TransactionType.SWITCH_OUT, "25.00"), (TransactionType.DIVIDEND_REINVEST, "7.00"),
        (TransactionType.STT, "1.00"),
    ):
        _tx(db_session, imported, scheme, kind, amount=amount)
    fund, = _find(db_session, imported.id, member.id)
    assert fund.invested_amount == Decimal("600.06")
    assert fund.transaction_count == 7


def test_latest_date_is_the_latest_of_all_the_funds_rows_in_the_import(db_session, member):
    imported, scheme = _import(db_session, member), _scheme(db_session)
    _tx(db_session, imported, scheme)
    _tx(db_session, imported, scheme, TransactionType.REDEMPTION, day=date(2026, 10, 5))
    _tx(db_session, imported, scheme, TransactionType.STAMP_DUTY, day=date(2026, 10, 7))
    fund, = _find(db_session, imported.id, member.id)
    assert fund.latest_transaction_date == date(2026, 10, 7)
    assert [tx.date for tx in fund.transactions] == [
        date(2026, 10, 7), date(2026, 10, 5), date(2026, 10, 1),
    ]


def test_transactions_are_capped_at_20_newest_first_with_the_full_count(db_session, member):
    imported, scheme = _import(db_session, member), _scheme(db_session)
    for offset in reversed(range(25)):
        _tx(db_session, imported, scheme, day=date(2026, 10, 1) + timedelta(days=offset))
    fund, = _find(db_session, imported.id, member.id)
    assert fund.transaction_count == 25
    assert fund.invested_amount == Decimal("2500.00")
    assert len(fund.transactions) == 20
    assert [tx.date for tx in fund.transactions] == [
        date(2026, 10, 25) - timedelta(days=offset) for offset in range(20)
    ]


@pytest.mark.parametrize("kind", [
    TransactionType.OPENING_BALANCE, TransactionType.STT, TransactionType.STAMP_DUTY,
    TransactionType.MISC, TransactionType.REVERSAL,
])
def test_a_fund_with_only_opening_balance_is_not_new(db_session, member, kind):
    imported, scheme = _import(db_session, member), _scheme(db_session)
    _tx(db_session, imported, scheme, kind)
    assert _find(db_session, imported.id, member.id) == []


def test_funds_are_ordered_by_invested_amount(db_session, member):
    imported = _import(db_session, member)
    for name, amount in (("Small", "1.00"), ("Large", "900.00"), ("Medium", "100.00")):
        _tx(db_session, imported, _scheme(db_session, name), amount=amount)
    assert [fund.scheme_name for fund in _find(db_session, imported.id, member.id)] == [
        "Large", "Medium", "Small",
    ]


def test_money_is_decimal(db_session, member):
    imported, scheme = _import(db_session, member), _scheme(db_session)
    _tx(db_session, imported, scheme, amount="123456.78", units="31.250")
    fund, = _find(db_session, imported.id, member.id)
    assert isinstance(fund.invested_amount, Decimal)
    assert fund.invested_amount == Decimal("123456.78")
    tx, = fund.transactions
    assert isinstance(tx.amount, Decimal) and isinstance(tx.units, Decimal)
    assert tx.units == Decimal("31.250")
    assert tx.type is TransactionType.PURCHASE


def test_new_fund_output_serializes_decimal_strings_and_iso_dates(db_session, member):
    from app.services.import_.schemas import NewFundOut

    imported, scheme = _import(db_session, member), _scheme(db_session)
    _tx(db_session, imported, scheme, amount="123456.78", units="31.250")
    fund, = _find(db_session, imported.id, member.id)
    assert NewFundOut.model_validate(fund, from_attributes=True).model_dump(mode="json") == {
        "scheme_id": str(scheme.id), "scheme_name": scheme.name, "amc_name": "Synthetic AMC",
        "invested_amount": "123456.78", "latest_transaction_date": "2026-10-01",
        "transaction_count": 1,
        "transactions": [{"date": "2026-10-01", "type": "purchase",
                          "amount": "123456.78", "units": "31.250"}],
    }


def test_only_current_import_rows_contribute_to_transactions_and_amounts(db_session, member):
    old, current = _import(db_session, member), _import(db_session, member)
    held, new = _scheme(db_session, "Held"), _scheme(db_session, "New")
    _tx(db_session, old, held, amount="900.00")
    _tx(db_session, current, held, day=date(2026, 10, 2), amount="200.00")
    _tx(db_session, current, new, amount="30.00")
    result = _find(db_session, current.id, member.id)
    assert len(result) == 1
    assert result[0].invested_amount == Decimal("30.00")
    assert result[0].transaction_count == 1


def test_redemption_only_fund_is_new_with_zero_invested_amount(db_session, member):
    imported, scheme = _import(db_session, member), _scheme(db_session)
    _tx(db_session, imported, scheme, TransactionType.REDEMPTION)
    fund, = _find(db_session, imported.id, member.id)
    assert fund.invested_amount == Decimal("0")
    assert fund.transaction_count == 1


def test_historical_opening_balance_also_makes_the_scheme_not_new(db_session, member):
    old, current = _import(db_session, member), _import(db_session, member)
    scheme = _scheme(db_session)
    _tx(db_session, old, scheme, TransactionType.OPENING_BALANCE)
    _tx(db_session, current, scheme, day=date(2026, 10, 2))
    assert _find(db_session, current.id, member.id) == []


def test_same_scheme_across_current_folios_is_one_new_fund(db_session, member):
    imported, scheme = _import(db_session, member), _scheme(db_session)
    _tx(db_session, imported, scheme, amount="100.00")
    _tx(db_session, imported, scheme, amount="200.00",
        folio=_folio(db_session, member.id, scheme))
    fund, = _find(db_session, imported.id, member.id)
    assert fund.invested_amount == Decimal("300.00")
    assert fund.transaction_count == 2
