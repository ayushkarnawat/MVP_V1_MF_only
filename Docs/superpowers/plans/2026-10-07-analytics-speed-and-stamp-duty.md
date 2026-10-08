# Analytics Speed and Stamp Duty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Analytics finishes in seconds instead of 30+ minutes (no TER refresh inside a run, a fast daily TER job, category peers warmed by the morning NAV job), and Total Invested includes stamp duty so it equals the CAS cost.

**Architecture:** The TER refresh leaves Analytics entirely. `scheme_ter` is written only by a renamed `ter-daily` job (06:20 IST) which links each scheme once to SEBI’s scheme code in AMFI’s TER feed by an exact cleaned name (`schemes.ter_scheme_code`, migration 0031), joins every later month by that code, never matches fuzzily, and writes in one batch. The 06:00 NAV job also warms the peers of every held category; Analytics keeps its own warm-up only as a safety net for a never-held category. Stamp duty, which the parser used to discard, is attached at parse time to the purchase it was charged on, stored in `transactions.stamp_duty` (migration 0032), and enters every lot-cost replay through one helper in `lot_rules.py` and every cash flow through one helper in `dashboard/xirr.py`.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic (SQLite dev, Postgres staging with RANGE-partitioned `transactions`), casparser 1.3.0, pytest, Terraform (EventBridge Scheduler + ECS Fargate). No frontend change.

**Spec:** Two artifacts, read both before starting:
- Analytics Speed Fix (why, costs, the 7 Oct decisions): https://claude.ai/artifact/RTvmbJVy1SrpH6XJYYWnqx
- Analytics and Stamp Duty Change Map (files, flows, ER diagrams, job timing): https://claude.ai/artifact/VjuDFpFp9EELeT7fcDuA7s
- Deferred items (question 3, fix E, the message): `DEFERRED_FEATURES.md` → "Added 2026-10-07".

## Global Constraints

- **Never `git commit` or `git push`.** The user commits. Every "Checkpoint" step below ends with the working tree left for the user.
- **Run only the affected test files** named in each step. Never the full pytest or vitest suite.
- **Never run `terraform plan` or `terraform apply`.** `terraform fmt -check` and `terraform validate` are allowed.
- **Never point `TEST_DATABASE_URL` or `DATABASE_URL` at staging.** Local Postgres only: `postgresql+psycopg2://unifolio:unifolio@localhost:5433/unifolio_test`.
- **Don't touch `backend/.env`.**
- **Real CAS PDFs are PII:** counts only in docs and logs; never copy names, PANs, folios or amounts from them.
- **Decimal in the money path.** No float for amounts, units, NAVs, stamp duty or TER.
- **LF line endings**; curly apostrophe ’ in any user-facing copy.
- **Scope (decided 7–8 Oct):** fixes A, B, C, D, F, the stuck-run timeout, the NSE freshness fix (Task 5B, decided 8 Oct) and stamp duty. **Not** fix E, **not** the “still calculating” message, **not** the rest of question 3 (Analytics keeps its NAVAll download and the live held-fund NAV fetch; see `DEFERRED_FEATURES.md` “Question 3 in full”).
- **Job rename (decided 7 Oct):** `ter-monthly` → `ter-daily`, script `refresh_ter_daily.py`, schedule `cron(20 6 * * ? *)` Asia/Kolkata, log line `refresh_ter_daily: success=… month=… schemes=… matched=… no_match=… new_links=… seconds=…`.
- **Stuck-run ceiling:** `_STALE_RECOMPUTE_CEILING = timedelta(minutes=15)`.
- **Stamp duty rate:** 0.005% (`Decimal("0.00005")`), from 1 July 2020; applies to purchase, SIP purchase, switch-in and dividend reinvestment rows.
- **Migrations:** `0031_scheme_ter_link` (`down_revision = "0030"`): `schemes.ter_scheme_code`, `ter_link_source`, `ter_linked_at` + index. `0032_transaction_stamp_duty` (`down_revision = "0031"`): `transactions.stamp_duty NUMERIC(14,2) NULL`.
- **TER matching (decided 8 Oct):** exact cleaned name (case, spaces, punctuation ignored) → SEBI scheme code (`NSDLSchemeCode`), stored once; join by code; **no fuzzy matching**; an unlinked scheme gets no TER and its month row is cleared to NULL. Manual links (`ter_link_source = "manual"`) are never replaced. A manual-link script is deferred (`DEFERRED_FEATURES.md`).

## Review Focus

1. **Several purchases in one fund on one day** (a lump sum plus a SIP, or two SIPs): each stamp-duty row must attach to the purchase it is 0.005% of, never both to one. Test in Task 6.
2. **A statement starting mid-history (opening balance):** CAS cost already includes stamp duty, so the opening lot must not absorb or double-count the in-period stamp duty. Test in Task 7.
3. **A later overlapping statement re-uploaded after the deploy:** a purchase saved without stamp duty must get it filled in by the match, not inserted twice. Test in Task 6.
4. **A fund house that hasn’t filed this month’s TER yet** (HDFC, Kotak, Nippon on 8 Oct): its schemes must get no TER, never a competitor’s (Kotak → Tata), and any wrong TER saved earlier that month must be cleared. Tests in Task 2.
5. **A pre-deploy preview session (saved encrypted, no `stamp_duty` key) confirmed after the deploy:** it must deserialize and confirm, with no stamp duty. Test in Task 6.

---

## File map

| File | Task | Responsibility after the change |
|---|---|---|
| `backend/app/services/analytics/ter.py` | 1 | Reads `scheme_ter` only; no refresh machinery |
| `backend/app/services/analytics/scorer.py` | 1 | Reads `scheme_ter` only |
| `backend/alembic/versions/0031_scheme_ter_link.py` (new) | 2 | `schemes.ter_scheme_code` / `ter_link_source` / `ter_linked_at` |
| `backend/app/models/reference.py` | 2 | The three `Scheme` columns |
| `backend/app/services/analytics/amfi_ter_client.py` | 2 | Link by exact name to the SEBI code, join by code, batched writes, `refresh_ter()` → `TerRefreshResult` |
| `backend/scripts/jobs/refresh_ter_daily.py` (renamed) | 3 | The daily TER job and its log line |
| `infra/modules/scheduler/main.tf` | 3 | `ter_daily` schedule at 06:20 |
| `backend/scripts/jobs/refresh_nav_daily.py` | 4 | Held funds + peers of held categories |
| `backend/app/services/analytics/recompute.py` | 5 | 15-minute stuck-run ceiling |
| `backend/app/services/analytics/nse_indices_client.py` | 5B | Saved index history counts as fresh within 4 days; a start date is fetched once per process |
| `backend/alembic/versions/0032_transaction_stamp_duty.py` (new) | 6 | Adds the column |
| `backend/app/models/transaction.py` | 6 | `stamp_duty` column |
| `backend/app/services/import_/parser.py` | 6, 7 | Attaches stamp duty; conversion cost uses the cost helper |
| `backend/app/services/import_/confirm_people.py` | 6 | Writes and back-fills `stamp_duty` |
| `backend/app/services/import_/opening_restore.py` | 6 | Carries `stamp_duty` into the replay |
| `backend/app/services/lot_rules.py` | 7 | `cost_per_unit()` helper |
| `backend/app/services/dashboard/holdings.py` | 7 | Lot cost via the helper |
| `backend/app/services/import_/opening_balance.py` | 7 | In-period lot cost via the helper |
| `backend/app/services/dashboard/xirr.py` | 7 | `paid_amount()` helper; outflows include stamp duty |
| `backend/app/services/analytics/benchmark.py` | 7 | Uses `paid_amount()` |
| `backend/app/services/dashboard/cash_flow.py` | 7 | Uses `paid_amount()` |
| `Docs/CAS Files/synthetic/gen_scenarios.py` | 8 | Printed CAS cost includes stamp duty, like real CAMS |
| `Docs/CAS Files/synthetic/harness/test_deep.py`, `test_real_check.py` | 8 | Invested = CAS cost gate; Analytics timing; no TER refresh |

Unchanged on purpose: `analytics/category_ranking.py`, `analytics/scheme_universe.py`, `dashboard/nav.py`, `dashboard/sip.py`, `import_/preview_store.py`, everything under `frontend/`.

---

### Task 1: Analytics never refreshes TER (fixes A and C)

**Files:**
- Modify: `backend/app/services/analytics/ter.py`
- Modify: `backend/app/services/analytics/scorer.py:43` and `:207`
- Test: `backend/tests/services/analytics/test_ter.py`, `backend/tests/services/analytics/test_scorer.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ter._latest_ter_for_scheme(db, scheme_id) -> tuple[Decimal, date] | None` (unchanged, still imported by `scorer.py`). Removed: `ter._ensure_ter_fresh`, `ter._missing_current_month_ter`, `ter._claim_ter_refresh_slot`, `ter._get_ter_refresh_lock`, `ter._last_ter_refresh_attempt`, `ter._TER_REFRESH_BACKOFF_SECONDS`, `ter._ter_refresh_clock`, `ter._ter_refresh_locks`, `ter._ter_refresh_backoff_guard`, and the `refresh_ter_data` import in `ter.py`.

- [ ] **Step 1: Write the failing guard test** — append to `backend/tests/services/analytics/test_ter.py`:

```python
def test_analytics_never_refreshes_ter():
    """7 Oct fix A: scheme_ter is written only by the ter-daily job. Analytics
    reading it must not be able to start the 8,665-scheme refresh."""
    import app.services.analytics.scorer as scorer_module

    assert not hasattr(ter_module, "refresh_ter_data")
    assert not hasattr(ter_module, "_ensure_ter_fresh")
    assert not hasattr(scorer_module, "_ensure_ter_fresh")
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `backend/`): `python3 -m pytest tests/services/analytics/test_ter.py::test_analytics_never_refreshes_ter -q`
Expected: FAIL (`assert not True`).

- [ ] **Step 3: Remove the refresh from `ter.py`**

Delete these imports: `asyncio`, `threading`, `time`, `weakref`, and `from app.services.analytics.amfi_ter_client import refresh_ter_data`. Delete everything from the comment block starting `# A single permanently-unresolvable scheme` down to the end of `_ensure_ter_fresh` (the backoff constants, `_ter_refresh_clock`, `_last_ter_refresh_attempt`, `_ter_refresh_locks`, `_get_ter_refresh_lock`, `_ter_refresh_backoff_guard`, `_claim_ter_refresh_slot`, `_missing_current_month_ter`, `_ensure_ter_fresh`). Keep `_latest_ter_for_scheme`, `_summarize`, `_EMPTY_SUMMARY`.

Add one paragraph to the module docstring, after the existing text:

```python
"""...existing docstring...

Read-only (7 Oct fix A): `scheme_ter` is written only by the ter-daily job
(06:20 IST). A fund with no TER row is reported in `uncovered_schemes`; it
never triggers a refresh. The refresh used to run here and, on AWS, took
30+ minutes per Analytics run.
"""
```

In `_weighted_ter_for_holdings`, delete the line `await _ensure_ter_fresh(db, scheme_ids)`. In `compute_direct_regular_ter_comparison`, delete the comment block above `all_scheme_ids`, the line `all_scheme_ids = {...}` and the line `await _ensure_ter_fresh(db, all_scheme_ids)`. `_weighted_ter_for_holdings` stays `async` (its callers await it).

- [ ] **Step 4: Remove the refresh from `scorer.py`**

Line 43 becomes:

```python
from app.services.analytics.ter import _latest_ter_for_scheme
```

In `_category_ter_context`, delete `await _ensure_ter_fresh(db, scheme_ids)` and the now-unused `scheme_ids = {s.id for s in universe}` line. Replace “computed once per category so … doesn't repeat the TER refresh + AUM-weighted average” in its docstring with “computed once per category so … doesn't repeat the AUM-weighted average”.

- [ ] **Step 5: Update `test_ter.py` for the removal**

1. Import line becomes `from app.services.analytics.ter import compute_direct_regular_ter_comparison, compute_weighted_ter`.
2. Delete the autouse fixture `_reset_ter_refresh_backoff`, and the now-unused imports `threading`.
3. In every remaining `with` statement, delete the `patch("app.services.analytics.ter.refresh_ter_data", ...)` item (keep `p1, p2`).
4. Delete these tests entirely: `test_ensure_ter_fresh_backs_off_after_recent_attempt_even_if_still_missing`, `test_ensure_ter_fresh_retries_after_backoff_window_expires`, `test_ensure_ter_fresh_coalesces_concurrent_refresh_attempts`, `test_ensure_ter_fresh_lock_survives_contention_from_a_different_event_loop`, `test_claim_ter_refresh_slot_is_atomic_across_threads`.
5. Replace `test_compute_weighted_ter_triggers_refresh_when_current_month_ter_missing` with:

```python
def test_missing_current_month_ter_falls_back_to_last_saved_month_without_refreshing():
    """A fund without this month's TER uses its latest saved real TER (e.g.
    last month's) and never triggers a refresh (7 Oct fix A)."""
    db = _session()
    member = _household_member(db)
    scheme_a = _scheme(db, "Fund A")
    _folio_with_purchase(db, member, scheme_a, Decimal("6000.00"), Decimal("100.000"), Decimal("60.0000"))
    last_month = (_current_month_start().replace(day=1) - timedelta(days=1)).replace(day=1)
    db.add(SchemeTer(scheme_id=scheme_a.id, reference_period=last_month, ter_value=Decimal("1.20")))
    db.commit()

    p1, p2 = _mock_holdings(scheme_a, scheme_a)
    with p1, p2:
        summary = asyncio.run(compute_weighted_ter(db, [member.id]))

    assert Decimal(summary.weighted_ter) == Decimal("1.20")
    assert summary.reference_period == last_month
```

   Add `timedelta` to the `datetime` import.
6. In `test_compute_weighted_ter_flags_uncovered_scheme_without_crashing`, delete the `_fake_refresh` function.

- [ ] **Step 6: Update `test_scorer.py`**

Delete every `patch("app.services.analytics.scorer._ensure_ter_fresh", ...)` item from the `with` blocks (9 occurrences). In the test containing `ter_calls = []` (around line 513), delete `ter_calls = []`, the `_ter_fresh` function and the final `assert len(ter_calls) == 1`.

- [ ] **Step 7: Run the affected tests**

Run: `python3 -m pytest tests/services/analytics/test_ter.py tests/services/analytics/test_scorer.py -q`
Expected: all pass, including `test_analytics_never_refreshes_ter`.

- [ ] **Step 8: Checkpoint** — no commit (the user commits). Note the files changed for the reviewer.

---

### Task 2: TER linked by SEBI scheme code, exact names only (fix B, revised 8 Oct)

**Why this replaced the first version (decided 8 Oct).** Run 1's comparison on live data showed fuzzy name matching is wrong, not just slow. Of 8,661 Direct/Regular schemes, 7,035 match a TER name exactly and 6 more once spaces and punctuation are ignored ("Navi NiftyIT" = "Navi Nifty IT"); every other match the fuzzy step made was wrong. 923 went to a **different fund house** (Kotak Business Cycle → Tata Business Cycle, HDFC Ultra Short Term → HSBC), because AMFI fills each month gradually and on 8 Oct HDFC, Kotak and Nippon had no October rows (11,647 rows vs September's 62,393). About 116 went to the wrong fund within the same house ("Bandhan Gilt April 2026" scored 0.81 against "April 2028"; "SBI FMP Series 50" 0.75 against "Series 51"). AMFI's TER rows carry `NSDLSchemeCode`, SEBI's scheme code: 1,813 names ↔ 1,813 codes, one-to-one, never empty. So each scheme is **linked once** to that code by an exact name, the link is stored on `schemes`, and every later month joins by code. No fuzzy matching anywhere. Unlinked schemes get no TER (they appear under the existing "TER Exclusions" list), never a guess.

**Files:**
- Create: `backend/alembic/versions/0031_scheme_ter_link.py`
- Modify: `backend/app/models/reference.py` (`Scheme`), `backend/app/services/analytics/amfi_ter_client.py`
- Test: `backend/tests/services/analytics/test_amfi_ter_client.py`, `backend/tests/test_migrations.py` (run only)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `Scheme.ter_scheme_code: str | None`, `Scheme.ter_link_source: str | None` (`"exact_name"` or `"manual"`), `Scheme.ter_linked_at: datetime | None`
  - `amfi_ter_client.TER_LINK_EXACT = "exact_name"`, `TER_LINK_MANUAL = "manual"`
  - `amfi_ter_client._compact_key(name: str) -> str`
  - `@dataclass(frozen=True) class TerRefreshResult: success: bool; month: str | None = None; schemes: int = 0; matched: int = 0; no_match: int = 0; new_links: int = 0; seconds: float = 0.0`
  - `async def refresh_ter(db: Session) -> TerRefreshResult` (used by Task 3's job)
  - `async def refresh_ter_data(db: Session) -> bool` (kept; returns `(await refresh_ter(db)).success`)
  - Removed: `_best_match`, `_brand`, `_index_feed`, `_match_scheme`, `MIN_MATCH_CONFIDENCE`, the `SequenceMatcher` import.

**Run 1 already built** (Codex, 8 Oct) the brand-scoped fuzzy version of this task (`_brand`, `_index_feed`, `_match_scheme`, a prefiltered `_best_match`, `TerRefreshResult` without `new_links`, batched writes via a preloaded `existing` dict). Keep the batched writes and `TerRefreshResult`/`refresh_ter`/`refresh_ter_data`; replace the matching as below and delete the fuzzy pieces and their tests.

- [ ] **Step 1: Migration 0031 and the model**

Create `backend/alembic/versions/0031_scheme_ter_link.py`:

```python
"""schemes.ter_scheme_code: link to the SEBI scheme code in AMFI's TER feed (8 Oct)

Revision ID: 0031
Revises: 0030

AMFI's TER feed has no AMFI code or ISIN, only a scheme name and SEBI's scheme
code (NSDLSchemeCode, one per fund, shared by its Direct and Regular plans).
Fuzzy name matching linked ~1,040 schemes to the wrong fund (8 Oct). A scheme
is now linked once, by an exact name, and every later month joins by code.
ter_link_source is "exact_name" or "manual"; manual links are never replaced
by the job. Nullable, no backfill: the ter-daily job fills it.
"""
from alembic import op
import sqlalchemy as sa

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("schemes") as batch:
        batch.add_column(sa.Column("ter_scheme_code", sa.String(), nullable=True))
        batch.add_column(sa.Column("ter_link_source", sa.String(), nullable=True))
        batch.add_column(sa.Column("ter_linked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_schemes_ter_scheme_code", "schemes", ["ter_scheme_code"])


def downgrade() -> None:
    op.drop_index("ix_schemes_ter_scheme_code", table_name="schemes")
    with op.batch_alter_table("schemes") as batch:
        batch.drop_column("ter_linked_at")
        batch.drop_column("ter_link_source")
        batch.drop_column("ter_scheme_code")
```

In `Scheme` (`backend/app/models/reference.py`), after `source`:

```python
    # SEBI scheme code of this fund's row in AMFI's TER feed (NSDLSchemeCode).
    # Set once by an exact name match ("exact_name") or by hand ("manual");
    # every later month's TER joins by it (decided 8 Oct).
    ter_scheme_code: Mapped[str | None] = mapped_column(String, index=True)
    ter_link_source: Mapped[str | None] = mapped_column(String)
    ter_linked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

(Use the index name `ix_schemes_ter_scheme_code` so the model and migration agree; if `index=True` generates a different name, declare `Index("ix_schemes_ter_scheme_code", "ter_scheme_code")` in `__table_args__` instead.)

- [ ] **Step 2: Write the failing tests** — in `test_amfi_ter_client.py`, delete the fuzzy-era tests `test_best_match_prefilter_returns_exactly_the_full_scan_result`, `test_fuzzy_prefers_same_brand_and_falls_back_to_whole_feed`, `test_refresh_ter_data_skips_low_confidence_matches`, `test_ter_matches_master_base_name_before_higher_ratio_fuzzy`, `test_ambiguous_normalized_base_name_falls_back_to_fuzzy` and the `_naive_best_match` helper. Give the file's `_scheme` helper a `base_name` parameter (default: the name with its plan words stripped is **not** done automatically: pass it explicitly in every call), and give every feed row an `"NSDLSchemeCode"`. Then add:

```python
def _feed_row(name, code, d_ter="0.75", r_ter="1.85", on="2026-10-01T00:00:00.000Z"):
    return {"Scheme_Name": name, "NSDLSchemeCode": code, "TER_Date": on, "D_TER": d_ter, "R_TER": r_ter}


def _master(db, name, base_name, plan, code=None, source=None):
    scheme = Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], isin="INF123", name=name, base_name=base_name,
                    amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund", plan_type=plan,
                    source=SchemeSource.AMFI, ter_scheme_code=code, ter_link_source=source)
    db.add(scheme)
    db.commit()
    return scheme


def _refresh(db, rows, month="10-2026"):
    with (
        patch("app.services.analytics.amfi_ter_client._fetch_latest_ter_month", new=AsyncMock(return_value=month)),
        patch("app.services.analytics.amfi_ter_client._fetch_ter_rows", new=AsyncMock(return_value=rows)),
    ):
        return asyncio.run(refresh_ter(db))


def test_exact_name_links_direct_and_regular_to_one_code():
    db = _session()
    direct = _master(db, "HDFC Flexi Cap Fund - Direct Plan - Growth", "HDFC Flexi Cap Fund", SchemePlanType.DIRECT)
    regular = _master(db, "HDFC Flexi Cap Fund - Regular Plan - Growth", "HDFC Flexi Cap Fund", SchemePlanType.REGULAR)
    result = _refresh(db, [_feed_row("HDFC Flexi Cap Fund", "HDFC/O/E/FCF/95/01/0001")])
    assert (result.matched, result.no_match, result.new_links) == (2, 0, 2)
    assert {direct.ter_scheme_code, regular.ter_scheme_code} == {"HDFC/O/E/FCF/95/01/0001"}
    assert direct.ter_link_source == "exact_name" and direct.ter_linked_at is not None
    assert db.get(SchemeTer, (direct.id, date(2026, 10, 1))).ter_value == Decimal("0.75")
    assert db.get(SchemeTer, (regular.id, date(2026, 10, 1))).ter_value == Decimal("1.85")


def test_spacing_and_punctuation_differences_still_link():
    db = _session()
    navi = _master(db, "Navi NiftyIT Index Fund - Direct Plan - Growth", "Navi NiftyIT Index Fund", SchemePlanType.DIRECT)
    assert _refresh(db, [_feed_row("Navi Nifty IT Index Fund", "NAVI/O/O/IIT/22/01/0009")]).matched == 1
    assert navi.ter_scheme_code == "NAVI/O/O/IIT/22/01/0009"


def test_fund_house_that_has_not_filed_gets_no_ter_not_a_competitors():
    """8 Oct: with no Kotak rows in the month, fuzzy matching gave Kotak
    Business Cycle Fund the TER of Tata Business Cycle Fund."""
    db = _session()
    kotak = _master(db, "Kotak Business Cycle Fund - Regular Plan - Growth", "Kotak Business Cycle Fund", SchemePlanType.REGULAR)
    result = _refresh(db, [_feed_row("TATA BUSINESS CYCLE FUND", "TATA/O/E/THE/21/06/0099")])
    assert (result.matched, result.no_match, result.new_links) == (0, 1, 0)
    assert kotak.ter_scheme_code is None
    assert db.get(SchemeTer, (kotak.id, date(2026, 10, 1))).ter_value is None


def test_same_house_fund_with_a_different_year_is_not_matched():
    db = _session()
    gilt_2026 = _master(db, "BANDHAN CRISIL IBX GILT APRIL 2026 INDEX FUND - Direct Plan - Growth",
                        "BANDHAN CRISIL IBX GILT APRIL 2026 INDEX FUND", SchemePlanType.DIRECT)
    _refresh(db, [_feed_row("Bandhan CRISIL IBX Gilt April 2028 Index Fund", "BAND/O/O/GIL/23/02/0100")])
    assert gilt_2026.ter_scheme_code is None


def test_linked_code_survives_a_rename_in_the_feed():
    db = _session()
    fund = _master(db, "X Flexi Cap Fund - Direct Plan", "X Flexi Cap Fund", SchemePlanType.DIRECT,
                   code="X/O/E/FCF/20/01/0001", source="exact_name")
    _refresh(db, [_feed_row("X Flexicap Opportunities Fund", "X/O/E/FCF/20/01/0001", d_ter="0.66")])
    assert db.get(SchemeTer, (fund.id, date(2026, 10, 1))).ter_value == Decimal("0.66")
    assert fund.ter_scheme_code == "X/O/E/FCF/20/01/0001"


def test_manual_link_is_never_replaced_by_an_exact_name_match():
    db = _session()
    fund = _master(db, "Y Fund - Direct Plan", "Y Fund", SchemePlanType.DIRECT, code="MANUAL/CODE", source="manual")
    _refresh(db, [_feed_row("Y Fund", "OTHER/CODE"), _feed_row("Y Fund Renamed", "MANUAL/CODE", d_ter="0.40")])
    assert (fund.ter_scheme_code, fund.ter_link_source) == ("MANUAL/CODE", "manual")
    assert db.get(SchemeTer, (fund.id, date(2026, 10, 1))).ter_value == Decimal("0.40")


def test_two_feed_rows_with_the_same_cleaned_name_link_nothing():
    db = _session()
    fund = _master(db, "Z Fund - Direct Plan", "Z Fund", SchemePlanType.DIRECT)
    _refresh(db, [_feed_row("Z Fund", "Z/1"), _feed_row("Z-Fund", "Z/2")])
    assert fund.ter_scheme_code is None


def test_a_wrong_ter_saved_earlier_this_month_is_cleared():
    """The 7 Oct staging run saved ~1,040 fuzzy (wrong) October TERs. A scheme
    the new job can't link must not keep one."""
    db = _session()
    kotak = _master(db, "Kotak Business Cycle Fund - Regular Plan - Growth", "Kotak Business Cycle Fund", SchemePlanType.REGULAR)
    db.add(SchemeTer(scheme_id=kotak.id, reference_period=date(2026, 10, 1), ter_value=Decimal("1.99")))
    db.commit()
    _refresh(db, [_feed_row("TATA BUSINESS CYCLE FUND", "TATA/O/E/THE/21/06/0099")])
    assert db.get(SchemeTer, (kotak.id, date(2026, 10, 1))).ter_value is None


def test_linked_code_absent_this_month_gives_no_ter_and_keeps_the_link():
    db = _session()
    fund = _master(db, "W Fund - Direct Plan", "W Fund", SchemePlanType.DIRECT, code="W/1", source="exact_name")
    result = _refresh(db, [_feed_row("Other Fund", "O/1")])
    assert result.no_match == 1 and fund.ter_scheme_code == "W/1"
```

Import `SchemePlanType`, `SchemeSource` from `app.models.enums` at the top if missing.

- [ ] **Step 3: Run them to verify they fail**

Run: `python3 -m pytest tests/services/analytics/test_amfi_ter_client.py -q`
Expected: FAIL (`Scheme` has no `ter_scheme_code`; then wrong-TER and Kotak/Tata assertions fail on the fuzzy code).

- [ ] **Step 4: Implement in `amfi_ter_client.py`**

Remove `_best_match`, `_brand`, `_index_feed`, `_match_scheme`, `MIN_MATCH_CONFIDENCE` and the `SequenceMatcher` import. Keep `_normalize_scheme_name` (with `@lru_cache`), `_latest_row_per_scheme`, the fetch functions and the batched-write pattern. Add:

```python
TER_LINK_EXACT = "exact_name"
TER_LINK_MANUAL = "manual"


def _compact_key(name: str) -> str:
    """Cleaned name with spaces and punctuation removed, so "Navi NiftyIT" and
    "Navi Nifty IT" agree. Anything beyond that is a different fund (8 Oct)."""
    return re.sub(r"[^A-Z0-9]", "", _normalize_scheme_name(name))


def _row_code(row: dict) -> str:
    # NSDLSchemeCode has been on every live row; a missing one falls back to
    # the name so a row is never dropped.
    return row.get("NSDLSchemeCode") or f"name:{row['Scheme_Name']}"


def _ter_value(scheme: Scheme, row: dict | None) -> Decimal | None:
    """The scheme's TER from its linked row, or None for "checked, no usable TER"."""
    if row is None:
        return None
    plan = scheme.plan_type or scheme.plan_name_variant
    raw_value = row["R_TER"] if plan.value == "regular" else row["D_TER"]
    if raw_value in (None, ""):
        return None
    ter_value = Decimal(str(raw_value))
    # AMFI uses a literal 0 for "no plan of this type", never a real 0.00% TER.
    return None if ter_value == 0 else ter_value
```

`_mark_checked_no_match` now always clears the month's value (a wrong TER from the fuzzy era must not survive):

```python
def _mark_checked_no_match(db: Session, existing: dict[uuid.UUID, SchemeTer], scheme_id: uuid.UUID,
                           reference_period: date) -> None:
    """"Checked this month, no usable TER": a NULL row, never a stale value.
    Clears any value saved earlier this month, including the wrong fuzzy
    matches the 7 Oct staging run saved (8 Oct)."""
    row = existing.get(scheme_id)
    if row is None:
        existing[scheme_id] = row = SchemeTer(scheme_id=scheme_id, reference_period=reference_period, ter_value=None)
        db.add(row)
    else:
        row.ter_value = None
```

In `refresh_ter`, replace the index-building and the per-scheme loop with:

```python
    latest_by_name = _latest_row_per_scheme(rows)
    by_code = {_row_code(row): row for row in latest_by_name.values()}
    codes_by_key: dict[str, set[str]] = {}
    for name, row in latest_by_name.items():
        codes_by_key.setdefault(_compact_key(name), set()).add(_row_code(row))
    month_num, year_num = month.split("-")
    reference_period = date(int(year_num), int(month_num), 1)

    schemes = (unchanged query)
    existing = (unchanged one-query preload)
    now = datetime.now(timezone.utc)
    matched = no_match = new_links = 0
    for scheme in schemes:
        if scheme.ter_scheme_code is None and scheme.base_name:
            codes = codes_by_key.get(_compact_key(scheme.base_name), set())
            if len(codes) == 1:  # exactly one fund with this name: link it once
                scheme.ter_scheme_code = next(iter(codes))
                scheme.ter_link_source = TER_LINK_EXACT
                scheme.ter_linked_at = now
                new_links += 1
        ter_value = _ter_value(scheme, by_code.get(scheme.ter_scheme_code)) if scheme.ter_scheme_code else None
        if ter_value is None:
            _mark_checked_no_match(db, existing, scheme.id, reference_period)
            no_match += 1
        else:
            _upsert_scheme_ter(db, existing, scheme.id, reference_period, ter_value)
            matched += 1

    await commit_off_loop(db)
    return TerRefreshResult(success=True, month=month, schemes=len(schemes), matched=matched,
                            no_match=no_match, new_links=new_links, seconds=round(time.perf_counter() - started, 1))
```

Add `timezone` to the `datetime` import. Rewrite the module docstring's matching paragraph: link once by exact cleaned name to SEBI's scheme code (`NSDLSchemeCode`), join by code every month, never fuzzy (8 Oct, with the Kotak→Tata example). Update `refresh_ter`'s docstring the same way (“every locally-known scheme linked to a code”, not “confident fuzzy-name match”).

- [ ] **Step 5: Run the affected tests**

Run: `python3 -m pytest tests/services/analytics/test_amfi_ter_client.py tests/services/analytics/test_ter.py tests/test_migrations.py -q`
Expected: all pass.

- [ ] **Step 6: Check it on real data** (not committed; script under the scratch/temp folder)

Load `Docs/CAS Files/synthetic/navall_2026-10-06.txt` into an in-memory DB with `refresh_scheme_master(db, text)` (use `connect_args={"check_same_thread": False}, poolclass=StaticPool`), fetch the live TER feed once, run `refresh_ter`-equivalent linking, and print `schemes=… linked=… matched=… no_match=… seconds=…`, then: (a) **every linked scheme whose fund-house brand (first word of `_normalize_scheme_name`) differs from its feed row's brand** (expected: none), (b) the count of unlinked schemes per brand (expected: HDFC, Kotak, Nippon and other not-yet-filed houses dominate), (c) 20 random links for eyeballing. On 8 Oct's feed the orchestrator measured 7,041 exact links, so `linked` should be about that. Paste the summary and (a) in full into the report.

- [ ] **Step 7: Checkpoint** — no commit.

---

### Task 3: The `ter-daily` job and schedule (fix B, decided rename)

**Files:**
- Rename: `backend/scripts/jobs/refresh_ter_monthly.py` → `backend/scripts/jobs/refresh_ter_daily.py` (plain `mv`; the user commits)
- Modify: `infra/modules/scheduler/main.tf:21-26`
- Test: `backend/tests/scripts/test_background_jobs.py:76-93`

**Interfaces:**
- Consumes: `refresh_ter(db) -> TerRefreshResult` from Task 2.
- Produces: log line `refresh_ter_daily: success=True month=10-2026 schemes=8665 matched=… no_match=… new_links=… seconds=…`.

- [ ] **Step 1: Write the failing test** — replace `test_refresh_ter_monthly_runs_refresh_inside_fresh_event_loop` with:

```python
def test_refresh_ter_daily_logs_counts_from_a_fresh_event_loop(db_session, monkeypatch, caplog):
    from app.services.analytics.amfi_ter_client import TerRefreshResult

    job = _load_job("refresh_ter_daily")

    async def fake_refresh_ter(db):
        assert asyncio.get_running_loop().is_running()
        return TerRefreshResult(success=True, month="10-2026", schemes=3, matched=2, no_match=1, new_links=2, seconds=0.4)

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "refresh_ter", fake_refresh_ter)
    caplog.set_level(logging.INFO)

    job.main()

    assert "refresh_ter_daily: success=True month=10-2026 schemes=3 matched=2 no_match=1 new_links=2 seconds=0.4" in caplog.messages
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 -m pytest tests/scripts/test_background_jobs.py -q -k ter`
Expected: FAIL, `refresh_ter_daily entrypoint is missing`.

- [ ] **Step 3: Rename and rewrite the job**

`mv backend/scripts/jobs/refresh_ter_monthly.py backend/scripts/jobs/refresh_ter_daily.py`, then replace its import and `main_async`:

```python
from app.services.analytics.amfi_ter_client import refresh_ter

logger = logging.getLogger(__name__)


async def main_async(db: Session) -> None:
    # Daily at 06:20 IST (decided 7 Oct): after the 06:15 fund-list job, so new
    # funds get a TER the same morning, and before the 06:30 Analytics run.
    result = await refresh_ter(db)
    logger.info(
        "refresh_ter_daily: success=%s month=%s schemes=%d matched=%d no_match=%d new_links=%d seconds=%.1f",
        result.success, result.month, result.schemes, result.matched, result.no_match, result.new_links, result.seconds,
    )
```

- [ ] **Step 4: Change the schedule** — in `infra/modules/scheduler/main.tf` replace the `ter_monthly = { … }` entry with:

```hcl
    ter_daily = {
      slug                = "ter-daily"
      command             = ["python", "scripts/jobs/refresh_ter_daily.py"]
      schedule_expression = "cron(20 6 * * ? *)"
      task_role_arn       = null
    }
```

- [ ] **Step 5: Run the tests and Terraform checks**

Run: `python3 -m pytest tests/scripts/test_background_jobs.py -q`
Expected: all pass.
Run (from repo root): `terraform -chdir=infra fmt -check -recursive` and `terraform -chdir=infra/envs/staging validate`
Expected: no output from fmt; `Success! The configuration is valid.` (If `validate` needs `init` and providers aren't cached, report that instead of running `init` against the remote backend.)
Run: `grep -rn "ter-monthly\|ter_monthly\|refresh_ter_monthly" backend infra --include=*.py --include=*.tf` → expected no results.

- [ ] **Step 6: Checkpoint** — no commit. Record for the staging guide: the Terraform plan will show 3 to add, 3 to destroy (`aws_scheduler_schedule.jobs["ter_daily"]`, `aws_ecs_task_definition.jobs["ter_daily"]`, `aws_cloudwatch_log_group.jobs["ter_daily"]` added; the `ter_monthly` three destroyed). The old log group `/ecs/staging-job-ter-monthly` and its history are deleted with it.

---

### Task 4: The NAV job also warms category peers (fix D)

**Files:**
- Modify: `backend/scripts/jobs/refresh_nav_daily.py`
- Test: `backend/tests/scripts/test_background_jobs.py::test_refresh_nav_daily_passes_only_held_schemes`

**Interfaces:**
- Consumes: `get_category_universe(db, sebi_category) -> list[Scheme]` (existing, `app.services.analytics.scheme_universe`), `warm_nav_history(db, schemes)` (existing).
- Produces: log line `refresh_nav_daily: held_schemes=N categories=K peer_schemes=P success=True`.

- [ ] **Step 1: Write the failing test** — replace `test_refresh_nav_daily_passes_only_held_schemes` with:

```python
def test_refresh_nav_daily_warms_held_funds_then_their_category_peers(db_session, monkeypatch, caplog):
    job = _load_job("refresh_nav_daily")
    user = User(phone_number="+910000000101", created_at=datetime.now(timezone.utc))
    db_session.add(user)
    db_session.flush()
    member = HouseholdMember(user_id=user.id, name="Job Test User", relationship=Relationship.SELF,
                             created_at=datetime.now(timezone.utc))
    held_a, held_b, unheld, peer = _scheme("JOB-NAV-1"), _scheme("JOB-NAV-2"), _scheme("JOB-NAV-3"), _scheme("JOB-NAV-4")
    db_session.add_all([member, held_a, held_b, unheld, peer])
    db_session.flush()
    db_session.add_all([
        Folio(household_member_id=member.id, scheme_id=held_a.id, folio_number="NAV-1"),
        Folio(household_member_id=member.id, scheme_id=held_b.id, folio_number="NAV-2"),
        Folio(household_member_id=member.id, scheme_id=held_a.id, folio_number="NAV-3"),
    ])
    db_session.flush()

    warmed: list[set] = []
    categories: list[str] = []

    async def fake_warm_nav_history(db, schemes):
        assert asyncio.get_running_loop().is_running()
        warmed.append({scheme.id for scheme in schemes})

    async def fake_universe(db, sebi_category):
        categories.append(sebi_category)
        return [held_a, peer]  # a held fund is also its own peer: not warmed twice

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "warm_nav_history", fake_warm_nav_history)
    monkeypatch.setattr(job, "get_category_universe", fake_universe)
    caplog.set_level(logging.INFO)

    job.main()

    assert warmed == [{held_a.id, held_b.id}, {peer.id}]
    assert categories == ["Equity Scheme - Flexi Cap Fund"]
    assert "refresh_nav_daily: held_schemes=2 categories=1 peer_schemes=1 success=True" in caplog.messages
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python3 -m pytest tests/scripts/test_background_jobs.py -q -k nav`
Expected: FAIL (`AttributeError: … has no attribute 'get_category_universe'`).

- [ ] **Step 3: Implement** — in `refresh_nav_daily.py` add `from app.services.analytics.scheme_universe import get_category_universe` and replace `main_async`:

```python
async def main_async(db: Session) -> None:
    schemes = (
        db.query(Scheme)
        .join(Folio, Folio.scheme_id == Scheme.id)
        .filter(Scheme.id.in_(db.query(distinct(Folio.scheme_id))))
        .all()
    )
    await warm_nav_history(db, schemes)
    # Fix D (7 Oct): also every peer in the held funds' SEBI categories, so
    # category ranking and the quality score find them fresh at 06:30 and the
    # Analytics run downloads nothing. Its own warm-up stays as a safety net
    # for a category nobody held at 06:00.
    held_ids = {scheme.id for scheme in schemes}
    categories = sorted({s.sebi_category for s in schemes if s.amfi_code and s.sebi_category})
    peers: dict = {}
    for category in categories:
        for peer in await get_category_universe(db, category):
            if peer.id not in held_ids:
                peers[peer.id] = peer
    await warm_nav_history(db, peers.values())
    logger.info(
        "refresh_nav_daily: held_schemes=%d categories=%d peer_schemes=%d success=True",
        len(schemes), len(categories), len(peers),
    )
```

- [ ] **Step 4: Run the tests**

Run: `python3 -m pytest tests/scripts/test_background_jobs.py -q`
Expected: all pass.

- [ ] **Step 5: Checkpoint** — no commit.

---

### Task 5: Stuck-run ceiling 2 hours → 15 minutes

**Files:**
- Modify: `backend/app/services/analytics/recompute.py:52`, plus the “2-hour” wording in `recompute.py:125`, `analytics/dispatch.py:36,72`, `api/imports.py:175`
- Test: `backend/tests/services/analytics/test_recompute.py`

**Interfaces:** Produces `_STALE_RECOMPUTE_CEILING = timedelta(minutes=15)`.

- [ ] **Step 1: Write the failing tests** — append to `test_recompute.py` (it already imports `datetime`, `timedelta`, `timezone`, `AnalyticsRecomputeStatus`, `should_dispatch_recompute`, `_session`, `_user_with_members`):

```python
def test_a_run_started_16_minutes_ago_counts_as_stuck():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    db.add(AnalyticsRecomputeStatus(user_id=user.id, started_at=datetime.now(timezone.utc) - timedelta(minutes=16)))
    db.commit()
    assert should_dispatch_recompute(db, user.id) is True


def test_a_run_started_5_minutes_ago_still_blocks_a_new_one():
    db = _session()
    user, _members = _user_with_members(db, n_members=0)
    db.add(AnalyticsRecomputeStatus(user_id=user.id, started_at=datetime.now(timezone.utc) - timedelta(minutes=5)))
    db.commit()
    assert should_dispatch_recompute(db, user.id) is False
```

- [ ] **Step 2: Run to verify the first fails**

Run: `python3 -m pytest tests/services/analytics/test_recompute.py -q -k "minutes_ago"`
Expected: `test_a_run_started_16_minutes_ago_counts_as_stuck` FAILS; the 5-minute test passes.

- [ ] **Step 3: Implement**

```python
# A run counts as crashed after 15 minutes (was 2 hours, 7 Oct): after the
# speed fix a run takes seconds to a few minutes, so a stuck claim no longer
# hides Analytics for up to 2 hours.
_STALE_RECOMPUTE_CEILING = timedelta(minutes=15)
```

Change “2-hour staleness ceiling” / “2-hour” to “15-minute” in the four comments listed under Files.

- [ ] **Step 4: Run the tests**

Run: `python3 -m pytest tests/services/analytics/test_recompute.py tests/services/analytics/test_dispatch.py -q`
Expected: all pass.

- [ ] **Step 5: Checkpoint** — no commit.

---

### Task 5B: NSE index history counts as fresh within 4 days (decided 8 Oct)

**Why:** measured 8 Oct on p20_20yr, one Analytics run made 32 NSE downloads taking 127 s. `ensure_index_history_fresh` asks for history up to *today*; in the morning today's close isn't published, so the saved range never covers `end_date` and every call (4 indices × every view and fund comparison) downloads again. Full story: `DEFERRED_FEATURES.md` → “Question 3 in full”.

**Files:**
- Modify: `backend/app/services/analytics/nse_indices_client.py` (`ensure_index_history_fresh`)
- Test: `backend/tests/services/analytics/test_nse_indices_client.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: unchanged signature `ensure_index_history_fresh(db, index, start_date, end_date) -> bool`; new module constants `_FRESH_WITHIN = timedelta(days=4)` and `_fetched_from: dict[BenchmarkIndex, date]`.

- [ ] **Step 1: Write the failing tests** — append to `test_nse_indices_client.py` (add `from datetime import timedelta` and `import app.services.analytics.nse_indices_client as nse_module` if missing):

```python
@pytest.fixture(autouse=True)
def _reset_fetched_from():
    nse_module._fetched_from.clear()
    yield
    nse_module._fetched_from.clear()


def _cache(db, *days):
    for d in days:
        db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=d, value=Decimal("24000")))
    db.commit()


def test_history_ending_yesterday_counts_as_fresh_for_today():
    db = _session()
    today = date.today()
    _cache(db, date(2016, 1, 4), today - timedelta(days=1))
    fetch = AsyncMock(side_effect=AssertionError("should not download"))
    with patch("app.services.analytics.nse_indices_client._fetch_index_history", new=fetch):
        assert asyncio.run(ensure_index_history_fresh(db, BenchmarkIndex.NIFTY_50, date(2016, 1, 4), today)) is True


def test_history_ending_five_days_ago_is_topped_up():
    db = _session()
    today = date.today()
    _cache(db, date(2016, 1, 4), today - timedelta(days=5))
    fetch = AsyncMock(return_value=[(today - timedelta(days=1), Decimal("24100"))])
    with patch("app.services.analytics.nse_indices_client._fetch_index_history", new=fetch):
        assert asyncio.run(ensure_index_history_fresh(db, BenchmarkIndex.NIFTY_50, date(2016, 1, 4), today)) is True
    fetch.assert_awaited_once()


def test_start_before_the_index_existed_is_asked_for_once_per_process():
    """NSE has no history before an index started, so the saved range can never
    reach a 2003 purchase. Without the memo every call would download again."""
    db = _session()
    today = date.today()
    fetch = AsyncMock(return_value=[(date(2005, 4, 1), Decimal("1000")), (today - timedelta(days=1), Decimal("24000"))])
    with patch("app.services.analytics.nse_indices_client._fetch_index_history", new=fetch):
        for _ in range(3):
            asyncio.run(ensure_index_history_fresh(db, BenchmarkIndex.NIFTY_50, date(2003, 6, 1), today))
    assert fetch.await_count == 1
```

(Import `BenchmarkIndexHistory` from `app.models.reference` if the file doesn't already; check where the existing tests import it from.)

- [ ] **Step 2: Run them to verify they fail**

Run: `python3 -m pytest tests/services/analytics/test_nse_indices_client.py -q`
Expected: the three new tests FAIL (`_fetched_from` missing / unexpected downloads); existing tests pass.

- [ ] **Step 3: Implement** — in `nse_indices_client.py` add `from datetime import timedelta` and, above `ensure_index_history_fresh`:

```python
# Saved history ending within this many days of the requested end counts as
# up to date: in the morning today's close isn't published yet, so a literal
# "covers today" check made every Analytics call download again (32 calls,
# 127 s on 8 Oct). 4 days covers a weekend plus a holiday.
_FRESH_WITHIN = timedelta(days=4)
# Earliest start already downloaded in this process, per index. NSE has no
# history before an index began, so a start older than that can never be
# covered by the saved range; asking once per process is enough.
_fetched_from: dict[BenchmarkIndex, date] = {}
```

Replace the coverage check at the top of `ensure_index_history_fresh` with:

```python
    bounds = _cached_date_bounds(db, index)
    start_covered = bounds is not None and (
        bounds[0] <= start_date or _fetched_from.get(index, date.max) <= start_date)
    end_covered = bounds is not None and bounds[1] >= end_date - _FRESH_WITHIN
    if start_covered and end_covered:
        return True
```

and, after `await _upsert_index_history(db, index, rows)`, before `return True`:

```python
    _fetched_from[index] = min(_fetched_from.get(index, date.max), start_date)
```

Add one sentence to the function's docstring: “Saved history ending within `_FRESH_WITHIN` of `end_date` counts as covering it (8 Oct).”

- [ ] **Step 4: Run the affected tests**

Run: `python3 -m pytest tests/services/analytics/test_nse_indices_client.py tests/services/analytics/test_benchmark.py tests/scripts/test_background_jobs.py -q`
Expected: all pass. **Corrected 8 Oct (orchestrator, after Run 1):** the original note here said the `benchmark-daily` job “still tops up daily”. It doesn’t: with the 4-day window its one-day-old cache counts as fresh. `ensure_index_history_fresh` therefore takes `fresh_within: timedelta = _FRESH_WITHIN` (keyword-only), and `refresh_benchmark_daily.py` passes `fresh_within=timedelta(0)` so it downloads every morning. Tests: `test_daily_job_still_tops_up_history_that_ends_yesterday`, and the job test asserts `fresh_within == timedelta(0)`.

- [ ] **Step 5: Checkpoint** — no commit.

---

### Task 6: Capture and store stamp duty (parser, migration 0032, confirm, restore)

**Files:**
- Create: `backend/alembic/versions/0032_transaction_stamp_duty.py`
- Modify: `backend/app/models/transaction.py`, `backend/app/services/import_/parser.py`, `backend/app/services/import_/confirm_people.py:971-976` and `_match_rows`, `backend/app/services/import_/opening_restore.py:132-136`
- Test: `backend/tests/services/import_/test_parser.py`, `backend/tests/services/import_/test_confirm_people.py`, `backend/tests/services/import_/test_preview_store.py`, `backend/tests/test_migrations.py` (run only)

**Interfaces:**
- Produces: `NormalizedTransaction.stamp_duty: Decimal | None = None`; `Transaction.stamp_duty: Mapped[Decimal | None]`; `parser._attach_stamp_duty(rows, stamps) -> None`; `parser.STAMPED_TYPES` (set of `TransactionType`); `parser.STAMP_DUTY_RATE = Decimal("0.00005")`.

- [ ] **Step 1: Write the failing parser tests** — append to `test_parser.py` (uses the existing `_scheme`, `_t`, `_data` helpers):

```python
def _stamp(d, amount):
    return _t(d, "*** Stamp Duty ***", amount, None, None, "STAMP_DUTY_TAX")


def test_stamp_duty_attaches_to_its_purchase():
    rows = _normalize_cas_data(_data(_scheme("X Fund - Direct Plan - Growth", "INF1", [
        _t("2025-10-06", "SIP Purchase", "4999.75", "103.256", "48.4205", "PURCHASE_SIP"),
        _stamp("2025-10-06", "0.25"),
    ], close="103.256"))).transactions
    assert [r.stamp_duty for r in rows] == [Decimal("0.25")]
    assert not any("Stamp" in w for w in _normalize_cas_data(_data(_scheme(
        "X Fund - Direct Plan - Growth", "INF1", [_stamp("2025-10-06", "0.25")]))).parse_warnings)


def test_two_purchases_same_day_each_get_their_own_stamp_duty():
    rows = _normalize_cas_data(_data(_scheme("X Fund - Direct Plan - Growth", "INF1", [
        _t("2025-10-06", "Purchase", "99995.00", "2000.000", "49.9975", "PURCHASE"),
        _t("2025-10-06", "SIP Purchase", "4999.75", "100.000", "49.9975", "PURCHASE_SIP"),
        _stamp("2025-10-06", "0.25"),   # printed out of order on purpose
        _stamp("2025-10-06", "5.00"),
    ], close="2100"))).transactions
    by_type = {r.txn_type: r.stamp_duty for r in rows}
    assert by_type == {TransactionType.PURCHASE: Decimal("5.00"), TransactionType.PURCHASE_SIP: Decimal("0.25")}


def test_stamp_duty_without_a_purchase_that_day_is_dropped_silently():
    result = _normalize_cas_data(_data(_scheme("X Fund - Direct Plan - Growth", "INF1", [
        _t("2025-10-06", "Redemption", "5000", "-100", "50", "REDEMPTION"),
        _stamp("2025-10-07", "0.25"),
    ], close="0")))
    assert [r.stamp_duty for r in result.transactions] == [None]
    assert not any("Stamp" in w for w in result.parse_warnings)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `python3 -m pytest tests/services/import_/test_parser.py -q -k stamp`
Expected: FAIL (`AttributeError: 'NormalizedTransaction' object has no attribute 'stamp_duty'`); `test_skipped_stamp_duty_rows_do_not_warn` still passes.

- [ ] **Step 3: Implement in `parser.py`**

Add to `NormalizedTransaction`, after `nav_printed`:

```python
    # Stamp duty charged on this purchase (0.005% from 1 Jul 2020). The CAS
    # prints it as a separate unit-less row; it is attached here so cost can
    # include it, as the CAS cost column does (decided 7 Oct).
    stamp_duty: Decimal | None = None
```

Add near `_SILENT_TAX_TYPES`:

```python
STAMP_DUTY_RATE = Decimal("0.00005")
STAMPED_TYPES = {TransactionType.PURCHASE, TransactionType.PURCHASE_SIP,
                 TransactionType.SWITCH_IN, TransactionType.DIVIDEND_REINVEST}


def _attach_stamp_duty(rows: list["NormalizedTransaction"], stamps: list[tuple[date, Decimal]]) -> None:
    """Give each stamp-duty row to the same-day purchase it is 0.005% of. With
    several purchases that day the closest match wins, so a lump sum and a SIP
    each get their own. One with no purchase that day is dropped, as before."""
    for on, duty in stamps:
        candidates = [r for r in rows if r.txn_date == on and r.txn_type in STAMPED_TYPES
                      and r.stamp_duty is None and r.amount]
        if candidates:
            min(candidates, key=lambda r: abs(r.amount * STAMP_DUTY_RATE - duty)).stamp_duty = duty
```

(`NormalizedTransaction` is defined above this point in the file; if not, put the helper below the class.) In `_normalize_cas_data`, immediately before `for txn in scheme.transactions:` add:

```python
            first_row = len(transactions)
            stamps: list[tuple[date, Decimal]] = []
```

Inside the `if amount is None or units is None or nav is None:` branch, after the conversion `continue` block and before `printed_nav = nav`, add:

```python
                    if _raw_key(txn.type) == "STAMP_DUTY_TAX":
                        if amount:
                            stamps.append((_parse_date(txn.date), amount))
                        continue
```

After the `for txn in scheme.transactions:` loop ends (same indentation as the loop), add:

```python
            _attach_stamp_duty(transactions[first_row:], stamps)
```

Make sure `date` is imported from `datetime` in `parser.py` (it is used by `_parse_date`'s return type).

- [ ] **Step 4: Run the parser tests**

Run: `python3 -m pytest tests/services/import_/test_parser.py -q`
Expected: all pass.

- [ ] **Step 5: Migration and model**

Create `backend/alembic/versions/0032_transaction_stamp_duty.py`:

```python
"""transactions.stamp_duty: stamp duty charged on a purchase (7 Oct)

Revision ID: 0032
Revises: 0031

The CAS prints stamp duty (0.005% from 1 Jul 2020) as its own unit-less row,
which the parser used to drop. It is now kept on the purchase it was charged
on, so cost and cash flows can include it and Total Invested equals the CAS
cost. Nullable, no default, no backfill: older rows stay NULL. On Postgres the
table is RANGE-partitioned (0010); ADD COLUMN on the parent reaches every
partition without a rewrite.
"""
from alembic import op
import sqlalchemy as sa

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE transactions ADD COLUMN stamp_duty NUMERIC(14,2)")
    else:
        with op.batch_alter_table("transactions") as batch:
            batch.add_column(sa.Column("stamp_duty", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE transactions DROP COLUMN stamp_duty")
    else:
        with op.batch_alter_table("transactions") as batch:
            batch.drop_column("stamp_duty")
```

In `backend/app/models/transaction.py`, after `nav`:

```python
    # Stamp duty charged on this purchase; NULL for every other row and for
    # rows imported before 0032 (decided 7 Oct).
    stamp_duty: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
```

- [ ] **Step 6: Write the failing confirm and preview-store tests**

In `test_confirm_people.py`, find the existing test that confirms a parsed statement and then re-confirms an overlapping one (search for `_match_rows` or `already` in the file and reuse its fixtures). Add one test that: confirms a statement whose purchase row has `stamp_duty=None`, then calls `_match_rows(db, folio_id, [same_row_with_stamp_duty_0_25])` and asserts the result has no inserts, one matched row, and `matched[0].stamp_duty == Decimal("0.25")`. Add a second test that a fresh confirm writes `stamp_duty` onto the inserted `Transaction`. Model both on the nearest existing `_match_rows` test in that file, with the same helpers, so they need no new fixtures.

In `test_preview_store.py`, add:

```python
def test_session_saved_before_stamp_duty_field_still_loads():
    from app.services.import_.parser import NormalizedTransaction
    from app.services.import_ import preview_store

    row = NormalizedTransaction(folio="1/1", amc="X", scheme_name="X", isin="INF1", amfi=None, scheme_type=None,
                                txn_date=date(2025, 10, 6), txn_type=TransactionType.PURCHASE_SIP,
                                description="SIP", amount=Decimal("4999.75"), units=Decimal("103.256"),
                                nav=Decimal("48.4205"))
    encoded = preview_store.serialize({"rows": [row]})
    del encoded["value"][0][1]["value"][0]["value"]["stamp_duty"]  # what a pre-deploy blob looks like
    [loaded] = preview_store.deserialize(encoded)["rows"]
    assert loaded.stamp_duty is None and loaded.amount == Decimal("4999.75")
```

(The `del` path matches `preview_store`’s encoding, checked 7 Oct: `{"kind":"dict","value":[["rows", {"kind":"list","value":[{"kind":"dataclass", …, "value":{…fields…}}]}]]}`.)

- [ ] **Step 7: Run to verify they fail**

Run: `python3 -m pytest tests/services/import_/test_confirm_people.py tests/services/import_/test_preview_store.py -q -k "stamp"`
Expected: the two confirm tests FAIL; the preview-store test passes already (the dataclass default handles it). Keep it as the regression guard for Review Focus 5.

- [ ] **Step 8: Implement in `confirm_people.py` and `opening_restore.py`**

In the insert loop (`txn = Transaction(...)`, around line 971) add `stamp_duty=norm.stamp_duty,` after `balance_units=norm.balance,`.

In `_match_rows`, balance branch, after `if exact is not None:` / `used.add(exact)`:

```python
                if exact is not None:
                    used.add(exact)
                    if not dry_run and saved[exact].stamp_duty is None and r.stamp_duty is not None:
                        saved[exact].stamp_duty = r.stamp_duty  # a pre-0032 row gets it from the newer statement
                    result.matched.append(saved[exact])
```

Count branch: replace `result.matched.extend(saved[: len(incoming)])` with:

```python
            for row, r in zip(saved[: len(incoming)], incoming):
                if not dry_run and row.stamp_duty is None and r.stamp_duty is not None:
                    row.stamp_duty = r.stamp_duty
                result.matched.append(row)
```

In `opening_restore.py`, the `NormalizedTransaction(...)` built from saved rows gets `stamp_duty=t.stamp_duty,` after `nav=t.nav,`.

- [ ] **Step 9: Run the affected tests and the migration test**

Run: `python3 -m pytest tests/services/import_/test_parser.py tests/services/import_/test_confirm_people.py tests/services/import_/test_preview_store.py tests/services/import_/test_opening_restore.py tests/test_migrations.py -q`
Expected: all pass.

- [ ] **Step 10: Checkpoint** — no commit.

---

### Task 7: Stamp duty in cost and cash flows

**Files:**
- Modify: `backend/app/services/lot_rules.py`, `backend/app/services/dashboard/holdings.py:93`, `backend/app/services/import_/opening_balance.py:45,68`, `backend/app/services/import_/parser.py:317` (`_fifo_cost`), `backend/app/services/dashboard/xirr.py:31-35`, `backend/app/services/analytics/benchmark.py:92-97`, `backend/app/services/dashboard/cash_flow.py:54`
- Test: `backend/tests/services/dashboard/test_holdings.py`, `backend/tests/services/import_/test_opening_balance.py`, `backend/tests/services/dashboard/test_xirr.py`, `backend/tests/services/dashboard/test_cash_flow.py`, `backend/tests/services/analytics/test_benchmark.py`, `backend/tests/services/dashboard/test_snapshots.py` (run only)

**Interfaces:**
- Consumes: `Transaction.stamp_duty`, `NormalizedTransaction.stamp_duty` (Task 6).
- Produces:
  - `lot_rules.cost_per_unit(units: Decimal, nav: Decimal, amount: Decimal | None, stamp_duty: Decimal | None) -> Decimal`
  - `dashboard.xirr.paid_amount(txn) -> Decimal` (works on `Transaction`; returns `txn.amount + (txn.stamp_duty or 0)`)

- [ ] **Step 1: Write the failing tests**

`test_holdings.py`:

```python
def test_purchase_cost_includes_stamp_duty_and_sale_carries_its_share():
    buy = _txn(TransactionType.PURCHASE_SIP, date(2025, 10, 6), Decimal("4999.75"), Decimal("100.000"), Decimal("49.9975"))
    buy.stamp_duty = Decimal("0.25")
    sell = _txn(TransactionType.REDEMPTION, date(2026, 1, 6), Decimal("2750.00"), Decimal("50.000"), Decimal("55.0000"))
    units, cost, realized = _process_folio_lots([buy, sell])
    assert units == Decimal("50.000")
    assert cost == Decimal("2500.00")          # half of 5,000.00, not of 4,999.75
    assert realized == Decimal("250.00")       # 50 × (55 − 50.00)


def test_purchase_without_stamp_duty_keeps_units_times_nav():
    buy = _txn(TransactionType.PURCHASE, date(2019, 1, 1), Decimal("5000.00"), Decimal("100.000"), Decimal("50.0000"))
    assert _process_folio_lots([buy])[1] == Decimal("5000.00")
```

`test_opening_balance.py` (Review Focus 2) — use the file's existing `ParsedScheme` / `NormalizedTransaction` builders:

```python
def test_opening_lot_does_not_absorb_in_period_stamp_duty():
    """CAS cost 15,000 = 10,000 opening + 5,000 SIP (incl. 0.25 stamp duty).
    The opening lot must cost 10,000, not 10,000.25."""
    scheme = ParsedScheme(name="X", isin="INF1", amfi=None, scheme_type=None, folio="1/1", amc="X",
                          transaction_count=1, open_units=Decimal("100.000"), close_units=Decimal("200.000"),
                          valuation_cost=Decimal("15000.00"))
    sip = NormalizedTransaction(folio="1/1", amc="X", scheme_name="X", isin="INF1", amfi=None, scheme_type=None,
                                txn_date=date(2025, 10, 6), txn_type=TransactionType.PURCHASE_SIP, description="SIP",
                                amount=Decimal("4999.75"), units=Decimal("100.000"), nav=Decimal("49.9975"),
                                stamp_duty=Decimal("0.25"))
    lot = price_opening_lot(scheme, [sip], date(2025, 4, 1), None)
    assert lot.amount == Decimal("10000.00")
```

`test_xirr.py`:

```python
def test_paid_amount_adds_stamp_duty_to_purchases_only():
    from app.services.dashboard.xirr import paid_amount
    buy = Transaction(type=TransactionType.PURCHASE_SIP, amount=Decimal("4999.75"), stamp_duty=Decimal("0.25"))
    sell = Transaction(type=TransactionType.REDEMPTION, amount=Decimal("6000.00"))
    assert paid_amount(buy) == Decimal("5000.00")
    assert paid_amount(sell) == Decimal("6000.00")
```

`test_cash_flow.py`: copy the file's simplest existing purchase test, set `stamp_duty=Decimal("0.25")` on its purchase, and assert the entry's `amount == str(original_amount + Decimal("0.25"))`.

- [ ] **Step 2: Run them to verify they fail**

Run: `python3 -m pytest tests/services/dashboard/test_holdings.py tests/services/import_/test_opening_balance.py tests/services/dashboard/test_xirr.py tests/services/dashboard/test_cash_flow.py -q -k "stamp or paid_amount"`
Expected: FAIL (wrong cost, ImportError on `paid_amount`, opening lot 10,000.25).

- [ ] **Step 3: Implement the two helpers**

`lot_rules.py`, after `LOT_CONSUMING_TYPES`:

```python
def cost_per_unit(units: Decimal, nav: Decimal, amount: Decimal | None, stamp_duty: Decimal | None) -> Decimal:
    """What a new lot cost per unit: the row's NAV, or (amount + stamp duty) ÷
    units when stamp duty was charged, so cost equals the CAS cost column
    (decided 7 Oct). Every lot replay passes this as `nav`; selling rows carry
    no stamp duty, so they keep their sale NAV."""
    if stamp_duty and units and amount is not None:
        return (amount + stamp_duty) / units
    return nav
```

`dashboard/xirr.py`, above `_signed_amount`:

```python
def paid_amount(transaction: Transaction) -> Decimal:
    """Money that actually moved: a purchase's amount plus its stamp duty (7 Oct)."""
    return transaction.amount + (transaction.stamp_duty or Decimal("0"))
```

and in `_signed_amount` use `paid_amount(transaction)` in place of both `transaction.amount`.

- [ ] **Step 4: Use them at every replay and cash-flow site**

- `holdings.py` `FifoState.apply`: `apply_lot_rules(self.lots, txn.type, txn.units, cost_per_unit(txn.units, txn.nav, txn.amount, txn.stamp_duty), lambda u, n: [u, n])`; the realised-gain line keeps `txn.nav` (sale price). Import `cost_per_unit` from `app.services.lot_rules`.
- `opening_balance.py` lines 45 and 68: pass `cost_per_unit(row.units, row.nav, row.amount, row.stamp_duty)` instead of `row.nav`. Import it.
- `parser.py` `_fifo_cost` line 317: pass `cost_per_unit(r.units, r.nav, r.amount, r.stamp_duty)` instead of `r.nav`. Import it next to `apply_lot_rules`.
- `analytics/benchmark.py` `_signed_amount`: `amount = paid_amount(txn)` then `return -amount if txn.type in debit_types else amount`. Add `paid_amount` to the existing `from app.services.dashboard.xirr import …` line.
- `dashboard/cash_flow.py`: `amount=str(paid_amount(txn)),` with `from app.services.dashboard.xirr import paid_amount`. If that import creates a cycle (xirr importing cash_flow), move `paid_amount` into `lot_rules.py` instead and import it from there in all three places.

- [ ] **Step 5: Run the affected tests**

Run: `python3 -m pytest tests/services/dashboard/test_holdings.py tests/services/import_/test_opening_balance.py tests/services/dashboard/test_xirr.py tests/services/dashboard/test_cash_flow.py tests/services/analytics/test_benchmark.py tests/services/dashboard/test_snapshots.py tests/services/import_/test_parser.py -q`
Expected: all pass.

- [ ] **Step 6: Checkpoint** — no commit.

---

### Task 8: Synthetic files and harness gates (stamp duty truth, invested = CAS cost, Analytics timing, fix F)

**Files:**
- Modify: `Docs/CAS Files/synthetic/gen_scenarios.py:181` (and any other `lots.append` for a stamped purchase)
- Modify: `Docs/CAS Files/synthetic/harness/test_deep.py` (`cas_truth`, the ANALYTICS block, the final asserts)
- Modify: `Docs/CAS Files/synthetic/harness/test_real_check.py` (`_dashboard_checks`)
- Regenerate: every synthetic PDF and `truth.json` (outside the repo: `Desktop/Unifolio/CAS Files/synthetic/`)

**Interfaces:** consumes everything above; produces the gate results recorded in Task 9.

- [ ] **Step 1: Generator cost includes stamp duty, like real CAMS**

In `gen_scenarios.py` `buy()`, change `h.lots.append([units, net / units])` to:

```python
        # Real CAMS prints cost as the gross amount paid, stamp duty included
        # (checked on the "CAS 10 Yr" statement, 7 Oct). Match it.
        h.lots.append([units, gross / units])
```

- [ ] **Step 2: Regenerate** — from `Docs/CAS Files/synthetic/`, run the generators in the order the synthetic `README.md` gives (at least `python3 gen_scenarios.py` then `python3 gen_gate_scenarios.py`; also `gen_errors.py` only if the README says it depends on `truth.json`). Expected: each prints its file list with values; `truth.json` rewritten.

- [ ] **Step 3: Harness truth attaches stamp duty** — in `test_deep.py` `cas_truth`, inside `for t in s.transactions:`, before the purchase branch, add:

```python
                if ty == "STAMP_DUTY_TAX" and lots and amt:
                    # Same rule as the app: stamp duty belongs to that day's
                    # purchase lot and to the money paid out (7 Oct).
                    for lot, lot_date in reversed(list(zip(lots, lot_dates))):
                        if lot_date == t.date and lot[0]:
                            lot[1] += amt / lot[0]
                            flows_fund.append((t.date, -amt))
                            break
                    continue
```

and keep a parallel `lot_dates` list: `lot_dates = []` next to `lots = []`, and `lot_dates.append(t.date)` wherever `lots.append(...)` runs in that function. If `flows_fund` is built from purchase amounts elsewhere in the function, check that this adds the stamp duty exactly once.

- [ ] **Step 4: Gates in `test_deep.py`**

ANALYTICS block: before `recompute_household_analytics`, run the morning NAV job so peers are warm, forbid the TER refresh, and time the run:

```python
        import importlib.util, time as _time
        from app.services.analytics import amfi_ter_client
        spec = importlib.util.spec_from_file_location(
            "refresh_nav_daily", Path(__file__).resolve().parents[4] / "backend" / "scripts" / "jobs" / "refresh_nav_daily.py")
        nav_job = importlib.util.module_from_spec(spec); spec.loader.exec_module(nav_job)
        asyncio.run(nav_job.main_async(db))  # 06:00 job: held funds + peers

        async def _no_ter_refresh(*_a, **_k):
            raise AssertionError("Analytics ran the TER refresh (fix F)")
        monkeypatch.setattr(amfi_ter_client, "refresh_ter_data", _no_ter_refresh)
        monkeypatch.setattr(amfi_ter_client, "refresh_ter", _no_ter_refresh)

        started = _time.perf_counter()
        asyncio.run(recompute_household_analytics(db, user.id))
        out["analytics_seconds"] = round(_time.perf_counter() - started, 1)
```

(Adjust `parents[4]` so the path resolves to the repo's `backend/scripts/jobs/refresh_nav_daily.py`; print it once.) After the `out["funds"] = comp` line add:

```python
    out["invested_mismatch"] = [c for c in comp if D(c["units_cas"]) > 0
                                and abs(D(c["cost_cas"]) - D(c["invested_app"])) > D("1")]
```

Next to the existing `assert out["reconcile_all_match"], …` add:

```python
        assert not out["invested_mismatch"], out["invested_mismatch"]
        if os.environ.get("ANALYTICS") == "1":
            limit = float(os.environ.get("ANALYTICS_MAX_SECONDS", "30"))
            assert out.get("analytics_seconds", 0) <= limit, out.get("analytics_seconds")
```

(`cost_cas` must come from the regenerated truth, so this only means something after Step 2.)

**Stamp duty that attaches to nothing (Run 2 review L2, added 8 Oct):** in `cas_truth`, count every `STAMP_DUTY_TAX` row with a positive amount that finds no same-day lot (the `for … break` above falls through) and return it; put it in the output as `out["stamp_unattached"]` and add `assert out["stamp_unattached"] == 0, out["stamp_unattached"]` next to the `invested_mismatch` assert. The generator always prints stamp duty on its purchase's date, so any non-zero count means the generator or the truth is wrong: report it, don't loosen the assert. (The app drops such rows silently, as before; this only makes them visible in the gate.)

- [ ] **Step 5: Real-file check** — in `test_real_check.py` `_dashboard_checks`, per member: map each holding to its scheme ISIN (as the existing `COST_DIFF` block does), sum the statements' latest `valuation.cost` per ISIN for open schemes (read in memory with casparser, as `_statement_value` does), and print `invested_vs_cas_max_diff=₹x` (a count/amount summary, no fund names). Fail the run if any fund differs by more than ₹1.

- [ ] **Step 6: Run the synthetic gate and the real-file runs**

Runners (rebuilt 8 Oct, no passwords inside): `Docs/CAS Files/synthetic/harness/tools/run_gate.sh` (the 44 scenarios in `tools/gate_scenarios.txt`, each normal and `MFAPI_BLOCKED=1`, `MASTER_FILE` = `Docs/CAS Files/synthetic/navall_2026-10-06.txt`), `tools/run_real.sh` (real files; passwords from env vars `PW_MAIN`, `PW_CP225`, `PW_CP219`), `tools/net_timing.py` (pytest plugin timing NSE/AMFI/mfapi calls: `PYTHONPATH=…/tools … -p net_timing`).

**Who runs what (8 Oct):** Codex (Run 3) runs, on Windows, from `backend\`, two spot checks only: one stamped-purchase scenario (e.g. `SEQ=p20_20yr.pdf`) and `SEQ=p20_20yr.pdf ANALYTICS=1` once, with `MASTER_FILE` set. The orchestrator runs the full gate and the real files in WSL.

Synthetic gate (orchestrator): `bash "Docs/CAS Files/synthetic/harness/tools/run_gate.sh" /tmp/gate`.
Expected: 88/88 pass; `invested_mismatch` empty and `stamp_unattached` 0 everywhere; reconciliation all match.
Analytics timing: `SEQ=p20_20yr.pdf ANALYTICS=1` once.
Expected: passes; `analytics_seconds` ≤ 30 (it was 365 s on 7 Oct and 635 s on 8 Oct, when NSE alone took 127 s). Also confirm NSE is downloaded at most once per index in the run (`-p net_timing`). If it's over 30 s, report the number and per-section timings instead of raising the limit.
Real files (orchestrator only): `bash "Docs/CAS Files/synthetic/harness/tools/run_real.sh"` with the passwords exported in the shell for that session only; never write them into docs.
Expected: all pass except the known empty statement CP219252880; `invested_vs_cas_max_diff` ≤ ₹1 on every file. "CAS 10 Yr" Total Invested = ₹37,22,637 (±₹1).

- [ ] **Step 7: Checkpoint** — no commit. Gate summary goes into Task 9's baseline entry.

---

### Task 9: Postgres, regression sweep, baseline entry

**Files:** `Docs/orchestration/2026-10-06-cas-import-baseline.md` (append)

- [ ] **Step 1: Local Postgres round trip** (start it if needed: `~/pg16/x/pgserver/pginstall/bin/pg_ctl -D ~/pg16/data -o "-p 5433 -c listen_addresses='*' -k /tmp" -l ~/pg16/log.txt start`). From `backend/`:

```bash
export DATABASE_URL=postgresql+psycopg2://unifolio:unifolio@localhost:5433/unifolio_test
export TEST_DATABASE_URL=$DATABASE_URL
python3 -m alembic upgrade head && python3 -m alembic downgrade 0030 && python3 -m alembic upgrade head && python3 -m alembic current
python3 -m pytest tests/functional_postgres tests/test_migrations.py -q -p no:cacheprovider
```

Expected: `0032 (head)` (the round trip goes 0032 → 0030 → 0032, covering both new migrations); all pass.

- [ ] **Step 2: Affected backend suites** (only these directories):

Run: `python3 -m pytest tests/services/analytics tests/services/dashboard tests/services/import_ tests/scripts tests/api -q -p no:cacheprovider`
Expected: all pass (7 Oct baseline for the wider set: 1291 passed, 8 skipped).

- [ ] **Step 3: Append the baseline entry** — a section "Analytics speed + stamp duty (date)" with: TER comparison summary (Task 2 Step 5), TER refresh seconds before/after, Analytics seconds before/after for p20_20yr, synthetic 88/88 with invested = CAS cost, real-file results (counts only), Postgres round trip.

- [ ] **Step 4: Checkpoint** — no commit.

---

### Task 10: Docs and the staging guide

**Files:**
- Create: `Docs/orchestration/2026-10-08-staging-deploy-guide-analytics-stamp-duty.md`
- Modify: `decisions.md`, `log.md`, `session.md`, `backend.md`, `database.md`, `CLAUDE.md` (one-line "Latest" pointer only), `DEFERRED_FEATURES.md` (only if scope changed)

- [ ] **Step 1: `decisions.md`** — one entry "2026-10-07 — Analytics speed fix and stamp duty", with: Analytics never refreshes TER; TER job daily at 06:20 as `ter-daily` with the counts log line; TER linked to SEBI scheme codes by exact name, no fuzzy matching, unlinked schemes get no TER (8 Oct, with the Kotak → Tata finding); NAV job warms peers, Analytics keeps its warm-up as a safety net; stuck-run ceiling 15 min; NSE index history fresh within 4 days (8 Oct, 32 downloads / 127 s per run before); stamp duty stored and included in cost and cash flows; generator cost now gross like real CAMS. Not built: fix E, the “still calculating” message, the rest of question 3 (pointer to `DEFERRED_FEATURES.md` “Question 3 in full”).

- [ ] **Step 2: `log.md`, `backend.md`, `database.md`, `session.md`, `CLAUDE.md`** — append-only `log.md` entry; `database.md`: migrations 0031 and 0032; `backend.md`: the file list from this plan; `session.md`: overwrite with current status; `CLAUDE.md`: replace the "Latest" line with a one-line pointer.

- [ ] **Step 3: Staging guide** — same structure, command style and "Good looks like / If it isn't good" blocks as `Docs/orchestration/2026-10-07-staging-deploy-guide-cas-fixes.md`. **It must start the bastion before any tunnel and stop it at the end.** Steps:
  1. Connection values; start the bastion; Terminal A tunnel / Terminal B with `psql` (the two-terminal form from 7 Oct, not one block).
  2. Staging on `0030`.
  3. Build and push the backend image; run migrations `0031` and `0032` (`alembic upgrade head`); roll the backend service.
  4. Terraform: expect **3 to add, 3 to destroy** (ter_monthly → ter_daily) and nothing else.
  5. `scripts/clean-staging-db.sh` (user data only; reference tables untouched).
  6. Clear the TER table once, because the 7 Oct run saved ~1,040 wrong fuzzy TERs: `DELETE FROM scheme_ter;` (reference data; the job rebuilds it in seconds; the old-month fallback must not show a wrong value). Then run `ter-daily` by hand **twice**: first `--month <last month, e.g. 09-2026>` (last month's feed is complete, so funds whose house hasn't filed this month still get last month's real TER as the fallback; ~624 pages, can take minutes, re-run if AMFI times out), then with no argument for the current month. Each: `success=True`; the first should show `new_links` ≈ 7,000+. (Added 8 Oct after the Run 1 review, finding 2.) Then check no linked scheme points at another fund house (the plan’s Task 2 Step 6 query, run against staging read-only). Run `nav-daily` once by hand.
  7. Checks: `aws scheduler get-schedule --name unifolio-staging-job-ter-daily` (`cron(20 6 * * ? *)`, ENABLED); `scheme_ter` row counts for the current month (≈8,665 checked); a fresh account uploading "CAS 10 Yr": Total Invested ₹37,22,637, Import health all ✓, Analytics loads in under a minute (D2: no “Save” line).
  8. Stop the bastion.

- [ ] **Step 4: Checkpoint** — no commit. Tell the user which files to review and commit.

---

## Self-review notes

- **Spec coverage:** A, C → Task 1; B → Tasks 2–3 (TER linked by SEBI scheme code, decided 8 Oct); D → Task 4; stuck-run ceiling → Task 5; NSE freshness → Task 5B; stamp duty → Tasks 6–7; F (no TER refresh in Analytics, timing) → Task 1 Step 1 and Task 8 Step 4; invested = CAS cost gate → Task 8; staging wipe and Terraform → Task 10; deferred items → `DEFERRED_FEATURES.md` (done 7 Oct).
- **Found while planning, not in the change map:** stamp duty has to enter all four lot replays (holdings, opening balance, opening restore, the parser's conversion cost). Without that, statements starting mid-history would double-count it (Review Focus 2). The synthetic generator printed cost without stamp duty, unlike real CAMS, so it changes too (Task 8). The change map's backend table is updated to match.
- **Run 1 review fixes (8 Oct, orchestrator, test-first):** link key keeps parenthesised text (`_compact_key = re.sub(r"[^A-Z0-9]", "", name.upper())`, so "(Segregated …)" funds don't link to the main fund); rows without `NSDLSchemeCode` are never linked or joined; the latest-dated row wins per code (`_rows_by_code`, replacing `_latest_row_per_scheme`); a manual entry (even with no code) is never relinked; an empty key never links; `refresh_ter(db, month=None)` and the job's `--month MM-YYYY` let the deploy rebuild last month first; the recompute refreshes `started_at` after every committed section (heartbeat for the 15-minute ceiling); the NAV job skips a failing category instead of stopping. Rejected: requiring one local spelling per key (it dropped 15 correct links; with parentheses kept no two different funds in AMFI's 14,356-scheme list share a key). Real data after the fixes: 7,041 links, 0 cross-fund-house, 0.6 s.
- **Revised 8 Oct after Run 1:** Task 2’s brand-scoped fuzzy matching was replaced by a stored link to SEBI’s scheme code (exact cleaned name, no fuzzy), because the live comparison showed every fuzzy match was wrong (923 cross-fund-house, ~116 wrong year/series within a house). The TER code becomes migration 0031 and stamp duty 0032. The staging guide clears `scheme_ter` once.
- **Types:** `TerRefreshResult` (with `new_links`), `_compact_key`, `TER_LINK_EXACT`/`TER_LINK_MANUAL`, `refresh_ter`, `refresh_ter_data`, `cost_per_unit`, `paid_amount`, `STAMPED_TYPES`, `STAMP_DUTY_RATE`, `_attach_stamp_duty` are used with the same names and signatures in every task.
- **Run 2 review (8 Oct):** Review Focus 3 holds for purchase rows only when the re-upload adds at least one new row; it does not hold for conversion rows saved before 0032 (their amount is FIFO cost, which now includes stamp duty, and the matcher keys on amount) nor for an identical re-upload (rejected as already imported before any backfill). Both only affect data saved before 0032; the staging deploy wipes user data, so they are proposed as accepted limits. Fixed: `cost_per_unit` never returns a positive exponent (an exact `5E+1` reached Avg NAV as 0.00); a reversed (negative) stamp row is skipped, not attached as a charge.
- **Before Run 3 (8 Oct):** Task 8 Step 6 pointed at the previous Claude account's scratchpad scripts; it now names the rebuilt runners in `Docs/CAS Files/synthetic/harness/tools/` and splits the work (Codex: code, regeneration, two Windows spot checks; orchestrator: the 88-run gate and real files in WSL). Task 8 Step 4 gains a `stamp_unattached` count from the Run 2 review (L2).
- **Run 3 result (8 Oct):** the invested-vs-CAS gate exposed three pre-existing problems unrelated to stamp duty: the harness looked funds up by `schemes.isin` only (an IDCW-reinvest fund is filed under its payout ISIN with the reinvest ISIN in `isin_reinvest`), the generator's bounced SIP (`reverse_last`) removed the oldest units instead of the bounced purchase's lot (CAMS and the app remove that lot), and a switch-in costs units × 4-dp NAV in the app vs the printed amount in the CAS (₹1.93 on a ~₹1.8 cr fund). The Analytics timing gate failed (50 s Windows, 155–197 s WSL) because mfapi drops about a third of the morning job's ~1,500 concurrent peer downloads; **skipped for now by the user** (`DEFERRED_FEATURES.md`), so the 30 s timing gate is recorded, not enforced (`ANALYTICS_MAX_SECONDS` raised only in the run command, never in the code), until that fix lands. Also: Run 3's prompt wrongly said `truth.json` lives outside the repo; it stays in the repo (only PDFs moved, `pdf_dir.py`).
- **Final (8 Oct):** Task 8's checks were completed by the orchestrator. The ₹1 cost check allows 4-dp NAV rounding on large holdings. The synthetic gate compares all members' holdings and skips only known funds whose statement cost the app rightly rejects. The real-file check answers the same-person popup with Yes and skips the hand-made family files' cost and value checks (user decisions). The final review's fixes are in (unreadable peer response, codeless TER feed, harness checks that can fail). Correction: the Terraform plan for `ter-monthly` → `ter-daily` is **3 to add, 1 to change, 3 to destroy**, not "3 to add, 3 to destroy": the scheduler's IAM policy lists every job's task definition, so it updates in place. Task 9's baseline entry and Task 10's docs and staging guide are done.
