# Individual Fund Page Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. TDD throughout. **No code starts until the owner says go.**

**Goal:** the desktop Overview and Insights tabs of the per-fund page inside the new shell, for funds the household holds, in Family Combined or a single member's scope.

**Architecture:** one feature folder `frontend/src/features/fund-page/` with a hook per backend endpoint, sections that load and fail independently (tiers 1, 2, 3), three chart components with one shared morph hook, and two route files that replace the shell's placeholders. Visual reference: the interactive mockups in `Docs/orchestration/2026-10-23-individual-fund-design-mockups.html` (artifact https://claude.ai/artifact/JQVpnVKPV1XZ74VCHMNnEX, light and dark).

**Tech Stack:** React 19, Vite, Tailwind 3.4, `d3-shape` (installed), `lucide-react`, vitest and Testing Library, `framer-motion` as already used by `ui/charts`. No new package.

**Spec:** `Docs/orchestration/2026-10-23-individual-fund-layout.md` (layout and state matrix), `...-functionality-backend-spec.md` (payloads), `...-design-mockups.html` (design system, M1 to M11), `...-reuse-vs-new.md`, `...-tdd.md`. Backend plan: `2026-10-23-individual-fund-backend-plan.md` (the API this consumes; mock it until it exists).

**Visual parity and chrome (added 24 Oct, owner-approved).** The finished page must look like its signed-off mockup(s) named in this plan, in light and dark. (1) The mockups' own sidebar, top bar, avatar and page-state buttons are not built: the shell draws the sidebar and top bar (contract v1.6). (2) **Parity step:** in the last run of this page the orchestrator runs it locally on the synthetic household and compares it with the mockup in the browser, light and dark, at 1280 and 1024 px, and lists every difference (layout, colours, type, spacing, states, copy, hover and click behaviour); differences are fixed before the run is DONE, or logged for a QA run with the owner's agreement. (3) Wherever this page lists a fund, the fund name opens the individual fund page through `paths` (the route is enabled by the Individual Fund runs). (4) Each page keeps the surface style of its own mockup (owner, 24 Oct).

## Global Constraints

- **Depends on:** shell PR 1 (route registry, `PageLayout` with tabs, `PageState`, `AppLink`, `paths`, `MiraComingSoonDialog`, `useScope`, `shell/testing` `renderInShell`) per contract v1.4. A task may start stacked on `feat/shell-nav` before it merges. Charts, palette tokens, formatting and click helpers come from the shared UI kit (`2026-10-24-shared-ui-kit-plan.md`, merged first); this plan imports them.
- **Touch only** `frontend/src/features/fund-page/`, nothing under `components/ui/charts/` (the kit owns it), and the two route files `frontend/src/shell/routes/portfolio-mutual-funds-fund.route.tsx` and `portfolio-mutual-funds-fund-insights.route.tsx` (replace the placeholder page, set `status: "live"`). Everything else under `frontend/src/shell/` untouched. The Overlap route file stays a placeholder (L17). Existing screens, `FundScoreDetailModal`, `SchemeLogo`, and mobile untouched.
- **Entry points (owner, 24 Oct):** a fund name or row opens this page wherever a page lists funds: the Mutual Funds Overview table (Mutual Funds plan task 4) and Home's fund links. The old fund popup is not used.
- **Routes (contract v1.4):** `/portfolio/mutual-funds/funds/:schemeId` (Overview), `.../insights`, `.../overlap` (greyed tab). Links only through `paths.*`.
- **Colours (palette PDF, M1 B):** fund line tier 2 teal `#0D9488`; benchmark Chart 03 blue `#2563EB`; category average `#9B9B9B`. Green `#22C55E` is for UI only: primary button, active tab underline, focus ring. Card `#F5F5F5` on base `#FCFCFC`, popups `#FFFFFF`, dividers `#ECECEC`; dark values as in the design workbook. Semantic colours only as tint backgrounds on small chips and icon discs, full colour only for icon and number. Fonts: DM Sans headings, Manrope body.
- **Score ring (M2 A):** bands by `final_score`: 85+ Excellent `#15803D`, 70 to 84 Strong `#22C55E`, 55 to 69 Good `#65A30D`, 40 to 54 Average `#CA8A04`, 25 to 39 Weak `#EA580C`, under 25 Poor `#C1272D`; the sentence under it comes from the existing verdict helpers.
- **Click affordance set (M7 A, L14):** every element with a destination: pointer cursor, 1 px lift with soft shadow and darker border on hover, an arrow that appears on hover, row background change, dotted underline on figures, crosshair on charts, others dim; keyboard: `tabIndex=0`, `role="button"`, Enter and Space activate, 2 px green focus ring; reduced motion removes the movement. Disabled targets (D2 B): text `#C4C4C4`, border `#DFDFDF`, `not-allowed` cursor, tooltip "Coming soon", no hover lift, `aria-disabled="true"`.
- **Greyed targets:** Overlap tab, Add Investment, the "..." menu, "Update", manager approach and style chips.
- **Texts fixed by decisions:** tab labels Overview, Overlap, Insights; no Growth pill; no sub-line under XIRR; Returns toggle "Inception | Current"; chart title "Period Returns" (L19); Smart Insights heading with a "Beta" tag and button "Ask Mira a follow-up" opening `MiraComingSoonDialog` (M11 A); View all holdings opens a wide dialog (M5 A); Fund Allocation tabs Market Cap, Sector, Asset Type, no Other slice and a footnote with the unclassified share (A5 C).
- **Charts:** period chips 1M, 3M, 6M, 1Y, 3Y, 5Y, All (default 1Y); legend figure is the cumulative return for the period (S12) and each legend item toggles its line; line and bar changes morph over 0.4 s (resample old data to the new point count, ease-out cubic, skipped for `prefers-reduced-motion`, fixed heights); donut slice lifts 7 px on hover via `PieChart hoverOffset`.
- **Layout:** Overview two columns at 1280 and wider (about 62 and 38 percent) and stacked below; Insights two equal columns at 1100 and wider; minimum width 1024; 20 px gaps and 20 px card padding on Insights.
- **Numbers:** the server sends `Decimal` strings; the frontend never does money arithmetic with `number`. Use `lib/decimal.ts` for any computation; formatting only otherwise (Indian grouping, `L`, `Cr`, `DD Mon YYYY`).
- **Tests:** `cd frontend && npm test -- features/fund-page/<file>`; mount with `renderInShell`; mock the API module; no network. Run only touched files.

## Review Focus

1. **Tier 3 slow or failing:** category line, score, peer cells, insights, scatter and rolling show skeletons, then fill in; a failed one shows its own error with Retry; tiers 1 and 2 are never blocked (T12).
2. **Fast chip clicking:** a late response for an earlier period must not overwrite a newer one (abort on change and ignore stale results) (T1, T6).
3. **Member switch mid-load, and a member without the fund:** requests abort and refetch for the new scope; "Not held by <name>" replaces personal tiles while fund-level cards still show (T12).
4. **Young fund and missing data:** dashed return columns with a tooltip, short risk window printed, missing benchmark line omitted with a note, fund without manager data, no disclosure yet (T6, T7, T8, T9, T10).
5. **Keyboard and reduced motion:** every clickable row and tile opens with Enter and Space; morph and lift are off under reduced motion (T2, T3, T11).
6. **Dark theme:** the same components with dark tokens, no literal light colours (T1, T13).

---

## Branch and order

Branch `feat/individual-fund-page` (frontend part). Order: T1, T2, T3 (foundations), T4 (frame and routes), T5 to T9 (Overview sections, any order after T4), T10, T11 (Insights sections), T12 (assembly, states, scope), T13 (QA). No commit or push without the owner's word.

### Task 1: API, types and section hook (tokens, formatting and click helpers moved to the shared UI kit)

**Changed 24 Oct (gap G5):** the palette tokens, `formatRupees` / `formatCompactRupees` / `formatPercent` / `formatDate` / `scoreBand`, and the `CLICK_*` / `DISABLED` constants are built once in `2026-10-24-shared-ui-kit-plan.md` Task 1 (`styles/palette-tokens.css`, `lib/format.ts`, `lib/clickable.ts`). Import them from there; their tests live in the kit plan.

**Files:**
- Create: `features/fund-page/types.ts`, `api.ts`, `hooks/useFundSection.ts`
- Test: `api.test.ts`, `hooks/useFundSection.test.tsx`

**Interfaces:**
- Produces: `fundPageApi` functions one per backend route, each `(schemeId: string, scope: string, signal?: AbortSignal) => Promise<T>` with types in `types.ts` mirroring the backend schemas (`SummaryResponse`, `PerformanceResponse`, `ReturnsResponse`, `RiskResponse`, `CompositionResponse`, `HoldingsListResponse`, `ManagerResponse`, `ScoreResponse`, `CategorySeriesResponse`, `CategoryReturnsResponse`, `RollingResponse`, `PeriodReturnsResponse`, `ScatterResponse`, `InsightsResponse`, `Unavailable`); `function useFundSection<T>(fetcher: (signal: AbortSignal) => Promise<T | Unavailable>, deps: unknown[]): {status: "loading" | "ready" | "unavailable" | "error"; data: T | null; reason: string | null; retry: () => void}`. The Overlap-tab fetchers (`overlap`, `overlapCompare`) are added by the Mutual Funds frontend plan T15, not here.

- [ ] **Step 1: Failing tests:** `api.test.ts`: each fetcher calls the exact path and adds `scope` and the bearer token; `useFundSection`: `test_ignores_stale_response_after_deps_change` (resolve the first fetch after the second; data is the second), `test_aborts_on_unmount`, `test_unavailable_payload_sets_status_and_reason`, `test_retry_refetches`.
- [ ] **Step 2: Run** the two files. Expected: FAIL.
- [ ] **Step 3: Implement** the signatures above; the API uses `lib/apiClient` (`cachedFetch`, `ApiError`, `getToken`) exactly like `features/analytics/api.ts`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): api, types and section hook`.

### Task 2: morph hook and `LineAreaChart` — moved to the shared UI kit

Built once in `2026-10-24-shared-ui-kit-plan.md` Task 2 (`components/ui/charts/use-morph.ts`, `line-area-chart.tsx`) with this task's tests (`resample`, `useMorph`, clipped-axis regression, hidden series, tooltip, one-point series, axis morph). This plan imports them. Nothing to build here.

### Task 3: `GroupedBarChart` and `ScatterChart` — moved to the shared UI kit

Built once in `2026-10-24-shared-ui-kit-plan.md` Task 2 (`grouped-bar-chart.tsx`, `scatter-chart.tsx`, `niceTicks`). Nothing to build here.

### Task 4: page frame, header, tabs, routes

**Files:**
- Create: `features/fund-page/FundPageFrame.tsx`, `FundHeader.tsx`, `FundTabs.tsx`, `useFundPageScope.ts`
- Modify: `shell/routes/portfolio-mutual-funds-fund.route.tsx`, `portfolio-mutual-funds-fund-insights.route.tsx` (page, status `live`)
- Test: `FundPageFrame.test.tsx`

**Interfaces:**
- Consumes: shell `PageLayout`, `useScope()`, `paths`, `AppLink`; `SchemeLogo`; `fundPageApi.summary`.
- Produces: `FundPageFrame({schemeId, tab, children}: {schemeId: string; tab: "overview" | "insights"; children: (ctx: FundPageContext) => ReactNode})` where `FundPageContext = {schemeId: string; scope: string; summary: HookResult<SummaryResponse>}`; `useFundPageScope(): string` ("combined" or member id from `useScope()`).

- [ ] **Step 1: Failing tests (renderInShell at the Overview path):** `test_breadcrumb_links_use_paths_and_current_fund_is_text`; `test_header_shows_plan_category_amc_and_no_growth_pill`; `test_logo_uses_scheme_logo_with_initial_fallback`; `test_add_investment_and_more_are_disabled_with_coming_soon_tooltip` (click does nothing); `test_overlap_tab_disabled` (the Overlap tab is enabled later by Mutual Funds frontend plan T15, which updates this test); `test_tab_switch_navigates_and_keeps_member` (pick a member, switch to Insights, `useScope` still that member); `test_unknown_scheme_shows_not_found_state`; `test_route_files_are_live_and_overlap_is_placeholder`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Replace the page in the two route files only (`status: "live"`); do not change `path`, `id`, `label`, `icon`, `section`, `order`.
- [ ] **Step 4: Run** this file and the shell route-registry contract test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): frame, header and routes`.

### Task 5: stat band, score ring, tile drill-downs

**Files:**
- Create: `features/fund-page/overview/StatBand.tsx`, `FundScoreRing.tsx`, `drilldowns/*.tsx` (Value, Invested, Gain, Xirr, Ter popups), `Popup.tsx` (thin wrapper over `components/ui/dialog`)
- Test: `StatBand.test.tsx`

**Interfaces:**
- Consumes: `SummaryResponse`, `ScoreResponse` (via `useFundSection`), `FundScoreDetailModal` (`isOpen`, `onClose`, `schemeId`, `schemeName`, `initialData`).
- Produces: `StatBand({summary, score}: {summary: SummaryResponse; score: HookResult<ScoreResponse>})`: one band with hairline dividers between Current value (with share of portfolio when present), Invested, Total gain with percent, XIRR (no sub-line), Expense ratio with plan; the score is the only card on the right.

- [ ] **Step 1: Failing tests:** `test_tiles_show_formatted_values`; `test_share_of_portfolio_hidden_when_null`; `test_xirr_has_no_sub_line`; `test_each_tile_opens_its_drilldown_with_enter_and_click`; `test_gain_is_positive_text_colour_and_loss_negative`; `test_score_card_opens_existing_modal_with_initial_data` (modal rendered with `initialData` equal to the row, no second fetch); `test_ring_color_follows_score_band`; `test_score_unavailable_shows_reason_not_ring`; `test_not_held_replaces_tiles_with_message_and_link_to_combined` (Review Focus 3).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** `FundScoreRing` draws the ring with `d3-shape` `arc`; the popup content components receive plain props, no fetching.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): stat band and score`.

### Task 6: performance chart with period chips and legend

**Files:**
- Create: `features/fund-page/overview/PerformanceChart.tsx`
- Test: `PerformanceChart.test.tsx`

**Interfaces:**
- Consumes: `LineAreaChart`, `fundPageApi.performance` (tier 2) and `fundPageApi.categorySeries` (tier 3), `useFundSection`.
- Produces: `PerformanceChart({schemeId, scope})`.

- [ ] **Step 1: Failing tests:** `test_default_period_is_1y_and_chip_pressed`; `test_chip_click_refetches_and_morphs`; `test_stale_response_for_earlier_period_is_ignored` (Review Focus 2); `test_legend_shows_cumulative_period_return_per_line`; `test_legend_toggle_hides_line_and_dims_legend_item`; `test_category_line_fades_in_when_tier3_arrives_and_third_legend_item_shows_loading_before`; `test_fund_younger_than_period_shows_since_launch_note`; `test_no_benchmark_for_non_equity_omits_line_with_note`; `test_no_history_state`; `test_tooltip_label_uses_long_date`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with series colours `#0D9488`, `#2563EB`, `#9B9B9B` and an area fill under the fund line only.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): performance chart`.

### Task 7: returns table (Inception and Current)

**Files:**
- Create: `features/fund-page/overview/ReturnsTable.tsx`
- Test: `ReturnsTable.test.tsx`

**Interfaces:**
- Consumes: `fundPageApi.returns(mode)` (tier 2), `fundPageApi.categoryReturns` (tier 3).
- Produces: `ReturnsTable({schemeId, scope})`.

- [ ] **Step 1: Failing tests:** `test_inception_shows_fund_benchmark_category_rows_and_footnote`; `test_category_cells_pending_then_filled`; `test_toggle_to_current_fetches_once_and_keeps_result`; `test_current_dashes_columns_longer_than_holding_with_tooltip` (M10 A, Review Focus 4); `test_non_equity_has_no_benchmark_row`; `test_not_held_current_mode_shows_not_held_message`; `test_rows_open_cash_flow_popup_in_current_mode`; `test_cell_hover_highlights_period_on_chart_via_callback` (prop `onPeriodHover`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Gains in the fund row use the positive text shade, losses the negative; other rows primary text.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): returns table`.

### Task 8: investment details and risk metrics

**Files:**
- Create: `features/fund-page/overview/InvestmentDetails.tsx`, `RiskMetrics.tsx`, `drilldowns/RiskDefinition.tsx`
- Test: `InvestmentDetails.test.tsx`, `RiskMetrics.test.tsx`

**Interfaces:**
- Consumes: `SummaryResponse`, `fundPageApi.folioNumber(folioId)`, `fundPageApi.risk`.
- Produces: `InvestmentDetails({summary})`, `RiskMetrics({schemeId, scope})`.

- [ ] **Step 1: Failing tests:** details: `test_rows_and_current_nav_date_caption`; `test_update_is_disabled_with_tooltip`; `test_folio_masked_until_copy` (the full number is requested only on copy click and written to the clipboard mock; never rendered); `test_family_scope_lists_each_folio_with_member`; `test_rows_open_matching_drilldown`; risk: `test_four_rows_with_band_chips_and_neutral_indigo_bar` (M3 A); `test_window_and_rate_footnote_printed`; `test_short_history_prints_life_window`; `test_under_one_year_shows_not_enough_history`; `test_non_equity_hides_beta_row`; `test_band_null_hides_chip_keeps_value`; `test_row_opens_definition_popup_with_enter`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the chip tone mapping `pos|warn|neg|neu` to the semantic tint classes.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): investment details and risk metrics`.

### Task 9: top holdings, all-holdings dialog, fund allocation

**Files:**
- Create: `features/fund-page/overview/TopHoldings.tsx`, `AllHoldingsDialog.tsx`, `FundAllocation.tsx`, `drilldowns/StockPopup.tsx`
- Test: `TopHoldings.test.tsx`, `FundAllocation.test.tsx`

**Interfaces:**
- Consumes: `CompositionResponse`, `HoldingsListResponse` (fetched on open), `ui/charts` `PieChart`, `PieSlice`, `PieCenter` with `hoverOffset={7}`.
- Produces: `TopHoldings({composition})`, `FundAllocation({composition, currentValue})`, `AllHoldingsDialog({open, onClose, schemeId})`.

- [ ] **Step 1: Failing tests:** `test_ten_rows_in_two_columns_with_stock_count_and_as_of_date`; `test_row_opens_stock_popup`; `test_view_all_opens_wide_dialog_and_fetches_once`; `test_dialog_sortable_by_weight_and_name`; `test_age_tag_note_when_older_than_60_days`; `test_no_disclosure_state_with_reason_text`; allocation: `test_tabs_switch_data_and_default_market_cap`; `test_market_cap_has_three_slices_and_footnote_with_unclassified_share` (A5 C); `test_centre_shows_current_value_compact`; `test_slice_hover_sets_lift_and_dims_others`; `test_slice_click_opens_slice_popup`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Reuse the existing donut stack; no new chart code.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): holdings and allocation`.

### Task 10: Insights, first half (Smart Insights, Key Insights, Strengths and Considerations, Fund Manager)

**Files:**
- Create: `features/fund-page/insights/SmartInsightsCards.tsx`, `InsightList.tsx`, `StrengthsConsiderations.tsx`, `EvidenceDialog.tsx`, `FundManagerCard.tsx`
- Test: `SmartInsightsCards.test.tsx`, `InsightList.test.tsx`, `FundManagerCard.test.tsx`

**Interfaces:**
- Consumes: `InsightsResponse` (`key`, `strengths`, `considerations`, `top_three`; each fact `{id, tone, text, evidence: [string, string][]}`), `ManagerResponse`, `MiraComingSoonDialog`.
- Produces: `EvidenceDialog({fact, open, onClose})`; components take their slice of the payload.

- [ ] **Step 1: Failing tests:** `test_heading_is_smart_insights_with_beta_tag_not_from_mira` (M11 A); `test_three_cards_from_top_three_and_each_opens_evidence`; `test_follow_up_button_opens_mira_popup`; `test_fewer_than_three_facts_shows_fewer_cards`; `test_key_insights_rows_have_tone_icon_and_open_evidence_with_enter`; `test_strengths_and_considerations_sections_with_spacing_and_evidence`; `test_no_facts_shows_not_enough_data_message`; `test_overlap_row_links_to_greyed_overlap_with_tooltip`; manager: `test_initials_tile_name_role_since_and_tenure` (M8 A); `test_approach_and_style_chips_disabled_with_tooltip`; `test_manager_unavailable_message`; `test_manager_click_opens_popup`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the tone to icon and tint mapping (M4 A): `pos` trending-up green tint, `warn` triangle-alert amber, `neg` circle-alert red, `info` info indigo, `neu` minus grey.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): insights lists and manager`.

### Task 11: Insights, second half (rolling, Period Returns, scatter)

**Files:**
- Create: `features/fund-page/insights/RollingReturnsChart.tsx`, `PeriodReturnsChart.tsx`, `RiskReturnScatter.tsx`
- Test: `RollingReturnsChart.test.tsx`, `PeriodReturnsChart.test.tsx`, `RiskReturnScatter.test.tsx`

**Interfaces:**
- Consumes: `LineAreaChart`, `GroupedBarChart`, `ScatterChart`, `fundPageApi.rolling(window)`, `periodReturns(period)`, `scatter()`.
- Produces: one component per chart taking `{schemeId, scope, onHeldFundClick?: (schemeId: string) => void}` where the scatter links a peer dot to its fund page via `paths` only when the household holds it.

- [ ] **Step 1: Failing tests:** rolling: `test_window_dropdown_1_3_5_refetches_and_morphs`; `test_window_longer_than_history_shows_note`; period returns: `test_title_is_period_returns`; `test_chip_changes_bucket_width_label_set` (1M weekly 5 buckets, 1Y monthly 12, 5Y yearly with YTD label); `test_chip_click_morphs_bar_count`; `test_stale_response_ignored` (Review Focus 2); `test_bar_click_opens_values_popup`; scatter: `test_fund_dot_highlighted_and_matches_overview_volatility_value`; `test_peer_dot_opens_card_and_held_peer_navigates`; `test_thin_category_note`; `test_unavailable_peers_state`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with the series colours from Global Constraints; the legend items toggle lines (rolling) or series (bars).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): rolling, period returns and scatter`.

### Task 12: page assembly, loading tiers, states, scope

**Files:**
- Create: `features/fund-page/OverviewPage.tsx`, `InsightsPage.tsx`, `SectionState.tsx` (loading skeleton, unavailable, error with Retry), `NotHeld.tsx`
- Modify: the two route files to render these pages
- Test: `OverviewPage.test.tsx`, `InsightsPage.test.tsx`, `scope.test.tsx`

**Interfaces:**
- Produces: `OverviewPage({schemeId})`, `InsightsPage({schemeId})` composing T5 to T11 in the layout of the layout doc; `SectionState({state, reason, onRetry, children})`.

- [ ] **Step 1: Failing tests (mock the API with controllable promises):** `test_tier1_and_2_render_before_tier3_resolves` (Review Focus 1); `test_each_tier3_card_shows_skeleton_then_content`; `test_failed_card_shows_error_and_retry_refetches_only_that_card`; `test_unavailable_reason_text_per_code` (`no_history`, `no_benchmark`, `no_disclosure`, `peers_unavailable`, `not_held`); `test_member_switch_aborts_inflight_and_refetches_personal_sections_only` (Review Focus 3); `test_not_held_member_shows_fund_level_cards`; `test_family_scope_default_combined`; `test_layout_classes_two_columns_overview_and_insights`; `test_insights_calls_start_on_tab_open_and_summary_is_reused`; `test_no_section_throws_on_all_unavailable_payloads` (every endpoint unavailable, page still renders).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Each section owns its hook; assembly components pass `schemeId`, `scope`, the summary and nothing else.
- [ ] **Step 4: Run** the three files plus the T4 frame test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(fund-page): overview and insights pages`.

### Task 13: QA and measurement

**Files:** none new (fixes go to the owning task's files).

- [ ] **Step 1: Run all fund-page tests and the chart tests:** `npm test -- features/fund-page components/ui/charts`. Expected: PASS.
- [ ] **Step 2: Visual QA against the design workbook in light and dark** at 1280, 1100 and 1024 px with the synthetic CAS household (`Docs/CAS Files/synthetic/pdfs/realistic/`) imported on a local run: header and stat band as PDF page 24, morph on every chip, donut lift, Insights two columns spacing, every disabled target greyed with its tooltip, keyboard walk (Tab, Enter, Space, Escape) across tiles, rows and charts (Review Focus 5), reduced-motion setting removes movement, dark theme uses no light literals (Review Focus 6).
- [ ] **Step 3: Staging check:** with the backend deployed, open the page for a held fund of each category on the VM; first open of a category shows tier 3 skeletons for under about 5 s and then every card; second open fast. Record the numbers.
- [ ] **Step 4: Owner review** of the page against the PDF pages 24 and 26 and the interactive mockup; list differences in a note, fix in the owning task.
- [ ] **Step 5: Do not** merge into `leapswitch-redesign` or deploy without the owner's word.

## Self-review record

Spec coverage: layout doc sections 1 to 8 (T4 frame, T5 to T9 Overview, T10 to T11 Insights, T12 states, scope and loading); design workbook M1 to M11 and the L-decisions (Global Constraints and tasks T5, T8, T9, T10); click map (clickable helpers T1, tasks assign drill-downs); staging (T13). L13 dropped, no task. Names defined once: `useFundSection` (T1), `FundPageContext` (T4), `LineAreaChart`, `GroupedBarChart`, `ScatterChart`, `useMorph`, `niceTicks` (T2, T3), reused by name in T6 to T11.
