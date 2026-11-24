# XIRR Leads, Returns on the Flip Side: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `Docs/orchestration/wave-common-rules.md` first; it wins where it differs. This project runs on the **orchestrator and workers** strategy of M1 to M4: **Claude orchestrates, Codex builds the backend and writes tests, Antigravity (Gemini) builds the frontend.** Workers never run a state-changing git command; Claude commits and merges.

**Goal:** Make the real annualised XIRR the headline everywhere the Portfolio tile, the Mutual Funds tile and the Mutual Funds holdings list show a return, add the plain "Returns since purchase" figure beside it (a flip tile on the two tiles, a new column in the list), and fix the label that today says "XIRR" over a number that is not one.

**Architecture:** One backend function (`portfolio_xirr_display`) stops swapping to the since-purchase figure under 365 days. It always returns the annualised rate, always returns the since-purchase return when money was paid in, and adds an optional caution (`young` or `single_transaction`) that the screens show as a small chip on the XIRR. The numbers already travel to the browser; the response gains additive fields only. One small pure helper in `frontend/src/lib/xirrDisplay.ts` is the single front-end rule. One presentational component flips a tile between its two faces. No database migration.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy, Pydantic, pytest (backend). React, TypeScript, Vitest, Tailwind tokens, lucide-react (frontend).

**Spec:** `Docs/orchestration/2026-11-24-xirr-vs-returns-plan.html` (version 9, all 11 questions answered; published at `https://claude.ai/artifact/GQGi9BmAZUmgtrke9rqSdu`). The page is the design: its mockups, copy and decisions win over this plan's prose. Where the page and the live code disagree, stop and ask the owner. Related, **not part of this plan and on hold:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html`.

## Who builds what (strategy, same as M1 to M4)

| Role | Does | Does not |
|---|---|---|
| **Claude (orchestrator)** | Wave-start check, **the contract written in this plan** (interfaces, JSON shapes, test names and ids), every handoff and packet, merges, commits, runs every worker's tests itself, screenshots from a real browser, reviews, docs, deploy guide, the deploy at the owner's go | Write product code (a worker does), delegate design, the interface in this plan, or anything about who sees what |
| **Codex (backend worker)** | Backend rule and plumbing, backend tests, and **the front-end foundation (FE-1a, as in M2): the types, the small shared helper with its unit tests, and the front-end red tests** | Run FastAPI `TestClient` or async tests in its sandbox (they stall: it writes them, tries once, reports BLOCKED; Claude runs them), run WSL, commit |
| **Antigravity (frontend worker)** | The flip component, both tiles, the Unrealised label, the holdings table; red tests first (shows them fail), then builds; runs checks through `wave-fe-check.sh` | Touch `backend/**`, edit a red test, commit, change any copy |
Fallback if a worker runs out: Antigravity with Claude Sonnet 5.5 high, then "Gemini 4 Argon", then Gemini 3.8 high, then inline in Claude (memory: worker fallback order). The packets stay model-neutral.

## Global Constraints

Owner decisions (11 answers, 24 Nov 2026), verbatim where they fix a value:
- **XIRR is the default headline everywhere it shows**, for every portfolio and fund, young or mature. It opens on XIRR on every page load.
- **Scope, only these places get Returns:** the Portfolio tile, the Mutual Funds tile, the Mutual Funds holdings list, and the label on the Unrealised Gain percentage. **No other screen changes** (Performance page, Analytics, individual fund page, Allocation fund-manager card, mobile dashboard, legacy dashboard, `frontend/src/mobile/**`). **One consequence, decided by the owner on 24 Nov 2026:** the PDF export's Overview page prints the same `HoldingsTable`, so it follows the screen (Returns and XIRR columns and the chip); it also stops printing the mislabelled since-purchase number under "XIRR".
- **Q1:** a single transaction is exactly one dated purchase flow; reinvested dividends and the final valuation do not count.
- **Q2:** age is the date of the first flow; 365 days or more is "mature".
- **Q3:** the tile is **flipped** (option D): one measure at a time, a "Show Returns" / "Show XIRR" button, no twin line.
- **Q4:** always open on XIRR; a flip lasts until the page reloads; nothing is stored anywhere.
- **Q5:** table columns have equal weight; the caution chip sits on the XIRR cell only where it applies.
- **Q6:** columns **Gain/Loss, Returns, XIRR**, short headers with tooltips.
- **Q7:** tile lines `Since purchase, not annualised` (Returns face) and `Annualised since your first investment` (XIRR face). Unrealised: `+6.5% return on invested` with an ⓘ.
- **Q9:** each view (Lifetime, Current holdings) and each fund row gets its own chip from its own flows.
- **Q10:** keep `*_xirr_basis` for the old link but stop using it; add the optional caution; always send both numbers.
- **Q11:** rebuild stored results for all households right after the backend deploys, then ship the frontend.
- **Chip text:** `held under 1 yr` and `one transaction`. If both apply, one chip shows: `held under 1 yr`. Chips sit on the XIRR face or the XIRR cell only, never on Returns.

Project rules (from `wave-common-rules.md` and `AGENTS.md`):
- **Backend changes are additive only** (the old staging link shares this backend): no field removed, renamed or changed in meaning; no route removed. **No migration; Alembic stays 0054.**
- `Decimal`, never `float`; decimals travel as strings; the client never adds money. No new dependency; no `package.json` change.
- Plain words in every user-visible string; **no em dashes**; no advice wording; **the copy already built never changes** except where this plan names the new strings.
- Colours only through app tokens (`--ui-*`, `--pos`, `--pos-text`, `--neg-text`, `--warn-bg`, `--warn-text`, ...); no hex. Palette source: `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`.
- Front-end guards: `features/mutual-funds/guards.test.ts` asserts exactly **70** source files (measured 24 Nov 2026; the plan first said 56) (this plan adds **no** file under `features/mutual-funds`), every `<button` needs `data-clickable`, no `parseFloat`, `toFixed`, `Intl.`, `console.`, hex colours or `any`; features may not import other features; `components/` may not import `features/*`.
- Phone UI (`frontend/src/mobile/**`) unchanged. No GA4 events. Invented data only; no real folio, name or PAN.
- Tests first, always; run only the affected tests; red test files are fixed once written.

## Review Focus

Inputs the spec implies but no obvious test covers; each has a test in the task named in brackets.
1. **A fund bought once inside a mature portfolio:** its table row shows the `one transaction` chip; the portfolio tile shows none. [Tasks 2, 6]
2. **Flows that net to zero on one day:** both faces and both cells show a dash, no chip, and the tile hides the flip button (nothing to flip to). [Tasks 2, 5, 6]
3. **A stored per-fund payload from before the rebuild** (no `since_purchase_return`, no `xirr_caution` key): the XIRR still shows, Returns shows a dash, no crash. [Tasks 3, 6]
4. **Both conditions at once** (under a year and one purchase): exactly one chip, `held under 1 yr`. [Tasks 2, 5, 6]
5. **A family with more than four members** (member rates are not sent): child XIRR and Returns cells show a dash, parent rows are unaffected. [Task 6]
6. Flip state across the Lifetime / Current toggle: the chosen face stays (the toggle changes the figures, not the face); a reload resets to XIRR. [Task 5]
7. A negative return renders `-0.1%` and zero renders `0.0%`, in the figure's existing colour (a figure never gets a new colour; the design page's green figures are drawing only). [Task 5]

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/services/dashboard/xirr.py` | `portfolio_xirr_display` (the rule), `PortfolioXirrDisplay`, `DashboardXirrSummary` gain the caution |
| `backend/app/services/dashboard/schemas.py`, `portfolio_schemas.py`, `portfolio_summary.py`, `holdings.py`, `aggregate.py`, `backend/app/api/dashboard.py` | Pass the caution through tile, holdings and consolidated rows |
| `backend/app/services/analytics/benchmark.py`, `analytics/schemas.py` | Per-fund stored row gains `xirr_caution`; since-purchase always filled |
| `frontend/src/lib/xirrDisplay.ts` (+ test) | The one front-end rule: both figures, the caution, the strings |
| `frontend/src/components/MeasureFlip.tsx`, `MeasureFlip.module.css`, `XirrCautionChip.tsx` (+ test, new) | Presentational flip (title row, button, 200 ms turn, reduced motion) and the shared caution chip |
| `frontend/src/features/portfolio/sections/SummaryStrip.tsx`, `features/mutual-funds/overview/SummaryStrip.tsx` | Tiles: flip, chip, caption, Unrealised label |
| `frontend/src/features/mutual-funds/overview/HoldingsTable.tsx`, `OverviewPage.tsx`, `features/mutual-funds/api.ts`, `frontend/src/print/groups/overview/OverviewSections.tsx` | Returns and XIRR columns, sort, metadata mapping (screen and PDF page) |
| `frontend/src/features/{portfolio,mutual-funds}/types.ts` | Optional caution fields |

## Lanes, branches and folders (this laptop; confirm each path when the packet is written)

Integration branch `batch/xr-returns` cut from `leapswitch-redesign`. Workers' folders: one per lane, never the main checkout. Every prompt carries, above its code block: **worker, project folder to open, branch, new or reuse** (owner rule, 23 Nov).

| Lane | Task | Worker | Folder | Branch |
|---|---|---|---|---|
| BE | 2, then 3 (in order) | Codex | `C:\Users\Dell\lanes\unifolio-xr-be` (new worktree) | `batch/xr-be` |
| RT | 1 and 4 together (one handoff, FE-1a: types, helper, red tests) | Codex | `C:\Users\Dell\lanes\unifolio-xr-rt` (new worktree) | `batch/xr-rt` |
| FE-1 | 5 | Antigravity | `C:\Users\Dell\ag-xr1` (new clone) | `ag/xr1-tiles` |
| FE-2 | 6 | Antigravity | `C:\Users\Dell\ag-xr2` (new clone) | `ag/xr2-table` |
| Claude | 0, 7 to 10 (no product code) | Claude | `C:\Users\Dell\lanes\unifolio-xr-returns` (integration worktree; check lane `xr`) and the docs worktree for documents | `batch/xr-returns` |
Capacity (owner, current): up to two Codex tasks and four Antigravity lanes at once, on disjoint files. Check lanes in `wave-fe-check.sh`: `xr` (integration), `ag-xr1`, `ag-xr2`. On this laptop run it with `wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash <script> <lane> <mode> <paths>` (literal values only; never shell variables through wsl.exe). Back-end test command: `cd backend; "C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only\backend\.venv\Scripts\python.exe" -m pytest <files> -q -p no:cacheprovider`. Setup script for new worktrees and clones: `Docs/orchestration/2026-11-23-new-laptop-lane-setup.ps1`.

**Order (fewest relays):** Round 1: Task 0 (done). Relay wave A: Task 2 (Codex BE) and Tasks 1 and 4 as one handoff (Codex RT, FE-1a) together, two Codex tasks on disjoint files (the RT lane needs only the contract in this plan, not Task 2). Relay wave B (when Task 2 and FE-1a land and I have verified and committed them): Task 3 (Codex BE) and Tasks 5 and 6 (Antigravity) together; the front-end lanes use fixtures, not the live backend. Relay wave C: the G1 Codex review of the backend. Then only fix rounds, if any. Round 4: Tasks 7 to 9 (Claude). Round 5: Task 10 at the owner's go, then QA.

## Handoff and packet rules (how Claude writes them later, during execution)

**Codex handoff** (`Docs/orchestration/2026-11-2x-xr-<task>-handoff.md`, template `.claude/skills/model-orchestration/references/handoff-doc-template.md`, one line in `Docs/orchestration/delegation-log.md`): status and approval; parent plan and spec; worker constraints (cannot run async or `TestClient` tests, report BLOCKED with the exact error); work-in folder and branch; the wave-start check; the contract (signatures and JSON, copied from this plan); tests first with the plan's test names; files it may touch and may not touch; commands; a fixed report block; a paste-ready prompt. Read-only for git.

**Antigravity packet** (`Docs/orchestration/2026-11-2x-xr-<task>-packet.md`) is the place where the UI comes out well, so it must be **very detailed** (the worker cannot see the screen). Each packet contains, at minimum:
1. The owner's decisions that bind the task and the exact artifact page and mockup it implements (quote the state numbers from the page: tile states 1 to 9, table sections).
2. **Exact copy**, every string, listed (see Task 5 and 6), with where each appears and its accessible name. Copy never changes.
3. **Exact DOM and classes** for each state: element order, `data-testid`s, the Tailwind classes from the existing tile (keep today's classes; the packet gives only the additions), font sizes (`text-2xl` figure, `text-xs` captions, `text-[11px]` chips as today's table uses), gaps, radii, and which element keeps its current class.
4. **A states table:** default, flipped, young chip, single-transaction chip, both-conditions chip, Current view, disclaimer on each face, not computable, loading, error, dark mode, reduced motion, keyboard focus. Each row: what renders and which test pins it.
5. **No layout jump on flip:** both faces reserve the same height (an invisible placeholder row where the other face has a chip), because the tile sits in a five-column strip.
6. Tokens for every colour (chip colours, loss and gain figures, muted text), taken from the palette reference; the packet states the chosen token for the `one transaction` chip.
7. Accessibility: the flip button's accessible name, `aria-live="polite"` on the figure, focus stays on the button after a flip, Enter and Space work, `data-clickable` present, chip tooltips as `title` plus `aria-label`.
8. The red tests (named, fixed), the commands (WSL script and the PowerShell fallback), what "done" means, the allowed-files list and the do-not-touch list (`backend/**`, `frontend/src/mobile/**`, any `*.test.*`, other features).
9. A report block, and a paste-ready prompt. Claude then screenshots the result next to the page's mockup (1280x600, 1440x810, 1536x730, light and dark) and sends exact differences back; the worker fixes only those.

## Task 0: Wave-start check and lane setup (Claude)

**Files:** none changed. Output: a short drift note appended to this plan's "Execution log" at the end.

- [ ] **Step 1: Create `batch/xr-returns` from `origin/leapswitch-redesign` after `git fetch`; create the four worker folders** with the setup script. Documents live on `leapswitch-redesign`; merge it into each worker branch before relaying a packet.
- [ ] **Step 2: Confirm the code the plan names still looks as described.** `portfolio_xirr_display` in `backend/app/services/dashboard/xirr.py` (365-day test, `PortfolioXirrDisplay(rate, basis, since_purchase_return)`); the `since_purchase_return` and `xirr_basis` fields in the four schema files and in `aggregate.py`'s whitelist; `resolveXirrDisplay` users (`features/portfolio/sections/SummaryStrip.tsx`, `features/mutual-funds/overview/{SummaryStrip,HoldingsTable,OverviewPage}.tsx`); the file count in `features/mutual-funds/guards.test.ts` (`70` today).
- [ ] **Step 3: Check the two Q1 assumptions in the code and write the answer in the drift note.** (a) `DIVIDEND_REINVEST` is not in `_FUND_RELEVANT_TYPES` (so it is never a cash flow). (b) A switch-in is a debit (a negative flow) only in the Current-holdings and per-fund flow lists (`extra_debit_types`), so "count the negative flows the solver receives" already means what the owner decided. Two purchases on one day are two flows.
- [ ] **Step 4: Record the baseline.** Run `backend/tests/services/analytics/xirr_reference/`, `backend/tests/api/test_dashboard_aggregate_routes.py`, `test_dashboard_holdings_route.py`, `test_portfolio_routes.py`, and the front-end files `features/portfolio/sections/SummaryStrip.test.tsx`, `features/mutual-funds/overview/{SummaryStrip,HoldingsTable,OverviewPage}.test.tsx`, `lib/xirrDisplay.test.ts` (if present). Record pass counts.
- [ ] **Step 5: Palette decision for the `one transaction` chip.** Read the palette reference; the page drew it in a blue tint, which may not exist as a token. Default if none: a neutral chip (`--ui-card` background, `--ui-text-muted` text, `--ui-divider` border). Record the token in the drift note. **Decided in Task 0 (see the execution log):** the app has no informational tokens, so `one transaction` uses the neutral chip and `held under 1 yr` uses the existing partial-price chip look (`bg-[var(--warn-bg)] text-[var(--warn-text)]`, `rounded-full px-2 py-0.5 text-xs`). The legacy `components/Badge` is not reused (different token system, forces capitalised text).

## Task 1: Front-end foundation: types and the shared helper (Codex, lane RT; one handoff with Task 4, the M2 "FE-1a" pattern)

**Files:**
- Modify: `frontend/src/features/portfolio/types.ts`, `frontend/src/features/mutual-funds/types.ts`, `frontend/src/features/mutual-funds/api.ts`
- Modify: `frontend/src/lib/xirrDisplay.ts` (keep the old exports until Task 7)
- Test: `frontend/src/lib/xirrDisplay.test.ts` (new file; none exists today)

**Interfaces (the contract: fixed here by the orchestrator, built by the worker):**
- Produces (types, all optional so old payloads still type-check): `type XirrCaution = "young" | "single_transaction"`; `xirr_caution?: XirrCaution | null` on the per-fund and consolidated row types; `lifetime_xirr_caution?` and `current_holdings_xirr_caution?: XirrCaution | null` on the tile response types and on `XirrBundle`.
- Produces (helper):
  ```ts
  export const XIRR_CAPTION = "Annualised since your first investment";
  export const RETURNS_CAPTION = "Since purchase, not annualised";
  export const CAUTION_CHIP: Record<XirrCaution, { text: string; tip: string }>;
  export interface Figures { xirr: string | null; returns: string | null; caution: XirrCaution | null }
  export function resolveFigures(
    xirr: string | null | undefined, sincePurchase: string | null | undefined, caution: XirrCaution | null | undefined,
  ): Figures;
  ```
  `CAUTION_CHIP.young = { text: "held under 1 yr", tip: "Held under 1 year: an annualised rate can look very large over a short period. Open Returns to see the plain gain." }`; `single_transaction = { text: "one transaction", tip: "One purchase only, so this is the yearly rate of a single investment." }`. `resolveFigures` turns `undefined` into `null`, never throws, never invents a number.
- `getHoldingsBundle` copies `lifetime_xirr_caution` and `current_holdings_xirr_caution` into `XirrBundle` the same way it copies the basis keys (only when the key is present).

- [ ] **Step 1: Write the failing tests** in `xirrDisplay.test.ts`: `resolveFigures_passes_both_numbers_and_the_caution`, `resolveFigures_turns_undefined_into_null`, `resolveFigures_keeps_a_zero_return_as_the_string_0` (assert `"0"` is not treated as missing), `caution_chip_text_and_tip_match_the_owner_wording` (exact strings above), `captions_match_the_owner_wording`; in `api.test.ts` (mutual-funds): `getHoldingsBundle_copies_the_two_caution_keys_when_present_and_omits_them_when_absent`.
- [ ] **Step 2: Run them; confirm they fail** (`npx vitest run src/lib/xirrDisplay.test.ts src/features/mutual-funds/api.test.ts` through `wave-fe-check.sh`).
- [ ] **Step 3: Implement** the types, `resolveFigures`, the constants and the bundle copy. One line of why in a comment on `resolveFigures`: "XIRR always leads; the old swap to the since-purchase figure is gone (owner, 24 Nov 2026)".
- [ ] **Step 4: Codex reports BLOCKED on running (no WSL); Claude runs the tests, `npx tsc -b` and `npx oxlint src/lib src/features/portfolio src/features/mutual-funds`: all green.** The old `resolveXirrDisplay` and the tests that use it still pass.
- [ ] **Step 5: Claude verifies** (runs the tests through `wave-fe-check.sh`, since Codex cannot run WSL), reads the diff against the allowed list, and commits `feat(xirr): front-end types and the shared figures helper`. Codex writes the code; the interface above is the contract I fixed.

## Task 2: Backend rule and the tile path (Codex, lane BE)

**Files:**
- Modify: `backend/app/services/dashboard/xirr.py` (`portfolio_xirr_display`, `PortfolioXirrDisplay`, `DashboardXirrSummary`, `calculate_dashboard_xirr`), `backend/app/services/dashboard/schemas.py` (**only** the `XirrCaution` literal; the response schemas and routes are Task 3, so no response-shape test goes red in between)
- Test: `backend/tests/services/analytics/xirr_reference/test_xirr_short_period.py` (extend), new `backend/tests/services/dashboard/test_xirr_caution.py`

**Interfaces:**
- Produces:
  ```python
  XirrCaution = Literal["young", "single_transaction"]          # in dashboard/schemas.py beside XirrBasis
  @dataclass(frozen=True)
  class PortfolioXirrDisplay:
      rate: Decimal | None = None
      basis: XirrBasis | None = None                            # unchanged meaning: kept for the old link
      since_purchase_return: Decimal | None = None
      caution: XirrCaution | None = None
  def portfolio_xirr_display(rate: Decimal | None, cash_flows: list[tuple[date, Decimal]]) -> PortfolioXirrDisplay
  ```
  `DashboardXirrSummary` gains `lifetime_xirr_caution` and `current_holdings_xirr_caution` (`XirrCaution | None = None`).
- **Rule (decided; the signature and tests fix the rest):** let `end = cash_flows[-1][0]`, `first = min dates`, `age = (end - first).days`, `paid` = sum of negative amounts, `received` = sum of positive amounts, `purchase_count` = number of negative amounts in `cash_flows[:-1]`.
  - All flows on one day: unchanged (`rate` only if they do not net to zero; no basis, no since-purchase, no caution).
  - `rate` always returned as given. `basis` exactly as today (`annualised` when `age >= 365` and rate is not None; `since_purchase` when `age < 365`).
  - `since_purchase_return` = `(received / paid - 1)` normalised, **for every basis**, whenever `paid > 0`; otherwise None.
  - `caution` only when `rate is not None`: `"young"` if `age < 365`, else `"single_transaction"` if `purchase_count == 1`, else None.

- [ ] **Step 1: Write the failing tests** (names fixed). In `test_xirr_short_period.py` update the parametrised fixture test to `(name, basis, absolute, caution)`: `one_month` since_purchase "0.1" young; `three_months_up` "0.2" young; `three_months_down` "-0.15" young; `lump_sum_366_days_across_feb_29` annualised, absolute equal to `received/paid - 1` formatted, `single_transaction`. Also change `test_every_fund_over_a_year_is_unchanged` to assert the rate and basis are unchanged and `since_purchase_return` is now filled. New in `test_xirr_caution.py`: `two_purchases_over_a_year_have_no_caution`, `young_wins_over_single_transaction`, `two_purchases_on_the_same_day_are_two_flows`, `a_switch_in_counts_as_a_purchase_flow_in_the_current_holdings_view`, `a_reinvested_dividend_is_not_a_purchase_flow`, `net_zero_on_one_day_has_no_caution_and_no_since_purchase`, `no_money_paid_gives_no_since_purchase_and_no_caution`, `no_rate_gives_no_caution`, `the_rate_and_the_basis_are_unchanged_for_every_fixture` (guards against drift), `lifetime_and_current_views_get_their_own_caution`.
- [ ] **Step 2: Run them; expected red** because `caution` does not exist and `since_purchase_return` is None over a year.
- [ ] **Step 3: Implement** `portfolio_xirr_display` per the rule; thread `caution` through `calculate_dashboard_xirr` into `DashboardXirrSummary`; add the `XirrCaution` literal to `schemas.py`; update only the existing tests whose expected `since_purchase` values change (the new `*_caution` response fields are Task 3). One comment on the function: why XIRR always leads and the chip is a caution (owner, 24 Nov 2026), and that `basis` is kept for the old link and no screen reads it.
- [ ] **Step 4: Run the service-level tests; any API test that stalls in the sandbox is reported BLOCKED with the exact error** (Claude runs them). Expected: pass.
- [ ] **Step 5: Claude verifies (runs the files itself), reviews the diff against the allowed list, commits** `feat(xirr): always annualised, always since-purchase, optional caution (tile path)`.

## Task 3: Per-fund stored rows, holdings rows, routes, fixtures (Codex, lane BE, after Task 2)

**Files:**
- Modify: `backend/app/services/analytics/benchmark.py` (the `FundBenchmarkRow(...)` build near line 413), `analytics/schemas.py` (`FundBenchmarkRow`), `backend/app/services/dashboard/holdings.py` (`HoldingXirrFields`, `ConsolidatedHolding`/`Child` via `schemas.py`), `backend/app/services/dashboard/aggregate.py` (the stored-payload read and the response), and the tile responses: `schemas.py` (`AggregateHoldingsResponse`, `MemberHoldingsResponse`: `lifetime_xirr_caution`, `current_holdings_xirr_caution`), `portfolio_schemas.py`, `portfolio_summary.py`, `backend/app/api/dashboard.py`
- Modify: `backend/tests/fixtures/portfolio/summary_*.json` (add the new optional keys where the shape fixtures list the basis keys)
- Test: `backend/tests/services/analytics/xirr_reference/test_xirr_short_period.py` and `test_xirr_metadata.py` (extend), `backend/tests/api/test_dashboard_aggregate_routes.py`, `test_dashboard_holdings_route.py`, `test_portfolio_routes.py` (extend)

**Interfaces:**
- Consumes: `PortfolioXirrDisplay.caution` and the always-filled `since_purchase_return` from Task 2.
- Produces: `xirr_caution: XirrCaution | None = None` on `FundBenchmarkRow` (stored in the `benchmark_funds` JSON payload), `ConsolidatedHolding`, `ConsolidatedHoldingChild`, and the `HoldingXirrFields` TypedDict. `aggregate.py` reads `xirr_caution` from each stored fund and passes it only when it is `"young"` or `"single_transaction"` (the same whitelist style as the basis), and sends `lifetime_xirr_caution` and `current_holdings_xirr_caution` on the aggregate response.

- [ ] **Step 1: Write the failing tests:** `stored_column_carries_since_purchase_and_caution_for_every_fund`; `a_fund_bought_once_inside_a_mature_household_has_its_own_single_transaction_caution`; `an_old_stored_row_without_the_caution_key_still_loads` (extend the existing old-row test; no crash, caution None); `aggregate_route_sends_both_numbers_and_the_two_tile_cautions`; `member_holdings_route_sends_both_numbers_and_the_two_tile_cautions`; `portfolio_summary_route_sends_both_numbers_and_the_two_tile_cautions`; `consolidated_parent_and_children_each_carry_their_own_caution`; `old_fields_are_still_present_unchanged` (basis keys, `since_purchase` keys, `xirr`, `xirr_as_of`); `no_new_field_is_required_in_the_response` (additive guard).
- [ ] **Step 2: Run; expected red.** Codex runs only service-level tests; the route tests are written, tried once, and reported BLOCKED if they stall.
- [ ] **Step 3: Implement** the schema fields, the `benchmark.py` fill (`xirr_caution=display.caution`), the `aggregate.py` read and passthrough, the TypedDict key, and the fixture JSON keys. Do not recompute anything on read; the table still reads stored results.
- [ ] **Step 4: Run; Claude runs the route tests itself** from the worktree's `backend/` with the Windows venv.
- [ ] **Step 5: Gate G1 (mandatory):** dispatch `codex:codex-rescue` with `/codex:adversarial-review` against the Task 2 and 3 diff (read-only, never `isolation: worktree`), run in the background; the owner relays the review by hand. Findings are closed only by a fix with a red test first, or by the owner accepting them. Then Claude commits `feat(xirr): caution and since-purchase on holdings, consolidated and stored fund rows`.

## Task 4: Front-end red tests (Codex, lane RT; the second half of the same handoff as Task 1)

**Files (test files only here; Task 1's own files are listed in Task 1):**
- Modify: `frontend/src/features/portfolio/sections/SummaryStrip.test.tsx`, `frontend/src/features/mutual-funds/overview/SummaryStrip.test.tsx`, `frontend/src/features/mutual-funds/overview/HoldingsTable.test.tsx`, `frontend/src/features/mutual-funds/overview/OverviewPage.test.tsx`
- Modify: `frontend/src/print/groups/overview/overview.print.test.tsx` (it imports `SINCE_PURCHASE_CAPTION`; it must assert the new columns and no old caption instead)
- Create: `frontend/src/components/MeasureFlip.test.tsx`

**Interfaces:**
- Consumes: Task 1's `resolveFigures`, `CAUTION_CHIP`, `XIRR_CAPTION`, `RETURNS_CAPTION` (written in the same handoff, first).
- **Fixes the component and the test ids that Tasks 5 and 6 must satisfy:**
  ```tsx
  // frontend/src/components/MeasureFlip.tsx (Task 5 creates it)
  export interface MeasureFlipProps {
    face: "xirr" | "returns";
    onFlip: () => void;
    canFlip: boolean;                 // false hides the button (nothing to flip to)
    labelXirr: string;                // "XIRR"
    labelReturns: string;             // "Returns"
    children: React.ReactNode;        // the face's body (figure, caption, chip, links)
  }
  ```
  Button: `data-testid="measure-flip"`, accessible name `Show Returns` (on the XIRR face) or `Show XIRR` (on the Returns face), `data-clickable`. Face title: `data-testid="measure-title"`. Tile ids kept: `metric-xirr`, `value-xirr`, `xirr-caption`, `xirr-as-of`. New: `xirr-caution` (the chip). Table cells: `returns` and `xirr` (existing id), children `child-returns` and `child-xirr`; the chip inside a cell `xirr-caution`. Unrealised: `delta-unrealised` (existing) keeps its id and gains the label text.

- [ ] **Step 1: Write the red tests (names fixed).** `MeasureFlip.test.tsx`: `renders_the_children_and_the_title_of_the_current_face`, `button_name_is_show_returns_on_the_xirr_face_and_show_xirr_on_the_returns_face`, `calls_onFlip_on_click_enter_and_space`, `hides_the_button_when_canFlip_is_false`, `has_data_clickable_and_a_polite_live_region`, `focus_stays_on_the_button_after_a_flip`. Both tile test files (same set, adapted to each tile's data): `opens_on_xirr_with_the_annualised_caption`, `young_portfolio_shows_the_annualised_figure_and_the_held_under_1_yr_chip`, `flip_shows_returns_with_the_since_purchase_caption_and_no_chip`, `flip_back_returns_to_xirr`, `face_survives_the_lifetime_current_toggle`, `current_view_uses_its_own_figures_and_chip`, `single_transaction_shows_the_one_transaction_chip`, `both_conditions_show_only_held_under_1_yr`, `mature_multiple_buys_have_no_chip`, `opening_balance_disclaimer_link_works_on_either_face`, `not_computable_shows_a_dash_and_hides_the_flip_button`, `missing_since_purchase_hides_the_flip_button_and_xirr_still_shows`, `loading_and_error_states_are_unchanged`, `the_old_return_since_purchase_not_annualised_caption_is_gone_from_the_xirr_face`, `unrealised_percent_reads_return_on_invested_with_the_tooltip`, `old_payload_without_the_new_keys_renders_as_a_mature_portfolio_without_a_chip`. `HoldingsTable.test.tsx`: `columns_are_gain_loss_returns_xirr_in_that_order`, `returns_cell_shows_the_since_purchase_return_for_every_row`, `xirr_cell_shows_the_annualised_rate_never_the_since_purchase_figure`, `chip_sits_on_the_xirr_cell_only_where_the_caution_applies`, `the_since_purchase_sub_label_under_xirr_is_gone`, `a_fund_bought_once_gets_one_transaction_while_its_neighbours_do_not`, `family_parent_and_each_child_get_their_own_chip`, `more_than_four_members_shows_dashes_for_child_rows`, `missing_returns_shows_a_dash_and_xirr_still_shows`, `net_zero_row_shows_dashes_in_both`, `sorts_by_returns_and_by_xirr_with_missing_values_last`, `sort_menu_has_a_returns_entry`, `header_tooltips_use_the_owner_wording` (exact, as on the approved page: Returns = "Total gain as a share of money paid in, not annualised."; XIRR = "Yearly rate, worked out from the dates of your investments."). `OverviewPage.test.tsx`: `meta_mapping_passes_since_purchase_return_and_xirr_caution_for_every_fund`. `overview.print.test.tsx`: `printed_table_has_returns_and_xirr_columns_and_the_chip`, `printed_table_no_longer_shows_the_since_purchase_sub_label`, `print_mapping_passes_xirr_caution`.
- [ ] **Step 2: Run them (Claude runs through `wave-fe-check.sh`; Codex cannot run WSL). Confirm each fails for the stated reason** (missing component, missing ids, old caption), and that the guard tests (`guards.test.ts`) still pass on today's tree.
- [ ] **Step 3: Claude reads the diff, confirms only the allowed files changed (the helper, types, `api.ts` and test files), commits** `test(xirr): red tests for the flip tile and the Returns and XIRR columns`. The red files are now fixed for Antigravity.

## Task 5: The flip component, both tiles and the Unrealised label (Antigravity, lane FE-1)

**Files:**
- Create: `frontend/src/components/MeasureFlip.tsx`, `frontend/src/components/MeasureFlip.module.css`, `frontend/src/components/XirrCautionChip.tsx` (the shared chip for the two tiles; the table keeps a local chip until Task 7 unifies them)
- Modify: `frontend/src/features/portfolio/sections/SummaryStrip.tsx`, `frontend/src/features/mutual-funds/overview/SummaryStrip.tsx`; the global stylesheet where the app's other keyframes live (the worker finds it and reports its path) for the 200 ms turn
- Do not touch: `lib/xirrDisplay.ts`, `*.test.*`, `backend/**`, `frontend/src/mobile/**`, `HoldingsTable.tsx`, `OverviewPage.tsx`

**Interfaces:**
- Consumes: Task 1 helper (`resolveFigures`, `XIRR_CAPTION`, `RETURNS_CAPTION`, `CAUTION_CHIP`) and Task 4's fixed `MeasureFlipProps` and test ids.
- Produces: `MeasureFlip` as specified above. Each tile holds `const [face, setFace] = useState<"xirr" | "returns">("xirr")` (not stored anywhere; resets on reload), figures from `resolveFigures(...)` for the shown Lifetime or Current basis, `canFlip = figures.xirr !== null && figures.returns !== null`.

The packet must state all of this exactly (the page's tile states 1 to 9 are the oracle):
- **XIRR face:** title `XIRR` + the existing ⓘ (its tooltip text stays as built); figure = XIRR via `formatXirr`; caption `Annualised since your first investment`, or, where today's tile shows the opening-balance disclaimer link, that link with the XIRR caption (the link keeps working on both faces); the chip row; the existing `Prices as on <date>` line unchanged.
- **Returns face:** title `Returns` + ⓘ (tooltip: `Total gain as a share of money paid in, not annualised.`); figure = the since-purchase return via `formatXirr`; caption `Since purchase, not annualised`; no chip; the `Prices as on` line unchanged.
- **Reserve the chip row on both faces** (an invisible placeholder where the face has none) so the tile never changes height on a flip.
- **The Lifetime / Current toggle moves to its own row** under the title row on both tiles (today it shares the title row and collides with the caption in the owner's screenshots). Its look, labels and behaviour are unchanged.
- **Chip:** `<span data-testid="xirr-caution" title=... aria-label=...>` with `CAUTION_CHIP[caution].text`; `young` uses `bg-[var(--warn-bg)] text-[var(--warn-text)]`; `single_transaction` uses the token chosen in Task 0 step 5.
- **Unrealised card (both tiles):** the small percentage reads `+6.5% return on invested` (the percentage stays as formatted today; the words follow it) with an ⓘ whose tooltip is `Unrealised gain as a share of what you currently have invested. Not annualised.` Colour, size and the `delta-unrealised` id unchanged.
- **Motion:** the turn is a 200 ms `rotateX` from 80deg to 0 with opacity; under `prefers-reduced-motion` the face just swaps.
- Loading and error states of both tiles are unchanged.

- [ ] **Step 1: Sync the clone** (`git fetch origin` then merge `batch/xr-rt` and `batch/xr-returns`), run the red tests named for this lane (`MeasureFlip.test.tsx` and both tile test files) and **confirm they fail** before changing anything; report the failing count.
- [ ] **Step 2: Build `MeasureFlip.tsx`** (presentational, no feature imports, `data-clickable` on the button, lucide icon `RefreshCw` beside the text) and make its tests pass.
- [ ] **Step 3: Rewire the Portfolio tile**, then the Mutual Funds tile, to `MeasureFlip` with `resolveFigures`; add the chip and the Unrealised label; keep every existing id and class not named above.
- [ ] **Step 4: Run** `wave-fe-check.sh ag-xr1 test src/components src/features/portfolio src/features/mutual-funds/overview/SummaryStrip.test.tsx`, then `types` and `lint` on the touched folders; all green; `guards.test.ts` still passes with its count of 70.
- [ ] **Step 5: Report** (one block): failing counts before and after, commands and results, `git status --short`, anything not checkable (visual), the stylesheet path, the decisions the packet did not cover. Claude reviews, re-runs, screenshots, sends exact visual differences, then commits `feat(xirr): flip tile, caution chip and Unrealised label on both tiles`.

## Task 6: The holdings table columns (Antigravity, lane FE-2)

**Files:**
- Modify: `frontend/src/features/mutual-funds/mfCopy.ts` (the `returns` sort key and an optional fourth `sortHoldings` parameter), `frontend/src/features/mutual-funds/overview/HoldingsTable.tsx`, `frontend/src/features/mutual-funds/overview/OverviewPage.tsx` (the `xirrMetaByScheme` mapping), `frontend/src/print/groups/overview/OverviewSections.tsx` (the same mapping for the PDF page: add `xirr_caution`)
- Do not touch: `lib/xirrDisplay.ts`, `*.test.*`, `backend/**`, `frontend/src/mobile/**`, the two `SummaryStrip.tsx` files, `MeasureFlip.tsx`

**Interfaces:**
- Consumes: Task 1 helper, Task 4's fixed test ids (`returns`, `xirr`, `child-returns`, `child-xirr`, `xirr-caution`).
- Produces: `SchemeXirrMeta` gains `xirr_caution?: XirrCaution | null` (already has `since_purchase_return`); the sort key type gains `"returns"`; the sort menu gains `{ key: "returns", label: "Returns" }` placed after Gain/Loss.

The packet states exactly:
- **Single-member table:** columns after Gain/Loss: **Returns**, then **XIRR**, each with a tooltip on the header (the exact strings in Task 4). The old `since purchase` sub-label under the XIRR value is removed. The Returns cell shows the since-purchase return via the formatter, a dash when missing. The XIRR cell shows the annualised rate, a dash when missing, plus the chip (`xirr-caution`) only where `xirr_caution` is set. Equal weight in both cells (no bold, no muted). Same font size and number alignment as the other money columns.
- **Family table** (`FAMILY_COLUMNS`, `FamilyFigures`): the same two columns; the consolidated parent and every expanded child use **their own** figures and chip.
- Sort by `returns` and by `xirr` ascending and descending, missing values last.
- Nothing else in the table, its filters or its totals row changes.

- [ ] **Step 1: Sync the clone, run the red tests for this lane** (`HoldingsTable.test.tsx`, `OverviewPage.test.tsx`, `overview.print.test.tsx`), **confirm they fail**, report the count.
- [ ] **Step 2: Implement the columns, the cell contents, the header tooltips and the sort key** in `HoldingsTable.tsx`; add the mapping in `OverviewPage.tsx`.
- [ ] **Step 3: Run** `wave-fe-check.sh ag-xr2 test src/features/mutual-funds/overview src/print/groups/overview`, then `types` and `lint`; all green; `guards.test.ts` still passes with its count of 70.
- [ ] **Step 4: Report** as in Task 5. Claude reviews, re-runs, screenshots at 1280x600 and 1440x810 (the table has two more columns: check no horizontal scroll appears where it did not before), then commits `feat(xirr): Returns and XIRR columns in the holdings list`. Also check the PDF export's Overview page in the print route: the two extra columns must fit the printed page width (Task 7 step 4).

## Task 7: Integration and cleanup (Claude)

**Files:** merges of `batch/xr-be`, `batch/xr-rt`, `ag/xr1-tiles`, `ag/xr2-table` into `batch/xr-returns`; `frontend/src/lib/xirrDisplay.ts` (remove `resolveXirrDisplay`, `SINCE_PURCHASE_CAPTION`, `SINCE_PURCHASE_SHORT_LABEL` and any test that still imports them, once nothing else does).

- [ ] **Step 1: Merge the lanes in order** BE, RT, FE-1, FE-2; resolve nothing silently (files are disjoint by design); run `git diff --stat` per merge and confirm each stayed inside its allowed list.
- [ ] **Step 2: Delete the old swap helper and its exports** only after `grep` shows no importer; run `xirrDisplay.test.ts`.
- [ ] **Step 3: Run the affected suites in full on the merged tree:** the backend files from Task 0 step 4 plus `backend/tests/api`, the front-end `src/lib`, `src/components`, `src/features/portfolio`, `src/features/mutual-funds`, and `npx tsc -b`, `npx oxlint`, then a production build and a grep of the built CSS for the tokens the chips use.
- [ ] **Step 4: Run the screens harness** (include the print route's Overview page: both new columns fit the printed width) (throwaway static harness built with vite from a WSL mirror, served locally, driven with the browser tools): the six tile states and both faces, the table, light and dark, 1280x600, 1440x810, 1536x730; compare with the page's mockups; send exact differences to the lane worker; repeat only for the named differences. You cannot sign in to staging: say so.
- [ ] **Step 4b: Real-data check on a local database** with the synthetic CAS set (`Docs/CAS Files/synthetic/pdfs/`, password `MF@123`): a young SIP household, a mature household, a one-purchase fund inside it, a household with more than four members. Record what each tile and row shows.

## Task 8: Reviews and gates (Claude)

- [ ] **G1** (Task 3 step 5): Codex adversarial review of the backend, owner relays it.
- [ ] **G2:** a fresh read-only **Sonnet** subagent reads the front-end diff against this plan's Review Focus and the owner's 11 decisions, and checks that no user-visible string changed other than the ones this plan names. Findings ranked with file, line and a scenario.
- [ ] **G3:** whole-branch review before deploy by a Sonnet subagent (a different one from G2). **Opus only if the owner approves it first** (memory: Opus only for named whole-batch gates, and ask).
- [ ] A finding is closed only by a fix with a red test first, or by the owner accepting it. Log decisions in `decisions.md` and `Docs/orchestration/delegation-log.md`.

## Task 9: Docs, deploy guide and QA rows (Claude)

**Files:** `decisions.md`, `Docs/orchestration/2026-11-20-m2-stakeholder-message-draft.md`, `session.md`, `Docs/orchestration/delegation-log.md`, new `Docs/orchestration/2026-11-2x-staging-deploy-guide-xirr-returns.md`, `Docs/orchestration/2026-11-19-combined-qa-checklist.md`

- [ ] **Step 1: `decisions.md` entry** that **reverses the lead-with-Returns half of FX-8e** (owner, 24 Nov), lists the 11 answers, the two assumptions confirmed in Task 0 (same-day purchases are two flows; a switch-in is a purchase flow in the Current and per-fund lists), the chip tokens chosen, and what stays (`xirr_basis` kept, unused).
- [ ] **Step 2: Update the M2 stakeholder message draft**: the line "holdings of less than a year show the return since purchase, labelled not annualised" is replaced by the new behaviour, before the owner sends it.
- [ ] **Step 3: Write the deploy guide** (pattern: `2026-11-20-staging-deploy-guide-m2.md` and its record): pre-checks (no import in progress, disk, `analytics_recompute_status` empty); tag `xr-rc`; deploy the backend; **rebuild stored results for all households** with the same one-off price job plus recompute used for M2 (Q11); verify with one real household that a mature fund has a Returns value; then ship the frontend bundle; Alembic stays 0054; rollback = the previous image and bundle (no data change to restore).
- [ ] **Step 4: Add QA rows** (suggested `XR-01` to `XR-08`): young household, mature household, one-purchase fund, Current toggle, flip and reload, table columns and sort, Unrealised label, dark mode and 1280x600.
- [ ] **Step 5: Commit the docs straight to `leapswitch-redesign`** (small-change rule) and the code via the batch merge below.

## Task 10: Merge, tag and deploy (Claude, only at the owner's explicit go)

- [ ] Merge `batch/xr-returns` into `leapswitch-redesign` after the full runs pass on the exact tree to be tagged; tag `xr-rc`; run the guide; write the deploy record `Docs/orchestration/2026-11-2x-staging-deploy-record-xirr-returns.md` with an honest list of what differed. The owner then runs the XR QA rows.

## Self-review against the page

- **Spec coverage:** XIRR default (Tasks 2, 5, 6); label fix (5, 6); flip D with Q4 (5); scope limited to two tiles, list, Unrealised (Global Constraints, do-not-touch lists, Task 7 audit); Q1 and Q2 (Task 2); Q5 and Q6 (6); Q7 copy (1, 5, 6); Q9 (2, 3, 5); Q10 (2, 3); Q11 (3, 9); decisions record and stakeholder message (9). No uncovered requirement.
- **Placeholder scan:** none. Dates in file names written `2026-11-2x` are filled in when the document is created.
- **Type consistency:** `XirrCaution`, `xirr_caution`, `lifetime_xirr_caution`, `current_holdings_xirr_caution`, `Figures`, `resolveFigures`, `MeasureFlipProps` and the test ids are used with the same spelling in Tasks 1 to 6.
- **Proportion:** the plan states decisions, signatures, names and values; bodies are left to the workers.

## Execution log

### Task 0 (24 Nov 2026, Claude): done

- **Folders and branches created** (all from `origin/leapswitch-redesign` at `d9670b77`, `--no-track`): worktrees `C:\Users\Dell\lanes\unifolio-xr-returns` (`batch/xr-returns`), `unifolio-xr-be` (`batch/xr-be`), `unifolio-xr-rt` (`batch/xr-rt`). **Deviation:** the two Antigravity clones (`C:\Users\Dell\ag-xr1`, `ag-xr2`) are not created yet; they are cloned from `batch/xr-returns` at relay wave B, after Tasks 1 and 4 are merged, so they start with the contract and the red tests.
- **Check script:** added lane `xr` to `Docs/orchestration/wave-fe-check.sh`.
- **Drift found (and fixed in this plan):** (1) the guard count is **70**, not 56; (2) **the PDF export's Overview page prints the same `HoldingsTable`** (`print/groups/overview/OverviewSections.tsx`, test `overview.print.test.tsx` imports `SINCE_PURCHASE_CAPTION`): the owner decided it follows the screen; two files added to Tasks 4 and 6 and a print-width check added to Task 7. Everything else matches: `portfolio_xirr_display` (365-day test), the schema fields, the five `resolveXirrDisplay` importers (the fifth is the print test).
- **Q1 assumptions, checked in `backend/app/services/dashboard/xirr.py`:** (a) `DIVIDEND_REINVEST` appears only in `_LINEAGE_QUERY_TYPES` (the lineage replay), not in `_RELEVANT_TYPES` or `_FUND_RELEVANT_TYPES`, so a reinvested dividend is never a cash flow, as the owner decided. (b) `SWITCH_IN` is a debit only through `extra_debit_types` (the Current-holdings flows and the per-fund flows); the lifetime flows are filtered to `_RELEVANT_TYPES`, which has no switch types. So "count the negative flows the solver receives" already means what the owner decided; a gift received (`GIFT_IN`) is a debit and therefore counts as a purchase flow. Two purchases on one day are two flows.
- **Baseline (before any change, on `batch/xr-returns` = `d9670b77`):** backend `tests/services/analytics/xirr_reference` plus `tests/services/dashboard/test_xirr.py`: **111 passed, 3 xfailed**; backend API `test_dashboard_aggregate_routes.py`, `test_dashboard_holdings_route.py`, `test_portfolio_routes.py`: **35 passed**; front end (portfolio SummaryStrip test, `features/mutual-funds/overview`, `mutual-funds/api.test.ts`, `guards.test.ts`, `print/groups/overview`): **15 files, 290 tests passed**.
- **Chip token decision:** see Task 0 step 5.

- **Plan change, 24 Nov 2026 (owner's question, checked against the M2 precedent):** in M2, FE-1a (front-end types and red tests) was a **Codex** task (`delegation-log.md`, 20 Nov: "FE-1a front-end red tests ... Codex, orchestrator ran and committed"), and Antigravity's packet FE-1b says "the red tests and types are done". This plan first had Claude writing Task 1's types and helper; it now follows the precedent: Tasks 1 and 4 are one Codex handoff (FE-1a). "Contract" means the interfaces, shapes and test names fixed in this plan, not the Antigravity packets.

### Wave A verified, wave B written (24 Nov 2026, Claude)

- **xr-be-1** (Task 2) verified and committed `7bca7003` on `batch/xr-be`: the requested files 124 passed and 3 xfailed (baseline 111, plus Codex's 13 new tests); the wider API, dashboard and analytics run 3523 passed, 6 skipped, 3 xfailed. The wave-A stall and the caller-audit timeout did not reproduce for Claude.
- **xr-fe-1a** (Tasks 1 and 4) verified and committed `bfcb4f82` on `batch/xr-rt`: helper, api and guard tests pass (5, 18, 10); the component, tile, table and print tests are red for the stated reasons (missing `MeasureFlip`, missing ids, old captions): MeasureFlip file unloadable, portfolio tile 19 of 45, Mutual Funds tile 14 of 39, HoldingsTable 17 of 60, OverviewPage 1 of 46, print 6 of 29. `tsc` shows only the missing module and the `returns` sort key; lint 0 errors. Codex answered its open question: the table's sort controls are the sortable header buttons (no separate menu); the packet says so.
- **Merged** both into `batch/xr-returns` (`adbc60f3`).
- **Plan corrections found while writing the packets:** (a) a figure never gets a colour (Review Focus 7 fixed); (b) the sort key needs `mfCopy.ts` (added to Task 6); (c) the shared chip and the flip's CSS module are new files in `components/` (Task 5); (d) the tile test ids need two optional `MeasureFlip` props (`titleExtra`, `belowTitle`) which the packet allows; (e) the design page's state-6 sentence ("Needs at least two dates to work out") is **not** used: the built caption stays, per the copy rule.
- **Wave B documents:** `Docs/orchestration/2026-11-24-xr-be-2-handoff.md` (Codex), `2026-11-24-xr-fe-1-tiles-packet.md` and `2026-11-24-xr-fe-2-table-packet.md` (Antigravity, clones `C:\Users\Dell\ag-xr1` and `ag-xr2`).

- **G1 (24 Nov):** Codex adversarial review of the backend (`346559bf..e11e101c`): PASS, no actionable findings (details in `delegation-log.md`).
- **Deployment (owner, 24 Nov):** one combined staging guide deploys everything together once everything is done; Task 9's guide is an input to it, and Task 10 follows that combined guide.

*(Claude appends below: deviations, gate results, deploy record link.)*
