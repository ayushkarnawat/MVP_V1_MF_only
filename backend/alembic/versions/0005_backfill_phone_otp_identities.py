"""backfill auth_identities with a phone_otp row for every pre-existing user

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-14

Design Spec §1's Migration note: "existing `users` rows need a one-time
backfill into `auth_identities` — `provider='phone_otp'`,
`provider_subject=users.phone_number`, `identifier_verified_at=users.created_at`
(a verified phone is currently a precondition for a `User` row existing at all,
so `created_at` is an accurate proxy for when that identity was proven)."

Kept as its own revision rather than folded into 0004: 0004 is schema-only DDL
per this repo's convention, and a data migration wants to be independently
reviewable and independently re-runnable.

Why this is load-bearing rather than cosmetic: after 0004, the auth routes
resolve a login by looking up `auth_identities` (not `users.phone_number`). A
pre-existing user with no backfilled identity row therefore reads as brand-new
on their next login, and the route attempts to INSERT a second `User` row with
their already-existing phone number — a `users.phone_number` UNIQUE violation
surfacing as an unhandled 500 on an ordinary login. (There is also a runtime
belt-and-braces guard for the same case in
`app.services.auth.identity.find_or_backfill_phone_identity`; this migration is
the one-time bulk fix, that function is the safety net for rows that arrive
some other way.)

Deliberately no imports from `app.models` — SQLAlchemy Core table literals only,
same convention as 0001, so the migration is pinned to the schema as it existed
at this revision and stays dialect-neutral.
"""
import uuid

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

_PROVIDER_VALUES = ("phone_otp", "email_otp", "google")

# sa.Enum (not sa.String) for `provider` so the bound value is typed the same
# way 0004 declared the column — matters on Postgres, where the column is a
# real ENUM type; harmless on SQLite, where it is a VARCHAR. Values are the
# lowercase `.value` forms, matching app.models.enums.enum_column().
_provider_type = sa.Enum(*_PROVIDER_VALUES, name="authidentityprovider")

_users = sa.table(
    "users",
    sa.column("id", sa.Uuid()),
    sa.column("phone_number", sa.String()),
    sa.column("created_at", sa.DateTime(timezone=True)),
)

_auth_identities = sa.table(
    "auth_identities",
    sa.column("id", sa.Uuid()),
    sa.column("user_id", sa.Uuid()),
    sa.column("provider", _provider_type),
    sa.column("provider_subject", sa.String()),
    sa.column("email", sa.String()),
    sa.column("identifier_verified_at", sa.DateTime(timezone=True)),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("last_used_at", sa.DateTime(timezone=True)),
)


def upgrade() -> None:
    bind = op.get_bind()

    # Re-runnability: skip any phone number that already has a phone_otp
    # identity. Read the existing subjects once up front rather than issuing a
    # NOT EXISTS per row — the whole point of this migration is that the
    # `users` table is small enough to iterate at deploy time, and one SELECT
    # is easier to reason about than a correlated subquery across two dialects.
    already_backfilled = {
        row[0]
        for row in bind.execute(
            sa.select(_auth_identities.c.provider_subject).where(
                _auth_identities.c.provider == "phone_otp"
            )
        )
    }

    rows = bind.execute(
        sa.select(_users.c.id, _users.c.phone_number, _users.c.created_at)
    ).fetchall()

    to_insert = []
    for user_id, phone_number, created_at in rows:
        if not phone_number or phone_number in already_backfilled:
            continue
        already_backfilled.add(phone_number)
        to_insert.append(
            {
                "id": uuid.uuid4(),
                "user_id": user_id,
                "provider": "phone_otp",
                "provider_subject": phone_number,
                # NULL, not users.email: `auth_identities.email` means "this
                # identity's own verified email claim", and a phone identity
                # has none. Writing users.email here would fabricate an
                # independently-verified email and make the §4 collision check
                # auto-link a stranger's later, genuine email signup.
                "email": None,
                "identifier_verified_at": created_at,
                "created_at": created_at,
                "last_used_at": created_at,
            }
        )

    if to_insert:
        op.bulk_insert(_auth_identities, to_insert)


def downgrade() -> None:
    """Deliberate no-op — documented, not an oversight.

    A backfilled row is byte-for-byte indistinguishable from one created by a
    normal phone-first signup after this migration ran: both have
    `provider='phone_otp'`, `provider_subject=<phone>`, `email=NULL`, and all
    three timestamps equal to the user's `created_at` (the signup path derives
    `User.created_at` and `AuthIdentity.identifier_verified_at` from the same
    `now`). So there is no predicate — timestamp-scoped or otherwise — that
    deletes only the rows this migration inserted, and any approximation would
    destroy live credentials for real users. Deleting nothing is strictly safer
    than deleting the wrong thing.

    Leaving the rows in place is also harmless: the only reason to go below
    0005 is to go below 0004, and 0004's own downgrade drops `auth_identities`
    wholesale. Re-upgrading is safe too, since upgrade() skips phone numbers
    that already have a phone_otp identity.
    """
