import asyncio
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def commit_off_loop(db: Session) -> None:
    """`db.commit()` off the event loop -- a slow commit (WSL DrvFs fsync
    stalls, lock contention) run inline inside an `async def` route blocks
    every other in-flight request on this single-worker process, not just
    the caller (session.md Still-open item 7, root-caused live: 60s+ stalls).
    Only call this from code reachable via an `async def` route; a `def`
    route is already run in Starlette's own threadpool, so wrapping its
    commit here would just add a second, redundant thread hop.

    ponytail: asyncio.to_thread shares asyncio's bounded default executor.
    Many slow commits at once queue on a thread instead of freezing the
    event loop -- strictly better than today, but the pool has a ceiling.
    Not sized/tuned for that case yet; revisit with a dedicated executor if
    it's ever observed to matter.
    """
    await asyncio.to_thread(db.commit)
