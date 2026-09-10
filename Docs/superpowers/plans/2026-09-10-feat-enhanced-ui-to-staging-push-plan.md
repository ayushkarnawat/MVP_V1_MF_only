# feat/enhanced-ui → staging: current state and push plan

**Date:** 2026-09-10
**Author:** Claude Code, following the user's standing instruction to bring
`feat/enhanced-ui` fully up to date and then plan the push to staging.

## 1. Where things stand right now

### 1a. Git — done this session

- `feat/enhanced-ui` is the sole active branch. All uncommitted work was committed, the
  `worktree-analytics-precompute-architecture` branch (26 commits, ADR-driven
  `analytics_sections`/`analytics_recompute_status` read/write split) was merged in
  (`f2daf84`), a real post-merge regression was found and fixed (missing exception
  handling in `_dispatch_recompute_and_release_claim_on_failure`, `8c2f0ef`), and a
  frontend migration plan left behind by another agent in that worktree was recovered
  and committed (`4c4e394`) before the worktree was deleted.
- Full backend suite: **628 passed, 6 skipped**, zero failures, verified fresh after
  every fix (not trusted from a prior self-report).
- 9 branches and 5 worktrees deleted (all confirmed fully-merged ancestors, or —
  for `worktree-distributor-comparison-portfolio-level` — confirmed that its only real
  code change was already independently present on `feat/enhanced-ui`).
- `main` and `production` are both fast-forward ancestors of `feat/enhanced-ui`
  (`git merge-base main feat/enhanced-ui == main`'s HEAD) — **zero divergence**, just 35
  commits behind. No merge conflict risk when promoting.
- `feat/enhanced-ui` is **35 commits ahead of `origin/feat/enhanced-ui`** — not yet
  pushed. `main`/`production` are not yet promoted either.

### 1b. AWS infrastructure — live state (from `session.md`, cross-checked against git)

Applied and running in `ap-south-1` (real, billable resources):
- VPC, subnets, routing, fck-nat, SSM bastion, KMS CMK (Phase 1).
- RDS PostgreSQL 16, fully migrated (`alembic current` → `0011`, head) (Phase 2).
- ECR repo + ECS cluster/service + ALB, backend container **healthy and serving traffic**
  (Phase 3) — but running an image built **before today's merge**. It does not have the
  precompute architecture, the `imports.py` fix, or any other commit from this session.
- Phase 4 (S3 + CloudFront for the frontend, OAC-based): Terraform **authored and
  reviewed, not yet applied** (`infra/modules/frontend`).
- Phase 5 (ACM certs, Route 53 records for `staging.unifolio.in` /
  `staging-api.unifolio.in`, ALB HTTPS listener): Terraform **authored and reviewed, not
  yet applied** (`infra/modules/dns`). `session.md`'s narrative claiming this was only
  "drafted, not dispatched" is stale — corrected below (§4); the handoff doc and the
  actual commit (`1148ef9`, later the same day) confirm it was authored and reviewed.
- Phase 6 (staging validation) and Phase 7 (hardening) — not started.

### 1c. Critical finding: the frontend is currently broken against this backend

The precompute merge **deleted** the 14 old per-section analytics routes
(`backend/app/api/analytics.py` now only exposes `GET/POST /{scope}[/retry]`,
`/funds/{scheme_id}/score`, and the PDF export routes). `frontend/src/features/
analytics/api.ts` still calls the deleted routes
(`/analytics/household-members/{id}/allocation`, `/ter`, `/category-ranking`, etc.).
**Every analytics fetch from this frontend will 404 against the merged backend.**

This was already a known, flagged-but-not-done follow-up from the original precompute
design doc. A complete 9-task implementation plan for the fix already exists — it's the
plan doc recovered from the deleted worktree this session:
`Docs/superpowers/plans/2026-09-10-analytics-frontend-precompute-migration.md`. It is
frontend-only, zero backend changes, and ends with its own mandatory adversarial-review
gate.

**This must be treated as a launch blocker for staging, not a nice-to-have** — pushing
today's backend live without it means the Analytics dashboard silently breaks for every
staging user.

### 1d. Other known gaps (not blockers, degrade gracefully)

- The analytics recompute dispatcher (`EcsRunTaskDispatcher`) has empty
  `ecs_cluster_arn`/`ecs_task_definition_arn` config defaults — with them unset, it logs
  and no-ops rather than erroring, so `GET /analytics/{scope}` still returns correctly
  (empty sections, `recomputing: true` indefinitely) until this is wired. Not a hard
  blocker for staging, but analytics will never actually populate until it's configured.
  Needs its own ECS task definition (distinct from the request-serving service) plus the
  4 config values — reasonable to fold into Phase 7 unless the team wants working
  analytics numbers in the very first staging pass.
- ADR-006's 4 background-job scripts exist and their scheduler Terraform
  (`infra/modules/scheduler`) is authored/reviewed, not yet applied — same
  authored-not-applied status as Phases 4/5, can go in the same apply batch.
- CI (`.github/workflows/ci.yml`) is test-only — no branch triggers a deploy. All
  deployment remains a manual, human-run sequence (by design, per this project's
  division of labor: Claude/Codex never runs `terraform apply`, `docker push`, or any
  other AWS-state-mutating command).

## 2. Sequencing plan

Steps marked **[user-run]** are AWS-state-mutating or credential-bearing and must be run
by you directly, per this project's established division of labor — I'll give you the
exact commands when we get there rather than running them myself. Steps marked
**[Claude/Codex]** are code/doc work I can do or delegate directly.

1. **[Claude/Codex] Execute the frontend precompute-migration plan** (the 9-task doc,
   §1c above). This is the one piece of *new implementation* left before staging can be
   meaningfully validated — everything else below is deployment mechanics for code
   that's already written and tested. Goes through the plan's own mandatory
   adversarial-review gate (Task 8) before being considered done.
2. **[user-run] Push `feat/enhanced-ui` to origin**, then fast-forward `main` and
   `production` to it (no conflicts possible, confirmed §1a) — or hold `main`/`production`
   back until step 1 lands, your call. I'd recommend promoting only after step 1, so
   `main` never points at a build with a known-broken dashboard.
3. **[user-run] Rebuild and push the backend Docker image** to ECR (reflects today's full
   merge plus step 1's frontend-only changes don't touch the backend image, so this can
   happen in parallel with step 1 once `feat/enhanced-ui` is stable) →
   `aws ecs update-service --force-new-deployment`. Same verification bar as the
   original Phase 3 push: ALB target-group health, clean `/ecs/staging-backend` logs, one
   real DB-touching request, `RUNNING` task with stable `startedAt`.
4. **[user-run] `terraform apply` Phase 4** (`infra/modules/frontend` — S3 + CloudFront).
   Independently reviewed already; just needs applying.
5. **[user-run] `terraform apply` Phase 5** (`infra/modules/dns` — ACM certs, Route 53
   records, ALB HTTPS listener). Must come after step 4 — it modifies the CloudFront
   distribution Phase 4 creates and adds a listener to the already-live ALB.
6. **[user-run] Rebuild the frontend** with `VITE_API_BASE_URL=https://staging-api.
   unifolio.in` (and the real Google OAuth client ID), upload to the Phase 4 S3 bucket,
   invalidate CloudFront.
7. **(Optional, can defer to Phase 7) [user-run] `terraform apply` the scheduler module**
   and set the 4 dispatcher config values, if you want real (not perpetually-pending)
   analytics numbers in this staging pass.
8. **[Claude+user, jointly] Phase 6 validation** — the full smoke-test checklist already
   defined in `AWS Readiness/aws-golive-readiness-report.md` §17/§22 Phase 6: Google
   sign-in, CAS import incl. password-retry, dashboard/holdings/allocation, analytics
   views (now real, post-step-1), PDF export, empty-state for a brand-new user, RDS
   backups enabled, active CloudWatch log watch during the pass.
9. **Phase 7 hardening** — already scoped in the readiness report (§22 Phase 7): move
   the 7 in-process caches off single-task-only state (flagged there as the
   highest-priority item given the ~1,000 MAU target), real OTP provider, `terraform
   import` any manually-created resources, NAT Gateway swap if wanted, structured
   logging/error tracking, the recompute dispatcher wiring from §1d if deferred here.

## 3. What I'd do right now, if you agree

Start step 1 (the frontend migration) immediately — it's the only step that's pure
code work, doesn't touch AWS, and is the actual blocker for anything downstream being
worth validating. Everything else in §2 is ready and waiting on you to run the
AWS-mutating commands whenever you have time; I'll hand you each exact command as we
reach that step rather than front-loading a wall of commands you have to hold in your
head.

## 4. Correction filed against `session.md`

`session.md`'s current text says Phase 5 was "drafted, not yet dispatched" — that line
was written mid-session on 2026-09-09 and never updated after Phase 5 was actually
authored and reviewed later the same day (commit `1148ef9`, "authored, reviewed, DONE").
Confirmed via the handoff doc's own `Status: DONE` and the `infra/modules/dns/` module
existing in git. `session.md` gets overwritten each session per this project's
convention, so this will self-correct next time it's rewritten — flagged here so this
plan isn't read against stale information in the meantime.
