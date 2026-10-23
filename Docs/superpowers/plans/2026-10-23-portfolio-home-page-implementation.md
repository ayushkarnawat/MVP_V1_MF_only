# Portfolio Home Page (`/portfolio`, "Investments") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/portfolio` page's 4 sections (Summary Strip, Asset Allocation pie+legend, Family allocation + Quick Insights) and its 6 new backend read endpoints, per the approved design.

**Architecture:** Backend adds three new concerns to the existing Dashboard Service (no new service, no new table): an instrument-type allocation function, a portfolio-summary function, and a daily-value-series function, each exposed as an aggregate/member endpoint pair following the codebase's existing dual-route convention. Frontend adds a new `frontend/src/features/portfolio/` feature folder (API client + 3 section components + the page) and one shell route file, consuming the nav-shell contract's interfaces exactly as specified — those interfaces (`useScope()`, `PageLayout`, `paths`, `AppLink`, `useImport()`, `PageState`, `renderInShell()`) do not exist in the codebase yet (`frontend/src/shell/` is unbuilt as of this writing); this plan is written against the contract's locked signatures per the design doc's own "Depends on" note, the same stacked-branch convention already used for sibling shell-dependent plans.

**Tech Stack:** FastAPI + SQLAlchemy + Pydantic (backend, pytest); React 19 + TypeScript + Vitest + Testing Library (frontend).

**Spec:** `Docs/orchestration/2026-10-23-portfolio-home-page-design.md` (authoritative; read in full alongside this plan), `Docs/orchestration/2026-10-23-portfolio-home-page-decisions.html`, `Docs/orchestration/2026-10-23-portfolio-home-page-skeleton-mockup-v9.html` (locked content), `Docs/orchestration/2026-10-23-portfolio-home-page-hifi-states.html` (locked visuals/states), `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` (shell interfaces this page consumes).

## Global Constraints

- MF-only MVP: the only live asset class is Mutual Funds; Direct Stocks, US Stocks, FDs & Bonds, Debt, Gold, Real Estate render as `status: "coming_soon"` — visible, disabled, no data (design.md §1).
- Every amount crossing the API boundary is a string (`Decimal` computed server-side, serialized as `str`), matching every existing Dashboard Service schema — never a JSON float.
- `backend/app/services/dashboard/allocation.py`'s `compute_allocation()`, `AllocationSummary`, and `AllocationBucket` are **not modified** — they remain exactly as they are today, still serving `DashboardView.tsx`/`MobileDashboardView.tsx` unchanged (design.md §1, §2.3's 2026-10-23 conflict note).
- `/portfolio/mutual-funds` (`DashboardView`) is untouched by this work (design.md §1) except that nothing in this plan edits its files.
- The Summary Strip's XIRR is the Dashboard's existing Lifetime/Current toggle + `XirrDisclaimerModal`, reused as-is — not a new or parallel implementation (design.md §2.1, §8 item 2).
- New endpoints follow the codebase's existing dual-route convention exactly: `/household/aggregate/<name>` and `/household-members/{member_id}/<name>`, computation identical, response shape differs by a `members: list[MemberStatus]` field on the aggregate side (`aggregate.py`'s own docstring; design.md §4 endpoint-naming note).
- Every new frontend module lives under `frontend/src/features/portfolio/`; the shell route file is the only file this plan adds under `frontend/src/shell/` (`frontend/src/shell/routes/portfolio.route.tsx`), per the contract's "Must not touch: anything under `frontend/src/shell/` except its own route file" (design.md §6).
- Test commands: backend `cd backend && pytest <path> -v`; frontend `cd frontend && npx vitest run <path>`; frontend type check `cd frontend && npx tsc -b`.
- Never push. Commit locally only, per every prior plan's convention in this repo.

## Review Focus

- **A household member with zero holdings** (freshly added, no CAS imported yet): every new endpoint must return a well-formed zero/empty response (total `"0"`, empty series, 8 buckets with the MF one at `"0"`), not a 500 or a `None` crash — mirrors the existing `compute_allocation()` empty-member test (`test_allocation_route_returns_empty_summary_for_member_with_no_holdings`). Covered by: Task 1 Step 1, Task 2 Step 1, Task 3 Step 1.
- **A fund whose NAV history doesn't yet cover the sparkline's 30-day window** (newly listed scheme, or a gap in `nav_history`): `compute_daily_value_series()` must not raise on a day with no `NavHistory` row on-or-before it for a scheme — that folio contributes `0` for those days, not a crash. Covered by: Task 3 Step 1.
- **A family with multiple members where only one has imported data**: aggregate endpoints must still return every member in `members: list[MemberStatus]` (`has_data: false` for the empty one), per the existing PRD-03 FR-10 rule `aggregate.py` already enforces for every other endpoint — a reasonable person expects a family's empty member to show as a clear placeholder, not vanish from the response. Covered by: Task 1 Step 1, Task 2 Step 1, Task 3 Step 1 (reusing `get_member_statuses()`).
- **The Lifetime/Current XIRR toggle carries a disclaimer on this page exactly when it would on the Dashboard for the same data** — since it's the same component and same `calculate_dashboard_xirr()` call, not a fork, a mismatch here would mean the reuse broke. Covered by: Task 5 Step 1 (snapshot test asserting the strip renders `XirrDisclaimerModal` when the API response carries a disclaimer, matching `DashboardView.test.tsx`'s existing fixture).
- **Clicking a coming-soon pie slice or legend row must not navigate anywhere** (no dead link, no console error) — the spec says "disabled, no navigation" (design.md §4) but every click handler in this plan is new code where that's easy to get backwards. Covered by: Task 6 Step 1.

---

## File Structure

**Backend — new files:**
- `backend/app/services/dashboard/instrument_allocation.py` — `InstrumentAllocationBucket` is added to `schemas.py`; `compute_instrument_allocation()` lives here, not in `allocation.py`, to keep the two taxonomies in physically separate modules (Global Constraints: `allocation.py` not modified).
- `backend/app/services/dashboard/portfolio_summary.py` — `PortfolioSummary` schema (in `schemas.py`) + `compute_portfolio_summary()`.
- `backend/app/services/dashboard/value_series.py` — `DailyValuePoint` schema (in `schemas.py`) + `compute_daily_value_series()`.
- Modify: `backend/app/services/dashboard/schemas.py` (add the three schemas above), `backend/app/services/dashboard/aggregate.py` (add three `get_aggregate_*` wrappers), `backend/app/api/dashboard.py` (add six routes).
- Tests: `backend/tests/services/dashboard/test_instrument_allocation.py`, `test_portfolio_summary.py`, `test_value_series.py`, `backend/tests/api/test_portfolio_routes.py`.

**Frontend — new files:**
- `frontend/src/features/portfolio/api.ts` — the six new GET calls, mirroring `features/dashboard/api.ts`'s `authFetch` pattern.
- `frontend/src/features/portfolio/types.ts` — TS mirrors of the three new backend schemas.
- `frontend/src/features/portfolio/PortfolioSummaryStrip.tsx` (+ `.module.css`, `.test.tsx`) — Section 1.
- `frontend/src/features/portfolio/PortfolioAllocationSection.tsx` (+ `.module.css`, `.test.tsx`) — Sections 2+3.
- `frontend/src/features/portfolio/PortfolioFamilySection.tsx` (+ `.module.css`, `.test.tsx`) — Section 4.
- `frontend/src/features/portfolio/PortfolioPage.tsx` (+ `.module.css`, `.test.tsx`) — assembles the three sections + header.
- `frontend/src/shell/routes/portfolio.route.tsx` — the shell route module.

---

### Task 1: Instrument-type Asset Allocation (backend)

**Files:**
- Create: `backend/app/services/dashboard/instrument_allocation.py`
- Modify: `backend/app/services/dashboard/schemas.py` (add `InstrumentAllocationBucket`), `backend/app/services/dashboard/aggregate.py` (add `get_aggregate_instrument_allocation`), `backend/app/api/dashboard.py` (add two routes)
- Test: `backend/tests/services/dashboard/test_instrument_allocation.py`, `backend/tests/api/test_portfolio_routes.py`

**Interfaces:**
- Consumes: `HoldingRow` (existing, `schemas.py`), `compute_holdings(db, household_member_ids) -> list[HoldingRow]` (existing, `holdings.py`), `DashboardXirrSummary` and `calculate_dashboard_xirr(db, household_member_ids, holdings) -> DashboardXirrSummary` (existing, `xirr.py`), `get_member_statuses(db, user_id) -> list[MemberStatus]` and `list_household_members` (existing, `aggregate.py`/`household_members.py`), `require_member(db, user_id, member_id) -> HouseholdMember` (existing, `member_details.py`).
- Produces: `InstrumentAllocationBucket` (new Pydantic model, `schemas.py`), `compute_instrument_allocation(holdings: list[HoldingRow], xirr_summary: DashboardXirrSummary) -> list[InstrumentAllocationBucket]` (new, pure — no `db` argument, takes already-fetched data), two new routes: `GET /household/aggregate/portfolio-allocation` and `GET /household-members/{member_id}/portfolio-allocation`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/services/dashboard/test_instrument_allocation.py` (reuse the `_session`/`_household_member`/`Folio`/`Transaction` factory pattern from `test_allocation.py`):

```python
def test_no_holdings_returns_eight_buckets_one_live_rest_coming_soon():
    result = compute_instrument_allocation(holdings=[], xirr_summary=DashboardXirrSummary(None, None))
    assert len(result) == 8
    mf = next(b for b in result if b.label == "Mutual Funds")
    assert mf.status == "live" and mf.current_value == "0"
    others = [b for b in result if b.label != "Mutual Funds"]
    assert all(b.status == "coming_soon" and b.current_value is None for b in others)

def test_mutual_funds_bucket_sums_holdings_and_carries_lifetime_xirr():
    holdings = [HoldingRow(..., current_value="100000", amount_invested="80000", unrealized_gain="20000", ...)]
    xirr_summary = DashboardXirrSummary(lifetime_xirr="0.15", current_holdings_xirr="0.12")
    result = compute_instrument_allocation(holdings=holdings, xirr_summary=xirr_summary)
    mf = next(b for b in result if b.label == "Mutual Funds")
    assert mf.current_value == "100000" and mf.invested == "80000" and mf.gain_loss == "20000"
    assert mf.xirr == "0.15" and mf.percentage == "100"
```

In `backend/tests/api/test_portfolio_routes.py` (reuse `_authed_headers_and_member` from `test_dashboard_allocation_route.py`):

```python
def test_portfolio_allocation_route_for_member_with_no_holdings_returns_eight_buckets(client):
    headers, member_id = _authed_headers_and_member(client, "+919000000020")
    response = client.get(f"/household-members/{member_id}/portfolio-allocation", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 8

def test_aggregate_portfolio_allocation_route_includes_member_statuses(client):
    headers, _ = _authed_headers_and_member(client, "+919000000021")
    response = client.get("/household/aggregate/portfolio-allocation", headers=headers)
    assert response.status_code == 200
    assert "members" in response.json() and "buckets" in response.json()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/services/dashboard/test_instrument_allocation.py tests/api/test_portfolio_routes.py -v`
Expected: FAIL (`compute_instrument_allocation` not defined, route 404)

- [ ] **Step 3: Implement**

`InstrumentAllocationBucket` in `schemas.py`:
```python
class InstrumentAllocationBucket(BaseModel):
    label: str
    status: Literal["live", "coming_soon"]
    current_value: str | None = None
    percentage: str | None = None
    invested: str | None = None
    gain_loss: str | None = None
    xirr: str | None = None

class AggregateInstrumentAllocationResponse(BaseModel):
    members: list[MemberStatus]
    buckets: list[InstrumentAllocationBucket]
```

`compute_instrument_allocation()` in `instrument_allocation.py`: the 7 non-MF labels are a module-level constant tuple (`"Direct Stocks"`, `"US Stocks"`, `"FDs & Bonds"`, `"Debt"`, `"Gold"`, `"Real Estate"`, `"Others"` — matching the nav-shell contract's 8 sidebar rows exactly, design.md §2.3). Sum `current_value`/`amount_invested` across `holdings` (skip `None` values, same null-handling idiom `compute_allocation()` already uses); `gain_loss` is their difference; `percentage` is `"100"` when any value is non-zero else `"0"`; `xirr` is `xirr_summary.lifetime_xirr` passed straight through (no recomputation — Global Constraints: reuse, don't refork XIRR). Build the "Mutual Funds" bucket from these sums, append the 7 static coming-soon buckets, return the list of 8 in a fixed order (Mutual Funds first, then the other 7 in the order given above, matching v9's legend order).

Route handlers in `dashboard.py`, mirroring `get_member_allocation`/`get_aggregate_allocation` exactly: fetch `compute_holdings`/`calculate_dashboard_xirr` (already-imported in this file), pass to `compute_instrument_allocation()`. Aggregate wrapper `get_aggregate_instrument_allocation()` added to `aggregate.py` next to `get_aggregate_allocation()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/services/dashboard/test_instrument_allocation.py tests/api/test_portfolio_routes.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/dashboard/instrument_allocation.py backend/app/services/dashboard/schemas.py backend/app/services/dashboard/aggregate.py backend/app/api/dashboard.py backend/tests/services/dashboard/test_instrument_allocation.py backend/tests/api/test_portfolio_routes.py
git commit -m "feat: add instrument-type asset allocation endpoint for Portfolio page"
```

---

### Task 2: Portfolio Summary (backend)

**Files:**
- Create: `backend/app/services/dashboard/portfolio_summary.py`
- Modify: `backend/app/services/dashboard/schemas.py` (add `PortfolioSummary`), `backend/app/services/dashboard/aggregate.py`, `backend/app/api/dashboard.py`
- Test: `backend/tests/services/dashboard/test_portfolio_summary.py`, append to `backend/tests/api/test_portfolio_routes.py`

**Interfaces:**
- Consumes: `HoldingRow`, `compute_holdings()`, `DashboardXirrSummary`, `calculate_dashboard_xirr()`, `compute_realized_summary(db, household_member_ids) -> RealizedSummary` (existing, `holdings.py`), `RealizedSummary` (existing, `schemas.py`).
- Produces: `PortfolioSummary` (new schema), `compute_portfolio_summary(holdings: list[HoldingRow], xirr_summary: DashboardXirrSummary, realized_summary: RealizedSummary) -> PortfolioSummary` (new, pure), routes `GET /household/aggregate/portfolio-summary`, `GET /household-members/{member_id}/portfolio-summary`.

- [ ] **Step 1: Write the failing tests**

```python
def test_empty_holdings_returns_zeroed_summary():
    result = compute_portfolio_summary(holdings=[], xirr_summary=DashboardXirrSummary(None, None), realized_summary=RealizedSummary(total="0", funds=[]))
    assert result.total_value == "0" and result.today_gain == "0" and result.lifetime_xirr is None

def test_sums_current_value_invested_unrealized_and_today_gain():
    holdings = [
        HoldingRow(..., current_value="60000", amount_invested="50000", unrealized_gain="10000", today_gain="500"),
        HoldingRow(..., current_value="40000", amount_invested="35000", unrealized_gain="5000", today_gain="-200"),
    ]
    result = compute_portfolio_summary(holdings=holdings, xirr_summary=DashboardXirrSummary("0.1", "0.1"), realized_summary=RealizedSummary(total="2000", funds=[]))
    assert result.total_value == "100000" and result.total_invested == "85000"
    assert result.unrealized_gain == "15000" and result.today_gain == "300" and result.realized_gain == "2000"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/services/dashboard/test_portfolio_summary.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

```python
class PortfolioSummary(BaseModel):
    total_value: str
    total_invested: str
    unrealized_gain: str
    realized_gain: str
    today_gain: str
    lifetime_xirr: str | None = None
    current_holdings_xirr: str | None = None
    lifetime_xirr_disclaimer: XirrDisclaimerOut | None = None
    current_holdings_xirr_disclaimer: XirrDisclaimerOut | None = None

class AggregatePortfolioSummaryResponse(BaseModel):
    members: list[MemberStatus]
    summary: PortfolioSummary
```

`compute_portfolio_summary()`: sum `current_value`/`amount_invested`/`unrealized_gain`/`today_gain` across `holdings` (skip `None`, same idiom as Task 1), `realized_gain` from `realized_summary.total`, XIRR fields passed straight through from `xirr_summary` (reuse, Global Constraints). Route handlers fetch `compute_holdings`, `calculate_dashboard_xirr`, and `compute_realized_summary` (all three already called together in `get_aggregate_holdings()` — follow that exact pattern) and pass to `compute_portfolio_summary()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/services/dashboard/test_portfolio_summary.py tests/api/test_portfolio_routes.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/dashboard/portfolio_summary.py backend/app/services/dashboard/schemas.py backend/app/services/dashboard/aggregate.py backend/app/api/dashboard.py backend/tests/services/dashboard/test_portfolio_summary.py backend/tests/api/test_portfolio_routes.py
git commit -m "feat: add portfolio summary endpoint for Portfolio page Section 1"
```

---

### Task 3: Daily Value Series (sparkline, backend)

**Files:**
- Create: `backend/app/services/dashboard/value_series.py`
- Modify: `backend/app/services/dashboard/schemas.py` (add `DailyValuePoint`), `backend/app/services/dashboard/aggregate.py`, `backend/app/api/dashboard.py`
- Test: `backend/tests/services/dashboard/test_value_series.py`, append to `backend/tests/api/test_portfolio_routes.py`

**Interfaces:**
- Consumes: `Folio` (existing, `models/folio.py`), `Transaction` (existing, `models/transaction.py`, `balance_units` field), `NavHistory` (existing, `models/reference.py`, `scheme_id`/`date`/`nav` fields).
- Produces: `DailyValuePoint` (new schema: `{date: date, value: str}`), `compute_daily_value_series(db: Session, household_member_ids: list[uuid.UUID], days: int = 30) -> list[DailyValuePoint]` (new), routes `GET /household/aggregate/portfolio-value-series?days=30`, `GET /household-members/{member_id}/portfolio-value-series?days=30`.

- [ ] **Step 1: Write the failing tests**

```python
def test_no_household_members_returns_empty_list(db_session):
    assert compute_daily_value_series(db_session, [], days=30) == []

def test_single_folio_values_each_day_as_balance_times_nav_on_or_before(db_session):
    # seed one member, one folio, one PURCHASE transaction with balance_units=100
    # dated 10 days ago, and NavHistory rows for that scheme on day -10 (nav=10)
    # and day -3 (nav=12), nothing after.
    result = compute_daily_value_series(db_session, [member.id], days=10)
    assert len(result) == 10
    assert result[0].value == "1000"   # 100 units * nav 10, oldest day in window
    assert result[-1].value == "1200"  # 100 units * nav 12, most recent NAV forward-filled to today

def test_day_before_any_nav_history_exists_contributes_zero_not_a_crash():
    # transaction exists but NavHistory's earliest row is after the window's start
    result = compute_daily_value_series(db_session, [member.id], days=30)
    assert result[0].value == "0"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/services/dashboard/test_value_series.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

`compute_daily_value_series()` in `value_series.py`. Window is `[date.today() - timedelta(days=days-1), date.today()]`. Algorithm (design.md §2.2's three steps, as bisect-based forward-fill — the same per-scheme sorted-list-plus-`bisect_right` shape `backend/app/services/analytics/risk_metrics.py` already uses for bulk NAV reads, not a new pattern):

1. Fetch all `Folio` rows for `household_member_ids`. If none, return `[]`.
2. Bulk-fetch every `Transaction` for those folios with `date <= window_end`, ordered by `(folio_id, date, id)`, selecting `folio_id, date, balance_units`. Group into `{folio_id: [(date, balance_units), ...]}` (already sorted by the query order).
3. Bulk-fetch every `NavHistory` row for the folios' distinct `scheme_id`s with `date <= window_end`, selecting `scheme_id, date, nav`. Group into `{scheme_id: (sorted_dates, sorted_navs)}`.
4. For each day `d` in the window and each folio: `bisect_right` the folio's `(date, balance_units)` list for the latest entry with `date <= d` (units = 0 if none yet); `bisect_right` the folio's scheme's NAV list for the latest `nav` with `date <= d` (skip this folio's contribution for `d` if none — Review Focus item 2). Sum `units * nav` across folios for that `d`.
5. Return one `DailyValuePoint(date=d, value=str(total))` per day, oldest first.

Route handlers: thin, no `compute_holdings` involvement — just `compute_daily_value_series(db, member_ids, days=days)` with `days: int = 30` as a query param (FastAPI `Query` default, matching `include_stopped: bool = False`'s existing pattern on the sips routes).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/services/dashboard/test_value_series.py tests/api/test_portfolio_routes.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/dashboard/value_series.py backend/app/services/dashboard/schemas.py backend/app/services/dashboard/aggregate.py backend/app/api/dashboard.py backend/tests/services/dashboard/test_value_series.py backend/tests/api/test_portfolio_routes.py
git commit -m "feat: add daily portfolio value series endpoint for Section 1 sparkline"
```

---

### Task 4: Frontend API client + types

**Files:**
- Create: `frontend/src/features/portfolio/types.ts`, `frontend/src/features/portfolio/api.ts`
- Test: `frontend/src/features/portfolio/api.test.ts`

**Interfaces:**
- Consumes: `API_BASE_URL`, `ApiError`, `cachedFetch`, `parseErrorDetail` (existing, `lib/apiClient`), `getToken` (existing, `features/auth/session`), `XirrDisclaimer` (existing, `features/dashboard/types.ts` — reused, not redefined).
- Produces: `InstrumentAllocationBucket`, `AggregateInstrumentAllocationResponse`, `PortfolioSummary`, `AggregatePortfolioSummaryResponse`, `DailyValuePoint` (TS types mirroring Tasks 1-3's Pydantic schemas field-for-field); `getMemberInstrumentAllocation(memberId)`, `getAggregateInstrumentAllocation()`, `getMemberPortfolioSummary(memberId)`, `getAggregatePortfolioSummary()`, `getMemberValueSeries(memberId, days?)`, `getAggregateValueSeries(days?)` — all `(signal?: AbortSignal) => Promise<T>`, mirroring `features/dashboard/api.ts`'s existing functions exactly (same `authFetch` helper, same URL-encoding of `memberId`).

- [ ] **Step 1: Write the failing test**

```ts
// api.test.ts — mirrors features/dashboard/api.test.ts's fetch-mocking pattern
test("getAggregatePortfolioSummary calls the aggregate endpoint with auth header", async () => {
  const fetchSpy = mockFetchOnce({ members: [], summary: { total_value: "0", ... } });
  await getAggregatePortfolioSummary();
  expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/household/aggregate/portfolio-summary"), expect.objectContaining({ headers: expect.anything() }));
});

test("getMemberValueSeries encodes memberId and passes days query param", async () => {
  const fetchSpy = mockFetchOnce([]);
  await getMemberValueSeries("abc 123", 14);
  expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/household-members/abc%20123/portfolio-value-series?days=14"), expect.anything());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/portfolio/api.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `types.ts` and `api.ts`**

`types.ts` field names match Tasks 1-3's schemas exactly (snake_case, matching every other file in `features/dashboard/types.ts`). `api.ts` copies `features/dashboard/api.ts`'s `authFetch()` helper verbatim (module-local, not exported — same duplication already present between `dashboard/api.ts` and any sibling feature, not a new pattern) and adds the six functions, each a one-line `authFetch(path).json()` call per the existing style.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/portfolio/api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/portfolio/types.ts frontend/src/features/portfolio/api.ts frontend/src/features/portfolio/api.test.ts
git commit -m "feat: add Portfolio page API client and types"
```

---

### Task 5: Summary Strip component (Section 1)

**Files:**
- Create: `frontend/src/features/portfolio/PortfolioSummaryStrip.tsx`, `.module.css`
- Test: `frontend/src/features/portfolio/PortfolioSummaryStrip.test.tsx`

**Interfaces:**
- Consumes: `PortfolioSummary`, `DailyValuePoint` (Task 4), `XirrDisclaimerModal`/`XirrDisclaimerModalProps` (existing, `features/dashboard/XirrDisclaimerModal.tsx` — reused component, same props: `isOpen`, `onClose`, `scopeLabel`, `xirr`, `disclaimer`), `formatIndianCurrency` (existing, `lib/decimal`), `toPercentString` (existing, `lib/decimal`).
- Produces: `PortfolioSummaryStrip({ summary, series, loading }: { summary: PortfolioSummary | null; series: DailyValuePoint[]; loading: boolean }): JSX.Element` — 5 metric cards (Total Portfolio Value with today's-gain sub-line and sparkline SVG per the v9/hi-fi mockup's exact markup and `.spark`/`.value-sparkline-row` classes, Total Invested, Unrealised Gain, Realised Gain, XIRR with its own Lifetime/Current toggle state), consumed by Task 8's `PortfolioPage`.

- [ ] **Step 1: Write the failing tests**

```tsx
test("renders all five metrics from the summary prop", () => {
  render(<PortfolioSummaryStrip summary={fixtureSummary} series={fixtureSeries} loading={false} />);
  expect(screen.getByText(/Total Portfolio Value/i)).toBeInTheDocument();
  expect(screen.getByText(/Total Invested/i)).toBeInTheDocument();
  expect(screen.getByText(/Unrealised Gain/i)).toBeInTheDocument();
  expect(screen.getByText(/Realised Gain/i)).toBeInTheDocument();
  expect(screen.getByText(/XIRR/i)).toBeInTheDocument();
});

test("clicking Current toggles XIRR mode and opens the disclaimer when one exists for that mode", () => {
  render(<PortfolioSummaryStrip summary={{ ...fixtureSummary, current_holdings_xirr_disclaimer: fixtureDisclaimer }} series={fixtureSeries} loading={false} />);
  fireEvent.click(screen.getByRole("tab", { name: /current/i }));
  expect(screen.getByText(/CAS/i)).toBeInTheDocument(); // XirrDisclaimerModal's lead copy
});

test("loading=true renders PageState loading skeleton, not metric values", () => {
  render(<PortfolioSummaryStrip summary={null} series={[]} loading={true} />);
  expect(screen.queryByText(/Total Portfolio Value/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/portfolio/PortfolioSummaryStrip.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

Port the Lifetime/Current toggle + disclaimer-open logic directly from `DashboardView.tsx`'s existing `xirrMode`/`xirrDisclaimerOpen` state (lines ~97-105, ~439-466) — same state shape, same `hasActiveXirrDisclaimer` derivation, same `XirrDisclaimerModal` render — this is the "reused-as-is" component Global Constraints requires, not a reimplementation. Sparkline SVG markup, viewBox, and `.spark`/`.value-sparkline-row`/`.m-value` CSS classes come verbatim from `hifi-states.html`'s Total Portfolio Value card (the locked, user-approved sizing from this session's spacing pass). Render `<PageState loading />` (shell import, Task 8 wires scope) when `loading` is true.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/portfolio/PortfolioSummaryStrip.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/portfolio/PortfolioSummaryStrip.tsx frontend/src/features/portfolio/PortfolioSummaryStrip.module.css frontend/src/features/portfolio/PortfolioSummaryStrip.test.tsx
git commit -m "feat: add Portfolio page Summary Strip (Section 1)"
```

---

### Task 6: Asset Allocation pie + legend component (Sections 2+3)

**Files:**
- Create: `frontend/src/features/portfolio/PortfolioAllocationSection.tsx`, `.module.css`
- Test: `frontend/src/features/portfolio/PortfolioAllocationSection.test.tsx`

**Interfaces:**
- Consumes: `InstrumentAllocationBucket` (Task 4), `AllocationDonut`/`AllocationDonutProps`/`AllocationItem` (existing, `components/AllocationDonut.tsx` — reused, `data: AllocationItem[]` built by mapping `InstrumentAllocationBucket[]` to `{label, current_value, percentage}`, dropping `coming_soon` buckets' `null` values to `"0"`), `AppLink` (shell, Task 8 wires in), `paths.mutualFunds.root()` / `.debt()` / `.gold()` / `.realEstate()` / `.others()` / `.equity.directStocks()` / `.equity.usStocks()` / `.equity.fdsBonds()` (shell `paths` builders, per the URL map's 8 instrument routes).
- Produces: `PortfolioAllocationSection({ buckets, loading }: { buckets: InstrumentAllocationBucket[]; loading: boolean }): JSX.Element` — donut (enlarged per this session's `.pie-stage`/`.pie-hole` sizing), legend list with per-row hover popup (`invested`/`gain_loss`/`xirr`/"Allocation: %"), Filter (live-vs-coming-soon toggle) and Sort (ascending by `percentage`) buttons, consumed by Task 8.

- [ ] **Step 1: Write the failing tests**

```tsx
test("renders eight legend rows, one per bucket", () => {
  render(<PortfolioAllocationSection buckets={fixtureEightBuckets} loading={false} />);
  expect(screen.getAllByTestId("allocation-legend-row")).toHaveLength(8);
});

test("clicking a live bucket's legend row navigates via AppLink to its route", () => {
  render(<PortfolioAllocationSection buckets={fixtureEightBuckets} loading={false} />);
  const mfRow = screen.getByText("Mutual Funds").closest("a");
  expect(mfRow).toHaveAttribute("href", "/portfolio/mutual-funds");
});

test("clicking a coming-soon bucket's legend row does not navigate", () => {
  render(<PortfolioAllocationSection buckets={fixtureEightBuckets} loading={false} />);
  const goldRow = screen.getByText("Gold").closest("[aria-disabled]");
  expect(goldRow).toHaveAttribute("aria-disabled", "true");
  expect(goldRow?.tagName).not.toBe("A");
});

test("Filter toggle hides coming-soon rows when switched to live-only", () => {
  render(<PortfolioAllocationSection buckets={fixtureEightBuckets} loading={false} />);
  fireEvent.click(screen.getByRole("button", { name: /filter/i }));
  fireEvent.click(screen.getByRole("option", { name: /live only/i }));
  expect(screen.getAllByTestId("allocation-legend-row")).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/portfolio/PortfolioAllocationSection.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

Map the 8 bucket labels to their `paths.*` builders via a fixed lookup table (`"Mutual Funds" -> paths.mutualFunds.root()`, `"Direct Stocks" -> paths.equity.directStocks()`, `"US Stocks" -> paths.equity.usStocks()`, `"FDs & Bonds" -> paths.equity.fdsBonds()`, `"Debt" -> paths.debt()`, `"Gold" -> paths.gold()`, `"Real Estate" -> paths.realEstate()`, `"Others" -> paths.others()`). Render each row through `<AppLink to={...}>` when `status === "live"`, else a plain `<span aria-disabled="true">` — `AppLink` itself only auto-disables for `status: "placeholder"` *routes*; this page's own bucket `status` is separate data, so the live/coming-soon branch is this component's own conditional, not something `AppLink` infers for it. Donut/legend markup, sizing (`.pie-stage` 236px, `.legend` 240px min-width, etc.) and the hover-popup fields come verbatim from `hifi-states.html`'s current (post-resize) state.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/portfolio/PortfolioAllocationSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/portfolio/PortfolioAllocationSection.tsx frontend/src/features/portfolio/PortfolioAllocationSection.module.css frontend/src/features/portfolio/PortfolioAllocationSection.test.tsx
git commit -m "feat: add Portfolio page Asset Allocation pie and legend (Sections 2+3)"
```

---

### Task 7: Family allocation + Quick Insights component (Section 4)

**Files:**
- Create: `frontend/src/features/portfolio/PortfolioFamilySection.tsx`, `.module.css`
- Test: `frontend/src/features/portfolio/PortfolioFamilySection.test.tsx`

**Interfaces:**
- Consumes: `AllocationSummary` (existing, per-member, from the *existing* `/household-members/{id}/allocation` calls — Task 7 fetches these itself, one per member, in `PortfolioPage`'s loop, not Task 1's new endpoint), `SipRow` (existing, `features/dashboard/types.ts`), `useScope()` (shell: `{ members, setMember(id) }`).
- Produces: `PortfolioFamilySection({ memberAllocations, sips, holdingsByMember, onSelectMember }: { memberAllocations: Array<{ memberId: string; memberName: string; allocation: AllocationSummary }>; sips: SipRow[]; holdingsByMember: Record<string, HoldingRow[]>; onSelectMember: (id: string) => void }): JSX.Element` — segmented bar + member row list, 5 Quick Insights per design.md §2.4's table.

- [ ] **Step 1: Write the failing tests**

```tsx
test("clicking a member row calls onSelectMember with that member's id", () => {
  const onSelectMember = vi.fn();
  render(<PortfolioFamilySection memberAllocations={fixtureMembers} sips={[]} holdingsByMember={{}} onSelectMember={onSelectMember} />);
  fireEvent.click(screen.getByText(fixtureMembers[0].memberName));
  expect(onSelectMember).toHaveBeenCalledWith(fixtureMembers[0].memberId);
});

test("renders all five quick insights when holdings and sips are present", () => {
  render(<PortfolioFamilySection memberAllocations={fixtureMembers} sips={fixtureSips} holdingsByMember={fixtureHoldingsByMember} onSelectMember={vi.fn()} />);
  expect(screen.getByText(/largest holding/i)).toBeInTheDocument();
  expect(screen.getByText(/Spread across/i)).toBeInTheDocument();
  expect(screen.getByText(/Direct.*Regular/i)).toBeInTheDocument();
  expect(screen.getByText(/largest single AMC/i)).toBeInTheDocument();
  expect(screen.getByText(/active SIPs/i)).toBeInTheDocument();
});

test("SIP insight sums only status=active rows", () => {
  const sips = [{ ...fixtureSip, status: "active", sip_amount: "5000" }, { ...fixtureSip, status: "stopped", sip_amount: "9999" }];
  render(<PortfolioFamilySection memberAllocations={fixtureMembers} sips={sips} holdingsByMember={fixtureHoldingsByMember} onSelectMember={vi.fn()} />);
  expect(screen.getByText(/₹5,000/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/portfolio/PortfolioFamilySection.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

Quick Insight queries exactly as design.md §2.4's table: #1 `max()` over the flattened `holdingsByMember` values; #2 distinct `amc_name` + holdings count; #3 split by `plan_type`; #4 top of each member allocation's `by_amc` (reused `AllocationSummary` field, unchanged per Global Constraints — this is the one place in this plan that reads `by_asset_class`'s sibling `by_amc`, not `by_asset_class` itself, so it does not touch the conflict Task 1 resolved); #5 `sum(sip_amount)` filtered to `status === "active"`, client-side (design.md §2.4's correction — no `/sip-summary` endpoint). Member row click calls `onSelectMember`; `PortfolioPage` (Task 8) wires this to `useScope().setMember()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/portfolio/PortfolioFamilySection.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/portfolio/PortfolioFamilySection.tsx frontend/src/features/portfolio/PortfolioFamilySection.module.css frontend/src/features/portfolio/PortfolioFamilySection.test.tsx
git commit -m "feat: add Portfolio page family allocation and Quick Insights (Section 4)"
```

---

### Task 8: Portfolio page + shell route

**Files:**
- Create: `frontend/src/features/portfolio/PortfolioPage.tsx`, `.module.css`, `frontend/src/shell/routes/portfolio.route.tsx`
- Test: `frontend/src/features/portfolio/PortfolioPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 4-7's exports in full; `useScope()`, `<PageLayout>`, `useImport()`, `<PageState>` (shell, per contract §6); `getMemberAllocation`/`getAggregateAllocation` (existing, `features/dashboard/api.ts` — for Section 4's per-member `AllocationSummary` calls, per Task 7's Interfaces note) and `getMemberHoldings`/`getAggregateHoldings` (existing) for `holdingsByMember`; `getMemberSips`/`getAggregateSips` (existing) for the SIP list.
- Produces: `PortfolioPage(): JSX.Element` (default export, mounted by the route module), the `ShellRoute` object in `portfolio.route.tsx` matching the contract's `ShellRoute` interface exactly: `{ id: "portfolio", path: "/portfolio", label: "Investments", icon: LayoutGrid, section: "portfolio", order: 1, layout: "app", scope: "family-or-member", status: "live", title: "Investments", page: () => import("../../features/portfolio/PortfolioPage") }`.

- [ ] **Step 1: Write the failing tests**

```tsx
test("mounts via renderInShell at /portfolio and fetches family-scope data by default", async () => {
  renderInShell(<PortfolioPage />, { path: "/portfolio", scope: { viewMode: "aggregate" } });
  await screen.findByText(/Total Portfolio Value/i);
});

test("clicking Add Investment calls useImport().openImport with the current member", () => {
  const openImport = vi.fn();
  mockUseImport({ openImport });
  renderInShell(<PortfolioPage />, { path: "/portfolio", scope: { viewMode: "member", memberId: "m1" } });
  fireEvent.click(screen.getByRole("button", { name: /add investment/i }));
  expect(openImport).toHaveBeenCalledWith("m1");
});

test("each section's own loading state does not block the others from rendering", async () => {
  mockSlowFetch("/portfolio/summary"); // Section 1's call never resolves in this test
  renderInShell(<PortfolioPage />, { path: "/portfolio", scope: { viewMode: "aggregate" } });
  await screen.findByText(/Mutual Funds/i); // Section 2+3 rendered anyway
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/features/portfolio/PortfolioPage.test.tsx`
Expected: FAIL (module/route not found)

- [ ] **Step 3: Implement**

Three independent `useEffect`/fetch calls per design.md §10's progressive-hydration sequence diagram (allocation, summary+series, sips — each sets its own `loading` state, matching Task 5/6/7's `loading` props so one slow section never blocks its siblings, per this task's own test and the Review Focus list). `useScope()` selects member vs. aggregate variant of each of Task 4's six API functions plus the existing allocation/holdings/sips ones. "+ Add Investment" button calls `useImport().openImport(scope.viewMode === "member" ? scope.memberId : undefined)`, per design.md §4/§10's revised (v1.3) sequence — no new picker UI, no `returnTo` param.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/features/portfolio/PortfolioPage.test.tsx && npx tsc -b`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/portfolio/PortfolioPage.tsx frontend/src/features/portfolio/PortfolioPage.module.css frontend/src/features/portfolio/PortfolioPage.test.tsx frontend/src/shell/routes/portfolio.route.tsx
git commit -m "feat: assemble Portfolio page and register its shell route"
```

---

## Self-Review

**1. Spec coverage:** §1 scope (MF-only, coming-soon placeholders) — Task 1, 6. §2.1 Summary Strip — Task 2, 5. §2.2 sparkline — Task 3, 5. §2.3 Asset Allocation + schema conflict — Task 1, 6. §2.4 Family + Quick Insights — Task 7. §2.5 deferred gaps — not built, correctly excluded. §3 layout — Task 8 assembly. §4 data flow / click flows — Task 8, 6. §5 reuse classification — honored throughout (Global Constraints forbids touching `compute_allocation`/`DashboardView`). §6 shell integration — Task 8. §7 deferred items — correctly excluded (no Sync/Export/Search/Filter-redesign tasks). §8 builder-check resolutions — reflected in Task 1 (8-slice), Task 5 (XIRR reuse), design already covers the scope-reset item (no page-side code needed, shell-owned). §9 PRD/user stories — covered by US-1 (Task 2/5 totals), US-2 (Task 5 disclaimer reuse), US-3 (Task 1/6 coming-soon slices), US-4 (shell-owned, no page code). §10-§12 — technical design reflected across Tasks 1-8; no ER/architecture doc changes needed per §11. §13 hi-fi visuals — Tasks 5/6 cite `hifi-states.html` verbatim for markup/sizing. No gaps found.

**2. Step scan:** every code step names an exact signature and file; test steps name exact assertions with spec values (eight buckets, five metrics, specific field sums). No step says "handle edge cases" or leaves a type undefined that a later task relies on.

**3. Type consistency:** `InstrumentAllocationBucket`/`PortfolioSummary`/`DailyValuePoint` are defined once (Tasks 1-3) and consumed by name, unchanged, in Tasks 4, 5, 6, 8. `AllocationSummary`/`HoldingRow`/`SipRow`/`XirrDisclaimer` are the existing types, never redefined. `compute_instrument_allocation`/`compute_portfolio_summary` signatures (pure, no `db` param) match how Task 8's route handlers are described as calling them in Tasks 1-2's own route-handler steps.

**4. Review Focus:** all five items have an owning task and an explicit test step (listed inline above). No item was left uncovered.

**5. Proportion:** this plan is close in length to its spec because the spec's §2.2/§2.3 algorithms are genuinely non-trivial (the sparkline replay, the taxonomy conflict) and needed full algorithm descriptions per the skill's own exception for that case; every other step is signature-plus-test-name, not a body transcript.

---

## Execution Handoff

Plan complete and saved to `Docs/superpowers/plans/2026-10-23-portfolio-home-page-implementation.md`. Please review the plan. Which execution approach would you prefer?

- **Subagent-driven** — a fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — I implement every task myself in this session, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end.

For this plan I recommend **Subagent-driven**, because Tasks 1-3 fix a real schema/taxonomy conflict that must not leak into the still-live `DashboardView`, and Tasks 5-8 depend on shell interfaces (`useScope`, `paths`, `AppLink`, `useImport`) that don't exist in the codebase yet — a per-task fresh reviewer is the best guard against either a silent regression to the existing Dashboard or a frontend task quietly drifting from the shell contract's exact signatures before that contract is even built. Does the plan capture what you want, and which approach should we use?
