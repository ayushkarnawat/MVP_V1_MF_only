# CAS Import Fixes — Phase 3: Twin Same-Day Rows (#2) and Every Row Type (#3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If any task is delegated to Codex, the `model-orchestration` skill governs it (handoff doc + adversarial review gate).

**Goal:** Two genuine identical rows on one day are both saved, overlapping statements still add nothing twice, and bounced SIPs, gifts, bonus units, segregated portfolios and IDCW payouts all reach holdings, cash flow and XIRR correctly.

**Architecture:** Each saved row also stores casparser's running balance after it (`balance_units`) and an `occurrence` number that joins the unique key. Matching an incoming row against saved rows uses the five old fields plus the balance (identical across overlapping statements), falling back to counting copies when a balance is missing. The parser stops discarding direction and stops skipping rows that have units but no price; four new `transactiontype` values carry the meaning; FIFO, cash flow and XIRR learn them.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic (partitioned Postgres `transactions`), casparser 1.3.0.

**Spec:** `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` #2, #3 (including "Decided: cost of gifted units"). Master index Global Constraints apply.

## Global Constraints

See the master index. Additionally:
- Migration **`0026_twin_rows_and_row_types`** (down_revision `0025`). Postgres: the unique constraint on a partitioned table must include the partition key `date` — the new key `(folio_id, date, amount, units, type, occurrence)` does. Rebuild `transactions_type_check` with the four new values (pattern: 0010). SQLite: batch `recreate="always"` (pattern: 0002).
- **No data backfill in the migration.** Existing rows get `occurrence = 1` and `balance_units = NULL`; the matcher treats a NULL balance as "unknown" and heals it on the next overlapping upload (Task 3). Phase 7's backfill fills the rest.
- Gift cost (decided): a `gift_in` lot is priced at the NAV on the gift date as printed on the CAS; when the CAS row has no NAV, at the fund's NAV on that date from NAV history (priced at preview time, same hook as phase 2's opening lots). `gift_out` consumes lots with **no** realised gain.

## Review Focus

1. **Twin SIPs on the same day, then the same statement uploaded again.** First upload saves both (occurrence 1 and 2); second adds 0. Test: `test_twin_rows_saved_then_reupload_adds_nothing` (Task 3).
2. **A legacy database row (balance NULL) overlapped by a new upload of the same period.** No duplicate; the legacy row's balance is filled in. Test: `test_null_balance_row_is_matched_and_healed` (Task 3).
3. **A bounced SIP whose reversal is in the next month.** Units and invested both net to zero for that instalment; XIRR doesn't count the failed purchase. Test: `test_reversal_cancels_its_purchase` (Task 4).
4. **Bonus units later redeemed.** Realised gain uses cost 0 for the bonus lot (FIFO order kept). Test: `test_bonus_lot_has_zero_cost` (Task 4).
5. **IDCW payout with no units.** Appears in cash flow as a credit and in lifetime XIRR; holdings units unchanged. Test: `test_payout_row_kept_with_zero_units` (Task 2), `test_payout_is_inflow` (Task 4).

---

## File map

- Modify `backend/app/models/enums.py` (`TransactionType`), `backend/app/models/transaction.py`.
- Create `backend/alembic/versions/0026_twin_rows_and_row_types.py`.
- Modify `backend/app/services/import_/parser.py` (type map, row retention, `needs_price`).
- Modify `backend/app/services/import_/opening_balance.py` → add `price_rows_at_nav` (or a sibling `row_pricing.py`); `service.py` (call it).
- Modify `backend/app/services/import_/confirm_people.py` (matcher, `_all_rows_exist`).
- Modify `backend/app/services/dashboard/holdings.py`, `cash_flow.py`, `xirr.py`, `services/import_/coverage_gap.py` (unit in/out sets), `services/analytics/benchmark.py`.

---

### Task 1: Enum values, columns, migration 0026

**Files:**
- Modify: `backend/app/models/enums.py:102-115`, `backend/app/models/transaction.py`
- Create: `backend/alembic/versions/0026_twin_rows_and_row_types.py`
- Test: `backend/tests/test_migrations.py`, `backend/tests/functional_postgres/test_partitioning.py`, `backend/tests/models/` (grep for a test asserting the TransactionType value list and update it)

**Interfaces:**
- Produces: `TransactionType.REVERSAL="reversal"`, `GIFT_IN="gift_in"`, `GIFT_OUT="gift_out"`, `BONUS="bonus"`; `Transaction.balance_units: Decimal | None` (`Numeric(18,3)`); `Transaction.occurrence: int` (SmallInteger, NOT NULL, default 1); constraint name `uq_transactions_folio_date_amount_units_type_occ`.

- [ ] **Step 1: Write the failing tests.** `test_migrations.py`:

```python
def test_0026_twin_rows_allowed_with_occurrence(tmp_path, monkeypatch):
    import sqlite3
    db_path = tmp_path / "twins.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0025").returncode == 0
    conn = sqlite3.connect(db_path)
    ts = "2026-09-01 10:00:00.000000"
    conn.execute("INSERT INTO users (id, phone_number, created_at) VALUES ('u1', '+919800002601', ?)", (ts,))
    conn.execute("INSERT INTO household_members (id, user_id, name, relationship, created_at, origin, name_source)"
                 " VALUES ('m1', 'u1', 'A', 'self', ?, 'onboarding', 'user_entered')", (ts,))
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES ('s1', '1', 'X', 'A', 'E')")
    conn.execute("INSERT INTO folios (id, household_member_id, scheme_id, folio_number, plan_type, has_coverage_gap)"
                 " VALUES ('f1', 'm1', 's1', '1/1', 'direct', 0)")
    conn.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at) VALUES ('i1', 'm1', 'confirmed', ?)", (ts,))
    conn.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav) "
                 "VALUES ('t1', '2021-01-05', 'f1', 'i1', 'purchase_sip', 14999.25, 131.342, 114.2)")
    conn.commit(); conn.close()

    up = _alembic("upgrade", "0026")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    assert conn.execute("SELECT occurrence, balance_units FROM transactions WHERE id='t1'").fetchone() == (1, None)
    conn.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, occurrence, origin) "
                 "VALUES ('t2', '2021-01-05', 'f1', 'i1', 'purchase_sip', 14999.25, 131.342, 114.2, 2, 'cas_row')")
    conn.commit()
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, occurrence, origin) "
                     "VALUES ('t3', '2021-01-05', 'f1', 'i1', 'purchase_sip', 14999.25, 131.342, 114.2, 2, 'cas_row')")
    conn.close()
    down = _alembic("downgrade", "0025")
    assert down.returncode == 0, down.stderr
```

(`import pytest` at the top of the file if absent.) Postgres (`functional_postgres/test_partitioning.py`):

```python
def test_0026_type_check_accepts_new_values_and_twins(pg_engine, pg_folio_and_import):
    folio_id, import_id = pg_folio_and_import
    with pg_engine.begin() as conn:
        for occ in (1, 2):
            conn.exec_driver_sql(
                "INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, occurrence, origin) "
                "VALUES (gen_random_uuid(), '2021-01-05', %s, %s, 'purchase_sip', 1, 1, 1, %s, 'cas_row')",
                (folio_id, import_id, occ),
            )
        for t in ("reversal", "gift_in", "gift_out", "bonus"):
            conn.exec_driver_sql(
                "INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, origin) "
                "VALUES (gen_random_uuid(), '2022-01-05', %s, %s, %s, 1, 1, 1, 'cas_row')",
                (folio_id, import_id, t),
            )
```

(If the file has no `pg_folio_and_import` fixture, add one beside its existing fixtures that inserts a user, member, scheme, folio and import and yields `(folio_id, import_id)`.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Enum values appended to `TransactionType`. Model:

```python
    __table_args__ = (
        PrimaryKeyConstraint("id", "date"),
        # #2: occurrence separates genuine identical rows on one folio-date
        # (twin SIPs). Must stay in lockstep with migration 0026 and
        # confirm_people's matcher.
        UniqueConstraint(
            "folio_id", "date", "amount", "units", "type", "occurrence",
            name="uq_transactions_folio_date_amount_units_type_occ",
        ),
    )
    ...
    # casparser's running balance after this row; identical across
    # overlapping statements, so it tells twins from re-uploads (#2).
    balance_units: Mapped[Decimal | None] = mapped_column(Numeric(18, 3))
    occurrence: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1, server_default="1")
```

Migration `0026_twin_rows_and_row_types.py` (values frozen; old key name `uq_transactions_folio_date_amount_units_type` from 0002):

```python
from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None

OLD = "uq_transactions_folio_date_amount_units_type"
NEW = "uq_transactions_folio_date_amount_units_type_occ"
_TYPES = ("purchase", "purchase_sip", "redemption", "switch_in", "switch_out", "dividend_payout",
          "dividend_reinvest", "segregation", "stt", "stamp_duty", "misc", "opening_balance",
          "reversal", "gift_in", "gift_out", "bonus")
_OLD_TYPES = _TYPES[:12]


def _check(values):
    return f"CHECK (type IN ({', '.join(repr(v) for v in values)}))"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE transactions ADD COLUMN balance_units NUMERIC(18,3)")
        op.execute("ALTER TABLE transactions ADD COLUMN occurrence SMALLINT NOT NULL DEFAULT 1")
        op.execute(f"ALTER TABLE transactions DROP CONSTRAINT {OLD}")
        op.execute(f"ALTER TABLE transactions ADD CONSTRAINT {NEW} UNIQUE (folio_id, date, amount, units, type, occurrence)")
        op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check")
        op.execute(f"ALTER TABLE transactions ADD CONSTRAINT transactions_type_check {_check(_TYPES)}")
        op.execute("""
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactiontype') THEN
                ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'reversal';
                ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'gift_in';
                ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'gift_out';
                ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'bonus';
              END IF;
            END $$;""")
    else:
        with op.batch_alter_table("transactions", recreate="always") as batch:
            batch.add_column(sa.Column("balance_units", sa.Numeric(18, 3), nullable=True))
            batch.add_column(sa.Column("occurrence", sa.SmallInteger(), nullable=False, server_default="1"))
            batch.drop_constraint(OLD, type_="unique")
            batch.create_unique_constraint(NEW, ["folio_id", "date", "amount", "units", "type", "occurrence"])


def downgrade() -> None:
    bind = op.get_bind()
    # Twins (occurrence > 1) and new-type rows can't satisfy the old schema;
    # drop them before restoring it. Downgrade is a rescue path, not routine.
    op.execute("DELETE FROM transactions WHERE occurrence > 1 OR type IN ('reversal','gift_in','gift_out','bonus')")
    if bind.dialect.name == "postgresql":
        op.execute(f"ALTER TABLE transactions DROP CONSTRAINT {NEW}")
        op.execute(f"ALTER TABLE transactions ADD CONSTRAINT {OLD} UNIQUE (folio_id, date, amount, units, type)")
        op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check")
        op.execute(f"ALTER TABLE transactions ADD CONSTRAINT transactions_type_check {_check(_OLD_TYPES)}")
        op.execute("ALTER TABLE transactions DROP COLUMN occurrence")
        op.execute("ALTER TABLE transactions DROP COLUMN balance_units")
    else:
        with op.batch_alter_table("transactions", recreate="always") as batch:
            batch.drop_constraint(NEW, type_="unique")
            batch.create_unique_constraint(OLD, ["folio_id", "date", "amount", "units", "type"])
            batch.drop_column("occurrence")
            batch.drop_column("balance_units")
```

If `batch.drop_constraint(OLD)` fails on SQLite because the reflected constraint is unnamed in an old dev DB, reuse 0002's `naming_convention` approach (reflect `get_unique_constraints("transactions")` and drop by the reflected or conventional name).

- [ ] **Step 4: Run, expect PASS** (`-k 0026`, plus the Postgres file with `TEST_DATABASE_URL`; skipped must be reported as skipped — and per the index this phase can't be closed with it skipped).

---

### Task 2: Parser — every row type, direction kept

**Files:**
- Modify: `backend/app/services/import_/parser.py:39-52` (map), `:274-300` (row loop)
- Test: `backend/tests/services/import_/test_parser.py`

**Interfaces:**
- Produces: `NormalizedTransaction.needs_price: bool = False` (gift rows without a CAS NAV); `CAS_TO_CANONICAL` gains `REVERSAL→REVERSAL`, `GIFT_IN→GIFT_IN`, `GIFT_OUT→GIFT_OUT`, `TDS_TAX→MISC`, `UNKNOWN→MISC`.

Row rules (in this order, after phase 2's conversion collection):

| casparser row | Saved as |
|---|---|
| `DIVIDEND_PAYOUT` with amount, units `None` | `DIVIDEND_PAYOUT`, `units=0`, `nav=0`, amount |
| units > 0, amount `None`/0, description contains "bonus" (any case) | `BONUS`, `amount=0`, `nav=0` |
| `SEGREGATION` with units, amount/nav `None` | `SEGREGATION`, `amount=0`, `nav=0` |
| `GIFT_IN` / `GIFT_OUT` with a CAS NAV | that type, `nav` from CAS, `amount=units×nav` |
| `GIFT_IN` / `GIFT_OUT` without a NAV | that type, `amount=0`, `nav=0`, `needs_price=True` |
| `REVERSAL` (casparser fixes its sign from the running balance) | `REVERSAL`, unsigned units/amount, `nav` from CAS (or `amount/units`) |
| amount-less conversion legs | phase 2 pairing (unchanged) |
| `STAMP_DUTY_TAX`, `STT_TAX`, `TDS_TAX` without units | skipped, **no warning** |
| anything else missing amount/units/nav | skipped with today's warning |

- [ ] **Step 1: Write the failing tests** (reuse phase 2's `_scheme`, `_t`, `_data` helpers in this file):

```python
def _one(t):
    return _normalize_cas_data(_data(_scheme("X Fund - Direct Plan - Growth", "INF1", [t], close="1"))).transactions


def test_payout_row_kept_with_zero_units():
    [row] = _one(_t("2022-03-01", "IDCW Paid", "2500", None, None, "DIVIDEND_PAYOUT"))
    assert row.txn_type == TransactionType.DIVIDEND_PAYOUT and row.units == 0 and row.amount == Decimal("2500.00")


def test_bonus_row_kept_at_zero_cost():
    [row] = _one(_t("2018-06-01", "Bonus Units Allotted", None, "444.000", None, "PURCHASE"))
    assert row.txn_type == TransactionType.BONUS and row.amount == 0 and row.units == Decimal("444.000")


def test_reversal_maps_to_reversal():
    [row] = _one(_t("2020-02-07", "SIP Purchase - Reversal", "-5000", "-43.21", "115.71", "REVERSAL"))
    assert row.txn_type == TransactionType.REVERSAL and row.units == Decimal("43.210")


def test_gift_without_nav_needs_price():
    [row] = _one(_t("2021-04-01", "Gift - Units Credited", None, "1500.000", None, "GIFT_IN"))
    assert row.txn_type == TransactionType.GIFT_IN and row.needs_price


def test_segregation_kept():
    [row] = _one(_t("2020-01-24", "Segregated Portfolio Allotment", None, "1200.000", None, "SEGREGATION"))
    assert row.txn_type == TransactionType.SEGREGATION and row.units == Decimal("1200.000")


def test_tds_without_units_is_silent():
    result = _normalize_cas_data(_data(_scheme("X Fund", "INF1", [_t("2022-03-01", "TDS", "12", None, None, "TDS_TAX")], close="1")))
    assert result.transactions == [] and not any("TDS" in w for w in result.parse_warnings)
```

Update `test_normalize_txn_type_maps_to_monolith_enum`: `normalize_txn_type("UNKNOWN_TYPE")` stays `MISC`; add `normalize_txn_type("REVERSAL") == TransactionType.REVERSAL`.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the table as a `_retain(txn, ttype) -> NormalizedTransaction | None` helper called from the row loop (keeps `_normalize_cas_data` readable).
- [ ] **Step 4: Run, expect PASS.**

---

### Task 3: Matcher — balance + occurrence

**Files:**
- Modify: `backend/app/services/import_/confirm_people.py` (`_write_person_rows` dedupe block at `:814-842`, phase 1's `_all_rows_exist`)
- Modify: `backend/app/services/import_/service.py` (price `needs_price` rows in `build_import_preview`, reusing phase 2's NAV-series fetch)
- Test: `backend/tests/services/import_/test_confirm_people.py`, `backend/tests/services/import_/test_service.py`

**Interfaces:**
- Produces: `confirm_people._match_rows(db, folio: Folio, rows: list[NormalizedTransaction]) -> list[tuple[NormalizedTransaction, int]]` — the rows that must be **inserted**, each with its occurrence number. Side effect: fills `balance_units` on matched saved rows whose balance was NULL.

Algorithm, per folio, per 5-field key `(date, amount, units, type)` (folio fixed):

```
incoming = file rows with this key, in file order
saved    = DB rows with this key (this folio), any origin except cas_opening
if every incoming row has a balance:
    for each incoming row r:
        exact = a saved row with balance_units == r.balance (not yet used)  → used, matched
        else  a saved row with balance_units IS NULL (not yet used)         → used, matched, set its balance_units = r.balance
        else  → insert
else:  # no balance on some incoming row (manual-like or old parser data)
    insert the last (len(incoming) − len(saved)) incoming rows, if positive
occurrence of each insert = 1 + max(occurrence over saved rows with this key and inserts so far)
```

Also in-memory: rows added earlier in the same `_write_person_rows` call count as `saved` (replaces `added_keys`). `_all_rows_exist` calls `_match_rows(..., dry_run=True)` and returns True only when nothing would be inserted **and** phase 2's opening rule would change nothing (dry-run verdict `skipped` or `none`; `written`, `replaced` and `removed` all mean "not already imported" — corrected 2026-10-06). Keep phase 1's zero-rows → False rule and the per-scheme-key cache.

`build_import_preview`: collect schemes with any `needs_price` row; fetch their NAV series in the same `gather` as phase 2's opening-lot fetch; for each such row set `nav = NAV on or before the row date`, `amount = quantize_amount(units × nav)`, `needs_price=False`. No series → leave `amount=0, nav=0` and add warning "No price found for a gift on {date} ({fund}); its cost is shown as ₹0."

- [ ] **Step 1: Write the failing tests** (`test_confirm_people.py`; builds on phase 2's `_solo`/`_upload` helpers). First replace phase 2's `_solo` row builder so a row may carry a balance as a third element:

```python
def _solo(*, open_units="0", start, cost="0", rows=()):
    """rows = [(date, units)] or [(date, units, balance)]; purchases at NAV 50."""
    result = family_result([{"name": "ADITI SHARMA", "pan": ADITI_PAN}])
    scheme, tmpl = result.schemes[0], result.transactions[0]
    scheme.open_units, scheme.valuation_cost = Decimal(open_units), Decimal(cost)
    scheme.valuation_nav = Decimal("50")
    result.statement_from = start
    result.transactions = []
    for d, u, *bal in rows:
        result.transactions.append(replace(
            tmpl, txn_date=d, units=Decimal(u), nav=Decimal("50.0000"), amount=Decimal(u) * 50,
            balance=Decimal(bal[0]) if bal and bal[0] is not None else None,
        ))
    scheme.transaction_count = len(result.transactions)
    return result
```

Then the tests:

```python
def test_twin_rows_saved_then_reupload_adds_nothing(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    twins = [(date(2021, 1, 5), "131.342", "1092.978"), (date(2021, 1, 5), "131.342", "1224.320")]
    first = _upload(db_session, me, _solo(start=date(2021, 1, 1), rows=twins))
    assert first.added == 2
    occ = sorted(t.occurrence for t in db_session.query(Transaction).all())
    assert occ == [1, 2]
    with pytest.raises(confirm_people.AlreadyImportedError):
        _upload(db_session, me, _solo(start=date(2021, 1, 1), rows=twins))


def test_null_balance_row_is_matched_and_healed(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    _upload(db_session, me, _solo(start=date(2021, 1, 1), rows=[(date(2021, 1, 5), "10", None)]))
    row = db_session.query(Transaction).one()
    assert row.balance_units is None
    _upload(db_session, me, _solo(start=date(2021, 1, 1),
                                  rows=[(date(2021, 1, 5), "10", "10"), (date(2021, 2, 5), "10", "20")]))
    rows = db_session.query(Transaction).order_by(Transaction.date).all()
    assert len(rows) == 2 and rows[0].balance_units == Decimal("10.000")


def test_overlapping_lookbacks_add_only_new_rows(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    a = [(date(2021, 1, 5), "10", "10"), (date(2021, 2, 5), "10", "20")]
    b = a + [(date(2021, 3, 5), "10", "30")]
    _upload(db_session, me, _solo(start=date(2021, 1, 1), rows=a))
    assert _upload(db_session, me, _solo(start=date(2021, 1, 1), rows=b)).added == 1
```

In `test_service.py`: a `GIFT_IN` row with `needs_price=True` on 2021-04-01 and a patched NAV series `[(date(2021, 3, 31), Decimal("20"))]` ends up with `nav == 20` and `amount == units × 20` in the session's `parse_result`.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `_match_rows`; `Transaction(...)` inserts set `balance_units=norm.balance`, `occurrence=occ`.
- [ ] **Step 4: Run, expect PASS** (both files + `tests/api/test_imports_people_routes.py`).

---

### Task 4: FIFO, cash flow, XIRR, coverage for the new types

**Files:**
- Modify: `backend/app/services/dashboard/holdings.py` (`_LOT_ADDING_TYPES`, `_LOT_CONSUMING_TYPES`, `_process_folio_lots`, the transaction ordering `case`)
- Modify: `backend/app/services/dashboard/cash_flow.py` (`_DEBIT_TYPES`, `_CREDIT_TYPES`, docstring)
- Modify: `backend/app/services/dashboard/xirr.py` (`_signed_amount` value for gifts)
- Modify: `backend/app/services/import_/coverage_gap.py` (`UNIT_INFLOW_TYPES`, `UNIT_OUTFLOW_TYPES`)
- Modify: `backend/app/services/dashboard/sip.py`, `snapshots.py` (they import `_LOT_CONSUMING_TYPES` for ordering — keep consistent)
- Modify: `backend/app/services/analytics/benchmark.py` (its own flow sets, if separate)
- Test: `test_holdings.py`, `test_cash_flow.py`, `test_xirr.py`, `test_coverage_gap.py`, benchmark tests

**Interfaces / rules:**
- Lot-adding: `PURCHASE, PURCHASE_SIP, SWITCH_IN, DIVIDEND_REINVEST, OPENING_BALANCE, GIFT_IN, BONUS, SEGREGATION`.
- Lot-consuming with realised gain: `REDEMPTION, SWITCH_OUT`. Consuming **without** realised gain: `GIFT_OUT` (new set `_LOT_TRANSFER_OUT_TYPES`).
- `REVERSAL`: removes the units of the most recent earlier lot whose units equal the reversal's units (exact, 3 dp); if none, consumes the newest lots (LIFO) by that many units; never creates realised gain. Ordering: same-date reversals sort **after** purchases (add to the consuming bucket in the `case`).
- Cash flow: debit `PURCHASE, PURCHASE_SIP, OPENING_BALANCE`; credit `REDEMPTION, DIVIDEND_PAYOUT, REVERSAL`. Gifts are not cash and stay out of the cash-flow list.
- XIRR (`xirr._RELEVANT_TYPES` = debit ∪ credit ∪ gifts): `GIFT_IN` is an outflow of its value (`-amount`), `GIFT_OUT` an inflow of `units × nav` (its `amount`), so a gift doesn't distort returns.
- Coverage gap: inflow adds `GIFT_IN, BONUS, SEGREGATION`; outflow adds `GIFT_OUT, REVERSAL`.

- [ ] **Step 1: Write the failing tests** (`test_holdings.py`, using its `_txn` helper):

```python
def test_reversal_cancels_its_purchase():
    txns = [
        _txn(TransactionType.PURCHASE_SIP, date(2020, 1, 7), Decimal("5000.00"), Decimal("43.210"), Decimal("115.7100")),
        _txn(TransactionType.PURCHASE_SIP, date(2020, 2, 7), Decimal("5000.00"), Decimal("40.000"), Decimal("125.0000")),
        _txn(TransactionType.REVERSAL, date(2020, 2, 10), Decimal("5000.00"), Decimal("40.000"), Decimal("125.0000")),
    ]
    units, cost, realized = _process_folio_lots(txns)
    assert units == Decimal("43.210") and cost == Decimal("5000.00") and realized == 0


def test_bonus_lot_has_zero_cost():
    txns = [
        _txn(TransactionType.PURCHASE, date(2015, 1, 1), Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000")),
        _txn(TransactionType.BONUS, date(2016, 1, 1), Decimal("0"), Decimal("100.000"), Decimal("0")),
        _txn(TransactionType.REDEMPTION, date(2020, 1, 1), Decimal("6000.00"), Decimal("150.000"), Decimal("40.0000")),
    ]
    units, cost, realized = _process_folio_lots(txns)
    assert units == Decimal("50.000") and cost == Decimal("0")
    assert realized == Decimal("100.000") * 30 + Decimal("50.000") * 40


def test_gift_out_has_no_realised_gain():
    txns = [
        _txn(TransactionType.PURCHASE, date(2015, 1, 1), Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000")),
        _txn(TransactionType.GIFT_OUT, date(2020, 1, 1), Decimal("4000.00"), Decimal("100.000"), Decimal("40.0000")),
    ]
    assert _process_folio_lots(txns) == (Decimal("0"), Decimal("0"), Decimal("0"))
```

`test_cash_flow.py::test_payout_is_inflow` (a `DIVIDEND_PAYOUT` with units 0 → credit entry) and `test_reversal_is_credit`; `test_xirr.py::test_gift_in_counts_as_invested` (gift-in 10,000 on 2020-01-01, value 20,000 today → XIRR not `None` and > 0); `test_coverage_gap.py`: a `GIFT_OUT` larger than the held units creates a gap.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** per the rules. Update the `_process_folio_lots` docstring (segregation is now counted; STT/stamp/misc still ignored).
- [ ] **Step 4: Run, expect PASS** — the listed files plus every test file found by `grep -rln "_LOT_CONSUMING_TYPES\|_LOT_ADDING_TYPES\|_DEBIT_TYPES\|_CREDIT_TYPES\|UNIT_INFLOW_TYPES" backend/tests`.

---

### Task 5: Checkpoint

- [ ] **Step 1: Postgres.** With `TEST_DATABASE_URL`: `alembic upgrade head`, `alembic downgrade 0025`, `alembic upgrade head` on the functional DB; run `tests/functional_postgres/` in full. Report the output.
- [ ] **Step 2: Synthetic.** Re-run the baseline loop to `/tmp/p3_*.json`. Required (record in the baseline doc under "After phase 3"):
  - p20 and p10 twin-SIP instalments all present (counts from the artifact: 69 for p20, 93 for p10); reupload of any file adds 0.
  - p7: bounced SIPs net to zero (the ₹3 L overstatement gone); gift received valued.
  - p20 bonus units present (₹44 L).
  - `kfin_pk_10yr`: Franklin extinguished/reversed rows unchanged (still correct); segregated units now counted.
  - p10 IDCW payouts (9) appear in cash flow.
  - Every scenario's `match` count ≥ its phase-2 count; FY/1/3/7/10/20-year p20 now all `match` (except the realised-gain and XIRR items that are phase 6's — those aren't unit checks).
- [ ] **Step 3:** Stop and fix any failure before phase 4.
