# PRD-06 — Mutual Funds Page Redesign (`/portfolio/mutual-funds`)

**Status (2026-10-24, updated):** All 8 mockups are built and signed off — Overview,
Performance, Allocation (Round 6), Holdings, Transactions, Other Analytics, Fund Overlap
(portfolio-level), and the Individual Fund page (which carries the Overlap Analysis tab's
normal and comparison states — see §4.3 below, now resolved). A cross-cutting audit
(§4.4) against the live production components has also been completed and actioned this
round, with two items explicitly deferred (§4.4). This PRD is the product-requirements
layer sitting above the full design detail, which lives in
`Docs/orchestration/2026-10-23-mutual-funds-page-design.md` ("design.md" below) — this
document does not repeat that detail, it points to it.

**This PRD exists because** the owner asked for the full document set (PRD, TDD, backend
flow doc, restructure doc, relayout doc) in addition to design.md and the HTML mockups —
see the companion documents in §7 and the handoff doc
(`Docs/orchestration/2026-10-24-mutual-funds-redesign-handoff.md`) for current build status
of each.

---

## 1. Problem & goal

Today's Mutual Funds experience is one long-scrolling analytics page
(`features/analytics/`, 21 components) bolted onto a separate holdings dashboard
(`DashboardView.tsx`). Users can't navigate directly to a specific analysis (performance,
allocation, overlap, etc.) and several sections that deserve a dedicated treatment
(Overlap, Transactions) have a self-admittedly weak UI. Goal: restructure into 7 in-page
tabs (Overview + 6 analytics sub-pages, per the locked nav-shell contract, design.md §0),
each re-laid-out with a genuine visual/UX design pass, with little-to-no backend change —
most of the underlying data is already computed (design.md §5).

## 2. Scope

In scope: everything under `portfolio-mutual-funds*` routes per design.md §0, including the
per-fund detail page (`/portfolio/mutual-funds/funds/:schemeId`) — moved in-scope
2026-10-24 per the owner's request (design.md §7.5.1/§11.3), no longer a feasibility-only
read or a separate later rollout. Its mockup is built:
`Docs/orchestration/2026-10-24-mutual-funds-individual-fund-mockup.html`.

## 3. Requirements by page

Full content/data mapping: design.md §7 (one subsection per page). Route map: design.md
§0. Current→new component mapping (nothing silently dropped): design.md §6. Summary:

| Page | Core requirement | Backend state |
|---|---|---|
| Overview | Summary strip, AMC donut, family breakdown, Quick Insights, Section 3 holdings table with `sebi_category` column, SIPs section, "Compare Distributors" | No new work except `sebi_category` field (design.md §3, Q3) |
| Performance | XIRR detail, absolute return, full value-history (HistoryView content, folded in), benchmark comparison | New: 4 more benchmark indices, windowed (1Y/3Y/5Y) XIRR math — see §4.1 |
| Allocation | 5 breakdowns: AMC, Market Cap, Fund Manager, Category, Asset Class | No new work beyond §3's `sebi_category`; new UI requirement — see §4.2 |
| Holdings | Per-fund top-10 + portfolio-wide stock look-through | No new work — client-side re-sort of `contributing_funds` |
| Transactions | Cash-flow ledger, same data, genuine visual redesign (owner called today's UI "still pretty shit") | No new work |
| Fund Overlap | Exactly 3 artifacts, resolved — see §4.3 | Mostly no new work; "excluded funds" count is new (design.md §7.5) |
| Individual Fund page | Standalone page, Overview/Overlap Analysis/Insights tabs — see §4.3 | Per-fund market-cap aggregation is new (design.md §7.5.1) |
| Other Analytics | 4 distinct groups: Cost & Valuation, Fund Quality Scorer, SEBI Category Ranking, Fund Ranking | No new work |

## 4. Requirements added 2026-10-24 (this round's expanded scope)

### 4.1 Performance — benchmark + time-window selection is a hard requirement

The ability to pick which benchmark index/indices to compare against, and which time
window (Since Inception / 1Y / 3Y / 5Y) to view, **must exist** regardless of the final
UI widget. The Round 5/6 mockup satisfies this via chip-based index toggles + a segmented
time-window control (not the original dropdown pair) — functionally equivalent, just a
different widget shape. Documented here explicitly because the owner flagged this
capability as easy to lose sight of during a visual redesign. Full mechanics: design.md
§11.2, §7.1.

### 4.2 Allocation — selectable chart representation per breakdown

By AMC, By Fund Manager, By Category, and By Asset Class must each let the user choose
how that breakdown renders — pie/donut, bar, or another chart type — rather than being
locked to one fixed visualization. **Not yet built** in any mockup (Round 6 still uses
donuts throughout for these four; Market Cap is unaffected, not named in this
requirement). The chart-type picker itself must satisfy §5's interactivity rule (an
explicit, labeled control, not a hidden gesture). Full detail: design.md §11.2.

### 4.3 Fund Overlap — multi-artifact restructuring (resolved 2026-10-24, via AskUserQuestion)

Fund Overlap is **exactly 3 artifacts**, not an open-ended 3-vs-4 question: (1) portfolio-
wide overlap at `/portfolio/mutual-funds/overlap`, standalone route, built in
`2026-10-24-mutual-funds-overlap-mockup.html`; (2) the Individual Fund page's Overlap
Analysis tab **normal state**; (3) the same tab's **comparison state**, reached only by
clicking a row in (2)'s "Top Funds with Overlap" table — not a separate route, not a
standalone picker. (2) and (3) are "the two states" the owner's original instruction
referred to, and both live inside the Individual Fund page
(`2026-10-24-mutual-funds-individual-fund-mockup.html`), per design.md §7.5.1/§11.3. The
previously-flagged nav-shell contract conflict (`portfolio-mutual-funds-overlap-compare`
having nothing to render, since the comparison screen lives inside the Individual Fund
page instead) is unaffected by this resolution — still needs the nav-shell owner
conversation, design.md §0/§7.5 and the TDD companion doc's §5.

### 4.4 Cross-cutting audit (resolved 2026-10-24) — 4 findings, 2 explicitly deferred

Every production component under `frontend/src/features/analytics/` was audited against
each mockup's own "Data source mapping" table. 4 gaps were found and actioned; full
record: `Docs/orchestration/2026-10-24-mutual-funds-cross-cutting-audit-findings.md`.

1. **Investment & Withdrawal cashflow** (Transactions mockup) — not a missing feature as
   first flagged; 3 genuinely missing fields (`sip_summary`, `gifts_net`,
   `opening_holdings`) were built in full, no deferral.
2. **`CoverageBanner`** missing from Holdings, Other Analytics, Fund Overlap (present
   only in Allocation) — a simple headline-%-only stub line was added to all 3, per
   owner instruction. **Deferred, not built:** the full per-fund reason list
   (not-published/not-available/stale) and derivative-exclusion share, for all 3 sections.
   Allocation's existing `.coverage-banner` markup is the template when this is picked up.
3. **`ValuationSection` edge states** (Other Analytics) — `hide_headlines` /
   `enough_data` thresholds and one example footnote were added as a one-line stub, per
   owner instruction ("same for this" as #2). **Deferred, not built:** the real
   hidden-ratio and not-enough-data rendered states, the complete per-stock exclusions
   list, and the complete footnotes array.
4. **Stock Concentration** (Fund Overlap) — entirely absent; built in full per owner
   instruction (not deferred): a new Section 5 with a real SVG cumulative-exposure curve,
   clickable concentration chips, and a headline sentence, all linking to Holdings' stock
   table exactly as production's shared `onOpenStocks` handler does. The 3 smaller edge
   states (sub-2-funds empty state, no-pairs-above-threshold empty state, matrix-
   truncation note) are documented in an inline panel rather than live-toggled, since
   triggering them live would require degrading the already-signed-off happy-path dataset.

**The two deferred items above (full `CoverageBanner` port; full `ValuationSection` edge
states) are open backend/frontend-production follow-up work, not mockup gaps** — tracked
in the redesign handoff doc's item 8/9 and carried forward here so they aren't lost once
the handoff doc itself is eventually retired.

## 5. Cross-cutting interactivity requirement (all pages)

Every element on every page must be either (a) clickable with a visible, unambiguous
cause-and-effect connection to what it changes, and genuine UI/UX purpose, or (b) not
clickable but hoverable with a popup. No static inert elements. No "dead clicks" — a
click that changes something elsewhere on the page with no visible link back to the
clicked element fails this requirement even if the data update is technically correct.
This rule retroactively applies to every already-built mockup, not just new ones — see
design.md §11.1 for the full rule, reference patterns, and the Allocation Round 5 →
Round 6 fix as a worked example of applying it.

## 6. Non-functional requirements

- **Zero/minimal new backend work** is a design constraint, not an accident — per the
  owner's own framing ("full UI/UX revamp with little-to-no backend change expected").
  Any requirement needing genuinely new computation (benchmark indices, windowed XIRR,
  excluded-funds count, per-fund market-cap aggregation) is called out explicitly in
  design.md rather than assumed free.
- **Data consistency**: any fund name appearing more than once on the same page carries
  exactly one ₹ value everywhere it reappears (design.md §11.4).
- **Nothing silently dropped**: every one of today's 21 analytics components has a named
  new home (design.md §6) — no component disappears without an explicit decision record.

## 7. Companion documents

- `Docs/orchestration/2026-10-23-mutual-funds-page-design.md` — full design detail,
  philosophy (§11), per-page content spec (§7), decisions log.
- `Docs/superpowers/specs/2026-10-24-mutual-funds-tdd-backend-flow.md` — technical design
  / backend flow document (new work items, data flow, precompute pattern).
- `Docs/superpowers/specs/2026-10-24-mutual-funds-restructure-relayout.md` — how the
  existing analytics section restructures and relays out into the new 7-tab shape.
- `Docs/orchestration/2026-10-23-mutual-funds-overview-mockup.html`,
  `-performance-mockup.html`, `2026-10-24-mutual-funds-allocation-mockup.html` — built
  mockups, Round 6.
- `Docs/orchestration/2026-10-24-mutual-funds-holdings-mockup.html`,
  `-transactions-mockup.html`, `-other-analytics-mockup.html`, `-overlap-mockup.html`,
  `-individual-fund-mockup.html` — the 5 remaining mockups, built 2026-10-24, completing
  the full 8-page set.
- `Docs/orchestration/2026-10-24-mutual-funds-redesign-handoff.md` — current status and
  the continuation prompt for picking this up in a new session.
- `Docs/orchestration/2026-10-24-mutual-funds-cross-cutting-audit-findings.md` — the §4.4
  audit's full per-finding resolution record.

**"CDD"** — the owner was asked directly (AskUserQuestion, 2026-10-24) and confirmed this
document should be **skipped entirely** — no "CDD" document exists or is planned for this
sub-project. Resolved, not an open question.
