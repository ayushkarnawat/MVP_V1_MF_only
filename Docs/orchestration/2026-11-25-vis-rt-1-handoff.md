# Handoff: vis-rt-1 (the visual pass; Task 1: shared constants and every red test, Codex, FE-1a)
**Status:** READY TO RELAY (written 2026-11-25). **Approved:** the owner approved the plans on 25 Nov 2026 (all 30 design questions answered; "start" given).
**Parent plan:** `Docs/superpowers/plans/2026-11-25-visual-pass-plan.md` (Task 1; read "Global Constraints" and "Review Focus"), master plan `Docs/superpowers/plans/2026-11-25-qa-patches-master-plan.md`. **Spec (the design):** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16, items 3 to 9 and the D-9 part of item 10; decisions QA-1 B, QA-3 A, QA-5 A, QA-7 A, QA-8 A, QA-9 A). If the spec, the plan and the code disagree, stop and say so.
**Worker:** Codex, front-end foundation only: three tiny constants files and **every red test of the visual pass**. It does **not** build any component change (four Antigravity lanes do that next, from packets). **It cannot run WSL: write the tests, report BLOCKED on running; Claude runs them through `wave-fe-check.sh`.** **Reviewer and committer:** Claude.
**Work in:** `C:\Users\Dell\lanes\unifolio-vis-rt` (worktree, branch `batch/vis-rt`). Never in the main checkout.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## What and why (owner decisions, 25 Nov 2026)
Seven look-and-wording findings are fixed in one pass: **D-1** white text on every green button (on the bright green as it is; known and accepted 2.3 to 1 contrast: do **not** write a contrast test); **D-3** the search box never opens as an empty strip; **D-4** the "Switches to X" badge is not drawn twice; **D-5** the benchmark control says "Choose up to 3" from the start; **D-6** "View all by day's change" looks clickable; **D-7** one shared, larger "i"; **D-8** onboarding icons in the news-list tile style, brand green, no repeats, no emojis; **D-9** "Keep working" becomes "Run in background". This task writes the shared values and the red tests, so the four UI lanes know exactly what to make green.

## Wave-start check (report drift, do not fix drift)
Verified by Claude on 25 Nov at `f5f5476e`; report any difference you see: `styles/auth-tokens.css` `.auth-btn` colour `#111111` (L216; the active rule at L229 is already `#FFFFFF`); `features/export/export-tokens.css` `--export-btn-ink: #111111` at L22, L50, L75; `features/import/checklist/checklist-tokens.css` `--ccp-btn-ink: #111111` at L24, L55, L86 and `--ccw-btn-ink: #111111` at L113; `features/auth/onboarding.module.css` L376 and `features/dashboard/XirrDisclaimerModal.module.css` L71 `color: #000000`; `components/wealth-graph/BenchmarkChecklist.tsx` `showLimitMessage` (L31, message rendered at ~L191); `features/home/sections/Movers.tsx` "View all by day's change" button at ~L383 and its "Coming soon" twin at ~L392; `features/auth/redesign/IconBadge.tsx` a `rounded-full` mint circle with the glyph at 46%; `features/export/ExportDialog.tsx` "Keep working" at ~L588; there is **no** `features/auth/Q2Investing.test.tsx` today.

## The contract (fixed here; do not rename or reshape)
```ts
// frontend/src/components/info/infoGlyph.ts (new)
export const INFO_GLYPH_CLASS =
  "inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--ui-text-muted)] text-xs font-semibold text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-text)] hover:text-[var(--ui-elevated)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]";

// frontend/src/components/search/searchCopy.ts (new)
export const EMPTY_SEARCH_HINT = "Try a fund, a member or a page";

// frontend/src/features/auth/onboardingIcons.ts (new)
import type { LucideIcon } from "lucide-react";
import type { InvestorType, PrimaryGoal } from "./types";
export const INVESTOR_TYPE_ICONS: Record<InvestorType, LucideIcon>; // beginner: Sprout, self_directed: Compass, advisor_assisted: Users, mixed: Briefcase
export const GOAL_TILE_ICONS: Record<PrimaryGoal, LucideIcon>;      // wealth_creation: TrendingUp, retirement: Umbrella, childrens_education: GraduationCap, buy_home: Home, financial_freedom: Sun, tax_planning: FileText
```
**Test ids the UI lanes must satisfy (fixed here):** search hint `data-testid="search-empty-hint"` (a plain element, **not** `role="option"`); benchmark hint `data-testid="benchmark-limit-hint"` (**one** element, the `aria-describedby` target of the options group; the same element takes the warning styling when a fourth tick is attempted); the onboarding tile keeps `data-testid="icon-badge"`.
**Exact strings in the new tests:** `Try a fund, a member or a page`, `Choose up to 3`, `Run in background`. No other copy changes.

## Tests first (written and run before the constants; red for the stated reason)
**New `frontend/src/styles/greenButtonText.guard.test.ts`** (follow the pattern of `features/export/export.guard.test.ts`: read the files as raw text through `import.meta.glob` with `?raw`, no filesystem calls): `auth_button_text_is_white_in_default_and_hover` (`.auth-btn` colour `#FFFFFF`, and no `#111111` label colour in its default or hover rule), `export_button_ink_is_white_in_all_three_theme_blocks` (all three `--export-btn-ink` values `#FFFFFF`), `checklist_button_ink_is_white_in_window_and_panel` (`--ccw-btn-ink` and the three `--ccp-btn-ink` values `#FFFFFF`), `onboarding_and_disclaimer_buttons_are_white` (`.continueBtn` and `.gotIt` colour `#FFFFFF`), `no_green_filled_button_file_sets_a_dark_label`.
**`features/auth/redesign/authGreen.test.ts`:** rewrite "the primary button: dark text on the green, palette hover, pressed and disabled states, a visible focus ring" so the default and hover text are white (pressed white, disabled grey as today); in "text stays readable: ..." and "the pressed button label and the marks on green meet the contrast minimums" **remove only the assertions about the button label's contrast** (keep the deep-green-on-white and the mark assertions; the marks on green stay dark). Do not add any contrast-ratio assertion for the button label.
**`components/info/InfoPopover.test.tsx`:** add `default_trigger_and_infomark_share_the_info_glyph_class` (render the default trigger and `InfoMark` from `features/mutual-funds/common/SectionCard.tsx`: both class names contain `INFO_GLYPH_CLASS`). Keep the hover, pin, Escape tests unchanged.
**`components/search/PageSearch.test.tsx`:** add `shows_a_hint_when_the_box_is_empty_and_there_are_no_recents`, `hides_the_hint_once_recents_exist`, `hides_the_hint_when_typing`, `hint_is_not_an_option` (the option count stays 0), `does_not_repeat_the_tag_as_the_hover_hint_on_a_member_row`, `does_not_repeat_the_tag_on_a_fund_row_with_switchTo`, `still_shows_filter_go_and_coming_soon_hints`. **Update** the `it.each` "hints: hovered $0.id shows %s" (~L351-359) and the keyboard test whose assertion at ~L380 expects `row-hint-${fundRow.id}` "Switches to Bela": the hint is now **absent** when it equals the tag, so assert the tag shows it and the hint element is absent. Leave `buildResults.test.ts` alone (the tags do not change).
**`components/wealth-graph/BenchmarkChecklist.test.tsx`:** rewrite the test at ~L18 ('allows at most MAX_BENCHMARKS and a fourth shows "Choose up to 3"', which asserts the text is absent before the limit) into `shows_choose_up_to_3_as_soon_as_the_panel_opens`, `the_same_hint_turns_to_the_warning_when_a_fourth_is_ticked` (same element, warning class) and `the_hint_is_linked_with_aria_describedby`; keep the other tests there unchanged (a fourth box still cannot be ticked, the last checked cannot be unchecked, and so on).
**`features/home/sections/Movers.test.tsx`:** add `view_all_link_is_underlined_at_rest` (the live button's class includes `underline`), `view_all_link_keeps_its_accessible_name`, `disabled_variant_stays_non_interactive`.
**`features/auth/redesign/InvestorProfile.test.tsx`:** add `every_investor_type_and_goal_has_its_own_icon` (the ten icons in the two maps are distinct), `icon_tile_is_aria_hidden_and_uses_the_brand_green_token` (the `icon-badge` element is `aria-hidden` and its class includes `text-[var(--pos)]`), `no_emoji_characters_in_any_onboarding_screen_file` (a raw-import scan, regex over the emoji ranges, of `InvestorProfile.tsx`, `IconBadge.tsx`, `ChipCheckbox.tsx`, `Q2Investing.tsx`, `Q3Purpose.tsx`, `MobileOnboardingScreen.tsx`, `onboardingIcons.ts`). Keep the three existing icon-badge tests (L128, L141, L211) as they are.
**New `features/auth/Q2Investing.test.tsx`** (none exists; read the component for its props): `renders_each_option_with_a_lucide_icon_in_the_tile_and_no_hex` (each option shows an svg from the lucide set inside an element with the `icon-badge`-style tile classes, and the file text contains no hex colour), `selecting_an_option_still_calls_the_select_callback`.
**`features/export/ExportDialog.stages.test.tsx` and `ExportHost.test.tsx`:** in the tests that click "Keep working" (`ExportDialog.stages.test.tsx:70` and `:75`, `ExportHost.test.tsx` L25 and L39) change the button name to `Run in background`; add `shows_run_in_background_and_not_keep_working` and `the_button_still_hides_the_dialog_and_the_job_continues`. The callback prop name `onKeepWorking` does **not** change.
For every existing test you change, list what it pinned and what you changed.

## Run these only (Claude runs them; you report BLOCKED on running)
Through `wave-fe-check.sh` lane `vis-rt` (`wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash <script> vis-rt test <paths under src/>`): the files above plus `components/ui/button.test.tsx` and `features/mutual-funds/guards.test.ts`. Baseline before any change (Claude, 25 Nov, lane `vis`): 11 files, **145 tests passed**. Expected after your work: the new and rewritten tests **fail for the stated reasons**, everything else still passes; `features/mutual-funds/guards.test.ts` keeps asserting exactly **70** files (you add **no** file under `features/mutual-funds`).

## Files you may touch
Create: `frontend/src/components/info/infoGlyph.ts`, `frontend/src/components/search/searchCopy.ts`, `frontend/src/features/auth/onboardingIcons.ts`, `frontend/src/styles/greenButtonText.guard.test.ts`, `frontend/src/features/auth/Q2Investing.test.tsx`. Modify (tests only): `components/info/InfoPopover.test.tsx`, `components/search/PageSearch.test.tsx`, `components/wealth-graph/BenchmarkChecklist.test.tsx`, `features/home/sections/Movers.test.tsx`, `features/auth/redesign/InvestorProfile.test.tsx`, `features/auth/redesign/authGreen.test.ts`, `features/export/ExportDialog.stages.test.tsx`, `features/export/ExportHost.test.tsx`.
**Do not touch:** `backend/**`, `frontend/src/mobile/**`, any component or CSS file (the UI lanes do), any `buildResults.*` test, `features/mutual-funds/**`.

## Constraints
No new dependency; no `package.json` change; no hex colours outside token CSS files; no `parseFloat`, `toFixed`, `Intl.`, `console.`, `any`; every `<button` in a test render needs nothing new; **no emojis anywhere, including test titles**; invented data only; git read-only; no deletion flags or recursive deletes. Tests first; red test files are fixed once written.

## Report format
One fenced block `CODEX REPORT: vis-rt-1`: status (DONE, PARTIAL or BLOCKED); baseline HEAD; drift; which tests you expect to be red and why (you cannot run them); the existing tests you changed and what you changed in each; files created or changed with a one-line reason each; commands you tried and their exact errors; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Front-end foundation worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-25-vis-rt-1-handoff.md (your task: vis-rt-1, owner-approved)
Open Docs/superpowers/plans/2026-11-25-visual-pass-plan.md (Task 1) for the context. Work only in C:\Users\Dell\lanes\unifolio-vis-rt on branch batch/vis-rt. Git is read-only. No deletion flags or recursive deletes. You write three small constants files and the red tests; you do not change any component or CSS. You cannot run WSL: write the tests carefully, and reply BLOCKED on running them (Claude runs them). Change only the files the handoff lists.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
