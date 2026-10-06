# Deferred / Not-Yet-Built Features — Unifolio

Working tracker of everything the product docs have explicitly deferred, scoped out, or
left unbuilt as of 2026-09-26. Pulled from `session.md`, `CLAUDE.md`, and
`Docs/PRDs/PRD-01` through `PRD-04` (plus the ADR and Migration Plan docs for
infrastructure items). Not a planning doc — like `session.md`, this gets updated as
scope moves, not accumulated as history. When an item here gets built, move it out
rather than marking it done in place.

Two things this file does **not** cover, deliberately, because they're a different kind
of gap than "deferred feature":
- **Known implementation gaps / tech debt** on already-built features (e.g. the NAV
  cache's single-flight limitation) — tracked in `CLAUDE.md`'s "Still open" list instead.
- **Built-but-not-yet-reviewed work** (the CAS import lifecycle redesign) — not deferred,
  just missing a review pass; see `CLAUDE.md`'s Session State section.
Both are still listed in a short appendix at the bottom for completeness, since they
answer "what's not done yet" even though they aren't scope deferrals.

## PRD-01 — CAS Parser v2

| Feature | Spec Source | Status | Deferred Reason | Priority |
|---|---|---|---|---|
| MFCentral OTP/API import | PRD-01 §Out of Scope / Future Considerations | Not built | Gated behind a live AMFI ARN partner relationship; timeline unconfirmed | Future — no committed date |
| Account Aggregator (AA) import | PRD-01 §Non-Goals / Out of Scope | Not built | Bundled with the MFCentral gating above — both routes need the same partner/regulatory path | Future — no committed date |
| Distributor/ARN performance analytics UI | PRD-01 §Out of Scope, §Future Considerations | Not built (data capture done) | Explicitly split into its own PRD; PRD-01 only captures the ARN field so this isn't blocked later | Future — separate PRD |
| NSDL/CDSL demat statement parsing (equity holdings) | PRD-01 §Out of Scope, §Future Considerations | Not built | Explicitly out of v1; CDSL Easi/Easiest flagged as a possible Phase 2 path in the competitive-analysis research note | Phase 2 |
| Multi-user auth (beyond single implicit portfolio) | PRD-01 §Out of Scope | Not built | Accepted as the prototype model for MVP, not a gap to close before launch | N/A for MVP |

## PRD-02 — Signup & Onboarding

| Feature | Spec Source | Status | Deferred Reason | Priority |
|---|---|---|---|---|
| Formal risk-profiling / regulated advice | PRD-02 §Non-Goals | Not built | Unifolio isn't SEBI RIA-registered — this is a permanent non-goal, not a timing deferral | N/A (permanent) |
| KYC/identity verification beyond CAS parsing needs | PRD-02 §Non-Goals, §Out of Scope | Not built | No regulatory requirement for a pure tracking product; PAN handling stays scoped to what CAS parsing itself needs | N/A (permanent) |
| Equity/broker account linking during onboarding | PRD-02 §Out of Scope | Not built | MF-only MVP — onboarding shouldn't ask about assets the product can't yet import | Future, tied to the equity look-through gap below |
| Onboarding-answer-driven dashboard personalization | PRD-02 §Out of Scope | Not built | PRD-02 captures the data only; using it to change dashboard content is a Main Dashboard PRD concern | Future |
| Lighter-weight HNI/family-office onboarding surface | PRD-02 §Future Considerations | Not built (single flow ships for all segments) | Deliberately deferred rather than rejected — revisit once real usage data exists rather than designing two flows speculatively | Post-launch |
| Advisor/CA-assisted onboarding (bulk client setup) | PRD-02 §Future Considerations | Not built | Deferred until the target-customer question (Product Context doc §7) is resolved | TBD |
| PIN/biometric return-login (FR-2a) + full Auth/Security policy (rate-limiting, lockout, device management) | PRD-02 Open Questions; Database Schema `otp_requests`/`sessions` notes | Foundational schema only — login functions at MVP without it | Explicitly deferred to a dedicated Auth/Security PRD; the schema hooks (`attempt_count`, `device_info`) exist so this can be layered on later without a migration | TBD |

## CAS Member Detection (2026-09-29)

| Feature | Spec Source | Status | Deferred Reason | Priority |
|---|---|---|---|---|
| Minors' folios (folios held on behalf of a minor, typically under a guardian's PAN) | `Docs/orchestration/cas-member-detection-map.html` M5 / decision I6; detection rule and test file in `Docs/investigations/2026-10-06-cas-import-deferred-items.md` §5 (CAS import fix plan #25) | Not built | Explicitly decided "Later"; detection treats every PAN group as an adult person, so a "(MINOR)" folio shows under the guardian. Re-confirmed as documented-only on 2026-10-06; the product question (separate member vs under guardian) is still open | Later |
| "Ask for access" to another account's member (option C — request access when a detected person already lives on a different Unifolio account) | Same spec, decision I7 | Not built | Option B shipped instead (their funds from this statement count in the family total; their own dashboard stays locked to their account) | Later |
| General member merge tool (merging arbitrary members). Only name-only detected members can be merged today | Same spec, M11 | Partly built (name-only merge only) | Scoped to the duplicate-person case that detection itself creates; a general tool needs its own design | Later |

## PRD-03 — Main Dashboard

| Feature | Spec Source | Status | Deferred Reason | Priority |
|---|---|---|---|---|
| Equity-holdings-via-MF look-through (which stocks a fund actually holds) | PRD-03 §Non-Goals, §Out of Scope, §Future Considerations | Not built | No constituent-holdings data source identified yet; needs its own research pass (AMFI/AMC factsheets or a third-party API) | Future, post-core-dashboard |
| Real bank-account cash flow integration | PRD-03 §Non-Goals, §Out of Scope | Not built | Cash flow shown is investment-only, derived from parsed CAS transactions — not a bank feed | N/A for MVP / Future |

## PRD-04 — MF Analytics Dashboard

Everything else PRD-03 deferred (sector/AMC allocation, category ranking, scorer,
benchmark comparison, weighted TER) — **PRD-04 backend and frontend are now both fully
built**, so those are not listed here. What PRD-04 itself still defers:

| Feature | Spec Source | Status | Deferred Reason | Priority |
|---|---|---|---|---|
| Cap-wise composition (true large/mid/small-cap breakdown within a fund) | PRD-04 §Out of Scope/Data-Gated, standing reminder | Not built | Requires each fund's underlying portfolio holdings — SEBI mandates monthly AMC disclosure but there's no single aggregated public feed (40+ AMCs, mostly PDF/Excel); a real data-engineering project, not a build-inside-this-PRD task | Fast-follow, Post-MVP |
| Stock-level fund overlap detection | PRD-04 §Out of Scope/Data-Gated, standing reminder | Not built | Same underlying data gap as cap-wise composition above; explicitly meant to be solved together with PRD-03's equity look-through as one combined effort, not twice | Fast-follow, Post-MVP |
| Deep multi-year rolling-return analysis (e.g. full rolling-return heatmaps) | PRD-04 §Out of Scope/Data-Gated | Not built | Beyond what the scorer and category comparison need; possible future enrichment once the core scorer shipped (it now has) | Future |
| Equity-specific analytics (stock-level metrics) | PRD-04 §Non-Goals | Not built | MF-only per overall MVP scope | N/A (permanent) |
| Scorer weighting evolution beyond the fixed v1 formula (Return 45% / Risk 30% / Consistency 25%) | PRD-04 §Future Considerations | Not built (v1 formula shipped and locked) | Explicitly framed as something to revisit once real usage data exists, not a v1 gap | Future |
| Index-fund mega-category sub-bucketing (split AMFI's 1,150-scheme "Other Scheme - Index Funds" into smaller peer-groups for category-ranking/Scorer performance + comparison quality) | `Docs/superpowers/specs/2026-08-20-index-fund-mega-category-split-deferred.md` | Reviewed and deferred, not started | Investigated with a concrete bucket list (both a fine-grained per-benchmark option and a coarser AMFI-precedented asset-class option); reviewed with Ayush and finance-domain peers, who judged the only design that actually shrinks the category (bespoke per-benchmark regex buckets) as an unrecognized-by-AMFI taxonomy not worth the mis-bucketing/maintenance risk, while the AMFI-native alternative doesn't solve the size problem | Revisit only if index-fund category-ranking/Scorer load time becomes a demonstrated user-facing problem (currently mitigated by the existing BUG-001 15-min per-category cache) |

## PRD-05 — Auth Flow Redesign

| Feature | Spec Source | Status | Deferred Reason | Priority |
|---|---|---|---|---|
| Signup drop-off / marketing re-engagement tracking (a persistent record of people who verify their phone but never finish signup, for outreach) | PRD-05 §Out of Scope, §Explicit Deviations; `Docs/superpowers/specs/2026-09-28-auth-flow-redesign-database-schema-changes.md` §3 (design analysis, since removed from that doc — see its git history) | Not built | User decision (2026-09-28) to set the marketing angle aside for this pass, before any implementation started; the phone-first flow itself proceeds without it | TBD — revisit if/when there's an actual consumer (marketing tooling, a dashboard) for this data |
| Production SMS/OTP provider (real phone-OTP delivery — SNS/Twilio/MSG91/etc.) | PRD-05 §Technical Considerations; `backend/app/services/auth/otp.py`'s `otp_delivery_mode` setting (already mirrors the email stub→SES pattern, just never wired to a real backend) | Not built — stays in `"stub"` mode | User decision (2026-09-28): keep stub mode for this pass, matching current practice, rather than choosing/wiring a provider as part of the auth-flow redesign. Since phone is now the mandatory first step of the entire signup flow (not one of three optional entry methods), this means no external user can complete a real signup on staging with an actual phone until a provider is wired in — accepted as a known limitation, not a blocker for this redesign's own scope | Revisit once staging needs to support real outside signups, not just internal/dev testing |
| GeoIP enrichment of `ip_address` (country/region/city/ISP via MaxMind GeoLite2) | PRD-05 §Non-Goals; `Docs/superpowers/specs/2026-09-28-auth-flow-redesign-database-schema-changes.md` §1 | Not built — `ip_address` stored raw only | User decision (2026-09-28) to hold off on the lookup/enrichment step for this pass. Not a one-way door: the raw IP is retained, so parsing and backfill can be added later without losing data | Revisit once a real consumer wants a geographic breakdown, not just device/platform |
| Cleanup for abandoned `pending_identity_verifications` rows (phone verified, email never finished — token expires but the row is never purged) | PRD-05 §Explicit Deviations; schema doc §2 | Not built | `otp_requests`'s equivalent gap was closed 2026-09-28 via FR-9 (upsert-on-resend, delete-on-success, 30-day sweep — all application-logic, no infra). The `pending_identity_verifications` case wasn't: unlike `otp_requests`, there's no ordinary-traffic request path to piggyback a sweep on (a request against an already-expired token is the rejection case, not a cleanup opportunity), so an equivalent zero-infra fix isn't as natural. Also lower priority — one row per abandoned attempt (not per retry), holding a hashed token rather than repeated PII | Revisit if this becomes worth a small scheduled job (reusing ADR-006's EventBridge Scheduler → ECS Fargate pattern) or if abandoned-row volume turns out to matter in practice |

## Infrastructure & Deployment

| Feature | Spec Source | Status | Deferred Reason | Priority |
|---|---|---|---|---|
| ADR-006 recurring NAV-refresh job (EventBridge Scheduler → ECS Fargate `RunTask`) — the real fix behind dashboard load-time ("Fix C") | ADR-Technical-Stack-Decisions (ADR-006, Accepted); `session.md`'s "Fix C" section | Architecture decided, not implemented | Deployment-phase work per the Migration Plan's Readiness Checklist; Fix A/B/D (background prefetch, parallelized fetch, process-local cache) are explicit local-dev-first stand-ins layered on top, not replacements | High once deployment starts — current mitigations are load-bearing until then |
| AWS RDS PostgreSQL migration + full AWS deployment (ECS Express Mode, scoped S3, EventBridge Scheduler) | Migration-Plan-SQLite-to-Postgres.md §Readiness Checklist | Not started | Checklist requires this to happen before any real user data exists — a launch gate, not a soft target; local SQLite + Docker Postgres remains the dev/functional-test setup until then | Launch-blocking prerequisite, intentionally sequenced last |

## Appendix — related but not scope deferrals

**Superseded note:** this entry previously said the CAS import lifecycle redesign was
"built, not yet independently reviewed" and cited a "no-PAN-persistence, no-raw-CAS-storage"
invariant to review it against. Both are stale as of 2026-09-26: PAN and the raw CAS file
are now persisted (encrypted) per ADR-004's 2026-09-18 reopening (see `decisions.md`), and
the lifecycle redesign has been through many review rounds since (compliance audit
2026-09-02, PAN/CAS attribution rework 2026-09-18/19, upload-time PAN claims 2026-09-24 —
see `log.md`). No open review gap remains here.

**Known implementation gaps on already-shipped features** (see `CLAUDE.md`'s "Still
open" list): a held scheme with no obtainable NAV silently disappearing from
holdings/allocation instead of showing an "unavailable" state; `confirm_import`'s
plan-type override having no server-side 409 backstop; no DB uniqueness constraint on
the "self" `household_members` row (frontend-mitigated only); a dead
`row.return_percentage_1y` field reference in `HoldingsTable.tsx`; `@bklit/bar-chart`
never actually installed despite an early frontend brief calling for it (hand-rolled
SVG/Tailwind used instead — installing it properly is a deliberately deferred, separate
task since it would overwrite `src/lib/utils.ts`); `scheme_universe.py`'s
`get_category_universe` doing an exact-string match on `sebi_category`, meaning schemes
tagged under AMFI's legacy `"Index Funds - Equity/Debt/Hybrid Funds"` headers are
invisible to comparison against schemes tagged `"Other Scheme - Index Funds"` even when
they track the same index (surfaced while investigating the mega-category split above,
not confirmed high-impact, not investigated further); the `compute_holdings` cache's
accepted lack of single-flight coordination (harmless, documented, superseded once
ADR-006's job above ships); and the SIP Upcoming/This Month tab switcher's incomplete
ARIA `aria-controls` IDREF pairing (inactive tab points at a not-yet-rendered
`tabpanel` id) — a Low finding accepted per the model-orchestration skill's stopping
heuristic rather than restructuring to always-mounted dual panels.


## Added 2026-09-30 (staging QA fixes)

- **Migration 0024 — drop `users.primary_goal`** (renumbered from "0021" on 2026-10-01 because 0021/0022 shipped the member contact fields and consent table, then from "0023" because 0023 shipped member profile completion, 2026-10-01). Ship one release after 0019 is live on every ECS task. First re-backfill `primary_goals` from `primary_goal` where `primary_goals IS NULL` (old tasks write only the old column during the rollout), then drop the column and `DROP TYPE IF EXISTS primarygoal` on Postgres, and remove the dual write in `auth.py update_me`. Downgrade keeps one goal per user.


## Added 2026-10-01 (consent, onboarding and profile changes)

- **Consent retention job (awaiting lawyer, Q6).** `consent_records` rows are kept forever, including after account hard-delete, and the append-only triggers block deletion. A purge job needs the retention period plus a trigger bypass design.
- **Withdraw-consent control (awaiting lawyer, Q11).** No UI to withdraw consent. The only `withdrawn` rows are the automatic ones written when account deletion is scheduled.
- **Replace placeholder legal texts (awaiting lawyer).** `backend/app/services/legal/documents/*.md` are placeholders (versions `*-placeholder-2026-10-01`). Replacing them with final T&C, Privacy and PAN disclaimer text bumps the version and re-asks every user once.


## Added 2026-10-06 (CAS import fix plan — documented, not built in this pass)

Full detail for every row: `Docs/investigations/2026-10-06-cas-import-deferred-items.md`.
Parent plan: `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` (#n = issue number there). Minors (#25) is the existing row under "CAS Member Detection" above.

| Feature | Spec Source | Status | Deferred Reason | Priority |
|---|---|---|---|---|
| Approximate purchase date for opening-balance lots ("Bought ~ Mar 2014"), plus `transactions.est_acquired_on` | Deferred-items doc §1 (part of #1) | Not built. #1's opening balance and hybrid cost are in this pass; the fund screen shows only "units from before [start date]" | User decision 2026-10-06: nice-to-have on top of the value fix | After the fix-plan pass |
| CAS parse off the event loop (`asyncio.to_thread`), plus a staging timing run uploading the synthetic files one by one | Deferred-items doc §2 (#19) | Not built. Parse blocks the single uvicorn worker ~11 s for a 20-year file | User decision 2026-10-06: only one person tests staging today | Before real multi-user traffic |
| Short-term / long-term capital gains report | Deferred-items doc §3 (#20) | Not built. casparser's `CapitalGainsReport` works only on full-history files (`IncompleteCASError` otherwise) | User decision 2026-10-05: new feature; depends on #1–#3 | After the fix-plan pass |
| Analytics data fixes: category-label split, debt-fund benchmark rule, TER matched by AMFI code (43% coverage today) | Deferred-items doc §4 (#24) | Not built | User decision 2026-10-06; #8's AMFI master (in this pass) makes it small | After the fix-plan pass |

