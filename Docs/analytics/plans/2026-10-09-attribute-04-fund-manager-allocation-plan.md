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
`STATIC_LINK` (a factsheet link on AMFI's landing page or the AMC's own), `JSON_API` (call the AMC's own
document API directly), or `MANUAL` (proven unautomatable, closed by a manual-PDF
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

> **Revised 2026-10-09 — binding, read before Task 1.** Checked against the code at `94bc9d0`, the user's
> HDFC/Kotak/Edelweiss factsheets and a live fetch of all 57 AMCs in AMFI's directory
> (`Docs/analytics/2026-10-09-attribute-04-factsheet-layouts.md`; text dumps in
> `C:\Users\Dell\Desktop\Unifolio\Factsheets\2026-10-catalogue\`, outside the repo). Decisions are on the
> explainer (`Docs/orchestration/subproject1-execution/a04-fund-manager.html`, cards 1–5). Where this block
> and older text disagree, this block wins; Tasks 2, 3, 3b, 4, 5, 8 and 21 have been rewritten to match.
>
> 1. **Match funds, not plan rows** (card 1). A factsheet names a fund; `schemes` has a row per plan and
>    option. Match to the `(amc_name, base_name)` family and write the managers to every row in it. Layers:
>    ISIN printed on the page → exact canonical name → fuzzy ≥ 0.80 **within the same category**, refused
>    when the runner-up is within 0.05. Notes AMFI and factsheets add ("(Existing Number of Segregated
>    Portfolios - 1)", "[(Erstwhile …)]") never decide a match. AUM tie-break not built.
> 2. **One AMC failing never stops the rest, and someone hears about it** (card 2). Per-AMC `except
>    Exception` + rollback, commit after each AMC, and a `FUND_MANAGER_ALERT amc= reason= detail=` log line
>    for: no landing URL / no factsheet link / not a factsheet / stale month / matching collapsed (< half of
>    last month's families) / error. A CloudWatch metric filter + alarm on the existing ops-alerts SNS topic
>    (Task 4). Last month's managers keep serving; rows older than 3 months show as "not available yet" (Task 5).
> 3. **No generic layout** (card 3 catalogue). Each AMC has a reader in `fund_manager_layouts.py` (new
>    Task 3b) = a manager layout + where that AMC prints the scheme name, each built on the AMC's real text
>    with a fixture test. The old `extract_managers_generic` matched 5 of 22 AMCs' files; it's gone.
> 4. **This month's factsheet, checked after download** (card 4). Pick links whose URL or text says
>    factsheet (or the AMC's own pattern), newest first; then a downloaded file must have ≥ 3 scheme pages
>    its reader understands and an "as on" date within 45 days. The first candidate passing both wins. On
>    9 Oct, about half the files a naive pick chose were stale or the wrong document.
> 5. **AMFI's directory is keyed by company, not fund house.** Its `amc_name` is "Aditya Birla Sun Life
>    AMC Limited"; ours is "Aditya Birla Sun Life Mutual Fund". The registry is keyed by our name and stores
>    AMFI's (`directory_name`); the parser reads `"amc_name"` (the plan said `"amcName"`). Several old
>    registry keys didn't match NAVAll at all ("IL&FS Infra Mutual Fund" → "IL&FS Mutual Fund (IDF)",
>    "Wealth Company Mutual Fund" → "The Wealth Company Mutual Fund", "Monarch Networth Mutual Fund" →
>    "Monarch Mutual Fund"); Carnelian and Nuvama have no schemes and are dropped. 55 entries.
> 6. **Manual import: HDFC and Kotak only** (card 5). Edelweiss's page served its September factsheet over
>    plain HTTP on 9 Oct, so it's automated. HDFC's passive funds are in a separate passive factsheet: ops
>    imports two HDFC files a month.
> 7. **Every AMC is onboarded before staging** (Task 8, replacing the old Tasks 8–20): same procedure for
>    all, coverage ≥ 90% of live funds or a reason per miss. Run 1 ships the framework with 4 AMCs live
>    (Nippon, Edelweiss automated; HDFC, Kotak manual), measured on the real files: Nippon 100/108,
>    Edelweiss 75/76, HDFC 53/53 active, Kotak 112/120.
>
> **Run 1 rulings (9 Oct, after Codex's report and review — committed `bede56a`…`4f72480`):**
> 1. Honorifics: `Mrs` is matched before `Mr`, with a word boundary ("Mrs. A" → "A"; "Mrinal" kept).
> 2. HDFC's "¥ Fund Manager for Overseas Investments" footnote names co-managers: role
>    `Overseas Investments`, `since_raw` from "(since …)" or "w.e.f. …". A bracketed "(X w.e.f DATE)"
>    under a table manager is a handover note, not a role: the listed manager stays.
> 3. Review Focus 5's "no Managing Since date" case is **Kotak** (ABSL's real file has dates).
> 4. A page with no printed category gets no category gate; a gap of exactly 0.05 is accepted.
> 5. JSON_API candidate fetching is written per AMC in its Task 8 onboarding (`_json_api_candidates`
>    raises until then; those entries have `layout=None` and are skipped).
> 6. Aggregation: one row per fund on a manager card with the household's combined value (members'
>    holdings summed); each fund row carries the manager's `role` on that fund
>    (`ManagerFundRow.role`); the card's `role` is set only when all funds agree, else `null`.
> 7. "Older than 3 months" = this month and the two before are shown (`_oldest_period_shown`).
> 8. Hardening from review: whole-word month names in links (last one wins); a dead candidate link
>    falls through to the next; downloads capped at 60 MB; `&amp;`/`\u0026` decoded; a directory that
>    parses to fewer than 40 AMCs raises one `directory_failed` alert; a name listed twice on a page is
>    written once (first listing wins); future "as on" dates are ignored.
>
> **Run order:** Task 1 → 3b → 2 → 3 → 4 → 5 → 6 → 21 (Run 1, backend) · Task 7 (Run 2, frontend) ·
> Task 8 batches (Runs 3–7). **Migration number:** after A09's `0034` this is expected to be `0035` —
> run the `ls` in Global Constraints anyway.

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
- **Every AMC is onboarded in this build** (Task 8). `MANUAL` is permitted only with proof in the
  registry `note` (URLs tried, what came back, the date) — never a default, never "later".
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
3. **A held scheme whose AMC has no current data** (not onboarded, a failed import, or rows older
   than 3 months) — must land in
   `unavailableSchemes` and render the frontend's "not available yet" block, never a crash,
   a fabricated manager, or a silently-dropped row.
4. **Re-running the monthly job twice against unchanged source data** (idempotency) — must
   not create duplicate rows; the `UNIQUE (scheme_id, manager_name, reference_period)`
   constraint plus an upsert-not-insert write path must hold.
5. **A layout with no "Managing Since" date (Kotak; was "ABSL" before the real files were read)** — must still produce correctly-attributed manager rows with `managing_since` left `NULL`. Original wording, ABSL-specific: **ABSL's factsheet has no "Managing Since" date and a different tabular layout** from
   every other Tier-1 AMC — must still produce correctly-attributed manager rows with
   `managing_since` left `NULL`, not crash the whole AMC's parse or silently produce zero
   rows.
6. **One AMC's import failing** (download error, stale file, reader finding nothing) — the other AMCs'
   rows still land, the failure logs one `FUND_MANAGER_ALERT` line, and last month's rows keep serving.
7. **A wrong or stale file** (how-to guide, last year's factsheet) — rejected by the content and month
   checks before anything is written.

## File Structure

**Backend — create:**
- `backend/alembic/versions/<NNNN>_scheme_fund_managers.py` — new table
- `backend/app/services/analytics/fund_manager_resolvers.py` — `ResolverKind` enum,
  `ResolverEntry` dataclass, the `AMC_RESOLVERS` registry (data)
- `backend/app/services/analytics/fund_manager_layouts.py` — one reader per AMC (Task 3b)
- `backend/tests/fixtures/factsheets/*.txt` — real-text excerpts, 1–3 KB each
- `backend/tests/services/analytics/test_fund_manager_layouts.py`
- `backend/app/services/analytics/amfi_factsheet_client.py` — fetch, extract, match, upsert
  (the service logic, structural twin of `amfi_ter_client.py`)
- `backend/app/services/analytics/fund_manager_allocation.py` — household-scoped aggregation
  (`compute_fund_manager_allocation`, the twin of `ter.py`'s `compute_weighted_ter`)
- `backend/scripts/jobs/refresh_fund_managers_monthly.py` — monthly job entrypoint
- `backend/scripts/jobs/import_manual_fund_managers.py` — manual-intake CLI for
  HDFC/Kotak (two HDFC files a month)
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

*(Rewritten 9 Oct from the live catalogue: `Docs/analytics/2026-10-09-attribute-04-factsheet-layouts.md`.
Keys are our fund-house names exactly as `schemes.amc_name` has them (from AMFI's NAVAll); each entry
also carries AMFI's **company** name, which is what AMFI's factsheet directory is keyed by.)*

**Files:**
- Create: `backend/app/services/analytics/fund_manager_resolvers.py`
- Test: `backend/tests/services/analytics/test_fund_manager_resolvers.py`

**Interfaces:**
- Produces: `ResolverKind` (`STATIC_LINK`, `JSON_API`, `MANUAL`); `ResolverEntry` (frozen:
  `kind`, `directory_name`, `layout`, `landing_url`, `link_pattern`, `endpoint_url`,
  `response_json_path`, `note`); `AMC_RESOLVERS: dict[str, ResolverEntry]` — consumed by Task 3.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/services/analytics/test_fund_manager_resolvers.py
from app.services.analytics.fund_manager_layouts import LAYOUTS
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverKind


def test_every_amfi_fund_house_with_schemes_is_listed():
    # 55 of AMFI's 57 directory AMCs have schemes in NAVAll on 9 Oct (Carnelian, Nuvama have none).
    assert len(AMC_RESOLVERS) == 55


def test_every_entry_names_its_amfi_directory_company():
    assert all(entry.directory_name for entry in AMC_RESOLVERS.values())


def test_layouts_exist_for_every_onboarded_amc():
    for amc, entry in AMC_RESOLVERS.items():
        assert entry.layout is None or entry.layout in LAYOUTS, amc


def test_manual_amcs_say_why_and_have_a_reader():
    for amc, entry in AMC_RESOLVERS.items():
        if entry.kind is ResolverKind.MANUAL:
            assert entry.note and entry.layout, amc


def test_json_api_entries_have_an_endpoint():
    for amc, entry in AMC_RESOLVERS.items():
        if entry.kind is ResolverKind.JSON_API:
            assert entry.endpoint_url, amc
```

- [ ] **Step 2: Run, confirm failure** (`ModuleNotFoundError`)

- [ ] **Step 3: Implement**

```python
"""Per-AMC fund-manager source registry (attribute 04).

Keyed by our fund-house name (`schemes.amc_name`, from AMFI's NAVAll). AMFI's factsheet
directory is keyed by the asset-management *company* ("Aditya Birla Sun Life AMC Limited"),
so every entry carries that name too (`directory_name`). Built from the 9 Oct catalogue of
every AMC (Docs/analytics/2026-10-09-attribute-04-factsheet-layouts.md).

An entry with `layout=None` isn't onboarded yet: the job skips it and its schemes show as
"not available yet". Task 8 onboards each one (resolver verified against the live site,
reader built on its real file, coverage measured) before staging -- none is left behind."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ResolverKind(Enum):
    STATIC_LINK = "static_link"  # factsheet link found on a landing page (AMFI's, or landing_url)
    JSON_API = "json_api"        # the AMC's own document API
    MANUAL = "manual"            # no automatable source; ops imports the PDF monthly (Task 21)


@dataclass(frozen=True)
class ResolverEntry:
    kind: ResolverKind
    directory_name: str                    # AMFI factsheet directory's amc_name
    layout: str | None = None              # key into fund_manager_layouts.LAYOUTS
    landing_url: str | None = None         # overrides AMFI's landing URL when AMFI's is empty or wrong
    link_pattern: str | None = None        # regex for this AMC's factsheet link text/URL, if not "factsheet"
    endpoint_url: str | None = None        # JSON_API only
    response_json_path: str | None = None  # JSON_API only: dotted path to the document list
    note: str | None = None                # what was tried, why MANUAL; never left blank for MANUAL


AMC_RESOLVERS: dict[str, ResolverEntry] = {
    "360 ONE Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "360 ONE Asset Management Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Abakkus Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Abakkus Investment Managers Private Limited"),  # 9 Oct: ok
    "Aditya Birla Sun Life Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Aditya Birla Sun Life AMC Limited"),  # 9 Oct: ok
    "AlphaGrep Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "AlphaGrep Investment Management Private Limited"),  # 9 Oct: no_landing_url
    "Angel One Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Angel One Asset Management Company Limited"),  # 9 Oct: no_factsheet_link_in_html
    "ASK MUTUAL FUND": ResolverEntry(ResolverKind.STATIC_LINK, "ASK ASSET MANAGEMENT PRIVATE LIMITED"),  # 9 Oct: no_factsheet_link_in_html
    "Axis Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Axis Asset Management Co. Ltd.", endpoint_url="https://www.axismf.com/cms/downloads/category"),  # onboarding: response path + layout
    "Bajaj Finserv Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Bajaj Finserv Asset Management Limited"),  # 9 Oct: ok
    "Bandhan Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Bandhan AMC Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Bank of India Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Bank of India Investment Managers Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Baroda BNP Paribas Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Baroda BNP Paribas Asset Management India Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Canara Robeco Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Canara Robeco Asset Management Company Limited"),  # 9 Oct: ok
    "Capitalmind Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Capitalmind Asset Management Private Limited"),  # 9 Oct: ok
    "Choice Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Choice AMC Private Limited", endpoint_url="https://www.choiceindia.com/api/document-master-list"),  # onboarding: response path + layout
    "DSP Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "DSP Asset Managers Private Limited"),  # 9 Oct: ok
    "Edelweiss Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Edelweiss Asset Management Limited", layout="edelweiss"),  # automated again: plain HTTP served the Sept file on 9 Oct
    "Franklin Templeton Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Franklin Templeton Asset Management (India) Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Groww Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Groww Asset Management Limited"),  # 9 Oct: ok
    "HDFC Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "HDFC Asset Management Company Limited", layout="hdfc", note="Landing page has no factsheet link in its HTML (9 Oct); monthly manual import (Task 21)."),
    "Helios Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Helios Capital Asset Management (India) Pvt. Ltd."),  # 9 Oct: ok
    "HSBC Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "HSBC Asset Management (India) Private Ltd."),  # 9 Oct: ok
    "ICICI Prudential Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "ICICI Prudential Asset Management Company Limited", endpoint_url="https://apimf.icicipruamc.com/nms/v1/downloads/categories"),  # onboarding: response path + layout
    "IL&FS Mutual Fund (IDF)": ResolverEntry(ResolverKind.STATIC_LINK, "IL&FS Infra Asset Management Limited"),  # 9 Oct: no_landing_url
    "Invesco Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Invesco Asset Management (India) Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "ITI Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "ITI Asset Management Limited", endpoint_url="https://www.itimf.com/jeeth/api/v1/catalog/digitalfactsheet"),  # onboarding: response path + layout
    "Jio BlackRock Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Jio BlackRock Asset Management Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "JM Financial Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "JM Financial Asset Management Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Kotak Mahindra Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "Kotak Mahindra Asset Management Company Limited.", layout="kotak", note="Landing page has no factsheet link in its HTML (9 Oct); monthly manual import (Task 21)."),
    "Lakshya Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Lakshya Asset Management Private Limited"),  # 9 Oct: no_landing_url
    "LIC Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "LIC Mutual Fund Asset Management Limited"),  # 9 Oct: ok
    "Mahindra Manulife Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Mahindra Manulife Investment Management Pvt Ltd"),  # 9 Oct: no_factsheet_link_in_html
    "Mirae Asset Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Mirae Asset Investment Managers (India) Pvt. Ltd"),  # 9 Oct: ok
    "Monarch Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Monarch Networth Asset Management Private Limited"),  # 9 Oct: no_landing_url
    "Motilal Oswal Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Motilal Oswal Asset Management Company Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Navi Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Navi AMC Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Nippon India Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Nippon Life India Asset Management Limited", layout="nippon"),
    "NJ Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "NJ Asset Management Private Limited"),  # 9 Oct: ok
    "Old Bridge Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Old Bridge Asset Management Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "PGIM India Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "PGIM India Asset Management Private Limite", endpoint_url="https://www.pgimindia.com/api/v1/brochure/get/file"),  # onboarding: response path + layout
    "PPFAS Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "PPFAS Asset Management Pvt. Ltd."),  # 9 Oct: ok
    "quant Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "quant Money Managers Limited"),  # 9 Oct: ok
    "Quantum Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Quantum Asset Management Company Private Limited"),  # 9 Oct: ok
    "Samco Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Samco Asset Management Private Limited"),  # 9 Oct: ok
    "SBI Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "SBI Funds Management Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Shriram Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Shriram Asset Management Co. Ltd."),  # 9 Oct: ok
    "Sundaram Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Sundaram Asset Management Company Ltd"),  # 9 Oct: ok
    "Tata Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Tata Asset Management Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Taurus Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Taurus Asset Management Company Limited"),  # 9 Oct: no_factsheet_link_in_html
    "The Wealth Company Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Wealth Company Asset Management Holdings Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Trust Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Trust Asset Management Private Limited", endpoint_url="https://www.trustmf.com/api/api/Trust/GetData"),  # onboarding: response path + layout
    "Unifi Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Unifi Asset Management Private Limited"),  # 9 Oct: ok
    "Union Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Union Asset Management Company Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "UTI Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "UTI Asset Mgmt. Co. Ltd.", endpoint_url="https://www.utimf.com/api/page/forms-and-downloads-downloads"),  # onboarding: response path + layout
    "WhiteOak Capital Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "WhiteOak Capital Asset Management Limited", endpoint_url="https://cms.whiteoakamc.com/graphql"),  # onboarding: response path + layout
    "Zerodha Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Zerodha Asset Management Private Limited"),  # 9 Oct: ok
    # Carnelian Investment Managers Private Limited: no AMFI-listed schemes on 9 Oct -- nothing to resolve; not in the registry.
    # Nuvama Asset Management Limited: no AMFI-listed schemes on 9 Oct -- nothing to resolve; not in the registry.

}
```

  Comments after each entry record the 9 Oct catalogue result; Task 8 replaces them with what
  onboarding found. HDFC's `note` also says ops imports **two** files a month (active and passive
  factsheets).

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/fund_manager_resolvers.py backend/tests/services/analytics/test_fund_manager_resolvers.py
git commit -m "feat: fund-manager source registry for every AMFI fund house"
```

---

### Task 3: Matching engine + `amfi_factsheet_client.py`

**Files:**
- Create: `backend/app/services/analytics/amfi_factsheet_client.py`
- Test: `backend/tests/services/analytics/test_amfi_factsheet_client.py`

**Interfaces:**
- Consumes: `AMC_RESOLVERS`, `ResolverKind` (Task 2); `Scheme`, `SchemeFundManager` (Task 1).
- Produces: `MATCH_METHOD_EXACT = "EXACT"`, `MATCH_METHOD_FUZZY = "FUZZY"`,
  `MATCH_METHOD_MANUAL = "MANUAL"`, `MATCH_METHOD_ISIN = "ISIN"` constants; `build_families`, `match_scheme_page(page,
  families)`, `import_pages`, `looks_like_current_factsheet` (revised 9 Oct; superseded: `match_extracted_fund_name(extracted_name:
  str, candidates: list[Scheme]) -> tuple[Scheme, str, Decimal] | None`;
  `extract_managers_generic(text: str) -> list[dict]`; `extract_managers_absl(text: str) ->
  list[dict]`; `upsert_scheme_fund_managers(db: Session, scheme: Scheme, managers: list[dict],
  reference_period: date, match_method: str, match_confidence: Decimal | None) -> None`;
  `FundManagerRefreshResult` frozen dataclass (`success`, `amcs_processed`, `amcs_failed`,
  `schemes_matched`, `schemes_unmatched`, `seconds`); `async def
  refresh_fund_managers(db: Session) -> FundManagerRefreshResult` — consumed by Task 4's job
  script and Task 21's manual-intake CLI.

- [ ] **Step 1: Write the failing tests — fund-level matching (card 1)**

```python
# backend/tests/services/analytics/test_amfi_factsheet_client.py
import uuid
from decimal import Decimal

from app.models.reference import Scheme
from app.services.analytics.amfi_factsheet_client import (
    MATCH_METHOD_EXACT,
    MATCH_METHOD_FUZZY,
    MATCH_METHOD_ISIN,
    build_families,
    match_scheme_page,
)
from app.services.analytics.fund_manager_layouts import SchemePage


def _scheme(base_name, plan="Direct Plan - Growth", isin=None, category="Equity Scheme - Flexi Cap Fund", amc="Test AMC"):
    return Scheme(id=uuid.uuid4(), amfi_code=uuid.uuid4().hex[:6], name=f"{base_name} - {plan}", base_name=base_name,
                  amc_name=amc, sebi_category=category, isin=isin)


def _page(heading, isins=(), category=None):
    return SchemePage(heading=heading, managers=[{"name": "Jane Doe", "role": None, "since_raw": None}],
                      isins=list(isins), category=category)


def test_one_family_per_fund_holds_every_plan_row():
    rows = [_scheme("ABC Bluechip Fund"), _scheme("ABC Bluechip Fund", "Regular Plan - Growth"),
            _scheme("ABC Bluechip Fund", "Direct Plan - IDCW"), _scheme("XYZ Fund")]
    families = build_families(rows)
    assert sorted(len(f.schemes) for f in families) == [1, 3]


def test_exact_name_matches_the_family_not_a_plan_row():
    families = build_families([_scheme("ABC Bluechip Fund"), _scheme("ABC Bluechip Fund", "Regular Plan - Growth"), _scheme("XYZ Fund")])
    family, method, confidence = match_scheme_page(_page("ABC Bluechip"), families)
    assert family.base_name == "ABC Bluechip Fund" and len(family.schemes) == 2
    assert (method, confidence) == (MATCH_METHOD_EXACT, Decimal("1.0"))


def test_isin_wins_over_a_different_looking_name():
    families = build_families([_scheme("ABC Long Old Name Fund", isin="INF000A01AB1"), _scheme("ABC Bluechip Fund")])
    family, method, _ = match_scheme_page(_page("ABC Bluechip", isins=["INF000A01AB1"]), families)
    assert family.base_name == "ABC Long Old Name Fund" and method == MATCH_METHOD_ISIN


def test_fuzzy_match_in_another_category_is_refused():
    families = build_families([_scheme("ABC Small Cap Opportunities Fund", category="Equity Scheme - Mid Cap Fund")])
    assert match_scheme_page(_page("ABC Small Cap Opportunity Fund", category="Small Cap Fund"), families) is None


def test_fuzzy_match_in_the_same_category_is_accepted():
    families = build_families([_scheme("ABC Small Cap Opportunities Fund", category="Equity Scheme - Small Cap Fund")])
    family, method, confidence = match_scheme_page(_page("ABC Small Cap Opportunity Fund", category="Small Cap Fund"), families)
    assert method == MATCH_METHOD_FUZZY and confidence >= Decimal("0.80")


def test_two_close_candidates_are_refused():
    # Target-maturity funds differ only by date; a heading missing it scores 0.824 against both.
    families = build_families([_scheme("ABC Nifty G-Sec Jun 2027 Index Fund"), _scheme("ABC Nifty G-Sec Dec 2027 Index Fund")])
    assert match_scheme_page(_page("ABC Nifty G-Sec Index"), families) is None


def test_segregated_and_erstwhile_notes_are_ignored():
    families = build_families([_scheme("ABC Credit Risk Fund (Existing Number of Segregated Portfolios - 1)")])
    family, method, _ = match_scheme_page(_page("ABC Credit Risk Fund [(Erstwhile ABC Income Fund)]"), families)
    assert method == MATCH_METHOD_EXACT
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_amfi_factsheet_client.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement the matching half of the module**

```python
"""AMFI factsheet-based fund-manager attribution (attribute 04).

Mirrors amfi_ter_client.py's shape: one monthly file per AMC covers every scheme it
offers, matched against locally known schemes and upserted. There's no AMFI bulk feed;
each AMC's own factsheet is the source, fetched per fund_manager_resolvers.py and read
per fund_manager_layouts.py.

Matching is per fund, not per plan row (card 1): a factsheet names a fund, while
`schemes` has one row per plan and option sharing `base_name`. A matched fund's managers
are written to every row of that (amc_name, base_name) family. Layers, strongest first:
ISIN printed on the page; exact canonical name; fuzzy name >= 0.80 within the same
category, refused when the runner-up is within 0.05."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from difflib import SequenceMatcher

from sqlalchemy.orm import Session

from app.models.reference import Scheme, SchemeFundManager
from app.services.analytics.fund_manager_layouts import SchemePage

MATCH_METHOD_ISIN = "ISIN"
MATCH_METHOD_EXACT = "EXACT"
MATCH_METHOD_FUZZY = "FUZZY"
MATCH_METHOD_MANUAL = "MANUAL"

MIN_MATCH_CONFIDENCE = Decimal("0.80")
AMBIGUITY_MARGIN = Decimal("0.05")

_BOILERPLATE_RE = re.compile(
    r"\b(FUND|SCHEME|PLAN|DIRECT|REGULAR|GROWTH|IDCW|DIVIDEND|REINVESTMENT|PAYOUT)\b", re.IGNORECASE,
)
# "(Existing Number of Segregated Portfolios - 1)", "[(Erstwhile ABC Income Fund)]" -- AMFI and
# factsheets add these to the same fund's name, so they never decide a match.
_NAME_NOTE_RE = re.compile(r"[\[(][^\])]*(?:ERSTWHILE|SEGREGATED)[^\])]*[\])]+", re.IGNORECASE)


def _canonical_fund_name(name: str) -> str:
    s = _NAME_NOTE_RE.sub(" ", name).upper()
    s = _BOILERPLATE_RE.sub("", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


@dataclass(frozen=True)
class FundFamily:
    amc_name: str
    base_name: str
    sebi_category: str
    schemes: tuple[Scheme, ...]
    isins: frozenset[str]

    @property
    def canonical(self) -> str:
        return _canonical_fund_name(self.base_name)


def build_families(schemes: list[Scheme]) -> list[FundFamily]:
    grouped: dict[tuple[str, str], list[Scheme]] = {}
    for scheme in schemes:
        if scheme.base_name:
            grouped.setdefault((scheme.amc_name, scheme.base_name), []).append(scheme)
    return [
        FundFamily(amc, base, members[0].sebi_category or "", tuple(members),
                   frozenset(i for s in members for i in (s.isin, s.isin_reinvest) if i))
        for (amc, base), members in grouped.items()
    ]


def _same_category(page_category: str | None, family: FundFamily) -> bool:
    # The factsheet's "Category: Small Cap Fund" against our "Equity Scheme - Small Cap Fund".
    if not page_category:
        return True  # nothing printed to check against
    return _canonical_fund_name(page_category) in _canonical_fund_name(family.sebi_category)


def match_scheme_page(page: SchemePage, families: list[FundFamily]) -> tuple[FundFamily, str, Decimal] | None:
    """`families` must already be scoped to one AMC -- never search across AMCs.
    Returns None when no confident, unambiguous match exists (Review Focus #2)."""
    if page.isins:
        by_isin = [f for f in families if f.isins & set(page.isins)]
        if len(by_isin) == 1:
            return by_isin[0], MATCH_METHOD_ISIN, Decimal("1.0")

    wanted = _canonical_fund_name(page.heading)
    exact = [f for f in families if f.canonical == wanted]
    if len(exact) == 1:
        return exact[0], MATCH_METHOD_EXACT, Decimal("1.0")
    if len(exact) > 1:
        return None

    scored = sorted(
        ((f, Decimal(str(round(SequenceMatcher(None, wanted, f.canonical).ratio(), 3))))
         for f in families if _same_category(page.category, f)),
        key=lambda pair: pair[1], reverse=True,
    )
    if not scored or scored[0][1] < MIN_MATCH_CONFIDENCE:
        return None
    if len(scored) > 1 and scored[0][1] - scored[1][1] < AMBIGUITY_MARGIN:
        return None
    return scored[0][0], MATCH_METHOD_FUZZY, scored[0][1]
```

- [ ] **Step 4: Run, confirm pass** (7 tests)


- [ ] **Step 5: Write the failing test — upsert idempotency (Review Focus #4)**

```python
def test_upsert_scheme_fund_managers_is_idempotent(tmp_db_session):
    # tmp_db_session: use the same in-memory SQLite session helper as
    # test_fund_manager_allocation.py's _session().
    from datetime import date
    from app.services.analytics.amfi_factsheet_client import upsert_scheme_fund_managers, MATCH_METHOD_EXACT
    from app.models.reference import SchemeFundManager
    scheme = _scheme("ABC Fund")
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
    """{AMFI company name: factsheet landing URL}, re-fetched every run (AMCs move their
    pages). Keys are AMFI's company names ("Aditya Birla Sun Life AMC Limited"), which the
    registry maps to our fund-house names -- `schemes.amc_name` never appears here."""
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
        resp = await client.get(AMFI_FACTSHEET_DIRECTORY_URL)
        resp.raise_for_status()
    return _parse_amfi_directory_payload(resp.text)


def _parse_amfi_directory_payload(html: str) -> dict[str, str]:
    # The page server-renders a Next.js payload with escaped quotes; each AMC object
    # carries "amc_name" and "amc_monthly_mf_factsheets" (checked live 9 Oct: 57 AMCs).
    text = html.replace('\\"', '"')
    pairs = re.findall(r'"amc_name":"([^"]+)"[^{}]*?"amc_monthly_mf_factsheets":"([^"]*)"', text)
    return {name.replace("\\u0026", "&"): url for name, url in pairs}


_MONTHS = {m: i for i, m in enumerate(("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), 1)}
_NOT_A_FACTSHEET = re.compile(r"riskometer|portfolio|how[-_ ]?to|methodology|kim|\bsid\b|addendum|notice|form", re.I)


def _link_date(text: str) -> tuple[int, int]:
    """(year, month) found in a link's URL or text, newest first when sorted descending;
    (0, 0) when none -- such links sort last."""
    lowered = text.lower()
    year = max((int(y) for y in re.findall(r"20\d\d", lowered)), default=0)
    month = next((_MONTHS[m[:3]] for m in re.findall(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*", lowered)), 0)
    return year, month


async def _static_link_candidates(client: httpx.AsyncClient, landing_url: str, link_pattern: str | None) -> list[str]:
    """Card 4, pick rule: links whose URL or link text says factsheet (or the AMC's own
    pattern), newest first. The content and month checks then decide which one is real."""
    if landing_url.lower().split("?")[0].endswith(".pdf"):
        return [landing_url]  # e.g. Old Bridge: AMFI points straight at the file
    resp = await client.get(landing_url)
    resp.raise_for_status()
    pattern = re.compile(link_pattern or r"fact\s*[-_ ]?sheet", re.I)
    links = []
    for href, label in re.findall(r'<a[^>]+href=["\']([^"\']+\.pdf[^"\']*)["\'][^>]*>(.*?)</a>', resp.text, re.I | re.S):
        joined = f"{href} {re.sub(r'<[^>]+>', ' ', label)}"
        if pattern.search(joined) and not _NOT_A_FACTSHEET.search(href):
            links.append((_link_date(joined), urllib.parse.urljoin(str(resp.url), href)))
    return [url for _, url in sorted(links, key=lambda pair: pair[0], reverse=True)][:3]


async def _download_pdf(client: httpx.AsyncClient, url: str) -> bytes | None:
    resp = await client.get(url)
    resp.raise_for_status()
    return resp.content if resp.content.startswith(b"%PDF") else None


_AS_ON = re.compile(
    r"(?:as on|as of|data as on)\s*:?\s*(\d{1,2})(?:st|nd|rd|th)?\s*([A-Za-z]{3,9})[,.]?\s*(\d{4})"
    r"|(?:as on|as of|data as on)\s*:?\s*([A-Za-z]{3,9})\s*(\d{1,2}),?\s*(\d{4})", re.I)


def _latest_as_on(pages: list[str]) -> date | None:
    found = []
    for text in pages[:12]:
        for m in _AS_ON.finditer(text):
            day, month, year = (m.group(1), m.group(2), m.group(3)) if m.group(1) else (m.group(5), m.group(4), m.group(6))
            month_no = _MONTHS.get(month[:3].lower())
            if month_no:
                try:
                    found.append(date(int(year), month_no, int(day)))
                except ValueError:
                    continue
    return max(found) if found else None


def looks_like_current_factsheet(pages: list[str], reader, today: date) -> tuple[bool, str]:
    """Card 4: the downloaded PDF is this AMC's current factsheet. Content: at least 3
    scheme pages this AMC's reader understands (rejects one-pagers, how-to guides,
    unrelated PDFs). Month: the latest "as on" date is within 45 days (a factsheet
    published mid-month can still carry the previous month-end -- Edelweiss's September
    file says "Data as on August 31"). Returns (ok, reason) for the alert line."""
    scheme_pages = sum(1 for page in pages if reader(page) is not None)
    if scheme_pages < 3:
        return False, "not_a_factsheet"
    as_on = _latest_as_on(pages)
    if as_on is None or (today - as_on).days > 45:
        return False, "stale_month"
    return True, "ok"


def _alert(amc_name: str, reason: str, detail: str) -> None:
    # One line per problem; a CloudWatch metric filter on this prefix raises an alarm on
    # the existing ops-alerts SNS topic (Task 4). Card 2.
    logger.warning("FUND_MANAGER_ALERT amc=%s reason=%s detail=%s", amc_name, reason, detail)


def import_pages(
    db: Session, amc_name: str, pages: list[str], reader, reference_period: date, manual: bool = False,
) -> tuple[int, int]:
    """Read every scheme page with the AMC's reader, match each to a fund family within
    this AMC only, and write the managers to every plan row of the matched family. Shared
    by the monthly job and the manual-import CLI. Returns (families matched, pages unmatched)."""
    families = build_families(db.query(Scheme).filter(Scheme.amc_name == amc_name).all())
    matched: set[tuple[str, str]] = set()
    unmatched = 0
    for page_text in pages:
        page = reader(page_text)
        if page is None:
            continue
        result = match_scheme_page(page, families)
        if result is None:
            unmatched += 1
            logger.info("refresh_fund_managers: unmatched amc=%s heading=%r", amc_name, page.heading[:80])
            continue
        family, method, confidence = result
        for scheme in family.schemes:
            upsert_scheme_fund_managers(db, scheme, page.managers, reference_period,
                                        MATCH_METHOD_MANUAL if manual else method, confidence)
        matched.add((family.amc_name, family.base_name))
    return len(matched), unmatched


def _families_matched_last_month(db: Session, amc_name: str, reference_period: date) -> int:
    previous = (reference_period.replace(day=1) - timedelta(days=1)).replace(day=1)
    return (
        db.query(func.count(func.distinct(Scheme.base_name)))
        .join(SchemeFundManager, SchemeFundManager.scheme_id == Scheme.id)
        .filter(Scheme.amc_name == amc_name, SchemeFundManager.reference_period == previous)
        .scalar() or 0
    )


async def _resolve_and_read(client, entry: ResolverEntry, directory: dict[str, str], reader, today: date) -> tuple[list[str] | None, str]:
    if entry.kind is ResolverKind.JSON_API:
        candidates = await _json_api_candidates(client, entry)
    else:
        landing = entry.landing_url or directory.get(entry.directory_name or "")
        if not landing:
            return None, "no_landing_url"
        candidates = await _static_link_candidates(client, landing, entry.link_pattern)
    if not candidates:
        return None, "no_factsheet_link"
    reason = "fetch_failed"
    for url in candidates:  # card 4: the first candidate that passes both checks wins
        pdf = await _download_pdf(client, url)
        if pdf is None:
            continue
        pages = extract_page_text(pdf)
        ok, reason = looks_like_current_factsheet(pages, reader, today)
        if ok:
            return pages, "ok"
    return None, reason


async def refresh_fund_managers(db: Session) -> FundManagerRefreshResult:
    started = time.perf_counter()
    try:
        directory = await _fetch_amfi_directory()
    except (httpx.HTTPError, ValueError) as exc:
        _alert("ALL", "directory_failed", repr(exc))
        return FundManagerRefreshResult(success=False)

    today = date.today()
    reference_period = today.replace(day=1)
    amcs_processed = amcs_failed = schemes_matched = schemes_unmatched = 0

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
        for amc_name, entry in AMC_RESOLVERS.items():
            # Manual AMCs come in through the CLI; an AMC without a reader isn't onboarded yet
            # (Task 8) -- its schemes show as "not available yet", never guessed.
            if entry.kind is ResolverKind.MANUAL or entry.layout is None:
                continue
            reader = LAYOUTS[entry.layout]
            try:
                pages, reason = await _resolve_and_read(client, entry, directory, reader, today)
                if pages is None:
                    _alert(amc_name, reason, entry.landing_url or directory.get(entry.directory_name or "", ""))
                    amcs_failed += 1
                    continue
                matched, unmatched = import_pages(db, amc_name, pages, reader, reference_period)
                await commit_off_loop(db)  # per AMC: a later AMC failing never undoes this one
                last = _families_matched_last_month(db, amc_name, reference_period)
                if last and matched < last / 2:
                    _alert(amc_name, "matching_collapsed", f"{matched} vs {last} last month")
                amcs_processed += 1
                schemes_matched += matched
                schemes_unmatched += unmatched
            except Exception as exc:  # card 2: one AMC breaking never stops the rest
                db.rollback()
                _alert(amc_name, "error", f"{type(exc).__name__}: {exc}"[:300])
                amcs_failed += 1

    return FundManagerRefreshResult(
        success=True, amcs_processed=amcs_processed, amcs_failed=amcs_failed,
        schemes_matched=schemes_matched, schemes_unmatched=schemes_unmatched,
        seconds=round(time.perf_counter() - started, 1),
    )
```

Add at the top of the file: `import urllib.parse`, `from datetime import timedelta`,
`from sqlalchemy import func`, `from app.services.analytics.fund_manager_layouts import LAYOUTS`,
`from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverEntry, ResolverKind`, and
`_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}`
(several AMC sites drop requests without a browser User-Agent). `_json_api_candidates(client, entry)`
is the plan's `_fetch_json_api_pdf` reshaped to return candidate URLs (newest first) from
`entry.response_json_path`; each JSON_API AMC's path is confirmed in its Task 8 onboarding.

Tests to add in Step 6 (same file), all with mocked HTTP and fixture pages:
- `_parse_amfi_directory_payload` on a 2-AMC excerpt of the real page (escaped quotes, `&`)
  returns `{"Aditya Birla Sun Life AMC Limited": "https://…", "IL&FS Infra Asset Management Limited": ""}`.
- `_static_link_candidates`: a landing page listing a how-to PDF, an April and a September factsheet
  returns September first and drops the how-to; a landing URL ending `.pdf` is returned as is.
- `looks_like_current_factsheet`: 2 scheme pages → `not_a_factsheet`; "Data as on March 31, 2026" on
  2026-10-10 → `stale_month`; "Data as on August 31, 2026" on 2026-10-10 → ok.
- `refresh_fund_managers`: an AMC whose download raises `RuntimeError` doesn't stop the next AMC, and
  logs `FUND_MANAGER_ALERT amc=… reason=error`; an AMC matching 5 families after 40 last month logs
  `reason=matching_collapsed`; a MANUAL AMC and an AMC with `layout=None` are skipped.


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

### Task 3b: Layout readers — `fund_manager_layouts.py`

*(New 9 Oct, card 3 / catalogue: there is no "generic" factsheet layout. Each AMC's file is read by a
named layout function; Run 1 builds the four below, verified on the real files. Every further AMC
is onboarded in Task 8 — existing layout or a new one, always with a fixture from its real file.)*

**Files:**
- Create: `backend/app/services/analytics/fund_manager_layouts.py`
- Create: `backend/tests/fixtures/factsheets/{nippon,edelweiss,hdfc,kotak}.txt`
  — 1–3 KB each: two scheme pages cut from the real text dumps in
  `C:\Users\Dell\Desktop\Unifolio\Factsheets\2026-10-catalogue\` (Nippon, Edelweiss) and
  `manual_hdfc_aug2026.txt` / `manual_kotak_sep2026.txt` (same folder). Copy the text exactly,
  including its odd line breaks — that's what's being tested. Keep page breaks as `\f`.
- Test: `backend/tests/services/analytics/test_fund_manager_layouts.py`

**Interfaces:**
- Produces: `SchemePage(heading: str, managers: list[dict], isins: list[str], category: str | None)`;
  `LAYOUTS: dict[str, Callable[[str], SchemePage | None]]` — one reader per onboarded AMC (keys
  `nippon`, `edelweiss`, `hdfc`, `kotak`, `absl`), each a manager layout (`bullets_slash`, `hdfc_table`,
  `kotak_line`, `absl_line`) paired with where that AMC prints the scheme name; it returns `None` for a
  page that isn't a scheme page. Manager dicts are `{"name", "role", "since_raw"}` — names without Mr./Ms./Dr.

- [ ] **Step 1: Write the failing tests** — one per layout, against its fixture, asserting the exact
  headings and manager rows of both fixture pages, e.g. for Edelweiss:

```python
def test_bullets_slash_pairs_names_with_their_dates():
    pages = (FIXTURES / "edelweiss.txt").read_text(encoding="utf-8").split("\f")
    page = next(p for p in (LAYOUTS["edelweiss"](p) for p in pages) if p and p.heading.startswith("Edelweiss Large & Mid Cap"))
    assert [(m["name"], m["since_raw"]) for m in page.managers] == [
        ("Sumanta Khan", "Apr 01, 2024"), ("Trideep Bhattacharya", "Oct 01, 2021"), ("Ashish Sood", "Aug 03, 2026"),
    ]
```

  Plus, per reader: a non-scheme page (index, glossary) returns `None`; HDFC's specialist role
  ("Gold/Silver Instruments") lands in `role`; Kotak's "(w.e.f. June 01, 2026)" becomes `since_raw`
  and is stripped from the name; Nippon's "(Assistant Fund Manager)" lands in `role`; a wrapped heading
  is joined ("KOTAK INFRASTRUCTURE &" + "ECONOMIC REFORM FUND").

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

```python
# backend/app/services/analytics/fund_manager_layouts.py
"""Fund-manager extraction, one function per factsheet layout (attribute 04).

AMCs don't share a layout: the 9 Oct catalogue of every AMC's factsheet
(Docs/analytics/2026-10-09-attribute-04-factsheet-layouts.md) found six families, and a
single "generic" regex matched 5 AMCs of 22. Each function takes one page of
pypdfium2 text and returns the scheme's printed heading and managers, or None for a
page that isn't a scheme page. The registry (fund_manager_resolvers.py) says which
layout each AMC uses."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable

_TITLE = re.compile(r"^(?:Mr|Ms|Mrs|Dr)\.?\s*")
_ISIN = re.compile(r"\bINF[0-9A-Z]{9}\b")
_CATEGORY = re.compile(r"Category(?: of (?:the )?Scheme)?\s*:?\s*([A-Za-z&/ -]{3,40}?Fund)\b")
_MONTH = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?"
_DATE = rf"{_MONTH}\s*\d{{1,2}},?\s*\d{{4}}"
# Lines that end a heading: the scheme-type sentence and running headers.
_HEADING_STOP = re.compile(
    r"^(an open[- ]ended|open[- ]ended|type of scheme|\(erstwhile|product label|this product|"
    r"past performance|data as on|additional disclosure|an? (?:interval|close))", re.I)
_RUNNING_HEADER = re.compile(r"^(\d+|\d+ \| \w+ \d{4}|For Product label.*|\.{3,}Contd.*)$")


@dataclass(frozen=True)
class SchemePage:
    heading: str
    managers: list[dict]
    isins: list[str] = field(default_factory=list)
    category: str | None = None


def _clean_name(raw: str) -> str:
    return " ".join(_TITLE.sub("", raw.strip()).split())


def _first_line_heading(page: str, max_lines: int = 3) -> str:
    """HDFC, Edelweiss: the first line that isn't a running header, joined with its wrapped
    continuation, stopping at the scheme-type sentence."""
    out: list[str] = []
    for line in (l.strip() for l in page.splitlines()):
        if not line or _RUNNING_HEADER.match(line):
            if out:
                break
            continue
        if _HEADING_STOP.match(line):
            break
        out.append(line)
        if len(out) == max_lines:
            break
    # HDFC prints "[(Erstwhile …)" / "[An open ended …" right after the name.
    return _TYPE_CUT.split(" ".join(out))[0]


def _brand_line_heading(page: str, prefix: str) -> str:
    """Nippon, ABSL, Kotak: return tables and notes come first on the page, so the name is
    the first line starting with the AMC's brand ("Nippon India …"), cut at any scheme-type
    text on the same line and joined with the next line when the name wraps."""
    lines = [l.strip() for l in page.splitlines() if l.strip()]
    for i, line in enumerate(lines):
        if line.lower().startswith(prefix.lower()):
            name = _TYPE_CUT.split(line)[0]
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            if name.endswith(("&", "-")) or (line.isupper() and nxt.isupper() and len(nxt) < 40
                                              and not nxt.startswith("(") and not _HEADING_STOP.match(nxt)):
                name = f"{name} {_TYPE_CUT.split(nxt)[0]}"
            return name
    return ""


_TYPE_CUT = re.compile(r"\s+(?:-\s+An open|NSE Symbol|BSE Scrip|\(|\[)|\s+-?\d+(?:\.\d+)?%")


def _page(heading: str, managers: list[dict], page: str) -> SchemePage | None:
    if not heading or not managers:
        return None
    category = _CATEGORY.search(page)
    return SchemePage(heading, managers, sorted(set(_ISIN.findall(page))), category.group(1).strip() if category else None)


def bullets_slash(page: str) -> list[dict] | None:
    """Nippon, Edelweiss: "Name of Fund Managers • Mr. A • Mr. B (Assistant Fund Manager)
    Total Experience 30 / 14  Managing Since: August 2007 / August 2024"."""
    names = re.search(r"Name of Fund Managers?\s*:?(.*?)Total\s*Experience", page, re.S)
    if not names:
        return None
    managers = []
    for raw in (n for n in re.split(r"•", names.group(1)) if n.strip()):
        role = re.search(r"\(([^)]*)\)", raw)
        managers.append({"name": _clean_name(re.sub(r"\([^)]*\)", "", raw)),
                         "role": role.group(1).strip() if role else None, "since_raw": None})
    since = re.search(r"Managing\s*Since\s*:?(.*?)(?:Minimum Investment|Load Structure|Benchmark|$)", page, re.S)
    dates = [d.strip() for d in " ".join(since.group(1).split()).split("/")] if since else []
    for manager, date_raw in zip(managers, dates):
        manager["since_raw"] = date_raw or None
    return managers


def hdfc_table(page: str) -> list[dict] | None:
    """HDFC: "FUND MANAGER ¥ / Name Since Total Exp / Rahul Baijal July 29, 2022 Over 25 years /
    Bhagyesh Kagalkar (Gold/Silver Instruments) August 26,2026 …" -- no Mr., dates wrap."""
    block = re.search(r"FUND MANAGER\s*¥?(.*?)(?:DATE OF ALLOTMENT|NAV\s*\(|ASSETS UNDER)", page, re.S)
    if not block:
        return None
    text = " ".join(block.group(1).split()).replace("Name Since Total Exp", " ")
    managers = [
        {"name": _clean_name(m.group("name")), "role": m.group("role"), "since_raw": m.group("since")}
        for m in re.finditer(rf"(?P<name>[A-Z][A-Za-z.' ]+?)\s*(?:\((?P<role>[^)]*)\))?\s*(?P<since>{_DATE})\s*Over\s*\d+\s*years", text)
    ]
    return managers


def kotak_line(page: str) -> list[dict] | None:
    """Kotak: "Fund Manager*: Mr. Harsha Upadhyaya" (names joined by & / , / and; a new
    manager can carry "(w.e.f. June 01, 2026)"). No managing-since dates otherwise."""
    line = re.search(r"Fund Manager\*:\s*(.+?)(?:\n\s*\n|AAUM|AUM|Benchmark|Allotment|$)", page, re.S)
    if not line:
        return None
    managers = []
    # Names are joined by "&", ",", "and" -- or just a line break before the next "Mr.".
    for raw in re.split(r"&|,(?![^()]*\))|\band\b|(?=\b(?:Mr|Ms|Mrs|Dr)\.)", " ".join(line.group(1).split())):
        since = re.search(rf"\((?:w\.e\.f\.?|effective)\s*({_DATE})\)", raw)
        name = _clean_name(re.sub(r"\(.*", "", raw))
        if re.fullmatch(r"[A-Z][a-z]+(?: [A-Z][A-Za-z.]+)+", name):
            managers.append({"name": name, "role": None, "since_raw": since.group(1) if since else None})
    return managers


def absl_line(page: str) -> list[dict] | None:
    """ABSL: "Fund Manager - Mr. Harish Krishnan  Managing the Fund Since: January 07, 2026"
    (one or more). Replaces the plan's earlier comma-line guess, which the real file doesn't use."""
    managers = [
        {"name": _clean_name(m.group(1)), "role": None, "since_raw": m.group(2)}
        for m in re.finditer(rf"Fund Manager\s*[-:]\s*((?:(?:Mr|Ms|Dr)\.?\s*)?[A-Z][A-Za-z.' ]+?)\s+Managing the Fund Since\s*:?\s*({_DATE})", " ".join(page.split()))
    ]
    return managers


def _reader(managers: Callable[[str], list[dict] | None], heading: Callable[[str], str]) -> Callable[[str], SchemePage | None]:
    def read(page: str) -> SchemePage | None:
        found = managers(page)
        return _page(heading(page), found, page) if found else None
    return read


# One reader per AMC: a manager layout plus where that AMC prints the scheme name.
# Task 8 adds an entry per onboarded AMC (reusing a layout where the shape matches).
LAYOUTS: dict[str, Callable[[str], SchemePage | None]] = {
    "nippon": _reader(bullets_slash, lambda p: _brand_line_heading(p, "Nippon India")),
    "edelweiss": _reader(bullets_slash, _first_line_heading),
    "hdfc": _reader(hdfc_table, _first_line_heading),
    "kotak": _reader(kotak_line, lambda p: _brand_line_heading(p, "KOTAK ")),
    "absl": _reader(absl_line, lambda p: _brand_line_heading(p, "Aditya Birla Sun Life")),
}
```

  Measured on the real files (9 Oct), with Task 3's matcher: Nippon 100 of 108 live funds, Edelweiss
  75/76, HDFC 53/53 active funds (passive funds are in HDFC's separate passive factsheet), Kotak 112/120.
  `absl` reads managers on 103 pages but matches 82/104 funds (renamed funds need aliases) — ABSL is
  finished in Task 8, so `absl` ships in `LAYOUTS` but its registry entry stays `layout=None` until then.
  Also test: Nippon's name comes from the "Nippon India …" line, not the return table above it.

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/fund_manager_layouts.py backend/tests/services/analytics/test_fund_manager_layouts.py backend/tests/fixtures/factsheets/
git commit -m "feat: per-layout fund manager readers verified on real factsheets"
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

- [ ] **Step 2b: Alert on `FUND_MANAGER_ALERT` lines (card 2)** — in the same module, next to the
  existing `aws_sns_topic.ops_alerts`:

```hcl
resource "aws_cloudwatch_log_metric_filter" "fund_manager_alerts" {
  name           = "${var.project}-${var.environment}-fund-manager-alerts"
  log_group_name = aws_cloudwatch_log_group.jobs["fund_managers_monthly"].name
  pattern        = "FUND_MANAGER_ALERT"
  metric_transformation {
    name      = "FundManagerAlerts"
    namespace = "${var.project}/${var.environment}/jobs"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "fund_manager_alerts" {
  alarm_name          = "${var.project}-${var.environment}-fund-manager-alerts"
  alarm_description   = "An AMC's factsheet import failed or collapsed; the log line names the AMC, reason and URL."
  namespace           = "${var.project}/${var.environment}/jobs"
  metric_name         = "FundManagerAlerts"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
}
```

  No app permission change: the job only writes log lines (`task_role_arn` stays `null`). Check the
  real variable names in `infra/modules/scheduler/variables.tf` and match them.

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
    period = date.today().replace(day=1)  # this month: within the 3-month window (card 2)
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


def test_managers_older_than_three_months_count_as_unavailable():
    """Card 2: an AMC whose imports keep failing must not show months-old managers as fact."""
    from app.services.analytics.fund_manager_allocation import _months_back
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="S1", name="Stale Fund", base_name="Stale Fund", amc_name="Test AMC", sebi_category="Equity")
    db.add(scheme)
    db.commit()
    old_period = _months_back(date.today().replace(day=1), 4)
    db.add(SchemeFundManager(id=uuid.uuid4(), scheme_id=scheme.id, manager_name="Jane Doe", role=None, sequence_order=0,
                             reference_period=old_period, match_method="EXACT", match_confidence=Decimal("1.0")))
    db.commit()
    holdings = [
        HoldingRow(scheme_id=str(scheme.id), scheme_name="Stale Fund", amc_name="Test AMC", asset_class="Equity",
                   household_member_id=str(uuid.uuid4()), household_member_name="Self", plan_type="direct",
                   units_held="100", average_nav="10", current_nav="10", current_nav_date=None,
                   amount_invested="1000", current_value="1000", current_profit_total="0", realized_gain="0", unrealized_gain="0"),
    ]
    with patch("app.services.analytics.fund_manager_allocation.compute_holdings", new=AsyncMock(return_value=holdings)):
        summary = asyncio.run(compute_fund_manager_allocation(db, [uuid.uuid4()]))
    assert summary.manager_groups == []
    assert [u.scheme_name for u in summary.unavailable_schemes] == ["Stale Fund"]


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
from datetime import date
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


def _months_back(first_of_month: date, months: int) -> date:
    year, month = divmod(first_of_month.year * 12 + first_of_month.month - 1 - months, 12)
    return date(year, month + 1, 1)


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
    # Card 2: when an AMC's import fails, last month's managers keep serving -- but rows
    # older than 3 months count as "not available yet" rather than lingering as fact.
    oldest_shown = _months_back(date.today().replace(day=1), 3)
    rows_by_scheme: dict[uuid.UUID, list[SchemeFundManager]] = defaultdict(list)
    for row in manager_rows:
        if row.reference_period == latest_period_by_scheme.get(row.scheme_id) and row.reference_period >= oldest_shown:
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
schemas from Task 5 field-for-field — **the committed `backend/app/services/analytics/schemas.py` wins
if anything below differs**). Run 1 ruling 6: the card badge shows `group.role` when set; when it's
`null`, each fund row shows its own `role` (e.g. "Assistant Fund Manager", "Overseas Investments") next
to the fund name if present — never a fabricated label. Add `role: null` (or a real role) to every
`ManagerFundRow` in the test fixtures, plus one test where a manager leads one fund and assists on another.

```ts
export interface ManagerFundRow {
  scheme_id: string;
  scheme_name: string;
  household_value: string;
  sequence_order: number;
  role: string | null;  // this manager's role on this fund (Run 1 ruling 6)
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

## Task 8: Onboard every remaining AMC (one procedure, run per AMC, in batches)

*(Replaces the old Tasks 8–20, 9 Oct. The live catalogue showed "Tier 1 confirmed working" wasn't
true at the extraction level — the old generic regex matched 5 AMCs of 22 — so every AMC goes through
the same procedure, including the old Tier 1/2. Nothing is deferred past staging: all batches run
before release.)*

**Inputs per AMC:** its row in the catalogue (`Docs/analytics/2026-10-09-attribute-04-factsheet-layouts.md`,
"Per-AMC status"); its text dump, if fetched, in `C:\Users\Dell\Desktop\Unifolio\Factsheets\2026-10-catalogue\`;
its live NAVAll funds (`schemes` rows with that `amc_name` and a NAV dated in the last 30 days).

**Procedure — for each AMC:**

1. **Source.** Make `_resolve_and_read` return this month's factsheet for this AMC, live:
   - **STATIC_LINK:** AMFI's landing page, or `landing_url` when AMFI's is empty or wrong, plus a
     `link_pattern` when the link isn't called "factsheet". If the page renders its links with JavaScript,
     find the request the page makes (browser dev tools → Network) and switch the entry to **JSON_API**
     with `endpoint_url` and `response_json_path`.
   - **MANUAL** only with proof in `note`: the URLs tried, what came back, and the date.
2. **Reader.** Reuse a reader whose shape matches (e.g. `nippon`'s `bullets_slash` layout for another
   bullet-list AMC), or add a manager layout and/or heading rule to `fund_manager_layouts.py`.
   - Add a fixture `backend/tests/fixtures/factsheets/<amc>.txt`: 1–3 KB, two scheme pages copied
     verbatim from the real text.
   - Add a test asserting both pages' headings and manager rows exactly.
   - Multi-fund summary tables (Canara Robeco, Groww, LIC): use the AMC's per-scheme pages if the file
     has them; otherwise use `pypdfium2` character boxes to pair names with columns. Never guess pairs
     from text order.
3. **Coverage.** Run the reader and Task 3's matcher over the real file. Record **families matched /
   live funds** in the registry comment and the catalogue.
   - Target: ≥ 90%.
   - Every miss gets a reason in the catalogue: passive funds in a separate file, renamed fund (add a
     test-covered alias), new fund not in the factsheet yet, or a reader bug — fix the bug.
4. **Registry.** Set `layout`, plus `landing_url` / `link_pattern` / JSON fields as found; replace the
   catalogue comment with the result.

**Batches (one Codex run each; each run's report lists coverage per AMC):**

| Run | AMCs | Starting point (9 Oct) |
|---|---|---|
| 3 | Abakkus, Aditya Birla Sun Life (`absl` reader exists, 82/104 — aliases), Bajaj Finserv, Canara Robeco, Capitalmind, DSP, Groww, Helios, HSBC, LIC | file fetched; some stale or wrong file picked |
| 4 | Mirae Asset, NJ, PPFAS, quant, Quantum, Samco, Shriram, Sundaram, Unifi, Zerodha | same |
| 5 | Axis, Choice, ICICI Prudential, ITI, PGIM India, Trust, UTI, WhiteOak Capital | JSON_API endpoints from 8 Oct, unverified |
| 6 | 360 ONE, Angel One, ASK, Bandhan, Bank of India, Baroda BNP Paribas, Franklin Templeton, Invesco, JM Financial, Jio BlackRock | landing page has no factsheet link in its HTML |
| 7 | Mahindra Manulife, Motilal Oswal, Navi, Old Bridge (AMFI points at the PDF itself), SBI, Tata, Taurus, The Wealth Company, Union; AlphaGrep, IL&FS (IDF), Lakshya, Monarch (no landing URL, but live funds) | same / find the page by hand |

**Done means:** every registry entry has a `layout` (or is MANUAL with proof), and the catalogue shows
each AMC's coverage.

---

### Task 21: Manual-import CLI for HDFC and Kotak

*(Revised 9 Oct, card 5: Edelweiss is automated again; HDFC needs **two** files a month — its active-fund
factsheet and its separate passive-fund factsheet; the CLI reuses the job's reader, matcher and checks.)*

**Files:**
- Create: `backend/scripts/jobs/import_manual_fund_managers.py`
- Test: `backend/tests/scripts/test_import_manual_fund_managers.py`

**Interfaces:**
- Consumes: `AMC_RESOLVERS` (Task 2), `LAYOUTS` (Task 3b), `extract_page_text`, `import_pages`,
  `looks_like_current_factsheet` (Task 3).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/scripts/test_import_manual_fund_managers.py
from datetime import date
from unittest.mock import patch

import pytest

from scripts.jobs import import_manual_fund_managers as cli


def test_refuses_an_amc_that_is_not_manual():
    with pytest.raises(SystemExit):
        cli.run(db=None, amc_name="Nippon India Mutual Fund", pdfs=[], today=date(2026, 10, 12))


def test_imports_every_given_file_and_reports_matched_count(tmp_path, db_session):
    files = [tmp_path / "hdfc_active.pdf", tmp_path / "hdfc_passive.pdf"]
    for f in files:
        f.write_bytes(b"%PDF-fake")
    with patch.object(cli, "extract_page_text", return_value=["page"] * 5), \
         patch.object(cli, "looks_like_current_factsheet", return_value=(True, "ok")), \
         patch.object(cli, "import_pages", side_effect=[(53, 0), (50, 2)]) as imported:
        result = cli.run(db_session, "HDFC Mutual Fund", files, today=date(2026, 10, 12))
    assert result == {"matched": 103, "unmatched": 2}
    assert imported.call_count == 2 and imported.call_args.kwargs["manual"] is True


def test_a_stale_file_is_refused_before_anything_is_written(tmp_path, db_session):
    f = tmp_path / "kotak.pdf"
    f.write_bytes(b"%PDF-fake")
    with patch.object(cli, "extract_page_text", return_value=["page"] * 5), \
         patch.object(cli, "looks_like_current_factsheet", return_value=(False, "stale_month")), \
         patch.object(cli, "import_pages") as imported, pytest.raises(SystemExit):
        cli.run(db_session, "Kotak Mahindra Mutual Fund", [f], today=date(2026, 10, 12))
    imported.assert_not_called()
```

(`db_session`: the SQLite session helper the other `tests/scripts/` tests use; mechanical deviation if named differently.)

- [ ] **Step 2: Run, confirm failure**

- [ ] **Step 3: Implement**

```python
# backend/scripts/jobs/import_manual_fund_managers.py
"""Monthly manual import of fund managers for AMCs whose factsheet can't be fetched
automatically (HDFC, Kotak; attribute 04, card 5). Ops downloads the factsheet(s) in a browser
and runs, once per AMC:

    python scripts/jobs/import_manual_fund_managers.py --amc "HDFC Mutual Fund" \
        --pdf HDFC_active_2026-09.pdf --pdf HDFC_passive_2026-09.pdf

Same reader, matcher and month check as the monthly job; rows are marked MANUAL. Prints
matched=N: compare it with last month's number for the AMC (in the ops guide)."""
import argparse
import logging
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.db.session import SessionLocal
from app.services.analytics.amfi_factsheet_client import extract_page_text, import_pages, looks_like_current_factsheet
from app.services.analytics.fund_manager_layouts import LAYOUTS
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverKind


def run(db, amc_name: str, pdfs: list[Path], today: date) -> dict[str, int]:
    entry = AMC_RESOLVERS.get(amc_name)
    if entry is None or entry.kind is not ResolverKind.MANUAL:
        sys.exit(f"{amc_name!r} isn't a manual-import AMC; the monthly job handles it.")
    reader = LAYOUTS[entry.layout]
    pages_per_file = []
    for pdf in pdfs:
        pages = extract_page_text(pdf.read_bytes())
        ok, reason = looks_like_current_factsheet(pages, reader, today)
        if not ok:
            # Checked for every file before writing anything, so a wrong file changes nothing.
            sys.exit(f"{pdf.name}: {reason} -- download this month's factsheet and run again.")
        pages_per_file.append(pages)
    matched = unmatched = 0
    for pages in pages_per_file:
        m, u = import_pages(db, amc_name, pages, reader, today.replace(day=1), manual=True)
        matched, unmatched = matched + m, unmatched + u
    db.commit()
    return {"matched": matched, "unmatched": unmatched}


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Import fund managers from downloaded AMC factsheet PDFs.")
    parser.add_argument("--amc", required=True, help='Exact fund-house name, e.g. "HDFC Mutual Fund"')
    parser.add_argument("--pdf", required=True, type=Path, action="append", help="A downloaded factsheet; repeat for HDFC's two files")
    args = parser.parse_args()
    with SessionLocal() as db:
        result = run(db, args.amc, args.pdf, date.today())
    print(f"matched={result['matched']} unmatched={result['unmatched']}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Try it on the real files** (orchestrator, local DB): run the CLI on the user's HDFC August
  and Kotak September files (`Docs/` or `Desktop/Unifolio/Factsheets/`). Expect matched ≈ 53 (HDFC
  active) and ≈ 112 (Kotak). Record the numbers in the ops guide.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/jobs/import_manual_fund_managers.py backend/tests/scripts/test_import_manual_fund_managers.py
git commit -m "feat: manual fund-manager import CLI for HDFC and Kotak"
```

---

## Self-Review

*(Written before the 9 Oct revision; where it names old tasks (Tiers, Tasks 8–20, `extract_managers_*`), the Revised block and the rewritten Tasks 2, 3, 3b, 8 and 21 govern.)*

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
