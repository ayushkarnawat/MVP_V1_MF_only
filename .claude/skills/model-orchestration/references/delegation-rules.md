# Delegation Rules

Loaded on demand from `SKILL.md` when classifying a delegable subtask.

## Task-type classification

| Task type | Default worker | Notes |
|---|---|---|
| Boilerplate/repetitive codegen | Codex | e.g. test scaffolding across similar files |
| Mechanical refactor | Codex | rename, extract, pattern-apply across files |
| Isolated bug-fix implementation | Codex | once root cause is diagnosed by the orchestrator |
| Research/lookup (docs, API shapes, live endpoint verification) | Codex | e.g. live-verifying a third-party endpoint before designing against it |
| Architecture/multi-file interface design | Claude (orchestrator) | never delegated |
| Final assembly / integration | Claude (orchestrator) | never delegated |
| Read-only codebase exploration | Claude subagent (`Explore`) | cheap, no Codex round-trip needed |

Ambiguous cases default to Codex unless one of the fallback conditions
below is met.

## Worker selection for parallelizable independent subtasks

When a task decomposes into N independent subtasks (the case that would
otherwise mean dispatching N Claude subagents):

- **Default:** dispatch N parallel `Agent(subagent_type: codex:codex-rescue)`
  calls in one tool-call block, each forwarding its own bounded prompt.
  Real generation cost lands on Codex/ChatGPT quota; the orchestrator only
  pays for N thin-forwarder calls plus collecting results.
- **Fallback to a genuine Claude subagent** (`Explore`, `general-purpose`)
  only when: (a) the subtask is read-only codebase exploration cheap
  enough Claude-native that a Codex round-trip isn't worth it, (b) Codex
  has already failed or looped on this exact subtask across ≥2 rounds
  with a rewritten handoff doc, or (c) the task is too nuanced to specify
  in a forwarded prompt without losing reasoning that only holds together
  inside Claude's own context.

Parallel Codex dispatch capability status: **Verified live this session (two parallel codex:codex-rescue dispatches completed independently, distinct output, no collision).**
