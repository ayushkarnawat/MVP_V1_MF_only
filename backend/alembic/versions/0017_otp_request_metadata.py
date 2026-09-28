"""otp request metadata

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("otp_requests", sa.Column("ip_address", sa.String(length=45), nullable=True))
    op.add_column("otp_requests", sa.Column("user_agent", sa.Text(), nullable=True))
    op.add_column("otp_requests", sa.Column("device_type", sa.String(), nullable=True))
    op.add_column("otp_requests", sa.Column("os_family", sa.String(), nullable=True))
    op.add_column("otp_requests", sa.Column("os_version", sa.String(), nullable=True))
    op.add_column("otp_requests", sa.Column("browser_family", sa.String(), nullable=True))
    op.add_column("otp_requests", sa.Column("browser_version", sa.String(), nullable=True))
    op.add_column("otp_requests", sa.Column("device_id", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("otp_requests", "device_id")
    op.drop_column("otp_requests", "browser_version")
    op.drop_column("otp_requests", "browser_family")
    op.drop_column("otp_requests", "os_version")
    op.drop_column("otp_requests", "os_family")
    op.drop_column("otp_requests", "device_type")
    op.drop_column("otp_requests", "user_agent")
    op.drop_column("otp_requests", "ip_address")
