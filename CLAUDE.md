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

*(Updated 2026-10-07. This section is a one-line current-status pointer, not a log —
do not append session narrative here again. Full current status: `session.md` at repo
root, overwritten each session. Full permanent history: `log.md` (append-only, never
trimmed), `backend.md`/`database.md` (backend/schema changes only), `decisions.md`
(product/technical decisions). Full per-task Codex-delegation history:
`Docs/orchestration/delegation-log.md`. Deferred/not-yet-built features:
`DEFERRED_FEATURES.md`.)*

**Latest (2026-10-07):** staging bastion `InsufficientInstanceCapacity` (AZ-wide `t4g`-family
shortage in `ap-south-1a`, confirmed via CloudTrail) fixed by moving the bastion to
`ap-south-1b`; nano→micro alone hadn't fixed it. A 9PM-only stop schedule for the bastion
(no auto-start) was bundled into the same targeted apply. Committed (5 infra files). Still
open: whether to proceed with the separate `scheme_master_daily`/SNS deploy — see
`session.md`'s 2026-10-07 section.

**Previous (2026-10-06):** CAS import fixes Phases 1–6 and Phase 7 prep built and independently reviewed (uncommitted, not deployed); the local gate passed (46 synthetic scenarios × normal/mfapi-blocked + 2 real CAMS statements: every fund matches, zero review items). The Import Review screen stays until after staging (user decision). Left: staging wipe/deploy/scheme-master load, a real KFintech statement and the C1–C14 checklist, then the review-screen removal — see `session.md`'s 2026-10-06 section.

**Previous (2026-10-01):** AWS staging cost-reduction (Scenario A,
`Docs/2026-09-29-aws-staging-cost-analysis-and-reduction-plan.md`) applied and verified
healthy: ECS backend task memory 2048→1024MB, ECR keep-last-10-tagged lifecycle rule, 6
EventBridge night-stop schedules (RDS/backend/`fck-nat` stop at 9PM, start 5AM IST), an
RDS event subscription + SNS ops-alerts topic (2 email subs, `PendingConfirmation`
pending click-through), and a frontend maintenance banner for the stop window. $91.78/mo
→ $68.46/mo (-25%). Also fixed a pre-existing `terraform.tfvars` gap that would have
silently reverted live SES email delivery back to stub mode on this apply, and a bastion
`associate_public_ip_address` false-positive replace (Terraform/AWS quirk: a stopped
instance always reports no public IP, read as drift; fixed via `lifecycle.ignore_changes`
in `infra/modules/networking/main.tf`, zero actual historical drift per CloudTrail).
Scenario B (RDS `small`→`micro`, a further -$10/mo) explicitly held off per user decision
— see `decisions.md`. Full narrative: `log.md`'s 2026-10-01 (cont'd) entry.

**Previous (2026-10-01, consent/onboarding/profile session, merged from a parallel
branch push):** consent, onboarding and profile changes committed on `feat/enhanced-ui`
(no new secret or Terraform change needed; deploy guide:
`Docs/orchestration/2026-10-01-consent-release-deploy-guide.md`) — onboarding privacy
screen removed with name saved at the name step, "All of it." goal shortcut, name/PAN
sourced from the CAS with relationship-only unlock, append-only consent records
(migrations `0021`/`0022`) gating sign-up/upload/CAMS/reactivate, and a 5-section Profile
restructure. Not yet independently re-verified by this doc's author — see `session.md`'s
equivalent section for the open items (`functional_postgres` not run, no browser visual
QA) carried over from that session.

**Previous (2026-10-01, earlier session):** no code changes — DB-access tooling and
investigation only. Staging RDS access via SSM-tunnel + `psql`/DBeaver was set up and
used to repeatedly wipe all user-domain data (reference/platform tables untouched) for
stakeholder-facing fresh-signup rounds; that wipe is now a self-serve script,
`scripts/clean-staging-db.sh`, so this no longer needs a live session each time. A real,
unfixed frontend bug was found: `FamilyImportFlow.tsx`'s confirm handler never checks for
the `member_mismatch` 409 code and has no override-retry UI (unlike `ImportFlow.tsx`,
which does) — every family member's first-ever CAS import after a DB wipe hits a dead
end with no way to proceed. Not yet fixed — see "Still open" below. Also progressed the
10-year CAS statement value-discrepancy investigation: confirmed via grep that no
Unifolio code branches on statement year-span, narrowed the likely cause to the
third-party `casparser` library's page/fund-boundary detection, and wrote a handoff doc,
`Docs/investigations/2026-10-01-cas-10-year-parsing-discrepancy-handoff.md`, so this can
be picked up in a dedicated session with a real test file.

**Previous (2026-09-30):** staging QA fixes (auth sign-up/login checks, multi-select goal, ribbon auto-confirm, L3 popup, duplicate-member fixes, statement period) — confirmed committed (`c404c2f`/`1ace61c`/`3541ef4`/`1cf9f35`/`d52bab6`). CAS member detection (2026-09-29) is also committed.

**Previous (2026-09-24):** CAS import PAN check moved from Confirm-time to upload-time
(`pan_claims.py` replaces `attribution.py`; migration `0016`) — fixes every first import
on a fresh account failing to match a family member. Fully committed
(`11f7dfc`/`b8d88a8`/`b8901e4`/`bdfa2ba`), not uncommitted as this section previously
(incorrectly) said. Full detail: `session.md`'s "Latest" section.

**2026-09-15 → 2026-09-24, previously undocumented in any doc, backfilled this pass:**
real email-OTP delivery went live (Postmark first, then fully replaced by Amazon SES —
Postmark removed entirely, not kept dormant); ADR-004 reopened 2026-09-18 — PAN is now
persisted encrypted per household member and the raw CAS PDF is retained 30 days,
superseding the original "no PAN, ever" decision; cross-account PAN conflicts surface as
a UI popup instead of a silent freeze; a phone-gate collision bug fixed (distinct from
the still-open phone-OTP item below). Full detail: `session.md`'s "previously
undocumented gap" section, `log.md`'s dated entries, `decisions.md`.

**Still open (detail in `session.md`'s "Still open" section):** a dead
`HoldingsTable.tsx` field reference; a non-index-seek-bounded SQLite scan in
`category_ranking.py` (Postgres has been live in staging since 2026-09-09 — worth
revisiting now, not just a hypothetical future follow-up); an ARIA IDREF gap on the SIP
tab switcher (accepted documented limitation); the backend API domain naming decision
(§19/§22 Phase 5). (2026-10-06: the `FamilyImportFlow.tsx` `member_mismatch` item is
moot — the component was removed in `0fbafe5`; the 10-year CAS value discrepancy is
root-caused and fixed by the CAS import fixes.) (The phone-OTP "unknown number silently
creates an account" item is fixed by the 2026-09-30 staging QA fixes, pending their
staging deploy; see session.md item 9.)

**Resolved, dropped from this list:**
- **2026-10-01**: ADR-006's EventBridge Scheduler + ECS Fargate Terraform was listed here
  as "not yet picked up" — stale. Confirmed live via `aws scheduler list-schedules`: all 7
  batch-job schedules (daily NAV/benchmark, monthly TER, quarterly AAUM, daily account-
  deletion/analytics-recompute/CAS-file-expiry) are `ENABLED` in AWS, applied in an earlier
  session than this doc previously reflected.
- **2026-09-24**: the PAN-attribution-timing bug and the "still uncommitted" tracking
  gap — see "Latest" above.
- **2026-09-18**: the ADR-004 "no PAN persistence" constraint — superseded by design, see
  above.
- **2026-09-07**: NAT-approach/region/domain decisions that were blocking Terraform
  Phase 0/1 planning; Phase 0/1 itself started and Phases 1-3 are now live in AWS
  (2026-09-08/09) — see `session.md`.
- **2026-09-02**: the blocking `db.commit()` inside an `async def` freezing the
  single-worker event loop — fixed commit `bb5225f` (2026-08-27): `commit_off_loop`
  routes every reachable `db.commit()` through `asyncio.to_thread` across all 8 affected
  files, with a regression test.

Knowledge graph (`.ua/knowledge-graph.json`) is stale as of commit `35fedd3` — re-run
`/understand` (incremental) before trusting it. This has not been re-run as part of this
documentation pass; still needs doing.


