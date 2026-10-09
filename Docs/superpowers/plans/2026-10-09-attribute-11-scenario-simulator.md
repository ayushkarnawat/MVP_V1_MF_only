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

## File Structure

**Backend — create:**
- `backend/alembic/versions/<NNNN>_scenarios_and_scenario_results.py`
- `backend/alembic/versions/<NNNN+1>_seed_scenario_library.py`
- `backend/scripts/jobs/backfill_scheme_nav_history.py`
- `backend/app/services/analytics/scenario_asset_class.py`
- `backend/app/services/analytics/scenario_engine.py`
- `backend/app/api/scenarios.py`
- `backend/tests/services/analytics/test_scenario_asset_class.py`
- `backend/tests/services/analytics/test_scenario_engine.py`
- `backend/tests/api/test_scenarios_api.py`

**Backend — modify:**
- `backend/app/models/reference.py` — add `Scenario`, `ScenarioSchemeResult`,
  `ScenarioCategoryAverage`, `ScenarioHypotheticalAssumption` models
- `backend/app/services/analytics/schemas.py` — add scenario response schemas
- `backend/app/main.py` — register the new `scenarios` router
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
- `frontend/src/app/navigation.tsx` (or the equivalent top-level nav config) — add the
  `Scenarios` route sibling to `Holdings`/`Analytics`/`Profile`

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
to the existing imports, alongside the already-imported `postgresql.JSONB`):

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
    had_redemption_freeze_schemes: Mapped[list[str] | None] = mapped_column(
        postgresql.ARRAY(String), nullable=True
    )

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
            "asset_class IN ('Equity', 'Index/ETF', 'Gold', 'Overseas FoF', "
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
        sa.Column("had_redemption_freeze_schemes", postgresql.ARRAY(sa.String()), nullable=True),
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
            "asset_class IN ('Equity', 'Index/ETF', 'Gold', 'Overseas FoF', "
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
from alembic import op
import sqlalchemy as sa

revision = "<NNNN+1>"
down_revision = "<NNNN>"
branch_labels = None
depends_on = None


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
            ("Overseas FoF", -10.0, "Global equity also falls, but a diversified overseas fund is less exposed than India to India-specific oil-import pain."),
            ("Other", -15.0, "Residual bucket, follows the broad domestic market moderately."),
        ],
        "US recession + Fed pivot": [
            ("Equity", -15.0, "A US recession dampens global growth/FII flows, but India's domestic-consumption story partially decouples."),
            ("Index/ETF", -15.0, "Same as Equity."),
            ("Debt-short", 1.0, "Barely moves, mild positive drift from rate-cut expectations."),
            ("Debt-long", 4.0, "A Fed pivot to rate cuts is a tailwind for duration/debt funds."),
            ("Hybrid", -7.4, "0.6 x Equity (-15.0) + 0.4 x Debt-long (+4.0), computed not eyeballed."),
            ("Gold", 6.0, "A Fed pivot to lower real rates is historically bullish for gold."),
            ("Overseas FoF", -18.0, "This shock originates IN the US market -- direct hit, not diluted spillover."),
            ("Other", -10.0, "Residual bucket, moderate drag."),
        ],
        "AI/tech valuation bust": [
            ("Equity", -22.0, "Assumes Indian equity falls ~55% as much as a 40% US tech crash, via IT-sector spillover."),
            ("Index/ETF", -22.0, "Same as Equity."),
            ("Debt-short", 0.0, "No real linkage -- this is an equity-specific valuation shock."),
            ("Debt-long", -2.0, "Minor mark-to-market drag from a broader risk-off move."),
            ("Hybrid", -14.0, "0.6 x Equity (-22.0) + 0.4 x Debt-long (-2.0), computed not eyeballed."),
            ("Gold", 5.0, "Modest safe-haven bid, smaller than a macro/oil shock."),
            ("Overseas FoF", -35.0, "This IS a US-tech-concentrated shock -- close to the full US-market hit."),
            ("Other", -18.0, "Residual bucket, follows the broader risk-off move."),
        ],
        "Rupee sharp depreciation": [
            ("Equity", -12.0, "Anchored to Taper Tantrum (2013): FII outflows and import-cost inflation hurt the broad market."),
            ("Index/ETF", -12.0, "Same as Equity."),
            ("Debt-short", -2.0, "Mild -- RBI defends the currency with some front-end rate action."),
            ("Debt-long", -6.0, "RBI likely hikes/holds hard to defend the currency, same mechanism as Taper Tantrum."),
            ("Hybrid", -9.6, "0.6 x Equity (-12.0) + 0.4 x Debt-long (-6.0), computed not eyeballed."),
            ("Gold", 10.0, "Gold is dollar-denominated, INR price rises mechanically when the rupee weakens."),
            ("Overseas FoF", 8.0, "Foreign-currency-denominated assets gain in INR terms purely from currency translation."),
            ("Other", -5.0, "Residual bucket, modest negative."),
        ],
        "Indian equity \"lost decade\"": [
            ("Equity", -8.0, "A prolonged sideways/low-return market, not a single trough. Known limitation: applied instantaneously like every other hypothetical, not amortized over years."),
            ("Index/ETF", -8.0, "Same as Equity."),
            ("Debt-short", 2.0, "Accrues normally, slightly muted versus long debt."),
            ("Debt-long", 3.0, "Positive -- debt keeps accruing normally regardless of equity stagnation."),
            ("Hybrid", -3.6, "0.6 x Equity (-8.0) + 0.4 x Debt-long (+3.0), computed not eyeballed."),
            ("Gold", 2.0, "Mixed historically, kept modest rather than assumed reliably positive."),
            ("Overseas FoF", 3.0, "Overseas diversification is the thing that helps in a domestic-equity-stagnation scenario."),
            ("Other", -5.0, "Residual bucket, least confident number in this row."),
        ],
    }
    for scenario_name, rows in assumptions.items():
        for asset_class, pct, note in rows:
            conn.execute(
                sa.text(
                    "INSERT INTO scenario_hypothetical_assumptions (scenario_id, asset_class, assumed_pct_change, assumption_note) "
                    "VALUES (:scenario_id, :asset_class, :pct, :note)"
                ),
                {"scenario_id": scenario_ids[scenario_name], "asset_class": asset_class, "pct": pct, "note": note},
            )


def downgrade() -> None:
    op.execute("DELETE FROM scenario_hypothetical_assumptions")
    op.execute("DELETE FROM scenarios")
```

- [ ] **Step 2: Run and verify row counts**

Run: `cd backend && alembic upgrade head`
Then: `cd backend && python -c "
from app.db.session import SessionLocal
from app.models.reference import Scenario, ScenarioHypotheticalAssumption
with SessionLocal() as db:
    assert db.query(Scenario).count() == 31, db.query(Scenario).count()
    assert db.query(Scenario).filter(Scenario.display_rank.isnot(None)).count() == 8
    assert db.query(ScenarioHypotheticalAssumption).count() == 40
    print('OK: 31 scenarios, 8 curated, 40 assumption rows')
"`
Expected: `OK: 31 scenarios, 8 curated, 40 assumption rows`

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
- Produces: `hypothetical_asset_class_bucket(sebi_category: str) -> str` — consumed by
  Task 5's hypothetical computation path.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/services/analytics/test_scenario_asset_class.py
from app.services.analytics.scenario_asset_class import hypothetical_asset_class_bucket


def test_index_fund_is_index_etf_not_other():
    assert hypothetical_asset_class_bucket("Other Scheme - Index Funds") == "Index/ETF"


def test_overseas_fof_is_its_own_bucket():
    assert hypothetical_asset_class_bucket("Other Scheme - FoF Overseas") == "Overseas FoF"


def test_domestic_fof_falls_to_other():
    assert hypothetical_asset_class_bucket("Other Scheme - FoF Domestic") == "Other"


def test_gold_fund_is_gold():
    assert hypothetical_asset_class_bucket("Other Scheme - Gold ETF") == "Gold"


def test_equity_scheme_is_equity():
    assert hypothetical_asset_class_bucket("Equity Scheme - Flexi Cap Fund") == "Equity"


def test_retirement_fund_is_hybrid():
    assert hypothetical_asset_class_bucket("Solution Oriented Scheme - Retirement Fund") == "Hybrid"


def test_liquid_fund_is_debt_short():
    assert hypothetical_asset_class_bucket("Debt Scheme - Liquid Fund") == "Debt-short"


def test_credit_risk_fund_is_debt_long():
    assert hypothetical_asset_class_bucket("Debt Scheme - Credit Risk Fund") == "Debt-long"


def test_unclassified_falls_to_other():
    assert hypothetical_asset_class_bucket("Some Unclassified Category") == "Other"
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
finer (8 buckets, not 4) because a hypothetical scenario's assumed % move
genuinely differs by sub-bucket -- e.g. an overseas FoF gains in INR terms
during a rupee-depreciation scenario while a domestic equity index falls,
which a single "Equity" bucket would get backwards."""


def hypothetical_asset_class_bucket(sebi_category: str) -> str:
    category = sebi_category.lower()
    # Order matters: index/etf/gold/overseas-fof are checked before
    # equity/debt because some AMFI category strings could otherwise
    # false-positive match a broader substring (e.g. a future category
    # string containing both "index" and "equity").
    if "index" in category or "etf" in category:
        return "Index/ETF"
    if "gold" in category:
        return "Gold"
    if "fof" in category and "overseas" in category:
        return "Overseas FoF"
    if "equity" in category:
        return "Equity"
    if "hybrid" in category or "retirement" in category or "children" in category:
        return "Hybrid"
    if "debt" in category or "income" in category:
        if any(s in category for s in ("liquid", "overnight", "money market", "ultra short")):
            return "Debt-short"
        return "Debt-long"
    return "Other"
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_scenario_asset_class.py -v`
Expected: PASS (9 tests)

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
  `hypothetical_asset_class_bucket` (Task 4); `compute_holdings` (`app/services/dashboard/
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
    quick_stat_pct: str | None


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
    portfolio_impact_pct: str | None
    rupee_impact: str
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

from app.services.analytics.scenario_engine import compute_scenario_results


def test_compute_scenario_results_real_data_scheme_gets_is_proxied_false():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="R1", name="Old Fund", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    scenario = Scenario(id=uuid.uuid4(), name="Test Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()

    navs = {scheme.id: {date(2019, 12, 31): Decimal("100"), date(2020, 3, 31): Decimal("62")}}
    with patch("app.services.analytics.scenario_engine._bulk_nav_for_scenario", return_value=navs):
        compute_scenario_results(db, scenario)

    result = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id, scheme_id=scheme.id).one()
    assert result.is_proxied is False
    assert result.pct_change == Decimal("-38.00")


def test_compute_scenario_results_falls_back_to_category_average():
    db = _session()
    old_scheme = Scheme(id=uuid.uuid4(), amfi_code="O1", name="Old Fund", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    new_scheme = Scheme(id=uuid.uuid4(), amfi_code="N1", name="New Fund", amc_name="AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add_all([old_scheme, new_scheme])
    db.commit()
    scenario = Scenario(id=uuid.uuid4(), name="Test Crash", description="d", start_date=date(2020, 1, 1), end_date=date(2020, 3, 31), scenario_type="CRASH")
    db.add(scenario)
    db.commit()

    navs = {old_scheme.id: {date(2019, 12, 31): Decimal("100"), date(2020, 3, 31): Decimal("80")}}
    with patch("app.services.analytics.scenario_engine._bulk_nav_for_scenario", return_value=navs):
        compute_scenario_results(db, scenario)

    new_result = db.query(ScenarioSchemeResult).filter_by(scenario_id=scenario.id, scheme_id=new_scheme.id).one()
    assert new_result.is_proxied is True
    assert new_result.proxy_basis == "sebi_category_average:Equity Scheme - Flexi Cap Fund"
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
from app.services.analytics.scenario_asset_class import hypothetical_asset_class_bucket
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
from app.services.dashboard.allocation_labels import asset_class_bucket
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
            category_totals.setdefault(scheme.sebi_category, []).append(real_pct_by_scheme[scheme.id])
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
            bucket = asset_class_bucket(scheme.sebi_category or "")
            asset_class_totals.setdefault(bucket, []).append(real_pct_by_scheme[scheme.id])
    asset_class_averages = {
        bucket: (sum(values) / len(values)).quantize(Decimal("0.01"))
        for bucket, values in asset_class_totals.items()
    }

    for scheme in all_schemes:
        if scheme.id in real_pct_by_scheme:
            continue
        category = scheme.sebi_category or ""
        if category in category_averages:
            db.add(ScenarioSchemeResult(
                scenario_id=scenario.id, scheme_id=scheme.id, pct_change=category_averages[category],
                is_proxied=True, proxy_basis=f"sebi_category_average:{category}",
            ))
            continue
        bucket = asset_class_bucket(category)
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

    db.commit()
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

    member = _household_member(db)
    result = get_scenario_result_for_household(db, group, [member.id])
    current_phase_fund = next(f for f in result.by_fund if f.scheme_id == str(scheme.id))
    assert current_phase_fund.pct == "-3.00"  # the latest (current/ongoing) phase, not phase1+phase2


def test_franklin_frozen_scheme_shows_frozen_not_pct_alongside_other_debt_funds():
    db = _session()
    frozen = Scheme(id=uuid.uuid4(), amfi_code="F1", name="Franklin India Low Duration Fund", amc_name="Franklin Templeton", sebi_category="Debt Scheme - Low Duration Fund")
    other_debt = Scheme(id=uuid.uuid4(), amfi_code="D1", name="Some Other Debt Fund", amc_name="Other AMC", sebi_category="Debt Scheme - Low Duration Fund")
    db.add_all([frozen, other_debt])
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
    db.commit()

    member = _household_member(db)
    result = get_scenario_result_for_household(db, scenario, [member.id])
    frozen_row = next(f for f in result.by_fund if f.scheme_id == str(frozen.id))
    other_row = next(f for f in result.by_fund if f.scheme_id == str(other_debt.id))
    assert frozen_row.is_frozen is True
    assert frozen_row.pct is None  # never a misleading % for a frozen scheme
    assert other_row.is_frozen is False
    assert other_row.pct == "-4.00"


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
    quick_stat_pct = None
    if scenario.scenario_type != "HYPOTHETICAL" and not scenario.had_redemption_freeze_schemes and not has_phases:
        # A quick-stat is the household-agnostic category-wide signal shown on the
        # picker card -- the AUM-weighted average across all real (non-proxied)
        # schemes, not any one household's number.
        row = (
            db.query(func.avg(ScenarioSchemeResult.pct_change))
            .filter_by(scenario_id=scenario.id, is_proxied=False)
            .scalar()
        )
        quick_stat_pct = str(row.quantize(Decimal("0.01"))) if row is not None else None

    return ScenarioSummaryRow(
        scenario_id=str(scenario.id), name=scenario.name, scenario_type=scenario.scenario_type,
        start_date=scenario.start_date.isoformat() if scenario.start_date else None,
        end_date=scenario.end_date.isoformat() if scenario.end_date else None,
        is_ongoing=scenario.is_ongoing, display_rank=scenario.display_rank,
        parent_scenario_id=str(scenario.parent_scenario_id) if scenario.parent_scenario_id else None,
        has_phases=has_phases, had_redemption_freeze_schemes=scenario.had_redemption_freeze_schemes,
        quick_stat_pct=quick_stat_pct,
    )


def _current_phase(db: Session, group: Scenario) -> Scenario:
    phases = db.query(Scenario).filter_by(parent_scenario_id=group.id).order_by(Scenario.phase_order.desc()).all()
    return phases[0] if phases else group


def _pct_str(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None


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

    frozen_names = set(scenario.had_redemption_freeze_schemes or [])

    if scenario.scenario_type == "HYPOTHETICAL":
        assumptions = db.query(ScenarioHypotheticalAssumption).filter_by(scenario_id=scenario.id).all()
        if not assumptions:
            return ScenarioResultRow(
                scenario=summary, portfolio_impact_pct=None, rupee_impact="0.00", benchmarks=[],
                phases=[], by_fund=[], by_member=[], hypothetical_assumptions=[], assumptions_not_set=True,
            )
        assumption_by_class = {a.asset_class: a for a in assumptions}
        holdings = await compute_holdings(db, household_member_ids)
        by_member: dict[uuid.UUID, Decimal] = {mid: Decimal("0") for mid in household_member_ids}
        total_impact = Decimal("0")
        for holding in holdings:
            if holding.current_value is None:
                continue
            scheme = db.get(Scheme, uuid.UUID(holding.scheme_id))
            bucket = hypothetical_asset_class_bucket(scheme.sebi_category or "") if scheme else "Other"
            assumption = assumption_by_class.get(bucket)
            if assumption is None:
                continue
            impact = Decimal(holding.current_value) * assumption.assumed_pct_change / 100
            member_id = uuid.UUID(holding.household_member_id)
            by_member[member_id] = by_member.get(member_id, Decimal("0")) + impact
            total_impact += impact

        return ScenarioResultRow(
            scenario=summary, portfolio_impact_pct=None, rupee_impact=str(total_impact.quantize(Decimal("0.01"))),
            benchmarks=[], phases=[], by_fund=[],
            by_member=[
                ScenarioMemberResult(
                    household_member_id=str(mid), member_name=members[mid].name if mid in members else "Unknown",
                    rupee_impact=str(impact.quantize(Decimal("0.01"))), funds=[],
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

    by_fund_map: dict[str, ScenarioFundResult] = {}
    by_member_rupee: dict[uuid.UUID, Decimal] = {mid: Decimal("0") for mid in household_member_ids}
    by_member_funds: dict[uuid.UUID, list[ScenarioMemberFundResult]] = {mid: [] for mid in household_member_ids}
    total_rupee = Decimal("0")

    for holding in holdings:
        scheme_id = uuid.UUID(holding.scheme_id)
        member_id = uuid.UUID(holding.household_member_id)
        scheme_result = results.get(scheme_id)
        is_frozen = holding.scheme_name in frozen_names
        current_value = Decimal(holding.current_value) if holding.current_value else Decimal("0")

        pct = None if is_frozen else (scheme_result.pct_change if scheme_result else None)
        rupee_impact = None
        if pct is not None:
            rupee_impact = (current_value * pct / 100).quantize(Decimal("0.01"))
            by_member_rupee[member_id] += rupee_impact
            total_rupee += rupee_impact

        by_fund_map[holding.scheme_id] = ScenarioFundResult(
            scheme_id=holding.scheme_id, scheme_name=holding.scheme_name,
            pct=_pct_str(pct), is_proxied=scheme_result.is_proxied if scheme_result else False,
            proxy_basis=scheme_result.proxy_basis if scheme_result else None, is_frozen=is_frozen,
        )
        by_member_funds[member_id].append(
            ScenarioMemberFundResult(scheme_id=holding.scheme_id, scheme_name=holding.scheme_name, rupee_impact=_pct_str(rupee_impact))
        )

    phases: list[ScenarioPhaseResult] = []
    if summary.has_phases:
        for phase in db.query(Scenario).filter_by(parent_scenario_id=scenario.id).order_by(Scenario.phase_order).all():
            phase_results = {r.scheme_id: r.pct_change for r in db.query(ScenarioSchemeResult).filter_by(scenario_id=phase.id).all()}
            phase_values = [v for v in phase_results.values() if v is not None]
            phases.append(ScenarioPhaseResult(
                label=phase.phase_label, order=phase.phase_order,
                start_date=phase.start_date.isoformat(), end_date=phase.end_date.isoformat() if phase.end_date else None,
                is_ongoing=phase.is_ongoing,
                pct=_pct_str((sum(phase_values) / len(phase_values)).quantize(Decimal("0.01"))) if phase_values else None,
            ))

    portfolio_values = [v for v in results.values() if v.pct_change is not None]
    portfolio_impact_pct = (
        _pct_str((sum(r.pct_change for r in portfolio_values) / len(portfolio_values)).quantize(Decimal("0.01")))
        if portfolio_values else None
    )

    return ScenarioResultRow(
        scenario=summary, portfolio_impact_pct=portfolio_impact_pct, rupee_impact=str(total_rupee.quantize(Decimal("0.01"))),
        benchmarks=[],  # filled by Task 7's API layer, which has the benchmark query context
        phases=phases, by_fund=list(by_fund_map.values()),
        by_member=[
            ScenarioMemberResult(
                household_member_id=str(mid), member_name=members[mid].name if mid in members else "Unknown",
                rupee_impact=str(by_member_rupee[mid].quantize(Decimal("0.01"))), funds=by_member_funds[mid],
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
    from app.models.reference import BenchmarkIndexHistory

    pre_start = scenario.start_date
    end = scenario.end_date or date.today()
    if pre_start is None:
        return []

    comparisons = []
    for index in BenchmarkIndex:
        start_row = (
            db.query(BenchmarkIndexHistory)
            .filter(BenchmarkIndexHistory.index_name == index, BenchmarkIndexHistory.date <= pre_start)
            .order_by(BenchmarkIndexHistory.date.desc())
            .first()
        )
        end_row = (
            db.query(BenchmarkIndexHistory)
            .filter(BenchmarkIndexHistory.index_name == index, BenchmarkIndexHistory.date <= end)
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
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found.")
    members = list_household_members(db, user.id)
    return await _async_get_scenario_result_for_household(db, scenario, [m.id for m in members])
```

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
  scenarioId: string;
  name: string;
  scenarioType: ScenarioType;
  startDate: string | null;
  endDate: string | null;
  isOngoing: boolean;
  displayRank: number | null;
  parentScenarioId: string | null;
  hasPhases: boolean;
  hadRedemptionFreezeSchemes: string[] | null;
  quickStatPct: string | null;
}

export interface ScenarioPhase {
  label: string;
  order: number;
  startDate: string;
  endDate: string | null;
  isOngoing: boolean;
  pct: string | null;
}

export interface ScenarioFund {
  schemeId: string;
  schemeName: string;
  pct: string | null;
  isProxied: boolean;
  proxyBasis: string | null;
  isFrozen: boolean;
}

export interface ScenarioMemberFund {
  schemeId: string;
  schemeName: string;
  rupeeImpact: string | null;
}

export interface ScenarioMember {
  householdMemberId: string;
  memberName: string;
  rupeeImpact: string;
  funds: ScenarioMemberFund[];
}

export interface ScenarioBenchmark {
  name: string;
  pct: string;
}

export interface ScenarioHypotheticalAssumption {
  assetClass: string;
  assumedPctChange: string;
  assumptionNote: string;
}

export interface ScenarioResult {
  scenario: ScenarioSummary;
  portfolioImpactPct: string | null;
  rupeeImpact: string;
  benchmarks: ScenarioBenchmark[];
  phases: ScenarioPhase[];
  byFund: ScenarioFund[];
  byMember: ScenarioMember[];
  hypotheticalAssumptions: ScenarioHypotheticalAssumption[];
  assumptionsNotSet: boolean;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// frontend/src/features/scenarios/resolveResultShape.test.ts
import { describe, expect, it } from "vitest";
import { resolveResultShape } from "./resolveResultShape";
import type { ScenarioSummary } from "./types";

const base: ScenarioSummary = {
  scenarioId: "s1", name: "Test", scenarioType: "CRASH", startDate: "2020-01-01", endDate: "2020-03-01",
  isOngoing: false, displayRank: null, parentScenarioId: null, hasPhases: false,
  hadRedemptionFreezeSchemes: null, quickStatPct: "-10.00",
};

describe("resolveResultShape", () => {
  it("returns hypothetical for HYPOTHETICAL scenario_type regardless of other flags", () => {
    expect(resolveResultShape({ ...base, scenarioType: "HYPOTHETICAL" })).toBe("hypothetical");
  });

  it("returns redemption_freeze when hadRedemptionFreezeSchemes is non-empty", () => {
    expect(resolveResultShape({ ...base, hadRedemptionFreezeSchemes: ["Franklin India Low Duration Fund"] })).toBe("redemption_freeze");
  });

  it("returns multi_phase for a group row with hasPhases true", () => {
    expect(resolveResultShape({ ...base, hasPhases: true })).toBe("multi_phase");
  });

  it("returns standard otherwise", () => {
    expect(resolveResultShape(base)).toBe("standard");
  });

  it("a crash scenario with phases and a redemption freeze flag resolves to redemption_freeze, not multi_phase (freeze checked first)", () => {
    expect(resolveResultShape({ ...base, hasPhases: true, hadRedemptionFreezeSchemes: ["X"] })).toBe("redemption_freeze");
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
  if (scenario.scenarioType === "HYPOTHETICAL") return "hypothetical";
  if (scenario.hadRedemptionFreezeSchemes?.length) return "redemption_freeze";
  if (scenario.parentScenarioId === null && scenario.hasPhases) return "multi_phase";
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
- Produces: `ScenarioPicker` component, `onSelectScenario: (scenarioId: string) => void` prop.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/features/scenarios/ScenarioPicker.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScenarioPicker } from "./ScenarioPicker";
import type { ScenarioSummary } from "./types";

const curated: ScenarioSummary[] = [
  { scenarioId: "c1", name: "COVID crash", scenarioType: "CRASH", startDate: "2020-01-20", endDate: "2020-03-31", isOngoing: false, displayRank: 1, parentScenarioId: null, hasPhases: false, hadRedemptionFreezeSchemes: null, quickStatPct: "-38.00" },
  { scenarioId: "c5", name: "Franklin Templeton wind-up (2020)", scenarioType: "CRASH", startDate: "2020-04-01", endDate: "2020-06-30", isOngoing: false, displayRank: 5, parentScenarioId: null, hasPhases: false, hadRedemptionFreezeSchemes: ["Franklin India Low Duration Fund"], quickStatPct: null },
  { scenarioId: "c7", name: "US-Iran war (2026)", scenarioType: "CRASH", startDate: "2026-02-28", endDate: null, isOngoing: true, displayRank: 7, parentScenarioId: null, hasPhases: true, hadRedemptionFreezeSchemes: null, quickStatPct: null },
  { scenarioId: "c8", name: "AI/tech valuation bust", scenarioType: "HYPOTHETICAL", startDate: null, endDate: null, isOngoing: false, displayRank: 8, parentScenarioId: null, hasPhases: false, hadRedemptionFreezeSchemes: null, quickStatPct: null },
];

const all: ScenarioSummary[] = [
  ...curated,
  { scenarioId: "m1", name: "Dot-com bust", scenarioType: "CRASH", startDate: "2000-03-01", endDate: "2002-10-31", isOngoing: false, displayRank: null, parentScenarioId: null, hasPhases: false, hadRedemptionFreezeSchemes: null, quickStatPct: "-45.00" },
];

describe("ScenarioPicker", () => {
  it("shows the 8 curated cards with a quick-stat %, a Freeze badge, and a pulsing ongoing indicator", () => {
    render(<ScenarioPicker curated={curated} all={all} isLoading={false} onSelectScenario={vi.fn()} />);
    expect(screen.getByText("COVID crash")).toBeInTheDocument();
    expect(screen.getByText("-38.00%")).toBeInTheDocument();
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
  onSelectScenario: (scenarioId: string) => void;
  className?: string;
}

function ScenarioCard({ scenario, onSelectScenario }: { scenario: ScenarioSummary; onSelectScenario: (id: string) => void }) {
  const isHypothetical = scenario.scenarioType === "HYPOTHETICAL";
  const isFrozen = Boolean(scenario.hadRedemptionFreezeSchemes?.length);

  return (
    <button
      type="button"
      onClick={() => onSelectScenario(scenario.scenarioId)}
      className={cn(
        "rounded-xl border bg-[var(--color-surface)] p-4 text-left space-y-2 shadow-2xs",
        isHypothetical ? "border-dashed border-[var(--color-hypo)]" : "border-[var(--color-border)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-sm font-bold text-[var(--color-ink)]">{scenario.name}</span>
        {isFrozen ? (
          <Badge variant="outline">Freeze</Badge>
        ) : scenario.isOngoing ? (
          <Badge variant="outline" className="animate-pulse">ongoing</Badge>
        ) : scenario.quickStatPct !== null ? (
          <span className="text-sm font-semibold tabular-nums text-[var(--color-ink)]">{scenario.quickStatPct}%</span>
        ) : null}
      </div>
    </button>
  );
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

  const curatedIds = new Set(curated.map((s) => s.scenarioId));
  const remaining = all.filter((s) => !curatedIds.has(s.scenarioId));

  return (
    <section className={cn("space-y-6", className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {curated.map((scenario) => (
          <ScenarioCard key={scenario.scenarioId} scenario={scenario} onSelectScenario={onSelectScenario} />
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
            <ScenarioCard key={scenario.scenarioId} scenario={scenario} onSelectScenario={onSelectScenario} />
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
  scenario: { scenarioId: "c1", name: "COVID crash", scenarioType: "CRASH", startDate: "2020-01-20", endDate: "2020-03-31", isOngoing: false, displayRank: 1, parentScenarioId: null, hasPhases: false, hadRedemptionFreezeSchemes: null, quickStatPct: "-38.00" },
  portfolioImpactPct: "-32.50", rupeeImpact: "-650000.00",
  benchmarks: [{ name: "nifty_50", pct: "-38.00" }],
  phases: [],
  byFund: [
    { schemeId: "s1", schemeName: "Real Fund", pct: "-30.00", isProxied: false, proxyBasis: null, isFrozen: false },
    { schemeId: "s2", schemeName: "Proxied Fund", pct: "-20.00", isProxied: true, proxyBasis: "sebi_category_average:Equity Scheme - Flexi Cap Fund", isFrozen: false },
    { schemeId: "s3", schemeName: "No Data Fund", pct: null, isProxied: true, proxyBasis: "no_comparable_data", isFrozen: false },
  ],
  byMember: [{ householdMemberId: "m1", memberName: "Ayush", rupeeImpact: "-650000.00", funds: [] }],
  hypotheticalAssumptions: [], assumptionsNotSet: false,
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

function FundRow({ fund }: { fund: ScenarioResult["byFund"][number] }) {
  if (fund.pct === null) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--color-ink)]">{fund.schemeName}</span>
        <span className="text-[var(--color-text-secondary)]">Not enough historical data to estimate</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--color-ink)]">{fund.schemeName}</span>
      <span
        className="tabular-nums font-semibold"
        title={fund.isProxied ? `Shown using the ${fund.proxyBasis} average` : undefined}
      >
        {fund.isProxied ? "~" : ""}{fund.pct}%
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
        {result.scenario.isOngoing && " Numbers will update as the event continues."}
      </p>

      <div className="flex gap-6">
        <div>
          <p className="text-xs text-[var(--color-text-secondary)]">Portfolio impact</p>
          <p className="text-2xl font-display font-bold tabular-nums">{result.portfolioImpactPct}%</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-secondary)]">Rupee impact</p>
          <p className="text-2xl font-display font-bold tabular-nums">{result.rupeeImpact}</p>
        </div>
      </div>

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
        {result.byFund.map((fund) => (
          <FundRow key={fund.schemeId} fund={fund} />
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]">By family member</p>
        {result.byMember.map((member) => (
          <div key={member.householdMemberId} className="rounded-lg border border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setExpandedMember((prev) => (prev === member.householdMemberId ? null : member.householdMemberId))}
              className={cn("w-full flex items-center justify-between p-3 text-sm")}
            >
              <span>{member.memberName}</span>
              <span className="tabular-nums font-semibold">{member.rupeeImpact}</span>
            </button>
            {expandedMember === member.householdMemberId && (
              <div className="px-3 pb-3 space-y-1">
                {member.funds.map((f) => (
                  <div key={f.schemeId} className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
                    <span>{f.schemeName}</span>
                    <span className="tabular-nums">{f.rupeeImpact ?? "Not enough historical data to estimate"}</span>
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
        <p className="text-2xl font-display font-bold tabular-nums">{result.portfolioImpactPct}%</p>
      </div>

      <div className="space-y-2">
        {result.phases.map((phase) => (
          <div
            key={phase.label}
            className={phase.isOngoing ? "rounded-lg border-2 border-[var(--color-negative)] p-3 animate-pulse" : "rounded-lg border border-[var(--color-border)] p-3"}
          >
            <p className="text-sm font-semibold">{phase.label}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">{phase.startDate} – {phase.endDate ?? "ongoing"}</p>
            <p className="tabular-nums font-bold">{phase.pct !== null ? `${phase.pct}%` : "Not enough historical data to estimate"}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]">By fund (current phase)</p>
        {result.byFund.map((fund) => (
          <div key={fund.schemeId} className="flex items-center justify-between text-sm">
            <span>{fund.schemeName}</span>
            <span className="tabular-nums">{fund.pct !== null ? `${fund.isProxied ? "~" : ""}${fund.pct}%` : "Not enough historical data to estimate"}</span>
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
        {result.byFund.map((fund) => (
          <div key={fund.schemeId} className="flex items-center justify-between text-sm">
            <span>{fund.schemeName}</span>
            {fund.isFrozen ? (
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
  if (result.assumptionsNotSet) {
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
        <p className="text-2xl font-display font-bold tabular-nums">{result.rupeeImpact}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text-secondary)]">Per-asset-class assumption</p>
        {result.hypotheticalAssumptions.map((a) => (
          <div key={a.assetClass} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>{a.assetClass}</span>
              <span className="tabular-nums font-semibold">{a.assumedPctChange}%</span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">{a.assumptionNote}</p>
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

### Task 12: Frontend — wire the `Scenarios` nav route

**Files:**
- Modify: `frontend/src/app/navigation.tsx` (or the project's actual top-level nav config —
  locate it via `grep -rn "Holdings" frontend/src/app/` before editing, since the exact file
  name/path wasn't independently re-verified in this plan's research pass)

**Interfaces:**
- Consumes: `ScenarioPicker`, `resolveResultShape`, all 4 result views (Tasks 9-11).

- [ ] **Step 1: Locate the real nav config file**

Run: `grep -rln "Holdings" frontend/src/app/ frontend/src/features/*/navigation* 2>/dev/null`

- [ ] **Step 2: Add a container component wiring picker → dispatch → result view**

```tsx
// frontend/src/features/scenarios/ScenariosScreen.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { HypotheticalResultView } from "./HypotheticalResultView";
import { MultiPhaseResultView } from "./MultiPhaseResultView";
import { RedemptionFreezeResultView } from "./RedemptionFreezeResultView";
import { resolveResultShape } from "./resolveResultShape";
import { ScenarioPicker } from "./ScenarioPicker";
import { StandardResultView } from "./StandardResultView";
import type { ScenarioResult, ScenarioSummary } from "./types";

export function ScenariosScreen() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  const curatedQuery = useQuery({
    queryKey: ["scenarios", "curated"],
    queryFn: () => apiGet<ScenarioSummary[]>("/scenarios?curated=true"),
  });
  const allQuery = useQuery({
    queryKey: ["scenarios", "all"],
    queryFn: () => apiGet<ScenarioSummary[]>("/scenarios"),
  });
  const resultQuery = useQuery({
    queryKey: ["scenarios", "results", selectedScenarioId],
    queryFn: () => apiGet<ScenarioResult>(`/scenarios/${selectedScenarioId}/results`),
    enabled: selectedScenarioId !== null,
  });

  if (selectedScenarioId && resultQuery.data) {
    const shape = resolveResultShape(resultQuery.data.scenario);
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setSelectedScenarioId(null)} className="text-sm text-[var(--color-accent)]">
          ← Back to scenarios
        </button>
        {shape === "standard" && <StandardResultView result={resultQuery.data} />}
        {shape === "multi_phase" && <MultiPhaseResultView result={resultQuery.data} />}
        {shape === "redemption_freeze" && <RedemptionFreezeResultView result={resultQuery.data} />}
        {shape === "hypothetical" && <HypotheticalResultView result={resultQuery.data} />}
      </div>
    );
  }

  return (
    <ScenarioPicker
      curated={curatedQuery.data ?? []}
      all={allQuery.data ?? []}
      isLoading={curatedQuery.isLoading || allQuery.isLoading}
      onSelectScenario={setSelectedScenarioId}
    />
  );
}
```

(`apiGet` — check `frontend/src/lib/api-client.ts` for the real existing helper name/
signature before using it verbatim; this plan assumes the same pattern every other feature's
`useQuery` call already uses in this codebase, not a new client.)

- [ ] **Step 3: Add the nav entry**

Add a `Scenarios` route/nav-item pointing at `ScenariosScreen`, sibling to the existing
`Holdings`/`Analytics`/`Profile` entries, in whichever file Step 1 located.

- [ ] **Step 4: Manual verification**

Start the dev server, navigate to `/scenarios`, confirm the picker renders the 8 curated
cards and tapping each of the 4 differently-shaped scenarios (a standard crash, US-Iran war,
Franklin Templeton, AI/tech valuation bust) renders the correct result view.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/scenarios/ScenariosScreen.tsx
git commit -m "feat: wire the Scenarios screen into the app's top-level navigation"
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
Task 9) field-for-field in spirit (snake_case ↔ camelCase, consistent with attributes 04/09's
same convention). `compute_scenario_results`/`get_scenario_summary`/
`get_scenario_result_for_household` signatures are used identically between Task 5's
definition, Task 6's extension, Task 7's API wiring, and Task 8's job wiring.
`hypothetical_asset_class_bucket`'s return values (`"Equity"`, `"Index/ETF"`, `"Gold"`,
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
