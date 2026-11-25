# The summary bar polish (item 12): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Read `Docs/orchestration/wave-common-rules.md` and the master plan `Docs/superpowers/plans/2026-11-25-qa-patches-master-plan.md` first; they win where they differ. Strategy as in M1 to M4 and the XIRR batch: **Claude orchestrates, Codex builds the foundation and the red tests, Antigravity builds the UI from very detailed packets.** Front end only; no back end change.

**Goal:** Give the Portfolio and the Mutual Funds summary bars one premium look in every state (a light lead card for Total Portfolio Value plus one panel for the other four figures, a quiet bottom strip), **without changing anything that is shown today**, and give the holdings table's caution note the same quiet style.

**Architecture:** One small shared folder of presentational primitives (`components/summary-bar/`) lays out the two surfaces and draws a figure, a label, a caption, a sparkline and a chip the same way everywhere; the two existing `SummaryStrip.tsx` files keep all their data, state and test ids and only change how they compose those primitives. A text-inventory test captured from today's components proves no word or number changed.

**Tech Stack:** React, TypeScript, Vitest, Tailwind tokens, CSS modules, lucide-react.

**Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16), **item 12** (mockups 1 to 5; the visual spec is the page's section `d12x` and its CSS under the `pb-` namespace, whose hex values are palette values to be implemented as tokens), decisions **QA-13 A, QA-14 A, QA-15 A, QA-16 B** and the owner's rule "the whole bar, without changing what is being shown right now, for all states". The page wins over this plan's prose; where it and the live code disagree, stop and ask the owner. The dark hero card was dropped by the owner (25 Nov).

## Global Constraints

- **Nothing shown changes.** Every label, number, caption, chip, info icon and word stays exactly as built: `Total Portfolio Value`, `Total Invested`, `Unrealised Gain`, `Realised Gain`, `XIRR` / `Returns`, `Show Returns` / `Show XIRR`, `Lifetime`, `Current`, `Annualised since your first investment`, `Since purchase, not annualised`, `held under 1 yr`, `one transaction`, `Since inception — opening-balance disclaimer may apply ›` (and the `Current holdings — ...` form; the dash and the `›` stay, kept with the last word by a non-breaking space), `Prices as on ...`, `Today's Gain: ...`, `... return on invested`, `N on last known NAV`, `not priced yet`, `Couldn't load trend` / `Retry`, `Couldn't load your portfolio summary` and its sentence, the synopsis line on the Mutual Funds bar. **Every existing `data-testid`, role, `aria-label` and behaviour is kept**; the existing tests run unchanged and are the proof.
- **Owner decisions:** the Show Returns control is a quiet ghost button at the top right of the XIRR cell (same icon and words; icon only below the container width of about 215px, with the words as its accessible name); the caution pill sits **beside the figure** on the same line, small, with a status dot (warm tint for `held under 1 yr`, neutral for `one transaction`); the disclaimer is the same one sentence as a quiet green link, two lines at most; the Lifetime | Current switch sits in the bottom strip under the XIRR column; `Prices as on ...` sits at the left of the bottom strip; `N on last known NAV` (with its warning triangle) in the lead card's bottom row.
- **Decorative additions (the owner may veto each; each is a separate small unit so one can be dropped):** (1) the lead card's soft white-to-mint surface with a faint green glow; (2) a soft area under the sparkline and a dot on its last point; (3) a wallet line icon in a soft tile in the lead card's title row; (4) a clock line icon before `Prices as on`; (5) a very light tint wash at the top of the Unrealised Gain cell in the colour of its sign; (6) an alert line icon in a soft tile on the error card. None carries a word or any information. **No emojis.**
- **Tokens only:** colours through `--ui-*`, `--pos*`, `--neg*`, `--warn*`; the one new token (the lead card's glow) goes in `styles/palette-tokens.css` for light and dark. The large figure is DM Sans bold, tabular numerals, scaling 22 to 28px with the cell width; the rupee sign is drawn smaller and lighter (same character, styling only); the "i" uses `INFO_GLYPH_CLASS` from Plan 3. Reduced motion respected (the 200 ms turn stays).
- Front-end guards: `features/mutual-funds/guards.test.ts` asserts exactly **70** files in that folder: **this plan adds no file there** (new files live in `components/summary-bar/` and `lib/`); every `<button` needs `data-clickable`; no `parseFloat`, `toFixed`, `Intl.`, `console.`, `any`, no hex outside token CSS; features may not import other features; `components/` may not import `features/*`. Phone UI unchanged; print unchanged (the bar is not printed).
- Tests first, always; run only the affected tests; red test files are fixed once written. Codex cannot run WSL; Claude runs tests through `wave-fe-check.sh`.

## Review Focus

1. **A figure that is 12 characters long** (`₹1,53,26,999`, `+₹1,01,73,830`) inside the narrowest cell: it must not wrap or clip at 1,100 and 1,280px. [Task 2]
2. **The Show Returns control at the narrowest XIRR cell:** icon only, still named, never squeezing the title. [Task 2]
3. **Every state keeps its structure:** loading (five skeleton shapes), the error card with Retry, the trend-failed note, the partial-prices chip, the Returns face, Lifetime and Current, the disclaimer, zero and empty figures. [Tasks 1, 2, 3]
4. **The Mutual Funds bar loads its tiles independently** (skeleton or `—` per tile) and keeps its two chips (`on last known NAV`, `not priced yet`) and its synopsis line. [Task 3]
5. **The caution chip in the table and in the tile is one piece of code,** so the two cannot drift; the table cell keeps right-aligned numerals. [Task 4]
6. **Dark mode:** every surface and text colour comes from a token; nothing is clipped. [Tasks 2, 3]
7. **Nothing shown changed:** the text inventory of every state equals the one captured from today's code. [Task 1]

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/components/summary-bar/` (new): `SummaryBar.tsx`, `SummaryLead.tsx`, `SummaryCell.tsx`, `SummaryFigure.tsx`, `SummarySpark.tsx`, `summaryBar.module.css`, `index.ts` (+ tests) | The shared primitives (layout, label, figure with the smaller rupee, caption, sparkline with area and dot, bottom strip) |
| `frontend/src/lib/summaryFigure.ts` (new, + test) | `splitCurrency(text)` for the smaller rupee sign |
| `frontend/src/components/info/InfoGlyph.tsx` (new, + test) | The hand-rolled "i" span of the two strips as one component using `INFO_GLYPH_CLASS` |
| `frontend/src/components/MeasureFlip.tsx` (+ module CSS), `XirrCautionChip.tsx` | Ghost control with icon-only mode; chip variants `pill` (default) and `note` |
| `frontend/src/features/portfolio/sections/SummaryStrip.tsx`, `features/mutual-funds/overview/SummaryStrip.tsx` | Compose the primitives; all data, state, test ids and copy unchanged |
| `frontend/src/features/mutual-funds/overview/HoldingsTable.tsx` | The local `CautionChip` (~L53-75) replaced by the shared chip, `note` variant |
| `frontend/src/styles/palette-tokens.css` | The one glow token |
| `frontend/src/test/summaryTextInventory.ts` (new) and `frontend/src/features/**/__baselines__/` JSON (new) | The no-word-changed baseline |

## Lanes, branches and folders (confirm each path when a packet is written)

Integration branch `batch/sb` cut from `patch/qa1` **after Plan 3's lane V1 has merged** (it uses `INFO_GLYPH_CLASS`).

| Lane | Task | Worker | Folder | Branch |
|---|---|---|---|---|
| RT | 1 | Codex | `C:\Users\Dell\lanes\unifolio-sb-rt` (new worktree) | `batch/sb-rt` |
| SB1 | 2 | Antigravity | `C:\Users\Dell\ag-sb1` (new clone) | `ag/sb1-primitives` |
| SB2 | 3 | Antigravity | `C:\Users\Dell\ag-sb2` (new clone) | `ag/sb2-mfbar` |
| SB3 | 4 | Antigravity | `C:\Users\Dell\ag-sb3` (new clone) | `ag/sb3-table` |
| Claude | 0, 5 | Claude | `C:\Users\Dell\lanes\unifolio-sb` (integration; check lane `sb`) | `batch/sb` |
**Order:** Task 0; Task 1 (Codex); Task 2 (primitives and the Portfolio bar); then Tasks 3 and 4 in parallel (both consume Task 2's primitives); Task 5.

## Handoff and packet rules

As in the master plan. The packets are **very detailed** and are where this item comes out well: they carry the page's `d12x` mockups as the visual spec, with every pixel value, token mapping, state and the exact DOM; the states table (A mature, B down day with partial prices and `held under 1 yr` and the disclaimer, C loss, D empty, E Returns face, F Current with `one transaction`, G loading, H trend failed, I error, J dark, tablet two-column, one-column, hover, focus, the "i" popover open); and the text inventory they must keep. Claude screenshots each state next to the page's mockup at 1,440, 1,280, 1,100, 1,024 and tablet widths, light and dark, and sends exact differences back.

## Task 0: Wave-start check and lane setup (Claude)

- [ ] **Step 1:** confirm Plan 3 lane V1 is merged into `patch/qa1`; cut `batch/sb`; create the folders; add case lines for `sb` and `sb-rt` to `wave-fe-check.sh`.
- [ ] **Step 2: Confirm the code this plan names still looks as described:** the five tiles, test ids and states of both `SummaryStrip.tsx` files (Portfolio: five separate cards, grid `1.5fr_1fr_1fr_1fr_1fr`, hand-rolled "i" spans `info-total-value`, `info-unrealised`, `info-xirr`; Mutual Funds: one outer card, `InfoMark`, two chips, the synopsis line, independent loads); `MeasureFlip` props `{face, onFlip, canFlip, labelXirr, labelReturns, children, titleExtra?, belowTitle?}`; `XirrCautionChip({caution})`; `HoldingsTable.tsx` local `CautionChip` (~L53-75) and `XirrFigure` (~L76-81); `formatRupees`, `sparkPoints`, `sparkTrend`, `todayGainLine`, `partialChipText`.
- [ ] **Step 3: Record the baseline:** run both `SummaryStrip.test.tsx` files, `HoldingsTable.test.tsx`, `OverviewPage.test.tsx`, `MeasureFlip.test.tsx`, `PortfolioPage.test.tsx`, `features/mutual-funds/frame/sectionGuard.test.tsx` and the three guard files; note which pass.

## Task 1: Foundation and red tests (Codex, lane RT; FE-1a)

**Files:**
- Create: `lib/summaryFigure.ts`, `lib/summaryFigure.test.ts`, `components/info/InfoGlyph.tsx`, `components/info/InfoGlyph.test.tsx`, `test/summaryTextInventory.ts`, the baseline JSON files, `components/summary-bar/summaryBar.test.tsx`
- Modify (tests only): both `SummaryStrip.test.tsx`, `HoldingsTable.test.tsx`, `components/MeasureFlip.test.tsx`, `components/XirrCautionChip.test.tsx` (create if absent)

**Interfaces (the contract: fixed here by the orchestrator, built by the worker; Antigravity builds the components to it):**
- Produces (built by Codex):
  ```ts
  // lib/summaryFigure.ts
  export function splitCurrency(text: string): { sign: string; currency: string; digits: string };
  // "+₹1,01,73,830" -> { sign: "+", currency: "₹", digits: "1,01,73,830" }; "-₹3,79,885" -> sign "-"; "₹0" -> sign ""; "—" -> { sign: "", currency: "", digits: "—" }; text without ₹ -> all in digits
  // components/info/InfoGlyph.tsx
  export function InfoGlyph(props: { text: string; testId?: string }): JSX.Element
  // a span role="img" tabIndex={0} aria-label={text} title={text} data-testid={testId}, class INFO_GLYPH_CLASS, content "i"
  // test/summaryTextInventory.ts
  export function textInventory(root: HTMLElement): string[]   // every non-empty text node and every aria-label/title of the root, trimmed, whitespace collapsed, sorted
  ```
- **Fixes the primitives that Tasks 2 to 4 must satisfy** (components built by Antigravity in `components/summary-bar/`):
  ```tsx
  export interface SummaryBarProps { ariaLabel: string; lead: ReactNode; cells: [ReactNode, ReactNode, ReactNode, ReactNode]; footerLeft?: ReactNode; footerRight?: ReactNode; className?: string }
  export function SummaryBar(p: SummaryBarProps): JSX.Element      // data-testid="summary-bar"; lead card then one panel with the four cells and the bottom strip
  export function SummaryLead(p: { label: ReactNode; info?: ReactNode; icon?: ReactNode; figure: ReactNode; trend?: ReactNode; caption?: ReactNode; footer?: ReactNode; testId: string }): JSX.Element
  export function SummaryCell(p: { label: ReactNode; info?: ReactNode; control?: ReactNode; figure: ReactNode; chip?: ReactNode; caption?: ReactNode; testId: string; wash?: "pos" | "neg" }): JSX.Element
  export function SummaryFigure(p: { text: string; tone?: "default" | "pos" | "neg"; testId: string }): JSX.Element   // uses splitCurrency; the span keeps the existing value-* test id
  export function SummarySpark(p: { points: string; trend: "up" | "down" | "flat"; testId?: string }): JSX.Element  // line, soft area, end dot; keeps data-testid="sparkline"
  ```
  Every figure element carries `data-row="figure"`; the baseline tests assert all five carry it in the same parent row index.

- [ ] **Step 1: First, before any component change, capture the baseline:** `textInventory` of today's `PortfolioSummaryStrip` and `MutualFundsSummaryStrip` rendered in each state (default mature, young with chip and disclaimer, loss, empty, Returns face, Current with `one transaction`, loading, trend failed, error) saved as JSON under `__baselines__/` (these must **pass on today's code**: a test `text_inventory_matches_the_baseline` per state and per bar).
- [ ] **Step 2: Write the failing tests** (names fixed): `splitCurrency_*` (the five cases above); `InfoGlyph_renders_the_shared_class_and_the_accessible_name`; `summaryBar.test.tsx`: `every_tile_renders_its_figure_in_the_same_row_position`, `the_lead_card_and_the_panel_are_two_surfaces`, `bottom_strip_holds_the_basis_switch_and_prices_as_on`, `figure_uses_the_smaller_rupee_sign_without_changing_the_text_content`; both strip tests: `basis_switch_sits_in_the_bottom_strip`, `caution_chip_is_beside_the_figure_with_a_status_dot`, `partial_prices_note_is_in_the_lead_card_footer_with_its_icon`, `disclaimer_link_is_the_same_sentence_and_opens_the_same_dialog`, `flip_control_has_an_accessible_name_and_a_text_span_that_can_collapse`, `focus_ring_is_two_pixel_brand_green`, `loading_and_error_states_keep_their_structure`; `MeasureFlip.test.tsx`: `the_flip_button_is_a_ghost_control_with_the_same_words_and_icon`, `reduced_motion_disables_the_turn`; `XirrCautionChip.test.tsx`: `note_variant_shows_a_dot_and_the_same_words`, `pill_variant_is_unchanged_in_words_and_tooltip`; `HoldingsTable.test.tsx`: `table_note_uses_the_shared_caution_component`.
- [ ] **Step 3: Run them; confirm the baseline tests pass and the new tests fail** (`wave-fe-check.sh sb-rt test <files>`).
- [ ] **Step 4: Implement** `splitCurrency`, `InfoGlyph` and `textInventory` only. Codex reports BLOCKED on running; **Claude runs the tests, `tsc -b`, `oxlint`.**
- [ ] **Step 5: Claude verifies against the allowed list and commits** `test(summary-bar): baseline text inventory, foundation helpers and red tests`.

## Task 2: Lane SB1: the primitives and the Portfolio bar (Antigravity)

**Files:** `components/summary-bar/*` (create), `components/MeasureFlip.tsx` + `.module.css`, `components/XirrCautionChip.tsx` (the `variant` prop), `features/portfolio/sections/SummaryStrip.tsx`, `styles/palette-tokens.css` (glow token only). Do not touch `backend/**`, any `*.test.*`, `features/mutual-funds/**`, `frontend/src/mobile/**`, or any copy.

**Interfaces:** Consumes Task 1's contract exactly; produces the primitives that Tasks 3 and 4 use.

Build to the page's mockups: the grid (the lead card and the panel; the panel's four cells split by hairlines; the bottom strip 36px with `Prices as on` left and the switch under the XIRR column); the figure and caption rhythm on an 8px grid; the quiet ghost control; the chip beside the figure; the disclaimer link; every state of the Portfolio bar; the six decorative additions each behind its own small piece of markup or CSS so one can be removed without touching the rest.

- [ ] **Step 1: Antigravity runs the Task 1 tests and shows them red.** **Step 2: Build.** **Step 3: All Portfolio strip tests (old and new), `types`, `lint`, `build` green** (`wave-fe-check.sh ag-sb1 ...`); the text-inventory tests green; report block.
- [ ] **Step 4: Claude screenshots every state at the five widths, light and dark, against the page, and sends exact differences;** commits `feat(summary-bar): shared primitives and the Portfolio bar`.

## Task 3: Lane SB2: the Mutual Funds bar (Antigravity, after Task 2)

**Files:** `features/mutual-funds/overview/SummaryStrip.tsx` only (no new file in that folder). **Interfaces:** the primitives of Task 2.

Compose the same primitives: one lead card and one panel inside the existing wrapper; keep the independent per-tile loading (skeleton or `—`), the two chips in the lead card's footer, the trend of "last N months", `InfoMark` for the info icons, and the synopsis line below the bar.

- [ ] **Steps 1 to 4 as in Task 2** (lane `ag-sb2`; commit `feat(summary-bar): the Mutual Funds bar`).

## Task 4: Lane SB3: the table's note (Antigravity, after Task 2)

**Files:** `features/mutual-funds/overview/HoldingsTable.tsx` only. **Interfaces:** `XirrCautionChip` with `variant="note"`.

Replace the local `CautionChip` (~L53-75; keep `XirrFigure` and the cell structure) with the shared chip in the `note` variant under the XIRR figure; right-align the Returns and XIRR numerals; the words `held under 1 yr` and `one transaction` and their tooltips unchanged; print widths unchanged.

- [ ] **Steps 1 to 4 as in Task 2** (lane `ag-sb3`; commit `feat(summary-bar): the holdings table uses the shared caution note`).

## Task 5: Integration, gates, QA rows (Claude)

- [ ] **Step 1:** integrate the four branches into `batch/sb`; run the full affected sets, `tsc -b`, `oxlint`, `npm run build` and the guards (`features/mutual-funds/guards.test.ts` still exactly 70).
- [ ] **Step 2: Compare the text inventories** (the baseline tests) and a **side-by-side of today's bar and the new bar** at 1,440 px for the nine states: no word or number differs.
- [ ] **Step 3: G2:** a fresh read-only Sonnet reviewer reads the front-end diff against this plan's Review Focus and the no-copy-change rule. **G3** at the patch level.
- [ ] **Step 4: QA rows:** the XIRR rows **XR-01 to XR-12** re-run on both pages, plus widths 1,440, 1,280, 1,100, 1,024 and tablet, dark mode, and the owner's veto list (the six decorative additions and the `Prices as on` move): any vetoed item is removed in a small follow-up commit, nothing else depends on it. `decisions.md`, `session.md`, delegation-log lines.

## Self-review against the page

Item 12 covered: scope (whole bar, every state, nothing shown changes: Global Constraints, Task 1 inventory); QA-13 to QA-15 (Tasks 2, 3); the six decorative additions and the veto (Global Constraints, Task 5); both bars (Tasks 2, 3); the table note (Task 4); tests named on the page (`every_tile_renders_its_figure_in_the_same_row_position`, `every_built_word_in_the_strip_is_unchanged` as the inventory, `basis_switch_...`, `caution_chip_...`, `partial_prices_note_...`, `disclaimer_link_...`, `flip_control_...`, `focus_ring_...`, `reduced_motion_...`, `dark_mode_uses_tokens_not_hex` by the guards, `table_note_uses_the_shared_caution_component`). `print_shows_no_controls` is not needed: the bar is not printed.

## Execution log

*(Claude appends below: drift note, deviations, gate results, deploy record link.)*
