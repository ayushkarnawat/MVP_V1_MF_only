# Cross-cutting audit findings (item 8)

Audited every production analytics component under `frontend/src/features/analytics/`
against the mockups' own "Data source mapping" tables. Four gaps found, confirmed by
grepping the mockup files for the production component's actual strings/field names
(zero matches = genuinely absent, not just renamed). All 4 have now been actioned —
see each section's "Resolution" for what was built vs. recorded as deferred.

## 1. Investment & Withdrawal cashflow

**Original finding (corrected, see below):** flagged as "a whole missing feature,"
having not checked the (then-untracked) Transactions mockup. **Correction, per owner:**
`2026-10-24-mutual-funds-transactions-mockup.html` already covers the bulk of
`InvestmentWithdrawalSection.tsx` — 5-tile stat strip, monthly/yearly bar chart with
click-to-drill period breakdown, "Include switches" toggle. Only 3 fields were
genuinely missing: the active-SIPs/missed-instalment summary (`sip_summary`), the
gifts given/received disclosure (`gifts_net`), and the opening-holdings note
(`opening_holdings`).

**Resolution:** built in full, not deferred. Added a SIP banner (active count, ₹/month
— reusing Overview's exact "₹45,000" figure per the fund-value-consistency rule — and a
missed-instalment badge) plus opening-holdings/gifts notes to the Transactions mockup.
Also added a shared `setType()`/`syncStatHighlight()` state sync so the stat-tile clicks
and the ledger's own filter toggle stay mutually consistent. Verified (div-balance, JS
syntax, headless-Chrome screenshot) and spec-documented.

## 2. `CoverageBanner` look-through disclosure — missing from 3 of 5 sections that have it

`CoverageBanner.tsx` (the "Based on X% of your portfolio" + per-fund reason list — not
published yet / not available from this AMC / value unavailable / stale-by-age +
derivative-exclusion share) is used by 5 production sections. Present and correct in
the Allocation mockup. Confirmed absent from Holdings, Other Analytics (`ValuationSection`),
and Fund Overlap (`OverlapSection`).

**Resolution, per owner's explicit call ("don't need to add in the mock-up right now...
add a simple thing... but make sure it's added that we need to add this coverage banner,
in your planning"):**
- **Holdings:** added a simple headline-only coverage line ("Based on 91.4% of your
  portfolio...") under Card 2. Not built: the per-fund reason list, derivative-exclusion
  share.
- **Other Analytics:** added a simple threshold-mention line to the Valuation card
  (folded together with Finding 3's work, see below — same owner instruction, same
  card).
- **Fund Overlap:** added the same simple headline-only line above the stat strip
  (Round 4, added after an initial pass missed it — caught on re-check against this
  findings doc).

**Deferred/open work (recorded here per the owner's explicit instruction, not silently
dropped):** the full `CoverageBanner` port — per-fund not-published/not-available/stale
reasons + derivative-exclusion share — for Holdings, Other Analytics, AND Fund Overlap
(all 3 currently show only the headline %, not the reason list). Allocation's existing
`.coverage-banner`/`.cb-title` markup (lines ~128-133, 367-400) is the template to
replicate. See the redesign handoff doc's open-items list.

## 3. Valuation-specific edge states — Other Analytics

Beyond the missing CoverageBanner (#2), `ValuationSection.tsx` has edge states not
represented in the Other Analytics mockup's valuation block: ratio hidden below 50%
coverage (`hide_headlines`), "not enough data" below 70% (`enough_data`), a per-stock
"excluded and why" list (`metric.missing`), and a `footnotes` array.

**Resolution, per owner's call ("same for this"):** added one line stating both
thresholds explicitly, plus one example footnote (Max Healthcare Institute Ltd, 4 days
stale), to the Valuation card — always shown at full-fidelity data, never actually
triggers the hidden/insufficient-data states.

**Deferred/open work:** the real hidden-ratio and not-enough-data rendered states, the
full per-stock exclusions list (currently only 1 example shown, same as before this
round), and the full footnotes array (currently only 1 example). See the redesign
handoff doc's open-items list.

## 4. Stock concentration sub-section — Fund Overlap

`OverlapSection.tsx` has a distinct "Stock concentration" block below the overlap
matrix: a cumulative-exposure-curve chart (SVG polyline), clickable concentration-point
chips, and a "Top N stocks represent X%" headline (gated by `hide_headlines`). Was
entirely absent from the Fund Overlap mockup. Also missing: 3 smaller edge states —
"at least two funds" empty state, "Top 12 funds by value, out of N covered funds"
truncation note, "no pairs above this threshold" empty state.

**Resolution, per owner's explicit instruction ("smartly add this... same vibe,
creatively presented, UX/UI should be enhanced") — built in full, not a stub:**
- New Section 5 card ("Stock Concentration") with a real SVG cumulative-exposure curve,
  clickable chips, and a headline sentence — all reusing this page's existing chart/
  chip/button visual language.
- Headline, chart, and every chip are real cross-file links to the Holdings mockup's
  "All Holdings Across Your Portfolio" card (new `id="all-holdings"` anchor added
  there) — matching production, where all three call the same `onOpenStocks` handler
  rather than three different behaviours.
- Added the always-true "Covered funds, largest portfolio value first" line under the
  heatmap (this dataset's real non-truncated-branch text).
- The 3 smaller edge states — which all require a fund/pair count this mockup's
  12-fund/20-pair dataset doesn't have — are documented in a new inline "What this
  section shows in other scenarios" panel plus a `decided-against` note, rather than
  built as live toggles (would require degrading the already-signed-off happy-path
  dataset).

Verified (div-balance, JS syntax, headless-Chrome screenshot) and spec-documented.

## Non-findings (checked, already correct)

- PDF export: deliberately removed from UI per an existing owner decision (page-decisions
  doc), code kept dormant — not a gap.
- `FundManagerSection`, `BenchmarkSection`, `FundScoreDetailModal`: all have mockup
  equivalents (Allocation, Performance Block 3, Other Analytics' scorer modal respectively).
- Real AMC-logo resolution (`amcLogos.ts`/`SchemeLogo.tsx`) exists in the codebase but is
  dead/orphaned — built for the since-removed Import Review screen, not wired into any
  live analytics surface. Doesn't change the mockups' logo-deferral `decided-against`
  notes (still true that there's no *live* logo source today), but worth knowing it's not
  a from-scratch build if that decision is revisited later.

Checked separately: whole-dashboard `fetchError`/Retry state (`AnalyticsView.tsx`) —
present in some form in Overview, Performance, Allocation, and Individual Fund too, not
just Other Analytics. No gap there.

## Summary of what's still genuinely open after this round

1. Full `CoverageBanner` port (Holdings, Other Analytics, Fund Overlap) — all 3 have a
   headline-only stub today, none have the per-fund reason list or derivative-exclusion
   share.
2. Full `ValuationSection` edge states (hidden-ratio/not-enough-data rendered states,
   complete exclusions list, complete footnotes array) — one-line/one-example stub today.

Both are now tracked in the redesign handoff doc's open-items list.
