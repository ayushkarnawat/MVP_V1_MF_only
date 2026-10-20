# Handoff: ux-fixes (Analytics UX fixes, phases P1–P6)
**Status:** IN_PROGRESS — Run 1 DONE (0efd5bf..ebccc2b, review PASS); Run 2 (P1-T5) with Codex; P1-T6 = option A, own run after R3 once copy approved, 2026-10-20
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
