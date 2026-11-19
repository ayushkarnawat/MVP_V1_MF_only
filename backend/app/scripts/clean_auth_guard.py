"""Purge auth request guard rows as a manual or scheduled job."""

from app.db.session import SessionLocal
from app.services.auth.request_guard import purge_older_than


def main() -> None:
    with SessionLocal() as db:
        deleted = purge_older_than(db)
    print(f"Deleted {deleted} auth request guard row(s).")


if __name__ == "__main__":
    main()
