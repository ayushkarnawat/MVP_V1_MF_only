# Planning (market scenarios): section-wise design system, utilities and mockup notes (draft v1)

**Status:** draft, 2026-10-23. Planning only. Document 3. Colours and fonts follow `Docs/Unifolio Colour Palette.pdf` as already adopted for Home and the shell (`2026-10-23-home-design-system.md` section 1). This document adds only what Planning needs. Light and dark only. The pixel mockups are in `2026-10-23-planning-scenarios-design-mockups.html` (published as an artifact, with the new open questions G1 to G9).

## 1. Tokens

Reuse the Home and shell scoped tokens (Home decision M12 A: new names for Home and the shell, `tokens.css` values untouched). Planning adds **no new colour token**. Used here:

- Surfaces: base, card, elevated; divider and input borders.
- Text: primary, body, secondary, muted.
- **Brand green (rare):** the selected scenario card outline and tint, the primary button state, the 2 px focus ring. At most one or two green elements per screen. Landing icon tiles use supporting colours, not green.
- **Semantic:** gain and loss text in the AA-safe shades (positive #15803D, negative #C1272D) for small numbers; the primary shades (#22C55E, #E5484D) for bar marks and large numerals; tints (#EAFBF0, #FDECEC) only as backgrounds of small chips, never a whole card (palette rule). Freeze uses the Warning set (L29): icon and border #D97706, text #92400E, tint #FEF3E2. Assumption-based (hypothetical) uses the Informational set: #4F46E5, #3730A3, #EEEDFC.
- **Index bars:** Chart 03 blue #2563EB, the colour Home uses for its benchmark line (Home M13 A). Question G8 asks whether to use grey instead.
- **Supporting colours for type icons (tier 2):** crash and freeze icon tile uses negative or warning tint; bull run uses teal #0D9488 tint; policy and rate uses indigo #4F46E5 tint.
- Dark: Home's dark set (background #111111, card #1A1A1A, border #2E2E2E, semantic text shades #34D399 and #F87171) with tints as low-opacity primaries.
- Fonts: DM Sans headings, Manrope body, bold display numerals for tile values.

## 2. Existing components reused (unchanged unless noted)

`ui/card`, `badge`, `button`, `select`, `skeleton`, `tooltip`, `dialog`; shell `PageLayout`, `PageState`, `MiraComingSoonDialog`; from the scenarios feature: `Compliance` (disclaimer), `Funds`/`Members`/`FundRow` row logic, `rupees`, `benchmarkLabel`, `resolveResultShape`, `formatDateRange`, `lib/decimal` helpers (`formatDecimal`, `compareDecimalStrings`). `ui/charts/bar-chart` is **not** used (L28).

## 3. New pieces (build detail in the reuse-versus-new document)

| Piece | Purpose |
|---|---|
| `PlanningPage` | owns the four states and the history entries |
| `PlanCard` | the two landing cards (icon tile, title, line, round arrow) |
| `ComingSoonView` | heading, one line, Back link |
| `ScenarioCard` | page-29 card: type icon, name, dates, description, Nifty 50 stat, badges, chevron, selected state |
| `ScenarioTypeIcon` | icon and tint from `scenario_type` |
| `ScenarioList` | curated block, More / Hide, pills, grid |
| `ScenarioDetail` | heading row, member dropdown, disclaimer, tiles, charts, Mira card, members |
| `StatTile` | caption, value, small line |
| `DivergingBars` | horizontal signed bars from a zero line with value labels; used by both charts |
| `BenchmarkChart`, `AssetClassChart` | thin wrappers that prepare rows for `DivergingBars` and add the caption |
| `MemberSelect` | `ui/select` wrapper: Family combined plus members with funds |
| `MiraInsightsCard` | static card plus button for the existing Mira dialog |
| `EstimateChip`, `FrozenText` | per-fund labels inside member rows (L35) |
| `ScenarioNote` | the pre-2006 note and similar neutral notes |

## 4. Section notes

1. **Landing cards:** 48 px icon tile (tinted), H3 title, body line, round 36 px arrow button (decorative). Hover: card tint and arrow darkens; focus ring 2 px.
2. **Scenario card:** name Semi-bold 14 px, two lines; description 12.5 px secondary, two lines; stat 12 px Semi-bold in the semantic text shade; selected: 2 px green outline plus #E9F9EF tint (dark: 14% green).
3. **Stat tile:** caption 12 px secondary; value 24 px bold display numerals in semantic text shade when signed; small line 12 px secondary.
4. **DivergingBars:** 12 px rows, 8 px bar height, zero line 1 px divider colour, the label (group or index name) left, value labels right (`₹` amount and `%` for asset class; `%` for benchmarks), bars scaled to the largest absolute value in the chart, negative to the left in negative primary, positive to the right in positive primary (your portfolio bar) or Chart 03 blue (index bars). Row is focusable with an accessible name "Equity, minus 18,40,000 rupees, minus 22.1 percent". No hover tooltip needed (G5).
5. **Mira card:** lightbulb icon, title, one line, secondary button "Learn more" opening the existing dialog.
6. **Member rows:** unchanged shape; the Estimate chip is a neutral-tint pill with the basis as tooltip; Frozen is Warning text.
7. **Notes:** neutral tint card, info icon, one or two lines.
8. **Skeletons:** same grid and tile sizes, no shimmer under reduced motion.

## 5. Utilities

- `scenarioFormat.ts`: `signedPct(value)` (Decimal string to "+1.20%" or "−1.20%" with the real minus sign), `outperformedBy(portfolioPct, benchmarkPct)` returning a signed 2 dp string or null, `indianRupees(value)` (reuse `rupees`), `compactCr(value)` only if a chart axis needs it.
- `assetClassOrder.ts`: the display order and labels of the six groups.
- `barScale(values)`: returns each value's width fraction against the largest absolute value, side (left or right), and guards an all-zero chart.
- `planningHistory.ts`: `pushPlanningState`, `readPlanningState` (typed `window.history.state` access, tolerant of missing state).
- `scenarioIcon(type)`: icon name and tint per type (one constant).

## 6. Wireframe: detail (standard result)

```
Back to Planning
Planning
COVID-19 Crash (Mar 2020)  1 Jan 2020 - 31 Dec 2020          [Family combined v]
Global markets fell sharply due to the pandemic.
Here is what this portfolio would have captured ... not a prediction of future returns.
+-------------+-------------+--------------------+--------------------------+
| Your return | Rupee impact| Nifty 50 return    | Coverage                 |
| -24.8%      | -18,40,000  | -29.7% Ahead 4.9pp | Based on 71.2L of 74.1L  |
+-------------+-------------+--------------------+--------------------------+
| Benchmark comparison | Impact by asset class     | Insights from Mira     |
|  You       ####|      | Equity     ####-          |  Coming soon  [Learn..]|
|  Nifty 50  #####|     | Debt            -#        |                        |
|  Nifty 500 ####|      | Gold     +##              |                        |
+----------------------+---------------------------+------------------------+
| By family member                                                          |
|  Asha  -9,20,000 (-24.1%)   >   (Estimate / Frozen chips inside rows)     |
+---------------------------------------------------------------------------+
```
