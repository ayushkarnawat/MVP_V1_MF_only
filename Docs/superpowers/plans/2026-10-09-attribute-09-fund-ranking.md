# Attribute 09 — Fund Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank every held scheme against its SEBI-category peer universe using a 5-factor
weighted composite score (3Y return, 5Y return, category-relative return, low-volatility,
low-TER — each a percentile, not a raw number), and surface it as a leaderboard showing the
2 named competitor funds immediately above and below each held fund.

**Architecture:** A new `fund_ranking.py` module, a structural sibling of the existing
`scorer.py`, computes a per-category batch of percentile-ranked components (reusing
`category_ranking.py`'s and `risk_metrics.py`'s and `ter.py`'s existing building blocks
verbatim — zero new data source, zero new scheduled job) and persists one `scheme_rankings`
row per scheme per day. It's exposed two ways, mirroring Scorer v1's existing two-endpoint
precedent exactly: a bespoke per-scheme `GET /analytics/funds/{scheme_id}/ranking` endpoint
(mirrors `GET /analytics/funds/{scheme_id}/score`), and a household-aggregated `ranking`
entry registered in `recompute.py`'s `_SECTIONS` dispatcher (mirrors the existing `score`
section's `compute_portfolio_score`). The frontend renders a new `FundRankingSection.tsx`
leaderboard/neighbors view, the one place in the app that shows other funds by name.

**Tech Stack:** Python/SQLAlchemy/Alembic backend (zero new dependencies — every input is
already computed elsewhere in this codebase), React/TypeScript frontend.

**Spec:**
- `Docs/analytics/2026-10-07-sub-project-1-planning.md` — "Attribute 09" section (lines 22-262)
- `Docs/analytics/2026-10-08-attribute-09-fund-ranking-spec.md` — frontend spec
- `Docs/analytics/artifacts/2026-10-08-attribute-09-fund-ranking-visual-map.html` — visual reference

## Global Constraints

- **Migration numbering:** before creating the migration file, run
  `ls backend/alembic/versions | sort | tail -5` to find the real latest migration number —
  never hardcode a number guessed in this doc. Filename stem is fixed by the spec:
  `scheme_rankings_and_ranking_weights.py`.
- **Every composite component is a percentile (0-100), never a raw number summed directly**
  — 3Y CAGR, a return delta, and a TER percentage are on incompatible scales; only percentile
  ranks within category are weighted and summed.
- **Weights: 0.25 / 0.25 / 0.20 / 0.15 / 0.15** (return_3y / return_5y / category_relative /
  low_volatility / low_ter) — seeded once via migration into a DB-backed `ranking_weights`
  singleton table (no admin UI; edited directly via the existing SSM-tunnel + psql/DBeaver
  pattern), with the service layer falling back to these same hardcoded defaults if the
  table is empty.
- **Missing component → renormalize, never zero-fill:** when 5Y, TER, or volatility is
  unavailable for a scheme, the remaining components' weights are renormalized
  proportionally (generalizes `category_ranking.py`'s existing "3yr-only schemes use 100%
  3yr" precedent to all 5 components) — never substitute a 0 or drop the scheme from ranking.
- **Minimum 3Y history to be ranked at all** — same floor `category_ranking.py`/`scorer.py`
  already enforce. Below it: `insufficient_history=True`, not ranked.
- **Thin category threshold: `_THIN_CATEGORY_THRESHOLD = 5`** (reused from
  `category_ranking.py`, not a new constant) — still ranked, flagged `thin_category=True`.
- **1Y return is display-only, never a weighted input.**
- **Decimal discipline:** every rupee/percentage value crossing into the frontend is a
  Decimal string, formatted with `@/lib/decimal` — never a float.
- **Dispatcher wiring for the aggregate view, not a second bespoke household endpoint:** the
  household-aggregated ranking is added to `recompute.py`'s `_SECTIONS` list and served
  through the existing generic `GET /analytics/{scope}` route — exactly how `score`
  (`compute_portfolio_score`) is already registered there alongside its own separate bespoke
  per-scheme `GET /analytics/funds/{scheme_id}/score` endpoint. Attribute 09 follows this
  same two-endpoint shape, not a single new design.
- **No client-side ranking/scoring/neighbor-computation logic** — composite score,
  percentiles, and the neighbor list are all server-computed; the frontend only renders.
- **Card chrome / badge copy reuse:** `Insufficient History`, `Thin Category (N peers)`,
  `Category Unavailable` badges reused verbatim (same wording, same `Badge` variants) from
  `CategoryRankingSection.tsx`.

## Review Focus

1. **A scheme with 3Y but no 5Y history** — composite must renormalize across the 4
   remaining components (weights sum to 1 again), never show a 0 for the missing 5Y slot or
   silently drop the scheme.
2. **A scheme with no TER link** (common now post-migration `0031`'s exact-only rework —
   only ~7,000 schemes are exactly-linked) — composite must renormalize across the 4 other
   components; the frontend's detail breakdown shows "—" for that row, never a fabricated 0%.
3. **The held fund is ranked #1 (or last) in its category** — neighbors must show 0 above (or
   0 below), never crash on a negative slice index or wrap around to the opposite end of the
   list.
4. **Two concurrent requests compute the same scheme's ranking in the same day** —
   `scheme_rankings`' `(scheme_id, computed_at)` primary key must not raise an unhandled
   `IntegrityError`; the loser's exception is swallowed, its own freshly computed result
   still returned (same pattern `fund_scores` already uses).
5. **`ranking_weights` table is empty** (e.g. an accidental row delete in staging) — must
   degrade to the hardcoded PDF-default weights, never crash or silently rank with all-zero
   weights.

## File Structure

**Backend — create:**
- `backend/alembic/versions/<NNNN>_scheme_rankings_and_ranking_weights.py`
- `backend/app/services/analytics/fund_ranking.py`
- `backend/tests/services/analytics/test_fund_ranking.py`

**Backend — modify:**
- `backend/app/models/reference.py` — add `SchemeRanking`, `RankingWeight` models
- `backend/app/services/analytics/category_ranking.py` — add `_compute_category_returns_detailed`
- `backend/app/services/analytics/schemas.py` — add `FundRankingRow`, `FundRankingSummary`,
  `AggregateFundRankingResponse`
- `backend/app/services/analytics/recompute.py` — register the new `ranking` section
- `backend/app/api/analytics.py` — add the bespoke per-scheme ranking endpoint
- `backend/tests/services/analytics/test_category_ranking.py` — regression test for the
  refactor

**Frontend — create:**
- `frontend/src/features/analytics/FundRankingSection.tsx`
- `frontend/src/features/analytics/FundRankingSection.test.tsx`

**Frontend — modify:**
- `frontend/src/features/analytics/types.ts`
- `frontend/src/features/analytics/AnalyticsView.tsx`
- `frontend/src/features/analytics/print/PrintAnalyticsView.tsx`

---

### Task 1: `scheme_rankings` + `ranking_weights` tables

**Files:**
- Create: `backend/alembic/versions/<NNNN>_scheme_rankings_and_ranking_weights.py`
- Modify: `backend/app/models/reference.py`
- Test: `backend/tests/services/analytics/test_fund_ranking.py` (table-shape smoke test)

**Interfaces:**
- Produces: `SchemeRanking`, `RankingWeight` ORM models (`backend/app/models/reference.py`) —
  consumed by Task 3 (`fund_ranking.py`).

- [ ] **Step 1: Add the models**

In `backend/app/models/reference.py`, append (reusing the existing import line's
`Numeric`/`Integer`/`Uuid`/`ForeignKey`/`DateTime`/`Boolean` — no new imports needed except
`CheckConstraint`, add it to the existing `from sqlalchemy import ...` line):

```python
class SchemeRanking(Base):
    __tablename__ = "scheme_rankings"

    scheme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("schemes.id"), primary_key=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    composite_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    category_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category_size: Mapped[int] = mapped_column(Integer, nullable=False)
    percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    return_1y: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    return_3y: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    return_5y: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    category_relative: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    downside_deviation: Mapped[Decimal | None] = mapped_column(Numeric(8, 6), nullable=True)
    ter_value: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    return_3y_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    return_5y_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    category_relative_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    volatility_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    ter_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)


class RankingWeight(Base):
    __tablename__ = "ranking_weights"
    __table_args__ = (CheckConstraint("id = true", name="ck_ranking_weights_singleton"),)

    id: Mapped[bool] = mapped_column(Boolean, primary_key=True, default=True)
    weight_return_3y: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False, default=Decimal("0.25"))
    weight_return_5y: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False, default=Decimal("0.25"))
    weight_category_relative: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False, default=Decimal("0.20"))
    weight_low_volatility: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False, default=Decimal("0.15"))
    weight_low_ter: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False, default=Decimal("0.15"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
```

Add `from datetime import timezone` to the existing `from datetime import date as date_, datetime`
import line (becomes `from datetime import date as date_, datetime, timezone`).

- [ ] **Step 2: Write the migration**

Run `ls backend/alembic/versions | sort | tail -5` first to get the real next number and the
real latest `down_revision` — substitute both below (shown as `<NNNN>`/`<NNNN-1>`).

```python
"""scheme_rankings_and_ranking_weights: 5-factor composite fund ranking (attribute 09)

Revision ID: <NNNN>
Revises: <NNNN-1>

scheme_rankings: one row per scheme per day the ranking was computed,
structurally parallel to fund_scores (Scorer v1's own table) but a distinct
table -- these are two different formulas (decisions.md 2026-10-06: "not a
Scorer conflict") and must never share one row shape. ranking_weights: a
singleton config table seeded with the PDF's own 25/25/20/15/15 split,
editable directly in the DB (no admin UI, per decisions.md 2026-10-06); an
empty table is not a failure mode -- the service layer falls back to the
same hardcoded defaults this migration seeds.
"""
from alembic import op
import sqlalchemy as sa

revision = "<NNNN>"
down_revision = "<NNNN-1>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scheme_rankings",
        sa.Column("scheme_id", sa.Uuid(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("composite_score", sa.Numeric(5, 2), nullable=False),
        sa.Column("category_rank", sa.Integer(), nullable=True),
        sa.Column("category_size", sa.Integer(), nullable=False),
        sa.Column("percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("return_1y", sa.Numeric(8, 6), nullable=True),
        sa.Column("return_3y", sa.Numeric(8, 6), nullable=True),
        sa.Column("return_5y", sa.Numeric(8, 6), nullable=True),
        sa.Column("category_relative", sa.Numeric(8, 6), nullable=True),
        sa.Column("downside_deviation", sa.Numeric(8, 6), nullable=True),
        sa.Column("ter_value", sa.Numeric(5, 2), nullable=True),
        sa.Column("return_3y_percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("return_5y_percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("category_relative_percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("volatility_percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("ter_percentile", sa.Numeric(5, 2), nullable=True),
        sa.PrimaryKeyConstraint("scheme_id", "computed_at"),
        sa.ForeignKeyConstraint(["scheme_id"], ["schemes.id"]),
    )
    op.create_table(
        "ranking_weights",
        sa.Column("id", sa.Boolean(), nullable=False),
        sa.Column("weight_return_3y", sa.Numeric(4, 3), nullable=False, server_default="0.25"),
        sa.Column("weight_return_5y", sa.Numeric(4, 3), nullable=False, server_default="0.25"),
        sa.Column("weight_category_relative", sa.Numeric(4, 3), nullable=False, server_default="0.20"),
        sa.Column("weight_low_volatility", sa.Numeric(4, 3), nullable=False, server_default="0.15"),
        sa.Column("weight_low_ter", sa.Numeric(4, 3), nullable=False, server_default="0.15"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("id = true", name="ck_ranking_weights_singleton"),
    )
    op.execute(
        "INSERT INTO ranking_weights (id, weight_return_3y, weight_return_5y, "
        "weight_category_relative, weight_low_volatility, weight_low_ter) "
        "VALUES (true, 0.25, 0.25, 0.20, 0.15, 0.15)"
    )


def downgrade() -> None:
    op.drop_table("ranking_weights")
    op.drop_table("scheme_rankings")
```

- [ ] **Step 3: Write the failing shape test**

```python
# backend/tests/services/analytics/test_fund_ranking.py
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.reference import RankingWeight, Scheme, SchemeRanking


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_scheme_ranking_round_trips():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="T1", name="Test Fund", amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()
    db.add(SchemeRanking(
        scheme_id=scheme.id, computed_at=datetime.now(timezone.utc), composite_score=Decimal("81.40"),
        category_rank=8, category_size=62, percentile=Decimal("87.10"),
    ))
    db.commit()
    row = db.query(SchemeRanking).filter_by(scheme_id=scheme.id).one()
    assert row.category_rank == 8


def test_ranking_weights_singleton_defaults():
    db = _session()
    db.add(RankingWeight(id=True))
    db.commit()
    row = db.query(RankingWeight).one()
    assert row.weight_return_3y == Decimal("0.250")
    assert row.weight_return_5y == Decimal("0.250")
    assert row.weight_category_relative == Decimal("0.200")
    assert row.weight_low_volatility == Decimal("0.150")
    assert row.weight_low_ter == Decimal("0.150")
```

- [ ] **Step 4: Run it, confirm it fails**

Run: `cd backend && pytest tests/services/analytics/test_fund_ranking.py -v`
Expected: FAIL — `ImportError: cannot import name 'SchemeRanking'`

- [ ] **Step 5: Implement Step 1's models + Step 2's migration, then re-run**

Run: `cd backend && alembic upgrade head && pytest tests/services/analytics/test_fund_ranking.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/reference.py backend/alembic/versions/ backend/tests/services/analytics/test_fund_ranking.py
git commit -m "feat: add scheme_rankings and ranking_weights tables"
```

---

### Task 2: Extend `category_ranking.py` with `_compute_category_returns_detailed`

**Files:**
- Modify: `backend/app/services/analytics/category_ranking.py`
- Modify: `backend/tests/services/analytics/test_category_ranking.py`

**Interfaces:**
- Produces: `_compute_category_returns_detailed(db: Session, universe: list[Scheme], today:
  date) -> dict[uuid.UUID, tuple[Decimal | None, Decimal, Decimal | None, Decimal]]` — keyed
  tuple is `(r1, r3, r5, blended)`; `r3`/`blended` are always present for any scheme in the
  returned dict (a scheme without 3Y history is simply absent, same as today), `r1`/`r5` are
  `None` when that window isn't available yet. Consumed by Task 3's `fund_ranking.py`.
- Consumes: existing `_bulk_nav_on_or_before`, `_cagr`, `_blend_returns`, `years_ago`,
  `warm_nav_history` (all already in this file/its imports, untouched).

This refactor is additive and must not change `_compute_category_returns`'s existing return
shape (`dict[uuid.UUID, Decimal]`) or any existing caller's behavior (`_category_returns`'s
cached wrapper, `scorer.py`, `compute_category_ranking`) — it becomes a thin wrapper around
the new detailed function.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/services/analytics/test_category_ranking.py
from app.services.analytics.category_ranking import _compute_category_returns_detailed


def test_compute_category_returns_detailed_exposes_r1_r3_r5_and_blended():
    db = _session()
    scheme = _scheme(db, "Held Fund")
    nav_data = {scheme.id: {"today": Decimal("20"), "start3": Decimal("10"), "start5": Decimal("8")}}
    start_1y = _TODAY.replace(year=_TODAY.year - 1)

    async def _fn(db_, scheme_, on_date, allow_stale_today=False):
        entry = nav_data.get(scheme_.id)
        if entry is None:
            return None
        if on_date == _TODAY:
            return (entry["today"], on_date)
        if on_date == _START_3Y:
            return (entry["start3"], on_date)
        if on_date == _START_5Y:
            return (entry["start5"], on_date)
        return None  # start_1y deliberately unavailable -- r1 should come back None

    with patch("app.services.dashboard.nav.get_nav_on_or_before", new=AsyncMock(side_effect=_fn)):
        detailed = asyncio.run(_compute_category_returns_detailed(db, [scheme], _TODAY))

    r1, r3, r5, blended = detailed[scheme.id]
    assert r1 is None
    assert r3 == _cagr(Decimal("10"), Decimal("20"), 3)
    assert r5 == _cagr(Decimal("8"), Decimal("20"), 5)
    assert blended == _blend_returns(r3, r5)


def test_compute_category_returns_unchanged_by_detailed_refactor():
    db = _session()
    scheme = _scheme(db, "Held Fund")
    nav_data = {scheme.id: {"today": Decimal("20"), "start3": Decimal("10"), "start5": Decimal("8")}}

    with patch("app.services.dashboard.nav.get_nav_on_or_before", new=AsyncMock(side_effect=_nav_side_effect(nav_data))):
        blended_only = asyncio.run(category_ranking_module._compute_category_returns(db, [scheme], _TODAY))

    assert blended_only == {scheme.id: _blend_returns(_cagr(Decimal("10"), Decimal("20"), 3), _cagr(Decimal("8"), Decimal("20"), 5))}
```

(This file's `warm_nav_history` is patched implicitly via the existing `_nav_side_effect`
fixture pattern already in this file — check the real import path used by
`warm_nav_history`'s own NAV lookup, `app.services.dashboard.nav.get_nav_on_or_before`, by
reading `backend/app/services/dashboard/nav.py`'s `warm_nav_history` function signature
before writing this patch target, since the existing tests in this file already rely on
patching that same function — reuse the identical patch target string already used
elsewhere in this file, don't guess a new one.)

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_category_ranking.py -v -k detailed`
Expected: FAIL — `ImportError: cannot import name '_compute_category_returns_detailed'`

- [ ] **Step 3: Implement**

In `backend/app/services/analytics/category_ranking.py`, replace the body of
`_compute_category_returns` (currently lines 119-149) with:

```python
async def _compute_category_returns_detailed(
    db: Session, universe: list[Scheme], today: date
) -> dict[uuid.UUID, tuple[Decimal | None, Decimal, Decimal | None, Decimal]]:
    """{scheme_id: (r1, r3, r5, blended)} -- r3/blended always present for
    any scheme in the result (a scheme without 3Y history is simply absent,
    same eligibility floor as the blended-only function below); r1/r5 are
    `None` when that window isn't available yet. r1 exists only for
    attribute 09's display-only 1yr column -- `_compute_category_returns`
    below never surfaces it, since no existing caller needs it."""
    warm_start = time.perf_counter()
    await warm_nav_history(db, universe)
    warm_elapsed = time.perf_counter() - warm_start

    start_1y = years_ago(today, 1)
    start_3y = years_ago(today, 3)
    start_5y = years_ago(today, 5)
    lookup_start = time.perf_counter()
    navs = _bulk_nav_on_or_before(db, [s.id for s in universe], [start_1y, start_3y, start_5y, today])
    lookup_elapsed = time.perf_counter() - lookup_start

    detailed: dict[uuid.UUID, tuple[Decimal | None, Decimal, Decimal | None, Decimal]] = {}
    for scheme in universe:
        per_scheme = navs.get(scheme.id, {})
        end = per_scheme.get(today)
        start3 = per_scheme.get(start_3y)
        if end is None or start3 is None:
            continue
        r3 = _cagr(start3, end, 3)
        start5 = per_scheme.get(start_5y)
        r5 = _cagr(start5, end, 5) if start5 is not None else None
        start1 = per_scheme.get(start_1y)
        r1 = _cagr(start1, end, 1) if start1 is not None else None
        detailed[scheme.id] = (r1, r3, r5, _blend_returns(r3, r5))

    logger.info(
        "_compute_category_returns_detailed[%s]: %d schemes, warm=%.2fs bulk_nav_lookup=%.2fs",
        universe[0].sebi_category if universe else "?", len(universe), warm_elapsed, lookup_elapsed,
    )
    return detailed


async def _compute_category_returns(db: Session, universe: list[Scheme], today: date) -> dict[uuid.UUID, Decimal]:
    detailed = await _compute_category_returns_detailed(db, universe, today)
    return {scheme_id: blended for scheme_id, (_, _, _, blended) in detailed.items()}
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_category_ranking.py -v`
Expected: PASS, every pre-existing test in this file still passes (the refactor changed no
external behavior of `_compute_category_returns`).

- [ ] **Step 5: Run the full existing suite that depends on this module transitively**

Run: `cd backend && pytest tests/services/analytics/test_scorer.py tests/services/analytics/test_category_ranking.py -v`
Expected: PASS — `scorer.py` imports `_category_returns` (the cached wrapper, untouched),
never `_compute_category_returns` directly, so this refactor doesn't reach it at all; this
run is a confirmation, not expected to catch anything new.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/analytics/category_ranking.py backend/tests/services/analytics/test_category_ranking.py
git commit -m "feat: expose 1yr/3yr/5yr returns separately from category_ranking's blend"
```

---

### Task 3: `fund_ranking.py` — the composite ranking engine

**Files:**
- Create: `backend/app/services/analytics/fund_ranking.py`
- Modify: `backend/app/services/analytics/schemas.py`
- Test: append to `backend/tests/services/analytics/test_fund_ranking.py`

**Interfaces:**
- Consumes: `_compute_category_returns_detailed`, `_aum_weighted_average`,
  `_latest_aaum_by_scheme`, `_rank_and_percentile`, `_THIN_CATEGORY_THRESHOLD` (Task 2 +
  existing `category_ranking.py`); `build_monthly_series_bulk`, `compute_downside_deviation`,
  `month_end_dates`, `monthly_returns`, `years_ago` (existing `risk_metrics.py`);
  `_latest_ter_for_scheme` (existing `ter.py`); `get_category_universe` (existing
  `scheme_universe.py`); `compute_holdings` (existing `dashboard/holdings.py`);
  `list_household_members`, `get_member_statuses` (existing `dashboard/` modules).
- Produces: `compute_fund_ranking(db: Session, scheme: Scheme) -> FundRankingRow`,
  `compute_portfolio_ranking(db: Session, household_member_ids: list[uuid.UUID]) ->
  FundRankingSummary`, `get_aggregate_fund_ranking(db: Session, user_id: uuid.UUID) ->
  AggregateFundRankingResponse` — consumed by Task 4 (API) and Task 5 (`_SECTIONS`
  registration).

- [ ] **Step 1: Add the schemas**

In `backend/app/services/analytics/schemas.py`, append:

```python
class FundRankingNeighbor(BaseModel):
    scheme_id: str
    scheme_name: str
    category_rank: int
    composite_score: str


class FundRankingComponent(BaseModel):
    percentile: str | None
    raw: str | None


class FundRankingComponents(BaseModel):
    return_3y: FundRankingComponent
    return_5y: FundRankingComponent
    category_relative: FundRankingComponent
    low_volatility: FundRankingComponent
    low_ter: FundRankingComponent


class FundRankingRow(BaseModel):
    scheme_id: str
    scheme_name: str
    category_name: str | None
    category_unavailable: bool
    insufficient_history: bool
    thin_category: bool
    composite_score: str | None
    category_rank: int | None
    category_size: int
    percentile: str | None
    return_1y: str | None
    neighbors: list[FundRankingNeighbor]
    components: FundRankingComponents


class FundRankingSummary(BaseModel):
    funds: list[FundRankingRow]


class AggregateFundRankingResponse(BaseModel):
    members: list[MemberStatus]
    ranking: FundRankingSummary
```

- [ ] **Step 2: Write the failing tests — core percentile/renormalization logic**

```python
# append to backend/tests/services/analytics/test_fund_ranking.py
import asyncio
from unittest.mock import AsyncMock, patch

from app.services.analytics.fund_ranking import (
    _DEFAULT_WEIGHTS,
    _get_ranking_weights,
    _renormalized_composite,
    compute_fund_ranking,
    compute_portfolio_ranking,
)


def test_renormalized_composite_full_components():
    percentiles = {"return_3y": Decimal("90"), "return_5y": Decimal("80"), "category_relative": Decimal("70"), "low_volatility": Decimal("60"), "low_ter": Decimal("50")}
    result = _renormalized_composite(percentiles, _DEFAULT_WEIGHTS)
    expected = Decimal("0.25") * 90 + Decimal("0.25") * 80 + Decimal("0.20") * 70 + Decimal("0.15") * 60 + Decimal("0.15") * 50
    assert result == expected


def test_renormalized_composite_missing_5y_and_ter_renormalizes_remaining_three():
    percentiles = {"return_3y": Decimal("90"), "return_5y": None, "category_relative": Decimal("70"), "low_volatility": Decimal("60"), "low_ter": None}
    result = _renormalized_composite(percentiles, _DEFAULT_WEIGHTS)
    weight_sum = Decimal("0.25") + Decimal("0.20") + Decimal("0.15")  # 0.60
    expected = (Decimal("0.25") / weight_sum * 90) + (Decimal("0.20") / weight_sum * 70) + (Decimal("0.15") / weight_sum * 60)
    assert result == expected


def test_renormalized_composite_all_missing_returns_none():
    percentiles = {"return_3y": None, "return_5y": None, "category_relative": None, "low_volatility": None, "low_ter": None}
    assert _renormalized_composite(percentiles, _DEFAULT_WEIGHTS) is None


def test_get_ranking_weights_falls_back_to_defaults_when_table_empty():
    db = _session()
    assert _get_ranking_weights(db) == _DEFAULT_WEIGHTS


def test_get_ranking_weights_reads_singleton_row_when_present():
    db = _session()
    db.add(RankingWeight(id=True, weight_return_3y=Decimal("0.30"), weight_return_5y=Decimal("0.30"), weight_category_relative=Decimal("0.15"), weight_low_volatility=Decimal("0.15"), weight_low_ter=Decimal("0.10")))
    db.commit()
    weights = _get_ranking_weights(db)
    assert weights["return_3y"] == Decimal("0.30")
    assert weights["low_ter"] == Decimal("0.10")
```

- [ ] **Step 3: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_fund_ranking.py -v -k "renormalized or ranking_weights"`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.analytics.fund_ranking'`

- [ ] **Step 4: Implement the core composite/renormalization logic**

```python
# backend/app/services/analytics/fund_ranking.py
"""Fund ranking (attribute 09) — a 5-factor composite score (3Y return 25%,
5Y return 25%, category-relative return 20%, low-volatility 15%, low-TER
15%, every component a percentile within the SEBI category, never a raw
number) per the source PDF's own formula. Structural sibling of scorer.py:
reuses category_ranking.py's returns/AUM-average/percentile-rank helpers,
risk_metrics.py's downside-deviation computation, and ter.py's per-scheme
TER lookup verbatim — zero new data source, zero new scheduled job. Unlike
Scorer, TER here gets a full 0.15-weighted percentile share rather than
Scorer's small ±0.25 dead-zone nudge — a deliberate difference, not an
inconsistency (decisions.md 2026-10-06: a different formula from Scorer).
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.reference import RankingWeight, Scheme, SchemeRanking
from app.services.analytics.category_ranking import (
    _THIN_CATEGORY_THRESHOLD,
    _aum_weighted_average,
    _compute_category_returns_detailed,
    _latest_aaum_by_scheme,
    _rank_and_percentile,
)
from app.services.analytics.risk_metrics import (
    build_monthly_series_bulk,
    compute_downside_deviation,
    month_end_dates,
    monthly_returns,
    years_ago,
)
from app.services.analytics.schemas import (
    FundRankingComponent,
    FundRankingComponents,
    FundRankingNeighbor,
    FundRankingRow,
    FundRankingSummary,
)
from app.services.analytics.scheme_universe import get_category_universe
from app.services.analytics.ter import _latest_ter_for_scheme
from app.services.dashboard.aggregate import get_member_statuses
from app.services.dashboard.holdings import compute_holdings
from app.services.dashboard.household_members import list_household_members

logger = logging.getLogger(__name__)

_DEFAULT_WEIGHTS: dict[str, Decimal] = {
    "return_3y": Decimal("0.25"),
    "return_5y": Decimal("0.25"),
    "category_relative": Decimal("0.20"),
    "low_volatility": Decimal("0.15"),
    "low_ter": Decimal("0.15"),
}
_HISTORY_YEARS = 5

# Same per-category cost pattern scorer.py's `_category_score_cache` and
# category_ranking.py's `_category_returns_cache` already solve BUG-001
# for: this category-wide computation (returns, downside deviation, TER,
# percentile ranks across the whole SEBI peer universe) must not repeat per
# held scheme in the same category within one request or a short window.
_CATEGORY_RANKING_CACHE_TTL_SECONDS = 15 * 60
_category_ranking_clock = time.monotonic
_category_ranking_cache: dict[str, tuple[float, date, dict[uuid.UUID, dict]]] = {}
_category_ranking_cache_lock = threading.Lock()


def _get_ranking_weights(db: Session) -> dict[str, Decimal]:
    row = db.query(RankingWeight).first()
    if row is None:
        return dict(_DEFAULT_WEIGHTS)
    return {
        "return_3y": row.weight_return_3y,
        "return_5y": row.weight_return_5y,
        "category_relative": row.weight_category_relative,
        "low_volatility": row.weight_low_volatility,
        "low_ter": row.weight_low_ter,
    }


def _renormalized_composite(
    percentiles: dict[str, Decimal | None], weights: dict[str, Decimal]
) -> Decimal | None:
    available = {k: v for k, v in percentiles.items() if v is not None}
    if not available:
        return None
    weight_sum = sum((weights[k] for k in available), Decimal("0"))
    if weight_sum == 0:
        return None
    return sum((weights[k] / weight_sum * v for k, v in available.items()), Decimal("0"))
```

- [ ] **Step 5: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_fund_ranking.py -v -k "renormalized or ranking_weights"`
Expected: PASS (5 tests)

- [ ] **Step 6: Write the failing tests — category-wide computation + per-scheme finish**

```python
# append to backend/tests/services/analytics/test_fund_ranking.py
def _seed_monthly_nav(db, scheme, months, start_nav=Decimal("10"), monthly_growth=Decimal("0.01")):
    from app.models.reference import NavHistory
    nav = start_nav
    today = date.today()
    for i in range(months, 0, -1):
        year = today.year - (i // 12)
        month = ((today.month - 1 - (i % 12)) % 12) + 1
        day = min(today.day, 28)
        row_date = today.replace(year=year, month=month, day=day)
        db.add(NavHistory(scheme_id=scheme.id, date=row_date, nav=nav))
        nav *= Decimal(1) + monthly_growth
    db.commit()


def test_compute_fund_ranking_ranks_against_category_and_fills_neighbors():
    import app.services.analytics.fund_ranking as fund_ranking_module
    fund_ranking_module._category_ranking_cache.clear()

    db = _session()
    schemes = [Scheme(id=uuid.uuid4(), amfi_code=f"R{i}", name=f"Fund {i}", amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund") for i in range(10)]
    db.add_all(schemes)
    db.commit()
    for s in schemes:
        _seed_monthly_nav(db, s, 36)

    detailed = {
        s.id: (Decimal("0.10"), Decimal(f"0.{90 - i * 5:02d}"), Decimal(f"0.{80 - i * 5:02d}"), Decimal(f"0.{85 - i * 5:02d}"))
        for i, s in enumerate(schemes)
    }  # highest blended return = schemes[0], descending

    with (
        patch("app.services.analytics.fund_ranking.get_category_universe", new=AsyncMock(return_value=schemes)),
        patch("app.services.analytics.fund_ranking._compute_category_returns_detailed", new=AsyncMock(return_value=detailed)),
        patch("app.services.analytics.fund_ranking._latest_aaum_by_scheme", return_value={}),
        patch("app.services.analytics.fund_ranking._latest_ter_for_scheme", return_value=None),
        patch("app.services.analytics.fund_ranking.build_monthly_series_bulk", return_value={s.id: [] for s in schemes}),
    ):
        row = asyncio.run(compute_fund_ranking(db, schemes[2]))  # 3rd-best -> category_rank 3

    assert row.insufficient_history is False
    assert row.category_rank == 3
    assert row.category_size == 10
    assert len(row.neighbors) == 4  # 2 above (#1,#2), 2 below (#4,#5)
    neighbor_ranks = sorted(n.category_rank for n in row.neighbors)
    assert neighbor_ranks == [1, 2, 4, 5]


def test_compute_fund_ranking_top_rank_has_no_above_neighbors():
    import app.services.analytics.fund_ranking as fund_ranking_module
    fund_ranking_module._category_ranking_cache.clear()

    db = _session()
    schemes = [Scheme(id=uuid.uuid4(), amfi_code=f"T{i}", name=f"Fund {i}", amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund") for i in range(5)]
    db.add_all(schemes)
    db.commit()
    detailed = {s.id: (Decimal("0.10"), Decimal(f"0.{90 - i * 5:02d}"), Decimal(f"0.{80 - i * 5:02d}"), Decimal(f"0.{85 - i * 5:02d}")) for i, s in enumerate(schemes)}

    with (
        patch("app.services.analytics.fund_ranking.get_category_universe", new=AsyncMock(return_value=schemes)),
        patch("app.services.analytics.fund_ranking._compute_category_returns_detailed", new=AsyncMock(return_value=detailed)),
        patch("app.services.analytics.fund_ranking._latest_aaum_by_scheme", return_value={}),
        patch("app.services.analytics.fund_ranking._latest_ter_for_scheme", return_value=None),
        patch("app.services.analytics.fund_ranking.build_monthly_series_bulk", return_value={s.id: [] for s in schemes}),
    ):
        row = asyncio.run(compute_fund_ranking(db, schemes[0]))  # best fund -> rank 1

    assert row.category_rank == 1
    assert len(row.neighbors) == 2  # 0 above, 2 below
    assert all(n.category_rank in (2, 3) for n in row.neighbors)


def test_compute_fund_ranking_missing_sebi_category_is_unavailable():
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="U1", name="Unavailable Fund", amc_name="Test AMC", sebi_category="")
    db.add(scheme)
    db.commit()
    row = asyncio.run(compute_fund_ranking(db, scheme))
    assert row.category_unavailable is True
    assert row.insufficient_history is False
    assert row.composite_score is None


def test_compute_fund_ranking_scheme_without_3y_history_is_insufficient():
    import app.services.analytics.fund_ranking as fund_ranking_module
    fund_ranking_module._category_ranking_cache.clear()
    db = _session()
    scheme = Scheme(id=uuid.uuid4(), amfi_code="N1", name="New Fund", amc_name="Test AMC", sebi_category="Equity Scheme - Flexi Cap Fund")
    db.add(scheme)
    db.commit()

    with (
        patch("app.services.analytics.fund_ranking.get_category_universe", new=AsyncMock(return_value=[scheme])),
        patch("app.services.analytics.fund_ranking._compute_category_returns_detailed", new=AsyncMock(return_value={})),  # no scheme has 3y history
    ):
        row = asyncio.run(compute_fund_ranking(db, scheme))

    assert row.insufficient_history is True
    assert row.composite_score is None
```

- [ ] **Step 7: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_fund_ranking.py -v -k compute_fund_ranking`
Expected: FAIL — `ImportError: cannot import name 'compute_fund_ranking'`

- [ ] **Step 8: Implement the category-wide computation + per-scheme finish + public API**

Append to `fund_ranking.py`:

```python
async def _compute_category_ranking_scores(
    db: Session, universe: list[Scheme], today: date
) -> dict[uuid.UUID, dict]:
    detailed = await _compute_category_returns_detailed(db, universe, today)
    if not detailed:
        return {}

    r1_by_scheme = {sid: r1 for sid, (r1, _r3, _r5, _b) in detailed.items() if r1 is not None}
    r3_by_scheme = {sid: r3 for sid, (_r1, r3, _r5, _b) in detailed.items()}
    r5_by_scheme = {sid: r5 for sid, (_r1, _r3, r5, _b) in detailed.items() if r5 is not None}
    blended_by_scheme = {sid: b for sid, (_r1, _r3, _r5, b) in detailed.items()}

    aaum_by_scheme = _latest_aaum_by_scheme(db, list(blended_by_scheme.keys()))
    category_avg_blended = _aum_weighted_average(blended_by_scheme, aaum_by_scheme)
    category_relative_by_scheme = (
        {sid: b - category_avg_blended for sid, b in blended_by_scheme.items()}
        if category_avg_blended is not None
        else {}
    )

    month_ends = month_end_dates(years_ago(today, _HISTORY_YEARS), today)
    series_by_scheme = build_monthly_series_bulk(db, list(detailed.keys()), month_ends)
    downside_by_scheme: dict[uuid.UUID, Decimal] = {}
    for scheme_id, series in series_by_scheme.items():
        deviation = compute_downside_deviation(monthly_returns(series))
        if deviation is not None:
            downside_by_scheme[scheme_id] = -deviation  # lower deviation ranks better

    ter_raw_by_scheme = {
        s.id: info[0] for s in universe if s.id in detailed and (info := _latest_ter_for_scheme(db, s.id)) is not None
    }
    negated_ter_by_scheme = {sid: -value for sid, value in ter_raw_by_scheme.items()}  # lower TER ranks better

    scores: dict[uuid.UUID, dict] = {}
    weights = _get_ranking_weights(db)
    for scheme_id in detailed:
        r1, r3, r5, blended = detailed[scheme_id]
        return_3y_rank = _rank_and_percentile(r3_by_scheme, scheme_id)
        return_5y_rank = _rank_and_percentile(r5_by_scheme, scheme_id) if scheme_id in r5_by_scheme else None
        category_relative_rank = (
            _rank_and_percentile(category_relative_by_scheme, scheme_id)
            if scheme_id in category_relative_by_scheme
            else None
        )
        volatility_rank = (
            _rank_and_percentile(downside_by_scheme, scheme_id) if scheme_id in downside_by_scheme else None
        )
        ter_rank = (
            _rank_and_percentile(negated_ter_by_scheme, scheme_id) if scheme_id in negated_ter_by_scheme else None
        )

        percentiles = {
            "return_3y": return_3y_rank[1] if return_3y_rank else None,
            "return_5y": return_5y_rank[1] if return_5y_rank else None,
            "category_relative": category_relative_rank[1] if category_relative_rank else None,
            "low_volatility": volatility_rank[1] if volatility_rank else None,
            "low_ter": ter_rank[1] if ter_rank else None,
        }
        composite = _renormalized_composite(percentiles, weights)

        scores[scheme_id] = {
            "composite": composite,
            "return_1y": r1,
            "return_3y": r3,
            "return_5y": r5,
            "category_relative": category_relative_by_scheme.get(scheme_id),
            "downside_deviation": -downside_by_scheme[scheme_id] if scheme_id in downside_by_scheme else None,
            "ter_value": ter_raw_by_scheme.get(scheme_id),
            "percentiles": percentiles,
        }
    return scores


async def _category_ranking_scores(
    db: Session, universe: list[Scheme], sebi_category: str, today: date
) -> dict[uuid.UUID, dict]:
    now = _category_ranking_clock()
    with _category_ranking_cache_lock:
        cached = _category_ranking_cache.get(sebi_category)
    if cached is not None:
        cached_at, cached_today, scores = cached
        if cached_today == today and now - cached_at <= _CATEGORY_RANKING_CACHE_TTL_SECONDS:
            return scores

    scores = await _compute_category_ranking_scores(db, universe, today)

    with _category_ranking_cache_lock:
        _category_ranking_cache[sebi_category] = (now, today, scores)
    return scores


def _empty_ranking_row(
    scheme: Scheme, *, category_unavailable: bool, insufficient_history: bool
) -> FundRankingRow:
    empty_component = FundRankingComponent(percentile=None, raw=None)
    return FundRankingRow(
        scheme_id=str(scheme.id),
        scheme_name=scheme.name,
        category_name=scheme.sebi_category or None,
        category_unavailable=category_unavailable,
        insufficient_history=insufficient_history,
        thin_category=False,
        composite_score=None,
        category_rank=None,
        category_size=0,
        percentile=None,
        return_1y=None,
        neighbors=[],
        components=FundRankingComponents(
            return_3y=empty_component, return_5y=empty_component, category_relative=empty_component,
            low_volatility=empty_component, low_ter=empty_component,
        ),
    )


def _decimal_or_none_str(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None


def _compute_neighbors(
    composite_by_scheme: dict[uuid.UUID, Decimal], scheme_names: dict[uuid.UUID, str], scheme_id: uuid.UUID
) -> list[FundRankingNeighbor]:
    ordered = sorted(composite_by_scheme, key=lambda sid: composite_by_scheme[sid], reverse=True)
    idx = ordered.index(scheme_id)
    above = ordered[max(0, idx - 2):idx]
    below = ordered[idx + 1:idx + 3]
    return [
        FundRankingNeighbor(
            scheme_id=str(sid), scheme_name=scheme_names[sid], category_rank=ordered.index(sid) + 1,
            composite_score=str(composite_by_scheme[sid]),
        )
        for sid in above + below
    ]


async def _finish_fund_ranking(
    db: Session, scheme: Scheme, universe: list[Scheme], scores: dict[uuid.UUID, dict], today: date
) -> FundRankingRow:
    scheme_scores = scores.get(scheme.id)
    if scheme_scores is None or scheme_scores["composite"] is None:
        return _empty_ranking_row(scheme, category_unavailable=False, insufficient_history=True)

    composite_by_scheme = {sid: s["composite"] for sid, s in scores.items() if s["composite"] is not None}
    rank_info = _rank_and_percentile(composite_by_scheme, scheme.id)
    if rank_info is None:
        return _empty_ranking_row(scheme, category_unavailable=False, insufficient_history=True)

    scheme_names = {s.id: s.name for s in universe}
    neighbors = _compute_neighbors(composite_by_scheme, scheme_names, scheme.id)
    percentiles = scheme_scores["percentiles"]

    today_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    db.add(SchemeRanking(
        scheme_id=scheme.id, computed_at=today_start, composite_score=rank_info[1].quantize(Decimal("0.01")),
        category_rank=rank_info[0], category_size=len(composite_by_scheme), percentile=rank_info[1].quantize(Decimal("0.01")),
        return_1y=scheme_scores["return_1y"], return_3y=scheme_scores["return_3y"], return_5y=scheme_scores["return_5y"],
        category_relative=scheme_scores["category_relative"], downside_deviation=scheme_scores["downside_deviation"],
        ter_value=scheme_scores["ter_value"], return_3y_percentile=percentiles["return_3y"],
        return_5y_percentile=percentiles["return_5y"], category_relative_percentile=percentiles["category_relative"],
        volatility_percentile=percentiles["low_volatility"], ter_percentile=percentiles["low_ter"],
    ))
    try:
        await commit_off_loop(db)
    except IntegrityError:
        db.rollback()

    return FundRankingRow(
        scheme_id=str(scheme.id), scheme_name=scheme.name, category_name=scheme.sebi_category,
        category_unavailable=False, insufficient_history=False, thin_category=len(universe) < _THIN_CATEGORY_THRESHOLD,
        composite_score=str(rank_info[1].quantize(Decimal("0.01"))), category_rank=rank_info[0],
        category_size=len(composite_by_scheme), percentile=str(rank_info[1].quantize(Decimal("0.01"))),
        return_1y=_decimal_or_none_str(scheme_scores["return_1y"]), neighbors=neighbors,
        components=FundRankingComponents(
            return_3y=FundRankingComponent(percentile=_decimal_or_none_str(percentiles["return_3y"]), raw=_decimal_or_none_str(scheme_scores["return_3y"])),
            return_5y=FundRankingComponent(percentile=_decimal_or_none_str(percentiles["return_5y"]), raw=_decimal_or_none_str(scheme_scores["return_5y"])),
            category_relative=FundRankingComponent(percentile=_decimal_or_none_str(percentiles["category_relative"]), raw=_decimal_or_none_str(scheme_scores["category_relative"])),
            low_volatility=FundRankingComponent(percentile=_decimal_or_none_str(percentiles["low_volatility"]), raw=_decimal_or_none_str(scheme_scores["downside_deviation"])),
            low_ter=FundRankingComponent(percentile=_decimal_or_none_str(percentiles["low_ter"]), raw=_decimal_or_none_str(scheme_scores["ter_value"])),
        ),
    )


async def compute_fund_ranking(db: Session, scheme: Scheme) -> FundRankingRow:
    if not scheme.sebi_category:
        return _empty_ranking_row(scheme, category_unavailable=True, insufficient_history=False)

    today = datetime.now(timezone.utc).date()
    universe = await get_category_universe(db, scheme.sebi_category)
    scores = await _category_ranking_scores(db, universe, scheme.sebi_category, today)
    return await _finish_fund_ranking(db, scheme, universe, scores, today)


async def compute_portfolio_ranking(db: Session, household_member_ids: list[uuid.UUID]) -> FundRankingSummary:
    holdings = await compute_holdings(db, household_member_ids)
    if not holdings:
        return FundRankingSummary(funds=[])

    unique_scheme_ids = {h.scheme_id for h in holdings}
    schemes_by_id = {
        str(s.id): s
        for s in db.query(Scheme).filter(Scheme.id.in_([uuid.UUID(sid) for sid in unique_scheme_ids])).all()
    }

    today = datetime.now(timezone.utc).date()
    schemes_by_category: dict[str, list[Scheme]] = {}
    row_by_scheme: dict[str, FundRankingRow] = {}
    for scheme_id_str, scheme in schemes_by_id.items():
        if not scheme.sebi_category:
            row_by_scheme[scheme_id_str] = _empty_ranking_row(scheme, category_unavailable=True, insufficient_history=False)
            continue
        schemes_by_category.setdefault(scheme.sebi_category, []).append(scheme)

    for sebi_category, category_schemes in schemes_by_category.items():
        universe = await get_category_universe(db, sebi_category)
        scores = await _category_ranking_scores(db, universe, sebi_category, today)
        for scheme in category_schemes:
            row_by_scheme[str(scheme.id)] = await _finish_fund_ranking(db, scheme, universe, scores, today)

    return FundRankingSummary(funds=[row_by_scheme[sid] for sid in unique_scheme_ids])


async def get_aggregate_fund_ranking(db: Session, user_id: uuid.UUID):
    from app.services.analytics.schemas import AggregateFundRankingResponse
    members = list_household_members(db, user_id)
    statuses = get_member_statuses(db, user_id)
    ranking = await compute_portfolio_ranking(db, [m.id for m in members])
    return AggregateFundRankingResponse(members=statuses, ranking=ranking)
```

- [ ] **Step 9: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_fund_ranking.py -v`
Expected: PASS (all tests in this file)

- [ ] **Step 10: Commit**

```bash
git add backend/app/services/analytics/fund_ranking.py backend/app/services/analytics/schemas.py backend/tests/services/analytics/test_fund_ranking.py
git commit -m "feat: add 5-factor fund ranking composite engine"
```

---

### Task 4: API wiring — bespoke endpoint + `_SECTIONS` registration

**Files:**
- Modify: `backend/app/api/analytics.py`
- Modify: `backend/app/services/analytics/recompute.py`
- Test: `backend/tests/services/analytics/test_recompute_fund_ranking_section.py`

**Interfaces:**
- Consumes: `compute_fund_ranking`, `compute_portfolio_ranking` (Task 3).

- [ ] **Step 1: Add the bespoke per-scheme endpoint**

In `backend/app/api/analytics.py`, add the import `from app.services.analytics.fund_ranking
import compute_fund_ranking` and `FundRankingRow` to the existing `schemas` import line, then
add, directly below the existing `get_fund_score` route:

```python
@router.get("/funds/{scheme_id}/ranking", response_model=FundRankingRow)
async def get_fund_ranking(
    scheme_id: uuid.UUID,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    scheme = db.get(Scheme, scheme_id)
    if scheme is None:
        raise HTTPException(status_code=404, detail="Scheme not found.")
    return await compute_fund_ranking(db, scheme)
```

- [ ] **Step 2: Write the failing section-registration test**

```python
# backend/tests/services/analytics/test_recompute_fund_ranking_section.py
def test_ranking_section_is_registered():
    from app.services.analytics.recompute import _SECTIONS
    names = [s.name for s in _SECTIONS]
    assert "ranking" in names
```

- [ ] **Step 3: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_recompute_fund_ranking_section.py -v`
Expected: FAIL — `AssertionError`

- [ ] **Step 4: Register the section**

In `backend/app/services/analytics/recompute.py`, add the import:

```python
from app.services.analytics.fund_ranking import compute_portfolio_ranking
from app.services.analytics.schemas import AggregateFundRankingResponse
```

and append to `_SECTIONS`:

```python
_SectionSpec("ranking", compute_portfolio_ranking, lambda statuses, result: AggregateFundRankingResponse(members=statuses, ranking=result)),
```

- [ ] **Step 5: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_recompute_fund_ranking_section.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/analytics.py backend/app/services/analytics/recompute.py backend/tests/services/analytics/test_recompute_fund_ranking_section.py
git commit -m "feat: wire fund ranking into the per-scheme and aggregate analytics endpoints"
```

---

### Task 5: Frontend — leaderboard/neighbors view

**Files:**
- Create: `frontend/src/features/analytics/FundRankingSection.tsx`
- Create: `frontend/src/features/analytics/FundRankingSection.test.tsx`
- Modify: `frontend/src/features/analytics/types.ts`
- Modify: `frontend/src/features/analytics/AnalyticsView.tsx`
- Modify: `frontend/src/features/analytics/print/PrintAnalyticsView.tsx`

**Interfaces:**
- Consumes: `GET /analytics/{scope}`'s `sections.ranking.payload` — the
  `AggregateFundRankingResponse` shape from Task 3/4.

- [ ] **Step 1: Add the types**

In `frontend/src/features/analytics/types.ts`, append (mirroring the backend Pydantic
schemas from Task 3 field-for-field):

```ts
export interface FundRankingNeighbor {
  scheme_id: string;
  scheme_name: string;
  category_rank: number;
  composite_score: string;
}

export interface FundRankingComponent {
  percentile: string | null;
  raw: string | null;
}

export interface FundRankingComponents {
  return_3y: FundRankingComponent;
  return_5y: FundRankingComponent;
  category_relative: FundRankingComponent;
  low_volatility: FundRankingComponent;
  low_ter: FundRankingComponent;
}

export interface FundRankingRow {
  scheme_id: string;
  scheme_name: string;
  category_name: string | null;
  category_unavailable: boolean;
  insufficient_history: boolean;
  thin_category: boolean;
  composite_score: string | null;
  category_rank: number | null;
  category_size: number;
  percentile: string | null;
  return_1y: string | null;
  neighbors: FundRankingNeighbor[];
  components: FundRankingComponents;
}

export interface FundRankingSummary {
  funds: FundRankingRow[];
}

export interface AggregateFundRankingResponse {
  members: MemberStatus[];
  ranking: FundRankingSummary;
}
```

Add `"ranking"` to `ANALYTICS_SECTION_NAMES`, and add `ranking: FundRankingSummary | null;`
to `AnalyticsExportPayload`.

- [ ] **Step 2: Write the failing component test**

```tsx
// frontend/src/features/analytics/FundRankingSection.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FundRankingSection } from "./FundRankingSection";
import type { FundRankingSummary } from "./types";

const summary: FundRankingSummary = {
  funds: [
    {
      scheme_id: "s8", scheme_name: "HDFC Flexi Cap Fund", category_name: "Flexi Cap",
      category_unavailable: false, insufficient_history: false, thin_category: false,
      composite_score: "81.40", category_rank: 8, category_size: 62, percentile: "87.10",
      return_1y: "0.15",
      neighbors: [
        { scheme_id: "s6", scheme_name: "Parag Parikh Flexi Cap", category_rank: 6, composite_score: "83.90" },
        { scheme_id: "s7", scheme_name: "Quant Flexi Cap", category_rank: 7, composite_score: "82.70" },
        { scheme_id: "s9", scheme_name: "JM Flexi Cap", category_rank: 9, composite_score: "79.80" },
        { scheme_id: "s10", scheme_name: "Franklin Flexi Cap", category_rank: 10, composite_score: "78.10" },
      ],
      components: {
        return_3y: { percentile: "92", raw: "0.241" },
        return_5y: { percentile: "88", raw: "0.198" },
        category_relative: { percentile: "70", raw: "0.02" },
        low_volatility: { percentile: "60", raw: "0.08" },
        low_ter: { percentile: null, raw: null },
      },
    },
    {
      scheme_id: "sN", scheme_name: "New Fund", category_name: "Flexi Cap", category_unavailable: false,
      insufficient_history: true, thin_category: false, composite_score: null, category_rank: null,
      category_size: 0, percentile: null, return_1y: null, neighbors: [],
      components: { return_3y: { percentile: null, raw: null }, return_5y: { percentile: null, raw: null }, category_relative: { percentile: null, raw: null }, low_volatility: { percentile: null, raw: null }, low_ter: { percentile: null, raw: null } },
    },
  ],
};

describe("FundRankingSection", () => {
  it("renders the leaderboard with (you) tagged and all 4 neighbors in rank order", () => {
    render(<FundRankingSection data={summary} isLoading={false} />);
    expect(screen.getByText(/HDFC Flexi Cap Fund/)).toBeInTheDocument();
    expect(screen.getByText(/\(you\)/i)).toBeInTheDocument();
    expect(screen.getByText("Parag Parikh Flexi Cap")).toBeInTheDocument();
    expect(screen.getByText("Franklin Flexi Cap")).toBeInTheDocument();
  });

  it("shows the Insufficient History badge and hides the leaderboard for an unranked fund", () => {
    render(<FundRankingSection data={summary} isLoading={false} />);
    expect(screen.getByText("Insufficient History")).toBeInTheDocument();
  });

  it("tap-through reveals the 5-factor breakdown with a dash for a missing component", () => {
    render(<FundRankingSection data={summary} isLoading={false} />);
    fireEvent.click(screen.getByText(/HDFC Flexi Cap Fund/));
    expect(screen.getByText(/92nd/)).toBeInTheDocument();
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run, confirm failure**

Run: `cd frontend && npx vitest run src/features/analytics/FundRankingSection.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the component**

```tsx
// frontend/src/features/analytics/FundRankingSection.tsx
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercentString } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";
import type { FundRankingComponent, FundRankingRow, FundRankingSummary } from "./types";

export interface FundRankingSectionProps {
  data: FundRankingSummary | null;
  isLoading?: boolean;
  className?: string;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function ComponentRow({ label, weight, component }: { label: string; weight: string; component: FundRankingComponent }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[var(--color-text-secondary)]">{label} ({weight})</span>
      <span className="font-semibold text-[var(--color-ink)] tabular-nums">
        {component.percentile !== null ? `${ordinal(Math.round(Number(component.percentile)))} pct` : "—"}
        {component.raw !== null ? ` · ${formatPercentString(component.raw)}` : ""}
      </span>
    </div>
  );
}

function FundLeaderboardCard({ fund }: { fund: FundRankingRow }) {
  const [expanded, setExpanded] = useState(false);

  if (fund.category_unavailable) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4 sm:p-5 flex items-center justify-between">
        <span className="font-display text-sm font-bold text-[var(--color-ink)]">{fund.scheme_name}</span>
        <Badge variant="outline">Category Unavailable</Badge>
      </div>
    );
  }

  if (fund.insufficient_history) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4 sm:p-5 space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-bold text-[var(--color-ink)]">{fund.scheme_name}</span>
          <Badge variant="outline">Insufficient History</Badge>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Not ranked yet — needs 3 years of NAV history to be eligible.
        </p>
      </div>
    );
  }

  const above = fund.neighbors.filter((n) => fund.category_rank !== null && n.category_rank < fund.category_rank).sort((a, b) => a.category_rank - b.category_rank);
  const below = fund.neighbors.filter((n) => fund.category_rank !== null && n.category_rank > fund.category_rank).sort((a, b) => a.category_rank - b.category_rank);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 overflow-hidden">
      <button type="button" onClick={() => setExpanded((prev) => !prev)} className="w-full text-left p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="font-display text-sm font-bold text-[var(--color-ink)]">{fund.scheme_name}</span>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {fund.category_name} · {fund.category_size} funds
            </p>
          </div>
          <div className="flex items-center gap-2">
            {fund.thin_category && <Badge variant="outline">Thin Category ({fund.category_size} peers)</Badge>}
            <span className="text-xs font-semibold text-[var(--color-ink)] tabular-nums">
              #{fund.category_rank} of {fund.category_size} · Top {100 - Math.round(Number(fund.percentile ?? "0"))}%
            </span>
          </div>
        </div>
        <div className="space-y-1">
          {above.map((n) => (
            <div key={n.scheme_id} className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
              <span>#{n.category_rank} {n.scheme_name}</span>
              <span className="tabular-nums">{n.composite_score}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs font-bold text-[var(--color-ink)] bg-[var(--color-accent)]/10 rounded-lg px-2 py-1">
            <span>#{fund.category_rank} {fund.scheme_name} (you)</span>
            <span className="tabular-nums">{fund.composite_score}</span>
          </div>
          {below.map((n) => (
            <div key={n.scheme_id} className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
              <span>#{n.category_rank} {n.scheme_name}</span>
              <span className="tabular-nums">{n.composite_score}</span>
            </div>
          ))}
        </div>
      </button>
      {expanded && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-2 border-t border-[var(--color-border)]/60 pt-3">
          <ComponentRow label="3Y return" weight="25%" component={fund.components.return_3y} />
          <ComponentRow label="5Y return" weight="25%" component={fund.components.return_5y} />
          <ComponentRow label="Category-relative" weight="20%" component={fund.components.category_relative} />
          <ComponentRow label="Low volatility" weight="15%" component={fund.components.low_volatility} />
          <ComponentRow label="Low TER" weight="15%" component={fund.components.low_ter} />
        </div>
      )}
    </div>
  );
}

export function FundRankingSection({ data, isLoading = false, className }: FundRankingSectionProps) {
  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-4", className)}>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  const funds = data?.funds ?? [];

  return (
    <section className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-6 transition-colors duration-200", className)}>
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">Fund Ranking</h2>
        <Trophy className="h-4 w-4 text-[var(--color-accent)]" />
      </div>

      {funds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">No fund ranking data available</p>
        </div>
      ) : (
        <div className="space-y-3">
          {funds.map((fund) => (
            <FundLeaderboardCard key={fund.scheme_id} fund={fund} />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run, confirm pass**

Run: `cd frontend && npx vitest run src/features/analytics/FundRankingSection.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Wire into `AnalyticsView.tsx` and `PrintAnalyticsView.tsx`**

Same pattern as every other section — add the import, add `ranking: "ranking"` to
`AGGREGATE_FIELD`, add `const ranking = unwrap<FundRankingSummary>("ranking");` +
`isSectionSettled` loading flag, render `<FundRankingSection data={ranking}
isLoading={rankingLoading} />` as a sibling section placed after `CategoryRankingSection` per
the frontend spec's placement note, add `ranking` to `AnalyticsExportPayload`'s construction
in `handleDownloadPdf`, and add the equivalent `<div className="print-section"><FundRankingSection
data={payload.ranking} isLoading={false} /></div>` block to `PrintAnalyticsView.tsx`.

- [ ] **Step 7: Run the existing suites to confirm no regression**

Run: `cd frontend && npx vitest run src/features/analytics/AnalyticsView.test.tsx src/features/analytics/print/PrintAnalyticsView.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/analytics/FundRankingSection.tsx frontend/src/features/analytics/FundRankingSection.test.tsx frontend/src/features/analytics/types.ts frontend/src/features/analytics/AnalyticsView.tsx frontend/src/features/analytics/print/PrintAnalyticsView.tsx
git commit -m "feat: add FundRankingSection leaderboard to the Analytics dashboard and PDF export"
```

---

## Self-Review

**1. Spec coverage:** Leaderboard/neighbors layout, 2-above-2-below by rank, `(you)` row
styling, tap-through 5-factor breakdown (Task 5) ✓; composite formula/weights/renormalization
(Task 1, 3, Review Focus #1/#2) ✓; `Insufficient History`/`Thin Category`/`Category
Unavailable` states with verbatim badge copy (Task 3, 5) ✓; 1Y display-only field (Task 1, 3,
5) ✓; no raw-number-as-comparable display (Task 5's `ComponentRow` always pairs percentile +
raw) ✓; pre-computed server-side neighbors, no client ranking logic (Task 3, 5) ✓; both API
shapes (bespoke per-scheme + aggregate dispatcher section) mirroring Scorer v1's existing
precedent exactly (Task 4) ✓.

**2. Placeholder scan:** No "TBD"/"add later"/"similar to Task N" patterns. The frontend
spec's two explicitly-out-of-scope items (historical ranking trend, cross-category
comparison) are intentionally not built — consistent with the spec's own §7, not an
oversight.

**3. Type consistency:** `FundRankingRow`/`FundRankingSummary`/`AggregateFundRankingResponse`/
`FundRankingNeighbor`/`FundRankingComponent`/`FundRankingComponents` field names match
identically between Task 3 (Pydantic), Task 5 (TypeScript), and every test.
`_renormalized_composite`'s signature (`dict[str, Decimal | None]`, `dict[str, Decimal]`) is
used identically in `_compute_category_ranking_scores`. `_compute_category_returns_detailed`'s
return shape (`tuple[Decimal | None, Decimal, Decimal | None, Decimal]`) is unpacked
identically everywhere it's consumed (Task 2's own refactor, Task 3's `_compute_category_ranking_scores`).

**4. Review Focus coverage:** #1 (missing 5Y) — Task 3 Step 2's
`test_renormalized_composite_missing_5y_and_ter_renormalizes_remaining_three`. #2 (missing
TER) — same test (TER is the other missing component in it). #3 (rank #1/last) — Task 3 Step
6's `test_compute_fund_ranking_top_rank_has_no_above_neighbors`. #4 (concurrent-write
idempotency) — `_finish_fund_ranking`'s `IntegrityError` swallow mirrors `fund_scores`'
already-tested pattern verbatim; not re-tested here since `scorer.py`'s equivalent path has
no dedicated concurrency test either (same established risk acceptance, not a new gap). #5
(`ranking_weights` empty) — Task 3 Step 2's `test_get_ranking_weights_falls_back_to_defaults_when_table_empty`.
