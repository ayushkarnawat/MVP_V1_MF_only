"""Migration 0050 invariants on SQLite and Postgres."""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Column, MetaData, String, Table, Uuid, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.models.auth import HeadChangeRequest
from tests.test_migrations import _a11_migration


def _engine_for(dialect: str):
    if dialect == "sqlite":
        return create_engine("sqlite://")
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL unset; Postgres unavailable")
    return create_engine(url)


def _prior_schema(conn, dialect: str) -> tuple[Table, Table]:
    if dialect == "postgres":
        schema = "head_0050_" + uuid.uuid4().hex
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))

    metadata = MetaData()
    users = Table("users", metadata, Column("id", Uuid, primary_key=True))
    members = Table(
        "household_members",
        metadata,
        Column("id", Uuid, primary_key=True),
        Column("user_id", Uuid, nullable=False),
        Column("relationship", String, nullable=True),
    )
    Table("otp_requests", metadata, Column("id", Uuid, primary_key=True))
    metadata.create_all(conn)
    return users, members


@pytest.mark.parametrize("dialect", ["sqlite", "postgres"])
def test_backfill_leaves_exactly_one_head_per_user_and_it_is_the_self_member(dialect):
    engine = _engine_for(dialect)
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            users, members = _prior_schema(conn, dialect)
            user_with_self = uuid.uuid4()
            user_without_self = uuid.uuid4()
            self_id = uuid.uuid4()
            conn.execute(users.insert(), [{"id": user_with_self}, {"id": user_without_self}])
            conn.execute(
                members.insert(),
                [
                    {"id": self_id, "user_id": user_with_self, "relationship": "self"},
                    {"id": uuid.uuid4(), "user_id": user_with_self, "relationship": "spouse"},
                    {"id": uuid.uuid4(), "user_id": user_without_self, "relationship": "spouse"},
                ],
            )

            migration = _a11_migration("0050")
            with Operations.context(MigrationContext.configure(conn)):
                migration.upgrade()

            heads = conn.execute(
                text("SELECT id, user_id, relationship FROM household_members WHERE is_head")
            ).mappings().all()
            assert len(heads) == 1
            assert str(heads[0]["id"]).replace("-", "") == self_id.hex
            assert str(heads[0]["user_id"]).replace("-", "") == user_with_self.hex
            assert heads[0]["relationship"] == "self"
        finally:
            transaction.rollback()
    engine.dispose()


@pytest.mark.parametrize("dialect", ["sqlite", "postgres"])
def test_second_head_for_the_same_user_is_rejected(dialect):
    engine = _engine_for(dialect)
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            users, members = _prior_schema(conn, dialect)
            user_id = uuid.uuid4()
            self_id, spouse_id = uuid.uuid4(), uuid.uuid4()
            conn.execute(users.insert().values(id=user_id))
            conn.execute(
                members.insert(),
                [
                    {"id": self_id, "user_id": user_id, "relationship": "self"},
                    {"id": spouse_id, "user_id": user_id, "relationship": "spouse"},
                ],
            )
            migration = _a11_migration("0050")
            with Operations.context(MigrationContext.configure(conn)):
                migration.upgrade()

            migrated_members = Table("household_members", MetaData(), autoload_with=conn)
            with pytest.raises(IntegrityError), conn.begin_nested():
                conn.execute(
                    migrated_members.update()
                    .where(migrated_members.c.id == spouse_id)
                    .values(is_head=True)
                )
        finally:
            transaction.rollback()
    engine.dispose()


@pytest.mark.parametrize("dialect", ["sqlite", "postgres"])
def test_second_open_request_for_the_same_user_is_rejected(dialect):
    engine = _engine_for(dialect)
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            users, members = _prior_schema(conn, dialect)
            user_id = uuid.uuid4()
            from_id, to_id = uuid.uuid4(), uuid.uuid4()
            conn.execute(users.insert().values(id=user_id))
            conn.execute(
                members.insert(),
                [
                    {"id": from_id, "user_id": user_id, "relationship": "self"},
                    {"id": to_id, "user_id": user_id, "relationship": "spouse"},
                ],
            )
            migration = _a11_migration("0050")
            with Operations.context(MigrationContext.configure(conn)):
                migration.upgrade()

            requests = HeadChangeRequest.__table__
            values = {
                "user_id": user_id,
                "from_member_id": from_id,
                "to_member_id": to_id,
                "expires_at": datetime(2026, 11, 2, 12, 10, tzinfo=timezone.utc),
            }
            conn.execute(requests.insert().values(id=uuid.uuid4(), status="pending", **values))
            with pytest.raises(IntegrityError), conn.begin_nested():
                conn.execute(requests.insert().values(id=uuid.uuid4(), status="pending", **values))

            conn.execute(
                requests.insert().values(id=uuid.uuid4(), status="completed", **values)
            )
        finally:
            transaction.rollback()
    engine.dispose()


@pytest.mark.parametrize("dialect", ["sqlite", "postgres"])
def test_downgrade_removes_flag_table_and_column(dialect):
    engine = _engine_for(dialect)
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            _prior_schema(conn, dialect)
            migration = _a11_migration("0050")
            with Operations.context(MigrationContext.configure(conn)):
                migration.upgrade()
                migration.downgrade()

            inspector = inspect(conn)
            assert "head_change_requests" not in inspector.get_table_names()
            assert "is_head" not in {column["name"] for column in inspector.get_columns("household_members")}
            assert "purpose" not in {column["name"] for column in inspector.get_columns("otp_requests")}
        finally:
            transaction.rollback()
    engine.dispose()
