# Mutual Funds Page Redesign — Handoff (2026-10-24, rewritten again — supersedes all earlier versions of this file)

Written because the session is at its context limit. This version supersedes every
earlier version of this file — read this one, not any cached memory of an earlier one.
Read this first in a new session before touching any mockup or document in this
sub-project. No new `AskUserQuestion` is needed to start — everything below is either
decided or has a concrete next action.

## 1. Where this sub-project actually is right now

The owner is going **artifact-by-artifact through the 9 mockups (8 original + the
Transactions mockup, formally tracked as item 8a below), giving explicit
sign-off per artifact before moving to the next one** (this is the standing process —
only overridden once, explicitly, for Other Analytics' internal 4-group build, see §2).

Status per artifact:

1. **Overview** — signed off.
2. **Performance** — signed off.
3. **Allocation** — signed off.
4. **Holdings** — signed off.
5. **Other Analytics** — signed off (Round 4: TER ladder click-to-expand + P/E-P/B
   view-mode toggle). See §2 for history.
6. **Fund Overlap (portfolio-level)** — signed off. Round 2: heatmap expanded from a
   6-fund/15-pair slice to all 12 equity funds/66 pairs, detail panel moved beside the
   grid and pre-populated by default (highest-overlap pair) instead of empty-until-click,
   per-cell intensity bars added; also corrected a stat-strip number ("8 of 66" overlapping
   pairs was stale against the ≥20% threshold it's supposed to reflect — real count is
   20) that the expanded grid made visibly wrong. Round 2.1 (presentation polish, owner
   ask: "make it much more presentable... without changing much about it"): icon badges +
   full tinted backgrounds on the two risk stat tiles, a proportional exposure bar in
   Common Holdings, chip-avatars + hover tooltips on Top Overlapping Fund Pairs rows,
   native hover tooltips on heatmap cells. **Real fund-house logos instead of 2–3 letter
   initial chips is an explicit owner ask, deliberately deferred, not built** — see §4's
   new logo note for what this means for every artifact, not just this one.
   File: `Docs/orchestration/2026-10-24-mutual-funds-overlap-mockup.html`.
7. **Individual Fund mockup** — signed off. Round 2: dropped the Overview/Insights tabs
   and the tab bar itself entirely (a single remaining tab isn't a tab) — the page is now
   just the fund header + Overlap Analysis. §11.1 audit of both the normal and comparison
   states found and fixed two real gaps: Common Holdings by Sector bars were static (now
   click-to-expand to contributing stocks, same pattern as Other Analytics' leaderboard
   rows) and the comparison state's impact-donut/legend had no click handlers at all even
   though the motion spec already (wrongly) claimed they did — now wired with the standard
   isolate-on-click pattern. Every remaining static row/bar without a click destination
   got a hover tooltip. Top Funds with Overlap rows got chip-avatars for consistency with
   the Fund Overlap mockup, same logo-deferral `decided-against` note.
   File: `Docs/orchestration/2026-10-24-mutual-funds-individual-fund-mockup.html`.
8. **Cross-cutting audit** — done, this round. All 4 findings actioned; see
   `Docs/orchestration/2026-10-24-mutual-funds-cross-cutting-audit-findings.md` for the
   full per-finding resolution record. Summary: Transactions mockup (see item 8a below)
   got its 3 missing fields built in full (SIP/missed-instalment, gifts, opening
   holdings); Holdings, Other Analytics, and Fund Overlap each got a simple
   headline-only `CoverageBanner` stub line; Other Analytics also got a one-line
   Valuation-edge-states stub (both-thresholds sentence + one example footnote); Fund
   Overlap got a full, non-stubbed "Stock Concentration" section (Section 5 — SVG
   cumulative-exposure curve, clickable chips, headline, all real cross-file links into
   Holdings' new `#all-holdings` anchor) plus a documented (not live-toggled)
   "what this section shows in other scenarios" panel for its 3 smaller edge states.
   **Still open, carried into item 9 as explicit planned work, not silently dropped:**
   - Full `CoverageBanner` port (Holdings, Other Analytics, Fund Overlap) — per-fund
     not-published/not-available/stale reasons + derivative-exclusion share. Allocation's
     existing `.coverage-banner`/`.cb-title` markup (lines ~128-133, 367-400) is the
     template to replicate.
   - Full `ValuationSection` edge states (Other Analytics) — real hidden-ratio and
     not-enough-data rendered states, the complete per-stock exclusions list, the
     complete footnotes array (currently one example each).
   8a. **Transactions mockup** — formally tracked here (was built 2026-10-24 in the prior
   session but never added to this artifact list). File:
   `Docs/orchestration/2026-10-24-mutual-funds-transactions-mockup.html`. Signed off;
   Round 2 (this session, Finding 1 of the cross-cutting audit) added the SIP/missed-
   instalment banner, gifts-net note, and opening-holdings note, plus a shared
   `setType()`/`syncStatHighlight()` state sync between the stat tiles and the ledger
   filter toggle.
9. **Docs + commit** — done. `design.md` §11.6, `PRD-06` §4.4, the TDD spec §6, and the
   restructure spec all updated with the audit findings and the two deferred items (full
   `CoverageBanner` port; full `ValuationSection` edge states). This handoff doc updated
   same pass (item 8/8a above). Committed to `feat/leapswitch-staging`. Sub-project
   fully closed pending the owner's sign-off on the audit-round mockup changes themselves
   (not yet given as of this doc's last edit).

**Process reminder for whoever picks this up:** present each change for the owner's
sign-off before moving to the next one — this is the default process, and item 5's
internal 4-group build is the one documented exception (owner explicitly said "build
all four groups together, don't wait for sign-off between them, then show me all
four"), not a new standing rule.

## 2. Other Analytics — exact state and the live Round 4 task

File: `Docs/orchestration/2026-10-24-mutual-funds-other-analytics-mockup.html`
(currently 278 `<div>`/`</div>` pairs, inline `<script>` syntax-clean — both verified
after every round below).

**Round 1** (original build): 4 visually distinct groups — Cost & Valuation, Fund
Quality Scorer, SEBI Category Ranking & Peer Comparison, Fund Ranking.

**Round 2** (data/content audit-driven rebuild, done after the owner asked for all 4
groups to be reworked together): fixed two design-integrity problems found via a
field-by-field audit against the live production components
(`TerSection`/`FundTerTable`/`ValuationSection`/`ScorerSection`/`FundScoreCard`/
`CategoryRankingSection`/`PeriodReturnsTable`/`FundRankingSection`):
1. The old "switch your Regular funds to Direct, save ₹1.9L" banner contradicted a
   real, already-decided product rule (`TerSection`'s "#17 (decided 6 Oct)" comment —
   Direct and Regular hold *different* fund baskets, so an average-vs-average gap isn't
   a real per-fund saving). Replaced with a grounded line built from the real,
   already-computed `annual_ter_saving` field (each Direct holding's own saving vs. its
   own Regular-plan sibling's TER) — zero new backend work.
2. Category Ranking's fabricated named-peer table (e.g. "ABC Multi Cap Fund") was
   removed entirely, replaced with the real `PeriodReturnsTable` shape (fund vs.
   anonymised category average, 1Y/3Y/5Y, percentile + outperform/underperform line) —
   production never surfaces named individual peers for category ranking (it does for
   Fund Ranking, which is a different, transparent-formula feature — that one keeps
   named leaderboard neighbors).
Also added: AUM-weighted/coverage figures, per-fund cost projections with a totals row,
a TER-exclusions callout, Nifty 50 + Nifty 500 valuation comparisons with narrative
deltas (was Nifty 500 only), a portfolio-level weighted score hero + unscored-funds
callout, a 5-tier bar / why-this-tier sentence / Evidence+Methodology accordions on the
Scorer detail panel, and a per-component percentile breakdown on Fund Ranking expand.
At least one real edge state is now shown inline per group (unscored fund, thin
category, too-few-peers, category-data-unavailable).

**Round 3** (visual-design elevation pass — done after the owner rejected Round 2's
*presentation*, even though its data/content was correct):

> "They now do match our original vision of what should have been in them... but
> presentation-wise, look-wise, still looks exactly like what it looked in the analytics
> section... Design-wise, UI-wise, no improvement... That needs to be done now."

Replaced every generic bordered label/value box and plain HTML table with a designed
visual, reusing the logo-chip-avatar + leaderboard-bar visual language the Holdings
mockup already got signed off on:
- Group 1 (TER): 3-stat-box grid → radial SVG gauge + Direct/Regular spectrum scale
  with pins. Plain cost table → `.ladder-row`s (logo-chip avatar, colour-coded fill bar
  sized to TER, totals row). Nifty 50/Nifty 500 P/E and P/B comparisons: stacked bars →
  spectrum scales with 3 positioned pins each.
- Group 2 (Scorer): plain hero row → radial score gauge. Per-fund detail's 5-tier
  breakdown: plain stat row → gradient tier-track with a flag/pin marker.
  Evidence/Methodology accordions gained colour-coded icon chips.
- Group 3 (Category Rank): flat progress bar → colour-tiered (red/amber/green)
  percentile marker on a gradient track.
- Group 4 (Fund Rank): plain component table → colour-tiered horizontal bar rows.

Also fixed in Round 3: a real accordion open/close CSS bug (the JS was setting
`is-open` on `.accordion-body` itself; the CSS rule needed it on the ancestor
`.accordion-item` — the accordion would never have visually opened in a real browser);
a P/E/P/B spectrum pin-label collision on tightly-clustered values (fixed by widening
pin spacing from ~75–87% to 68/78/88% and tightening label padding — verified via a
headless-Chrome re-screenshot, no more collision). Several CSS classes orphaned by the
Round 2 content swap (`.cmp-bars`, `.cost-save-banner`, `.gauge-track`/`.gauge-fill`,
`.rank-pct-track`/`.rank-pct-fill`, `.peer-table`) were confirmed unused via grep and
removed. The in-file "Data source mapping"/"Motion & interaction spec" tables and the
`.locked-note` changelog at the bottom of the file are fully up to date through Round 3
— read that `.locked-note` block directly in the file for the canonical written record
instead of re-deriving it from this summary.

**Round 3 was presented to the owner. Their response — two concrete, scoped fixes,
everything else approved:**

> "TER looks good, but [when you] click on one fund it should drop down [and] show
> one year, three year, and five year values... For P/E and P/B values [I want the]
> ability to switch between racetrack kind [of visualization] and also bar chart kind
> [of visualization], so I can see properly every single thing. These two changes...
> other than that, everything looks good. Just make things clickable for TER cost
> analysis and portfolio valuation versus benchmarks."

### Round 4 — the live task for the next session, in concrete implementation terms

**Fix A — TER cost ladder rows must be clickable, expanding to a 1Y/3Y/5Y breakdown.**

Currently (as of Round 3) the 5 `.ladder-row` divs under "Cost ladder — relative TER
across your holdings" (~line 420–471) are static HTML with no click handler and no
expand state. The owner wants the same click-to-expand pattern Category Ranking and
Fund Ranking already use — don't invent a new pattern, port the existing one:

- Reference implementation: `renderCatRank()` (~line 783–807 as of Round 3) and
  `renderFundRank()` (~line 828–854) — both keep an `openCatRank`/`openFundRank` index
  variable, render rows with `data-idx`, a `.rank-detail` sibling div holding the
  expanded content, toggle an `is-open` class, and re-render on row click via
  `addEventListener('click', ...)`.
- `renderCatRank()`'s detail markup specifically (the `<table class="mini-table">` with
  `<th></th><th class="num">1Y</th><th class="num">3Y</th><th class="num">5Y</th>` and a
  Difference row via `diffCell()`) is the closest existing shape to what's wanted here —
  reuse that `.mini-table` pattern rather than building a new table style.
- The TER ladder rows currently aren't driven by a JS data array (they're hand-written
  HTML) — Round 4 needs to convert them to a `TERFUNDS`-style array (name, chip
  initials/colour, TER%, plan, value, 1yr/3yr/5yr projected cost — all already present
  per-row) plus new `fund1y`/`fund3y`/`fund5y` fields, then a `renderTerLadder()`
  function, mirroring `renderCatRank()`'s structure.
- **Fund-value-consistency rule (design.md §11.4):** Kotak Multi Cap Fund, JM Flexi Cap
  Fund, and HDFC Mid-Cap Opportunities Fund already have real `fund1y`/`fund3y`/`fund5y`
  figures defined in the `CATRANK` array (~line 765–772 as of Round 3) — reuse those
  exact numbers for those 3 funds rather than inventing new ones. Parag Parikh Flexi Cap
  Fund isn't in `CATRANK` and needs new (but realistic) 1Y/3Y/5Y figures. SBI Small Cap
  Fund is the existing "no TER on file" edge-state row (muted, empty track) — give it a
  consistent "no return data on file" (or similar) treatment in the expand state rather
  than silently showing nothing.

**Fix B — P/E and P/B panels need a view-mode toggle: spectrum ("racetrack") vs. bar
chart.**

Currently (Round 3) each of the two panels under "Portfolio Valuation vs. Benchmarks"
(~line 482–510) renders only the spectrum/pin-scale visual. The owner wants to be able
to switch to a bar-chart view of the same N50/N500/You comparison, to "see properly
every single thing" — implying the spectrum view compresses visual separation when
values are close together (this is the same root cause as the pin-label collision Round
3 just fixed) and a bar chart would make small differences easier to read at a glance.

- Precedent to follow: this page set already has a chart-type-picker pattern elsewhere
  in the redesign (Performance's chart-type picker, Allocation's pie/bar/other picker
  per design.md §11.2) — use the same interaction style (small toggle/chip control, not
  a new UI idiom) rather than inventing a third pattern.
- Open implementation question for the next session to decide (not blocking, but worth
  deciding deliberately rather than defaulting): one shared toggle that switches both
  P/E and P/B panels together, or two independent toggles? A shared toggle is probably
  right (both panels are conceptually the same comparison, just a different ratio), but
  confirm this reads cleanly once both bar-chart views are mocked up side by side.
- Bar-chart view should show the same 3 series (N50, N500, You) with the same colour
  coding already established (`--c3`/blue for N50, `--muted`/grey for N500, `--c1`/pos
  green for You) so switching modes doesn't also change the colour language.

**After Fix A and Fix B:** re-run the standard verification (div-tag balance, extracted
`<script>` block through `node`'s `new Function()`), re-screenshot via headless Chrome
(see §3 for the exact command — this technique is new this session and worked well),
review the new interactive states visually, update the `.locked-note` changelog with a
Round 4 paragraph (same style as the existing Round 2/Round 3 paragraphs — lead with
what the owner said, then what changed, then what was verified), and present to the
owner for sign-off before moving to Fund Overlap (§1 item 6).

## 3. Reusable technique: headless-Chrome screenshot review

Established this session, worked well, reuse for Round 4 and every subsequent mockup:

```bash
WIN_OUT=$(wslpath -w "/path/to/scratchpad/shots")
WIN_HTML=$(wslpath -w "/mnt/d/Unifolio code/Docs/orchestration/<file>.html")
"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu \
  --screenshot="$WIN_OUT\\full.png" --window-size=1700,6000 \
  --default-background-color=FFFFFFFF "file:///$WIN_HTML"
```

Then slice the full-page PNG into ~700–900px-tall chunks with Python/PIL and review
each with the Read tool (which renders images) — a single full-page screenshot is too
tall to read in one pass. Windows Chrome is reachable from WSL at that fixed path; both
the HTML input and the output directory must go through `wslpath -w`.

Verification pattern (run after every edit round, before screenshotting):
```bash
grep -o '<div' "$FILE" | wc -l   # must equal:
grep -o '</div>' "$FILE" | wc -l
node -e "
const fs = require('fs');
const html = fs.readFileSync('$FILE','utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
new Function(m[1]);
console.log('JS syntax OK');
"
```
Note: these two checks catch structural/syntax breakage but NOT CSS selector logic bugs
(e.g. the Round 3 accordion `is-open`-on-wrong-element bug) — those need an actual
visual screenshot review or careful CSS-vs-markup cross-reading, not just these checks.

## 4. Design language established across the page set (apply to Fund Overlap + Individual Fund too)

Shared design-token CSS: DM Sans/Manrope fonts, `--brand`/`--accent:#22C55E` green,
`--pos`/`--warn`/`--neg` (+ `-text`/`-bg` variants), data-viz palette `--c1`...`--c8`,
`--radius-*`/`--shadow-*` scales, `--fast`/`--pop` transition timings — same tokens,
every mockup, don't reinvent.

**design.md §11.1 interactivity rule** (binding on every artifact, not just Other
Analytics): every element must be clickable-with-visible-cause-effect or
hoverable-with-tooltip. No dead/disconnected clicks.

**Visual-elevation principle** (the hard lesson from this session, apply proactively to
Fund Overlap and Individual Fund rather than waiting for the same correction twice): a
redesign that's merely data-correct but visually identical in *pattern* to the current
production dashboard (bordered label/value boxes, plain HTML tables) reads to the owner
as "no improvement" even when the underlying content is right. Default to
designed-instrument visuals — radial gauges, spectrum/pin scales, gradient tracks,
leaderboard-style bar rows with logo-chip avatars — not bordered boxes and plain tables,
from the first draft of each remaining artifact, not as a second-pass correction.

**Real fund-house logos (owner ask, 2026-10-24, deferred — not a mockup task):** every
"logo-chip avatar" across this whole page set (Common Holdings, Top Overlapping Fund
Pairs, the Overlap Heatmap's row/column headers, Holdings' fund table, etc.) currently
uses 2–3 letter initials on a flat colour circle (`FUND_SHORT` + `.fund-chip-mini` or
equivalent per file) because there's no real logo asset source available to a static
mockup. The owner wants actual AMC/fund-house logos there instead, once production has
an asset source — not simulated with placeholder images now. This needs a decision before
it's buildable for real: an AMC-logo CDN/library, a self-hosted asset set, or something
derived from `scheme_master`. When that's decided, the swap is mechanical everywhere this
pattern appears — same circular chip size/position, logo image instead of initials-on-
colour, with the initials kept as the broken-image/loading fallback. Tracked per-artifact
via a `decided-against` note (see the Fund Overlap mockup's for the canonical wording);
add the same note to Individual Fund and any other remaining artifact that uses this
pattern, rather than re-deciding it each time.

## 5. Continuation prompt for the next session

```
Continue the Mutual Funds page redesign. Read
Docs/orchestration/2026-10-24-mutual-funds-redesign-handoff.md in full first — it is
the current, superseding handoff; ignore any earlier cached version. No new
AskUserQuestion needed to start.

Other Analytics (signed off, Round 4), Fund Overlap (signed off, Round 2 + a 2.1
presentation-polish round), Individual Fund (signed off, Round 2), Transactions (signed
off, Round 2), and the cross-cutting audit (item 8, all 4 findings actioned) are all
done — see handoff §1 items 5–8a for what shipped in each, including a deferred "real
fund-house logos" owner ask that applies to every artifact (§4's new logo note) and two
explicit deferred items from the audit (full `CoverageBanner` port, full
`ValuationSection` edge states — see item 8's "still open" list).

Live task: present this round's cross-cutting-audit work (item 8) to the owner for
sign-off — not yet done. Then:
9. Update design.md, PRD-06, the TDD spec, the restructure spec, and this handoff doc,
   carrying the two "still open" items from item 8 forward as tracked deferred work, then
   commit everything.

Present each change for my sign-off before moving to the next one — same process as
before, no exceptions unless I explicitly say otherwise for a specific artifact.
```
