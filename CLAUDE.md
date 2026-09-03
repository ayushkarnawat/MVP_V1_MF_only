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

*(Updated 2026-09-03. This section is a one-line current-status pointer, not a log —
do not append session narrative here again. Full current status: `session.md` at repo
root, overwritten each session. Full per-task history: `Docs/orchestration/delegation-log.md`.
Deferred/not-yet-built features: `DEFERRED_FEATURES.md`.)*

**Latest (2026-09-03):** F8 (NAV-unavailable degraded row), F4 (the 4 background-job
scripts), and the non-PAN real-person-dedup mechanism (F3's sibling) — all three handed
off 2026-09-02 as Codex-run handoff docs — are now **DONE**, each independently
verified (never trust a self-report blind) and cleared through the mandatory
adversarial-review gate: `Docs/orchestration/f8-nav-unavailable-degraded-row-handoff.md`,
`adr006-background-jobs-handoff.md`, `non-pan-duplicate-person-detection-handoff.md`.
The dedup task also produced a standalone architectural-gap doc
(`Docs/orchestration/two-parallel-import-backends-architectural-gap.md`) documenting why
`service.py`'s and `lifecycle_service.py`'s import paths had drifted to need the same
fix wired in twice. All of this is still **uncommitted** in one large combined
working-tree diff, per explicit instruction to commit everything together only once
the dedup task cleared review — full test suites (614 backend, 397 frontend)
independently reran and matched every self-report. See "Still open" below for what's
left, plus a newly identified prerequisite: NAT-approach (a fck-nat option needs adding
to `AWS Readiness/aws-golive-readiness-report.md` §12, not currently there)/region/domain
decisions need folding into the readiness report before Terraform module planning
(§22 Phase 0/1) can start — blocked on the user's answers.

**Still open (detail in `session.md`'s "Still open" section):** a dead
`HoldingsTable.tsx` field reference; a non-index-seek-bounded SQLite scan in
`category_ranking.py` (Postgres follow-up, deferred until a real Postgres target
exists); an ARIA IDREF gap on the SIP tab switcher (accepted documented limitation);
ADR-006's actual EventBridge Scheduler + ECS Fargate Terraform (deferred until an AWS
account/ECR/ECS cluster exist — the 4 job scripts themselves are done, see above); the
AWS Terraform infra itself (nothing built yet, blocked on the NAT/region/domain
decisions above).

**Resolved, dropped from this list (2026-09-02):** the blocking `db.commit()` inside
an `async def` freezing the single-worker event loop — fixed commit `bb5225f`
(2026-08-27): `commit_off_loop` routes every reachable `db.commit()` through
`asyncio.to_thread` across all 8 affected files, with a regression test. This list
wasn't updated when that commit landed; caught while writing the Analytics precompute
implementation plan, which had cited this item as load-bearing for a design decision.

Knowledge graph (`.ua/knowledge-graph.json`) is stale as of commit `35fedd3` — re-run
`/understand` (incremental) before trusting it.


