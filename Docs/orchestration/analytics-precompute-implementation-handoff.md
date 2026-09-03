# Handoff: analytics-precompute-implementation

**Status:** OPEN — Tasks 1-3 done (commits `47b0bb9`, `9ca4933`, `729ea8e` on
`worktree-analytics-precompute-architecture`), Tasks 4-9 remaining. Codex ran
Tasks 1-2 cleanly, then correctly stopped mid-Task-3 per this doc's
missing-context-gating clause rather than guessing a fix for two internal
inconsistencies in the plan's literal Task 3 code (see "Task 3 findings"
below). Claude fixed both directly and committed `729ea8e` — full suite green
(587 passed, 3 skipped) before handing back for Tasks 4-9. (2026-09-02)
**Parent plan:** `Docs/superpowers/plans/2026-09-02-analytics-precompute-architecture.md`
(9 tasks, fully detailed, no placeholders — this handoff doc does not restate that
plan's content, only the "why" and constraints a plain prompt summary would lose)
**Parent spec:** `Docs/superpowers/specs/2026-09-02-analytics-precompute-architecture-design.md`
**Dispatch mode:** User is running this directly in their own Codex CLI/app session
(not via Claude's `codex:codex-rescue` Agent dispatch), specifically to conserve Claude
token spend for this session. This doc is still the source of truth both sides read;
update `Status` here after Codex finishes and report back to Claude for the mandatory
review gate.
**Worktree:** `.claude/worktrees/analytics-precompute-architecture` (branch
`worktree-analytics-precompute-architecture`, forked off `feat/enhanced-ui` at `39a97ca`)
— created so this work stays isolated from any other in-flight session on
`feat/enhanced-ui`.

## Task

Execute all 9 tasks of the implementation plan in order, task by task, TDD-style
exactly as each task's steps specify (failing test → run to confirm fail → minimal
implementation → run to confirm pass → commit). The plan already contains complete,
non-placeholder code for every step — this is execution, not design or research.

## Constraints

- **TDD, no exceptions** — every task's steps already dictate the red/green/commit
  cycle; follow it as written, don't batch multiple tasks' code together before
  running tests.
- **`Decimal`, never `float`**, for every money/units/NAV/percentage value (repo-wide
  rule, CLAUDE.md/AGENTS.md) — none of this plan's 9 tasks should introduce a new
  `float` on a money path; if one seems necessary, stop and flag it rather than adding it.
- **AWS ARNs/networking are explicitly out of scope.** Task 4's `config.py` settings
  (`ecs_cluster_arn`, `ecs_task_definition_arn`, etc.) must stay empty-string defaults.
  Do not invent, guess, or fill in any concrete AWS resource identifier — a separate,
  parallel session is finalizing the real ECS/EventBridge wiring, and reconciling the
  exact `RunTask` invocation contract against that session's decisions happens later,
  outside this task.
- **Don't touch `session.md`/`CLAUDE.md`'s "still open" item 7** (blocking
  `db.commit()` inside `async def`) even though the plan's Global Constraints section
  discusses it — that's a separate docs-only correction, not part of this plan's code.
- **Don't touch the frontend.** `frontend/src/features/analytics/api.ts` and its
  callers will break once Task 9 removes the 14 old routes — that's expected and
  flagged as an explicit, separate follow-up in the plan's closing section, not
  something to fix here.
- Full backend test suite must pass (`cd backend && .venv/bin/pytest -q`) before any
  task's step says "run to verify it passes" reports success, and again as the final
  check after Task 9. Two Postgres-marked functional tests may skip/fail in this
  worktree if no local Docker Postgres is reachable — that's expected and unrelated to
  this plan's changes; don't attempt to fix or work around it.
- This worktree has no Python virtualenv yet (worktrees don't inherit gitignored
  `.venv` from the main checkout) — set one up first: `cd backend && python3 -m venv
  .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt` (Task 4
  adds `boto3>=1.35.0` to `requirements.txt` partway through — re-run `pip install -r
  requirements.txt` after that edit, before Task 4's tests).
- Commit after every task (each task's own Step "Commit" already specifies the exact
  `git add`/`git commit` invocation and message) — don't squash multiple tasks into one
  commit, don't skip a task's commit step.

## Approaches considered and rejected

- **Dispatching this via Claude's own `codex:codex-rescue` Agent tool, task-by-task
  with a review gate between each** — the model-orchestration skill's normal default.
  Rejected for this run specifically at the user's request: that flow burns Claude
  tokens on every dispatch/monitor/review round-trip across 9 tasks. Running the whole
  plan in one user-driven Codex CLI/app session, then a single consolidated review once
  it's back, keeps Claude's token spend to the review pass only.
- **9 separate handoff docs, one per task** — the implementation plan document already
  contains everything each task needs (files, exact code, step-by-step TDD sequence);
  a second per-task doc would just paraphrase it. One handoff doc covering the whole
  plan, carrying only the constraints/context the plan itself doesn't restate, is
  sufficient here.

## Open questions

- If any task's plan code references a function/schema field/signature that no longer
  matches what's actually in the worktree's checked-out code (e.g. something changed
  between when the plan was written and when Codex runs it), stop and report the
  mismatch rather than guessing a fix — the plan was grounded against the codebase at
  commit `39a97ca`; if drift is found, note the specific task/file/line.
- If a task's test setup needs a fixture/helper pattern not fully spelled out in the
  plan (the plan references some existing test file conventions by name, e.g.
  `tests/models/test_auth_identity_models.py`'s `_session()` pattern for Task 1) and
  something is genuinely ambiguous, follow the referenced file's actual current
  convention over the plan's paraphrase of it.

## Task 3 findings (resolved by Claude, 2026-09-02, commit `729ea8e`)

Codex's stop-and-report was correct — both were genuine bugs in the plan's
literal code, not something to guess around:

1. `_SectionSpec` was declared `@dataclass(frozen=True)`, but the plan's own
   tests patch `.compute` per-instance via `unittest.mock.patch.object`,
   which requires attribute mutation. Fix: dropped `frozen=True`.
2. `should_dispatch_recompute` subtracted a DB-round-tripped `started_at`
   from an aware `datetime.now(timezone.utc)`. SQLite's `DateTime(timezone=True)`
   doesn't preserve tzinfo on read (Postgres does) — a `started_at` written
   aware comes back naive on SQLite. Fix: normalize a naive read to UTC
   before subtracting.

Also corrected the new `test_recompute_does_not_refetch_nav_over_network_for_a_category_shared_across_scopes`
test: it asserted on `_fetch_nav_history`'s call count (2, not 1), but
`compute_holdings` (called at the top of `compute_category_ranking`,
unmodified by this plan) does its own separate, pre-existing per-scheme
valuation lookup via `get_nav_on_or_before`, which also touches
`_fetch_nav_history` once — independent of this module's category-returns
caching. Rewrote to spy on `warm_nav_history` directly (call count == 1),
which is the exact function the spec's "called once, not once per scope"
claim is about.

## Verification required before reporting done

- All 9 tasks' own step-level test runs pass as each task specifies.
- Full backend suite green at the end (`pytest -q`), excluding the two
  Postgres-marked tests if Docker Postgres isn't available in this environment.
- `git log --oneline` on the worktree branch shows one commit per task (9 commits,
  possibly more if a task's steps commit more than once — check each task's plan text).
- Report back: which tasks completed cleanly, any deviations from the plan's literal
  code (and why), any open question above that got triggered, and the final test
  suite result.
