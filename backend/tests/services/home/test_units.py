import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import event

from app.models.enums import ImportStatus, PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.dashboard.holdings import _load_folio_transactions, _process_folio_lots
from app.services.home.units import build_units_timeline


def _member(db, *, user=None, name="Self", relationship=Relationship.SELF):
    if user is None:
        user = User(
            id=uuid.uuid4(),
            phone_number=f"+919{uuid.uuid4().hex[:9]}",
            created_at=datetime.now(timezone.utc),
        )
        db.add(user)
        db.flush()
    member = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name=name,
        relationship=relationship,
        created_at=datetime.now(timezone.utc),
    )
    db.add(member)
    db.flush()
    imported = Import(
        id=uuid.uuid4(),
        household_member_id=member.id,
        status=ImportStatus.CONFIRMED,
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(imported)
    db.flush()
    return member, imported


def _scheme(db, name="Fund"):
    scheme = Scheme(
        id=uuid.uuid4(),
        amfi_code=uuid.uuid4().hex[:8],
        name=name,
        amc_name="Test AMC",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.flush()
    return scheme


def _folio(db, member, scheme, number):
    folio = Folio(
        id=uuid.uuid4(),
        household_member_id=member.id,
        scheme_id=scheme.id,
        folio_number=number,
        plan_type=PlanType.DIRECT,
    )
    db.add(folio)
    db.flush()
    return folio


def _txn(db, folio, imported, kind, day, units):
    row = Transaction(
        id=uuid.uuid4(),
        folio_id=folio.id,
        import_id=imported.id,
        type=kind,
        date=day,
        amount=Decimal("0"),
        units=Decimal(units),
        nav=Decimal("10"),
    )
    db.add(row)
    return row


def test_single_folio_purchase_sip_and_redemption_timeline(db_session):
    member, imported = _member(db_session)
    scheme = _scheme(db_session)
    folio = _folio(db_session, member, scheme, "ONE")
    _txn(db_session, folio, imported, TransactionType.PURCHASE, date(2026, 1, 2), "100")
    _txn(db_session, folio, imported, TransactionType.PURCHASE_SIP, date(2026, 2, 2), "25")
    _txn(db_session, folio, imported, TransactionType.REDEMPTION, date(2026, 3, 2), "40")
    db_session.commit()

    assert build_units_timeline(db_session, [member.id]) == {
        scheme.id: [
            (date(2026, 1, 2), Decimal("100")),
            (date(2026, 2, 2), Decimal("125")),
            (date(2026, 3, 2), Decimal("85")),
        ]
    }


def test_two_folios_of_one_scheme_are_summed(db_session):
    member, imported = _member(db_session)
    scheme = _scheme(db_session)
    first = _folio(db_session, member, scheme, "A")
    second = _folio(db_session, member, scheme, "B")
    _txn(db_session, first, imported, TransactionType.PURCHASE, date(2026, 1, 1), "10")
    _txn(db_session, second, imported, TransactionType.PURCHASE, date(2026, 1, 3), "15")
    _txn(db_session, first, imported, TransactionType.REDEMPTION, date(2026, 1, 4), "4")
    db_session.commit()

    assert build_units_timeline(db_session, [member.id])[scheme.id] == [
        (date(2026, 1, 1), Decimal("10")),
        (date(2026, 1, 3), Decimal("25")),
        (date(2026, 1, 4), Decimal("21")),
    ]


def test_multiple_members_aggregate_but_one_member_stays_scoped(db_session):
    first, first_import = _member(db_session)
    user = db_session.get(User, first.user_id)
    second, second_import = _member(
        db_session, user=user, name="Spouse", relationship=Relationship.SPOUSE
    )
    scheme = _scheme(db_session)
    _txn(db_session, _folio(db_session, first, scheme, "SELF"), first_import,
         TransactionType.PURCHASE, date(2026, 1, 1), "10")
    _txn(db_session, _folio(db_session, second, scheme, "SPOUSE"), second_import,
         TransactionType.PURCHASE, date(2026, 1, 2), "20")
    db_session.commit()

    assert build_units_timeline(db_session, [first.id])[scheme.id] == [
        (date(2026, 1, 1), Decimal("10"))
    ]
    assert build_units_timeline(db_session, [first.id, second.id])[scheme.id] == [
        (date(2026, 1, 1), Decimal("10")),
        (date(2026, 1, 2), Decimal("30")),
    ]


def test_same_day_purchase_and_redemption_emit_only_the_net_close(db_session):
    member, imported = _member(db_session)
    scheme = _scheme(db_session)
    folio = _folio(db_session, member, scheme, "SAME-DAY")
    _txn(db_session, folio, imported, TransactionType.REDEMPTION, date(2026, 1, 2), "4")
    _txn(db_session, folio, imported, TransactionType.PURCHASE, date(2026, 1, 2), "10")
    db_session.commit()

    assert build_units_timeline(db_session, [member.id])[scheme.id] == [
        (date(2026, 1, 2), Decimal("6"))
    ]


def test_every_unit_changing_and_non_changing_transaction_type(db_session):
    member, imported = _member(db_session)
    scheme = _scheme(db_session)
    folio = _folio(db_session, member, scheme, "TYPES")
    additions = (
        TransactionType.OPENING_BALANCE,
        TransactionType.BONUS,
        TransactionType.SEGREGATION,
        TransactionType.DIVIDEND_REINVEST,
        TransactionType.SWITCH_IN,
        TransactionType.GIFT_IN,
    )
    ignored = (
        TransactionType.DIVIDEND_PAYOUT,
        TransactionType.STT,
        TransactionType.STAMP_DUTY,
        TransactionType.MISC,
    )
    for offset, kind in enumerate(additions, 1):
        _txn(db_session, folio, imported, kind, date(2026, 1, offset), "10")
    _txn(db_session, folio, imported, TransactionType.SWITCH_OUT, date(2026, 1, 7), "5")
    _txn(db_session, folio, imported, TransactionType.GIFT_OUT, date(2026, 1, 8), "5")
    _txn(db_session, folio, imported, TransactionType.PURCHASE, date(2026, 1, 9), "7")
    _txn(db_session, folio, imported, TransactionType.REVERSAL, date(2026, 1, 10), "7")
    for offset, kind in enumerate(ignored, 11):
        _txn(db_session, folio, imported, kind, date(2026, 1, offset), "99")
    db_session.commit()

    assert build_units_timeline(db_session, [member.id])[scheme.id] == [
        *((date(2026, 1, day), Decimal(str(day * 10))) for day in range(1, 7)),
        (date(2026, 1, 7), Decimal("55")),
        (date(2026, 1, 8), Decimal("50")),
        (date(2026, 1, 9), Decimal("57")),
        (date(2026, 1, 10), Decimal("50")),
    ]


def test_zero_close_is_emitted_and_later_purchase_restarts_timeline(db_session):
    member, imported = _member(db_session)
    scheme = _scheme(db_session)
    folio = _folio(db_session, member, scheme, "RESTART")
    _txn(db_session, folio, imported, TransactionType.PURCHASE, date(2026, 1, 1), "10")
    _txn(db_session, folio, imported, TransactionType.REDEMPTION, date(2026, 1, 2), "10")
    _txn(db_session, folio, imported, TransactionType.PURCHASE, date(2026, 1, 3), "3")
    db_session.commit()

    assert build_units_timeline(db_session, [member.id])[scheme.id] == [
        (date(2026, 1, 1), Decimal("10")),
        (date(2026, 1, 2), Decimal("0")),
        (date(2026, 1, 3), Decimal("3")),
    ]


def test_scheme_filter_returns_only_requested_scheme(db_session):
    member, imported = _member(db_session)
    wanted = _scheme(db_session, "Wanted")
    other = _scheme(db_session, "Other")
    for scheme in (wanted, other):
        _txn(db_session, _folio(db_session, member, scheme, scheme.name), imported,
             TransactionType.PURCHASE, date(2026, 1, 1), "10")
    db_session.commit()

    assert build_units_timeline(
        db_session, [member.id], scheme_ids=frozenset({wanted.id})
    ) == {wanted.id: [(date(2026, 1, 1), Decimal("10"))]}


def test_empty_members_run_no_statement(db_session):
    statements = []
    event.listen(db_session.bind, "before_cursor_execute", lambda *args: statements.append(args[2]))

    assert build_units_timeline(db_session, []) == {}
    assert statements == []


def test_replay_uses_one_folio_and_one_transaction_statement(db_session):
    member, imported = _member(db_session)
    for index in range(4):
        scheme = _scheme(db_session, f"Fund {index}")
        _txn(db_session, _folio(db_session, member, scheme, str(index)), imported,
             TransactionType.PURCHASE, date(2026, 1, 1), "10")
    db_session.commit()
    member_id = member.id
    statements = []
    event.listen(db_session.bind, "before_cursor_execute", lambda *args: statements.append(args[2]))

    build_units_timeline(db_session, [member_id])

    assert len(statements) == 2


def test_last_timeline_units_match_dashboard_folio_replay(db_session):
    member, imported = _member(db_session)
    first = _scheme(db_session, "Mixed A")
    second = _scheme(db_session, "Mixed B")
    rows = (
        (first, "A1", TransactionType.OPENING_BALANCE, date(2026, 1, 1), "100"),
        (first, "A1", TransactionType.REDEMPTION, date(2026, 1, 2), "15"),
        (first, "A2", TransactionType.BONUS, date(2026, 1, 3), "20"),
        (second, "B1", TransactionType.PURCHASE_SIP, date(2026, 1, 1), "40"),
        (second, "B1", TransactionType.GIFT_OUT, date(2026, 1, 4), "5"),
    )
    folios = {}
    for scheme, number, kind, day, units in rows:
        if number not in folios:
            folios[number] = _folio(db_session, member, scheme, number)
        folio = folios[number]
        _txn(db_session, folio, imported, kind, day, units)
    db_session.commit()

    timeline = build_units_timeline(db_session, [member.id])
    loaded_folios, by_folio = _load_folio_transactions(db_session, [member.id])
    expected = {}
    for folio in loaded_folios:
        units, _, _ = _process_folio_lots(by_folio[folio.id])
        expected[folio.scheme_id] = expected.get(folio.scheme_id, Decimal("0")) + units

    assert {scheme_id: points[-1][1] for scheme_id, points in timeline.items()} == expected


def test_opposite_changes_in_two_folios_on_one_date_leave_no_timeline_entry(db_session):
    member, imported = _member(db_session)
    scheme = _scheme(db_session)
    first = _folio(db_session, member, scheme, "A")
    second = _folio(db_session, member, scheme, "B")
    _txn(db_session, first, imported, TransactionType.PURCHASE, date(2026, 1, 1), "10")
    _txn(db_session, second, imported, TransactionType.PURCHASE, date(2026, 1, 1), "5")
    # One folio sells 3 and the other buys 3 on the same day: the scheme total does not change, so no entry.
    _txn(db_session, first, imported, TransactionType.REDEMPTION, date(2026, 1, 5), "3")
    _txn(db_session, second, imported, TransactionType.PURCHASE, date(2026, 1, 5), "3")
    db_session.commit()

    assert build_units_timeline(db_session, [member.id])[scheme.id] == [(date(2026, 1, 1), Decimal("15"))]
