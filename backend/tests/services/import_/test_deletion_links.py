"""Phase 4 (#5): deleting an import removes only rows no other import
contains, re-points the survivors' owner, and rebuilds the opening balance
from the statements that are left."""
import uuid
from datetime import date
from decimal import Decimal

import pytest

import app.services.import_.file_storage as file_storage_module
from app.models.enums import TransactionOrigin
from app.models.folio import Folio
from app.models.transaction import Transaction
from app.models.transaction_import import TransactionImport
from app.services.import_.deletion import delete_import, delete_member_portfolio
from tests.services.import_.test_confirm_people import _member, _solo, _upload, _user


@pytest.fixture(autouse=True)
def isolate_cas_file_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(file_storage_module.default_file_storage, "_base_dir", tmp_path)


def test_delete_shorter_keeps_rows_the_longer_contains(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    fy_rows = [(date(2026, 5, 5), "10", "110")]
    long_rows = [(date(2016, 5, 5), "100", "100")] + fy_rows
    fy = _upload(db_session, me, _solo(open_units="100", cost="5000", start=date(2026, 4, 1), rows=fy_rows))
    longer = _upload(db_session, me, _solo(start=date(2016, 1, 1), rows=long_rows))
    delete_import(db_session, me.user_id, uuid.UUID(fy.import_id), "person")
    rows = db_session.query(Transaction).order_by(Transaction.date).all()
    assert [t.date for t in rows] == [date(2016, 5, 5), date(2026, 5, 5)]
    assert all(t.import_id == uuid.UUID(longer.import_id) for t in rows)      # owner re-pointed
    assert db_session.query(TransactionImport).filter_by(import_id=uuid.UUID(fy.import_id)).count() == 0


def test_delete_longer_restores_shorter_opening(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    fy_rows = [(date(2026, 5, 5), "10", "110")]
    fy = _upload(db_session, me, _solo(open_units="100", cost="5000", start=date(2026, 4, 1), rows=fy_rows))
    longer = _upload(db_session, me, _solo(start=date(2016, 1, 1), rows=[(date(2016, 5, 5), "100", "100")] + fy_rows))
    assert db_session.query(Transaction).filter_by(origin=TransactionOrigin.CAS_OPENING).count() == 0
    delete_import(db_session, me.user_id, uuid.UUID(longer.import_id), "person")
    [opening] = db_session.query(Transaction).filter_by(origin=TransactionOrigin.CAS_OPENING).all()
    assert opening.date == date(2026, 4, 1) and opening.units == Decimal("100")
    assert opening.import_id == uuid.UUID(fy.import_id)
    assert sum(t.units for t in db_session.query(Transaction).all()) == Decimal("110")


def test_delete_member_portfolio_leaves_no_links(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    _upload(db_session, me, _solo(start=date(2021, 1, 1), rows=[(date(2021, 1, 5), "10", "10")]))
    delete_member_portfolio(db_session, me.user_id, me.id, remove_member=False)
    assert db_session.query(TransactionImport).count() == 0
    assert db_session.query(Folio).count() == 0
    assert db_session.query(Transaction).count() == 0


def test_delete_the_only_import_removes_its_opening_row(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    fy = _upload(db_session, me, _solo(open_units="100", cost="5000", start=date(2026, 4, 1)))
    delete_import(db_session, me.user_id, uuid.UUID(fy.import_id), "person")
    assert db_session.query(Transaction).count() == 0 and db_session.query(Folio).count() == 0


def test_restore_never_calls_the_network(db_session, monkeypatch):
    """restore_openings runs inside a plain `def` route: NAV series must come
    from the nav_history cache only."""
    from unittest.mock import AsyncMock

    me = _member(db_session, _user(db_session), "Aditi Sharma")
    fy_rows = [(date(2026, 5, 5), "10", "110")]
    _upload(db_session, me, _solo(open_units="100", cost="5000", start=date(2026, 4, 1), rows=fy_rows))
    longer = _upload(db_session, me, _solo(start=date(2016, 1, 1), rows=[(date(2016, 5, 5), "100", "100")] + fy_rows))
    boom = AsyncMock(side_effect=AssertionError("network called during delete"))
    monkeypatch.setattr("app.services.dashboard.nav._fetch_nav_history", boom)
    monkeypatch.setattr("app.services.import_.service._fetch_nav_history", boom)
    delete_import(db_session, me.user_id, uuid.UUID(longer.import_id), "person")
    assert boom.await_count == 0


def test_restore_skips_when_real_rows_before_start_remain(db_session):
    """Delete the FY import while a 10-year import (rows from 2016) remains:
    the 10-year file is now the earliest; its opening (0 units) means no
    opening row, and the FY one must not come back."""
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    fy_rows = [(date(2026, 5, 5), "10", "110")]
    ten = _upload(db_session, me, _solo(start=date(2016, 1, 1), rows=[(date(2016, 5, 5), "100", "100")] + fy_rows))
    # FY uploaded after the 10-year file: everything already saved → already imported, so build its
    # import by a statement that adds one new FY row instead.
    fy = _upload(db_session, me, _solo(open_units="100", cost="5000", start=date(2026, 4, 1),
                                       rows=fy_rows + [(date(2026, 6, 5), "1", "111")]))
    delete_import(db_session, me.user_id, uuid.UUID(fy.import_id), "person")
    assert db_session.query(Transaction).filter_by(origin=TransactionOrigin.CAS_OPENING).count() == 0
    assert sorted(t.date for t in db_session.query(Transaction).all()) == [date(2016, 5, 5), date(2026, 5, 5)]
    assert ten.import_id
