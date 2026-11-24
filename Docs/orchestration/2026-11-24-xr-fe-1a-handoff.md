# Handoff: xr-fe-1a (XIRR leads, Returns on the flip side; Tasks 1 and 4: front-end types, the shared helper and the red tests, Codex)
**Status:** READY TO RELAY (written 2026-11-24). **Approved:** the owner approved the plan on 24 Nov 2026 and said to start execution. This is the M2 "FE-1a" pattern: Codex writes the front-end foundation and the red tests; **Antigravity then builds against them** (tasks 5 and 6) and may not edit them.
**Parent plan:** `Docs/superpowers/plans/2026-11-24-xirr-vs-returns-plan.md` (Tasks 1 and 4; read "Global Constraints" and "Review Focus"). **Spec (the design, with every mockup state and every string):** `Docs/orchestration/2026-11-24-xirr-vs-returns-plan.html`. If the spec, the plan and the code disagree, stop and say so.
**Worker:** Codex. **This handoff explicitly allows you to edit the front-end files listed below** (it overrides "backend only" in `ui-common-rules-codex.md`, as `wave-common-rules.md` allows: "Codex also writes the red tests that Antigravity builds against"). **You cannot run WSL, so you cannot run the front-end checks: write the tests and the code, and report BLOCKED on running; Claude runs them** through `wave-fe-check.sh`. **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-xr-rt` (worktree, branch `batch/xr-rt`). Never in the main checkout.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What and why (owner decisions, 24 Nov 2026)
The Portfolio tile, the Mutual Funds tile and the Mutual Funds holdings list show the since-purchase return under an "XIRR" label for anything under a year. New behaviour: **XIRR (annualised) is always the headline; Returns (since purchase) is on the flip side of each tile and in its own column in the list.** A small **caution chip** sits on the XIRR (`held under 1 yr` or `one transaction`), never on Returns. The tile is a **flip tile**: one measure at a time with a "Show Returns" / "Show XIRR" button; it always opens on XIRR; a flip lasts until the page reloads. The backend sends both numbers and the caution (additive fields `lifetime_xirr_caution`, `current_holdings_xirr_caution`, per row `xirr_caution`; since-purchase values are filled for every case). Scope is only: the two tiles, the holdings list (screen and the PDF export's Overview page, which prints the same table), and the Unrealised label. Nothing else changes.

## Part A (Task 1): types and the shared helper
**Files you may change:** `frontend/src/lib/xirrDisplay.ts` (**add** the new exports; **keep** the old `resolveXirrDisplay`, `SINCE_PURCHASE_CAPTION`, `SINCE_PURCHASE_SHORT_LABEL` working until Claude removes them in the cleanup task), `frontend/src/features/portfolio/types.ts`, `frontend/src/features/mutual-funds/types.ts`, `frontend/src/features/mutual-funds/api.ts`. **New test:** `frontend/src/lib/xirrDisplay.test.ts` (none exists today).
**The contract (fixed; do not rename or reshape):**
```ts
export type XirrCaution = "young" | "single_transaction";           // exported from lib/xirrDisplay.ts; the two types.ts files import or re-declare it in the style they already use for XirrBasis
// all OPTIONAL, so old payloads still type-check:
//   per-fund and consolidated row types (the three places that already have xirr_basis / since_purchase_return): xirr_caution?: XirrCaution | null
//   the tile response types and XirrBundle (the places that already have lifetime_xirr_basis / current_holdings_xirr_basis): lifetime_xirr_caution?: XirrCaution | null ; current_holdings_xirr_caution?: XirrCaution | null
export const XIRR_CAPTION = "Annualised since your first investment";
export const RETURNS_CAPTION = "Since purchase, not annualised";
export const CAUTION_CHIP: Record<XirrCaution, { text: string; tip: string }>;
//   young:              { text: "held under 1 yr",  tip: "Held under 1 year: an annualised rate can look very large over a short period. Open Returns to see the plain gain." }
//   single_transaction: { text: "one transaction", tip: "One purchase only, so this is the yearly rate of a single investment." }
export interface Figures { xirr: string | null; returns: string | null; caution: XirrCaution | null }
export function resolveFigures(
  xirr: string | null | undefined, sincePurchase: string | null | undefined, caution: XirrCaution | null | undefined,
): Figures;   // undefined becomes null; "0" stays "0"; never throws; never invents a number
```
`getHoldingsBundle` in `features/mutual-funds/api.ts` copies `lifetime_xirr_caution` and `current_holdings_xirr_caution` into `XirrBundle` exactly the way it copies the basis keys today (only when the key is present in the response).
**Tests first:** `xirrDisplay.test.ts`: `resolveFigures_passes_both_numbers_and_the_caution`, `resolveFigures_turns_undefined_into_null`, `resolveFigures_keeps_a_zero_return_as_the_string_0`, `caution_chip_text_and_tip_match_the_owner_wording` (the exact strings above), `captions_match_the_owner_wording`. In `features/mutual-funds/api.test.ts`: `getHoldingsBundle_copies_the_two_caution_keys_when_present_and_omits_them_when_absent`. Write these, then the code; they should pass once the code exists (they are red first because the exports do not exist).

## Part B (Task 4): the red tests Antigravity builds against
**Test files you may change or create (and nothing else in this part):** `frontend/src/features/portfolio/sections/SummaryStrip.test.tsx`, `frontend/src/features/mutual-funds/overview/SummaryStrip.test.tsx`, `frontend/src/features/mutual-funds/overview/HoldingsTable.test.tsx`, `frontend/src/features/mutual-funds/overview/OverviewPage.test.tsx`, `frontend/src/print/groups/overview/overview.print.test.tsx` (it imports `SINCE_PURCHASE_CAPTION` and asserts the old caption: change it to assert the new columns), **create** `frontend/src/components/MeasureFlip.test.tsx`.
**You must not create `MeasureFlip.tsx` or change any source file other than those in Part A.** The tests for the component and the new behaviour are RED because the component and the behaviour do not exist yet: that is intended. (`tsc -b` will report the missing `MeasureFlip` module and the new props until Antigravity builds them: expected; say so in the report.)
**Replace, do not leave behind, the existing tests that pin the old swap** (the "return since purchase, not annualised" caption on the XIRR figure, the `since purchase` sub-label under the XIRR cell, `resolveXirrDisplay`-based expectations in the tile, table and print tests): if they stay, Antigravity's correct work would turn them red. List every test you replaced in the report. Keep every test that does not pin the swap (loading, error, disclaimer modal, as-on date line, sorting basics).
**The component and the test ids (fixed; Antigravity must satisfy exactly these):**
```tsx
// frontend/src/components/MeasureFlip.tsx (Antigravity creates it)
export interface MeasureFlipProps {
  face: "xirr" | "returns";
  onFlip: () => void;
  canFlip: boolean;              // false hides the button (nothing to flip to)
  labelXirr: string;             // "XIRR"
  labelReturns: string;          // "Returns"
  children: React.ReactNode;     // the face's body: figure, caption, chip, links
}
```
- Flip button: `data-testid="measure-flip"`, accessible name `Show Returns` (on the XIRR face) or `Show XIRR` (on the Returns face), carries `data-clickable`. Face title: `data-testid="measure-title"` (text `XIRR` or `Returns`). The face body sits in a region with `aria-live="polite"`.
- Tiles keep their existing ids: `metric-xirr` (the tile), **`value-xirr` (the figure, on both faces)**, `xirr-caption` (both faces; text `Annualised since your first investment` or `Since purchase, not annualised`; where today's tile shows the opening-balance disclaimer link in place of the caption, that link stays and works on both faces), `xirr-as-of` (unchanged). New: `xirr-caution` (the chip; `title` and `aria-label` equal the tip text; XIRR face only). The tile's ⓘ keeps `info-xirr`; its `aria-label` is the existing text on the XIRR face and `Total gain as a share of money paid in, not annualised.` on the Returns face.
- Unrealised: the existing `delta-unrealised` text reads `+6.5% return on invested` (the percentage as formatted today, then the words); a new ⓘ `data-testid="info-unrealised"` with `aria-label` and `title` `Unrealised gain as a share of what you currently have invested. Not annualised.`
- Tile data: the Portfolio tile reads `lifetime_xirr`, `lifetime_since_purchase`, `lifetime_xirr_caution` (Lifetime view) and `current_holdings_xirr`, `current_holdings_since_purchase`, `current_holdings_xirr_caution` (Current view); the Mutual Funds tile reads the same through `XirrBundle` (`lifetime`, `current`, `lifetime_since_purchase`, `current_holdings_since_purchase`, `lifetime_xirr_caution`, `current_holdings_xirr_caution`). `canFlip` is true only when both the XIRR and the since-purchase figures are not null.
- Table: columns after Gain/Loss are **Returns** then **XIRR**; cells `data-testid="returns"` and `data-testid="xirr"` on single-member and family parent rows, `child-returns` and `child-xirr` on expanded children; the chip `xirr-caution` sits inside the XIRR cell only. Header cells carry a `title` equal to the tooltip: Returns = `Total gain as a share of money paid in, not annualised.`; XIRR = `Yearly rate, worked out from the dates of your investments.` The sort menu gains an entry labelled `Returns` after `Gain/Loss`; both columns sort ascending and descending with missing values last. The `since purchase` sub-label under the XIRR value is gone. Row data: main rows read `xirrByScheme` (annualised), and `xirrMetaByScheme[scheme_id]` (`xirr_basis`, `since_purchase_return`, `xirr_caution`); consolidated parent and child rows read their own `xirr`, `since_purchase_return`, `xirr_caution`. The `OverviewPage` mapping passes `since_purchase_return` and `xirr_caution` from every fund of `bench.data.funds`; the print page's mapping (`print/groups/overview/OverviewSections.tsx`, written by Antigravity later) does the same.
**The tests (names fixed; adapt the data to each file's existing fixtures):**
- `MeasureFlip.test.tsx`: `renders_the_children_and_the_title_of_the_current_face`; `button_name_is_show_returns_on_the_xirr_face_and_show_xirr_on_the_returns_face`; `calls_onFlip_on_click_enter_and_space`; `hides_the_button_when_canFlip_is_false`; `has_data_clickable_and_a_polite_live_region`; `focus_stays_on_the_button_after_a_flip`.
- **Both tile test files** (same set, each adapted to its tile): `opens_on_xirr_with_the_annualised_caption`; `young_portfolio_shows_the_annualised_figure_and_the_held_under_1_yr_chip`; `flip_shows_returns_with_the_since_purchase_caption_and_no_chip`; `flip_back_returns_to_xirr`; `face_survives_the_lifetime_current_toggle`; `current_view_uses_its_own_figures_and_chip`; `single_transaction_shows_the_one_transaction_chip`; `both_conditions_show_only_held_under_1_yr` (the backend sends `young` in that case, so the test uses `young`; assert exactly one chip); `mature_multiple_buys_have_no_chip`; `opening_balance_disclaimer_link_works_on_either_face`; `not_computable_shows_a_dash_and_hides_the_flip_button`; `missing_since_purchase_hides_the_flip_button_and_xirr_still_shows`; `loading_and_error_states_are_unchanged`; `the_old_return_since_purchase_not_annualised_caption_is_gone_from_the_xirr_face`; `unrealised_percent_reads_return_on_invested_with_the_tooltip`; `old_payload_without_the_new_keys_renders_as_a_mature_portfolio_without_a_chip`.
- `HoldingsTable.test.tsx`: `columns_are_gain_loss_returns_xirr_in_that_order`; `returns_cell_shows_the_since_purchase_return_for_every_row`; `xirr_cell_shows_the_annualised_rate_never_the_since_purchase_figure`; `chip_sits_on_the_xirr_cell_only_where_the_caution_applies`; `the_since_purchase_sub_label_under_xirr_is_gone`; `a_fund_bought_once_gets_one_transaction_while_its_neighbours_do_not`; `family_parent_and_each_child_get_their_own_chip`; `more_than_four_members_shows_dashes_for_child_rows`; `missing_returns_shows_a_dash_and_xirr_still_shows`; `net_zero_row_shows_dashes_in_both`; `sorts_by_returns_and_by_xirr_with_missing_values_last`; `sort_menu_has_a_returns_entry`; `header_tooltips_use_the_owner_wording`.
- `OverviewPage.test.tsx`: `meta_mapping_passes_since_purchase_return_and_xirr_caution_for_every_fund`.
- `overview.print.test.tsx`: `printed_table_has_returns_and_xirr_columns_and_the_chip`; `printed_table_no_longer_shows_the_since_purchase_sub_label`; `print_mapping_passes_xirr_caution`.
- Formatting rule inside the tests: figures render through the existing `formatXirr` (so `"0.418"` shows `41.8%`, `"-0.001"` shows `-0.1%`, `"0"` shows `0.0%`); use `formatXirr` in the expectations rather than hard-coding where the existing tests do.

## Run these only (Claude runs them; you cannot)
```
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash "/mnt/c/Users/Dell/lanes/unifolio-xr-rt/Docs/orchestration/wave-fe-check.sh" xr test <paths>
```
(lane `xr` reads `unifolio-xr-returns`; Claude points it at your worktree when verifying.) If you can run `npx vitest run <file>` in PowerShell in your worktree, try once and report the result; otherwise BLOCKED. Baseline before any change (Claude, 24 Nov): the portfolio SummaryStrip test, `features/mutual-funds/overview`, `mutual-funds/api.test.ts`, `guards.test.ts` and `print/groups/overview`: 15 files, 290 tests passed.

## Files you may touch (the whole list)
Part A: `frontend/src/lib/xirrDisplay.ts`, `frontend/src/lib/xirrDisplay.test.ts` (new), `frontend/src/features/portfolio/types.ts`, `frontend/src/features/mutual-funds/types.ts`, `frontend/src/features/mutual-funds/api.ts`, `frontend/src/features/mutual-funds/api.test.ts`. Part B: the five test files and `frontend/src/components/MeasureFlip.test.tsx` named above.
**Do not touch:** `backend/**`, `frontend/src/mobile/**`, `frontend/src/features/dashboard/**` (the legacy dashboard types stay), any component or page source file, `guards.test.ts`, `package.json`, the lockfile, any config.

## Constraints
No `parseFloat`, `toFixed`, `Intl.`, `console.`, hex colours or `any` in anything you write (the guards scan source files; keep tests clean too). Features may not import other features; `components/` may not import `features/*`. No new dependency. Invented data only. Plain words, **no em dashes** in any string. Git read-only. No deletion flags or recursive deletes. **No copy of your own**: use only the strings in this handoff.

## Report format
One fenced block `CODEX REPORT: xr-fe-1a`: status; baseline HEAD; drift (anything in the code that differs from the description above); which tests are red and why (expect missing module, missing ids, old caption); every old test you replaced; files changed with a one-line reason each; commands tried and their results or BLOCKED with the exact error; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Front-end foundation worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-24-xr-fe-1a-handoff.md (your task: xr-fe-1a, owner-approved; it allows the front-end files it lists, despite "backend only" in the rules file)
Open Docs/superpowers/plans/2026-11-24-xirr-vs-returns-plan.md (Tasks 1 and 4) and Docs/orchestration/2026-11-24-xirr-vs-returns-plan.html (the design) for context. Work only in C:\Users\Dell\lanes\unifolio-xr-rt on branch batch/xr-rt. Git is read-only. No deletion flags or recursive deletes. Part A first (types, helper, its tests), then Part B (the red tests). Change only the files the handoff lists; do not create MeasureFlip.tsx. You cannot run WSL: write everything, try one vitest run if you can, otherwise report BLOCKED. Claude runs the checks.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
