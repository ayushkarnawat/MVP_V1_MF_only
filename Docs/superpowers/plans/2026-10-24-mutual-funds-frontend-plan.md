# Mutual Funds Page Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task, through the Claude–Codex method of the `model-orchestration` skill. Steps use checkbox (`- [ ]`) syntax for tracking. TDD throughout. **No code starts until the owner says go.**

**Goal:** the seven in-page destinations of Mutual Funds (Overview, Performance, Allocation, Holdings, Transactions, Overlap, Other Analytics) and the Individual Fund page's Overlap tab, inside the new shell, built from the signed-off mockups, replacing today's Dashboard, History and Analytics screens for this route family.

**Architecture:** one feature folder `frontend/src/features/mutual-funds/`. A single scope-keyed data store feeds every tab (tab switches never refetch); each tab is a page component made of independent section components that load, fail and retry on their own; seven thin route files in `frontend/src/shell/routes/` render a shared `MutualFundsFrame` (header, tab strip, Mira popup). Existing production components (the 21 in `features/analytics/`, `HistoryChart`, `HistoryDetailModal`, `XirrDisclaimerModal`, `DistributorComparisonModal`, `FundScoreDetailModal`, `CoverageBanner`) are **reused or relocated, not rewritten**, wherever the mockup's data-source table says "None".

**Tech Stack:** React 19, Vite 8, Tailwind 3.4, `lucide-react`, `d3-shape` (installed), vitest + Testing Library, the shell's `renderInShell`. No new package.

**Spec:** `Docs/PRDs/PRD-06-Mutual-Funds-Page-Redesign.md`; `Docs/orchestration/2026-10-23-mutual-funds-page-design.md` (§0 routes, §6 component map, §7 per-page content, §11 interactivity rule and decisions); `Docs/superpowers/specs/2026-10-24-mutual-funds-restructure-relayout.md`; `…-tdd-backend-flow.md`; `Docs/orchestration/2026-10-24-mutual-funds-cross-cutting-audit-findings.md`; the visual contract is the nine HTML mockups in `Docs/orchestration/` (`2026-10-23-mutual-funds-overview-mockup.html`, `-performance-mockup.html`, `2026-10-24-mutual-funds-{allocation,holdings,transactions,other-analytics,overlap,individual-fund}-mockup.html`); each mockup's own "Data source mapping", "Motion & interaction spec" and `.locked-note` changelog are part of the spec. Backend: `2026-10-24-mutual-funds-backend-plan.md`. Shell: contract v1.6 (to be issued) and `2026-10-23-shell-pr1-router-registry-sidebar.md` / `-pr2-scope-wrappers-switch.md`. Shared charts: `2026-10-24-shared-ui-kit-plan.md`.

**Branch:** one branch per run group, each cut from `leapswitch-redesign` with a PR targeting `leapswitch-redesign`: `feat/mf-foundation` (T1–T3), `feat/mf-overview` (T4–T5), `feat/mf-performance` (T6–T7), `feat/mf-allocation` (T8), `feat/mf-holdings-transactions` (T9–T10), `feat/mf-overlap` (T11–T12), `feat/mf-other-analytics` (T13–T14), `feat/mf-fund-overlap-tab` (T15), `feat/mf-finish` (T16). Order is the task order; T1 first because every later task imports it.

**Test commands:** `cd frontend && npm test -- features/mutual-funds/<file>`; typecheck `npx tsc -b`; mount with `renderInShell(ui, { path, scope })`; mock the API modules; no network. Run only the touched files per task; the full frontend suite once in T16.

**Visual parity and chrome (added 24 Oct, owner-approved).** The finished page must look like its signed-off mockup(s) named in this plan, in light and dark. (1) The mockups' own sidebar, top bar, avatar and page-state buttons are not built: the shell draws the sidebar and top bar (contract v1.6). (2) **Parity step:** in the last run of this page the orchestrator runs it locally on the synthetic household and compares it with the mockup in the browser, light and dark, at 1280 and 1024 px, and lists every difference (layout, colours, type, spacing, states, copy, hover and click behaviour); differences are fixed before the run is DONE, or logged for a QA run with the owner's agreement. (3) Wherever this page lists a fund, the fund name opens the individual fund page through `paths` (the route is enabled by the Individual Fund runs). (4) Each page keeps the surface style of its own mockup (owner, 24 Oct).

**Dark mode (added 24 Oct).** This page's mockup(s) were drawn light only. Build every colour from the palette tokens so dark works: page `#111111`, card `#1A1A1A`, elevated `#212121`, border `#2E2E2E`, text `#FCFCFC` and `#A3A3A3`, semantic text `#34D399` `#F87171` `#FBBF24` `#818CF8`, tints as low-opacity primaries. The preview `Docs/orchestration/2026-10-24-desktop-preview-all-pages.html` shows the intended dark rendering of this page; the parity step checks it.

## Global Constraints

- **Depends on** the shell PRs (route registry, `PageLayout` with `tabs`, `PageState`, `AppLink`, `paths`, `useScope`, `useImport`, `MiraComingSoonDialog`, `renderInShell`) and on the shared UI kit plan (`line-area-chart`, `grouped-bar-chart`, tokens). A task may start stacked on the shell branch before it merges. Until the kit exists, a task that needs a chart builds the minimal local version and records it for the kit owner (do not fork the kit's file names).
- **Touch only** `frontend/src/features/mutual-funds/`, the route files named in each task, `frontend/src/features/fund-page/` in T15 only (the Overlap tab), and the documented relocations in T4/T6/T13. Nothing else under `frontend/src/shell/`. Mobile (`features/mobile` and the mobile tree), auth, onboarding, legal, `tokens.css`, `main.tsx` are untouched. **Old screens stay in the repo** (`DashboardView`, `HistoryView`, `AnalyticsView`, their tests) — only the shell routes stop rendering them; deleting them is a post-merge follow-up.
- **Reuse before build:** `SchemeLogo` + `getAmcInfo` (`lib/amcLogos.ts`) for every fund logo, initials fallback is built in; do **not** add a logo CDN. `CoverageBanner`, `FundScoreDetailModal`, `XirrDisclaimerModal`, `DistributorComparisonModal`, `AllocationDrilldownModal`, `HistoryChart`, `HistoryDetailModal`, `PeriodBreakdownTable` are imported as they are (relocate only if a task says so).
- **Numbers:** the server sends `Decimal` strings; money arithmetic only through `lib/decimal.ts`; formatting with `formatIndianCurrency`, `toPercentString`; the same fund shows exactly one ₹ value everywhere on a page (design.md §11.4) — a test per tab asserts it.
- **Interactivity rule (design.md §11.1), binding on every element:** clickable with a visible cause-and-effect link (persistent selected state on the clicked row/chip/tile, the result adjacent and titled with the clicked item), or hoverable with a tooltip; no inert elements. Every task's tests include `test_every_interactive_element_has_a_selected_state_or_tooltip` for its page (query all `[data-clickable]` / `[data-tooltip]` targets, assert none is bare).
- **Cross-fund interaction patterns** (copy from the mockups, do not reinvent): donut hover = slice pops 7 px, others dim to 38 %, centre label swaps, popup opens; legend click = persistent selected row + adjacent drill panel titled with the item; in-place row expand (chevron rotates 90°, one open at a time where the mockup says so); chip toggles with persistent selected fill.
- **Texts fixed by decisions:** header "All Investments"; button "Add Investment" (via `useImport()`); **no "Sync Investments"**; no "Download PDF" anywhere (code stays dormant); plan badge Direct/Regular only (no Growth/IDCW); "Analyse with Mira" and "Ask Mira" open `MiraComingSoonDialog`; tab labels exactly: Overview, Performance, Allocation, Holdings, Transactions, Overlap, Other Analytics.
- **Scope:** `useScope()` supplies family-or-member; moving between these tabs keeps the picked member (contract §3). Scope key for data is `"combined"` or the member id.
- **Layout:** minimum width 1024, design width 1640 (mockup frame); light and dark both work; fonts DM Sans (headings) and Manrope (body); colours from the palette tokens only.

## Review Focus

1. **Tab switch refetches or flashes empty:** switching Overview → Allocation → Overview must reuse the loaded payload (one `GET /analytics/{scope}` per scope), keep scroll/selection state per tab, and show no skeleton on return. (T1.)
2. **Stored payloads from before the backend change** have no `windows` and no `sebi_category`: Performance shows the existing since-inception numbers and a quiet "recomputing" note for other windows; the Category column shows "—". Never a crash. (T6, T4.)
3. **Section settles at different times** (analytics sections arrive independently while polling): each section shows its own skeleton/error/Retry and never blocks its siblings; a failed section does not hide the tab strip. (T1, every page.)
4. **Zero holdings, one member, one fund, 30+ funds, no disclosure data:** empty state per tab (not a blank page); single-member household hides the Family Members card; Overlap with fewer than two funds shows its documented empty state; 12+ funds truncation note; very long fund names truncate with a tooltip. (T4, T11, T12.)
5. **Chart/legend consistency:** donut centre, legend, popup and drill panel always show the same ₹ and % for a slice after a toggle (denominator, sort, chart type); chart-type switch (donut ↔ bar) preserves the selected slice. (T8.)
6. **Old route bookmarks:** `/portfolio/mutual-funds/history` still works (redirects to Performance after T16); `/portfolio/mutual-funds/overlap/compare` is gone from the registry and falls to the shell's not-found. (T16.)

---

## File Structure

```
features/mutual-funds/
  data/analyticsStore.ts        scope-keyed cache + in-flight dedupe + polling (wraps getAnalyticsScope)
  data/useMfAnalytics.ts        hook: section(name) -> {state, data, error, retry}
  data/useMfDashboard.ts        holdings / allocation / xirr / sips / realized / members for Overview
  types.ts                      view types only (re-exports analytics + dashboard types)
  frame/MutualFundsFrame.tsx    header, tab strip, Mira dialog, scope-aware page states
  frame/tabs.ts                 TAB_DEFS (id, label, routeId) from paths
  common/SectionCard.tsx        card with title, info tooltip, skeleton/error/Retry slots
  common/ChartTypeToggle.tsx    explicit labelled donut/bar (and others) picker (PRD-06 §4.2)
  common/BarList.tsx            horizontal bar representation of {label,pct,value}
  common/Donut*.tsx             wrappers over components/ui/charts pie with the pop/dim mechanic
  common/InsightText.ts         sentence templates (synopsis, quick insights, key takeaways)
  common/coverage.ts            excluded-funds count and headline % from LookthroughCoverage
  overview/  performance/  allocation/  holdings/  transactions/  overlap/  other/    one folder per tab
shell/routes/portfolio-mutual-funds{,-performance,-allocation,-holdings,-transactions,-overlap,-analytics}.route.tsx
features/fund-page/overlap/     Individual Fund page's Overlap tab (T15)
```

---

### Task 1: Foundation — data store, frame, section card, route wiring (run group F)

**Files:**
- Create: `data/analyticsStore.ts`, `data/useMfAnalytics.ts`, `frame/MutualFundsFrame.tsx`, `frame/tabs.ts`, `common/SectionCard.tsx`, `common/InsightText.ts`, `common/coverage.ts`
- Modify: the seven route files (page → `MutualFundsFrame` + a `<ComingSoon/>` body for now; leave `status` as it is until each tab's own task flips it)
- Test: `data/analyticsStore.test.ts`, `frame/MutualFundsFrame.test.tsx`, `common/SectionCard.test.tsx`, `common/coverage.test.ts`, `common/InsightText.test.ts`

**Interfaces:**
- Consumes: `getAnalyticsScope(scope, signal)`, `retryAnalyticsScope(scope)` (`features/analytics/api.ts`), `ANALYTICS_SECTION_NAMES`, `isSectionSettled`; shell `PageLayout`, `useScope`, `paths`, `useImport`, `MiraComingSoonDialog`.
- Produces:
  - `analyticsStore`: `subscribe(scope: string, cb): () => void`, `getSnapshot(scope): StoreState`, `refresh(scope): Promise<void>`, `invalidate(scope?: string): void`; `StoreState = { sections: Partial<Record<AnalyticsSectionName, AnalyticsSectionState>>; recomputing: boolean; fetchError: string | null; loadedAt: number | null }`. Polls every 3 s only while some section is unsettled or `recomputing` (same rule as `useAnalyticsScope`); one in-flight request per scope; unsubscribes stop polling.
  - `useMfAnalytics<S extends AnalyticsSectionName>(name: S): { status: "loading" | "ready" | "failed" | "error"; data: SectionPayload<S> | null; retry: () => void }` — reads `useScope()` itself; unwraps the combined wrapper with the same `AGGREGATE_FIELD` map `AnalyticsView` uses (move that map to `data/aggregateField.ts` and import it from both).
  - `MutualFundsFrame({ tab, children }: { tab: MfTabId; children: ReactNode })`, `MfTabId = "overview" | "performance" | "allocation" | "holdings" | "transactions" | "overlap" | "analytics"`; `TAB_DEFS: ReadonlyArray<{ id: MfTabId; label: string; to: () => string }>` built from `paths.mutualFunds.*`.
  - `SectionCard({ title, info?, state, onRetry, skeleton?, children })`.
  - `coverageHeadline(cov: LookthroughCoverage): { pct: string; excluded: Array<{ scheme_id: string; scheme_name: string; reason: string }> }` and `excludedFundCount(cov)`.
  - `buildSynopsis(by_amc, holdings): string`, `buildOverviewInsights(...)`, `buildOverlapInsights(...)`, `buildFundTakeaways(...)` pure functions (templates fixed in T4/T11/T15, stubs with signatures here).

- [ ] **Step 1: Failing tests:** `test_store_dedupes_concurrent_requests_for_one_scope`; `test_store_stops_polling_when_all_sections_settled_and_not_recomputing`; `test_store_keeps_payload_across_unsubscribe_and_resubscribe_within_session`; `test_invalidate_forces_refetch_after_import_done`; `test_hook_unwraps_combined_wrapper_per_aggregate_field`; `test_member_scope_payload_is_returned_as_is`; frame: `test_renders_header_all_investments_and_add_investment_calls_openImport`; `test_no_sync_investments_button`; `test_seven_tabs_in_contract_order_with_exact_labels`; `test_active_tab_has_selected_pill_and_aria_current`; `test_tab_switch_navigates_and_keeps_member` (reuse the shell helper); `test_ask_mira_opens_coming_soon_dialog`; `test_one_failed_section_does_not_hide_tab_strip`; `SectionCard`: loading → skeleton, failed → message + Retry calls `onRetry`, ready → children; coverage: `test_headline_pct_and_excluded_list_from_coverage`, `test_excluded_count_zero_when_all_funds_covered` (this replaces the backend "excluded funds" field).
- [ ] **Step 2: Run.** Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the signatures above. The store is a module singleton keyed by scope (no React context, so separate route files share it); it is cleared by `invalidate()` when `useImport().onDone` fires and on logout (subscribe to the existing session-clear hook in `features/auth/session.ts`). Seven route files render `MutualFundsFrame tab=… ` with a placeholder body and stay `status: "placeholder"`-compatible: do not change `path`, `id`, `label`, `icon`, `section`, `order`.
- [ ] **Step 4: Run** these files plus the shell route-registry contract test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): data store, frame and section card`.

### Task 2: Shared presentation pieces — chart-type toggle, bar list, donut mechanic (run group F)

**Files:** Create `common/ChartTypeToggle.tsx`, `common/BarList.tsx`, `common/SlicedDonut.tsx`, `common/useSelectedSlice.ts`; Test: matching `*.test.tsx`.

**Interfaces:**
- Produces: `ChartTypeToggle<T extends string>({ value, options, onChange, label }: { value: T; options: ReadonlyArray<{ id: T; label: string; icon: LucideIcon }>; onChange: (v: T) => void; label: string })` (explicit labelled control, `role="radiogroup"`); `BarList({ items, selectedKey, onSelect, formatValue }: { items: ReadonlyArray<Slice>; selectedKey: string | null; onSelect: (k: string) => void; formatValue: (s: Slice) => string })`; `type Slice = { key: string; label: string; value: string; pct: string; color: string }`; `SlicedDonut({ slices, selectedKey, onSelect, centre }: …)` implementing the pop/dim/centre-swap/popup mechanic over `components/ui/charts` `PieChart`; `useSelectedSlice(slices): { selectedKey; select(k); clear() }`.

- [ ] **Step 1: Failing tests:** toggle `test_changes_value_and_is_keyboard_operable`; `test_has_visible_label`; bar list `test_bar_widths_proportional_to_pct`, `test_click_selects_and_marks_row_selected`; donut `test_hover_dims_others_to_38_percent_and_swaps_centre`, `test_click_sets_persistent_selection_that_survives_mouse_leave`, `test_keyboard_enter_selects`, `test_reduced_motion_disables_pop`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Reuse the kit's pie primitives; if the kit lacks a bar primitive, `BarList` is plain markup (no chart library). Colours cycle from the palette's data-viz series `--c1…--c8`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): chart-type toggle, bar list and sliced donut`.

### Task 3: Dashboard data hook for Overview and Quick-insight templates (run group F)

**Files:** Create `data/useMfDashboard.ts`, fill `common/InsightText.ts` (`buildSynopsis`, `buildOverviewInsights`); Test: `data/useMfDashboard.test.ts`, `common/InsightText.test.ts`.

**Interfaces:**
- Consumes: `getAggregateHoldings`, `getMemberHoldings`, `getAggregateAllocation`, `getMemberAllocation`, `getAggregateSips`, `getMemberSips`, `getAggregateSipsMonthly`, `getMemberSipsMonthly`, realized-gain and XIRR fetchers exactly as `DashboardView.tsx` calls them today (read its effects; reuse the same API functions and the same `lifetime`/`current` XIRR and disclaimer logic, including `XirrDisclaimerModal`'s inputs).
- Produces: `useMfDashboard(): { holdings: Load<HoldingRow[]>; allocation: Load<AllocationSummary>; sips: Load<SipRow[]>; xirr: Load<{lifetime; current; disclaimers}>; realized: Load<RealizedSummary>; members: Load<FamilyMemberStatus[]>; coverageGaps: Load<CoverageGapItem[]> }` with `Load<T> = { status; data; retry }`, each loading independently and keyed by scope; `buildSynopsis(allocation, holdings): string` (e.g. "Spread across 6 AMCs and 24 funds, 72% Direct"), `buildOverviewInsights(allocation, holdings, sipSummary): string[]` — four items exactly: AMC and fund count, Direct/Regular split, largest single-AMC exposure, ₹ in active SIPs this month.

- [ ] **Step 1: Failing tests:** each load independent (one rejects, others ready); scope change cancels in-flight requests (abort) and never shows the previous member's data; synopsis and the four insights from fixtures equal the mockup's wording pattern; `test_insights_omit_sip_line_when_no_active_sips`; `test_direct_regular_percentages_sum_to_100`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** by extracting the fetch/compute logic from `DashboardViewContent` into the hook **by copying, not moving** (the old component keeps working untouched).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): Overview data hook and insight templates`.

### Task 4: Overview — summary strip, SIPs timeline, holdings table (run group O)

**Files:** Create `overview/SummaryStrip.tsx`, `overview/SipTimeline.tsx`, `overview/HoldingsTable.tsx`, `overview/OverviewPage.tsx`; Modify `shell/routes/portfolio-mutual-funds.route.tsx` (page → `OverviewPage`, `status: "live"`); Test: matching `*.test.tsx`.

**Interfaces:**
- Consumes: `useMfDashboard`, `SchemeLogo`, `PlanBadge`, `XirrDisclaimerModal`, `DistributorComparisonModal`, `SoldFundsSection`, `CoverageGapBanner`, `OpeningBalanceModal`, `useImport`.
- Produces: `OverviewPage()`; `SummaryStrip({ holdings, xirr, realized })` (one unified card, five segments: Total Portfolio Value with sparkline and no "vs 1 Jan" line, Total Invested, Unrealised Gain, Realised Gain, XIRR with Lifetime/Current toggle and the existing disclaimer button) plus the synopsis sentence; `SipTimeline({ sips })` (date-capsule strip, "Next SIP" chip, "Monthly SIP total" pill, equal Active/Stopped tabs; click a capsule swaps the detail panel to that date, capsule keeps the selected state); `HoldingsTable({ holdings, onOpenFund })` (full-width card; columns: Fund name + logo with plan badge under the name, Category from `sebi_category`, Invested, Value, Gain/Loss, XIRR with the same Lifetime/Current toggle, and **Today's change** (owner decision 24 Oct; amount and percent from the existing `HoldingRow.today_gain`, the price-only day change, so no backend change; percent = `today_gain` over yesterday's value, computed with `lib/decimal.ts`; a fund with no NAV shows a dash and sorts last; statement-priced funds show 0); the Invested, Value, Gain/Loss, XIRR and Today's change headers sort the rows (first click descending, second ascending, an arrow shows the direction, default order unchanged), and the page reads `?sort=today_change&dir=desc` (also `invested`, `value`, `gain`, `xirr`) on load so Home's "View all by day's change" link lands sorted; header "Mutual Funds (N)" live count; search box in the tabs/utility row; "Analyse with Mira" → Mira dialog; "Compare Distributors" button opens the existing modal; "Export" per mockup; row click opens `FundDetailModal` (interim, Q12)).

- [ ] **Step 1: Failing tests:** `test_summary_strip_values_match_dashboard_fixture_exactly`; `test_xirr_toggle_switches_lifetime_current_and_disclaimer_opens_existing_modal`; `test_no_vs_1_jan_comparison_line`; `test_partial_state_shows_stale_nav_caveat_on_the_affected_metric_only`; `test_sparkline_failure_does_not_blank_the_metrics`; `test_sip_capsule_click_swaps_detail_and_marks_capsule_selected`; `test_stopped_tab_is_an_equal_tab`; `test_holdings_table_columns_and_live_count`; `test_todays_change_column_shows_amount_and_percent_from_today_gain`; `test_todays_change_dash_and_last_when_nav_unavailable`; `test_header_click_sorts_descending_then_ascending_with_arrow`; `test_sort_query_params_apply_on_load_and_invalid_values_are_ignored`; `test_sorted_rows_keep_the_same_totals_as_the_summary_strip`; `test_category_column_shows_sebi_category_or_dash`; `test_plan_badge_under_fund_name_direct_regular_only`; `test_search_filters_by_fund_or_amc_name`; `test_row_click_navigates_to_the_fund_page_route` (owner decision 24 Oct: a fund name or row opens the individual fund page through `paths`, replacing the mockup's interim FundDetailModal; `HoldingsTable` takes `onOpenFund(schemeId)` and the page wires it to the router); `test_compare_distributors_totals_equal_summary_strip_totals` (the ₹ reconciliation rule); `test_empty_state_when_no_holdings_with_add_investment_cta`; `test_page_error_state_with_retry`; the interactivity assertion.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** per the Overview mockup (Rounds 3–6 locked: layout "table full-width, three equal cards below"). Pure presentation over existing fields; money via `lib/decimal.ts`.
- [ ] **Step 4: Run** the files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): Overview summary, SIPs timeline and holdings table`.

### Task 5: Overview — AMC allocation, Family Members, Quick Insights; go live (run group O)

**Files:** Create `overview/AmcAllocationCard.tsx`, `overview/FamilyMembersCard.tsx`, `overview/QuickInsightsCard.tsx`; Modify `OverviewPage.tsx`; Test: matching.

**Interfaces:**
- Consumes: `SlicedDonut`, `AllocationDrilldownModal`, `useScope().setMember/setAggregate`, `buildOverviewInsights`.
- Produces: `AmcAllocationCard({ allocation })` (donut + legend; hover popup shows Value + % only; click a slice or legend row opens `AllocationDrilldownModal` for that AMC); `FamilyMembersCard({ members })` (bar + rows; click a row calls `setMember(id)`, the Family row calls `setAggregate()`; hidden when the household has one member); `QuickInsightsCard({ lines })` (static text, deliberately not interactive, per the mockup).

- [ ] **Step 1: Failing tests:** `test_amc_hover_pops_slice_dims_others_swaps_centre_and_opens_popup`; `test_amc_click_opens_drilldown_with_that_amcs_holdings`; `test_amc_values_sum_to_total_portfolio_value`; `test_family_row_click_switches_scope_and_every_tab_sees_it`; `test_single_member_hides_family_card_without_error`; `test_quick_insights_four_lines`; `test_three_cards_equal_width_below_table` (class/grid assertion); the interactivity assertion (Quick Insights text exempt by an explicit `data-static` attribute the test whitelists).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Flip the Overview route to `live`.
- [ ] **Step 4: Run** Overview files and the shell route contract test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): Overview allocation, family and insights; route live`.

### Task 6: Performance — XIRR block and value history (run group P)

**Files:** Create `performance/XirrBlock.tsx`, `performance/ValueHistoryBlock.tsx`, `performance/PerformancePage.tsx`; Modify `shell/routes/portfolio-mutual-funds-performance.route.tsx`; Test: matching.

**Interfaces:**
- Consumes: `useMfAnalytics("benchmark_funds")`, `useMfAnalytics("investment_withdrawal")` (`absolute_gain`), `useMfDashboard().xirr`, `XirrDisclaimerModal`, `HistoryChart`, `HistoryDetailModal`, `fetchHistory`, `getMemberMonthDetail` / `getAggregateMonthDetail`.
- Produces: `XirrBlock()` (Lifetime/Current XIRR with disclaimer, absolute return, per-fund XIRR table whose scope note matches the mockup's flagged reading); `ValueHistoryBlock()` (the full `HistoryView` content: range toggle 1Y/3Y/5Y/All, value line + cost area, hollow dot for a month with a missing price, hover/click month card with "See details" opening the existing month modal with member chips, four tiles and per-fund table). **Relocation, not rewrite:** import `HistoryChart` and `HistoryDetailModal` unchanged; do not copy `HistoryView`'s page frame.

- [ ] **Step 1: Failing tests:** `test_xirr_block_matches_dashboard_numbers_for_same_scope`; `test_absolute_return_equals_investment_withdrawal_absolute_gain`; `test_range_toggle_reslices_points_without_a_network_call`; `test_month_point_hover_card_then_see_details_opens_modal`; `test_modal_member_filter_chips_and_four_tiles_present`; `test_hollow_dot_for_missing_price_month`; `test_history_failure_shows_retry_without_hiding_xirr_block`; `test_three_blocks_stacked_in_order` (XIRR, History, Benchmark placeholder until T7).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The owner signed off the history block as "renders as intended": do not restyle `HistoryChart`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): Performance XIRR and value history blocks`.

### Task 7: Performance — benchmark comparison with indices and time windows; go live (run group P)

**Files:** Create `performance/BenchmarkBlock.tsx`, `performance/RaceTrack.tsx`, `performance/BenchmarkBars.tsx`, `performance/FundVsBenchmarkRows.tsx`, `performance/useBenchmarkWindows.ts`; Modify `PerformancePage.tsx`, the Performance route (`status: "live"`); Test: matching.

**Interfaces:**
- Consumes: `useMfAnalytics("benchmark")` → `PortfolioBenchmarkSummary` incl. additive `windows: BenchmarkWindowRow[]`; `useMfAnalytics("benchmark_funds")` → rows incl. `windows: FundWindowXirr[]`; `ChartTypeToggle`; `BenchmarkSection`'s existing legacy numbers as the fallback.
- Produces: `useBenchmarkWindows(): { windows: Window[]; window: Window; setWindow; indices: IndexKey[]; selected: Set<IndexKey>; toggleIndex(k); rows: Array<{ key: "portfolio" | IndexKey; label: string; xirr: string | null }>; available: boolean }` (`Window = "1Y" | "3Y" | "5Y" | "SI"`; **picking benchmark(s) and a window is a hard requirement, PRD-06 §4.1**); `RaceTrack({ rows, selectedKey, onSelect })` (markers on one XIRR axis, labels alternating above/below, crown on the highest, beeswarm de-collision that never moves the x position, click opens the period-breakdown panel beneath); `BenchmarkBars` (sorted horizontal bars, same shared detail panel); a labelled "Race Track | Bar Chart" `ChartTypeToggle` that preserves the selection; two tabs "Portfolio vs Broad Market" / "Per-Fund vs Benchmark"; per-fund rows collapse to name + diff badge + two-dot mini-track and expand on click.

- [ ] **Step 1: Failing tests:** `test_eight_index_chips_and_four_window_segments`; `test_window_segment_reslices_xirr_from_stored_windows_with_no_network_call`; `test_chip_toggle_shows_hides_that_marker_and_keeps_selected_fill`; `test_unavailable_window_is_disabled_with_tooltip_not_enough_history`; `test_payload_without_windows_falls_back_to_since_inception_and_shows_recomputing_note` (Review Focus 2); `test_null_index_xirr_renders_dash_not_zero`; `test_race_track_close_values_get_perpendicular_nudge_but_same_x`; `test_chart_type_switch_keeps_selected_entity_and_detail_panel`; `test_marker_click_opens_panel_titled_with_entity`; `test_per_fund_row_expand_in_place_one_at_a_time`; `test_portfolio_xirr_equals_xirr_block_value`; the interactivity assertion.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Round 7's de-collision: true x never altered (it is finance data); only the perpendicular offset changes. Flip Performance `live`.
- [ ] **Step 4: Run** Performance files + shell route contract test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): Performance benchmark comparison with windows; route live`.

### Task 8: Allocation — five breakdowns with selectable chart type (run group A)

**Files:** Create `allocation/AllocationPage.tsx`, `allocation/AssetClassCard.tsx`, `allocation/MarketCapCard.tsx`, `allocation/CategoryAmcCard.tsx`, `allocation/FundManagerTable.tsx`, `allocation/DrillPanel.tsx`; Modify the Allocation route; Test: matching.

**Interfaces:**
- Consumes: `useMfAnalytics("asset_allocation" | "cap_allocation" | "allocation" | "fund_manager")`, `SlicedDonut`, `BarList`, `ChartTypeToggle`, `CoverageBanner`, the existing arbitrage-toggle and denominator logic from `AssetAllocationSection` / `CapAllocationSection` (import their pure helpers; copy markup only if a helper is not exported — then export it from its file without behaviour change).
- Produces: `AllocationPage()`; each card takes `chartType: "donut" | "bar"` from its own `ChartTypeToggle` (Asset Class, Category/AMC, Fund Manager; **Market Cap is unaffected** per PRD-06 §4.2); `DrillPanel({ title, funds, note })` listing the clicked slice's top contributing funds ("largest N of M", no claim of full reconciliation).

- [ ] **Step 1: Failing tests:** `test_five_breakdowns_present_market_cap_is_first_class_with_every_current_field` (buckets, equity-vs-total toggle, classification-as-of date, drill rows); `test_arbitrage_checkbox_moves_value_to_cash_like_in_both_rings`; `test_denominator_toggle_updates_donut_legend_and_table`; `test_category_amc_tab_and_sort_toggle`; `test_legend_click_marks_row_selected_and_drill_panel_is_adjacent_and_titled_with_the_item` (the named anti-pattern, design.md §11.1); `test_chart_type_toggle_exists_on_asset_class_category_amc_fund_manager_and_not_on_market_cap`; `test_switching_chart_type_preserves_selected_slice_and_totals` (Review Focus 5); `test_fund_manager_row_expands_to_schemes_and_xirr_one_at_a_time`; `test_coverage_banner_shows_full_reason_list_here` (Allocation is the template); fund-value-consistency test.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** per the Allocation mockup Round 6. Flip Allocation `live`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): Allocation page with selectable chart types`.

### Task 9: Holdings — per-fund top 10 and portfolio-wide stocks with the full CoverageBanner (run group H)

**Files:** Create `holdings/HoldingsPage.tsx`, `holdings/TopHoldingsByFund.tsx`, `holdings/AllStocksTable.tsx`; Modify the Holdings route; Test: matching.

**Interfaces:**
- Consumes: `useMfAnalytics("stock_holdings")` (`rows[].contributing_funds[]` with `fund_weight_pct`, `stock_weight_pct`), `CoverageBanner`.
- Produces: `TopHoldingsByFund({ rows })` (fund chip selector with persistent selected fill; each fund has one stable colour carried to its chip, heading strip with "X% in these 10 names", and weight bars; client-side filter + re-sort, no new request); `AllStocksTable({ rows })` (sort toggle; row click expands in place to the contributing funds and weights; open row survives re-sort); anchor `id="all-holdings"` on the card for the Overlap page's links.

- [ ] **Step 1: Failing tests:** `test_top10_is_client_side_sort_by_fund_weight_and_makes_no_request`; `test_chip_selection_persists_after_mouse_leave`; `test_x_percent_in_top_10_equals_sum_of_listed_weights`; `test_row_expand_in_place_and_survives_sort`; `test_full_coverage_banner_renders_reason_list_and_derivative_exclusion_share` (replaces the mockup's headline-only stub — audit finding 2); `test_coverage_banner_absent_state_when_all_funds_covered`; `test_all_holdings_anchor_present`; empty state when no disclosure data; fund-value-consistency.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Flip Holdings `live`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): Holdings page with full coverage banner`.

### Task 10: Transactions — redesigned ledger, drill-down, SIP banner (run group H)

**Files:** Create `transactions/TransactionsPage.tsx`, `transactions/CashFlowStrip.tsx`, `transactions/CashFlowBars.tsx`, `transactions/PeriodDrill.tsx`, `transactions/Ledger.tsx`, `transactions/SipBanner.tsx`; Modify the Transactions route; Test: matching.

**Interfaces:**
- Consumes: `useMfAnalytics("investment_withdrawal")` (`sip_summary`, `gifts_net`, `opening_holdings`, buckets), `PeriodBreakdownTable`, `periodBreakdown.ts`, `investmentWithdrawalMath.ts`.
- Produces: `CashFlowStrip` (5 tiles; Invested/Withdrawn/Switched tiles jump to the ledger and apply that type filter, sharing one state with the ledger toggle via `useTypeFilter()`; Net Invested has an explanatory tooltip and no filter); `CashFlowBars` (Monthly/Yearly pill; click a period's bars → persistent selected state and the drill table re-renders and scrolls into view; changing granularity closes an open drill); `Ledger` (type-colour icon chips, type filter pills, row expands in place to NAV, units, folio); `SipBanner` (active count, ₹/month — the same figure Overview shows — missed-instalment badge with tooltip naming fund and due date); opening-holdings and gifts notes.

- [ ] **Step 1: Failing tests:** `test_tile_click_filters_ledger_and_tile_and_toggle_stay_in_sync`; `test_period_click_selected_state_and_drill_matches_period_breakdown_table_rows`; `test_granularity_change_closes_open_drill`; `test_ledger_row_expand_in_place`; `test_net_invested_equals_invested_minus_withdrawn`; `test_sip_banner_monthly_amount_equals_overview_sip_total`; `test_missed_badge_tooltip_names_fund_and_date`; `test_gifts_and_opening_holdings_notes_render_only_when_present`; numbers equal the old `InvestmentWithdrawalSection` fixtures (parity test importing its fixture).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Flip Transactions `live`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): Transactions page`.

### Task 11: Portfolio Overlap — stat strip, Common Holdings, heatmap (run group V)

**Files:** Create `overlap/OverlapPage.tsx`, `overlap/StatStrip.tsx`, `overlap/CommonHoldings.tsx`, `overlap/Heatmap.tsx`, `overlap/PairDetail.tsx`; Modify the Overlap route; Test: matching.

**Interfaces:**
- Consumes: `useMfAnalytics("overlap")` (`matrix_funds`, `matrix`, `pairs_above_low`, `bands`, `concentration`, `total_fund_count`, `matrix_truncated`, `coverage`), `useMfAnalytics("stock_holdings")`, `CoverageBanner`, `coverageHeadline`.
- Produces: `StatStrip` (Funds analysed "12 of 15" with "N excluded" from `excludedFundCount(coverage)`; Pairs with overlap with `nC2` denominator; Highest overlap with the top pair named; Overlap risk Low/Moderate/High banded from the highest pair against `bands`); `CommonHoldings` (top 10, "View all →", row expands to per-fund weights, "Held in N funds", logo chips with "+N"); `Heatmap` (all matrix funds, three bands Low <20 / Moderate 20–<40 / High ≥40 taken from `bands`, never hard-coded; click cell → persistent border + `PairDetail` beside the grid pre-populated with the highest pair; hover tooltips with exact %); the top-pairs table lives in T12.

- [ ] **Step 1: Failing tests:** `test_excluded_count_comes_from_coverage_not_a_backend_field`; `test_pairs_denominator_is_n_choose_2_of_analysed_funds`; `test_band_thresholds_read_from_payload_bands`; `test_heatmap_cell_click_selected_border_survives_mouse_leave_and_detail_titled_with_both_funds`; `test_default_detail_is_highest_overlap_pair`; `test_truncation_note_when_matrix_truncated`; `test_fewer_than_two_funds_shows_documented_empty_state`; `test_common_holdings_expand_and_view_all`; full `CoverageBanner` present (audit finding 2); the interactivity assertion.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): Overlap stat strip, common holdings and heatmap`.

### Task 12: Portfolio Overlap — top pairs, key insights, impact, stock concentration; go live (run group V)

**Files:** Create `overlap/TopPairs.tsx`, `overlap/ImpactDonut.tsx`, `overlap/StockConcentration.tsx`; Modify `OverlapPage.tsx`, the Overlap route (`status: "live"`); Test: matching.

**Interfaces:**
- Consumes: `SlicedDonut`, `buildOverlapInsights`, `overlap.concentration`, `openStockHoldings` pattern from `OverlapSection.tsx` → here `paths.mutualFunds.holdings()` + `#all-holdings`.
- Produces: `TopPairs` (table with coloured overlap bar, shared stocks, combined weight, "View all fund overlaps →"; row click selects the same pair as the heatmap — one state, two entry points; Key Insights callout of 2–3 generated sentences); `ImpactDonut` (centre "X% of portfolio in top 3 overlapping pairs"; legend rows: top-3 pairs, other overlapping pairs, unique holdings with % and ₹; segments isolate on click); `StockConcentration` (cumulative-exposure curve, clickable chips, headline "Top N stocks represent X%" gated by `hide_headlines`; chart, chips and headline all navigate to Holdings' all-stocks card).

- [ ] **Step 1: Failing tests:** `test_pair_row_click_highlights_matching_heatmap_cell_and_opens_same_detail`; `test_key_insights_sentences_use_payload_numbers`; `test_impact_three_rows_sum_to_100_and_to_portfolio_value`; `test_impact_segment_click_isolates_and_selects_legend_row`; `test_concentration_headline_hidden_when_hide_headlines`; `test_chart_chip_and_headline_navigate_to_holdings_all_stocks_anchor`; `test_no_pairs_above_threshold_empty_state`; the interactivity assertion.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** Overlap files + route contract test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): Overlap pairs, insights, impact and stock concentration; route live`.

### Task 13: Other Analytics — Cost & Valuation and Fund Quality Scorer (run group X)

**Files:** Create `other/OtherAnalyticsPage.tsx`, `other/CostValuationGroup.tsx`, `other/TerLadder.tsx`, `other/ValuationSpectrum.tsx`, `other/ScorerGroup.tsx`; Modify the Analytics route; Test: matching.

**Interfaces:**
- Consumes: `useMfAnalytics("ter" | "ter_direct_regular" | "valuation" | "score")`, `FundScoreDetailModal`, `ScoreExplainer`, `FundScoreCard`, `ValuationSection`'s thresholds (`hide_headlines`, `enough_data`, `metric.missing`, `footnotes`), `CoverageBanner`, `ChartTypeToggle`.
- Produces: `TerLadder` (hero radial gauge + Direct/Regular spectrum with pins; one ladder row per fund with logo chip and TER-sized bar; **click a row expands to 1Y/3Y/5Y projected cost**, reusing the Category Ranking `mini-table` shape; the no-TER fund row is muted with a "no return data on file" expand); `ValuationSpectrum` (P/E and P/B vs Nifty 50 and Nifty 500, narrative deltas; **one shared "Spectrum | Bars" toggle** switches both panels, same three series colours); the Direct-holdings savings line from `annual_ter_saving`; the **full ValuationSection edge states** (audit finding 3): ratio hidden below 50 % coverage, "not enough data" below 70 %, the complete per-stock exclusions list, the complete footnotes array; the full `CoverageBanner`; `ScorerGroup` (portfolio weighted score hero, unscored-funds callout, card grid; click a card → persistent selected border and the detail panel beneath with 5-tier bar, why-sentence, independent Evidence and Methodology accordions, cost adjustment).

- [ ] **Step 1: Failing tests:** `test_ter_row_click_expands_to_1y_3y_5y_projection_and_uses_catrank_figures_for_shared_funds` (fund-value-consistency); `test_pe_pb_toggle_switches_both_panels_and_keeps_series_colours`; `test_valuation_hidden_below_50_percent_coverage_shows_threshold_message`; `test_valuation_not_enough_data_below_70_percent`; `test_exclusions_list_and_all_footnotes_render`; `test_savings_line_uses_annual_ter_saving_not_average_vs_average`; `test_score_card_click_selects_card_and_opens_detail_with_matching_title_dot`; `test_accordions_toggle_independently`; `test_unscored_funds_callout`; full coverage banner on the valuation card; the interactivity assertion.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Group titles exactly: "Cost & Valuation", "Fund Quality Scorer", "SEBI Category Ranking & Peer Comparison", "Fund Ranking" (the last two in T14).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): Other Analytics cost, valuation and scorer groups`.

### Task 14: Other Analytics — Category Ranking and Fund Ranking; go live (run group X)

**Files:** Create `other/CategoryRankingGroup.tsx`, `other/FundRankingGroup.tsx`; Modify `OtherAnalyticsPage.tsx`, the Analytics route (`status: "live"`); Test: matching.

**Interfaces:**
- Consumes: `useMfAnalytics("category_ranking" | "ranking")`, `PeriodReturnsTable`, `RANK_WEIGHTS`.
- Produces: `CategoryRankingGroup` (percentile gauge in red/amber/green tiers, outperform line, thin-category badge; row expands in place to the fund-vs-category-average 1Y/3Y/5Y table — **never named peers**; `category_unavailable` edge state); `FundRankingGroup` (leaderboard with named neighbours; row expands to neighbours plus the per-component percentile bars; `too_few_peers`, `insufficient_history`, `category_unavailable` edge states).

- [ ] **Step 1: Failing tests:** `test_category_row_expand_shows_fund_vs_category_average_never_named_peers`; `test_percentile_tier_colours_at_the_thresholds`; `test_thin_category_badge`; `test_category_unavailable_edge_state`; `test_fund_ranking_expand_shows_named_neighbours_and_component_bars`; `test_ranking_weights_sum_to_100`; `test_three_ranking_edge_states_render`; `test_four_groups_visually_separated_with_exact_titles_in_order`; the interactivity assertion.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mutual-funds): Other Analytics ranking groups; route live`.

### Task 15: Individual Fund page — Overlap Analysis tab, normal and comparison states (run group I)

**Depends on:** Individual Fund frontend plan T4 (`FundPageFrame`, tab routes) and this plan's backend T5.

**Files:**
- Create: `features/fund-page/overlap/OverlapTab.tsx`, `NormalState.tsx`, `ComparisonState.tsx`, `ComparisonTabs.tsx`, `useFundOverlap.ts`, `api.ts`
- Modify: `features/fund-page/FundTabs.tsx` and `FundPageFrame.tsx` (tab type gains `"overlap"`), `shell/routes/portfolio-mutual-funds-fund-overlap.route.tsx` (page → `OverlapTab`, `status: "live"`)
- Test: matching `*.test.tsx`

**Interfaces:**
- Consumes: backend `GET /fund-page/{scheme_id}/overlap` → `FundOverlapResponse | Unavailable`; `GET /fund-page/{scheme_id}/overlap/{other}` → `FundComparisonResponse | Unavailable`; the Individual Fund plan's performance endpoint (for the Performance Comparison sub-tab, called once per fund); `SlicedDonut`, `SchemeLogo`, `buildFundTakeaways`.
- Produces: `OverlapTab({ ctx: FundPageContext })` holding one piece of local state `compareWith: string | null` (**one screen, two states; no URL change**, design.md §11.3); `NormalState` (overlap donut "N common stocks out of A total holdings", Overlap Distribution bar with persistent segment selection, Common Holdings table, Common Holdings by Sector bars each expanding in place to contributing stocks (one open at a time), Quick Insights / Key Takeaways, **Top Funds with Overlap** table with **no Action column** and rows as the only entry to comparison); `ComparisonState` (both funds' headers, overlap donut, a labelled "Back to <fund>'s overlap" control, six sub-tabs Overview / Common Holdings / Unique Holdings / Sector Comparison / Market Cap Comparison / Performance Comparison with persistent selected sub-tab; impact donut isolates on click; non-clickable bars/rows get hover tooltips with exact figures). **Dropped by owner:** the "Our view / Consider Review" callout and "See recommended alternative funds".

- [ ] **Step 1: Failing tests:** `test_row_click_switches_to_comparison_without_changing_url_and_back_control_returns`; `test_no_action_column_and_no_recommendation_callouts`; `test_distribution_segments_sum_to_100`; `test_sector_row_expands_in_place_one_at_a_time`; `test_six_comparison_subtabs_with_persistent_selection`; `test_market_cap_subtab_uses_response_market_cap_buckets`; `test_performance_comparison_calls_performance_endpoint_for_both_funds`; `test_unavailable_no_disclosure_shows_explanatory_state_not_error`; `test_fund_not_held_state`; `test_top_overlap_funds_not_limited_to_twelve`; `test_member_scope_change_refetches_and_resets_comparison_to_normal`; `test_overlap_tab_enabled_in_FundTabs_and_route_is_live`; fund-value-consistency across normal and comparison headers.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** per the Individual Fund mockup (Round 2: the page's Overview and Insights tabs belong to the Individual Fund plan, not this one; this task only fills the Overlap tab and enables it in the frame).
- [ ] **Step 4: Run** the new files and `FundPageFrame.test.tsx`. Expected: PASS (the Individual Fund plan's `test_overlap_tab_disabled` is updated here to expect enabled — change that test in this task and say so in the report).
- [ ] **Step 5: Commit** `feat(fund-page): Overlap Analysis tab with comparison state`.

### Task 16: Finish — retire temporaries, redirect History, whole-page checks (run group Z)

**Files:** Modify `shell/routes/portfolio-mutual-funds-history.route.tsx` (`redirectTo` Performance), the Dashboard/History/Analytics wrapper route files from shell PR 2 (remove the temporary tab strip), `shell/routes/portfolio-mutual-funds-overlap-compare.route.tsx` (delete the file if contract v1.6 removed the row; otherwise leave); Test: `features/mutual-funds/finish.test.tsx`.

**Interfaces:**
- Consumes: shell contract v1.6 retirement rules (History retires when Performance is `live`; the temporary tab strip and "+ Add data" button are removed when their replacements ship).

- [ ] **Step 1: Failing tests:** `test_history_route_redirects_to_performance_keeping_member`; `test_no_temporary_tab_strip_on_any_mutual_funds_route`; `test_overlap_compare_path_is_not_found`; `test_all_seven_routes_live_and_labels_match_contract`; `test_every_tab_loads_with_one_analytics_request_per_scope` (counts calls across a full tab tour); `test_pdf_export_button_absent_everywhere`; `test_sync_investments_absent`; `test_old_screens_still_importable` (guards the "do not delete" rule).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the edits (route files only; `MainDashboardFlow`/`NavigationShell` were already retired by shell PR 2).
- [ ] **Step 4: Run** the new file, then `npx tsc -b`, then the **full frontend suite once**: `cd frontend && npm test`. Expected: all pass; report exact counts.
- [ ] **Step 5: Manual check list for the owner (written into the run report):** each tab at 1440 and 1024 widths in light and dark; synthetic household from `Docs/CAS Files/synthetic/pdfs/realistic/` (password `MF@123`) and a one-member, one-fund household; numbers on Overview equal the old Dashboard for the same account on `ls-staging`; Performance since-inception benchmark rows equal the old Analytics; Mira popups; every click has a visible result.
- [ ] **Step 6: Commit** `feat(mutual-funds): retire temporaries and redirect History`.

## Self-review record

- **Spec coverage:** design.md §0 routes → T1/T16; §1–4 Overview → T3–T5; §7.1 Performance and §11.2 benchmark/window → T6–T7; §7.2 Allocation and §11.2 chart type → T8; §7.3 → T9; §7.4 and audit finding 1 → T10; §7.5 and audit finding 4 → T11–T12; §7.5.1 and §11.3 → T15; §7.6 and audit findings 2–3 (the two items the mockups deferred) → T9, T11, T13; §8 Q8/Q9/Q12 (modal stays, PDF button hidden, `FundDetailModal` interim) → T4, T13, T16 tests; §11.1 interactivity → per-task assertion; §11.4 consistency → per-task test; logos → `SchemeLogo` constraint; Growth/IDCW deferred → constraint; `HistoryView` folded verbatim → T6.
- **Types:** `MfTabId`, `Slice`, `Load<T>`, `useBenchmarkWindows`, `FundOverlapResponse`, `FundComparisonResponse` are defined in the task that produces them and used by name later; backend names match `2026-10-24-mutual-funds-backend-plan.md`.
- **Left to the implementer by design:** exact markup and CSS (the mockups are the visual contract), chart pixel metrics, and which existing helper functions to export from the old section files.
