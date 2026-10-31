"""Manual factsheet freshness uses stored reference months, never network calls."""
from contextlib import nullcontext
from datetime import date

import pytest

from app.models.reference import SchemeFundManager
from app.services.analytics import amfi_factsheet_client as fc
from app.services.analytics.fund_manager_resolvers import ResolverEntry, ResolverKind
from tests.services.analytics.test_amfi_factsheet_client import _scheme

TODAY = date(2026, 10, 15)


def _listed(monkeypatch):
    monkeypatch.setattr(fc, "AMC_RESOLVERS", {
        "Manual AMC": ResolverEntry(ResolverKind.MANUAL, "Manual Company", layout="hdfc"),
    })


def _import(db, amc, period, name="Synthetic Fund"):
    scheme = _scheme(name, amc=amc)
    db.add(scheme); db.flush()
    db.add(SchemeFundManager(scheme_id=scheme.id, manager_name="Synthetic Manager",
                            reference_period=period, match_method="MANUAL"))
    db.flush()


def test_manual_house_imported_this_month_is_not_stale(db_session, monkeypatch):
    _listed(monkeypatch)
    # Old managers on one scheme must not hide a current import on another.
    _import(db_session, "Manual AMC", date(2026, 8, 1), "Older Fund")
    _import(db_session, "Manual AMC", date(2026, 10, 1), "Current Fund")
    assert fc.stale_manual_houses(db_session, TODAY) == []


@pytest.mark.parametrize("today,last,days", [
    (TODAY, date(2026, 9, 1), 14),
    (date(2027, 1, 1), date(2026, 12, 1), 0),
    (date(2026, 10, 31), date(2026, 9, 1), 30),
])
def test_manual_house_last_imported_last_month_is_stale(db_session, monkeypatch, today, last, days):
    _listed(monkeypatch)
    _import(db_session, "Manual AMC", date(2025, 1, 1), "Older Fund")
    _import(db_session, "Manual AMC", last, "Latest Fund")
    # A different AMC's current rows cannot make this AMC current.
    _import(db_session, "Other AMC", today.replace(day=1))
    row, = fc.stale_manual_houses(db_session, today)
    assert (row.amc, row.last_import, row.days_overdue) == ("Manual AMC", last, days)


def test_never_imported_house_is_stale_with_no_last_import(db_session, monkeypatch):
    _listed(monkeypatch)
    # Also catches the no-scheme case: the registry, not an inner join, drives the list.
    row, = fc.stale_manual_houses(db_session, TODAY)
    assert (row.amc, row.last_import, row.days_overdue) == ("Manual AMC", None, 14)


def test_automatic_and_layoutless_houses_are_not_checked(db_session, monkeypatch):
    monkeypatch.setattr(fc, "AMC_RESOLVERS", {
        "Automatic AMC": ResolverEntry(ResolverKind.STATIC_LINK, "Auto", layout="hdfc"),
        "API AMC": ResolverEntry(ResolverKind.JSON_API, "API", layout="hdfc"),
        "Layoutless AMC": ResolverEntry(ResolverKind.MANUAL, "No reader"),
        "Manual AMC": ResolverEntry(ResolverKind.MANUAL, "Manual", layout="hdfc"),
    })
    # A MANUAL-written row from --this-month-only does not change registry kind.
    _import(db_session, "Automatic AMC", date(2026, 8, 1))
    _import(db_session, "Layoutless AMC", date(2026, 8, 1))
    _import(db_session, "Manual AMC", date(2026, 10, 1))
    assert fc.stale_manual_houses(db_session, TODAY) == []


def _job(monkeypatch, db_session):
    from scripts.jobs import check_manual_factsheets as job

    class FixedDate(date):
        @classmethod
        def today(cls):
            return TODAY

    monkeypatch.setattr(job, "date", FixedDate)
    monkeypatch.setattr(job, "SessionLocal", lambda: nullcontext(db_session))
    return job


def test_script_exits_nonzero_and_names_each_overdue_house(db_session, monkeypatch, caplog):
    eligible = [amc for amc, entry in fc.AMC_RESOLVERS.items()
                if entry.kind is ResolverKind.MANUAL and entry.layout]
    assert len(eligible) == 10
    for amc in eligible[2:]:
        _import(db_session, amc, date(2026, 10, 1))
    _import(db_session, eligible[0], date(2026, 9, 1))
    job = _job(monkeypatch, db_session)
    with pytest.raises(SystemExit) as exit_info:
        job.main([])
    assert exit_info.value.code == 1
    assert [record.getMessage() for record in caplog.records] == [
        f"FUND_MANAGER_ALERT amc={eligible[0]} reason=manual_import_missing detail=2026-09",
        f"FUND_MANAGER_ALERT amc={eligible[1]} reason=manual_import_missing detail=never",
    ]


def test_script_exits_zero_when_all_ten_are_current(db_session, monkeypatch, caplog):
    eligible = [amc for amc, entry in fc.AMC_RESOLVERS.items()
                if entry.kind is ResolverKind.MANUAL and entry.layout]
    assert len(eligible) == 10
    for amc in eligible:
        _import(db_session, amc, date(2026, 10, 1))
    job = _job(monkeypatch, db_session)
    with pytest.raises(SystemExit) as exit_info:
        job.main([])
    assert exit_info.value.code == 0
    assert not caplog.records
