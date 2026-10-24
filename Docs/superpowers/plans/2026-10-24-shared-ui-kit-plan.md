# Shared UI Kit (charts, tokens, formatting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans, through the Claude–Codex method of the `model-orchestration` skill. Steps use checkbox (`- [ ]`) syntax. TDD throughout. **No code starts until the owner says go.**

**Goal:** build the chart components, palette tokens, formatting and click-affordance helpers **once**, before the Home, Individual Fund and Mutual Funds frontends, so no page plan builds or forks them. This removes the "whoever merges first owns it" ambiguity (gap G5).

**Architecture:** the work is the union of three already-specified pieces, built in the order below with the reconciliations stated here: Home frontend plan **T4** (`LineAreaChart` with an optional second series on a right percentage axis), Individual Fund frontend plan **T1** (tokens, `format.ts`, `clickable.ts`) and **T2–T3** (`use-morph`, `LineAreaChart` series API, `GroupedBarChart`, `ScatterChart`). Those tasks are **moved here verbatim** (their tests, interfaces and commit scopes stand); this plan only fixes where files live and how the two `LineAreaChart` specs merge.

**Tech Stack:** React 19, Tailwind 3.4, `d3-shape` (installed), vitest. No new package.

**Spec:** `2026-10-23-home-frontend-plan.md` T4; `2026-10-23-individual-fund-frontend-plan.md` T1–T3 (and its Global Constraints for colours, click affordance and morph rules); palette PDF `Docs/Unifolio Colour Palette.pdf`; `Docs/orchestration/2026-10-23-shell-design-system.md` (the shell's `--shell-*` tokens stay the shell's).

**Branch:** `feat/ui-kit` from `leapswitch-redesign`; PR targets `leapswitch-redesign`. Merges before any page frontend branch that imports it. Runs: 2.

## Global Constraints

- Files live in the neutral locations, not in a feature folder: `frontend/src/components/ui/charts/` for charts, `frontend/src/styles/palette-tokens.css` for the data-viz and semantic palette variables (imported by the app entry stylesheet in one line), `frontend/src/lib/format.ts` and `frontend/src/lib/clickable.ts` for the helpers. `tokens.css` and every `--shell-*` variable are untouched.
- Existing chart files (`pie-chart.tsx`, `bar-chart.tsx`, …) are not modified except to add exports to `index.ts`.
- Numbers: formatting only; no money arithmetic with `number`.
- Light and dark both defined for every variable; the data-viz series are `--c1…--c8` (the names the Mutual Funds mockups use) plus the semantic `--pos`, `--warn`, `--neg` with `-text` and `-bg` variants.
- No chart library is added; `d3-shape` plus plain SVG only.

## Review Focus

1. **Clipped y-axis** when the maximum lies between ticks (the Individual Fund plan's regression test is kept). 
2. **One-point and empty series** render a dot or the frame, never throw.
3. **Reduced motion:** every animation path is immediate; heights are fixed so nothing jumps.
4. **Dark mode contrast:** series colours stay distinguishable from each other and from the card background in both themes.
5. **Rename safety:** the Home plan and Individual Fund plan import from the kit's paths, not their own; a grep test fails if a page folder defines `LineAreaChart`, `useMorph`, `GroupedBarChart` or `ScatterChart` again.

---

### Task 1: Tokens, formatting and click-affordance helpers

**Files:** Create `frontend/src/styles/palette-tokens.css`, `frontend/src/lib/format.ts`, `frontend/src/lib/clickable.ts`; Modify the app entry stylesheet (one `@import`); Test: `frontend/src/lib/format.test.ts`, `clickable.test.ts`, `frontend/src/styles/palette-tokens.test.ts`.

**Interfaces:**
- Produces (exactly as Individual Fund plan T1 specifies them, relocated): `formatRupees`, `formatCompactRupees`, `formatPercent`, `formatDate`, `scoreBand`; `CLICK_CARD`, `CLICK_ROW`, `CLICK_FIGURE`, `DISABLED`. The API and hook parts of that task (`fundPageApi`, `useFundSection`) **stay in the Individual Fund plan**.

- [ ] **Step 1: Failing tests:** the format and `scoreBand` cases listed in Individual Fund plan T1 Step 1; `palette-tokens.test.ts` parses the CSS and asserts `--c1…--c8`, `--pos/--warn/--neg` (+ `-text`, `-bg`) exist in both `:root` and the dark selector, and that no `--shell-*` name is defined.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the signatures; token values from the palette PDF and the Mutual Funds mockups' shared CSS (DM Sans / Manrope fonts are already loaded by the app).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui-kit): palette tokens, formatting and click helpers`.

### Task 2: Morph hook, `LineAreaChart`, `GroupedBarChart`, `ScatterChart`

**Files:** Create `components/ui/charts/use-morph.ts`, `line-area-chart.tsx`, `grouped-bar-chart.tsx`, `scatter-chart.tsx`; Modify `components/ui/charts/index.ts`; Test: matching `*.test.ts(x)`.

**Interfaces:**
- Produces: `resample`, `useMorph`, `niceTicks(lo, hi): number[]` (as Individual Fund plan T2–T3). `LineAreaChart` props are the **union** of the two specs: Individual Fund's `series: {key; name; color; values; area?; visible?}[]`, `labels`, `tooltipLabel?`, `formatValue`, `height?`, `ariaLabel` **plus** Home's optional `secondSeries` on a right percentage axis with `formatPercent`, and a gradient fill under the first series. `GroupedBarChart` and `ScatterChart` as in Individual Fund plan T3.

- [ ] **Step 1: Failing tests:** every test named in Individual Fund plan T2 and T3 Step 1, plus Home T4's: `test_second_series_uses_right_axis`, `test_gradient_fill_under_first_series`, `test_pointer_crosshair_tooltip_content`, and a repo guard `test_no_duplicate_chart_definitions` (greps `frontend/src/features` for the four component names).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** If a Home or Individual Fund branch already contains its own version, this task deletes it in the same PR and repoints the imports.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui-kit): morph hook and line, bar and scatter charts`.

## Self-review record

- **Coverage:** Home T4, Individual Fund T1 (tokens/format/click), T2, T3 all land here; Mutual Funds frontend plan T2 uses `components/ui/charts` pie primitives that already exist and adds its own small `BarList` and `SlicedDonut` in `features/mutual-funds/common/` (page-specific compositions, not kit chart primitives).
- **Proposed edits to the two existing plans (owner approval required, shown as a diff in Wave 0):** Home frontend T4 and Individual Fund frontend T1–T3 are replaced by "imports from the kit (merged)"; their branch lists lose those files.
