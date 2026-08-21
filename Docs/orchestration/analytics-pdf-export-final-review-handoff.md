# Handoff: analytics-pdf-export-final-review

**Status:** OPEN
**Parent plan:** `Docs/superpowers/plans/2026-08-20-analytics-pdf-export.md`
**Spec:** `Docs/superpowers/specs/2026-08-20-analytics-pdf-export-design.md`
**Worktree:** `/mnt/d/Unifolio code/.claude/worktrees/analytics-pdf-export` (branch `worktree-analytics-pdf-export`)

## Why this handoff exists

All 10 plan tasks are implemented, task-reviewed, and committed. The only
step left before this branch can go through `superpowers:finishing-a-development-branch`
is the plan's **mandatory final whole-branch review**
(`superpowers:subagent-driven-development`'s process, dispatched via the
`superpowers:requesting-code-review` `code-reviewer.md` template). The
Claude account running this session is at ~93% of its weekly limit, so this
review — and the fix-round-if-needed that follows it — is being handed to
Codex instead of dispatched as a Claude subagent, per this repo's
`model-orchestration` skill (Codex is the default worker for exactly this
kind of bounded, well-specified review task).

## Task

Run the final whole-branch review for the git range **`321b6ed..4ce4561`**
(10 commits, all on `worktree-analytics-pdf-export`) against the plan and
spec above. Concretely:

1. Generate the diff yourself if the pre-generated one below is stale:
   `git diff 321b6ed..4ce4561` (or reuse
   `.superpowers/sdd/2026-08-20-analytics-pdf-export/review-321b6ed..4ce4561.diff`
   if it still exists in the worktree — it was generated from the same range).
2. Read the plan file and design doc above in full.
3. Read `.superpowers/sdd/2026-08-20-analytics-pdf-export/progress.md` (the
   SDD ledger — git-ignored, worktree-local) for the full per-task history:
   what each of the 10 tasks did, every ruling made along the way, and the
   Task 10 manual-verification findings (two real bugs found and fixed,
   one pre-existing out-of-scope backend bug found and ledgered, not fixed).
4. Review against the standard axes: plan alignment, code quality,
   architecture, testing, production readiness. Use the same calibration
   the `code-reviewer.md` template asks for — categorize findings by actual
   severity (Critical/Important/Minor), and note strengths, not just gaps.
5. This is a **read-only review**: do not mutate the working tree, index,
   HEAD, or branch. Do not merge, push, or delete anything. Do not dispatch
   a second reviewer or subagent — do the whole review yourself.
6. Report back: Strengths / Issues (by severity, with file:line) /
   Recommendations / a explicit "Ready to merge?" verdict.

## Things already known and settled — do not re-litigate

These were investigated and ruled on during implementation. Re-raising them
without new evidence just burns a review round:

- **`PrintAnalyticsView.tsx`'s `useRef` StrictMode guard** (`hasFetchedRef`):
  intentional fix for the single-use export token being double-consumed by
  React 18 StrictMode's dev-mode double-invoke. Already fixed in `4ce4561`.
- **`BenchmarkSection.tsx`'s `printMode` prop**: intentional fix for a
  design-doc-vs-implementation gap (the per-fund tab and "Show More"
  pagination were click-gated, which a static PDF render can never trigger).
  Mirrors the precedent set by `FundScoreCard`'s "always expanded" extraction
  in Tasks 6/8. Already fixed in `4ce4561`, with a new test.
- **In-process, non-persistent export-token store** (`pdf_export.py`'s
  `_export_payloads` dict): a documented `ponytail:`-style tradeoff, correct
  for this deployment's single-Uvicorn-worker reality — flag only if you
  find evidence multiple workers are actually in play.
- **`category_ranking.py:76`'s `_cagr` `DivisionUndefined` (0/0) crash** on
  aggregate multi-category scoring with thin NAV history: a real,
  pre-existing bug, confirmed to reproduce identically on the *live*
  (non-exported) dashboard's own `getAggregateScore`/`getAggregateCategoryRanking`
  calls — not introduced by or specific to this PDF-export feature. Ruled
  out of scope for this plan; ledgered for a follow-up ticket. Flag it in
  your report as a known issue, but do not treat it as a blocker for this
  branch, and do not attempt to fix it here.
- **`HoldingsTable.tsx`'s dead `row.return_percentage_1y` field**,
  **the missing `household_members` "self" uniqueness constraint**, and
  **the SIP tab's incomplete ARIA IDREF pattern** — all pre-existing,
  documented in `CLAUDE.md`'s "Still open" list, unrelated to this branch.

## Constraints

- Decimal-safety, no-float-for-money, and the other repo-wide non-negotiables
  in `AGENTS.md` apply to anything you'd propose as a fix, if a fix round
  turns out to be needed.
- If you find a genuine Critical or Important issue: describe it precisely
  (file:line, what's wrong, why it matters) but do **not** fix it yourself
  in this pass — report it. Ayush or a follow-up session will decide whether
  to dispatch a fix round.
- Do not run `git merge`, `git push`, or touch `main`/`feat/enhanced-ui`.
  Do not delete the SDD workspace
  (`.superpowers/sdd/2026-08-20-analytics-pdf-export/`) — that only happens
  after a human confirms the review is clean.

## Open questions

None — this is a bounded, read-only review task. If something in the plan
or spec is ambiguous, note it in your report rather than guessing silently.
