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


def test_sip_shown_regardless_of_last_transaction_age():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date.today() - timedelta(days=400))

    sips = compute_active_sips(db, [member.id])
    assert len(sips) == 1
    assert sips[0].scheme_name == "SIP Fund"


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


def test_sip_uses_most_recent_transaction_per_folio():
    db = _session()
    member = _household_member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme)
    _sip_txn(db, folio, date.today() - timedelta(days=70), amount=Decimal("1000.00"))
    _sip_txn(db, folio, date.today() - timedelta(days=10), amount=Decimal("1500.00"))

    sips = compute_active_sips(db, [member.id])
    assert len(sips) == 1
    assert Decimal(sips[0].sip_amount) == Decimal("1500.00")


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
    assert len(rows) == 1
    assert rows[0].date == date(2026, 8, 7)
    assert Decimal(rows[0].amount) == Decimal("1200.00")


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
