"""Read-only report on the onboarding "What brings you to Unifolio?" answers.

Run when needed (2026-10-01 plan, section C2):
    python3 -m scripts.report_onboarding_goals [--from 2026-10-01] [--to 2026-10-31] [--csv out.csv]
Filtering happens in Python, not JSON SQL, so it runs unchanged on SQLite and Postgres.
"All four" is how "Why choose? All of it." shows up: the UI saves all four goals.
"""
from __future__ import annotations

import argparse
import csv
import sys
from datetime import date, datetime, time, timezone

from sqlalchemy.orm import Session

from app.models.enums import PrimaryGoal
from app.models.user import User

GOALS = [g.value for g in PrimaryGoal]


def _users(db: Session, date_from: date | None, date_to: date | None) -> list[User]:
    q = db.query(User)
    if date_from:
        q = q.filter(User.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        q = q.filter(User.created_at <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))
    return q.all()


def goal_report(db: Session, date_from: date | None, date_to: date | None) -> dict:
    users = _users(db, date_from, date_to)
    answered = [u for u in users if u.primary_goals]
    per_goal = {}
    for g in GOALS:
        n = sum(1 for u in answered if g in u.primary_goals)
        per_goal[g] = {"count": n, "pct": round(100 * n / len(answered), 1) if answered else 0.0}
    return {
        "total_users": len(users),
        "skipped": len(users) - len(answered),
        "all_four": sum(1 for u in answered if set(GOALS) <= set(u.primary_goals)),
        "per_goal": per_goal,
    }


def goal_rows(db: Session, date_from: date | None, date_to: date | None) -> list[tuple[str, str, str]]:
    return [(str(u.id), u.created_at.isoformat(), "|".join(u.primary_goals or []))
            for u in _users(db, date_from, date_to)]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--from", dest="date_from", type=date.fromisoformat)
    p.add_argument("--to", dest="date_to", type=date.fromisoformat)
    p.add_argument("--csv", dest="csv_path")
    a = p.parse_args(argv)
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        r = goal_report(db, a.date_from, a.date_to)
        print(f"Users: {r['total_users']}  skipped: {r['skipped']}  all four: {r['all_four']}")
        for g, v in r["per_goal"].items():
            print(f"  {g:<24} {v['count']:>6}  {v['pct']:>5}%")
        if a.csv_path:
            with open(a.csv_path, "w", newline="") as f:
                w = csv.writer(f); w.writerow(["user_id", "created_at", "goals"]); w.writerows(goal_rows(db, a.date_from, a.date_to))
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
