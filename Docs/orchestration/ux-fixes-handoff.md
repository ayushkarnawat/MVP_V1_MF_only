# Handoff: ux-fixes (Analytics UX fixes, phases P1–P6)
**Status:** IN_PROGRESS — P1, P2 DONE; P3-T1..T4, T6 committed; P3-T5 (synthetic checks) running; Run 7 adversarial review pending, 2026-10-20
**Parent plan:** `Docs/superpowers/plans/2026-10-19-analytics-ux-fixes-plan.md` (binding; read "Global Constraints", "Locked decisions", "Review Focus" first, then only the run's tasks)
**Spec copies:** `Docs/orchestration/analytics-ux-changes-spec/` (`analytics-ux-changes-v18.html`, `other-fixes.html`)
**Orchestrator:** Claude Code · **Worker:** Codex (manual relay, one run per prompt)

## How this works
Same loop as Sub-projects 1 and 2: the user pastes the run's prompt into Codex; Codex implements test-first and prints the CODEX REPORT (template at the bottom); the user pastes it back; Claude re-runs the run's affected tests in WSL, reviews (Codex adversarial review via relay; Opus on R4/R5/R11/R14, approved), and commits **one commit per plan task** on `feat/leapswitch-staging`, explicit paths only, never pushes.

## Runs
| Run | Tasks | Reviewer |
|---|---|---|
| **R1** | P1-T1…T4 (labels, benchmark names, copy fixes, Direct/Regular bar) | Codex |
| R2 | P1-T5 now; P1-T6 held (doc/code disagree, see `2026-10-20-score-explainer-check.md`) | Codex |
| R3 | P1-T7…T9 | Codex |
| R4 | P2-T1, P2-T2 | Opus |
| R5 | P3-T1, T2, T6 | Opus |
| R6 | P3-T3…T5 | Codex |
| R7 | P4-T1, T2 | Codex |
| R8 | P4-T3…T5 | Codex |
| R9 | P5-T1, T2 | Codex |
| R10 | P5-T3, T4 | Codex |
| R11 | P6-T1, T2 | Opus |
| R12 | P6-T3…T6 | Codex |

## Constraints (non-negotiable)
**Git read-only whitelist** (`status`, `diff`, `log`, `show`, `grep`, `ls-files`): never `add`/`commit`/`stash`/`checkout`. **Never touch** `infra/`, real CAS PDFs, `Docs/` (plans and artifacts are Claude's), existing migrations (new ones only in plan R4 = Run 5, number from `alembic heads`; `0037_seed_scenario_library.py` must not be edited). **Follow the plan literally**; mechanics deviations go under "Deviations", behaviour/interface questions under "Open questions". **Test-first** (failing test, see it fail, then code). **Run only the named test files plus every importer `git grep` finds**, never full suites. Backend on Windows from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q`; frontend from `frontend\`: `npx vitest run <files>` and `npx tsc -b`. Money: `Decimal` backend, decimal strings frontend via `lib/decimal.ts`. New payload fields always have defaults. LF endings, UTF-8, no new dependencies, stack locked. If the plan's line numbers or names differ from the code, trust the code, note it under Deviations.

## Run 1 — P1-T1…T4
Implement the plan's **Task P1-T1, P1-T2, P1-T3, P1-T4** exactly (Phase P1 in the plan; all four are frontend-only, no backend, no migration). Files per task are listed in each task. Locked decisions that apply: benchmark labels "(Total Return)"; readable benchmark label for `nifty_largemidcap_250` plus a readable fallback; "Trailing the category average by X%" with a falling arrow; negatives as `-₹2,40,000`; no "S20" in user-visible text; the empty Direct/Regular bar is hidden with the explanatory notes.
Order: T1, T2, T3, T4, each with its own red/green. Do not start P1-T5 or later.
Report extras: for each task, the exact user-visible strings that changed (old → new).

## Run 1 result (2026-10-20)
DONE. Review PASS (fresh reviewer; /codex:adversarial-review unavailable in Codex). Two low pre-existing observations accepted as documented limitations: TER upper cards still say "No ... Holdings" for held plans without a TER (P1-T4 leaves them unchanged); a shortfall under 0.005pp rounds to zero before the arrow is chosen and can read "Outperforming +0.00%".

## Run 2 — P1-T5 only (tier badge colours)
Implement the plan's **Task P1-T5** exactly, frontend only: tokens in all four blocks of `tokens.css`, `tierStyle.ts` (`tierBadgeStyle`, `portfolioVerdict`, exported `PORTFOLIO_VERDICT_COLOURS`), applied to every element that renders "Tier N" and to the portfolio label. D4 decided: High green / Moderate slate / Needs Review amber. **Do not start P1-T6** (held on a doc-vs-code disagreement). Report extras: the contrast of each tier's bg/fg pair in light and dark if you can compute it, and every file where a fixed accent class was removed.

## Run 2 result (2026-10-20)
Built by Codex, verified by the orchestrator (31 tests in WSL, tokens match the plan in all four blocks), committed as the P1-T5 commit. Adversarial review is **batched with Run 3** (both frontend-only, small) to save a relay.

## Run 3 — P1-T7, P1-T8, P1-T9
Implement the plan's **Tasks P1-T7 (exact scenario dates), P1-T8 (Franklin headline when nothing was frozen), P1-T9 (AMC/Category/dashboard donut sort order)** exactly, frontend only, in that order, each with its own red/green. Locked decisions that apply: Q8 (exact dates on every scenario screen, month-only only as a fallback, read day/month/year from the ISO text, never a `Date` object), Q12 (neutral Franklin headline "None of your funds were frozen in this event", no portfolio impact figure), Q9/Q10 (AMC allocation opens smallest first, toggle to largest first, applies to the AMC tab, Category tab and the main dashboard donut on desktop and mobile; the asset-class view keeps its fixed order; slices keep their colour when the order flips). **Do not start P1-T6.** Report extras: the exact user-visible strings that changed (old → new) and every screen the sort toggle is wired into.

## Run 3 result (2026-10-20)
Built by Codex, verified by the orchestrator (9 files, 58 tests in WSL; Codex ran 17 files, 203 tests, tsc clean). Committed as P1-T7 `fbf58b9`, P1-T8 `54a0d71`, P1-T9 `414b5b6`. Codex also fixed a real bug found in self-review: a tapped donut slice moved to another allocation after reordering (selection now follows the label). Adversarial review is batched: one review over Runs 2, 3 and 4 at the end of P1.

## Run 4 — P1-T6 (score explainer), Steps 3 to 7
Steps 1 (doc/code check) and 2 (copy approval) are done; see "P1-T6 approved copy" below and `2026-10-20-score-explainer-check.md`. Implement the plan's **Task P1-T6 from Step 3**, exactly, test-first, frontend only: `scoreExplainerCopy.ts` holds the approved text verbatim (no wording edits), `ScoreExplainer.tsx` is collapsed by default (`<button aria-expanded>` plus a region, no new dependency), the toggle in `ScorerSection.tsx` is hidden in `printMode`. Report extras: the exact strings the tests assert, and confirm the copy file matches the approved text word for word.

## Run 4 result (2026-10-20)
Built by Codex, verified by the orchestrator (ScoreExplainer + ScorerSection tests, 15 pass in WSL; Codex 69 pass, tsc clean; the copy file matches the approved text). Committed as P1-T6 `fd0d1c2`. Codex added an optional `printMode` prop (default false) to `ScorerSection`; the toggle is hidden in print.
**P1 gate (orchestrator):** `tsc -b` clean; `oxlint` on all 43 touched .ts/.tsx files: 4 warnings only (react only-export-components on exported helpers in `BenchmarkSection`, `ScenarioPicker`, `ResultParts` x2; same pattern as the existing `rupees` export), no errors. Pending: one batched adversarial review over `6fec37a`, `fbf58b9`, `54a0d71`, `414b5b6`, `fd0d1c2`; user browser check (tier badges light/dark, allocation toggle, scenario header dates).

## Run 1-4 / P1 closing (2026-10-20)
Batched adversarial review over `6fec37a`, `fbf58b9`, `54a0d71`, `414b5b6`, `fd0d1c2`: **PASS**, no findings (214 tests across 19 focused files). P1 gate done except the user's browser check (light/dark tier badges, allocation toggle, scenario header dates), left for staging.

## Run 5 (plan R4) — P2-T1 and P2-T2 (scenario data; migrations)
Implement the plan's **Tasks P2-T1 (migration 0042, US-Iran phase end dates) and P2-T2 (duplicate-scenario scripts, migration 0043, model index)** exactly, test-first, backend only. Confirm `cd backend && alembic heads` is `0041` before naming; if not, renumber and tell me. Do not edit `0037_seed_scenario_library.py`. Locked decisions: Q16 (Shock ends 2026-04-01, Partial recovery ends 2026-07-07, matched by name where `parent_scenario_id IS NOT NULL`; Relapse and the parent untouched), Q17 (partial unique index on top-level names; 0043 refuses to run while duplicates exist). Both scripts are **read-only by default** (`apply=False`); **never run any script or migration against a real or staging database**, only against the test SQLite files and in-memory databases. The Postgres roundtrip (partial-index syntax) is run by the orchestrator, so write the tests in the `test_0028_postgres_…` style but do not require Postgres from Codex. Existing tests that insert two top-level scenarios with one name must get distinct names; never weaken the index.
**Orchestrator finding (P2-T1 Step 5, done):** `refresh_nav_daily.py` only recomputes `is_ongoing=True` scenarios; the Shock and Partial recovery phases are `is_ongoing=False` (0037 lines 87-88), so the daily job will **not** refresh them after 0042. The deploy guide must run `python scripts/compute_all_scenarios.py` after the migration. Nothing for Codex to do; do not change the job.
Reviewer: **Opus** (migrations and row deletion; D5 approved), run by the orchestrator.
Report extras: the migration filenames and revision ids, the exact `dedupe_scenarios` keep rule as implemented, and every existing test you had to rename a scenario in.

## Run 5 result (2026-10-20)
Built by Codex (Windows: 128 tests in six files), verified by the orchestrator in WSL (27 targeted tests pass after the fixes below). **Opus review: CHANGES NEEDED, all addressed.** (1) MEDIUM: the keep rule ignored phase rows and hypothetical assumptions, which are unrecoverable seed data. User chose "refuse and show counts": diagnose shows an assumptions column, `--apply` refuses (exit 1, nothing deleted) when a copy to remove holds more phases or assumptions than the kept one. (2) LOW: stale phase results after 0042, so the deploy guide must run `compute_all_scenarios.py` (already recorded). (3) LOW: case/whitespace near-duplicates are not caught; accepted as a documented limitation, matches the spec. (4) LOW: Postgres roundtrip test now uses `head`. (5) LOW: test assertions strengthened (distinct decoy dates for the top-level same-named rows, contiguity of phases, kept copy's results survive). Fixes were made by the orchestrator (small diff, files loaded). **Not verified:** the migrations on PostgreSQL (no Docker access here). Commits: P2-T1 `8787390`, P2-T2 `c83ef2b`. Staging steps are separate user-confirmed deploy-guide steps (D3).

## Run 6 (plan R5) — P3-T1, P3-T2, P3-T6
Implement the plan's **Tasks P3-T1 (classification, totals and schema, backend), P3-T2 (frontend types and pure logic), P3-T6 (prove the benchmark XIRR uses each transaction's own date)** exactly, test-first, in that order. No migration, no new table. Locked decisions: Q1 (switches shown as their own pair; "Include switches" adds switched-in to Invested and switched-out to Withdrawn; Net invested and Gain unchanged; mergers and face-value conversions excluded), Q11 (opening holdings leave the bars; shown as a figure above the chart; the Invested tile still includes them). New schema fields all have defaults so saved payloads still load; `total_invested = sum of buckets + opening_holdings`. `is_conversion_description` and `direction_for` are consumed later by P6, so keep the signatures exactly as the plan states. Money is `Decimal` on the backend and decimal strings on the frontend. Backend on Windows from `backend\`; frontend from `frontend\`. Reviewer: **Opus** (money classification; D5 approved), run by the orchestrator.
Report extras: the exact rules `direction_for` applies for each transaction type (a table), every existing test whose expected totals changed and why, and the results of the P3-T6 characterisation tests.

## Run 6 result (2026-10-20)
Built by Codex (417 backend + 108 frontend tests on Windows), verified by the orchestrator in WSL (backend 128 pass/1 skip; frontend 32 pass). **Opus review: PASS** with one condition (M1: P3-T1 must not deploy without P3-T4/T5, see the plan's P3 execution notes) and spec notes for P6 (M2 opening direction, decided). The vacuous merger test was hardened by the orchestrator (a real purchase added, upper-case "MERGER"). The worked check for P3-T6 is in `Docs/orchestration/2026-10-20-benchmark-xirr-check.md`.

## Run 7 (plan R6) — P3-T3 and P3-T4 (frontend; P3-T5 is the orchestrator's)
Implement the plan's **Tasks P3-T3 (bar chart: baseline, negative bars, switch segments) and P3-T4 (section UI: toggle "Include switches", the "Switched between funds" line, the opening-holdings figure above the chart, the fund-wise `PeriodBreakdown` table with member filter)** exactly, test-first, frontend only, in that order. They consume the committed P3-T2 logic (`investmentWithdrawalMath.ts`, `periodBreakdown.ts`, optional fields in `types.ts`); read those first and do not change their signatures. **P3-T4 replaces the list in `InvestmentWithdrawalSection.tsx` that labels every non-invested entry "Withdrawn" in red; after P3-T4 an opening, switched-in or switched-out entry must never show as Withdrawn** (use `transactionLabel` from P3-T2; add a test per direction). Locked decisions: Q1 (switch pair, toggle adds switched-in to Invested and switched-out to Withdrawn, Net invested and Gain unchanged, line "Switched between funds ₹X in N switches" always shown, fund-wise breakdown with switched in/out columns; do not imply Invested minus Withdrawn equals Net invested when the toggle is on), Q11 (opening holdings leave the bars, shown as a figure above the chart, the Invested tile still includes them). Old saved payloads (new fields absent) must render with no `NaN` and no `undefined`; money stays decimal strings via `lib/decimal.ts`, `parseFloat` only for chart coordinates. Do not start P3-T5. Report extras: a screen-by-screen list of what renders for: opening-only, switch-only, mixed, no data, and an old payload; every file where the toggle appears (desktop, mobile, print).

## Run 7 result (2026-10-20)
Built by Codex (124 frontend tests on Windows), verified by the orchestrator in WSL (4 files, 49 pass; after the rename 3 files 42 pass; tsc clean). Orchestrator change: the component file `PeriodBreakdown.tsx` was renamed `PeriodBreakdownTable.tsx` (and its test) because it differed from the logic file `periodBreakdown.ts` only by letter case, which Codex had to work around with explicit `.tsx` imports and would break on case-insensitive filesystems. Commits: P3-T3 `b4be207`, P3-T4 `3cdd173`. Codex found and fixed a real layout bug in self-review (a negative invested amount must be clamped before computing the upward scale, or a reversal plus an incoming switch drew outside the plot). The toggle appears on desktop and mobile through the shared section and is absent in print. P3-T5 (synthetic checks, orchestrator via a Sonnet subagent) is in progress; the browser check of the toggle is the user's.

## P1-T6 approved copy (D7 approved by the user, 2026-10-20) — used in its own run after Run 3
Option A (explain the code as it is). The explainer text, verbatim; `scoreExplainerCopy.ts` holds exactly this, no edits:

**How the Unifolio Fund Score works**
Every fund is compared only with other funds in its own SEBI category, so a Large Cap fund is never ranked against a Mid Cap fund. Each fund gets a score out of 100 built from three things:
- **Return (45%)**: how its returns over time rank against its category peers.
- **Risk (30%)**: how much it loses in bad months (downside deviation). Lower is better.
- **Consistency (25%)**: how often it has beaten its category average.

A small cost adjustment is applied on top: up to 0.25 points up or down, depending on whether the fund's expense ratio is lower or higher than its category average. Differences under 0.05 percentage points are ignored.

**Tiers:** Tier 1 is the top 20% of its category, Tier 2 the next 20%, down to Tier 5 for the bottom 20%.
**Portfolio label:** 70 or more is "High Quality Portfolio", 50 to 69 is "Moderate Quality Portfolio", and below 50 is "Needs Review".
*A modelling opinion based on past data, not a guarantee of future returns.*

**Composite rating (Fund Ranking):** 25% 3-year return, 25% 5-year return, 20% performance against the category, 15% low volatility, 15% low expense ratio.

The plan's P1-T6 tests assert `45%`, `30%`, `25%`, `Tier 1`, `Top 20%`, and `25%`, `20%`, `15%` in the composite section; these all appear in the copy above. Step 1 (doc/code check) and Step 2 (copy approval) of P1-T6 are DONE; Codex starts at Step 3.

## Self-review (before printing the report)
1. `git diff --stat` / `git status --porcelain`: only this run's files; `git diff --cached --stat` empty.
2. Hostile pass against the plan's Review Focus (negative money display, old saved payloads with missing fields, no `NaN`/`undefined`, edge accounts).
3. Fix what you find, re-run the affected tests, list every finding.

## CODEX REPORT — template (one fenced code block, at the very end)
```
CODEX REPORT — ux-fixes — Run <1..12>
Run date/time: <…>    Environment: Windows    Node: <version>    Baseline HEAD: <hash>

1. TASK STATUS
   Task <id>: DONE | PARTIAL | BLOCKED — <one line>
2. FILES (grouped by plan task)
   New (untracked): …   Modified: …   Staged (must be empty): …
3. TESTS (exact command + last 3 lines)
   RED: …   GREEN: …   Extra files via git grep: …   tsc: …
4. DEVIATIONS (mechanics only)
5. FINDINGS (what the code showed that the plan did not say)
6. OPEN QUESTIONS / BLOCKERS
7. SELF-REVIEW FINDINGS
   - [High/Med/Low] file:line — finding — FIXED | NOT FIXED (why)
8. CONFIRMATIONS
   - No git write commands: YES/NO   - Full suites not run: YES/NO
```
