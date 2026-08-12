# Handoff Doc Template & Lifecycle

Loaded on demand from `SKILL.md` before delegating any non-trivial
subtask to Codex.

## When to create one

Any subtask routed to Codex per `delegation-rules.md` that is more than a
single trivial, fully-self-contained instruction. Skip it only for
genuinely one-shot asks (e.g., "fix this exact typo").

## Where it lives

`Docs/orchestration/<task-slug>-handoff.md` — git-tracked, so it survives
context compaction on either side.

## Template

```markdown
# Handoff: <task-slug>
**Status:** OPEN | IN_PROGRESS | REVIEW | DONE
**Parent plan:** <link to Docs/superpowers/plans/... if applicable>

## Task
What Codex needs to build/fix — concrete and bounded.

## Constraints
Non-negotiables that apply (pulled from CLAUDE.md, not restated in full —
reference the section, e.g. "Decimal, never float" or the specific PRD/ADR).

## Approaches considered and rejected
Why, briefly — the exact nuance that dies in a plain prompt summary.

## Open questions
Anything Codex should flag back rather than guess on.
```

## Lifecycle rules

- The Codex-facing prompt (built via `gpt-5-4-prompting`) **references
  this file's path** rather than restating its contents inline — the doc
  is the single source of truth both sides re-read, not a paraphrase that
  drifts turn to turn.
- The orchestrator updates `Status` and appends findings after each round.
- `Status` only moves to `DONE` after the mandatory adversarial review
  gate (see `SKILL.md`'s core workflow) has run and any findings the user
  chose to act on are resolved.
- Every handoff doc creation/status-change is mirrored as one line in
  `Docs/orchestration/delegation-log.md`.
