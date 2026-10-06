# CAS Import Fixes — Phase 2: Opening Balance (#1) and ISIN Keys + Unit Conversions (#21)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If any task is delegated to Codex, the `model-orchestration` skill governs it (handoff doc + adversarial review gate).

**Goal:** Every fund's CAS opening balance becomes one dated, hybrid-costed `OPENING_BALANCE` lot that the dashboard counts, so a short-lookback statement shows the full value; and two plans that share a name are kept apart by ISIN, with amount-less unit conversions (face-value change, merger) carried at cost instead of dropped.

**Architecture:**
- **Parser (`parser.py`)** keeps casparser's `open`, `close` and `valuation.{cost,nav,date}` per scheme on `ParsedScheme`. Schemes are keyed `(folio, amc, isin or name)` everywhere a `SchemeKey` is used. Amount-less switch/merger/face-value legs are paired (same AMC, same date, one out-leg and one in-leg) and priced at the out-leg's FIFO cost, so the conversion moves cost without a realised gain.
- **Opening cost (`opening_balance.py`, new)** computes the hybrid cost after fund matching (preview time, async, so it can read NAV history): CAS total cost minus the FIFO cost of in-period purchases still held; else units × NAV on the start date. The result rides in the RAM session.
- **Confirm (`confirm_people.py`)** creates folios per scheme (not per transaction) and applies the earliest-statement rule. Rows carry `origin` (`cas_row | cas_opening | manual`) and `cost_source` (`cas_cost | nav_on_start | manual`).
- **Calculations** count `OPENING_BALANCE` as a lot and as money invested on the start date.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic, casparser 1.3.0, React 19 + Vitest (one small frontend task).

**Spec:** `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` #1 ("Decided: the hybrid cost method", "Rule when several statements are uploaded") and #21. The approximate purchase date is **out of scope** (documented in `Docs/investigations/2026-10-06-cas-import-deferred-items.md` §1) — do not add `est_acquired_on`.

## Global Constraints

See the master index. Additionally:
- Migration **`0025_transaction_origin_cost_source`** (down_revision `0023`, see the index's numbering note). It touches the partitioned `transactions` table: Postgres via `ALTER TABLE transactions ADD COLUMN` on the parent (propagates to partitions) with VARCHAR + CHECK, never a native enum (same reasoning as `transactions.type`, see 0010).
- The opening-balance row: `type=opening_balance`, `date=S` (statement start), `units=U` (casparser `open`), `amount=quantize_amount(U × c)`, `nav=quantize_nav(c)`, `origin=cas_opening`, `cost_source` per the hybrid, `raw_description="Opening balance from CAS ({S})"`.
- Manual opening rows (`coverage_gap.create_opening_balance`, the OpeningBalanceModal) get `origin=manual`, `cost_source=manual` and are **never** replaced or deleted by the earliest-statement rule.
- In-flight RAM sessions created before the deploy can't be confirmed after it (they're lost on restart anyway); no compatibility shim for old `SchemeKey`s.

## Review Focus

1. **FY then 20-year (shorter first).** The FY opening row (dated 1 Apr 2026) must be deleted when the 20-year file arrives (its rows cover from 2006), and no opening row is written for funds whose 20-year `open` is 0. Test: `test_opening_rule_longer_statement_replaces_and_removes` (Task 5).
2. **20-year then FY (longer first).** The FY file's opening balance must be skipped (real rows before 1 Apr 2026 already exist). Test: `test_opening_rule_skips_when_real_rows_before_start` (Task 5).
3. **A fund with an opening balance and no transactions in the period.** It must appear (folio created, value counted). Test: `test_fund_with_only_opening_balance_is_saved` (Task 5).
4. **Opening lot fully consumed by in-period redemptions** (CAS cost covers only in-period lots). Hybrid must fall back to NAV on S, never divide by zero. Test: `test_opening_consumed_falls_back_to_nav_on_start` (Task 3).
5. **Two plans with the same name and different ISINs in one folio** (HDFC Liquid face-value change). Two schemes, old ends at 0 units, new holds the converted units with the old cost. Test: `test_same_name_two_isins_stay_separate`, `test_face_value_conversion_moves_cost` (Task 2).

---

## File map

- Modify `backend/app/models/enums.py` — `TransactionOrigin`, `CostSource`.
- Modify `backend/app/models/transaction.py` — `origin`, `cost_source`.
- Create `backend/alembic/versions/0025_transaction_origin_cost_source.py`.
- Modify `backend/app/services/import_/parser.py` — scheme keys, opening fields, conversion pairing.
- Create `backend/app/services/import_/opening_balance.py` — hybrid cost.
- Modify `backend/app/services/import_/service.py` — `key_to_temp` via `ParsedScheme.key`; price opening lots in `build_import_preview`.
- Modify `backend/app/services/import_/confirm_people.py` — `SchemeKey`, folios per scheme, earliest-statement rule.
- Modify `backend/app/services/import_/coverage_gap.py` — manual origin.
- Modify `backend/app/services/dashboard/holdings.py`, `cash_flow.py` (and through it `xirr.py`) — count opening balance.
- Modify `backend/app/services/dashboard/schemas.py` — `HoldingRow.opening_lot`.
- Modify frontend `features/dashboard/types.ts`, `FundDetailModal.tsx`, `mobile/features/holdings/MobileFundDetailView.tsx` — the "units from before" line.

---

### Task 1: Enums, model columns, migration 0025

**Files:**
- Modify: `backend/app/models/enums.py`, `backend/app/models/transaction.py`
- Create: `backend/alembic/versions/0025_transaction_origin_cost_source.py`
- Modify: `DEFERRED_FEATURES.md` (migration-number note under "Added 2026-09-30")
- Test: `backend/tests/test_migrations.py`, `backend/tests/functional_postgres/test_partitioning.py`

**Interfaces:**
- Produces: `TransactionOrigin.{CAS_ROW="cas_row", CAS_OPENING="cas_opening", MANUAL="manual"}`; `CostSource.{CAS_COST="cas_cost", NAV_ON_START="nav_on_start", MANUAL="manual"}`; `Transaction.origin: TransactionOrigin` (NOT NULL, default `cas_row`); `Transaction.cost_source: CostSource | None`.

- [ ] **Step 1: Write the failing migration test** (append to `test_migrations.py`):

```python
def test_0025_adds_origin_and_cost_source_and_backfills_manual(tmp_path, monkeypatch):
    import sqlite3, uuid
    db_path = tmp_path / "origin.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0023").returncode == 0
    conn = sqlite3.connect(db_path)
    folio, imp = "f1", "i1"
    ts = "2026-09-01 10:00:00.000000"
    conn.execute("INSERT INTO users (id, phone_number, created_at) VALUES ('u1', '+919800002501', ?)", (ts,))
    conn.execute(
        "INSERT INTO household_members (id, user_id, name, relationship, created_at, origin, name_source)"
        " VALUES ('m1', 'u1', 'A', 'self', ?, 'onboarding', 'user_entered')", (ts,)
    )
    conn.execute("INSERT INTO schemes (id, amfi_code, name, amc_name, sebi_category) VALUES ('s1', '100001', 'X', 'A', 'Equity')")
    conn.execute(
        "INSERT INTO folios (id, household_member_id, scheme_id, folio_number, plan_type, has_coverage_gap)"
        " VALUES ('f1', 'm1', 's1', '1/1', 'direct', 0)"
    )
    conn.execute("INSERT INTO imports (id, household_member_id, status, uploaded_at) VALUES ('i1', 'm1', 'confirmed', ?)", (ts,))
    conn.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, raw_description) "
                 "VALUES (?, '2020-01-01', ?, ?, 'opening_balance', 100, 10, 10, 'Manual Opening Balance Entry')",
                 (str(uuid.uuid4()), folio, imp))
    conn.execute("INSERT INTO transactions (id, date, folio_id, import_id, type, amount, units, nav, raw_description) "
                 "VALUES (?, '2020-02-01', ?, ?, 'purchase', 100, 10, 10, 'Purchase')",
                 (str(uuid.uuid4()), folio, imp))
    conn.commit(); conn.close()

    up = _alembic("upgrade", "0025")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    rows = dict(conn.execute("SELECT type, origin FROM transactions").fetchall())
    assert rows == {"opening_balance": "manual", "purchase": "cas_row"}
    conn.close()
    assert _alembic("downgrade", "0023").returncode == 0
```

Replace the `...` with the parent-row INSERTs copied from `test_0020_backfills_statement_period_from_raw_parser_output` (same columns), using `member`, `folio`, `imp` as their ids.

Append to `functional_postgres/test_partitioning.py`:

```python
def test_origin_column_exists_on_every_partition(pg_engine):
    with pg_engine.connect() as conn:
        rows = conn.exec_driver_sql(
            "SELECT DISTINCT table_name FROM information_schema.columns "
            "WHERE column_name = 'origin' AND table_name LIKE 'transactions%'"
        ).fetchall()
        partitions = conn.exec_driver_sql(
            "SELECT inhrelid::regclass::text FROM pg_inherits WHERE inhparent = 'transactions'::regclass"
        ).fetchall()
    assert {r[0] for r in rows} >= {"transactions"} | {p[0] for p in partitions}
```

(Use the fixture name that file already uses for the migrated Postgres engine.)

- [ ] **Step 2: Run, expect FAIL.** `python3 -m pytest tests/test_migrations.py -k 0025 -q`
- [ ] **Step 3: Implement.** In `enums.py`:

```python
class TransactionOrigin(str, enum.Enum):
    CAS_ROW = "cas_row"
    CAS_OPENING = "cas_opening"
    MANUAL = "manual"


class CostSource(str, enum.Enum):
    CAS_COST = "cas_cost"
    NAV_ON_START = "nav_on_start"
    MANUAL = "manual"
```

In `transaction.py`:

```python
    # #1: who wrote the row. The earliest-statement rule replaces only
    # cas_opening rows, never manual ones (OpeningBalanceModal).
    origin: Mapped[TransactionOrigin] = mapped_column(
        enum_column(TransactionOrigin), nullable=False, default=TransactionOrigin.CAS_ROW,
        server_default=TransactionOrigin.CAS_ROW.value,
    )
    cost_source: Mapped[CostSource | None] = mapped_column(enum_column(CostSource))
```

Migration `0025_transaction_origin_cost_source.py`:

```python
"""transactions.origin and transactions.cost_source (#1 opening balance)

Revision ID: 0025
Revises: 0023

transactions is RANGE-partitioned on Postgres and its enum-like columns are
VARCHAR + CHECK there (see 0010), so these follow suit. ADD COLUMN on the
partitioned parent propagates to every partition. Values frozen here.
"""
from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0023"
branch_labels = None
depends_on = None

_ORIGINS = ("cas_row", "cas_opening", "manual")
_COST_SOURCES = ("cas_cost", "nav_on_start", "manual")


def _in(values):
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE transactions ADD COLUMN origin VARCHAR(16) NOT NULL DEFAULT 'cas_row'")
        op.execute("ALTER TABLE transactions ADD COLUMN cost_source VARCHAR(16)")
        op.execute(f"ALTER TABLE transactions ADD CONSTRAINT transactions_origin_check CHECK (origin IN ({_in(_ORIGINS)}))")
        op.execute(
            "ALTER TABLE transactions ADD CONSTRAINT transactions_cost_source_check "
            f"CHECK (cost_source IS NULL OR cost_source IN ({_in(_COST_SOURCES)}))"
        )
    else:
        op.add_column("transactions", sa.Column("origin", sa.String(16), nullable=False, server_default="cas_row"))
        op.add_column("transactions", sa.Column("cost_source", sa.String(16), nullable=True))
    # Every existing opening_balance row was written by the manual
    # OpeningBalanceModal (the parser never emitted one before #1).
    op.execute("UPDATE transactions SET origin = 'manual', cost_source = 'manual' WHERE type = 'opening_balance'")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_cost_source_check")
        op.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_origin_check")
        # CAS opening rows can't exist before 0025; drop them so old code
        # doesn't count them twice once it re-learns opening_balance.
        op.execute("DELETE FROM transactions WHERE origin = 'cas_opening'")
        op.execute("ALTER TABLE transactions DROP COLUMN cost_source")
        op.execute("ALTER TABLE transactions DROP COLUMN origin")
    else:
        op.execute("DELETE FROM transactions WHERE origin = 'cas_opening'")
        with op.batch_alter_table("transactions", recreate="always") as batch:
            batch.drop_column("cost_source")
            batch.drop_column("origin")
```

In `DEFERRED_FEATURES.md` "Added 2026-09-30", append to the 0024 bullet: "If this hasn't shipped before the CAS import fix plan's migrations, it is renumbered after `0029` (the plan's 0025 revises 0023)."

- [ ] **Step 4: Run, expect PASS.** `python3 -m pytest tests/test_migrations.py -k "0025 or 0023" -q`; with `TEST_DATABASE_URL` set, `python3 -m pytest tests/functional_postgres/test_partitioning.py -q` (else report "skipped").

---

### Task 2: Parser — ISIN keys, opening fields, conversion pairing

**Files:**
- Modify: `backend/app/services/import_/parser.py`
- Test: `backend/tests/services/import_/test_parser.py`

**Interfaces:**
- Produces:

```python
SchemeKey = tuple[str, str, str]          # (folio, amc, isin or name) — moved here from confirm_people

def scheme_key(folio: str, amc: str, isin: str | None, name: str) -> SchemeKey

@dataclass
class NormalizedTransaction:            # existing fields, plus:
    balance: Decimal | None = None      # casparser running balance (phase 3 stores it)
    @property
    def key(self) -> SchemeKey: return scheme_key(self.folio, self.amc, self.isin, self.scheme_name)

@dataclass
class ParsedScheme:                     # existing fields, plus:
    open_units: Decimal = Decimal("0")
    close_units: Decimal | None = None
    valuation_cost: Decimal | None = None
    valuation_nav: Decimal | None = None
    valuation_date: date | None = None
    @property
    def key(self) -> SchemeKey: return scheme_key(self.folio, self.amc, self.isin, self.name)
```

Rules:
- `scheme_map` is keyed by `scheme_key(...)`. Two schemes with the same name and different ISINs stay apart; same ISIN printed twice in one folio merges (as today for same name).
- Schemes with `open == 0`, `close == 0` and no transactions are dropped (nothing to save).
- **Conversion pairing** (#21): collect, per `(amc, date)`, rows with `units` set and `amount` or `nav` missing whose casparser type is `SWITCH_OUT`, `SWITCH_OUT_MERGER`, `SWITCH_IN`, `SWITCH_IN_MERGER`, or `MISC`/`UNKNOWN` with a description containing "face value" (case-insensitive). Units < 0 are out-legs, units > 0 are in-legs. When a group has exactly one out-leg and one in-leg, price both: `cost = fifo_cost(out-leg scheme rows before this date, consumed units)`, out-leg `amount=cost`, `nav=cost/units_out`; in-leg `amount=cost`, `nav=cost/units_in`; types become `SWITCH_OUT` / `SWITCH_IN`. The FIFO for `fifo_cost` runs over that scheme's opening lot (cost unknown at parse time → use `valuation_cost`-free placeholder: the scheme's own in-period purchase NAVs, and for the opening lot `nav = 0` marker) — **simplification:** if the consumed units come from the opening lot, set `amount = 0` and add a `pending_opening_cost` marker (`NormalizedTransaction.conversion_from_opening = True`); `opening_balance.price_opening_lot` (Task 3) fills those two legs' amount/nav from the opening lot's cost after pricing it. Unpaired amount-less rows keep today's behaviour (skipped with a warning).
- Every other amount-less row is skipped as today (phase 3 handles bonus/gift/reversal).

- [ ] **Step 1: Write the failing tests** (append to `test_parser.py`; build casparser objects with `MagicMock` like the existing tests):

```python
def _scheme(name, isin, txns, open_="0", close="0", cost="0", nav="10", vdate="2026-10-05"):
    return MagicMock(scheme=name, isin=isin, amfi=None, type="DEBT", advisor=None, transactions=txns,
                     open=open_, close=close, valuation=MagicMock(cost=cost, nav=nav, date=vdate))


def _t(d, desc, amount, units, nav, type_, balance=None):
    return MagicMock(date=d, description=desc, amount=amount, units=units, nav=nav, type=type_, balance=balance)


def _data(*schemes, folio="9/9", amc="HDFC Mutual Fund"):
    f = MagicMock(folio=folio, amc=amc, PAN="ABCDE1234F", schemes=list(schemes))
    d = MagicMock(cas_type=CASFileType.DETAILED, file_type=FileType.CAMS,
                  investor_info=MagicMock(email="t@example.com"), folios=[f], parse_warnings=[])
    d.model_dump_json.return_value = "{}"
    return d


def test_same_name_two_isins_stay_separate():
    old = _scheme("HDFC Liquid Fund - Growth", "INF179KB1HK0", [_t("2010-01-04", "Purchase", "1000", "100", "10", "PURCHASE")], close="0")
    new = _scheme("HDFC Liquid Fund - Growth", "INF179KB1HP9", [], open_="5", close="5")
    result = _normalize_cas_data(_data(old, new))
    assert {s.isin for s in result.schemes} == {"INF179KB1HK0", "INF179KB1HP9"}


def test_scheme_keeps_open_close_and_valuation():
    s = _scheme("X Fund - Direct Plan - Growth", "INF1", [], open_="7251.691", close="7251.691", cost="512000", nav="128.30")
    [parsed] = _normalize_cas_data(_data(s)).schemes
    assert parsed.open_units == Decimal("7251.691")
    assert parsed.close_units == Decimal("7251.691")
    assert parsed.valuation_cost == Decimal("512000")
    assert parsed.valuation_nav == Decimal("128.30")


def test_empty_scheme_is_dropped():
    s = _scheme("Dead Fund - Growth", "INF0", [], open_="0", close="0")
    assert _normalize_cas_data(_data(s)).schemes == []


def test_face_value_conversion_moves_cost():
    old = _scheme("HDFC Liquid Fund - Growth", "INF_OLD", [
        _t("2010-01-04", "Purchase", "958000", "95800", "10", "PURCHASE"),
        _t("2012-03-12", "Face Value Change - Units Debited", None, "-95800", None, "MISC"),
    ], close="0")
    new = _scheme("HDFC Liquid Fund - Growth", "INF_NEW", [
        _t("2012-03-12", "Face Value Change - Units Credited", None, "829.43", None, "MISC"),
    ], close="829.43")
    result = _normalize_cas_data(_data(old, new))
    by_isin = {t.isin: t for t in result.transactions if t.txn_date.isoformat() == "2012-03-12"}
    assert by_isin["INF_OLD"].txn_type == TransactionType.SWITCH_OUT
    assert by_isin["INF_NEW"].txn_type == TransactionType.SWITCH_IN
    assert by_isin["INF_OLD"].amount == by_isin["INF_NEW"].amount == Decimal("958000.00")
    assert by_isin["INF_NEW"].units == Decimal("829.430")


def test_merger_without_amount_is_paired_across_folio_schemes():
    a = _scheme("Old Small Cap - Direct Plan - Growth", "INF_A", [
        _t("2015-01-01", "Purchase", "1000", "100", "10", "PURCHASE"),
        _t("2018-06-01", "Switch-Out - Merger", None, "-100", None, "SWITCH_OUT_MERGER"),
    ])
    b = _scheme("New Small Cap - Direct Plan - Growth", "INF_B", [
        _t("2018-06-01", "Switch-In - Merger", None, "80", None, "SWITCH_IN_MERGER"),
    ], close="80")
    tx = {t.isin: t for t in _normalize_cas_data(_data(a, b)).transactions if t.txn_date.isoformat() == "2018-06-01"}
    assert tx["INF_A"].amount == tx["INF_B"].amount == Decimal("1000.00")
    assert tx["INF_B"].nav == Decimal("12.5000")


def test_conversion_from_opening_lot_is_marked():
    old = _scheme("HDFC Liquid Fund - Growth", "INF_OLD", [
        _t("2016-03-12", "Face Value Change - Units Debited", None, "-95800", None, "MISC"),
    ], open_="95800", close="0")
    new = _scheme("HDFC Liquid Fund - Growth", "INF_NEW", [
        _t("2016-03-12", "Face Value Change - Units Credited", None, "829.43", None, "MISC"),
    ], close="829.43")
    tx = [t for t in _normalize_cas_data(_data(old, new)).transactions if t.txn_date.isoformat() == "2016-03-12"]
    assert all(t.conversion_from_opening for t in tx) and all(t.amount == 0 for t in tx)
```

- [ ] **Step 2: Run, expect FAIL.** `python3 -m pytest tests/services/import_/test_parser.py -q`
- [ ] **Step 3: Implement** in `parser.py`:
  - Add `SchemeKey`, `scheme_key()`, the new fields and `key` properties above, plus `NormalizedTransaction.conversion_from_opening: bool = False`.
  - In `_normalize_cas_data`: key `scheme_map` with `scheme_key(folio.folio, folio.amc, scheme.isin, scheme.scheme)`; fill `open_units`, `close_units`, `valuation_*` from `scheme.open`, `scheme.close`, `scheme.valuation` (each via `to_decimal`, `None`-safe; `valuation.date` via `_parse_date`); record `balance=quantize_units(to_decimal(txn.balance))` when present.
  - Instead of `continue` on a missing amount/nav for a row with units, append it to `amountless[(folio.amc, txn_date)]` with its scheme key and raw type/description, then after the loop call `_pair_conversions(amountless, transactions, scheme_map, parse_warnings)`:

```python
_CONVERSION_TYPES = {"SWITCH_OUT", "SWITCH_OUT_MERGER", "SWITCH_IN", "SWITCH_IN_MERGER"}


def _is_conversion(raw_type: str, description: str) -> bool:
    # Corrected 2026-10-06: casparser labels amount-less "Face Value Change"
    # legs REDEMPTION/PURCHASE, so the description decides regardless of type.
    # Only ever applied to rows already missing amount AND NAV.
    key = str(raw_type).split(".")[-1].upper()
    desc = (description or "").lower()
    return key in _CONVERSION_TYPES or "face value" in desc or "merger" in desc


def _fifo_cost(rows: list[NormalizedTransaction], opening_units: Decimal, consume: Decimal) -> tuple[Decimal, bool]:
    """Cost of `consume` units taken FIFO from this scheme's lots before the
    conversion. Returns (cost, from_opening): from_opening is True when any
    consumed unit is from the opening lot, whose cost is only known after
    opening_balance prices it (preview time)."""
    lots: list[list[Decimal]] = [[opening_units, Decimal("-1")]] if opening_units > 0 else []
    for r in rows:
        if r.txn_type in (TransactionType.PURCHASE, TransactionType.PURCHASE_SIP, TransactionType.SWITCH_IN,
                          TransactionType.DIVIDEND_REINVEST):
            lots.append([r.units, r.nav])
        elif r.txn_type in (TransactionType.REDEMPTION, TransactionType.SWITCH_OUT):
            rem = r.units
            while rem > 0 and lots:
                take = min(lots[0][0], rem); lots[0][0] -= take; rem -= take
                if lots[0][0] == 0: lots.pop(0)
    cost, from_opening, rem = Decimal("0"), False, consume
    while rem > 0 and lots:
        take = min(lots[0][0], rem)
        if lots[0][1] < 0:
            from_opening = True
        else:
            cost += take * lots[0][1]
        lots[0][0] -= take; rem -= take
        if lots[0][0] == 0: lots.pop(0)
    return cost, from_opening
```

  `_pair_conversions` keeps only groups with exactly one out-leg (units < 0) and one in-leg (units > 0), both `_is_conversion`; computes `cost, from_opening = _fifo_cost(<out scheme's already-normalised rows dated before the conversion>, <out scheme open_units>, abs(out_units))`; builds two `NormalizedTransaction`s (out: `SWITCH_OUT`, in: `SWITCH_IN`, `amount=quantize_amount(cost)`, `nav=quantize_nav(cost/units)` or `0` when `from_opening`, `conversion_from_opening=from_opening`); inserts them into `transactions` in date order and increments both schemes' `transaction_count`. Every unpaired row gets today's "Skipped transaction … missing amount, units, or NAV" warning.
  - Drop schemes whose `open_units == 0`, `close_units in (None, 0)` and `transaction_count == 0` from the returned `schemes`.

- [ ] **Step 4: Run, expect PASS** — `test_parser.py` in full.

---

### Task 3: Hybrid opening cost

**Files:**
- Create: `backend/app/services/import_/opening_balance.py`
- Test: `backend/tests/services/import_/test_opening_balance.py` (new)

**Interfaces:**
- Consumes: `ParsedScheme` (Task 2), `NormalizedTransaction`, `CostSource`.
- Produces:

```python
@dataclass(frozen=True)
class OpeningLot:
    units: Decimal          # ParsedScheme.open_units
    start: date             # statement_from
    nav: Decimal            # cost per unit, quantize_nav
    amount: Decimal         # quantize_amount(units * nav)
    cost_source: CostSource

def price_opening_lot(
    scheme: ParsedScheme,
    txns: list[NormalizedTransaction],       # this scheme's in-period rows, date order
    start: date,
    nav_series: list[tuple[date, Decimal]] | None,   # fund NAV history (any order), None if unavailable
) -> OpeningLot | None                        # None when open_units == 0

def apply_opening_cost_to_conversions(lot: OpeningLot, txns: list[NormalizedTransaction], partner: dict[int, NormalizedTransaction]) -> None
```

Algorithm (artifact "Decided: the hybrid cost method"):
1. Simulate FIFO over `[opening lot (units U, cost unknown)] + txns`. Let `r` = opening units still held at the end, `held_in_period_cost` = cost of in-period lots still held.
2. If `r > 0` and `scheme.valuation_cost` is set: `c = (valuation_cost − held_in_period_cost) / r`.
3. Plausible when `c > 0` and, if `nav_series` has points before `start`, `min_nav_before ≤ c ≤ max_nav_before` (use the whole pre-start series). Without a pre-start series, plausible when `c > 0`.
4. Plausible → `cost_source=CAS_COST`. Otherwise → `c = NAV on or before start` from `nav_series`, `cost_source=NAV_ON_START`; if no series point on/before `start`, use the first in-period row's NAV, else `scheme.valuation_nav`, still `NAV_ON_START`.
5. `apply_opening_cost_to_conversions`: for every row with `conversion_from_opening=True` in this scheme, set `amount = quantize_amount(units_consumed_from_opening × lot.nav)` on the out-leg and the same amount on its paired in-leg (pairing passed in by index), recompute both `nav`s, clear the flag.

- [ ] **Step 1: Write the failing tests:**

```python
from datetime import date
from decimal import Decimal

from app.models.enums import CostSource, TransactionType
from app.services.import_.opening_balance import price_opening_lot
from app.services.import_.parser import NormalizedTransaction, ParsedScheme


def _s(open_units, cost, vnav="128.30"):
    return ParsedScheme(name="X", isin="INF1", amfi="1", scheme_type="EQUITY", folio="1/1", amc="A",
                        transaction_count=0, open_units=Decimal(open_units),
                        valuation_cost=Decimal(cost) if cost is not None else None, valuation_nav=Decimal(vnav))


def _t(d, type_, units, nav):
    u, n = Decimal(units), Decimal(nav)
    return NormalizedTransaction(folio="1/1", amc="A", scheme_name="X", isin="INF1", amfi="1", scheme_type="EQUITY",
                                 txn_date=d, txn_type=type_, description="", amount=(u * n).quantize(Decimal("0.01")), units=u, nav=n)


START = date(2016, 1, 1)
SERIES = [(date(2010, 1, 1), Decimal("20")), (date(2014, 3, 1), Decimal("85")), (date(2016, 1, 1), Decimal("90"))]  # pre-start range 20–85 (corrected 2026-10-06)


def test_cas_cost_when_no_in_period_activity():
    lot = price_opening_lot(_s("7251.691", "512000"), [], START, SERIES)
    assert lot.cost_source == CostSource.CAS_COST
    assert lot.nav == Decimal("70.6042")       # 512000 / 7251.691 = 70.60422… (corrected 2026-10-06)
    assert lot.units == Decimal("7251.691")


def test_cas_cost_minus_in_period_purchases_still_held():
    txns = [_t(date(2020, 1, 1), TransactionType.PURCHASE_SIP, "100", "50")]   # 5000 cost, still held
    lot = price_opening_lot(_s("1000", "45000"), txns, START, SERIES)
    assert lot.cost_source == CostSource.CAS_COST
    assert lot.nav == Decimal("40.0000")        # (45000 - 5000) / 1000


def test_implausible_cas_cost_falls_back_to_nav_on_start():
    lot = price_opening_lot(_s("1000", "500"), [], START, SERIES)   # 0.50/unit, below the pre-start min 20
    assert lot.cost_source == CostSource.NAV_ON_START and lot.nav == Decimal("90.0000")


def test_opening_consumed_falls_back_to_nav_on_start():
    txns = [_t(date(2018, 1, 1), TransactionType.REDEMPTION, "1000", "120")]
    lot = price_opening_lot(_s("1000", "0"), txns, START, SERIES)
    assert lot.cost_source == CostSource.NAV_ON_START


def test_missing_cas_cost_and_no_series_uses_valuation_nav():
    lot = price_opening_lot(_s("10", None, vnav="55.5"), [], START, None)
    assert lot.cost_source == CostSource.NAV_ON_START and lot.nav == Decimal("55.5000")


def test_zero_opening_returns_none():
    assert price_opening_lot(_s("0", "0"), [], START, SERIES) is None
```

Plus one test for `apply_opening_cost_to_conversions` using the two marked rows from Task 2's `test_conversion_from_opening_lot_is_marked` shape: after applying a lot with `nav=Decimal("10")`, the out-leg and in-leg amounts are both `958000.00` and the flag is cleared.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `opening_balance.py` per the algorithm (all `Decimal`; quantize with `quantize_nav`/`quantize_amount`; comment the plausibility rule with a pointer to the artifact's #1 box).
- [ ] **Step 4: Run, expect PASS.**

---

### Task 4: Preview prices opening lots; every `SchemeKey` uses ISIN

**Files:**
- Modify: `backend/app/services/import_/service.py:178-191,224,612-619` (`build_import_preview`, `_preview_response`)
- Modify: `backend/app/services/import_/confirm_people.py:95,233,241-242,291-292,373-376,401,616-633,639-643,666,707,736,745,756,801-803` (every `(folio, amc, scheme_name)` / `(s.folio, s.amc, s.name)` tuple)
- Test: `backend/tests/services/import_/test_service.py`, `backend/tests/services/import_/test_confirm_people.py`

**Interfaces:**
- Consumes: `ParsedScheme.key`, `NormalizedTransaction.key` (Task 2), `price_opening_lot`, `apply_opening_cost_to_conversions` (Task 3), `nav._fetch_nav_history(amfi_code) -> list[tuple[date, Decimal]]`.
- Produces: session key `"opening_lots": dict[str, OpeningLot]` (temp_id → lot); `SchemeMatchPreview.opening_units: str | None` (shown nowhere yet; used by phase 7's notice).

Rules:
- `key_to_temp[scheme.key] = temp_id`. `confirm_people.SchemeKey` is re-exported from `parser.py` (delete the local alias). `_person_raw_output` filters casparser JSON by `scheme_key(f["folio"], f["amc"], s.get("isin"), s.get("scheme"))`.
- In `build_import_preview`, after resolutions: for each scheme with `open_units > 0`, fetch `nav_series = await _fetch_nav_history(match.amfi_code)` when matched (catch `httpx.HTTPError` → `None`), then `price_opening_lot(scheme, txns_of_scheme, parse_result.statement_from, nav_series)`. If `statement_from` is `None`, skip opening lots and add the warning "Statement start date not found; earlier holdings couldn’t be added." Then `apply_opening_cost_to_conversions`.
- Fetches run with `asyncio.gather` (network only; no DB access inside the gather).

- [ ] **Step 1: Write the failing tests.** In `test_service.py`:

```python
async def test_build_preview_prices_opening_lots(tmp_path):
    result = sample_parse_result()                       # existing helper in this file
    scheme = result.schemes[0]
    scheme.open_units, scheme.valuation_cost = Decimal("100"), Decimal("4000")
    result.statement_from = date(2016, 1, 1)
    client = fake_client_confirming(scheme)              # existing fake MfApiClient helper
    with patch("app.services.import_.service._fetch_nav_history",
               new=AsyncMock(return_value=[(date(2015, 1, 1), Decimal("30")), (date(2015, 12, 31), Decimal("45"))])):
        preview = await build_import_preview(result, "cas.pdf", b"%PDF", client)
    lot = _preview_sessions[preview.session_id]["opening_lots"][preview.schemes[0].temp_id]
    assert lot.cost_source == CostSource.CAS_COST and lot.nav == Decimal("40.0000")


async def test_build_preview_keys_schemes_by_isin():
    result = two_same_name_schemes_result()              # build inline: two ParsedScheme, same name, ISINs A and B
    preview = await build_import_preview(result, "cas.pdf", b"%PDF", fake_client())
    assert len({s.temp_id for s in preview.schemes}) == 2
```

(Name the helpers after what `test_service.py` already has; where a helper doesn't exist, write it inline in the test.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the edits listed in **Files**. Import `_fetch_nav_history` into `service.py` (`from app.services.dashboard.nav import _fetch_nav_history`) so tests can patch `app.services.import_.service._fetch_nav_history`.
- [ ] **Step 4: Run** `test_service.py`, `test_confirm_people.py`, `tests/api/test_imports_people_routes.py`, `tests/api/test_imports_routes.py` (the key change touches all of them) and fix fallout.

---

### Task 5: Confirm writes opening balances (folios per scheme, earliest-statement rule)

**Files:**
- Modify: `backend/app/services/import_/confirm_people.py` (`_write_person_rows`, `_confirm_claimed`)
- Modify: `backend/app/services/import_/coverage_gap.py:118-160` (`create_opening_balance` sets origin/cost_source manual)
- Test: `backend/tests/services/import_/test_confirm_people.py`, `backend/tests/services/import_/test_coverage_gap.py`

**Interfaces:**
- Consumes: session `opening_lots` (Task 4), `Transaction.origin/cost_source` (Task 1).
- Produces: `_apply_opening_rule(db, folio: Folio, lot: OpeningLot | None, statement_from: date | None, import_rec: Import) -> Literal["written","replaced","skipped","removed","none"]`.

Rule (artifact diagram "Rule when several statements are uploaded"), per scheme in the person's work, after its folio exists:

```
existing = this folio's rows with origin = cas_opening (at most one)
if statement_from is not None and existing and existing.date > statement_from:
    delete existing                      # this file covers from earlier
    existing = None                      # → "removed" unless a new lot is written below
if lot is None: return "removed" if deleted else "none"
if existing:                             # existing.date <= statement_from
    return "skipped"
if any row of this folio with origin in (cas_row, manual) and date < statement_from:
    return "removed" if deleted else "skipped"   # history before S already saved (corrected 2026-10-06)
write OPENING_BALANCE(lot) with origin=cas_opening, import_id=import_rec.id
return "replaced" if deleted else "written"
```

- Folios are created for **every** scheme key in `work.scheme_keys` (so a fund with only an opening balance is saved), before the transaction loop. Move folio get-or-create into `_folio_for(db, member, scheme_key, ...)` used by both.
- Opening rows count toward `added`. A "replaced"/"removed" old row is deleted with `db.delete(row)`; the import that wrote it keeps its other rows.
- The phase-1 `_all_rows_exist` also returns False when the rule would change anything — verdict `written`, `replaced` or `removed` (call the rule in a dry-run mode, `dry_run=True` returns the verdict without writing; only `skipped`/`none` count as unchanged). Corrected 2026-10-06: `removed` was missing.

- [ ] **Step 1: Write the failing tests** (append to `test_confirm_people.py`; they reuse its `_user`, `_member`, `_start`, `_confirm`, `ADITI_PAN` and `family_result`):

```python
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from app.models.enums import CostSource, TransactionOrigin, TransactionType
from app.models.transaction import Transaction


def _solo(*, open_units="0", start, cost="0", rows=()):
    """One person, one fund (folio 1001/1): opening `open_units` at `start`,
    then `rows` = [(date, units)] purchases at NAV 50."""
    result = family_result([{"name": "ADITI SHARMA", "pan": ADITI_PAN}])
    scheme, tmpl = result.schemes[0], result.transactions[0]
    scheme.open_units, scheme.valuation_cost = Decimal(open_units), Decimal(cost)
    scheme.valuation_nav = Decimal("50")
    result.statement_from = start
    result.transactions = [
        replace(tmpl, txn_date=d, units=Decimal(u), nav=Decimal("50.0000"), amount=Decimal(u) * 50)
        for d, u in rows
    ]
    scheme.transaction_count = len(result.transactions)
    return result


def _upload(db, me, result):
    with patch("app.services.import_.service._fetch_nav_history", new=AsyncMock(return_value=None)):
        preview = _start(db, me, result)
    return _confirm(db, preview, me.user_id)


def _openings(db):
    return db.query(Transaction).filter_by(origin=TransactionOrigin.CAS_OPENING).all()


def test_fund_with_only_opening_balance_is_saved(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    response = _upload(db_session, me, _solo(open_units="7251.691", cost="362584.55", start=date(2016, 1, 1)))
    [row] = _openings(db_session)
    assert row.type == TransactionType.OPENING_BALANCE and row.date == date(2016, 1, 1)
    assert row.units == Decimal("7251.691") and row.cost_source == CostSource.CAS_COST
    assert response.added == 1


def test_opening_rule_skips_when_real_rows_before_start(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    _upload(db_session, me, _solo(start=date(2006, 1, 1), rows=[(date(2006, 2, 1), "100")]))      # 20-year
    # A new FY row keeps this from being "already imported" (phase 1's rule).
    _upload(db_session, me, _solo(open_units="100", cost="5000", start=date(2026, 4, 1),
                                  rows=[(date(2026, 5, 1), "1")]))                                  # FY
    assert _openings(db_session) == []


def test_opening_rule_longer_statement_replaces_and_removes(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    _upload(db_session, me, _solo(open_units="100", cost="5000", start=date(2026, 4, 1)))          # FY first
    assert len(_openings(db_session)) == 1
    _upload(db_session, me, _solo(start=date(2006, 1, 1), rows=[(date(2006, 2, 1), "100")]))      # 20-year, open 0
    assert _openings(db_session) == []


def test_opening_rule_earlier_start_replaces(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    _upload(db_session, me, _solo(open_units="100", cost="5000", start=date(2026, 4, 1)))
    _upload(db_session, me, _solo(open_units="60", cost="3000", start=date(2016, 1, 1),
                                  rows=[(date(2020, 1, 1), "40")]))
    [row] = _openings(db_session)
    assert row.date == date(2016, 1, 1) and row.units == Decimal("60")


def test_manual_opening_row_is_never_replaced(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    _upload(db_session, me, _solo(start=date(2026, 4, 1), rows=[(date(2026, 5, 1), "1")]))
    folio = db_session.query(Folio).one()
    imp = db_session.query(Import).one()
    db_session.add(Transaction(id=uuid.uuid4(), folio_id=folio.id, import_id=imp.id, type=TransactionType.OPENING_BALANCE,
                               date=date(2015, 1, 1), amount=Decimal("100"), units=Decimal("10"), nav=Decimal("10"),
                               origin=TransactionOrigin.MANUAL, cost_source=CostSource.MANUAL))
    db_session.commit()
    _upload(db_session, me, _solo(open_units="60", cost="3000", start=date(2016, 1, 1),
                                  rows=[(date(2020, 1, 1), "1")]))
    assert db_session.query(Transaction).filter_by(origin=TransactionOrigin.MANUAL).count() == 1
```

In `test_coverage_gap.py`, extend its existing `create_opening_balance` test with `assert txn.origin == TransactionOrigin.MANUAL and txn.cost_source == CostSource.MANUAL`.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the rule and folio-per-scheme creation. Every `Transaction(...)` written from CAS rows sets `origin=TransactionOrigin.CAS_ROW`.
- [ ] **Step 4: Run, expect PASS** (`test_confirm_people.py`, `test_coverage_gap.py`, `tests/api/test_imports_people_routes.py`).

---

### Task 6: Calculations count the opening lot

**Files:**
- Modify: `backend/app/services/dashboard/holdings.py:29`, `backend/app/services/dashboard/cash_flow.py:21`
- Modify: `backend/app/services/dashboard/schemas.py` (`HoldingRow`), `holdings.py` (fill `opening_lot`)
- Modify: `backend/app/services/analytics/benchmark.py` (wherever it builds investment cash flows from `_DEBIT_TYPES`; grep `PURCHASE_SIP` there)
- Test: `backend/tests/services/dashboard/test_holdings.py`, `test_cash_flow.py`, `test_xirr.py`, analytics benchmark tests

**Interfaces:**
- Produces: `_LOT_ADDING_TYPES` includes `OPENING_BALANCE`; `cash_flow._DEBIT_TYPES` includes `OPENING_BALANCE` (so `xirr._RELEVANT_TYPES` does too); `HoldingRow.opening_lot: OpeningLotInfo | None` where

```python
class OpeningLotInfo(BaseModel):
    units: str              # units of the CAS opening lot (as written, not net of later sales)
    since: date             # its date (statement start)
    cost_source: Literal["cas_cost", "nav_on_start", "manual"]
```

Present when any folio in the row has an `origin=cas_opening` row; for several folios, the earliest `since` and summed `units`; `cost_source` is `nav_on_start` if any folio's is.

- [ ] **Step 1: Write the failing tests:**

```python
def test_process_folio_lots_counts_opening_balance():
    txns = [
        _txn(TransactionType.OPENING_BALANCE, date(2016, 1, 1), Decimal("512000.00"), Decimal("7251.691"), Decimal("70.6040")),
        _txn(TransactionType.REDEMPTION, date(2020, 1, 1), Decimal("100000.00"), Decimal("1000.000"), Decimal("100.0000")),
    ]
    units, cost, realized = _process_folio_lots(txns)
    assert units == Decimal("6251.691")
    assert realized == Decimal("1000.000") * (Decimal("100.0000") - Decimal("70.6040"))
```

In `test_cash_flow.py`: an `OPENING_BALANCE` row appears as a `debit` entry. In `test_xirr.py`: a portfolio with only an opening lot on 2016-01-01 (cost 100,000) and value 200,000 today has a positive lifetime XIRR (not `None`). In `test_holdings.py`: `compute_holdings` returns `opening_lot == {"units": "7251.691", "since": date(2016,1,1), "cost_source": "cas_cost"}` for a folio with a `cas_opening` row.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Add the type to both sets; update the module docstrings (`cash_flow.py` says opening balances are investment outflows on the statement start — #1). Fill `opening_lot` in `compute_holdings` from the already-loaded `transactions_by_folio` (no new query).
- [ ] **Step 4: Run, expect PASS** — the four test files plus `grep -rln "_DEBIT_TYPES\|_LOT_ADDING_TYPES" backend/app backend/tests` callers' tests.

---

### Task 7: Frontend — "units from before [date]"

**Files:**
- Modify: `frontend/src/features/dashboard/types.ts` (`HoldingRow.opening_lot?`), `features/dashboard/FundDetailModal.tsx`, `mobile/features/holdings/MobileFundDetailView.tsx`
- Test: `features/dashboard/FundDetailModal.test.tsx`

Copy (in-pass version, artifact #1 "In this pass"): under Units held, "incl. {units} units from before {d MMM yyyy}"; under the holding period, "held since at least {d MMM yyyy}"; a small "cost approximate" tag next to Invested when `cost_source === "nav_on_start"`. **No** "Bought ~" line.

- [ ] **Step 1: Write the failing test:**

```tsx
it("shows the opening-lot facts and the approximate-cost tag", () => {
  render(<FundDetailModal isOpen onClose={() => {}} holding={{ ...baseHolding,
    opening_lot: { units: "7251.691", since: "2016-01-01", cost_source: "nav_on_start" } }} />);
  expect(screen.getByText("incl. 7,251.691 units from before 1 Jan 2016")).toBeInTheDocument();
  expect(screen.getByText("held since at least 1 Jan 2016")).toBeInTheDocument();
  expect(screen.getByText("cost approximate")).toBeInTheDocument();
  expect(screen.queryByText(/Bought ~/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2–4:** implement with the existing date and Indian-number formatters; run the test file and `npx tsc -b`.

---

### Task 8: Checkpoint — opening balances match on every lookback

- [ ] **Step 1:** Re-run the phase-1 baseline loop (same scenario list, outputs to `/tmp/p2_*.json`).
- [ ] **Step 2:** Required results, recorded in `Docs/orchestration/2026-10-06-cas-import-baseline.md` under "After phase 2":
  - p20 FY / 1yr / 3yr / 7yr / 10yr / 20yr: dashboard value equals the CAS value within ₹1 per fund, **except** funds affected by #2/#3 (twin SIPs, bounced SIPs, bonus, gift, IDCW payout). List those exceptions explicitly; they're phase 3's.
  - `p20_FY.pdf,p20_20yr.pdf` and `p20_20yr.pdf,p20_FY.pdf`: identical final units, no `cas_opening` rows left in the first order, none written in the second.
  - `px_14yr.pdf`: value no longer ₹16.2 Cr; HDFC Liquid old ISIN ends at 0 units, new ISIN holds the converted units.
  - No scenario's `match` count is lower than its phase-1 baseline.
- [ ] **Step 3:** If any required result fails, stop and fix before phase 3.
