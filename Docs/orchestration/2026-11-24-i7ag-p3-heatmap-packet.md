# Packet I7-AG-3: the overlap heatmap with its fund-name key and the strongest pair (Antigravity, front end, Batch I print components)
**Milestone M4.** Common rules for the four print component packets (read first, fully): `Docs/orchestration/2026-11-24-i7ag-common.md`. Audit and decision: `Docs/orchestration/2026-11-24-print-audit.md` (option C). Written by the orchestrator on 24 Nov 2026.
**Your clone:** `C:\Users\Dell\ag-p3` (branch `ag/p3-heatmap`, cut from `batch/i-fe`). Check lane name for the checks: `ag-p3`.

## What you build (new file in `frontend/src/print/groups/overlap/`)
**`HeatmapPrint.tsx`**: `HeatmapPrint({ funds, pairs, topPair }: { funds: OverlapFund[]; pairs: OverlapPair[]; topPair: OverlapPair | null })` (types in `frontend/src/features/mutual-funds/types.ts`: `OverlapFund { scheme_id, scheme_name, current_value }`; `OverlapPair { fund_a, fund_b, overlap_pct (percent string), common_stocks[{ instrument_name, weight_a, weight_b }], common_total }`). `funds` is the summary's `matrix_funds` (**at most 12**, largest first) and `pairs` its `matrix` (every pair among them, in `combinations(funds, 2)` order); `topPair` is the strongest pair (the caller picks it as the screen does). **Design: sample page `f34.png` lower half ("2 Overlap Heatmap", "Pairwise overlap (%)").** The screen's heatmap (`overlap/Heatmap.tsx`, `PairDetail.tsx`) is the source of the **band logic and colours**: read it and reuse its band function and tokens so the shading agrees with the screen; do not invent thresholds.

## The heatmap card
Card titled `Pairwise overlap (%)`. A table whose first column holds the fund names (bold) and whose other columns are the funds. **Cells show the overlap percent as visible text** (`47%`, formatted by `formatPercent` with no decimals as the screen does), the **diagonal shows a dash** `–`, and the shading follows the screen's bands (the sample's legend: `70%+` strongest green, `50 to 70%` mid green, `30 to 50%` light green, below 30 % no fill; take the screen's own band edges and colour tokens). **A legend row under the table** with a dot per band and its words as the sample prints them (the screen's `Heatmap.tsx` legend words are authoritative if they differ).
**Fit the page (680 px) for up to 12 funds, and name the funds without tooltips:** (a) **6 funds or fewer**: full fund names as the column headers (uppercase small muted, wrapping onto two lines, as the sample) and as the row labels; (b) **7 to 12 funds**: columns headed by their **number** (`1` to `12`), the row labels written `1  Fund name`, and **a numbered key** is printed in the same card under the table only if the row labels would not already carry the names (they do, so no separate key: the row labels are the key); cell size shrinks so the table is **exactly the card's inner width** (`table-fixed w-full`), cell text size drops one step when there are more than 8 funds. Equal cell height; no logos (the screen's logos are not needed).
## The strongest pair (below the heatmap, its own card)
If `topPair` is non-null: a card titled with the two fund names joined as the screen's pair detail does (read `PairDetail.tsx` for the wording, e.g. `A and B`) and the overlap percent, then a **table of the shared stocks** (Stock, weight in A, weight in B; **no scroll cap, all `common_stocks` the data holds**), and the line the screen prints when `common_total` is larger than the list (`Showing N of M shared stocks` in the screen's words; if the screen has no such line, use `common_total` in a plain sentence and flag the new words). With `topPair` null: nothing. With fewer than 2 funds: the screen's own message (`Overlap needs at least two funds with published holdings.`).

## Tests (names)
`shades each cell by the screen's band and shows its percent as text`; `the diagonal shows a dash`; `with 6 or fewer funds the headers carry the full names`; `with 12 funds the columns are numbered and the row labels carry the numbers and names`; `the legend lists the bands`; `shows every shared stock of the strongest pair and the count line when truncated`; `shows the screen's message with fewer than two funds`; `no button, no title attribute, no hex colour; the table is fixed layout and full width`.


## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-24-i7ag-common.md (rules common to the four print component packets: read it fully)
4. Docs/orchestration/2026-11-24-i7ag-p3-heatmap-packet.md (your task: I7-AG-3)
Open the sample page image(s) named in the packet and build to them: the sample is the design. Work only in C:\Users\Dell\ag-p3 on branch ag/p3-heatmap. Tests first: write the tests and show them fail, then make them pass. Create only the new files the packet lists. Never run a git command that changes anything. Touch nothing else. Reply with the report block from the common rules, nothing else.
```
