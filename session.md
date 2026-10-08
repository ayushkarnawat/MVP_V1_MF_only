# Session state — 2026-10-08

Working notes for picking this project back up cold. Not a planning doc — see
`Docs/superpowers/plans/` for those. This file tracks *where things stand*,
gets overwritten each session, and isn't meant to accumulate history — the
permanent, append-only record is `log.md` (session-by-session),
`backend.md`/`database.md` (backend/schema changes only), and `decisions.md`.
Earlier "Latest" sections (2026-09-30 staging QA fixes, 2026-09-24 PAN-at-upload, the
2026-09-15..24 backfill, the 2026-09-07..12 condensed sessions) were dropped from here on
2026-10-01; their full detail lives in `log.md`.

**Read this file, then `CLAUDE.md`'s Session State section, before re-deriving
anything by re-reading the whole repo.**

## Latest (2026-10-08): Analytics speed fix + stamp duty — built, gated and reviewed

Plan `Docs/superpowers/plans/2026-10-07-analytics-speed-and-stamp-duty.md` is complete up to the deploy. Round-by-round record: `Docs/orchestration/analytics-speed-stamp-duty-handoff.md`. Decisions: `decisions.md` "2026-10-07/08". Deploy: **`Docs/orchestration/2026-10-08-staging-deploy-guide-analytics-stamp-duty.md`**.

- **Built:**
  - Analytics never refreshes TER.
  - TER is linked by SEBI scheme code, exact names only (migration **0031**).
  - The `ter-daily` job runs at 06:20 IST.
  - The NAV job warms category peers.
  - The stuck-run limit is 15 minutes.
  - NSE history counts as fresh within 4 days.
  - Stamp duty is stored (migration **0032**) and counted in cost and cash flows.
- **Verified locally:**
  - 592 affected backend tests pass.
  - The Postgres 0030↔0032 round trip and 43 Postgres/migration tests pass.
  - The synthetic gate is 88/88.
  - Real files pass, except the known empty CP219252880. "CAS 10 Yr" Total Invested equals the CAS within ₹0.02.
  - A fresh final review approved, with its fixes made.
- **Analytics time:** 47 s–3.3 min locally on the largest test file, depending on mfapi.in that day. Staging is estimated at 1–6 minutes (typical household 1–2), not yet measured. Before: 30–60+ minutes.
- **Next:**
  1. The user commits.
  2. The user sends the regenerated synthetic PDFs to the manager.
  3. Staging deploy with the guide: wipe, 0031+0032, Terraform `ter-monthly`→`ter-daily`, clear TER, rebuild it in two runs, then re-test A1, A2, C2, C6 and D2 and time Analytics.
- **Deferred by the user** (`DEFERRED_FEATURES.md`):
  - limit and retry the morning job's mfapi downloads (the remaining Analytics speed fix);
  - data saved before 0032 (staging is wiped).
- **Found and logged:** for funds re-coded after a merger, a genuine pre-merger opening cost can be rejected by the plausibility check.
- **Still open, unchanged:** the empty-statement dead end (CP219252880), "Other" in Portfolio Allocation, no real KFintech statement, and removing the Import Review screen after staging (awaiting the user's confirmation).

## Previous (2026-10-07): staging bastion `InsufficientInstanceCapacity` fixed (AZ swap), committed

Full narrative: `log.md`'s 2026-10-07 entry.

- Starting the stopped-by-default staging bastion (Scenario A) started failing with
  `InsufficientInstanceCapacity`. Confirmed via CloudTrail: an AZ-wide `t4g`-family shortage in
  `ap-south-1a`, not instance-size-specific (nano→micro didn't fix it). Fixed by moving the
  bastion to `ap-south-1b` (`subnet_id` change — forces destroy+create, since it's immutable).
  New instance `i-0b3f2f75cfef2465d`, verified running/SSM-online.
- Bundled in the same targeted apply (had to go together, same instance-ID references): a
  9PM-only stop schedule for the bastion (no auto-start, on-demand access) and its IAM wiring.
- Committed: the 5 infra files only. **Not committed**, left as-is: `decisions.md`'s
  unrelated sub-project-1 planning entry, 3 untracked `Docs/*` files, and
  `infra/envs/staging/scheme-master.tfplan` (a separate, not-yet-decided
  `scheme_master_daily`/SNS deploy — plan file excluded, likely contains sensitive data).
- **Still open:** whether to proceed with that `scheme_master_daily`/SNS deploy at all — not
  yet answered by the user.

## Previous (2026-10-06): CAS import fixes — Phases 1–6 + Phase 7 prep built, local gate passed; review screen still in (uncommitted, not deployed)

Full narrative: `log.md`'s 2026-10-05/06 entry. Decisions: `decisions.md` (2026-10-06 entries). Plans: `Docs/superpowers/plans/2026-10-06-cas-import-fixes-*.md`. Round-by-round record and every open/closed carry-over: `Docs/orchestration/cas-import-fixes-handoff.md`. Numbers: `Docs/orchestration/2026-10-06-cas-import-baseline.md` ("Phase 7 gate — FINAL").

- **Everything before staging is done.** That means Phases 1–6 and Phase 7 Tasks 2 and 4, migrations 0025–0029 (Postgres round-trip OK), the synthetic gate (46 scenarios × 2 modes), two real CAMS statements, independent reviews, and docs. **The review screen is still in, on purpose:** the user wants it removed only after staging and their screenshots. The removal was built and then restored; `confirmBody.ts` and `UnidentifiedFundsDialog.tsx` are prepared and unused.
- **Left, all on or after staging:**
  1. The user commits (nothing is committed) and reviews PRD-01 v1.5 (the FR-5 amendment only).
  2. Wipe staging with `scripts/clean-staging-db.sh` (user's go-ahead).
  3. Deploy; migrations 0025–0029 run on deploy.
  4. Run `scripts/jobs/refresh_scheme_master_daily.py` once as a one-off ECS task, and confirm the `scheme-master-daily` schedule is ENABLED.
  5. Upload a synthetic file and the two real files, plus **1–2 real KFintech statements** (not yet tested anywhere). Import health must be all ✓.
  6. The C1–C14 frontend checklist screenshots (Phase 6 Task 12 Step 3).
  7. Phase 1 Task 10 Step 3 (staging Import health check).
  8. After the user confirms the gate: Phase 7 Task 3 (remove the review screen, wiring in the prepared pieces) and its PRD-01 FR-10 / App-Flow edits.
- **Harness:** `Docs/CAS Files/synthetic/harness/`. `test_deep.py` takes `SEQ` / `MASTER_FILE` / `SNAP` / `MFAPI_BLOCKED`. `test_real_check.py` runs real files and prints counts only.
- **Stale items closed:**
  - `FamilyImportFlow.tsx`'s `member_mismatch` gap: that component was removed in `0fbafe5`.
  - The 10-year CAS discrepancy: root-caused (opening balance never saved) and fixed.

## Previous (2026-10-01): Member profile completion built (Tasks 3-10 uncommitted, not deployed)

Full narrative: `log.md`'s "Member profile completion built" entry. Decisions: `decisions.md`'s
2026-10-01 "Member profile completion" entry. Plan: `Docs/superpowers/plans/2026-10-01-member-profile-completion.md`;
spec: `Docs/orchestration/member-profile-completion-map.html`. Ledger (all rulings, deferred minors):
`.superpowers/sdd/2026-10-01-member-profile-completion/progress.md`.

- The detected-member lock is gone. Detected members open directly; a profile nudge, dropdown % and
  the Complete profile popup (`PUT /household-members/{id}/profile`) collect name, PAN,
  relationship, phone and email (5 x 20%, computed on read). PAN on another account shows a red banner
  and a second warning on Save (`pan_conflict`, max 80%). Name and PAN are saved at Confirm like Self's;
  no upload-time PAN reservation for non-Self members. Name is editable (`name_source=user_edited`).
- Migration `0023_member_profile_completion` (drops `details_completed_at`/`lock_reason`/trigger, adds
  `pan_conflict`, backfills detected PANs). The deferred `primary_goal` drop is now 0024.
- All 10 tasks implemented. Tasks 1-2 are committed (`0a0152a`, `3268765`, `696ac1f`, `3a4852e`); the
  Task 2 fix round and Tasks 3-10 are **uncommitted** in the working tree (user commits manually). Nothing is deployed. Final whole-branch review (Opus) done: one fix wave (stuck
  `refresh_pan_conflicts` on same-hash conflict rows, rename cache invalidation, "Change in Account Info"
  now renders only with a callback — so not on mobile, plus minors), scoped re-review clean. Parked: rare
  Add-data dead end with a typed conflict PAN (M-3), Self no-PAN nudge copy (M-8), no UI path to merge two
  same-PAN conflict rows. Ledger: `.superpowers/sdd/2026-10-01-member-profile-completion/progress.md`.
- **Postgres verified (2026-10-01, later):** all of `tests/functional_postgres` (11 passed, covers 0018-0023)
  ran against a throwaway local Postgres 16.2, plus a scratch 0022→0023→0022→0023 round trip with the
  backfill data shapes (promote, duplicate, cross-user, other-account) — all OK. One test fix:
  `test_member_detection_postgres.py` round-trip test now deletes its NULL-relationship rows before
  downgrading below 0018 (0018's downgrade restores `relationship NOT NULL`).
- **Not verified:** no test covers "Add data" for a name-only member whose statement PAN another account already holds (the review now starts and Confirm stores it as `pan_conflict`, no 409); no browser visual QA; only affected test files were run per
  task, no full suites.
- `.ua/knowledge-graph.json` is still stale (as of `35fedd3`); re-run `/understand` incrementally.
- Prior "Latest" (AWS staging cost-reduction Scenario A, applied and verified, $91.78 -> $68.46/mo,
  Scenario B held off): see `log.md`'s 2026-10-01 (cont'd) entry and `decisions.md`.

## Previous (2026-10-01, earlier session): staging DB-access tooling, no app code changed

No implementation work that session — DB-access setup, repeated staging wipes, and two
diagnoses. Full detail: `log.md`'s 2026-10-01 entry.

- Staging RDS access via an SSM port-forwarding tunnel (through the SSM-only bastion) +
  `psql`/DBeaver, used for several full user-domain wipes during stakeholder fresh-signup
  testing rounds. Now a self-serve script: `scripts/clean-staging-db.sh` — resolves the
  bastion/RDS endpoint/Secrets Manager ARN dynamically, deletes in one FK-safe
  transaction, prints before/after counts, leaves reference/platform tables untouched.
- **New, unfixed bug found:** `frontend/src/features/auth/FamilyImportFlow.tsx`'s
  `handleConfirm` never checks for the `member_mismatch` 409 code and has no
  override-retry UI — unlike `frontend/src/features/import/ImportFlow.tsx`, which has the
  full `memberMismatch` state + "Continue anyway"/"Switch to X" buttons. Every family
  member's first-ever CAS import after a DB wipe hits a dead end with no way to proceed.
  The fix is bounded: mirror `ImportFlow.tsx`'s `memberMismatch` state + buttons into
  `FamilyImportFlow.tsx`'s `handleConfirm`/render for the `review` stage. Not yet built —
  pick this up first in a future session.
- Progressed (not resolved) the 10-year CAS statement value-discrepancy investigation —
  confirmed no Unifolio code branches on statement year-span, narrowed suspicion to
  `casparser`'s page/fund-boundary detection, still unconfirmed. Handoff doc for a
  dedicated session: `Docs/investigations/2026-10-01-cas-10-year-parsing-discrepancy-handoff.md`.
- Corrected stale status: the 2026-09-29 CAS member detection build and the 2026-09-30
  staging QA fixes were both marked "uncommitted" in this file, `CLAUDE.md`, and `log.md`
  — confirmed via `git log` that both are in fact fully committed. Fixed in all three
  places this session.

## Previous (2026-10-01, consent/onboarding/profile session, merged from a parallel branch push): consent, onboarding and profile changes + staging DB tooling

Branch `feat/enhanced-ui`. Consent, onboarding, and profile changes committed on this branch (along with staging DB-access tooling and the 10-year CAS parsing investigation handoff, both superseded/incorporated above). Plan: `Docs/superpowers/plans/2026-10-01-consent-onboarding-profile.md` and `Docs/orchestration/2026-10-01-onboarding-consent-profile-changes-plan.md`.

1. Onboarding privacy screen removed; name saved at the name step (self member created
   then, provisional until the CAS); `/auth/me` has `self_name` and `consent_outdated`.
2. "Why choose? All of it." goal shortcut (stores all 4); `scripts/report_onboarding_goals.py`.
3. Name and PAN come from the CAS: unlock is relationship-only (PAN only if the statement
   had none); `PATCH /household-members/{id}` edits relationship/phone/email; 422
   `field_not_editable` / `name_not_editable`.
4. Consent: migrations 0021 (member phone/email) and 0022 (`consent_records`, append-only
   triggers, `consent_snapshot`); `/legal/*`; sign-up/upload/CAMS/reactivate consent;
   placeholder legal texts; `scripts/consent_trail.py`.
5. OTP email: no logo, green text. Profile restructured into 5 sections.
6. Staging DB wipe script: `scripts/clean-staging-db.sh` — resolves bastion/RDS endpoint dynamically, wipes user-domain data cleanly in one FK-safe transaction for testing rounds.
7. Progressed 10-year CAS statement value-discrepancy investigation; handoff doc at `Docs/investigations/2026-10-01-cas-10-year-parsing-discrepancy-handoff.md`.
8. Confirmed that both the 2026-09-29 CAS member detection build and 2026-09-30 staging QA fixes are committed.

**Before deploying:** no new secret and no `terraform apply` needed for *this* change
specifically — the consent IP-hash key is derived from the existing `PAN_LOOKUP_PEPPER`
(decision 2026-10-01). (Scenario A above did separately need, and has already had, a real
`terraform apply`.) Follow `Docs/orchestration/2026-10-01-consent-release-deploy-guide.md`
(Postgres tests first, then migrate, push the backend image, publish the frontend).

**Open for this change:**
- `tests/functional_postgres` (cascade deletes, consent trigger, migrations 0019-0023 on
  Postgres): now run, 11 passed (2026-10-01, local Postgres 16.2).
- Family-CAS fixture-backed tests skip (fixtures absent; set `UNIFOLIO_QA_FIXTURES`).
- No browser visual QA of the new onboarding/profile screens.
- Legal texts are placeholders; retention (Q6), withdraw-consent (Q11) and final text wait
  on the lawyer (`DEFERRED_FEATURES.md`). The old "0021" primary_goal drop is now 0023.
- The 2026-09-30 retest list (staging QA fixes) still applies once deployed: it is Step 7 of
  `Docs/orchestration/2026-09-30-staging-qa-fixes-deploy-guide.md`.
- `FamilyImportFlow.tsx` confirm handler `member_mismatch` 409 handling diagnosed (needs override-retry UI like `ImportFlow.tsx`).

## Still open, carried forward from earlier phases, not yet revisited

**Open, specific to the CAS member detection change (2026-09-29):**
1. `backend/tests/functional_postgres`: now run, 11 passed on a local Postgres 16.2 (2026-10-01).
2. Holder-name extraction (`parser.py`) was verified only on synthetic CAMS/KFintech
   lines; no real PDFs were on disk (plan Task 4 Step 6 skipped). Test with real
   multi-PAN family CAS files from both RTAs before trusting it.
3. The mobile ribbon review reuses the desktop styling as-is and needs phone visual QA.
4. **Corrected 2026-10-01**: this work is in fact committed (`af92286`..`b40f52b`), not
   uncommitted as this line previously said.

**New, specific to this session (2026-10-01):**
1. `FamilyImportFlow.tsx`'s missing `member_mismatch` override-retry UI (see "Latest"
   above) — diagnosed, not fixed.


*(Moved here from `CLAUDE.md` 2026-08-24 — that file's Session State section is a
short pointer only, per its own header note; this is the detail it points to.)*

1. **RESOLVED 2026-09-03 (= compliance audit F8).** A held scheme with no obtainable NAV
   silently vanished from holdings/allocation/aggregates, no error or placeholder.
   **Product call resolved 2026-09-02**: user chose (b) — a degraded row with a visible
   "NAV unavailable" flag, NAV-dependent fields null, FIFO-derived fields (units held,
   invested, realized gain) always populated. Design: `Docs/orchestration/
   f8-nav-unavailable-degraded-row-handoff.md` (`distributor_comparison.py`'s identical
   sibling bug explicitly flagged as a separate, out-of-scope follow-up, not silently
   fixed alongside this). Implemented across 2 review rounds: round 1 fixed an
   understated "Total Invested" and a missing caption; round 2 caught (via adversarial
   review, independently confirmed) that `gainPercentage` mixed populations — dividing
   valued-only profit by an all-holdings invested total, understating the return — fixed
   by adding a `valuedInvestedVal` (valued-holdings-only) denominator in both
   `DashboardView.tsx` and `MobileDashboardView.tsx`. Status: DONE, committed.
2. **RESOLVED 2026-09-02 (= compliance audit F3).** No DB uniqueness constraint on the
   "self" `household_members` row — frontend-mitigated client-side only; real fix needed
   a migration (confirmed missing — migrations `0001`-`0010` existed, none touched this).
   **Read-only violation check run 2026-09-02** against the local dev SQLite DB
   (`backend/unifolio_dev.db`) first: 39 `self`-relationship rows across 46 distinct
   users, **zero users with more than one** — no existing dirty data to remediate,
   simplifying the fix to a straight constraint-add + API guard with no data-migration
   remediation strategy needed. Fixed: migration `0011_household_members_one_self_row.py`
   adds a partial unique index on `household_members(user_id) WHERE relationship =
   'self'`, expressed once via SQLAlchemy's `sqlite_where=`/`postgresql_where=` kwargs on
   a single `op.create_index` call (no runtime dialect branch needed, unlike F6's fix);
   `create_household_member` (`services/dashboard/household_members.py`) gained a
   pre-check raising `DuplicateSelfMemberError`, mapped to a 409 in the
   `/household-members` route (`api/dashboard.py`). Verified: new unit tests
   (`tests/services/dashboard/test_household_members.py`), an API 409 test
   (`tests/api/test_dashboard_routes.py`), a new Postgres functional test proving the
   `postgresql_where` branch enforces the constraint against a real server
   (`tests/functional_postgres/test_partitioning.py::test_household_members_one_self_row_per_user_on_postgres`),
   and the full 587-test SQLite suite plus 5 Postgres-marked tests, all green.
   `Docs/PRDs/Database-Schema-Unifolio.md` bumped to v1.5 documenting the new index.

   User separately raised a PAN-based idea for a related-but-distinct problem (detecting
   the same real person across multiple household-member/CAS-upload records), stating a
   belief that PAN is "currently persisted." At the time this conflicted with this
   codebase's explicit, test-guarded rule — no PAN persistence, ever
   (`tests/models/test_no_pan_field.py`, `Docs/PRDs/Database-Schema-Unifolio.md`'s Data
   Classification section) — flagged back to the user 2026-09-02 per CLAUDE.md's "stop
   and say so" rule rather than silently built or silently dropped. **Note added
   2026-09-26**: that invariant was itself superseded 2026-09-18 when ADR-004 reopened to
   allow encrypted PAN persistence — `test_no_pan_field.py` was rewritten (not deleted)
   to guard the new invariant instead (no *unencrypted* PAN-shaped column on any mapped
   model). Read as historical: at the time this paragraph was written, PAN persistence
   genuinely didn't exist yet.

   **Resolved 2026-09-02**: user confirmed no PAN persistence, sign-off given for a
   non-PAN alternative, design left to Claude, explicitly asked to be "extensive." Design:
   split into two cases with different privacy remedies. Same-user cross-household-member
   duplicates get a new `(folio_number, amc_name)` signal added to `resolve_attribution`'s
   existing within-household matching (prioritized over its existing weaker name/email
   signal, safe to auto-offer a redirect since same tenant). Cross-user duplicates (two
   different Unifolio accounts holding the same real person's data) get a new, separate,
   advisory-only `detect_cross_account_duplicate` check — never blocks, never merges,
   never leaks the other account's identity, folio-match primary / name-match weaker
   secondary signal. Full design + rationale + rejected alternatives:
   `Docs/orchestration/non-pan-duplicate-person-detection-handoff.md`. **RESOLVED
   2026-09-03**: round 2 wired the design into the actual production import paths —
   a shared `enforce_attribution_confirmation` gate added to `attribution.py` and
   called at all 3 backend commit sites, a structured `member_mismatch` 409, and
   desktop/mobile confirmation UI. This wiring surfaced a standalone architectural gap —
   two parallel import backends had independently drifted to need the identical fix wired
   in twice — documented at `Docs/orchestration/two-parallel-import-backends-architectural-gap.md`.
   **Superseded 2026-09-18/24**: `attribution.py` was itself later deleted and replaced
   by PAN-based `pan_claims.py` once ADR-004 reopened (see "Latest" above) — the non-PAN
   duplicate-detection logic this item describes predates that rework; check current
   `pan_claims.py` before assuming this exact code path still exists verbatim. Status:
   DONE, committed.
3. `HoldingsTable.tsx` references a dead `row.return_percentage_1y` field that doesn't
   exist on the real API type — harmless (client-computed fallback always runs), never
   cleaned up.
4. `category_ranking.py`'s `_bulk_nav_on_or_before` (BUG-001 fix, 2026-08-18): the
   per-scheme N+1 query pattern is gone (one `MAX(date) GROUP BY` query per target date,
   bounded by a 15-min per-category cache), but the DB-side scan to compute each
   `MAX(date)` still isn't index-seek-bounded without a `LATERAL` join — a primitive
   unused elsewhere in this codebase and unverifiable via query plan on SQLite. Accepted
   as a documented limitation rather than a third fix round (correctness-safe, cost
   already bounded by the cache). Full follow-up action and rationale:
   `Docs/PRDs/Migration-Plan-SQLite-to-Postgres.md`'s "Deferred Postgres-Only
   Optimizations" section — revisit with `EXPLAIN ANALYZE` once Postgres is live (real
   AWS RDS Postgres has been live in staging since 2026-09-09 — worth actually revisiting
   this rather than treating it as still hypothetical).
5. `DashboardView.tsx`'s SIP Upcoming/This Month segmented control (`sip-tab-upcoming`/
   `sip-tab-month`) always renders both tab buttons' `aria-controls` IDs, but only the
   active tab's `role="tabpanel"` actually exists in the DOM — the inactive tab's
   `aria-controls` points at an ID that doesn't resolve, an incomplete ARIA tabs IDREF
   pattern. Accepted as a documented limitation rather than a third fix round, per the
   model-orchestration skill's stopping heuristic — negligible real-world screen-reader
   impact since the tab/panel pairing is already correctly conveyed via
   `role`/`aria-selected`/`aria-labelledby` on the panel that does exist, and a full fix
   means always mounting both panels (one `hidden`) instead of one conditionally-rendered
   panel. Revisit only if a real accessibility-audit or user complaint surfaces it as an
   actual usability problem. Full review-round detail: `Docs/orchestration/
   delegation-log.md`'s 2026-08-19 entries.
6. **RESOLVED 2026-09-02 (= compliance audit F7).** `compute_holdings`'s per-folio
   `Transaction` N+1 query pattern (`backend/app/services/dashboard/holdings.py`) —
   discovered as a side effect of the 2026-08-21 distributor-comparison-portfolio-level
   rewrite, confirmed pre-existing and explicitly out of scope for that change at the
   time. Fixed: one batched `Transaction` query across all folios (`folio_id.in_(...)`),
   grouped by `folio_id` in Python preserving per-folio chronological order (the FIFO lot
   processor requires it). Status: DONE, committed.
7. **RESOLVED 2026-08-27, commit `bb5225f`.** A colleague's AMFI TER `ReadTimeout`s were
   root-caused to event-loop starvation from a blocking `db.commit()` inside an
   `async def` (this backend's SQLAlchemy engine is fully synchronous, single
   worker/event loop) — not AMFI slowness. `bb5225f` added `commit_off_loop` (routes
   `db.commit()` through `asyncio.to_thread`) and rewired every reachable commit across
   all 8 affected service files, with a regression test. Full narrative: `log.md`'s
   2026-08-25/26 entry.
8. **RESOLVED 2026-09-03 (= compliance audit F4), partially.** ADR-006's EventBridge
   Scheduler background jobs (daily NAV refresh, monthly TER, quarterly AAUM, daily
   benchmark) — piece (a), the 4 job-entrypoint scripts + wiring `amfi_aaum_client
   .refresh_aaum_data` into a real caller, is done and committed
   (`backend/scripts/jobs/`, `backend/tests/scripts/`). **Still not built**: piece (b),
   the actual EventBridge Scheduler + ECS Fargate Terraform module — deliberately
   deferred to the infra-authoring phase. An AWS account, ECR repo, and ECS cluster now
   all exist in staging (since 2026-09-08/09) so this is no longer blocked on
   infrastructure existing — it's just not been picked up yet.
9. **RESOLVED 2026-09-30 (staging QA fix 1): unknown numbers/emails are now rejected at request time on Log In, and registered numbers on Sign Up.** Original note: **Phone-login OTP verify silently creates a new account for an unrecognized phone
   number, instead of erroring like the email channel does.** Found by the user
   2026-09-11 manually smoke-testing staging: logging in with a phone number that has no
   matching account still goes through the OTP-send/verify flow and ends by creating a
   brand-new account, rather than telling the user no account exists and directing them
   to sign up. **Independently re-checked against current code 2026-09-26 — still
   present, unchanged.**

   Root cause, confirmed against the code: `backend/app/api/auth.py`'s
   `verify_otp_route` (phone-OTP channel), in the branch that handles a verify call with
   no `pending_token` (i.e. a plain login attempt, not part of an in-progress signup/
   phone-gate flow) — `find_or_backfill_phone_identity` returning `None` falls straight
   through to an unconditional new-`User` INSERT. The equivalent email-OTP branch,
   `verify_email_otp`'s no-`pending_token` path, already does the right thing:
   `find_identity_by_subject` returning `None` raises a 401 ("No account found for that
   email — sign up instead.") instead of creating an account. The two channels'
   identical-shaped branches have simply diverged. **Distinct from the 2026-09-22
   phone-gate collision fix** (`c8a4a8e`/`31e112a`), which only touches the
   `pending_token`-present branch — that fix did not incidentally resolve this one.

   Frontend-side, confirmed this is a clean single-sided gap, not a shared code path:
   `Landing.tsx` only renders the "Continue with Phone" button in **login mode**; signup
   mode offers email + Google only, with no direct phone-signup entry point anywhere in
   the UI. So the phone no-`pending_token` verify branch is *only* ever reached from a
   genuine login attempt — fixing it to 401 like email can't break a legitimate
   phone-signup flow, because that flow doesn't exist.

   **Also worth carrying forward for whoever picks this up**: even the email channel
   doesn't fully match the UX the user described as ideal. Today, email's existence
   check happens at **verify time** — the OTP is still requested and sent, and the user
   still lands on the "enter your code" screen, before the 401 fires. The user's stated
   expectation implies the check should happen at **request time**
   (`/email-otp/request` / `/otp/request`), before any OTP is sent at all, for both
   channels — not just bringing phone's verify-time behavior in line with email's
   verify-time behavior. Moving the check to request time is a slightly larger change
   (touches both `request_*` handlers, not just both `verify_*` handlers) and has one
   real tradeoff worth surfacing to the user before building it: an unauthenticated
   "does this identifier have an account" check at request time is a mild
   account-enumeration surface (probeable without ever completing an OTP). Low stakes
   for this product, but a deliberate tradeoff, not a free improvement.

   **Explicitly deferred, not fixed, by user decision 2026-09-11**: the user judged this
   redundant work right now, reasoning that once a real OTP provider is attached later,
   invalid/nonexistent phone numbers will need to be handled as part of that integration
   anyway. **Note added 2026-09-26**: real OTP/email delivery (SES) has since gone live
   (2026-09-17/22/23) — worth checking with the user whether that changes the deferral
   calculus now that "the real provider" referenced in the original deferral reasoning
   actually exists.
