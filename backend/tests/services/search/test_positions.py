from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest

from app.models.enums import TransactionType as T
from app.models.transaction import Transaction
from app.services.search.positions import open_or_sold


def txn(kind, units, *, folio=1, day=1, identity=1):
    return Transaction(id=UUID(int=identity), folio_id=UUID(int=folio), type=kind,
                       date=date(2026, 11, day), units=Decimal(units), nav=Decimal("10"),
                       amount=Decimal(units) * Decimal("10"))


@pytest.mark.parametrize("kind", [T.REDEMPTION, T.SWITCH_OUT, T.GIFT_OUT, T.REVERSAL])
def test_full_disposal_is_sold_even_with_positive_consuming_units(kind):
    assert open_or_sold([txn(T.PURCHASE, "100"), txn(kind, "100", day=2)]) == "sold"


@pytest.mark.parametrize("kind", [T.OPENING_BALANCE, T.BONUS, T.GIFT_IN, T.SWITCH_IN, T.SEGREGATION, T.DIVIDEND_REINVEST])
def test_lot_adding_types_are_open(kind):
    assert open_or_sold([txn(kind, "10")]) == "open"


def test_lots_stay_separate_per_folio():
    assert open_or_sold([txn(T.REDEMPTION, "100", folio=1, day=2), txn(T.PURCHASE, "100", folio=2)]) == "open"


def test_same_day_consuming_rows_follow_purchases_and_input_is_not_mutated():
    rows = [txn(T.REDEMPTION, "100", identity=1), txn(T.PURCHASE, "100", identity=2)]
    assert open_or_sold(rows) == "sold"
    assert rows[0].type == T.REDEMPTION


def test_empty_sequence_is_sold():
    assert open_or_sold([]) == "sold"
