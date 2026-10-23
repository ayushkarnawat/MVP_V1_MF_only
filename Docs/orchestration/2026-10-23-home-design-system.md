# Home: section-wise design system, utilities and mockup notes (draft v1)

**Status:** draft, 2026-10-23. Planning only. Doc 3. Visual identity is `Docs/Unifolio Colour Palette.pdf` (colours and fonts) plus `Docs/Design-Schema-Unifolio.md` and `frontend/src/styles/tokens.css` where the palette is silent (not the look of Mprofit). Light and dark only (L33): no WCAG target, no colour-plus-sign rule. Mockups here are structural wireframes; pixel mockups are produced when the owner approves this doc (and with the icon mockups, E3).

## 1. Colour tokens (source: Docs/Unifolio Colour Palette.pdf)

The owner's palette PDF (added 23 Oct) is the colour source for Home and the shell. It differs from today's tokens.css (see section 1.4), so Home needs a decision on how to adopt it (question M12).

### 1.1 Palette (light)

| Role | Value |
|---|---|
| Base background / card / elevated | #FCFCFC / #F5F5F5 / #FFFFFF |
| Primary text, body, secondary, muted icons, disabled text | #111111, #4B4B4B, #717171, #9B9B9B, #C4C4C4 |
| Divider, input/disabled border | #ECECEC, #DFDFDF |
| Brand green: primary, hover, pressed, selected tint | #22C55E, #16A34A, #15803D, #E9F9EF |
| Positive: primary, text, tint | #22C55E, #15803D, #EAFBF0 (border listed as #EAFBF0, probably a typo, question M16) |
| Negative: primary, text, tint, border | #E5484D, #C1272D, #FDECEC, #F6C6C7 |
| Warning: primary, text, tint, border | #D97706, #92400E, #FEF3E2, #FCE0B0 |
| Neutral: primary, text, tint, border | #6B7280, #4B4B4B, #F5F5F5, #E0E0E0 |
| Informational: primary, text, tint, border | #4F46E5, #3730A3, #EEEDFC, #D2CFF6 |
| Supporting (tier 2): teal, indigo, amber | #0D9488, #4F46E5, #D97706 |
| Score colours | Excellent #15803D, Strong #22C55E, Good #65A30D, Average #CA8A04, Poor #EA580C, Weak #C1272D (Poor and Weak order inferred from the PDF text, to confirm) |
| Data visualisation, Chart 01 to 12 (by rank, largest first) | #22C55E, #0D9488, #2563EB, #6366F1, #A855F7, #8B5CF6, #EC4899, #F43F5E, #D97706, #CA8A04, #C1272D, #65A30D (order from the PDF text, to confirm) |

### 1.2 Dark

Background #111111, card #1A1A1A, elevated #212121, border #2E2E2E, primary text #FCFCFC, secondary #A3A3A3, brand green unchanged. Semantic text: positive #34D399, negative #F87171, warning #FBBF24, information #818CF8. The palette gives no dark tints for semantic cards; the mockups derive them as the primary colour at 12 to 18% opacity (question M15).

### 1.3 Rules from the palette

- **Green is rare:** primary button, active nav indicator (2 px green underline), selected state, logo; about one or two green elements per screen. Everyday colour comes from tier 2.
- **Semantic colours never fill a card or row:** tint for the background, full colour only for the icon, the number and a thin border. Small numbers use the AA-safe text shade; large numerals and chart marks use the primary shade (question M14).
- **Charts:** colours assigned by rank, largest holding first; 15 or more items: top 10 to 11 shown, the rest grouped as Others (Chart 12).
- **Buttons:** primary #22C55E (hover #16A34A, pressed #15803D, disabled #DFDFDF); secondary on #FCFCFC; selected state #E9F9EF; focus ring 2 px #22C55E on every interactive element.
- **Fonts:** DM Sans for headings, Manrope for body. Weights: Regular body; Medium sub-labels, H4, captions; Semi-bold H2/H3, buttons, overlines, tags; Bold display numerals and H1.

### 1.4 Where the palette differs from tokens.css

Card colour (white vs #F5F5F5), divider (#E5E5E5 vs #ECECEC), secondary text (#5C5C5C vs #717171), negative (#EF4444 vs #E5484D), warning (#F59E0B vs #D97706), dark background (#0F0F0F vs #111111), dark border (#2A2A2A vs #2E2E2E), plus new tokens (elevated surface, tints and borders, informational, chart palette, score colours). The existing fund tier colours and the hypo and freeze colours are not in the palette. Updating tokens.css globally restyles every existing screen; the recommendation is scoped tokens for Home and the shell (M12).

### 1.6 Owner decisions on colour and interaction (23 Oct)

Tokens are scoped to Home and the shell (M12 A); benchmark line uses Chart 03 blue #2563EB (M13 A); gain and loss follow the palette text and primary shades (M14 A); dark tints are low-opacity primaries (M15 A); the positive border stays #EAFBF0 as written (M16 A); links to unbuilt pages stay greyed with a tooltip (M17 B, L32 stands); the family section stays as in the current mockup (M11 note); the redesigned movers, Worth a look and news cards in the mockup artifact are the reference.

### 1.5 Benchmark colour

No dedicated colour exists; the mockups use Chart 03 blue #2563EB for the benchmark line, right axis and percentage (question M13). The earlier proposal for a new --color-benchmark token is withdrawn.

## 2. Existing components reused

`ui/card`, `badge`, `button`, `dialog`, `select`, `tabs`, `tooltip`, `skeleton`, `table`; `AllocationDonut` / `ui/charts/pie-chart` + `pie-center` (donut with centre label); `ui/charts/bar-chart` (concentration bars); `EmptyState`; `chart-stat-flow` / `@number-flow/react` (animated big number); shell `PageLayout`, `PageState`, `MiraComingSoonDialog`, `AppLink`, `useScope()`.

## 3. New pieces (build detail in doc 4)

| Piece | Purpose |
|---|---|
| `LineAreaChart` (`ui/charts/line-area-chart.tsx`) | **No line/area chart exists.** Built on `d3-shape` (already installed): area + line for the portfolio, optional second line on a right axis, hover tooltip with crosshair, no animation dependency |
| `PeriodSelector` | 1D 1W 1M 1Y Custom buttons + calendar popover |
| `DateRangeCalendar` | range picker limited to the last 10 years (no calendar component exists) |
| `BenchmarkSelect` | `ui/select` wrapper showing recommended pick |
| `ChangeBadge` | signed amount + percentage, arrow, positive/negative colour |
| `HideValuesButton` | eye toggle, Home-local state |
| `MoverRow`, `MoversCard` | contributors list, dropdown, net row, fund popup |
| `FamilyBar` | member rows with amount, %, bar |
| `WorthALookCard`, `ConcentrationBars` | signal cards; two bars with a rising line label |
| `NewsCard`, `NewsItem`, `NewsCategoryIcon` | 1 to 3 items with category icon, chip, disclaimer |
| `PartialDataBadge` | badge + tooltip listing funds |
| `homeFormat.ts` | Indian digit grouping, `Cr`/`L` compact, signed amounts, `DD Mon` dates (G5) |

## 4. Section notes

1. **Greeting:** `--type-h1`, one sentence at body size, data line in secondary text with a small status dot. Sun/moon icon by IST hour; heading "Good morning/afternoon/evening, <name>".
2. **Wealth card:** caption "YOUR FAMILY'S WEALTH" / "<MEMBER>'S WEALTH"; big value (display font, number-flow); `ChangeBadge` below; blue benchmark percentage under it with the index name; Hide button beside the number. Graph: green (positive) area fill from the portfolio line; blue benchmark line on a right-hand percentage axis; "as of <DD Mon>" caption; period buttons under the graph, benchmark dropdown top right of the card.
3. **Glance:** sparkle icon, one rule-built sentence, link "Understand today's change" → Mira dialog; small print "Based on available investment data ".
4. **Allocation:** donut with total in the centre (compact `Cr`), legend with %; coming-soon classes muted below the live ones with "Coming soon"; family bar below (amount, %, thin bar) in aggregate scope only.
5. **Movers:** dropdown top right (Sector, Fund category, Fund); "estimated" tag when sector; two gain rows, "Offset by", two loss rows, divider, "Net portfolio change"; a small note when the view fell back.
7. **Worth a look:** warning-tinted cards (icon, headline, one-line explanation, one action link); concentration card shows two bars (earlier, now) only when the earlier value exists. Empty: plain text line, no card.
8. **News:** header (PDF title), neutral subtext, disclaimer line; item = category icon, title, "<kind> · <time ago>", exposure chip (if coverage allows), link. Icon set: 13 categories plus a general fallback (E3): Banks and financials, IT and technology, Pharma and healthcare, Auto and EV, Consumer and FMCG, Energy oil and power, Metals and mining, Real estate and infrastructure, Gold and silver, Interest rates and RBI, Mutual funds and fund houses, Markets (Sensex, Nifty), Regulation (SEBI), General (fallback). Drawn with Lucide at the app's stroke weight and size (candidates: `Landmark`, `Cpu`, `Pill`, `Car`, `ShoppingBasket`, `Fuel`, `Pickaxe`, `Building2`, `Coins`, `Percent`, `ChartPie`, `ChartCandlestick`, `Scale`, `Newspaper`; availability in lucide-react 0.475.0 to be checked in the build step; a custom SVG only where none fits).

## 5. Utilities

`homeFormat.ts` (above); `useHomeSection(endpoint, scopeKey)` data hook (loading/error/data, cancels on scope change); `buildGlanceSentence()` (pure, unit-tested template); `periodRange()` (period → from/to, clamps to 10 years); `recommendBenchmark()` is server-side.

## 6. Wireframe: wealth card

```
YOUR FAMILY'S WEALTH (i)                 [Nifty 50 v]
₹2,13,47,320  (eye)
▲ +₹38,400 (+0.6%)  Portfolio change today
Nifty 50 +0.9%                              (blue)
 ~~~~ green area/line, blue line, right % axis ~~~~
[1D] 1W  1M  1Y  Custom
```
