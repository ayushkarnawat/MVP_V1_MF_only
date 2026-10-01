from datetime import date, datetime, timezone

from app.models.user import User
from scripts.report_onboarding_goals import goal_report, goal_rows


def _user(db, phone, goals, created="2026-10-01"):
    u = User(phone_number=phone, created_at=datetime.fromisoformat(created).replace(tzinfo=timezone.utc), primary_goals=goals)
    db.add(u); db.commit(); return u


ALL = ["consolidated_view", "understand_holdings", "family_management", "performance_comparison"]


def test_report_counts(db_session):
    _user(db_session, "+911", ALL)
    _user(db_session, "+912", ["family_management"])
    _user(db_session, "+913", None)
    r = goal_report(db_session, None, None)
    assert r["total_users"] == 3 and r["skipped"] == 1 and r["all_four"] == 1
    assert r["per_goal"]["family_management"] == {"count": 2, "pct": 100.0}
    assert r["per_goal"]["consolidated_view"] == {"count": 1, "pct": 50.0}


def test_date_filter_and_rows(db_session):
    _user(db_session, "+914", ["family_management"], created="2026-09-01")
    _user(db_session, "+915", ["consolidated_view"], created="2026-10-02")
    r = goal_report(db_session, date(2026, 10, 1), None)
    assert r["total_users"] == 1
    rows = goal_rows(db_session, None, None)
    assert {row[2] for row in rows} == {"family_management", "consolidated_view"}
