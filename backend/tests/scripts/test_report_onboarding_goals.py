from datetime import date, datetime, timezone

from app.models.user import User
from scripts.report_onboarding_goals import goal_report, goal_rows


def _user(db, phone, goals, created="2026-10-01"):
    u = User(phone_number=phone, created_at=datetime.fromisoformat(created).replace(tzinfo=timezone.utc), primary_goals=goals)
    db.add(u); db.commit(); return u


ALL = ["wealth_creation", "retirement", "childrens_education", "buy_home", "financial_freedom", "tax_planning"]


def test_report_counts_the_six_goals(db_session):
    _user(db_session, "+911", ALL)
    _user(db_session, "+912", ["retirement"])
    _user(db_session, "+913", None)
    r = goal_report(db_session, None, None)
    assert list(r["per_goal"]) == ALL
    assert r["per_goal"]["retirement"] == {"count": 2, "pct": 100.0}
    assert r["per_goal"]["tax_planning"] == {"count": 1, "pct": 50.0}
    assert r["per_goal"]["buy_home"] == {"count": 1, "pct": 50.0}


def test_report_picked_all_counts_users_with_all_six(db_session):
    _user(db_session, "+911", ALL)
    _user(db_session, "+912", ALL[:5])
    r = goal_report(db_session, None, None)
    assert r["picked_all"] == 1
    assert "all_four" not in r


def test_report_skipped_counts_users_without_goals(db_session):
    _user(db_session, "+911", ["retirement"])
    _user(db_session, "+913", None)
    r = goal_report(db_session, None, None)
    assert r["total_users"] == 2 and r["skipped"] == 1


def test_date_filter_and_rows(db_session):
    _user(db_session, "+914", ["retirement"], created="2026-09-01")
    _user(db_session, "+915", ["buy_home"], created="2026-10-02")
    r = goal_report(db_session, date(2026, 10, 1), None)
    assert r["total_users"] == 1
    rows = goal_rows(db_session, None, None)
    assert {row[2] for row in rows} == {"retirement", "buy_home"}
