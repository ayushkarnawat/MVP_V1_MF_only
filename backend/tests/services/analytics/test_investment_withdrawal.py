# backend/tests/services/analytics/test_investment_withdrawal.py
import asyncio
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import PlanType, Relationship, TransactionType
from app.models.folio import Folio
from app.models.reference import Scheme
from app.models.transaction import Transaction
from app.models.user import HouseholdMember, User
from app.services.analytics.investment_withdrawal import compute_investment_withdrawal
from app.services.dashboard.schemas import SipRow

_MODULE = "app.services.analytics.investment_withdrawal"


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def _member(db):
    user = User(id=uuid.uuid4(), phone_number=f"+9199999{uuid.uuid4().hex[:5]}", created_at=datetime.now(timezone.utc))
    db.add(user)
    db.flush()
    member = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Priya", relationship=Relationship.SELF, created_at=datetime.now(timezone.utc))
    db.add(member)
    db.commit()
    return member


def _folio(db, member):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name="Test Fund", amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    folio = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=scheme.id, folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add(folio)
    db.commit()
    return folio


def _txn(db, folio, type_, on_date, amount, stamp_duty=None, raw_description=None):
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=type_, date=on_date,
                       amount=Decimal(amount), units=Decimal("1.000"), nav=Decimal("50.0000"),
                       stamp_duty=Decimal(stamp_duty) if stamp_duty else None,
                       raw_description=raw_description))
    db.commit()


def _holding(value):
    return type("H", (), {"current_value": value})()


def _run(db, member_ids, holdings_value="0.00", sips=()):
    with (
        patch(f"{_MODULE}.compute_holdings", new=AsyncMock(return_value=[_holding(holdings_value)])),
        patch(f"{_MODULE}.compute_active_sips", return_value=list(sips)),
    ):
        return asyncio.run(compute_investment_withdrawal(db, member_ids))


def test_switch_legs_get_their_own_directions():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    for kind in (TransactionType.SWITCH_OUT, TransactionType.SWITCH_IN):
        _txn(db, folio, kind, date(2024, 3, 1), "400000.00")
    result = _run(db, [member.id])
    bucket = next(b for b in result.monthly if b.period == "2024-03")
    assert (bucket.switched_out, bucket.switched_in) == ("400000.00", "400000.00")
    assert (bucket.invested, bucket.withdrawn) == ("0.00", "0.00")
    assert {entry.direction for entry in bucket.entries} == {"switched_in", "switched_out"}
    assert result.switch_count == 1
    assert (result.total_switched_out, result.total_switched_in) == ("400000.00", "400000.00")
    assert (result.yearly[0].switched_out, result.yearly[0].switched_in) == ("400000.00", "400000.00")


def test_switches_do_not_change_net_invested_or_gain():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 3, 1), "10000.00")
    before = _run(db, [member.id], holdings_value="12000.00")
    _txn(db, folio, TransactionType.SWITCH_OUT, date(2024, 3, 2), "9000.00")
    _txn(db, folio, TransactionType.SWITCH_IN, date(2024, 3, 3), "8500.00", stamp_duty="0.50")
    after = _run(db, [member.id], holdings_value="12000.00")
    assert (after.net_invested, after.absolute_gain) == (before.net_invested, before.absolute_gain)
    assert after.total_switched_in == "8500.50"


def test_a_merger_or_face_value_conversion_is_not_a_switch():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 3, 1), "500.00")  # a real cash flow, so "no switch entries" is not vacuous
    _txn(db, folio, TransactionType.SWITCH_OUT, date(2024, 3, 1), "1000.00", raw_description="Face value change")
    _txn(db, folio, TransactionType.SWITCH_IN, date(2024, 3, 1), "1000.00", raw_description="MERGER OF X INTO Y")
    result = _run(db, [member.id])
    assert result.total_switched_in == result.total_switched_out == "0.00"
    assert result.switch_count == 0
    assert [e.direction for b in result.monthly for e in b.entries] == ["invested"]


def test_a_switch_from_opening_holdings_counts_but_adds_nothing():
    db = _session()
    member = _member(db)
    _txn(db, _folio(db, member), TransactionType.SWITCH_IN, date(2024, 3, 1), "0.00")
    result = _run(db, [member.id])
    [entry] = result.monthly[0].entries
    assert (entry.direction, entry.amount) == ("switched_in", "0.00")
    assert result.switch_count == 1
    assert result.total_switched_in == result.total_switched_out == "0.00"


def test_opening_holdings_are_reported_apart_and_left_out_of_the_bars():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.OPENING_BALANCE, date(2024, 1, 1), "500000.00")
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 2, 1), "10000.00")
    result = _run(db, [member.id])
    assert result.opening_holdings == "500000.00"
    assert [b.invested for b in result.monthly[:2]] == ["0.00", "10000.00"]
    assert result.monthly[0].entries[0].direction == "opening"
    assert result.total_invested == "510000.00"
    assert Decimal(result.total_invested) == sum(Decimal(b.invested) for b in result.monthly) + Decimal(result.opening_holdings)
    assert (result.net_invested, result.absolute_gain) == ("510000.00", "-510000.00")


def test_a_switch_posting_in_the_next_month_lands_in_that_month():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.SWITCH_OUT, date(2024, 3, 31), "1000.00")
    _txn(db, folio, TransactionType.SWITCH_IN, date(2024, 4, 1), "1000.00")
    result = _run(db, [member.id])
    march, april = result.monthly[:2]
    assert (march.period, march.switched_out, march.switched_in) == ("2024-03", "1000.00", "0.00")
    assert (april.period, april.switched_out, april.switched_in) == ("2024-04", "0.00", "1000.00")
    assert result.switch_count == 1


@pytest.mark.parametrize("kind", list(TransactionType))
def test_direction_for_covers_every_transaction_type(kind):
    from app.services.analytics.investment_withdrawal import direction_for

    expected = {
        TransactionType.OPENING_BALANCE: "opening", TransactionType.REVERSAL: "reversal",
        TransactionType.PURCHASE: "invested", TransactionType.PURCHASE_SIP: "invested",
        TransactionType.REDEMPTION: "withdrawn", TransactionType.DIVIDEND_PAYOUT: "withdrawn",
        TransactionType.SWITCH_IN: "switched_in", TransactionType.SWITCH_OUT: "switched_out",
    }
    assert direction_for(Transaction(type=kind, raw_description=None)) == expected.get(kind)


def test_five_tile_formula_matches_worked_example():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), "3840000.00")
    _txn(db, folio, TransactionType.REDEMPTION, date(2025, 1, 1), "600000.00")

    result = _run(db, [member.id], holdings_value="3500000.00")

    assert result.total_invested == "3840000.00"
    assert result.total_withdrawn == "600000.00"
    assert result.net_invested == "3240000.00"
    assert result.current_value == "3500000.00"
    assert result.absolute_gain == "260000.00"


def test_gift_and_bonus_transactions_excluded_from_all_tiles():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.GIFT_IN, date(2024, 1, 1), "100000.00")
    _txn(db, folio, TransactionType.BONUS, date(2024, 2, 1), "0.00")

    result = _run(db, [member.id])

    assert result.total_invested == "0.00"
    assert result.total_withdrawn == "0.00"
    assert result.monthly == []
    assert result.gifts_net == "100000.00"
    assert result.absolute_gain == "-100000.00"  # holdings mocked at 0: gift value excluded from gain


def test_gain_excludes_gifts_at_their_transfer_value():
    """Decided 9 Oct (option A): a gift isn't cash, so it never counts as
    Invested/Withdrawn, but Current value holds the gifted units -- Gain leaves
    out their value at transfer, as the dashboard's XIRR does (xirr.py)."""
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.GIFT_IN, date(2024, 1, 1), "5000.00")  # 100 units at NAV 50

    result = _run(db, [member.id], holdings_value="5500.00")  # NAV now 55

    assert (result.total_invested, result.total_withdrawn) == ("0.00", "0.00")
    assert result.current_value == "5500.00"
    assert result.absolute_gain == "500.00"
    assert result.gifts_net == "5000.00"


def test_gift_out_adds_back_the_value_given_away():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 1), "10000.00")
    _txn(db, folio, TransactionType.GIFT_OUT, date(2024, 6, 1), "4000.00")

    result = _run(db, [member.id], holdings_value="7000.00")

    # 7,000 still held + 4,000 given away - 10,000 invested
    assert result.absolute_gain == "1000.00"
    assert result.gifts_net == "-4000.00"


def test_empty_household_returns_all_zero_tiles():
    db = _session()
    result = asyncio.run(compute_investment_withdrawal(db, []))
    assert result.total_invested == "0.00"
    assert result.current_value == "0.00"
    assert result.monthly == []
    assert result.yearly == []


def test_stamp_duty_is_included_in_invested():
    db = _session()
    member = _member(db)
    _txn(db, _folio(db, member), TransactionType.PURCHASE_SIP, date(2024, 1, 5), "10000.00", stamp_duty="0.50")
    result = _run(db, [member.id])
    assert result.total_invested == "10000.50"
    [bucket] = [b for b in result.monthly if b.period == "2024-01"]
    assert bucket.invested == "10000.50"
    assert bucket.entries[0].amount == "10000.50"


def test_reversal_in_a_later_month_nets_in_that_month():
    """A SIP bought on 31 Jan and bounced on 2 Feb: totals net to zero; Feb's
    bucket carries the -5,000 (the bar chart clamps bar heights at 0)."""
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE_SIP, date(2024, 1, 31), "5000.00")
    _txn(db, folio, TransactionType.REVERSAL, date(2024, 2, 2), "5000.00")

    result = _run(db, [member.id])

    assert result.total_invested == "0.00"
    by_period = {b.period: b.invested for b in result.monthly}
    assert (by_period["2024-01"], by_period["2024-02"]) == ("5000.00", "-5000.00")


def test_future_dated_entries_still_land_in_a_bucket():
    db = _session()
    member = _member(db)
    future = date.today().replace(year=date.today().year + 1, day=1)
    _txn(db, _folio(db, member), TransactionType.PURCHASE, future, "1000.00")

    result = _run(db, [member.id])

    assert result.monthly[-1].period == f"{future:%Y-%m}"
    assert result.monthly[-1].invested == "1000.00"
    assert result.yearly[-1].period == str(future.year)


def test_bounced_sip_nets_against_invested_and_stays_in_the_drill_in():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE_SIP, date(2024, 1, 5), "5000.00")
    _txn(db, folio, TransactionType.REVERSAL, date(2024, 1, 9), "5000.00")

    result = _run(db, [member.id])

    assert result.total_invested == "0.00"
    assert result.total_withdrawn == "0.00"
    [bucket] = [b for b in result.monthly if b.period == "2024-01"]
    assert bucket.invested == "0.00"
    assert {e.direction for e in bucket.entries} == {"invested", "reversal"}


def test_quiet_months_and_years_are_sent_as_zero_buckets():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 1, 10), "1000.00")
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 4, 10), "1000.00")

    result = _run(db, [member.id])

    periods = [b.period for b in result.monthly]
    assert periods[:4] == ["2024-01", "2024-02", "2024-03", "2024-04"]
    assert periods[-1] == f"{date.today():%Y-%m}"  # continuous through the current month
    feb = next(b for b in result.monthly if b.period == "2024-02")
    assert (feb.invested, feb.withdrawn, feb.entries) == ("0.00", "0.00", [])
    assert [b.period for b in result.yearly] == [str(y) for y in range(2024, date.today().year + 1)]


def test_holdings_without_a_nav_are_left_out_of_current_value():
    db = _session()
    member = _member(db)
    with (
        patch(f"{_MODULE}.compute_holdings", new=AsyncMock(return_value=[_holding("1000.00"), _holding(None)])),
        patch(f"{_MODULE}.compute_active_sips", return_value=[]),
    ):
        result = asyncio.run(compute_investment_withdrawal(db, [member.id]))
    assert result.current_value == "1000.00"


def _sip(member, scheme_id, last_date, amount, series_count=1):
    return SipRow(scheme_id=str(scheme_id), scheme_name="Test Fund", household_member_id=str(member.id),
                  household_member_name="Priya", sip_date=last_date, sip_amount=amount,
                  next_due_date=last_date, series_count=series_count)


def test_sip_summary_counts_twin_sips_like_the_dashboard():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    today = date.today()
    sips = [_sip(member, folio.scheme_id, today, "5000.00", series_count=2), _sip(member, folio.scheme_id, today, "1000.00")]

    result = _run(db, [member.id], sips=sips)

    assert result.sip_summary.active_count == 3
    assert result.sip_summary.total_monthly_amount == "11000.00"
    assert result.sip_summary.missed_count == 0


def test_missed_instalments_are_measured_against_the_latest_statement_not_today():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    # Last instalment in March, latest statement ends in April: nothing missed yet,
    # however long ago April is.
    sips = [_sip(member, folio.scheme_id, date(2024, 3, 5), "5000.00")]
    with patch(f"{_MODULE}._references", return_value={folio.id: date(2024, 4, 30)}):
        result = _run(db, [member.id], sips=sips)
    assert result.sip_summary.missed_count == 0

    # Same SIP, statement ends in July: April, May and June were missed.
    with patch(f"{_MODULE}._references", return_value={folio.id: date(2024, 7, 31)}):
        result = _run(db, [member.id], sips=sips)
    assert result.sip_summary.missed_count == 3

    # Twin SIPs (series_count=2) each missed those 3 instalments.
    twins = [_sip(member, folio.scheme_id, date(2024, 3, 5), "5000.00", series_count=2)]
    with patch(f"{_MODULE}._references", return_value={folio.id: date(2024, 7, 31)}):
        result = _run(db, [member.id], sips=twins)
    assert result.sip_summary.missed_count == 6


def test_missed_sip_names_the_fund_and_the_first_missed_date():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    sips = [_sip(member, folio.scheme_id, date(2024, 3, 5), "5000.00")]
    with patch(f"{_MODULE}._references", return_value={folio.id: date(2024, 4, 30)}):
        quiet = _run(db, [member.id], sips=sips).sip_summary
    assert (quiet.missed_sip_fund, quiet.missed_sip_date) == (None, None)
    # hand check: last paid 5 Mar 2024, statement ends 31 Jul 2024 -> Apr, May, Jun missed; the first is 5 Apr 2024
    with patch(f"{_MODULE}._references", return_value={folio.id: date(2024, 7, 31)}):
        summary = _run(db, [member.id], sips=sips).sip_summary
    assert summary.missed_count == 3
    assert summary.missed_sip_fund == sips[0].scheme_name
    assert summary.missed_sip_date == date(2024, 4, 5)
    assert summary.model_dump(mode="json")["missed_sip_date"] == "2024-04-05"


def test_two_folios_of_one_fund_use_the_earliest_statement_end():
    """SipRow has no folio id, so folios are grouped by member + scheme. With
    different statement ends, the earliest one is used: a miss is only
    flagged when every folio's statement shows it (ruling, 9 Oct)."""
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    second = Folio(id=uuid.uuid4(), household_member_id=member.id, scheme_id=folio.scheme_id,
                   folio_number=uuid.uuid4().hex[:6], plan_type=PlanType.DIRECT)
    db.add(second)
    db.commit()
    sips = [_sip(member, folio.scheme_id, date(2024, 6, 5), "5000.00")]
    references = {folio.id: date(2024, 6, 30), second.id: date(2024, 9, 30)}
    with patch(f"{_MODULE}._references", return_value=references):
        result = _run(db, [member.id], sips=sips)
    assert result.sip_summary.missed_count == 0


def test_ledger_entries_carry_units_nav_and_masked_folio():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    folio.folio_number = "1234567/89"
    db.commit()
    db.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=uuid.uuid4(), type=TransactionType.PURCHASE,
                       date=date(2026, 1, 5), amount=Decimal("2500.00"), units=Decimal("48.123"), nav=Decimal("51.9500")))
    db.commit()
    entry = _run(db, [member.id]).monthly[0].entries[0]
    # hand check: raw row units 48.123, nav 51.9500; folio "1234567/89" keeps its last four alphanumerics "6789"
    assert (entry.units, entry.nav, entry.folio) == ("48.123", "51.9500", "XXXX6789")
    dumped = entry.model_dump(mode="json")
    assert dumped["units"] == "48.123" and dumped["nav"] == "51.9500" and dumped["folio"] == "XXXX6789"


def _two_folios(db, member):
    return _folio(db, member), _folio(db, member)


def test_most_missed_sip_is_weighted_by_series_count_like_the_headline():
    db = _session()
    member = _member(db)
    fa, fb = _two_folios(db, member)
    # A: 2 missed x 3 parallel SIPs = 6; B: 3 missed x 1 = 3. Per-row alone would wrongly pick B.
    a = _sip(member, fa.scheme_id, date(2024, 3, 5), "5000.00", series_count=3).model_copy(update={"scheme_name": "Fund A"})
    b = _sip(member, fb.scheme_id, date(2024, 3, 5), "5000.00").model_copy(update={"scheme_name": "Fund B"})
    refs = {fa.id: date(2024, 6, 30), fb.id: date(2024, 7, 31)}
    with patch(f"{_MODULE}._references", return_value=refs):
        summary = _run(db, [member.id], sips=[b, a]).sip_summary
    assert summary.missed_count == 9
    assert summary.missed_sip_fund == "Fund A"


def test_most_missed_sip_tie_keeps_the_first_listed():
    db = _session()
    member = _member(db)
    fa, fb = _two_folios(db, member)
    # A: 3 x 1 = 3; B: 1 x 3 = 3 -> tie, first listed wins.
    a = _sip(member, fa.scheme_id, date(2024, 3, 5), "5000.00").model_copy(update={"scheme_name": "Fund A"})
    b = _sip(member, fb.scheme_id, date(2024, 5, 5), "5000.00", series_count=3).model_copy(update={"scheme_name": "Fund B"})
    refs = {fa.id: date(2024, 7, 31), fb.id: date(2024, 7, 31)}
    with patch(f"{_MODULE}._references", return_value=refs):
        first = _run(db, [member.id], sips=[a, b]).sip_summary
        second = _run(db, [member.id], sips=[b, a]).sip_summary
    assert first.missed_count == 6 and first.missed_sip_fund == "Fund A"
    assert second.missed_sip_fund == "Fund B"


def test_today_is_the_ist_date_on_a_utc_host_before_05_30_ist():
    # 20:30 UTC on 31 Oct is 02:00 IST on 1 Nov. A UTC host's date.today() says 31 Oct.
    from unittest.mock import MagicMock
    from zoneinfo import ZoneInfo

    utc_now = datetime(2026, 10, 31, 20, 30, tzinfo=timezone.utc)

    class FakeDate(date):
        @classmethod
        def today(cls):
            return date(2026, 10, 31)  # what a UTC host reports

    class FakeDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return utc_now.astimezone(tz) if tz else utc_now

    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    sips = [_sip(member, folio.scheme_id, date(2026, 9, 5), "5000.00")]
    active = MagicMock(return_value=sips)
    with (
        patch(f"{_MODULE}.date", FakeDate),
        patch(f"{_MODULE}.datetime", FakeDateTime, create=True),
        patch(f"{_MODULE}.compute_holdings", new=AsyncMock(return_value=[_holding("0.00")])),
        patch(f"{_MODULE}.compute_active_sips", active),
        patch(f"{_MODULE}._references", return_value={}),
    ):
        result = asyncio.run(compute_investment_withdrawal(db, [member.id]))

    assert active.call_args.kwargs["today"] == date(2026, 11, 1)
    # Last instalment 5 Sep; with no statement reference the fallback is today (1 Nov): October missed.
    assert result.sip_summary.missed_count == 1

def test_entries_carry_the_funds_scheme_id():
    db = _session()
    member = _member(db)
    folio = _folio(db, member)
    _txn(db, folio, TransactionType.PURCHASE, date(2024, 3, 1), "1000.00")
    result = _run(db, [member.id])
    entries = [e for b in result.monthly for e in b.entries]
    assert entries and all(e.scheme_id == str(folio.scheme_id) for e in entries)


def test_entry_parses_without_scheme_id():
    from app.services.analytics.schemas import InvestmentWithdrawalEntry
    entry = InvestmentWithdrawalEntry.model_validate({
        "transaction_id": "t", "date": "2024-03-01", "type": "purchase", "amount": "1.00",
        "direction": "invested", "scheme_name": "F", "household_member_id": "m", "household_member_name": "M",
    })
    assert entry.scheme_id is None
