# CAS Import Fixes — Phase 6: Calculations, Portfolio History, TER, Display Polish, Persisted Sessions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If any task is delegated to Codex, the `model-orchestration` skill governs it (handoff doc + adversarial review gate).

**Goal:** With complete rows in place (phases 2–5), make every number derived from them right — realised gains of sold funds (#9), XIRR with switches and payouts (#10), active SIPs with the 3-missed-months rule (#11), a fast, fresh monthly history on its own page (#12), hero totals with realised and today's gain (#14), honest distributor/TER labels and full TER coverage (#17), the small display fixes (#18) — and make the review session survive a deploy, crash or the 9 PM stop (#23).

**Architecture:**
- One reusable FIFO engine (`FifoState`) behind `_process_folio_lots`, so holdings, realised summaries and month-by-month history all apply rows identically.
- Snapshots are rebuilt in one pass per member (NAV history loaded once, month-ends walked, one batched insert), invalidated on every confirm/delete/merge and rebuilt in a FastAPI background task; months with a missing NAV are kept and flagged `is_partial`.
- The review session is written through to an `imports` row (`status=previewing`, `preview_state` = AES-GCM-encrypted JSON of the whole session, PDF included) on every mutation; the in-memory dict stays the fast path and is repopulated from the row after a restart.
- Frontend: a top-nav "History" tab (desktop), a "History ›" row on the mobile dashboard value card, realised/today's gain in the hero, a Sold funds section.

**Tech Stack:** FastAPI (BackgroundTasks) + SQLAlchemy 2 + Alembic, `cryptography` AES-GCM (existing `crypto.py` key), React 19 + TypeScript + Vitest, hand-rolled SVG chart (no chart library is installed; see `DEFERRED_FEATURES.md` appendix on `@bklit`).

**Spec:** `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` #9, #10, #11 (decided rule), #12 (separate page; desktop tab, mobile from dashboard — decided 6 Oct), #14, #17, #18, #23. Master index Global Constraints apply.

## Global Constraints

See the master index. Additionally:
- Migration **`0029_snapshot_fields_and_preview_sessions`** (down_revision `0028`).
- **SIP rule (decided 6 Oct):** a SIP series is *stopped* when more than 3 expected monthly instalments are missing; it is *active* again as soon as a later upload adds an instalment. Status is derived per request, never stored. Missed instalments are counted against the **latest statement end date** covering that folio (falls back to today when unknown) — *plan decision, recorded:* counting against today would mark every SIP "stopped" for a user who simply hasn't uploaded for four months; the CAS can only prove a missed instalment up to its own end date.
- **SIP series (plan decision, recorded):** within a folio, SIP rows are grouped by exact instalment amount; a month with *k* rows of that amount is *k* parallel SIPs of that amount (the twin case). A step-up shows as a new series and the old one stops after 3 months — acceptable and visible.
- **Preview blob:** `preview_state` holds raw PANs (pending claims, people) and the PDF bytes, so it is stored only encrypted (`crypto.encrypt_bytes`), never as plain JSON, and never logged. Rows expire with the existing 60-minute TTL; the sweep deletes them.
- **TER (deviation from the artifact, see phase 5):** match by exact normalised `base_name` within the AMC, then pick `D_TER`/`R_TER` by `schemes.plan_type`.

## Review Focus

1. **A deploy between upload and Continue.** Confirm after the restart succeeds and writes exactly once; a second Continue gets 410. Test: `test_confirm_after_restart_uses_persisted_session` (Task 8).
2. **A user whose last upload was 5 months ago.** Their SIPs aren't all "stopped" — missed instalments are counted only up to the statement end. Test: `test_missed_counted_to_statement_end_not_today` (Task 5).
3. **A month where one held fund has no NAV.** The month is kept, flagged partial, and the fund is named; total excludes only that fund. Test: `test_partial_month_kept_and_flagged` (Task 6).
4. **History requested right after a confirm, before the background rebuild finishes.** Never stale numbers: the endpoint computes synchronously when rows are missing, and the rebuild is idempotent. Test: `test_snapshots_after_confirm_are_fresh` (Task 6).
5. **A fully sold fund with a loss.** Shows in Sold funds with a negative realised gain; the hero's realised total includes it. Test: `test_realized_summary_includes_zero_unit_folios` (Task 3), `shows sold funds with losses` (Task 9).

---

## File map

Backend: `models/snapshot.py`, `models/imports.py`, `models/enums.py` (`ImportStatus.PREVIEWING`), migration `0029`; `services/dashboard/holdings.py` (`FifoState`, `compute_realized_summary`, `stale_nav`), `xirr.py`, `sip.py`, `snapshots.py`, `distributor_comparison.py`, `schemas.py`, `aggregate.py`; `services/analytics/amfi_ter_client.py`; `services/import_/crypto.py` (`encrypt_bytes`/`decrypt_bytes`), new `services/import_/preview_store.py`, `service.py`, `confirm_people.py`; `api/dashboard.py`, `api/imports.py`; `services/dashboard/member_merge.py`, `services/import_/deletion.py` (call the rebuild trigger).

Frontend: `features/dashboard/{types,api,DashboardView,HoldingsTable}.ts(x)`, new `features/dashboard/SoldFundsSection.tsx`, new `features/history/{HistoryView,HistoryChart,api}.tsx`, `features/dashboard/{NavigationShell,MainDashboardFlow}.tsx`, mobile `features/dashboard/MobileDashboardView.tsx`, new `mobile/features/history/MobileHistoryView.tsx`, `features/analytics/{TerSection,BenchmarkSection}.tsx`, `components/FundSignal.tsx`, `features/dashboard/DistributorComparisonModal.tsx`, mobile distributor view.

---

### Task 1: Migration 0029

**Files:**
- Modify: `backend/app/models/snapshot.py`, `backend/app/models/imports.py`, `backend/app/models/enums.py` (`ImportStatus`)
- Create: `backend/alembic/versions/0029_snapshot_fields_and_preview_sessions.py`
- Test: `backend/tests/test_migrations.py`

**Interfaces:**
- `PortfolioSnapshot` gains `invested_value: Decimal | None` (`Numeric(18,2)`), `is_partial: bool` (default False), `missing_scheme_ids: list[str] | None` (JSON/JSONB), `data_version: int` (default 0; epoch milliseconds of the member's latest import `confirmed_at` when computed).
- `ImportStatus.PREVIEWING = "previewing"`; `Import.preview_state: str | None` (Text, encrypted base64).

- [ ] **Step 1: Write the failing test** (pattern: `test_0021_...`): upgrade 0028 → 0029 adds the four snapshot columns and `imports.preview_state`; inserting an import with `status='previewing'` works; downgrade to 0028 removes the columns (Postgres keeps the enum value, per 0010's documented precedent).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Postgres: `ALTER TYPE importstatus ADD VALUE IF NOT EXISTS 'previewing'`; `add_column`s with server defaults; downgrade first `DELETE FROM imports WHERE status = 'previewing'` (they're transient) then drops columns.
- [ ] **Step 4: Run, expect PASS.**

---

### Task 2: `FifoState` — one FIFO engine

**Files:**
- Modify: `backend/app/services/dashboard/holdings.py:76-104`
- Test: `backend/tests/services/dashboard/test_holdings.py` (existing `_process_folio_lots` tests must pass unchanged)

**Interfaces:**
- Produces:

```python
class FifoState:
    """Lots of one folio. apply() is the only place row types change lots."""
    def __init__(self) -> None: ...
    def apply(self, txn: Transaction) -> None: ...
    @property
    def units(self) -> Decimal: ...
    @property
    def cost(self) -> Decimal: ...
    realized_gain: Decimal

def _process_folio_lots(transactions: list[Transaction]) -> tuple[Decimal, Decimal, Decimal]:
    state = FifoState()
    for t in transactions:
        state.apply(t)
    return state.units, state.cost, state.realized_gain
```

`apply` contains exactly the rules from phases 2–3 (adding, consuming with gain, gift-out without gain, reversal).

- [ ] **Step 1: Write the failing test:**

```python
def test_fifo_state_incremental_matches_batch():
    txns = [
        _txn(TransactionType.PURCHASE, date(2024, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000")),
        _txn(TransactionType.REDEMPTION, date(2024, 6, 1), Decimal("3000.00"), Decimal("50.000"), Decimal("60.0000")),
    ]
    state = FifoState()
    state.apply(txns[0])
    assert (state.units, state.cost) == (Decimal("100.000"), Decimal("5000.00"))
    state.apply(txns[1])
    assert (state.units, state.cost, state.realized_gain) == _process_folio_lots(txns)
```

- [ ] **Step 2–4:** implement; run `test_holdings.py`, `test_sip.py`, `test_snapshots.py`.

---

### Task 3: Realised gains of every fund (#9)

**Files:**
- Modify: `backend/app/services/dashboard/holdings.py` (new `compute_realized_summary`), `schemas.py` (`RealizedFund`, `RealizedSummary`, `MemberHoldingsResponse.realized_summary`, aggregate response), `aggregate.py`, `api/dashboard.py` (member and aggregate holdings routes)
- Test: `test_holdings.py`, `tests/api/test_dashboard_routes.py`

**Interfaces:**

```python
class RealizedFund(BaseModel):
    scheme_id: str
    scheme_name: str
    household_member_id: str
    household_member_name: str
    plan_type: PlanType
    realized_gain: str
    fully_sold: bool

class RealizedSummary(BaseModel):
    total: str
    funds: list[RealizedFund]          # every (member, scheme, plan) with a non-zero realised gain

def compute_realized_summary(db: Session, household_member_ids: list[uuid.UUID]) -> RealizedSummary
```

Uses the same grouping and query as `compute_holdings` (factor the shared "load folios + ordered transactions" into `_load_folio_transactions(db, ids)`), no NAV calls, so it's cheap. `MemberHoldingsResponse` and the aggregate holdings response gain `realized_summary`.

- [ ] **Step 1: Write the failing tests:**

```python
def test_realized_summary_includes_zero_unit_folios(db):
    member = _household_member(db)
    sold = _scheme(db, "Franklin Low Duration", amfi_code="1001")
    held = _scheme(db, "PPFAS Flexi Cap", amfi_code="1002")
    f1, f2 = _folio(db, member, sold), _folio(db, member, held, folio_number="9/9")
    _persisted_txn(db, f1, TransactionType.PURCHASE, date(2019, 1, 1), Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000"))
    _persisted_txn(db, f1, TransactionType.REDEMPTION, date(2021, 1, 1), Decimal("800.00"), Decimal("100.000"), Decimal("8.0000"))
    _persisted_txn(db, f2, TransactionType.PURCHASE, date(2019, 1, 1), Decimal("1000.00"), Decimal("100.000"), Decimal("10.0000"))
    _persisted_txn(db, f2, TransactionType.REDEMPTION, date(2021, 1, 1), Decimal("750.00"), Decimal("50.000"), Decimal("15.0000"))
    summary = compute_realized_summary(db, [member.id])
    by_name = {f.scheme_name: f for f in summary.funds}
    assert Decimal(by_name["Franklin Low Duration"].realized_gain) == Decimal("-200") and by_name["Franklin Low Duration"].fully_sold
    assert Decimal(by_name["PPFAS Flexi Cap"].realized_gain) == Decimal("250") and not by_name["PPFAS Flexi Cap"].fully_sold
    assert Decimal(summary.total) == Decimal("50")
```

(`_household_member`, `_scheme`, `_folio`, `_persisted_txn` are this file's existing helpers.) Route test: `GET /household-members/{id}/holdings` returns `realized_summary.total`.

- [ ] **Step 2–4:** implement; run both files.

---

### Task 4: XIRR with switches and payouts (#10)

**Files:**
- Modify: `backend/app/services/dashboard/xirr.py`, `backend/app/services/analytics/benchmark.py:62-135`
- Test: `test_xirr.py`, `tests/services/analytics/test_benchmark.py`

**Rules:**
- Lifetime XIRR: debit = purchase, SIP, opening balance, gift-in (value); credit = redemption, payout, reversal, gift-out (value); switches excluded (they cancel inside the portfolio). (Payouts reach the table since phase 3.)
- Current-holdings XIRR (schemes still held): additionally `SWITCH_IN` is a debit and `SWITCH_OUT` a credit, so units that arrived by STP/merger carry their cost.
- `benchmark.py`'s fund-level flows use the same sets (import them from `xirr.py`; delete its private copies).

- [ ] **Step 1: Write the failing test** (known answer from the artifact's pk case, shrunk):

```python
def test_current_holdings_xirr_counts_switch_in_cost(db):
    member = _member(db)
    liquid, midcap = _scheme(db, "Axis Liquid", "2001"), _scheme(db, "Axis Mid Cap", "2002")
    fl, fm = _folio(db, member, liquid), _folio(db, member, midcap, "2/2")
    _txn_db(db, fl, TransactionType.PURCHASE, date(2020, 1, 1), "100000.00", "100.000", "1000.0000")
    _txn_db(db, fl, TransactionType.SWITCH_OUT, date(2020, 1, 2), "100000.00", "100.000", "1000.0000")
    _txn_db(db, fm, TransactionType.SWITCH_IN, date(2020, 1, 2), "100000.00", "1000.000", "100.0000")
    holdings = [holding_row(scheme=midcap, member=member, units="1000.000", current_value="200000")]
    summary = calculate_dashboard_xirr(db, [member.id], holdings)
    # 100k → 200k over ~6.76 years ≈ 10.8%; without the switch-in it was a huge number
    assert Decimal("0.09") < Decimal(summary.current_holdings_xirr) < Decimal("0.13")
```

(Use `test_xirr.py`'s existing builders; add `holding_row` beside them if missing — a `HoldingRow` with the given fields and defaults.)

- [ ] **Step 2–4:** implement; run both files.

---

### Task 5: Active SIPs — series and the 3-missed-months rule (#11)

**Files:**
- Modify: `backend/app/services/dashboard/sip.py` (module docstring, `compute_active_sips`, `compute_sips_for_month`), `schemas.py` (`SipRow` gains `series_count: int = 1`, `status: Literal["active","stopped"]`; new `SipSummary(total_monthly: str)`), `api/dashboard.py` (SIP routes return stopped ones only when `?include_stopped=true`)
- Modify: `Docs/superpowers/specs/2026-08-18-active-sips-cadence-redesign-design.md` (append a "Superseded 2026-10-06" section with the decided rule)
- Test: `backend/tests/services/dashboard/test_sip.py`

**Interfaces:**
- `sip_series(transactions: list[Transaction]) -> list[SipSeries]` where `SipSeries(amount: Decimal, parallel: int, last_date: date, first_date: date)`.
- `missed_instalments(last_date: date, reference: date) -> int` = `(ref.year − last.year) × 12 + (ref.month − last.month) − 1`, floored at 0.
- `reference` per folio = max `statement_to_date` of the CONFIRMED imports linked to that folio's rows (via `transaction_imports`, phase 4), else `date.today()`.
- Active when `missed_instalments(...) <= 3` and the folio still holds units.

- [ ] **Step 1: Write the failing tests:**

```python
@pytest.mark.parametrize("last, ref, missed", [
    (date(2026, 9, 5), date(2026, 10, 6), 0),
    (date(2026, 6, 5), date(2026, 10, 6), 3),
    (date(2026, 5, 5), date(2026, 10, 6), 4),
])
def test_missed_instalments(last, ref, missed):
    assert missed_instalments(last, ref) == missed


def test_stopped_after_more_than_three_missed(db):
    folio = sip_folio(db, sip_dates=[date(2013, m, 5) for m in range(1, 13)], statement_to=date(2026, 10, 5))
    assert compute_active_sips(db, [folio.household_member_id]) == []


def test_resumed_sip_is_active_again(db):
    dates = [date(2026, 1, 5), date(2026, 2, 5), date(2026, 9, 5)]       # 6-month gap, then a new instalment
    folio = sip_folio(db, sip_dates=dates, statement_to=date(2026, 10, 5))
    [row] = compute_active_sips(db, [folio.household_member_id])
    assert row.status == "active" and row.sip_date == date(2026, 9, 5)


def test_twin_sips_are_two_parallel(db):
    folio = sip_folio(db, sip_dates=[date(2026, 9, 5), date(2026, 9, 5)], amount="42968.00", statement_to=date(2026, 10, 5))
    [row] = compute_active_sips(db, [folio.household_member_id])
    assert row.series_count == 2 and row.sip_amount == "42968.00"


def test_missed_counted_to_statement_end_not_today(db):
    folio = sip_folio(db, sip_dates=[date(2026, 4, 5)], statement_to=date(2026, 5, 5))   # uploaded long ago
    with freeze_today(date(2026, 10, 6)):
        assert len(compute_active_sips(db, [folio.household_member_id])) == 1
```

Write `sip_folio(db, sip_dates, amount="5000.00", statement_to)` in the test file: creates member, scheme, folio, one CONFIRMED import with `statement_to_date=statement_to`, SIP rows linked to it via `TransactionImport`, then one purchase so units > 0. `freeze_today`: patch `app.services.dashboard.sip.date` with a subclass whose `today()` returns the given date (the file's existing tests may already do this — reuse).

- [ ] **Step 2–4:** implement; run `test_sip.py` and `tests/api/test_dashboard_routes.py -k sip`.

---

### Task 6: Snapshots — bulk, fresh, partial months (#12 backend)

**Files:**
- Modify: `backend/app/services/dashboard/snapshots.py` (rewrite `get_snapshots`; keep `invalidate_member_snapshots`), `schemas.py` (`SnapshotRow` gains `invested_value: str | None`, `is_partial: bool`, `missing_scheme_names: list[str]`)
- Modify: `backend/app/services/import_/confirm_people.py` (`_confirm_claimed` calls `invalidate_member_snapshots(db, touched)` before commit), `backend/app/api/imports.py` (confirm route schedules `rebuild_member_snapshots` in `background_tasks` for every touched member), `deletion.py` and `member_merge.py` (schedule the same after their commits; they already invalidate)
- Test: `backend/tests/services/dashboard/test_snapshots.py`, `tests/api/test_imports_people_routes.py`

**Interfaces:**
- `async def rebuild_member_snapshots(member_id: uuid.UUID) -> int` — opens its own `SessionLocal()`, computes every month-end from the member's first transaction to the last completed month, replaces that member's rows in one transaction, returns rows written. Safe to run twice.
- `async def get_snapshots(db, member_ids)` — reads rows; for a member with no rows **or** rows whose `data_version` is older than the member's latest import `confirmed_at`, computes in-request with the same bulk function (then persists).
- Bulk algorithm:

```python
async def _compute_member_months(db, member_id) -> list[PortfolioSnapshot]:
    folios, by_folio = _load_folio_transactions(db, [member_id])          # Task 3 helper
    schemes = {s.id: s for s in db.query(Scheme).filter(Scheme.id.in_({f.scheme_id for f in folios}))}
    await warm_nav_history(db, [s for s in schemes.values() if s.amfi_code])   # existing: fills nav_history
    series = {sid: sorted((r.date, r.nav) for r in db.query(NavHistory).filter_by(scheme_id=sid)) for sid in schemes}
    events = sorted((t.date, f.id, t) for f in folios for t in by_folio.get(f.id, []))
    states = {f.id: FifoState() for f in folios}
    out, i = [], 0
    for month_end in _iter_month_ends(events[0][0], last_completed_month_end()):
        while i < len(events) and events[i][0] <= month_end:
            states[events[i][1]].apply(events[i][2]); i += 1
        value, invested, missing = Decimal(0), Decimal(0), []
        for f in folios:
            st = states[f.id]
            if st.units == 0:
                continue
            invested += st.cost
            nav = _nav_on_or_before(series[f.scheme_id], month_end)       # bisect
            if nav is None:
                missing.append(str(f.scheme_id))
                continue
            value += st.units * nav
        out.append(PortfolioSnapshot(household_member_id=member_id, snapshot_month=month_end, total_value=value,
                                     invested_value=invested, is_partial=bool(missing),
                                     missing_scheme_ids=missing or None, data_version=_data_version(db, member_id),
                                     computed_at=datetime.now(timezone.utc)))
    return out
```

(Same-date ordering inside `events`: sort key `(date, consuming-after-adding, id)` exactly like `compute_holdings`.)

- [ ] **Step 1: Write the failing tests:**

```python
def test_partial_month_kept_and_flagged(db):
    member, f_ok, f_missing = two_fund_member(db)           # both bought 2024-01-10
    seed_nav(db, f_ok.scheme_id, date(2024, 1, 31), "20")   # no NAV at all for f_missing's scheme
    rows = asyncio.run(get_snapshots(db, [member.id]))
    jan = next(r for r in rows if r.snapshot_month == date(2024, 1, 31))
    assert jan.is_partial and jan.missing_scheme_names == ["Missing NAV Fund"]
    assert Decimal(jan.total_value) == Decimal("20") * Decimal("10")


def test_snapshots_after_confirm_are_fresh(db):
    member, folio = one_fund_member(db, bought=date(2024, 1, 10), units="10")
    seed_nav(db, folio.scheme_id, date(2024, 1, 31), "20")
    asyncio.run(get_snapshots(db, [member.id]))
    add_import_with_purchase(db, folio, date(2024, 1, 15), units="5", confirmed_at=datetime.now(timezone.utc))
    rows = asyncio.run(get_snapshots(db, [member.id]))
    jan = next(r for r in rows if r.snapshot_month == date(2024, 1, 31))
    assert Decimal(jan.total_value) == Decimal("300")


def test_bulk_query_count_is_bounded(db):
    member = twenty_year_member(db, funds=10)               # 10 funds, monthly SIPs 2006–2026
    with count_queries(db) as n:
        asyncio.run(get_snapshots(db, [member.id]))
    assert n.count < 200                                     # was ~139,000 for the 20-year persona
```

Write the builder helpers in the test file (they're plain inserts like `test_holdings.py`'s helpers; `seed_nav` inserts `NavHistory`; `count_queries` hooks SQLAlchemy's `before_cursor_execute` event). Patch `warm_nav_history` to a no-op in these tests.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** The confirm route already takes `background_tasks: BackgroundTasks`; add `background_tasks.add_task(rebuild_member_snapshots, member_id)` per touched member after a successful confirm.
- [ ] **Step 4: Run, expect PASS** (`test_snapshots.py`, `test_imports_people_routes.py -k confirm`, `test_deletion.py`, `test_member_merge.py`).

---

### Task 7: TER coverage, distributor comparison, stale NAV (#17, #18 backend)

**Files:**
- Modify: `backend/app/services/analytics/amfi_ter_client.py:232-330` (`refresh_ter_data`, `_best_match`)
- Modify: `backend/app/services/dashboard/distributor_comparison.py` (labels by `plan_type`; per-fund comparison against the Regular sibling found via `(amc_name, base_name, plan_type=regular)`; skip zero-unit folios; return `nav_unavailable_schemes: list[str]`)
- Modify: `backend/app/services/dashboard/holdings.py` (`HoldingRow.stale_nav = current_nav_date < today − 4 days`)
- Test: `tests/services/analytics/test_amfi_ter_client.py`, `tests/services/dashboard/test_distributor_comparison.py`, `test_holdings.py`

**Rules (TER):** for each held scheme with `plan_type` set: find the TER row whose `_normalize_scheme_name(Scheme_Name) == _normalize_scheme_name(scheme.base_name)` within rows of the same AMC (AMFI's TER rows carry the AMC in `MF_Name`/`Mutual_Fund`; check the live field name in the test fixture and use it); no exact hit → today's fuzzy `_best_match` restricted to that AMC with `MIN_MATCH_CONFIDENCE`; value `D_TER` for direct, `R_TER` for regular. Schemes with neither `plan_type` nor a resolved `plan_name_variant` are still skipped.

- [ ] **Step 1: Write the failing tests:**

```python
def test_ter_matches_by_base_name_within_amc(db_session):
    s = Scheme(id=uuid.uuid4(), amfi_code="140228", name="Edelweiss Mid Cap Fund - Direct Plan - Growth Option",
               base_name="Edelweiss Mid Cap Fund", amc_name="Edelweiss Mutual Fund", sebi_category="E",
               plan_type=SchemePlanType.DIRECT, source=SchemeSource.AMFI)
    db_session.add(s); db_session.commit()
    rows = [{"Scheme_Name": "Edelweiss Mid Cap Fund", "TER_Date": "2026-09-01T00:00:00.000Z",
             "D_TER": "0.39", "R_TER": "1.71", "<AMC field>": "Edelweiss Mutual Fund"}]
    with patch_ter_fetch(rows):
        assert asyncio.run(refresh_ter_data(db_session))
    assert db_session.query(SchemeTer).filter_by(scheme_id=s.id).one().ter_value == Decimal("0.39")
```

(`patch_ter_fetch`: patch `_fetch_latest_ter_month` → `"09-2026"` and `_fetch_ter_rows` → `rows`, like the file's existing tests; replace `<AMC field>` with the real key from the existing fixtures/live payload.) Distributor: a Regular folio without ARN is labelled "Regular", never "Direct Plan (No Broker)"; the saving for a Direct fund is `regular_sibling_ter − own_ter` and is never negative (a sibling with lower TER → saving omitted). Holdings: a NAV dated 6 days ago sets `stale_nav=True`.

- [ ] **Step 2–4:** implement; run the three files and `tests/api/test_dashboard_routes.py -k distributor`.

---

### Task 8: Persisted review sessions (#23)

**Files:**
- Modify: `backend/app/services/import_/crypto.py` (add `encrypt_bytes`, `decrypt_bytes`)
- Create: `backend/app/services/import_/preview_store.py`
- Modify: `backend/app/services/import_/service.py` (`build_import_preview`, `start_import_session`, `_advance`, every resolve, `_live_session`, `claim_session_for_confirm`, `return_confirmed_session`, `discard_import_session`, `_sweep_expired_sessions`)
- Modify: `backend/app/services/import_/confirm_people.py` (delete the previewing row in the confirm transaction)
- Test: `backend/tests/services/import_/test_preview_store.py` (new), `test_service.py`, `test_confirm_people.py`, `test_crypto.py`

**Interfaces:**

```python
# crypto.py
def encrypt_bytes(data: bytes, key_provider: KeyProvider = default_key_provider) -> str
def decrypt_bytes(token: str, key_provider: KeyProvider = default_key_provider) -> bytes

# preview_store.py
def save(db: Session, session: dict[str, Any]) -> None     # upsert imports row id = uuid(session_id), status=previewing,
                                                           # household_member_id = session["household_member_id"],
                                                           # uploaded_at = created_at, expires_at = created_at + TTL,
                                                           # preview_state = encrypt_bytes(json(serialize(session)))
def load(db: Session, session_id: str) -> dict[str, Any] | None   # deserialize; fresh threading.Lock(); None if absent/expired
def delete(db: Session, session_id: str) -> None
def serialize(session: dict) -> dict      # everything except "lock"; dataclasses → dicts; Decimal/date/UUID/bytes tagged
def deserialize(data: dict) -> dict       # inverse: ParseResult, ParsedScheme, NormalizedTransaction, ParsedPerson,
                                          # ParsedInvestor, PersonPlan, OpeningLot, Identification, SchemeMatchPreview,
                                          # ImportPreviewResponse (pydantic: model_dump / model_validate)
```

Rules:
- The session dict stays the in-memory fast path. Every function that mutates a session calls `preview_store.save(db, session)` before it commits (they already commit; `build_import_preview` has no db today — `start_import_session` saves right after it). `_live_session` and `claim_session_for_confirm`: on a dict miss, `load()` from the DB and insert into `_preview_sessions`.
- Confirm: `claim_session_for_confirm` additionally runs `UPDATE imports SET status='processing' WHERE id=:id AND status='previewing'` and treats rowcount 0 as "already confirmed/expired" (410) — this is what makes a double confirm across a restart safe. `_confirm_claimed` deletes the preview row in its transaction; a rolled-back confirm restores `status='previewing'`.
- Sweep: `_sweep_expired_sessions(db=...)` also loads and releases expired previewing rows (their PAN claims) and deletes them.
- Never log the session or the blob.

- [ ] **Step 1: Write the failing tests:**

```python
def test_round_trip_preserves_session(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, family_result([{"name": "ADITI SHARMA", "pan": "ABCDE1234K"}]))
    original = _preview_sessions[preview.session_id]
    restored = preview_store.load(db_session, preview.session_id)
    assert restored["parse_result"] == original["parse_result"]
    assert restored["pending_claims"] == original["pending_claims"]
    assert restored["pdf_bytes"] == original["pdf_bytes"]


def test_blob_is_encrypted(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, family_result([{"name": "ADITI SHARMA", "pan": "ABCDE1234K"}]))
    row = db_session.get(Import, uuid.UUID(preview.session_id))
    assert "ABCDE1234K" not in row.preview_state and row.status == ImportStatus.PREVIEWING


def test_confirm_after_restart_uses_persisted_session(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")
    preview = _start(db_session, me, family_result([{"name": "ADITI SHARMA", "pan": "ABCDE1234K"}]))
    _preview_sessions.clear()                                   # simulate a restart
    result = _confirm(db_session, preview, me.user_id)
    assert result.added == 1
    assert db_session.query(Import).filter_by(status=ImportStatus.PREVIEWING).count() == 0
    _preview_sessions.clear()
    with pytest.raises(SessionExpiredError):                     # second Continue
        _confirm(db_session, preview, me.user_id)


def test_expired_preview_row_is_swept_and_claims_released(db_session):
    me = _member(db_session, _user(db_session), "Aditi Sharma")      # no PAN yet: the upload makes a pending claim
    preview = _start(db_session, me, family_result([{"name": "ADITI SHARMA", "pan": "ABCDE1234K"}]))
    db_session.refresh(me)
    assert me.pan_pending_until is not None
    row = db_session.get(Import, uuid.UUID(preview.session_id))
    two_hours_ago = datetime.now(timezone.utc) - timedelta(hours=2)
    row.uploaded_at = row.expires_at = two_hours_ago
    db_session.commit()
    _preview_sessions.clear()                                         # restart: only the row is left
    assert _sweep_expired_sessions(db=db_session) is True
    db_session.commit()
    assert db_session.get(Import, uuid.UUID(preview.session_id)) is None
    db_session.refresh(me)
    assert me.pan_pending_until is None and me.pan_lookup_hash is None
```

(`preview_store.load` treats a row as expired by `expires_at`; the sweep loads such rows, runs `_release_session_claims`, and deletes them.)

`session_id` is a 32-char hex; `uuid.UUID(hex)` maps it to the imports row id — keep that mapping in `preview_store._row_id(session_id)`.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS** — the four files plus `tests/api/test_imports_people_routes.py` and `tests/api/test_imports_routes.py` (session expiry/410 tests).

---

### Task 9: Frontend — hero realised & today, Sold funds, SIPs, mobile parity (#9, #11, #14, #18)

**Files:**
- Modify: `features/dashboard/types.ts` (`RealizedSummary`, `SipRow.series_count/status`, `HoldingRow.stale_nav`), `features/dashboard/api.ts`, `features/dashboard/DashboardView.tsx` (hero, SIP list keys `:595,:636`, monthly total), `mobile/features/dashboard/MobileDashboardView.tsx` (hero adds XIRR + today's gain; SIP section)
- Create: `features/dashboard/SoldFundsSection.tsx` (+ test)
- Test: `DashboardView.test.tsx`, `SoldFundsSection.test.tsx`, `MobileDashboardView.test.tsx`

Copy:
- Hero rows: "Current value", "Invested", "Unrealised gain", "Realised gain", "Today’s gain" (phase 1 already renamed the third).
- Sold funds section (collapsed by default, under holdings): title "Sold funds", rows "{fund} · {member}" with realised gain coloured; hidden when `realized_summary.funds` has no `fully_sold`.
- SIP card: per row "{amount}{series_count > 1 ? ` × ${series_count}` : ''}", footer "Monthly SIP total ₹{sum(amount × series_count)}"; React keys `${scheme_id}-${household_member_id}-${sip_amount}`; "Show stopped SIPs" toggle requests `?include_stopped=true`.

- [ ] **Step 1: Write the failing tests:**

```tsx
it("shows sold funds with losses", () => {
  render(<SoldFundsSection summary={{ total: "-150", funds: [
    { scheme_id: "s1", scheme_name: "Franklin Low Duration", household_member_id: "m1", household_member_name: "Rahul",
      plan_type: "direct", realized_gain: "-200", fully_sold: true },
    { scheme_id: "s2", scheme_name: "PPFAS", household_member_id: "m1", household_member_name: "Rahul",
      plan_type: "direct", realized_gain: "50", fully_sold: false },
  ] }} />);
  fireEvent.click(screen.getByText("Sold funds"));
  expect(screen.getByText(/Franklin Low Duration/)).toBeInTheDocument();
  expect(screen.queryByText(/PPFAS/)).not.toBeInTheDocument();
  expect(screen.getByText("−₹200")).toBeInTheDocument();
});

it("hero shows realised and today's gain", async () => {
  mockHoldingsResponse({ holdings: [holding({ today_gain: "120" })], realized_summary: { total: "5000", funds: [] } });
  renderDashboard();
  expect(await screen.findByText("Realised gain")).toBeInTheDocument();
  expect(screen.getByText("₹5,000")).toBeInTheDocument();
  expect(screen.getByText("Today’s gain")).toBeInTheDocument();
});

it("twin SIPs show ×2 and count twice in the total", async () => {
  mockSips([sip({ sip_amount: "42968.00", series_count: 2 })]);
  renderDashboard();
  expect(await screen.findByText(/× 2/)).toBeInTheDocument();
  expect(screen.getByText(/Monthly SIP total ₹85,936/)).toBeInTheDocument();
});
```

- [ ] **Step 2–4:** implement; run the three test files; `npx tsc -b`.

---

### Task 10: Frontend — Portfolio history page (#12)

**Files:**
- Create: `features/history/api.ts`, `features/history/HistoryChart.tsx`, `features/history/HistoryView.tsx` (+ tests), `mobile/features/history/MobileHistoryView.tsx` (+ test)
- Modify: `features/dashboard/NavigationShell.tsx:28-82` (tab), `features/dashboard/MainDashboardFlow.tsx:35-95,259-275` (`MainTab` adds `"history"`, history-state handling, render), `features/dashboard/DashboardView.tsx` (hero "View history →" link, new prop `onOpenHistory`), `mobile/features/dashboard/MobileDashboardView.tsx` (value card "History ›" row opening `MobileHistoryView` with a back arrow, same pattern as the mobile fund detail view)
- Test: `NavigationShell` and `MainDashboardFlow` existing tests; new view tests

**UI (artifact #12 mock-ups, verbatim copy):**
- Desktop tab order: Dashboard · History · Analytics. The page title "Portfolio history", subtitle "{Family | member name} · monthly value at each month-end", range chips 1Y · 3Y · 5Y · All (default All). Follows the existing Family/Member switch (`viewMode`, `memberId`) — aggregate endpoint for family, member endpoint for a member.
- Chart: value line over an invested area, x-axis start/end years, label "value ₹{last}" at the end; partial months drawn as a hollow dot with a tooltip "{fund names} had no price this month"; caption "History starts {Mon yyyy} (earliest statement uploaded). Hollow dot = a fund had no price that month."
- Loading state "Updating history…" while the request runs (the endpoint computes synchronously when needed, Task 6).
- Mobile: dashboard value card gets a row "History ›"; `MobileHistoryView` header "‹ Portfolio history", chips 1Y · 5Y · All, the same chart component at full width. **The bottom bar stays Dashboard · Analytics · Import** (decided).
- `HistoryChart` is a plain SVG component (`viewBox`, `preserveAspectRatio="none"` on paths, labels outside the scaled group) taking `points: {month: string; value: number; invested: number | null; partial: boolean; missing: string[]}[]`; uses CSS variables for colours so dark mode works.

- [ ] **Step 1: Write the failing tests:**

```tsx
it("desktop nav shows History between Dashboard and Analytics", () => {
  render(<NavigationShell activeTab="dashboard" onTabChange={() => {}} {...requiredProps} />);
  const tabs = screen.getAllByRole("button").map((b) => b.textContent);
  expect(tabs.indexOf("History")).toBe(tabs.indexOf("Dashboard") + 1);
});

it("history view renders points and marks partial months", async () => {
  vi.spyOn(historyApi, "fetchHistory").mockResolvedValue([
    { snapshot_month: "2024-01-31", total_value: "100", invested_value: "90", is_partial: false, missing_scheme_names: [] },
    { snapshot_month: "2024-02-29", total_value: "110", invested_value: "95", is_partial: true, missing_scheme_names: ["HDFC Liquid"] },
  ]);
  render(<HistoryView viewMode="member" memberId="m1" />);
  expect(await screen.findByText("Portfolio history")).toBeInTheDocument();
  expect(screen.getByLabelText(/HDFC Liquid had no price this month/)).toBeInTheDocument();
  expect(screen.getByText(/History starts Jan 2024/)).toBeInTheDocument();
});

it("range chip filters to the last year", async () => {
  const points = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2023, 4 + i + 1, 0));              // month-ends May 2023 … Oct 2025
    return { snapshot_month: d.toISOString().slice(0, 10), total_value: String(100 + i),
             invested_value: "90", is_partial: false, missing_scheme_names: [] };
  });
  vi.spyOn(historyApi, "fetchHistory").mockResolvedValue(points);
  const { container } = render(<HistoryView viewMode="member" memberId="m1" />);
  await screen.findByText("Portfolio history");
  fireEvent.click(screen.getByRole("button", { name: "1Y" }));
  expect(container.querySelectorAll("[data-point]").length).toBe(12);
});

it("mobile value card opens history and back returns", async () => {
  renderMobileDashboard();
  fireEvent.click(await screen.findByText("History ›"));
  expect(screen.getByText("Portfolio history")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Back"));
  expect(screen.queryByText("Portfolio history")).not.toBeInTheDocument();
});
```

(HistoryChart renders one `data-point` element per point.)

- [ ] **Step 2–4:** implement; run the new tests plus `NavigationShell`/`MainDashboardFlow`/`MobileDashboardView` test files; `npx tsc -b`.

---

### Task 11: Frontend — distributor/TER labels and small display fixes (#17, #18)

**Files:**
- Modify: `features/dashboard/DistributorComparisonModal.tsx:111,140-151`, `mobile/features/.../MobileDistributorComparisonView.tsx`, `features/analytics/TerSection.tsx:192-194`, `features/analytics/BenchmarkSection.tsx:43` (`formatPercent` rounds instead of slicing), `components/FundSignal.tsx` (period label from a prop the caller sets to "since purchase" for holdings rows), `mobile/features/dashboard/MobileDashboardView.tsx:53` (`ASSET_CLASS_ORDER = ["Equity", "Debt", "Hybrid", "Other"]`), `components/HoldingsTable.tsx:262` (stale badge now fed by Task 7), every "missing value shown as ₹0" site (grep `|| "0"` in dashboard/holdings/analytics display code; show "—" for `null`)
- Test: each modified component's existing test file

Rules: labels by `plan_type` (`PlanBadge` from phase 1); TER "Save" shows only per-fund positive savings from the backend, never a negative; sold funds not listed; NAV-less schemes listed under "Not compared (no NAV)".

- [ ] **Step 1: Write the failing tests** (one per rule), e.g.:

```tsx
it("rounds percentages", () => {
  expect(formatPercent("0.4499")).toBe("+0.45%");     // was truncated to 0.44
});

it("missing value shows a dash", () => {
  render(<HoldingsTable holdings={[holding({ current_value: null, nav_unavailable: true })]} />);
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
});

it("regular folio without ARN is not called Direct", () => {
  render(<DistributorComparisonModal isOpen rows={[distRow({ plan_type: "regular", arn_code: null })]} onClose={() => {}} />);
  expect(screen.queryByText(/Direct Plan \(No Broker\)/)).not.toBeInTheDocument();
});
```

(Export `formatPercent` from `BenchmarkSection.tsx` for the test.)

- [ ] **Step 2–4:** implement; run the modified components' tests; `npx tsc -b`.

---

### Task 12: Checkpoint

- [ ] **Step 1: Postgres** — `upgrade head` / `downgrade 0028` / `upgrade head`; `tests/functional_postgres/` in full.
- [ ] **Step 2: Synthetic** (to `/tmp/p6_*.json`, `SNAP=1`):
  - Realised gains: p20 ₹96 L and pk (Franklin ₹26.4 L + Axis Liquid ₹9.0 L) present in `realized_summary`.
  - XIRR: pk current ≈ 15.0% (not 38.8%); p20 and p10 within 0.2 points of the harness truth.
  - SIPs: the 2013 SIP is stopped; p20/p10 twins show ×2.
  - Snapshots: every month present (partial flagged), FY-then-20-year history has no near-zero recent months; first build of p20 under 10 s locally and under 200 queries.
  - Restart test: start an upload in the harness, clear `_preview_sessions`, confirm → succeeds.
- [ ] **Step 3: Frontend checklist (decided checkpoint).** Deploy to staging and hand the user the artifact's checklist C1–C14 (`Docs/investigations/2026-10-05-cas-import-fix-plan-final.html#frontend-checks`). Verify each screenshot they send; record pass/fail per item in the baseline doc. Fix failures before phase 7.
