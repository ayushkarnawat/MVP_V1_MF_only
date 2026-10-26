from __future__ import annotations

import argparse
import asyncio
import hashlib
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.api.home import get_now_ist
from app.db.session import get_db
from app.main import app
from app.models.user import HouseholdMember, User
from app.services.auth.session import get_active_user
from app.services.dashboard.holdings import _holdings_cache, compute_holdings


IST = timezone(timedelta(hours=5, minutes=30))
FRIDAY = datetime(2026, 10, 23, 18, 30, tzinfo=IST)
MONDAY = datetime(2026, 10, 26, 10, 0, tzinfo=IST)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _mutate(db, scenario: str) -> None:
    if scenario in {"base", "member_rohan", "member_priya", "weekend", "custom_before_index_data"}:
        return
    latest = db.execute(text("SELECT max(date) FROM nav_history")).scalar_one()
    if scenario in {"partial_data", "stale_statement"}:
        scheme_id = db.execute(text(
            "SELECT scheme_id FROM nav_history GROUP BY scheme_id ORDER BY scheme_id LIMIT 1"
        )).scalar_one()
        days = 12 if scenario == "partial_data" else 5
        db.execute(text(
            "DELETE FROM nav_history WHERE scheme_id = :scheme_id "
            "AND date > date(:latest, :offset)"
        ), {"scheme_id": scheme_id, "latest": latest, "offset": f"-{days} days"})
    elif scenario == "one_fund_only":
        folio_id = db.execute(text("SELECT id FROM folios ORDER BY id LIMIT 1")).scalar_one()
        db.execute(text(
            "DELETE FROM transaction_imports WHERE transaction_id IN "
            "(SELECT id FROM transactions WHERE folio_id <> :folio_id)"
        ), {"folio_id": folio_id})
        db.execute(text("DELETE FROM transactions WHERE folio_id <> :folio_id"), {"folio_id": folio_id})
    elif scenario in {"all_funds_down", "loss_day"}:
        scheme_ids = [row[0] for row in db.execute(text(
            "SELECT DISTINCT scheme_id FROM nav_history ORDER BY scheme_id"
        )).all()]
        if scenario == "loss_day":
            scheme_ids = scheme_ids[:1]
        factor = Decimal("0.99") if scenario == "all_funds_down" else Decimal("0.95")
        for scheme_id in scheme_ids:
            rows = db.execute(text(
                "SELECT date, nav FROM nav_history WHERE scheme_id = :scheme_id "
                "ORDER BY date DESC LIMIT 2"
            ), {"scheme_id": scheme_id}).all()
            if len(rows) == 2:
                db.execute(text(
                    "UPDATE nav_history SET nav = :nav WHERE scheme_id = :scheme_id AND date = :day"
                ), {"nav": str(Decimal(rows[1].nav) * factor), "scheme_id": scheme_id, "day": rows[0].date})
    elif scenario == "no_holdings":
        db.execute(text("DELETE FROM transaction_imports"))
        db.execute(text("DELETE FROM transactions"))
    else:
        raise ValueError(f"unknown scenario: {scenario}")
    db.commit()


def _run_scenario(source: Path, temp_dir: Path, scenario: str) -> list[str]:
    copy = temp_dir / f"{scenario}.db"
    shutil.copy2(source, copy)
    engine = create_engine(f"sqlite:///{copy}", connect_args={"check_same_thread": False})
    sessions = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    with sessions() as db:
        _mutate(db, scenario)
        user = db.query(User).one()
        members = (
            db.query(HouseholdMember)
            .filter(HouseholdMember.user_id == user.id)
            .order_by(HouseholdMember.created_at, HouseholdMember.id)
            .all()
        )
        user_id = user.id
        member_ids = [member.id for member in members]

    def override_db():
        with sessions() as session:
            yield session

    now = MONDAY if scenario == "weekend" else FRIDAY
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_active_user] = lambda: SimpleNamespace(id=user_id)
    app.dependency_overrides[get_now_ist] = lambda: now
    _holdings_cache.clear()
    client = TestClient(app)
    if scenario == "member_rohan":
        root = f"/household-members/{member_ids[0]}"
    elif scenario == "member_priya":
        root = f"/household-members/{member_ids[1]}"
    else:
        root = "/household/aggregate"
    summary = client.get(f"{root}/home/summary").json()
    movers = client.get(f"{root}/home/movers?by=fund").json()
    wealth = client.get(f"{root}/home/wealth-series?period=1D").json()
    allocation = client.get(f"{root}/home/allocation").json()
    worth = client.get(f"{root}/home/worth-a-look").json()
    if scenario == "custom_before_index_data":
        custom = client.get(
            f"{root}/home/wealth-series?period=custom&from=2016-01-01&to=2016-12-31&benchmark=nifty_50"
        )
        if custom.status_code != 200:
            raise RuntimeError(custom.text)

    lines = []
    checks = {
        "identity": summary["change_amount"] == movers["net_change"] == wealth["change_amount"],
        "mover_sum": sum(
            (Decimal(row["change"]) for row in movers["gains"] + movers["losses"]),
            Decimal("0"),
        ) + Decimal(movers["others_change"]) == Decimal(movers["net_change"]),
        "value_chain": (
            (wealth["empty"] and summary["total_value"] == allocation["total_value"] == "0.00")
            or (
                wealth["points"][-1]["value"] == wealth["end_value"]
                == summary["total_value"] == allocation["total_value"]
            )
        ),
    }
    details = {
        "identity": f"summary={summary['change_amount']} movers={movers['net_change']} wealth={wealth['change_amount']}",
        "mover_sum": f"bars={sum((Decimal(row['change']) for row in movers['gains'] + movers['losses']), Decimal('0')) + Decimal(movers['others_change'])} net={movers['net_change']}",
        "value_chain": f"point={None if wealth['empty'] else wealth['points'][-1]['value']} end={wealth['end_value']} summary={summary['total_value']} allocation={allocation['total_value']}",
    }
    with sessions() as db:
        _holdings_cache.clear()
        rows = asyncio.run(compute_holdings(db, member_ids if root.endswith("aggregate") else [member_ids[0 if scenario == "member_rohan" else 1]], allow_stale_today=True))
        direct_total = sum(
            (Decimal(row.current_value) for row in rows if row.current_value is not None and not row.nav_unavailable),
            Decimal("0"),
        ).quantize(Decimal("0.01"))
    checks["holdings_parity"] = Decimal(summary["total_value"]) == direct_total
    details["holdings_parity"] = f"summary={summary['total_value']} holdings={direct_total}"
    for name, passed in checks.items():
        suffix = "" if passed else f" ({details[name]})"
        lines.append(f"{scenario} {name}: {'PASS' if passed else 'FAIL'}{suffix}")
    lines.append(f"{scenario} worth_state: {worth['state']}")
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_active_user, None)
    app.dependency_overrides.pop(get_now_ist, None)
    engine.dispose()
    if not all(checks.values()):
        print("\n".join(lines))
        raise AssertionError(f"{scenario} failed: {checks}")
    return lines


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("db_path", type=Path)
    args = parser.parse_args()
    source = args.db_path.resolve()
    before = _sha256(source)
    print(f"source_sha256_before: {before}")
    scenarios = (
        "base", "member_rohan", "member_priya", "weekend", "partial_data",
        "stale_statement", "one_fund_only", "all_funds_down", "loss_day",
        "no_holdings", "custom_before_index_data",
    )
    with tempfile.TemporaryDirectory(prefix="unifolio-home-gate-") as directory:
        for scenario in scenarios:
            for line in _run_scenario(source, Path(directory), scenario):
                print(line)
    print("base calibration fund_shares: n/a")
    print("base calibration tier: n/a")
    print("base calibration 1y_gap: n/a")
    print("base calibration ter_gap: n/a")
    print("base calibration top_five_share: n/a")
    after = _sha256(source)
    print(f"source_sha256_after: {after}")
    if before != after:
        raise SystemExit("FAIL: source database hash changed")


if __name__ == "__main__":
    main()
