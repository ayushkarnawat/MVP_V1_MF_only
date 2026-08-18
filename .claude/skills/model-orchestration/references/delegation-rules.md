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

**Sub-case — the worktree's own location is unreachable, not just a
dependency inside it.** A Codex dispatch's sandbox write-scope is bound to
the `cwd` of the process that launched `codex-companion.mjs` (typically
somewhere under the native-filesystem home directory tree), not to any
path named in the forwarded prompt text — asking Codex to `cd` elsewhere
in its own turn doesn't escape the sandbox root set at spawn time. This
can be narrower than the actual OS-level filesystem permissions suggest:
a repo living on a non-native-filesystem mount (confirmed live for a WSL
`/mnt/*` 9p/drvfs Windows-drive mount, `rw` at the host level per
`findmnt` and a manual write test from the orchestrator's own Bash) was
still unreachable-for-writes from inside Codex's own sandbox. The fix
above (provision the dependency inside the worktree) doesn't help when
the worktree's own location is the unreachable thing. Instead: clone the
target branch into a fresh directory under the dispatch process's own
native-filesystem root (a plain local `git clone --branch <branch>
file://<original-repo-path> <new-path>` is fast, disk-to-disk), dispatch
Codex to work there, instruct it to commit its changes with git, then
pull those commits back into the original repo's branch. Verify
reachability with a real live dispatch (or a cheap probe) rather than
assuming host-level `rw` mount options are sufficient evidence that
Codex's own sandbox will agree.

## Isolation parameter for dispatches

Never pass `isolation: "worktree"` on a Codex dispatch that is expected to
make no file changes (a review/adversarial-review dispatch, or any other
read-only task). The `Agent` tool auto-cleans up a `worktree`-isolated
temp workspace "if the agent makes no changes" — for a review-only task
that's every time by design — and that cleanup can fire while the
underlying background Codex job is still running inside it, orphaning the
job (confirmed live: a review dispatch's wrapper returned only "Codex Task
started in the background" after ~44s, and `codex-companion.mjs status
--all` found no jobs at all afterward — not even a still-running one). The
orchestrator's own session is normally already isolated (its own
worktree), so a review dispatch needs no additional isolation layer —
dispatch it directly against the current working tree. Reserve
`isolation: "worktree"` for dispatches that actually write files.

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

**Sub-case — bare infra/API error, no job ID and no verdict at all.** If
the failure message itself is an infra/API-level error (e.g. "API Error:
The response stopped arriving") rather than a returned verdict or partial
finding, there is nothing to check with `status --all` — this is a
transient dispatch-infrastructure hiccup, not a signal about the task.
Retry the identical dispatch once, unmodified. If the retry also fails the
same way, stop and report to the user rather than retrying indefinitely
(confirmed live: a scoped re-review dispatch failed this way, and the
verbatim retry completed normally about a minute later with a full
verdict).

## Sanity-checking a returned review verdict

A review dispatch that returns a real verdict (not a dispatch-layer
failure) is not automatically trustworthy just because it completed —
it can describe stale code it never actually re-read (see
`no-codex-fallback.md`'s sibling caution in the skill's changelog).
Before acting on a "REQUEST CHANGES"/needs-attention verdict that
contradicts a fix the orchestrator already believes is correct, do a
cheap sanity check: read the specific file/line range the review cites
and confirm it matches what the review describes. A citation that
contradicts a direct read is a strong, cheap-to-check signal to
re-dispatch a fresh review rather than act on the stale one.
