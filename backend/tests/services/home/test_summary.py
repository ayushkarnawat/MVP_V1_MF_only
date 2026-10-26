import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import event

from app.models.enums import ImportStatus, Relationship
from app.models.imports import Import
from app.models.user import HouseholdMember, User
from app.services.home.movers import FundInput, compute_movers
from app.services.home.summary import build_summary, greeting_for_hour, load_members_connected


IST = ZoneInfo("Asia/Kolkata")
NAV_DAY = date(2026, 10, 23)


def _fund(name, change, *, scheme_id=None):
    previous_nav = Decimal("100")
    units = Decimal("100")
    return FundInput(
        scheme_id=scheme_id or uuid.uuid4(),
        name=name,
        category="Equity",
        units_timeline=[(date(2026, 1, 1), units)],
        navs=[
            (date(2026, 10, 22), previous_nav),
            (NAV_DAY, previous_nav + Decimal(change) / units),
        ],
    )


def _movers(*funds):
    return compute_movers(funds, NAV_DAY, "fund")


def _hand_movers():
    return compute_movers(
        [
            FundInput(uuid.uuid4(), "Alpha Equity", "Flexi Cap",
                      [(date(2026, 10, 1), Decimal("100"))],
                      [(date(2026, 10, 21), Decimal("50")),
                       (date(2026, 10, 22), Decimal("51")), (NAV_DAY, Decimal("52"))]),
            FundInput(uuid.uuid4(), "Beta Debt", "Short Duration",
                      [(date(2026, 10, 1), Decimal("200"))],
                      [(date(2026, 10, 22), Decimal("20")), (NAV_DAY, Decimal("19.90"))]),
            FundInput(uuid.uuid4(), "Gamma Small", "Small Cap",
                      [(NAV_DAY, Decimal("50"))],
                      [(date(2026, 10, 22), Decimal("10")), (NAV_DAY, Decimal("9"))]),
            FundInput(uuid.uuid4(), "Delta Mid", "Flexi Cap",
                      [(date(2026, 9, 1), Decimal("30")), (NAV_DAY, Decimal("10"))],
                      [(date(2026, 10, 22), Decimal("100")), (NAV_DAY, Decimal("103"))]),
            FundInput(uuid.uuid4(), "Epsilon", "Large Cap",
                      [(date(2026, 10, 1), Decimal("10"))],
                      [(date(2026, 10, 21), Decimal("5")),
                       (date(2026, 10, 22), Decimal("5.50"))]),
        ],
        NAV_DAY,
        "fund",
    )


@pytest.mark.parametrize(
    ("hour", "expected"),
    [(11, "morning"), (12, "afternoon"), (16, "afternoon"),
     (17, "evening"), (0, "morning")],
)
def test_greeting_boundaries(hour, expected):
    assert greeting_for_hour(hour) == expected


def test_scope_labels_and_member_name_requirement():
    movers = _hand_movers()
    now = datetime(2026, 10, 23, 9, tzinfo=IST)
    aggregate = build_summary(
        display_name="Ayush", now_ist=now, scope="aggregate", member_name=None,
        movers=movers, members_connected=1, members_total=1,
    )
    member = build_summary(
        display_name="Ayush", now_ist=now, scope="member", member_name="Mira",
        movers=movers, members_connected=1, members_total=1,
    )

    assert aggregate.scope_label == "Your family portfolio"
    assert member.scope_label == "Mira's portfolio"
    with pytest.raises(ValueError, match="member_name"):
        build_summary(
            display_name="Ayush", now_ist=now, scope="member", member_name=None,
            movers=movers, members_connected=1, members_total=1,
        )


@pytest.mark.parametrize(
    ("change", "direction", "phrase"),
    [("4.99", "flat", "little changed"), ("5.00", "up", "up"),
     ("-5.00", "down", "down")],
)
def test_direction_threshold_is_judged_on_percentage(change, direction, phrase):
    summary = build_summary(
        display_name="Ayush", now_ist=datetime(2026, 10, 23, 13, tzinfo=IST),
        scope="aggregate", member_name=None, movers=_movers(_fund("Alpha", change)),
        members_connected=1, members_total=1,
    )
    assert summary.change_pct == Decimal(change) / Decimal("100")
    assert summary.direction == direction
    assert summary.status_phrase == phrase


def test_none_percentage_is_flat():
    one_nav = FundInput(
        scheme_id=uuid.uuid4(), name="New", category="Equity",
        units_timeline=[(NAV_DAY, Decimal("10"))], navs=[(NAV_DAY, Decimal("5"))],
    )
    summary = build_summary(
        display_name="Ayush", now_ist=datetime(2026, 10, 23, 17, tzinfo=IST),
        scope="aggregate", member_name=None, movers=_movers(one_nav),
        members_connected=1, members_total=1,
    )
    assert summary.change_pct is None
    assert summary.direction == "flat"
    assert summary.status_phrase == "little changed"


def test_since_label_today_and_weekend_uses_previous_nav_weekday():
    movers = _hand_movers()
    today = build_summary(
        display_name="Ayush", now_ist=datetime(2026, 10, 23, 9, tzinfo=IST),
        scope="aggregate", member_name=None, movers=movers,
        members_connected=1, members_total=1,
    )
    weekend = build_summary(
        display_name="Ayush", now_ist=datetime(2026, 10, 24, 9, tzinfo=IST),
        scope="aggregate", member_name=None, movers=movers,
        members_connected=1, members_total=1,
    )
    assert today.since_label == "today"
    assert weekend.since_label == "since Thursday's close"
    assert weekend.since_date == date(2026, 10, 22)


def test_top_contributor_for_up_down_zero_and_no_funds():
    now = datetime(2026, 10, 23, 9, tzinfo=IST)
    cases = [
        (_movers(_fund("Alpha", "20"), _fund("Beta", "-5")), "Alpha"),
        (_movers(_fund("Alpha", "5"), _fund("Beta", "-20")), "Beta"),
        (_movers(_fund("Alpha", "20"), _fund("Beta", "-20")), "Alpha"),
        (_movers(), None),
        (_movers(_fund("Still", "0")), None),
    ]
    for movers, expected in cases:
        summary = build_summary(
            display_name="Ayush", now_ist=now, scope="aggregate", member_name=None,
            movers=movers, members_connected=1, members_total=1,
        )
        assert summary.top_contributor == expected


def test_data_line_only_for_multi_member_aggregate():
    movers = _hand_movers()
    now = datetime(2026, 10, 23, 9, tzinfo=IST)

    multi = build_summary(display_name="Ayush", now_ist=now, scope="aggregate",
                          member_name=None, movers=movers, members_connected=2, members_total=3)
    single = build_summary(display_name="Ayush", now_ist=now, scope="aggregate",
                           member_name=None, movers=movers, members_connected=1, members_total=1)
    member = build_summary(display_name="Ayush", now_ist=now, scope="member",
                           member_name="Mira", movers=movers, members_connected=1, members_total=3)
    assert multi.data_line == "Data from 2 of 3 family members"
    assert single.data_line is None
    assert member.data_line is None


def _members(db):
    user = User(id=uuid.uuid4(), phone_number=f"+919{uuid.uuid4().hex[:9]}",
                created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    result = []
    for index, relationship in enumerate((Relationship.SELF, Relationship.SPOUSE, Relationship.PARENT)):
        member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name=f"Member {index}",
                                 relationship=relationship, created_at=datetime.now(timezone.utc))
        db.add(member)
        db.flush()
        result.append(member)
    return result


def test_load_members_connected_counts_distinct_confirmed_members_in_one_statement(db_session):
    confirmed, pending, empty = _members(db_session)
    for _ in range(2):
        db_session.add(Import(household_member_id=confirmed.id, status=ImportStatus.CONFIRMED,
                              uploaded_at=datetime.now(timezone.utc)))
    db_session.add(Import(household_member_id=pending.id, status=ImportStatus.PENDING,
                          uploaded_at=datetime.now(timezone.utc)))
    db_session.commit()
    ids = [confirmed.id, pending.id, empty.id]
    statements = []
    listener = lambda *args: statements.append(args[2])
    event.listen(db_session.bind, "before_cursor_execute", listener)

    assert load_members_connected(db_session, ids) == 1

    event.remove(db_session.bind, "before_cursor_execute", listener)
    assert len(statements) == 1


def test_load_members_connected_empty_input_runs_no_statement(db_session):
    statements = []
    listener = lambda *args: statements.append(args[2])
    event.listen(db_session.bind, "before_cursor_execute", listener)
    assert load_members_connected(db_session, []) == 0
    event.remove(db_session.bind, "before_cursor_execute", listener)
    assert statements == []


def test_top_contributor_is_the_largest_loss_when_several_funds_fall():
    now = datetime(2026, 10, 23, 9, tzinfo=IST)
    movers = _movers(_fund("Alpha", "5"), _fund("Beta", "-20"), _fund("Gamma", "-8"))

    summary = build_summary(
        display_name="Ayush", now_ist=now, scope="aggregate", member_name=None,
        movers=movers, members_connected=1, members_total=1,
    )

    assert summary.top_contributor == "Beta"
