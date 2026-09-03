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

*(Updated 2026-09-02. This section is a one-line current-status pointer, not a log —
do not append session narrative here again. Full current status: `session.md` at repo
root, overwritten each session. Full per-task history: `Docs/orchestration/delegation-log.md`.
Deferred/not-yet-built features: `DEFERRED_FEATURES.md`.)*

**Latest (2026-09-02):** AWS staging prep — `AWS Readiness/sqlite-postgres-migration-compliance-audit.md`'s
pre-staging findings (F1-F11) worked through: F1/F2 (enum drift) and all code-level
launch blockers (OTP guard, Dockerfile, CORS, upload validation) independently verified
resolved; F6 (`nav.py` Postgres upsert path had zero test coverage), F9 (`amfi_aaum_client.py`
straggler `db.commit()` not routed through `commit_off_loop`), F10 (`folios.coverage_gap_details`
migration/model type-declaration drift), F5 (`Database-Schema-Unifolio.md` refreshed to
v1.4, stale by migrations 0003/0007-0010), F7 (`compute_holdings` per-folio N+1,
batched to one query), and F3 (`household_members` had no uniqueness enforcement on its
"self" row — migration 0011 adds a partial unique index on `(user_id) WHERE relationship
= 'self'` via SQLAlchemy's `sqlite_where`/`postgresql_where` kwargs on one
`op.create_index` call, plus a `DuplicateSelfMemberError` → 409 guard in
`create_household_member`; a prior read-only check found zero existing violations) all
fixed. F4/F8/the PAN idea's scope questions all resolved by the user 2026-09-02 (F8 →
degraded row with `nav_unavailable` flag; F4 → build the 4 job scripts now, defer the
EventBridge/ECS Terraform; PAN idea → replaced with a non-PAN two-case design, zero new
PII). All three handed off as Codex-run handoff docs (`Docs/orchestration/
adr006-background-jobs-handoff.md`, `f8-nav-unavailable-degraded-row-handoff.md`,
`non-pan-duplicate-person-detection-handoff.md`), status OPEN, not yet implemented — see
"Still open" below. The single-ECS-task/Redis rewrite is deliberately deferred (not a code
task today), documented as a dated DECISION in `AWS Readiness/aws-golive-launch-blockers.md`.

**Still open (6 items carried forward from earlier phases plus the compliance audit —
detail in `session.md`'s "Still open" section):** a held scheme with no NAV silently
vanishing from holdings/allocation/aggregates (F8 — design locked, degraded row +
`nav_unavailable` flag, handed off to Codex, not yet implemented); a non-PAN
real-person-dedup mechanism (F3's sibling — design locked, handed off to Codex, not yet
implemented); a dead `HoldingsTable.tsx` field reference; a non-index-seek-bounded SQLite
scan in `category_ranking.py` (Postgres follow-up); an ARIA IDREF gap on the SIP tab
switcher; ADR-006's EventBridge Scheduler background jobs (F4 — the 4 job-entrypoint
scripts are handed off to Codex, not yet implemented; the actual EventBridge/ECS Terraform
stays deferred until an AWS account/ECR/ECS cluster exist).

**Resolved, dropped from this list (2026-09-02):** the blocking `db.commit()` inside
an `async def` freezing the single-worker event loop — fixed commit `bb5225f`
(2026-08-27): `commit_off_loop` routes every reachable `db.commit()` through
`asyncio.to_thread` across all 8 affected files, with a regression test. This list
wasn't updated when that commit landed; caught while writing the Analytics precompute
implementation plan, which had cited this item as load-bearing for a design decision.

Knowledge graph (`.ua/knowledge-graph.json`) is stale as of commit `35fedd3` — re-run
`/understand` (incremental) before trusting it.


