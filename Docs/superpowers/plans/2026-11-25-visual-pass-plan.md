# The visual pass (D-1, D-3, D-4, D-5, D-6, D-7, D-8, D-9): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Read `Docs/orchestration/wave-common-rules.md` and the master plan `Docs/superpowers/plans/2026-11-25-qa-patches-master-plan.md` first; they win where they differ. Strategy as in M1 to M4 and the XIRR batch: **Claude orchestrates, Codex writes the shared constants and every red test, Antigravity builds the UI from very detailed packets.** Front end only; no back end change.

**Goal:** Fix the seven look-and-wording findings of the QA round in one pass: white text on every green button; the search box never opens as an empty strip and never shows the "Switches to" badge twice; the benchmark control says "Choose up to 3" from the start; "View all by day's change" looks clickable; the small "i" is easy to see; onboarding icons use the news-list tile style in brand green; the export button reads "Run in background".

**Architecture:** Four lanes on disjoint files, each a small change to existing components, plus one shared-constants-and-red-tests task up front. Shared values live in three tiny files so the places that must agree cannot drift: the info glyph class, the empty-search hint, the onboarding icon maps.

**Tech Stack:** React, TypeScript, Vitest, Tailwind tokens, lucide-react, CSS modules and token CSS.

**Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16), items 3 to 9 and 10 (D-9 only), decisions **QA-1 B, QA-3 A, QA-5 A, QA-7 A, QA-8 A, QA-9 A**. The page's mockups win over this plan's prose; where the page and the live code disagree, stop and ask the owner. Item 12 (the summary bar) is Plan 4 and waits for this plan's lane V1.

## Global Constraints

- **D-1 (owner, QA-1 B):** every green-filled **button** has **white** text, on the bright green `#22C55E` as it is. The fill, hover (`#16A34A`) and pressed (`#15803D`) greens do not change; the disabled button keeps today's look per screen; check marks and other non-button marks on green keep today's colour. White on `#22C55E` is 2.3 to 1, below the 4.5 to 1 target for button text: **known and accepted by the owner** (recorded in `decisions.md`); do not add a contrast test that would fail by design, and do not "fix" it.
- **Copy never changes** except these strings, exact: `Try a fund, a member or a page` (D-3), `Choose up to 3` (D-5, always visible; `Choose up to ${max}` in code), `Run in background` (D-9, replaces `Keep working`).
- **D-8 (owner, QA-8 A):** news-list style tiles (a soft grey rounded square, a 20px line icon), the icon in brand green `#22C55E` (through the token `--pos`, not hex), on sign-up screen 4 and the phone and older onboarding screens, **no repeated icons**: `self_directed` uses `Compass`, `wealth_creation` uses `TrendingUp`; **no emojis anywhere** (owner rule, 25 Nov).
- **D-7 (QA-7 A):** one shared style for every "i" (about 20px, 12px letter, a darker border, a clear filled hover, the 2px brand-green focus ring); the hide-values eye is a different icon and is not touched.
- Front-end guards: every `<button` has `data-clickable` and a `data-effect`; no hex or `rgb(` outside token CSS files; no `parseFloat`, `toFixed`, `Intl.`, `console.`, `any`; features may not import other features; `components/` may not import `features/*`; `features/mutual-funds/guards.test.ts` asserts exactly **70** files in that folder: **this plan adds no file there**. Phone UI (`frontend/src/mobile/**`) unchanged. No GA4 events. Invented data only.
- Tests first, always; run only the affected tests; red test files are fixed once written. Codex cannot run WSL (it writes the tests, reports BLOCKED on running); Claude runs them through `wave-fe-check.sh`.

## Review Focus

1. **Sign-up screen 4 still fits in one viewport** at the five sizes of row M1-02 after the badge becomes a square tile with a 20px glyph (the badge size tokens `--auth-badge-size` 44, 38 and 34px are kept). [Task 5]
2. **Hover, pressed and disabled auth buttons:** hover keeps white text, pressed stays white on `#15803D`, disabled keeps its grey label. [Task 2]
3. **The larger "i" in dense rows** (valuation card, date strip, summary strips): no row grows, no label wraps, hover and focus rings still show. [Task 2]
4. **Search empty state:** the hint appears only when the panel is open, nothing is typed and there are no recents; it disappears the moment any recent exists or a character is typed; it is not an option (the result count stays 0). [Task 3]
5. **The benchmark hint** appears exactly once (one element, so a screen reader hears it once); at the limit the same element turns to the warning colour. [Task 4]
6. **The older onboarding screen `Q2Investing`** (no test file today) and `Q3Purpose` keep working with the new tile; no hex remains in either file. [Task 5]
7. **An emoji slipping in:** a scan test fails on any emoji character in the onboarding screen files. [Task 1]

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/components/info/infoGlyph.ts` (new) | `INFO_GLYPH_CLASS`, the one class string for every "i" |
| `frontend/src/components/search/searchCopy.ts` (new) | `EMPTY_SEARCH_HINT` |
| `frontend/src/features/auth/onboardingIcons.ts` (new) | `INVESTOR_TYPE_ICONS`, `GOAL_TILE_ICONS` (distinct lucide icons) |
| `frontend/src/styles/greenButtonText.guard.test.ts` (new) | Pins white text on the green buttons in the listed token files |
| Lane V1 (greens, "i", export label) | `styles/auth-tokens.css`, `features/export/export-tokens.css`, `features/export/ExportDialog.tsx` (label only), `features/import/checklist/checklist-tokens.css` (two ink values only), `features/auth/onboarding.module.css`, `features/dashboard/XirrDisclaimerModal.module.css`, `components/info/InfoPopover.tsx`, `features/mutual-funds/common/SectionCard.tsx` (`InfoMark`), `components/BenchmarkInfoNote.tsx`, `Docs/orchestration/2026-11-18-palette-reference-for-workers.md` |
| Lane V2 (search) | `components/search/PageSearch.tsx` |
| Lane V3 (Home) | `components/wealth-graph/BenchmarkChecklist.tsx`, `features/home/sections/Movers.tsx` |
| Lane V4 (onboarding icons) | `features/auth/redesign/IconBadge.tsx`, `InvestorProfile.tsx`, `ChipCheckbox.tsx`, `features/auth/Q2Investing.tsx`, `Q3Purpose.tsx` |

## Lanes, branches and folders (confirm each path when a packet is written)

Integration branch `batch/vis` cut from `patch/qa1`. Every prompt carries, above its code block: **worker, project folder to open, branch, new or reuse** (owner rule, 23 Nov). Capacity: two Codex tasks and four Antigravity lanes at once; here one Codex task and four Antigravity lanes.

| Lane | Task | Worker | Folder | Branch |
|---|---|---|---|---|
| RT | 1 | Codex | `C:\Users\Dell\lanes\unifolio-vis-rt` (new worktree) | `batch/vis-rt` |
| V1 | 2 | Antigravity | `C:\Users\Dell\ag-vis1` (new clone) | `ag/vis1-greens` |
| V2 | 3 | Antigravity | `C:\Users\Dell\ag-vis2` (new clone) | `ag/vis2-search` |
| V3 | 4 | Antigravity | `C:\Users\Dell\ag-vis3` (new clone) | `ag/vis3-home` |
| V4 | 5 | Antigravity | `C:\Users\Dell\ag-vis4` (new clone) | `ag/vis4-icons` |
| Claude | 0, 6 | Claude | `C:\Users\Dell\lanes\unifolio-vis` (integration; check lane `vis`) | `batch/vis` |
**Order:** Task 0, then Task 1 (Codex); when Task 1 is verified and committed, Tasks 2 to 5 run **in parallel** (disjoint files); V1 merges first (master plan: Plan 4 waits for it), then V2 to V4, then Task 6.

## Handoff and packet rules

As in the master plan. Each packet (Tasks 2 to 5) is **very detailed**: the owner's decisions and the page mockup it implements; every string; exact DOM, `data-testid`s and classes; a states table (default, hover, focus, pressed, disabled, dark, reduced motion); tokens; accessibility; the red tests; commands; allowed and forbidden files. Claude screenshots each result next to the page's mockup (1280x600, 1440x810, 1536x730, light and dark; sign-up screen 4 also at the five sizes of row M1-02) and sends exact differences back.

## Task 0: Wave-start check and lane setup (Claude)

- [ ] **Step 1:** cut `batch/vis` from `patch/qa1`; create the five worker folders; add the `vis` and `vis-rt` case lines to `wave-fe-check.sh`.
- [ ] **Step 2: Confirm the code this plan names still looks as described:** `.auth-btn` colour `#111111` (`auth-tokens.css` ~L215, hover ~L223 unchanged, active white ~L227-231, disabled ~L233); `--export-btn-ink: #111111` at `export-tokens.css` ~L22, L50, L75 and used at `ExportDialog.tsx` ~L500 and ~L663; `--ccw-btn-ink` (~L113) and `--ccp-btn-ink` (~L24, L55, L86) `#111111`; `.continueBtn` colour `#000000` (`onboarding.module.css` ~L375-376); `.gotIt` colour `#000000` (`XirrDisclaimerModal.module.css` ~L71); the shared button and `Button.module.css` are already white; `InfoPopover`'s default trigger and `InfoMark` use the same `h-4 w-4 ... text-[10px]` classes; `PageSearch.tsx` tag (~L458-462) and hint (~L463-470, `showHint` ~L422); `BenchmarkChecklist.tsx` `showLimitMessage` (~L30); `Movers.tsx` footer button (~L376-387); `IconBadge` rounds a `--auth-badge` circle with the glyph at 46%; `ExportDialog.tsx` "Keep working" (~L581-589).
- [ ] **Step 3: Record the baseline:** run the tests named in Task 1 and `features/auth/redesign/authGreen.test.ts`, `markOnGreen.test.tsx`, `InvestorProfile.test.tsx`, `components/ui/button.test.tsx`; note which pass. Confirm the 70-file count of `features/mutual-funds/guards.test.ts` (it must not change).

## Task 1: Shared constants and every red test (Codex, lane RT; FE-1a)

**Files:**
- Create: `components/info/infoGlyph.ts`, `components/search/searchCopy.ts`, `features/auth/onboardingIcons.ts`, `styles/greenButtonText.guard.test.ts`, `features/auth/Q2Investing.test.tsx`
- Modify (tests only): `components/info/InfoPopover.test.tsx`, `components/search/PageSearch.test.tsx`, `components/wealth-graph/BenchmarkChecklist.test.tsx`, `features/home/sections/Movers.test.tsx`, `features/auth/redesign/InvestorProfile.test.tsx`, `features/auth/redesign/authGreen.test.ts`, `features/export/ExportDialog.stages.test.tsx`, `features/export/ExportHost.test.tsx`

**Interfaces (the contract: fixed here by the orchestrator, built by the worker):**
- Produces:
  ```ts
  // components/info/infoGlyph.ts
  export const INFO_GLYPH_CLASS =
    "inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--ui-text-muted)] text-xs font-semibold text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-text)] hover:text-[var(--ui-elevated)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]";
  // components/search/searchCopy.ts
  export const EMPTY_SEARCH_HINT = "Try a fund, a member or a page";
  // features/auth/onboardingIcons.ts
  import type { LucideIcon } from "lucide-react";
  import type { InvestorType, PrimaryGoal } from "./types";
  export const INVESTOR_TYPE_ICONS: Record<InvestorType, LucideIcon>;  // Sprout, Compass, Users, Briefcase
  export const GOAL_TILE_ICONS: Record<PrimaryGoal, LucideIcon>;       // TrendingUp, Umbrella, GraduationCap, Home, Sun, FileText
  ```
- **Test ids the lanes must satisfy** (fixed here): search hint `data-testid="search-empty-hint"` (not `role="option"`); benchmark hint `data-testid="benchmark-limit-hint"` (one element, `aria-describedby` target of the group); onboarding tile keeps `data-testid="icon-badge"`.

- [ ] **Step 1: Write the failing tests** (names fixed). `greenButtonText.guard.test.ts` (pattern of `features/export/export.guard.test.ts`, reading the files as raw text): `auth_button_text_is_white_in_default_and_hover`, `export_button_ink_is_white_in_all_three_theme_blocks`, `checklist_button_ink_is_white_in_window_and_panel`, `onboarding_and_disclaimer_buttons_are_white`, `no_green_filled_button_file_sets_a_dark_label` (scans the four CSS files and the two `.tsx` users for `#111111` or `#000000` on a button label rule). `authGreen.test.ts`: rewrite "the primary button: dark text on the green, ..." to white and **remove** the label-contrast assertions of "text stays readable ..." and "the pressed button label and the marks on green meet the contrast minimums" for the button label only (keep the deep-green-on-white and mark assertions). `InfoPopover.test.tsx`: `default_trigger_and_infomark_share_the_info_glyph_class` (both `className` contain `INFO_GLYPH_CLASS`), keep the hover, pin, Escape tests. `PageSearch.test.tsx`: `shows_a_hint_when_the_box_is_empty_and_there_are_no_recents`, `hides_the_hint_once_recents_exist`, `hides_the_hint_when_typing`, `hint_is_not_an_option` (option count stays 0), `does_not_repeat_the_tag_as_the_hover_hint_on_a_member_row`, `does_not_repeat_the_tag_on_a_fund_row_with_switchTo`, `still_shows_filter_go_and_coming_soon_hints`; **update** the it.each "hints: hovered $0.id shows %s" (L351-359) and the keyboard test assertion at L380 (`row-hint-${fundRow.id}` "Switches to Bela": the hint is now absent and the tag shows it). `BenchmarkChecklist.test.tsx`: rewrite 'allows at most MAX_BENCHMARKS and a fourth shows "Choose up to 3"' (L18, the "not shown yet" line at ~L33) as `shows_choose_up_to_3_as_soon_as_the_panel_opens` and `the_same_hint_turns_to_the_warning_when_a_fourth_is_ticked` and `the_hint_is_linked_with_aria_describedby`. `Movers.test.tsx`: `view_all_link_is_underlined_at_rest`, `view_all_link_keeps_its_accessible_name`, `disabled_variant_stays_non_interactive`. `InvestorProfile.test.tsx`: `every_investor_type_and_goal_has_its_own_icon` (the 10 icons are distinct), `icon_tile_is_aria_hidden_and_uses_the_brand_green_token`, `no_emoji_characters_in_any_onboarding_screen_file` (raw-import scan of `InvestorProfile.tsx`, `IconBadge.tsx`, `ChipCheckbox.tsx`, `Q2Investing.tsx`, `Q3Purpose.tsx`, `MobileOnboardingScreen.tsx`, `onboardingIcons.ts`). `Q2Investing.test.tsx` (new): `renders_each_option_with_a_lucide_icon_in_the_tile_and_no_hex`, `selecting_an_option_still_calls_onSelect`. `ExportDialog.stages.test.tsx` and `ExportHost.test.tsx`: rename the "Keep working" label to `Run in background` in the three tests that click it, and add `shows_run_in_background_and_not_keep_working` and `the_button_still_hides_the_dialog_and_the_job_continues`.
- [ ] **Step 2: Run them; confirm they fail** (`wave-fe-check.sh vis-rt test <files>`).
- [ ] **Step 3: Implement the three constants files** to the contract (nothing else). Codex reports BLOCKED on running; **Claude runs the tests, `npx tsc -b`, `npx oxlint`**.
- [ ] **Step 4: Claude verifies against the allowed list and commits** `test(visual): shared constants and red tests for the visual pass`.

## Task 2: Lane V1: greens, the "i", the export label (Antigravity)

**Files:** the V1 row of the File Structure. Do not touch `backend/**`, `frontend/src/mobile/**`, any `*.test.*`, other features, or any copy except `Run in background`.

**Interfaces:** Consumes `INFO_GLYPH_CLASS`.

The packet covers: (a) the exact edit per file: `.auth-btn` colour `#FFFFFF` (default and hover; the pressed rule is already white); `--export-btn-ink`, `--ccw-btn-ink`, `--ccp-btn-ink` to `#FFFFFF` in every block they appear; `.continueBtn` and `.gotIt` colours `#FFFFFF`; (b) `InfoPopover`'s default trigger and `InfoMark`'s span use `INFO_GLYPH_CLASS` (keep their roles, `tabIndex`, `aria-label`, `title`, `data-testid`, `data-tooltip`, `data-clickable`); `BenchmarkInfoNote.tsx`'s "i" button uses it too; (c) the export dialog button label; (d) the palette reference file: the line "Text on a green button is dark: `#111111`" becomes "Text on a green button is white (owner decision, 25 Nov 2026; known 2.3 to 1 contrast on the bright green)"; (e) the states table and the 1280x600, 1440x810, 1536x730 light and dark screenshots Claude will compare.

- [ ] **Step 1: Antigravity runs Task 1's V1 tests and shows them red.** **Step 2: Build the edits.** **Step 3: Tests, `types`, `lint`, `build` green** (`wave-fe-check.sh ag-vis1 ...`); report block.
- [ ] **Step 4: Claude screenshots** sign-up, log-in, onboarding, the export dialog, the checklist window, the XIRR disclaimer dialog and a page with several "i" marks (valuation card, date strip) against the page's mockups; sends exact differences; commits `feat(visual): white text on every green button, one shared "i", Run in background`.

## Task 3: Lane V2: the search box (Antigravity)

**Files:** `components/search/PageSearch.tsx` only. **Interfaces:** Consumes `EMPTY_SEARCH_HINT` and the test id `search-empty-hint`.

Edits: (D-3) inside the existing drop-down shell render a muted line with the hint **only** when `!hasDraft && groups.length === 0 && recents.searches.length === 0` (not `role="option"`, not counted by the live region, the existing "0 results" announcement stays); (D-4) render the hover hint (`row-hint-${row.id}`) only when `showHint && getRowHint(row) !== row.tag`. The tags built in `buildResults.ts` and every `getRowHint` return value stay exactly as they are.

- [ ] **Steps 1 to 4 as in Task 2** (lane `ag-vis2`; Claude screenshots the first-open state, a member result on hover with both tag and hint, and commits `feat(visual): search hint and no doubled badge`).

## Task 4: Lane V3: the Home graph control and the link (Antigravity)

**Files:** `components/wealth-graph/BenchmarkChecklist.tsx`, `features/home/sections/Movers.tsx`. **Interfaces:** Consumes the test id `benchmark-limit-hint`.

Edits: (D-5) one always-rendered element `Choose up to ${max}` in muted text at the top of the panel, `id`-linked from the group's `aria-describedby`; when `showLimitMessage` is true the **same element** takes the warning styling (today's warning classes); remove the separate conditional message. (D-6) the live "View all by day's change" button gains `underline underline-offset-2` at rest; colour, weight, arrow and `Coming soon` twin unchanged.

- [ ] **Steps 1 to 4 as in Task 2** (lane `ag-vis3`; screenshots of Home with the control open at 0, 2 and 3 ticks, and the movers footer; commit `feat(visual): choose-up-to-3 hint and an underlined view-all link`).

## Task 5: Lane V4: onboarding icons in the news-list style (Antigravity)

**Files:** the V4 row of the File Structure. **Interfaces:** Consumes `INVESTOR_TYPE_ICONS`, `GOAL_TILE_ICONS`.

Edits: `IconBadge.tsx` becomes the tile: keeps its props (`tone` accepted, ignored visually) and `data-testid="icon-badge"`, keeps the size tokens (`--auth-badge-size`), swaps the circle for `rounded-[10px]`, the background for `bg-[var(--ui-card)]`, the colour for `text-[var(--pos)]`, the glyph to 50% at the library's default stroke, `aria-hidden`; `InvestorProfile.tsx` and the older flows import the two maps (deleting their local icon objects and the duplicate `BarChart3`); `ChipCheckbox.tsx` shows the goal icon in the same tile (**the packet tells Antigravity to try a 40px tile first and to fall back to 32px if the chips no longer fit one viewport at the five sizes of row M1-02, and to say which in its report**); `Q2Investing.tsx` replaces its four inline 48x48 drawings and the hard-coded `bg-[#22C55E]/10` with the same tile and `INVESTOR_TYPE_ICONS`; `Q3Purpose.tsx` keeps its own six lucide icons, drawn in the tile with the brand-green token. Wording unchanged; `MobileOnboardingScreen.tsx` has no option icons and is untouched.

- [ ] **Steps 1 to 3 as in Task 2** (lane `ag-vis4`).
- [ ] **Step 4: Claude screenshots sign-up screen 4 at the five sizes of row M1-02 (no scrolling in either state, both notices and Continue visible), the older Q2 and Q3 screens, light and dark, next to the page's mockup (tiles, green icons),** sends exact differences; commits `feat(visual): onboarding icons in the news-list tile style`.

## Task 6: Integration, gates, QA rows (Claude)

- [ ] **Step 1: Integrate** the four lane branches and `batch/vis-rt` into `batch/vis` (V1 first); run the full affected sets, `npx tsc -b`, `npx oxlint`, `npm run build`, and the guard tests (`features/mutual-funds/guards.test.ts` still 70).
- [ ] **Step 2: G2:** a fresh read-only Sonnet reviewer reads the front-end diff against this plan's Review Focus and the no-copy-change rule (only the three named strings changed). **G3** at the patch level (master plan).
- [ ] **Step 3: QA rows** in the combined checklist: **rewrite M1-12 and M2-10** to "white text on the green button"; re-run M1-02 (five sizes), M2-15, M2-21, M3-2, M3-12 (light and dark), M4-3; add a row for the "i" in dense rows. `decisions.md` as-built note; `session.md`; delegation-log lines.

## Self-review against the page

D-1 (Task 2, guard test, palette file), D-3 and D-4 (Task 3), D-5 and D-6 (Task 4), D-7 (Task 2), D-8 (Task 5), D-9 (Tasks 1 and 2). Tests named on the page are all present; the page's wording rule is held by the three named strings; the mobile-only exclusion holds. Item 12's use of the shared glyph is Plan 4.

## Execution log

*(Claude appends below: drift note, deviations, gate results, deploy record link.)*
