# Session state — 2026-08-05

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## What's done

**Phase 0 (foundation)** — complete, all 11 tasks from
`Docs/superpowers/plans/2026-08-04-phase-0-foundation.md`, on `main`,
pushed to `https://github.com/ayushkarnawat/MVP_V1_MF_only`.

**Phase 1 (backend) — CAS import tightening + monolith port — complete.**
Plan: `Docs/superpowers/plans/2026-08-04-phase-1-cas-import-backend.md`,
executed via `superpowers:subagent-driven-development` in an isolated
worktree (`.claude/worktrees/phase-1-cas-import-backend`, branch
`worktree-phase-1-cas-import-backend`) — **not yet merged to `main`**, see
"What's next" below.

What it built: Direct/Regular plan classification and ARN/broker-code
capture (PRD-01 FR-5-8), a shared Decimal-quantization module, and the full
Import Service ported from the standalone prototype into
`backend/app/services/import_/` (`parser.py`, `enrich.py`, `service.py`,
`schemas.py`) against the real Phase-0 schema — `POST /imports/parse` and
`POST /imports/confirm` wired in `backend/app/api/imports.py`. The
standalone prototype backend (`CAS Parsers/mf-import/backend`) was retired
once fully ported; its frontend stub stays as reference for Phase 1b.

All 9 tasks individually reviewed (several went through fix rounds — see
the plan's execution ledger, since deleted per the SDD workflow, but every
finding and fix is preserved in the branch's commit messages). The final
whole-branch review (dispatched on the most capable model) caught a real,
reproducible production bug — a dedupe race that only surfaced because the
test suite's DB session used different flush semantics than the app's real
one (`autoflush=True` vs. production's `autoflush=False`) — plus a genuine
data-persistence defect (`raw_parser_output` stored an escaped JSON string
instead of structured JSON, defeating the JSONB column) and several
threshold/error-handling inconsistencies. All fixed in one consolidated fix
wave, independently re-verified (the re-reviewer reverted the dedupe fix and
reproduced the exact `IntegrityError` to prove the regression guard was
real), zero residual findings. One item — no ownership check on
`household_member_id` in `/imports/confirm` (IDOR) — was explicitly parked,
not fixed: there's no auth/session system yet to check ownership against
(Auth service is still an empty Phase-0 stub). Tracked here, not silently
dropped: **fix this once PRD-02's auth work lands, before this endpoint is
exposed beyond local dev.**

Backend test suite: 47 passing (0 postgres-marked deselected in this
sandbox), pristine output, verified independently by both the task-level
and whole-branch reviewers, not just the implementer's self-report.

## What's next

**Merge this branch.** The worktree at
`.claude/worktrees/phase-1-cas-import-backend` (branch
`worktree-phase-1-cas-import-backend`) is done and reviewed clean but not
yet merged to `main` — use `superpowers:finishing-a-development-branch` to
decide how (the SDD workspace at `.superpowers/sdd/2026-08-04-phase-1-cas-import-backend/`
gets deleted as part of finishing a clean final review; the ledger's content
is summarized here and in commit messages first, nothing is lost).

**Phase 1b — Import Review frontend.** Deliberately out of scope for the
backend plan above; needs its own plan once the branch above is merged.
Build a *new* React component (`frontend/src/features/import/`) talking to
the now-live `/imports/parse` / `/imports/confirm` endpoints — there's
nothing to port from, since `CAS Parsers/mf-import/frontend` is vanilla
TypeScript with no React.

**ADR-001 correction — still not done.** Flagged since Phase 0, still
accurate: `Docs/ADR-Technical-Stack-Decisions.md` claims the CAS Parser
frontend is an existing React SPA "already in progress." It's not — the
real prototype frontend is vanilla TS/Vite, no React/JSX. Small, independent
doc fix (with a revision-history entry) — do it before or alongside Phase
1b, since that's the plan whose scope it directly affects.

**IDOR on `/imports/confirm`** (see above) — revisit once PRD-02's
Auth/session work exists to check `household_member_id` ownership against.

## Context/token usage

Not tracked this session — run `/context` directly in the CLI if needed.
