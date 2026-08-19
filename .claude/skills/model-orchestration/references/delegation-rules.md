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

## Mandatory pre-step: cheap probe before expensive setup

Before copying any large dependency tree (`.venv`, `node_modules`, or
similar) into a new Codex dispatch location — a fresh clone, worktree, or
any directory not already confirmed writable this session — first send one
cheap probe dispatch to that exact location: write a one-line file, `git
add` it, `git commit` it. Nothing else. Require it to succeed before
paying the copy cost. This is mandatory, not optional, whenever the
dispatch target is new or unconfirmed.

This exists because the alternative — provisioning the full dependency
tree first, then discovering the write path doesn't actually work only
after a full multi-task implementation dispatch fails — is expensive to
fail: multi-minute copies (a `.venv`/`node_modules` copy can itself exceed
typical tool timeouts) plus a full Codex dispatch's token cost, all
wasted, per failed hypothesis. A dedicated session hit this 3 rounds in a
row before running the cheap probe first (2026-08-18, active-SIPs cadence
redesign dispatch — see `skill-observations/log.md` Observations 15/17 in
the stable Claude Code workspace project folder). The probe turns each
failed hypothesis into a ~10-second, near-zero-token check instead of a
multi-minute copy plus a wasted implementation dispatch.

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

**Sub-case — Git metadata writes fail in this environment's Codex-rescue
sandbox configuration even when ordinary source-tree writes succeed.**
Confirmed live, repeatedly, across two independent sessions and multiple
directories (an external native-filesystem clone, a linked `git worktree`,
a standalone clone, and the main repo itself on a `/mnt/*` mount — 2026-08-18):
a plain file write inside the dispatch target succeeds, but the very next
`git add`/`git commit` fails with `fatal: Unable to create
'.../.git/index.lock': Read-only file system` — including against a
directory explicitly listed `trusted` in `~/.codex/config.toml`, and
including on a native (non-`/mnt/*`) filesystem clone in the other
confirming session. This is **a limitation observed specifically in this
project's Claude Code `codex:codex-rescue` sandbox configuration** — do
not generalize this to "Codex cannot write to `.git` anywhere/universally";
the exact upstream mechanism (a sandbox mount rule specific to `.git/`, a
`codex exec` default not fully threaded through this dispatch wrapper, or
something else) was never conclusively identified, and a future
`codex:codex-rescue` configuration change could resolve it. Re-run the
3-step probe above (this section supersedes needing a bigger one) before
assuming either "it's fixed" or "it's still broken" in any new session —
never rely on a stale memory of this constraint.

**Resulting default worker split, until this is independently reconfirmed
fixed:** if a probe shows ordinary source/test writes succeed but Git
metadata writes fail, Codex may still implement and test — it does the
actual code editing and self-verification. The orchestrator (Claude)
always performs staging, commits, merges, and any worktree management for
that work; never hand `git add`/`git commit`/merge responsibility to a
Codex dispatch in this environment. Codex remains the default worker for
read-only review/adversarial-review dispatches regardless (reviews make no
file changes, so this constraint doesn't affect them at all — see
"Isolation parameter for dispatches" below).

**Verifying agent completion independently.** Whenever a dispatched
agent's (Codex or Claude subagent) terminal notification is missing,
arrives prematurely, or contradicts what the diff/tests actually show,
verify completion independently via `git log`/`git diff`/`git status`
against the expected commits, plus an independent test run — never take
the agent's own self-report as the sole evidence that work landed or
didn't. This applies symmetrically to both directions: a "completed"
notification whose result text is clearly truncated/non-terminal is not
proof of failure, and a "failed" notification (e.g. an API/session-limit
error hitting the dispatch wrapper) is not proof the underlying job didn't
still complete — see "Recovering from a dispatch-layer failure" below for
the Codex-specific version of this same check.

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
