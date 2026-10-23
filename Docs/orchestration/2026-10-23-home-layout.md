# Home: desktop layout and states (draft v1)

**Status:** draft, 2026-10-23. Planning only. Doc 2. Layout and behaviour, not visual design (that is doc 3). Shell contract v1.2: route `home`, `/home`, layout `app`, scope `family-or-member`. Mobile untouched.

## 1. Page grid (desktop, content area right of the sidebar)

Section 6, Market context and Cash health are gone (L5, L34), so contributors and Worth a look take the freed space.

```
+--------------------------------------------------------------+
| 1 Greeting + sentence + data line                            |
+--------------------------------------------------------------+
| 2 Wealth card: value, change, [Hide], periods, benchmark      |
|   dropdown, graph (full width)                               |
+---------------------------------+----------------------------+
| 3 Money at a glance (Mira)      | 4 Asset allocation         |
+---------------------------------+  donut + legend            |
| 5 What moved today              |  family bar (aggregate)    |
+---------------------------------+----------------------------+
| 7 Worth a look (up to 3 cards, or "Nothing needs attention.")|
+--------------------------------------------------------------+
| 8 News (1 to 3 items)                                        |
+--------------------------------------------------------------+
```

Two columns at ≥1280 px (left 3,5; right 4); below that sections stack in the order 1,2,3,4,5,7,8. Minimum supported width: 1024 px (mobile tree takes over below 768 px as today; 768-1023 stacks).

## 2. Section order and data loading

Each section fetches its own endpoint and renders independently (doc 1, section 1). Order of requests: summary, wealth-series, allocation, movers, worth-a-look together; news last. Section 3 needs summary + movers. A failed section shows its own error card; the page never goes blank.

## 3. State matrix (per section)

| Section | Loading | Empty | Partial | Error |
|---|---|---|---|---|
| 1 Greeting | skeleton heading + 2 lines | "Good <morning/afternoon/evening>, <name>" + "Import a statement to see your portfolio" + Import button (`useImport`) | data line shows "Data from 1 of 3 family members" | name only, no sentence |
| 2 Wealth | skeleton card, axis ticks | "No investments yet" with Import button | badge "Partial data" + tooltip naming funds; benchmark note when clipped | inline retry; headline hidden |
| 3 Glance | skeleton line | hidden | follows 1 and 5 | hidden (never shows a sentence that disagrees with the headline) |
| 4 Allocation | skeleton donut | donut replaced by "Add investments to see allocation"; legend still lists coming-soon classes | badge as 2 | retry |
| 5 Movers | skeleton rows | "No movement data yet" | badge as 2; sector view falls back to category with a note if holdings coverage under 50% | retry |
| 7 Worth a look | skeleton card | plain text "Nothing needs attention." (no card) | cards for the data available | section hidden, line "Could not check right now" |
| 8 News | skeleton rows | general news; if none, section hidden | stale "Updated" after 36 h; hidden after 72 h | section hidden (never blocks the page) |

**Import states (F3):** no holdings → page shows sections 1 and 2 empty states only, other sections hidden. Import in progress → skeletons plus a note "Your statement is being processed". Failed import → banner with retry above section 1.

## 4. Scope behaviour (family versus member)

- Page opens in **Family Combined** on every visit (contract scope rule); a single-member household stays in member mode.
- Choosing a member (top-bar selector or the family bar) re-scopes every section; the family bar and the "n of n" count hide in member mode; heading line changes to "<Member>'s portfolio".
- Member banners (PAN conflict, profile nudge) render above the page content in member scope, as the shell does for other pages.
- A scope change refetches all section endpoints; sections show skeletons, not stale numbers.

## 5. Interactions

- Period buttons 1D 1W 1M 1Y Custom; Custom opens a calendar limited to the last 10 years (L24).
- Benchmark dropdown inside the graph card, recommended pick marked; remembered per device (`localStorage`, guarded).
- Hide values button beside the big number; hides it and the change under it; resets on each visit (L26).
- Movers dropdown: Sector (default), Fund category, Fund. Bar click → popup of funds; fund click → fund page (disabled until live).
- Every link goes through `paths.*`; links to placeholder routes render disabled with a "Coming soon" tooltip (L32, G3).
- "Understand" and Ask Mira open the shared `MiraComingSoonDialog` (C3).
- News: opens publisher in a new tab; refetch on tab focus (throttled 5 min) and a manual refresh control.

## 6. Links

| Link | Destination | State at launch |
|---|---|---|
| Contributors "View all" | `/portfolio/mutual-funds/holdings` sorted by day change | disabled |
| Fund (row or popup) | `/portfolio/mutual-funds/funds/:schemeId` | disabled |
| Allocation "View in Analytics" | `/portfolio/mutual-funds/allocation` | disabled |
| Worth a look, concentration | `/portfolio/mutual-funds/overlap` | disabled |
| Worth a look, fund | fund page | disabled |
| News item | publisher URL | works |
| News "See affected holdings" | holdings filtered to affected funds | disabled |
| Family bar member | switches scope | works |

Links to pages that are not built yet stay greyed out with a "Coming soon" tooltip (L32 stands; owner M17). The failed-import banner sits above everything (owner H10). Breakpoints and the two-column arrangement are confirmed (H8, H9).
