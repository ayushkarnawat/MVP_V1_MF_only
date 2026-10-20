# Handoff: ux-fixes (Analytics UX fixes, phases P1–P6)
**Status:** IN_PROGRESS — Phase P1 built and committed (Runs 1-4); P1 batched adversarial review pending; P2 (Run 5 = plan R4) next, 2026-10-20
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
**Git read-only whitelist** (`status`, `diff`, `log`, `show`, `grep`, `ls-files`): never `add`/`commit`/`stash`/`checkout`. **Never touch** `infra/`, real CAS PDFs, `Docs/` (plans and artifacts are Claude's), existing migrations (new ones only in R4, number from `alembic heads`). **Follow the plan literally**; mechanics deviations go under "Deviations", behaviour/interface questions under "Open questions". **Test-first** (failing test, see it fail, then code). **Run only the named test files plus every importer `git grep` finds**, never full suites. Backend on Windows from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q`; frontend from `frontend\`: `npx vitest run <files>` and `npx tsc -b`. Money: `Decimal` backend, decimal strings frontend via `lib/decimal.ts`. New payload fields always have defaults. LF endings, UTF-8, no new dependencies, stack locked. If the plan's line numbers or names differ from the code, trust the code, note it under Deviations.

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
