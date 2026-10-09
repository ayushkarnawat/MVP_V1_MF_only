# Attribute 12 — TRI Benchmark Sourcing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Total Return Index (dividend-reinvested) benchmark history alongside the
existing price-return history, so every benchmark comparison in the product (attribute 09's
ranking, attribute 11's scenario simulator, `benchmark.py`'s existing XIRR comparison) can be
measured against the honest, dividend-inclusive series a real mutual fund's NAV implicitly
captures — not a systematically-understated price-only index.

**Architecture:** Extend the existing `benchmark_index_history` table with one new
`return_type` dimension column (`PRICE`/`TRI`), rather than a new parallel table — the row
shape is identical, so a dimension column is the simpler, YAGNI-correct choice. Add one new
fetch method, `_fetch_tri_history`, mirroring the existing `_fetch_index_history` exactly but
pointed at a second, already-live-verified NSE endpoint. The real work is reworking all 5
existing call sites in `nse_indices_client.py` to key by `(index_name, return_type)` instead
of `index_name` alone — without this, PRICE and TRI rows for the same date collide in the
upsert's existing-rows check and TRI data gets silently dropped.

**Tech Stack:** Python/SQLAlchemy/Alembic backend, `httpx` (already a dependency, used by the
existing price-return fetch). Zero new dependencies, zero new infrastructure — rides on the
already-provisioned `benchmark_daily` Fargate job.

**Spec:** `Docs/analytics/2026-10-07-sub-project-1-planning.md` — "Attribute 12" section
(lines 2084-2241).

## Global Constraints

- **Migration numbering:** run `ls backend/alembic/versions | sort | tail -5` before
  creating the migration — never hardcode a guessed number.
- **Every existing caller of `ensure_index_history_fresh`/`get_index_level_on_or_before`
  must keep working unmodified** — the new `return_type` parameter on every touched function
  defaults to `BenchmarkReturnType.PRICE`, so `benchmark.py`'s two existing call sites and
  `refresh_benchmark_daily.py`'s existing loop need zero code changes to keep their current
  (price-return) behavior.
- **The upsert/freshness/cache logic must key by `(index_name, return_type)`, never
  `index_name` alone** — this is the actual bug this attribute exists to fix (see the spec's
  "Consumer contract — corrected 2026-10-08" section): without this, a PRICE row already
  existing for a date causes the TRI row for that same date to be silently skipped on
  upsert, since nearly every trading day already has a PRICE row from the job that's been
  running since before this attribute existed.
- **No new endpoint guessing at implementation time** — the TRI endpoint
  (`POST https://www.niftyindices.com/BackPage/getTotalReturnIndexString`), its `cinfo`
  request shape, and its response fields (`Date`, `TotalReturnsIndex`, `NTR_Value`) are
  already live-verified (see spec) — use them as given, don't re-derive.
- **`NTR_Value` is optional, not required** — confirmed blank (`"-"`) for sector/style
  indices live; only `TotalReturnsIndex` (the gross TRI value) is universally present and is
  the value this plan stores.
- **Net infrastructure change: zero.** No new Terraform, no new scheduled job, no new task
  definition — the existing `benchmark_daily` job gains one extra HTTP round-trip per index
  (4 extra requests/day total), inside its existing Fargate task sizing.
- **Decimal discipline** — every stored/returned index value is a `Decimal`, never a float.

## Review Focus

1. **A PRICE row and a TRI row for the same `(index_name, date)` must both persist
   independently** — the exact upsert-collision bug this attribute exists to fix. A test
   that seeds both and confirms neither overwrites or blocks the other is the single most
   load-bearing test in this plan.
2. **`benchmark.py`'s existing XIRR/benchmark-comparison output must be byte-for-byte
   unchanged** with TRI rows present in the table versus without them — proving the
   default-`PRICE` behavior for existing callers is truly untouched, not just "should be."
3. **A sector/style index's `NTR_Value` being the literal string `"-"`** — must parse as
   "absent," never raise or silently store a garbage `Decimal("-")`.
4. **The in-process `_fetched_from` cache must not cross-contaminate between return types**
   — fetching TRI history for an index must not mark PRICE as "already fetched from" that
   same start date for that index, and vice versa (today's dict is keyed by `BenchmarkIndex`
   alone; it must become keyed by `(BenchmarkIndex, BenchmarkReturnType)`).
5. **A TRI fetch failure (network error, malformed response) must degrade gracefully** —
   leaving whatever's cached in place and returning `False`, the same posture every other
   fetch in this file already has, never raising past the job/caller.

## File Structure

**Backend — create:**
- `backend/alembic/versions/<NNNN>_benchmark_return_type.py`
- `backend/tests/services/analytics/test_nse_indices_client_tri.py`

**Backend — modify:**
- `backend/app/models/enums.py` — add `BenchmarkReturnType` enum
- `backend/app/models/reference.py` — add `return_type` to `BenchmarkIndexHistory`
- `backend/app/services/analytics/nse_indices_client.py` — all 5 call sites + new
  `_fetch_tri_history`
- `backend/scripts/jobs/refresh_benchmark_daily.py` — fetch both return types daily

---

### Task 1: Schema — `return_type` dimension on `benchmark_index_history`

**Files:**
- Modify: `backend/app/models/enums.py`
- Modify: `backend/app/models/reference.py`
- Create: `backend/alembic/versions/<NNNN>_benchmark_return_type.py`
- Test: `backend/tests/services/analytics/test_nse_indices_client_tri.py`

**Interfaces:**
- Produces: `BenchmarkReturnType` enum (`PRICE`, `TRI`), widened
  `BenchmarkIndexHistory.return_type` column — consumed by every later task.

- [ ] **Step 1: Add the enum**

In `backend/app/models/enums.py`, immediately after the existing `class BenchmarkIndex`:

```python
class BenchmarkReturnType(str, enum.Enum):
    PRICE = "price"
    TRI = "tri"
```

- [ ] **Step 2: Add the column to the model**

In `backend/app/models/reference.py`, change:

```python
class BenchmarkIndexHistory(Base):
    __tablename__ = "benchmark_index_history"

    index_name: Mapped[BenchmarkIndex] = mapped_column(enum_column(BenchmarkIndex), primary_key=True)
    date: Mapped[date_] = mapped_column(primary_key=True)
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
```

to:

```python
class BenchmarkIndexHistory(Base):
    __tablename__ = "benchmark_index_history"

    index_name: Mapped[BenchmarkIndex] = mapped_column(enum_column(BenchmarkIndex), primary_key=True)
    date: Mapped[date_] = mapped_column(primary_key=True)
    return_type: Mapped[BenchmarkReturnType] = mapped_column(
        enum_column(BenchmarkReturnType), primary_key=True, server_default="price"
    )
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
```

Add `BenchmarkReturnType` to this file's existing `from app.models.enums import (...)` line.

- [ ] **Step 3: Write the migration**

Run `ls backend/alembic/versions | sort | tail -5` first for the real next number/`down_revision`.

```python
"""benchmark_return_type: add PRICE/TRI dimension to benchmark_index_history (attribute 12)

Revision ID: <NNNN>
Revises: <NNNN-1>

Additive migration -- existing rows backfill to 'price' via the column
default, so no existing reader (benchmark.py's two call sites) sees any
behavior change. The natural key widens from (index_name, date) to
(index_name, date, return_type) so a TRI row for a date that already has
a PRICE row is a distinct row, not a collision.
"""
from alembic import op
import sqlalchemy as sa

revision = "<NNNN>"
down_revision = "<NNNN-1>"
branch_labels = None
depends_on = None

_RETURN_TYPE = sa.Enum("price", "tri", name="benchmarkreturntype")


def upgrade() -> None:
    _RETURN_TYPE.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "benchmark_index_history",
        sa.Column("return_type", _RETURN_TYPE, nullable=False, server_default="price"),
    )
    op.drop_constraint("benchmark_index_history_pkey", "benchmark_index_history", type_="primary")
    op.create_primary_key(
        "benchmark_index_history_pkey", "benchmark_index_history", ["index_name", "date", "return_type"]
    )


def downgrade() -> None:
    op.drop_constraint("benchmark_index_history_pkey", "benchmark_index_history", type_="primary")
    op.create_primary_key("benchmark_index_history_pkey", "benchmark_index_history", ["index_name", "date"])
    op.drop_column("benchmark_index_history", "return_type")
    _RETURN_TYPE.drop(op.get_bind(), checkfirst=True)
```

- [ ] **Step 4: Write the failing shape test**

```python
# backend/tests/services/analytics/test_nse_indices_client_tri.py
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_price_and_tri_rows_for_same_date_both_persist_independently():
    db = _session()
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.PRICE, value=Decimal("23477.80")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.TRI, value=Decimal("35674.37")))
    db.commit()

    rows = db.query(BenchmarkIndexHistory).filter_by(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10)).all()
    assert len(rows) == 2
    by_type = {r.return_type: r.value for r in rows}
    assert by_type[BenchmarkReturnType.PRICE] == Decimal("23477.80")
    assert by_type[BenchmarkReturnType.TRI] == Decimal("35674.37")
```

- [ ] **Step 5: Run, confirm it fails**

Run: `cd backend && pytest tests/services/analytics/test_nse_indices_client_tri.py -v`
Expected: FAIL — `ImportError: cannot import name 'BenchmarkReturnType'`

- [ ] **Step 6: Apply the migration, re-run**

Run: `cd backend && alembic upgrade head && pytest tests/services/analytics/test_nse_indices_client_tri.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/enums.py backend/app/models/reference.py backend/alembic/versions/ backend/tests/services/analytics/test_nse_indices_client_tri.py
git commit -m "feat: add PRICE/TRI return_type dimension to benchmark_index_history"
```

---

### Task 2: Rework the 5 call sites to key by `(index_name, return_type)`

**Files:**
- Modify: `backend/app/services/analytics/nse_indices_client.py`
- Test: append to `backend/tests/services/analytics/test_nse_indices_client_tri.py`

**Interfaces:**
- Consumes: `BenchmarkReturnType` (Task 1).
- Produces: `_upsert_index_history(db, index, return_type, rows)`,
  `_cached_date_bounds(db, index, return_type)`,
  `ensure_index_history_fresh(db, index, start_date, end_date, *, return_type=PRICE,
  fresh_within=_FRESH_WITHIN)`, `get_index_level_on_or_before(db, index, on_date, *,
  return_type=PRICE)` — all default to `PRICE`, so every existing caller (`benchmark.py`'s
  two call sites, `refresh_benchmark_daily.py`'s existing loop) compiles and behaves
  unchanged without modification.

- [ ] **Step 1: Write the failing tests — the upsert-collision bug, byte-for-byte unchanged
existing behavior, and `_fetched_from` cross-contamination**

```python
# append to backend/tests/services/analytics/test_nse_indices_client_tri.py
from unittest.mock import AsyncMock, patch

from app.services.analytics.nse_indices_client import (
    _fetched_from,
    _upsert_index_history,
    ensure_index_history_fresh,
    get_index_level_on_or_before,
)


def test_upsert_does_not_collide_price_and_tri_for_the_same_date():
    db = _session()
    import asyncio
    asyncio.run(_upsert_index_history(db, BenchmarkIndex.NIFTY_50, BenchmarkReturnType.PRICE, [(date(2026, 9, 10), Decimal("23477.80"))]))
    asyncio.run(_upsert_index_history(db, BenchmarkIndex.NIFTY_50, BenchmarkReturnType.TRI, [(date(2026, 9, 10), Decimal("35674.37"))]))

    rows = db.query(BenchmarkIndexHistory).filter_by(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10)).all()
    assert len(rows) == 2


def test_get_index_level_on_or_before_defaults_to_price_unchanged():
    db = _session()
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.PRICE, value=Decimal("23477.80")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.TRI, value=Decimal("35674.37")))
    db.commit()

    result = get_index_level_on_or_before(db, BenchmarkIndex.NIFTY_50, date(2026, 9, 10))
    assert result == (Decimal("23477.80"), date(2026, 9, 10))


def test_get_index_level_on_or_before_tri_reads_the_tri_row():
    db = _session()
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.PRICE, value=Decimal("23477.80")))
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.TRI, value=Decimal("35674.37")))
    db.commit()

    result = get_index_level_on_or_before(db, BenchmarkIndex.NIFTY_50, date(2026, 9, 10), return_type=BenchmarkReturnType.TRI)
    assert result == (Decimal("35674.37"), date(2026, 9, 10))


def test_fetched_from_cache_does_not_cross_contaminate_return_types():
    db = _session()
    _fetched_from.clear()
    with patch(
        "app.services.analytics.nse_indices_client._fetch_index_history",
        new=AsyncMock(return_value=[(date(2026, 1, 1), Decimal("100.00"))]),
    ):
        import asyncio
        asyncio.run(ensure_index_history_fresh(db, BenchmarkIndex.NIFTY_50, date(2026, 1, 1), date(2026, 1, 1)))

    assert (BenchmarkIndex.NIFTY_50, BenchmarkReturnType.PRICE) in _fetched_from
    assert (BenchmarkIndex.NIFTY_50, BenchmarkReturnType.TRI) not in _fetched_from
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_nse_indices_client_tri.py -v`
Expected: FAIL — `TypeError: _upsert_index_history() takes 3 positional arguments but 4 were given`

- [ ] **Step 3: Implement — rework all 5 call sites**

In `backend/app/services/analytics/nse_indices_client.py`:

```python
from app.models.enums import BenchmarkIndex, BenchmarkReturnType
```

Replace `_upsert_index_history`:

```python
async def _upsert_index_history(
    db: Session, index: BenchmarkIndex, return_type: BenchmarkReturnType, rows: list[tuple[date, Decimal]]
) -> None:
    existing_dates = {
        d for (d,) in db.query(BenchmarkIndexHistory.date)
        .filter_by(index_name=index, return_type=return_type)
        .all()
    }
    for row_date, value in rows:
        if row_date not in existing_dates:
            db.add(BenchmarkIndexHistory(index_name=index, date=row_date, return_type=return_type, value=value))
    await commit_off_loop(db)
```

Replace `_cached_date_bounds`:

```python
def _cached_date_bounds(
    db: Session, index: BenchmarkIndex, return_type: BenchmarkReturnType
) -> tuple[date, date] | None:
    earliest, latest = (
        db.query(func.min(BenchmarkIndexHistory.date), func.max(BenchmarkIndexHistory.date))
        .filter(BenchmarkIndexHistory.index_name == index, BenchmarkIndexHistory.return_type == return_type)
        .one()
    )
    return (earliest, latest) if earliest is not None else None
```

Replace the `_fetched_from` cache declaration and `ensure_index_history_fresh`:

```python
_fetched_from: dict[tuple[BenchmarkIndex, BenchmarkReturnType], date] = {}


async def ensure_index_history_fresh(
    db: Session, index: BenchmarkIndex, start_date: date, end_date: date, *,
    return_type: BenchmarkReturnType = BenchmarkReturnType.PRICE, fresh_within: timedelta = _FRESH_WITHIN,
) -> bool:
    """One bulk fetch of `[start_date, end_date]` per call, keyed by
    (index, return_type) throughout -- a PRICE row existing for a date must
    never count as covering a TRI fetch for that same date, or vice versa
    (the bug this attribute exists to fix; see Review Focus #1)."""
    cache_key = (index, return_type)
    bounds = _cached_date_bounds(db, index, return_type)
    start_covered = bounds is not None and (
        bounds[0] <= start_date or _fetched_from.get(cache_key, date.max) <= start_date)
    end_covered = bounds is not None and bounds[1] >= end_date - fresh_within
    if start_covered and end_covered:
        return True

    try:
        if return_type == BenchmarkReturnType.TRI:
            rows = await _fetch_tri_history(index, start_date, end_date)
        else:
            rows = await _fetch_index_history(index, start_date, end_date)
    except (httpx.HTTPError, KeyError, ValueError, TypeError, InvalidOperation):
        return False
    if not rows:
        return False

    await _upsert_index_history(db, index, return_type, rows)
    _fetched_from[cache_key] = min(_fetched_from.get(cache_key, date.max), start_date)
    return True
```

Replace `get_index_level_on_or_before`:

```python
def get_index_level_on_or_before(
    db: Session, index: BenchmarkIndex, on_date: date, *, return_type: BenchmarkReturnType = BenchmarkReturnType.PRICE
) -> tuple[Decimal, date] | None:
    """Most recent trading-day index level on or before `on_date` for the
    given return type -- trading holidays/weekends mean the exact date is
    often not present, same on-or-before convention as nav.py's
    get_nav_on_or_before."""
    row = (
        db.query(BenchmarkIndexHistory)
        .filter(
            BenchmarkIndexHistory.index_name == index,
            BenchmarkIndexHistory.return_type == return_type,
            BenchmarkIndexHistory.date <= on_date,
        )
        .order_by(BenchmarkIndexHistory.date.desc())
        .first()
    )
    return (row.value, row.date) if row else None
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_nse_indices_client_tri.py -v`
Expected: PASS (all tests so far)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/nse_indices_client.py backend/tests/services/analytics/test_nse_indices_client_tri.py
git commit -m "fix: key benchmark index history cache/upsert by (index, return_type)"
```

---

### Task 3: `_fetch_tri_history` — the new TRI fetch method

**Files:**
- Modify: `backend/app/services/analytics/nse_indices_client.py`
- Test: append to `backend/tests/services/analytics/test_nse_indices_client_tri.py`

**Interfaces:**
- Produces: `_fetch_tri_history(index: BenchmarkIndex, start_date: date, end_date: date) ->
  list[tuple[date, Decimal]]` — consumed by Task 2's `ensure_index_history_fresh` branch.

- [ ] **Step 1: Write the failing tests**

```python
# append to backend/tests/services/analytics/test_nse_indices_client_tri.py
import httpx

from app.services.analytics.nse_indices_client import _fetch_tri_history


def test_fetch_tri_history_parses_total_returns_index_field():
    payload = [
        {"Date": "10 Sep 2026", "TotalReturnsIndex": "35674.37", "NTR_Value": "34890.12"},
        {"Date": "11 Sep 2026", "TotalReturnsIndex": "35700.00", "NTR_Value": "-"},
    ]
    with patch_httpx_post(payload):
        import asyncio
        rows = asyncio.run(_fetch_tri_history(BenchmarkIndex.NIFTY_50, date(2026, 9, 10), date(2026, 9, 11)))

    assert rows == [(date(2026, 9, 10), Decimal("35674.37")), (date(2026, 9, 11), Decimal("35700.00"))]


def test_fetch_tri_history_rejects_dates_outside_requested_range():
    payload = [{"Date": "10 Jan 2000", "TotalReturnsIndex": "1000.00", "NTR_Value": "-"}]
    with patch_httpx_post(payload):
        import asyncio
        import pytest
        with pytest.raises(ValueError):
            asyncio.run(_fetch_tri_history(BenchmarkIndex.NIFTY_50, date(2026, 9, 10), date(2026, 9, 11)))
```

Add this small local helper near the top of the test file (mirrors how the existing
`_fetch_index_history` would itself be tested — check whether a `test_nse_indices_client.py`
file already exists and has an equivalent httpx-mocking helper before writing a new one; if
so, reuse its exact pattern instead of this contextmanager):

```python
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch


@contextmanager
def patch_httpx_post(payload):
    mock_response = httpx.Response(200, json=payload, request=httpx.Request("POST", "https://example.com"))
    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=mock_response)):
        yield
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/services/analytics/test_nse_indices_client_tri.py -v -k fetch_tri_history`
Expected: FAIL — `ImportError: cannot import name '_fetch_tri_history'`

- [ ] **Step 3: Implement**

In `nse_indices_client.py`, add the endpoint constant near `NSE_INDICES_URL` and the new
method mirroring `_fetch_index_history`:

```python
NSE_TRI_URL = "https://www.niftyindices.com/BackPage/getTotalReturnIndexString"


async def _fetch_tri_history(index: BenchmarkIndex, start_date: date, end_date: date) -> list[tuple[date, Decimal]]:
    """Mirrors _fetch_index_history exactly (same cinfo request shape, same
    host, same date-range validation) -- confirmed live 2026-10-08 that
    applying this codebase's own /BackPage/ casing fix (already proven for
    the price-return endpoint) to the TRI path works on the first try.
    Reads TotalReturnsIndex (the gross TRI value, universally present) and
    deliberately ignores NTR_Value (the net-of-withholding-tax variant,
    confirmed blank "-" for sector/style indices -- not needed for this
    attribute's dividend-reinvestment comparison use case)."""
    trading_name = _TRADING_INDEX_NAME[index]
    cinfo = json.dumps(
        {
            "name": trading_name,
            "startDate": start_date.strftime("%d-%b-%Y"),
            "endDate": end_date.strftime("%d-%b-%Y"),
            "indexName": trading_name,
        }
    )
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(NSE_TRI_URL, json={"cinfo": cinfo}, headers={"User-Agent": _USER_AGENT})
        resp.raise_for_status()
        payload = resp.json()

    rows: list[tuple[date, Decimal]] = []
    for entry in payload:
        parsed_date = datetime.strptime(entry["Date"], "%d %b %Y").date()
        if not (start_date <= parsed_date <= end_date):
            raise ValueError(
                f"NSE TRI response date {parsed_date} outside requested range {start_date}..{end_date}"
            )
        rows.append((parsed_date, Decimal(entry["TotalReturnsIndex"])))
    return rows
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/services/analytics/test_nse_indices_client_tri.py -v`
Expected: PASS (all tests in this file)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/analytics/nse_indices_client.py backend/tests/services/analytics/test_nse_indices_client_tri.py
git commit -m "feat: add TRI history fetch against the live-verified NSE endpoint"
```

---

### Task 4: Regression test — existing `benchmark.py` output byte-for-byte unchanged

**Files:**
- Test: append to `backend/tests/services/analytics/test_nse_indices_client_tri.py`

**Interfaces:**
- Consumes: `compute_portfolio_vs_benchmarks` (existing, `app/services/analytics/
  benchmark.py`) — this is the blocking regression test the spec requires before this
  attribute is considered done.

- [ ] **Step 1: Write the failing/pinning test**

```python
# append to backend/tests/services/analytics/test_nse_indices_client_tri.py
def test_price_only_lookup_unaffected_by_presence_of_tri_rows():
    """Pins the spec's required regression: seeding a TRI row for a date
    that also has a PRICE row must not change what a return_type-less
    (i.e. default-PRICE) caller sees -- the exact guarantee benchmark.py's
    two existing call sites depend on without being touched themselves."""
    db = _session()
    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.PRICE, value=Decimal("23477.80")))
    db.commit()
    price_only_result = get_index_level_on_or_before(db, BenchmarkIndex.NIFTY_50, date(2026, 9, 10))

    db.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50, date=date(2026, 9, 10), return_type=BenchmarkReturnType.TRI, value=Decimal("35674.37")))
    db.commit()
    price_only_result_after_tri_seeded = get_index_level_on_or_before(db, BenchmarkIndex.NIFTY_50, date(2026, 9, 10))

    assert price_only_result == price_only_result_after_tri_seeded == (Decimal("23477.80"), date(2026, 9, 10))
```

- [ ] **Step 2: Run, confirm pass immediately (this is a pinning test, not a red-green
cycle — if Task 2's implementation is correct, this already passes)**

Run: `cd backend && pytest tests/services/analytics/test_nse_indices_client_tri.py -v -k price_only_lookup_unaffected`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/services/analytics/test_nse_indices_client_tri.py
git commit -m "test: pin benchmark.py's default-PRICE behavior unchanged by TRI rows"
```

---

### Task 5: Job wiring — fetch TRI alongside PRICE in the existing daily job

**Files:**
- Modify: `backend/scripts/jobs/refresh_benchmark_daily.py`
- Test: `backend/tests/scripts/test_refresh_benchmark_daily_tri.py`

**Interfaces:**
- Consumes: `ensure_index_history_fresh(..., return_type=...)` (Task 2).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/scripts/test_refresh_benchmark_daily_tri.py
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from scripts.jobs.refresh_benchmark_daily import main_async


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_main_async_fetches_both_price_and_tri_for_every_index():
    db = _session()
    with patch(
        "scripts.jobs.refresh_benchmark_daily.ensure_index_history_fresh", new=AsyncMock(return_value=True)
    ) as mock_fresh:
        import asyncio
        asyncio.run(main_async(db))

    return_types_called = {call.kwargs.get("return_type") for call in mock_fresh.call_args_list}
    assert return_types_called == {BenchmarkReturnType.PRICE, BenchmarkReturnType.TRI}
    assert mock_fresh.call_count == len(list(BenchmarkIndex)) * 2
```

- [ ] **Step 2: Run, confirm failure**

Run: `cd backend && pytest tests/scripts/test_refresh_benchmark_daily_tri.py -v`
Expected: FAIL — `assert {None} == {<BenchmarkReturnType.PRICE: 'price'>, <BenchmarkReturnType.TRI: 'tri'>}`

- [ ] **Step 3: Implement**

Replace `backend/scripts/jobs/refresh_benchmark_daily.py`'s `main_async`:

```python
from app.models.enums import BenchmarkIndex, BenchmarkReturnType
from app.services.analytics.nse_indices_client import ensure_index_history_fresh


async def main_async(db: Session) -> None:
    end_date = date.today()
    start_date = years_ago(end_date, 10)
    results = [
        # fresh_within=0: the job tops up every morning; only Analytics treats
        # history up to 4 days old as fresh (8 Oct). Both return types fetched
        # here -- net infra cost is 4 extra requests/day (attribute 12).
        await ensure_index_history_fresh(db, index, start_date, end_date, return_type=return_type, fresh_within=timedelta(0))
        for index in BenchmarkIndex
        for return_type in BenchmarkReturnType
    ]
    succeeded = sum(results)
    logger.info(
        "refresh_benchmark_daily: fetches=%d succeeded=%d success=%s",
        len(results),
        succeeded,
        succeeded == len(results),
    )
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd backend && pytest tests/scripts/test_refresh_benchmark_daily_tri.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/jobs/refresh_benchmark_daily.py backend/tests/scripts/test_refresh_benchmark_daily_tri.py
git commit -m "feat: fetch TRI history alongside price-return in the daily benchmark job"
```

---

## Self-Review

**1. Spec coverage:** `return_type` dimension column, widened PK, additive migration (Task
1) ✓; all 5 call sites reworked to key by `(index_name, return_type)` — the actual size of
this attribute, not just "wiring one caller" (Task 2) ✓; new `_fetch_tri_history` against the
live-verified endpoint, reading `TotalReturnsIndex`/ignoring optional `NTR_Value` (Task 3) ✓;
the spec's explicitly required blocking regression test (Task 4) ✓; job wiring extending the
existing `benchmark_daily` job, zero new infra (Task 5) ✓.

**2. Placeholder scan:** No "TBD"/"add later"/"similar to Task N" patterns. Task 3 Step 1's
note to check for an existing `test_nse_indices_client.py` httpx-mocking helper before adding
a duplicate is a real instruction to verify at build time, not a deferred design gap — the
fallback contextmanager given is complete and runnable either way.

**3. Type consistency:** `BenchmarkReturnType.PRICE`/`.TRI` used identically across Task 1's
model, Task 2's 4 reworked functions, Task 3's new fetch method, Task 4's pinning test, and
Task 5's job loop. `_fetched_from`'s key type (`tuple[BenchmarkIndex, BenchmarkReturnType]`)
is consistent between its Task 2 declaration and Task 2's cross-contamination test.

**4. Review Focus coverage:** #1 (PRICE/TRI collision) — Task 2's
`test_upsert_does_not_collide_price_and_tri_for_the_same_date`. #2 (byte-for-byte unchanged
existing behavior) — Task 4's `test_price_only_lookup_unaffected_by_presence_of_tri_rows`.
#3 (`NTR_Value` = `"-"`) — Task 3's `test_fetch_tri_history_parses_total_returns_index_field`
(includes a `"-"` row, asserts it's simply never read since this plan doesn't store
`NTR_Value` at all — the simplest possible resolution of "optional," confirmed correct
against the spec's own framing). #4 (`_fetched_from` cross-contamination) — Task 2's
`test_fetched_from_cache_does_not_cross_contaminate_return_types`. #5 (graceful fetch-failure
degrade) — covered by `ensure_index_history_fresh`'s existing unchanged
`except (httpx.HTTPError, KeyError, ValueError, TypeError, InvalidOperation): return False`
clause in Task 2's implementation, which wraps the new TRI branch identically to the existing
PRICE branch — no separate test needed since this is the same exception handler, not new
logic, but noted here as explicitly reviewed rather than assumed.
