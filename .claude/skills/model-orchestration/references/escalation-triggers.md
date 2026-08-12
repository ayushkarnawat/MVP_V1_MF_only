# Opus Escalation Triggers

Loaded on demand from `SKILL.md` when the orchestrator suspects Opus may
be warranted.

## Rule

Ask before switching, every time. Never switch silently. Only ask when
one of the three named conditions below is actually met — not on general
difficulty or a vague sense that "this might go better on Opus."

## The three triggers

1. **Cross-subsystem architecture ambiguity** — the orchestrator cannot
   resolve an architectural question from `/Docs` alone, and the
   ambiguity spans more than one subsystem (e.g., touches both the
   Import and Dashboard services, or the schema and the API surface
   together).
2. **Repeated Codex failure on one subtask** — Codex has failed or
   looped on the exact same subtask across 2 or more rounds, even after
   the handoff doc was rewritten to close the gap the first failure
   revealed. (First failure: rewrite the handoff doc and retry with
   Codex. Second failure on the same subtask: this trigger fires.)
3. **PRD/ADR/schema conflict** — a cross-cutting conflict between the
   PRD, an ADR, and/or the database schema. This already triggers a
   stop-and-ask per CLAUDE.md's "Working style" section; this trigger
   extends that by naming Opus as a candidate resolution path the user
   can choose, not just a flag-and-wait.

## How to ask

State which trigger fired, in one sentence, plus the specific question
Opus would need to resolve. Do not pre-frame it as a foregone conclusion
— the user may prefer to resolve it themselves, defer, or use Sonnet
with more context instead.
