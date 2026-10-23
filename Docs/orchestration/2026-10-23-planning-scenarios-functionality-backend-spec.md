# Planning (market scenarios): functionality and backend spec (draft v1)

**Status:** draft for owner review, 2026-10-23. Planning only; nothing is built. Document 1 of the Planning documents phase.
**Scope:** desktop web, mutual funds only. Mobile untouched. Search on hold. Event tracking deferred.
**Inputs:** the planning workbook `2026-10-23-planning-scenarios-decisions-v1.html` (decisions L1 to L35, cited as L-numbers; cards as A1, F1 and so on), the PDF `Web app UI mockups MFs.pdf` pages 28 and 29, shell contract v1.5 (edited 23 Oct, uncommitted), and the code as read on 23 Oct 2026.
**Reuse-first rule:** the page reads the existing scenario API. The backend changes are additive fields and one optional parameter. There is no new table, no migration and no new job.
**Open items:** none. G1 to G9 were answered on 23 Oct (decisions L36 to L44 in the planning workbook). G1 C: `ScenariosScreen` is edited in place with a desktop variant switch (section 11).

## 1. Page contract

Planning is **one route, `/planning`**, layout `app`, scope `none` (contract v1.5, L1). The signed-in account's whole household is the data; the top-bar scope selector is not used (L19). State lives in the page, not the URL:

| State | Shows | How the user gets there |
|---|---|---|
| `landing` | title, two cards | opening Planning; also after a refresh (L15) |
| `future` | Coming soon view with a Back link | the Plan your future card |
| `market` | scenario list with a Back link | the Explore market scenarios card |
| `market` + selected scenario | list plus the scenario's detail below | a scenario card |

Each step pushes a browser history entry (`window.history.state` carries `{planning: state, scenarioId}`), so Back steps detail, list, landing (L15). The shell's own Back is unaffected. Selecting a scenario scrolls to the detail heading with a smooth scroll that is skipped under reduced motion (L14).

## 2. Landing and Plan your future

- Two cards as on page 29: **Plan your future** ("Set goals, adjust assumptions and see how your wealth can grow over time.") and **Explore market scenarios** ("See how your portfolio might perform in historical and hypothetical market events."). Wording follows the PDF; confirm in G4.
- A chosen card replaces the landing; a Back link returns (L13). The four sub-links and the video tile are not built (L8).
- **Plan your future** shows a Coming soon view: heading, one line on what will live there (retirement, education, home purchase and wealth goals), no controls, nothing collected (L2, L32).

## 3. Scenario list (`market`)

Data: `GET /scenarios?curated=true` and `GET /scenarios` (both exist; hypotheticals are hidden unless `SCENARIO_HYPOTHETICALS_ENABLED`). Structure as built (L17): curated cards first, a **More scenarios / Hide** toggle, then the pills All, Crashes, Bull Runs, Policy / Rate (plus Hypothetical only when the flag is on) filtering the remaining cards.

Card content (page 29 style, L8, L18):

| Element | Source |
|---|---|
| Type icon | `scenario_type` (CRASH, BULL_RUN, POLICY_RATE; HYPOTHETICAL when enabled) |
| Name | `name` |
| Dates | `formatDateRange(start_date, end_date, is_ongoing)` (existing helper) |
| Description line | **new field `description` on the summary** (the column exists and is required; the API does not return it today) |
| Stat | `quick_market_pct` as "Nifty 50: x%", red text when negative, green when positive (palette text shades); no stat for hypothetical, freeze or multi-phase scenarios (as today) |
| Badges | Freeze (when `had_redemption_freeze_schemes`), ongoing dot (`is_ongoing`), Assumption-based (hypothetical) |
| Chevron | right arrow; the selected card has a green outline (selected state is an allowed green use) |

`quick_equity_pct` and `quick_debt_pct` stay stored and returned but are not shown on cards (L18). Whether the detail stays open when the user changes a pill: G3.

## 4. Scenario detail (`market` + selection)

Data: `GET /scenarios/{id}/results` (family) or `GET /scenarios/{id}/results?member_id=<uuid>` (one member). Order, top to bottom:

1. **Heading** (name, dates, description), **member dropdown** at the right, **disclaimer line** (existing text, L30).
2. **Four stat tiles** (L7):
   - *Your portfolio return*: `portfolio_impact_pct`.
   - *Rupee impact*: `rupee_impact`, Indian grouping, signed.
   - *Nifty 50 return and Outperformed by*: the `nifty_50` entry of `benchmarks` and the gap `portfolio_impact_pct - nifty_50.pct` in percentage points (Decimal, 2 dp, sign shown, "Outperformed by" when positive, "Behind by" when negative). One caveat line: the comparison is with an equity index (wording G4). Tile absent when `benchmarks` is empty (multi-phase, freeze) or when `portfolio_impact_pct` is null.
   - *Coverage*: "Based on ₹X of your ₹Y" plus "n funds have no data for this period" when `no_data_funds > 0`.
3. **Two charts side by side** (L6, L28): *Benchmark comparison* (your portfolio bar first, then the five indices; signed bars from a zero line; only when `benchmarks` is non-empty) and *Impact by asset class* (section 5).
4. **Insights from Mira** card: static, "Coming soon", with a button that opens the shell's existing Mira dialog (L26).
5. **Phase cards** (multi-phase scenarios only, existing content).
6. **By family member** list, expandable to funds, with estimate and frozen labels on fund rows (L25, L35). The by-fund list is not shown.

Result shapes (L23): **standard** has everything above. **Multi-phase**: no benchmark tile and no benchmark chart; the headline is cumulative; the phase cards follow the tiles. **Redemption freeze**: the freeze banner replaces the tiles and charts when any held fund was frozen (existing banner text and "none of your funds were frozen" variant); the member list stays. **Hypothetical**: not rendered while the flag is off.

**Pre-2006 scenarios (L24):** when no fund has any result for the scenario, the detail shows the benchmark tile and bars only, plus a note in place of the fund sections (wording G4). The backend returns `funds_data_available` (section 6).

**Member dropdown (L5, L19):** options are "Family combined" and each member that holds at least one fund (members whose fund list is empty are left out). The member list is read once from the family response and kept; choosing a member refetches with `member_id`. The choice is kept while the user moves between scenarios and reset when Planning is left. When one member is chosen, how the member list looks: G2.

**Estimate and frozen labels (L35):** a fund row under a member shows "Estimate" (tooltip: the basis, for example Category average estimate or Asset-class average estimate; same text as today's by-fund rows) when `is_proxied`, and "Frozen" (existing wording) when `is_frozen`. Data for this is a backend addition (section 6).

## 5. Impact by asset class

- Groups (L20): Equity, Hybrid, Debt, Gold and Silver, Overseas, Other.
- Backend maps each held fund through the existing `underlying_asset_class(category, name)` and then to the display group: Equity to Equity; Hybrid to Hybrid; Debt-short and Debt-long to Debt; Gold and Silver to Gold and Silver; Overseas to Overseas; **Index/ETF to Equity** (generic index funds and ETFs track Indian equity indices); everything else to Other. The helper's nine return values are Equity, Hybrid, Debt-short, Debt-long, Gold, Silver, Overseas, Index/ETF and Other (read on 23 Oct); V3 now only covers the size of the Other group on real funds.
- Per group: `rupee_impact` = sum of each fund's `rupee_impact` (value times percent, the same numbers behind the headline); `covered_value` = sum of those funds' current values; `pct` = `rupee_impact / covered_value * 100` rounded to 2 dp. Funds with no data and frozen funds are in neither sum.
- Bars are in rupees, the percent is printed beside each bar (L21); groups with no held funds are not drawn. A caption states coverage: "Covers ₹X of ₹Y" so the bars are not mistaken for a reconciliation of the headline when funds are excluded.
- Same Decimal rules as the engine: all sums are `Decimal`, never `float`; strings out.

## 6. Backend changes (all additive)

| Change | Where | Notes |
|---|---|---|
| `description: str` on `ScenarioSummaryRow` | `schemas.py`, `get_scenario_summary` | column exists; mobile ignores unknown fields |
| Optional `member_id: uuid` on `GET /scenarios/{id}/results` | `api/scenarios.py` | must belong to the account: check against `list_household_members(db, user.id)`; otherwise **404** (no hint that the id exists); omitted means the whole household as today |
| `by_asset_class: list[{bucket, rupee_impact, pct, covered_value}]` on `ScenarioResultRow` | `scenario_engine.py` (new small function beside the existing helper) | empty list for hypothetical results |
| `is_proxied`, `proxy_basis`, `is_frozen` on `ScenarioMemberFundResult` | `schemas.py`, engine member-fund rows | values already computed per fund; the family response keeps `by_fund` unchanged for compatibility, the frontend stops rendering it |
| `funds_data_available: bool` on `ScenarioResultRow` | engine | true when any `scenario_scheme_results` row for the scenario has a non-null percent (reads existing table) |

Response size grows by a few hundred bytes. Existing tests for these schemas gain fields; no existing assertion changes meaning (verified list in the TDD doc).

**No new table, no migration, no job.** Scenario results per fund are still computed in advance by the existing job; the household result is computed at request time from current holdings.

## 7. Speed (L31)

The results route calls `compute_holdings`. The Home staging run measured a cold `compute_holdings` at 4.9 to 24.3 s because it re-downloads fund NAV history until today's NAV exists (never on weekends and holidays); warm calls take 0 ms (15-minute per-worker cache). Decision: use Home's optional `allow_stale_today` setting (Home backend plan T1) so the route uses prices the 06:00 job stored, and add a read-only staging timing script for this route (cold and warm, three households), modelled on `backend/scripts/measure_home_staging.py`. The Planning backend task depends on Home T1; order is in the architecture doc and G7. Member-filtered calls hit the same cache entry only when the member set matches; a per-member call therefore pays its own cold cost once (note for the timing script).

## 8. Privacy, consent and security

No new personal data, no new stored data, no consent change, no third party, no billing. PAN is not used. The `member_id` ownership check is the one access-control point; it needs a test that another account's member id returns 404 and leaks nothing. Disclaimer wording and hypothetical values keep their existing release gates (outside this plan).

## 9. Out of scope

Plan your future features (page 28), the video tile, the four sub-links, benchmark switch, date-range picker, custom scenarios, line chart, lowest-value and recovery-time tiles, Mira insights, mobile, search, event tracking.

## 10. Verification items

V1 time the route on staging (cold and warm, family and member); V2 confirm `ui/charts/bar-chart` is not used (L28); V3 read all return values of `underlying_asset_class` and the size of the Other group on real funds; V4 confirm every scenario has a non-empty description on staging; V5 read PDF page 27 if it matters.

## 11. How the existing screen is edited (L36, G1 C)

`ScenariosScreen` is used by the mobile app (`mobile/MobileRoot.tsx`) and by today's desktop tab flow (`features/dashboard/MainDashboardFlow.tsx`). It gains one optional prop, `variant?: "classic" | "planning"`, default `"classic"`. With `"classic"` (what mobile and the old tab flow pass, by passing nothing) the file behaves exactly as before. With `"planning"` it returns at the top of the component to the new `PlanningScenarios` flow (the list with page-29 cards, the detail below it, the member dropdown, the new tiles and charts), which lives in new files. The branch is deliberately an early return so the classic code paths are not touched line by line. `PlanningPage` (landing and Coming soon) renders `<ScenariosScreen variant="planning" />` in its market state. `types.ts` and `api.ts` get additive fields and the optional `memberId` argument (mobile ignores both). No other existing scenario file is edited. If a later change needs a branch inside another existing file (for example `ResultParts`), it is added the same way: an optional prop, default classic, and a test proving classic is unchanged.
