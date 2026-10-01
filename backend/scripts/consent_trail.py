"""Read-only consent trail for one user: every consent_records row, oldest first.

Run when needed (e.g. answering a dispute or a data-principal request):
    python3 -m scripts.consent_trail --user <uuid>
    python3 -m scripts.consent_trail --phone +91XXXXXXXXXX

One line per row:
    recorded_at action document_type document_version purpose surface ip_truncated device_id
    document_sha256 ip_hmac related_import_id related_file_sha256 user_agent
(an absent value prints as "-"; user_agent is last because it may contain spaces).

--phone resolves the user through the ``users`` table, so it only works while
the account exists. consent_records has no FK and outlives a hard-deleted
account (decision Q6); for a deleted account, use --user with the user id.
"""
from __future__ import annotations

import argparse
import sys
import uuid

from sqlalchemy.orm import Session

from app.models.consent import ConsentRecord
from app.models.user import User


def trail_rows(db: Session, user_id: uuid.UUID) -> list[ConsentRecord]:
    return (
        db.query(ConsentRecord)
        .filter(ConsentRecord.user_id == user_id)
        .order_by(ConsentRecord.recorded_at, ConsentRecord.id)
        .all()
    )


def format_row(row: ConsentRecord) -> str:
    return " ".join(
        [
            row.recorded_at.isoformat(),
            row.action.value,
            row.document_type.value,
            row.document_version,
            row.purpose_code.value,
            row.surface,
            row.ip_truncated or "-",
            row.device_id or "-",
            row.document_sha256 or "-",
            row.ip_hmac or "-",
            str(row.related_import_id) if row.related_import_id else "-",
            row.related_file_sha256 or "-",
            row.user_agent or "-",
        ]
    )


def _session() -> Session:
    from app.db.session import SessionLocal

    return SessionLocal()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    who = p.add_mutually_exclusive_group(required=True)
    who.add_argument("--user", type=uuid.UUID, help="user id (works after the account is deleted)")
    who.add_argument("--phone", help="+91... phone number (only while the account exists)")
    a = p.parse_args(argv)
    db = _session()
    try:
        user_id = a.user
        if user_id is None:
            user = db.query(User).filter_by(phone_number=a.phone).first()
            if user is None:
                print(f"No user with phone {a.phone} (a deleted account can only be looked up by --user).",
                      file=sys.stderr)
                return 1
            user_id = user.id
        for row in trail_rows(db, user_id):
            print(format_row(row))
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
