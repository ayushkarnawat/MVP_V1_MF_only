# Session state — 2026-08-04

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history.

## What's done

**Phase 0 (foundation)** — complete, all 11 tasks from
`Docs/superpowers/plans/2026-08-04-phase-0-foundation.md` committed on `main`:

- FastAPI backend skeleton, four empty service packages (auth/import/dashboard/analytics)
- SQLAlchemy 2.0 models for all 15 tables in `Docs/Database-Schema-Unifolio.md`
- Alembic migration `0001_initial_schema` — dialect-branched: plain tables on
  SQLite, `PARTITION BY RANGE (date)` on Postgres for `transactions`/`nav_history`
- Local Postgres via `docker-compose.yml` (functional-test parity)
- pytest split: fast SQLite suite (`-m "not postgres"`) vs. Postgres-functional (`-m postgres`)
- React/Vite frontend scaffold, four matching feature folders
- CI (`.github/workflows/ci.yml`): backend-fast, backend-postgres, frontend jobs
- One post-review fix commit: froze migration 0001, persisted enum values, JSONB, Decimal hints

Verified: all tests green per commit history and CI config. No open branch —
everything landed directly on `main`.

**Repo pushed to GitHub** — `https://github.com/ayushkarnawat/MVP_V1_MF_only`,
remote `origin` added, `main` branch tracked. The push itself needs to be
completed manually (see below) — this sandbox has no TTY for HTTPS credential
prompts, so `git push -u origin main` failed with
`fatal: could not read Username for 'https://github.com'`. Everything up to
and including the remote add succeeded; only the actual push needs to run
from a shell with GitHub credentials (e.g. `! git push -u origin main` from
the Claude Code session, or a normal terminal).

## What's next — Phase 1

No Phase 1 plan file exists yet (checked `Docs/superpowers/plans/` and
`Docs/`). Per `CLAUDE.md`, Phase 1 is the CAS Parser tightening pass
(PRD-01) against the existing code at `CAS Parsers/mf-import/` — not a
rewrite. Two conflicts were flagged during Phase 0 review and deferred here
rather than resolved silently:

1. **ADR-001 is stale.** It claims the CAS Parser frontend is an existing
   React SPA "already in progress." The real code at
   `CAS Parsers/mf-import/frontend` is vanilla TypeScript + Vite, no React/JSX.
   There's no existing React Import Review screen to preserve — it'll be new
   code. ADR-001's framing needs correcting.
2. **PAN persistence violation.** `CAS Parsers/mf-import/backend/app/models.py`
   persists `pan_masked` on both `Investor` and `Folio`. `Database-Schema-Unifolio.md`
   and `CLAUDE.md`'s non-negotiables are explicit: PAN is never persisted, even
   masked. The new schema (already built in Phase 0) has no PAN column anywhere
   — this needs fixing in the old code during the tightening pass, not carried forward.

Before writing code: read `Docs/PRD-01-CAS-Parser-v2.md`, then read
`CAS Parsers/mf-import/` in full (scaffold, `calc.py`, models, `casparser`
wrapper, `mfapi.in` enrichment, parse/confirm API routes) before touching it,
per `CLAUDE.md`'s standing instruction.

## Untracked local directories (not yet decided on)

`git status` shows two untracked top-level dirs that were never `git add`-ed:
`App Flow References/` and `CAS Parsers/`. Left alone this session — not part
of the push, no instruction yet on whether/how to bring them into version
control (they may be large — screenshots, PDFs). Flag before adding.

## Context/token usage

Not available from this session — `/context` is a Claude Code CLI slash
command with no programmatic equivalent I can call from inside a
conversation. Run `/context` directly in the CLI to check.
