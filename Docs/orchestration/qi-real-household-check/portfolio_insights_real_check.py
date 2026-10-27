"""Read-only check of the Portfolio Quick Insights route against a REAL (or synthetic) household database.

Never writes to the source database: each scenario runs on its own temporary COPY, and the source file's sha256
is printed before and after (it must match). Stored prices only (no network), exactly like the route.

Usage, from the repo's backend directory, with the backend virtualenv:

    cp /home/ayush/s25/s25.db /tmp/qi_check_copy.db          # work on a private copy
    .venv/bin/python /path/to/portfolio_insights_real_check.py /tmp/qi_check_copy.db

Scenarios: the whole household (aggregate) and every member (by creation order). For each it prints the route's
total_value, largest_holding, spread, plan_split, largest_amc and sips, then checks:
  C1  insights total_value == portfolio-summary total_value
  C2  largest_holding.value <= total_value and its pct is between 0 and 100
  C3  Direct + Regular + Unclassified percentages add up to 100 within 0.0003, values add up to total_value
  C4  active SIP count == sum of series_count over the /sips route rows
  C5  (aggregate) the members' total_value add up to the aggregate total_value (only members with data)
  C6  no insight is missing while empty is false
Exit code 0 only when every check passes in every scenario and the source hash is unchanged.
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

BACKEND = Path.cwd()
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.api.home import get_now_ist  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import HouseholdMember, User  # noqa: E402
from app.services.auth.session import get_active_user  # noqa: E402
from app.services.dashboard.holdings import _holdings_cache  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sip_rows(payload) -> list:
    """The /sips routes answer a list (member) or an object holding a list (aggregate); find the rows."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for value in payload.values():
            if isinstance(value, list) and value and isinstance(value[0], dict) and "series_count" in value[0]:
                return value
        for value in payload.values():
            if isinstance(value, list):
                return value
    return []


def run(source: Path, temp_dir: Path, now: datetime) -> bool:
    copy = temp_dir / "check.db"
    shutil.copy2(source, copy)
    engine = create_engine(f"sqlite:///{copy}", connect_args={"check_same_thread": False})
    sessions = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    with sessions() as db:
        users = db.query(User).all()
        if len(users) != 1:
            print(f"ABORT: expected exactly one user in the database, found {len(users)}")
            return False
        user_id = users[0].id
        members = (
            db.query(HouseholdMember).filter(HouseholdMember.user_id == user_id)
            .order_by(HouseholdMember.created_at, HouseholdMember.id).all()
        )
        member_list = [(member.id, member.name) for member in members]

    def override_db():
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_active_user] = lambda: SimpleNamespace(id=user_id)
    app.dependency_overrides[get_now_ist] = lambda: now
    client = TestClient(app)
    ok = True
    aggregate_total = None
    member_totals: list[Decimal] = []
    scopes = [("aggregate", "/household/aggregate")] + [
        (f"member {name}", f"/household-members/{member_id}") for member_id, name in member_list
    ]
    try:
        for label, root in scopes:
            _holdings_cache.clear()
            response = client.get(f"{root}/portfolio-insights")
            print(f"\n=== {label}: HTTP {response.status_code}")
            if response.status_code != 200:
                print(response.text[:300])
                ok = False
                continue
            ins = response.json()
            summary = client.get(f"{root}/portfolio-summary").json()
            sips_payload = client.get(f"{root}/sips").json()
            body = ins["insights"]
            print(f"total_value      {ins['total_value']}   (portfolio-summary {summary['total_value']})")
            print(f"empty            {ins['empty']}  reason={ins['empty_reason']}  partial={ins['partial']}")
            for key in ("largest_holding", "spread", "plan_split", "largest_amc", "sips"):
                print(f"{key:<16} {body.get(key)}")
            if ins["missing_funds"]:
                print(f"missing_funds    {ins['missing_funds']}")
            checks: dict[str, bool] = {}
            checks["C1 total_value equals portfolio-summary"] = ins["total_value"] == summary["total_value"]
            if not ins["empty"]:
                total = Decimal(ins["total_value"])
                holding = body["largest_holding"]
                checks["C2 largest holding within total, pct in [0,100]"] = (
                    Decimal(holding["value"]) <= total and Decimal("0") <= Decimal(holding["pct_of_portfolio"]) <= Decimal("100")
                )
                plan = body["plan_split"]
                parts = [plan[k] for k in ("direct", "regular", "unclassified") if plan.get(k) is not None]
                pct_sum = sum((Decimal(p["pct"]) for p in parts), Decimal("0"))
                val_sum = sum((Decimal(p["value"]) for p in parts), Decimal("0"))
                checks["C3 plan split adds up (pct within 0.0003, value exact)"] = (
                    abs(pct_sum - Decimal("100")) <= Decimal("0.0003") and val_sum == total
                )
                checks["C6 all five insights present"] = all(body.get(k) is not None for k in (
                    "largest_holding", "spread", "plan_split", "largest_amc", "sips"))
            rows = sip_rows(sips_payload)
            expected_count = sum(int(row.get("series_count", 1)) for row in rows)
            checks["C4 active SIP count equals sum of series_count"] = body["sips"]["active_count"] == expected_count
            if label == "aggregate":
                aggregate_total = Decimal(ins["total_value"])
            else:
                if not ins["empty"]:
                    member_totals.append(Decimal(ins["total_value"]))
            for name, passed in checks.items():
                print(f"  [{'PASS' if passed else 'FAIL'}] {name}")
                ok = ok and passed
        if aggregate_total is not None:
            summed = sum(member_totals, Decimal("0"))
            passed = summed == aggregate_total
            print(f"\n  [{'PASS' if passed else 'FAIL'}] C5 members' totals ({summed}) equal the aggregate ({aggregate_total})")
            ok = ok and passed
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_active_user, None)
        app.dependency_overrides.pop(get_now_ist, None)
        engine.dispose()
    return ok


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("db_path", type=Path)
    parser.add_argument("--now", default=None, help="ISO timestamp for the route's clock (default: now in IST)")
    args = parser.parse_args()
    source = args.db_path.resolve()
    now = datetime.fromisoformat(args.now).astimezone(IST) if args.now else datetime.now(IST)
    before = sha256(source)
    print(f"source_sha256_before: {before}")
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        passed = run(source, Path(tmp), now)
    after = sha256(source)
    print(f"\nsource_sha256_after:  {after}")
    unchanged = before == after
    print(f"source unchanged: {unchanged}")
    print(f"ALL CHECKS PASSED: {passed and unchanged}")
    sys.exit(0 if passed and unchanged else 1)


if __name__ == "__main__":
    main()
