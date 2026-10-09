# Attribute 11 — Scenario Simulator (Drawdown / Stress-Test) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replay a household's actual current portfolio (today's real scheme weights/values)
through 31 historical and hypothetical market-stress windows, precomputed once per scenario
and served instantly, with a per-scheme, per-member rupee breakdown — "if my portfolio
existed during the COVID crash, what would have happened to it, scheme by scheme, member by
member."

**Architecture:** Option B (confirmed over live per-request computation): a one-time,
scheme-master-wide NAV backfill (Step 1, a standalone script, not a scheduled job) feeds a
precomputed `scenario_scheme_results` table (Step 2, a new `scenario_engine.py` module) that
every household's stress-test request (Step 3) just filters by held scheme IDs — an indexed
`SELECT`, no live NAV computation, no network call. Three non-NAV-replay special cases
(multi-phase events, Franklin Templeton's redemption freeze, forward-looking hypotheticals)
reuse the same `scenarios`/`scenario_scheme_results` schema with extra columns/tables rather
than parallel structures. This is its own top-level `Scenarios` nav route, not a stacked
Analytics section (Ayush's explicit placement choice) — a standalone `app/api/scenarios.py`
router, not a `_SECTIONS` dispatcher entry.

**Tech Stack:** Python/SQLAlchemy/Alembic backend, reusing `nav.py`'s existing `mfapi.in`
client and `category_ranking.py`'s bounded bulk-NAV-lookup pattern — zero new dependencies,
zero new external data source. React/TypeScript frontend, 4 distinct result-view components.

**Spec:**
- `Docs/analytics/2026-10-07-sub-project-1-planning.md` — "Attribute 11" section (lines 280-1295)
- `Docs/analytics/2026-10-08-attribute-11-scenario-simulator-spec.md` — frontend spec
- `Docs/analytics/artifacts/2026-10-08-attribute-11-scenario-simulator-visual-map.html` — visual reference

> **Revised 2026-10-09 — binding, read before Task 1.** All decisions are made (user, 9 Oct;
> explainer with the full reasoning: `Docs/orchestration/subproject1-execution/a11-scenario-simulator.html`,
> cards 1–12). Where this block and a code block below disagree, this block wins; the main code
> blocks have been updated to match it.
>
> 1. **Compute every settled scenario** (card 1) — new **Task 5b**, `scripts/compute_all_scenarios.py`.
>    Staging order: migrations → Task 3 NAV backfill → A12's daily benchmark job (TRI from 1990) →
>    `compute_all_scenarios.py`. Task 8's daily step also recomputes the US-Iran **group** row.
> 2. **List column works on SQLite, unchanged on Postgres** (card 2) — model and migration use
>    `sa.JSON().with_variant(postgresql.ARRAY(sa.String()), "postgresql")`; the seed builds ids with
>    `uuid.uuid4()` and inserts through typed `sa.table()` objects (no `gen_random_uuid()`, no raw
>    array binding), so `tests/test_migrations.py` round-trips it on SQLite. Nothing may query inside
>    the column with SQL array operators; it's read in Python only.
> 3. **One classifier for every ETF / index fund / FoF** (card 3) — `underlying_asset_class(sebi_category,
>    scheme_name)` replaces `hypothetical_asset_class_bucket` (Task 4 code below). Used in all three
>    places: the hypothetical bucket, the historical category average (wrapper categories are averaged per
>    `"<category>|<asset class>"`), and the historical asset-class fallback (replaces the dashboard's
>    `asset_class_bucket` inside A11 only; the dashboard is unchanged). Asset classes: `Equity`,
>    `Index/ETF`, `Gold`, **`Silver`** (new), **`Overseas`** (renamed from `Overseas FoF`), `Debt-short`,
>    `Debt-long`, `Hybrid`, `Other`. This is an asset-class split for scenario proxies only; it doesn't
>    touch category-ranking/Scorer peer groups, so it doesn't reopen the deferred index-fund
>    sub-bucketing (`DEFERRED_FEATURES.md`).
> 4. **Seed check** (card 4) — `34 rows, 31 top-level, 8 curated, 45 assumptions`.
> 5. **Engine tests set up correctly** (card 5) — real-data test keys NAVs on the dates the engine reads
>    (window start and end) plus one test that a NAV on the day before start is *not* used; the
>    multi-phase and Franklin tests patch `compute_holdings` to return holdings for the schemes under
>    test and call `get_scenario_result_for_household`. The engine is not changed to satisfy a test.
> 6. **Every figure is the household's own** (card 6) — `portfolio % = Σ rupee impact ÷ Σ current value
>    of holdings with a %`; no-data and frozen holdings are left out of both sums, never 0%. Same formula
>    per member and per phase. The US-Iran hero reads the group row's own results; "by fund" stays on
>    the current phase. New response fields: `covered_value`, `total_value`, `no_data_funds`, and
>    `pct` on each member row.
> 7. **Franklin match, normalised** (card 7) — exact match after one clean-up on both sides (drop a
>    trailing "(no. of segregated portfolio(s)-N)", lowercase, hyphens → spaces, collapse spaces), and the
>    scheme's AMC must be Franklin Templeton. Held name = `base_name`, else the scheme name before
>    " - ". Frozen holdings show "Frozen" and are excluded from the portfolio %.
> 8. **Benchmarks read TRI only** (card 8) — both lookups in `_scenario_benchmark_comparisons` filter
>    `return_type == BenchmarkReturnType.TRI` (A12 is committed: `b926933`).
> 9. **Frontend fits the repo** (card 9) — snake_case types; `features/scenarios/api.ts` copying
>    `features/analytics/api.ts` (`cachedFetch` + `apiClient`); routes in `App.tsx` and
>    `MobileBottomNav.tsx` (there's no `frontend/src/app/`); `--color-hypo` and `--color-freeze` added to
>    `tokens.css` for light and dark, used only here. Written into Tasks 9–12 below (Task 12 rewritten).
> 10. **Quick stat = market + funds** (card 10) — three nullable columns on `scenarios`:
>     `quick_market_pct` (Nifty 50 TRI end ÷ start − 1), `quick_equity_pct` and `quick_debt_pct`
>     (AUM-weighted over real, non-proxied results in that asset class; weight = `scheme_aaum` for the
>     latest quarter on or before the window start, else the earliest quarter held; hidden when fewer
>     than 5 weighted funds). Filled by `compute_scenario_results`. `ScenarioSummaryRow.quick_stat_pct`
>     becomes `quick_market_pct`, `quick_equity_pct`, `quick_debt_pct`, `quick_weight_quarter`. None for
>     hypotheticals, groups with phases, and Franklin.
> 11. **Silver assumptions** (card 11) — seeded: Hormuz +4, US recession 0, AI/tech −5, rupee +10,
>     lost decade +2 (reasons in the seed below).
> 12. **Release gate: hypotheticals behind a flag** (card 12; `decisions.md` 2026-10-08,
>     `DEFERRED_FEATURES.md`) — `Settings.scenario_hypotheticals_enabled: bool = False`
>     (`SCENARIO_HYPOTHETICALS_ENABLED`). Off: `GET /scenarios` omits `HYPOTHETICAL` rows and
>     `GET /scenarios/{id}` returns 404 for one. Flip only after a markets-literate review of the 45
>     values. The SEBI disclaimer ships as the working draft (the other release gate).
>
> **Migration numbers:** after A09 (expected `0034`), these are expected to be `0035` (tables) and
> `0036` (seed) — run the `ls` in Global Constraints anyway.

## Global Constraints

- **Migration numbering:** run `ls backend/alembic/versions | sort | tail -5` before
  creating any migration — never hardcode a guessed number.
- **No fabricated precision, ever.** A scheme with no real NAV coverage for a scenario's
  window gets `pct_change = NULL` and `proxy_basis` set, never a silently-computed number
  standing in for "we don't know." This is the single most load-bearing rule in this
  attribute (Ayush's own framing: "don't fake precision").
- **Proxies are built only from real data, never from other proxies** — the category-average
  pass runs once, from schemes with genuine NAV coverage, before any scheme reads from it.
- **Step 1 (NAV backfill) is a one-time, standalone script — never a scheduled job, never
  run inside the live API process.** It shares only `mfapi.in` and the RDS instance with
  production; never the live request-handling connection pool, never staging's NAT egress
  IP during its local-only spike phase (see Task 2's sequencing).
- **Hypothetical scenarios (category D) are pure arithmetic — zero NAV lookup, zero network
  call.** `current_value * (1 + assumed_pct_change / 100)` per asset-class bucket, using
  holdings data the product already computes.
- **A scenario with zero `scenario_hypothetical_assumptions` rows must return
  `assumptions_not_set = true` and no numeric fields at all** — never a 0%/blank-table
  fallback. This is correct generic behavior for any future hypothetical added without
  immediately seeding its assumptions, not a case any of today's 5 seeded rows hits.
- **The Franklin Templeton redemption freeze is scenario-scoped
  (`scenarios.had_redemption_freeze_schemes TEXT[]`), not scheme-scoped** — a fact about this
  specific scenario's window, not a permanent scheme property.
- **Multi-phase scenarios need no special-casing in the compute engine** — a phase is a
  normal `scenarios` row with `parent_scenario_id` set; only the API's grouping/serving layer
  treats phases differently from standalone scenarios.
- **`display_rank` is the entire curation mechanism** — no separate "featured" flag, no
  `LIMIT` clause pretending to curate. `GET /scenarios?curated=true` filters on
  `display_rank IS NOT NULL`; phase rows never get a `display_rank`.
- **Compliance framing ships now, as a working (not yet SEBI-cleared) default** — exact copy
  from the frontend spec §6, applied to every historical-percentage display.
- **Decimal discipline** — every rupee/percentage value crossing into the frontend is a
  Decimal string, never a float.
- **No client-side proxy/phase/freeze inference** — the frontend's `resolveResultShape`
  reads only explicit backend flags (`scenarioType`, `hadRedemptionFreezeSchemes`,
  `parentScenarioId`/`hasPhases`), never a scenario's name, category, or date range.

## Review Focus

1. **A scheme that didn't exist yet when a scenario's window started** (e.g. any scheme
   launched after 2015 run against the dot-com bust) — must fall through real-data → category
   average → asset-class average → honest "no data," never crash or silently return 0%.
2. **A household holding one of Franklin Templeton's 6 frozen schemes alongside other,
   unrelated debt funds** — the frozen schemes must show "Frozen, ~20mo," the other debt
   holdings must show their real/proxied %, in the same response, never one treatment bleeding
   into the other.
3. **The US-Iran war's ongoing Phase 3** (`end_date IS NULL`, `is_ongoing = true`) — "by
   fund" must show only the current (Phase 3) numbers, not a sum across all 3 phases; the
   group row's hero stat is the only cumulative figure.
4. **A hypothetical scenario with zero assumption rows** (the generic future case, not any
   of today's 5) — must return `assumptions_not_set = true` with no numeric fields at all,
   never a 0%/blank table.
5. **A household member with zero holdings in a scenario's category universe** (e.g. a
   member who holds only debt funds, running an equity-concentrated scenario) — must appear
   in the family-level breakdown with a correctly-absent or zero rupee impact for that
   member, never silently omitted from the member list entirely.

6. **A gold, silver or bond ETF/index fund/FoF never gets the equity assumption**, and a generic
   wrapper's missing fund is proxied by funds holding the same asset (card 3).
7. **Two households get their own headline %**; no-data and frozen holdings are left out of both
   sums, never counted as 0% (card 6). The US-Iran hero equals the group row's result.
8. **All 6 real Franklin AMFI base names match** their seeded names; "Franklin India Short Term
   Fund" doesn't (card 7).
9. **SQLite and Postgres both work** — every backend test and `tests/test_migrations.py` pass on
   SQLite; on Postgres the freeze column is `text[]` (card 2).
10. **Hypotheticals are hidden with the flag off** — list and results (card 12).

## File Structure

**Backend — create:**
- `backend/alembic/versions/<NNNN>_scenarios_and_scenario_results.py`
- `backend/alembic/versions/<NNNN+1>_seed_scenario_library.py`
- `backend/scripts/jobs/backfill_scheme_nav_history.py`
- `backend/app/services/analytics/scenario_asset_class.py`
- `backend/app/services/analytics/scenario_engine.py`
- `backend/app/api/scenarios.py`
- `backend/scripts/compute_all_scenarios.py` (Task 5b)
- `backend/tests/scripts/test_compute_all_scenarios.py` (Task 5b)
- `backend/tests/services/analytics/test_scenario_asset_class.py`
- `backend/tests/services/analytics/test_scenario_engine.py`
- `backend/tests/api/test_scenarios_api.py`

**Backend — modify:**
- `backend/app/models/reference.py` — add `Scenario`, `ScenarioSchemeResult`,
  `ScenarioCategoryAverage`, `ScenarioHypotheticalAssumption` models
- `backend/app/services/analytics/schemas.py` — add scenario response schemas
- `backend/app/main.py` — register the new `scenarios` router
- `backend/app/config.py` — `scenario_hypotheticals_enabled` release-gate flag (card 12)
- `backend/scripts/jobs/refresh_nav_daily.py` — add the `is_ongoing` scenario recompute step

**Frontend — create:**
- `frontend/src/features/scenarios/ScenarioPicker.tsx`
- `frontend/src/features/scenarios/StandardResultView.tsx`
- `frontend/src/features/scenarios/MultiPhaseResultView.tsx`
- `frontend/src/features/scenarios/RedemptionFreezeResultView.tsx`
- `frontend/src/features/scenarios/HypotheticalResultView.tsx`
- `frontend/src/features/scenarios/resolveResultShape.ts`
- `frontend/src/features/scenarios/types.ts`
- `frontend/src/features/scenarios/ScenarioPicker.test.tsx`
- `frontend/src/features/scenarios/resolveResultShape.test.ts`
- `frontend/src/features/scenarios/StandardResultView.test.tsx`

**Frontend — modify:**
- `frontend/src/features/dashboard/NavigationShell.tsx`, `MainDashboardFlow.tsx` — desktop `Scenarios` tab
- `frontend/src/mobile/shell/MobileBottomNav.tsx`, `frontend/src/mobile/MobileRoot.tsx` — mobile tab
- `frontend/src/styles/tokens.css` — `--color-hypo`, `--color-freeze` (light + dark)

**Frontend — also create:** `features/scenarios/api.ts`, `ScenariosScreen.tsx`, `ScenariosScreen.test.tsx` (Task 12)

---

### Task 1: Schema — `scenarios` + 3 result/config tables

**Files:**
- Create: `backend/alembic/versions/<NNNN>_scenarios_and_scenario_results.py`
- Modify: `backend/app/models/reference.py`
- Test: `backend/tests/services/analytics/test_scenario_engine.py` (table-shape smoke test)

**Interfaces:**
- Produces: `Scenario`, `ScenarioSchemeResult`, `ScenarioCategoryAverage`,
  `ScenarioHypotheticalAssumption` ORM models — consumed by every later task.

- [ ] **Step 1: Add the models**

In `backend/app/models/reference.py`, append (add `ARRAY` from `sqlalchemy.dialects.postgresql`
to the existing imports, alongside the already-imported `postgresql.JSONB`, and `JSON` from
`sqlalchemy` — revised 9 Oct, card 2):

```python
class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    start_date: Mapped[date_ | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date_ | None] = mapped_column(Date, nullable=True)
    scenario_type: Mapped[str] = mapped_column(String, nullable=False, default="CRASH")
    is_ongoing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    display_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parent_scenario_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scenarios.id"), nullable=True)
    phase_label: Mapped[str | None] = mapped_column(String, nullable=True)
    phase_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # A text[] on Postgres, JSON on SQLite (every backend test builds its database with
    # create_all, and SQLite has no ARRAY). Read in Python only, never queried inside.
    had_redemption_freeze_schemes: Mapped[list[str] | None] = mapped_column(
        JSON().with_variant(postgresql.ARRAY(String), "postgresql"), nullable=True
    )
    # Picker quick stat (card 10): market move + AUM-weighted equity/debt fund moves.
    quick_market_pct: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    quick_equity_pct: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    quick_debt_pct: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    quick_weight_quarter: Mapped[date_ | None] = mapped_column(Date, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "scenario_type IN ('CRASH', 'BULL_RUN', 'POLICY_RATE', 'HYPOTHETICAL')",
            name="ck_scenarios_type",
        ),
    )


class ScenarioSchemeResult(Base):
    __tablename__ = "scenario_scheme_results"

    scenario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scenarios.id"), primary_key=True)
    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), primary_key=True)
    pct_change: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    is_proxied: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    proxy_basis: Mapped[str | None] = mapped_column(String, nullable=True)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class ScenarioCategoryAverage(Base):
    __tablename__ = "scenario_category_averages"

    scenario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scenarios.id"), primary_key=True)
    sebi_category: Mapped[str] = mapped_column(String, primary_key=True)
    avg_pct_change: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    scheme_count: Mapped[int] = mapped_column(Integer, nullable=False)


class ScenarioHypotheticalAssumption(Base):
    __tablename__ = "scenario_hypothetical_assumptions"

    scenario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scenarios.id"), primary_key=True)
    asset_class: Mapped[str] = mapped_column(String, primary_key=True)
    assumed_pct_change: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    assumption_note: Mapped[str] = mapped_column(String, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "asset_class IN ('Equity', 'Index/ETF', 'Gold', 'Silver', 'Overseas', "
            "'Debt-short', 'Debt-long', 'Hybrid', 'Other')",
            name="ck_scenario_hypothetical_assumptions_asset_class",
        ),
    )
```

- [ ] **Step 2: Write the migration**

Run `ls backend/alembic/versions | sort | tail -5` first for the real next number/`down_revision`.

```python
"""scenarios_and_scenario_results: drawdown/stress-test scenario library (attribute 11)

Revision ID: <NNNN>
Revises: <NNNN-1>

Four tables backing Option B's precompute-once/serve-cheap design: scenarios
(the library itself, including multi-phase rows via parent_scenario_id and
the Franklin Templeton redemption-freeze flag), scenario_scheme_results
(Step 2's per-scheme output, one row per scheme per non-hypothetical
scenario -- real or proxied, never missing), scenario_category_averages
(an intermediate table the proxy pass reads from, real-data-only),
scenario_hypothetical_assumptions (admin-entered per-asset-class assumed
moves for category-D scenarios, no NAV data at all).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "<NNNN>"
down_revision = "<NNNN-1>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scenarios",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("scenario_type", sa.String(), nullable=False, server_default="CRASH"),
        sa.Column("is_ongoing", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("display_rank", sa.Integer(), nullable=True),
        sa.Column("parent_scenario_id", sa.Uuid(), nullable=True),
        sa.Column("phase_label", sa.String(), nullable=True),
        sa.Column("phase_order", sa.Integer(), nullable=True),
        sa.Column("had_redemption_freeze_schemes", sa.JSON().with_variant(postgresql.ARRAY(sa.String()), "postgresql"), nullable=True),
        sa.Column("quick_market_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("quick_equity_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("quick_debt_pct", sa.Numeric(8, 2), nullable=True),
        sa.Column("quick_weight_quarter", sa.Date(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["parent_scenario_id"], ["scenarios.id"]),
        sa.CheckConstraint(
            "scenario_type IN ('CRASH', 'BULL_RUN', 'POLICY_RATE', 'HYPOTHETICAL')",
            name="ck_scenarios_type",
        ),
    )
    op.create_table(
        "scenario_scheme_results",
        sa.Column("scenario_id", sa.Uuid(), nullable=False),
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("pct_change", sa.Numeric(6, 2), nullable=True),
        sa.Column("is_proxied", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("proxy_basis", sa.String(), nullable=True),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("scenario_id", "scheme_id"),
        sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"]),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
    )
    op.create_index(
        "ix_scenario_scheme_results_scheme_id", "scenario_scheme_results", ["scheme_id"]
    )
    op.create_table(
        "scenario_category_averages",
        sa.Column("scenario_id", sa.Uuid(), nullable=False),
        sa.Column("sebi_category", sa.String(), nullable=False),
        sa.Column("avg_pct_change", sa.Numeric(6, 2), nullable=False),
        sa.Column("scheme_count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("scenario_id", "sebi_category"),
        sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"]),
    )
    op.create_table(
        "scenario_hypothetical_assumptions",
        sa.Column("scenario_id", sa.Uuid(), nullable=False),
        sa.Column("asset_class", sa.String(), nullable=False),
        sa.Column("assumed_pct_change", sa.Numeric(6, 2), nullable=False),
        sa.Column("assumption_note", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("scenario_id", "asset_class"),
        sa.ForeignKeyConstraint(["scenario_id"], ["scenarios.id"]),
        sa.CheckConstraint(
            "asset_class IN ('Equity', 'Index/ETF', 'Gold', 'Silver', 'Overseas', "
            "'Debt-short', 'Debt-long', 'Hybrid', 'Other')",
            name="ck_scenario_hypothetical_assumptions_asset_class",
        ),
    )


def downgrade() -> None:
    op.drop_table("scenario_hypothetical_assumptions")
    op.drop_table("scenario_category_averages")
    op.drop_table("scenario_scheme_results")
    op.drop_table("scenarios")
```

- [ ] **Step 3: Write the failing shape test**

```python
# backend/tests/services/analytics/test_scenario_engine.py
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import (
    Scenario,
    ScenarioCategoryAverage,
    ScenarioHypotheticalAssumption,
    ScenarioSchemeResult,
    Scheme,
)


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_scenario_tables_round_trip():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="S1", name="Test Fund", amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    scenario = Scenario(id=uuid.uuid4(), name="COVID crash", description="d", start_date=date(2020, 1, 20), end_date=date(2020, 3, 31), scenario_type="CRASH", display_rank=1)
    db.add_all([scheme, scenario])
    db.commit()

    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=scheme.id, pct_change=Decimal("-38.00"), is_proxied=False))
    db.add(ScenarioCategoryAverage(scenario_id=scenario.id, sebi_category=scheme.sebi_category, avg_pct_change=Decimal("-35.00"), scheme_count=42))
    db.commit()

    result = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id, scheme_id=scheme.id).one()
    assert result.pct_change == Decimal("-38.00")


def test_scenario_phase_row_references_parent():
    db = _session()
    group = Scenario(id=uuid.uuid4(), name="US-Iran war (2026)", description="d", start_date=date(2026, 2, 28), end_date=None, scenario_type="CRASH", is_ongoing=True, display_rank=7)
    db.add(group)
    db.commit()
    phase = Scenario(id=uuid.uuid4(), parent_scenario_id=group.id, name="US-Iran war -- Shock", description="d", start_date=date(2026, 2, 28), end_date=date(2026, 4, 2), scenario_type="CRASH", phase_label="Shock", phase_order=1)
    db.add(phase)
    db.commit()
    assert db.query(Scenario).filter_by(parent_scenario_id=group.id).one().phase_label == "Shock"


def test_hypothetical_assumption_requires_valid_asset_class():
    db = _session()
    scenario = Scenario(id=uuid.uuid4(), name="AI/tech valuation bust", description="d", scenario_type="HYPOTHETICAL", display_rank=8)
    db.add(scenario)
    db.commit()
    db.add(ScenarioHypotheticalAssumption(scenario_id=scenario.id, asset_class="Equity", assumed_pct_change=Decimal("-22.00"), assumption_note="note"))
    db.commit()
    assert db.query(ScenarioHypotheticalAssumption).filter_by(scenario_id=scenario.id).one().assumed_pct_change == Decimal("-22.00")
```

- [ ] **Step 4: Run it, confirm it fails**

Run: `cd backend && pytest tests/services/analytics/test_scenario_engine.py -v`
Expected: FAIL — `ImportError: cannot import name 'Scenario'`

- [ ] **Step 5: Implement Step 1/2, re-run**

Run: `cd backend && alembic upgrade head && pytest tests/services/analytics/test_scenario_engine.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/reference.py backend/alembic/versions/ backend/tests/services/analytics/test_scenario_engine.py
git commit -m "feat: add scenarios and scenario result tables"
```

---

### Task 2: Seed the 31-scenario library + hypothetical assumptions

**Files:**
- Create: `backend/alembic/versions/<NNNN+1>_seed_scenario_library.py`

**Interfaces:**
- Consumes: `Scenario`, `ScenarioHypotheticalAssumption` (Task 1).
- Produces: 31 seeded `scenarios` rows (24 plain + 1 Franklin + 1 group/3-phase US-Iran war +
  5 hypothetical) and 5 fully-seeded `scenario_hypothetical_assumptions` sets — consumed by
  Task 3 (backfill targets nothing from this data directly, but Task 4's engine reads these
  rows) and Task 6 (API).

This is a **data migration**, not a schema migration — a second, separate migration file so
a future date-correction (per the planning doc's "verification can edit this script's literal
values rather than requiring a re-plan" note) is a simple `UPDATE` against an existing row,
not a new migration.

- [ ] **Step 1: Write the data migration**

Run `ls backend/alembic/versions | sort | tail -5` for the real `down_revision` (Task 1's
migration).

```python
"""seed_scenario_library: 31 scenarios + 5 hypothetical assumption sets (attribute 11)

Revision ID: <NNNN+1>
Revises: <NNNN>

Seed data only -- see 2026-10-07-sub-project-1-planning.md's "Seed data" section
for the full verification trail behind every date/stat below. A future date
correction is a plain UPDATE against the named row, not a new migration.
"""
from decimal import Decimal

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "<NNNN+1>"
down_revision = "<NNNN>"
branch_labels = None
depends_on = None


# Revised 9 Oct (card 2): no gen_random_uuid() and no raw array binding, so this seed runs on
# SQLite too (tests/test_migrations.py). Every INSERT INTO scenarios below goes through
# _insert_scenario, which types each column for the current database; ids come from Python.
# Replace each `conn.execute(sa.text("INSERT INTO scenarios ...")).scalar_one()` /
# `result.scalar_one()` with the id _insert_scenario returns, keeping the same values.
import uuid

_scenarios = sa.table(
    "scenarios",
    sa.column("id", sa.Uuid()), sa.column("parent_scenario_id", sa.Uuid()),
    sa.column("name", sa.String()), sa.column("description", sa.String()),
    sa.column("start_date", sa.Date()), sa.column("end_date", sa.Date()),
    sa.column("scenario_type", sa.String()), sa.column("is_ongoing", sa.Boolean()),
    sa.column("display_rank", sa.Integer()), sa.column("phase_label", sa.String()),
    sa.column("phase_order", sa.Integer()),
    sa.column("had_redemption_freeze_schemes", sa.JSON().with_variant(postgresql.ARRAY(sa.String()), "postgresql")),
)
_assumptions = sa.table(
    "scenario_hypothetical_assumptions",
    sa.column("scenario_id", sa.Uuid()), sa.column("asset_class", sa.String()),
    sa.column("assumed_pct_change", sa.Numeric(6, 2)), sa.column("assumption_note", sa.String()),
)


def _insert_scenario(conn, **values) -> uuid.UUID:
    from datetime import date as _date
    for key in ("start_date", "end_date"):
        if isinstance(values.get(key), str):
            values[key] = _date.fromisoformat(values[key])
    values["id"] = uuid.uuid4()
    conn.execute(_scenarios.insert().values(**values))
    return values["id"]


def upgrade() -> None:
    conn = op.get_bind()

    plain_scenarios = [
        ("Dot-com bust", "Tests IT/tech concentration.", "2000-03-01", "2002-10-31", "CRASH", False, None),
        ("Global Financial Crisis (2008)", "Sensex ~-60% peak-to-trough; crude spiked beforehand.", "2008-01-01", "2008-10-31", "CRASH", False, 3),
        ("Eurozone debt crisis (2011)", "Slow grind down, weak rupee.", "2010-11-01", "2011-12-31", "CRASH", False, None),
        ("Taper tantrum (2013)", "Rupee ~55->68, bond yields spiked. Tests debt funds/INR exposure.", "2013-05-01", "2013-09-30", "CRASH", False, None),
        ("China crash / yuan devaluation", "EM risk-off.", "2015-08-01", "2016-01-31", "CRASH", False, None),
        ("Demonetisation (2016)", "Domestic cash shock -- real estate, small caps, NBFCs hit hardest.", "2016-11-01", "2017-01-31", "CRASH", False, None),
        ("Budget 2018 LTCG reintroduction", "Tax-policy shock, tests tax-drag modelling.", "2018-02-01", "2018-02-02", "POLICY_RATE", False, None),
        ("IL&FS / NBFC crisis (2018)", "Credit event (27-28 Aug 2018 CP default, 21-24 Sep sector sell-off) + small/midcap drawdown after.", "2018-08-01", "2018-11-30", "CRASH", False, None),
        ("2019 pre-COVID slowdown", "Carried over from the original library.", "2019-06-01", "2019-11-30", "CRASH", False, None),
        ("COVID crash", "Nifty ~-38% in ~45 trading days (20 Jan 2020 ATH 12,430 to 23 Mar 2020 low 7,511).", "2020-01-20", "2020-03-31", "CRASH", False, 1),
        ("2022 global tightening", "Russia-Ukraine + Fed hikes + record FPI outflows. Nifty ~-18.4% (18,604 to 15,183).", "2021-10-01", "2022-06-30", "CRASH", False, 2),
        ("Adani-Hindenburg (2023)", "Single-group collapse.", "2023-01-01", "2023-02-28", "CRASH", False, 6),
        ("SVB / Credit Suisse (2023)", "Global banking scare, mild India impact.", "2023-03-01", "2023-03-31", "CRASH", False, None),
        ("Oct 2024 - Mar 2025 correction", "Nifty ~-10.4% off its 27 Sep 2024 ATH (26,277), -6.2% in Oct alone.", "2024-09-01", "2025-03-31", "CRASH", False, None),
        ("Trump tariff shock (2025)", "\"Liberation Day\" tariffs announced 2 Apr; deepest crash 6-7 Apr; fully recovered by 15 Apr.", "2025-04-02", "2025-04-15", "CRASH", False, None),
        ("2003-07 India bull run", "Sensex ~6-7x. Tests secular-rally compounding.", "2003-04-01", "2008-01-31", "BULL_RUN", False, None),
        ("Post-GFC rebound", "V-shaped recovery, rewards staying invested.", "2009-03-01", "2010-11-30", "BULL_RUN", False, None),
        ("Post-COVID bull run", "Nifty ~+140-145% (7,511 to ~18,600). Small caps and new-age IPOs ran far ahead.", "2020-03-23", "2021-10-31", "BULL_RUN", False, 4),
        ("2023 - Sep 2024 broad rally", "Midcap/smallcap + SIP-boom phase.", "2023-01-01", "2024-09-27", "BULL_RUN", False, None),
        ("Gold and silver rally (2024-26)", "Gold +23% (2024), +60%+ (2025), fresh ATH 29 Jan 2026. Still ongoing.", "2024-01-01", None, "BULL_RUN", True, None),
        ("2004 election result", "Sensex -15.52% intraday, Nifty -17.47%; circuit breaker triggered twice.", "2004-05-17", "2004-05-17", "POLICY_RATE", False, None),
        ("2024 election result", "Sensex -5.74%, Nifty -5.93%; fresh ATHs again within 2-3 trading days.", "2024-06-04", "2024-06-04", "POLICY_RATE", False, None),
        ("RBI hiking cycle (2022-23)", "Repo 4.0% -> 6.5% over 6 MPC hikes. Tests debt-fund mark-to-market losses.", "2022-05-04", "2023-02-08", "POLICY_RATE", False, None),
        ("Rate cut cycle (2025)", "Reverse case: duration funds win. Repo 6.5%->5.25%. Concluded, reversed to a hike 7 Oct 2026.", "2025-02-07", "2025-12-05", "POLICY_RATE", False, None),
    ]
    scenario_ids: dict[str, str] = {}
    for name, description, start, end, scenario_type, is_ongoing, display_rank in plain_scenarios:
        result = conn.execute(
            sa.text(
                "INSERT INTO scenarios (id, name, description, start_date, end_date, scenario_type, is_ongoing, display_rank) "
                "VALUES (gen_random_uuid(), :name, :description, :start, :end, :scenario_type, :is_ongoing, :display_rank) "
                "RETURNING id"
            ),
            {"name": name, "description": description, "start": start, "end": end,
             "scenario_type": scenario_type, "is_ongoing": is_ongoing, "display_rank": display_rank},
        )
        scenario_ids[name] = result.scalar_one()

    franklin_id = conn.execute(
        sa.text(
            "INSERT INTO scenarios (id, name, description, start_date, end_date, scenario_type, "
            "is_ongoing, display_rank, had_redemption_freeze_schemes) "
            "VALUES (gen_random_uuid(), :name, :description, :start, :end, 'CRASH', false, 5, :freeze) "
            "RETURNING id"
        ),
        {
            "name": "Franklin Templeton wind-up (2020)",
            "description": "Debt fund liquidity freeze, kept separate from COVID to test illiquid debt specifically.",
            "start": "2020-04-01", "end": "2020-06-30",
            "freeze": [
                "Franklin India Low Duration Fund", "Franklin India Ultra Short Bond Fund",
                "Franklin India Short Term Income Plan", "Franklin India Credit Risk Fund",
                "Franklin India Dynamic Accrual Fund", "Franklin India Income Opportunities Fund",
            ],
        },
    ).scalar_one()
    scenario_ids["Franklin Templeton wind-up (2020)"] = franklin_id

    group_id = conn.execute(
        sa.text(
            "INSERT INTO scenarios (id, name, description, start_date, end_date, scenario_type, is_ongoing, display_rank) "
            "VALUES (gen_random_uuid(), 'US-Iran war (2026)', "
            "'Multi-phase -- see phases. Verify current status again before treating as closed.', "
            "'2026-02-28', NULL, 'CRASH', true, 7) RETURNING id"
        )
    ).scalar_one()
    scenario_ids["US-Iran war (2026)"] = group_id
    for name, description, start, end, is_ongoing, phase_label, phase_order in [
        ("US-Iran war -- Shock", "Sensex/Nifty ~-12% by 2 Apr; US crude +27% to ~$115 in early March.", "2026-02-28", "2026-04-02", False, "Shock", 1),
        ("US-Iran war -- Partial recovery", "Markets rallied sharply 12 Jun when Trump declared the war over.", "2026-04-02", "2026-07-08", False, "Partial recovery", 2),
        ("US-Iran war -- Relapse", "Nifty fell >2% on 8 Jul when the interim deal was called off; rupee past 95.50. Still unresolved.", "2026-07-08", None, True, "Relapse", 3),
    ]:
        conn.execute(
            sa.text(
                "INSERT INTO scenarios (id, parent_scenario_id, name, description, start_date, end_date, "
                "scenario_type, is_ongoing, phase_label, phase_order) "
                "VALUES (gen_random_uuid(), :parent_id, :name, :description, :start, :end, 'CRASH', :is_ongoing, :phase_label, :phase_order)"
            ),
            {"parent_id": group_id, "name": name, "description": description, "start": start,
             "end": end, "is_ongoing": is_ongoing, "phase_label": phase_label, "phase_order": phase_order},
        )

    hypothetical_scenarios = [
        ("Strait of Hormuz closure", "Crude above $150.", None),
        ("US recession + Fed pivot", "US GDP contracts, Fed cuts rates aggressively.", None),
        ("AI/tech valuation bust", "US tech -40%, spillover to Indian IT.", 8),
        ("Rupee sharp depreciation", "Rupee past 105.", None),
        ("Indian equity \"lost decade\"", "Prolonged sideways market, tests SIP discipline.", None),
    ]
    for name, description, display_rank in hypothetical_scenarios:
        result = conn.execute(
            sa.text(
                "INSERT INTO scenarios (id, name, description, start_date, end_date, scenario_type, is_ongoing, display_rank) "
                "VALUES (gen_random_uuid(), :name, :description, NULL, NULL, 'HYPOTHETICAL', false, :display_rank) RETURNING id"
            ),
            {"name": name, "description": description, "display_rank": display_rank},
        )
        scenario_ids[name] = result.scalar_one()

    assumptions = {
        "Strait of Hormuz closure": [
            ("Equity", -25.0, "Anchored to 2022 global tightening (-18.4%) scaled up ~35% for a full chokepoint closure disrupting ~20% of global oil supply."),
            ("Index/ETF", -25.0, "Same as Equity -- a Nifty/Sensex index fund is passive equity exposure, not a distinct risk."),
            ("Debt-short", -1.0, "Liquid/overnight/money-market/ultra-short funds carry almost no duration risk."),
            ("Debt-long", -4.0, "RBI likely hikes/holds hard to defend the rupee against imported inflation."),
            ("Hybrid", -16.6, "0.6 x Equity (-25.0) + 0.4 x Debt-long (-4.0), computed not eyeballed."),
            ("Gold", 8.0, "Oil-shock safe-haven demand plus a weaker rupee tailwind."),
            ("Silver", 4.0, "Safe-haven bid, cut by the industrial slowdown an oil shock brings."),
            ("Overseas", -10.0, "Global equity also falls, but a diversified overseas fund is less exposed than India to India-specific oil-import pain."),
            ("Other", -15.0, "Residual bucket, follows the broad domestic market moderately."),
        ],
        "US recession + Fed pivot": [
            ("Equity", -15.0, "A US recession dampens global growth/FII flows, but India's domestic-consumption story partially decouples."),
            ("Index/ETF", -15.0, "Same as Equity."),
            ("Debt-short", 1.0, "Barely moves, mild positive drift from rate-cut expectations."),
            ("Debt-long", 4.0, "A Fed pivot to rate cuts is a tailwind for duration/debt funds."),
            ("Hybrid", -7.4, "0.6 x Equity (-15.0) + 0.4 x Debt-long (+4.0), computed not eyeballed."),
            ("Gold", 6.0, "A Fed pivot to lower real rates is historically bullish for gold."),
            ("Silver", 0.0, "Lower real rates help; a US recession hits industrial demand. Roughly cancels."),
            ("Overseas", -18.0, "This shock originates IN the US market -- direct hit, not diluted spillover."),
            ("Other", -10.0, "Residual bucket, moderate drag."),
        ],
        "AI/tech valuation bust": [
            ("Equity", -22.0, "Assumes Indian equity falls ~55% as much as a 40% US tech crash, via IT-sector spillover."),
            ("Index/ETF", -22.0, "Same as Equity."),
            ("Debt-short", 0.0, "No real linkage -- this is an equity-specific valuation shock."),
            ("Debt-long", -2.0, "Minor mark-to-market drag from a broader risk-off move."),
            ("Hybrid", -14.0, "0.6 x Equity (-22.0) + 0.4 x Debt-long (-2.0), computed not eyeballed."),
            ("Gold", 5.0, "Modest safe-haven bid, smaller than a macro/oil shock."),
            ("Silver", -5.0, "Electronics and solar demand weakens; a smaller haven bid than gold."),
            ("Overseas", -35.0, "This IS a US-tech-concentrated shock -- close to the full US-market hit."),
            ("Other", -18.0, "Residual bucket, follows the broader risk-off move."),
        ],
        "Rupee sharp depreciation": [
            ("Equity", -12.0, "Anchored to Taper Tantrum (2013): FII outflows and import-cost inflation hurt the broad market."),
            ("Index/ETF", -12.0, "Same as Equity."),
            ("Debt-short", -2.0, "Mild -- RBI defends the currency with some front-end rate action."),
            ("Debt-long", -6.0, "RBI likely hikes/holds hard to defend the currency, same mechanism as Taper Tantrum."),
            ("Hybrid", -9.6, "0.6 x Equity (-12.0) + 0.4 x Debt-long (-6.0), computed not eyeballed."),
            ("Gold", 10.0, "Gold is dollar-denominated, INR price rises mechanically when the rupee weakens."),
            ("Silver", 10.0, "Priced in dollars: the same currency translation as gold."),
            ("Overseas", 8.0, "Foreign-currency-denominated assets gain in INR terms purely from currency translation."),
            ("Other", -5.0, "Residual bucket, modest negative."),
        ],
        "Indian equity \"lost decade\"": [
            ("Equity", -8.0, "A prolonged sideways/low-return market, not a single trough. Known limitation: applied instantaneously like every other hypothetical, not amortized over years."),
            ("Index/ETF", -8.0, "Same as Equity."),
            ("Debt-short", 2.0, "Accrues normally, slightly muted versus long debt."),
            ("Debt-long", 3.0, "Positive -- debt keeps accruing normally regardless of equity stagnation."),
            ("Hybrid", -3.6, "0.6 x Equity (-8.0) + 0.4 x Debt-long (+3.0), computed not eyeballed."),
            ("Gold", 2.0, "Mixed historically, kept modest rather than assumed reliably positive."),
            ("Silver", 2.0, "No India-specific link; modest, like gold."),
            ("Overseas", 3.0, "Overseas diversification is the thing that helps in a domestic-equity-stagnation scenario."),
            ("Other", -5.0, "Residual bucket, least confident number in this row."),
        ],
    }
    for scenario_name, rows in assumptions.items():
        for asset_class, pct, note in rows:
            conn.execute(_assumptions.insert().values(
                scenario_id=scenario_ids[scenario_name], asset_class=asset_class,
                assumed_pct_change=Decimal(str(pct)), assumption_note=note,
            ))


def downgrade() -> None:
    # Computed results reference the seeded scenarios once compute_all_scenarios has run.
    op.execute("DELETE FROM scenario_scheme_results")
    op.execute("DELETE FROM scenario_category_averages")
    op.execute("DELETE FROM scenario_hypothetical_assumptions")
    op.execute("DELETE FROM scenarios")
```

- [ ] **Step 2: Run and verify row counts**

(Orchestrator step — Codex doesn't run alembic against a real database; Codex relies on
`tests/test_migrations.py`, which must round-trip both new migrations on SQLite.)

Run: `cd backend && alembic upgrade head`
Then: `cd backend && python -c "
from app.db.session import SessionLocal
from app.models.reference import Scenario, ScenarioHypotheticalAssumption
with SessionLocal() as db:
    assert db.query(Scenario).count() == 34, db.query(Scenario).count()
    assert db.query(Scenario).filter(Scenario.parent_scenario_id.is_(None)).count() == 31
    assert db.query(Scenario).filter(Scenario.display_rank.isnot(None)).count() == 8
    assert db.query(ScenarioHypotheticalAssumption).count() == 45
    print('OK: 34 rows, 31 top-level, 8 curated, 45 assumptions')
"`
Expected: `OK: 34 rows, 31 top-level, 8 curated, 45 assumptions`

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat: seed the 31-scenario library and hypothetical assumptions"
```

---

### Task 3: Step 1 — one-time scheme-master NAV backfill script

**Files:**
- Create: `backend/scripts/jobs/backfill_scheme_nav_history.py`
- Test: `backend/tests/scripts/test_backfill_scheme_nav_history.py`

**Interfaces:**
- Consumes: `warm_nav_history(db, schemes)` (existing, unmodified, `app/services/dashboard/nav.py`).
- Produces: `chunk_schemes(schemes: list[Scheme], batch_size: int) -> Iterator[list[Scheme]]`,
  `schemes_needing_backfill(db: Session) -> list[Scheme]`, `main_async(db: Session) -> None`
  — this script is run manually once via `aws ecs run-task`, never registered in Terraform's
  `locals.jobs` (per the planning doc: a true one-off, not a recurring schedule).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/scripts/test_backfill_scheme_nav_history.py
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import NavHistory, Scheme
from scripts.jobs.backfill_scheme_nav_history import chunk_schemes, schemes_needing_backfill


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_chunk_schemes_splits_into_fixed_size_batches():
    schemes = [object() for _ in range(320)]
    batches = list(chunk_schemes(schemes, 150))
    assert [len(b) for b in batches] == [150, 150, 20]


def test_schemes_needing_backfill_excludes_already_warmed_schemes():
    db = _session()
    warmed = Scheme(id=uuid.uuid4(), amfi_code="W1", name="Warmed Fund", amc_name="AMC", sebi_category="Equity")
    cold = Scheme(id=uuid.uuid4(), amfi_code="C1", name="Cold Fund", amc_name="AMC", sebi_category="Equity")
    db.add_all([warmed, cold])
    db.commit()
    db.add(NavHistory(scheme_id=warmed.id, date="2024-01-01", nav="10.00"))
    db.commit()

    remaining = schemes_needing_backfill(db)
    assert [s.id for s in remaining] == [cold.id]
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/scripts/test_backfill_scheme_nav_history.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement**

```python
# backend/scripts/jobs/backfill_scheme_nav_history.py
"""One-time scheme-master-wide NAV backfill (attribute 11, Step 1). Never
registered as a scheduled job -- run manually once via `aws ecs run-task`
on the existing task definition/cluster, since this only ever runs once
plus rare small top-ups for newly-listed schemes. Resumable by
construction (schemes_needing_backfill re-derives "what's left" from
nav_history itself every run -- no separate progress table), batched to
bound peak memory and mfapi.in request-burst size, with a circuit breaker
so a future mfapi.in format/availability regression (see planning doc's
2026-08 AMFI column-format incident) surfaces loudly instead of silently
corrupting the backfill.
"""
import asyncio
import logging
import sys
import time
from collections.abc import Iterator
from pathlib import Path
from typing import TypeVar

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import distinct
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.reference import NavHistory, Scheme
from app.services.dashboard.nav import warm_nav_history

logger = logging.getLogger(__name__)

_BATCH_SIZE = 150
_BATCH_SLEEP_SECONDS = 2.5
_FAILURE_RATE_ABORT_THRESHOLD = 0.25

T = TypeVar("T")


def chunk_schemes(schemes: list[T], batch_size: int) -> Iterator[list[T]]:
    for i in range(0, len(schemes), batch_size):
        yield schemes[i : i + batch_size]


def schemes_needing_backfill(db: Session) -> list[Scheme]:
    already_warmed = db.query(distinct(NavHistory.scheme_id)).subquery()
    return (
        db.query(Scheme)
        .filter(~Scheme.id.in_(db.query(already_warmed.c.scheme_id)))
        .order_by(Scheme.id)
        .all()
    )


async def main_async(db: Session) -> None:
    targets = schemes_needing_backfill(db)
    batches = list(chunk_schemes(targets, _BATCH_SIZE))
    total = len(targets)
    done = 0
    start = time.monotonic()

    for batch_num, batch in enumerate(batches, start=1):
        before_count = db.query(NavHistory.scheme_id).filter(
            NavHistory.scheme_id.in_([s.id for s in batch])
        ).distinct().count()
        try:
            await warm_nav_history(db, batch)
        except Exception:
            logger.exception("backfill_scheme_nav_history: batch %d/%d raised, aborting", batch_num, len(batches))
            raise
        after_count = db.query(NavHistory.scheme_id).filter(
            NavHistory.scheme_id.in_([s.id for s in batch])
        ).distinct().count()
        newly_warmed = after_count - before_count
        failure_rate = 1 - (newly_warmed / len(batch)) if batch else 0
        done += len(batch)
        elapsed = time.monotonic() - start
        logger.info(
            "backfill_scheme_nav_history: batch %d/%d, %d/%d schemes done (%.1f%%), "
            "%d failures this batch, elapsed=%.0fs",
            batch_num, len(batches), done, total, 100 * done / total if total else 100,
            len(batch) - newly_warmed, elapsed,
        )
        if failure_rate > _FAILURE_RATE_ABORT_THRESHOLD:
            logger.error(
                "backfill_scheme_nav_history: batch %d failure rate %.0f%% exceeds %.0f%% threshold, aborting run",
                batch_num, 100 * failure_rate, 100 * _FAILURE_RATE_ABORT_THRESHOLD,
            )
            return
        if batch_num < len(batches):
            await asyncio.sleep(_BATCH_SLEEP_SECONDS)

    logger.info("backfill_scheme_nav_history: complete, %d/%d schemes backfilled", done, total)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/scripts/test_backfill_scheme_nav_history.py -v`
Expected: PASS

- [ ] **Step 5: Execute the real-world safety sequencing — NOT part of this script's code,
but a mandatory operational step before it is ever run against staging**

Per the planning doc's "Testing/safety sequencing" section: (1) run this script from local
dev only, pointed at a local DB, against the real `mfapi.in` — never staging, never
production, so a worst-case block has zero blast radius on shared infrastructure; (2) a
small 200-500 scheme controlled batch first, timed/logged for latency and error/429 rate;
(3) only after that comes back clean, propose the real ~10,538-scheme run as a scheduled
off-hours one-off `aws ecs run-task`, clear of the existing 06:00-06:30 UTC job cluster and
staging's 9PM-5AM IST stop window. This step has no automated test — it's a one-time runbook
action the implementing engineer executes and reports back on, not a thing this plan's TDD
cycle can pin.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/jobs/backfill_scheme_nav_history.py backend/tests/scripts/test_backfill_scheme_nav_history.py
git commit -m "feat: add one-time scheme-master NAV backfill script"
```

---

### Task 4: `scenario_asset_class.py` — the hypothetical bucketing helper

**Files:**
- Create: `backend/app/services/analytics/scenario_asset_class.py`
- Test: `backend/tests/services/analytics/test_scenario_asset_class.py`

**Interfaces:**
- Produces: `underlying_asset_class(sebi_category: str, scheme_name: str = "") -> str` — consumed by
  Task 5's hypothetical computation path.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/services/analytics/test_scenario_asset_class.py
import pytest

from app.services.analytics.scenario_asset_class import underlying_asset_class


# Real AMFI category headings and scheme names (live file, 9 Oct).
@pytest.mark.parametrize("category, name, expected", [
    ("Equity Scheme - Flexi Cap Fund", "Parag Parikh Flexi Cap Fund", "Equity"),
    ("Solution Oriented Scheme - Retirement Fund", "HDFC Retirement Savings Fund", "Hybrid"),
    ("Debt Scheme - Liquid Fund", "SBI Liquid Fund", "Debt-short"),
    ("Debt Scheme - Credit Risk Fund", "ICICI Prudential Credit Risk Fund", "Debt-long"),
    ("Some Unclassified Category", "X", "Other"),
    # wrappers whose category says what they hold
    ("Other Scheme - Gold ETF", "Nippon India ETF Gold BeES", "Gold"),
    ("Exchange Traded Funds (ETFs) - Silver ETF", "ICICI Prudential Silver ETF", "Silver"),
    ("Exchange Traded Funds (ETFs) - Debt ETF", "SBI Nifty 10 yr Benchmark G-Sec ETF", "Debt-long"),
    ("Index Funds - Debt Funds", "Bandhan CRISIL IBX Gilt June 2027 Index Fund", "Debt-long"),
    ("Exchange Traded Funds (ETFs) - ETFs investing overseas", "Mirae Asset Hang Seng TECH ETF", "Overseas"),
    ("Other Scheme - FoF Overseas", "PGIM India Global Equity Opportunities Fund of Funds", "Overseas"),
    ("Index Funds - Equity Funds", "UTI Nifty 50 Index Fund", "Index/ETF"),
    # generic wrappers: the name decides
    ("Other Scheme - Other  ETFs", "Bharat Bond ETF - April 2030", "Debt-long"),
    ("Other Scheme - Other  ETFs", "Nippon India ETF Liquid BeES", "Debt-short"),
    ("Other Scheme - Other  ETFs", "Nippon India Silver ETF", "Silver"),
    ("Other Scheme - Other  ETFs", "Motilal Oswal NASDAQ 100 ETF", "Overseas"),
    ("Other Scheme - Other  ETFs", "Nippon India ETF Nifty PSU Bank BeES", "Index/ETF"),  # "PSU" isn't debt
    ("Other Scheme - Index Funds", "Edelweiss CRISIL IBX 50:50 Gilt Plus SDL Apr 2037 Index Fund", "Debt-long"),
    ("Other Scheme - Index Funds", "Nippon India Nifty 50 Index Fund", "Index/ETF"),
    ("Other Scheme - FoF Domestic", "SBI Gold Fund", "Gold"),
    ("Other Scheme - FoF Domestic", "ICICI Prudential Passive Multi-Asset Fund of Funds", "Hybrid"),
    ("Other Scheme - FoF Domestic", "Groww Nifty PSE ETF FOF", "Index/ETF"),
    ("Other Scheme - FoF Domestic", "Axis Multi Factor Passive FoF", "Other"),
])
def test_underlying_asset_class(category, name, expected):
    assert underlying_asset_class(category, name) == expected


def test_no_gold_silver_or_bond_wrapper_lands_in_equity():
    """The bug this replaces: a gold ETF got the equity move (-25% instead of +8% under Hormuz)."""
    for category, name in [
        ("Other Scheme - Gold ETF", "HDFC Gold ETF"),
        ("Other Scheme - Other  ETFs", "Kotak Silver ETF"),
        ("Other Scheme - Index Funds", "Axis CRISIL IBX SDL May 2027 Index Fund"),
    ]:
        assert underlying_asset_class(category, name) != "Index/ETF"
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_scenario_asset_class.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement**

```python
# backend/app/services/analytics/scenario_asset_class.py
"""Attribute-11-only asset-class bucketing, deliberately separate from
allocation_labels.py's 4-bucket asset_class_bucket(): that function is
already relied on elsewhere (allocation breakdowns) and widening it isn't
this attribute's problem to solve or risk regressing. This bucketing is
finer (9 buckets, not 4) because a hypothetical scenario's assumed % move
genuinely differs by sub-bucket -- e.g. an overseas FoF gains in INR terms
during a rupee-depreciation scenario while a domestic equity index falls,
which a single "Equity" bucket would get backwards."""
import re

# An ETF, index fund or fund-of-funds is a wrapper: what moves its value is what it
# holds. AMFI files ~1,200 of them under 18 headings, and the generic ones ("Other ETFs",
# "Other Scheme - Index Funds", "FoF Domestic") mix equity, bonds, gold, silver and foreign
# funds, so the scheme name decides there. Whole-word keywords only; bare "PSU" is not a
# debt keyword ("Nifty PSU Bank ETF" is equity).
_SILVER = re.compile(r"\bsilver\b")
_GOLD = re.compile(r"\bgold\b")
_OVERSEAS = re.compile(
    r"\b(nasdaq|s&p|hang seng|msci|nyse|fang\+?|global|world|international|overseas|china|japan|taiwan|emerging markets?)\b"
)
_DEBT_SHORT = re.compile(r"\b(liquid|overnight|1d rate|money market|arbitrage)\b")
_DEBT = re.compile(r"\b(gilt|g-sec|gsec|sdl|bonds?|crisil ibx|ibx|target maturity|t-bill|treasury|debt)\b")
_EQUITY_HINT = re.compile(r"\b(equity|nifty|bse|sensex|etf)\b")
_HYBRID = re.compile(r"\b(multi asset|multi-asset|balanced|hybrid|asset allocation)\b")
_WRAPPER = ("etf", "index fund", "fund of funds", "fof")
_SHORT_CATEGORY = ("liquid", "overnight", "money market", "ultra short")


def underlying_asset_class(sebi_category: str, scheme_name: str = "") -> str:
    category = sebi_category.lower()
    name = scheme_name.lower()
    if not any(marker in category for marker in _WRAPPER):
        if "gold" in category:
            return "Gold"
        if "equity" in category:
            return "Equity"
        if "hybrid" in category or "retirement" in category or "children" in category:
            return "Hybrid"
        if any(k in category for k in ("debt", "income", "liquid", "money market", "gilt", "overnight")):
            return "Debt-short" if any(k in category for k in _SHORT_CATEGORY) else "Debt-long"
        return "Other"

    # A wrapper whose category already says what it holds.
    if "silver" in category:
        return "Silver"
    if "gold" in category:
        return "Gold"
    if "overseas" in category:
        return "Overseas"
    if "debt" in category:
        return "Debt-short" if _DEBT_SHORT.search(name) else "Debt-long"
    if "hybrid" in category:
        return "Hybrid"
    if "equity" in category:
        return "Index/ETF"

    # A generic wrapper: the name says what it holds.
    if _SILVER.search(name):
        return "Silver"
    if _GOLD.search(name):
        return "Gold"
    if _OVERSEAS.search(name):
        return "Overseas"
    if _DEBT_SHORT.search(name):
        return "Debt-short"
    if _DEBT.search(name):
        return "Debt-long"
    if _HYBRID.search(name):
        return "Hybrid"
    # No asset keyword: generic ETFs/index funds track Indian equity indices, and so does a
    # domestic FoF whose name points at equity ("... Nifty PSE ETF FOF"); any other domestic
    # FoF could hold anything, so it stays in the residual bucket.
    is_fof = "fof" in category or "fund of funds" in category
    return "Other" if is_fof and not _EQUITY_HINT.search(name) else "Index/ETF"
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_scenario_asset_class.py -v`
Expected: PASS (24 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/scenario_asset_class.py backend/tests/services/analytics/test_scenario_asset_class.py
git commit -m "feat: add hypothetical-scenario asset-class bucketing"
```

---

### Task 5: `scenario_engine.py` — Step 2 (proxy mapping + category averages) and Step 3 (serving)

**Files:**
- Create: `backend/app/services/analytics/scenario_engine.py`
- Modify: `backend/app/services/analytics/schemas.py`
- Test: append to `backend/tests/services/analytics/test_scenario_engine.py`

**Interfaces:**
- Consumes: `_bulk_nav_on_or_before`-equivalent bounded lookup (reimplemented here scoped to
  the whole scheme master, not one category — `category_ranking.py`'s version is
  category-scoped and not reused directly since this needs the full `schemes` table);
  `underlying_asset_class` (Task 4); `compute_holdings` (`app/services/dashboard/
  holdings.py`); `list_household_members` (`app/services/dashboard/household_members.py`).
- Produces: `compute_scenario_results(db: Session, scenario: Scenario) ->
  None` (Step 2, writes `scenario_scheme_results`/`scenario_category_averages`, called once
  per non-hypothetical scenario — by Task 3's... no, by a one-off admin script/migration,
  since this is "computed once, reused identically every time" per the Global Constraints);
  `get_scenario_summary(db: Session, scenario: Scenario) -> ScenarioSummaryRow`,
  `get_scenario_result_for_household(db: Session, scenario: Scenario, household_member_ids:
  list[uuid.UUID]) -> ScenarioResultRow` — consumed by Task 7 (API).

- [ ] **Step 1: Add the schemas**

In `backend/app/services/analytics/schemas.py`, append:

```python
class ScenarioSummaryRow(BaseModel):
    scenario_id: str
    name: str
    scenario_type: str
    start_date: str | None
    end_date: str | None
    is_ongoing: bool
    display_rank: int | None
    parent_scenario_id: str | None
    has_phases: bool
    had_redemption_freeze_schemes: list[str] | None
    quick_market_pct: str | None      # Nifty 50 TRI over the window (card 10)
    quick_equity_pct: str | None      # AUM-weighted equity funds
    quick_debt_pct: str | None        # AUM-weighted debt funds
    quick_weight_quarter: str | None  # the AUM quarter used as weights


class ScenarioPhaseResult(BaseModel):
    label: str
    order: int
    start_date: str
    end_date: str | None
    is_ongoing: bool
    pct: str | None


class ScenarioFundResult(BaseModel):
    scheme_id: str
    scheme_name: str
    pct: str | None
    is_proxied: bool
    proxy_basis: str | None
    is_frozen: bool


class ScenarioMemberFundResult(BaseModel):
    scheme_id: str
    scheme_name: str
    rupee_impact: str | None


class ScenarioMemberResult(BaseModel):
    household_member_id: str
    member_name: str
    rupee_impact: str
    pct: str | None                  # this member's own % (fix 6)
    funds: list[ScenarioMemberFundResult]


class ScenarioBenchmarkResult(BaseModel):
    name: str
    pct: str


class ScenarioHypotheticalAssumptionRow(BaseModel):
    asset_class: str
    assumed_pct_change: str
    assumption_note: str


class ScenarioResultRow(BaseModel):
    scenario: ScenarioSummaryRow
    portfolio_impact_pct: str | None   # Σ rupee impact ÷ covered_value (fix 6)
    rupee_impact: str
    covered_value: str                 # current value of holdings with a %
    total_value: str                   # current value of all holdings
    no_data_funds: int                 # holdings with no %, frozen excluded
    benchmarks: list[ScenarioBenchmarkResult]
    phases: list[ScenarioPhaseResult]
    by_fund: list[ScenarioFundResult]
    by_member: list[ScenarioMemberResult]
    hypothetical_assumptions: list[ScenarioHypotheticalAssumptionRow]
    assumptions_not_set: bool
```

- [ ] **Step 2: Write the failing tests — proxy mapping cascade**

```python
# append to backend/tests/services/analytics/test_scenario_engine.py
from datetime import date
from unittest.mock import AsyncMock, patch

import pytest

from app.services.analytics.scenario_engine import compute_scenario_results


def test_compute_scenario_results_real_data_scheme_gets_is_proxied_false():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="R1", name="Old Fund", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    scenario = Scenario(id=uuid.uuid4(), name="Test Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()

    navs = {scheme.id: {date(2020, 1, 1): Decimal("100"), date(2020, 3, 31): Decimal("62")}}
    with patch("app.services.analytics.scenario_engine._bulk_nav_for_scenario", return_value=navs):
        compute_scenario_results(db, scenario)

    result = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id, scheme_id=scheme.id).one()
    assert result.is_proxied is False
    assert result.pct_change == Decimal("-38.00")


def test_compute_scenario_results_does_not_use_a_nav_from_before_the_start_date():
    """Pins the date rule on purpose (card 5): the engine reads the NAV on the window's
    start date, so a NAV only on the day before leaves the scheme without real data."""
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="R9", name="Old Fund", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    scenario = Scenario(id=uuid.uuid4(), name="Test Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()
    navs = {scheme.id: {date(2019, 12, 31): Decimal("100"), date(2020, 3, 31): Decimal("62")}}
    with patch("app.services.analytics.scenario_engine._bulk_nav_for_scenario", return_value=navs):
        compute_scenario_results(db, scenario)
    result = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id, scheme_id=scheme.id).one()
    assert result.is_proxied is True


def test_compute_scenario_results_falls_back_to_category_average():
    db = _session()
    old_scheme = Scheme(id=uuid.uuid4(), amfi_code="O1", name="Old Fund", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    new_scheme = Scheme(id=uuid.uuid4(), amfi_code="N1", name="New Fund", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add_all([old_scheme, new_scheme])
    db.commit()
    scenario = Scenario(id=uuid.uuid4(), name="Test Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()

    navs = {old_scheme.id: {date(2020, 1, 1): Decimal("100"), date(2020, 3, 31): Decimal("80")}}
    with patch("app.services.analytics.scenario_engine._bulk_nav_for_scenario", return_value=navs):
        compute_scenario_results(db, scenario)

    new_result = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id, scheme_id=new_scheme.id).one()
    assert new_result.is_proxied is True
    assert new_result.proxy_basis == "sebi_category_average:Equity Scheme - Flexi Cap Fund|Equity"
    assert new_result.pct_change == Decimal("-20.00")


def test_compute_scenario_results_falls_back_to_asset_class_when_category_has_no_real_data():
    db = _session()
    old_scheme = Scheme(id=uuid.uuid4(), amfi_code="O2", name="Old Debt Fund", amc_name="AMC", sebi_category="Debt Scheme - Credit Risk Fund")
    new_scheme = Scheme(id=uuid.uuid4(), amfi_code="N2", name="New Equity Fund", amc_name="AMC", sebi_category="Equity Scheme - Small Cap Fund")
    db.add_all([old_scheme, new_scheme])
    db.commit()
    scenario = Scenario(id=uuid.uuid4(), name="Dot-com bust", description="d", start_date=date(2000, 3, 1), end_date=date(2002, 10, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()

    navs = {old_scheme.id: {date(2000, 2, 29): Decimal("100"), date(2002, 10, 31): Decimal("90")}}
    with patch("app.services.analytics.scenario_engine._bulk_nav_for_scenario", return_value=navs):
        compute_scenario_results(db, scenario)

    new_result = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id, scheme_id=new_scheme.id).one()
    assert new_result.is_proxied is True
    assert new_result.proxy_basis == "asset_class_average:Equity"


def test_compute_scenario_results_honest_no_data_when_nothing_to_proxy_from():
    db = _session()
    new_scheme = Scheme(id=uuid.uuid4(), amfi_code="N3", name="Totally New Fund", amc_name="AMC", sebi_category="Other Scheme - Gold ETF")
    db.add(new_scheme)
    db.commit()
    scenario = Scenario(id=uuid.uuid4(), name="Dot-com bust", description="d", start_date=date(2000, 3, 1), end_date=date(2002, 10, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()

    with patch("app.services.analytics.scenario_engine._bulk_nav_for_scenario", return_value={}):
        compute_scenario_results(db, scenario)

    result = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id, scheme_id=new_scheme.id).one()
    assert result.pct_change is None
    assert result.is_proxied is True
    assert result.proxy_basis == "no_comparable_data"
```

- [ ] **Step 3: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_scenario_engine.py -v -k compute_scenario_results`
Expected: FAIL — `ImportError: cannot import name 'compute_scenario_results'`

- [ ] **Step 4: Implement Step 2 (proxy mapping)**

```python
# backend/app/services/analytics/scenario_engine.py
"""Scenario simulator compute engine (attribute 11). Step 2 (compute_scenario_results)
precomputes one scenario_scheme_results row per active scheme -- real
(is_proxied=false, computed from genuine NAV history) or proxied (category
average, then asset-class average, then an honest "no data" NULL) --
following the planning doc's "proxies built only from real data, never
from other proxies" rule: the real-data pass runs first and completely
for every scheme before any proxy lookup reads from it. Step 3
(get_scenario_summary/get_scenario_result_for_household) is pure serving:
one indexed SELECT filtered to the scenario and the caller's held scheme
IDs, no live NAV computation."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.reference import (
    NavHistory,
    Scenario,
    ScenarioCategoryAverage,
    ScenarioHypotheticalAssumption,
    ScenarioSchemeResult,
    Scheme,
)
from app.services.analytics.scenario_asset_class import underlying_asset_class
from app.services.analytics.schemas import (
    ScenarioBenchmarkResult,
    ScenarioFundResult,
    ScenarioHypotheticalAssumptionRow,
    ScenarioMemberFundResult,
    ScenarioMemberResult,
    ScenarioPhaseResult,
    ScenarioResultRow,
    ScenarioSummaryRow,
)
from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from app.models.reference import SchemeAaum
from app.services.analytics.nse_indices_client import get_index_level_on_or_before
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members


def _bulk_nav_for_scenario(
    db: Session, scheme_ids: list[uuid.UUID], pre_start: date, end: date
) -> dict[uuid.UUID, dict[date, Decimal]]:
    """Scheme-master-wide variant of category_ranking.py's
    `_bulk_nav_on_or_before` -- same bounded MAX(date)-join pattern, not
    reused directly since this scopes to the whole schemes table rather
    than one SEBI category and only ever needs the two window-boundary
    dates, never a 3yr/5yr anchor set."""
    if not scheme_ids:
        return {}
    result: dict[uuid.UUID, dict[date, Decimal]] = {sid: {} for sid in scheme_ids}
    for target in (pre_start, end):
        latest_dates = (
            db.query(NavHistory.scheme_id, func.max(NavHistory.date).label("max_date"))
            .filter(NavHistory.scheme_id.in_(scheme_ids), NavHistory.date <= target)
            .group_by(NavHistory.scheme_id)
            .subquery()
        )
        rows = (
            db.query(NavHistory.scheme_id, NavHistory.nav)
            .join(latest_dates, (NavHistory.scheme_id == latest_dates.c.scheme_id) & (NavHistory.date == latest_dates.c.max_date))
            .all()
        )
        for scheme_id, nav in rows:
            result[scheme_id][target] = nav
    return result


def _proxy_group(scheme: Scheme) -> str:
    # Generic wrapper headings ("Other Scheme - Index Funds") mix equity, bond, gold and
    # silver funds, so a missing fund is proxied by funds holding the same thing, not by
    # the whole heading (card 3). For ordinary categories this is one group per category.
    category = scheme.sebi_category or ""
    return f"{category}|{underlying_asset_class(category, scheme.name)}"


def compute_scenario_results(db: Session, scenario: Scenario) -> None:
    if scenario.scenario_type == "HYPOTHETICAL":
        return  # category D needs no precompute at all -- pure arithmetic at serve time

    all_schemes = db.query(Scheme).filter(Scheme.is_active.is_(True)).all()
    scheme_ids = [s.id for s in all_schemes]
    pre_start = scenario.start_date  # "NAV just before start" -- see note below
    end = scenario.end_date or date.today()
    navs = _bulk_nav_for_scenario(db, scheme_ids, pre_start, end)

    real_pct_by_scheme: dict[uuid.UUID, Decimal] = {}
    for scheme in all_schemes:
        per_scheme = navs.get(scheme.id, {})
        start_nav = per_scheme.get(pre_start)
        end_nav = per_scheme.get(end)
        if start_nav is None or end_nav is None or start_nav == 0:
            continue
        real_pct_by_scheme[scheme.id] = ((end_nav - start_nav) / start_nav * 100).quantize(Decimal("0.01"))

    db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id).delete()
    db.query(ScenarioCategoryAverage).filter_by(scenario_id=scenario.id).delete()

    for scheme_id, pct in real_pct_by_scheme.items():
        db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=scheme_id, pct_change=pct, is_proxied=False))

    category_totals: dict[str, list[Decimal]] = {}
    for scheme in all_schemes:
        if scheme.id in real_pct_by_scheme and scheme.sebi_category:
            category_totals.setdefault(_proxy_group(scheme), []).append(real_pct_by_scheme[scheme.id])
    category_averages = {
        category: (sum(values) / len(values)).quantize(Decimal("0.01"))
        for category, values in category_totals.items()
    }
    for category, avg in category_averages.items():
        db.add(ScenarioCategoryAverage(
            scenario_id=scenario.id, sebi_category=category, avg_pct_change=avg,
            scheme_count=len(category_totals[category]),
        ))

    asset_class_totals: dict[str, list[Decimal]] = {}
    for scheme in all_schemes:
        if scheme.id in real_pct_by_scheme:
            bucket = underlying_asset_class(scheme.sebi_category or "", scheme.name)
            asset_class_totals.setdefault(bucket, []).append(real_pct_by_scheme[scheme.id])
    asset_class_averages = {
        bucket: (sum(values) / len(values)).quantize(Decimal("0.01"))
        for bucket, values in asset_class_totals.items()
    }

    for scheme in all_schemes:
        if scheme.id in real_pct_by_scheme:
            continue
        category = scheme.sebi_category or ""
        group = _proxy_group(scheme)
        if group in category_averages:
            db.add(ScenarioSchemeResult(
                scenario_id=scenario.id, scheme_id=scheme.id, pct_change=category_averages[group],
                is_proxied=True, proxy_basis=f"sebi_category_average:{group}",
            ))
            continue
        bucket = underlying_asset_class(category, scheme.name)
        if bucket in asset_class_averages:
            db.add(ScenarioSchemeResult(
                scenario_id=scenario.id, scheme_id=scheme.id, pct_change=asset_class_averages[bucket],
                is_proxied=True, proxy_basis=f"asset_class_average:{bucket}",
            ))
            continue
        db.add(ScenarioSchemeResult(
            scenario_id=scenario.id, scheme_id=scheme.id, pct_change=None,
            is_proxied=True, proxy_basis="no_comparable_data",
        ))

    _set_quick_stats(db, scenario, all_schemes, real_pct_by_scheme)
    db.commit()


_QUICK_MIN_FUNDS = 5


def _aum_weighted(pcts: dict[uuid.UUID, Decimal], weights: dict[uuid.UUID, Decimal]) -> Decimal | None:
    weighted = [(pcts[sid], weights[sid]) for sid in pcts if weights.get(sid, Decimal("0")) > 0]
    if len(weighted) < _QUICK_MIN_FUNDS:
        return None
    total = sum(w for _, w in weighted)
    return (sum(p * w for p, w in weighted) / total).quantize(Decimal("0.01"))


def _set_quick_stats(
    db: Session, scenario: Scenario, all_schemes: list[Scheme], real_pct_by_scheme: dict[uuid.UUID, Decimal]
) -> None:
    """Picker-card figures (card 10): the market's move, and the AUM-weighted move of
    equity funds and of debt funds -- kept apart, because averaging them together turned
    COVID's -38% into about -15%. A figure without data stays NULL, never a substitute."""
    scenario.quick_market_pct = scenario.quick_equity_pct = scenario.quick_debt_pct = None
    scenario.quick_weight_quarter = None
    has_phases = db.query(Scenario).filter_by(parent_scenario_id=scenario.id).first() is not None
    if scenario.scenario_type == "HYPOTHETICAL" or scenario.had_redemption_freeze_schemes or has_phases:
        return

    end = scenario.end_date or date.today()
    start_level = get_index_level_on_or_before(db, BenchmarkIndex.NIFTY_50, scenario.start_date, return_type=BenchmarkReturnType.TRI)
    end_level = get_index_level_on_or_before(db, BenchmarkIndex.NIFTY_50, end, return_type=BenchmarkReturnType.TRI)
    if start_level and end_level and start_level[0] > 0:
        scenario.quick_market_pct = ((end_level[0] / start_level[0] - 1) * 100).quantize(Decimal("0.01"))

    # Weight by fund size at the window's start when we hold that quarter; otherwise the
    # earliest quarter we hold, and the tooltip says which ("weighted by fund size in ...").
    quarter = (
        db.query(func.max(SchemeAaum.reference_period)).filter(SchemeAaum.reference_period <= scenario.start_date).scalar()
        or db.query(func.min(SchemeAaum.reference_period)).scalar()
    )
    if quarter is None:
        return
    weights = {
        sid: value for sid, value in db.query(SchemeAaum.scheme_id, SchemeAaum.aaum_value).filter(
            SchemeAaum.reference_period == quarter, SchemeAaum.scheme_id.in_(list(real_pct_by_scheme))
        ).all()
    }
    classes = {s.id: underlying_asset_class(s.sebi_category or "", s.name) for s in all_schemes if s.id in real_pct_by_scheme}
    equity = {sid: p for sid, p in real_pct_by_scheme.items() if classes.get(sid) in ("Equity", "Index/ETF")}
    debt = {sid: p for sid, p in real_pct_by_scheme.items() if classes.get(sid) in ("Debt-short", "Debt-long")}
    scenario.quick_equity_pct = _aum_weighted(equity, weights)
    scenario.quick_debt_pct = _aum_weighted(debt, weights)
    scenario.quick_weight_quarter = quarter
```

- [ ] **Step 5: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_scenario_engine.py -v -k compute_scenario_results`
Expected: PASS (4 tests)

- [ ] **Step 6: Write the failing tests — Step 3 serving, including the 5 Review Focus cases**

```python
# append to backend/tests/services/analytics/test_scenario_engine.py
from app.services.analytics.scenario_engine import (
    get_scenario_result_for_household,
    get_scenario_summary,
)
from app.models.user import HouseholdMember


def _household_member(db, name="Test Member"):
    m = HouseholdMember(id=uuid.uuid4(), user_id=uuid.uuid4(), name=name, relationship="self")
    db.add(m)
    db.commit()
    return m


def test_get_scenario_summary_has_phases_true_for_group_row():
    db = _session()
    group = Scenario(id=uuid.uuid4(), name="US-Iran war (2026)", description="d", start_date=date(2026, 2, 28), end_date=None, scenario_type="CRASH", is_ongoing=True)
    db.add(group)
    db.commit()
    phase = Scenario(id=uuid.uuid4(), parent_scenario_id=group.id, name="Shock", description="d", start_date=date(2026, 2, 28), end_date=date(2026, 4, 2), scenario_type="CRASH", phase_label="Shock", phase_order=1)
    db.add(phase)
    db.commit()

    summary = get_scenario_summary(db, group)
    assert summary.has_phases is True


def _holdings(*rows):
    """compute_holdings stand-in (card 5): `by fund` is built from the household's
    holdings, so a test must give the member holdings in the schemes under test."""
    from types import SimpleNamespace
    return AsyncMock(return_value=[
        SimpleNamespace(scheme_id=str(scheme.id), household_member_id=str(member.id), scheme_name=scheme.name, current_value=value)
        for scheme, member, value in rows
    ])


def test_multi_phase_by_fund_uses_current_phase_only():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="M1", name="Fund", amc_name="AMC", sebi_category="Equity")
    db.add(scheme)
    db.commit()
    group = Scenario(id=uuid.uuid4(), name="US-Iran war (2026)", description="d", start_date=date(2026, 2, 28), end_date=None, scenario_type="CRASH", is_ongoing=True)
    db.add(group)
    db.commit()
    phase1 = Scenario(id=uuid.uuid4(), parent_scenario_id=group.id, name="Shock", description="d", start_date=date(2026, 2, 28), end_date=date(2026, 4, 2), scenario_type="CRASH", phase_label="Shock", phase_order=1)
    phase2 = Scenario(id=uuid.uuid4(), parent_scenario_id=group.id, name="Relapse", description="d", start_date=date(2026, 7, 8), end_date=None, scenario_type="CRASH", is_ongoing=True, phase_label="Relapse", phase_order=2)
    db.add_all([phase1, phase2])
    db.commit()
    db.add(ScenarioSchemeResult(scenario_id=phase1.id, scheme_id=scheme.id, pct_change=Decimal("-10.00"), is_proxied=False))
    db.add(ScenarioSchemeResult(scenario_id=phase2.id, scheme_id=scheme.id, pct_change=Decimal("-3.00"), is_proxied=False))
    db.commit()

    db.add(ScenarioSchemeResult(scenario_id=group.id, scheme_id=scheme.id, pct_change=Decimal("-12.00"), is_proxied=False))
    db.commit()

    member = _household_member(db)
    with patch("app.services.analytics.scenario_engine.compute_holdings", new=_holdings((scheme, member, "1000.00"))):
        result = get_scenario_result_for_household(db, group, [member.id])
    current_phase_fund = next(f for f in result.by_fund if f.scheme_id == str(scheme.id))
    assert current_phase_fund.pct == "-3.00"  # the latest (current/ongoing) phase, not phase1+phase2
    assert result.portfolio_impact_pct == "-12.00"  # the hero is the group's whole window (fix 6)


def test_franklin_frozen_scheme_shows_frozen_not_pct_alongside_other_debt_funds():
    db = _session()
    # The real AMFI base name carries a suffix; the held row is a Direct Growth plan (card 7).
    frozen = Scheme(
        id=uuid.uuid4(), amfi_code="F1", amc_name="Franklin Templeton Mutual Fund", sebi_category="Debt Scheme - Low Duration Fund",
        base_name="Franklin India Low Duration Fund (No. of Segregated Portfolios-2)",
        name="Franklin India Low Duration Fund (No. of Segregated Portfolios-2) - Direct Plan - Growth",
    )
    other_debt = Scheme(id=uuid.uuid4(), amfi_code="D1", name="Some Other Debt Fund", amc_name="Other AMC", sebi_category="Debt Scheme - Low Duration Fund")
    live_franklin = Scheme(id=uuid.uuid4(), amfi_code="F2", name="Franklin India Short Term Fund - Direct Plan - Growth",
                           base_name="Franklin India Short Term Fund", amc_name="Franklin Templeton Mutual Fund", sebi_category="Debt Scheme - Short Duration Fund")
    db.add_all([frozen, other_debt, live_franklin])
    db.commit()
    scenario = Scenario(
        id=uuid.uuid4(), name="Franklin Templeton wind-up (2020)", description="d",
        start_date=date(2020, 4, 1), end_date=date(2020, 6, 30), scenario_type="CRASH",
        had_redemption_freeze_schemes=["Franklin India Low Duration Fund"],
    )
    db.add(scenario)
    db.commit()
    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=frozen.id, pct_change=Decimal("-5.00"), is_proxied=False))
    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=other_debt.id, pct_change=Decimal("-4.00"), is_proxied=False))
    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=live_franklin.id, pct_change=Decimal("1.00"), is_proxied=False))
    db.commit()

    member = _household_member(db)
    with patch("app.services.analytics.scenario_engine.compute_holdings",
               new=_holdings((frozen, member, "5000.00"), (other_debt, member, "1000.00"), (live_franklin, member, "1000.00"))):
        result = get_scenario_result_for_household(db, scenario, [member.id])
    frozen_row = next(f for f in result.by_fund if f.scheme_id == str(frozen.id))
    other_row = next(f for f in result.by_fund if f.scheme_id == str(other_debt.id))
    assert frozen_row.is_frozen is True
    assert frozen_row.pct is None  # never a misleading % for a frozen scheme
    assert other_row.is_frozen is False
    assert other_row.pct == "-4.00"
    assert next(f for f in result.by_fund if f.scheme_id == str(live_franklin.id)).is_frozen is False
    # The frozen ₹5,000 is left out: (-40 + 10) / 2,000 = -1.50%
    assert result.portfolio_impact_pct == "-1.50"


@pytest.mark.parametrize("names", [
    "Franklin India Short-Term Income Plan (no. of segregated portfolios- 3)",
    "Franklin India Ultra Short Bond Fund (no. of segregated portfolio-1)",
    "Franklin India Dynamic Accrual Fund (No. of segregated portfolios- 3)",
    "Franklin India Income Opportunities Fund (no. of segregated portfolios- 2)",
    "Franklin India Credit Risk Fund (No. of segregated portfolios-3)",
    "Franklin India Low Duration Fund (No. of Segregated Portfolios-2)",
])
def test_every_real_franklin_base_name_matches_its_seeded_name(names):
    from app.services.analytics.scenario_engine import _freeze_key
    seeded = {_freeze_key(n) for n in [
        "Franklin India Low Duration Fund", "Franklin India Ultra Short Bond Fund",
        "Franklin India Short Term Income Plan", "Franklin India Credit Risk Fund",
        "Franklin India Dynamic Accrual Fund", "Franklin India Income Opportunities Fund",
    ]}
    assert _freeze_key(names) in seeded


def test_household_pct_is_weighted_by_its_own_holdings():
    """Fix 6: two households see different headline %s for the same scenario."""
    db = _session()
    equity = Scheme(id=uuid.uuid4(), amfi_code="E1", name="Equity Fund", amc_name="A", sebi_category="Equity Scheme - Flexi Cap Fund")
    liquid = Scheme(id=uuid.uuid4(), amfi_code="L1", name="Liquid Fund", amc_name="B", sebi_category="Debt Scheme - Liquid Fund")
    nodata = Scheme(id=uuid.uuid4(), amfi_code="X1", name="New Fund", amc_name="C", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add_all([equity, liquid, nodata])
    scenario = Scenario(id=uuid.uuid4(), name="COVID crash", description="d", start_date=date(2020, 1, 20), end_date=date(2020, 3, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()
    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=equity.id, pct_change=Decimal("-38.00"), is_proxied=False))
    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=liquid.id, pct_change=Decimal("1.00"), is_proxied=False))
    db.add(ScenarioSchemeResult(scenario_id=scenario.id, scheme_id=nodata.id, pct_change=None, is_proxied=True, proxy_basis="no_comparable_data"))
    db.commit()
    member = _household_member(db)

    with patch("app.services.analytics.scenario_engine.compute_holdings",
               new=_holdings((equity, member, "800000.00"), (liquid, member, "200000.00"), (nodata, member, "50000.00"))):
        heavy = get_scenario_result_for_household(db, scenario, [member.id])
    with patch("app.services.analytics.scenario_engine.compute_holdings",
               new=_holdings((equity, member, "100000.00"), (liquid, member, "900000.00"))):
        light = get_scenario_result_for_household(db, scenario, [member.id])

    assert heavy.portfolio_impact_pct == "-30.20"   # (-3,04,000 + 2,000) / 10,00,000; no-data fund left out
    assert (heavy.covered_value, heavy.total_value, heavy.no_data_funds) == ("1000000.00", "1050000.00", 1)
    assert light.portfolio_impact_pct == "-2.90"


def test_hypothetical_with_assumptions_not_set_returns_flag_and_no_numbers():
    db = _session()
    scenario = Scenario(id=uuid.uuid4(), name="Unseeded hypothetical", description="d", scenario_type="HYPOTHETICAL")
    db.add(scenario)
    db.commit()
    member = _household_member(db)

    result = get_scenario_result_for_household(db, scenario, [member.id])
    assert result.assumptions_not_set is True
    assert result.portfolio_impact_pct is None
    assert result.hypothetical_assumptions == []


def test_hypothetical_with_assumptions_computes_pure_arithmetic_no_nav_lookup():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="H1", name="Equity Fund", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    scenario = Scenario(id=uuid.uuid4(), name="AI/tech valuation bust", description="d", scenario_type="HYPOTHETICAL")
    db.add(scenario)
    db.commit()
    db.add(ScenarioHypotheticalAssumption(scenario_id=scenario.id, asset_class="Equity", assumed_pct_change=Decimal("-22.00"), assumption_note="note"))
    db.commit()

    member = _household_member(db)
    with patch(
        "app.services.analytics.scenario_engine.compute_holdings",
        new=AsyncMock(return_value=[_holding_row(member.id, scheme.id, "Equity Fund", "100000")]),
    ):
        result = asyncio.run(_async_get_scenario_result_for_household(db, scenario, [member.id]))

    assert result.assumptions_not_set is False
    assert result.rupee_impact == "-22000.00"


def test_member_with_no_holdings_in_scenario_universe_still_appears_in_by_member():
    db = _session()
    scenario = Scenario(id=uuid.uuid4(), name="Test Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()
    member = _household_member(db, name="No Holdings Member")

    with patch("app.services.analytics.scenario_engine.compute_holdings", new=AsyncMock(return_value=[])):
        result = asyncio.run(_async_get_scenario_result_for_household(db, scenario, [member.id]))

    member_row = next((m for m in result.by_member if m.household_member_id == str(member.id)), None)
    assert member_row is not None
    assert member_row.rupee_impact == "0.00"
```

(`_holding_row` is a small local test fixture building a `HoldingRow` with the given
`household_member_id`/`scheme_id`/`scheme_name`/`current_value` and sensible defaults for
every other required field — add it near the top of this test file, mirroring
`test_scorer.py`'s existing fixture-helper style. `_async_get_scenario_result_for_household`
is the real async entry point — see Step 7's note on why `get_scenario_result_for_household`
is a sync wrapper around an async core.)

- [ ] **Step 7: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_scenario_engine.py -v -k "scenario_summary or multi_phase or franklin or hypothetical_with or member_with"`
Expected: FAIL — `ImportError`

- [ ] **Step 8: Implement Step 3 (serving)**

Append to `scenario_engine.py`:

```python
def get_scenario_summary(db: Session, scenario: Scenario) -> ScenarioSummaryRow:
    has_phases = db.query(Scenario).filter_by(parent_scenario_id=scenario.id).first() is not None
    return ScenarioSummaryRow(
        scenario_id=str(scenario.id), name=scenario.name, scenario_type=scenario.scenario_type,
        start_date=scenario.start_date.isoformat() if scenario.start_date else None,
        end_date=scenario.end_date.isoformat() if scenario.end_date else None,
        is_ongoing=scenario.is_ongoing, display_rank=scenario.display_rank,
        parent_scenario_id=str(scenario.parent_scenario_id) if scenario.parent_scenario_id else None,
        has_phases=has_phases, had_redemption_freeze_schemes=scenario.had_redemption_freeze_schemes,
        quick_market_pct=_pct_str(scenario.quick_market_pct), quick_equity_pct=_pct_str(scenario.quick_equity_pct),
        quick_debt_pct=_pct_str(scenario.quick_debt_pct),
        quick_weight_quarter=scenario.quick_weight_quarter.isoformat() if scenario.quick_weight_quarter else None,
    )


def _current_phase(db: Session, group: Scenario) -> Scenario:
    phases = db.query(Scenario).filter_by(parent_scenario_id=group.id).order_by(Scenario.phase_order.desc()).all()
    return phases[0] if phases else group


def _pct_str(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None


_SEGREGATED_SUFFIX = re.compile(r"\s*\(no\.?\s*of\s+segregated\s+portfolios?\s*-\s*\d+\)\s*$", re.IGNORECASE)


def _freeze_key(name: str) -> str:
    # AMFI's base names for the 6 wound-up Franklin schemes carry a suffix with varying case
    # and spacing ("Franklin India Short-Term Income Plan (no. of segregated portfolios- 3)"),
    # while live funds have close names ("Franklin India Short Term Fund"), so the match is
    # exact on cleaned text, never "contains" (card 7).
    text = _SEGREGATED_SUFFIX.sub("", name).lower().replace("-", " ")
    return " ".join(text.split())


def _is_frozen(scheme: Scheme, frozen_keys: set[str]) -> bool:
    if not frozen_keys or "franklin" not in (scheme.amc_name or "").lower():
        return False
    base = scheme.base_name or scheme.name.split(" - ")[0]
    return _freeze_key(base) in frozen_keys


async def _async_get_scenario_result_for_household(
    db: Session, scenario: Scenario, household_member_ids: list[uuid.UUID]
) -> ScenarioResultRow:
    summary = get_scenario_summary(db, scenario)
    members = {m.id: m for m in list_household_members(db, household_member_ids[0]) if household_member_ids}
    # list_household_members takes a user_id, not member_ids directly -- real
    # call sites pass the owning user's id; see Task 7's API wiring for how
    # this resolves in practice. Fetch each member by id directly here instead,
    # since this function only needs name lookups for the given id set:
    from app.models.user import HouseholdMember
    members = {m.id: m for m in db.query(HouseholdMember).filter(HouseholdMember.id.in_(household_member_ids)).all()}

    frozen_keys = {_freeze_key(name) for name in (scenario.had_redemption_freeze_schemes or [])}

    if scenario.scenario_type == "HYPOTHETICAL":
        assumptions = db.query(ScenarioHypotheticalAssumption).filter_by(scenario_id=scenario.id).all()
        if not assumptions:
            return ScenarioResultRow(
                scenario=summary, portfolio_impact_pct=None, rupee_impact="0.00",
                covered_value="0.00", total_value="0.00", no_data_funds=0, benchmarks=[],
                phases=[], by_fund=[], by_member=[], hypothetical_assumptions=[], assumptions_not_set=True,
            )
        assumption_by_class = {a.asset_class: a for a in assumptions}
        holdings = await compute_holdings(db, household_member_ids)
        by_member: dict[uuid.UUID, Decimal] = {mid: Decimal("0") for mid in household_member_ids}
        by_member_covered: dict[uuid.UUID, Decimal] = {mid: Decimal("0") for mid in household_member_ids}
        total_impact = covered_value = total_value = Decimal("0")
        no_data_funds = 0
        for holding in holdings:
            if holding.current_value is not None:
                total_value += Decimal(holding.current_value)
            if holding.current_value is None:
                continue
            scheme = db.get(Scheme, uuid.UUID(holding.scheme_id))
            bucket = underlying_asset_class(scheme.sebi_category or "", scheme.name) if scheme else "Other"
            assumption = assumption_by_class.get(bucket)
            if assumption is None:
                no_data_funds += 1
                continue
            impact = Decimal(holding.current_value) * assumption.assumed_pct_change / 100
            member_id = uuid.UUID(holding.household_member_id)
            by_member[member_id] = by_member.get(member_id, Decimal("0")) + impact
            by_member_covered[member_id] = by_member_covered.get(member_id, Decimal("0")) + Decimal(holding.current_value)
            total_impact += impact
            covered_value += Decimal(holding.current_value)

        return ScenarioResultRow(
            scenario=summary,
            portfolio_impact_pct=_pct_str((total_impact / covered_value * 100).quantize(Decimal("0.01"))) if covered_value else None,
            rupee_impact=str(total_impact.quantize(Decimal("0.01"))),
            covered_value=str(covered_value.quantize(Decimal("0.01"))), total_value=str(total_value.quantize(Decimal("0.01"))),
            no_data_funds=no_data_funds,
            benchmarks=[], phases=[], by_fund=[],
            by_member=[
                ScenarioMemberResult(
                    household_member_id=str(mid), member_name=members[mid].name if mid in members else "Unknown",
                    rupee_impact=str(impact.quantize(Decimal("0.01"))),
                    pct=_pct_str((impact / by_member_covered[mid] * 100).quantize(Decimal("0.01"))) if by_member_covered.get(mid) else None,
                    funds=[],
                )
                for mid, impact in by_member.items()
            ],
            hypothetical_assumptions=[
                ScenarioHypotheticalAssumptionRow(asset_class=a.asset_class, assumed_pct_change=str(a.assumed_pct_change), assumption_note=a.assumption_note)
                for a in assumptions
            ],
            assumptions_not_set=False,
        )

    serving_scenario = _current_phase(db, scenario) if summary.has_phases else scenario
    results = {
        r.scheme_id: r
        for r in db.query(ScenarioSchemeResult).filter_by(scenario_id=serving_scenario.id).all()
    }
    holdings = await compute_holdings(db, household_member_ids)
    held_schemes = {
        s.id: s for s in db.query(Scheme).filter(Scheme.id.in_([uuid.UUID(h.scheme_id) for h in holdings])).all()
    }
    frozen_ids = {sid for sid, s in held_schemes.items() if _is_frozen(s, frozen_keys)}

    by_fund_map: dict[str, ScenarioFundResult] = {}
    by_member_rupee: dict[uuid.UUID, Decimal] = {mid: Decimal("0") for mid in household_member_ids}
    by_member_covered: dict[uuid.UUID, Decimal] = {mid: Decimal("0") for mid in household_member_ids}
    by_member_funds: dict[uuid.UUID, list[ScenarioMemberFundResult]] = {mid: [] for mid in household_member_ids}
    total_rupee = Decimal("0")
    covered_value = Decimal("0")
    total_value = Decimal("0")
    no_data_funds = 0

    for holding in holdings:
        scheme_id = uuid.UUID(holding.scheme_id)
        member_id = uuid.UUID(holding.household_member_id)
        scheme_result = results.get(scheme_id)
        is_frozen = scheme_id in frozen_ids
        current_value = Decimal(holding.current_value) if holding.current_value else Decimal("0")
        total_value += current_value

        pct = None if is_frozen else (scheme_result.pct_change if scheme_result else None)
        rupee_impact = None
        if pct is not None:
            rupee_impact = (current_value * pct / 100).quantize(Decimal("0.01"))
            by_member_rupee[member_id] += rupee_impact
            by_member_covered[member_id] += current_value
            total_rupee += rupee_impact
            covered_value += current_value
        elif not is_frozen:
            no_data_funds += 1

        by_fund_map[holding.scheme_id] = ScenarioFundResult(
            scheme_id=holding.scheme_id, scheme_name=holding.scheme_name,
            pct=_pct_str(pct), is_proxied=scheme_result.is_proxied if scheme_result else False,
            proxy_basis=scheme_result.proxy_basis if scheme_result else None, is_frozen=is_frozen,
        )
        by_member_funds[member_id].append(
            ScenarioMemberFundResult(scheme_id=holding.scheme_id, scheme_name=holding.scheme_name, rupee_impact=_pct_str(rupee_impact))
        )

    def household_pct(pct_by_scheme: dict[uuid.UUID, Decimal | None]) -> str | None:
        # Fix 6: this household's own number -- rupee impact over the value it covers.
        # No-data and frozen holdings are left out of both sums, never counted as 0%.
        impact = covered = Decimal("0")
        for holding in holdings:
            sid = uuid.UUID(holding.scheme_id)
            pct = pct_by_scheme.get(sid)
            if pct is None or sid in frozen_ids or not holding.current_value:
                continue
            value = Decimal(holding.current_value)
            impact += value * pct / 100
            covered += value
        return _pct_str((impact / covered * 100).quantize(Decimal("0.01"))) if covered else None

    phases: list[ScenarioPhaseResult] = []
    if summary.has_phases:
        for phase in db.query(Scenario).filter_by(parent_scenario_id=scenario.id).order_by(Scenario.phase_order).all():
            phase_results = {r.scheme_id: r.pct_change for r in db.query(ScenarioSchemeResult).filter_by(scenario_id=phase.id).all()}
            phases.append(ScenarioPhaseResult(
                label=phase.phase_label, order=phase.phase_order,
                start_date=phase.start_date.isoformat(), end_date=phase.end_date.isoformat() if phase.end_date else None,
                is_ongoing=phase.is_ongoing, pct=household_pct(phase_results),
            ))
        # The hero is cumulative: the group row's own whole-window results, while
        # "by fund" above stays on the current phase (Review Focus #3).
        group_results = {r.scheme_id: r.pct_change for r in db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id).all()}
        portfolio_impact_pct = household_pct(group_results)
    else:
        portfolio_impact_pct = (
            _pct_str((total_rupee / covered_value * 100).quantize(Decimal("0.01"))) if covered_value else None
        )

    return ScenarioResultRow(
        scenario=summary, portfolio_impact_pct=portfolio_impact_pct, rupee_impact=str(total_rupee.quantize(Decimal("0.01"))),
        covered_value=str(covered_value.quantize(Decimal("0.01"))), total_value=str(total_value.quantize(Decimal("0.01"))),
        no_data_funds=no_data_funds,
        benchmarks=[],  # filled by Task 7's API layer, which has the benchmark query context
        phases=phases, by_fund=list(by_fund_map.values()),
        by_member=[
            ScenarioMemberResult(
                household_member_id=str(mid), member_name=members[mid].name if mid in members else "Unknown",
                rupee_impact=str(by_member_rupee[mid].quantize(Decimal("0.01"))),
                pct=_pct_str((by_member_rupee[mid] / by_member_covered[mid] * 100).quantize(Decimal("0.01"))) if by_member_covered[mid] else None,
                funds=by_member_funds[mid],
            )
            for mid in household_member_ids
        ],
        hypothetical_assumptions=[], assumptions_not_set=False,
    )


def get_scenario_result_for_household(
    db: Session, scenario: Scenario, household_member_ids: list[uuid.UUID]
) -> ScenarioResultRow:
    """Sync-callable wrapper -- `compute_holdings` is async (it awaits
    `warm_nav_history` internally for stale-NAV cases), but this function's
    own logic is otherwise synchronous DB reads; callers needing the async
    path directly (e.g. this module's own tests, and the FastAPI route in
    Task 7) should call `_async_get_scenario_result_for_household` instead."""
    import asyncio
    return asyncio.run(_async_get_scenario_result_for_household(db, scenario, household_member_ids))
```

- [ ] **Step 9: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_scenario_engine.py -v`
Expected: PASS (all tests in this file)

- [ ] **Step 10: Commit**

```bash
git add backend/app/services/analytics/scenario_engine.py backend/app/services/analytics/schemas.py backend/tests/services/analytics/test_scenario_engine.py
git commit -m "feat: add scenario proxy-mapping engine and household serving layer"
```

---

### Task 5b: `compute_all_scenarios.py` — compute every settled scenario once

**Why.** `compute_scenario_results` is the only thing that fills `scenario_scheme_results`, and
Task 8 calls it only for `is_ongoing` rows. Without this, 26 of the 29 historical rows open empty.

**Files:**
- Create: `backend/scripts/compute_all_scenarios.py`
- Test: `backend/tests/scripts/test_compute_all_scenarios.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/scripts/test_compute_all_scenarios.py
import uuid
from datetime import date
from unittest.mock import patch

from app.models.reference import Scenario
from scripts.compute_all_scenarios import main


def _scenario(db, name, scenario_type="CRASH", parent=None):
    s = Scenario(id=uuid.uuid4(), name=name, description="d", start_date=date(2020, 1, 20),
                 end_date=date(2020, 3, 31), scenario_type=scenario_type, parent_scenario_id=parent)
    db.add(s)
    db.commit()
    return s


def test_computes_every_non_hypothetical_row_including_phases_and_groups(db_session):
    group = _scenario(db_session, "Group")
    phase = _scenario(db_session, "Phase", parent=group.id)
    plain = _scenario(db_session, "Plain")
    _scenario(db_session, "Hypo", scenario_type="HYPOTHETICAL")
    with patch("scripts.compute_all_scenarios.compute_scenario_results") as compute:
        failures = main(db_session)
    assert failures == 0
    assert {c.args[1].name for c in compute.call_args_list} == {"Group", "Phase", "Plain"}


def test_one_failing_scenario_does_not_stop_the_rest(db_session):
    _scenario(db_session, "Bad")
    _scenario(db_session, "Good")
    def compute(db, scenario):
        if scenario.name == "Bad":
            raise RuntimeError("no NAVs")
    with patch("scripts.compute_all_scenarios.compute_scenario_results", side_effect=compute) as mocked:
        failures = main(db_session)
    assert failures == 1
    assert {c.args[1].name for c in mocked.call_args_list} == {"Bad", "Good"}
```

(`db_session`: use the SQLite session fixture/helper `tests/scripts/test_background_jobs.py` already
uses; mechanical deviation if it's named differently.) Rerun safety is covered by
`compute_scenario_results` deleting a scenario's rows before writing (Task 5's existing test).

- [ ] **Step 2: Run, confirm failure** (module not found)

- [ ] **Step 3: Implement**

```python
# backend/scripts/compute_all_scenarios.py
"""One-off: compute every non-hypothetical scenario (phases and groups included).

Run on staging after migrations, the NAV backfill (backfill_scheme_nav_history.py) and A12's
daily benchmark job; rerun after a seed correction or a later backfill. Safe to rerun:
compute_scenario_results deletes and rewrites one scenario's rows and commits them.
Settled windows never change, so nothing schedules this; Task 8 keeps ongoing rows fresh."""
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.reference import Scenario, ScenarioSchemeResult
from app.services.analytics.scenario_engine import compute_scenario_results

logger = logging.getLogger(__name__)


def main(db: Session) -> int:
    failures = 0
    scenarios = (
        db.query(Scenario).filter(Scenario.scenario_type != "HYPOTHETICAL")
        .order_by(Scenario.start_date, Scenario.name).all()
    )
    for scenario in scenarios:
        try:
            compute_scenario_results(db, scenario)
        except Exception:  # one bad window shouldn't stop the rest
            db.rollback()
            failures += 1
            logger.exception("compute_all_scenarios: %s failed", scenario.name)
            continue
        rows = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id).all()
        logger.info(
            "compute_all_scenarios: %s real=%d proxied=%d no_data=%d", scenario.name,
            sum(1 for r in rows if not r.is_proxied),
            sum(1 for r in rows if r.is_proxied and r.pct_change is not None),
            sum(1 for r in rows if r.pct_change is None),
        )
    logger.info("compute_all_scenarios: done, %d scenarios, %d failed", len(scenarios), failures)
    return failures


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as session:
        sys.exit(1 if main(session) else 0)
```

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/compute_all_scenarios.py backend/tests/scripts/test_compute_all_scenarios.py
git commit -m "feat: one-off script to compute every settled scenario"
```

---

### Task 6: Wire benchmark comparison into the standard result view

**Files:**
- Modify: `backend/app/services/analytics/scenario_engine.py`
- Test: append to `backend/tests/services/analytics/test_scenario_engine.py`

**Interfaces:**
- Consumes: `BenchmarkIndexHistory` (existing model, `index_name`/`date`/`value`).
- Produces: fills `ScenarioResultRow.benchmarks` for non-hypothetical, non-Franklin,
  non-multi-phase scenarios with whichever of the 4 `BenchmarkIndex` values has real
  coverage spanning the scenario's window.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/services/analytics/test_scenario_engine.py
from app.models.enums import BenchmarkIndex
from app.models.reference import BenchmarkIndexHistory


def test_standard_result_includes_benchmarks_with_real_coverage_only():
    db = _session()
    scenario = Scenario(id=uuid.uuid4(), name="Dot-com bust", description="d", start_date=date(2000, 3, 1), end_date=date(2002, 10, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2000, 2, 29), value=Decimal("1500")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2002, 10, 31), value=Decimal("1050")))
    # Nifty Midcap 150 didn't exist yet in 2000 -- no rows -- must be excluded, not shown as 0%.
    db.commit()

    member = _household_member(db)
    with patch("app.services.analytics.scenario_engine.compute_holdings", new=AsyncMock(return_value=[])):
        result = asyncio.run(_async_get_scenario_result_for_household(db, scenario, [member.id]))

    bench_names = [b.name for b in result.benchmarks]
    assert "nifty_50" in bench_names
    assert "nifty_midcap_150" not in bench_names
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_scenario_engine.py -v -k benchmarks_with_real_coverage`
Expected: FAIL — `assert [] ...` (benchmarks always empty today)

- [ ] **Step 3: Implement**

In `scenario_engine.py`, add:

```python
def _scenario_benchmark_comparisons(db: Session, scenario: Scenario) -> list[ScenarioBenchmarkResult]:
    from app.models.enums import BenchmarkIndex
    from app.models.enums import BenchmarkReturnType
    from app.models.reference import BenchmarkIndexHistory

    pre_start = scenario.start_date
    end = scenario.end_date or date.today()
    if pre_start is None:
        return []

    comparisons = []
    for index in BenchmarkIndex:
        start_row = (
            db.query(BenchmarkIndexHistory)
            .filter(BenchmarkIndexHistory.index_name == index, BenchmarkIndexHistory.return_type == BenchmarkReturnType.TRI, BenchmarkIndexHistory.date <= pre_start)
            .order_by(BenchmarkIndexHistory.date.desc())
            .first()
        )
        end_row = (
            db.query(BenchmarkIndexHistory)
            .filter(BenchmarkIndexHistory.index_name == index, BenchmarkIndexHistory.return_type == BenchmarkReturnType.TRI, BenchmarkIndexHistory.date <= end)
            .order_by(BenchmarkIndexHistory.date.desc())
            .first()
        )
        if start_row is None or end_row is None or start_row.value == 0:
            continue
        pct = ((end_row.value - start_row.value) / start_row.value * 100).quantize(Decimal("0.01"))
        comparisons.append(ScenarioBenchmarkResult(name=index.value, pct=str(pct)))
    return comparisons
```

Then replace `benchmarks=[],` in `_async_get_scenario_result_for_household`'s final
non-hypothetical `return` with:

```python
benchmarks=_scenario_benchmark_comparisons(db, scenario) if scenario.scenario_type != "HYPOTHETICAL" and not summary.had_redemption_freeze_schemes else [],
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_scenario_engine.py -v`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/scenario_engine.py backend/tests/services/analytics/test_scenario_engine.py
git commit -m "feat: add benchmark comparison to the standard scenario result view"
```

---

### Task 7: API — `app/api/scenarios.py`

**Files:**
- Create: `backend/app/api/scenarios.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/api/test_scenarios_api.py`

**Interfaces:**
- Consumes: `get_scenario_summary`, `_async_get_scenario_result_for_household` (Task 5/6),
  `list_household_members` (existing).
- Produces: `GET /scenarios?curated=true`, `GET /scenarios`, `GET
  /scenarios/{scenario_id}/results` — consumed by the frontend (Task 8/9).

- [ ] **Step 1: Write the failing API test**

```python
# backend/tests/api/test_scenarios_api.py
def test_curated_scenarios_returns_only_display_rank_rows(client, auth_headers, db_session):
    from datetime import date
    from app.models.reference import Scenario
    import uuid

    db_session.add(Scenario(id=uuid.uuid4(), name="Curated", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 1), scenario_type="CRASH", display_rank=1))
    db_session.add(Scenario(id=uuid.uuid4(), name="Not curated", description="d", start_date=date(2019, 1, 1), end_date=date(2019, 3, 1), scenario_type="CRASH", display_rank=None))
    db_session.commit()

    response = client.get("/scenarios?curated=true", headers=auth_headers)
    assert response.status_code == 200
    names = [s["name"] for s in response.json()]
    assert names == ["Curated"]


def test_scenario_results_returns_404_for_unknown_scenario(client, auth_headers):
    import uuid
    response = client.get(f"/scenarios/{uuid.uuid4()}/results", headers=auth_headers)
    assert response.status_code == 404
```

(`client`/`auth_headers`/`db_session` are existing fixtures — check `backend/tests/conftest.py`
for their exact names/signatures before writing this; reuse them verbatim, matching
`test_recompute_fund_ranking_section.py`/other `tests/api/` files' own fixture usage.)

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/api/test_scenarios_api.py -v`
Expected: FAIL — `404 Not Found` (router not registered) or `ModuleNotFoundError`

- [ ] **Step 3: Implement**

```python
# backend/app/api/scenarios.py
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import DbSession, get_active_user, get_db
from app.config import settings
from app.models.reference import Scenario
from app.models.user import User
from app.services.analytics.scenario_engine import (
    _async_get_scenario_result_for_household,
    get_scenario_summary,
)
from app.services.analytics.schemas import ScenarioResultRow, ScenarioSummaryRow
from app.services.dashboard.household_members import list_household_members

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.get("", response_model=list[ScenarioSummaryRow])
async def list_scenarios(
    curated: bool = False,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    query = db.query(Scenario).filter(Scenario.parent_scenario_id.is_(None))
    # Release gate (decisions.md 2026-10-08): hypothetical % values stay hidden until a
    # markets-literate review; flip SCENARIO_HYPOTHETICALS_ENABLED only after it.
    if not settings.scenario_hypotheticals_enabled:
        query = query.filter(Scenario.scenario_type != "HYPOTHETICAL")
    if curated:
        query = query.filter(Scenario.display_rank.isnot(None)).order_by(Scenario.display_rank)
    else:
        query = query.order_by(Scenario.name)
    return [get_scenario_summary(db, s) for s in query.all()]


@router.get("/{scenario_id}/results", response_model=ScenarioResultRow)
async def get_scenario_results(
    scenario_id: uuid.UUID,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    scenario = db.get(Scenario, scenario_id)
    hidden = scenario is not None and scenario.scenario_type == "HYPOTHETICAL" and not settings.scenario_hypotheticals_enabled
    if scenario is None or hidden:
        raise HTTPException(status_code=404, detail="Scenario not found.")
    members = list_household_members(db, user.id)
    return await _async_get_scenario_result_for_household(db, scenario, [m.id for m in members])
```

Add the flag to `backend/app/config.py`'s `Settings` (revised 9 Oct, card 12):

```python
    # Release gate for attribute 11's hypothetical scenarios: off until their 45 assumed
    # values get a markets-literate review (decisions.md 2026-10-08).
    scenario_hypotheticals_enabled: bool = False
```

And two tests in `test_scenarios_api.py`: with the flag off, `GET /scenarios` lists no
`HYPOTHETICAL` row and `GET /scenarios/{hypothetical_id}/results` is 404; with it on
(`monkeypatch.setattr(settings, "scenario_hypotheticals_enabled", True)`), both work.

Register in `backend/app/main.py`:

```python
from app.api import scenarios
...
app.include_router(scenarios.router)
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/api/test_scenarios_api.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/scenarios.py backend/app/main.py backend/tests/api/test_scenarios_api.py
git commit -m "feat: add scenarios API (list, curated filter, per-household results)"
```

---

### Task 8: Job wiring — recompute `is_ongoing` scenarios daily

**Files:**
- Modify: `backend/scripts/jobs/refresh_nav_daily.py`
- Test: `backend/tests/scripts/test_refresh_nav_daily_scenario_recompute.py`

**Interfaces:**
- Consumes: `compute_scenario_results` (Task 5).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/scripts/test_refresh_nav_daily_scenario_recompute.py
import sys
import uuid
from datetime import date
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import Scenario
from scripts.jobs.refresh_nav_daily import recompute_ongoing_scenarios


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_recompute_ongoing_scenarios_only_touches_is_ongoing_rows():
    db = _session()
    ongoing = Scenario(id=uuid.uuid4(), name="US-Iran war -- Relapse", description="d", start_date=date(2026, 7, 8), end_date=None, scenario_type="CRASH", is_ongoing=True)
    settled = Scenario(id=uuid.uuid4(), name="COVID crash", description="d", start_date=date(2020, 1, 20), end_date=date(2020, 3, 31), scenario_type="CRASH", is_ongoing=False)
    db.add_all([ongoing, settled])
    db.commit()

    with patch("scripts.jobs.refresh_nav_daily.compute_scenario_results") as mock_compute:
        recompute_ongoing_scenarios(db)

    called_ids = {call.args[1].id for call in mock_compute.call_args_list}
    assert called_ids == {ongoing.id}
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/scripts/test_refresh_nav_daily_scenario_recompute.py -v`
Expected: FAIL — `ImportError: cannot import name 'recompute_ongoing_scenarios'`

- [ ] **Step 3: Implement**

In `backend/scripts/jobs/refresh_nav_daily.py`, add the import `from
app.models.reference import Scenario` and `from
app.services.analytics.scenario_engine import compute_scenario_results`, then add:

```python
def recompute_ongoing_scenarios(db: Session) -> None:
    ongoing = db.query(Scenario).filter_by(is_ongoing=True).all()
    for scenario in ongoing:
        try:
            compute_scenario_results(db, scenario)
        except Exception:
            logger.exception("refresh_nav_daily: scenario recompute failed for %s", scenario.name)
            db.rollback()
    logger.info("refresh_nav_daily: recomputed %d is_ongoing scenarios", len(ongoing))
```

Call it at the end of `main_async`, after the existing `warm_nav_history(db, peers.values())`
line — the `is_ongoing` scenarios' schemes are a subset of the schemes this job already
warms NAV history for, so no extra `mfapi.in` calls are introduced:

```python
    recompute_ongoing_scenarios(db)
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/scripts/test_refresh_nav_daily_scenario_recompute.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/jobs/refresh_nav_daily.py backend/tests/scripts/test_refresh_nav_daily_scenario_recompute.py
git commit -m "feat: recompute is_ongoing scenarios in the existing daily NAV job"
```

---

### Task 9: Frontend — `resolveResultShape` + types

**Files:**
- Create: `frontend/src/features/scenarios/types.ts`
- Create: `frontend/src/features/scenarios/resolveResultShape.ts`
- Create: `frontend/src/features/scenarios/resolveResultShape.test.ts`

**Interfaces:**
- Produces: `ScenarioSummary`, `ScenarioResult` types, `resolveResultShape(scenario:
  ScenarioSummary) -> ScenarioResultShape` — consumed by Task 10/11.

- [ ] **Step 1: Add the types**

```ts
// frontend/src/features/scenarios/types.ts
export type ScenarioType = "CRASH" | "BULL_RUN" | "POLICY_RATE" | "HYPOTHETICAL";
export type ScenarioResultShape = "standard" | "multi_phase" | "redemption_freeze" | "hypothetical";

export interface ScenarioSummary {
  scenario_id: string;
  name: string;
  scenario_type: ScenarioType;
  start_date: string | null;
  end_date: string | null;
  is_ongoing: boolean;
  display_rank: number | null;
  parent_scenario_id: string | null;
  has_phases: boolean;
  had_redemption_freeze_schemes: string[] | null;
  quick_market_pct: string | null;      // Nifty 50 TRI over the window
  quick_equity_pct: string | null;      // AUM-weighted equity funds
  quick_debt_pct: string | null;        // AUM-weighted debt funds
  quick_weight_quarter: string | null;  // AUM quarter used as weights
}

export interface ScenarioPhase {
  label: string;
  order: number;
  start_date: string;
  end_date: string | null;
  is_ongoing: boolean;
  pct: string | null;
}

export interface ScenarioFund {
  scheme_id: string;
  scheme_name: string;
  pct: string | null;
  is_proxied: boolean;
  proxy_basis: string | null;
  is_frozen: boolean;
}

export interface ScenarioMemberFund {
  scheme_id: string;
  scheme_name: string;
  rupee_impact: string | null;
}

export interface ScenarioMember {
  household_member_id: string;
  member_name: string;
  rupee_impact: string;
  pct: string | null;
  funds: ScenarioMemberFund[];
}

export interface ScenarioBenchmark {
  name: string;
  pct: string;
}

export interface ScenarioHypotheticalAssumption {
  asset_class: string;
  assumed_pct_change: string;
  assumption_note: string;
}

export interface ScenarioResult {
  scenario: ScenarioSummary;
  portfolio_impact_pct: string | null;  // Σ rupee impact ÷ covered_value (fix 6)
  rupee_impact: string;
  covered_value: string;
  total_value: string;
  no_data_funds: number;
  benchmarks: ScenarioBenchmark[];
  phases: ScenarioPhase[];
  by_fund: ScenarioFund[];
  by_member: ScenarioMember[];
  hypothetical_assumptions: ScenarioHypotheticalAssumption[];
  assumptions_not_set: boolean;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// frontend/src/features/scenarios/resolveResultShape.test.ts
import { describe, expect, it } from "vitest";
import { resolveResultShape } from "./resolveResultShape";
import type { ScenarioSummary } from "./types";

const base: ScenarioSummary = {
  scenario_id: "s1", name: "Test", scenario_type: "CRASH", start_date: "2020-01-01", end_date: "2020-03-01",
  is_ongoing: false, display_rank: null, parent_scenario_id: null, has_phases: false,
  had_redemption_freeze_schemes: null, quick_market_pct: "-10.00", quick_equity_pct: null, quick_debt_pct: null, quick_weight_quarter: null,
};

describe("resolveResultShape", () => {
  it("returns hypothetical for HYPOTHETICAL scenario_type regardless of other flags", () => {
    expect(resolveResultShape({ ...base, scenario_type: "HYPOTHETICAL" })).toBe("hypothetical");
  });

  it("returns redemption_freeze when had_redemption_freeze_schemes is non-empty", () => {
    expect(resolveResultShape({ ...base, had_redemption_freeze_schemes: ["Franklin India Low Duration Fund"] })).toBe("redemption_freeze");
  });

  it("returns multi_phase for a group row with has_phases true", () => {
    expect(resolveResultShape({ ...base, has_phases: true })).toBe("multi_phase");
  });

  it("returns standard otherwise", () => {
    expect(resolveResultShape(base)).toBe("standard");
  });

  it("a crash scenario with phases and a redemption freeze flag resolves to redemption_freeze, not multi_phase (freeze checked first)", () => {
    expect(resolveResultShape({ ...base, has_phases: true, had_redemption_freeze_schemes: ["X"] })).toBe("redemption_freeze");
  });
});
```

- [ ] **Step 3: Run, confirm failure**

Run: `cd frontend && npx vitest run src/features/scenarios/resolveResultShape.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement**

```ts
// frontend/src/features/scenarios/resolveResultShape.ts
import type { ScenarioResultShape, ScenarioSummary } from "./types";

export function resolveResultShape(scenario: ScenarioSummary): ScenarioResultShape {
  if (scenario.scenario_type === "HYPOTHETICAL") return "hypothetical";
  if (scenario.had_redemption_freeze_schemes?.length) return "redemption_freeze";
  if (scenario.parent_scenario_id === null && scenario.has_phases) return "multi_phase";
  return "standard";
}
```

- [ ] **Step 5: Run, confirm pass**

Run: `cd frontend && npx vitest run src/features/scenarios/resolveResultShape.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/scenarios/types.ts frontend/src/features/scenarios/resolveResultShape.ts frontend/src/features/scenarios/resolveResultShape.test.ts
git commit -m "feat: add scenario result-shape dispatch and types"
```

---

### Task 10: Frontend — `ScenarioPicker.tsx`

**Files:**
- Create: `frontend/src/features/scenarios/ScenarioPicker.tsx`
- Create: `frontend/src/features/scenarios/ScenarioPicker.test.tsx`

**Interfaces:**
- Consumes: `GET /scenarios?curated=true`, `GET /scenarios` (Task 7), `ScenarioSummary`
  (Task 9).
- Produces: `ScenarioPicker` component, `onSelectScenario: (scenario_id: string) => void` prop.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/features/scenarios/ScenarioPicker.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScenarioPicker } from "./ScenarioPicker";
import type { ScenarioSummary } from "./types";

const curated: ScenarioSummary[] = [
  { scenario_id: "c1", name: "COVID crash", scenario_type: "CRASH", start_date: "2020-01-20", end_date: "2020-03-31", is_ongoing: false, display_rank: 1, parent_scenario_id: null, has_phases: false, had_redemption_freeze_schemes: null, quick_market_pct: "-38.00", quick_equity_pct: "-35.20", quick_debt_pct: "1.10", quick_weight_quarter: "2019-12-31" },
  { scenario_id: "c5", name: "Franklin Templeton wind-up (2020)", scenario_type: "CRASH", start_date: "2020-04-01", end_date: "2020-06-30", is_ongoing: false, display_rank: 5, parent_scenario_id: null, has_phases: false, had_redemption_freeze_schemes: ["Franklin India Low Duration Fund"], quick_market_pct: null, quick_equity_pct: null, quick_debt_pct: null, quick_weight_quarter: null },
  { scenario_id: "c7", name: "US-Iran war (2026)", scenario_type: "CRASH", start_date: "2026-02-28", end_date: null, is_ongoing: true, display_rank: 7, parent_scenario_id: null, has_phases: true, had_redemption_freeze_schemes: null, quick_market_pct: null, quick_equity_pct: null, quick_debt_pct: null, quick_weight_quarter: null },
  { scenario_id: "c8", name: "AI/tech valuation bust", scenario_type: "HYPOTHETICAL", start_date: null, end_date: null, is_ongoing: false, display_rank: 8, parent_scenario_id: null, has_phases: false, had_redemption_freeze_schemes: null, quick_market_pct: null, quick_equity_pct: null, quick_debt_pct: null, quick_weight_quarter: null },
];

const all: ScenarioSummary[] = [
  ...curated,
  { scenario_id: "m1", name: "Dot-com bust", scenario_type: "CRASH", start_date: "2000-03-01", end_date: "2002-10-31", is_ongoing: false, display_rank: null, parent_scenario_id: null, has_phases: false, had_redemption_freeze_schemes: null, quick_market_pct: "-45.00", quick_equity_pct: null, quick_debt_pct: null, quick_weight_quarter: null },
];

describe("ScenarioPicker", () => {
  it("shows the 8 curated cards with a quick-stat %, a Freeze badge, and a pulsing ongoing indicator", () => {
    render(<ScenarioPicker curated={curated} all={all} isLoading={false} onSelectScenario={vi.fn()} />);
    expect(screen.getByText("COVID crash")).toBeInTheDocument();
    expect(screen.getByText("Nifty 50 −38.00% · Equity funds −35.20% · Debt funds +1.10%")).toBeInTheDocument();
    expect(screen.getByText("Freeze")).toBeInTheDocument();
    expect(screen.getByText(/ongoing/i)).toBeInTheDocument();
  });

  it("expanding More scenarios reveals the non-curated rows", () => {
    render(<ScenarioPicker curated={curated} all={all} isLoading={false} onSelectScenario={vi.fn()} />);
    expect(screen.queryByText("Dot-com bust")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/more scenarios/i));
    expect(screen.getByText("Dot-com bust")).toBeInTheDocument();
  });

  it("calls onSelectScenario with the scenario id when a card is tapped", () => {
    const onSelect = vi.fn();
    render(<ScenarioPicker curated={curated} all={all} isLoading={false} onSelectScenario={onSelect} />);
    fireEvent.click(screen.getByText("COVID crash"));
    expect(onSelect).toHaveBeenCalledWith("c1");
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd frontend && npx vitest run src/features/scenarios/ScenarioPicker.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```tsx
// frontend/src/features/scenarios/ScenarioPicker.tsx
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ScenarioSummary } from "./types";

export interface ScenarioPickerProps {
  curated: ScenarioSummary[];
  all: ScenarioSummary[];
  isLoading: boolean;
  onSelectScenario: (scenario_id: string) => void;
  className?: string;
}

function ScenarioCard({ scenario, onSelectScenario }: { scenario: ScenarioSummary; onSelectScenario: (id: string) => void }) {
  const isHypothetical = scenario.scenario_type === "HYPOTHETICAL";
  const isFrozen = Boolean(scenario.had_redemption_freeze_schemes?.length);

  return (
    <button
      type="button"
      onClick={() => onSelectScenario(scenario.scenario_id)}
      className={cn(
        "rounded-xl border bg-[var(--color-surface)] p-4 text-left space-y-2 shadow-2xs",
        isHypothetical ? "border-dashed border-[var(--color-hypo)]" : "border-[var(--color-border)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-sm font-bold text-[var(--color-ink)]">{scenario.name}</span>
        {isFrozen ? (
          <Badge variant="outline">Freeze</Badge>
        ) : scenario.is_ongoing ? (
          <Badge variant="outline" className="animate-pulse">ongoing</Badge>
        ) : null}
      </div>
      {quickStatLine(scenario) && (
        // Card 10: the market's move and the fund moves, each labelled -- never one blended %.
        <p className="text-xs tabular-nums text-[var(--color-text-secondary)]" title={scenario.quick_weight_quarter ? `Fund moves weighted by fund size in the quarter ending ${scenario.quick_weight_quarter}` : undefined}>
          {quickStatLine(scenario)}
        </p>
      )}
    </button>
  );
}

function signed(pct: string): string {
  return pct.startsWith("-") ? `−${pct.slice(1)}%` : `+${pct}%`;
}

// Card 10: "Nifty 50 −38% · Equity funds −35% · Debt funds +1%"; a figure without data is
// left out, never replaced.
export function quickStatLine(s: ScenarioSummary): string | null {
  const parts = [
    s.quick_market_pct !== null ? `Nifty 50 ${signed(s.quick_market_pct)}` : null,
    s.quick_equity_pct !== null ? `Equity funds ${signed(s.quick_equity_pct)}` : null,
    s.quick_debt_pct !== null ? `Debt funds ${signed(s.quick_debt_pct)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function ScenarioPicker({ curated, all, isLoading, onSelectScenario, className }: ScenarioPickerProps) {
  const [showMore, setShowMore] = useState(false);

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  const curatedIds = new Set(curated.map((s) => s.scenario_id));
  const remaining = all.filter((s) => !curatedIds.has(s.scenario_id));

  return (
    <section className={cn("space-y-6", className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {curated.map((scenario) => (
          <ScenarioCard key={scenario.scenario_id} scenario={scenario} onSelectScenario={onSelectScenario} />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowMore((prev) => !prev)}
        className="text-sm font-semibold text-[var(--color-accent)]"
      >
        {showMore ? "Hide" : "More scenarios"}
      </button>

      {showMore && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {remaining.map((scenario) => (
            <ScenarioCard key={scenario.scenario_id} scenario={scenario} onSelectScenario={onSelectScenario} />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd frontend && npx vitest run src/features/scenarios/ScenarioPicker.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/scenarios/ScenarioPicker.tsx frontend/src/features/scenarios/ScenarioPicker.test.tsx
git commit -m "feat: add scenario picker with curated cards and More-scenarios expansion"
```

---

### Task 11: Frontend — the 4 result-view components

**Files:**
- Create: `frontend/src/features/scenarios/StandardResultView.tsx`
- Create: `frontend/src/features/scenarios/MultiPhaseResultView.tsx`
- Create: `frontend/src/features/scenarios/RedemptionFreezeResultView.tsx`
- Create: `frontend/src/features/scenarios/HypotheticalResultView.tsx`
- Create: `frontend/src/features/scenarios/StandardResultView.test.tsx`

**Interfaces:**
- Consumes: `ScenarioResult` (Task 9), `resolveResultShape` (Task 9).

- [ ] **Step 1: Write the failing test for `StandardResultView`**

```tsx
// frontend/src/features/scenarios/StandardResultView.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StandardResultView } from "./StandardResultView";
import type { ScenarioResult } from "./types";

const result: ScenarioResult = {
  scenario: { scenario_id: "c1", name: "COVID crash", scenario_type: "CRASH", start_date: "2020-01-20", end_date: "2020-03-31", is_ongoing: false, display_rank: 1, parent_scenario_id: null, has_phases: false, had_redemption_freeze_schemes: null, quick_market_pct: "-38.00", quick_equity_pct: null, quick_debt_pct: null, quick_weight_quarter: null },
  portfolio_impact_pct: "-32.50", rupee_impact: "-650000.00",
  covered_value: "2000000.00", total_value: "2100000.00", no_data_funds: 1,
  benchmarks: [{ name: "nifty_50", pct: "-38.00" }],
  phases: [],
  by_fund: [
    { scheme_id: "s1", scheme_name: "Real Fund", pct: "-30.00", is_proxied: false, proxy_basis: null, is_frozen: false },
    { scheme_id: "s2", scheme_name: "Proxied Fund", pct: "-20.00", is_proxied: true, proxy_basis: "sebi_category_average:Equity Scheme - Flexi Cap Fund", is_frozen: false },
    { scheme_id: "s3", scheme_name: "No Data Fund", pct: null, is_proxied: true, proxy_basis: "no_comparable_data", is_frozen: false },
  ],
  by_member: [{ household_member_id: "m1", member_name: "Ayush", rupee_impact: "-650000.00", pct: "-32.50", funds: [] }],
  hypothetical_assumptions: [], assumptions_not_set: false,
};

describe("StandardResultView", () => {
  it("shows the compliance banner, hero stats, benchmark comparison, and per-fund states", () => {
    render(<StandardResultView result={result} />);
    expect(screen.getByText(/not a prediction of future returns/i)).toBeInTheDocument();
    expect(screen.getByText("-32.50%")).toBeInTheDocument();
    expect(screen.getByText(/nifty_50/)).toBeInTheDocument();
    expect(screen.getByText("-30.00%")).toBeInTheDocument();
    expect(screen.getByText(/~-20.00%/)).toBeInTheDocument();
    expect(screen.getByText("Not enough historical data to estimate")).toBeInTheDocument();
    // Fix 6: the headline says what it covers.
    expect(screen.getByText("Based on ₹2000000.00 of your ₹2100000.00 · 1 fund has no data for this period")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd frontend && npx vitest run src/features/scenarios/StandardResultView.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `StandardResultView`**

```tsx
// frontend/src/features/scenarios/StandardResultView.tsx
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ScenarioResult } from "./types";

const COMPLIANCE_COPY =
  "Here's what this portfolio would have captured during this period, based on actual historical fund performance — not a prediction of future returns.";

function FundRow({ fund }: { fund: ScenarioResult["by_fund"][number] }) {
  if (fund.pct === null) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--color-ink)]">{fund.scheme_name}</span>
        <span className="text-[var(--color-text-secondary)]">Not enough historical data to estimate</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--color-ink)]">{fund.scheme_name}</span>
      <span
        className="tabular-nums font-semibold"
        title={fund.is_proxied ? `Shown using the ${fund.proxy_basis} average` : undefined}
      >
        {fund.is_proxied ? "~" : ""}{fund.pct}%
      </span>
    </div>
  );
}

export function StandardResultView({ result }: { result: ScenarioResult }) {
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  return (
    <section className="space-y-6">
      <p className="text-xs italic text-[var(--color-text-secondary)]">
        {COMPLIANCE_COPY}
        {result.scenario.is_ongoing && " Numbers will update as the event continues."}
      </p>

      <div className="flex gap-6">
        <div>
          <p className="text-xs text-[var(--color-text-secondary)]">Portfolio impact</p>
          <p className="text-2xl font-display font-bold tabular-nums">{result.portfolio_impact_pct}%</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-secondary)]">Rupee impact</p>
          <p className="text-2xl font-display font-bold tabular-nums">{result.rupee_impact}</p>
        </div>
      </div>
      {/* Fix 6: the % is this household's own, over the holdings that have data. */}
      <p className="text-xs text-[var(--color-text-secondary)]">
        Based on ₹{result.covered_value} of your ₹{result.total_value}
        {result.no_data_funds > 0 && ` · ${result.no_data_funds} ${result.no_data_funds === 1 ? "fund has" : "funds have"} no data for this period`}
      </p>

      {result.benchmarks.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[var(--color-text-secondary)]">Benchmark comparison</p>
          {result.benchmarks.map((b) => (
            <div key={b.name} className="flex items-center justify-between text-sm">
              <span>{b.name}</span>
              <span className="tabular-nums">{b.pct}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]">By fund</p>
        {result.by_fund.map((fund) => (
          <FundRow key={fund.scheme_id} fund={fund} />
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]">By family member</p>
        {result.by_member.map((member) => (
          <div key={member.household_member_id} className="rounded-lg border border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setExpandedMember((prev) => (prev === member.household_member_id ? null : member.household_member_id))}
              className={cn("w-full flex items-center justify-between p-3 text-sm")}
            >
              <span>{member.member_name}</span>
              <span className="tabular-nums font-semibold">
                {member.rupee_impact}{member.pct !== null && ` (${member.pct}%)`}
              </span>
            </button>
            {expandedMember === member.household_member_id && (
              <div className="px-3 pb-3 space-y-1">
                {member.funds.map((f) => (
                  <div key={f.scheme_id} className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
                    <span>{f.scheme_name}</span>
                    <span className="tabular-nums">{f.rupee_impact ?? "Not enough historical data to estimate"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd frontend && npx vitest run src/features/scenarios/StandardResultView.test.tsx`
Expected: PASS

- [ ] **Step 5: Implement `MultiPhaseResultView`, `RedemptionFreezeResultView`,
`HypotheticalResultView`**

```tsx
// frontend/src/features/scenarios/MultiPhaseResultView.tsx
import type { ScenarioResult } from "./types";

export function MultiPhaseResultView({ result }: { result: ScenarioResult }) {
  return (
    <section className="space-y-6">
      <p className="text-xs italic text-[var(--color-text-secondary)]">
        Here's what this portfolio would have captured during this period, based on actual
        historical fund performance — not a prediction of future returns. Numbers will update
        as the event continues.
      </p>

      <div>
        <p className="text-xs text-[var(--color-text-secondary)]">Cumulative portfolio impact</p>
        <p className="text-2xl font-display font-bold tabular-nums">{result.portfolio_impact_pct}%</p>
      </div>

      <div className="space-y-2">
        {result.phases.map((phase) => (
          <div
            key={phase.label}
            className={phase.is_ongoing ? "rounded-lg border-2 border-[var(--color-negative)] p-3 animate-pulse" : "rounded-lg border border-[var(--color-border)] p-3"}
          >
            <p className="text-sm font-semibold">{phase.label}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">{phase.start_date} – {phase.end_date ?? "ongoing"}</p>
            <p className="tabular-nums font-bold">{phase.pct !== null ? `${phase.pct}%` : "Not enough historical data to estimate"}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]">By fund (current phase)</p>
        {result.by_fund.map((fund) => (
          <div key={fund.scheme_id} className="flex items-center justify-between text-sm">
            <span>{fund.scheme_name}</span>
            <span className="tabular-nums">{fund.pct !== null ? `${fund.is_proxied ? "~" : ""}${fund.pct}%` : "Not enough historical data to estimate"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

```tsx
// frontend/src/features/scenarios/RedemptionFreezeResultView.tsx
import type { ScenarioResult } from "./types";

export function RedemptionFreezeResultView({ result }: { result: ScenarioResult }) {
  return (
    <section className="space-y-6">
      <div className="rounded-xl border-2 border-[var(--color-freeze)] p-4">
        <p className="text-sm font-bold text-[var(--color-ink)]">
          This wasn't a price fall — a ~20-month liquidity freeze
        </p>
      </div>

      <div className="flex gap-6">
        <div>
          <p className="text-xs text-[var(--color-text-secondary)]">Your frozen schemes</p>
          <p className="text-2xl font-display font-bold" style={{ color: "var(--color-freeze)" }}>Frozen, not %</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]">By fund</p>
        {result.by_fund.map((fund) => (
          <div key={fund.scheme_id} className="flex items-center justify-between text-sm">
            <span>{fund.scheme_name}</span>
            {fund.is_frozen ? (
              <span className="font-semibold" style={{ color: "var(--color-freeze)" }}>Redemptions frozen ~20mo</span>
            ) : (
              <span className="tabular-nums">
                {fund.pct !== null ? `${fund.pct}% (not frozen)` : "Not enough historical data to estimate"}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
```

```tsx
// frontend/src/features/scenarios/HypotheticalResultView.tsx
import type { ScenarioResult } from "./types";

export function HypotheticalResultView({ result }: { result: ScenarioResult }) {
  if (result.assumptions_not_set) {
    return (
      <section className="rounded-xl border-2 border-dashed border-[var(--color-hypo)] p-6">
        <p className="text-sm font-semibold text-[var(--color-ink)]">
          We haven't set an assumption for this scenario yet — check back soon.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border-2 border-solid border-[var(--color-hypo)] p-4">
        <p className="text-sm font-bold text-[var(--color-ink)]">
          This is a hypothetical scenario based on a stated assumption, not a historical
          replay. No market event has happened — these numbers are Unifolio's own judgment
          call about a possible future, not fact.
        </p>
      </div>

      <div>
        <p className="text-xs text-[var(--color-text-secondary)]">Rupee impact if assumption held</p>
        <p className="text-2xl font-display font-bold tabular-nums">{result.rupee_impact}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]">Per-asset-class assumption</p>
        {result.hypothetical_assumptions.map((a) => (
          <div key={a.asset_class} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>{a.asset_class}</span>
              <span className="tabular-nums font-semibold">{a.assumed_pct_change}%</span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">{a.assumption_note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run the full suite for this feature**

Run: `cd frontend && npx vitest run src/features/scenarios/`
Expected: PASS (all tests across all 4 views + picker + resolveResultShape)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/scenarios/MultiPhaseResultView.tsx frontend/src/features/scenarios/RedemptionFreezeResultView.tsx frontend/src/features/scenarios/HypotheticalResultView.tsx frontend/src/features/scenarios/StandardResultView.tsx frontend/src/features/scenarios/StandardResultView.test.tsx
git commit -m "feat: add the 4 scenario result-view components"
```

---

### Task 12: Frontend — data access, the Scenarios screen, both navs, two colour tokens

*(Revised 9 Oct, card 9: this repo has no React Query, no `@/lib/api-client` and no
`frontend/src/app/`. Data goes through `features/<x>/api.ts` on `lib/apiClient`'s `cachedFetch`,
desktop tabs live in `NavigationShell.tsx` + `MainDashboardFlow.tsx`, mobile tabs in
`mobile/shell/MobileBottomNav.tsx` + `mobile/MobileRoot.tsx`.)*

**Files:**
- Create: `frontend/src/features/scenarios/api.ts`
- Create: `frontend/src/features/scenarios/ScenariosScreen.tsx`
- Create: `frontend/src/features/scenarios/ScenariosScreen.test.tsx`
- Modify: `frontend/src/features/dashboard/NavigationShell.tsx` (tab), `frontend/src/features/dashboard/MainDashboardFlow.tsx` (`MainTab`, `KNOWN_TABS`, render)
- Modify: `frontend/src/mobile/shell/MobileBottomNav.tsx` (`MobileTab`, 4th button), `frontend/src/mobile/MobileRoot.tsx` (render)
- Modify: `frontend/src/styles/tokens.css` (`--color-hypo`, `--color-freeze`)

**Interfaces:**
- Consumes: `ScenarioPicker`, `resolveResultShape`, the 4 result views (Tasks 9–11); `GET /scenarios`, `GET /scenarios?curated=true`, `GET /scenarios/{id}/results` (Task 7).

- [ ] **Step 1: The API module** — copy `features/analytics/api.ts`'s `authFetch` shape:

```ts
// frontend/src/features/scenarios/api.ts
import { API_BASE_URL, ApiError, cachedFetch, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "../auth/session";
import type { ScenarioResult, ScenarioSummary } from "./types";

async function authFetch(path: string, signal?: AbortSignal): Promise<Response> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await cachedFetch(`${API_BASE_URL}${path}`, { headers, signal });
  if (!res.ok) throw new ApiError(res.status, await parseErrorDetail(res));
  return res;
}

export async function listScenarios(curated: boolean, signal?: AbortSignal): Promise<ScenarioSummary[]> {
  const res = await authFetch(curated ? "/scenarios?curated=true" : "/scenarios", signal);
  return res.json();
}

export async function getScenarioResult(scenarioId: string, signal?: AbortSignal): Promise<ScenarioResult> {
  const res = await authFetch(`/scenarios/${scenarioId}/results`, signal);
  return res.json();
}
```

- [ ] **Step 2: Write the failing screen test**

```tsx
// frontend/src/features/scenarios/ScenariosScreen.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScenariosScreen } from "./ScenariosScreen";
import * as api from "./api";

const covid = { scenario_id: "c1", name: "COVID crash", scenario_type: "CRASH" as const, start_date: "2020-01-20", end_date: "2020-03-31", is_ongoing: false, display_rank: 1, parent_scenario_id: null, has_phases: false, had_redemption_freeze_schemes: null, quick_market_pct: "-38.00", quick_equity_pct: null, quick_debt_pct: null, quick_weight_quarter: null };

describe("ScenariosScreen", () => {
  it("loads the picker, opens a result, and goes back", async () => {
    vi.spyOn(api, "listScenarios").mockResolvedValue([covid]);
    vi.spyOn(api, "getScenarioResult").mockResolvedValue({
      scenario: covid, portfolio_impact_pct: "-30.20", rupee_impact: "-302000.00",
      covered_value: "1000000.00", total_value: "1000000.00", no_data_funds: 0,
      benchmarks: [], phases: [], by_fund: [], by_member: [], hypothetical_assumptions: [], assumptions_not_set: false,
    });
    render(<ScenariosScreen />);
    fireEvent.click(await screen.findAllByText("COVID crash").then((els) => els[0]));
    expect(await screen.findByText("-30.20%")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Back to scenarios/));
    await waitFor(() => expect(screen.queryByText("-30.20%")).not.toBeInTheDocument());
  });

  it("shows an error card, not a blank screen, when the list fails", async () => {
    vi.spyOn(api, "listScenarios").mockRejectedValue(new Error("down"));
    render(<ScenariosScreen />);
    expect(await screen.findByText("Scenarios aren't available right now.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, confirm failure** — `cd frontend && npx vitest run src/features/scenarios/ScenariosScreen.test.tsx`

- [ ] **Step 4: Implement the screen**

```tsx
// frontend/src/features/scenarios/ScenariosScreen.tsx
import { useEffect, useState } from "react";
import { getScenarioResult, listScenarios } from "./api";
import { HypotheticalResultView } from "./HypotheticalResultView";
import { MultiPhaseResultView } from "./MultiPhaseResultView";
import { RedemptionFreezeResultView } from "./RedemptionFreezeResultView";
import { resolveResultShape } from "./resolveResultShape";
import { ScenarioPicker } from "./ScenarioPicker";
import { StandardResultView } from "./StandardResultView";
import type { ScenarioResult, ScenarioSummary } from "./types";

export function ScenariosScreen() {
  const [curated, setCurated] = useState<ScenarioSummary[]>([]);
  const [all, setAll] = useState<ScenarioSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listScenarios(true, controller.signal), listScenarios(false, controller.signal)])
      .then(([c, a]) => { setCurated(c); setAll(a); })
      .catch((err) => { if (!controller.signal.aborted) { console.error(err); setFailed(true); } })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedId) { setResult(null); return; }
    const controller = new AbortController();
    getScenarioResult(selectedId, controller.signal)
      .then(setResult)
      .catch((err) => { if (!controller.signal.aborted) { console.error(err); setFailed(true); } });
    return () => controller.abort();
  }, [selectedId]);

  if (failed) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-secondary)]">
        Scenarios aren't available right now.
      </div>
    );
  }

  if (selectedId && result) {
    const shape = resolveResultShape(result.scenario);
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setSelectedId(null)} className="text-sm text-[var(--color-accent)]">
          ← Back to scenarios
        </button>
        {shape === "standard" && <StandardResultView result={result} />}
        {shape === "multi_phase" && <MultiPhaseResultView result={result} />}
        {shape === "redemption_freeze" && <RedemptionFreezeResultView result={result} />}
        {shape === "hypothetical" && <HypotheticalResultView result={result} />}
      </div>
    );
  }

  return <ScenarioPicker curated={curated} all={all} isLoading={isLoading} onSelectScenario={setSelectedId} />;
}
```

- [ ] **Step 5: Run, confirm pass**

- [ ] **Step 6: Desktop tab** — in `MainDashboardFlow.tsx` add `"scenarios"` to `MainTab` and
  `KNOWN_TABS`, and render `<ScenariosScreen />` for it (a branch before the `ProfileView` fallback).
  In `NavigationShell.tsx` widen the `activeTab`/`onTabChange` union with `"scenarios"` and add a
  `Scenarios` tab button after `Analytics`, copying the Analytics button's markup and active styles.

- [ ] **Step 7: Mobile tab** — in `MobileBottomNav.tsx` add `"scenarios"` to `MobileTab` and a fourth
  button copying the Analytics button (icon: `lucide-react`'s `FlaskConical`; label "Scenarios"); in
  `MobileRoot.tsx` render `{activeTab === "scenarios" && <ScenariosScreen />}`. Update the existing
  `MobileBottomNav` test if it counts buttons.

- [ ] **Step 8: Colour tokens** — in `tokens.css`, add to the `:root` block, the dark `@media`
  `:root` block and the `[data-theme="dark"]` block (and `[data-theme="light"]` if that block repeats
  light values):

```css
  /* Attribute 11 only: hypothetical scenarios (violet) and the Franklin freeze (sky). */
  --color-hypo: #7C3AED;    /* dark blocks: #A78BFA */
  --color-freeze: #0284C7;  /* dark blocks: #38BDF8 */
```

They're used only by `features/scenarios/` (the spec scopes them there).

- [ ] **Step 9: Run** the scenarios tests, `MobileBottomNav`/`MainDashboardFlow`/`NavigationShell`
  tests if they exist (`ls frontend/src/**/__tests__` / `*.test.tsx` next to them), and `npx tsc -b`.

- [ ] **Step 10: Manual check** — dev server, both widths: the Scenarios tab appears on desktop and
  mobile; the 8 curated cards render (hypotheticals hidden while the backend flag is off); a crash,
  US-Iran, Franklin and (flag on) a hypothetical each open the right view.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/features/scenarios/api.ts frontend/src/features/scenarios/ScenariosScreen.tsx frontend/src/features/scenarios/ScenariosScreen.test.tsx frontend/src/features/dashboard/NavigationShell.tsx frontend/src/features/dashboard/MainDashboardFlow.tsx frontend/src/mobile/shell/MobileBottomNav.tsx frontend/src/mobile/MobileRoot.tsx frontend/src/styles/tokens.css
git commit -m "feat: add the Scenarios screen to desktop and mobile navigation"
```

---

## Self-Review

**1. Spec coverage:** 31-scenario library across 4 categories, curated-8 picker, "More
scenarios" expansion with category filters (Task 2, 10) ✓; proxy mapping cascade — real →
category average → asset-class average → honest "no data" (Task 5) ✓; multi-phase US-Iran
war model, current-phase-only "by fund" (Task 5, 6, 11) ✓; Franklin Templeton's scenario-
scoped redemption freeze, dual treatment (frozen schemes + other debt funds in the same
response) (Task 5, 11) ✓; hypothetical mechanism — pure arithmetic, mandatory
`assumption_note`, `assumptions_not_set` honest floor (Task 2, 5, 11) ✓; benchmark
comparison restricted to indices with real window coverage (Task 6) ✓; family-level rupee
breakdown, biggest-contributor-first framing (Task 5, 11) ✓; compliance framing exact copy,
including the ongoing-scenario variant (Task 11) ✓; Step 1's resumable, circuit-broken,
isolated-process backfill script (Task 3) ✓; `is_ongoing` scenario daily recompute piggybacked
on the existing NAV job, no new infra (Task 8) ✓.

**2. Placeholder scan:** No "TBD"/"add later"/"similar to Task N" patterns. Task 3 Step 5's
manual safety-sequencing runbook is explicitly called out as a non-automatable operational
step, not a deferred engineering task — consistent with the planning doc's own framing (local
spike → small batch → real backfill), not a plan gap.

**3. Type consistency:** `ScenarioSummaryRow`/`ScenarioResultRow`/`ScenarioFundResult`/etc.
(Pydantic, Task 5) match `ScenarioSummary`/`ScenarioResult`/`ScenarioFund`/etc. (TypeScript,
Task 9) field-for-field, both snake_case (revised 9 Oct: the API sends snake_case and the
frontend reads it as is, like attributes 09 and 14). `compute_scenario_results`/`get_scenario_summary`/
`get_scenario_result_for_household` signatures are used identically between Task 5's
definition, Task 6's extension, Task 7's API wiring, and Task 8's job wiring.
`underlying_asset_class`'s return values (`"Equity"`, `"Index/ETF"`, `"Gold"`, `"Silver"`,
`"Overseas FoF"`, `"Debt-short"`, `"Debt-long"`, `"Hybrid"`, `"Other"`) match exactly between
Task 4's implementation, Task 2's seeded `scenario_hypothetical_assumptions` rows, and the
DB's `CHECK` constraint in Task 1.

**4. Review Focus coverage:** #1 (scheme didn't exist yet) — Task 5 Step 2's
`test_compute_scenario_results_falls_back_to_category_average` and
`..._falls_back_to_asset_class_when_category_has_no_real_data`. #2 (Franklin frozen scheme +
other debt funds together) — Task 5 Step 6's
`test_franklin_frozen_scheme_shows_frozen_not_pct_alongside_other_debt_funds`. #3 (US-Iran
ongoing Phase 3, current-phase-only) — Task 5 Step 6's
`test_multi_phase_by_fund_uses_current_phase_only`. #4 (hypothetical with zero assumption
rows) — Task 5 Step 6's `test_hypothetical_with_assumptions_not_set_returns_flag_and_no_numbers`.
#5 (member with zero holdings in the scenario universe) — Task 5 Step 6's
`test_member_with_no_holdings_in_scenario_universe_still_appears_in_by_member`.
