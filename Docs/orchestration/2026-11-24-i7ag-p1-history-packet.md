# Packet I7-AG-1: the history chart and the year-by-year table (Antigravity, front end, Batch I print components)
**Milestone M4.** Common rules for the four print component packets (read first, fully): `Docs/orchestration/2026-11-24-i7ag-common.md`. Audit and decision: `Docs/orchestration/2026-11-24-print-audit.md` (option C). Written by the orchestrator on 24 Nov 2026.
**Your clone:** `C:\Users\Dell\ag-p1` (branch `ag/p1-history`, cut from `batch/i-fe`). Check lane name for the checks: `ag-p1`.

## What you build (new files in `frontend/src/print/groups/performance/`)
1. **`HistoryChartPrint.tsx`**: `HistoryChartPrint({ points, title }: { points: HistoryPoint[]; title: string })`. `HistoryPoint` is in `frontend/src/features/mutual-funds/types.ts` (`month` "YYYY-MM", `value: number`, `invested: number | null`, `valueText`, `investedText`, `partial`, `missing`). It is used **twice**: as the body of the Portfolio History section (title `Value over time`) and as the Overview "Value over time" section (title like `Value and money invested (net of withdrawals), 2014 to 2026`, built by the caller).
2. **`YearByYearTable.tsx`**: `YearByYearTable({ points, asOf }: { points: HistoryPoint[]; asOf: string | null })`.
**Design: sample pages `f10.png` (Portfolio History, both cards) and `f05.png` (top card).** Build both cards as drawn.

## The chart card (f10 top card, f05 top card)
Card (the screen's card shell), a title (DM Sans bold, `text-base`), then an **SVG chart 680 px wide scaled by `width="100%"`**, plot height about 40 mm at A4 (viewBox about `720 x 170`, keep the screen's own ratio if `PerformancePage.tsx` `HistoryBlock` uses `720x220`: the print chart is the **screen's chart plus axes**, so read `HistoryBlock` (`features/mutual-funds/performance/PerformancePage.tsx` about lines 527 to 763) and keep its two series, its scaling and its colours: the value line in `var(--pos)`, the invested line dashed in `var(--ui-text-muted)`, **but print the invested line solid** as in the sample (grey-blue), and add what the screen lacks):
- **y-axis ticks** at four or five round values with labels in the compact lakh style (`₹25.2L`, `₹50.4L`, `₹75.6L`, `₹100.8L`, as the sample), horizontal gridlines in `var(--ui-divider)`;
- **x-axis year labels** every two years (`2016`, `2018` ... as the sample) at the matching month position;
- a **light fill under the value line** (the positive tint, `var(--pos-bg)` or the token the screen uses for tints, at low opacity) as in the sample;
- a **legend row under the chart** (two items, a coloured dot and the words `Portfolio value` and `Invested`), as in `f05.png`;
- **no dots, no hover, no tooltip**; partial or unpriced months (`partial`, `missing`) are drawn like the others (the screen's hollow dots are interaction detail: leave them out).
**The caller gives you the points in month order; do not sort or reshape them** (if `invested` is null at a point, break the invested line there). With no points: a single centred sentence in the card, the screen's own empty text (`No history yet`, from `HistoryBlock`).

## The table card (f10 bottom card)
A second card titled `Year by year` with a table: columns **Year end, Invested, Value, Gain, Gain %** (uppercase small muted headers on a light header row, as drawn; numbers right-aligned). **One row per calendar year**: use the **December point of that year, or if the year has no December point, the last point in that year**; the **current partial year's row label** is `<year> (to <d> <Mon>)` built from `asOf` (ISO date, e.g. `2026 (to 5 Oct)`; a three-letter month; when `asOf` is null label it with the year only). **Gain = value minus invested; Gain % = gain divided by invested**, both from the same numbers the points hold (do arithmetic on the `number` fields, format with `formatRupees` / `formatPercent`; the sample prints gains with an explicit `+` sign: use the formatter's signed option if it has one, else prefix a plus for positives). A year whose `invested` is null: show `-` in Invested, Gain and Gain %. Rows `break-inside-avoid`, header repeats, no total row.

## Tests (names)
`HistoryChartPrint`: `draws the value and invested lines from the points`; `labels the y axis in the compact style and the x axis by year`; `shows the two-item legend and the given title`; `shows the empty sentence with no points`; `breaks the invested line where invested is null`; `has no button, no title attribute and no hex colour`. `YearByYearTable`: `one row per year using the December point, else the last point of the year`; `gain and gain percent equal value minus invested and its ratio, formatted by the shared formatters`; `labels the partial year from asOf`; `shows dashes where invested is null`; `rows do not split and the header is a thead`; `no button, no title attribute`.


## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-24-i7ag-common.md (rules common to the four print component packets: read it fully)
4. Docs/orchestration/2026-11-24-i7ag-p1-history-packet.md (your task: I7-AG-1)
Open the sample page image(s) named in the packet and build to them: the sample is the design. Work only in C:\Users\Dell\ag-p1 on branch ag/p1-history. Tests first: write the tests and show them fail, then make them pass. Create only the new files the packet lists. Never run a git command that changes anything. Touch nothing else. Reply with the report block from the common rules, nothing else.
```
