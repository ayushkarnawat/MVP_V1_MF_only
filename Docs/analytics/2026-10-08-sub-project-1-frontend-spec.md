# Sub-project 1 — Analytics Attributes Frontend Spec (consolidated)

**Date:** 2026-10-08
**Scope:** Frontend design for the 4 attributes with a real frontend surface out of
Sub-project 1's 5: **04** (Fund Manager Allocation), **09** (Mutual Fund Ranking), **11**
(Drawdown / Scenario Simulator), **14** (Investment & Withdrawal Analysis). Attribute 12
(TRI benchmark) has zero frontend surface — confirmed by grep of the backend planning doc,
see `2026-10-07-sub-project-1-planning.md` — and is excluded from this pass entirely.

This document is the umbrella spec. Each attribute also has its own deeper spec + HTML
artifact (linked in §6) covering schema, API contracts, component breakdown, and states in
full detail — this document covers what's shared across all four and how they fit into the
app as a whole.

**Companion artifact:** `artifacts/2026-10-08-sub-project-1-frontend-visual-map.html` — a
single navigable document embedding all 4 approved mockups at real scale, in the app's
actual design tokens.

**Backend source of truth:** `2026-10-07-sub-project-1-planning.md`. This spec does not
restate backend schema/architecture except where it directly shapes a frontend decision
(e.g., which fields a component must render, which states an API response can be in).

---

## 1. Navigation architecture

Three placement decisions were made explicitly during brainstorming, not inferred:

| Attribute | Placement | Rationale |
|---|---|---|
| 04 — Fund Manager Allocation | New stacked section in the existing Analytics dashboard | Ayush: "standalone new analytics section aggregated across the whole portfolio" |
| 09 — Mutual Fund Ranking | New stacked section in the existing Analytics dashboard | Same pattern as 04; sibling to `CategoryRankingSection`/`TerSection` |
| 11 — Drawdown Scenario Simulator | **New top-level nav tab/route** (`Holdings` / `Analytics` / **`Scenarios`** / `Profile`), independent of the Analytics dashboard | Ayush's explicit choice (Option B) — the scope and interactivity (picker + multi-shape results) doesn't fit as one more stacked card |
| 14 — Investment & Withdrawal Analysis | New stacked section in the existing Analytics dashboard | Ayush's explicit correction: "I don't see it having its own page... but I can add that as a section" |

```
App shell
├── Holdings
├── Analytics  (AnalyticsView.tsx — existing scope dispatcher)
│   ├── ... existing sections (CategoryRankingSection, TerSection, etc.)
│   ├── FundManagerSection.tsx        [NEW — attribute 04]
│   ├── FundRankingSection.tsx        [NEW — attribute 09]
│   └── InvestmentWithdrawalSection.tsx [NEW — attribute 14]
├── Scenarios  [NEW top-level route — attribute 11]
│   ├── Picker (curated 8 cards + categorized "More scenarios")
│   └── Result view (4 distinct data shapes — see attribute 11's own spec)
└── Profile
```

No existing route, nav item, or `AnalyticsView.tsx` dispatcher branch is removed or
restructured by this work — this is additive only.

## 2. Design system — locked

`frontend/src/styles/tokens.css` is the complete and final palette/typography/spacing
source for all 4 screens. **Confirmed locked by Ayush 2026-10-08** — no new colors, no new
font families, no deviation once implementation starts. Specifically:

- Colors: `--color-bg`, `--color-ink`, `--color-surface`, `--color-border`,
  `--color-text-secondary`, `--color-accent`/`--color-positive` (`#22C55E`),
  `--color-negative` (`#EF4444` light / `#F87171` dark), `--color-warning` (`#F59E0B`).
  Attribute 11 introduces two *purely presentational, non-token* colors used nowhere else
  in the app — a violet (`#A78BFA`) for hypothetical-scenario treatment and a sky blue
  (`#38BDF8`) for the Franklin Templeton redemption-freeze callout. These are flagged here
  explicitly as a deliberate, scoped exception (distinct one-off states that have no
  existing token to reuse), not an expansion of the locked palette for general use —
  confirm with Ayush before reusing either outside attribute 11.
- Typography: `--font-display` (DM Sans) for headings/big numbers, `--font-body` (Manrope)
  for everything else, the existing type scale (`--type-h1-*`, `--type-data-large-*`, etc).
- Card chrome, stat-tile chrome, badge variants: reused verbatim from
  `CategoryRankingSection.tsx`/`TerSection.tsx` — no new chrome pattern invented for 04/09/14.
- Charting: no new dependency. `@visx/group`, `@visx/responsive`, `@visx/shape`, `d3-shape`
  are already installed and already power `components/ui/charts/pie-chart.tsx`. Attribute
  14's monthly/yearly bar chart reuses this exact stack via a new sibling `bar-chart.tsx`
  (ladder/ponytail rule: already-installed dependency solves it, use it — never add recharts
  or another charting library for what this stack already does).

## 3. Attribute summary table

| # | Component(s) | Backend endpoint | Key states to handle |
|---|---|---|---|
| 04 | `FundManagerSection.tsx` | (new, see 04's own spec) | Manager cards (sorted by AUM under them), co-manager/assistant cards (one card each), "not available yet" trailing block for `MANUAL_PENDING` AMCs |
| 09 | `FundRankingSection.tsx` | (new, see 09's own spec) | Leaderboard/neighbors view (2 above + 2 below, "(you)" row), "Insufficient History" badge state |
| 11 | New `Scenarios` route, multiple components (see 11's own spec) | `GET /scenarios`, `GET /scenarios?curated=true`, per-scenario result endpoint | 4 distinct result shapes: standard, multi-phase (+ongoing), special-case (redemption freeze), hypothetical |
| 14 | `InvestmentWithdrawalSection.tsx`, new `bar-chart.tsx` | `GET /household/aggregate/investment-withdrawal` | 5 tiles, monthly/yearly toggle, tap-a-bar-for-transactions drill-in, SIP summary with missed-instalment badge |

## 4. Cross-cutting rules

- **Decimal discipline.** Every money/percentage value renders through
  `diffDecimalStrings`/`toPercentString` from `@/lib/decimal` — never raw JS float
  arithmetic or string formatting. This is already enforced in `CategoryRankingSection.tsx`
  and carries to all 4 new sections without exception.
- **Honest-data floor.** Nowhere in any of the 4 screens does a missing/insufficient-data
  state render as a fabricated or zeroed number. Each attribute has its own explicit text
  for this (e.g., attribute 11's "not enough historical data to estimate", attribute 09's
  "Insufficient History" badge, attribute 04's "not available yet" block) — never a silent
  `0` or `—` that could be misread as a real value.
- **Compliance framing (attribute 11 only).** Every historical-percentage display carries:
  *"Here's what this portfolio would have captured during [period], based on actual
  historical fund performance — not a prediction of future returns."* Hypothetical
  scenarios carry a structurally different banner instead (see 11's own spec). This is a
  shipped working default per Ayush's instruction, not yet SEBI-consultant-cleared — see
  11's spec for the full caveat.
- **Reuse over invention.** Badge variants, section chrome, stat-tile chrome, and the
  percentile/comparison bar pattern are reused from existing sections wherever the shape
  matches — net-new visual patterns are introduced only where an attribute's data genuinely
  doesn't fit an existing one (attribute 09's leaderboard was deliberately built as a new
  pattern specifically *because* reusing the existing bar/card shape would have made it
  indistinguishable from Scorer v1 and Category Ranking — see 09's own spec for that
  reasoning in full).

## 5. Explicitly deferred (not in scope this pass)

- **Attribute 11's family-member cards — interaction/visual polish.** Ayush, 2026-10-08:
  "family member[s] can be presented... in a much more interactive way... but we can work
  on [that] later, [get] functionality working [first]." The current mockup (expandable
  card per member, click to reveal fund-level rows) is accepted as the functional baseline
  for this spec and for the first implementation pass. A follow-up design pass on this one
  interaction is expected later and should not block this spec's sign-off or the resulting
  implementation plan.
- **"Correlation X-Ray"** (cross-referencing a directly-held stock against the same stock's
  exposure inside a held fund, raised by Ayush re: the Adani-Hindenburg scenario) — depends
  on Sub-project 2's look-through engine, which doesn't exist yet. Tracked in
  `DEFERRED_FEATURES.md`'s PRD-04 table. Adani-Hindenburg itself is still a fully buildable
  ordinary scenario in this pass; only the cross-reference view is deferred.
- **Attribute 12 (TRI benchmark)** has no frontend surface at all — see scope note above.

## 6. Per-attribute specs (detailed)

- `2026-10-08-attribute-04-fund-manager-spec.md` + `artifacts/2026-10-08-attribute-04-fund-manager-visual-map.html`
- `2026-10-08-attribute-09-fund-ranking-spec.md` + `artifacts/2026-10-08-attribute-09-fund-ranking-visual-map.html`
- `2026-10-08-attribute-11-scenario-simulator-spec.md` + `artifacts/2026-10-08-attribute-11-scenario-simulator-visual-map.html`
- `2026-10-08-attribute-14-investment-withdrawal-spec.md` + `artifacts/2026-10-08-attribute-14-investment-withdrawal-visual-map.html`

## 7. Sign-off checklist

- [ ] This consolidated spec
- [ ] Attribute 04 spec + artifact
- [ ] Attribute 09 spec + artifact
- [ ] Attribute 11 spec + artifact
- [ ] Attribute 14 spec + artifact
- [ ] Consolidated HTML visual map

Only once all of the above are checked off does this sub-project move to `writing-plans`.
