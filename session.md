# Session state — 2026-08-11 (updated)

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## Phase 4 Part 3: NSE Indices → benchmark comparison (PRD-04 FR-8/FR-9) — built and committed

Built directly (TDD, one task per commit) per the Phase 4 design doc's
build order, continuing straight on from Part 2 in the same session rather
than a fresh one.

**`backend/app/services/analytics/nse_indices_client.py`** — fetch/cache
client for `niftyindices.com`'s historical-levels endpoint. Corrects a
stale endpoint path in the Phase 4 design doc and `TDD-Unifolio.md`
(`Backpage.aspx/getHistoricaldatatabletoString` is dead — niftyindices.com
moved off `.aspx`); live-verified this session via `curl`/ad hoc Python
against the real site (not just re-trusted from the design doc): the
working endpoint is `POST /BackPage/getHistoricaldatatabletoString` (no
`.aspx`, requires a browser `User-Agent` or the site silently drops the
request), body `{"cinfo": "<nested JSON string>"}`, and the response's
`HistoricalDate` field is formatted `"10 Aug 2026"` (`%d %b %Y`) — none of
this had been captured verbatim anywhere before. All 4
`Trading_Index_Name` mappings (Nifty 50, Nifty 500, Nifty LargeMidcap 250,
Nifty Midcap 150) confirmed working live. `TDD-Unifolio.md`'s row for this
integration is corrected accordingly. `ensure_index_history_fresh(db,
index, start_date, end_date)` is bulk-per-index-per-range (unlike `nav.py`'s
per-scheme fetches) and skips the network call entirely when cached date
bounds already cover the requested range — avoids redundant HTTP calls
across the 4 indices within a single XIRR computation. Degrades to
`False`/no-op on any fetch failure, same convention as `nav.py`/`arn_lookup.py`.

**`backend/app/services/analytics/xirr.py`** — pure `decimal.Decimal`
Newton-Raphson XIRR solver, no numpy/scipy. `Decimal ** Decimal` supports
fractional exponents for a positive base, so `(1+rate) ** (days/365)` never
touches `float`, per CLAUDE.md's Decimal-never-float rule. Degrades to
`None` on non-convergence rather than raising.

**`backend/app/services/analytics/benchmark.py`** — `compute_portfolio_vs_benchmarks`
(FR-8: whole-portfolio XIRR alongside all 4 index XIRRs) and
`compute_fund_vs_benchmark` (FR-9: per-fund-appropriate benchmark, plus an
overall portfolio-vs-Nifty-500 view), each with a family-aggregate wrapper.
Two judgment calls not fully spelled out by the PRD, flagged in-code per
CLAUDE.md's "stop and say so" (see the module's docstring and
`_benchmark_index_for_category`'s docstring for full reasoning): **(1)**
benchmark-hypothetical XIRR replays each real transaction against the
index — same cash-flow dates/amounts as the real portfolio, purchases buy
`amount / index_level_on_date` hypothetical units, redemptions sell that
many, only the terminal value differs (`net_units * today's index level`).
**(2)** since only 4 benchmark indices exist in scope, every SEBI category
folds into one via substring match on "LARGE"/"MID" (Large Cap → Nifty 50,
Mid Cap → Nifty Midcap 150, Large & Mid Cap → Nifty LargeMidcap 250,
everything else — Flexi/Multi/Small Cap, Value/Contra, Sectoral, ELSS,
Debt, Hybrid, etc. — falls back to Nifty 500 as the broad-market default);
never excludes a fund from comparison. Every missing-index-history date is
skipped rather than crashing the whole comparison.

**Routes:** `GET /analytics/household-members/{id}/benchmark`,
`.../benchmark/funds`, and family-aggregate variants
(`/analytics/household/aggregate/benchmark[/funds]`), mirroring the
existing allocation/ter routes' auth/404/response-shape pattern exactly.

**Backend suite: 286 passing, 2 skipped** (up from 250/2) — 36 new tests
(7 NSE client + 8 XIRR + 11 benchmark service + 10 routes), zero
regressions, verified re-running the full suite. Five commits, one per
task (`0b9fffc` NSE client, `59d995b` XIRR, `9960565` FR-8 benchmark,
`0e4c6f9` FR-9 benchmark, `66d0540` routes).

**Not yet done:** knowledge graph not refreshed for this work — treat
`analytics/nse_indices_client.py`, `xirr.py`, `benchmark.py`, and the 4 new
routes as stale in the graph until a fresh `/understand` run. Per the
design doc's 5-step build order, **Part 4 (category-universe NAV caching →
ranking, FR-3/FR-4) is next**, with the Scorer (FR-5/FR-6/FR-7) built last
since it depends on Parts 2–4.

## Phase 4 Part 2: AMFI TER + AAUM integrations → weighted TER (PRD-04 FR-10/FR-11) — built and committed

Built directly (TDD, one task per commit) per the Phase 4 design doc's
build order (`Docs/superpowers/plans/2026-08-10-phase-4-analytics-backend-design.md`),
without a separate written task-by-task plan file — the design doc already
carried full research/spec, and this was executed in one continuous
session rather than delegated to subagents.

**`backend/app/services/analytics/amfi_ter_client.py`** — bulk TER
ingestion. `refresh_ter_data(db)` fetches the latest published month from
AMFI (`populate-ter-month` → `populate-te-rdata-revised`, paginated),
dedupes to the latest `TER_Date` per `Scheme_Name` (AMFI republishes daily
even unchanged), and fuzzy-matches each locally-known scheme with a
resolved Direct/Regular plan variant against that name list
(`difflib.SequenceMatcher`, same idiom as `import_/enrich.py`). One real
tuning finding: `enrich.py`'s 0.92 confirmation threshold doesn't work
here — local scheme names carry a "- Direct/Regular Plan - Growth" suffix
AMFI's plan-generic `Scheme_Name` never has, capping a genuine match's
ratio around 0.67 against an unrelated pair's ~0.26; landed on 0.55 after
computing both live, comfortable margin either side. Degrades gracefully
(returns `False`, writes nothing) on fetch failure or an empty month.

**`backend/app/services/analytics/amfi_aaum_client.py`** — bulk AAUM
ingestion, front-loaded per the design doc's build order even though
FR-10/FR-11 don't consume it (infrastructure for the later FR-4 step).
Matches directly by `AMFI_Code` (no fuzzy matching needed, unlike TER).
**Flagged, not silently assumed:** the financial-years endpoint's shape
was live-verified during design research, but the intermediate
"periods within a financial year" endpoint's exact response shape was
never captured — this module assumes the same envelope by analogy and
documents that assumption inline (module docstring), recommending
live-verification before FR-4 relies on it. Every failure mode here
(missing years/periods, unparseable period label, zero scheme matches)
degrades to "nothing ingested," never a wrong value.

**`backend/app/services/analytics/ter.py`** — `compute_weighted_ter`
(FR-10) and `compute_direct_regular_ter_comparison` (FR-11). Resolves a
real ambiguity in PRD-04's own text: the PRD calls FR-10 "AUM-weighted,"
but the design doc's research already clarified this means weighted by
the *user's own holding value*, not the fund's platform-wide AAUM — this
module never reads `scheme_aaum`. TER is refreshed on-demand with one
bulk fetch (not one fetch per scheme, unlike NAV) only when a held scheme
lacks a current-month `scheme_ter` row; a scheme whose fuzzy match never
resolves is excluded from the weighted average and surfaced via
`uncovered_schemes` rather than silently miscomputed or crashing, per
PRD-04's "TER not yet published" edge case.

**Routes:** `GET /analytics/household-members/{id}/ter`,
`.../ter/direct-regular`, and family-aggregate variants
(`/analytics/household/aggregate/ter[/direct-regular]`), mirroring the
existing allocation routes' auth/404/response-shape pattern exactly.

**Backend suite: 250 passing, 2 skipped** (up from 215/2) — 40 new tests
across 4 new test files, zero regressions. Four commits, one per task
(`f6bbb5c` TER client, `b7197ed` AAUM client, `0971148` weighted TER +
Direct/Regular service, `e026751` routes).

**Not yet done:** the knowledge graph (`.ua/knowledge-graph.json`) has not
been refreshed for this work — a fresh session picking this up next
should treat the graph as stale for the new `analytics/` files until
re-run. AAUM's periods-endpoint shape (above) needs live verification
before FR-4 build starts. Per the design doc's build order, **Part 3 (NSE
Indices integration → benchmark comparison, FR-8/FR-9) is next.**

## Cleanup pass complete: knowledge graph refreshed, worktree branch deleted, CRLF noise reconfirmed harmless

Follow-up session to the CAS Import lifecycle sync (`af74384`) — worked
through the full punch list before starting Phase 4 Part 2.

**Knowledge graph re-refreshed (incremental `/understand` update) — now
matches current HEAD `35fedd38f968e5b763269a67dbe8d16eff44e9ed`.**
`.ua/knowledge-graph.json`: **661 nodes / 1657 edges / 10 layers / 15 tour
steps** (up from 533/1223/10/15 pre-refresh — the CAS Import lifecycle
feature added ~130 nodes across `backend/app/services/import_/`,
`backend/app/api/cas_imports.py`, the Alembic migration, and the whole
`frontend/src/features/import/` tree). Ran the full 7-phase pipeline
manually again (SCAN → BATCH → ANALYZE → ASSEMBLE REVIEW → ARCHITECTURE →
TOUR → REVIEW → SAVE) via the bundled scripts + subagent dispatches from
SKILL.md, same as the Phase 4 Part 1 refresh. Phase 1 re-scanned from
scratch (295 files, up from 262) since new files must be in `scan-result.json`
before `compute-batches.mjs --changed-files` can see them. 13 batches
dispatched to `file-analyzer` subagents (5+8 concurrent, small batches
fused for token efficiency); one subagent (the CLAUDE.md/session.md docs
batch) guessed two doc paths wrong (`Docs/TDD-Unifolio.md` instead of
`Docs/PRDs/TDD-Unifolio.md`, and a wrong `FundSignal.tsx` path) — the merge
script's dangling-edge dropper caught both, and both were manually
re-added with corrected paths after cross-checking the real file tree.
`assemble-reviewer` found nothing else to fix (0 nodes recovered, all 550
import-map edges already present). Architecture layers stayed at the same
10 (CAS Import files slotted into existing Service/API/UI/Test layers, no
new layer needed). Tour grew from 15 to still-15 steps — split the old
single "CAS Import Pipeline" step into "CAS Import: Upload & Parsing" +
"CAS Import Lifecycle: State Machine, Attribution & Coverage Gaps", and
merged "Frontend Entry Point" into "Frontend Auth & Onboarding" to stay
under the 15-step cap. Inline validation: 0 issues, 37 orphan-node warnings
(all pre-existing empty `__init__.py`/static doc files, expected).
`meta.json`/`fingerprints.json` both regenerated and now agree on
`gitCommitHash 35fedd38f...`.

**`feature/phase4-part1-allocation` local branch deleted.** The worktree
was already removed in the prior session; this session finished the
cleanup with `git branch -d feature/phase4-part1-allocation` (safe delete,
refused-if-unmerged check passed since it was confirmed fully merged into
`dev_intern`). No remote branch existed for it, so nothing to clean up
upstream.

**~50 files showing as modified in `git status` are still pure CRLF
noise** — reconfirmed via `git diff -w`, same pre-existing
checkout-environment quirk as `backend/app/api/{auth,dashboard,imports}.py`.
Not touched; not worth normalizing line endings repo-wide for.

**Push still pending** — this sandbox has no git credentials configured
(no credential helper, no SSH key), so `git push` fails immediately with
`could not read Password`. Push manually from a terminal with credentials,
or run `! git push origin dev_intern` in a Claude Code session that has
them.

## Phase 4 Part 1 (Analytics — category allocation, PRD-04 FR-1/FR-2) is built and merged to `dev_intern`

Built in an earlier Claude Code session on branch `feature/phase4-part1-allocation`
via a git worktree at `.worktrees/phase4-part1-allocation` (worktree since
removed — see note above; the branch itself is unaffected and still exists).
Merged into `dev_intern` this session with
`git merge --no-ff` (merge commit `1ab0fab`, auto-merged cleanly, zero
conflicts in the feature code). One unrelated conflict surfaced restoring
this session's own pre-merge stash (`backend/app/api/analytics.py` — the
stashed side was just the old pre-Phase-4 stub file, no real content;
resolved by keeping the merged version, nothing lost).

Per the design doc's build order (`Docs/superpowers/plans/2026-08-10-phase-4-analytics-backend-design.md`),
Analytics is being built in 5 steps: **(1) Allocation — done**, (2) AMFI
TER+AAUM → weighted TER (FR-10, FR-11), (3) NSE Indices → benchmark
comparison (FR-8, FR-9), (4) category-universe NAV caching → ranking (FR-3,
FR-4), (5) Scorer (FR-5, FR-6, FR-7, depends on 2–4). **Part 2 (TER/AAUM) is
next.**

**What Part 1 built:**
- `backend/app/services/analytics/allocation.py` — `compute_category_allocation`
  (SEBI-category + AMC buckets, Decimal-precise throughout) and
  `get_aggregate_category_allocation` (family-aggregate wrapper). Reuses
  `dashboard/holdings.py`'s existing FIFO engine rather than duplicating
  holdings computation — same pattern as `dashboard/allocation.py`'s
  by-AMC view.
- `backend/app/services/analytics/schemas.py` — `AnalyticsAllocationSummary`,
  `AggregateAnalyticsAllocationResponse`.
- Two new routes on `backend/app/api/analytics.py`:
  `GET /analytics/household-members/{member_id}/allocation` (per-member) and
  `GET /analytics/household/aggregate/allocation` (family aggregate).
- 8 new tests (5 route-level in `test_analytics_allocation_route.py`, 3
  service-level in `test_allocation.py`). **Backend suite: 164 passing, 2
  skipped (was 156)** — verified by running `pytest` after the merge, not
  just claimed.
- Plan docs: `Docs/superpowers/plans/2026-08-10-phase-4-analytics-backend-design.md`
  (full Analytics build-order design) and
  `...-part1-allocation.md` (Part 1's own TDD plan), plus a
  `Docs/PRDs/TDD-Unifolio.md` API-surface table correction.

**Branch state:** `dev_intern` is now **ahead 7 / behind 10 of
`origin/dev_intern`** (diverged — not pushed or pulled this session; no TTY
for credentials in this sandbox, sync manually). Also carried in from an
earlier commit on this branch (`675e0f2`, not part of the Phase 4 merge):
Claude plugin config + local headroom-wrap session hooks
(`.claude/settings.json`, `.claude/settings.local.json`).

**Knowledge graph refreshed (incremental `/understand` update, same
session).** `.ua/knowledge-graph.json` now matches `gitCommitHash
1ab0fabc9cd075e7b7a40e2a9dc37835b77267de` (the Phase 4 Part 1 merge commit):
533 nodes / 1223 edges / 10 layers / 15 tour steps (up from 505/1121/10/14
pre-merge). Ran the full 7-phase pipeline manually (SCAN → BATCH → ANALYZE →
ASSEMBLE REVIEW → ARCHITECTURE → TOUR → REVIEW → SAVE) since the `Skill`
tool's `understand` skill wasn't loaded in this session's registry — executed
the bundled scripts/subagent dispatches from SKILL.md directly instead.
Incremental path: pruned the 27 old nodes/102 edges for the 16
changed/new files from the prior graph into `batch-existing.json`, re-merged
against 7 freshly-analyzed batches — 0 dropped edges, 0 validation issues.
New Analytics service/route/schema/test nodes landed in the existing
"Service Layer"/"API Layer"/"Types Layer"/"Test Layer" layers (no new layer
needed); tour got one new step ("Analytics: Category & AMC Allocation",
step 10 of 15) inserted after the dashboard-narrative steps. Also deleted 2
leftover bogus `.ua/`-scoped nodes (`file:.ua/.understandignore`,
`document:.ua/tmp/scan-stderr.txt`) that had been carried over from a prior
run's data-hygiene issue.

**Separate pre-existing hygiene issue (not fixed, flagged only):** an old
`.ua/.trash-1786098818/` directory is tracked in git and shows as modified
in `git status` — confirmed via `git diff -w` that it's pure CRLF/line-ending
noise, same as the pre-existing `backend/app/api/{auth,dashboard,imports}.py`
noise already noted above. A prior session apparently committed a
plugin-cleanup trash dir to the repo; worth `git rm -r`-ing it in a future
session, but out of scope here since it predates this session's changes.

---

## Phase 0, Phase 1 (backend + frontend), Phase 2 (backend), Phase 2b (frontend), Phase 3 (Main Dashboard backend), and Phase 3b (Frontend UI Redesign) are all complete

**Phase 3b / Frontend UI Redesign — built via Google Antigravity on branch
`feature/frontend-redesign`, reviewed and fixed by Claude Code this
session.** Zero changes under `backend/` (confirmed: empty diff against
`main`, 156/156 backend tests untouched and passing).

**Antigravity's own report claimed "28 passing test files" / fully tested —
that was false.** Actual state on first inspection: 39 of 104 frontend tests
failing, plus 6 `tsc -b --noEmit` errors. Root-caused and fixed every one
(not just patched to green) — see the "Frontend redesign review — fixes
made" section below for the breakdown between real app bugs (fixed in
component code) and stale pre-existing tests never updated after the
redesign changed copy/behavior (fixed in tests, each verified to be a
legitimate copy/behavior change, not a masked regression). **Current true
state: 156/156 backend, 104/104 frontend, `tsc -b --noEmit` clean.**

### Summary of UI/UX Enhancements & Deliverables:
- **Design Tokens & Typography (`frontend/src/styles/tokens.css`, `index.css`, `index.html`)**:
  - Full 8-token type scale: `type-display` (32px), `type-h1` (24px), `type-h2` (18px), `type-body` (15px), `type-body-medium` (15px), `type-caption` (13px), `type-data` (15px tabular-nums), `type-data-large` (20px tabular-nums).
  - Web fonts: DM Sans and Manrope loaded via Google Fonts with `font-display: swap` and OpenType tabular figures (`font-variant-numeric: tabular-nums`).
  - Dark Mode tokens & Global Floating Theme Toggle: `--color-accent-dark` (`#22C55E`), `--color-neutral-badge-dark` (`#475569`), `--color-warning-dark` (`#F59E0B`), `--color-positive-dark` (`#22C55E`), `--color-negative-dark` (`#F87171`), `--color-surface-dark` (`#1A1A1A`), `--color-border-dark` (`#2A2A2A`). Accessible via persistent floating theme toggle button (`🌙`/`☀️`) on all screens.
  - Verified `prefers-reduced-motion: reduce` zeroing out all motion variables.

- **Polished Interactive Controls & Forms**:
  - **Drag-and-Drop CAS Statement Upload (`UploadForm.tsx`)**: Elevated upload drop zone with file type validation, selected file badge (`📄`), remove file button, password reveal toggle (`👁️`), and clear call-to-action button (`Upload & Parse Statement →`).
  - **Button Primitives (`Button.tsx`)**: Standardized button hierarchy (`primary` green, `secondary` outline, `ghost` text/skip/back buttons) with hover micro-animations, active lift, and WCAG AA focus rings.
  - **Onboarding Questionnaire (`Q1Name`, `Q2Investing`, `Q3Purpose`, `Q4Household`, `TrustPrimer`)**: Redesigned choice tiles with radio icons, trust guarantee cards, phone input group (`🇮🇳 +91`), 6-digit OTP monospaced inputs, and clear Back/Next/Skip navigation.

- **Main Dashboard & Greenfield Screens (`frontend/src/features/dashboard/`)**:
  - **`NavigationShell.tsx`**: Persistent header with mode switcher (Per-Member ↔ Family Aggregate), member selector dropdown, "+ Add Data" action button (S16), dark/light mode toggle, and disabled Analytics nav item (with tooltip explaining PRD-04 backend status).
  - **`DashboardView.tsx`**: Hero summary card (Total Value in `type-display` DM Sans 700 32px, Total Gain, XIRR/Percentage), Allocation Donut breakdown, Holdings Table with Fund Signal arcs, S21 Empty State for 0 holdings, and S22 Family Member Placeholders for members with `has_data: false`.
  - **`FundSignal.tsx`**: Signature SVG radial arc component matching Unifolio logo "o" geometry, `motion-reveal` animated fill on load, positive/negative gain semantics, and hover/focus trend sparkline popout (30D, 90D, 1Y).
  - **`FundDetailModal.tsx` (S15)**: Overlay displaying detailed NAV history, investment metrics, and "Compare Distributors" CTA.
  - **`DistributorComparisonModal.tsx` (S17)**: Connects to `/household-members/{id}/schemes/{scheme_id}/distributor-comparison`. Displays ARN status (`ACTIVE`, `SUSPENDED`, `INVALID`), distributor name, units, invested, current value, gains.
  - **`MainDashboardFlow.tsx`**: Manages default landing logic (family aggregate view default for multi-member accounts, per-member default for single accounts) and S16 Add Data re-entry into CAS upload.

- **Testing & Quality Verification** (as claimed by Antigravity, not independently re-verified by Claude Code — the Impeccable scoring workflow wasn't re-run this session):
  - Evaluated against Impeccable skill heuristic scoring (Alex power user & Sam accessibility personas) in Operate Mode. Claimed Good-band score (≥34/40) across all major screens.

### Frontend redesign review — fixes made (Claude Code, this session)

Real app bugs, fixed in component code:
- **`UploadForm.tsx`**: the PDF-password `<label>` had no `htmlFor`/`id`
  linking it to its `<input>` — a genuine accessibility regression (screen
  readers couldn't associate the label with the field). Root cause of 17 of
  the 39 initial test failures across `UploadForm`/`ImportFlow`/
  `FamilyImportFlow`.
- **`MainDashboardFlow.tsx`**'s "Add Data" (S16) re-entry used
  `SoloCasUpload` — an onboarding-only component that always resolves/
  creates the **"self"** household member and has no way to accept an
  existing `householdMemberId`. Every Add Data click for a non-self family
  member would have silently uploaded against the wrong member (or created
  a duplicate self row) — a real correctness risk for a financial app,
  caught by TypeScript's own prop-mismatch error. Fixed by swapping to
  `ImportFlow`, the generic component that already takes a real
  `householdMemberId` (what the redesign brief itself pointed at for S16).
- **`DashboardView.tsx`**: the "Total Portfolio Value" hero number was
  computed by `parseFloat`-summing every holding's `current_value`
  client-side, even though the exact figure (`allocation.total_value`,
  Decimal-precise, computed backend-side) was already fetched and sitting
  unused in state. Client-side float accumulation across holdings is
  exactly the failure mode CLAUDE.md's "`Decimal`, never `float`" rule
  exists to prevent, on the single most visible number on the page. Fixed
  to use the server total directly. `investedVal`/`profitVal` had no
  server total to substitute the same way (allocation only exposes
  `total_value`) — resolved separately, see below.
- **`FundSignal.tsx`**: removed a dead, never-wired `strokeDashoffset`
  variable (an earlier arc-fill approach superseded by the working
  `strokeDasharray`/`fillRatio` technique already in use) — a `tsc` error,
  not a visual bug; the arc already renders/animates correctly via the
  technique that stayed.
- **`Button.tsx`/`Modal.tsx`**: `import type` fixes for `verbatimModuleSyntax`.

Test-suite staleness, fixed in tests (each verified to be a copy/behavior
change, not a masked regression):
- ~20 failures were pre-existing tests never updated after the redesign
  changed visible copy ("Phone number" → "Mobile Number", "Send OTP" →
  "Send Verification Code", "6-digit code" → "Verification Code", "Verify"
  → "Verify & Continue", "What should we call you?" → "Your Full Name or
  First Name", "Add" → "Add Member", "Upload" → "Upload & Parse Statement",
  plus two validation-message wording changes).
- 3 `OnboardingFlow` tests broke because the redesigned `Q1Name` added
  `disabled={!name.trim()}` to its Next button (the original never disabled
  it) — a real, undocumented behavior change. Since those tests don't care
  about Q1's answer, switched their Q1 step to the existing Skip button.
- `DashboardView`'s `₹7,500` assertion used `getByText`, but the
  single-holding fixture legitimately renders that value in 4 places (hero,
  donut center, donut legend, table cell) — switched to `getAllByText`.
- `FundSignal.test.tsx` had a literal syntax error (a stray `aria-label:`
  token) that made the whole file fail to parse.
- `MainDashboardFlow.test.tsx`'s `HouseholdMember` fixture included
  `user_id`/`created_at` fields the real type (matching the backend's
  `HouseholdMemberResponse` exactly) doesn't have.
- Added the missing `window.matchMedia` jsdom mock
  (`frontend/src/setupTests.ts`) — `ThemeToggle`/`NavigationShell` both call
  it and jsdom doesn't implement it.

**Both flagged items resolved this session, per your explicit follow-up
instruction:**
- **`investedVal`/`profitVal` float accumulation** — fixed with a new,
  dependency-free `sumDecimalStrings` helper
  (`frontend/src/lib/decimal.ts`): exact decimal-string addition via
  integer minor units (`BigInt`), no new npm dependency. Handles a
  variable number of decimal places (the backend doesn't quantize
  `current_value`/`amount_invested` before serializing — `units * nav` can
  carry more than 2 decimal places, so a fixed-2dp assumption would have
  silently truncated real precision). Only the final summed result is
  parsed to a number once, for display formatting — the accumulation
  itself never touches `float`. 7 new tests, including one proving an
  exact result where float accumulation would visibly drift (ten additions
  of `"0.1"`).
- **`impeccable` plugin committed into this repo's git history** —
  untracked (`git rm --cached`) and added to `.gitignore`
  (`.agents/skills/`, `.claude/skills/`), left in place on disk so any
  coding agent working in this checkout still has it available. Per your
  instruction: keep it usable for switching agents, don't keep it tracked
  in the app's own history where it'll drift stale against the plugin's
  own update mechanism.
- `HoldingsTable.tsx` still references a `row.return_percentage_1y` field
  that doesn't exist anywhere in the real `HoldingRow` backend response —
  always `undefined` in practice, silently falling through to a
  client-computed fallback. Harmless (the fallback is what runs either
  way), but dead code worth cleaning up. Not yet actioned.

- **Branch Status**: merged to `main` (fast-forward from
  `feature/frontend-redesign` — same commit, `61bf6f4`). A `dev_intern`
  branch was cut from `main` at this same commit for sharing with an
  intern. Both `main` and `dev_intern` are pushed to `origin`. 156/156
  backend, 111/111 frontend (30 files), `tsc -b --noEmit` clean —
  genuinely verified, not claimed.

## Knowledge graph — read this before re-scanning the codebase

A full codebase knowledge graph exists at `.ua/knowledge-graph.json`
(built via the `understand-anything` Claude Code plugin — **533 nodes, 1223
edges, 10 architectural layers, a 15-step guided tour** as of the Phase 4
Part 1 merge), with `meta.json.gitCommitHash` =
`1ab0fabc9cd075e7b7a40e2a9dc37835b77267de`, matching `dev_intern`'s HEAD at
merge time (not stale as of this session). A fresh session should query this
graph (or launch its dashboard: `/understand-dashboard`) instead of
re-reading/grepping the whole repo. If `dev_intern` has moved past that
commit by the time you read this, the graph may be stale — check
`git log -1 --format=%H` against `.ua/meta.json`'s `gitCommitHash` before
trusting it, and re-run `/understand` (incremental update, only
re-analyzes changed files) if they've diverged.

---

## Phase 0, Phase 1 (backend + frontend), Phase 2 (backend), Phase 2b (frontend), and Phase 3 (Main Dashboard backend) are all complete, merged to `main`

**Phase 0 (foundation)** — all 11 tasks, `Docs/superpowers/plans/2026-08-04-phase-0-foundation.md`.
**Phase 1 backend — CAS import tightening + monolith port.** All 9 tasks, `Docs/superpowers/plans/2026-08-04-phase-1-cas-import-backend.md`.
**Phase 1b — Import Review frontend.** All 7 tasks, `Docs/superpowers/plans/2026-08-05-phase-1b-import-review-frontend.md`.
**Phase 2 (backend) — Auth + Onboarding.** All 4 tasks, `Docs/superpowers/plans/2026-08-05-phase-2-auth-onboarding-backend.md`.
**Phase 2b (Onboarding frontend).** `Docs/superpowers/plans/2026-08-06-phase-2b-onboarding-frontend.md`.
**Phase 3 (Main Dashboard backend).** `Docs/superpowers/plans/2026-08-06-phase-3-main-dashboard-backend.md`.

Test suites: **backend 156 passing**, **frontend 29 test files / 104 tests passing**.

## What's next

**PRD-04 (Analytics)** remains fully unbuilt, the module after Main Dashboard in the natural build order.
