import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.sip import _add_months_clamped, _next_due_on_or_after
from app.services.dashboard.sip import compute_active_sips


def test_add_months_clamped_same_day_next_month():
    assert _add_months_clamped(date(2026, 6, 5), 1) == date(2026, 7, 5)


def test_add_months_clamped_clamps_to_shorter_month():
    assert _add_months_clamped(date(2026, 1, 31), 1) == date(2026, 2, 28)


def test_add_months_clamped_handles_leap_year_feb_29_anchor():
    assert _add_months_clamped(date(2028, 2, 29), 12) == date(2029, 2, 28)


def test_add_months_clamped_rolls_year_boundary():
    assert _add_months_clamped(date(2026, 11, 15), 3) == date(2027, 2, 15)


def test_add_months_clamped_supports_negative_months():
    assert _add_months_clamped(date(2026, 10, 5), -2) == date(2026, 8, 5)


def test_next_due_on_or_after_returns_anchor_when_already_future():
    anchor = date(2026, 9, 5)
    today = date(2026, 8, 1)
    assert _next_due_on_or_after(anchor, today) == anchor


def test_next_due_on_or_after_rolls_forward_one_cycle():
    anchor = date(2026, 7, 5)
    today = date(2026, 8, 1)
    assert _next_due_on_or_after(anchor, today) == date(2026, 8, 5)


def test_next_due_on_or_after_rolls_forward_multiple_cycles_after_a_gap():
    anchor = date(2025, 7, 5)
    today = date(2026, 8, 18)
    assert _next_due_on_or_after(anchor, today) == date(2026, 9, 5)


def test_next_due_on_or_after_returns_today_when_anchor_is_today():
    today = date(2026, 8, 18)
    assert _next_due_on_or_after(today, today) == today


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _household_member(db):
    user = User(id=uuid.uuid4(), phone_number=f"+9199999{uuid.uuid4().hex[:5]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Self", relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add(member)
    db.commit()
    return member


def _scheme(db, name="SIP Fund"):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name=name, amc_name="HDFC AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    return scheme


def _folio(db, member, scheme):
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add(folio)
    db.commit()
    return folio


def _sip_txn(db, folio, on_date, amount=Decimal("1000.00"), units=Decimal("20.000"), nav=Decimal("50.0000")):
    txn = Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE_SIP, date=on_date, amount=amount, units=units, nav=nav)
    db.add(txn)
    db.commit()
    return txn


def test_old_sip_is_stopped_and_hidden_unless_requested():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date.today() - timedelta(days=400))

    sips = compute_active_sips(db, [member.id])
    assert sips == []
    [row] = compute_active_sips(db, [member.id], include_stopped=True)
    assert row.scheme_name == "SIP Fund" and row.status == "stopped"


def test_sip_next_due_date_rolls_forward_from_last_transaction():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    last_run = date.today() - timedelta(days=100)
    _sip_txn(db, folio, last_run)

    sips = compute_active_sips(db, [member.id])
    assert len(sips) == 1
    assert sips[0].next_due_date >= date.today()


def test_sip_excluded_when_folio_fully_redeemed():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date.today() - timedelta(days=60), units=Decimal("20.000"), nav=Decimal("50.0000"))
    db.add(Transaction(
        id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(),
        type=TransactionType.REDEMPTION, date=date.today() - timedelta(days=10),
        amount=Decimal("1000.00"), units=Decimal("20.000"), nav=Decimal("50.0000"),
    ))
    db.commit()

    sips = compute_active_sips(db, [member.id])
    assert sips == []


def test_sip_tracks_each_exact_amount_series():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date.today() - timedelta(days=70), amount=Decimal("1000.00"))
    _sip_txn(db, folio, date.today() - timedelta(days=10), amount=Decimal("1500.00"))

    sips = compute_active_sips(db, [member.id])
    assert {Decimal(row.sip_amount) for row in sips} == {Decimal("1000.00"), Decimal("1500.00")}


def test_non_sip_purchase_is_not_a_sip():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE, date=date.today(), amount=Decimal("1000.00"), units=Decimal("20.000"), nav=Decimal("50.0000")))
    db.commit()

    sips = compute_active_sips(db, [member.id])
    assert sips == []


from app.services.dashboard.sip import compute_sips_for_month


def test_sips_for_month_uses_actual_transaction_when_one_exists_in_month():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date(2026, 7, 5), amount=Decimal("1000.00"))
    _sip_txn(db, folio, date(2026, 8, 7), amount=Decimal("1200.00"))

    rows = compute_sips_for_month(db, [member.id], 2026, 8)
    assert len(rows) == 2  # distinct amounts are distinct active series
    actual = next(row for row in rows if Decimal(row.amount) == Decimal("1200.00"))
    assert actual.date == date(2026, 8, 7)
    assert actual.instalment == 1


def test_sips_for_month_uses_projected_date_when_no_actual_transaction():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date(2026, 7, 5), amount=Decimal("1000.00"))
    # August skipped entirely — no actual transaction.

    rows = compute_sips_for_month(db, [member.id], 2026, 8)
    assert len(rows) == 1
    assert rows[0].date == date(2026, 8, 5)
    assert Decimal(rows[0].amount) == Decimal("1000.00")


def test_sips_for_month_omits_month_before_first_ever_transaction():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date(2026, 7, 5))

    rows = compute_sips_for_month(db, [member.id], 2026, 3)
    assert rows == []


def test_sips_for_month_projects_backward_correctly_when_a_later_transaction_exists():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date(2026, 7, 5), amount=Decimal("1000.00"))
    # August skipped, SIP resumes in October — October becomes the latest anchor.
    _sip_txn(db, folio, date(2026, 10, 5), amount=Decimal("1000.00"))

    rows = compute_sips_for_month(db, [member.id], 2026, 8)
    assert len(rows) == 1
    assert rows[0].date == date(2026, 8, 5)


def test_sips_for_month_shows_real_past_transaction_even_if_folio_later_redeemed():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date(2026, 7, 5), amount=Decimal("1000.00"), units=Decimal("20.000"), nav=Decimal("50.0000"))
    db.add(Transaction(
        id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(),
        type=TransactionType.REDEMPTION, date=date(2026, 9, 1),
        amount=Decimal("1000.00"), units=Decimal("20.000"), nav=Decimal("50.0000"),
    ))
    db.commit()

    rows = compute_sips_for_month(db, [member.id], 2026, 7)
    assert len(rows) == 1
    assert rows[0].date == date(2026, 7, 5)

    # But no fabricated projected row for a later, unpaid month post-redemption.
    rows_later = compute_sips_for_month(db, [member.id], 2026, 11)
    assert rows_later == []


from sqlalchemy import event


def test_compute_active_sips_uses_constant_query_count_regardless_of_folio_count():
    db = _session()
    member = _household_member(db)

    def _make_folio_with_sip():
        scheme = _scheme(db, name=f"Fund {uuid.uuid4().hex[:6]}")
        folio = _folio(db, member, scheme)
        _sip_txn(db, folio, date.today() - timedelta(days=10))
        return folio

    _make_folio_with_sip()

    counts: list[int] = []

    def _count_queries(n_folios: int) -> int:
        for _ in range(n_folios - 1):
            _make_folio_with_sip()
        count = 0

        def _on_execute(*args, **kwargs):
            nonlocal count
            count += 1

        event.listen(db.get_bind(), "before_cursor_execute", _on_execute)
        try:
            compute_active_sips(db, [member.id])
        finally:
            event.remove(db.get_bind(), "before_cursor_execute", _on_execute)
        return count

    counts.append(_count_queries(1))
    counts.append(_count_queries(5))

    assert counts[0] == counts[1], f"query count grew with folio count: {counts}"


import pytest
from app.models.imports import Import
from app.models.transaction_import import TransactionImport
from app.models.enums import ImportStatus


def sip_folio(db, sip_dates, statement_to, amount="5000.00"):
    member = _household_member(db)
    folio = _folio(db, member, _scheme(db))
    imp = Import(id=uuid.uuid4(), household_member_id=member.id,
                 status=ImportStatus.CONFIRMED, uploaded_at=datetime.now(timezone.utc),
                 confirmed_at=datetime.now(timezone.utc), statement_to_date=statement_to)
    db.add(imp)
    db.flush()
    for i, day in enumerate(sip_dates):
        txn = Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=imp.id,
                          type=TransactionType.PURCHASE_SIP, date=day,
                          amount=Decimal(amount), units=Decimal("20"), nav=Decimal("50"), occurrence=i)
        db.add(txn)
        db.flush()
        db.add(TransactionImport(transaction_id=txn.id, transaction_date=day, import_id=imp.id))
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=imp.id,
                       type=TransactionType.PURCHASE, date=sip_dates[0],
                       amount=Decimal("1000"), units=Decimal("20"), nav=Decimal("50")))
    db.commit()
    return folio


@pytest.mark.parametrize("last,reference,expected", [
    (date(2026,9,5), date(2026,10,6), 0),
    (date(2026,6,5), date(2026,10,6), 3),
    (date(2026,5,5), date(2026,10,6), 4),
])
def test_missed_instalments(last, reference, expected):
    from app.services.dashboard.sip import missed_instalments
    assert missed_instalments(last, reference) == expected


def test_stopped_after_more_than_three_missed():
    db = _session()
    f = sip_folio(db, [date(2013,m,5) for m in range(1,13)], date(2026,10,5))
    assert compute_active_sips(db, [f.household_member_id]) == []
    [row] = compute_active_sips(db, [f.household_member_id], include_stopped=True)
    assert row.status == "stopped"
    assert compute_sips_for_month(db, [f.household_member_id], 2026,10) == []
    assert len(compute_sips_for_month(db, [f.household_member_id], 2013,1)) == 1


def test_resumed_sip_is_active_again():
    db = _session()
    f = sip_folio(db, [date(2026,1,5),date(2026,2,5),date(2026,9,5)], date(2026,10,5))
    [row] = compute_active_sips(db, [f.household_member_id])
    assert row.status == "active" and row.sip_date == date(2026,9,5)


def test_twin_sips_are_two_parallel():
    db = _session()
    f = sip_folio(db, [date(2026,9,5)]*2, date(2026,10,5), "42968.00")
    [row] = compute_active_sips(db, [f.household_member_id])
    assert row.series_count == 2 and row.sip_amount == "42968.00"
    for month in (9,10):
        rows = compute_sips_for_month(db, [f.household_member_id], 2026,month)
        assert len(rows) == 2
        assert [r.instalment for r in rows] == [1,2]
        assert sum(Decimal(r.amount) for r in rows) == Decimal("85936.00")


def test_missed_counted_to_statement_end_not_today(monkeypatch):
    db = _session()
    f = sip_folio(db, [date(2026,4,5)], date(2026,5,5))
    class Today(date):
        @classmethod
        def today(cls): return date(2026,10,6)
    monkeypatch.setattr("app.services.dashboard.sip.date", Today)
    assert len(compute_active_sips(db, [f.household_member_id])) == 1


def test_monthly_instalment_numbers_distinguish_same_fund_across_folios():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    for _ in range(2):
        folio = _folio(db,member,scheme)
        _sip_txn(db,folio,date.today().replace(day=5))
    rows = compute_sips_for_month(db,[member.id],date.today().year,date.today().month)
    assert len(rows) == 2
    assert [r.instalment for r in rows] == [1,2]
    assert sum(Decimal(r.amount) for r in rows) == Decimal("2000.00")


def _monthly(db, folio, start, months, amount):
    for i in range(months):
        _sip_txn(db, folio, _add_months_clamped(start, i), amount=amount)


def test_stamp_duty_does_not_split_a_sip():
    # From July 2020 the 0.005% stamp duty lowers each instalment slightly
    # (53,712.50 -> 53,709.81); it is still one SIP (decided 6 Oct).
    db = _session()
    member = _household_member(db)
    folio = _folio(db, member, _scheme(db))
    _monthly(db, folio, date(2019, 1, 5), 18, Decimal("53712.50"))
    recent = date.today().replace(day=5) - timedelta(days=31 * 6)
    _monthly(db, folio, recent, 6, Decimal("53709.81"))
    rows = compute_active_sips(db, [member.id], include_stopped=True)
    assert len(rows) == 1
    assert rows[0].status == "active" and rows[0].sip_amount == "53709.81" and rows[0].series_count == 1


def test_clearly_different_amounts_stay_separate_sips():
    db = _session()
    member = _household_member(db)
    folio = _folio(db, member, _scheme(db))
    start = date.today().replace(day=5) - timedelta(days=31 * 3)
    _monthly(db, folio, start, 3, Decimal("5000.00"))
    _monthly(db, folio, start, 3, Decimal("5010.00"))
    rows = compute_active_sips(db, [member.id])
    assert sorted(r.sip_amount for r in rows) == ["5000.00", "5010.00"]


def test_month_view_counts_a_stamp_duty_instalment_once():
    from app.services.dashboard.sip import compute_sips_for_month
    db = _session()
    member = _household_member(db)
    folio = _folio(db, member, _scheme(db))
    _monthly(db, folio, date(2020, 1, 5), 6, Decimal("1000.00"))
    _monthly(db, folio, date(2020, 7, 5), 6, Decimal("999.95"))
    rows = compute_sips_for_month(db, [member.id], 2020, 8)
    assert [(r.date, r.amount) for r in rows] == [(date(2020, 8, 5), "999.95")]


def test_month_view_shows_the_amount_actually_paid_that_month():
    from app.services.dashboard.sip import compute_sips_for_month
    db = _session()
    member = _household_member(db)
    folio = _folio(db, member, _scheme(db))
    _monthly(db, folio, date(2020, 1, 5), 6, Decimal("1000.00"))
    _monthly(db, folio, date(2020, 7, 5), 6, Decimal("999.95"))
    rows = compute_sips_for_month(db, [member.id], 2020, 3)
    assert [(r.date, r.amount) for r in rows] == [(date(2020, 3, 5), "1000.00")]


def test_small_steps_do_not_chain_two_sips_together():
    # Review L6: 1000 and 1000.18 are 0.018% apart; a 1000.09 between them
    # must not chain them into one series.
    db = _session()
    member = _household_member(db)
    folio = _folio(db, member, _scheme(db))
    start = date.today().replace(day=5) - timedelta(days=31 * 2)
    for amount in ("1000.00", "1000.09", "1000.18"):
        _monthly(db, folio, start, 2, Decimal(amount))
    assert len(compute_active_sips(db, [member.id])) == 2
