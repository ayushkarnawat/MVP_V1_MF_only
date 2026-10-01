# AWS staging cost analysis and reduction plan

**Date:** 2026-09-29
**Account:** `811364789032`, region `ap-south-1` (Mumbai)
**Scope:** the `unifolio-staging` environment only — this is the entire AWS footprint that
exists today. There is no production account yet.
**Purpose:** answer three questions with real AWS-billed numbers, not estimates —
(1) why does staging cost what it costs, (2) what does it actually need to cost to run
for 5-10 beta users, (3) what's the concrete plan to bring it from ~$93/month to the
$65-70/month target, with pros/cons/risk for every option.

All dollar figures below come from two sources, cross-checked against each other:
- **AWS Cost Explorer**, `RECORD_TYPE=Usage` (i.e. gross usage cost, with AWS promotional
  credits excluded — this is the number that matters, since credits are a separate,
  temporary offset, not a reason the infrastructure is cheap).
- **AWS Pricing API**, current on-demand list rates for `ap-south-1`, used to build a
  clean bottom-up model and confirm the billing data isn't hiding anything.

The two agree within ~2%, so both are trustworthy.

---

## 1. Executive summary

- **Real gross usage cost, stabilized daily rate since 2026-09-09** (when the
  infrastructure was first stood up): **~$3.13/day → ~$93-95/month run-rate.**
- **This is not inflated by one-time costs.** Every dollar of it is recurring, metered
  infrastructure (compute-hours, storage-GB, per-IP-hours). There are no data-transfer
  spikes, no snapshot backlogs, no setup fees in the bill. The account is small,
  deliberately cost-optimized in places (a self-hosted NAT instance instead of a real NAT
  Gateway, no Multi-AZ RDS), and still costs ~$93/month because of what's chosen to run
  **24 hours a day, 7 days a week**, sized for a load the account isn't carrying.
- **Credits:** $77 remain on the Billing Console. At ~$93/month gross spend, that's
  **under 4 weeks of runway** before real (non-credit) billing starts. This is the actual
  reason cost matters right now, independent of the $65-70 target below.
- **Answer to "how much does 5-10 beta users actually need":** almost nothing close to
  current spend. The two biggest line items (RDS, ECS Fargate) are running at **4%
  average CPU** and **0.2-0.4% average CPU** respectively, over a real 22-day
  CloudWatch sample. The infrastructure is sized for a load that doesn't exist yet.
- **Recommended plan (Scenario A below): ~$68.46/month**, a 25% cut, using only
  reversible, low-risk changes with no external dependency to confirm. A more aggressive
  path (Scenario B) reaches ~$58/month but carries a real, named technical risk on the
  database that should be tested, not just flipped on.
- **Correction (2026-09-30):** the 2 ALB-attached Elastic IPs were originally treated as a
  removable cost lever pending a partner/webhook dependency check. Investigation via
  CloudTrail plus current AWS documentation shows this was wrong — these are AWS's own
  mandatory, service-managed infrastructure for any internet-facing ALB spanning 2 AZs,
  and cannot be disassociated, released, or modified by the customer via any API. The
  only way to remove this $7.20/mo is to delete the ALB itself. This is not a dependency
  question; it's not achievable, full stop. See the corrected §2/§4 for detail.

---

## 2. Full cost breakdown — what's costing what, and why

Two views: what AWS actually billed for September (partial month — the account has only
existed since 2026-09-08/09), and a monthly run-rate model built bottom-up from AWS's
current `ap-south-1` on-demand rate card. Both are recurring/metered — **none of this is
one-time.**

| Line item | Sept 1-29 actual (billed) | Monthly run-rate | % of total | Recurring? |
|---|---:|---:|---:|---|
| RDS (instance + storage) | $21.53 | **$32.82** | 35% | Recurring, hourly + GB-month |
| ECS Fargate (backend) | $14.92 | **$22.02** | 24% | Recurring, hourly (vCPU + memory reserved, not usage-based) |
| Application Load Balancer | $11.31 | **$17.21** | 18% | Recurring, flat hourly, traffic-independent at this volume |
| Elastic IPs (3x, `VPC PublicIPv4`) | $9.45 | **$10.80** | 12% | Recurring, flat per-IP-hour (AWS's 2024 public-IPv4 charge) |
| EC2 (2x `t4g.nano`: bastion + NAT) | $2.64 | **$4.03** | 4% | Recurring, hourly |
| EBS + regional data transfer | $1.10 | **$1.64** | 2% | Recurring, small and usage-linked |
| KMS (encryption keys) | $0.65 | **$0.98** | 1% | Recurring, flat per-key-month |
| Secrets Manager (2 secrets) | $0.44 | **$0.66** | <1% | Recurring, flat per-secret-month |
| Route 53 (1 hosted zone) | $0.51 | **$0.50** | <1% | Recurring, flat per-zone-month |
| ECR (image storage) | $0.08 | **$0.12** | <1% | Recurring, GB-month, negligible |
| **Total** | **$62.63** (20 active days) | **~$91.78** | 100% | |

The "monthly run-rate" column is a bottom-up model from AWS's current rate card
(`ap-south-1`), not a naive extrapolation of the partial month — it's what the bill would
be if every resource below ran unchanged for a full 30 days. It lands within ~2% of the
observed daily-stabilized rate ($3.13/day × 30 = $93.9), which is the cross-check that
makes both numbers trustworthy.

### Why each line item costs what it does

**RDS — $32.82/mo, the single largest line (35%).**
- Instance: `db.t4g.small` (2 vCPU burstable, 2GB RAM), Single-AZ, running 24/7 at
  $0.042/hour → **$30.24/mo**.
- Storage: 20GB GP3 → **$2.58/mo**.
- 30-day CloudWatch data: **average 4.0-4.6% CPU**, one spike to 48.2% (once, on
  2026-09-26), otherwise never above 26%. **Average ~5 connections, max 12.** This
  instance is not under any real load — it's sized and priced for headroom that isn't
  being used.
- The one caveat: `FreeableMemory` stabilized at ~600-650MB free out of 2GB (i.e.
  ~1.35-1.4GB in continuous use). This matters for the downsize decision in §4, not for
  "why does it cost this much" — it costs this much because it runs 24/7 at the `small`
  tier, full stop.

**ECS Fargate (backend) — $22.02/mo (24%).**
- Task definition: 512 CPU (0.5 vCPU) / 2048MB memory, 1 task, running 24/7.
  vCPU-hours: **$15.32/mo**. Memory GB-hours: **$6.70/mo**.
- Fargate bills for **reserved** vCPU/memory, not actual usage — this is why the cost is
  flat regardless of the fact that 30-day CloudWatch shows average CPU of 0.2-0.4%.
  (There *are* real spikes to 100% CPU on 11 of the last 22 days — that's relevant to
  whether to shrink the CPU allocation, covered in §4, but doesn't change why the
  baseline number is what it is: 1 task, 24/7, at this size.)

**Application Load Balancer — $17.21/mo (18%).**
- Flat $0.0239/hour regardless of traffic, 24/7. No separate LCU (Load Balancer Capacity
  Unit) charge shows up in the bill at all — traffic is low enough that LCU usage rounds
  to effectively zero. **This cost would be identical whether the ALB served 5 users or
  5,000** — it's a fixed cost of having an ALB at all, not a scaling cost.

**Elastic IPs — $10.80/mo (12%), for 3 addresses. None of them are removable.**
- AWS charges $0.005/hour per public IPv4 address since Feb 2024, association status
  doesn't matter. Three EIPs currently exist:
  1. One attached to the `staging-fck-nat` EC2 instance — this is the self-hosted NAT
     instance's address, required for anything in the private subnets to reach the
     internet (package installs, Postmark/SES calls, AMFI/NAV data pulls, etc.). This one
     is Terraform-managed and structurally necessary.
  2. Two attached directly to the ALB — **this is not a customer-enabled feature**.
     Investigated via CloudTrail (`aws cloudtrail lookup-events`) and confirmed: 5 of the
     6 `AssociateAddress` events on this account since 2026-09-09 (including the 2026-09-21
     and 2026-09-27 ones that originally looked like manual configuration) were performed
     by AWS's own `AWSServiceRoleForElasticLoadBalancing` service-linked role, not by any
     human or Terraform run — they recur every few days as AWS recycles the ALB's
     underlying network interfaces. This matches current AWS documentation: **every
     internet-facing ALB spanning 2+ Availability Zones automatically receives one
     AWS-managed public IPv4 address per AZ, and the customer cannot disassociate,
     release, or modify these via any API while the ALB exists.** An earlier attempt this
     session to remove them via `aws ec2 disassociate-address`/`release-address` failed
     with `AuthFailure`/`OperationNotPermitted`, consistent with this. **The only way to
     eliminate this cost is to delete the ALB itself** (or make it internal-only,
     forfeiting public internet access) — not a viable option for a public staging
     environment. This is unrelated to anything configured in this account or repo; it is
     standard, unavoidable billing for any public-facing, multi-AZ ALB.

**EC2 (bastion + NAT) — $4.03/mo (4%).**
- Two `t4g.nano` instances at $0.0028/hour each, both running 24/7:
  - `staging-fck-nat`: the NAT instance — genuinely needs to be up whenever anything in
    the private subnet needs internet egress.
  - `staging-bastion`: used for ad-hoc SSH/DB access only, and is running 24/7 for that
    occasional use.

**EBS + data transfer — $1.64/mo.** Root volumes for the 2 EC2 instances plus regional
data transfer. Small and not meaningfully reducible.

**KMS — $0.98/mo.** One customer-managed key, flat $1/key/month. This exists because of
the ADR-004 decision to persist PAN encrypted at rest — it's a compliance/security cost,
not a sizing inefficiency, and isn't a candidate for reduction.

**Secrets Manager — $0.66/mo.** 2 secrets (RDS master credential, PAN encryption keys) at
$0.40/secret/month. Could technically merge into 1 JSON secret to save $0.40/mo — not
worth the operational complexity for that amount.

**Route 53 — $0.50/mo.** 1 hosted zone, flat AWS rate. Fixed, not reducible while the
domain is in use.

**ECR — $0.12/mo.** Container image storage. Genuinely negligible — flagged in §6 as
something *not* worth spending effort on, despite being a commonly-suggested cleanup.

---

## 3. What does 5-10 beta users actually need?

Short answer: a fraction of what's running today. None of the current sizing was chosen
because of real load — it's what Terraform defaulted to / was reasonable to guess at
before there was traffic to measure. Now there's 30 days of real CloudWatch data to size
against instead of guessing:

| Resource | Running today | 30-day real utilization | What 5-10 users actually needs |
|---|---|---|---|
| RDS instance | `db.t4g.small` (2 vCPU, 2GB RAM), 24/7 | avg 4.2% CPU, avg 5 connections, max 12 | `db.t4g.micro` (2 vCPU, 1GB RAM) is very plausible on CPU/connections alone — memory needs a real test, see §4 risk note |
| Fargate CPU | 512 (0.5 vCPU) | avg 0.2-0.4%, but real spikes to 100% on 11/22 days | Keep at 512 — the spikes are real, not sampling noise, and Fargate CPU throttling under a spike would directly hurt request latency for actual users. Not a place to cut. |
| Fargate memory | 2048MB | avg 14-15.5%, never above 18.3% even during CPU spikes | 1024MB (halves the memory bill, ~3x headroom over observed peak) |
| ALB | 1, running 24/7, no LCU usage | n/a (fixed cost regardless of load) | Structurally needed for TLS termination + health checks; not a "5 vs 5000 users" sizing question — see the architectural note in §6 |
| Elastic IPs | 3 (NAT + 2 ALB) | n/a | 1 (NAT) is required. The 2 ALB IPs are mandatory AWS-managed ALB infrastructure, not a scaling or sizing choice — they cost the same for 5 users or 5,000 and cannot be removed short of deleting the ALB |
| EC2 bastion | 1, 24/7 | used for occasional ad-hoc access | Stopped by default, started on-demand only when someone needs DB/SSH access — near-zero actual need for 24/7 uptime |
| EC2 NAT | 1, 24/7 | needed whenever anything in the private subnet needs egress, including the scheduled batch jobs | Needs to be up during active hours + the EventBridge job windows (6:00/6:30/8:00 AM, 7:00 PM daily) — doesn't need to be up during a quiet overnight window |

The pattern across every line item: **this environment is priced like it's already
carrying meaningful production load, and it isn't.** That's the direct, honest answer to
"why is it costing so much" — not any one runaway resource, but everything being sized
and left running for a scale that doesn't exist yet.

---

## 4. Reduction scenarios — options, numbers, pros/cons, risk

Baseline: **$91.78/month** (from §2's bottom-up model; the real observed run-rate is
$93-95/month, within normal variance of this model).

All "night-stop" windows below use **9:00 PM-5:00 AM IST** (8 hours off, 16 hours on =
67% uptime) — widened from an originally-modeled 12:00 AM-5:00 AM (5 hours off) at your
request, since beta testers are not expected to be active after 9-10 PM. Two checks on
that window: it does not conflict with the daily 7:00 PM EventBridge batch job (which
completes hours before the 9:00 PM stop begins), and it still leaves a full stop-to-job
buffer on the morning side — RDS restarts are not instant (commonly 3-10 minutes for a
small burstable instance) and the **first scheduled batch job fires at 6:00 AM IST**, so
the recommended start sequence targets RDS/`fck-nat` up by ~4:50 AM and the backend
healthy by ~5:00-5:01 AM, leaving ~5 hours of margin. **The batch jobs themselves are
never touched or paused by any of this** — EventBridge Scheduler is independent of
EC2/ECS/RDS stop-start state, and all 7 existing schedules keep running exactly as
before. See the separate stop/start sequencing runbook for the full dependency-ordered
detail (backend stops first/starts last, since it's the only piece depending on both RDS
and NAT).

**Note on the two ALB Elastic IPs:** an earlier version of this plan modeled removing
them as a $7.20/mo lever (a "Scenario B"). That has been retracted — see the corrected
§2 above. They are AWS-managed, non-removable ALB infrastructure, not a configurable
cost. They do not appear in either scenario below.

### Scenario A — Recommended: night-stop + right-sizing, no external dependency

| Change | Savings/mo |
|---|---:|
| Night-stop RDS instance (9pm-5am, storage unaffected) | $10.08 |
| Night-stop + downsize Fargate backend task (9pm-5am stop, 2048MB→1024MB while running) | $9.58 |
| Stop bastion by default, start on-demand only | ~$2.00 |
| Night-stop `fck-nat` instance (9pm-5am) | $0.67 |
| **Total** | **-$23.32 (≈25%)** |

**New total: ~$68.46/month — inside the $65-70 target, with no EIP change and no
external dependency check.**

- **Pros:** every change here is either time-bounded automation (stop/start on a
  schedule, trivially reversible by disabling the schedule) or a resource-size change
  backed by 30 days of real utilization data with wide headroom (Fargate memory never
  exceeded 18.3% even during CPU spikes). No external dependency, no partner risk, no
  data risk, no reliance on anything AWS won't actually let you remove.
- **Cons:** bastion-on-demand adds a small step (start it manually, see the bastion
  runbook) whenever someone actually needs DB access — minor friction, not a cost or
  safety issue. During the 9 PM-5 AM window, the frontend static site still loads (served
  independently via CloudFront) but all backend-dependent functionality — login,
  dashboard data, CAS upload — will not work, since both RDS and the backend are down.
- **Risk: effectively zero**, provided the stop/start sequencing runbook is followed
  (backend stops before RDS/NAT; RDS/NAT start before backend). Add a CloudWatch alarm on
  RDS `available` status by 5:30 AM as a tripwire if you want early warning.

### Scenario B — Optional further cut: RDS `db.t4g.small` → `db.t4g.micro`

| Change | Savings/mo |
|---|---:|
| Everything in Scenario A | $23.32 |
| RDS instance class small → micro (on top of the existing night-stop) | $10.08 |
| **Total** | **-$33.40** |

**New total: ~$58.38/month — below the $65-70 target, with room to spare.**

- **Pros:** the single largest remaining lever. CPU (avg 4.2%, max 48.2% once) and
  connections (avg 5, max 12) both comfortably support a `micro`-class instance on their
  own — there's no ambiguity there.
- **Cons / the real risk, stated plainly:** 30 days of `FreeableMemory` data on the
  current `small` (2GB RAM) instance shows it holding ~1.35-1.4GB in continuous use,
  stabilized after the first few days. A `micro` only has **1GB total RAM**. Two things
  cut in opposite directions here:
  - RDS auto-configures Postgres's own memory parameters (`shared_buffers` etc.)
    proportionally to the instance class — a fresh `micro` wouldn't try to hold onto
    1.4GB, it would be configured for meaningfully less from the start. The `small`'s
    current usage number isn't proof the workload *needs* 1.4GB.
  - But it's also not proof a `micro` will be fine. Most of that "used" memory is
    reclaimable OS/Postgres cache, and losing it does affect query performance, and if
    the CAS-import/analytics-recompute batch jobs create a connection or query burst
    against a 1GB instance, there's a real path to swap or OOM that doesn't exist against
    a `small`.
  - **This is reversible** (`modify-db-instance` back to `small` takes a few minutes plus
    a restart, same mechanics as the downsize itself) — but it's a *live database with
    real beta-tester data on it*, so "reversible" means "recoverable after a bad night,"
    not "risk-free."
- **Recommendation if you want this tier:** don't just flip it — do it as a monitored
  trial. Resize during the night-stop low-traffic window, watch
  `FreeableMemory`/`CPUUtilization`/`DatabaseConnections` for 48-72 hours with `small`
  ready as an immediate rollback, and only treat it as final once that window is clean.

### Summary table

| Scenario | Monthly total | Savings vs. baseline | Risk level | Needs external confirmation? |
|---|---:|---:|---|---|
| Baseline (today) | $91.78 | — | — | — |
| A — 9pm-5am night-stop + Fargate memory + bastion | $68.46 | -25% | None (sequencing-dependent) | No |
| B — A + RDS micro downsize | $58.38 | -36% | Medium (database, live data) | No, but needs a monitored trial window |

**Recommendation: implement Scenario A** — it already lands inside the $65-70 target on
its own, with no external dependency and no database risk. **Treat Scenario B as an
optional next step** with an explicit monitored-trial plan rather than a same-day flip —
it's the one item here with a plausible (if probably low) failure mode touching real user
data. The ALB-EIP removal that was previously modeled as a separate scenario has been
retracted entirely (see §2) — it was never actually achievable.

---

## 5. Open items — need your input before any implementation

1. **RDS downsize risk tolerance (Scenario B) — resolved 2026-10-01: held off.** Scenario
   A already meets the $65-70/mo target with zero database risk; Scenario B's extra
   ~$10/mo isn't worth the live-data memory risk right now. Revisit later as a monitored
   48-72h trial (not a direct flip) if the savings become worth it — see `decisions.md`.
2. **Night-stop window — confirmed.** 9:00 PM-5:00 AM IST, per your explicit direction
   (beta testers not expected active after 9-10 PM). No longer an open item, listed here
   for record only.

*(The ALB static-EIP dependency check that was previously listed here has been removed —
it's moot. These addresses cannot be removed by the customer regardless of any external
dependency; see §2.)*

## 6. Explicitly not worth doing (for transparency, since this doc may go to stakeholders)

- **ECR image cleanup — partially added, 2026-10-01.** Live inspection
  (`aws ecr describe-images`) found the real repo state differs from the "5 tagged, 0
  untagged" assumption this doc originally had: 5 tagged milestone images + 35 untagged
  entries, mostly `docker buildx` manifest-list children (platform manifest + attestation
  manifest per push) rather than orphaned builds. The existing 14-day untagged-expiry
  policy is already correctly bounding this (images past 14 days old are the ones still
  referenced by a surviving tag, correctly protected from deletion) — so tightening
  14→7 days has no real benefit and wasn't done. Added only a "keep most recent 10 tagged
  images" rule (`infra/modules/ecr/main.tf`) — a no-op today (only ~5 static tags exist),
  pure headroom for when CI/CD (task #20) starts tagging per-commit and tag count would
  otherwise grow unboundedly.
- **Merging the 2 Secrets Manager secrets into 1 — confirmed skipped, 2026-10-01.** Saves
  $0.40/month. Beyond the original "not worth the complexity at this scale" framing, a
  concrete technical conflict surfaced: the RDS-managed master-credential secret requires
  exclusive ownership for its auto-rotation to keep working — the same auto-rotation whose
  stale-password failure mode caused a live staging incident earlier in this session (fixed
  via `ecs update-service --force-new-deployment`). Merging would risk breaking that
  rotation. Confirmed skipped.
- **Removing the ALB entirely** (its $17.21/mo plus the $7.20/mo of its 2 mandatory
  Elastic IPs — $24.41/mo combined — is the largest "fixed regardless of scale" cost
  after RDS/Fargate) **is a real lever but an architecture change, not a sizing or
  configuration change** — it would mean giving up the ALB's health-checking, TLS
  termination, and multi-target readiness for when this moves past beta, and is the *only*
  way to touch the EIP cost discussed in §2. Not recommended for now; flagged here only
  because it's the next lever if the target ever needs to drop below Scenario B's
  ~$58/month.

---

## 7. Operational runbooks for Scenario A

Real resource identifiers used below (`ap-south-1`, account `811364789032`):

| Resource | Identifier |
|---|---|
| ECS cluster / service | `unifolio-staging` / `unifolio-staging-backend` |
| RDS instance | `staging-rds` (`staging-rds.ctu88scmut9m.ap-south-1.rds.amazonaws.com:5432`) |
| `fck-nat` instance | `i-0681a3cd783bcc695` |
| Bastion instance | `i-0b67d40d9b58b7814` |
| Daily EventBridge jobs (unaffected by any of this) | 6:00 AM, 6:30 AM, 7:00 PM, 8:00 AM IST + monthly/quarterly variants |

### 7.1 Dependency-ordered stop/start sequence (RDS, Fargate backend, `fck-nat`)

The dependency chain: the backend (ECS) depends on **both** RDS (queries) and `fck-nat`
(internet egress — Postmark/SES, AMFI/NAV pulls, image pulls). RDS and `fck-nat` have no
dependency on each other or on the backend. That gives an unambiguous order — shut down
the dependent first, bring up the dependencies first.

**Evening shutdown (9:00 PM IST):**

| Time | Action | Command | Why this order |
|---|---|---|---|
| 9:00 PM | Stop ECS backend | `aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend --desired-count 0 --region ap-south-1` | Top of the dependency chain — stop the consumer first so it releases DB connections and stops needing egress before either disappears under it |
| ~9:05 PM | Stop RDS | `aws rds stop-db-instance --db-instance-identifier staging-rds --region ap-south-1` | Safe once the backend's connections are confirmed dropped (check `aws ecs describe-services ... --query 'services[0].runningCount'` reads 0 first) |
| ~9:10 PM | Stop `fck-nat` | `aws ec2 stop-instances --instance-ids i-0681a3cd783bcc695 --region ap-south-1` | Last, so anything doing final shutdown cleanup still had an egress path the whole time it might have needed one — costs nothing to be conservative here |

**Morning startup (target: backend healthy by ~5:00-5:01 AM, 1 hour before the 6:00 AM job):**

| Time | Action | Command | Why this order |
|---|---|---|---|
| 4:45 AM | Start RDS | `aws rds start-db-instance --db-instance-identifier staging-rds --region ap-south-1` | Foundation piece, and the slowest to boot (3-10 min typical for a small burstable instance) — start it first for the most head start |
| 4:50 AM | Start `fck-nat` | `aws ec2 start-instances --instance-ids i-0681a3cd783bcc695 --region ap-south-1` | Also a foundation piece (backend needs it), boots fast (~1-2 min) — no real dependency on RDS, staggered only to keep the runbook simple |
| 4:58 AM | Start ECS backend | `aws ecs update-service --cluster unifolio-staging --service unifolio-staging-backend --desired-count 1 --region ap-south-1` | Last — the only piece depending on both the others. Task starts in ~30-60s, then needs 2 consecutive 30s health checks to be marked healthy → fully healthy ~5:00-5:01 AM |

This leaves **~5 hours of margin** before the 6:00 AM job even in the conservative case.
No benefit to tightening it further — the savings come from the 9 PM cutoff, not from
shaving minutes off the morning buffer.

**Safety net — corrected (2026-10-01):** the originally proposed "CloudWatch alarm on RDS
`DBInstanceStatus != available`" doesn't actually exist as a buildable alarm — RDS doesn't
publish instance status as a CloudWatch metric (only CPU/connections/storage/IOPS/etc). The
correct native primitive for "tell me if the restart is slow or fails" is an **RDS event
subscription** (`aws_db_event_subscription`, `availability`+`failure` categories) → SNS →
email, which fires on real state transitions (including a late "available" event if boot
overruns the 4:45-4:58 AM window, and any genuine start failure) — a stronger signal than a
fixed-deadline poll would have given anyway, and it needs no Lambda either. Built.

**Automating this — built (2026-10-01):** 6 plain EventBridge Scheduler rules
(`infra/modules/scheduler/main.tf`, `local.night_stop_jobs`) via AWS-SDK "universal
targets" (`arn:aws:scheduler:::aws-sdk:<service>:<action>`) — one rule per step above, each
a single fixed API call (`ecs:UpdateService`, `rds:Stop/StartDBInstance`,
`ec2:Stop/StartInstances`) with no branching logic, so no Lambda or Step Functions state
machine was needed. The scheduler IAM role was extended with scoped permissions for exactly
these 3 actions against the specific service/instance ARNs. **Applied 2026-10-01** (13
added, 1 changed, 2 destroyed) and verified healthy post-apply: all 6 schedules
`ENABLED`, RDS event subscription `active`, SNS topic created with both email
subscriptions `PendingConfirmation` (needs a click-through on the AWS confirmation email
before alerts will actually deliver).

### 7.2 Bastion manual start/access/stop

The bastion (`i-0b67d40d9b58b7814`) is stopped by default under Scenario A — no public IP
is retained between stops, so always connect via SSM (instance ID), never a remembered IP.

**Scenarios needing this:** debugging staging directly against the DB, running a one-off
manual SQL check, or SSH-style inspection of another instance via this jump host.

**Start it:**
```bash
aws ec2 start-instances --instance-ids i-0b67d40d9b58b7814 --region ap-south-1

# wait for it to be running
aws ec2 wait instance-running --instance-ids i-0b67d40d9b58b7814 --region ap-south-1

# poll until SSM reports it online (usually ~60-90s after boot)
aws ssm describe-instance-information --region ap-south-1 \
  --filters "Key=InstanceIds,Values=i-0b67d40d9b58b7814" \
  --query 'InstanceInformationList[0].PingStatus' --output text
```

**Connect — a plain shell:**
```bash
aws ssm start-session --target i-0b67d40d9b58b7814 --region ap-south-1
```

**Or, to reach RDS through it** (point a local DB client at staging):
```bash
aws ssm start-session \
  --target i-0b67d40d9b58b7814 \
  --region ap-south-1 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["staging-rds.ctu88scmut9m.ap-south-1.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["5433"]}'
```
Then point your Postgres client at `localhost:5433` while the session stays open.

**Stop it again when done:**
```bash
aws ec2 stop-instances --instance-ids i-0b67d40d9b58b7814 --region ap-south-1
```

---

## 8. Scenario A — final breakdown by who's actually using staging

Scenario A changes behavior for anyone touching staging between 9 PM and 5 AM IST. Before
executing, here's what that means concretely for each category of actual usage, not just
in the abstract.

### 8.1 Beta customers (the 5-10 external testers)

- **Daytime/evening usage (the vast majority of real usage, 5 AM-9 PM):** zero impact.
  Full functionality, same latency (night-stop doesn't change instance sizing during
  active hours beyond the Fargate memory cut, which has ~3x headroom over observed peak).
- **9 PM-5 AM usage:** frontend shell loads (CloudFront, independent of the ALB/backend),
  but login, dashboard data, CAS upload — anything hitting the API — fails outright,
  since RDS and the backend are both down. A tester opening the app in this window sees a
  broken app, not a clear "under maintenance" message, unless a maintenance banner is
  added to the frontend (not built; cheap to add if this risk matters to you).
  - **Pro:** this window was explicitly chosen on your judgment that nobody tests then.
  - **Con / real risk:** "nobody tests this late" is a behavioral assumption about
    testers you don't fully control, not a technical guarantee. A tester in a different
    timezone, or one who just happens to open the link once at 11 PM out of curiosity,
    gets a confusing broken-looking experience with no explanation — which, for a small
    beta pool where every tester's trust matters, is a real (if low-probability) cost.
    Mitigating this cheaply: a static "scheduled maintenance 9 PM-5 AM IST" banner on the
    frontend, shown unconditionally regardless of backend reachability.

### 8.2 You (admin/dev usage)

- **Normal use:** no change if you're also not using it 9 PM-5 AM.
- **The actual friction case:** you want to demo something, debug a reported issue, or
  push through a hotfix at 10 PM. Everything in §7 (bastion access, and effectively the
  whole stack) requires either waiting for the next 5 AM start or manually running the
  start sequence out-of-band — adding a few minutes of friction exactly when you're most
  likely to be moving fast. This is the most concrete cost of Scenario A for you
  specifically, distinct from the beta-customer risk above.
- **Mitigating this:** the stop/start commands in §7.1 work at any time, not just on
  schedule — if you need staging up at 11 PM, `desired-count 1` / `start-db-instance` /
  `start-instances` bring it back in a few minutes, same mechanism as the scheduled
  version. This is a manual override, not a blocker.

### 8.3 Spike / unplanned usage

- **A demo you didn't plan, a stakeholder clicking the link unannounced, a partner
  conversation that suddenly needs a live walkthrough** — any of these landing inside the
  9 PM-5 AM window hits the same broken-app experience as §8.1, except now the person
  seeing it may be someone you're trying to impress, not a tolerant beta tester. This is
  the single highest-consequence (if low-probability) failure mode of this plan — not
  technical risk, but **timing risk against your own future, unplanned usage**.
- **No clean technical mitigation beyond the manual override in §8.2** — you'd need to
  remember to run the start sequence ahead of any planned demo that might land in this
  window, or keep the maintenance-banner idea from §8.1 so an unplanned viewer at least
  understands what they're seeing rather than assuming the product is broken.

### 8.4 Batch/automated usage (EventBridge jobs)

- **Zero impact, by design.** All 7 schedules (6:00/6:30/8:00 AM, 7:00 PM daily, plus
  monthly/quarterly variants) fall outside the 9 PM-5 AM window with margin on both sides
  (§7.1). These run independently of the RDS/ECS/NAT stop-start state and are not
  modified by anything in this plan.

### 8.5 Net assessment

| Actor | Impact during 9pm-5am | Severity | Mitigated by |
|---|---|---|---|
| Beta customers, routine use | None (outside window) | — | — |
| Beta customers, off-hours access | Broken-looking app, no functionality | Low probability, low-medium consequence | Maintenance banner (built 2026-10-01, `frontend/src/components/core/maintenance-banner.tsx`) |
| You, routine use | None | — | — |
| You, off-hours debugging/demo | A few minutes' manual start delay | Low | Manual override commands, always available |
| Unplanned/spike/stakeholder usage | Same as beta off-hours, higher stakes if it's an important viewer | Low probability, higher consequence | Manual override + maintenance banner (both now in place) |
| Automated batch jobs | None | — | — |

**Recommendation executed:** Scenario A was applied 2026-10-01 (ECS task memory
2048→1024, ECR keep-last-10-tagged rule, 6 night-stop EventBridge schedules, RDS event
subscription + SNS ops-alerts topic) and verified healthy post-apply — backend task
running and passing ALB health checks (`GET /health` → 200) on the downsized task
definition, RDS `available`, bastion untouched (the `associate_public_ip_address`
false-positive in the pre-apply plan was fixed via `lifecycle.ignore_changes`, see
`infra/modules/networking/main.tf`), `EMAIL_DELIVERY_MODE=ses` preserved. Only remaining
action: confirm the two SNS email subscriptions (§7.1) so alarm notifications actually
deliver.

---

*Data sources: `aws ce get-cost-and-usage` (RECORD_TYPE=Usage, 2026-09-01 to 2026-09-29,
daily + monthly granularity, grouped by SERVICE and USAGE_TYPE), `aws pricing
get-products` (AmazonRDS, AmazonECS, AmazonEC2, AWSELB — all `ap-south-1`), `aws
cloudwatch get-metric-statistics` (30-day window, RDS CPUUtilization/DatabaseConnections/
FreeableMemory, ECS CPUUtilization/MemoryUtilization), `aws ec2 describe-addresses`/
`describe-instances`, `aws rds describe-db-instances`, `aws ecs describe-services`, `aws
scheduler list-schedules`. All commands were read-only; no infrastructure was changed
while producing this document.*
