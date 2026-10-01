# Member Profile Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If any task is delegated to Codex, the `model-orchestration` skill governs it (handoff doc + adversarial review gate).

**Goal:** Remove the detected-member lock and its unlock popup. A detected member's name and PAN are saved at Confirm imports, encrypted and stored exactly like Self's. Every member's dashboard opens straight away. A "% complete" nudge opens one Complete-profile popup. Relationship, phone and email are saved only when the user presses Save there.

**Architecture:**
- **Confirm imports:** `confirm_people` writes each new detected member's PAN into the same unique, encrypted columns as Self's (`pan_encrypted` + `pan_lookup_hash`, via `encrypt_pan`/`hash_pan`, with `pan_source=cas` and `pan_verified_at`). A PAN that another account already holds can't take the unique index. It is kept, still encrypted, in `detected_pan_*` with the new `pan_conflict='other_account'` flag.
- **Migration `0023`:** drops `details_completed_at`, `lock_reason`, the lock CHECKs and the never-relock trigger.
- **Member reads:** gated only by ownership (404), never 403.
- **Profile save:** one new `PUT /household-members/{id}/profile` replaces `POST …/details` and `PATCH …/{id}`.
- **Completion:** the % is computed from the row on every read (`profile_completion`, `missing_fields`) and never stored.
- **Frontend:** one `CompleteProfileDialog`, a `ProfileNudge`, a `PanConflictBanner` and a `ProfileCompleteSuccess` replace the lock UI on desktop, mobile and Account.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic (SQLite dev/tests, Postgres staging), React 19 + TypeScript + Tailwind 3.4 + Vitest.

**Spec:**
- `Docs/orchestration/member-profile-completion-map.html` (https://claude.ai/artifact/8oEaUu5UDtkP9dptxrroux), v3. Everything under "Decided (1 Oct review)" is binding.
- Background: `Docs/orchestration/cas-member-detection-map.html`. This plan replaces its Part 6 ("unlock per person"), its L1–L9 unlock rules, and I15 ("unlocked is permanent").
- Builds on top of the uncommitted 2026-10-01 consent/onboarding/profile work (`Docs/superpowers/plans/2026-10-01-consent-onboarding-profile.md`). Do not revert any of it.

## Global Constraints

**Process**
- **Never commit.** The user commits manually. Each task ends at "tests green, stop", and there are no `git commit` steps.
- **Run only affected tests.** Never the full suites. Each task lists its test files. **Before the task's final run, grep `backend/tests` or `frontend/src` for every symbol, route path and error code the task changed or removed, and add each matching file to the run.** That grep is part of the task, not optional: a hand-picked list missed cross-file fallout in the last plan. Narrow with `-k` / `-t` while iterating, then run each listed file once in full.
- Backend tests run from `backend/` with the system interpreter: `python3 -m pytest <files> -q`. `backend/.venv` is a Windows venv and doesn't run in WSL.
- Frontend tests run from `frontend/`: `npx vitest run <files>`. Typecheck once per frontend task: `npx tsc -b`.
- `backend/tests/functional_postgres` needs `TEST_DATABASE_URL`. Without it those tests skip, and the task report must say "skipped", never "passed".
- An `async def` route must never call blocking `db.commit()`. Every route this plan adds or changes is a plain `def` (bb5225f).

**PAN storage (user requirement, 1 Oct)**
- **A detected member's PAN uses the same encryption and the same columns as Self's.** That means `encrypt_pan(pan)` → `pan_encrypted` and `hash_pan(pan)` → `pan_lookup_hash` (the global unique index), with `pan_pending_until=NULL`, `pan_source='cas'` and `pan_verified_at=now`.
- **The only exception** is a PAN another Unifolio account already holds. That one goes to `detected_pan_encrypted` / `detected_pan_hash`, still encrypted with `encrypt_pan` / `hash_pan`, and `pan_conflict='other_account'` is set.
- **No PAN reservation at upload for detected members (decision A).** Their PAN is written only at Confirm imports. Self's upload-time pending claim is unchanged.
- A raw PAN never reaches the browser or the logs. The UI only ever shows `pan_masked` (`AB******9F`).

**Migrations**
- This plan's migration is **`0023_member_profile_completion`** (down_revision `0022`). The deferred "drop `users.primary_goal`" migration in `DEFERRED_FEATURES.md` moves from 0023 to **0024**. Task 10 updates that note.

**Copy**
- Curly apostrophe `’` in all UI copy. Popup copy is taken verbatim from the spec's mockups.

**Profile rules (spec, "Decided")**
- **Five fields, 20% each:** name, PAN, relationship, phone, email. The % is computed on every read and never stored.
- **Nothing in the popup is required,** except PAN for a member with no PAN of any kind (Q2).
- **Name is editable** (Q1). A popup edit sets `name_source='user_edited'`. On a later CAS, an edited name follows **exactly the current name rules for CAS-sourced names** (`plan_name_update`): a completely different name gets the existing mismatch "ask" (M8), a longer variant updates (I9), and a shorter or equal variant changes nothing. The only thing `user_edited` changes is that the name is never put through the onboarding/U9 "provisional, replace silently" rule that `user_entered` names get.
- **Self** (Q4): phone and email are read-only in the popup and come from `users`; relationship is always Self; PAN comes from the CAS. Only Self's name can be edited.
- **PAN on another account** (Q3): the dashboard opens with a clearly visible red banner, and every Save that leaves `pan_conflict` set shows a second warning popup. The PAN never counts, so the highest possible % is 80.
- **Exit** always asks "Skip completing {name}’s profile?" (Q5).

## Review Focus

1. **Two locked duplicate rows of one user that share the same detected PAN** (allowed today by the non-unique index). The 0023 backfill must promote only the earliest row per hash into the unique `pan_lookup_hash`, or the migration dies on the unique index. Covered by a Task 1 migration test (`test_0023_backfill_promotes_only_earliest_duplicate`).
2. **The other account releases a conflicting PAN later.** On the next `GET /household-members`, the member's detected PAN is promoted to the real columns and the banner disappears. If the unique index was taken again in between, the GET must not 500. Covered by Task 1 (`test_refresh_promotes_released_conflict_pan`, `test_refresh_survives_lost_race`).
3. **A later CAS for a member whose name was edited in the popup.** It must get the same treatment as a CAS-sourced name today: a mismatch asks (and keeps the edited name unless the user accepts), a longer variant updates, and a shorter variant is kept. Onboarding (`user_entered`) names must still be replaced silently. Covered by Task 4 (`test_user_edited_name_follows_cas_rules`, `test_user_entered_name_still_updates`).
4. **Saving the popup for a member with no PAN and leaving PAN blank.** The response is 422 `pan_required` and nothing is written, not even phone or email. Covered by Task 3 (`test_name_only_member_requires_pan_and_writes_nothing`).
5. **Deleting the last import of a detected member the user has already started filling in** (relationship or phone set). The member must stay; only an untouched detected member is removed. Covered by Task 1 (`test_delete_keeps_detected_member_with_profile_data`) and by the frontend `removed_with_last_import` test in Task 8.

---

## File map

**Backend**
- Modify `backend/app/models/enums.py`: add `MemberPanConflict`; add `MemberNameSource.USER_EDITED`; delete `MemberLockReason` (in Task 2).
- Modify `backend/app/models/user.py`: drop `details_completed_at`, `lock_reason`, `__init__`, `is_locked`, the trigger listeners and two CHECKs; add `pan_conflict` and one CHECK.
- Delete `backend/app/db/member_trigger_sql.py`.
- Create `backend/alembic/versions/0023_member_profile_completion.py`.
- Create `backend/app/services/dashboard/profile_completion.py`: the completion math, `pan_editable`, `removed_with_last_import`.
- Create `backend/app/services/dashboard/member_profile.py`: `MemberProfileRequest`, `save_member_profile`, phone/email normalisers (moved from `member_update.py`).
- Modify `backend/app/services/dashboard/member_details.py`: keep the error classes, `_holder`, `_PAN_RE` and `is_name_only`; replace `refresh_other_account_locks` with `refresh_pan_conflicts`; replace `require_unlocked_member` with `require_member`; delete `complete_member_details` and `MemberDetailsRequest` (Task 3).
- Delete `backend/app/services/dashboard/member_update.py` (Task 3).
- Modify `backend/app/services/dashboard/household_members.py`, `schemas.py`, `member_merge.py`.
- Modify `backend/app/services/import_/pan_claims.py` (`store_detected_pan`, `classify_detected_pan`), `confirm_people.py`, `people_resolution.py`, `service.py`, `schemas.py`, `deletion.py`.
- Modify `backend/app/api/dashboard.py`, `analytics.py`, `cas_imports.py`.

**Frontend** (`frontend/src/`)
- Modify `features/auth/types.ts`, `features/auth/api.ts`.
- Create `features/dashboard/members/ProfileNudge.tsx`, `PanConflictBanner.tsx`, `ProfileCompleteSuccess.tsx`, `CompleteProfileDialog.tsx`, `profileForm.ts`.
- Delete `features/dashboard/members/MemberDetailsDialog.tsx`, `EditMemberDialog.tsx`, `memberDetailsForm.tsx`; `features/import/prompts/AddDetailsFirstDialog.tsx`; `mobile/features/members/LockedMember.tsx` (`memberLabel` moves to `mobile/features/members/memberLabel.ts`).
- Modify `ConfirmLeaveDialog.tsx`, `OtherAccountDialog.tsx`, `MainDashboardFlow.tsx`, `NavigationShell.tsx`, `features/import/PeopleFoundDialog.tsx`, `features/import/prompts/PromptHost.tsx`, `features/import/types.ts`, `features/import/importPrompt.ts`, `features/import/useImportOrchestration.tsx`, `features/import/ImportFlow.tsx`, `features/profile/FamilyMemberCard.tsx`, `features/profile/HouseholdMembersSection.tsx`, `features/profile/historyGroups.ts`, and `mobile/features/{dashboard/MobileDashboardView,holdings/MobileHoldingsView,import/MobileImportView}.tsx`.

---

### Task 1: Schema, migration 0023, response shape, and removing the read gate

Removes the lock from the database and from every read path, and adds the response fields the frontend needs. `MemberLockReason` stays in `enums.py` until Task 2, so the import modules still import cleanly. **Import-flow tests (`test_confirm_people.py`, `test_imports_people_routes.py`, `test_people_resolution.py`, `test_pan_claims.py`, `test_deletion.py`) are Task 2's to fix, except the one deletion test named below. Don't run them in Task 1.** `test_member_details*.py` belong to Task 3.

**Files:**
- Modify: `backend/app/models/enums.py:35-50`
- Modify: `backend/app/models/user.py:46-160`
- Delete: `backend/app/db/member_trigger_sql.py`
- Create: `backend/alembic/versions/0023_member_profile_completion.py`
- Create: `backend/app/services/dashboard/profile_completion.py`
- Modify: `backend/app/services/dashboard/household_members.py:56-115`
- Modify: `backend/app/services/dashboard/schemas.py:16-31`
- Modify: `backend/app/services/dashboard/member_details.py` (`is_name_only`, `refresh_other_account_locks` → `refresh_pan_conflicts`, `require_unlocked_member` → `require_member`)
- Modify: `backend/app/services/dashboard/member_merge.py:52-60`
- Modify: `backend/app/services/import_/deletion.py:100-104`
- Modify: `backend/app/api/dashboard.py` (imports; `list_members`; every `require_unlocked_member` call), `backend/app/api/analytics.py:26,64,106,124`, `backend/app/api/cas_imports.py:17,149,198,252,304`
- Test: `backend/tests/test_migrations.py`, `backend/tests/models/test_member_detection_schema.py`, `backend/tests/services/dashboard/test_profile_completion.py` (new), `backend/tests/api/test_dashboard_routes.py`, `backend/tests/api/test_member_merge_route.py`, `backend/tests/services/dashboard/test_member_merge.py`, `backend/tests/services/dashboard/test_household_members.py`, `backend/tests/services/import_/test_deletion.py` (only `-k detected_member`), `backend/tests/functional_postgres/test_member_detection_postgres.py`, and every analytics/cas-imports test file found by `grep -rl "member_details_required\|403" backend/tests/api`.

**Interfaces:**
- Produces:
  - `MemberPanConflict.OTHER_ACCOUNT = "other_account"`
  - `MemberNameSource.USER_EDITED = "user_edited"`
  - `HouseholdMember.pan_conflict: MemberPanConflict | None`
  - `profile_completion.missing_profile_fields(m, *, account_phone: str | None, account_email: str | None) -> list[str]`, whose items are a subset of `"pan"`, `"relationship"`, `"phone_number"`, `"email"`, in that order
  - `profile_completion.completion_percent(missing: list[str]) -> int`
  - `profile_completion.has_profile_pan(m) -> bool`
  - `profile_completion.pan_editable(m) -> bool`
  - `profile_completion.removed_with_last_import(m) -> bool`
  - `member_details.require_member(db, user_id, member_id) -> HouseholdMember` (404 only)
  - `member_details.refresh_pan_conflicts(db, user_id) -> int`
  - `member_to_response(m, user: User | None = None) -> HouseholdMemberResponse`
  - `HouseholdMemberResponse` fields: `id, name, relationship, relationship_other_label, origin, pan_masked, phone_number, email, name_from_statement, pan_conflict: Literal["other_account"] | None, pan_editable: bool, profile_completion: int, missing_fields: list[str], removed_with_last_import: bool`. `lock_reason`, `details_required` and `pan_on_statement` are removed.

- [ ] **Step 1: Write the failing migration tests**

Append to `backend/tests/test_migrations.py`:

```python
def test_0023_drops_lock_and_promotes_detected_pans(tmp_path, monkeypatch):
    import sqlite3

    db_path = tmp_path / "profile.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0022").returncode == 0
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("INSERT INTO users (id, phone_number, created_at, pending_deletion) VALUES ('u1', '+919800000001', '2026-10-01', 0)")
        rows = [
            # locked, details_needed, statement PAN -> promoted
            ("m1", "Ramesh", "2026-10-01 10:00", "enc-a", "hash-a", "details_needed", "cas"),
            # locked, other account -> stays detected, pan_conflict set
            ("m2", "Vikram", "2026-10-01 10:01", "enc-b", "hash-b", "pan_on_other_account", "cas"),
        ]
        for mid, name, created, enc, h, reason, src in rows:
            conn.execute(
                "INSERT INTO household_members (id, user_id, name, created_at, origin, name_source,"
                " details_completed_at, lock_reason, detected_pan_encrypted, detected_pan_hash, pan_source)"
                " VALUES (?, 'u1', ?, ?, 'cas_detected', 'cas', NULL, ?, ?, ?, ?)",
                (mid, name, created, reason, enc, h, src),
            )
        conn.commit()
    finally:
        conn.close()

    up = _alembic("upgrade", "0023")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(household_members)")}
        assert "details_completed_at" not in cols and "lock_reason" not in cols and "pan_conflict" in cols
        got = {r[0]: r[1:] for r in conn.execute(
            "SELECT id, pan_encrypted, pan_lookup_hash, detected_pan_hash, pan_conflict, pan_verified_at IS NOT NULL"
            " FROM household_members")}
        assert got["m1"] == ("enc-a", "hash-a", None, None, 1)
        assert got["m2"] == (None, None, "hash-b", "other_account", 0)
        triggers = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
        assert "trg_member_never_relock" not in triggers
    finally:
        conn.close()
    down = _alembic("downgrade", "0022")
    assert down.returncode == 0, down.stderr


def test_0023_backfill_promotes_only_earliest_duplicate(tmp_path, monkeypatch):
    import sqlite3

    db_path = tmp_path / "dupes.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0022").returncode == 0
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("INSERT INTO users (id, phone_number, created_at, pending_deletion) VALUES ('u1', '+919800000001', '2026-10-01', 0)")
        for mid, created in (("first", "2026-10-01 09:00"), ("second", "2026-10-01 09:30")):
            conn.execute(
                "INSERT INTO household_members (id, user_id, name, created_at, origin, name_source,"
                " details_completed_at, lock_reason, detected_pan_encrypted, detected_pan_hash, pan_source)"
                " VALUES (?, 'u1', 'Ramesh', ?, 'cas_detected', 'cas', NULL, 'details_needed', 'enc', 'same-hash', 'cas')",
                (mid, created),
            )
        conn.commit()
    finally:
        conn.close()
    up = _alembic("upgrade", "0023")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    try:
        got = {r[0]: (r[1], r[2]) for r in conn.execute(
            "SELECT id, pan_lookup_hash, detected_pan_hash FROM household_members")}
    finally:
        conn.close()
    assert got["first"] == ("same-hash", None)
    assert got["second"] == (None, "same-hash")  # left for a merge; never a unique-index crash
```

Check the `users` insert against the real `users` columns at 0022 (`PRAGMA table_info(users)`), and add any other NOT NULL column with a literal.

- [ ] **Step 2: Run them to make sure they fail**

Run: `python3 -m pytest tests/test_migrations.py -k 0023 -q`
Expected: FAIL. `alembic upgrade 0023` errors because the revision doesn't exist.

- [ ] **Step 3: Enums and model**

In `backend/app/models/enums.py`, add `USER_EDITED = "user_edited"` to `MemberNameSource`. Leave a comment that it means "edited in the Complete profile popup; a later CAS applies the normal CAS name rules (mismatch asks, longer variant updates), never the silent replace used for user_entered". After `MemberLockReason`, add:

```python
class MemberPanConflict(str, enum.Enum):
    # The CAS (or a typed) PAN is held by another Unifolio account, so it
    # can't take the unique pan_lookup_hash here; kept in detected_pan_*.
    OTHER_ACCOUNT = "other_account"
```

Leave `MemberLockReason` in place for now, with the comment `# Removed in Task 2 of the 2026-10-01 profile-completion plan; no column uses it.`

In `backend/app/models/user.py`:
- In `__table_args__`, delete `ck_member_relationship_when_complete` and `ck_member_lock_reason`. Keep `ck_member_other_label`, `ck_member_detected_pan_pair` and the two indexes. Add:
  ```python
  CheckConstraint(
      "pan_conflict IS NULL OR detected_pan_hash IS NOT NULL",
      name="ck_member_pan_conflict_has_pan",
  ),
  ```
- Delete the `details_completed_at` and `lock_reason` columns, `__init__`, `is_locked`, and the three `event.listen(...)` blocks with their comment. Remove the now-unused imports (`event`, `DDL`, `member_trigger_sql`, `MemberLockReason`).
- Change the relationship comment to `# NULL until the user picks one in the Complete profile popup (optional).`
- Replace the `detected_pan_*` comment with: `# Only for a PAN another account holds (pan_conflict set): same encrypt_pan / hash_pan as pan_encrypted, kept off the unique index.`
- Add, after `detected_pan_hash`:
  ```python
  pan_conflict: Mapped[MemberPanConflict | None] = mapped_column(enum_column(MemberPanConflict))
  ```

Delete `backend/app/db/member_trigger_sql.py`. Then confirm nothing else imports it: `grep -rn member_trigger_sql backend/app` must return nothing.

- [ ] **Step 4: Write migration 0023**

Create `backend/alembic/versions/0023_member_profile_completion.py`:

```python
"""Member profile completion: drop the detected-member lock

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-01

Spec: Docs/orchestration/member-profile-completion-map.html. Detected members
are no longer locked: details_completed_at, lock_reason, their CHECKs and
trg_member_never_relock go. A detected PAN moves into the same unique,
encrypted columns as Self's (a column copy: detected_pan_* already hold
encrypt_pan / hash_pan output), except a PAN another account holds, which
stays in detected_pan_* with pan_conflict = 'other_account'.

Backfill (Review Focus 1): ix_member_user_detected_pan_hash is non-unique,
so two locked rows can share a hash; only the earliest per hash is promoted,
and only when no row already holds that hash in pan_lookup_hash. Later
duplicates keep detected_pan_* and can be merged.

Trigger SQL below is a frozen copy for downgrade only (don't import app code).
"""
from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None

_PAN_CONFLICT = sa.Enum("other_account", name="memberpanconflict")
_LOCK_REASON = sa.Enum("details_needed", "pan_on_other_account", name="memberlockreason")

_SQLITE_NEVER_RELOCK = """
CREATE TRIGGER IF NOT EXISTS trg_member_never_relock
BEFORE UPDATE ON household_members
FOR EACH ROW
WHEN OLD.details_completed_at IS NOT NULL
 AND (NEW.details_completed_at IS NULL OR NEW.lock_reason IS NOT NULL)
BEGIN
    SELECT RAISE(ABORT, 'member_already_unlocked');
END
"""
_PG_NEVER_RELOCK_FN = """
CREATE OR REPLACE FUNCTION member_never_relock() RETURNS trigger AS $$
BEGIN
    IF OLD.details_completed_at IS NOT NULL
       AND (NEW.details_completed_at IS NULL OR NEW.lock_reason IS NOT NULL) THEN
        RAISE EXCEPTION 'member_already_unlocked';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
"""
_PG_NEVER_RELOCK_TRIGGER = """
CREATE TRIGGER trg_member_never_relock
BEFORE UPDATE ON household_members
FOR EACH ROW EXECUTE FUNCTION member_never_relock()
"""


def _pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    bind = op.get_bind()
    if _pg():
        _PAN_CONFLICT.create(bind, checkfirst=True)
        # PG 12+: allowed in a transaction; the value isn't used in this one.
        op.execute("ALTER TYPE membernamesource ADD VALUE IF NOT EXISTS 'user_edited'")
        op.execute("DROP TRIGGER IF EXISTS trg_member_never_relock ON household_members")
        op.execute("DROP FUNCTION IF EXISTS member_never_relock()")
    else:
        op.execute("DROP TRIGGER IF EXISTS trg_member_never_relock")

    op.add_column("household_members", sa.Column("pan_conflict", _PAN_CONFLICT, nullable=True))
    cast = "::memberpanconflict" if _pg() else ""
    op.execute(
        f"UPDATE household_members SET pan_conflict = 'other_account'{cast} "
        "WHERE lock_reason = 'pan_on_other_account' AND detected_pan_hash IS NOT NULL"
    )
    src_cast = "::memberpansource" if _pg() else ""
    op.execute(
        "UPDATE household_members SET "
        " pan_encrypted = detected_pan_encrypted,"
        " pan_lookup_hash = detected_pan_hash,"
        " pan_pending_until = NULL,"
        f" pan_source = COALESCE(pan_source, 'cas'{src_cast}),"
        f" pan_verified_at = CASE WHEN COALESCE(pan_source, 'cas'{src_cast}) = 'cas'{src_cast}"
        "   THEN CURRENT_TIMESTAMP ELSE NULL END,"
        " detected_pan_encrypted = NULL,"
        " detected_pan_hash = NULL "
        "WHERE detected_pan_hash IS NOT NULL"
        " AND pan_conflict IS NULL"
        " AND pan_lookup_hash IS NULL"
        " AND NOT EXISTS (SELECT 1 FROM household_members h2"
        "                 WHERE h2.pan_lookup_hash = household_members.detected_pan_hash)"
        " AND id = (SELECT h3.id FROM household_members h3"
        "           WHERE h3.detected_pan_hash = household_members.detected_pan_hash"
        "           ORDER BY h3.created_at, h3.id LIMIT 1)"
    )

    with op.batch_alter_table("household_members") as batch:
        batch.drop_constraint("ck_member_relationship_when_complete", type_="check")
        batch.drop_constraint("ck_member_lock_reason", type_="check")
        batch.drop_column("lock_reason")
        batch.drop_column("details_completed_at")
        batch.create_check_constraint(
            "ck_member_pan_conflict_has_pan", "pan_conflict IS NULL OR detected_pan_hash IS NOT NULL"
        )
    if _pg():
        _LOCK_REASON.drop(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    if _pg():
        _LOCK_REASON.create(bind, checkfirst=True)
    op.add_column("household_members", sa.Column("details_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("household_members", sa.Column("lock_reason", _LOCK_REASON, nullable=True))
    lr_cast = "::memberlockreason" if _pg() else ""
    # Best effort: everyone is unlocked except pan-conflict rows, which go
    # back to the locked pan_on_other_account state they came from.
    op.execute("UPDATE household_members SET details_completed_at = created_at WHERE pan_conflict IS NULL")
    op.execute(
        f"UPDATE household_members SET lock_reason = 'pan_on_other_account'{lr_cast} WHERE pan_conflict IS NOT NULL"
    )
    # A NULL relationship on an unlocked row would break the restored CHECK.
    op.execute(
        "UPDATE household_members SET details_completed_at = NULL, lock_reason = 'details_needed'"
        f"{lr_cast} WHERE relationship IS NULL AND pan_conflict IS NULL"
    )
    ns_cast = "::membernamesource" if _pg() else ""
    op.execute(f"UPDATE household_members SET name_source = 'user_entered'{ns_cast} WHERE name_source = 'user_edited'{ns_cast}")
    with op.batch_alter_table("household_members") as batch:
        batch.drop_constraint("ck_member_pan_conflict_has_pan", type_="check")
        batch.drop_column("pan_conflict")
        batch.create_check_constraint(
            "ck_member_relationship_when_complete", "relationship IS NOT NULL OR details_completed_at IS NULL"
        )
        batch.create_check_constraint(
            "ck_member_lock_reason",
            "(lock_reason IS NULL AND details_completed_at IS NOT NULL)"
            " OR (lock_reason IS NOT NULL AND details_completed_at IS NULL)",
        )
    if _pg():
        _PAN_CONFLICT.drop(bind, checkfirst=True)
        op.execute(_PG_NEVER_RELOCK_FN)
        op.execute(_PG_NEVER_RELOCK_TRIGGER)
    else:
        op.execute(_SQLITE_NEVER_RELOCK)
```

On the downgrade: a row whose relationship is NULL and that was promoted stays promoted, because its PAN is in `pan_lookup_hash`. That is fine under the old schema. Postgres can't drop an enum value, so `user_edited` stays in `membernamesource` after a downgrade, unused.

- [ ] **Step 5: Run the migration tests**

Run: `python3 -m pytest tests/test_migrations.py -k "0023 or 0021 or 0018" -q`
Expected: PASS for the 0023 tests.

Two existing tests may fail:
- `test_0021_…` asserts the trigger survives 0021's rebuild. It upgrades only to 0021, so it should still pass.
- `test_0018_backfills_preexisting_members_as_unlocked` upgrades only to 0018, so it should also still pass.

If either fails, it's because they now run the head schema. Read the failure before changing anything.

- [ ] **Step 6: Write the failing completion and schema tests**

Create `backend/tests/services/dashboard/test_profile_completion.py`:

```python
import uuid
from datetime import datetime, timezone

from app.models.enums import MemberNameSource, MemberOrigin, MemberPanConflict, MemberPanSource, Relationship
from app.models.user import HouseholdMember
from app.services.dashboard.profile_completion import (
    completion_percent, missing_profile_fields, pan_editable, removed_with_last_import,
)


def _m(**kw) -> HouseholdMember:
    base = dict(id=uuid.uuid4(), user_id=uuid.uuid4(), name="Ramesh Sharma",
                created_at=datetime.now(timezone.utc), origin=MemberOrigin.CAS_DETECTED,
                name_source=MemberNameSource.CAS)
    base.update(kw)
    return HouseholdMember(**base)


def test_detected_member_with_cas_pan_starts_at_40():
    m = _m(pan_lookup_hash="h", pan_encrypted="e", pan_source=MemberPanSource.CAS)
    missing = missing_profile_fields(m, account_phone=None, account_email=None)
    assert missing == ["relationship", "phone_number", "email"]
    assert completion_percent(missing) == 40


def test_name_only_member_starts_at_20_and_pan_is_editable():
    m = _m()
    assert completion_percent(missing_profile_fields(m, account_phone=None, account_email=None)) == 20
    assert pan_editable(m) is True


def test_pan_conflict_never_counts_pan_so_max_is_80():
    m = _m(detected_pan_hash="h", detected_pan_encrypted="e", pan_source=MemberPanSource.CAS,
           pan_conflict=MemberPanConflict.OTHER_ACCOUNT, relationship=Relationship.PARENT,
           phone_number="+919800000002", email="r@example.com")
    missing = missing_profile_fields(m, account_phone=None, account_email=None)
    assert missing == ["pan"] and completion_percent(missing) == 80
    assert pan_editable(m) is False  # a CAS PAN is never typed over


def test_self_uses_account_phone_and_email():
    m = _m(relationship=Relationship.SELF, origin=MemberOrigin.ONBOARDING,
           pan_lookup_hash="h", pan_encrypted="e", pan_source=MemberPanSource.CAS)
    assert missing_profile_fields(m, account_phone="+919800000001", account_email="a@example.com") == []
    assert pan_editable(m) is False


def test_removed_with_last_import_only_when_untouched():
    assert removed_with_last_import(_m()) is True
    assert removed_with_last_import(_m(relationship=Relationship.CHILD)) is False
    assert removed_with_last_import(_m(phone_number="+919800000002")) is False
    assert removed_with_last_import(_m(name_source=MemberNameSource.USER_EDITED)) is False
    assert removed_with_last_import(_m(origin=MemberOrigin.MANUAL)) is False
```

In `backend/tests/models/test_member_detection_schema.py`:
- Delete the lock tests: `test_unlocked_member_requires_relationship`, `test_locked_member_requires_lock_reason`, `test_unlocked_member_cannot_be_locked_again`, `test_locked_member_can_be_unlocked_and_then_edited`, `test_omitted_details_completed_at_defaults_to_now_and_member_is_unlocked`.
- Rename `test_locked_detected_member_may_have_no_relationship` to `test_detected_member_may_have_no_relationship`, and drop its `details_completed_at=None` / `lock_reason` kwargs.
- Add:

```python
def test_pan_conflict_requires_detected_pan(db_session, user):
    from sqlalchemy.exc import IntegrityError
    import pytest
    from app.models.enums import MemberPanConflict
    m = HouseholdMember(user_id=user.id, name="Vikram", created_at=datetime.now(timezone.utc),
                        pan_conflict=MemberPanConflict.OTHER_ACCOUNT)
    db_session.add(m)
    with pytest.raises(IntegrityError):
        db_session.flush()
```

Reuse whatever user fixture the file already has; read its top first.

- [ ] **Step 7: Implement `profile_completion.py`**

```python
"""Profile completion for a household member: five fields, 20% each,
computed from the row on every read and never stored (spec "How the % is
counted"). Self's phone and email live on users, so the caller passes them."""

from __future__ import annotations

from app.models.enums import MemberNameSource, MemberOrigin, MemberPanSource, Relationship
from app.models.user import HouseholdMember

PROFILE_FIELD_COUNT = 5  # name (always set), pan, relationship, phone, email


def has_profile_pan(m: HouseholdMember) -> bool:
    # A PAN held by another account never counts: it can't be added here.
    return m.pan_lookup_hash is not None and m.pan_conflict is None


def missing_profile_fields(
    m: HouseholdMember, *, account_phone: str | None, account_email: str | None
) -> list[str]:
    is_self = m.relationship == Relationship.SELF
    missing: list[str] = []
    if not has_profile_pan(m):
        missing.append("pan")
    if m.relationship is None:
        missing.append("relationship")
    if not (account_phone if is_self else m.phone_number):
        missing.append("phone_number")
    if not (account_email if is_self else m.email):
        missing.append("email")
    return missing


def completion_percent(missing: list[str]) -> int:
    return round(100 * (PROFILE_FIELD_COUNT - len(missing)) / PROFILE_FIELD_COUNT)


def pan_editable(m: HouseholdMember) -> bool:
    """Q2: the popup's PAN box is editable only for a non-self member with no
    claimed PAN whose PAN never came from a statement. That covers a member
    with no PAN at all, or one whose typed PAN hit another account (so it
    can be corrected)."""
    return (
        m.relationship != Relationship.SELF
        and m.pan_lookup_hash is None
        and m.pan_source != MemberPanSource.CAS
    )


def removed_with_last_import(m: HouseholdMember) -> bool:
    """M17 without locks: a detected member the user never touched exists
    only because of a statement, so it leaves with its last import. Any
    profile data (relationship, phone, email, an edited name) keeps it."""
    return (
        m.origin == MemberOrigin.CAS_DETECTED
        and m.relationship is None
        and not m.phone_number
        and not m.email
        and m.name_source != MemberNameSource.USER_EDITED
    )
```

- [ ] **Step 8: Response, gate, conflict refresh, merge, deletion**

In `backend/app/services/dashboard/schemas.py`, replace the `HouseholdMemberResponse` body after `origin` with:

```python
    # First two + last two of the PAN (claimed, else the other-account one); never raw.
    pan_masked: str | None = None
    phone_number: str | None = None
    email: str | None = None
    name_from_statement: bool = False
    # Set when this member's PAN is held by another Unifolio account (Q3 banner).
    pan_conflict: Literal["other_account"] | None = None
    # The Complete profile popup's PAN box is a typed field (Q2), not a greyed one.
    pan_editable: bool = False
    profile_completion: int = 0
    missing_fields: list[str] = []
    # Deleting this member's last import also removes them (untouched detected member).
    removed_with_last_import: bool = False
```

Also add `from typing import Literal`, and change the relationship comment to `# NULL until chosen in the Complete profile popup (optional).`

In `household_members.py`:
- In `create_household_member`, delete the `details_completed_at=…` and `lock_reason=None` kwargs.
- Replace `member_to_response` with:

```python
def member_to_response(m: HouseholdMember, user: User | None = None) -> HouseholdMemberResponse:
    encrypted = m.pan_encrypted or m.detected_pan_encrypted
    missing = missing_profile_fields(
        m,
        account_phone=user.phone_number if user is not None else None,
        account_email=user.email if user is not None else None,
    )
    return HouseholdMemberResponse(
        id=str(m.id),
        name=m.name,
        relationship=m.relationship,
        relationship_other_label=m.relationship_other_label,
        origin=m.origin.value,
        pan_masked=mask_pan(decrypt_pan(encrypted)) if encrypted else None,
        phone_number=m.phone_number,
        email=m.email,
        name_from_statement=m.name_source == MemberNameSource.CAS,
        pan_conflict=m.pan_conflict.value if m.pan_conflict else None,
        pan_editable=pan_editable(m),
        profile_completion=completion_percent(missing),
        missing_fields=missing,
        removed_with_last_import=removed_with_last_import(m),
    )
```

Import `User` from `app.models.user` and the four helpers from `profile_completion`. Remove the now-unused `MemberPanSource` import.

In `member_details.py`:
- Change `is_name_only` to the following. A statement PAN now lives in `pan_lookup_hash` with `pan_source=cas`, so the old "no detected hash" test would wrongly call every promoted member name-only.

```python
def is_name_only(member: HouseholdMember) -> bool:
    """F34 provenance: no PAN from a statement (none at all, or one the user
    typed). Such a person can be merged into another member (M11)."""
    return member.pan_source != MemberPanSource.CAS
```

- Replace `refresh_other_account_locks` with:

```python
def refresh_pan_conflicts(db: DbSession, user_id: uuid.UUID) -> int:
    """Lazy (Review Focus 2): once the other account no longer holds a
    conflicting PAN, it moves into this member's unique PAN columns, the
    same storage as any other PAN, and the banner goes."""
    now = datetime.now(timezone.utc)
    rows = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.user_id == user_id, HouseholdMember.pan_conflict.isnot(None))
        .all()
    )
    promoted = 0
    for m in rows:
        held = db.query(HouseholdMember).filter(HouseholdMember.pan_lookup_hash == m.detected_pan_hash).all()
        if any(not is_expired_pending(h, now) for h in held):
            continue
        for stale in held:  # an expired pending claim still occupies the index
            stale.pan_encrypted = stale.pan_lookup_hash = stale.pan_pending_until = None
        m.pan_encrypted, m.pan_lookup_hash = m.detected_pan_encrypted, m.detected_pan_hash
        m.pan_pending_until = None
        m.pan_verified_at = now if m.pan_source == MemberPanSource.CAS else None
        m.detected_pan_encrypted = m.detected_pan_hash = None
        m.pan_conflict = None
        promoted += 1
    if promoted:
        try:
            db.commit()
        except IntegrityError:
            # Someone took the PAN between the read and the commit: keep the
            # conflict for now; the next list call re-checks.
            db.rollback()
            return 0
    return promoted
```

- Replace `require_unlocked_member` with:

```python
def require_member(db: DbSession, user_id: uuid.UUID, member_id: uuid.UUID) -> HouseholdMember:
    """Ownership only. There is no lock any more: every member's
    dashboard opens (profile-completion spec)."""
    member = db.query(HouseholdMember).filter_by(id=member_id, user_id=user_id).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Household member not found.")
    return member
```

In `api/dashboard.py`, `api/analytics.py` and `api/cas_imports.py`, rename every import and call of `require_unlocked_member` to `require_member`. Afterwards, `grep -rn require_unlocked_member backend/app` must return nothing. In `list_members`:

```python
    refresh_pan_conflicts(db, user.id)
    return [member_to_response(m, user) for m in list_household_members(db, user.id)]
```

Pass `user` to `member_to_response` in `create_member`, `submit_member_details` and `patch_household_member` too. Task 3 replaces the last two.

In `member_merge.py`, drop the `or not source.is_locked` line, so the condition becomes `source.id == target.id or not (is_name_only(source) or same_pan) or source.relationship == Relationship.SELF`. Then update the comment above it: `# M11: a source with no statement PAN (or a statement PAN that is the target's) is provably mergeable; there is no lock condition any more.`

In `deletion.py:100-104`, replace the condition with `if member_id in remove_member_ids or removed_with_last_import(member):`, import `removed_with_last_import`, and change the comment to `# An untouched detected member exists only because of a statement (M17).`

- [ ] **Step 9: Update the affected tests**

- **`test_dashboard_routes.py`:**
  - Delete `test_patch_locked_member_is_403_and_flags_reflect_statement_pan`.
  - Replace every assertion on `lock_reason`, `details_required` or `pan_on_statement` with the new fields. For example, a detected member created with a CAS PAN asserts `body["pan_editable"] is False and body["profile_completion"] == 40`.
  - Remove `details_completed_at=None` from fixtures.
- **`test_member_merge_route.py` and `test_member_merge.py`:** drop `details_completed_at=None` / `lock_reason=` kwargs. Any "unlocked source can't merge" test becomes "a source with a statement PAN (`pan_source=CAS`) can't merge".
- **`test_household_members.py`:** add a list-route test `test_list_returns_profile_fields_for_self_using_account_contact`. Self has a PAN, so with the user's account phone and email set it asserts `profile_completion == 100` and `missing_fields == []`.
- **`test_deletion.py`:** add `test_delete_keeps_detected_member_with_profile_data` (Review Focus 5). Create a detected member (`origin=CAS_DETECTED`, `relationship=Relationship.CHILD`) with one import, delete that import, and assert the member still exists. Also add `test_delete_removes_untouched_detected_member`, the same setup with `relationship=None`, which asserts the member is gone. Name both so `-k detected_member` selects them.
- **Refresh tests:** add to `backend/tests/services/dashboard/test_household_members.py`:
  - `test_refresh_promotes_released_conflict_pan`: a member with `pan_conflict=OTHER_ACCOUNT`, `detected_pan_hash=hash_pan(PAN)`, `detected_pan_encrypted=encrypt_pan(PAN)`, `pan_source=CAS`, and no other holder. After `refresh_pan_conflicts`, `pan_lookup_hash == hash_pan(PAN)`, `decrypt_pan(pan_encrypted) == PAN`, `pan_conflict is None` and `detected_pan_hash is None`.
  - `test_refresh_survives_lost_race`: monkeypatch `db.commit` to raise `IntegrityError` once. The call must return 0 and not raise.
- **`functional_postgres/test_member_detection_postgres.py`:** delete the trigger/relock assertions, and replace `details_completed_at` in the SELECT with `pan_conflict::text`.
- **Analytics / cas-imports tests:** run `grep -rln "member_details_required\|require_unlocked" backend/tests`, and change each "locked member → 403" test into "detected member → 200".

- [ ] **Step 10: Run Task 1's tests**

Run (from `backend/`):
```
python3 -m pytest tests/test_migrations.py -k "0023" tests/models/test_member_detection_schema.py tests/services/dashboard/test_profile_completion.py tests/services/dashboard/test_household_members.py tests/api/test_dashboard_routes.py tests/api/test_member_merge_route.py tests/services/dashboard/test_member_merge.py -q
python3 -m pytest tests/services/import_/test_deletion.py -k detected_member -q
```
Also run the analytics and cas-imports files found by the grep in Step 9. Then run `python3 -m pytest tests/functional_postgres/test_member_detection_postgres.py -q`, and report "skipped" if `TEST_DATABASE_URL` is unset.
Expected: all PASS.

---

### Task 2: Confirm imports saves the detected member's real PAN; the import flow loses its lock prompts

**Files:**
- Modify: `backend/app/models/enums.py` (delete `MemberLockReason`)
- Modify: `backend/app/services/import_/pan_claims.py:280-320` (+ new `store_detected_pan`)
- Modify: `backend/app/services/import_/people_resolution.py:23,159-200`
- Modify: `backend/app/services/import_/confirm_people.py:11,30,98-110,244-262,420-462,505-536`
- Modify: `backend/app/services/import_/service.py:252-262,361-366,400-430,445-500,610-622,845-862`
- Modify: `backend/app/services/import_/schemas.py:130`
- Test: `backend/tests/services/import_/test_pan_claims.py`, `test_confirm_people.py`, `test_people_resolution.py`, `test_deletion.py`, `backend/tests/api/test_imports_people_routes.py`, `backend/tests/api/test_imports_routes.py`, plus every file found by `grep -rln "locked_member\|member_details_required\|is_locked\|lock_reason\|details_completed_at" backend/tests`.

**Interfaces:**
- Consumes (Task 1): `HouseholdMember.pan_conflict`, `MemberPanConflict`, `MemberPanSource`, `is_name_only`.
- Produces:
  - `pan_claims.store_detected_pan(db, member, pan: str, *, now: datetime) -> Literal["stored", "other_account"]`. It raises `PanBelongsToOtherMemberError` when another member of the same user holds the PAN.
  - `DetectedPanStatus = Literal["new", "existing_member", "other_account"]` (`"locked_member"` is removed).
  - `PersonStatus` without `"locked_member"`.
  - Import prompt codes without `member_details_required` / `locked_member_only`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/services/import_/test_pan_claims.py`:

```python
def test_store_detected_pan_uses_selfs_encrypted_unique_columns(db_session, user):
    from app.services.import_.crypto import decrypt_pan, hash_pan
    from app.services.import_.pan_claims import store_detected_pan
    m = _member(db_session, user, name="Ramesh Sharma")  # use the file's existing member helper
    result = store_detected_pan(db_session, m, "ABCPS1234K", now=datetime.now(timezone.utc))
    db_session.flush()
    assert result == "stored"
    assert m.pan_encrypted != "ABCPS1234K" and decrypt_pan(m.pan_encrypted) == "ABCPS1234K"
    assert m.pan_lookup_hash == hash_pan("ABCPS1234K")
    assert m.pan_pending_until is None and m.pan_source == MemberPanSource.CAS and m.pan_verified_at is not None
    assert m.detected_pan_hash is None and m.pan_conflict is None


def test_store_detected_pan_held_by_other_account_goes_to_detected_columns(db_session, user, other_user):
    from app.services.import_.crypto import decrypt_pan
    from app.services.import_.pan_claims import store_detected_pan
    _member(db_session, other_user, name="Vikram", pan="ABCPS1234K")  # permanent holder elsewhere
    m = _member(db_session, user, name="Vikram Kapoor")
    assert store_detected_pan(db_session, m, "ABCPS1234K", now=datetime.now(timezone.utc)) == "other_account"
    assert m.pan_lookup_hash is None
    assert decrypt_pan(m.detected_pan_encrypted) == "ABCPS1234K"
    assert m.pan_conflict == MemberPanConflict.OTHER_ACCOUNT and m.pan_source == MemberPanSource.CAS


def test_classify_detected_pan_conflict_member_is_existing_member(db_session, user, other_user):
    from app.services.import_.crypto import encrypt_pan, hash_pan
    from app.services.import_.pan_claims import classify_detected_pan
    _member(db_session, other_user, name="Vikram", pan="ABCPS1234K")
    m = _member(db_session, user, name="Vikram Kapoor")
    m.detected_pan_encrypted = encrypt_pan("ABCPS1234K")
    m.detected_pan_hash = hash_pan("ABCPS1234K")
    m.pan_source = MemberPanSource.CAS
    m.pan_conflict = MemberPanConflict.OTHER_ACCOUNT
    db_session.flush()
    assert classify_detected_pan(db_session, user.id, "ABCPS1234K") == ("existing_member", m.id)
```

If the file has no `other_user` fixture, add one that copies how it builds `user`. Match `_member`'s real signature in the file, and add a `pan=` keyword to it if it lacks one, making a permanent claim via `claim_pan_for_member(..., pending=False)`.

Add to `test_confirm_people.py`, using the file's existing confirm helpers:
- `test_confirm_creates_detected_member_with_real_pan_and_no_lock`. Confirm a two-person CAS (Me plus Ramesh with a PAN), then load Ramesh. Assert `origin == CAS_DETECTED`, `relationship is None`, `decrypt_pan(pan_encrypted) == RAMESH_PAN`, `pan_lookup_hash == hash_pan(RAMESH_PAN)`, `pan_source == CAS` and `pan_conflict is None`.
- `test_confirm_other_account_person_gets_pan_conflict`. The person's PAN is held by another user. Assert `pan_lookup_hash is None`, `pan_conflict == OTHER_ACCOUNT`, and that the detected columns are set.
- `test_confirm_same_person_link_writes_real_pan`. Covers 5B: a name-only member linked through "Yes, same person" gets `pan_lookup_hash` set at Confirm, and **no PAN at all after the upload step alone**. Assert `pan_lookup_hash is None` right after the resolve call, before confirm (decision A).

Add to `test_imports_people_routes.py`:
- `test_parse_for_detected_member_starts_a_review`. This replaces `test_parse_for_locked_member_is_rejected`: parsing for a detected member returns 200 with a session, not the `member_details_required` prompt.

Delete these tests outright, since the behaviour no longer exists:
- `test_parse_for_locked_member_is_rejected`
- `test_parse_locked_member_only`
- `test_acknowledge_locked_member_only_after_unlock_continues`
- `test_5b_unlocked_pan_free_member_yes_claims_the_pan` (replaced by the confirm-time test above)

Rename `test_household_members_lists_locked_detected_member_with_null_relationship` to `…lists_detected_member_with_null_relationship`, and assert `profile_completion == 40` in place of `details_required`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `python3 -m pytest tests/services/import_/test_pan_claims.py -k "store_detected or conflict_member" tests/services/import_/test_confirm_people.py -k "real_pan or pan_conflict or link_writes" -q`
Expected: FAIL. `store_detected_pan` can't be imported, and confirm still sets `details_completed_at`, which no longer exists, so it raises `TypeError`.

- [ ] **Step 3: `pan_claims.py`**

Change `DetectedPanStatus` to `Literal["new", "existing_member", "other_account"]`. In `classify_detected_pan`:
- Rename the local `locked` to `conflict`.
- Return `"existing_member", conflict.id` for it.
- Update the docstring line about locked members to: `…then this account's member whose PAN is held elsewhere (pan_conflict, kept in detected_pan_hash) -- such a member keeps attaching even after another account claimed the same PAN (F7)…`.

Add, after `confirm_pan_claim`:

```python
def store_detected_pan(
    db: Session, member: HouseholdMember, pan: str, *, now: datetime
) -> Literal["stored", "other_account"]:
    """Confirm-time PAN for a CAS-detected member (2026-10-01): the same
    encrypt_pan / hash_pan and the same unique columns as Self's claim, made
    permanent at once (no upload-time reservation, decision A). A PAN
    another account holds can't take the unique index; it is kept, still
    encrypted, in detected_pan_* with pan_conflict set. Flushes nothing --
    the confirm transaction flushes and commits."""
    from app.models.enums import MemberPanConflict  # local: enums imports nothing from here

    pan_hash = hash_pan(pan)
    rows = db.query(HouseholdMember).filter(HouseholdMember.pan_lookup_hash == pan_hash).all()
    live = [r for r in rows if r.id != member.id and not is_expired_pending(r, now)]
    member.pan_source = MemberPanSource.CAS
    if any(r.user_id != member.user_id for r in live):
        member.detected_pan_encrypted = encrypt_pan(pan)
        member.detected_pan_hash = pan_hash
        member.pan_conflict = MemberPanConflict.OTHER_ACCOUNT
        return "other_account"
    if live:
        raise PanBelongsToOtherMemberError(f"This PAN is already on {live[0].name}.")
    for stale in rows:
        if stale.id != member.id:
            _clear_pan(stale)  # an expired pending claim still occupies the unique index
    member.pan_encrypted = encrypt_pan(pan)
    member.pan_lookup_hash = pan_hash
    member.pan_pending_until = None
    member.pan_verified_at = now
    member.detected_pan_encrypted = None
    member.detected_pan_hash = None
    member.pan_conflict = None
    return "stored"
```

If the circular-import guard isn't needed, move `MemberPanConflict` into the module's top `from app.models.enums import …` line. Check by importing at top level and running the tests.

- [ ] **Step 4: `people_resolution.py`**

- `PersonStatus = Literal["me", "new", "existing_member", "other_account"]`.
- `:173`: the status is always `"existing_member"`.
- U13 (`:187`): delete the `if not m.is_locked` condition line and its mention in the comment.

- [ ] **Step 5: `confirm_people.py`**

- In the module docstring (`:11`), replace the `detected_pan_*` sentence with: `New detected members get their PAN at confirm in pan_encrypted / pan_lookup_hash (store_detected_pan), like Self's; only a PAN another account holds goes to detected_pan_* with pan_conflict.`
- Remove the `MemberLockReason` import and the `lock_reason` field of `_PersonWork`. In `_resolve_member`, delete every `lock_reason` assignment and stop passing it to `_PersonWork`. Keep the `other_account` / `plan.status` check that raises `ConfirmInvalidError`.
- Rename the `member_id` comment in `_PersonWork` to `# None -> a new detected member is created`.
- `_member_for`, the new-member branch:

```python
    member = HouseholdMember(
        id=uuid.uuid4(), user_id=user_id,
        name=clean if edited else person.name,
        relationship=None, created_at=now,
        origin=MemberOrigin.CAS_DETECTED,
        # F32: a name typed in the people popup is the user's, not the CAS's.
        name_source=MemberNameSource.USER_ENTERED if edited else MemberNameSource.CAS,
    )
    if person.pan:
        try:
            store_detected_pan(db, member, person.pan, now=now)
        except PanBelongsToOtherMemberError:
            raise ConfirmInvalidError(
                f"{person.name} changed during this review. Upload the statement again."
            ) from None
    db.add(member)
    db.flush()
    return member, True
```

- Replace the two blocks at `:248-262` with:

```python
        if not created and work.person is not None and work.person.pan:
            pan_hash = hash_pan(work.person.pan)
            if has_no_pan(member):
                # Staging-QA fix 5B: a name-only member the user said is this
                # statement's person. Their PAN is saved now, at confirm, the
                # same way as a new detected member's (decision A).
                try:
                    store_detected_pan(db, member, work.person.pan, now=now)
                except PanBelongsToOtherMemberError:
                    raise ConfirmInvalidError(
                        f"{member.name} changed during this review. Upload the statement again."
                    ) from None
            elif pan_hash not in (member.pan_lookup_hash, member.detected_pan_hash):
                # Another tab's confirm gave this member a different PAN after
                # this review was built (final-review M-1).
                raise ConfirmInvalidError(f"{member.name} changed during this review. Upload the statement again.")
```

- In `_apply_name_choice`, make the re-classified fallback use the member-aware rule: `kind = plan.name_update if plan.member_id == member.id else plan_member_name_update(member, person.name)`, and import `plan_member_name_update`. Task 4 extends that rule.
- Import `store_detected_pan` and `PanBelongsToOtherMemberError` from `pan_claims`.
- In `_resolve_member`, change `if status in ("existing_member", "locked_member"):` to `if status == "existing_member":`, and drop the comment's "nothing here ever re-locks anyone (I15)" clause.

A note on the race: if another account claims the PAN between `_resolve_member`'s read and the confirm flush, the flush raises `IntegrityError`. The confirm wrapper (`_confirm`, `:170-185`) rolls back and keeps the session for "Try again". On the retry, `_resolve_member` sees `other_account` and asks the user to upload again. No new handling is needed.

- [ ] **Step 6: `service.py` and `schemas.py`**

- Delete `:259-261` (`if member.is_locked: raise _details_required(member)`), the `_details_required` function, and `next_prompt`'s step 1 (`if target.is_locked: return _details_required(target)`). Renumber the step comments ("1. Add data for M…").
- In `_find_target`, change `if status in ("existing_member", "locked_member") and member_id != target.id:` to `if status == "existing_member" and member_id != target.id:`. Change the docstring's `M.detected_pan_hash` to `M.detected_pan_hash (a pan-conflict member)`.
- Delete the whole-file `locked_member_only` block (`all(status == "locked_member" …)`). Keep the `other_account` check, and change its comment to `# 4. Whole-file check: every fund is another account's.`
- `:619`: the status is `"existing_member"`, and the name update is `plan_member_name_update(member, person.name)` (import it).
- `:850-862`, same-person resolve: always link, so that no PAN is written at upload (decision A):

```python
    member = db.get(HouseholdMember, plan.same_person_member_id)
    if has_no_pan(member):
        # 5B: linked now, PAN saved at confirm (store_detected_pan), never
        # reserved at upload -- the same rule for every non-Self member.
        session.setdefault("same_person_linked", {})[person_key] = member.id
```

  Keep whatever follows for the typed-PAN (`else:`) branch unchanged. Read `:862-890` first so the `if`/`else` structure stays intact, and delete only the `is_locked`/claim branch.
- In `schemas.py:130`, change the literal to `Literal["member_not_in_file", "cross_account_pan_blocked"]`.
- In `enums.py`, delete `MemberLockReason`. Then `grep -rn "MemberLockReason\|is_locked\|lock_reason\|details_completed_at\|locked_member\b" backend/app` must return nothing, apart from comments you deliberately left; remove those too.

- [ ] **Step 7: Update the remaining import tests**

Using the grep from **Files**:
- Drop the `locked=` / `details_completed_at=None` / `lock_reason=` fixture arguments. `_add_member(..., locked=True, detected_pan=X)` in `test_imports_people_routes.py:74` becomes `_add_member(..., detected_pan=X)`, which now stores X through `pan_encrypted`/`pan_lookup_hash` with `pan_source=CAS`. Keep a `conflict=True` option that stores it in the detected columns with `pan_conflict`.
- Replace `"locked_member"` with `"existing_member"`.
- Delete assertions on the removed prompt codes.

- [ ] **Step 8: Run Task 2's tests**

Run: `python3 -m pytest tests/services/import_/test_pan_claims.py tests/services/import_/test_confirm_people.py tests/services/import_/test_people_resolution.py tests/services/import_/test_deletion.py tests/api/test_imports_people_routes.py tests/api/test_imports_routes.py -q`, plus every extra file from the grep.
Expected: all PASS.

---

### Task 3: `PUT /household-members/{id}/profile` replaces unlock and edit

**Files:**
- Create: `backend/app/services/dashboard/member_profile.py`
- Modify: `backend/app/services/dashboard/member_details.py`. Delete `complete_member_details`, `MemberDetailsRequest`, `_validate_relationship`, `_L5_MESSAGE` and `_L9_MESSAGE`. Add `PanRequiredError`. Update the module docstring.
- Delete: `backend/app/services/dashboard/member_update.py`
- Modify: `backend/app/api/dashboard.py:36-43,114-153`
- Test: `backend/tests/services/dashboard/test_member_profile.py` (new), `backend/tests/api/test_member_profile_routes.py` (new). Delete `backend/tests/services/dashboard/test_member_details.py` and `backend/tests/api/test_member_details_routes.py`, after moving their still-valid merge/duplicate cases into the new files as described in Step 1. Also run `grep -rln "/details\|update_member\|MemberUpdateRequest\|complete_member_details\|normalise_indian_phone" backend/tests` and include every hit.

**Interfaces:**
- Consumes (Task 1): `pan_editable`, `member_to_response(m, user)`, `MemberNameSource.USER_EDITED`, `MemberPanConflict`; and `has_no_pan` from `people_resolution`.
- Produces:
  - `MemberProfileRequest(name?, relationship?, relationship_other_label?, phone_number?, email?, pan?)`.
  - `save_member_profile(db, user_id, member_id, body) -> HouseholdMember`.
  - Route `PUT /household-members/{member_id}/profile` → `HouseholdMemberResponse`.
  - Error codes: `member_not_found` (404); `invalid_relationship`, `field_not_editable`, `invalid_pan_format`, `pan_required`, `invalid_name` (422); `pan_belongs_to_other_member` (409, with `details.can_merge`, `other_member_id`, `other_member_name`, `source_fund_count`, `source_pan_label`); `cross_account_pan_blocked` (409, lost race only).
  - A typed PAN held by another account is **not** an error: the response is 200 with `pan_conflict="other_account"`, and the frontend shows the Q3 warning.

- [ ] **Step 1: Write the failing service tests**

Create `backend/tests/services/dashboard/test_member_profile.py`. Reuse fixtures from `test_member_details.py` (`db_session`, `user`, and a member factory), copying them in before that file is deleted.

```python
PAN = "ABCPS1234K"


def test_save_writes_only_sent_fields(db_session, user):
    m = _detected(db_session, user, pan=PAN)  # pan_lookup_hash set, pan_source=CAS
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(relationship="parent"))
    assert saved.relationship == Relationship.PARENT
    assert saved.phone_number is None and saved.email is None


def test_relationship_is_optional_and_phone_email_normalised(db_session, user):
    m = _detected(db_session, user, pan=PAN)
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(
        phone_number="98000 00002", email=" R@Example.com "))
    assert saved.relationship is None
    assert saved.phone_number == "+919800000002" and saved.email == "r@example.com"


def test_name_edit_records_history_and_marks_user_edited(db_session, user):
    m = _detected(db_session, user, pan=PAN, name="Ramesh Sharma")
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(name="Ramesh K Sharma"))
    assert saved.name == "Ramesh K Sharma" and saved.name_source == MemberNameSource.USER_EDITED
    row = db_session.query(HouseholdMemberNameChange).filter_by(household_member_id=m.id).one()
    assert row.reason == NameChangeReason.USER_EDIT and row.import_id is None and row.old_name == "Ramesh Sharma"


def test_unchanged_name_is_not_an_edit(db_session, user):
    m = _detected(db_session, user, pan=PAN, name="Ramesh Sharma")
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(name="ramesh  sharma"))
    assert saved.name_source == MemberNameSource.CAS


def test_cas_pan_cannot_be_sent(db_session, user):
    m = _detected(db_session, user, pan=PAN)
    with pytest.raises(FieldNotEditableError):
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(pan="ABCPS9999K"))


def test_name_only_member_requires_pan_and_writes_nothing(db_session, user):
    m = _detected(db_session, user, pan=None)
    with pytest.raises(PanRequiredError):
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(phone_number="9800000002"))
    db_session.refresh(m)
    assert m.phone_number is None


def test_name_only_member_typed_pan_is_stored_like_selfs(db_session, user):
    m = _detected(db_session, user, pan=None)
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(pan="abcps 1234k"))
    assert decrypt_pan(saved.pan_encrypted) == PAN and saved.pan_lookup_hash == hash_pan(PAN)
    assert saved.pan_source == MemberPanSource.USER_ENTERED and saved.pan_verified_at is None


def test_typed_pan_on_another_account_saves_details_and_flags_conflict(db_session, user, other_user):
    _detected(db_session, other_user, pan=PAN)
    m = _detected(db_session, user, pan=None)
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(pan=PAN, relationship="sibling"))
    assert saved.relationship == Relationship.SIBLING
    assert saved.pan_conflict == MemberPanConflict.OTHER_ACCOUNT and saved.pan_lookup_hash is None
    assert decrypt_pan(saved.detected_pan_encrypted) == PAN


def test_typed_pan_on_own_other_member_offers_merge(db_session, user):
    holder = _detected(db_session, user, pan=PAN, name="Dad")
    m = _detected(db_session, user, pan=None, name="Ramesh")
    with pytest.raises(PanOnOtherMemberError) as exc:
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(pan=PAN))
    assert exc.value.can_merge is True and exc.value.other_member_id == holder.id


def test_conflict_member_saves_other_fields(db_session, user, other_user):
    _detected(db_session, other_user, pan=PAN)
    m = _conflict(db_session, user, pan=PAN)  # detected cols + pan_conflict, pan_source=CAS
    saved = save_member_profile(db_session, user.id, m.id, MemberProfileRequest(email="v@example.com"))
    assert saved.email == "v@example.com" and saved.pan_conflict == MemberPanConflict.OTHER_ACCOUNT


def test_self_can_edit_name_only(db_session, user, self_member):
    save_member_profile(db_session, user.id, self_member.id, MemberProfileRequest(name="Aditi S Sharma"))
    for body in (MemberProfileRequest(phone_number="9800000003"), MemberProfileRequest(relationship="parent"),
                 MemberProfileRequest(pan=PAN)):
        with pytest.raises((FieldNotEditableError, InvalidMemberDetailsError)):
            save_member_profile(db_session, user.id, self_member.id, body)


def test_other_relationship_needs_label(db_session, user):
    m = _detected(db_session, user, pan=PAN)
    with pytest.raises(InvalidMemberDetailsError):
        save_member_profile(db_session, user.id, m.id, MemberProfileRequest(relationship="other"))
```

Write `_detected` and `_conflict` at the top of the file. `_detected` builds `HouseholdMember(origin=CAS_DETECTED, name_source=CAS, relationship=None, ...)`; with a `pan`, it calls `store_detected_pan` and commits. `_conflict` sets the detected columns plus `pan_conflict` and `pan_source=CAS`. Before deleting `test_member_details.py` and `test_member_details_routes.py`, carry over any merge-flow case that is still valid (`merge-into` after a duplicate) into `test_member_profile_routes.py`.

- [ ] **Step 2: Write the failing route tests**

Create `backend/tests/api/test_member_profile_routes.py`. Copy the client and auth-header helpers from the deleted route test file.
- `test_put_profile_returns_new_completion`: a detected member with a CAS PAN; PUT `{relationship: "parent", phone_number: "9800000002"}`. Expect 200, `profile_completion == 80` and `missing_fields == ["email"]`.
- `test_put_profile_reaching_100`: also send an email. Expect `profile_completion == 100`.
- `test_put_profile_pan_required_is_422`: expect `detail.code == "pan_required"`.
- `test_put_profile_other_account_pan_is_200_with_conflict`: expect `pan_conflict == "other_account"`.
- `test_put_profile_duplicate_is_409_with_merge_details`: expect `detail.details.can_merge is True`, then a POST to `/merge-into/{holder}` returns 200.
- `test_put_profile_other_users_member_is_404`.
- `test_old_details_and_patch_routes_are_gone`: POST `/household-members/{id}/details` and PATCH `/household-members/{id}` both return 405 or 404.
- `test_detected_member_reads_are_200`: holdings, SIPs and analytics scope for a detected member with no relationship all return 200, not 403.

- [ ] **Step 3: Run them to make sure they fail**

Run: `python3 -m pytest tests/services/dashboard/test_member_profile.py tests/api/test_member_profile_routes.py -q`
Expected: FAIL with `ModuleNotFoundError: app.services.dashboard.member_profile`.

- [ ] **Step 4: Implement `member_profile.py`**

```python
"""PUT /household-members/{id}/profile: the Complete profile popup's Save
(spec member-profile-completion-map.html). Writes only the fields sent;
nothing is required except a PAN for a member with no PAN of any kind (Q2).
A PAN is stored exactly like Self's: encrypt_pan -> pan_encrypted, hash_pan
-> the unique pan_lookup_hash, unless another account holds it (Q3: kept in
detected_pan_* with pan_conflict, and the response tells the UI to warn)."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.models.enums import MemberNameSource, MemberOrigin, MemberPanConflict, MemberPanSource, NameChangeReason, Relationship
from app.models.folio import Folio
from app.models.member_history import HouseholdMemberNameChange
from app.models.user import HouseholdMember
from app.services.dashboard.member_details import (
    _PAN_RE,
    FieldNotEditableError,
    InvalidMemberDetailsError,
    InvalidPanFormatError,
    MemberNotFoundError,
    PanOnOtherMemberError,
    PanRequiredError,
    _holder,
)
from app.services.dashboard.profile_completion import pan_editable
from app.services.import_.crypto import encrypt_pan, hash_pan, normalize_pan
from app.services.import_.name_match import normalise_name, validate_person_name
from app.services.import_.pan_claims import CROSS_ACCOUNT_PAN_BLOCKED_MESSAGE, CrossAccountPanBlockedError
from app.services.import_.people_resolution import has_no_pan

# Moved from member_update.py. The auth layer has no phone normaliser and
# email-validator isn't installed; contact details are unverified (Q8).
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_IN_MOBILE_RE = re.compile(r"^[6-9][0-9]{9}$")


class MemberProfileRequest(BaseModel):
    name: str | None = None
    relationship: Relationship | None = None
    relationship_other_label: str | None = None
    phone_number: str | None = None
    email: str | None = None
    pan: str | None = None


def normalise_indian_phone(raw: str) -> str:
    digits = re.sub(r"[\s\-()]", "", raw)
    if digits.startswith("+91"):
        digits = digits[3:]
    elif digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if not _IN_MOBILE_RE.match(digits):
        raise InvalidMemberDetailsError("Enter a valid 10-digit Indian mobile number.")
    return f"+91{digits}"


def _clean_email(raw: str) -> str:
    email = raw.strip().lower()
    if not _EMAIL_RE.match(email):
        raise InvalidMemberDetailsError("Enter a valid email address.")
    return email


def save_member_profile(
    db: DbSession, user_id: uuid.UUID, member_id: uuid.UUID, body: MemberProfileRequest
) -> HouseholdMember:
    member = db.query(HouseholdMember).filter_by(id=member_id, user_id=user_id).first()
    if member is None:
        raise MemberNotFoundError()
    sent = body.model_fields_set
    is_self = member.relationship == Relationship.SELF
    if is_self:
        if sent & {"relationship", "relationship_other_label"}:
            raise InvalidMemberDetailsError("Your own relationship can’t be changed.")
        if sent & {"phone_number", "email"}:
            raise FieldNotEditableError("Change your phone or email from Account Info.")

    # ---- validate everything first: a 422 writes nothing (Review Focus 4)
    new_name: str | None = None
    if "name" in sent and body.name is not None:
        clean = validate_person_name(body.name)  # InvalidPersonNameError -> 422 invalid_name
        if normalise_name(clean) != normalise_name(member.name):
            new_name = clean

    relationship_change: tuple[Relationship | None, str | None] | None = None
    if "relationship" in sent and not is_self:
        label: str | None = None
        if body.relationship == Relationship.SELF:
            raise InvalidMemberDetailsError("Choose how this person is related to you.")
        if body.relationship == Relationship.OTHER:
            label = (body.relationship_other_label or "").strip()
            if not label:
                raise InvalidMemberDetailsError("Tell us how this person is related to you.")
        relationship_change = (body.relationship, label)

    phone = email = None
    if "phone_number" in sent:
        raw = (body.phone_number or "").strip()
        phone = normalise_indian_phone(raw) if raw else ""
    if "email" in sent:
        raw = (body.email or "").strip()
        email = _clean_email(raw) if raw else ""

    pan: str | None = None
    raw_pan = (body.pan or "").strip()
    if pan_editable(member):
        if raw_pan:
            pan = normalize_pan(raw_pan)
            if not _PAN_RE.match(pan):
                raise InvalidPanFormatError()
        elif has_no_pan(member):
            raise PanRequiredError(f"Enter {member.name}’s PAN.")
    elif raw_pan:
        raise FieldNotEditableError("This PAN comes from your statement and can’t be changed.")

    now = datetime.now(timezone.utc)
    holder = None
    if pan is not None:
        pan_hash = hash_pan(pan)
        holder = _holder(db, pan_hash, member.id, now)
        if holder is not None and holder.user_id == user_id:
            fund_count = db.query(Folio).filter(Folio.household_member_id == member.id).count()
            raise PanOnOtherMemberError(
                holder.id, holder.name,
                # Same rule as merge_member_into: only a detected member can be merged away.
                can_merge=member.origin == MemberOrigin.CAS_DETECTED,
                source_member_name=member.name, source_fund_count=fund_count,
                source_pan_label="PAN not on statement",
            )

    # ---- writes
    if new_name is not None:
        db.add(HouseholdMemberNameChange(
            id=uuid.uuid4(), household_member_id=member.id, old_name=member.name, new_name=new_name,
            reason=NameChangeReason.USER_EDIT, import_id=None, changed_at=now,
        ))
        member.name = new_name
        member.name_source = MemberNameSource.USER_EDITED  # a later CAS asks first (Q1)
        member.name_updated_at = now
    if relationship_change is not None:
        member.relationship, member.relationship_other_label = relationship_change
    if phone is not None:
        member.phone_number = phone or None
    if email is not None:
        member.email = email or None
    if pan is not None:
        member.pan_source = MemberPanSource.USER_ENTERED
        member.pan_verified_at = None
        if holder is not None:
            # Q3: another account holds it. Keep it (encrypted) for the banner
            # and for refresh_pan_conflicts; the rest of the profile is saved.
            member.detected_pan_encrypted = encrypt_pan(pan)
            member.detected_pan_hash = pan_hash
            member.pan_conflict = MemberPanConflict.OTHER_ACCOUNT
        else:
            member.pan_encrypted = encrypt_pan(pan)
            member.pan_lookup_hash = pan_hash
            member.pan_pending_until = None
            member.detected_pan_encrypted = None
            member.detected_pan_hash = None
            member.pan_conflict = None
    try:
        db.commit()
    except IntegrityError:
        # Lost the unique-PAN race between _holder and commit.
        db.rollback()
        raise CrossAccountPanBlockedError(CROSS_ACCOUNT_PAN_BLOCKED_MESSAGE) from None
    return member
```

In `member_details.py`, add:

```python
class PanRequiredError(MemberDetailsError):
    status_code = 422
    code = "pan_required"
```

Then delete `MemberDetailsRequest`, `_validate_relationship`, `complete_member_details`, `_L5_MESSAGE` and `_L9_MESSAGE`, and change the module docstring to: `Errors and PAN helpers shared by the member profile, merge and read routes, plus refresh_pan_conflicts and require_member.` Remove imports that are now unused. If `people_resolution` turns out to import from `dashboard.*`, a circular import appears: check by running the tests, and if it fails, copy the one-line `has_no_pan` into `profile_completion.py` and import it from there.

Delete `member_update.py`.

In `api/dashboard.py`, replace the `/details` and PATCH routes with:

```python
# Plain `def` (threadpool): commits (bb5225f).
@router.put("/household-members/{member_id}/profile", response_model=HouseholdMemberResponse)
def put_member_profile(
    member_id: uuid.UUID,
    body: MemberProfileRequest,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    try:
        member = save_member_profile(db, user.id, member_id, body)
    except MemberDetailsError as exc:
        detail = {"code": exc.code, "message": exc.message}
        if exc.details:
            detail["details"] = exc.details
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc
    except PanConflictError as exc:
        raise HTTPException(status_code=409, detail={"code": exc.code, "message": exc.message}) from exc
    except InvalidPersonNameError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.code, "message": exc.message}) from exc
    return member_to_response(member, user)
```

Update the imports to match. `grep -rn "member_update\|complete_member_details\|MemberDetailsRequest" backend/app` must then return nothing.

- [ ] **Step 5: Run Task 3's tests**

Run: `python3 -m pytest tests/services/dashboard/test_member_profile.py tests/api/test_member_profile_routes.py tests/api/test_member_merge_route.py tests/api/test_dashboard_routes.py -q`, plus the grep hits from **Files**.
Expected: all PASS.

---

### Task 4: A name edited in the popup follows the current CAS name rules on a later upload

**Files:**
- Modify: `backend/app/services/import_/people_resolution.py:113-122` (`plan_member_name_update`)
- Modify: `backend/app/services/import_/confirm_people.py` (`_apply_name_choice`). Check that `USER_EDITED` doesn't fall into the `USER_ENTERED` auto-replace branch.
- Test: `backend/tests/services/import_/test_people_resolution.py`, `backend/tests/services/import_/test_confirm_people.py`, plus `grep -rln "plan_member_name_update\|USER_ENTERED" backend/tests/services/import_`.

**Interfaces:**
- Consumes: `MemberNameSource.USER_EDITED` (Task 1); `plan_member_name_update` wired into confirm (Task 2).
- Produces: `plan_member_name_update(member, statement) -> "none" | "update" | "ask"`. A `USER_EDITED` member goes through `plan_name_update(member.name, statement)`, the same as a `CAS` member: mismatch → `"ask"`, longer variant → `"update"`, otherwise `"none"`.

- [ ] **Step 1: Write the failing tests**

In `test_people_resolution.py`:

```python
def test_user_edited_name_follows_cas_rules():
    m = HouseholdMember(name="Ramesh Sharma", name_source=MemberNameSource.USER_EDITED)
    assert plan_member_name_update(m, "Suresh Patel") == "ask"               # M8 mismatch
    assert plan_member_name_update(m, "Ramesh Kumar Sharma") == "update"     # I9 longer variant
    assert plan_member_name_update(m, "Ramesh") == "none"                    # shorter variant kept
    assert plan_member_name_update(m, "ramesh  sharma") == "none"


def test_user_entered_name_still_updates():
    m = HouseholdMember(name="Ramesh", name_source=MemberNameSource.USER_ENTERED)
    assert plan_member_name_update(m, "Ramesh Sharma") == "update"
```

In `test_confirm_people.py`:
- `test_confirm_user_edited_name_mismatch_kept_unless_accepted`. A member whose name was edited (`"Ramesh Sharma"`, `USER_EDITED`) appears in a confirm whose statement name is a mismatch (`"Suresh Patel"`). With `accept_name_update` left out, the name is unchanged afterwards. With `accept_name_update=True`, the name becomes the CAS name and `name_source == CAS`.
- `test_confirm_user_edited_name_longer_variant_updates`. The same member and the statement name `"Ramesh Kumar Sharma"`. After confirm, the name is the CAS name with `name_source == CAS`, and a `cas_variant` name-change row exists. This is the same as today for a CAS-sourced name.

- [ ] **Step 2: Run them to make sure they fail**

Run: `python3 -m pytest tests/services/import_/test_people_resolution.py -k "user_edited or user_entered" tests/services/import_/test_confirm_people.py -k user_edited -q`
Expected: these may already PASS, because the current code falls through to `plan_name_update` for any non-`USER_ENTERED` source. That's fine. The tests pin the behaviour, so a later change can't quietly route `USER_EDITED` into the silent-replace branch. If any fails, fix the code in Step 3.

- [ ] **Step 3: Implement**

```python
def plan_member_name_update(member: HouseholdMember, statement: str) -> NameUpdate:
    """2026-10-01 QB/QE: a USER_ENTERED name (onboarding / U9) is provisional
    and confirm always replaces it with the statement's, so the preview says
    "update". Every other name -- CAS-sourced, or USER_EDITED in the Complete
    profile popup (Q1, user ruling 2026-10-01) -- follows the same
    variant/ask/I9 rules: mismatch asks (M8), a longer variant updates (I9)."""
    if member.name_source == MemberNameSource.USER_ENTERED:
        return "update" if normalise_name(statement) != normalise_name(member.name) else "none"
    return plan_name_update(member.name, statement)
```

In `_apply_name_choice`, check that the auto-replace branch tests `== MemberNameSource.USER_ENTERED` only, which it does at `:562`. Its comment gains `(not USER_EDITED: that follows the CAS rules via plan_member_name_update)`. Then check the `me` branch of `plan_people` (`:136-140`): a `USER_EDITED` Self with a permanent PAN goes through `plan_member_name_update` and so follows the same rules. No code change is needed there. Add one Self case to the people-resolution test, `test_user_edited_self_follows_cas_rules`: a mismatch gives `"ask"` and a longer variant gives `"update"`.

- [ ] **Step 4: Run Task 4's tests**

Run: `python3 -m pytest tests/services/import_/test_people_resolution.py tests/services/import_/test_confirm_people.py tests/api/test_imports_people_routes.py -q`
Expected: all PASS.

---

### Task 5: Frontend types, API client, and the three new visual components

**Files:**
- Modify: `frontend/src/features/auth/types.ts:55-86`
- Modify: `frontend/src/features/auth/api.ts:177-200`
- Create: `frontend/src/features/dashboard/members/ProfileNudge.tsx`, `PanConflictBanner.tsx`, `ProfileCompleteSuccess.tsx`
- Test: `frontend/src/features/dashboard/members/profileNudge.test.tsx` (new). Also run every file found by `grep -rln "lock_reason\|details_required\|pan_on_statement\|completeMemberDetails\|updateMember\b\|MemberDetailsBody\|MemberUpdateBody" frontend/src`; those are fixture-only updates in this task.

**Interfaces:**
- Consumes (Task 3): the PUT route and the new response fields.
- Produces:
  - `HouseholdMember` adds `pan_conflict: "other_account" | null; pan_editable: boolean; profile_completion: number; missing_fields: ProfileField[]; removed_with_last_import: boolean`, and drops `lock_reason`, `details_required` and `pan_on_statement`.
  - `type ProfileField = "pan" | "relationship" | "phone_number" | "email"`.
  - `interface MemberProfileBody { name?: string; relationship?: Exclude<Relationship, "self"> | null; relationship_other_label?: string | null; phone_number?: string; email?: string; pan?: string }`.
  - `updateMemberProfile(memberId: string, body: MemberProfileBody): Promise<HouseholdMember>`.
  - `<ProfileNudge member={HouseholdMember} onOpen={() => void} variant?: "header" | "compact" />`, which renders nothing at 100%.
  - `<PanConflictBanner memberName={string} />`.
  - `<ProfileCompleteSuccess isOpen memberName onDone />`.

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/features/dashboard/members/profileNudge.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HouseholdMember } from "../../auth/types";
import { ProfileNudge } from "./ProfileNudge";
import { PanConflictBanner } from "./PanConflictBanner";
import { ProfileCompleteSuccess } from "./ProfileCompleteSuccess";

const member = (over: Partial<HouseholdMember> = {}): HouseholdMember => ({
  id: "m-r", name: "Ramesh Sharma", relationship: null, relationship_other_label: null, origin: "cas_detected",
  pan_masked: "AB******4K", phone_number: null, email: null, name_from_statement: true,
  pan_conflict: null, pan_editable: false, profile_completion: 40,
  missing_fields: ["relationship", "phone_number", "email"], removed_with_last_import: true, ...over,
});

describe("ProfileNudge", () => {
  it("shows the % and opens on click", async () => {
    const onOpen = vi.fn();
    render(<ProfileNudge member={member()} onOpen={onOpen} />);
    const btn = screen.getByRole("button", { name: /40% complete.*finish profile/i });
    await userEvent.click(btn);
    expect(onOpen).toHaveBeenCalled();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
  });
  it("names the last missing field", () => {
    render(<ProfileNudge member={member({ profile_completion: 80, missing_fields: ["email"] })} onOpen={() => {}} />);
    expect(screen.getByRole("button", { name: /80% complete.*add email/i })).toBeInTheDocument();
  });
  it("renders nothing at 100%", () => {
    const { container } = render(<ProfileNudge member={member({ profile_completion: 100, missing_fields: [] })} onOpen={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PanConflictBanner", () => {
  it("is a visible alert", () => {
    render(<PanConflictBanner memberName="Vikram Kapoor" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Vikram Kapoor’s PAN is on another Unifolio account");
  });
});

describe("ProfileCompleteSuccess", () => {
  it("announces completion and returns", async () => {
    const onDone = vi.fn();
    render(<ProfileCompleteSuccess isOpen memberName="Ramesh Sharma" onDone={onDone} />);
    expect(screen.getByText("Ramesh Sharma’s profile is complete")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(onDone).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/features/dashboard/members/profileNudge.test.tsx`
Expected: FAIL. The modules don't exist yet.

- [ ] **Step 3: Implement the types, API and components**

In `types.ts`, edit `HouseholdMember` as described under **Interfaces**. Delete `MemberDetailsBody` and `MemberUpdateBody`, and add `ProfileField` and `MemberProfileBody`. In `api.ts`, delete `completeMemberDetails` and `updateMember`, and add:

```ts
export async function updateMemberProfile(memberId: string, body: MemberProfileBody): Promise<HouseholdMember> {
  const response = await fetch(`${API_BASE}/household-members/${memberId}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  await throwIfError(response);
  invalidateApiCache();
  return response.json();
}
```

Match the exact base-URL constant and helper names that `listHouseholdMembers` uses in the same file.

`ProfileNudge.tsx`:

```tsx
import type { HouseholdMember, ProfileField } from "../../auth/types";

const FIELD_LABEL: Record<ProfileField, string> = {
  pan: "PAN", relationship: "relationship", phone_number: "phone number", email: "email",
};

/** Progress ring + chip (spec mock 1 / 5). The whole chip is the button; at 100% it disappears. */
export function ProfileNudge({ member, onOpen, variant = "header" }: {
  member: HouseholdMember; onOpen: () => void; variant?: "header" | "compact";
}) {
  const pct = member.profile_completion;
  if (pct >= 100) return null;
  const last = member.missing_fields.length === 1 ? member.missing_fields[0] : null;
  // A PAN on another account can't be added here, so never ask for it.
  const ask = last && !(last === "pan" && member.pan_conflict) ? `Add ${FIELD_LABEL[last]}` : "Finish profile";
  const r = 15.9155;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] py-1 pl-1 pr-3 text-xs font-semibold text-[var(--color-ink)] hover:bg-[color-mix(in_srgb,var(--color-warning)_24%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-warning)] cursor-pointer"
    >
      <span role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion"
        className={variant === "compact" ? "h-5 w-5" : "h-7 w-7"}>
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-[var(--color-border)]" />
          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${pct}, 100`} className="stroke-[var(--color-warning)]" />
        </svg>
      </span>
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--color-warning)] opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-warning)]" />
      </span>
      <span>{pct}% complete · {ask}</span>
      <span aria-hidden="true" className="text-[var(--color-warning)] transition-transform group-hover:translate-x-0.5">→</span>
    </button>
  );
}
```

`PanConflictBanner.tsx`. Copy is verbatim from spec mock 7:

```tsx
export function PanConflictBanner({ memberName }: { memberName: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-[var(--color-negative)] bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] px-4 py-3 text-sm text-[var(--color-ink)]">
      <span aria-hidden="true" className="grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--color-negative)] text-xs font-bold text-[var(--color-bg)]">!</span>
      <div>
        <p className="font-semibold">{memberName}’s PAN is on another Unifolio account</p>
        <p className="text-[var(--color-text-secondary)]">You can see their funds here, but their profile can’t be completed on your account. Contact support if this is a mistake.</p>
      </div>
    </div>
  );
}
```

`ProfileCompleteSuccess.tsx`. Build it on `PromptDialog`, with copy from spec mock 6. The ring draws in on open, but only under `motion-safe`. It returns on the button press, or automatically after 2.5 s:

```tsx
import { useEffect } from "react";
import { PRIMARY_BTN } from "../../import/prompts/copy";
import { PromptDialog } from "../../import/prompts/PromptDialog";

export function ProfileCompleteSuccess({ isOpen, memberName, onDone }: { isOpen: boolean; memberName: string; onDone: () => void }) {
  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(onDone, 2500);
    return () => window.clearTimeout(t);
  }, [isOpen, onDone]);
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`${memberName}’s profile is complete`}
      body="Their details are saved and show in Account → Family members."
      onClose={onDone}
      hideClose
      footer={<button type="button" className={PRIMARY_BTN} onClick={onDone}>Back to dashboard</button>}
    >
      <div className="flex flex-col items-center gap-3 py-2">
        <svg viewBox="0 0 36 36" className="h-20 w-20" aria-hidden="true">
          <circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="2.5" className="stroke-[var(--color-accent)] motion-safe:[stroke-dasharray:100] motion-safe:animate-[ring-draw_600ms_ease-out_both]" />
          <path d="M11 18.5l4.5 4.5L25 13.5" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="stroke-[var(--color-accent)]" />
        </svg>
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]">Name · PAN · Relationship · Phone · Email</span>
      </div>
    </PromptDialog>
  );
}
```

Add the `ring-draw` keyframes (`from { stroke-dashoffset: 100 } to { stroke-dashoffset: 0 }`) to `frontend/tailwind.config.js` under `theme.extend.keyframes`, or to `styles/tokens.css`. Check which of the two the codebase already uses for custom keyframes.

Update the fixtures in the grep-listed test files: replace `lock_reason`, `details_required` and `pan_on_statement` with the five new fields. Don't change those files' assertions in this task.

- [ ] **Step 4: Run Task 5's tests**

Run: `npx vitest run src/features/dashboard/members/profileNudge.test.tsx`, plus the grep-listed files that only needed fixture updates. Then run `npx tsc -b`.
Expected: the new tests PASS. `tsc` will still report errors in files Tasks 6–9 rewrite (`MemberDetailsDialog`, `EditMemberDialog`, `memberDetailsForm`, `LockedMember`, `MainDashboardFlow`…). List them in the task report; they are expected until Task 9.

---

### Task 6: `CompleteProfileDialog`, replacing the unlock and edit dialogs

**Files:**
- Create: `frontend/src/features/dashboard/members/profileForm.ts`, `CompleteProfileDialog.tsx`
- Modify: `ConfirmLeaveDialog.tsx`: copy and button labels per spec mock 4.
- Modify: `OtherAccountDialog.tsx`: becomes the post-Save warning (spec mock 8). Drop the `variant` prop.
- Delete: `MemberDetailsDialog.tsx`, `EditMemberDialog.tsx`, `memberDetailsForm.tsx`
- Test: `frontend/src/features/dashboard/members/members.test.tsx`. Rewrite it around `CompleteProfileDialog`, keeping the `PossibleDuplicateDialog` cases.

**Interfaces:**
- Consumes (Task 5): `updateMemberProfile`, `MemberProfileBody`, `HouseholdMember`, `ProfileCompleteSuccess`; `PossibleDuplicateDialog` (unchanged props); `mergeMemberInto`.
- Produces:
  - `<CompleteProfileDialog member={HouseholdMember} accountPhone?={string|null} accountEmail?={string|null} onSaved={(m: HouseholdMember) => void} onMerged={(targetId: string) => void} onClose={() => void} />`. It owns the whole sequence: form → Exit confirm → duplicate/merge → other-account warning → success.
  - `onSaved` fires after every successful Save, with the response.
  - `onClose` fires when the sequence ends: Skip for now, the warning's OK, success Done, or Save below 100%.
  - `profileForm.ts` exports `ProfileValues`, `initialProfileValues(member)`, `validateProfile(values, member): string | null`, `toProfileBody(values, member): MemberProfileBody`, and `saveProfile(member, values): Promise<SaveOutcome>`, where `SaveOutcome = {kind:"ok"; member} | {kind:"error"; message} | {kind:"duplicate"; info: DuplicateInfo}`. `DuplicateInfo` keeps its current shape.

- [ ] **Step 1: Write the failing tests**

Rewrite `members.test.tsx`. Keep the existing `vi.mock("../../auth/api")` style, and use the `member()` fixture from Task 5's test.

```tsx
describe("CompleteProfileDialog", () => {
  it("shows the CAS PAN greyed and read-only, name editable, relationship optional", () => {
    render(<CompleteProfileDialog member={member()} onSaved={vi.fn()} onMerged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Complete Ramesh Sharma’s profile" })).toBeInTheDocument();
    const pan = screen.getByLabelText("PAN");
    expect(pan).toHaveValue("AB******4K");
    expect(pan).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("Relationship")).not.toBeRequired();
  });

  it("Save sends only changed fields and reports the saved member", async () => {
    vi.mocked(updateMemberProfile).mockResolvedValue(member({ relationship: "parent", profile_completion: 60 }));
    const onSaved = vi.fn(); const onClose = vi.fn();
    render(<CompleteProfileDialog member={member()} onSaved={onSaved} onMerged={vi.fn()} onClose={onClose} />);
    await userEvent.selectOptions(screen.getByLabelText("Relationship"), "parent");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateMemberProfile).toHaveBeenCalledWith("m-r", { relationship: "parent", relationship_other_label: null });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled(); // below 100%: straight back to the dashboard
  });

  it("member with no PAN: PAN is a required input and Save is blocked until typed", async () => {
    render(<CompleteProfileDialog member={member({ pan_masked: null, pan_editable: true, profile_completion: 20, missing_fields: ["pan", "relationship", "phone_number", "email"] })}
      onSaved={vi.fn()} onMerged={vi.fn()} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter Ramesh Sharma’s PAN to save.")).toBeInTheDocument();
    expect(updateMemberProfile).not.toHaveBeenCalled();
  });

  it("Exit asks to skip; Keep editing keeps typed values", async () => {
    const onClose = vi.fn();
    render(<CompleteProfileDialog member={member()} onSaved={vi.fn()} onMerged={vi.fn()} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText("Email address"), "r@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Exit" }));
    expect(screen.getByRole("heading", { name: "Skip completing Ramesh Sharma’s profile?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Email address")).toHaveValue("r@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Exit" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("reaching 100% shows the success state", async () => {
    vi.mocked(updateMemberProfile).mockResolvedValue(member({ profile_completion: 100, missing_fields: [] }));
    render(<CompleteProfileDialog member={member({ profile_completion: 80, missing_fields: ["email"] })} onSaved={vi.fn()} onMerged={vi.fn()} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Email address"), "r@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Ramesh Sharma’s profile is complete")).toBeInTheDocument();
  });

  it("a save that leaves pan_conflict set shows the warning popup", async () => {
    vi.mocked(updateMemberProfile).mockResolvedValue(member({ pan_conflict: "other_account" }));
    render(<CompleteProfileDialog member={member({ pan_conflict: "other_account" })} onSaved={vi.fn()} onMerged={vi.fn()} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Phone number"), "9800000002");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Ramesh Sharma’s details are saved" })).toBeInTheDocument();
    expect(screen.getByText("Their profile can’t be completed here")).toBeInTheDocument();
  });

  it("a duplicate PAN offers the merge", async () => {
    vi.mocked(updateMemberProfile).mockRejectedValue(new ApiError(409, { code: "pan_belongs_to_other_member", message: "x",
      details: { can_merge: true, other_member_id: "m-d", other_member_name: "Dad", source_fund_count: 2, source_pan_label: "PAN not on statement" } }));
    vi.mocked(mergeMemberInto).mockResolvedValue({ folios_moved: 2, transactions_dropped: 0 });
    const onMerged = vi.fn();
    render(<CompleteProfileDialog member={member({ pan_masked: null, pan_editable: true })} onSaved={vi.fn()} onMerged={onMerged} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("PAN"), "ABCPS1234K");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(await screen.findByRole("button", { name: /merge/i }));
    expect(onMerged).toHaveBeenCalledWith("m-d");
  });

  it("Self: phone and email are read-only with a link to Account Info", () => {
    render(<CompleteProfileDialog member={member({ relationship: "self" })} accountPhone="+919800000001" accountEmail={null}
      onSaved={vi.fn()} onMerged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Phone number")).toHaveAttribute("readonly");
    expect(screen.queryByLabelText("Relationship")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change in Account Info" })).toBeInTheDocument();
  });
});
```

Check the `ApiError` constructor signature in `lib/apiClient` and match it. Check the merge button's exact label in `PossibleDuplicateDialog`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/features/dashboard/members/members.test.tsx`
Expected: FAIL. `CompleteProfileDialog` doesn't exist.

- [ ] **Step 3: Implement `profileForm.ts`**

```ts
import { ApiError } from "../../../lib/apiClient";
import { updateMemberProfile } from "../../auth/api";
import type { HouseholdMember, MemberProfileBody, Relationship } from "../../auth/types";

export const INVALID_PAN_MESSAGE = "Enter a valid PAN: 5 letters, 4 digits, then 1 letter.";
export const SAVE_FAILED_MESSAGE = "We couldn’t save these details. Try again.";
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
type FormRelationship = Exclude<Relationship, "self">;

export interface ProfileValues { name: string; relationship: FormRelationship | ""; label: string; phone: string; email: string; pan: string }
export interface DuplicateInfo { otherMemberId: string; otherMemberName: string; sourceFundCount: number; sourcePanLabel: string }
export type SaveOutcome =
  | { kind: "ok"; member: HouseholdMember }
  | { kind: "error"; message: string }
  | { kind: "duplicate"; info: DuplicateInfo };

export const normalisePan = (raw: string) => raw.replace(/\s+/g, "").toUpperCase();

export function initialProfileValues(m: HouseholdMember): ProfileValues {
  const rel = m.relationship;
  return {
    name: m.name,
    relationship: rel && rel !== "self" ? rel : "",
    label: m.relationship_other_label ?? "",
    phone: m.phone_number ?? "",
    email: m.email ?? "",
    pan: "",
  };
}

/** Only PAN can be required (Q2), and only for a member with no PAN at all. */
export function validateProfile(v: ProfileValues, m: HouseholdMember): string | null {
  if (!v.name.trim()) return "Enter a name.";
  if (v.relationship === "other" && !v.label.trim()) return "Type how you’re related.";
  if (m.pan_editable) {
    const pan = normalisePan(v.pan);
    if (!pan && !m.pan_masked) return `Enter ${m.name}’s PAN to save.`;
    if (pan && !PAN_RE.test(pan)) return INVALID_PAN_MESSAGE;
  }
  return null;
}

/** Sends only what changed, so a Save writes only what the user entered. */
export function toProfileBody(v: ProfileValues, m: HouseholdMember): MemberProfileBody {
  const body: MemberProfileBody = {};
  const isSelf = m.relationship === "self";
  if (v.name.trim() !== m.name) body.name = v.name.trim();
  if (!isSelf) {
    const rel = v.relationship || null;
    const label = v.relationship === "other" ? v.label.trim() : null;
    if (rel !== (m.relationship ?? null) || label !== (m.relationship_other_label ?? null)) {
      body.relationship = rel;
      body.relationship_other_label = label;
    }
    if (v.phone.trim() !== (m.phone_number ?? "")) body.phone_number = v.phone.trim();
    if (v.email.trim() !== (m.email ?? "")) body.email = v.email.trim();
  }
  if (m.pan_editable && normalisePan(v.pan)) body.pan = normalisePan(v.pan);
  return body;
}

function payloadOf(err: unknown): { code?: string; message?: string; details?: Record<string, unknown> } | null {
  if (!(err instanceof ApiError)) return null;
  const p = err.payload;
  return p && typeof p === "object" ? (p as { code?: string; message?: string; details?: Record<string, unknown> }) : null;
}

export async function saveProfile(m: HouseholdMember, v: ProfileValues): Promise<SaveOutcome> {
  try {
    return { kind: "ok", member: await updateMemberProfile(m.id, toProfileBody(v, m)) };
  } catch (err) {
    const p = payloadOf(err);
    const d = p?.details ?? {};
    switch (p?.code) {
      case "invalid_pan_format":
        return { kind: "error", message: INVALID_PAN_MESSAGE };
      case "pan_required":
      case "invalid_name":
      case "invalid_relationship":
      case "field_not_editable":
        return { kind: "error", message: p.message ?? SAVE_FAILED_MESSAGE };
      case "pan_belongs_to_other_member":
        if (d.can_merge === true) {
          return { kind: "duplicate", info: {
            otherMemberId: String(d.other_member_id), otherMemberName: String(d.other_member_name),
            sourceFundCount: Number(d.source_fund_count ?? 0),
            sourcePanLabel: String(d.source_pan_label ?? "PAN not on statement"),
          } };
        }
        return { kind: "error", message: `This PAN is already on ${String(d.other_member_name ?? "another member")}.` };
      case "cross_account_pan_blocked":
        return { kind: "error", message: "This PAN is already tracked under a different Unifolio account." };
      default:
        return { kind: "error", message: SAVE_FAILED_MESSAGE };
    }
  }
}
```

The test "Save sends only changed fields" expects `{relationship: "parent", relationship_other_label: null}`, which matches `toProfileBody`.

- [ ] **Step 4: Implement `CompleteProfileDialog.tsx`, and update `ConfirmLeaveDialog` and `OtherAccountDialog`**

`CompleteProfileDialog` uses `PromptDialog` as its shell, with `FIELD` input styling copied from the deleted `memberDetailsForm.tsx:120`, `RELATIONSHIP_OPTIONS` from `features/auth/relationships`, and `PRIMARY_BTN` / `SECONDARY_BTN`. Its state is `stage: "form" | "leave" | "duplicate" | "warn" | "success"`, plus `values`, `error`, `submitting`, `duplicate`, `merging`, `mergeError` and `saved`.

Fields, in order (spec mock 3):
- **Name:** `<input id="cp-name">`, labelled "Name", editable. Caption: "From your CAS. You can correct it." when `member.name_from_statement`.
- **PAN:** `id="cp-pan"`, labelled "PAN".
  - When `!member.pan_editable`: `readOnly` with `value={member.pan_masked ?? ""}`, faded styling (`bg-[var(--color-bg)] text-[var(--color-text-secondary)] border-dashed`), a lock icon (`Lock` from lucide-react), and the caption "From your CAS. Can’t be changed."
  - When editable: a typed input with a red `*` in the label and the caption "Your CAS didn’t include {name}’s PAN.". Required only when `!member.pan_masked`.
- **Relationship:** `<select id="cp-rel">`, labelled "Relationship", with the options "Choose…" (value `""`) plus `RELATIONSHIP_OPTIONS`. "Other" reveals the "How are you related?" input. Hidden for Self.
- **Phone number** (`id="cp-phone"`, `type="tel"`, placeholder `+91`) and **Email address** (`id="cp-email"`, `type="email"`). For Self, both are `readOnly` with the values from `accountPhone`/`accountEmail`, followed by `<a href="#account-info">Change in Account Info</a>`. Use the route or anchor that `ProfileView` already uses for Account Info; grep `features/profile` for it.
- **Five-segment progress bar** under the title: `member.profile_completion / 20` segments filled, in the warning colour.
- **Footer:** `Exit` (secondary, opens stage `leave`) and `Save` (primary, `type="submit"`, `form="complete-profile-form"`).

The submit handler:

```tsx
async function submit(e: React.FormEvent) {
  e.preventDefault();
  const invalid = validateProfile(values, member);
  if (invalid) return setError(invalid);
  setSubmitting(true); setError(null);
  const out = await saveProfile(member, values);
  setSubmitting(false);
  if (out.kind === "error") return setError(out.message);
  if (out.kind === "duplicate") { setDuplicate(out.info); return setStage("duplicate"); }
  setSaved(out.member);
  onSaved(out.member);
  if (out.member.pan_conflict) return setStage("warn");           // Q3: always warn
  if (out.member.profile_completion >= 100) return setStage("success");
  onClose();                                                        // below 100%: back to the dashboard
}
```

Stage rendering:
- `leave` → `<ConfirmLeaveDialog isOpen memberName={member.name} onKeepEditing={() => setStage("form")} onSkip={onClose} />`
- `duplicate` → `<PossibleDuplicateDialog …>`. On merge: `await mergeMemberInto(member.id, info.otherMemberId); onMerged(info.otherMemberId)`. "Check the PAN" → `setStage("form")`. Copy the error handling from the deleted `MemberDetailsDialog`.
- `warn` → `<OtherAccountDialog isOpen memberName={member.name} onOk={onClose} />`
- `success` → `<ProfileCompleteSuccess isOpen memberName={saved!.name} onDone={onClose} />`

`ConfirmLeaveDialog`:
- New props: `{ isOpen; memberName; onKeepEditing; onSkip }`.
- Title: `` `Skip completing ${memberName}’s profile?` ``
- Body: `` `Anything you typed won’t be saved. You can finish it any time from the chip next to ${memberName}’s name.` ``
- Buttons: "Skip for now" (secondary, `onSkip`) and "Keep editing" (primary, `onKeepEditing`).

`OtherAccountDialog`:
- New props: `{ isOpen; memberName; onOk }`.
- Title: `` `${memberName}’s details are saved` ``
- Body: a red alert block reading `Their profile can’t be completed here` / `` `${memberName}’s PAN is already tracked under another Unifolio account, so it can’t be added to yours. Their relationship, phone and email are saved.` ``
- One "OK" button.

Delete `MemberDetailsDialog.tsx`, `EditMemberDialog.tsx` and `memberDetailsForm.tsx`. Then `grep -rn "MemberDetailsDialog\|EditMemberDialog\|memberDetailsForm" frontend/src` lists the call sites Tasks 7–9 replace.

- [ ] **Step 5: Run Task 6's tests**

Run: `npx vitest run src/features/dashboard/members/members.test.tsx src/features/dashboard/members/profileNudge.test.tsx`
Expected: PASS. `tsc` errors in call sites are expected until Task 9.

---

### Task 7: Desktop dashboard, analytics and import flow

**Files:**
- Modify: `frontend/src/features/dashboard/MainDashboardFlow.tsx`. Remove the lock logic at `:26`, `:70`, `:122-137`, `:158`, `:230`, `:246-252`, `:280-299` and `:320`; rewrite the nudge row at `:328-339`.
- Modify: `frontend/src/features/dashboard/NavigationShell.tsx:14-21,29,49-55,131,148`
- Modify: `frontend/src/features/import/PeopleFoundDialog.tsx:112`
- Modify: `frontend/src/features/import/prompts/PromptHost.tsx:29,182-205`; delete `prompts/AddDetailsFirstDialog.tsx`
- Modify: `frontend/src/features/import/types.ts:124,127,138`, `importPrompt.ts:5,8`, `useImportOrchestration.tsx:32,77-80,121`, `ImportFlow.tsx:18-19,28`
- Test: `MainDashboardFlow.test.tsx`, `NavigationShell.test.tsx`, `PeopleFoundDialog.test.tsx`, `prompts/prompts.test.tsx`, `importPrompt.test.ts`, `ImportFlow.test.tsx`, plus `grep -rln "renderMemberDetails\|member_details_required\|locked_member\|onLockedMemberSelect\|AddDetailsFirstDialog" frontend/src`.

**Interfaces:**
- Consumes (Tasks 5–6): `ProfileNudge`, `PanConflictBanner`, `CompleteProfileDialog`.
- Produces: `NavigationShell` without the `onLockedMemberSelect` prop; `MemberOption` without `locked` / `lockReason`; `ImportFlow` / `useImportOrchestration` without `renderMemberDetails`; the `HostAction` union without `addDetails`.

- [ ] **Step 1: Write the failing tests**

In `MainDashboardFlow.test.tsx`, replace `describe("locked members")` with `describe("profile completion")`:
- `picking a detected member opens their dashboard`. Selecting "Ramesh Sharma" switches to member view, and no dialog opens.
- `shows the nudge for an incomplete member on dashboard and analytics tabs`. `/40% complete/` is visible on both tabs.
- `clicking the nudge opens Complete profile; saving reloads members`. The heading "Complete Ramesh Sharma’s profile" appears; after Save (mock `updateMemberProfile`), `listHouseholdMembers` has been called again.
- `pan conflict member shows the red banner`. `getByRole("alert")` contains "PAN is on another Unifolio account".
- `a complete member shows Edit profile instead of the nudge`. At `profile_completion: 100` there is a button named "Edit profile", and no `/% complete/`.
- `merge from the profile dialog re-targets selection`. After a merge, the selected member is the target.
- `Add data picker lists every member enabled`. No "Add details first" text appears.

Delete the old lock tests listed in the frontend inventory (`:208`, `:216`, `:222`, `:243`, `:256`, `:294`). In `NavigationShell.test.tsx`, replace the `:104` test with `no member shows a lock icon; every pick calls onMemberChange`. In `PeopleFoundDialog.test.tsx`, drop the `locked_member` person and the "details needed" tag assertion. In `prompts.test.tsx` and `importPrompt.test.ts`, delete the U6 / `locked_member_only` / `member_details_required` tests and code-list entries.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/features/dashboard/MainDashboardFlow.test.tsx -t "profile completion"`
Expected: FAIL. There is no nudge yet, and a lock dialog still opens.

- [ ] **Step 3: Implement**

`MainDashboardFlow.tsx`:
- `toMemberOption` drops `locked` / `lockReason`.
- `firstOpen` becomes `data[0]`. The comment goes; every member opens.
- Delete `handleLockedMemberSelect`, `detailsForId` and the locked `SelectItem` branch with its Lock icon. The Add-data picker becomes a plain select over every member.
- `canEditSelected` becomes `viewMode === "member" && !!selectedRaw`.
- Replace `memberDialogs`' unlock/edit dialogs with one `profileFor` state (`string | null`) rendering:

```tsx
{profileMember && (
  <CompleteProfileDialog
    member={profileMember}
    accountPhone={user?.phone_number ?? null}
    accountEmail={user?.email ?? null}
    onSaved={() => { void refreshMembers(); }}
    onMerged={async (targetId) => { invalidateApiCache(); await refreshMembers(); setSelectedMemberId(targetId); setProfileFor(null); }}
    onClose={() => setProfileFor(null)}
  />
)}
```

  Read how the current file gets the signed-in user's phone and email. `ProfileView` already receives them; reuse the same source.
- Replace the "Edit details" row (`:328-339`) with a row shown on **both** the dashboard and analytics tabs:

```tsx
{canEditSelected && selectedRaw && (
  <div className="-mt-2 mb-3 flex flex-col gap-2">
    {selectedRaw.pan_conflict && <PanConflictBanner memberName={selectedRaw.name} />}
    <div className="flex items-center justify-end gap-2">
      {selectedRaw.profile_completion < 100 ? (
        <ProfileNudge member={selectedRaw} onOpen={() => setProfileFor(selectedRaw.id)} />
      ) : (
        <button type="button" onClick={() => setProfileFor(selectedRaw.id)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)] cursor-pointer">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit profile
        </button>
      )}
    </div>
  </div>
)}
```

- Remove `renderMemberDetails` from the `ImportFlow` props (`:280-299`).

`NavigationShell.tsx`:
- Drop `locked` and `lockReason` from `MemberOption`.
- Drop the `onLockedMemberSelect` prop. `hasLocked` becomes always false, so delete it and the `|| hasLocked`.
- `handleMemberPick` calls `onMemberChange` directly.
- Delete the Lock icon at `:148`.
- Add a small `{m.profile_completion < 100 && <span className="ml-auto text-[11px] text-[var(--color-warning)]">{m.profile_completion}%</span>}` in each `SelectItem` (spec mock 2). To do that, `MemberOption` gains `completion: number`, filled by `toMemberOption`.

`PeopleFoundDialog.tsx:112`: delete the "details needed" tag line.

The import prompts:
- In `PromptHost.tsx`, delete the `locked_member_only` / `member_details_required` case and the `addDetails` `HostAction`. Delete `AddDetailsFirstDialog.tsx`.
- Remove both codes from `types.ts` (`:124`, `:127`, the `AcknowledgeCode` at `:138`) and from `importPrompt.ts`.
- Remove the `renderMemberDetails` prop and the `addDetails` branch from `useImportOrchestration.tsx` and `ImportFlow.tsx`.

- [ ] **Step 4: Run Task 7's tests**

Run: `npx vitest run src/features/dashboard/MainDashboardFlow.test.tsx src/features/dashboard/NavigationShell.test.tsx src/features/import/PeopleFoundDialog.test.tsx src/features/import/prompts/prompts.test.tsx src/features/import/importPrompt.test.ts src/features/import/ImportFlow.test.tsx`, plus the grep hits.
Expected: PASS.

---

### Task 8: Account → Family members

**Files:**
- Modify: `frontend/src/features/profile/FamilyMemberCard.tsx:37-71`
- Modify: `frontend/src/features/profile/HouseholdMembersSection.tsx:42-43,87-130`
- Modify: `frontend/src/features/profile/historyGroups.ts:8-25`
- Test: `HouseholdMembersSection.test.tsx`, `ImportHistorySection.test.tsx`, `historyGroups` tests (`grep -rln "historyGroups\|removalNames" frontend/src`), plus `grep -rln "onCompleteDetails\|Complete details" frontend/src`.

**Interfaces:**
- Consumes: `ProfileNudge` (variant `"compact"`), `CompleteProfileDialog`, `HouseholdMember.removed_with_last_import`.
- Produces: `FamilyMemberCard` props `{ member, accountPhone?, accountEmail?, deleteDisabled, onOpenProfile, onDeleteFunds }`. `onEdit` and `onCompleteDetails` are merged into `onOpenProfile`.

- [ ] **Step 1: Write the failing tests**

In `HouseholdMembersSection.test.tsx`, replace the `:80` and `:103` tests with:
- `each card shows its profile % and opens Complete profile`. Ramesh at 80% shows `/80%/`, and clicking the card's nudge opens "Complete Ramesh Sharma’s profile".
- `a complete card shows Edit profile, which opens the same dialog`.
- `relationship shows for every member, including detected ones once chosen`. A member with relationship `parent` and origin `cas_detected` shows "Parent".
- `Self card shows account phone and email and its own %`.

In the `historyGroups` / `ImportHistorySection` tests:
- `removal names come from removed_with_last_import`. A member with `removed_with_last_import: true` and only rows in the deleted import is listed. The same member with `false` is not.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/features/profile/HouseholdMembersSection.test.tsx src/features/profile/ImportHistorySection.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`FamilyMemberCard.tsx`:
- Delete `locked`. Relationship always renders (it shows "Not set" when null).
- Replace the "Complete details"/"Edit" buttons with:

```tsx
{m.profile_completion < 100
  ? <ProfileNudge member={m} onOpen={onOpenProfile} variant="compact" />
  : <button type="button" onClick={onOpenProfile} className={SECONDARY_BTN}>Edit profile</button>}
```

- The Self card keeps "Change in Account Info" next to phone and email.
- The PAN field shows `pan_masked`, or "Not on your statement" when it's null. When `m.pan_conflict` is set, add the caption "On another Unifolio account".

`HouseholdMembersSection.tsx`:
- Replace the `editing` / `completing` state with `profileFor: string | null`.
- Render one `CompleteProfileDialog` with `onSaved={(saved) => setMembers((ms) => ms.map((x) => (x.id === saved.id ? saved : x)))}`, `onMerged={() => { void load(); onChanged?.(); }}` and `onClose={() => { setProfileFor(null); onChanged?.(); }}`.

`historyGroups.ts`:
- Replace `isLocked` with `const removedWithLastImport = (m: HouseholdMember) => m.removed_with_last_import;`.
- Rename `lockedIds` to `removableIds`.
- Change the doc comment to: `D1 note: the untouched detected people (no relationship, phone, email or edited name) whose only data is in the rows being deleted. They are removed with it (M17).`

- [ ] **Step 4: Run Task 8's tests**

Run: `npx vitest run src/features/profile/HouseholdMembersSection.test.tsx src/features/profile/ImportHistorySection.test.tsx`, plus the grep hits.
Expected: PASS.

---

### Task 9: Mobile

**Files:**
- Create: `frontend/src/mobile/features/members/memberLabel.ts`. Move `memberLabel` here from `LockedMember.tsx:9`, verbatim.
- Delete: `frontend/src/mobile/features/members/LockedMember.tsx`
- Modify: `mobile/features/dashboard/MobileDashboardView.tsx` (`:17-24`, `:99`, `:208-240`, `:349-374`, `:485-510`)
- Modify: `mobile/features/holdings/MobileHoldingsView.tsx` (`:11-15`, `:55`, `:107-134`, `:244`, `:329`)
- Modify: `mobile/features/import/MobileImportView.tsx` (`:20-23`, `:73-88`, `:102`, `:156-165`, `:334-352`, `:452`)
- Test: `MobileDashboardView.test.tsx`, `MobileHoldingsView.test.tsx`, `MobileImportView.test.tsx`, plus `grep -rln "LockedMember\|isMemberLocked\|firstOpenMember\|ADD_DETAILS_FIRST" frontend/src`.

**Interfaces:**
- Consumes: `ProfileNudge`, `PanConflictBanner`, `CompleteProfileDialog`.
- Produces: `memberLabel(m: HouseholdMember): string`, with the same behaviour as before.

- [ ] **Step 1: Write the failing tests**

- In `MobileDashboardView.test.tsx`, replace `describe("locked family members (F39)")` (`:605-640`) with `describe("profile completion (mobile)")`:
  - `picking a detected member loads their data`: the holdings fetch is called with that member's id.
  - `shows the nudge under the member picker and opens Complete profile`.
  - `pan conflict member shows the red banner`.
- In `MobileHoldingsView.test.tsx`, replace `:224` / `:235` with `every member is selectable; no Add details first suffix`.
- In `MobileImportView.test.tsx`, replace `:296` with `detected members are selectable targets`, and `:371` with `a detected defaultMemberId is preselected`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/mobile/features/dashboard/MobileDashboardView.test.tsx src/mobile/features/holdings/MobileHoldingsView.test.tsx src/mobile/features/import/MobileImportView.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- **All three views:** import `memberLabel` from `../members/memberLabel`. Replace `firstOpenMember(data)` with `data[0]` and `isMemberLocked(x)` checks with nothing, so every member is pickable. Delete the `LockedMemberDialogs` usage, the Lock icons and the `ADD_DETAILS_FIRST` suffixes.
- **`MobileDashboardView`:** under each member `Select` (`:349-374` and `:485-510`), when a member (not aggregate) is selected:

```tsx
{selected && (
  <div className="mt-2 flex flex-col gap-2">
    {selected.pan_conflict && <PanConflictBanner memberName={selected.name} />}
    <ProfileNudge member={selected} onOpen={() => setProfileFor(selected.id)} />
  </div>
)}
```

  It renders `CompleteProfileDialog` with `onSaved={() => void reloadMembers()}`, `onMerged={(id) => { void reloadMembers(); setSelectedMemberId(id); setProfileFor(null); }}` and `onClose={() => setProfileFor(null)}`. Get account phone and email the same way the desktop does; if the mobile tree has no user context, pass `null` (Self's phone and email simply show empty and read-only).
- **`MobileImportView`:** delete the `MemberDetailsDialog` render prop (`:73-88`) along with `ImportFlow`'s `renderMemberDetails`, which Task 7 removed.
- **Mobile analytics** is aggregate-only (`MobileRoot.tsx:64` renders `<MobileAnalyticsView />` with no member), so it gets no nudge. Say so in the task report.

- [ ] **Step 4: Run Task 9's tests and the full typecheck**

Run: `npx vitest run src/mobile/features/dashboard/MobileDashboardView.test.tsx src/mobile/features/holdings/MobileHoldingsView.test.tsx src/mobile/features/import/MobileImportView.test.tsx`, plus the grep hits. Then `npx tsc -b`.
Expected: the tests PASS, and `tsc` is clean. Every call site from Tasks 5–8 is now fixed. Also check that `grep -rn "lock_reason\|details_required\|pan_on_statement\|isMemberLocked\|MemberDetailsDialog\|EditMemberDialog" frontend/src` returns nothing.

---

### Task 10: Docs

**Files:**
- Modify: `decisions.md`, `Docs/PRDs/App-Flow-Unifolio.md` (`:33-34`, `:77`, `:119`), `Docs/PRDs/Database-Schema-Unifolio.md` (`:101-110`), `DEFERRED_FEATURES.md:120`, `backend.md`, `database.md`, `log.md`, `session.md`, `Docs/superpowers/plans/2026-09-29-cas-member-detection.md:11`, `Docs/orchestration/cas-member-detection-map.html` (a banner only)
- Test: none (docs).

- [ ] **Step 1:** Add a 2026-10-01 entry to `decisions.md` with these points:
  - The detected-member lock is removed.
  - A detected member's name and PAN are saved at Confirm imports, encrypted and stored like Self's.
  - There is no upload-time PAN reservation for detected members (A).
  - Relationship, phone and email are optional and saved on popup Save.
  - Name is editable (Q1). This **supersedes the morning's "names can't be edited" rule** for the popup. Popup edits are `user_edited`, and a later CAS treats them with the existing name rules (mismatch asks, longer variant updates), the same as a CAS-sourced name.
  - Q2, Q3, Q4 and Q5 as in the spec.
  - Link the artifact.
- [ ] **Step 2: PRDs.**
  - `App-Flow-Unifolio.md`: "unlock on first open" becomes "opens directly; the profile nudge and Complete profile popup".
  - `Database-Schema-Unifolio.md`: remove `details_completed_at` / `lock_reason`; add `pan_conflict` and `name_source='user_edited'`; restate that `detected_pan_*` is only for other-account PANs.
- [ ] **Step 3:** In `DEFERRED_FEATURES.md:120`, change "Migration 0023 — drop `users.primary_goal`" to "Migration 0024", with the reason "0023 shipped member profile completion, 2026-10-01".
- [ ] **Step 4:**
  - `backend.md`: the new route; the removed `/details` and `PATCH` routes; the removed 403 gate and import prompts.
  - `database.md`: migration 0023.
  - `log.md`: append the dated entry.
  - `session.md`: overwrite "Latest".
  - Add a supersession note at the top of `2026-09-29-cas-member-detection.md` and a one-line banner at the top of `cas-member-detection-map.html`: "Part 6 and L1–L9 are replaced by Member Profile Completion Map (2026-10-01)."
- [ ] **Step 5:** Note in `session.md` that `.ua/knowledge-graph.json` is still stale.

---

## Self-review

- **Spec coverage.** Each section of the spec maps to a task:
  - "When data is saved": Task 2 (Confirm) and Task 3 (Save).
  - Flow and screens 1–9:
    - nudge: Task 5 and Task 7
    - dropdown %: Task 7
    - popup and the no-PAN variant: Task 6
    - Exit confirm: Task 6
    - partial save: Task 6 and Task 7
    - success: Task 5 and Task 6
    - conflict banner: Task 5, Task 7 and Task 9
    - post-save warning: Task 6
    - Account cards: Task 8
  - % rules: Task 1.
  - Data written: Tasks 2 and 3.
  - ER / migration: Task 1.
  - Code-changes table: Tasks 1–9.
  - Decided Q1: Task 3 and Task 4. Q2: Task 3 and Task 6. Q3: Tasks 1, 3, 6 and 7. Q4: Task 3 and Task 6. Q5: Task 6. A: Task 2.
  - User requirement "encrypted like Self's": Global Constraints, `store_detected_pan`, and the tests in Task 2 and Task 3 that assert `decrypt_pan(pan_encrypted) == PAN` and `pan_lookup_hash == hash_pan(PAN)`.
- **Spec deviations, flagged for the reviewer:**
  - The ER diagram didn't name the new `MemberNameSource.USER_EDITED` value. It's needed because `user_entered` already means "provisional, replace silently" for onboarding and U9 names, and a popup edit must instead follow the normal CAS name rules.
  - `removed_with_last_import` is a response field the spec didn't list. The frontend's deletion warning needs the same rule as the backend.
  - The migration number is 0023, not 0022, because 0022 is the consent table.
- **Placeholder scan.** Clean. A few steps tell the implementer to match a real helper signature or fixture (`_member`, `ApiError`, how the user's phone and email are passed). Those are verify-against-code instructions, not missing content.
- **Type consistency.** These names are used identically in every task: `missing_profile_fields`, `completion_percent`, `pan_editable`, `removed_with_last_import`, `require_member`, `refresh_pan_conflicts`, `store_detected_pan`, `save_member_profile`, `MemberProfileRequest`, `updateMemberProfile`, `MemberProfileBody`, `ProfileNudge`, `PanConflictBanner`, `ProfileCompleteSuccess` and `CompleteProfileDialog`.
