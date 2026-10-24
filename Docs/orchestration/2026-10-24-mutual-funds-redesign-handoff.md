# Mutual Funds Page Redesign — Handoff (2026-10-24, rewritten — supersedes the earlier same-day version)

Written at the owner's explicit request, as the mandatory end-of-session deliverable
regardless of how much of the requested scope got finished this session. This version
supersedes the earlier 2026-10-24 handoff entirely — that version was written mid-session,
before the open questions were resolved and before Holdings/Transactions/Other
Analytics/Fund Overlap/Individual Fund were built. Read this one, not that one. Read this
first in a new session before touching any mockup or document in this sub-project.

## 1. What's done — all 8 mockups are now built

1. **Philosophy consolidated into design.md §11** (`Docs/orchestration/2026-10-23-mutual-funds-page-design.md`)
   — single source of truth for every section-by-section decision across the sub-project:
   - §11.1 — the interactivity rule: every element meaningfully clickable (visible
     cause-and-effect) or hoverable-with-popup, zero dead/disconnected clicks. Applied from
     the outset in every artifact built after Allocation's Round 6 fix (Holdings,
     Transactions, Other Analytics, Fund Overlap, Individual Fund) — not retrofitted.
   - §11.2 — functional capabilities that must survive a UI redesign: Performance's
     benchmark + time-window selection, Allocation's selectable chart-type requirement
     (still not built — see §2 below).
   - §11.3 — Fund Overlap's multi-artifact restructuring, **now resolved** (was flagged
     unresolved in the earlier handoff): see §2 below.
   - §11.4 — the fund-value-consistency rule (one ₹ figure per fund name per page).
2. **Open questions resolved this session, via `AskUserQuestion`:**
   - **Fund Overlap is exactly 3 artifacts**, not an open 3-vs-4 count: (1) portfolio-wide
     overlap (`/portfolio/mutual-funds/overlap`, standalone route), (2) the Individual Fund
     page's Overlap Analysis tab **normal state**, (3) the same tab's **comparison state**
     (reached only via a row click in (2), not a separate route). (2) and (3) are "the two
     states" the owner's original phrasing referred to — not a 4th artifact.
   - **"CDD" document — explicitly skipped.** The owner confirmed no such document is
     needed; not written, not planned.
   - **Individual Fund page is now in scope** (`/portfolio/mutual-funds/funds/:schemeId`)
     — a standalone page with its own header and 3 tabs (Overview / Overlap Analysis /
     Insights), moved from "feasibility read only" to "build it now."
3. **All 8 mockups built and verified** (each checked for div/script-tag balance and
   `node --check`-clean inline JS):
   - `2026-10-23-mutual-funds-overview-mockup.html` — Round 5+ (not re-audited against
     §11.1 this session — see §2 below).
   - `2026-10-23-mutual-funds-performance-mockup.html` — same caveat.
   - `2026-10-24-mutual-funds-allocation-mockup.html` — Round 6 (the §11.1 anti-pattern
     fix: persistent legend selection, color-matched panel title, scroll-into-view).
   - `2026-10-24-mutual-funds-holdings-mockup.html` — per-fund Top 10 (client-side re-sort)
     + portfolio-wide stock look-through, click-to-expand rows.
   - `2026-10-24-mutual-funds-transactions-mockup.html` — genuine visual redesign (stat
     strip, clickable bar chart with drill-down, redesigned ledger), per the owner's
     explicit "still pretty shit, needs more than a port" feedback — not a straight port.
   - `2026-10-24-mutual-funds-other-analytics-mockup.html` — 4 visually distinct groups:
     Cost & Valuation, Fund Quality Scorer (proprietary, full detail kept here
     permanently), SEBI Category Ranking & Peer Comparison, Fund Ranking (restored, kept
     distinct from the Scorer).
   - `2026-10-24-mutual-funds-overlap-mockup.html` — portfolio-level Fund Overlap: stat
     strip, Common Holdings, Overlap Heatmap (exact `overlap.py` band thresholds, 20/40),
     Top Overlapping Fund Pairs + Key Insights, Overlap Impact donut.
   - `2026-10-24-mutual-funds-individual-fund-mockup.html` — standalone per-fund page;
     carries Fund Overlap artifacts 2 and 3 (Overlap Analysis tab's normal and comparison
     states, toggled in place with a labeled back control); Insights tab reuses the Fund
     Quality Scorer detail view.
4. **Document set — complete, and updated to match the resolved decisions + new pages:**
   - `Docs/PRDs/PRD-06-Mutual-Funds-Page-Redesign.md` — updated: status reflects all 8
     mockups built, §4.3 (Fund Overlap) rewritten from "open question" to resolved, scope
     note on the Individual Fund page updated, CDD section updated to "explicitly skipped."
   - `Docs/superpowers/specs/2026-10-24-mutual-funds-tdd-backend-flow.md` — updated: §5's
     open item on Fund Overlap's artifact count marked resolved (struck through, with the
     resolution recorded); the nav-shell route-conflict item is unchanged/still open (see
     §2 below — artifact-count resolution doesn't resolve the routing-table conflict).
   - `Docs/superpowers/specs/2026-10-24-mutual-funds-restructure-relayout.md` — updated:
     §1's table has a new Individual Fund page row; §3 rewritten with the final 3-artifact
     list and which file each lives in.
5. **Memory:** `project_mutual_funds_page_redesign.md`,
   `feedback_clickable_or_hoverable_rule.md`, `feedback_artifact_creativity_ceiling.md`
   already exist from earlier in this sub-project; this file is this session's record of
   what changed — update `project_mutual_funds_page_redesign.md`'s status line in a future
   session once this handoff is read, to point at this version instead of the superseded one.

## 2. What's NOT done — the real remaining scope

1. **Allocation's selectable chart-type requirement** (design.md §11.2 / PRD-06 §4.2) — By
   AMC, By Fund Manager, By Category, By Asset Class must each let the user pick
   pie/bar/other. Still not built — Round 6 still uses donuts throughout for these four.
   Market Cap is unaffected (not named in this requirement).
2. **Re-audit Overview and Performance against §11.1** — carried over from the previous
   handoff, still not done. The interactivity rule was stated as universal, but no
   mockup-by-mockup pass has re-checked Overview's SIP capsules/Compare Distributors modal
   or Performance's race-track/chip controls against the now-final §11.1 text (they were
   informally praised as good examples when §11.1 was being written, not formally audited).
3. **Nav-shell route conflict** (`portfolio-mutual-funds-overlap-compare` has nothing to
   render) — still open, still needs a conversation with the nav-shell owner, design.md
   §0/§7.5. The Fund Overlap artifact-count resolution (§1 above) does NOT resolve this: the
   comparison screen now definitively lives inside the Individual Fund page rather than at
   a portfolio-level route, which if anything makes the stale contract entry more clearly
   wrong and more worth fixing soon, not less.
4. **Layout-fidelity feedback offer** (design.md §10) — the owner previously said they
   remain unhappy with earlier mockups' overall layout fidelity and offered
   section-by-section reference screenshots. Still open, not taken up this session for the
   5 new artifacts either.
5. **Backend work items flagged but not yet built** (design, not implementation, is this
   sub-project's scope — these are implementation follow-ups once mockups are approved):
   - `sebi_category` field on the dashboard `HoldingRow` (Overview).
   - 4 additional benchmark indices + windowed XIRR + the index×window precompute shape
     (Performance).
   - Fund Overlap's "excluded funds" count — needs a quick check of `overlap.py`'s current
     return shape before assuming it's new work (TDD doc §2.3).
   - Per-fund market-cap aggregation for the Individual Fund page's Market Cap Comparison
     sub-tab (TDD doc §2.4).
6. **Actual frontend implementation** — everything built so far across this whole
   sub-project is HTML/CSS/JS mockups for sign-off, not production React. No implementation
   work has started on any of the 8 pages.

## 3. Suggested order for the next session

1. Take up the owner's layout-fidelity feedback offer (§2.4) if they're ready — cheaper to
   fold reference screenshots into a revision pass now than to discover a mismatch after
   implementation starts.
2. Build Allocation's selectable chart-type picker (§2.1) — the one explicitly-scoped mockup
   gap left in the whole set.
3. Do the §11.1 re-audit on Overview and Performance (§2.2) — closes out the interactivity
   rule as genuinely universal rather than "applied to everything built after Allocation."
4. Raise the nav-shell route conflict with its owner (§2.3) — now has a definitive answer
   (comparison screen lives in the Individual Fund page) to bring to that conversation.
5. Once mockups are fully signed off, move to implementation planning: this is a larger,
   separate effort (production React, the backend work items in §2.5, routing changes) that
   deserves its own planning pass rather than folding into this mockup sub-project.

## 4. Open questions — none blocking further mockup work

All of this sub-project's original open questions (Fund Overlap artifact count/"two
states", CDD, Individual Fund page scope) are resolved — see §1 above. The only
remaining open item that needs the owner's input before more mockup work is whether they
want to take up the layout-fidelity reference-screenshot offer (§2.4) before the next
revision pass; everything else in §2 is buildable without further owner input.

## 5. Continuation prompt for a new session

```
Continue the Mutual Funds page redesign (Docs/orchestration/2026-10-23-mutual-funds-page-design.md
is the design.md source of truth, see its §11 for the consolidated design philosophy).
Read Docs/orchestration/2026-10-24-mutual-funds-redesign-handoff.md in full first — all 8
mockups (Overview, Performance, Allocation, Holdings, Transactions, Other Analytics, Fund
Overlap, Individual Fund) are now built and the original open questions (Fund Overlap
artifact count, CDD, Individual Fund page scope) are resolved. No new AskUserQuestion is
needed to start this session's work.

Remaining scope, in the suggested order (handoff §3):
1. Ask whether I'm ready to provide section-by-section reference screenshots for a
   layout-fidelity pass (design.md §10) — if yes, do that revision pass before anything else.
2. Build Allocation's selectable chart-type picker (pie/bar/other per breakdown) for By AMC,
   By Fund Manager, By Category, and By Asset Class — design.md §11.2, PRD-06 §4.2. Market
   Cap is unaffected.
3. Re-audit Overview and Performance against design.md §11.1's interactivity rule (every
   element meaningfully clickable with visible cause-and-effect, or hoverable-with-popup) —
   this rule drove the Allocation Round 5 -> Round 6 rework, and Overview/Performance have
   never been formally checked against the final text.
4. Flag the nav-shell route conflict (`portfolio-mutual-funds-overlap-compare` has nothing
   to render) for a conversation with its owner — now resolvable since the comparison
   screen's final home (inside the Individual Fund page) is confirmed.

Present each change for my sign-off before moving to the next one, same process as before.
```
