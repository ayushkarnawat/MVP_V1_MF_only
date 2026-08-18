# Session state — 2026-08-18 (updated)

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## First-login dashboard load-time fix, PR #4 merged (2026-08-18)

User-reported follow-up to the earlier `dashboard-nav-perf-handoff.md` round: first
dashboard load right after a new signup's CAS upload was still ~30s. Root-caused as
two independent bottlenecks (dashboard NAV fetch's no-connection-reuse/no-dedup pattern
in `nav.py`, and CAS-preview's fully-sequential no-connection-reuse/full-endpoint pattern
in `enrich.py`/`service.py`) via live benchmarking against the real `api.mfapi.in`. Each
fixed in its own worktree/branch (`perf/nav-fetch-connection-reuse`,
`perf/import-preview-concurrency`), each through `model-orchestration`'s full
Codex-dispatch + mandatory adversarial-review gate cycle — 2 review rounds apiece. The
import-preview review's first round caught a real regression the `asyncio.gather`
parallelization introduced (a concurrent stampede on `get_scheme_list()`'s uncached
first-fetch path — the old sequential loop had accidentally serialized this); fixed with
a double-checked `asyncio.Lock`. That fix's own scoped re-review returned a stale,
contradicted-by-direct-read "REQUEST CHANGES" on the first dispatch (described the lock
as absent when it was present) — re-dispatched and got a correct "APPROVE" on the second
try; logged as `skill-observations/log.md` Observation 2 (stable Claude Code workspace
project folder, not this repo) since blindly trusting a review verdict without a cheap
sanity-check on the cited lines would have triggered wasted rework.

Both branches were merged into one combined branch `perf/dashboard-load-time` (clean
merge, no conflicts — disjoint files) and shipped as
[PR #4](https://github.com/ayushkarnawat/MVP_V1_MF_only/pull/4) against
`feat/enhanced-ui` — **merged 2026-08-18**. Full backend suite on the combined branch:
374 passed, 2 skipped, zero regressions (up from 368/2 on `import-preview-concurrency`
alone — the +6 delta is the `nav-fetch-connection-reuse` branch's own test additions
folded in by the merge). Live-benchmark numbers, rejected alternatives, and full
root-cause detail: `Docs/orchestration/nav-fetch-connection-reuse-handoff.md` and
`Docs/orchestration/import-preview-concurrency-handoff.md` (both marked Status: DONE).
Full decision trail: `Docs/orchestration/delegation-log.md`'s 2026-08-17/18 entries.
All worktrees, local branches, and the two `~/codex-work/` Codex dispatch clones from
this task have been removed — nothing left to prune from this task.

**What's next:** nothing outstanding from this task. The user hasn't yet manually
re-verified the signup → CAS-upload → dashboard wall-clock time drop in the browser —
worth doing before considering the original "30s → 15s/10s" ask fully closed, since all
verification so far is backend-test-suite-level, not an end-to-end timing measurement
against the live app.

## BUG-001 / DATA-001 investigation complete, implementation unblocked (2026-08-17/18)

Two tickets plus an ad-hoc XIRR complaint were investigated end-to-end in a
dedicated worktree (`worktree-bug-001-analytics-load-investigation`,
`/mnt/d/Unifolio code/.claude/worktrees/bug-001-analytics-load-investigation`)
— **investigation only, no application code changed**, per explicit
instruction. Both deliverables went through `model-orchestration`'s full
handoff → Codex dispatch → mandatory adversarial-review gate cycle (initial
review found 9 findings; a fix round plus two orchestrator-direct fixes
closed all of them; final scoped re-review confirmed clean). Committed as
`ef2c7b4` (`Docs/orchestration/*` only) and opened as
[PR #3](https://github.com/ayushkarnawat/MVP_V1_MF_only/pull/3) against
`feat/enhanced-ui` — **merged 2026-08-17.**

Two other PRs landed on `feat/enhanced-ui` around the same window,
independent of this investigation: **PR #4** (the first-login dashboard
load-time fix documented above — touches `nav.py`/`enrich.py`/`service.py`)
and **BUG-002**'s dashboard-stuck-loading fix (PRs #1/#2, merged even
earlier, 2026-08-17 — unrelated symptom, main-dashboard `Promise.all`
lifecycle bug, not an Analytics issue; see
`Docs/investigations/BUG-002-dashboard-return-loading.md`). Neither
required any change to this investigation's findings docs — a follow-up
pass (`worktree-bug-001-analytics-load-investigation` branch, merged as
[PR #5](https://github.com/ayushkarnawat/MVP_V1_MF_only/pull/5), **merged
2026-08-18**) re-verified PR #4's file overlap with the implementation
prompt's fix items 2/4/7, confirmed the root causes and fix approaches are
unaffected (only line numbers in item 7 had shifted), corrected those
references, and cross-referenced BUG-002 in `CLAUDE.md`/this file so
neither is rediscovered as a surprise. That pass also upgraded
`model-orchestration` to v1.2 (isolation-parameter rule, documentation-
deliverable review dimension, infra-retry-once sub-case) from observations
made during the investigation's own review loop — a parallel session
independently brought it to v1.3 with two more actioned observations
(non-native-filesystem sandbox-reach sub-case; confirmed the stale-verdict
check already covered the other) — both upgrades are cumulative on
`feat/enhanced-ui`, no conflict.

**BUG-001 finding** (`Docs/orchestration/bug-001-findings.md`, real
backend-measured timings, ≥3 runs per endpoint, both concurrent-load orders):
Analytics has (at least) three independent, differently-shaped performance
causes, not one shared hang:
1. **TER** (`amfi_ter_client.py`) — one missing current-month TER row
   triggers a sequential whole-country AMFI pagination with **no
   negative-cache/backoff**; an unresolved scheme re-triggers the full
   national scan on every request. Measured 185.8s/277.0s cold vs. 0.0297s
   once genuinely warm.
2. **Category Ranking** (`category_ranking.py`) — sequential per-scheme
   return computation across the full category universe (143 real schemes,
   ~410K NAV rows in the repro). Measured an **unexplained alternating
   43s/8s pattern** across 4 runs, not a clean cold/warm split — flagged as
   a genuinely open question, not force-fit to a false explanation.
3. **Scorer** (`scorer.py`) — the single highest-priority fix. A fully
   synchronous, unyielding `series_by_scheme` dict comprehension
   (`_category_component_scores`) builds full-history monthly series for
   every scheme in every held category with no `await` inside the loop.
   Unlike TER/Category Ranking, **this cost never drops on repeat calls**
   (262.0–262.7s warm vs. 332.2s cold across 3 runs) — nothing about it is
   cached across requests. Also inherits TER's refresh cost per unique
   category.
4. **Benchmark/NSE** — real but one-time cold cost (63.0s → 1.5–2.8s warm);
   not a recurring hang. `nse_indices_client.py`'s httpx client has no
   `follow_redirects=True`, and a live curl showed niftyindices.com
   returning a 302 — likely explanation for a cold miss, not confirmed via
   response-level tracing.
5. Two concurrent-load samples (both start orders) found no observed
   cross-request stalling, but this doesn't rule out blocking during
   specific synchronous stretches within a request — flagged as an open
   caveat, not a settled "ruled out."

**DATA-001 finding** (`Docs/orchestration/data-001-findings.md`, field
lineage + independent golden-dataset comparison):
- **Confirmed, unambiguous bug**: `BenchmarkSection.formatXirrPercent()`
  displays the backend's decimal-fraction XIRR without multiplying by 100
  (`parseFloat(val).toFixed(2)` + `%`, no ×100) — a correct backend 10%
  (`0.10`) displays as `+0.10%`. This is the confirmed root cause for a
  complaint of exactly this shape (the ad-hoc "+0.10% seems too low for a
  good portfolio" report) — the specific screenshot itself couldn't be
  re-examined, but no other code path produces this 100×-too-small pattern.
  Also violates CLAUDE.md's Decimal-never-float rule (`parseFloat` in a
  money/percentage path).
- **Confirmed correct**: backend XIRR (Newton-Raphson matches an
  independent bisection reference to 10+ decimal places), weighted-TER
  formula/arithmetic given valid inputs, missing-benchmark handling
  (returns `None`, not a fabricated number).
- **Confirmed structural gaps**: a literal `Decimal("0")` TER is
  indistinguishable from "no match found" and is counted as real coverage;
  `_cost_adjustment_from_context()` returns numeric `0` for "unavailable,"
  indistinguishable from a genuine zero adjustment; CAS import's
  `enrich.py`/`confirm_import()` accept a scheme name and AMFI code pair
  with no cross-validation between them (`MIN_MATCH_CONFIDENCE = 0.55`, no
  AMC/category check) — a real production risk, separate from this
  session's own seed-script bug (see caveat below).
- **Important caveat, don't skip on the next read**: the repro DB's 3
  seeded schemes had **name↔AMFI-code pairs corrupted by this session's own
  seed script**, not by any application code path (verified against
  mfapi.in) — so the specific 0.65%-vs-0.28% weighted-TER golden mismatch
  is primarily a seed-data artifact, not by itself a demonstrated
  production bug. The doc explicitly flags that the golden TER comparison
  needs to be **re-run with correctly-identified seed data** before
  treating TER production-ingestion correctness as confirmed/ship-blocking
  — this was not done this session (flagged as follow-up to conserve
  time), so the next session should do this first if picking up TER work.
- **Still open by missing implementation** (bigger scope, likely separate
  work from the bug-fix pass below — check whether these were ever in
  PRD-04's scope before assuming they're bugs): **Beta is not implemented
  anywhere** (no field, computation, route, schema, or UI — `risk_metrics.py`
  computes downside deviation/consistency, not beta); **AAUM has no real
  refresh entrypoint** — `refresh_aaum_data()` exists and is unit-tested but
  nothing (no route, no scheduled job) ever calls it in this codebase, so
  `scheme_aaum` is empty in the repro DB and category AUM-weighted context
  is currently always unavailable.

## What's next

Implement the fixes above — nothing is blocking this anymore (PR #3, #4,
and #5 are all merged, and BUG-002 is unrelated/already fixed). A detailed
implementation-session prompt is saved at
`Docs/orchestration/bug-001-data-001-implementation-prompt.md` — paste its
contents into a fresh session (a new dedicated worktree) to start that work
with full context, no re-derivation needed. It's already reconciled against
PR #4's line-number shifts and flags BUG-002 as out of scope. Priority
order per the findings doc: Scorer caching/bounding first (only fix that's
both correctness-safe and addresses an endpoint that "never gets cheap"),
then TER negative-cache, then Category Ranking's query/caching fix
(investigate the alternating-timing mystery as part of this), then the
DATA-001 correctness fixes (XIRR ×100 display bug is trivial and should
probably go first regardless of the performance work's sequencing — it's
an unrelated one-line-scope fix), then TER silent-zero + cost-adjustment
sentinel, then the import identity-validation tightening. Follow standard
TDD (failing test first) and `Decimal`-never-`float` per CLAUDE.md
non-negotiables; use `model-orchestration` to delegate to Codex per its
existing rules (v1.3 as of this session — see its own changelog). Beta and
a real AAUM refresh entrypoint are open questions on scope, not drop-in bug
fixes — check PRD-04 before treating them as this pass's job.

## Post-Phase-2 bug fixes (same day, 2026-08-14) — AMFI TER, dashboard hang, repeat-navigation speed

Once the Analytics frontend (Phases 1 & 2 below) was merged and Ayush started testing
on localhost, four distinct real bugs surfaced and were fixed in sequence, each
root-caused before fixing (`superpowers:systematic-debugging` for the last one):

1. **AMFI TER feed crash (`d366af6`)** — `amfi_ter_client.py` crashed with
   `AttributeError: 'str' object has no attribute 'get'` because AMFI's live
   `populate-te-rdata-revised` feed mixes stray non-dict elements into its paginated
   row array. Fixed with an `isinstance` guard in `_latest_row_per_scheme`.
2. **Multi-minute Analytics dashboard hang (`15c03e1`)** — two combined causes:
   `AnalyticsView.tsx` gated all 5 sections behind one shared loading boolean, and
   `category_ranking.py`'s per-scheme NAV fetching across a 30-150+ scheme category
   universe ran sequentially. Fixed with per-section independent loading state in
   `AnalyticsView.tsx`, plus a new `warm_nav_history()` (concurrent, deduplicated NAV
   history warmer) in `nav.py` wired into `category_ranking.py`.
3. **TER "Data Unavailable" — a deeper bug than fix #1 (`2c48723`)** — fix #1 only
   stopped the crash; it didn't fix the actual ingestion. Root cause: AMFI's TER feed
   wraps rows in `{"data": [...], "meta": {...}}`, not a bare array — the code was
   iterating the envelope's own dict keys as if they were rows, so **zero real TER
   rows had ever been ingested** (confirmed via a direct DB query: `scheme_ter` had 0
   rows). Also fixed `TER_Date`'s actual format (ISO-8601 + "Z", not "DD-Mon-YYYY").
   Live-verified against the real AMFI endpoint (24,867 real rows vs. 2 bogus) and the
   dev DB (13/13 previously-excluded schemes now matched).
4. **Repeat-navigation loading speed (this session)** — full root-cause + fix detail
   in `Docs/orchestration/dashboard-nav-perf-handoff.md`'s "Round 5" section. Two
   independent causes: `warm_nav_history` (added in fix #2 above) had no TTL, so every
   Category Ranking/Scorer visit re-fetched the entire category universe's NAV history
   from the network every time; and the frontend had no caching layer anywhere, so
   every dashboard<->analytics tab switch and every combined<->per-member switch
   re-issued the full GET set from scratch. Fixed with a 15-min TTL cache on
   `warm_nav_history` (mirroring `holdings.py`'s existing pattern) and a 60s in-memory
   GET-response cache in `lib/apiClient.ts` (invalidated on `confirmImport`/
   `postOpeningBalance`).

Backend suite: 362 passed, 2 skipped (was 357 before fix #2, growth is new tests
across fixes #2/#4). Frontend: 202/202 passing (1 unrelated, confirmed-transient
sandbox module-resolution flake on `ImportFlow.test.tsx`), `tsc -b --noEmit` clean.

## CAS Review screen "Unclassified" plan-type bug (same day, 2026-08-14)

Ayush reported the CAS Import Review screen showing "Unclassified" plan type for
schemes whose name explicitly said "Direct Plan" and which had an "AMFI Match"
confirmation badge — while other, similarly-named Direct schemes classified
correctly. Root-caused via `superpowers:systematic-debugging` (traced backward from
`plan_type` through `classify_folio_plan_type` to `arn_code` to casparser's own
extraction code, not guessed):

- `enrich.py`'s "AMFI Match" is scheme-*identity* resolution only (ISIN/fuzzy-name →
  AMFI code) — it never fed the plan-type decision. Ayush's phrasing ("AMFI confirmed
  it's Direct") described the identity-match badge; the actual, separate plan-type
  classifier (FR-5, `parser.py`) was the one going wrong.
- `casparser`'s `Scheme.advisor` field is captured raw from a CAS statement's
  `"(Advisor: ...)"` annotation and only narrowed to a real `ARN-xxxx`/`INAxxxx` code
  when that pattern is actually found inside it (`cams_detailed.py`'s
  `_ADVISOR_CODE_RE`) — otherwise it passes through whatever raw text the AMC/RTA
  template printed there. Several AMCs literally print `(Advisor: DIRECT)` (or similar
  non-ARN placeholder text) on direct-plan folios that have no real distributor,
  instead of omitting the annotation entirely.
- `parser.py`'s `arn_code = scheme.advisor if ... else None` treated *any* non-empty
  string as a genuine distributor ARN, so `classify_folio_plan_type("direct", "DIRECT")`
  saw `has_arn=True` and forced `"unclassified"` under the (correct, intentional)
  "name says Direct but a distributor is also present → disagreement → unclassified,
  never silently guess" rule. Schemes whose statement had *no* `Advisor:` annotation at
  all (`advisor=None`) classified correctly as `"direct"` — same name pattern, different
  raw-text artifact, inconsistent result. This exact same root cause would also have
  silently corrupted `arn_lookup.py`'s AMFI distributor lookups for Distributor
  Comparison (looking up "DIRECT" as if it were a real ARN, wasting a call and coming
  back `INVALID`).
- **Fix**: added `_as_arn_code()`/`_ARN_CODE_RE` in `parser.py`, validating that
  `scheme.advisor` actually matches `ARN-?\d+` or `INA\d+` (mirroring casparser's own
  `_ADVISOR_CODE_RE`) before treating it as a real ARN; anything else (placeholder text)
  is now treated as no-distributor, same as `None`. Single fix point — corrects both the
  plan-type classifier and the Distributor Comparison ARN lookup, since both consume the
  same `arn_code`/`ParsedScheme.arn_code` → `folios.arn_code` value.
- TDD: added `test_normalize_cas_data_direct_scheme_with_non_arn_advisor_placeholder`
  (red before the fix — asserted `arn_code is None`, `plan_type == "direct"` for a
  Direct-named scheme with `advisor="DIRECT"`; got `arn_code == "DIRECT"`,
  `plan_type == "unclassified"`). Green after the fix; full backend suite re-run clean —
  **363 passed, 2 skipped** (was 362/2, +1 new test).

## Analytics Dashboard Frontend (Phase 2) — Built via Google Antigravity

**Phase 2 of the Analytics Dashboard frontend (Fund & Portfolio Scorer, Benchmark Comparison, and S20 Fund Score Detail Modal) has been built via Google Antigravity (Gemini 3.6 Flash)** on branch `feat/enhanced-ui`.

- **Scope**: Fund & Portfolio Scorer (FR-5/FR-6/FR-7), Benchmark Comparison (FR-8/FR-9), Fund Score Detail Modal (S20) across Web (S18/S19/S20) and Mobile (`MobileAnalyticsView.tsx`).
- **Components Built**:
  - `frontend/src/features/analytics/FundScoreDetailModal.tsx` (S20 Radix Dialog modal with 5-tier visual band and Return 45% / Risk 30% / Consistency 25% / TER cost adjustment breakdowns)
  - `frontend/src/features/analytics/ScorerSection.tsx` (portfolio weighted score hero tile, tier badges, component breakdown bars, unscored scheme callout)
  - `frontend/src/features/analytics/BenchmarkSection.tsx` (portfolio XIRR vs 4 broad Nifty indices & per-fund XIRR vs assigned benchmark with outperformance badges)
  - Extended `types.ts` and `api.ts` with all Phase 2 response models and API functions (`getFundScore`, `getMemberScore`, `getAggregateScore`, `getMemberBenchmark`, `getAggregateBenchmark`, `getMemberFundBenchmark`, `getAggregateFundBenchmark`).
  - Integrated into `AnalyticsView.tsx` and `MobileAnalyticsView.tsx`.
- **Guardrails & Verification**:
  - All money, score, percentage, and XIRR values remain `Decimal`-as-string, formatted using `sumDecimalStrings`, `diffDecimalStrings`, and `formatIndianCurrency` from `frontend/src/lib/decimal.ts`.
  - Hand-rolled SVG/Tailwind chart primitives used (no Bklit UI / @visx installed per ground rules).
  - Scores and percentiles are never bare numbers; always paired with tier context.
  - `null` XIRRs/scores are explicitly rendered as "Insufficient History / Unavailable", never as 0% or 0-height bars.
  - Zero backend code touched.
  - Completion report appended to `Docs/orchestration/analytics-phase2-frontend-log.md`.

**Claude Code review (same day) found both of the completion report's "clean" claims false,
same as Phase 1**: `tsc -b --noEmit` actually had 7 errors (unused imports/types, one invalid
`Badge` variant), and `npm test` actually had 3 failing tests (all ambiguous `getByText` matches
against duplicate on-screen text — test-authoring bugs, not UI bugs). Also found a High-severity
`Decimal` violation (`BenchmarkSection.tsx`'s Portfolio-vs-Index diff used plain float subtraction
instead of the file's own already-correct `diffDecimalStrings` pattern used elsewhere in the same
file — the same bug category caught and fixed in Phase 1, recurring here), a currency-formatting
inconsistency (`ScorerSection.tsx` skipped `formatIndianCurrency` for covered/total value), and a
missed-optimization (`FundScoreDetailModal`'s `initialData` prop went unused by both callers,
forcing an avoidable re-fetch + loading flash on every open). All fixed directly per explicit user
instruction. Final verified state: `tsc -b --noEmit` clean; full-suite runs (flaky at
full-parallelism in this sandbox — different unrelated files crash on `vitest` worker-pool timeouts
each run, not a code regression) both showed every executed test passing (194/194, then 192/192);
a scoped, serialized run of all 5 analytics test files passed cleanly, 13/13 tests. Full findings
and fix log: `Docs/orchestration/analytics-phase2-frontend-log.md`.

## Analytics Dashboard Frontend (Phase 1) — Built via Google Antigravity

**Phase 1 of the Analytics Dashboard frontend (Allocation, TER/Cost, Category Ranking) has been built via Google Antigravity (Gemini 3.6 Flash)** on dedicated branch `feat/analytics-phase1` off `feat/enhanced-ui`.

- **Scope**: Allocation (FR-1/FR-2), Cost/TER (FR-10/FR-11), Category Ranking (FR-3/FR-4) for both desktop (S18/S19) and mobile (`MobileAnalyticsView.tsx`).
- **Components Built**:
  - `frontend/src/features/analytics/types.ts` & `api.ts` (API client for 8 routes)
  - `frontend/src/features/analytics/AllocationSection.tsx` (reuses `AllocationDonut` unchanged per Section 3.2 carve-out)
  - `frontend/src/features/analytics/TerSection.tsx` (weighted TER tile, Direct vs Regular fee bar visual, `uncovered_schemes` callout)
  - `frontend/src/features/analytics/CategoryRankingSection.tsx` (fund category rank, percentile gauge bar, category average return comparison, and status badges)
  - `frontend/src/features/analytics/AnalyticsView.tsx` (desktop shell for S18/S19)
  - `frontend/src/mobile/features/analytics/MobileAnalyticsView.tsx` (mobile shell)
  - Integrated into `NavigationShell.tsx`, `MainDashboardFlow.tsx`, `MobileBottomNav.tsx`, `MobileRoot.tsx` with enabled Analytics navigation button.
- **Guardrails & Rules**:
  - `AllocationDonut` reused **unchanged**.
  - All financial/percentage/TER values formatted from decimal strings (`tabular-nums`), zero float calculations.
  - Zero backend code touched. Phase 2 (Scorer / Benchmark comparison) excluded.
  - `impeccable` skill craft floor quality standards met across S18, S19, and Mobile views.
  - Completion report appended to `Docs/orchestration/analytics-phase1-frontend-log.md`.

**Claude Code review (same day) found and fixed real issues before this was usable**: a
build-breaking `formatIndianCurrency` import that didn't exist as an export anywhere (confirmed
crashing `AnalyticsView.test.tsx`/`MobileAnalyticsView.test.tsx` at runtime, not just a type error),
7 `tsc` errors, two float-subtraction-then-display spots (now exact `Decimal` string arithmetic via
a new `diffDecimalStrings` helper), an incidental deleted code comment, a flaky test assertion, and
a stale pre-existing `App.test.tsx` assertion. Also confirmed: **Bklit UI was never actually used**
despite being the brief's named requirement — the original completion report's dependency claims
were inaccurate. Installing `@bklit/bar-chart` properly was evaluated and deliberately deferred to
a separate task (47 files, 12 npm packages, would overwrite `src/lib/utils.ts` and drop
`toTitleCase`, used by 7 other files). Final state: `tsc -b --noEmit` clean, full suite 51/51 files,
197/197 tests passing. Full findings: `Docs/orchestration/analytics-phase1-frontend-log.md`.

## Branch reconciliation — final check, and catch-up on everything landed since the last documented state (this session)

This session opened mid-branch-drift: the intern (`aditishanbhag`) had pushed
a new batch of commits to `feat/enhanced-ui` — mostly a Badge/Select
componentry cleanup — while a partial local fix for the same two issues
(Badge `className` support, a broken Radix-`Select` test interaction in
`ReviewTable.test.tsx`) was still in progress here. Ayush explicitly
discarded that in-progress local fix once the intern's commits landed,
calling this session's branch check "a final check for the same." That
discard turned out to be the right call: the intern's own commits (`ef24999`
"unify Badge components across review views and fund details", `54d3d49`
"align Badge and ui/badge design tokens...ReactNode children support",
`6296507`/`b4423e6`/`9902636` updating the affected tests) independently
fixed the exact same two problems, using an equally valid but different
`Select` test pattern (`fireEvent.keyDown` + `findByRole("option")` instead
of the discarded `fireEvent.click` + `findByText` approach).

**Result: `dev_intern` and `feat/enhanced-ui` are merged and identical**, both
at commit `7426047` (`dev_intern` had zero unique commits, so merging
`feat/enhanced-ui` into it was a clean fast-forward — no merge commit). Full
suite independently re-verified fresh on the merged result, not reused from
an earlier run: backend **357 passed, 2 skipped**; frontend **190 passed
across 49 files**; `npx tsc -b --noEmit` clean. One harmless leftover: a
`git stash` created mid-session (confirmed via `git diff -w` to be 100%
CRLF-line-ending noise, zero real content) couldn't be dropped because the
Bash auto-mode safety classifier was temporarily unavailable — safe to
`git stash drop` manually later, nothing of value in it. **Not pushed** —
this sandbox has no git push credentials; push `dev_intern`/`feat/enhanced-ui`
from a machine that does.

Reconciling the branches surfaced a large amount of work landed since the
last time `CLAUDE.md`/`session.md` were updated (2026-08-13), across two
different authorship streams:

**1. Phase 4 Part 5 — Scorer (PRD-04 FR-5/FR-6/FR-7) — completes PRD-04
Analytics backend in full.** Built, reviewed, and merged this stream. This
was Ayush's one hard product requirement for the whole Analytics module: the
score must be genuinely Unifolio's own, not a re-skin of Morningstar's,
CRISIL's, or PowerUp's methodology (see
`Docs/superpowers/specs/*scorer*` and the
[phase4-scorer-project](../../../../home/ayush/.claude/projects/-mnt-d-Unifolio-code/memory/phase4-scorer-project.md)
memory for the full ask). Landed as three ordered building blocks plus API
routes and a stakeholder doc:
- **Task 1 — `backend/app/services/analytics/risk_metrics.py`** (`7058b0e`):
  the shared time-series building blocks — `month_end_dates`,
  `build_monthly_series`, `monthly_returns`, `compute_downside_deviation`
  (semi-deviation against a 0% MAR, Decimal throughout), `rolling_12m_returns`,
  `category_medians`, `compute_consistency_hit_rate` (rolling 12-month
  category-beat rate) — over a fixed 5-year month-end history window.
- **Task 2 — `scorer.py`'s composite fund score** (`aa8288f`, FR-5/FR-7):
  blends Return / Risk / Consistency into one 0–100 score plus a full
  breakdown, using **fixed weights resolved with Ayush on 2026-08-13: Return
  45%, Risk (downside deviation, inverted so lower risk scores higher) 30%,
  Consistency (rolling-12-month category-beat rate) 25%** — chosen over
  Morningstar's published 3/5/10yr-CAGR-weighted approach specifically to
  keep risk isolated as its own ingredient rather than folded into a
  risk-adjusted return, and to make consistency a first-class graded
  ingredient rather than an omission. Tier boundaries are inclusive on the
  lower bound: `>=80`→tier5 ... `>=20`→tier2, else tier1. FR-7's full
  breakdown is **never persisted** — recomputed fresh on every read, by
  explicit Global Constraint in the implementation plan, to avoid a second
  source of truth alongside the daily `FundScore` row.
- **Task 3 — portfolio-level roll-up** (`6129e96`, FR-6): holding-value-weighted
  aggregation of each held fund's score up to the member/family level, reusing
  Task 2's per-fund scorer unchanged.
- **API routes** (`dc4df5c`): 3 new `GET` routes mirroring the existing
  auth/404 pattern exactly —
  `/funds/{scheme_id}/score`, `/household-members/{member_id}/score`,
  `/household/aggregate/score`.
- **Stakeholder-facing methodology doc** (`f7a0bc2`):
  `Docs/Scorer-Methodology-Unifolio.md` — plain-language explanation of the
  same 45/30/25 split and *why* it's differentiated, written for a non-technical
  reader (Ayush's own stated preference — see the
  `user_technical_background` memory).
- **Final whole-branch adversarial review (`d732fce`)** — the
  `model-orchestration` skill's mandatory gate — caught 3 real findings, all
  fixed in one round: (High) `compute_portfolio_score` was redundantly
  re-scoring each held fund's entire category universe independently instead
  of computing category-wide inputs once per distinct category and finishing
  each fund from that shared base; (Medium) `today.replace(year=today.year -
  N)` crashes on Feb 29 in a non-leap target year — a second occurrence of a
  bug already parked once in `category_ranking.py`, now fixed at the root
  with a shared `years_ago()` helper (clamps to Feb 28) used in both places;
  (Medium) daily `FundScore` persistence was a racy check-then-insert under
  concurrent requests — fixed by pinning `computed_at` to UTC day-start so the
  existing `(scheme_id, computed_at)` primary key itself enforces one-row-per-day,
  with a losing concurrent insert's `IntegrityError` swallowed rather than
  double-inserting.
- **Backend suite: 357 passed, 2 skipped** (up from 341/2 pre-Scorer, +16 new
  tests across the 3 tasks plus the review-fix round, zero regressions).
- **What's left of PRD-04**: only the *frontend* Analytics dashboard UI. No
  frontend work against the Scorer/ranking/benchmark/TER routes was found in
  this session's commit survey — treat the Analytics dashboard as still
  entirely unbuilt on the frontend side until confirmed otherwise.

**2. CAS Import lifecycle redesign — intern-authored, backend AND frontend,
NOT yet independently reviewed by Claude Code.** A substantial rework of the
whole import flow, landed as a self-contained architecture doc
(`3d40cfe`, "add CAS import update architecture and TDD implementation
plan", gap analysis across FR-1–FR-9) followed by 9 implementation commits,
all authored by `aditishanbhag`:
- `01b6b77` — an **11-state import lifecycle state machine**
  (`backend/app/services/import_/state_machine.py`) enforcing legal
  transitions per FR-5, plus Alembic migration `0003` (`Import`/`Folio`
  schema changes) and a new `OPENING_BALANCE` transaction type.
- `4d60c8e` — a buffer cache, a lifecycle service, and member attribution.
- `91d85ca` — coverage-gap detection and opening-balance resolution (what
  happens when a CAS import doesn't cover a folio's full history).
- `3e0640e` — a CAMS-portal mailback URL generator and a pending-request
  lifecycle (for the "we requested your CAS by email, waiting for CAMS to
  mail it" flow).
- `e7db4c1`, `c902978`, `59ff810`, `e005f76` — the matching frontend: an API
  client + types + lifecycle views, a coverage-gap banner + opening-balance
  modal + import history view, a full "Two-Path" CAS import UI with CAMS
  redirect and a pending-request view, and a redesigned web CAS import entry
  point.

This is a lot of new state-machine and money-adjacent logic (opening
balances, coverage gaps) landing without the kind of review pass Phase 3b's
Antigravity redesign got before merge (which caught 3 real bugs, including a
`Decimal`-never-`float` violation on the dashboard's most visible number —
see that section further down). **It passes the full test suite, but "tests
pass" and "independently reviewed against CLAUDE.md's non-negotiables" are
different claims.** Flagging this as an open item for a dedicated review
pass, not silently treating passing tests as equivalent to review.

**3. UI/UX foundation + today's Select/Badge refactor — also
intern-authored, verified passing, not independently reviewed.** `290fb10`
set up shadcn/Tailwind/design tokens; `01fe683` built the mobile app shell,
dashboard, fund details, and responsive routing; `e91c86f` enhanced the web
dashboard/allocation-donut/holdings presentation. On top of that foundation,
a same-day refactor swapped native `<select>`s for Radix `Select` across
`ReviewTable`, `AttributionModal`, `AddFamilyMembers`, and the mobile
dashboard's member/holdings filters (`b31c442`, `7503f70`, `e7a5234`,
`5964bb3`), unified the `Badge` component and aligned its design tokens with
`ui/badge` (`ef24999`, `54d3d49`), and added a `toTitleCase` utility used to
proper-case plan-type/badge text throughout (`b11a08e`, `38e92a5`, `4efc922`,
`4531074`) — plus jsdom test-environment mocks for `Select`'s pointer-capture
and `scrollIntoView` calls (`be0e6eb`) that the earlier Radix `Select` tests
needed and didn't have.

**Knowledge graph is now meaningfully stale.** `.ua/knowledge-graph.json`
was last refreshed at `gitCommitHash
35fedd38f968e5b763269a67dbe8d16eff44e9ed` (**661 nodes / 1657 edges**),
which predates the Scorer, the entire CAS import lifecycle redesign, and the
UI/Select refactor. Re-run `/understand` (incremental) before trusting it
for any of `analytics/scorer.py`, `analytics/risk_metrics.py`,
`import_/state_machine.py`, or the new frontend lifecycle views.

**Still-open items carried forward, re-checked this session:**
1. A held scheme with no obtainable NAV silently vanishes from
   holdings/allocation/aggregates — unchanged, still open, no frontend
   "NAV unavailable" treatment found.
2. `confirm_import`'s plan-type override still has no server-side 409
   backstop — pre-existing Phase 1 code, untouched by the CAS lifecycle
   redesign (which added new states/transitions but didn't touch this
   override path).
3. No DB uniqueness constraint on the "self" `household_members` row —
   **confirmed still open**: `backend/alembic/versions/` contains only
   `0001_initial_schema.py`, `0002_transaction_dedupe_includes_type.py`, and
   `0003_cas_import_lifecycle_and_coverage_gaps.py` — none add this
   constraint. Frontend-side mitigation only.
4. (New, low-priority) `HoldingsTable.tsx` still references a dead
   `row.return_percentage_1y` field with no such field on the real API type
   — harmless, the client-computed fallback always runs instead, never
   cleaned up.

## Dashboard load-time performance fix (Fix A/B/D) — built, reviewed, merged, and pushed this session

User reported the dashboard is slow to load, especially the *first* load right
after signup/import. Diagnosed the root cause directly (not delegated): the
Main Dashboard backend's on-demand NAV fetch (`backend/app/services/dashboard/nav.py`)
is a local-dev-first stand-in for the real, not-yet-built ADR-006 scheduled
refresh job (**Fix C** — see its own section below, still deferred). Three
concrete, in-scope mitigations were identified and delegated end-to-end to
Codex via the `model-orchestration` skill's full workflow (handoff doc →
dispatch → the skill's *mandatory* adversarial-review gate before Status could
move to `DONE`). Took **4 full rounds** of implement → independently-verify →
adversarial-review before the design was actually correct — each round's
review caught something real, none were rubber-stamped.

**Fix A — background NAV prefetch on import confirm.**
`confirm_import_route` (`backend/app/api/imports.py`) now schedules a
`BackgroundTasks` job right after `confirm_import()` commits, prefetching NAV
history for every scheme the member now holds, using a fresh `SessionLocal()`
(never the request-scoped `db`, which closes when the response returns).
Fire-and-forget — never raises into FastAPI's task runner, degrades the same
way `nav.py`'s existing on-demand fetch already does.

**Fix B — parallelized per-scheme NAV network fetch.** `compute_holdings`
(`backend/app/services/dashboard/holdings.py`) used to fetch each held
scheme's NAV sequentially — N sequential `mfapi.in` round trips for an
N-holding member on every cold dashboard load. A new batch function,
`get_navs_on_or_before` (`nav.py`), splits the work into three sequential
phases with only the middle one parallelized: (1) sequential DB reads to find
which schemes already have a trustworthy cached NAV, (2) `asyncio.gather` over
only the schemes that need a real network fetch, (3) sequential DB
upserts/reads for the fetched results. The non-negotiable rule throughout: a
single synchronous SQLAlchemy `Session` must never have its DB reads/writes
interleaved across concurrent coroutines — only the pure-network leg is ever
gathered.

**Fix D — process-local per-day cache for `compute_holdings`.** The dashboard
fires `/holdings` and `/allocation` back-to-back on every page load
(`Promise.all` on the frontend), each independently re-running the full
FIFO+NAV computation for the same member set on the same day. Added an
in-memory cache in `holdings.py`, keyed by `(household_member_ids,
date.today())`. This is the fix that took all 4 rounds to close:
- **Round 1 review** (3 high findings): a stale/incomplete snapshot (computed
  before that day's NAV was even published) could get cached for the whole
  day with nothing to invalidate it later; a race let an in-flight
  computation publish a stale pre-import snapshot *after* an import's own
  invalidation already ran; and `_upsert_nav_history` had a check-then-insert
  race across separate `Session`s (two overlapping fetches could both try to
  insert the same `(scheme_id, date)` row, one raising an uncaught
  `IntegrityError`).
- **Round 2 fix**: closed the NAV-upsert race with a dialect-native `ON
  CONFLICT DO NOTHING` upsert (verified correctly closed, never flagged
  again). Attempted the cache races with a per-member generation counter
  (capture before compute, publish only if unchanged) plus a rule that
  holdings are only cached when every NAV is dated exactly `date.today()`.
  Round 2's own review found this still incomplete: the generation-check and
  the cache-publish were two separate steps with a gap `invalidate_holdings_cache`
  could still land in (narrower window than round 1, not closed); and the
  "today-only" eligibility rule meant the cache barely ever activated during
  completely normal delayed-NAV periods (weekends, holidays, or simply before
  that evening's NAV publishes) — defeating Fix D's entire purpose exactly
  when it mattered most.
- **Round 3 fix**: closed both. A single process-local lock now spans
  generation-capture, compare-and-publish, *and* `invalidate_holdings_cache`'s
  own generation-bump-plus-delete, so the two paths can never interleave.
  Cache eligibility was decoupled from "NAV dated today" entirely — snapshots
  are cached regardless of NAV freshness, and the background prefetch (Fix A)
  instead bumps the generation for a member only when it detects that a
  scheme's *max stored NAV date actually advanced*, never on a calendar-date
  rule. Round 3's own review found one new high finding: since Fix A's
  prefetch is one-shot (fires once, right after that one import), it can
  never catch NAV that publishes *later* in the day if the user's dashboard
  was already loaded (and thus already cached) before publication — no
  periodic hook exists to re-check, because Fix C (the real recurring job)
  is deferred.
- **Round 4 fix**: closed it with a bounded 15-minute TTL
  (`_HOLDINGS_CACHE_TTL_SECONDS` in `holdings.py`, an injectable monotonic
  clock so tests don't sleep for real) so a stale entry self-heals on its own
  without needing any external trigger — deliberately not an attempt to
  rebuild Fix C. An expired entry is deleted and falls through the exact same
  lock/generation-check miss path as any other cache miss, not a bypass.
  Round 4's review found one last finding, **medium severity, correctness-safe**:
  there's no per-key single-flight coordination, so two concurrent requests on
  the same cold/just-expired cache key (precisely Fix D's original motivating
  case — `/holdings` and `/allocation` firing together) can both observe a
  miss and both run a full independent computation, with the second's publish
  simply overwriting the first's. No stale data survives, no corruption — just
  an occasional redundant computation, bounded to at most once per TTL window
  per key. **Explicit user decision: accept this as a documented limitation,
  do not dispatch a round 5.** Closing it fully needs a genuine single-flight
  primitive (one caller computes, concurrent callers await and reuse the
  result) — judged not worth the added complexity for this MVP given the
  finding is no longer a correctness bug and the real long-term fix is Fix C,
  not a more elaborate process-local cache. Documented directly in
  `holdings.py`'s existing cache-scope comment.

Full round-by-round detail — every review's verbatim findings, every dispatch
prompt, every independent-verification result — lives in
`Docs/orchestration/dashboard-nav-perf-handoff.md` (**Status: DONE**) and
`Docs/orchestration/delegation-log.md`. **Every round was independently
re-verified by re-running the full backend suite directly** (never trusted
Codex's self-report alone — Codex's own sandbox hit a Python 3.14/Starlette
`TestClient` hang on every single round that never reproduced outside its
sandbox, confirmed each time by the orchestrator's own run). Backend suite
grew **156 → 326 passing, 2 skipped throughout, zero regressions at every
step** (319 after round 1, 322 after round 2, 324 after round 3, 326 after
round 4).

### Fix C — the real fix, still deferred to deployment phase

Fix A/B/D are explicitly local-dev-first mitigations layered on top of
on-demand NAV fetching — none of them are the real fix, and the handoff doc
says so throughout. **The actual fix is ADR-006's EventBridge Scheduler + ECS
Express Mode recurring NAV-refresh job** (per `/Docs/ADR-Technical-Stack-Decisions.md`
and `/Docs/TDD-Unifolio.md`), which should run on a daily schedule (aligned to
mfapi.in/AMFI's evening publication window) and proactively refresh
`nav_history` for every scheme any user holds — eliminating on-demand
fetch-on-request entirely, not just mitigating its cost. This was **not**
built this session — it's deployment-phase work per the Migration Plan's
Readiness Checklist, same as the rest of AWS deployment. When it is built, it
needs its own design pass covering at minimum: schedule cadence and how it
handles a partially-failed run (some schemes' fetches failing mid-batch);
whether it shares `nav.py`'s existing per-scheme fetch/upsert code (now
conflict-safe via round 2's `ON CONFLICT DO NOTHING` fix) or needs a
bulk-oriented client like `scheme_universe.py`'s AMFI bulk-file pattern
(likely far more efficient than N per-scheme calls for every scheme in the
system); and how it interacts with Fix A/B/D once live:
- Fix A's one-shot post-import prefetch becomes redundant for schemes the
  recurring job already covers, but is harmless to leave running — it only
  matters for the gap between an import and the job's next scheduled run.
- Fix D's cache (TTL, generation counter, lock) becomes largely moot — once
  `nav_history` is proactively kept fresh, `compute_holdings` will already be
  reading fresh data, so the cache's staleness-healing purpose (rounds 3-4)
  disappears. Its remaining value (same-load `/holdings`+`/allocation` dedup)
  is real but small — revisit then whether it's still worth keeping as-is, or
  whether that's the moment to invest in real single-flight coordination
  (round 4's accepted limitation) if the dedup case still matters.
- Fix B (parallelized network fetch) stays useful regardless of Fix C — it's
  about the shape of concurrent scheme-NAV fetches, not about whether the
  fetch is on-demand or scheduled, so it isn't superseded by the recurring job.

## Branch reconciliation and push (this session)

`feat/enhanced-ui` was behind `origin/feat/enhanced-ui` by 4 commits — the
colleague's incoming UI work (distributor-comparison view update, import
review page update, a CAS-request-redirect auth fix, an import-card layout
fix). Fast-forwarded to pick those up, then this session's dashboard-nav-perf
fix (above) was committed on top and pushed. `dev_intern` was fast-forwarded
to match and pushed too, so both branches stay identical and carry everything,
same convention as the prior branch reconciliation. `main` remains untouched
per the standing instruction to hold off merging until the analytics
dashboard (PRD-04) is complete. See `git log` on both branches for the exact
commits — this file intentionally doesn't duplicate commit hashes that go
stale the moment a new commit lands.

**Repo-hygiene note reconfirmed this session**: the working tree carries a
large amount of unrelated in-progress work from other concurrent sessions
(another Claude account's Phase 4 Scorer work in `Docs/superpowers/plans/`,
plus the long-standing pure-CRLF-noise files across `.claude/skills/` and
`frontend/src/`, reconfirmed again via `git diff -w` — zero real content).
None of it was touched, staged, or reverted; every commit this session was
scoped by explicit pathspec to only the files this session's work actually
produced.

## Model Orchestration skill — built this session

New project-level skill at `.claude/skills/model-orchestration/`
(internal, not open-source — contains this user's specific
two-Claude-accounts-plus-Codex setup). Governs delegating implementation
work to Codex (via the already-installed `openai/codex-plugin-cc`
plugin's `codex:codex-rescue` subagent) as the default worker, with
Claude Code staying the orchestrator for architecture/interface
design/final assembly. Built via the standard brainstorming →
writing-plans → (subagent-driven-development or executing-plans)
pipeline, not via `task-observer`'s own observation-driven update flow —
this was a direct user-commissioned build. Full design:
`Docs/superpowers/specs/2026-08-12-model-orchestration-skill-design.md`;
full plan: `Docs/superpowers/plans/2026-08-12-model-orchestration-skill.md`.
Parallel Codex dispatch capability: see the verdict recorded in
`.claude/skills/model-orchestration/references/delegation-rules.md`
(Task 1's live-verification result, carried there — the plan file's own
placeholder for it was never back-filled).

## Phase 4 Part 4: category-universe NAV caching → category ranking (PRD-04 FR-3/FR-4) — built and committed

Built directly (TDD, one task per commit) per the Phase 4 design doc's
build order, continuing straight on from Part 3 in the same session at the
user's explicit "lets build it".

**Data-gap fix — `backend/app/services/analytics/scheme_universe.py`**:
mfapi.in's bulk scheme list has no category field, and per-scheme category
lookup across ~40,000 schemes is infeasible, so category-universe lookups
instead ingest AMFI's bulk `NAVAll.txt`
(`https://www.amfiindia.com/spages/NAVAll.txt`, 302-redirects to
`portal.amfiindia.com` — requires `follow_redirects=True`). Live-verified
this session via `curl`: CRLF line endings, ~17,748 lines, 90 category
header lines (`(Open Ended|Close Ended|Interval Fund) Schemes(<category>)`)
across 83 distinct category names, AMC-name lines (no semicolons) and
blank-line separators interspersed, scheme rows formatted `Scheme
Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme
Name;Net Asset Value;Date`. Directly joinable with local
`schemes.sebi_category` with zero string-format reconciliation, since both
ultimately derive from mfapi.in's `meta.scheme_category`. Same disk-cache
idiom as `import_/enrich.py`'s `MfApiClient` (24h TTL, test-injectable
`cache_dir`), but class-based since this is a bulk universe file rather
than the per-row DB-cache idiom `nav.py`/`arn_lookup.py` use.
`get_category_universe(db, sebi_category)` is get-or-create by
`amfi_code`, degrades to `[]` on `httpx.HTTPError`.

**`backend/app/services/analytics/category_ranking.py`** —
`compute_category_ranking` (FR-3: each held scheme's blended 3yr/5yr CAGR
rank within its full SEBI-category peer universe) and its AUM-weighted
category-average companion (FR-4, using `SchemeAaum` rows already ingested
by Part 2's `amfi_aaum_client.py`, latest `reference_period` per scheme,
degrades to `None` if no scheme in the pool has AAUM data). One judgment
call flagged in-code per CLAUDE.md's "stop and say so" (see the module's
docstring): PRD-04's Resolved Open Questions fixes the blend *inputs*
("3-year minimum to qualify... 5-year blended in once available... no
10-year window") but not the blend weights — used Morningstar's published
3/5/10yr weighting (20/30/50), normalized without the unused 10yr weight,
giving 3yr=40%/5yr=60% when both windows exist, 100% 3yr otherwise. The
"3-year minimum to qualify" rule falls naturally out of
`get_nav_on_or_before`'s existing `None`-on-no-data behavior rather than
needing separate qualification logic. FR-3's rank is a plain return-based
CAGR rank — explicitly not FR-5a's downside-weighted, risk-adjusted
Scorer tier (a later build step that depends on this one). Thin-category
handling reuses FR-5a's "at least 5 schemes" threshold for consistency,
but per the Edge Cases table this only sets a `thin_category` flag, never
excludes a category from ranking/averaging (unlike FR-5a's harder
exclusion rule). A held scheme with no `sebi_category` gets
`category_unavailable=True` and is excluded from ranking, never silently
dropped; a scheme without 3yr history gets `insufficient_history=True` but
is still shown as a row. Family-aggregate wrapper
(`get_aggregate_category_ranking`) follows the exact same
`get_member_statuses`/`list_household_members` pattern as every other
`analytics/` module.

**Routes** (`backend/app/api/analytics.py`) — `GET
/analytics/household-members/{member_id}/category-ranking` and `GET
/analytics/household/aggregate/category-ranking`, mirroring the existing
routes' auth/404 pattern exactly.

Tests: 314 passed, 2 skipped (up from 286/2 after Part 3).

**Branch reconciliation (resolved this session)**: `dev_intern` and
`feat/enhanced-ui` had diverged — local `feat/enhanced-ui` carried this
session's Part 4 backend commits while `origin/feat/enhanced-ui` had
separately gained the intern's UI/UX overhaul (shadcn/tailwind, dashboard,
mobile shell) and CAS import flow redesign. Merged the two (clean,
disjoint files — `bb32b97`), then fast-forwarded `dev_intern` to match,
so both branches are now identical and carry everything. `frontend/`
needs `npm install` after pulling (new deps: `lucide-react`, Radix UI
primitives, Tailwind, `@visx/*`, etc.) — full suite verified after:
backend 314/2, frontend 43 files / 151 tests, all passing. The stale
`feature/frontend-redesign` branch (0 commits ahead/behind `main`) was
deleted locally; **remote deletion and pushing `dev_intern`/
`feat/enhanced-ui` still need to happen from a machine with git
credentials** — this sandbox has none. `main` is untouched, per the
user's instruction to hold off until the analytics dashboard is done.

Per the design doc's 5-step build order, **the Scorer (FR-5/FR-6/FR-7) is
the last remaining Phase 4 build step** — it depends on Parts 2, 3, and 4,
all of which are now complete.

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

*(Stale as of 2026-08-14 — kept for history. PRD-04's backend is now fully built; see
the "Branch reconciliation" section at the top of this file for current status.)*

**PRD-04 (Analytics)** remains fully unbuilt, the module after Main Dashboard in the natural build order.
