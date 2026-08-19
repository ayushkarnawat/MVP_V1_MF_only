---
name: model-orchestration
description: >
  Use when delegating non-trivial implementation, refactor, boilerplate,
  or research/lookup work to Codex, or when a task decomposes into
  parallelizable independent subtasks that would otherwise mean
  dispatching multiple Claude subagents. Governs the split between
  Claude Code as orchestrator (architecture, multi-file interface
  design, complex debugging, final assembly — never delegated) and
  Codex as the default worker (~90%+ of delegable subtasks), including
  the mandatory per-task handoff doc, the mandatory adversarial review
  gate before any Codex-implemented change is considered done, and the
  named conditions for asking to escalate to Opus. Internal skill,
  project-scoped to this repo and this user's specific
  Claude-account-plus-Codex-account setup — see
  Docs/superpowers/specs/2026-08-12-model-orchestration-skill-design.md
  for the full design rationale.
---

# Model Orchestration

Internal skill. Coordinates Claude Code (orchestrator) and Codex
(default worker) to preserve token/quota across accounts, without losing
the "why" behind a plan at the delegation boundary. Sits on top of the
`openai/codex-plugin-cc` plugin's existing mechanics
(`codex:codex-rescue`, `/codex:review`, `/codex:adversarial-review`,
`gpt-5-4-prompting`) — never reimplements them.

## Roles

- **Orchestrator — Claude Code.** Architecture, multi-file interface
  design, complex debugging, final assembly, all planning. Never
  delegated away.
- **Worker, default (~90%+) — Codex**, dispatched via
  `Agent(subagent_type: codex:codex-rescue)`. Single subtask: one call.
  Parallelizable independent subtasks: N parallel calls in one tool-call
  block (see `references/delegation-rules.md` for the verified/unverified
  status of this capability).
- **Worker, rare fallback — a genuine Claude subagent** (`Explore`,
  `general-purpose`). Only per the three conditions in
  `references/delegation-rules.md`.
- **Escalation — Opus.** Only on the three named triggers in
  `references/escalation-triggers.md`, always with explicit user
  approval first. No silent switch, ever.

This skill does not prescribe which of the user's two Claude accounts
(personal Pro / work) handles which work — that stays the user's call,
session to session.

## Reference files — load on demand

- `references/delegation-rules.md` — task-type classification table;
  load when classifying any delegable subtask.
- `references/handoff-doc-template.md` — the handoff doc format and
  lifecycle; load before delegating any non-trivial subtask to Codex.
- `references/escalation-triggers.md` — the three Opus-escalation
  conditions; load when considering whether to ask about Opus.
- `references/no-codex-fallback.md` — the ask-once/opt-out flow; load
  on the first delegation attempt in a session where Codex isn't ready.

## Core workflow

1. Classify the subtask against `references/delegation-rules.md`.
2. If Codex-bound and non-trivial: write a handoff doc per
   `references/handoff-doc-template.md` at
   `Docs/orchestration/<task-slug>-handoff.md` before dispatching.
3. Dispatch via `Agent(subagent_type: codex:codex-rescue, run_in_background:
   true, description: "<short task label>", prompt: "...")` — one call for
   a single subtask, N parallel calls for independent parallelizable
   subtasks. Use `gpt-5-4-prompting`'s recipe to shape the prompt; the
   prompt references the handoff doc's path rather than restating it.
   `description` is a required parameter — a call without it fails
   outright (`InputValidationError`); never omit it. `run_in_background:
   true` is what makes the eventual `task-notification` arrive
   automatically on completion — this is the only completion signal to
   rely on; never set up a manual `Monitor`/`sleep`-poll loop around a
   Codex dispatch, and never ask the user to check status — wait for the
   notification.
4. Append one line to `Docs/orchestration/delegation-log.md` recording
   the decision.
5. Present Codex's output per the existing `codex-result-handling`
   skill's rules (findings first, ordered by severity; never auto-apply
   fixes). **Verification tiering:** for intermediate rounds (any round
   before the one expected to close the review gate), independently
   re-run only the touched-area test files — fast, sufficient signal
   once the diff's scope is confirmed narrow (`git diff --stat`). Reserve
   an independent full-suite run for (a) the round expected to reach
   `DONE`, and (b) any round whose diff touches shared/cross-cutting code
   beyond the task's own files. This trades a little intermediate-round
   coverage for speed/tokens — the full suite still gates every `DONE`,
   with zero exceptions.
6. **Mandatory gate:** before the handoff doc's Status moves to `DONE`,
   run `/codex:review` or `/codex:adversarial-review` against the
   change — dispatched exactly like Step 3
   (`Agent(subagent_type: codex:codex-rescue, run_in_background: true,
   description: "...", prompt: "run /codex:adversarial-review against
   <scope> and report verdict + findings")`), never as a direct Bash call
   to `codex-companion.mjs`. This is not optional and not skippable for
   convenience — only the user deciding a finding isn't worth fixing
   closes it out, never a silent skip of the review step itself. **Never
   pass `isolation: "worktree"` on this dispatch** — see
   `references/delegation-rules.md`'s "Isolation parameter for
   dispatches" (a review makes no file changes, so worktree
   auto-cleanup can orphan the in-flight job). **When the reviewed
   change is a documentation/analysis deliverable rather than a code
   diff** (e.g. an investigation findings doc), explicitly instruct the
   dispatch to also check the document's own internal consistency (no
   section contradicting another) and that every conclusion stated as
   confirmed/fact is actually supported by the evidence presented
   earlier in the same document — not just whether cited code/facts are
   individually accurate. A pure code-correctness check misses
   self-contradictions and overclaimed causal language sitting entirely
   in the prose.
   **Stopping heuristic:** when a round's remaining finding(s) have
   trended to a lower severity than the prior round AND are explicitly
   correctness-safe (bounded cost, no data-loss/corruption path) AND
   fully closing them would need a materially bigger primitive than
   anything built so far, proactively recommend accepting as a
   documented limitation rather than defaulting to another round — state
   the reasoning, let the user decide, don't auto-dispatch round N+1 as
   the default action.
7. If, at any point, one of the three conditions in
   `references/escalation-triggers.md` is met: state which one fired and
   ask before switching to Opus. Otherwise stay on the default
   orchestrator model.
8. If Codex isn't configured/ready when Step 3 would otherwise fire:
   follow `references/no-codex-fallback.md` instead.

## Review-loop fix authorship

When the mandatory review gate (step 6) returns findings, the fix does
not automatically default to a fresh Codex handoff/dispatch cycle. Fix
directly as orchestrator, in the same turn, only when ALL of: the diff is
small-to-moderate (a handful of functions, not a new subsystem), the
touched file(s) are already fully loaded in the orchestrator's own
context, and a fresh handoff doc + dispatch + wait round-trip would
plainly cost more turns than fixing inline. This trades orchestrator
tokens for turnaround speed — the reverse of the default Codex-delegation
tradeoff — so use it only when the round-trip overhead clearly dominates,
never as a general shortcut around delegation. Record the choice and
reasoning in `delegation-log.md` exactly as any other delegation decision
(`worker=orchestrator`, why).

The mandatory review gate still applies unchanged to an orchestrator-direct
fix — it is not exempt from independent review just because Codex didn't
implement it. Dispatch a **scoped** re-review (point Codex at the fix
commit and the prior findings list, not a fresh whole-branch review) when
the fix's diff is confirmed narrow via `git diff --stat` against the
finding's own file(s); fall back to a full fresh review if the fix touched
shared/cross-cutting code beyond those files. This mirrors step 5's
verification tiering, applied to review scope instead of test scope — a
faster, cheaper confirmation that never weakens the gate itself.

## What this skill does not do

- Does not hand-roll `codex-companion.mjs` Bash calls directly, for any
  dispatch shape — implementation (Step 3) and review/adversarial-review
  (Step 6) alike — always through `codex:codex-rescue`. A review-only job
  is not an exception to this rule.
- Does not poll a Codex dispatch's status manually (no `Monitor`/`sleep`
  loops, no "what's the status" check-ins) — `run_in_background: true`'s
  `task-notification` is the sole completion signal, for both
  implementation and review dispatches.
- Does not auto-apply any review finding.
- Does not switch models without asking first.
- Does not maintain a full event ledger, digest-pinned routing file, or
  phase-folder hierarchy — deliberately lighter than `kiln`, per this
  project's existing conventions.

## Changelog

- **v1.4 (2026-08-19):** Added `delegation-rules.md`'s mandatory
  cheap-probe-before-expensive-setup pre-step (write a file, `git add`,
  `git commit` against any new dispatch location, before paying a large
  dependency-tree copy cost) and a new sub-case documenting that Git
  metadata writes (`git add`/`git commit`) fail in this project's
  `codex:codex-rescue` sandbox configuration even when ordinary
  source-tree writes succeed — confirmed across two independent sessions
  and multiple directories, explicitly scoped as a limitation of this
  environment's configuration, not a universal Codex constraint. Codified
  the resulting default worker split: Codex implements and self-tests;
  the orchestrator always performs staging/commits/merges/worktree
  management; Codex remains the default worker for read-only
  review/adversarial-review regardless, since those make no file changes.
  Also added an explicit independent-verification rule for agent
  completion (via `git log`/`git diff`/tests) whenever a dispatched
  agent's terminal notification is missing, premature, or contradictory —
  validated live this session (two Claude subagent self-reports were
  incomplete/truncated but the underlying commits had genuinely landed,
  confirmed only by direct `git log` checks rather than trusting the
  self-report). See `skill-observations/log.md` Observations 15,
  17, 19, 20 in the stable Claude Code workspace project folder.
- **v1.3 (2026-08-18):** Added a sub-case to `delegation-rules.md`'s
  "Known environment constraints": a Codex dispatch's sandbox write-scope
  is bound to the dispatch process's own `cwd`, not any path in the
  prompt text — a repo on a non-native-filesystem mount (confirmed for a
  WSL `/mnt/*` 9p/drvfs mount, `rw` at the host level) was still
  unreachable-for-writes from inside Codex's sandbox. Fix: clone the
  target branch into a fresh dir under the dispatch process's own
  native-filesystem root, dispatch there, pull commits back. Validated
  this session (dashboard-load-time perf work, PR #4).
- **v1.2 (2026-08-17):** Added the "never `isolation: worktree` on a
  review/read-only dispatch" rule (worktree auto-cleanup orphaned an
  in-flight background job during the BUG-001/DATA-001 review gate),
  the documentation-deliverable review dimension (internal consistency +
  evidence-supports-conclusion, not just code-fact-checking — this
  review caught 9 findings of exactly that shape), and the
  infra-error-retry-once sub-case plus the stale-verdict sanity check in
  `delegation-rules.md`'s dispatch-failure-recovery section. All three
  validated live this session (BUG-001/DATA-001 investigation review
  loop, PR #3).
- **v1.1 (2026-08-13):** Added `delegation-rules.md`'s worktree-sandbox-
  reach constraint and dispatch-layer-failure recovery step (Phase 4
  Scorer build: Codex's sandbox never reached the shared venv across 5/5
  dispatches; one dispatch's wrapper Agent call failed while its
  underlying Codex job completed independently). Added "Review-loop fix
  authorship," codifying when the orchestrator fixes a review finding
  directly vs. redelegating, and how re-review is scoped after a fix
  loop — both validated this session (fix committed `d732fce`, scoped
  re-review returned clean, zero regressions across 345 tests).
- **v1.0 (2026-08-12):** Initial skill — Codex as default worker,
  mandatory handoff doc + adversarial-review gate, escalation triggers,
  Bash→Agent routing for review dispatches, required `description`
  parameter, verification tiering, stopping heuristic for
  diminishing-returns findings. See
  `Docs/superpowers/specs/2026-08-12-model-orchestration-skill-design.md`
  for full rationale.
