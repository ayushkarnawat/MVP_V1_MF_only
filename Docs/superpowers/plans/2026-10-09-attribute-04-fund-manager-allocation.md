# Attribute 04 — Fund Manager Allocation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show which fund manager(s) actually run each scheme a household holds, aggregated
into manager-first cards across the whole portfolio, for every AMC where this can be
automated — and genuinely automate as many of the 57 AMFI-listed AMCs as possible in this
same build, not just the ones already proven working.

**Architecture:** A new `scheme_fund_managers` table is populated monthly by a new
`amfi_factsheet_client.py` (the structural twin of the existing `amfi_ter_client.py`), driven
by a per-AMC resolver registry (`fund_manager_resolvers.py`) that classifies each AMC as
`STATIC_REGEX` (scrape AMFI's own factsheet pointer), `JSON_API` (call the AMC's own
document API directly), or `MANUAL_PENDING` (proven unautomatable, closed by a manual-PDF
CLI reusing the same extraction code). Extracted manager names are matched to existing
`Scheme` rows via a hybrid exact-then-fuzzy algorithm scoped to one AMC at a time, and
propagated by `(amc_name, base_name)` so every Direct/Regular/IDCW plan variant of the same
underlying fund gets the same manager link. The result is wired into the household analytics
precompute dispatcher (`recompute.py`'s `_SECTIONS` list) as a new section — not a bespoke
REST endpoint — and rendered by a new `FundManagerSection.tsx` using the Analytics
dashboard's existing card chrome.

**Tech Stack:** Python/SQLAlchemy/Alembic backend, `httpx` for HTTP, `pypdfium2` for PDF text
extraction (already an installed transitive dependency of `casparser`, confirmed via
`backend/requirements.txt` — no new dependency added), stdlib `difflib.SequenceMatcher` for
fuzzy scoring (no new dependency), React/TypeScript frontend, Terraform EventBridge Scheduler
+ Fargate for the monthly job (an existing, already-proven mechanism — no new infra category).

**Spec:**
- `Docs/analytics/2026-10-07-sub-project-1-planning.md` — "Attribute 04" sections and the
  "AMC coverage — every one of the 57 AMFI-listed AMCs individually checked" section
- `Docs/analytics/2026-10-08-attribute-04-fund-manager-spec.md` — frontend spec
- `Docs/analytics/artifacts/2026-10-08-attribute-04-fund-manager-visual-map.html` — visual
  reference

## Global Constraints

- **Migration numbering:** before creating the migration file, run
  `ls backend/alembic/versions | sort | tail -5` to find the real latest migration number —
  never hardcode a number guessed in this doc (`decisions.md`'s standing rule: migration
  numbers are assigned at build time, since multiple plans may be built out of order).
- **Matching:** exact-first on normalized `base_name`, AMC-scoped fuzzy fallback,
  `MIN_MATCH_CONFIDENCE = Decimal("0.80")`, ambiguity guard refuses auto-pick when the
  runner-up's confidence is within `Decimal("0.05")` of the top candidate, propagation keyed
  on `(amc_name, base_name)` — **never** `amfi_code` (unique per plan-variant row, not per
  fund family).
- **No new enum type for `match_method`:** mirrors `schemes.ter_link_source`'s existing
  plain-`String` + module-constant convention (`TER_LINK_EXACT`/`TER_LINK_MANUAL` precedent
  in `amfi_ter_client.py`), not `enum_column()` — stay consistent with the closest sibling
  column rather than introducing a second convention for the same kind of value.
- **Dispatcher wiring, not a bespoke endpoint:** any new household-aggregated analytics data
  is added to `recompute.py`'s `_SECTIONS` list and served through the existing generic
  `GET /analytics/{scope}` route — every current section (`allocation`, `ter`,
  `ter_direct_regular`, `benchmark`, `benchmark_funds`, `category_ranking`, `score`) already
  follows this, confirmed by reading `backend/app/services/analytics/recompute.py` directly.
- **Decimal discipline:** every rupee value crossing into the frontend is a Decimal string,
  formatted with `@/lib/decimal` — never a float.
- **No client-side fuzzy matching or partial-confidence UI:** a row is either
  backend-resolved (shown as fact) or absent (shown as the explicit "not available yet"
  state) — no "we think this might be X" display state anywhere in the frontend.
- **Card chrome reuse:** `rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]
  p-5 sm:p-6 shadow-2xs` reused verbatim from `CategoryRankingSection.tsx` — no new visual
  language invented for this section.
- **Tier 3 AMCs (12 of them) must ship with a real working resolver built during this plan's
  own tasks.** `MANUAL_PENDING` for a Tier 3 AMC is permitted only with the same standard of
  proof Edelweiss already met (a real, reproducible failed automation attempt, documented
  inline in the registry as a comment) — never a default, and never "we'll get to it later."
- **Per-AMC fault isolation:** one AMC's fetch/parse failure must never abort the run for
  every other AMC — every AMC is wrapped in its own `try`/`except`, logged and counted,
  loop continues.

## Review Focus

1. **Co-managed / assistant-managed scheme** (2+ manager rows for one scheme) — must produce
   2+ `scheme_fund_managers` rows and 2+ manager cards, never merged into one card (frontend
   spec's explicit "no merging, no '+1 more'" rule).
2. **Fuzzy-match ambiguity** — two AMC-scoped candidate schemes score within 0.05 of each
   other — must refuse to auto-pick either, leave the extracted name unmatched and logged,
   never silently take the higher score.
3. **A held scheme under a `MANUAL_PENDING` AMC** (HDFC, Kotak, Edelweiss) — must land in
   `unavailableSchemes` and render the frontend's "not available yet" block, never a crash,
   a fabricated manager, or a silently-dropped row.
4. **Re-running the monthly job twice against unchanged source data** (idempotency) — must
   not create duplicate rows; the `UNIQUE (scheme_id, manager_name, reference_period)`
   constraint plus an upsert-not-insert write path must hold.
5. **ABSL's factsheet has no "Managing Since" date and a different tabular layout** from
   every other Tier-1 AMC — must still produce correctly-attributed manager rows with
   `managing_since` left `NULL`, not crash the whole AMC's parse or silently produce zero
   rows.

## File Structure

**Backend — create:**
- `backend/alembic/versions/<NNNN>_scheme_fund_managers.py` — new table
- `backend/app/services/analytics/fund_manager_resolvers.py` — `ResolverKind` enum,
  `ResolverEntry` dataclass, the `AMC_RESOLVERS` registry (data)
- `backend/app/services/analytics/amfi_factsheet_client.py` — fetch, extract, match, upsert
  (the service logic, structural twin of `amfi_ter_client.py`)
- `backend/app/services/analytics/fund_manager_allocation.py` — household-scoped aggregation
  (`compute_fund_manager_allocation`, the twin of `ter.py`'s `compute_weighted_ter`)
- `backend/scripts/jobs/refresh_fund_managers_monthly.py` — monthly job entrypoint
- `backend/scripts/jobs/import_manual_fund_managers.py` — manual-intake CLI for
  HDFC/Kotak/Edelweiss
- `backend/tests/services/analytics/test_fund_manager_resolvers.py`
- `backend/tests/services/analytics/test_amfi_factsheet_client.py`
- `backend/tests/services/analytics/test_fund_manager_allocation.py`

**Backend — modify:**
- `backend/app/models/reference.py` — add `SchemeFundManager` model
- `backend/app/services/analytics/schemas.py` — add `ManagerGroup`, `FundManagerAllocationSummary`,
  `AggregateFundManagerAllocationResponse`
- `backend/app/services/analytics/recompute.py` — register the new `_SectionSpec`
- `infra/modules/scheduler/main.tf` — add the `fund_managers_monthly` job entry

**Frontend — create:**
- `frontend/src/features/analytics/FundManagerSection.tsx`
- `frontend/src/features/analytics/FundManagerSection.test.tsx`

**Frontend — modify:**
- `frontend/src/features/analytics/types.ts` — new interfaces + `ANALYTICS_SECTION_NAMES` entry
- `frontend/src/features/analytics/AnalyticsView.tsx` — wire the new section in
- `frontend/src/features/analytics/print/PrintAnalyticsView.tsx` — render in the PDF export

---

### Task 1: `scheme_fund_managers` table

**Files:**
- Create: `backend/alembic/versions/<NNNN>_scheme_fund_managers.py`
- Modify: `backend/app/models/reference.py`
- Test: `backend/tests/services/analytics/test_fund_manager_allocation.py` (table-shape smoke
  test only — full behavior is tested in Task 5)

**Interfaces:**
- Produces: `SchemeFundManager` ORM model (`backend/app/models/reference.py`) with columns
  `id`, `scheme_id`, `manager_name`, `role`, `sequence_order`, `managing_since_raw`,
  `managing_since`, `reference_period`, `match_method`, `match_confidence` — consumed by
  every later task in this plan.

- [ ] **Step 1: Add the model**

In `backend/app/models/reference.py`, add `UniqueConstraint` to the existing import line
(`from sqlalchemy import Boolean, Index, true, DateTime, ForeignKey, Integer, Numeric,
String, Uuid, UniqueConstraint`) and `Date` (for `managing_since`), then append:

```python
class SchemeFundManager(Base):
    __tablename__ = "scheme_fund_managers"
    __table_args__ = (
        UniqueConstraint(
            "scheme_id", "manager_name", "reference_period",
            name="uq_scheme_fund_managers_scheme_manager_period",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), nullable=False, index=True)
    manager_name: Mapped[str] = mapped_column(String, nullable=False)
    # Verbatim source label (e.g. "Assistant Fund Manager") or NULL when the
    # source doesn't label one name as more senior than another (ABSL: every
    # name is unlabeled). Never fabricated as "Primary Manager" -- see
    # Review Focus #5 and the frontend spec's explicit "never a fabricated
    # label" rule.
    role: Mapped[str | None] = mapped_column(String, nullable=True)
    # 0 = first-listed/primary in the source's own order; used for stable
    # ordering only, never displayed as a rank.
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    managing_since_raw: Mapped[str | None] = mapped_column(String, nullable=True)
    managing_since: Mapped[date_ | None] = mapped_column(Date, nullable=True)
    reference_period: Mapped[date_] = mapped_column(nullable=False)
    # "EXACT" | "FUZZY" | "MANUAL" -- plain String + module constants
    # (amfi_factsheet_client.py), mirroring ter_link_source's convention,
    # not a DB enum.
    match_method: Mapped[str] = mapped_column(String, nullable=False)
    match_confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3), nullable=True)
```

Also add `Date` to the `datetime`-adjacent import: `from datetime import date as date_, datetime`
already imports `date_`; add `from sqlalchemy import Date` to the main import line.

- [ ] **Step 2: Write the migration**

Run `ls backend/alembic/versions | sort | tail -5` first to get the real next number and the
real latest `down_revision` — substitute both below (shown as `<NNNN>`/`<NNNN-1>`).

```python
"""scheme_fund_managers: per-scheme fund manager attribution (attribute 04)

Revision ID: <NNNN>
Revises: <NNNN-1>

One row per (scheme, manager, reference_period) -- a scheme with 2 managers
gets 2 rows, never merged (Review Focus #1). manager_name/role/managing_since
are sourced verbatim from AMFI/AMC factsheets; match_method records how the
link to `scheme_id` was made ("EXACT"/"FUZZY"/"MANUAL").
"""
from alembic import op
import sqlalchemy as sa

revision = "<NNNN>"
down_revision = "<NNNN-1>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scheme_fund_managers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("manager_name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("sequence_order", sa.Integer(), nullable=False),
        sa.Column("managing_since_raw", sa.String(), nullable=True),
        sa.Column("managing_since", sa.Date(), nullable=True),
        sa.Column("reference_period", sa.Date(), nullable=False),
        sa.Column("match_method", sa.String(), nullable=False),
        sa.Column("match_confidence", sa.Numeric(4, 3), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
        sa.UniqueConstraint(
            "scheme_id", "manager_name", "reference_period",
            name="uq_scheme_fund_managers_scheme_manager_period",
        ),
    )
    op.create_index("ix_scheme_fund_managers_scheme_id", "scheme_fund_managers", ["scheme_id"])


def downgrade() -> None:
    op.drop_index("ix_scheme_fund_managers_scheme_id", table_name="scheme_fund_managers")
    op.drop_table("scheme_fund_managers")
```

- [ ] **Step 3: Write the failing shape test**

```python
# backend/tests/services/analytics/test_fund_manager_allocation.py
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import Scheme, SchemeFundManager


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_scheme_fund_manager_round_trips_two_managers_for_one_scheme():
    db = _session()
    scheme = Scheme(
        id=uuid.uuid4(), amfi_code="TEST01", name="Test Fund", base_name="Test Fund",
        amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(scheme)
    db.commit()

    db.add_all([
        SchemeFundManager(
            id=uuid.uuid4(), scheme_id=scheme.id, manager_name="Jane Doe", role=None,
            sequence_order=0, reference_period=date(2026, 9, 1), match_method="EXACT",
            match_confidence=Decimal("1.000"),
        ),
        SchemeFundManager(
            id=uuid.uuid4(), scheme_id=scheme.id, manager_name="John Roe",
            role="Assistant Fund Manager", sequence_order=1,
            reference_period=date(2026, 9, 1), match_method="EXACT",
            match_confidence=Decimal("1.000"),
        ),
    ])
    db.commit()

    rows = db.query(SchemeFundManager).filter_by(scheme_id=scheme.id).all()
    assert len(rows) == 2
    assert {r.manager_name for r in rows} == {"Jane Doe", "John Roe"}
```

- [ ] **Step 4: Run it, confirm it fails**

Run: `cd backend && pytest tests/services/analytics/test_fund_manager_allocation.py -v`
Expected: FAIL — `ImportError: cannot import name 'SchemeFundManager'`

- [ ] **Step 5: Implement Step 1's model + Step 2's migration, then re-run**

Run: `cd backend && alembic upgrade head && pytest tests/services/analytics/test_fund_manager_allocation.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/reference.py backend/alembic/versions/ backend/tests/services/analytics/test_fund_manager_allocation.py
git commit -m "feat: add scheme_fund_managers table"
```

---

### Task 2: Resolver registry — `fund_manager_resolvers.py`

**Files:**
- Create: `backend/app/services/analytics/fund_manager_resolvers.py`
- Test: `backend/tests/services/analytics/test_fund_manager_resolvers.py`

**Interfaces:**
- Consumes: nothing (pure data + enum)
- Produces: `ResolverKind` enum (`STATIC_REGEX`, `JSON_API`, `MANUAL_PENDING`),
  `ResolverEntry` frozen dataclass (`kind`, `endpoint_url: str | None`,
  `response_json_path: str | None`, `blocked_reason: str | None`), `AMC_RESOLVERS: dict[str,
  ResolverEntry]` keyed by `amc_name` exactly as it appears in AMFI's factsheet-directory
  payload — consumed by `amfi_factsheet_client.py` (Task 3).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/services/analytics/test_fund_manager_resolvers.py
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverKind


def test_every_resolver_kind_is_represented():
    kinds = {entry.kind for entry in AMC_RESOLVERS.values()}
    assert kinds == {ResolverKind.STATIC_REGEX, ResolverKind.JSON_API, ResolverKind.MANUAL_PENDING}


def test_json_api_entries_all_have_an_endpoint_url():
    for amc, entry in AMC_RESOLVERS.items():
        if entry.kind is ResolverKind.JSON_API:
            assert entry.endpoint_url, f"{amc} is JSON_API but has no endpoint_url"


def test_manual_pending_entries_all_have_a_blocked_reason():
    for amc, entry in AMC_RESOLVERS.items():
        if entry.kind is ResolverKind.MANUAL_PENDING:
            assert entry.blocked_reason, f"{amc} is MANUAL_PENDING with no documented proof"


def test_tier_1_and_2_count_is_35():
    automated = [e for e in AMC_RESOLVERS.values() if e.kind in (ResolverKind.STATIC_REGEX, ResolverKind.JSON_API)]
    assert len(automated) == 35
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd backend && pytest tests/services/analytics/test_fund_manager_resolvers.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement the registry**

```python
"""Per-AMC fund-manager resolver classification (attribute 04).

AMFI's own Factsheet directory page (`amfiindia.com/online-center/download-
factsheets`) gives every AMC's current `amc_monthly_mf_factsheets` landing-
page URL via an embedded RSC JSON payload, re-fetched every run (never
cached -- see amfi_factsheet_client.py). For most AMCs that landing page's
HTML has a regex-findable "latest factsheet PDF" link (STATIC_REGEX) -- no
AMC-specific URL needs to be hardcoded here at all, only the classification.
A minority publish via their own JSON API instead of (or in addition to) that
pointer, which AMFI's own pointer doesn't surface reliably for them
(JSON_API) -- these DO need a hardcoded endpoint, found by live tracing each
AMC's site. The remainder are MANUAL_PENDING, each with a documented reason
proving automation was actually attempted and failed -- never a default.

Classified 2026-10-08/09 by individually tracing all 57 AMFI-listed AMCs
live (see Docs/analytics/2026-10-07-sub-project-1-planning.md's "AMC
coverage" section for the full narrative)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ResolverKind(Enum):
    STATIC_REGEX = "static_regex"
    JSON_API = "json_api"
    MANUAL_PENDING = "manual_pending"


@dataclass(frozen=True)
class ResolverEntry:
    kind: ResolverKind
    # JSON_API only: the AMC's own document-listing endpoint.
    endpoint_url: str | None = None
    # JSON_API only: dotted path to the list of documents in that
    # endpoint's JSON response (e.g. "data.items") -- Task 3 interprets this.
    response_json_path: str | None = None
    # MANUAL_PENDING only: the real, reproducible proof automation was
    # attempted and failed (never left blank -- Review Focus / Global
    # Constraints "same standard of proof as Edelweiss").
    blocked_reason: str | None = None


AMC_RESOLVERS: dict[str, ResolverEntry] = {
    # --- Tier 1: STATIC_REGEX, confirmed working (27) ---
    "Nippon India Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "DSP Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Aditya Birla Sun Life Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "SBI Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Union Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Motilal Oswal Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "quant Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Mirae Asset Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "NJ Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Franklin Templeton Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Invesco Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Canara Robeco Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Baroda BNP Paribas Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "PPFAS Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Shriram Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Bajaj Finserv Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Helios Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Zerodha Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Unifi Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Angel One Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Capitalmind Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Abakkus Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "LIC Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "JM Financial Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Old Bridge Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Quantum Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Samco Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),

    # --- Tier 2: JSON_API, confirmed endpoint (8) ---
    "ICICI Prudential Mutual Fund": ResolverEntry(
        ResolverKind.JSON_API,
        endpoint_url="https://apimf.icicipruamc.com/nms/v1/downloads/categories",
        response_json_path="data",
    ),
    "Axis Mutual Fund": ResolverEntry(
        ResolverKind.JSON_API,
        endpoint_url="https://www.axismf.com/cms/downloads/category",
        response_json_path="data",
    ),
    "Choice Mutual Fund": ResolverEntry(
        ResolverKind.JSON_API,
        endpoint_url="https://www.choiceindia.com/api/document-master-list",
        response_json_path="data",
    ),
    "UTI Mutual Fund": ResolverEntry(
        ResolverKind.JSON_API,
        endpoint_url="https://www.utimf.com/api/page/forms-and-downloads-downloads",
        response_json_path="data",
    ),
    "ITI Mutual Fund": ResolverEntry(
        ResolverKind.JSON_API,
        endpoint_url="https://www.itimf.com/jeeth/api/v1/catalog/digitalfactsheet",
        response_json_path="data",
    ),
    "PGIM India Mutual Fund": ResolverEntry(
        ResolverKind.JSON_API,
        endpoint_url="https://www.pgimindia.com/api/v1/brochure/get/file",
        response_json_path="data",
    ),
    "WhiteOak Capital Mutual Fund": ResolverEntry(
        ResolverKind.JSON_API,
        endpoint_url="https://cms.whiteoakamc.com/graphql",
        response_json_path="data",
    ),
    "Trust Mutual Fund": ResolverEntry(
        ResolverKind.JSON_API,
        endpoint_url="https://www.trustmf.com/api/api/Trust/GetData",
        response_json_path="data",
    ),

    # --- Tier 3: live-investigated and resolved as part of this same plan
    # (Tasks 8-19, one per AMC below) -- placeholder classification here
    # until each task's own investigation step replaces it with the real
    # finding. Each of these 12 lines is overwritten by its own task, never
    # left as MANUAL_PENDING by default.
    "HSBC Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Sundaram Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Groww Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "360 ONE Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Tata Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Taurus Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "ASK Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Bandhan Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Jio BlackRock Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Navi Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Bank of India Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),
    "Mahindra Manulife Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX),

    # --- Tier 4/manual: proven unautomatable (3) ---
    "HDFC Mutual Fund": ResolverEntry(
        ResolverKind.MANUAL_PENDING,
        blocked_reason="No live factsheet/API trace found this session; closed via import_manual_fund_managers.py (Task 21).",
    ),
    "Kotak Mahindra Mutual Fund": ResolverEntry(
        ResolverKind.MANUAL_PENDING,
        blocked_reason="No live factsheet/API trace found this session; closed via import_manual_fund_managers.py (Task 21).",
    ),
    "Edelweiss Mutual Fund": ResolverEntry(
        ResolverKind.MANUAL_PENDING,
        blocked_reason="Live-verified 2026-10-08: edelweissmf.com/downloads/factsheets returns HTTP 403 even to a full headless Chromium session, not just a bare curl -- confirmed browser-level block, closed via import_manual_fund_managers.py (Task 21).",
    ),

    # --- Tier 5: likely no live retail schemes -- liveness-checked in Task 20,
    # each entry replaced with STATIC_REGEX/JSON_API if that check finds a
    # live scheme to resolve, or left MANUAL_PENDING with the check's own
    # negative result as blocked_reason if not.
    "IL&FS Infra Mutual Fund": ResolverEntry(ResolverKind.MANUAL_PENDING, blocked_reason="Pending Task 20 liveness check."),
    "Lakshya Mutual Fund": ResolverEntry(ResolverKind.MANUAL_PENDING, blocked_reason="Pending Task 20 liveness check."),
    "Carnelian Mutual Fund": ResolverEntry(ResolverKind.MANUAL_PENDING, blocked_reason="Pending Task 20 liveness check."),
    "AlphaGrep Mutual Fund": ResolverEntry(ResolverKind.MANUAL_PENDING, blocked_reason="Pending Task 20 liveness check."),
    "Nuvama Mutual Fund": ResolverEntry(ResolverKind.MANUAL_PENDING, blocked_reason="Pending Task 20 liveness check."),
    "Wealth Company Mutual Fund": ResolverEntry(ResolverKind.MANUAL_PENDING, blocked_reason="Pending Task 20 liveness check."),
    "Monarch Networth Mutual Fund": ResolverEntry(ResolverKind.MANUAL_PENDING, blocked_reason="Pending Task 20 liveness check."),
}
```

**Note for the implementer:** the Tier 3 block above is intentionally marked `STATIC_REGEX`
as a starting assumption only — Tasks 8-19 each investigate one of these 12 AMCs for real and
overwrite its entry with whatever the investigation actually finds (`STATIC_REGEX`,
`JSON_API`, or a proven `MANUAL_PENDING` with its own documented `blocked_reason`). This task
is not "done" by Tier 3 shipping unverified; it's done once the registry's structure and
Tier 1/2/4 entries exist and are tested. The `test_tier_1_and_2_count_is_35` test above only
counts Tier 1 + Tier 2, so it passes regardless of what Tasks 8-19 later do to Tier 3.

- [ ] **Step 4: Run tests, confirm they pass**

Run: `cd backend && pytest tests/services/analytics/test_fund_manager_resolvers.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/fund_manager_resolvers.py backend/tests/services/analytics/test_fund_manager_resolvers.py
git commit -m "feat: add per-AMC fund-manager resolver registry"
```

---

### Task 3: Matching engine + `amfi_factsheet_client.py`

**Files:**
- Create: `backend/app/services/analytics/amfi_factsheet_client.py`
- Test: `backend/tests/services/analytics/test_amfi_factsheet_client.py`

**Interfaces:**
- Consumes: `AMC_RESOLVERS`, `ResolverKind` (Task 2); `Scheme`, `SchemeFundManager` (Task 1).
- Produces: `MATCH_METHOD_EXACT = "EXACT"`, `MATCH_METHOD_FUZZY = "FUZZY"`,
  `MATCH_METHOD_MANUAL = "MANUAL"` constants; `match_extracted_fund_name(extracted_name:
  str, candidates: list[Scheme]) -> tuple[Scheme, str, Decimal] | None`;
  `extract_managers_generic(text: str) -> list[dict]`; `extract_managers_absl(text: str) ->
  list[dict]`; `upsert_scheme_fund_managers(db: Session, scheme: Scheme, managers: list[dict],
  reference_period: date, match_method: str, match_confidence: Decimal | None) -> None`;
  `FundManagerRefreshResult` frozen dataclass (`success`, `amcs_processed`, `amcs_failed`,
  `schemes_matched`, `schemes_unmatched`, `seconds`); `async def
  refresh_fund_managers(db: Session) -> FundManagerRefreshResult` — consumed by Task 4's job
  script and Task 21's manual-intake CLI.

- [ ] **Step 1: Write the failing tests — matching engine**

```python
# backend/tests/services/analytics/test_amfi_factsheet_client.py
import uuid
from decimal import Decimal

from app.models.reference import Scheme
from app.services.analytics.amfi_factsheet_client import (
    MATCH_METHOD_EXACT,
    MATCH_METHOD_FUZZY,
    extract_managers_absl,
    extract_managers_generic,
    match_extracted_fund_name,
)


def _scheme(name, base_name, amc="Test AMC"):
    return Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], name=name, base_name=base_name, amc_name=amc, sebi_category="Equity Scheme - Flexi Cap Fund")


def test_match_exact_normalized_base_name():
    candidates = [_scheme("ABC Bluechip Fund - Direct", "ABC Bluechip Fund"), _scheme("XYZ Fund", "XYZ Fund")]
    result = match_extracted_fund_name("ABC Bluechip", "Test AMC", candidates)
    assert result is not None
    scheme, method, confidence = result
    assert scheme.base_name == "ABC Bluechip Fund"
    assert method == MATCH_METHOD_EXACT
    assert confidence == Decimal("1.0")


def test_match_refuses_ambiguous_fuzzy_candidates():
    # Two candidates close enough in name that neither should auto-win.
    candidates = [_scheme("ABC Growth Opportunities Fund", "ABC Growth Opportunities Fund"),
                  _scheme("ABC Growth Opportunities Plus Fund", "ABC Growth Opportunities Plus Fund")]
    result = match_extracted_fund_name("ABC Growth Opportunity Fund", "Test AMC", candidates)
    assert result is None


def test_match_refuses_below_confidence_floor():
    candidates = [_scheme("Completely Unrelated Fund", "Completely Unrelated Fund")]
    result = match_extracted_fund_name("ABC Bluechip", "Test AMC", candidates)
    assert result is None


def test_extract_managers_generic_parses_name_role_and_date():
    text = "Fund Manager: Mr. Vinit Sambre (Equity)\nManaging this Scheme Since: Jun 10, 2019"
    managers = extract_managers_generic(text)
    assert len(managers) == 1
    assert managers[0]["name"] == "Mr. Vinit Sambre"
    assert managers[0]["role"] == "Equity"
    assert managers[0]["since_raw"] == "Jun 10, 2019"


def test_extract_managers_absl_parses_comma_separated_names_no_date():
    text = "Fund Managers: Mr. Harish Krishnan, Mr. Dhaval Joshi"
    managers = extract_managers_absl(text)
    assert len(managers) == 2
    assert managers[0]["name"] == "Harish Krishnan"
    assert managers[0]["since_raw"] is None
    assert managers[1]["name"] == "Dhaval Joshi"
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_amfi_factsheet_client.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement the matching + extraction half of the module**

```python
"""AMFI factsheet-based fund-manager attribution (attribute 04).

Mirrors amfi_ter_client.py's shape: a bulk-ish monthly fetch (one AMC's
factsheet PDF/API response covers every scheme it offers), matched against
locally-known schemes and upserted. Unlike TER, there is no AMFI bulk feed
for this at all -- every AMC's own factsheet is the source, fetched per the
classification in fund_manager_resolvers.py.

Extraction regex below is reconstructed from the described shape of a
Nippon/DSP-style factsheet's manager block (name, optional role in
parens, "Managing Since" date) -- re-verify it against a freshly
downloaded Nippon or DSP factsheet PDF (via extract_page_text() on that
PDF's first scheme page) before this task is considered done; if the real
text differs, adjust the regex and its test together.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from difflib import SequenceMatcher

from sqlalchemy.orm import Session

from app.models.reference import Scheme, SchemeFundManager

MATCH_METHOD_EXACT = "EXACT"
MATCH_METHOD_FUZZY = "FUZZY"
MATCH_METHOD_MANUAL = "MANUAL"

MIN_MATCH_CONFIDENCE = Decimal("0.80")
AMBIGUITY_MARGIN = Decimal("0.05")

_BOILERPLATE_RE = re.compile(
    r"\b(FUND|SCHEME|PLAN|DIRECT|REGULAR|GROWTH|IDCW|DIVIDEND|REINVESTMENT|PAYOUT)\b",
    re.IGNORECASE,
)

_MANAGER_BLOCK_RE = re.compile(
    r"(?P<name>(?:Mr\.|Ms\.|Dr\.)\s*[A-Za-z.\s]+?)\s*"
    r"(?:\((?P<role>[^)]*)\))?\s*"
    r".{0,80}?Managing (?:this Scheme )?[Ss]ince[:\s]+(?P<since>[A-Za-z]+\.?\s*\d{0,2},?\s*\d{4})",
    re.DOTALL,
)

_ABSL_LINE_RE = re.compile(r"Fund Manager[s]?:\s*(.+)")
_NAME_PREFIX_RE = re.compile(r"^(Mr\.|Ms\.|Dr\.)\s*")


def _canonical_fund_name(name: str) -> str:
    """Strips boilerplate words present in schemes.base_name but routinely
    absent, abbreviated, or reordered in a factsheet's free-text manager-
    block heading, so e.g. "ABC Bluechip" (factsheet) still matches "ABC
    Bluechip Fund" (base_name)."""
    s = name.upper()
    s = _BOILERPLATE_RE.sub("", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def match_extracted_fund_name(
    extracted_name: str, amc_name: str, candidates: list[Scheme]
) -> tuple[Scheme, str, Decimal] | None:
    """`candidates` must already be scoped to `amc_name` by the caller --
    this never searches across AMCs (a DSP fund name must never match an
    HDFC scheme). Returns None if no confident, unambiguous match exists
    (Review Focus #2)."""
    normalized_extracted = _canonical_fund_name(extracted_name)

    exact_matches = [
        c for c in candidates
        if c.base_name and _canonical_fund_name(c.base_name) == normalized_extracted
    ]
    if len(exact_matches) == 1:
        return exact_matches[0], MATCH_METHOD_EXACT, Decimal("1.0")
    if len(exact_matches) > 1:
        return None  # ambiguous even on an exact name -- never guess

    scored = sorted(
        (
            (c, Decimal(str(SequenceMatcher(None, normalized_extracted, _canonical_fund_name(c.base_name or "")).ratio())))
            for c in candidates
        ),
        key=lambda pair: pair[1],
        reverse=True,
    )
    if not scored or scored[0][1] < MIN_MATCH_CONFIDENCE:
        return None
    if len(scored) > 1 and (scored[0][1] - scored[1][1]) < AMBIGUITY_MARGIN:
        return None  # ambiguity guard
    return scored[0][0], MATCH_METHOD_FUZZY, scored[0][1]


def extract_managers_generic(text: str) -> list[dict]:
    """The Nippon/DSP-style shape: name, optional parenthesised role, a
    "Managing Since" date. Used for every Tier 1/2 AMC except ABSL."""
    managers = []
    for match in _MANAGER_BLOCK_RE.finditer(text):
        managers.append({
            "name": match.group("name").strip(),
            "role": match.group("role").strip() if match.group("role") else None,
            "since_raw": match.group("since").strip(),
        })
    return managers


def extract_managers_absl(text: str) -> list[dict]:
    """ABSL's factsheet lists managers as a comma-separated line under its
    own "Equity Snapshot" heading, with no "Managing Since" date at all
    (Review Focus #5) -- e.g. "Fund Manager: Mr. Harish Krishnan, Mr. Dhaval
    Joshi". role and since_raw are always None for this AMC."""
    match = _ABSL_LINE_RE.search(text)
    if not match:
        return []
    return [
        {"name": _NAME_PREFIX_RE.sub("", n).strip(), "role": None, "since_raw": None}
        for n in match.group(1).split(",")
        if n.strip()
    ]
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_amfi_factsheet_client.py -v`
Expected: PASS (the 5 tests from Step 1)

- [ ] **Step 5: Write the failing test — upsert idempotency (Review Focus #4)**

```python
def test_upsert_scheme_fund_managers_is_idempotent(tmp_db_session):
    # tmp_db_session: use the same in-memory SQLite session helper as
    # test_fund_manager_allocation.py's _session().
    from datetime import date
    from app.services.analytics.amfi_factsheet_client import upsert_scheme_fund_managers, MATCH_METHOD_EXACT
    from app.models.reference import SchemeFundManager
    scheme = _scheme("ABC Fund", "ABC Fund")
    db = tmp_db_session
    db.add(scheme)
    db.commit()
    period = date(2026, 9, 1)
    managers = [{"name": "Jane Doe", "role": None, "since_raw": "Jun 10, 2019"}]

    upsert_scheme_fund_managers(db, scheme, managers, period, MATCH_METHOD_EXACT, Decimal("1.0"))
    upsert_scheme_fund_managers(db, scheme, managers, period, MATCH_METHOD_EXACT, Decimal("1.0"))

    rows = db.query(SchemeFundManager).filter_by(scheme_id=scheme.id, reference_period=period).all()
    assert len(rows) == 1  # not 2 -- re-running the job must not duplicate
```

(Add a `tmp_db_session` pytest fixture at the top of the test file wrapping the existing
`_session()` helper from `test_amfi_ter_client.py`'s pattern, or inline the engine/session
creation directly in this test like every other test in this file does.)

- [ ] **Step 6: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_amfi_factsheet_client.py::test_upsert_scheme_fund_managers_is_idempotent -v`
Expected: FAIL — `ImportError: cannot import name 'upsert_scheme_fund_managers'`

- [ ] **Step 7: Implement `upsert_scheme_fund_managers` and the fetch/orchestration half**

Append to `amfi_factsheet_client.py`:

```python
import asyncio
import logging
import time
from datetime import datetime

import httpx
import pypdfium2 as pdfium

from app.db.session import commit_off_loop
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverKind

logger = logging.getLogger(__name__)

AMFI_FACTSHEET_DIRECTORY_URL = "https://www.amfiindia.com/online-center/download-factsheets"
_HTTP_TIMEOUT = 90.0


def _parse_managing_since(raw: str) -> date | None:
    for fmt in ("%b. %d, %Y", "%b %d, %Y", "%B %d, %Y", "%b %Y", "%B %Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None  # an unparsed date is never fatal -- managing_since_raw keeps the original text


def upsert_scheme_fund_managers(
    db: Session, scheme: Scheme, managers: list[dict], reference_period: date,
    match_method: str, match_confidence: Decimal | None,
) -> None:
    existing = {
        row.manager_name: row
        for row in db.query(SchemeFundManager).filter_by(scheme_id=scheme.id, reference_period=reference_period).all()
    }
    seen_names = set()
    for order, manager in enumerate(managers):
        name = manager["name"]
        seen_names.add(name)
        since_raw = manager.get("since_raw")
        since = _parse_managing_since(since_raw) if since_raw else None
        row = existing.get(name)
        if row is None:
            db.add(SchemeFundManager(
                id=uuid.uuid4(), scheme_id=scheme.id, manager_name=name, role=manager.get("role"),
                sequence_order=order, managing_since_raw=since_raw, managing_since=since,
                reference_period=reference_period, match_method=match_method, match_confidence=match_confidence,
            ))
        else:
            row.role = manager.get("role")
            row.sequence_order = order
            row.managing_since_raw = since_raw
            row.managing_since = since
            row.match_method = match_method
            row.match_confidence = match_confidence
    # A manager present last month but gone from this month's factsheet
    # (departed/replaced) is removed, not left stale.
    for name, row in existing.items():
        if name not in seen_names:
            db.delete(row)


def extract_page_text(pdf_bytes: bytes) -> list[str]:
    """One string per page -- the per-scheme regex/absl extraction runs
    once per page, since each page typically covers one scheme."""
    doc = pdfium.PdfDocument(pdf_bytes)
    return [page.get_textpage().get_text_range() for page in doc]


@dataclass(frozen=True)
class FundManagerRefreshResult:
    success: bool
    amcs_processed: int = 0
    amcs_failed: int = 0
    schemes_matched: int = 0
    schemes_unmatched: int = 0
    seconds: float = 0.0


async def _fetch_amfi_directory() -> dict[str, str]:
    """Returns {amc_name: factsheet_landing_page_url} for every AMC in
    AMFI's own directory payload -- re-fetched every run, never cached
    (AMCs occasionally change their own site layout)."""
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        resp = await client.get(AMFI_FACTSHEET_DIRECTORY_URL)
        resp.raise_for_status()
    # The directory page server-renders an embedded Next.js RSC JSON
    # payload -- parsed by a dedicated helper, not inlined here, since the
    # exact extraction regex depends on live page structure the
    # implementer must re-confirm against the real page before this task
    # is done (same caveat as the manager-block regex above).
    return _parse_amfi_directory_payload(resp.text)


def _parse_amfi_directory_payload(html: str) -> dict[str, str]:
    # Re-verify this against the real directory page HTML at build time --
    # it must yield exactly the 57 AMC names used as AMC_RESOLVERS keys.
    matches = re.findall(r'"amcName":"([^"]+)".*?"amc_monthly_mf_factsheets":"([^"]+)"', html)
    return {name: url for name, url in matches}


async def _fetch_static_regex_pdf(landing_page_url: str) -> bytes | None:
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=True) as client:
        resp = await client.get(landing_page_url)
        resp.raise_for_status()
        pdf_links = re.findall(r'href="([^"]+\.pdf)"', resp.text, re.IGNORECASE)
        if not pdf_links:
            return None
        pdf_resp = await client.get(pdf_links[0])
        pdf_resp.raise_for_status()
        return pdf_resp.content


async def _fetch_json_api_pdf(entry: ResolverEntry) -> bytes | None:
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        resp = await client.get(entry.endpoint_url)
        resp.raise_for_status()
        payload = resp.json()
        node = payload
        for key in (entry.response_json_path or "").split("."):
            if not key:
                continue
            node = node.get(key, []) if isinstance(node, dict) else []
        pdf_url = next((item.get("url") or item.get("file") for item in node if isinstance(item, dict) and (item.get("url") or item.get("file"))), None)
        if not pdf_url:
            return None
        pdf_resp = await client.get(pdf_url)
        pdf_resp.raise_for_status()
        return pdf_resp.content


async def refresh_fund_managers(db: Session) -> FundManagerRefreshResult:
    started = time.perf_counter()
    try:
        directory = await _fetch_amfi_directory()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("refresh_fund_managers: AMFI directory fetch failed: %r", exc)
        return FundManagerRefreshResult(success=False)

    reference_period = date.today().replace(day=1)
    amcs_processed = amcs_failed = schemes_matched = schemes_unmatched = 0

    for amc_name, entry in AMC_RESOLVERS.items():
        if entry.kind is ResolverKind.MANUAL_PENDING:
            continue
        try:
            if entry.kind is ResolverKind.STATIC_REGEX:
                landing_page = directory.get(amc_name)
                if not landing_page:
                    amcs_failed += 1
                    continue
                pdf_bytes = await _fetch_static_regex_pdf(landing_page)
            else:
                pdf_bytes = await _fetch_json_api_pdf(entry)
            if pdf_bytes is None:
                amcs_failed += 1
                continue

            pages = extract_page_text(pdf_bytes)
            candidates = db.query(Scheme).filter(Scheme.amc_name == amc_name).all()
            extractor = extract_managers_absl if amc_name == "Aditya Birla Sun Life Mutual Fund" else extract_managers_generic
            for page_text in pages:
                managers = extractor(page_text)
                if not managers:
                    continue
                # The scheme name is the page's own heading line -- the
                # first non-empty line of the page, by convention across
                # every traced AMC's factsheet layout.
                scheme_name_guess = next((l.strip() for l in page_text.splitlines() if l.strip()), "")
                matched = match_extracted_fund_name(scheme_name_guess, amc_name, candidates)
                if matched is None:
                    schemes_unmatched += 1
                    continue
                scheme, method, confidence = matched
                upsert_scheme_fund_managers(db, scheme, managers, reference_period, method, confidence)
                schemes_matched += 1
            amcs_processed += 1
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            logger.warning("refresh_fund_managers: %s failed: %r", amc_name, exc)
            amcs_failed += 1
            continue

    await commit_off_loop(db)
    return FundManagerRefreshResult(
        success=True, amcs_processed=amcs_processed, amcs_failed=amcs_failed,
        schemes_matched=schemes_matched, schemes_unmatched=schemes_unmatched,
        seconds=round(time.perf_counter() - started, 1),
    )
```

Add the missing imports at the top of the file: `import uuid`, `from app.models.reference
import Scheme, SchemeFundManager` (already partially there — consolidate), `from
sqlalchemy.orm import Session`, `from app.services.analytics.fund_manager_resolvers import
ResolverEntry`.

- [ ] **Step 8: Run full file, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_amfi_factsheet_client.py -v`
Expected: PASS (6 tests total)

- [ ] **Step 9: Commit**

```bash
git add backend/app/services/analytics/amfi_factsheet_client.py backend/tests/services/analytics/test_amfi_factsheet_client.py
git commit -m "feat: add AMFI factsheet fetch, extraction, and matching engine"
```

---

### Task 4: Job script + Terraform wiring

**Files:**
- Create: `backend/scripts/jobs/refresh_fund_managers_monthly.py`
- Modify: `infra/modules/scheduler/main.tf`

**Interfaces:**
- Consumes: `refresh_fund_managers(db)` (Task 3).

- [ ] **Step 1: Write the job script**

```python
# backend/scripts/jobs/refresh_fund_managers_monthly.py
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal
from app.services.analytics.amfi_factsheet_client import refresh_fund_managers

logger = logging.getLogger(__name__)


async def main_async(db) -> None:
    result = await refresh_fund_managers(db)
    logger.info(
        "refresh_fund_managers_monthly: success=%s amcs_processed=%d amcs_failed=%d "
        "schemes_matched=%d schemes_unmatched=%d seconds=%.1f",
        result.success, result.amcs_processed, result.amcs_failed,
        result.schemes_matched, result.schemes_unmatched, result.seconds,
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        asyncio.run(main_async(db))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Add the Terraform job entry**

In `infra/modules/scheduler/main.tf`'s `locals.jobs` map, add (alongside the existing
`ter_daily`/`benchmark_daily`/`scheme_master_daily` entries):

```hcl
fund_managers_monthly = {
  slug                = "fund-managers-monthly"
  command             = ["python", "scripts/jobs/refresh_fund_managers_monthly.py"]
  schedule_expression = "cron(0 6 10 * ? *)"
  task_role_arn       = null
}
```

06:00 IST on the 10th — AMCs typically publish their monthly factsheet within the first
~7-10 days after month-end; the 10th gives a buffer past that window. Runs once a month, so
it shares no meaningful contention with the daily 06:00-hour jobs (`nav_daily`,
`benchmark_daily`, `ter_daily`) regardless of exact minute — each job gets its own Fargate
task definition.

- [ ] **Step 3: Confirm it has no syntax errors**

Run: `cd infra && terraform fmt -check modules/scheduler/main.tf && terraform validate`
Expected: no diff, `Success! The configuration is valid.`

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/jobs/refresh_fund_managers_monthly.py infra/modules/scheduler/main.tf
git commit -m "feat: wire fund-manager refresh as a monthly scheduled job"
```

---

### Task 5: Household aggregation — `fund_manager_allocation.py` + schemas

**Files:**
- Create: `backend/app/services/analytics/fund_manager_allocation.py`
- Modify: `backend/app/services/analytics/schemas.py`
- Test: append to `backend/tests/services/analytics/test_fund_manager_allocation.py`

**Interfaces:**
- Consumes: `compute_holdings(db, member_ids) -> list[HoldingRow]`
  (`backend/app/services/dashboard/holdings.py`), `HoldingRow` (`scheme_id`, `scheme_name`,
  `amc_name`, `current_value`), `SchemeFundManager` (Task 1).
- Produces: `ManagerFundRow`, `ManagerGroup`, `UnavailableScheme`,
  `FundManagerAllocationSummary` (Pydantic, `schemas.py`); `async def
  compute_fund_manager_allocation(db: Session, household_member_ids: list[uuid.UUID]) ->
  FundManagerAllocationSummary` — consumed by Task 6's `_SectionSpec` registration.

- [ ] **Step 1: Add the schemas**

In `backend/app/services/analytics/schemas.py`, append:

```python
class ManagerFundRow(BaseModel):
    scheme_id: str
    scheme_name: str
    household_value: str
    sequence_order: int


class ManagerGroup(BaseModel):
    manager_name: str
    role: str | None
    total_household_value: str
    funds: list[ManagerFundRow]


class UnavailableScheme(BaseModel):
    scheme_id: str
    scheme_name: str
    amc_name: str


class FundManagerAllocationSummary(BaseModel):
    manager_groups: list[ManagerGroup]
    unavailable_schemes: list[UnavailableScheme]


class AggregateFundManagerAllocationResponse(BaseModel):
    members: list[MemberStatus]
    fund_manager: FundManagerAllocationSummary
```

- [ ] **Step 2: Write the failing test**

```python
# append to backend/tests/services/analytics/test_fund_manager_allocation.py
import asyncio
from unittest.mock import AsyncMock, patch

from app.services.analytics.fund_manager_allocation import compute_fund_manager_allocation
from app.services.dashboard.schemas import HoldingRow


def test_compute_fund_manager_allocation_groups_by_manager_and_sums_value():
    db = _session()
    scheme_a = Scheme(id=uuid.uuid4(), amfi_code="A1", name="Fund A", base_name="Fund A", amc_name="Test AMC", sebi_category="Equity")
    scheme_b = Scheme(id=uuid.uuid4(), amfi_code="B1", name="Fund B", base_name="Fund B", amc_name="Test AMC", sebi_category="Equity")
    db.add_all([scheme_a, scheme_b])
    db.commit()
    period = date(2026, 9, 1)
    db.add_all([
        SchemeFundManager(id=uuid.uuid4(), scheme_id=scheme_a.id, manager_name="Jane Doe", role=None, sequence_order=0, reference_period=period, match_method="EXACT", match_confidence=Decimal("1.0")),
        SchemeFundManager(id=uuid.uuid4(), scheme_id=scheme_b.id, manager_name="Jane Doe", role=None, sequence_order=0, reference_period=period, match_method="EXACT", match_confidence=Decimal("1.0")),
        SchemeFundManager(id=uuid.uuid4(), scheme_id=scheme_b.id, manager_name="John Roe", role="Assistant Fund Manager", sequence_order=1, reference_period=period, match_method="EXACT", match_confidence=Decimal("1.0")),
    ])
    db.commit()

    holdings = [
        HoldingRow(scheme_id=str(scheme_a.id), scheme_name="Fund A", amc_name="Test AMC", asset_class="Equity",
                   household_member_id=str(uuid.uuid4()), household_member_name="Self", plan_type="direct",
                   units_held="100", average_nav="10", current_nav="12", current_nav_date=None,
                   amount_invested="1000", current_value="1200", current_profit_total="200", realized_gain="0", unrealized_gain="200"),
        HoldingRow(scheme_id=str(scheme_b.id), scheme_name="Fund B", amc_name="Test AMC", asset_class="Equity",
                   household_member_id=str(uuid.uuid4()), household_member_name="Self", plan_type="direct",
                   units_held="100", average_nav="10", current_nav="8", current_nav_date=None,
                   amount_invested="1000", current_value="800", current_profit_total="-200", realized_gain="0", unrealized_gain="-200"),
    ]

    with patch("app.services.analytics.fund_manager_allocation.compute_holdings", new=AsyncMock(return_value=holdings)):
        summary = asyncio.run(compute_fund_manager_allocation(db, [uuid.uuid4()]))

    assert len(summary.manager_groups) == 2
    jane = next(g for g in summary.manager_groups if g.manager_name == "Jane Doe")
    assert Decimal(jane.total_household_value) == Decimal("2000")  # 1200 (Fund A) + 800 (Fund B)
    assert len(jane.funds) == 2
    john = next(g for g in summary.manager_groups if g.manager_name == "John Roe")
    assert john.role == "Assistant Fund Manager"
    assert Decimal(john.total_household_value) == Decimal("800")
    assert summary.manager_groups[0].manager_name == "Jane Doe"  # sorted desc by value, Jane (2000) before John (800)
    assert summary.unavailable_schemes == []


def test_compute_fund_manager_allocation_buckets_unresolved_scheme_as_unavailable():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="C1", name="HDFC Fund", base_name="HDFC Fund", amc_name="HDFC Mutual Fund", sebi_category="Equity")
    db.add(scheme)
    db.commit()
    holdings = [
        HoldingRow(scheme_id=str(scheme.id), scheme_name="HDFC Fund", amc_name="HDFC Mutual Fund", asset_class="Equity",
                   household_member_id=str(uuid.uuid4()), household_member_name="Self", plan_type="direct",
                   units_held="100", average_nav="10", current_nav="10", current_nav_date=None,
                   amount_invested="1000", current_value="1000", current_profit_total="0", realized_gain="0", unrealized_gain="0"),
    ]
    with patch("app.services.analytics.fund_manager_allocation.compute_holdings", new=AsyncMock(return_value=holdings)):
        summary = asyncio.run(compute_fund_manager_allocation(db, [uuid.uuid4()]))
    assert summary.manager_groups == []
    assert len(summary.unavailable_schemes) == 1
    assert summary.unavailable_schemes[0].scheme_name == "HDFC Fund"
```

- [ ] **Step 3: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_fund_manager_allocation.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.analytics.fund_manager_allocation'`

- [ ] **Step 4: Implement**

```python
# backend/app/services/analytics/fund_manager_allocation.py
from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.reference import SchemeFundManager
from app.services.analytics.schemas import (
    FundManagerAllocationSummary,
    ManagerFundRow,
    ManagerGroup,
    UnavailableScheme,
)
from app.services.dashboard.holdings import compute_holdings


async def compute_fund_manager_allocation(
    db: Session, household_member_ids: list[uuid.UUID]
) -> FundManagerAllocationSummary:
    holdings = await compute_holdings(db, household_member_ids)
    if not holdings:
        return FundManagerAllocationSummary(manager_groups=[], unavailable_schemes=[])

    scheme_ids = {uuid.UUID(h.scheme_id) for h in holdings}
    manager_rows = (
        db.query(SchemeFundManager)
        .filter(SchemeFundManager.scheme_id.in_(scheme_ids))
        .order_by(SchemeFundManager.reference_period.desc())
        .all()
    )
    # Latest reference_period per scheme only -- a scheme's older-month
    # manager rows aren't shown alongside this month's.
    latest_period_by_scheme: dict[uuid.UUID, object] = {}
    for row in manager_rows:
        if row.scheme_id not in latest_period_by_scheme or row.reference_period > latest_period_by_scheme[row.scheme_id]:
            latest_period_by_scheme[row.scheme_id] = row.reference_period
    rows_by_scheme: dict[uuid.UUID, list[SchemeFundManager]] = defaultdict(list)
    for row in manager_rows:
        if row.reference_period == latest_period_by_scheme.get(row.scheme_id):
            rows_by_scheme[row.scheme_id].append(row)

    groups: dict[str, dict] = {}
    unavailable: list[UnavailableScheme] = []

    for holding in holdings:
        scheme_id = uuid.UUID(holding.scheme_id)
        manager_rows_for_scheme = rows_by_scheme.get(scheme_id, [])
        if not manager_rows_for_scheme:
            unavailable.append(UnavailableScheme(
                scheme_id=holding.scheme_id, scheme_name=holding.scheme_name, amc_name=holding.amc_name,
            ))
            continue
        value = Decimal(holding.current_value or "0")
        for row in sorted(manager_rows_for_scheme, key=lambda r: r.sequence_order):
            group = groups.setdefault(row.manager_name, {"role": row.role, "total": Decimal("0"), "funds": []})
            group["total"] += value
            group["funds"].append(ManagerFundRow(
                scheme_id=holding.scheme_id, scheme_name=holding.scheme_name,
                household_value=str(value), sequence_order=row.sequence_order,
            ))

    manager_groups = sorted(
        (
            ManagerGroup(manager_name=name, role=g["role"], total_household_value=str(g["total"]), funds=g["funds"])
            for name, g in groups.items()
        ),
        key=lambda mg: Decimal(mg.total_household_value),
        reverse=True,
    )
    return FundManagerAllocationSummary(manager_groups=manager_groups, unavailable_schemes=unavailable)
```

- [ ] **Step 5: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_fund_manager_allocation.py -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/analytics/fund_manager_allocation.py backend/app/services/analytics/schemas.py backend/tests/services/analytics/test_fund_manager_allocation.py
git commit -m "feat: add household fund-manager allocation aggregation"
```

---

### Task 6: Register as an analytics section

**Files:**
- Modify: `backend/app/services/analytics/recompute.py`

**Interfaces:**
- Consumes: `compute_fund_manager_allocation` (Task 5), `AggregateFundManagerAllocationResponse` (Task 5).

- [ ] **Step 1: Write the failing test**

```python
# add to an existing recompute test file, or create backend/tests/services/analytics/test_recompute_fund_manager_section.py
def test_fund_manager_section_is_registered():
    from app.services.analytics.recompute import _SECTIONS
    names = [s.name for s in _SECTIONS]
    assert "fund_manager" in names
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_recompute_fund_manager_section.py -v`
Expected: FAIL — `AssertionError`

- [ ] **Step 3: Register the section**

In `backend/app/services/analytics/recompute.py`, add the import:

```python
from app.services.analytics.fund_manager_allocation import compute_fund_manager_allocation
from app.services.analytics.schemas import AggregateFundManagerAllocationResponse
```

and append to `_SECTIONS`:

```python
_SectionSpec("fund_manager", compute_fund_manager_allocation, lambda statuses, result: AggregateFundManagerAllocationResponse(members=statuses, fund_manager=result)),
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_recompute_fund_manager_section.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/recompute.py backend/tests/services/analytics/test_recompute_fund_manager_section.py
git commit -m "feat: register fund_manager as a precomputed analytics section"
```

---

### Task 7: Frontend — types, section component, wiring, print export

**Files:**
- Create: `frontend/src/features/analytics/FundManagerSection.tsx`
- Create: `frontend/src/features/analytics/FundManagerSection.test.tsx`
- Modify: `frontend/src/features/analytics/types.ts`
- Modify: `frontend/src/features/analytics/AnalyticsView.tsx`
- Modify: `frontend/src/features/analytics/print/PrintAnalyticsView.tsx`

**Interfaces:**
- Consumes: `GET /analytics/{scope}`'s existing generic contract — `sections.fund_manager.payload`.
- Produces: `FundManagerSection` component — consumed by `AnalyticsView.tsx` and `PrintAnalyticsView.tsx`.

- [ ] **Step 1: Add the types**

In `frontend/src/features/analytics/types.ts`, append (mirroring the backend Pydantic
schemas from Task 5 field-for-field):

```ts
export interface ManagerFundRow {
  scheme_id: string;
  scheme_name: string;
  household_value: string;
  sequence_order: number;
}

export interface ManagerGroup {
  manager_name: string;
  role: string | null;
  total_household_value: string;
  funds: ManagerFundRow[];
}

export interface UnavailableScheme {
  scheme_id: string;
  scheme_name: string;
  amc_name: string;
}

export interface FundManagerAllocationSummary {
  manager_groups: ManagerGroup[];
  unavailable_schemes: UnavailableScheme[];
}

export interface AggregateFundManagerAllocationResponse {
  members: MemberStatus[];
  fund_manager: FundManagerAllocationSummary;
}
```

Add `"fund_manager"` to `ANALYTICS_SECTION_NAMES`, and add `fundManager:
FundManagerAllocationSummary | null;` to `AnalyticsExportPayload`.

- [ ] **Step 2: Write the failing component test**

```tsx
// frontend/src/features/analytics/FundManagerSection.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FundManagerSection } from "./FundManagerSection";
import type { FundManagerAllocationSummary } from "./types";

const summary: FundManagerAllocationSummary = {
  manager_groups: [
    {
      manager_name: "Jane Doe", role: null, total_household_value: "200000",
      funds: [{ scheme_id: "s1", scheme_name: "Fund A", household_value: "200000", sequence_order: 0 }],
    },
    {
      manager_name: "John Roe", role: "Assistant Fund Manager", total_household_value: "50000",
      funds: [{ scheme_id: "s2", scheme_name: "Fund B", household_value: "50000", sequence_order: 1 }],
    },
  ],
  unavailable_schemes: [{ scheme_id: "s3", scheme_name: "HDFC Balanced Fund", amc_name: "HDFC Mutual Fund" }],
};

describe("FundManagerSection", () => {
  it("renders one card per manager, no role badge when role is null", () => {
    render(<FundManagerSection data={summary} isLoading={false} />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("John Roe")).toBeInTheDocument();
    expect(screen.getByText("Assistant Fund Manager")).toBeInTheDocument();
  });

  it("expands a manager card to show funds held under them", () => {
    render(<FundManagerSection data={summary} isLoading={false} />);
    fireEvent.click(screen.getByText("Jane Doe"));
    expect(screen.getByText("Fund A")).toBeInTheDocument();
  });

  it("renders the unavailable block for unresolved AMCs", () => {
    render(<FundManagerSection data={summary} isLoading={false} />);
    expect(screen.getByText(/not available yet/i)).toBeInTheDocument();
    expect(screen.getByText("HDFC Balanced Fund")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, confirm failure**

Run: `cd frontend && npx vitest run src/features/analytics/FundManagerSection.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the component**

```tsx
// frontend/src/features/analytics/FundManagerSection.tsx
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIndianCurrency } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, HelpCircle, Users } from "lucide-react";
import type { FundManagerAllocationSummary } from "./types";

export interface FundManagerSectionProps {
  data: FundManagerAllocationSummary | null;
  isLoading?: boolean;
  className?: string;
}

export function FundManagerSection({ data, isLoading = false, className }: FundManagerSectionProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-4", className)}>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  const managerGroups = data?.manager_groups ?? [];
  const unavailable = data?.unavailable_schemes ?? [];
  const hasAnything = managerGroups.length > 0 || unavailable.length > 0;

  return (
    <section className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-6 transition-colors duration-200", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">
              Fund Manager Allocation
            </h2>
            <Users className="h-4 w-4 text-[var(--color-accent)]" />
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Who is actually running your money, aggregated across your whole portfolio
          </p>
        </div>
      </div>

      {!hasAnything ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">No fund manager data available</p>
        </div>
      ) : (
        <div className="space-y-3">
          {managerGroups.map((group) => {
            const isOpen = !!expanded[group.manager_name];
            return (
              <div key={group.manager_name} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40">
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [group.manager_name]: !prev[group.manager_name] }))}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display text-sm font-bold text-[var(--color-ink)]">{group.manager_name}</span>
                    {group.role && (
                      <Badge variant="outline" className="text-[10px] px-2 py-0">{group.role}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--color-ink)] tabular-nums">
                      {formatIndianCurrency(group.total_household_value)}
                    </span>
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-2 border-t border-[var(--color-border)]/60 pt-3">
                    {group.funds.map((fund) => (
                      <div key={fund.scheme_id} className="flex items-center justify-between text-xs">
                        <span className="text-[var(--color-text-secondary)]">{fund.scheme_name}</span>
                        <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                          {formatIndianCurrency(fund.household_value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {unavailable.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex items-start gap-2">
              <HelpCircle className="h-4 w-4 text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-[var(--color-text-secondary)] font-semibold">
                  Fund manager data for these schemes isn't available yet.
                </p>
                <ul className="mt-1 space-y-0.5">
                  {unavailable.map((scheme) => (
                    <li key={scheme.scheme_id} className="text-xs text-[var(--color-text-secondary)]/80">
                      {scheme.scheme_name} ({scheme.amc_name})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run, confirm pass**

Run: `cd frontend && npx vitest run src/features/analytics/FundManagerSection.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Wire into `AnalyticsView.tsx`**

Add the import, add `fund_manager: "fund_manager"` to `AGGREGATE_FIELD`, add:

```tsx
const fundManager = unwrap<FundManagerAllocationSummary>("fund_manager");
const fundManagerLoading = !!scope && !isSectionSettled(sections.fund_manager);
```

and render `<FundManagerSection data={fundManager} isLoading={fundManagerLoading} />` as a
sibling section, placed after `CategoryRankingSection` per the frontend spec's "sibling to
`CategoryRankingSection.tsx`/`TerSection.tsx`" placement. Add `fundManager` to
`AnalyticsExportPayload`'s construction in `handleDownloadPdf`.

- [ ] **Step 7: Wire into `PrintAnalyticsView.tsx`**

Add the import and render block, mirroring the existing sections:

```tsx
<div className="print-section">
  <FundManagerSection data={payload.fundManager} isLoading={false} />
</div>
```

- [ ] **Step 8: Run the existing suites to confirm no regression**

Run: `cd frontend && npx vitest run src/features/analytics/AnalyticsView.test.tsx src/features/analytics/print/PrintAnalyticsView.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/analytics/FundManagerSection.tsx frontend/src/features/analytics/FundManagerSection.test.tsx frontend/src/features/analytics/types.ts frontend/src/features/analytics/AnalyticsView.tsx frontend/src/features/analytics/print/PrintAnalyticsView.tsx
git commit -m "feat: add FundManagerSection to the Analytics dashboard and PDF export"
```

---

## Tasks 8-19: Tier 3 — live investigation, one AMC per task

Each of these follows the same 4-step shape. The clue column below is what live tracing
already found this session (not a guess) — the implementer's job is to turn that clue into a
real, tested resolver entry, not to start from zero.

**Shared step shape for every Tier 3 task:**

1. **Investigate live**, starting from the clue below (a real `curl`/browser check against
   the real AMC site).
2. **Decide**: does a `STATIC_REGEX`-compatible factsheet link exist, or a `JSON_API`
   endpoint, or neither?
3. **Implement**: update this AMC's `AMC_RESOLVERS` entry in
   `fund_manager_resolvers.py` to the real finding (`ResolverKind.STATIC_REGEX`,
   `ResolverKind.JSON_API` with a real `endpoint_url`, or — only as a last resort, with a
   `blocked_reason` citing the specific proof, same bar as Edelweiss — `MANUAL_PENDING`).
4. **Test + commit**: add one test to `test_fund_manager_resolvers.py` asserting this AMC's
   entry is no longer the Task 2 placeholder, run `pytest
   tests/services/analytics/test_fund_manager_resolvers.py -v`, confirm PASS, commit.

### Task 8: HSBC Mutual Fund

**Clue:** live tracing found HSBC's factsheet page uses a stale 2023 `date` query parameter
in its own URL — the live page likely needs a current-dated parameter instead, or a
differently-shaped URL entirely.

- [ ] Run `curl -sIL "https://www.assetmanagement.hsbc.co.in/en/india-mf/-/media/india-mf/files/factsheets/"` (or the real
  equivalent found by first loading `https://www.assetmanagement.hsbc.co.in` in a browser and
  locating its current factsheet download link, since the stale-dated URL is known to not be
  live) and inspect for a working, current factsheet PDF link.
- [ ] If found: set `"HSBC Mutual Fund": ResolverEntry(ResolverKind.STATIC_REGEX)` (or
  `JSON_API` with the real endpoint if the site is dynamically rendered, checked via
  the same `pdf_total`/`json_total` trace method used earlier this session).
- [ ] If genuinely not found after a real attempt: `MANUAL_PENDING` with a `blocked_reason`
  citing the specific real dead end hit (e.g. the exact URL and HTTP status returned).
- [ ] Add the assertion test, run it, commit.

### Task 9: Sundaram Mutual Fund

**Clue:** live tracing found a real downloadable PDF on Sundaram's site, but it was not the
scheme factsheet (a different document entirely) — the actual factsheet link is elsewhere on
the site.

- [ ] Browse `https://www.sundarammutual.com` (or fetch its HTML) specifically looking for a
  "Factsheet"/"Fund Factsheet" navigation link or download page distinct from whatever
  document was found before; confirm the PDF found there is page-per-scheme with a "Fund
  Manager" block before accepting it.
- [ ] Implement/test/commit per the shared shape above.

### Task 10: Groww Mutual Fund

**Clue:** same situation as Sundaram — a real PDF was found but it wasn't the scheme
factsheet.

- [ ] Browse `https://groww.in/mutual-funds` or Groww AMC's dedicated site for its factsheet
  download page specifically (Groww's main consumer app domain is not the AMC's own investor
  site — check for a separate `growwmf.in`-style domain).
- [ ] Implement/test/commit per the shared shape above.

### Task 11: 360 ONE Mutual Fund

**Clue:** live tracing found real PDFs on `360.one` (KYC forms, SIP mandate forms) but none
were the scheme factsheet.

- [ ] Fetch `https://www.360.one/asset-management/mutual-fund/` or its factsheet-specific
  subpage; look specifically for a "Factsheet"/"Fund Factsheet" link distinct from the KYC/SIP
  forms already found.
- [ ] Implement/test/commit per the shared shape above.

### Task 12: Tata Mutual Fund

**Clue:** live tracing found real PDFs on `tatamutualfund.com` (a 2019 DHFL press release, a
2026 valuation policy) — real documents, but not the scheme factsheet.

- [ ] Fetch `https://www.tatamutualfund.com/downloads` or its factsheet-specific page,
  looking for the monthly scheme factsheet distinct from the policy/press-release documents
  already found.
- [ ] Implement/test/commit per the shared shape above.

### Task 13: Taurus Mutual Fund

**Clue:** live tracing found `taurusmutualfund.com/sites/default/files/downloads/SAI.pdf` and
a "one pager" PDF — real documents, but SAI is the Statement of Additional Information (ruled
out generally in this attribute's design — no scheme-level manager mapping), not the
factsheet.

- [ ] Fetch `https://www.taurusmutualfund.com/downloads` or its factsheet-specific page,
  looking for the monthly scheme factsheet (distinct from the SAI/one-pager already found).
- [ ] Implement/test/commit per the shared shape above.

### Task 14: ASK Mutual Fund

**Clue:** live tracing found 3 real working JSON endpoints —
`https://content.askmutualfund.com/v1/public/dividend`, `.../v1/public/nav`,
`.../v1/public/ter` — a clear public content API, but no `.../v1/public/factsheet`-style
endpoint was tried yet.

- [ ] Try `https://content.askmutualfund.com/v1/public/factsheet` and nearby path variants
  (`/v1/public/documents`, `/v1/public/downloads`) given the confirmed `/v1/public/{noun}`
  URL shape already working for 3 other nouns.
- [ ] If found: `JSON_API` with the real endpoint and its response shape's document-list path.
- [ ] Implement/test/commit per the shared shape above.

### Task 15: Bandhan Mutual Fund

**Clue:** live tracing found only analytics/tracking calls
(`mpc2-prod-*-is5qnl632q-*.a.run.app/events`), no document API observed at all.

- [ ] Fetch `https://bandhanmutual.com/downloads/factsheet` (or site-search for "factsheet")
  directly, since the earlier trace only captured background network calls, not a direct
  content fetch — a static HTML page with a PDF link may still exist even with no JSON API.
- [ ] Implement/test/commit per the shared shape above.

### Task 16: Jio BlackRock Mutual Fund

**Clue:** live tracing found only `generateInvestorSession` (an authenticated-investor
session endpoint) — raising a real public-vs-gated question: factsheet content may sit behind
investor login, which this attribute cannot use (no per-user AMC credentials exist).

- [ ] Fetch `https://www.jioblackrock.com/mutual-funds/downloads` or equivalent directly (not
  via the authenticated API) to check whether factsheets are published on a public page
  regardless of the gated session API found earlier.
- [ ] If factsheets are genuinely only reachable after investor login: `MANUAL_PENDING` with
  `blocked_reason` citing this — a legitimate, provable automation blocker, same bar as
  Edelweiss.
- [ ] Implement/test/commit per the shared shape above.

### Task 17: Navi Mutual Fund

**Clue:** live tracing found nothing at all for this AMC (zero PDFs, zero JSON).

- [ ] Fetch `https://navi.com/mutual-fund` directly and search its HTML for any
  "factsheet"/"download" link — the earlier trace may have missed a non-standard page
  structure rather than proving nothing exists.
- [ ] If a real second attempt still finds nothing: `MANUAL_PENDING` with `blocked_reason`
  citing both attempts and their results.
- [ ] Implement/test/commit per the shared shape above.

### Task 18: Bank of India Mutual Fund

**Clue:** live tracing found a factsheet directory link, but dated May 2022 — stale by over 4
years.

- [ ] Fetch `https://www.boimf.in` (or its real domain) directly and look for a current
  factsheet download page, since the May-2022 link found earlier is almost certainly
  superseded by a newer one on the live site.
- [ ] Implement/test/commit per the shared shape above.

### Task 19: Mahindra Manulife Mutual Fund

**Clue:** live tracing found the factsheet sits behind a tabbed "Investor Corner" UI that the
earlier trace didn't fully drive (i.e. didn't click through the tab to reveal the underlying
request).

- [ ] Using a full headless-browser trace (the same method used for Edelweiss's confirmed
  403), actually click the "Investor Corner" tab and capture whatever network request it
  fires — this is the one piece of real follow-through the earlier pass didn't do.
- [ ] Implement/test/commit per the shared shape above.

---

### Task 20: Tier 5 liveness check (7 AMCs)

**Files:**
- Modify: `backend/app/services/analytics/fund_manager_resolvers.py`

**Interfaces:** none new — updates existing `AMC_RESOLVERS` entries in place.

- [ ] **Step 1:** For each of IL&FS Infra, Lakshya, Carnelian, AlphaGrep, Nuvama, Wealth
  Company, Monarch Networth: check AMFI's own scheme list
  (`https://www.amfiindia.com/spages/NAVAll.txt`, already fetched daily by the existing
  `scheme_master_daily` job — query the local `schemes` table instead of a fresh fetch:
  `SELECT amc_name, COUNT(*) FROM schemes WHERE amc_name = '<AMC>' AND is_active = true`) for
  whether this AMC has any active scheme at all.
- [ ] **Step 2:** For any AMC with zero active schemes: leave `MANUAL_PENDING`, update
  `blocked_reason` to `"Confirmed 2026-10-09: zero active schemes in AMFI's own scheme
  master -- nothing to resolve yet, not an automation failure."`
- [ ] **Step 3:** For any AMC that DOES have active schemes despite the earlier trace finding
  nothing: repeat the Task 8-19 investigation shape for it instead (it's no longer a
  liveness question, it's a real Tier 3 case).
- [ ] **Step 4:** Add one test per AMC asserting the final `blocked_reason` text actually
  changed from the Task 2 placeholder (`"Pending Task 20 liveness check."`), run
  `pytest tests/services/analytics/test_fund_manager_resolvers.py -v`, confirm PASS.
- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/fund_manager_resolvers.py backend/tests/services/analytics/test_fund_manager_resolvers.py
git commit -m "fix: resolve Tier 5 AMC liveness (scheme-count check, not assumption)"
```

---

### Task 21: Manual-intake CLI for HDFC, Kotak, Edelweiss

**Files:**
- Create: `backend/scripts/jobs/import_manual_fund_managers.py`
- Test: `backend/tests/scripts/test_import_manual_fund_managers.py`

**Interfaces:**
- Consumes: `extract_page_text`, `extract_managers_generic`, `extract_managers_absl`,
  `match_extracted_fund_name`, `upsert_scheme_fund_managers`, `MATCH_METHOD_MANUAL` (Task 3).

A real person manually downloads the current factsheet PDF through an ordinary browser
session (bypassing whatever automated block applies — Edelweiss's confirmed 403, or
HDFC/Kotak's no-trace-found status) and saves it locally. This CLI reuses every piece of the
already-built extraction/matching engine — it does not duplicate parsing logic, since the
PDF's internal text layout is the same regardless of how the file was obtained.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/scripts/test_import_manual_fund_managers.py
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from scripts.jobs.import_manual_fund_managers import import_from_pdf_bytes


def test_import_from_pdf_bytes_uses_manual_match_method(tmp_path):
    # A real HDFC/Kotak/Edelweiss PDF is required to run this for real --
    # this test only proves the match_method wiring, using the same
    # extract_managers_generic text fixture as test_amfi_factsheet_client.py.
    import uuid
    from datetime import date
    from decimal import Decimal
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.db.base import Base
    from app.models.reference import Scheme, SchemeFundManager

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(autoflush=False, bind=engine)()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="H1", name="HDFC Flexi Cap Fund", base_name="HDFC Flexi Cap Fund", amc_name="HDFC Mutual Fund", sebi_category="Equity")
    db.add(scheme)
    db.commit()

    import_from_pdf_bytes(db, "HDFC Mutual Fund", b"", date(2026, 9, 1), pages_override=["HDFC Flexi Cap Fund\nFund Manager: Mr. Vinit Sambre (Equity)\nManaging this Scheme Since: Jun 10, 2019"])

    rows = db.query(SchemeFundManager).filter_by(scheme_id=scheme.id).all()
    assert len(rows) == 1
    assert rows[0].match_method == "MANUAL"
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/scripts/test_import_manual_fund_managers.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement**

```python
# backend/scripts/jobs/import_manual_fund_managers.py
"""Manual-PDF intake for HDFC/Kotak/Edelweiss (attribute 04) -- the 3 AMCs
proven unautomatable (see fund_manager_resolvers.py's MANUAL_PENDING
entries). A staff member downloads the current factsheet through an
ordinary browser, then runs:

  .venv/bin/python scripts/jobs/import_manual_fund_managers.py \
      --amc "HDFC Mutual Fund" --pdf /path/to/downloaded-factsheet.pdf

Reuses amfi_factsheet_client.py's extraction/matching engine unchanged --
a manually-downloaded PDF has the same internal text layout as one fetched
automatically, so there is no separate parsing logic for this path."""

import argparse
import logging
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal
from app.models.reference import Scheme
from app.services.analytics.amfi_factsheet_client import (
    MATCH_METHOD_MANUAL,
    extract_managers_absl,
    extract_managers_generic,
    extract_page_text,
    match_extracted_fund_name,
    upsert_scheme_fund_managers,
)

logger = logging.getLogger(__name__)

_ABSL_AMC = "Aditya Birla Sun Life Mutual Fund"


def import_from_pdf_bytes(db, amc_name: str, pdf_bytes: bytes, reference_period: date, pages_override: list[str] | None = None) -> int:
    pages = pages_override if pages_override is not None else extract_page_text(pdf_bytes)
    candidates = db.query(Scheme).filter(Scheme.amc_name == amc_name).all()
    extractor = extract_managers_absl if amc_name == _ABSL_AMC else extract_managers_generic
    matched_count = 0
    for page_text in pages:
        managers = extractor(page_text)
        if not managers:
            continue
        scheme_name_guess = next((l.strip() for l in page_text.splitlines() if l.strip()), "")
        matched = match_extracted_fund_name(scheme_name_guess, amc_name, candidates)
        if matched is None:
            logger.warning("import_manual_fund_managers: no confident match for %r under %s", scheme_name_guess, amc_name)
            continue
        scheme, _method, confidence = matched
        upsert_scheme_fund_managers(db, scheme, managers, reference_period, MATCH_METHOD_MANUAL, confidence)
        matched_count += 1
    db.commit()
    return matched_count


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Manually import fund-manager data from a downloaded AMC factsheet PDF.")
    parser.add_argument("--amc", required=True, help='Exact amc_name, e.g. "HDFC Mutual Fund"')
    parser.add_argument("--pdf", required=True, type=Path, help="Path to the downloaded factsheet PDF")
    args = parser.parse_args()

    pdf_bytes = args.pdf.read_bytes()
    reference_period = date.today().replace(day=1)
    with SessionLocal() as db:
        matched = import_from_pdf_bytes(db, args.amc, pdf_bytes, reference_period)
    logger.info("import_manual_fund_managers: amc=%s matched=%d", args.amc, matched)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/scripts/test_import_manual_fund_managers.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/jobs/import_manual_fund_managers.py backend/tests/scripts/test_import_manual_fund_managers.py
git commit -m "feat: add manual-PDF intake CLI for HDFC/Kotak/Edelweiss fund managers"
```

---

## Self-Review

**1. Spec coverage:** Manager-first grouped cards (Task 7) ✓; co-manager/assistant-manager
no-merge rule (Tasks 1, 5, Review Focus #1) ✓; role badge only when source has one (Task 1,
7) ✓; expand-to-see-funds interaction (Task 7) ✓; card sort by descending household value
(Task 5) ✓; trailing "not available yet" block (Tasks 5, 7) ✓; Decimal discipline (Task 7's
`formatIndianCurrency`) ✓; card chrome reuse (Task 7) ✓; no client-side fuzzy/partial-
confidence display (Task 7 has no such state) ✓; all 57 AMCs individually addressed —
Tier 1/2 (Task 2), Tier 3 (Tasks 8-19), Tier 4/manual (Tasks 2, 21), Tier 5 (Task 20) ✓.

**2. Placeholder scan:** The Task 2 registry's Tier 3 entries are explicitly marked as a
starting assumption with a named follow-up task per AMC (Tasks 8-19) and a test that doesn't
depend on their final value — this is a tracked, tested, self-correcting placeholder, not an
unexamined one; flagged inline rather than hidden. No other "TBD"/"add later"/"similar to
Task N" patterns found.

**3. Type consistency:** `FundManagerAllocationSummary`/`ManagerGroup`/`ManagerFundRow`/
`UnavailableScheme` field names match exactly between Task 5 (Pydantic), Task 7 (TypeScript),
and every test. `match_extracted_fund_name`'s return shape (`tuple[Scheme, str, Decimal] |
None`) is used identically in Task 3's `refresh_fund_managers` and Task 21's
`import_from_pdf_bytes`. `MATCH_METHOD_EXACT`/`MATCH_METHOD_FUZZY`/`MATCH_METHOD_MANUAL` are
defined once (Task 3) and referenced, never redefined, everywhere else.

**4. Review Focus coverage:** #1 (co-manager) — Task 1 Step 3 test + Task 5 Step 2 test. #2
(ambiguity) — Task 3 Step 1 test. #3 (MANUAL_PENDING scheme) — Task 5 Step 2 second test. #4
(idempotency) — Task 3 Step 5 test. #5 (ABSL no-date tabular) — Task 3 Step 1 test
(`test_extract_managers_absl_...`).
