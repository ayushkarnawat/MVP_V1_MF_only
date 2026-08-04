from sqlalchemy import text

from app.db.session import SessionLocal, engine


def test_engine_connects_and_executes():
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        assert result.scalar() == 1


def test_get_db_yields_working_session():
    from app.db.session import get_db

    gen = get_db()
    db = next(gen)
    try:
        assert db.execute(text("SELECT 1")).scalar() == 1
    finally:
        gen.close()
