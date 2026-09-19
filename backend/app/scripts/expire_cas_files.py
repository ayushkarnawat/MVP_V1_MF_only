"""Manual/cron entry point for CAS file expiry sweeping.

Run as: python -m app.scripts.expire_cas_files
Production maps this to a scheduled EventBridge Scheduler + ECS Fargate task
using the already-staged infra/modules/scheduler module (not wired up in
this pass — see Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md's
"Explicitly out of scope").
"""
from app.db.session import SessionLocal
from app.services.import_.file_storage import expire_stored_files


def main() -> None:
    db = SessionLocal()
    try:
        deleted_count = expire_stored_files(db)
        print(f"Expired {deleted_count} CAS file(s).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
