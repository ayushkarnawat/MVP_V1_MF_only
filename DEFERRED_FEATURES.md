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
| "Correlation X-Ray" (cross-reference a directly-held stock against the same stock's exposure inside a held fund — e.g. the Adani-Hindenburg stress scenario, where funds and direct stocks both held the group) | Raised 2026-10-08 during attribute 11's (drawdown/stress-test) Scenario Simulator expansion, `Docs/analytics/2026-10-07-sub-project-1-planning.md` | Not built — not even designed; referenced by name only, no spec exists | Same underlying data gap as the two rows above (needs a fund's underlying holdings, i.e. the look-through engine) | Revisit once Sub-project 2's look-through engine is built and queryable — explicit trigger, not "someday"; design it then as a cross-reference view on top of the Adani-Hindenburg scenario |
| **Release gate — attribute 11's hypothetical scenario % values (Strait of Hormuz, US recession/Fed pivot, AI/tech bust, rupee depreciation, "lost decade") must stay behind a feature flag until someone with real markets expertise reviews them** | `Docs/analytics/2026-10-07-sub-project-1-planning.md` attribute 11 section; tracked as a decision in `decisions.md` 2026-10-08 | Values authored (orchestrator-authored 2026-10-08, anchored to real historical precedent, arithmetically self-consistent as of the second verification pass) but **not reviewed by anyone with markets expertise** | These are judgment calls presented to users as numbers, not facts — shipping them live without a markets-literate sign-off risks a wrong number being read as house advice | Release gate — build and ship behind a flag now; flip the flag only after review. No committed date for the review itself |
| **Release gate — the SEBI-prescribed disclosure disclaimer for attribute 11's scenario simulator must be reviewed by a SEBI/compliance consultant before going live** | Noted only inside the attribute-11 frontend spec before 2026-10-08; now also tracked in `decisions.md` | Disclaimer drafted, not consultant-reviewed | Same release-gate logic as the row above — a compliance-sensitive disclaimer shouldn't go live on a draft that's never had expert eyes on it | Release gate — tracked blocker, no committed date |
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

- **Migration 0024 — drop `users.primary_goal`** (renumbered from "0021" on 2026-10-01 because 0021/0022 shipped the member contact fields and consent table, then from "0023" because 0023 shipped member profile completion, 2026-10-01). Ship one release after 0019 is live on every ECS task. First re-backfill `primary_goals` from `primary_goal` where `primary_goals IS NULL` (old tasks write only the old column during the rollout), then drop the column and `DROP TYPE IF EXISTS primarygoal` on Postgres, and remove the dual write in `auth.py update_me`. Downgrade keeps one goal per user. If this hasn't shipped before the CAS import fix plan’s migrations, it is renumbered after `0029` (the plan’s 0025 revises 0023).


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
| Analytics data fixes: category-label split, debt-fund benchmark rule, TER matched by AMFI code (43% coverage today; **TER part superseded 2026-10-08:** TER is now linked by SEBI scheme code, see `decisions.md`) | Deferred-items doc §4 (#24) | Not built | User decision 2026-10-06; #8's AMFI master (in this pass) makes it small | After the fix-plan pass |

| ₹ total of per-fund TER savings ("Your Regular funds would cost ₹X less a year as Direct") | `decisions.md` 2026-10-06 "three Phase 6/7 calls" | Not built. The misleading "Save ~x% per year" line was dropped; per-fund savings show in Distributor Comparison | User decision 2026-10-06: later improvement | After staging |
| Price a CAS-only fund between statement prices (e.g. from merger/conversion legs) so those history months aren't partial | Baseline doc "Phase 7 gate — FINAL" | Not built. Months with no printed price are flagged partial, never gapped | Data limit, low impact (p20: 24 of 247 months) | Later |
| Merge a member's pre-existing CAS-only folio and AMFI folio of the same fund | 6 Oct re-review finding 3 | Not built. Can't occur in data written by this code; only for data from a build that was never deployed | Not needed while staging is wiped | Only if kept data needs it |
| Real KFintech statement in the gate | Phase 7 plan Task 1 Step 2 | Not done locally (both real files supplied are CAMS); KFintech covered by synthetic `kfin_*` files | Needs a real file | On staging |


## Added 2026-10-07 (Analytics speed fix — documented, not built in this pass)

Change map: https://claude.ai/artifact/VjuDFpFp9EELeT7fcDuA7s ("Inputs check" section). Plan for what *is* built: `Docs/superpowers/plans/2026-10-07-analytics-speed-and-stamp-duty.md`.

| Feature | Spec Source | Status | Deferred Reason | Priority |
|---|---|---|---|---|
| Fully read-only Analytics (“question 3”): no internet calls during a run | Change map “Inputs check”; full write-up below | Not built, except the NSE freshness fix (built in this pass) | User decision 2026-10-07/08: the remaining calls work and cost under a second (AMFI list) or are the same lookup the dashboard does (held funds’ NAV) | Later, if needed (~3 h) |
| Compute cheap Analytics sections first, and a one-person household once instead of twice (fix E) | Speed fix page, fix E | Not built | User decision 2026-10-07: computing every section together was a deliberate earlier change | Not planned |
| "Still calculating your analytics" message on the Analytics page | Speed fix page, other issue 2 | Not built | User decision 2026-10-07: not needed once runs take seconds | Not planned |
| Manual TER-link script: link a scheme to its SEBI scheme code (`schemes.ter_scheme_code`, `ter_link_source = "manual"`) when its name in AMFI’s TER feed differs by more than case, spaces or punctuation. May suggest candidates (same fund house and category) but never applies one automatically | `decisions.md` 2026-10-07/08; plan Task 2 | Not built. Such schemes get no TER and appear under "TER Exclusions" | Decided 8 Oct: wait to see how many schemes stay unlinked once every fund house has filed for the month (on 8 Oct most unlinked schemes were HDFC, Kotak and Nippon, which hadn’t filed yet) | Later (~2 h) |
| Store each category's 3- and 5-year returns once a day in a table | Speed fix page, fix plan "possible later" | Not built | Only needed if fix D isn't fast enough | Later, if needed |
| Stamp duty for transactions saved before migration 0032: (1) a merger or face-value conversion saved before 0032 has an amount without stamp duty, so re-uploading an overlapping statement no longer matches it and inserts the conversion again (units doubled); (2) re-uploading the identical statement is rejected as already imported, so its stamp duty is never filled in; (3) a member merge keeps the target's twin row and can drop the source twin's stamp duty | Run 2 review, 2026-10-08 (handoff Round log row 5) | Not built | User decision 2026-10-08: the database is wiped for staging testing, again after testing, and before production, so no row saved before 0032 ever exists under the new code. **If a database with pre-0032 data is ever kept, (1) is a real data bug: fix it first** (match conversions on date, units, type and balance, ignoring amount) | Only if pre-0032 data is kept |
| Reliable peer NAV downloads: limit concurrent mfapi.in downloads in `dashboard/nav.py` `warm_nav_history` (e.g. 20 at a time instead of all at once) and retry a dropped download once; optionally stop re-downloading peers whose last published NAV is more than 3 days old (`_NAV_FRESHNESS_WINDOW_DAYS`) on every run | Run 3 investigation, 2026-10-08 (handoff Round log row 6) | Not built | User decision 2026-10-08: skip for now, come back later. Measured on `p20_20yr.pdf` (largest synthetic, ~1,500 peers): the 06:00 NAV job fires ~1,500 downloads at once and mfapi drops about a third (545 of 1,513 failed: RemoteProtocolError/ReadError; avg 148 s per call), and failures aren't retried, so the next Analytics run downloads them again (593 downloads). ~50 peers whose NAV stops more than 3 days back are never counted as fresh and are re-downloaded every run. Analytics without the fix: 50 s (Windows), 155–197 s (WSL); staging estimated 1–4 min (not measured). Before this plan: 6–10 min locally, 30–60+ min on staging. Nothing breaks: well inside the 15-minute stuck-run ceiling. | Next (~1 h incl. tests; gets the Task 8 30 s gate passing) |
| Opening-cost plausibility check for re-coded (merged) funds: `opening_balance.price_opening_lot` rejects a statement's opening cost below the lowest NAV in mfapi's history before the statement start, and prices the lot at the NAV on the start date instead. A fund re-coded after a merger (e.g. L&T India Value → HSBC Value, mfapi history from Nov 2022, lowest NAV ₹64.16) has no older NAVs, so a real investor's genuine pre-merger cost (e.g. ~₹30–40) on a statement that starts mid-history would be rejected and Total Invested would be wrong for that fund | Run 3 gate, 2026-10-08 (found via synthetic `px_FY`; not seen on a real statement) | Not built | Found while finishing the analytics/stamp-duty plan; existing behaviour (Artifact #1 guard), not part of that change. Possible fix: only reject a cost below the history when the history reaches back to the purchase period, or compare against the predecessor scheme's NAVs | Later; check how many real users hold a re-coded fund |

### Question 3 in full: fully read-only Analytics (deferred 2026-10-07, revised 2026-10-08)

**What it is.** Analytics would read only data the morning jobs have already saved, and make no internet calls during a run. Today, after the speed fix, it still makes three:
1. **NSE benchmark index top-up** (`analytics/benchmark.py` → `nse_indices_client.ensure_index_history_fresh`): downloads index history whenever the saved history doesn't cover the range asked for.
2. **AMFI fund-list download** (`scheme_universe.get_category_universe`): downloads AMFI’s 1.5 MB NAVAll file once per run to list each category’s peer funds.
3. **Held funds’ NAV** (`dashboard/holdings.compute_holdings` → `nav.get_navs_on_or_before`): every section re-reads each held fund’s NAV history from mfapi.in, because today’s NAV is never saved yet in the morning.

**Why it came up, and where the idea came from.** While mapping every file the speed fix touches (7 Oct), two of these calls turned up in addition to the TER refresh and the peer downloads the speed page had found. The morning jobs already save the same data (`benchmark-daily` at 06:00, `scheme-master-daily` at 06:15), so reading the saved copy looked like a free extension of fix D. It also seemed needed for fix F’s first version, “Analytics makes no network calls at all”. The third call (held funds’ NAV) was found on 7 Oct while checking whether the jobs actually save everything Analytics reads. That check was done because the TER problem was exactly this kind of mismatch: Analytics asked for more than the job saved.

**What the check found** (code-level, 7 Oct). Done naively, it would have repeated the TER mistake:
- `benchmark-daily` saves only the **last 10 years**, but Analytics asks from the household’s **first transaction** (p20 starts 2006, “CAS 10 Yr” Jan 2016). Read-only Analytics would silently leave older purchases out of the benchmark XIRR: a wrong number, with no error.
- `nav-daily` skips any fund with a NAV in the last 3 days, so saved NAVs can be up to 3 days old.
- A category nobody held by 06:00 (a new user, or a first fund in a new category) has no peer NAVs saved until the next morning.

Doing it properly takes four changes together (~3 h): `benchmark-daily` saves full history from each index’s earliest NSE date; `nav-daily` refreshes held funds every day; Analytics values holdings at the saved NAV (the dashboard stays live); a one-time download for a never-seen category. Fix F’s test would then become “no network at all”.

**What happens now that it’s deferred.** Analytics keeps the AMFI list download and the held-fund NAV lookup exactly as before; both work. Measured 8 Oct on p20_20yr: the AMFI download is 1.5 MB in 0.2 s plus 0.1 s to parse, once per run. Fix F tests “no TER refresh” plus a timing limit instead of “no network”. Analytics still needs mfapi.in and AMFI to be reachable during a run, as it always has.

**What would have happened if we had done it now.** On the AMFI list, under a second saved per run. On held-fund NAVs, a few seconds at most (the Allocation section, which does this lookup, took 0.0 s on 7 Oct). On NSE, the big saving, which the small fix below gets anyway. Done naively (without the four changes), it would have broken the benchmark XIRR for portfolios older than 10 years and left new categories unranked until the next morning.

**The small NSE freshness fix, built in this pass instead** (plan Task 5B, decided 2026-10-08). Measured 8 Oct: one Analytics run made **32 NSE downloads taking 127 s** (on 7 Oct the whole benchmark took about 7 s, so NSE’s speed varies a lot). The cause was the freshness check, not the job: Analytics asks for history up to *today*, and in the morning today’s close isn’t published, so the saved history never counts as complete and every call (4 indices × every view and fund comparison) downloads again. The fix: saved history counts as up to date if it reaches within 4 days of today (a weekend plus a holiday), and a start date already downloaded once in a process isn’t asked for again (an index can’t have history from before NSE started it). The first run that needs older history still downloads it once and saves it, so the 10-year limit of the morning job doesn’t matter. About 10 lines in `analytics/nse_indices_client.py` plus tests. Expected: those 127 s drop to near zero on most runs, and a slow NSE day no longer slows every Analytics run.

