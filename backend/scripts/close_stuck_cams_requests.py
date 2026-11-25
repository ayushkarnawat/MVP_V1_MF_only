"""Count stuck CAMS requests; pass --apply to close them in batches of at most 200."""
import argparse
from contextlib import contextmanager, nullcontext
from datetime import datetime, timezone
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import event, exists, or_, text, update
from sqlalchemy.orm import Session, aliased

from app.db.session import SessionLocal
from app.models.enums import ImportStatus
from app.models.imports import Import


class WriteAttempted(RuntimeError):
    pass


def _sql_tokens(statement: str) -> str:
    tokens: list[str] = []
    i = 0
    while i < len(statement):
        if statement.startswith("--", i):
            i += 2
            while i < len(statement) and statement[i] not in "\r\n":
                i += 1
            tokens.append(" ")
        elif statement.startswith("/*", i):
            i += 2
            while i < len(statement) and not statement.startswith("*/", i):
                i += 1
            if i == len(statement):
                raise WriteAttempted("Dry run refused an unterminated SQL comment.")
            i += 2
            tokens.append(" ")
        elif statement[i] in "'\"`[":
            end = "]" if statement[i] == "[" else statement[i]
            i += 1
            while i < len(statement):
                if statement[i] == end:
                    if end != "]" and i + 1 < len(statement) and statement[i + 1] == end:
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            else:
                raise WriteAttempted("Dry run refused an unterminated SQL quote.")
            tokens.append(" ")
        else:
            tokens.append(statement[i])
            i += 1
    return "".join(tokens)


@contextmanager
def guard(db: Session):
    def no_flush(session, context, instances):
        raise WriteAttempted("Dry run refused an ORM flush. Nothing was committed.")

    def no_write(conn, cursor, statement, parameters, context, executemany):
        tokens = _sql_tokens(statement)
        tokens = re.sub(r"\bFOR\s+(?:NO\s+KEY\s+UPDATE|KEY\s+SHARE|UPDATE|SHARE)\b",
                        " ", tokens, flags=re.IGNORECASE)
        if re.search(r"\b(?:INSERT|UPDATE|DELETE|MERGE|REPLACE|TRUNCATE|DROP|ALTER|CREATE|"
                     r"PRAGMA|ATTACH|DETACH|VACUUM|SET)\b",
                     tokens, flags=re.IGNORECASE):
            raise WriteAttempted("Dry run refused a write statement. Nothing was committed.")

    bind = db.get_bind()
    sqlite_connection = None
    if bind.dialect.name == "postgresql":
        db.execute(text("SET TRANSACTION READ ONLY"))
    elif bind.dialect.name == "sqlite":
        sqlite_connection = db.connection()
        query_only = sqlite_connection.exec_driver_sql("PRAGMA query_only").scalar_one()
        sqlite_connection.exec_driver_sql("PRAGMA query_only = ON")
    event.listen(db, "before_flush", no_flush)
    event.listen(bind, "before_cursor_execute", no_write)
    try:
        yield
    finally:
        event.remove(db, "before_flush", no_flush)
        event.remove(bind, "before_cursor_execute", no_write)
        if sqlite_connection is not None and not sqlite_connection.closed:
            sqlite_connection.exec_driver_sql(f"PRAGMA query_only = {query_only}")


def _later_import():
    confirmed = aliased(Import)
    return exists().where(
        confirmed.household_member_id == Import.household_member_id,
        confirmed.status == ImportStatus.CONFIRMED,
        confirmed.confirmed_at > Import.uploaded_at,
    )


def find_stuck_requests(db: Session, now: datetime) -> list[Import]:
    return db.query(Import).filter(
        Import.status == ImportStatus.WAITING_FOR_USER,
        or_(Import.expires_at < now, _later_import()),
    ).order_by(Import.id).all()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    with SessionLocal() as db:
        with nullcontext() if args.apply else guard(db):
            now = datetime.now(timezone.utc)
            stuck = find_stuck_requests(db, now)
            ids = [row.id for row in stuck]
            past_expiry = sum(row.expires_at is not None and
                              row.expires_at.replace(tzinfo=timezone.utc) < now for row in stuck)
            waiting = db.query(Import).filter(Import.status == ImportStatus.WAITING_FOR_USER)
            later_import = waiting.filter(_later_import()).count()
            total = waiting.count()
            closed = 0
            if args.apply:
                for offset in range(0, len(ids), 200):
                    batch = ids[offset:offset + 200]
                    # The eligibility check and the write must be one atomic statement.
                    result = db.execute(update(Import).where(
                        Import.id.in_(batch),
                        Import.status == ImportStatus.WAITING_FOR_USER,
                        or_(Import.expires_at < now, _later_import()),
                    ).values(status=ImportStatus.EXPIRED).execution_options(synchronize_session=False))
                    closed += result.rowcount
                    db.commit()
            print(f"past_expiry={past_expiry}")
            print(f"later_import={later_import}")
            print(f"closed={closed}" if args.apply else f"would_close={len(ids)}")
            print(f"left_open={total - (closed if args.apply else len(ids))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
