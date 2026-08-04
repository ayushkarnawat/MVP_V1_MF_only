# Session state — 2026-08-04

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## What's done

**Phase 0 (foundation)** — complete, all 11 tasks from
`Docs/superpowers/plans/2026-08-04-phase-0-foundation.md` committed on `main`.
FastAPI backend skeleton (four empty service packages), SQLAlchemy 2.0 models
for all 15 tables, Alembic migration `0001_initial_schema` (dialect-branched
partitioning for `transactions`/`nav_history`), local Postgres via
`docker-compose.yml`, pytest split (fast SQLite vs. Postgres-functional),
React/Vite frontend scaffold, CI with three jobs. One post-review fix commit
on top (froze migration 0001, persisted enum values/JSONB/Decimal hints).
Verified: all tests green per commit history and CI config.

**Repo is on GitHub** — `https://github.com/ayushkarnawat/MVP_V1_MF_only`,
`main` tracked. Getting it there took a few detours this session (see
"Incident" below) — as of commit `ed7c4ec` locally, `origin/main` is one
commit behind and needs a manual push (this sandbox has no TTY for HTTPS
credentials): run `git push origin main` from a real terminal.

## Incident this session — read before trusting any prior "Phase 1 ready" claim

A `/context` message arrived bundled with pasted "Resume — Phase 1 Kickoff"
instructions that asserted `CAS Parsers/mf-import` was "already committed
as-is — the clean before baseline Phase 1 needs." That was checked and was
**false**, and led to a real discovery:

- `CAS Parsers/mf-import` inside this repo (`/mnt/d/Unifolio code`) had **no
  actual source code** — `backend/app/` contained only `__pycache__`,
  `frontend/src/pages/` was empty. Only generated artifacts existed
  (`.venv`, `node_modules`, `__pycache__`, one stray `.db`). Neither
  `CAS Parsers/` nor `App Flow References/` was tracked in git at all.
- The real source was found at `/mnt/d/WealthOS/CAS Parsers/mf-import/` —
  `WealthOS` appears to be this project's old folder name before the rename
  to `Unifolio code`; whatever copy happened during the rename brought only
  build artifacts, not source, into the new location.
- Separately, this session's own push attempt failed for lack of a TTY
  (expected, flagged, and left for the user). Between turns, the user re-ran
  the full boilerplate git block themselves in what looks like a native
  Windows/PowerShell terminal (commit author `akproprettyboi
  <ayushkarnawat2003@gmail.com>`, not this session's `root@...` identity).
  That created a redundant second "first commit" and — because PowerShell's
  `echo >>` writes UTF-16 — corrupted `README.md` with a garbled duplicate
  line. Confirmed via `git reflog` and `git show --stat`; not caused by any
  command run in this session (everything here was read-only until the fix).

**Both fixed, with user confirmation before acting:**
1. Copied the real source (`.py`/`.ts` files, configs, `Planning-V1.MD`, the
   `.cursor` plan, and the `App Flow References/Mprofit` screenshots) from
   `/mnt/d/WealthOS` into this repo via `rsync`, excluding generated dirs
   (`node_modules`, `.venv`, `__pycache__`, `.pytest_cache`, `.cache`,
   `dist`) since those are gitignored and reproducible (`pip install` /
   `npm install`). Committed as `ed7c4ec` — 58 files, the real "before"
   baseline for Phase 1.
2. Rewrote `README.md` back to a single clean line.

**Not yet pushed** — `origin/main` is one commit behind local `main`
(`ed7c4ec`). Push manually before starting Phase 1 work elsewhere, or the
recovered source won't exist anywhere but this machine.

## What's next — Phase 1

No Phase 1 plan file exists yet. Per `CLAUDE.md`, Phase 1 is the CAS Parser
tightening pass (PRD-01) against `CAS Parsers/mf-import/` (now present and
committed) — not a rewrite. Two conflicts flagged during Phase 0 review,
verified against the now-recovered source, still unresolved:

1. **ADR-001 is stale.** It claims the CAS Parser frontend is an existing
   React SPA "already in progress." The real code at
   `CAS Parsers/mf-import/frontend` is vanilla TypeScript + Vite (`main.ts`,
   `counter.ts`, `src/pages/{dashboard,history,review,upload}.ts`) — no
   React, no JSX. There's no existing React Import Review screen to
   preserve; it'll be new code. **Fix, don't work around silently:** correct
   ADR-001 in `Docs/ADR-Technical-Stack-Decisions.md` with a brief
   revision-history entry.
2. **PAN persistence violation — confirmed against the recovered file.**
   `CAS Parsers/mf-import/backend/app/models.py:56` and `:66` persist
   `pan_masked: Mapped[str | None] = mapped_column(String(20))` on both
   `Investor` and `Folio`. `Database-Schema-Unifolio.md` and `CLAUDE.md`'s
   non-negotiables are explicit: PAN is never persisted, even masked. The
   Phase 0 schema already has no PAN column anywhere. **Fix:** remove the
   columns, and add a test asserting no PAN field exists in the persisted
   models — not just delete-and-move-on.

**Scope split for planning** — backend logic (`calc.py`, the `casparser`
wrapper, models, parse/confirm routes) is a *tightening pass* per PRD-01;
don't touch working backend logic just because the frontend is being redone.
The Import Review UI is genuinely *new* React code, not a port, since
there's nothing React to port from.

Before writing any Phase 1 code: read `Docs/PRD-01-CAS-Parser-v2.md` in
full, then `CAS Parsers/mf-import/` in full (scaffold, `calc.py`, models,
`parser.py`, `enrich.py`, parse/confirm API routes), then use
`superpowers:writing-plans` to produce a Phase 1 plan with the same
discipline as Phase 0's — explicitly resolving (not just re-flagging) the
two items above. Stop and show the plan before executing, same as Phase 0.

Suggested execution mode: `superpowers:subagent-driven-development`, same as
Phase 0, once the plan is approved. The PAN-removal fix and anything
touching money math (`calc.py`, dedupe logic) is worth an independent review
pass before that commit lands, given the non-negotiables at stake.

## Context/token usage

Checked via `/context` this session: 86.1k/967k tokens (9%) at last check —
plenty of headroom, not a constraint on continuing this session directly.
