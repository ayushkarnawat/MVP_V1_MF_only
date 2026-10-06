# CAS Import Fixes — Phase 4: Folio Key (#4) and Import Links / Safe Delete (#5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If any task is delegated to Codex, the `model-orchestration` skill governs it (handoff doc + adversarial review gate).

**Goal:** One folio row per real folio however the CAS spaces its number, and deleting an import removes only rows no other import contains — then re-applies the opening-balance rule so the remaining statements still add up.

**Architecture:** `folios.folio_key` (whitespace-stripped folio number, the same normalisation `people.folio_key` already uses) replaces `folio_number` in the unique key and in every lookup; migration 0027 merges existing duplicates. A new link table `transaction_imports (transaction_id, transaction_date, import_id)` records every import that contained each row; confirm writes a link for every incoming row, matched or inserted. Delete removes the imports' links, deletes only rows left with no link, re-points `transactions.import_id` (NOT NULL) at a surviving import for the rest, and rebuilds the opening balance from the remaining imports' stored CAS output.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic (composite FK to the partitioned `transactions (id, date)`), casparser JSON in `imports.raw_parser_output`.

**Spec:** `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` #4, #5 ("Decided 5 Oct: link table"). Master index Global Constraints apply.

## Global Constraints

See the master index. Additionally:
- Migration **`0027_folio_key_and_transaction_imports`** (down_revision `0026`).
- Postgres: `transaction_imports` has `FOREIGN KEY (transaction_id, transaction_date) REFERENCES transactions (id, date) ON DELETE CASCADE` (FKs to partitioned tables are supported on Postgres ≥ 12; staging runs 16) and `FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE`. Primary key `(transaction_id, import_id)`; index on `import_id`.
- The migration's folio-key function is a **frozen copy** (`re.sub(r"\s+", "", s)`) — migrations never import app code.
- Duplicate-folio merge in the migration follows `member_merge.merge_member_into`'s rule: identical rows (same `date, amount, units, type, occurrence`) are dropped from the folio being merged away; the others move.

## Review Focus

1. **Delete FY after uploading FY then 20-year.** The 20-year rows (which include the FY period) stay; total units unchanged. Test: `test_delete_shorter_keeps_rows_the_longer_contains` (Task 4).
2. **Delete the 20-year after FY then 20-year.** FY's rows stay, and FY's opening balance comes back (the 20-year upload had removed it). Units equal FY's CAS closing. Test: `test_delete_longer_restores_shorter_opening` (Task 4).
3. **A database with "4400918 / 3" and "4400918/3" folios of the same scheme, each holding some of the same rows.** Migration leaves one folio, no duplicated row, every surviving row still linked to its imports. Test: `test_0027_merges_duplicate_folios_without_duplicate_rows` (Task 1).
4. **Merging a detected member into another** (existing M11 flow) when both hold the same folio spelled differently. One folio afterwards; links of dropped duplicate rows move to the kept row. Test: `test_merge_moves_links_of_dropped_duplicates` (Task 2).
5. **Deleting every import of a member.** No orphan links, folios removed, member removal rules unchanged. Test: `test_delete_member_portfolio_leaves_no_links` (Task 4).

---

## File map

- Modify `backend/app/models/folio.py`; create `backend/app/models/transaction_import.py`; register it in `backend/app/models/__init__.py` (wherever models are imported for `Base.metadata`).
- Create `backend/alembic/versions/0027_folio_key_and_transaction_imports.py`.
- Modify `backend/app/services/import_/confirm_people.py` (folio lookup, links, `_all_rows_exist`).
- Modify `backend/app/services/import_/deletion.py` (`_delete_imports`).
- Create `backend/app/services/import_/opening_restore.py` (rebuild the opening row from stored CAS output).
- Modify `backend/app/services/dashboard/member_merge.py` (folio key, links).
- Modify `backend/app/services/import_/coverage_gap.py` (`create_opening_balance` writes a link).

---

### Task 1: Model + migration 0027 (with duplicate merge and link backfill)

**Files:**
- Modify: `backend/app/models/folio.py`
- Create: `backend/app/models/transaction_import.py`
- Create: `backend/alembic/versions/0027_folio_key_and_transaction_imports.py`
- Test: `backend/tests/test_migrations.py`, `backend/tests/functional_postgres/test_cascade_deletes.py`

**Interfaces:**
- Produces: `Folio.folio_key: str` (NOT NULL); unique `uq_folio_member_scheme_key (household_member_id, scheme_id, folio_key)` (replaces `uq_folio_member_scheme_number`); model

```python
class TransactionImport(Base):
    __tablename__ = "transaction_imports"
    __table_args__ = (
        PrimaryKeyConstraint("transaction_id", "import_id"),
        ForeignKeyConstraint(["transaction_id", "transaction_date"], ["transactions.id", "transactions.date"], ondelete="CASCADE"),
        Index("ix_transaction_imports_import_id", "import_id"),
    )
    transaction_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    transaction_date: Mapped[date_] = mapped_column(nullable=False)
    import_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("imports.id", ondelete="CASCADE"), nullable=False)
```

- [ ] **Step 1: Write the failing migration test:**

```python
def test_0027_merges_duplicate_folios_without_duplicate_rows(tmp_path, monkeypatch):
    import sqlite3
    db_path = tmp_path / "folkey.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0026").returncode == 0
    conn = sqlite3.connect(db_path)
    ts = "2026-09-01 10:00:00.000000"
    conn.execute("INSERT INTO users (id, phone_number, created_at) VALUES ('u1', '+919800002701', ?)", (ts,))
    conn.execute("INSERT INTO household_members (id, user_id, name, relationship, created_at, origin, name_source)"
                 " VALUES ('m1', 'u1', 'A', 'self', ?, 'onboarding', 'user_entered')", (ts,))
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES ('s1', '1', 'X', 'A', 'E')")
    for fid, num in (("fa", "4400918 / 3"), ("fb", "4400918/3")):
        conn.execute("INSERT INTO folios (id, household_member_id, scheme_id, folio_number, plan_type, has_coverage_gap)"
                     " VALUES (?, 'm1', 's1', ?, 'regular', 0)", (fid, num))
    for iid in ("i10", "ifY"):
        conn.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at) VALUES (?, 'm1', 'confirmed', ?)", (iid, ts))
    ins = ("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, origin, occurrence)"
           " VALUES (?, ?, ?, ?, 'purchase_sip', 1000, 10, 100, 'cas_row', 1)")
    conn.execute(ins, ("t1", "2025-05-05", "fa", "i10"))   # 10-year import, old spelling
    conn.execute(ins, ("t2", "2026-05-05", "fa", "i10"))
    conn.execute(ins, ("t3", "2026-05-05", "fb", "ifY"))   # same row as t2, FY import, new spelling
    conn.execute(ins, ("t4", "2026-06-05", "fb", "ifY"))
    conn.commit(); conn.close()

    up = _alembic("upgrade", "0027")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    folios = conn.execute("SELECT id, folio_key FROM folios").fetchall()
    assert len(folios) == 1 and folios[0][1] == "4400918/3"
    kept = folios[0][0]
    rows = conn.execute("SELECT id, date FROM transactions WHERE folio_id = ? ORDER BY date", (kept,)).fetchall()
    assert [r[1] for r in rows] == ["2025-05-05", "2026-05-05", "2026-06-05"]
    links = conn.execute("SELECT transaction_id, import_id FROM transaction_imports").fetchall()
    surviving_may = next(r[0] for r in rows if r[1] == "2026-05-05")
    assert {i for t, i in links if t == surviving_may} == {"i10", "ifY"}   # both imports contain it
    assert len(links) == 4
    conn.close()
    assert _alembic("downgrade", "0026").returncode == 0
```

Postgres (`test_cascade_deletes.py`): deleting a transaction row deletes its `transaction_imports` rows; deleting an import deletes its links.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the model changes and migration:

```python
"""folios.folio_key (+ duplicate merge) and transaction_imports (#4, #5)

Revision ID: 0027
Revises: 0026
"""
import re
import uuid

from alembic import op
import sqlalchemy as sa

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def _key(folio_number: str) -> str:
    # Frozen copy of people.folio_key (2026-10-06): CAMS/KFin print the same
    # folio with and without spaces around "/".
    return re.sub(r"\s+", "", folio_number)


def upgrade() -> None:
    bind = op.get_bind()
    pg = bind.dialect.name == "postgresql"
    op.add_column("folios", sa.Column("folio_key", sa.String(), nullable=True))
    folios = bind.execute(sa.text("SELECT id, household_member_id, scheme_id, folio_number FROM folios")).fetchall()
    groups: dict[tuple, list] = {}
    for fid, member, scheme, number in folios:
        bind.execute(sa.text("UPDATE folios SET folio_key = :k WHERE id = :id"), {"k": _key(number), "id": fid})
        groups.setdefault((member, scheme, _key(number)), []).append(fid)

    op.create_table(
        "transaction_imports",
        sa.Column("transaction_id", sa.Uuid(), nullable=False),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("import_id", sa.Uuid(), sa.ForeignKey("imports.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("transaction_id", "import_id"),
        sa.ForeignKeyConstraint(["transaction_id", "transaction_date"], ["transactions.id", "transactions.date"],
                                ondelete="CASCADE"),
    )
    op.create_index("ix_transaction_imports_import_id", "transaction_imports", ["import_id"])
    # One link per existing row: its first writer (all we know).
    bind.execute(sa.text(
        "INSERT INTO transaction_imports (transaction_id, transaction_date, import_id) "
        "SELECT id, date, import_id FROM transactions"
    ))

    # Merge duplicate folios: keep the one with the most rows; identical rows
    # in the others are dropped after their links move to the kept row.
    ident = "date, amount, units, type, occurrence"
    for fids in groups.values():
        if len(fids) < 2:
            continue
        counts = {f: bind.execute(sa.text("SELECT count(*) FROM transactions WHERE folio_id = :f"), {"f": f}).scalar() for f in fids}
        keep = max(fids, key=lambda f: (counts[f], str(f)))
        for other in fids:
            if other == keep:
                continue
            rows = bind.execute(sa.text(f"SELECT id, {ident} FROM transactions WHERE folio_id = :f"), {"f": other}).fetchall()
            for row in rows:
                twin = bind.execute(sa.text(
                    "SELECT id FROM transactions WHERE folio_id = :k AND date = :d AND amount = :a AND units = :u "
                    "AND type = :t AND occurrence = :o"
                ), {"k": keep, "d": row[1], "a": row[2], "u": row[3], "t": row[4], "o": row[5]}).scalar()
                if twin is None:
                    bind.execute(sa.text("UPDATE transactions SET folio_id = :k WHERE id = :id"), {"k": keep, "id": row[0]})
                    continue
                bind.execute(sa.text(
                    "INSERT INTO transaction_imports (transaction_id, transaction_date, import_id) "
                    "SELECT :twin, transaction_date, import_id FROM transaction_imports ti WHERE ti.transaction_id = :id "
                    "AND NOT EXISTS (SELECT 1 FROM transaction_imports x WHERE x.transaction_id = :twin AND x.import_id = ti.import_id)"
                ), {"twin": twin, "id": row[0]})
                bind.execute(sa.text("DELETE FROM transaction_imports WHERE transaction_id = :id"), {"id": row[0]})
                bind.execute(sa.text("DELETE FROM transactions WHERE id = :id"), {"id": row[0]})
            bind.execute(sa.text("DELETE FROM folios WHERE id = :f"), {"f": other})

    with op.batch_alter_table("folios", recreate="always" if not pg else "auto") as batch:
        batch.alter_column("folio_key", existing_type=sa.String(), nullable=False)
        batch.drop_constraint("uq_folio_member_scheme_number", type_="unique")
        batch.create_unique_constraint("uq_folio_member_scheme_key", ["household_member_id", "scheme_id", "folio_key"])


def downgrade() -> None:
    op.drop_index("ix_transaction_imports_import_id", table_name="transaction_imports")
    op.drop_table("transaction_imports")
    with op.batch_alter_table("folios", recreate="always") as batch:
        batch.drop_constraint("uq_folio_member_scheme_key", type_="unique")
        batch.create_unique_constraint("uq_folio_member_scheme_number", ["household_member_id", "scheme_id", "folio_number"])
        batch.drop_column("folio_key")
```

(Bind-param UUID handling: on SQLite the ids are stored as 32-char hex by `sa.Uuid`; reading them back and passing them unchanged into the next statement round-trips correctly because both go through raw SQL. If a mismatch shows up in the Postgres run, cast with `CAST(:id AS uuid)`.)

- [ ] **Step 4: Run, expect PASS** (`-k 0027`; Postgres cascade tests with `TEST_DATABASE_URL`).

---

### Task 2: Look folios up by key (confirm, merge)

**Files:**
- Modify: `backend/app/services/import_/confirm_people.py` (`_folio_for` from phase 2, `_all_rows_exist`)
- Modify: `backend/app/services/dashboard/member_merge.py:73-100`
- Test: `backend/tests/services/import_/test_confirm_people.py`, `backend/tests/services/dashboard/test_member_merge.py`

**Interfaces:**
- Consumes: `people.folio_key`.
- Produces: new folios are created with `folio_key=folio_key(norm.folio)` and `folio_number=norm.folio` (display text of the first statement); lookups filter on `folio_key`.

- [ ] **Step 1: Write the failing tests:**

```python
def test_same_folio_spelled_two_ways_is_one_folio(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    a = _solo(start=date(2021, 1, 1), rows=[(date(2021, 1, 5), "10", "10")])
    a.schemes[0].folio = a.transactions[0].folio = "1001 / 1"
    _upload(db_session, me, a)
    b = _solo(start=date(2021, 1, 1), rows=[(date(2021, 1, 5), "10", "10"), (date(2021, 2, 5), "10", "20")])
    _upload(db_session, me, b)                    # family_result's own spelling "1001/1"
    assert db_session.query(Folio).count() == 1
    assert db_session.query(Transaction).count() == 2
```

In `test_member_merge.py`: source member folio "123 / 45" and target "123/45" for the same scheme, sharing one identical row each with different imports → after merge one folio, one copy of that row, and its `transaction_imports` contain both imports (`test_merge_moves_links_of_dropped_duplicates`).

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** In `member_merge.py`, key `target_folios` by `(f.scheme_id, f.folio_key)`; before `db.delete(txn)` for a duplicate, re-point its links to the twin row:

```python
twin_txn = existing_rows[_txn_key(txn)]
for link in db.query(TransactionImport).filter_by(transaction_id=txn.id).all():
    if db.get(TransactionImport, (twin_txn.id, link.import_id)) is None:
        db.add(TransactionImport(transaction_id=twin_txn.id, transaction_date=twin_txn.date, import_id=link.import_id))
    db.delete(link)
```

(`existing_rows` replaces the `existing` set with a dict key → row; `_txn_key` gains `occurrence`.)

- [ ] **Step 4: Run, expect PASS.**

---

### Task 3: Confirm writes a link for every row in the file

**Files:**
- Modify: `backend/app/services/import_/confirm_people.py` (`_match_rows` from phase 3 returns matches too; `_write_person_rows`; phase 2's opening write)
- Modify: `backend/app/services/import_/coverage_gap.py` (`create_opening_balance` adds the manual import's link)
- Test: `backend/tests/services/import_/test_confirm_people.py`, `test_coverage_gap.py`

**Interfaces:**
- `_match_rows(...) -> MatchResult` where `MatchResult.inserts: list[tuple[NormalizedTransaction, int]]` and `MatchResult.matched: list[Transaction]`.
- Every inserted row gets a link to `import_rec`; every matched row gets one too (skip when it already exists). The opening row a confirm writes gets a link to that confirm's import.

- [ ] **Step 1: Write the failing test:**

```python
def test_overlapping_import_links_the_rows_it_contains(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    rows = [(date(2021, 1, 5), "10", "10"), (date(2021, 2, 5), "10", "20")]
    _upload(db_session, me, _solo(start=date(2021, 1, 1), rows=rows[:1]))
    _upload(db_session, me, _solo(start=date(2021, 1, 1), rows=rows))
    first = db_session.query(Transaction).filter_by(date=date(2021, 1, 5)).one()
    links = db_session.query(TransactionImport).filter_by(transaction_id=first.id).count()
    assert links == 2
```

- [ ] **Step 2–4:** implement; run `test_confirm_people.py`, `test_coverage_gap.py`.

---

### Task 4: Delete by links; restore the opening balance

**Files:**
- Modify: `backend/app/services/import_/deletion.py:58-90` (`_delete_imports`)
- Create: `backend/app/services/import_/opening_restore.py`
- Test: `backend/tests/services/import_/test_deletion.py`, `backend/tests/services/import_/test_opening_restore.py` (new)

**Interfaces:**
- Consumes: `reconciliation.cas_closings` (phase 1) for `open`/`valuation.cost`, `opening_balance.price_opening_lot` (phase 2), `nav._latest_cached_on_or_before` (sync NAV lookup), `confirm_people._apply_opening_rule` (phase 2).
- Produces: `opening_restore.restore_openings(db: Session, folio_ids: list[uuid.UUID]) -> int` — for each folio, among the remaining CONFIRMED imports whose raw output lists it, take the one with the earliest `statement_from_date`; build its `ParsedScheme`-like view (`open_units`, `valuation_cost`, `valuation_nav`) from the raw JSON, the folio's DB rows dated ≥ that start as the in-period rows, a NAV series from `nav_history` (cache only, no network), price with `price_opening_lot`, then call `_apply_opening_rule(db, folio, lot, start, import_rec)`. Returns how many opening rows were written.

`_delete_imports`, replacing the `Transaction.import_id.in_(import_ids)` logic:

```python
affected = [tid for (tid,) in db.query(TransactionImport.transaction_id)
            .filter(TransactionImport.import_id.in_(import_ids)).distinct()]
db.query(TransactionImport).filter(TransactionImport.import_id.in_(import_ids)).delete(synchronize_session=False)
db.flush()
orphans, survivors = [], []
for txn in db.query(Transaction).filter(Transaction.id.in_(affected)).all():
    remaining = db.query(TransactionImport.import_id).filter_by(transaction_id=txn.id).first()
    if remaining is None:
        orphans.append(txn)
    else:
        survivors.append(txn)
        if txn.import_id in import_ids:
            txn.import_id = remaining[0]       # import_id is NOT NULL: point at a survivor
folio_ids = {t.folio_id for t in orphans} | {t.folio_id for t in survivors}
deleted_count = len(orphans)
for txn in orphans:
    db.delete(txn)
db.flush()
restore_openings(db, [f for f in folio_ids if db.get(Folio, f) is not None])
```

then the existing "delete empty folio / evaluate coverage gaps" loop over `folio_ids`, then `db.query(Import)...delete()` as today. (`affected` must be read **before** the link delete; `survivors` is the list of re-pointed rows.)

- [ ] **Step 1: Write the failing tests** (`test_deletion.py`; reuse phase 2/3 `_solo`/`_upload` by importing them from `tests/services/import_/test_confirm_people.py`, or move those two helpers into `tests/services/import_/helpers.py` and import from both — prefer the move):

```python
def test_delete_shorter_keeps_rows_the_longer_contains(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    fy_rows = [(date(2026, 5, 5), "10", "110")]
    long_rows = [(date(2016, 5, 5), "100", "100")] + fy_rows
    fy = _upload(db_session, me, _solo(open_units="100", cost="5000", start=date(2026, 4, 1), rows=fy_rows))
    _upload(db_session, me, _solo(start=date(2016, 1, 1), rows=long_rows))
    delete_import(db_session, me.user_id, uuid.UUID(fy.import_id), "person")
    assert sorted(t.date for t in db_session.query(Transaction).all()) == [date(2016, 5, 5), date(2026, 5, 5)]


def test_delete_longer_restores_shorter_opening(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    fy_rows = [(date(2026, 5, 5), "10", "110")]
    _upload(db_session, me, _solo(open_units="100", cost="5000", start=date(2026, 4, 1), rows=fy_rows))
    longer = _upload(db_session, me, _solo(start=date(2016, 1, 1), rows=[(date(2016, 5, 5), "100", "100")] + fy_rows))
    delete_import(db_session, me.user_id, uuid.UUID(longer.import_id), "person")
    [opening] = db_session.query(Transaction).filter_by(origin=TransactionOrigin.CAS_OPENING).all()
    assert opening.date == date(2026, 4, 1) and opening.units == Decimal("100")
    assert sum(t.units for t in db_session.query(Transaction).all()) == Decimal("110")


def test_delete_member_portfolio_leaves_no_links(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    _upload(db_session, me, _solo(start=date(2021, 1, 1), rows=[(date(2021, 1, 5), "10", "10")]))
    delete_member_portfolio(db_session, me.user_id, me.id, remove_member=False)
    assert db_session.query(TransactionImport).count() == 0
    assert db_session.query(Folio).count() == 0
```

(For the restore test, the FY import's `raw_parser_output` must contain the fund with `open: "100"` and `valuation.cost: "5000"`. `_solo` builds `raw_json="{}"`; extend it to set `result.raw_json` to a casparser-shaped JSON with one folio/scheme carrying `open`, `close`, `valuation`, `isin`, so `_person_raw_output` keeps it.)

`test_opening_restore.py`: unit tests for `restore_openings` with hand-built imports/folios — earliest-start import chosen; no write when real rows before that start exist; NAV series read from `nav_history` only (patch `_fetch_nav_history` to raise, prove it's never called).

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run, expect PASS** — `test_deletion.py`, `test_opening_restore.py`, `tests/api/test_imports_routes.py -k delete`, `tests/api/test_dashboard_routes.py -k portfolio`.

---

### Task 5: Checkpoint

- [ ] **Step 1: Postgres** — `upgrade head` / `downgrade 0026` / `upgrade head`; run `tests/functional_postgres/` in full. Seed the functional DB with two duplicate-spelling folios before the upgrade (reuse Task 1's SQLite inserts as SQL) and confirm the merge result.
- [ ] **Step 2: Synthetic** (to `/tmp/p4_*.json`):
  - `p20_FY.pdf,p20_FY_altfolio.pdf` → one folio per fund, units = CAS (the Nippon 299,034 vs 289,301 case gone).
  - `p20_FY.pdf,p20_20yr.pdf` with `DELETE_FIRST=1` (deletes FY after both) → units equal the 20-year CAS; the ₹11 L loss from the artifact is gone.
  - New harness mode `DELETE_LAST=1` (delete the second import): `p20_FY.pdf,p20_20yr.pdf` → units equal the FY CAS (opening restored).
  - All other scenarios: `match` counts ≥ phase 3.
- [ ] **Step 3:** Stop and fix any failure before phase 5.
