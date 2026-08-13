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

## Known environment constraints

**Codex's sandbox cannot cross outside its dispatch worktree.** When work
happens in an isolated worktree that depends on something living outside
it — a shared venv, `node_modules`, any gitignored build artifact — do not
assume an absolute path gives Codex reach. Its sandbox is scoped to the
worktree tree itself and has no network fallback either, regardless of
whether the path is relative or absolute (confirmed live, Phase 4 Scorer
build: identical failure on 5/5 dispatches). Default every worktree-based
handoff/dispatch to "Codex implements + self-checks by inspection; the
controller runs verification" as the expected shape up front, not a
fallback discovered after a failed dispatch — state it once here rather
than re-deriving and restating it in every handoff doc. Only skip this
framing once the worktree's shared dependency has actually been
provisioned inside the worktree itself (a real local venv, a symlink
Codex's sandbox permits) — confirm that before assuming otherwise.

## Recovering from a dispatch-layer failure (distinct from a Codex job failure)

A `task-notification` reporting the dispatching `Agent(subagent_type:
codex:codex-rescue, ...)` call itself as `failed` (e.g. a session-limit
API error hitting the wrapper subagent) is not the same thing as the
underlying Codex job failing — the two layers are decoupled, and the
Codex job can complete independently of the Claude wrapper that dispatched
it. Before redispatching, run `codex-companion.mjs status --all` (or
`status <job-id>` if known) to check whether the underlying job actually
finished anyway. Only redispatch if the underlying job is genuinely
absent, still running past a reasonable timeout, or itself reports a real
failure — a blind redispatch risks wasting a full Codex run and a second
implementation landing on files the first one already (correctly)
touched.
