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
3. Dispatch via `Agent(subagent_type: codex:codex-rescue)` — one call for
   a single subtask, N parallel calls for independent parallelizable
   subtasks. Use `gpt-5-4-prompting`'s recipe to shape the prompt; the
   prompt references the handoff doc's path rather than restating it.
4. Append one line to `Docs/orchestration/delegation-log.md` recording
   the decision.
5. Present Codex's output per the existing `codex-result-handling`
   skill's rules (findings first, ordered by severity; never auto-apply
   fixes).
6. **Mandatory gate:** before the handoff doc's Status moves to `DONE`,
   run `/codex:review` or `/codex:adversarial-review` against the
   change. This is not optional and not skippable for convenience —
   only the user deciding a finding isn't worth fixing closes it out,
   never a silent skip of the review step itself.
7. If, at any point, one of the three conditions in
   `references/escalation-triggers.md` is met: state which one fired and
   ask before switching to Opus. Otherwise stay on the default
   orchestrator model.
8. If Codex isn't configured/ready when Step 3 would otherwise fire:
   follow `references/no-codex-fallback.md` instead.

## What this skill does not do

- Does not hand-roll `codex-companion.mjs` Bash calls directly — always
  through `codex:codex-rescue`.
- Does not auto-apply any review finding.
- Does not switch models without asking first.
- Does not maintain a full event ledger, digest-pinned routing file, or
  phase-folder hierarchy — deliberately lighter than `kiln`, per this
  project's existing conventions.
