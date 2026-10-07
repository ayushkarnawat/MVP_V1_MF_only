"""Bring data imported before the CAS-import fixes up to the new rules
(Phase 7 Task 4). Only for an environment whose data must be kept; staging's
default is a wipe with scripts/clean-staging-db.sh instead.

- Every folio's plan comes from its scheme (the AMFI master's plan type, else
  the scheme name), as identify.classify_plan decides at import time; it is
  never left `unclassified`.
- Legacy bonus rows: before Phase 3 a bonus printed with amount 0.00 was saved
  as `purchase`. The type is part of the duplicate key, so re-uploading over
  such data would add a `bonus` row beside it and double those units. Those
  rows become `bonus` first.
- A plan already verified (at import, or the user's own choice) is never
  replaced; a CAS-only scheme's stored plan is treated as a guess.
- Every touched member's snapshots are invalidated in the same commit. The
  running API server's in-memory holdings cache clears on its own TTL
  (15 min) or a backend restart.
- Members with any folio not matching their latest statement get a
  "re-upload recommended" line (opening balances, twin rows and row types for
  kept data are healed by re-uploading, not by this script).

Run from backend/:  python scripts/reclassify_folio_plans.py [--dry-run]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session  # noqa: E402

from app.models.enums import PlanType, TransactionType  # noqa: E402
from app.models.folio import Folio  # noqa: E402
from app.models.reference import Scheme  # noqa: E402
from app.models.transaction import Transaction  # noqa: E402
from app.services.import_.identify import classify_plan  # noqa: E402


def reclassify(db: Session, *, dry_run: bool) -> dict[str, int]:
    from app.models.enums import SchemeSource
    from app.models.transaction_import import TransactionImport

    touched_members = set()
    folios_changed = 0
    for folio in db.query(Folio).all():
        if folio.plan_verified and folio.plan_type != PlanType.UNCLASSIFIED:
            # Verified at import (master, name, sibling NAV) or the user's own
            # choice: this script never replaces it (review).
            continue
        scheme = db.get(Scheme, folio.scheme_id)
        # A CAS-only scheme's plan_type is the import's guess, not the master's.
        master = scheme if scheme is not None and scheme.source != SchemeSource.CAS_ONLY else None
        plan, verified = classify_plan(master, False, scheme.name if scheme else "")
        new_plan = PlanType(plan)
        if not verified and folio.plan_type != PlanType.UNCLASSIFIED:
            # Before 0028 every folio was unverified, the user's own choice
            # included: a guess never replaces it (re-review).
            continue
        if folio.plan_type != new_plan or folio.plan_verified != verified:
            folios_changed += 1
            touched_members.add(folio.household_member_id)
            if not dry_run:
                folio.plan_type, folio.plan_verified = new_plan, verified

    legacy_bonus = [
        t for t in db.query(Transaction).filter(Transaction.type == TransactionType.PURCHASE,
                                                Transaction.amount == 0).all()
        if "bonus" in (t.raw_description or "").lower()
    ]
    converted = removed = 0
    for txn in legacy_bonus:
        touched_members.add(db.get(Folio, txn.folio_id).household_member_id)
        twin = db.query(Transaction.id).filter(
            Transaction.folio_id == txn.folio_id, Transaction.date == txn.date, Transaction.amount == txn.amount,
            Transaction.units == txn.units, Transaction.occurrence == txn.occurrence,
            Transaction.type == TransactionType.BONUS,
        ).first()
        if twin is not None:
            # Already re-uploaded as `bonus`: converting would hit the unique
            # key, and keeping it double-counts the units (review).
            removed += 1
            if not dry_run:
                db.query(TransactionImport).filter_by(transaction_id=txn.id).delete(synchronize_session=False)
                db.delete(txn)
        else:
            converted += 1
            if not dry_run:
                txn.type = TransactionType.BONUS

    if not dry_run:
        if touched_members:
            from app.services.dashboard.snapshots import invalidate_member_snapshots
            invalidate_member_snapshots(db, list(touched_members))  # same commit as the change
        db.commit()
        if touched_members:
            # Clears this process's cache only; a running API server keeps its
            # own holdings cache until the TTL (15 min) or a restart.
            from app.services.dashboard.holdings import invalidate_holdings_cache
            for member_id in touched_members:
                invalidate_holdings_cache(member_id)
    return {"folios_changed": folios_changed, "bonus_rows_converted": converted,
            "bonus_duplicates_removed": removed, "members_touched": len(touched_members)}


def reupload_recommended(db: Session) -> list[str]:
    from app.models.user import HouseholdMember
    from app.services.import_.reconciliation import reconcile_members
    out = []
    for member in db.query(HouseholdMember).all():
        rows = reconcile_members(db, [member.id])
        if any(r.status != "match" for r in rows):
            out.append(str(member.id))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="print the counts without writing")
    args = parser.parse_args()
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        counts = reclassify(db, dry_run=args.dry_run)
        print(("DRY RUN " if args.dry_run else "") + ", ".join(f"{k}={v}" for k, v in counts.items()))
        for member_id in reupload_recommended(db):
            print(f"member {member_id}: re-upload recommended (a folio doesn't match its latest statement)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
