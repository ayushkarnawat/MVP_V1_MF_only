# CLAUDE.md — Unifolio (MF MVP)

## What this project is

Unifolio is a mutual fund portfolio tracking and wealth-management platform for the
Indian market — a genuinely superior, free-core alternative to Mprofit. This build
covers the MF-only MVP: CAS import, onboarding, a main holdings dashboard, and an
analytics dashboard.

Setup commands, doc read-order, non-negotiables, and architecture: see `AGENTS.md` —
that file is the single source of truth for both Claude Code and Codex, read it first,
every session, before this one. Don't re-add any of that content here; edit `AGENTS.md`
and let this file point to it, so nothing drifts out of sync between agents.

## Working style

- Ask before assuming on anything the docs mark as an open question or "needs your
  input" — check `/Docs` for unresolved items before guessing.
- When a PRD, ADR, or the schema seems to conflict with what you're about to build, stop
  and say so — don't silently resolve the conflict in either direction.
- Explain non-obvious decisions inline as code comments where the *why* isn't in the
  docs (e.g., a specific edge case handled a specific way) — don't restate what's already
  in `/Docs`.

## Skill Observation

At the start of any task-oriented session — any interaction where you will
use tools and produce deliverables — invoke the task-observer skill before
beginning work. This ensures skill improvement opportunities are captured
throughout the session.

When loading any skill, check the observation log for OPEN observations
tagged to that skill. Apply their insights to the current work, even if
the skill file hasn't been updated yet. This enables immediate application
of observations before they're permanently integrated during the weekly
review.

## Model Orchestration

When delegating non-trivial implementation, refactor, boilerplate, or
research/lookup work — or dispatching parallelizable independent
subtasks that would otherwise mean multiple Claude subagents — invoke
the model-orchestration skill first. It governs the Claude
(orchestrator) / Codex (default worker) split, the mandatory per-task
handoff doc, and the mandatory adversarial-review gate before any
Codex-implemented change is considered done. Full design:
`Docs/superpowers/specs/2026-08-12-model-orchestration-skill-design.md`.

## Agent skills

### Issue tracker

GitHub Issues on `ayushkarnawat/MVP_V1_MF_only`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Not the generic `CONTEXT.md`/`docs/adr/` layout — points at this repo's existing `/Docs`
system (schema, TDD, ADRs, PRDs, dated specs under `Docs/superpowers/`, `session.md`)
instead. See `docs/agents/domain.md`.

## Session State

*(Updated 2026-08-24. This section is a one-line current-status pointer, not a log —
do not append session narrative here again. Full current status: `session.md` at repo
root, overwritten each session. Full per-task history: `Docs/orchestration/delegation-log.md`.
Deferred/not-yet-built features: `DEFERRED_FEATURES.md`.)*

**Latest:** two small direct bug fixes on `feat/enhanced-ui` (AMFI TER fetch
concurrency, `bb9f507`; PDF export Portfolio Allocation rendering, `12946f7`) — full
detail: `session.md`. Before that: `distributor-comparison-portfolio-level` merged in,
bringing `authsetup` and the Analytics PDF export feature with it — full detail:
`session.md`. Everything else is complete and merged — full history: `session.md`.

**Still open (6 items carried forward from earlier phases, not yet revisited — full
detail on each in `session.md`'s "Still open" section):** a held scheme with no NAV
silently vanishing from holdings/allocation; no DB uniqueness constraint on the "self"
`household_members` row; a dead `HoldingsTable.tsx` field reference; a non-index-seek-
bounded SQLite scan in `category_ranking.py` (Postgres follow-up); an ARIA IDREF gap on
the SIP tab switcher; `compute_holdings`'s per-folio N+1 query pattern.

Knowledge graph (`.ua/knowledge-graph.json`) is stale as of commit `35fedd3` — re-run
`/understand` (incremental) before trusting it.


