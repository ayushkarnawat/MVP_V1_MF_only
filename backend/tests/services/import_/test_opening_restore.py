"""Phase 4 review: restore_openings must reproduce what a fresh confirm of
the remaining statements would give."""
import uuid
from datetime import date
from decimal import Decimal

import pytest

import app.services.import_.file_storage as file_storage_module
from app.models.enums import CostSource, TransactionOrigin
from app.models.imports import Import
from app.models.transaction import Transaction
from app.services.import_.deletion import delete_import
from tests.services.import_.test_confirm_people import _member, _solo, _upload, _user


@pytest.fixture(autouse=True)
def isolate_cas_file_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage_module.default_file_storage, "_base_dir", tmp_path)


def _opening(db):
    return db.query(Transaction).filter_by(origin=TransactionOrigin.CAS_OPENING).one()


def test_restored_opening_uses_only_the_chosen_statements_rows(db_session):
    """Review HIGH 1: rows from later statements must not distort the cost.
    FY23-24 holds 100 opening units, CAS cost 5,500 at its end (100 × c + 10 × 50)
    → c = 50; FY24-25 adds 10 more; a 10-year file holds everything. Deleting
    the 10-year file must restore the FY23-24 opening at 50.0000."""
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    fy24 = _upload(db_session, me, _solo(open_units="100", cost="5500", start=date(2023, 4, 1),
                                         rows=[(date(2023, 6, 1), "10", "110")]))
    _upload(db_session, me, _solo(open_units="110", cost="6000", start=date(2024, 4, 1),
                                  rows=[(date(2024, 6, 1), "10", "120")]))
    fresh = _opening(db_session)
    assert fresh.nav == Decimal("50.0000") and fresh.cost_source == CostSource.CAS_COST
    ten = _upload(db_session, me, _solo(start=date(2015, 4, 1), rows=[(date(2015, 6, 1), "100", "100"),
                                                                   (date(2023, 6, 1), "10", "110"),
                                                                   (date(2024, 6, 1), "10", "120")]))
    delete_import(db_session, me.user_id, uuid.UUID(ten.import_id), "person")
    restored = _opening(db_session)
    assert restored.date == date(2023, 4, 1)
    assert restored.nav == Decimal("50.0000") and restored.cost_source == CostSource.CAS_COST
    assert restored.import_id == uuid.UUID(fy24.import_id)


def test_earliest_of_three_remaining_statements_decides(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    _upload(db_session, me, _solo(open_units="30", cost="1500", start=date(2025, 4, 1), rows=[(date(2025, 6, 1), "1", "31")]))
    _upload(db_session, me, _solo(open_units="20", cost="1000", start=date(2021, 4, 1), rows=[(date(2021, 6, 1), "9", "29"),
                                                                                         (date(2025, 6, 1), "1", "31")]))
    longest = _upload(db_session, me, _solo(start=date(2011, 4, 1), rows=[(date(2011, 6, 1), "20", "20"),
                                                                      (date(2021, 6, 1), "9", "29"),
                                                                      (date(2025, 6, 1), "1", "31")]))
    delete_import(db_session, me.user_id, uuid.UUID(longest.import_id), "person")
    restored = _opening(db_session)
    assert restored.date == date(2021, 4, 1) and restored.units == Decimal("20")


def test_same_start_tie_is_deterministic(db_session):
    """Two remaining statements with the same start date: the longer one
    (later statement end) wins, so the result doesn't depend on query order."""
    from app.services.import_.opening_restore import _ordered_imports

    me = _member(db_session, _user(db_session), "Aditi Sharma")
    a = _upload(db_session, me, _solo(open_units="10", cost="500", start=date(2024, 4, 1), rows=[(date(2024, 5, 1), "1", "11")]))
    b = _upload(db_session, me, _solo(open_units="10", cost="500", start=date(2024, 4, 1), rows=[(date(2024, 6, 1), "1", "12")]))
    ia, ib = db_session.get(Import, uuid.UUID(a.import_id)), db_session.get(Import, uuid.UUID(b.import_id))
    ia.statement_to_date, ib.statement_to_date = date(2025, 3, 31), date(2026, 3, 31)
    db_session.commit()
    ordered = _ordered_imports(db_session, me.id, excluded=set())
    assert [i.id for i in ordered][:2] == [ib.id, ia.id]


def test_restore_finds_fund_by_reinvestment_isin(db_session):
    from app.models.reference import Scheme
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    fy = _upload(db_session, me, _solo(open_units="100", cost="5500", start=date(2023, 4, 1),
                                     rows=[(date(2023, 6, 1), "10", "110")]))
    longest = _upload(db_session, me, _solo(start=date(2015, 4, 1),
                        rows=[(date(2015, 6, 1), "100", "100"), (date(2023, 6, 1), "10", "110")]))
    scheme = db_session.query(Scheme).filter_by(isin="INF123").one()
    scheme.isin_reinvest, scheme.isin = scheme.isin, "INF_PRIMARY"
    db_session.commit()
    delete_import(db_session, me.user_id, uuid.UUID(longest.import_id), "person")
    restored = _opening(db_session)
    assert restored.units == Decimal("100")
    assert restored.date == date(2023, 4, 1)
    assert restored.import_id == uuid.UUID(fy.import_id)
