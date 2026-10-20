# Session Log

> Permanent, append-only chronological log of what was done, session by session. Distinct from `session.md`, which stays a short, prunable "picking this up cold" pointer to *current* status only and gets overwritten each session — this file is the full history and is never trimmed or summarized away. Backfilled 2026-08-14 from `session.md`'s own accumulated history plus `Docs/superpowers/plans/` and `Docs/superpowers/specs/`; entries before that date are reconstructed from those sources, not lived through in real time, so treat exact dates on early entries as best-available rather than certain.

## 2026-07-22 — Stack decisions finalized

ADR-001 through ADR-006 accepted: React/Vite SPA, FastAPI, AWS RDS Postgres, scoped S3 (no CAS PDF retention), ECS Express Mode, EventBridge Scheduler + Fargate. See `decisions.md` and `Docs/PRDs/ADR-Technical-Stack-Decisions.md`.

## 2026-08-04 — Phase 0 (foundation) and Phase 1 backend (CAS import) built

Phase 0: all 11 tasks, `Docs/superpowers/plans/2026-08-04-phase-0-foundation.md`. Phase 1 backend: CAS import tightening + monolith port, all 9 tasks, `Docs/superpowers/plans/2026-08-04-phase-1-cas-import-backend.md` — `casparser` wrapper, `mfapi.in` enrichment, two-phase parse/confirm API routes, Decimal-safe calc.

## 2026-08-05 — Phase 1b (Import Review frontend) and Phase 2 backend (Auth + Onboarding) built

Phase 1b: all 7 tasks, `Docs/superpowers/plans/2026-08-05-phase-1b-import-review-frontend.md`. Phase 2 backend: phone+OTP auth, session tokens, `GET`/`PATCH /auth/me`, household-member CRUD — all 4 tasks, `Docs/superpowers/plans/2026-08-05-phase-2-auth-onboarding-backend.md`.

## 2026-08-06 — Phase 2b (onboarding frontend), Phase 3 backend (Main Dashboard), transaction-dedupe migration

Phase 2b: `Docs/superpowers/plans/2026-08-06-phase-2b-onboarding-frontend.md`. Phase 3 backend: `Docs/superpowers/plans/2026-08-06-phase-3-main-dashboard-backend.md`. Also: migration 0002 widened the transaction dedupe key to include `type`, fixing a real bug where same-day equal-magnitude purchase/redemption pairs collided — see `decisions.md`.

## 2026-08-07 — Distributor comparison (PRD-03 FR-11) built; frontend redesign brief written

`Docs/superpowers/plans/2026-08-07-distributor-comparison.md`. Also produced `Docs/superpowers/specs/2026-08-07-frontend-redesign-brief-for-coding-agent.md`, setting up the later Antigravity-driven frontend redesign pass.

## ~2026-08-08/09 — Phase 3b: Frontend UI Redesign (Google Antigravity), reviewed and fixed by Claude Code

Built via Google Antigravity on `feature/frontend-redesign` (zero backend changes). Antigravity's own report claimed full test coverage — false on inspection: 39 of 104 frontend tests failing plus 6 `tsc` errors. Claude Code root-caused and fixed every one, not just patched to green. Real app bugs found and fixed: a PDF-password `<label>` missing `htmlFor` (accessibility regression), `MainDashboardFlow`'s Add Data re-entry silently misattributing uploads to the wrong household member (used an onboarding-only component with no way to target a specific member), and a `Decimal`-never-`float` violation on the dashboard's most visible number (Total Portfolio Value was client-side `parseFloat`-summed instead of using the already-fetched server total). Also fixed: a dead `strokeDashoffset` var, `import type` fixes for `verbatimModuleSyntax`, and ~20 tests stale against redesigned copy. Follow-up same session: fixed `investedVal`/`profitVal` float accumulation with a dependency-free exact-decimal-string `sumDecimalStrings` helper, and untracked the `impeccable` plugin from git history (kept on disk, added to `.gitignore`). Merged to `main` (fast-forward, commit `61bf6f4`); `dev_intern` cut from the same commit. Final verified state: 156/156 backend, 111/111 frontend, `tsc` clean.

## 2026-08-10 — Phase 4 Analytics backend, Parts 1–4 built (design + build order set)

Full 5-step Analytics build order designed: `Docs/superpowers/plans/2026-08-10-phase-4-analytics-backend-design.md`. **Part 1 (category allocation, FR-1/FR-2)** built on `feature/phase4-part1-allocation`, merged to `dev_intern` this session (`1ab0fab`) — `analytics/allocation.py`, 2 new routes, 8 tests, suite to 164/2. **Part 2 (AMFI TER+AAUM → weighted TER, FR-10/FR-11)** built same session, continuing straight on — `amfi_ter_client.py`, `amfi_aaum_client.py`, `ter.py`, 4 routes, 40 new tests, suite to 250/2 (see `decisions.md` for the 0.55 fuzzy-match-threshold tuning). **Part 3 (NSE Indices → benchmark comparison, FR-8/FR-9)** built same session — `nse_indices_client.py` (live-corrected the `niftyindices.com` endpoint path, since the design doc's and TDD's documented path was dead), `xirr.py` (pure-Decimal Newton-Raphson solver), `benchmark.py`, routes, 36 new tests, suite to 286/2. **Part 4 (category-universe NAV caching → ranking, FR-3/FR-4)** built same session — `scheme_universe.py` (AMFI bulk `NAVAll.txt` ingestion, live-verified format), `category_ranking.py` (see `decisions.md` for the 40/60 blend-weight decision), routes, suite to 314/2.

Also this session: knowledge graph refreshed to match the Part 1 merge commit (533 nodes/1223 edges); branch reconciliation merging Part 1–4 work with the intern's separately-landed UI/UX overhaul and CAS import redesign (`bb32b97`), `dev_intern` fast-forwarded to match.

## 2026-08-1X — Cleanup pass: knowledge graph refreshed again, stale branch deleted

Follow-up session before Phase 4 Part 2 restart context: knowledge graph re-refreshed via full 7-phase `/understand` pipeline to 661 nodes/1657 edges/10 layers/15 tour steps, matching HEAD after the CAS Import lifecycle feature landed. `feature/phase4-part1-allocation` local branch deleted (confirmed merged). ~50 files reconfirmed as pure CRLF-line-ending noise, not touched.

## 2026-08-12 — Model-orchestration skill built

`.claude/skills/model-orchestration/` — governs delegating implementation work to Codex as default worker, Claude Code as orchestrator. Built via brainstorming → writing-plans → subagent-driven-development. Design: `Docs/superpowers/specs/2026-08-12-model-orchestration-skill-design.md`; plan: `Docs/superpowers/plans/2026-08-12-model-orchestration-skill.md`.

## 2026-08-13 — Phase 4 Part 5: the Scorer built, completing PRD-04 Analytics backend

Ayush's one hard product requirement for Analytics — see `decisions.md` for the 45/30/25 weighting decision. Built as three ordered tasks (`risk_metrics.py` shared time-series building blocks; `scorer.py`'s composite score; portfolio-level roll-up) plus 3 API routes and a stakeholder-facing methodology doc (`Docs/Scorer-Methodology-Unifolio.md`). Final whole-branch adversarial review (the `model-orchestration` skill's mandatory gate) caught 3 real findings, all fixed in one round: a redundant per-fund category-universe re-scoring (High), a Feb-29 `date.replace` crash (Medium, second occurrence of a bug already parked once elsewhere — fixed at the root with a shared `years_ago()` helper), and a racy check-then-insert on daily `FundScore` persistence (Medium, fixed via pinning `computed_at` to UTC day-start). Backend suite: 357 passing, 2 skipped (up from 341/2). PRD-04 backend is now fully complete — only the Analytics frontend remains unbuilt.

## 2026-08-13/14 — Dashboard load-time performance fix (Fix A/B/D)

Root cause diagnosed directly: on-demand NAV fetch is a local-dev-first stand-in for the still-deferred ADR-006 scheduled refresh job (Fix C). Three in-scope mitigations delegated end-to-end to Codex via `model-orchestration`: **Fix A** (background NAV prefetch on import confirm), **Fix B** (parallelized per-scheme NAV network fetch, DB reads/writes never interleaved across coroutines), **Fix D** (process-local per-day holdings cache). Fix D took 4 full implement→verify→adversarial-review rounds before it was correct — each round's review caught something real (a cacheable stale/incomplete snapshot, a publish-after-invalidate race, an NAV-upsert IntegrityError race, a too-narrow cache-eligibility rule defeating the cache's own purpose, and finally a bounded-but-accepted single-flight gap). Explicit user decision: accept round 4's remaining limitation (no per-key single-flight coordination), do not dispatch a round 5 — see `decisions.md`. Full round-by-round detail: `Docs/orchestration/dashboard-nav-perf-handoff.md` (Status: DONE) and `Docs/orchestration/delegation-log.md`. Backend suite grew 156 → 326 passing, 2 skipped throughout, zero regressions. Then: `feat/enhanced-ui` fast-forwarded to pick up 4 incoming colleague UI commits, this fix committed on top and pushed; `dev_intern` fast-forwarded to match and pushed.

## 2026-08-14 — Branch reconciliation; CAS import lifecycle redesign and UI/UX foundation backfilled into shared history

Session opened mid-branch-drift: intern (`aditishanbhag`) had pushed a Badge/Select componentry cleanup to `feat/enhanced-ui` while an in-progress local fix for the same two issues was still pending here — the in-progress local fix was discarded once the intern's independently-equivalent commits landed (confirmed via full suite re-verification, not reused from an earlier run). Result: `dev_intern` and `feat/enhanced-ui` merged and identical at `7426047` (357 passed/2 skipped backend, 190/190 frontend across 49 files, `tsc` clean).

Reconciling the branches surfaced two authorship streams not yet reflected in `CLAUDE.md`/`session.md`:
1. **CAS Import lifecycle redesign** (intern-authored, backend + frontend) — an 11-state import lifecycle state machine (`import_/state_machine.py`), migration 0003 (`Import`/`Folio` schema changes, new `OPENING_BALANCE` transaction type), coverage-gap detection, opening-balance resolution, a CAMS-portal mailback URL generator, and the matching frontend (API client/types, lifecycle views, a two-path CAS import UI). **Passes the full test suite but has not had an independent Claude Code review pass** against CLAUDE.md's non-negotiables — flagged as an open item, not treated as equivalent to "reviewed."
2. **UI/UX foundation** (intern-authored) — shadcn/Tailwind/design-token setup, mobile app shell, dashboard/fund-details/responsive routing, then a same-day Radix `Select` refactor across `ReviewTable`/`AttributionModal`/`AddFamilyMembers`/mobile filters, a unified `Badge` component, and a `toTitleCase` utility for proper-casing badge/plan-type text. Also not yet independently reviewed.

## 2026-08-14 — Multi-method auth: design finalized, backend implementation plan written

Brainstormed and specced a remodel of auth from phone+OTP-only to phone + email-OTP + Google as equal-looking entry points, with Apple deferred to Future Scope. Design went through several rounds of resolution (see `decisions.md` for the substantive calls: mandatory phone gate, identity precedence, account-linking policy, `EmailProvider` abstraction, Postmark timing, Apple placeholder). Backend and frontend design specs split into separate files (`Docs/superpowers/specs/2026-08-14-multi-method-auth-design.md` and `...-frontend-design.md`), mirroring the existing Phase 2/2b precedent. A full backend implementation plan was then written (`Docs/superpowers/plans/2026-08-14-multi-method-auth-backend-plan.md`, 11 TDD tasks: schema/migration, `EmailProvider`, generalized OTP service, `Session.auth_method`, identity/collision resolution, pending-verification/phone-gate completion, Google ID-token verification, request/response schemas, the two OTP routes, the Google OAuth route, and OTP request throttling). **As of this entry, the backend plan is written but not yet executed, and the frontend implementation plan is still being written** — no code from this feature has been merged yet.

## 2026-08-14 — Multi-method auth: frontend implementation plan also completed; five more open items resolved; documentation system established

Continuing straight on from the backend plan: a full frontend implementation plan was written (`Docs/superpowers/plans/2026-08-14-multi-method-auth-frontend-plan.md`, 10 TDD tasks — types/API client, `useOAuthScript`, `GoogleButton`, `EmailEntry`/`EmailOtpVerify`, `PhoneEntry` rework, `AuthShowcasePanel`, `Landing` redesign, `LinkAccountPrompt`, `AuthEntryFlow` orchestration, and a full integration-test rewrite), explicitly sequenced to depend on the backend plan's exact API shapes. Both plans are now complete and saved, but **neither has been executed** — no code from this feature exists yet.

Before the frontend plan was written, five more open items from the design specs were resolved by the user (see `decisions.md` for each with its "why"): email stays visible in the UI on the stub provider with Postmark now a firm pre-production prerequisite; Postmark confirmed over SES; the shared `pending_identity_verifications` TTL confirmed; the four pill buttons' order locked (Google, Apple, Email, Phone); and the right-side showcase panel's content confirmed as pending separate input from the product owner rather than a generic placeholder. Both design spec files were updated in place to reflect all of this.

Also this session: a standing documentation discipline was set up — `decisions.md`, `log.md`, `backend.md`, `database.md` created and backfilled with this project's full history (this file's own existence is part of that). A duplicate dispatch happened (a direct subagent call plus a `/subtask` harness fork both working the same task concurrently) but reconciled cleanly with no data loss, committed as `074d7e1` on `authsetup`. A CLAUDE.md "End-of-Session Documentation" section and a session.md addition were drafted but deliberately left for the user to merge manually, to avoid a race on those two files.

## 2026-08-14 — Multi-method auth backend: all 11 plan tasks executed via subagent-driven-development

Executed `Docs/superpowers/plans/2026-08-14-multi-method-auth-backend-plan.md` task-by-task on branch `authsetup`, per the user's explicit instruction (TDD per task, full suite before each commit, adversarial-review gate before marking any task done, stop-and-ask before touching anything outside the plan's scope). All 11 tasks completed and reviewed; one out-of-plan issue (3 CAS-import test fixtures still calling the old 2-arg `create_session` signature, surfaced by Task 9's removal of the old phone-lookup path) was raised to the user rather than decided unilaterally — user chose to fix immediately, done as a small approved addition (`6165403`). Full commit range and the two real bugs caught mid-plan (Task 6's non-atomic commit, Task 8's false-positive review) are recorded in `backend.md`.

The mandatory final whole-branch review (run once, after all 11 tasks, per the skill's process) found 2 Critical + 4 Important findings — all genuinely cross-task, none catchable by any single task's own review. Full detail in `backend.md`; the standout is that one of the two Criticals (missing backfill migration for pre-existing users) traces back to a gap in the *plan itself*, not an implementer mistake — the design spec had explicitly named this as required future work and it was never turned into a plan task. A fix wave covering all 6 findings was dispatched; the first attempt stalled mid-way (agent-runtime timeout, not a code defect — verified via `git log`/`git diff` that no partial/broken state had landed) and was picked up by a continuation agent instructed to independently re-verify the salvaged work before finishing the rest. The fix wave completed (commit `2784b61`), and the mandatory scoped re-review that followed it (per the skill's "no second fix wave" rule) came back CLEAN — all 6 findings confirmed genuinely closed by an independent reviewer tracing the actual diff, not the fix-wave's self-report. See `backend.md`'s 2026-08-14 "fix wave complete" entry for the full detail, including 4 new Minor findings the re-review surfaced in the fix-wave diff itself, all ruled non-load-bearing and parked (not fixed) per process. **The backend implementation plan is now fully complete**: 11 tasks, 1 out-of-plan fixture fix, and the final review's 2 Critical + 4 Important findings, all fixed and independently verified. Backend suite: 441 passed, 2 skipped, 0 failed, 0 errors. The SDD workspace for this plan (`.superpowers/sdd/2026-08-14-multi-method-auth-backend-plan/`) has been deleted per the skill's Finish step, having served its purpose as the execution ledger. The companion frontend implementation plan (`Docs/superpowers/plans/2026-08-14-multi-method-auth-frontend-plan.md`, 10 tasks) remains completely unexecuted — not started, not requested for this session.

## 2026-08-15 through 2026-08-17 — Multi-method auth frontend: all 10 plan tasks executed, plan now fully complete

Executed the frontend plan task-by-task via `superpowers:subagent-driven-development`, mirroring the backend plan's discipline. Confirmed branch (`authsetup`), re-confirmed the prior session's email-OTP-stub-mode finding still held (no backend commits had touched it), corrected a pill-order transcription error in the plan itself (`decisions.md`), and resolved a hard-stop-checkpoint mismatch directly with the user — their stated "OAuth redirect flow" concern didn't apply (the design deliberately avoids a redirect via Google Identity Services' popup/token flow), so the checkpoint moved to Task 9 (`AuthEntryFlow` orchestration) instead.

All 10 tasks completed and reviewed, each independently verified by the controller against the actual diff (not just implementer/reviewer self-reports) at every step — a discipline that caught two real things a self-report alone would have missed: a `devOtp`-clearing regression Task 9's own first fix round introduced (caught via direct code reading before dispatching re-review, fixed in a second round), and Task 1's implementer correctly identifying and fixing a genuine defect in the plan's own Task 2 test-spec (a URL-reuse bug that would have made the brief's own literal test code fail). One out-of-plan issue (`App.test.tsx`, never mentioned in the plan, asserting on Landing's old removed "Sign Up" button) was raised to the user rather than decided unilaterally — user chose to fix immediately.

The mandatory final whole-branch review found 1 Critical + 6 Important findings — the Critical (Google sign-in failures completely invisible to the user — `Landing.tsx` had no `error`/`submitting` props to render what `AuthEntryFlow`'s Google handler already set) is the standout: neither Task 3 nor Task 7 could have caught it in isolation, since both were individually correct against their own briefs — only the merged wiring exposed the gap, because the design spec's explicit requirement for GoogleButton to own error/loading state was silently dropped when the plan's task briefs were written. A fix wave addressed all 9 findings (1 Critical, 6 Important, 2 selected Minor) in one commit, and — as a genuinely valuable side effect of needing its own verification to pass — found and fixed a real environment bug that had been causing this whole session's "transient" vitest worker-timeout flakiness (see `decisions.md`'s 2026-08-17 entry). Mid-fix-wave, the user tested the actual dev server in their own browser and explicitly rejected one specific piece of the fix (a visible "not configured" banner for missing Google client ID) — honored directly as a targeted follow-up revert, re-verified, without touching anything else from the fix wave. The final scoped re-review confirmed all 9 findings genuinely addressed (including the deliberate reversal), with only 3 cosmetic stale-comment items parked. **Full frontend suite: 219 passed, 0 failed, 0 skipped, tsc clean, production build clean.** Live browser visual verification remains an honestly-flagged gap in this sandbox (no Chrome/sudo available) — though the user's own direct browser testing during the fix-wave feedback loop is real, if partial, signal that the actual rendered UI works.

## 2026-08-17 — Email+password auth: backend and frontend implementation plans fully completed (Superseded)

Completed the transition from email-OTP to email+password authentication across both backend and frontend on branch `authsetup`.
*(Superseded by 2026-08-17/18 password removal below).*

## 2026-08-17/18 — Password Auth Removal & Pure Email-OTP Flow Restoration

Executed password removal across backend and frontend per management decision:
- Applied migrations `0007_email_otp_signup` and `0008_remove_password_auth`.
- Restored pure OTP-based email signup and login (`POST /auth/signup/email`, `POST /auth/email-otp/request`, `POST /auth/email-otp/verify`).
- Removed all password fields and token tables from the backend and frontend forms.
- Re-verified full test suites: backend 449 passed/2 skipped; frontend 218 passed across 52 test files.

## 2026-08-19 — Left Auth Panel Motion, Auth Validation Engine, and Hand-Drawn Hero Illustrations Integration

Executed comprehensive visual, motion, validation, and illustration enhancements:
1. **Left Auth Showcase Panel Redesign (`AuthShowcasePanel.tsx`)**:
   - Built a 3D dark slate screen card on a near-black radial background with diamond grid.
   - Designed one deliberate continuous trajectory drawing smoothly along its actual SVG path from chaotic waveform to structured compounding.
   - Added `hasAnimatedInSession` session persistence flag ensuring the animation plays exactly once per load and never restarts across step changes.
   - Replaced automated cycling statistics with cursor-hover milestone tooltips (`+14.8%`, `+28.4%`, `+41.2%`, `+56.8%`).
   - Added JSDOM guards for SVG path measurement methods to ensure test suite robustness.

2. **CORS Multi-Port Dev Support (`backend/app/main.py`)**:
   - Added `allow_origin_regex` to CORSMiddleware supporting ports 5173, 5174, 5175, and 3000.
   - Automated tests added to `backend/tests/test_health.py`.

3. **Comprehensive Auth Validation Engine (`validation.ts`, `validation.test.ts`)**:
   - Built email validator with structural rules, extension prompts, and intelligent typo suggestions (e.g. `gmial.com` -> `"Did you mean name@gmail.com?"`) without silent modification.
   - Built Indian mobile phone validator with 10-digit requirements, valid starting digits (`6-9`), non-digit rejection, and canonical normalization (`+91XXXXXXXXXX`).
   - Wired live dynamic error recovery on blur and submit in `Landing.tsx`, `EmailEntry.tsx`, `PhoneEntry.tsx`, `OtpVerify.tsx`, and `AuthEntryFlow.tsx`.
   - Comprehensive test suite: 30/30 unit tests passed in `validation.test.ts`.

4. **Hand-Drawn Hero Illustrations & Option Cards Integration**:
   - Extracted 5 distinct illustrations from the user's illustration sheet into transparent high-resolution PNGs with subtle Unifolio green accents (`#22C55E` / `#16A34A`), with both light mode (charcoal linework) and dark mode (luminous silver) assets.
   - Integrated into `OnboardingIllustration.tsx` with light/dark theme switching and ambient emerald radial depth glow.
   - Replaced generic Lucide icons in `Q4Household.tsx` (Just Me, Family Too) and `TrustPrimer.tsx` (Read-only access, No raw CAS PDF storage) with matching bespoke hand-drawn SVGs.

5. **Full Verification**:
   - All unit tests and integration tests passing (`30/30` validation, `15/15` auth entry flow, `6/6` onboarding flow).
   - Backend suite: 449 passed, 2 skipped, 0 failed.
   - Production bundle build: `npm run build` clean (0 errors).

## 2026-08-27 — Mobile Review Scroll Fixes, Roadmap Milestone Unlock Animations & CTA Centering Audit

1. **Mobile CAS Import Review Scroll & Viewport Overflow Fixes (`ReviewTable.tsx`, `App.tsx`, `OnboardingFlow.tsx`)**:
   - Resolved mobile viewport vertical overflow trap: removed `overflow-hidden` from `MobileInitialFlow` in `App.tsx`, enabled `overflow-y-auto`, and top-aligned the onboarding step containers in `OnboardingFlow.tsx`.
   - Refined mobile layout for `ReviewTable.tsx`: hidden the statement verified badge on mobile, converted the filter row into a 3-column grid without horizontal scrollbars, tightened card padding and typography, and added `pb-28 sm:pb-24` bottom clearance for sticky footer visibility.

2. **Mobile & Web Import Screens Vertical Centering & Upload Refinements (`UploadForm.tsx`, `MobileUploadForm.tsx`, `TwoPathImportContainer.tsx`, `ParsingIndicator.tsx`, `ImportConfirmed.tsx`, `ImportFlow.tsx`, `MobileImportView.tsx`)**:
   - Vertically centered the Upload Screen on both web and mobile layouts.
   - Enlarged the hero illustration on the upload statement screen (`w-24 h-24 sm:w-28 sm:h-28`) and removed the PAN/DOB password hint line.
   - Vertically centered the CAS Processing Indicator screen on both web and mobile.
   - Vertically centered the Import Complete screen on both web and mobile.
   - Vertically centered the Import Choice screen while keeping top navigation anchored.

3. **Roadmap Milestone Sequential Activation & Pop/Glow Animations (`MobileAuthBackground.tsx` / `AuthRoadmapSvg`)**:
   - Updated authentication roadmap milestone behavior across both mobile and web:
     - Icons remain muted/light (`opacity: 0.4`) before the traveler marker arrives.
     - Animate with a subtle pop/lift effect (`scale: [1, 1.14, 1]`, `y: [0, -1.8, 0]`) as the marker reaches each step sequentially.
     - Unlocks with a soft radiant `#milestone-unlock-glow` radial gradient aura.
     - Persists in a dark, active state (`opacity: 1.0`, bold stroke styling, vivid green accents) after unlock.

4. **UI Consistency & CTA Centering Audit**:
   - Audited all action buttons, CTAs, and controls across mobile and web flows.
   - Fixed asymmetric left offset in `MobileOnboardingScreen.tsx` by eliminating empty placeholder spacers when `onSkip` is absent and applying `w-full` directly.
   - Enforced explicit flex centering wrappers (`w-full flex justify-center items-center`) and `mx-auto` alignment on `ImportConfirmed.tsx`, `ImportError.tsx`, `MobileImportView.tsx`, and `EmptyState.tsx`.

5. **Login Roadmap State Logic & 2-Milestone Flow (`MobileAuthBackground.tsx`, `AuthShell.tsx`, `AuthEntryFlow.tsx`, `mobileJourneyContext.tsx`)**:
   - Fixed roadmap milestone state management: explicitly decoupled login progression from page switching, route changing, or Sign-up/Login toggles.
   - Starting at Step 1 (`x: 36, y: 38`), clicking "Log in" from the Sign-up page switches to Login mode while keeping the marker rock solid at Step 1 (Milestone 1).
   - Selecting "Continue with Email" or "Continue with Phone" and typing credentials keeps the marker firmly at Step 1.
   - Transitioning to the OTP verification screen (`email_otp` or `otp`) moves the marker smoothly along the curved route to Step 2 (`x: 340, y: 22`), triggering the milestone pop/lift effect and `#milestone-unlock-glow`.
   - After successful OTP verification, navigates directly to the dashboard without adding further roadmap steps.
   - Added unit tests in `MobileAuthBackground.test.tsx`.

6. **Comprehensive Mobile Scrolling Fixes**:
   - Eliminated rigid `h-dvh max-h-dvh overflow-hidden` barriers across mobile containers (`MobileOnboardingScreen.tsx`, `App.tsx`, `MobileLandingPage.tsx`, `AuthShell.tsx`).
   - Implemented `min-h-dvh overflow-x-hidden overflow-y-auto` enabling smooth vertical scrolling on all question screens (Q1 Name, Q2 Investing, Q3 Purpose, Q4 Household, Trust Primer, Add Family Members) on compact viewports.
   - Pinned mobile onboarding footers with `sticky bottom-0 backdrop-blur-sm z-30` ensuring CTAs are never obscured or pushed out of reach.
   - Added `flex-1 min-h-0 overflow-y-auto pb-16` on `MobileDistributorComparisonView.tsx` and increased `pb-28 sm:pb-32` on `MobileReviewView.tsx`.
   - Verified zero impact on the desktop web application.

7. **Full Verification**:
   - Frontend test suite: 75 test files passed, 381 tests passed (100% green).
   - Zero regressions across desktop and mobile test suites.

## 2026-08-24 — AMFI TER concurrency lowered to avoid a 429; Analytics PDF export Allocation section fixed

Two small, independent post-merge fixes on `feat/enhanced-ui`, both direct (no Codex dispatch): (1) `_TER_FETCH_CONCURRENCY` lowered 20→5 (`bb9f507`) after live-verifying AMFI's TER-page endpoint does rate-limit at 20 concurrent requests, tripping a 429 that left `scheme_ter` empty for the full 15-minute backoff window; no retry-on-429 added since the existing 15-minute backoff already retries on the next request. (2) Analytics PDF export's Portfolio Allocation section (`12946f7`) — the SEBI Category donut rendered as a barely-visible sliver and the AMC breakdown never appeared at all. Two root causes: `AllocationSection.tsx`'s Category/AMC toggle was pure React click state, so Playwright's static capture only ever saw the default tab (same bug class as `BenchmarkSection.tsx`'s tab toggle, fixed earlier in the PDF-export plan); and `PieSlice.tsx`'s spring-animated draw-in meant `page.pdf()` fired mid-animation. Fixed by giving `AllocationSection` the same `printMode` prop pattern as `BenchmarkSection` (stacks both breakdowns instead of tab-switching) plus a new `animate` prop threaded to `PieSlice` (already had a static render path, just never wired through). Full frontend suite: 335/335 across 72 files, `tsc -b --noEmit` clean.

## 2026-08-25/26 — AMFI TER `ReadTimeout`s root-caused to event-loop starvation, not AMFI slowness; `commit_off_loop` fix

A colleague's AMFI TER `ReadTimeout`s were initially stopgapped by raising the httpx client timeout 30s→90s (`945b271`), confirmed fixed live 2026-08-26. Root cause then properly fixed, not just worked around: this backend's SQLAlchemy engine is fully synchronous on a single worker/event loop, so any blocking `db.commit()` inside an `async def` handler stalls every concurrent request, not just the slow one. `bb5225f` added `commit_off_loop` (routes `db.commit()` through `asyncio.to_thread`) and rewired every reachable commit across all 8 affected service files, with a regression test proving a slow commit no longer starves the loop.

## 2026-09-02 — AWS staging prep: compliance-audit remediation Group 1, three F-items authorized outside it

Worked `AWS Readiness/sqlite-postgres-migration-compliance-audit.md` down to zero pre-staging gaps. Two prior Codex-implemented pieces (OTP stub-mode guard, Dockerfile/CORS/upload-validation hardening, and the enum-drift migration `0010`) independently re-verified, not trusted from self-report. Group 1 (no product decision needed, done directly since Codex was usage-limited): F6 (Postgres `ON CONFLICT DO NOTHING` NAV-upsert path got real Postgres test coverage, plus a dialect-branch→dict-lookup refactor), F9 (`amfi_aaum_client.py`'s last stray bare `db.commit()` routed through `commit_off_loop`), F10 (`folios.coverage_gap_details` migration aligned to the ORM's portable JSON/JSONB idiom), F5 (`Database-Schema-Unifolio.md` refreshed to v1.4 for migrations 0003/0007-0010). Also authorized outside Group 1: F7 (`compute_holdings`'s per-folio N+1 query batched into one query across all folios) and F3 (migration `0011` — partial unique index on `household_members(user_id) WHERE relationship='self'`, plus a `DuplicateSelfMemberError` 409 guard; a read-only check found zero existing violations first). Handoff docs written and dispatched to Codex for F4 (ADR-006's 4 job-entrypoint scripts), F8 (NAV-unavailable degraded row), and a non-PAN duplicate-person-detection design (folio+AMC signal for same-user dedup, an advisory-only cross-user check) — see `decisions.md` for the resolved product calls behind each. Single-ECS-task/no-Redis deferral for staging explicitly confirmed, documented in `AWS Readiness/aws-golive-launch-blockers.md`.

## 2026-09-03 — F4, F8, non-PAN-dedup all implemented and cleared review

F4 piece (a): 4 job-entrypoint scripts + `amfi_aaum_client.refresh_aaum_data` wiring, adversarial-review gate cleared (piece (b), the actual EventBridge/ECS Terraform, stays deferred until an AWS account exists). F8: NAV-unavailable degraded row shipped across 2 review rounds (round 2 caught `gainPercentage` mixing valued/unvalued populations, fixed with a `valuedInvestedVal` denominator). Non-PAN dedup round 2 wired the round-1 design into both parallel import backends (`service.py`'s confirm flow and `lifecycle_service.py`'s async CAS-upload flow) via a shared `enforce_attribution_confirmation` gate and a structured `member_mismatch` 409 — surfaced a standalone architectural gap (the two backends needing the identical fix wired in twice), documented at `Docs/orchestration/two-parallel-import-backends-architectural-gap.md`. Backend 614 passed/1 skipped, frontend 397/75 files, both independently re-verified by the orchestrator rather than trusting the reviewer's own unreproduced test claim.

## 2026-09-07 — AWS account + domain cutover; documentation cleanup before Terraform

AWS account created (root MFA, budget alert, IAM admin user `ayush-admim`), region `ap-south-1`, `unifolio.in` cut over from GoDaddy to a Route 53 public hosted zone (existing M365 mail records preserved, GoDaddy-proprietary records dropped). Domain architecture decided: `unifolio.in` apex = marketing site, `app.unifolio.in` = production app, `staging.unifolio.in` = staging app; staging networking decided as self-hosted fck-nat over a managed NAT Gateway to skip the cost-approval step. Before starting Terraform, independently re-verified (not trusted from self-report) that 2026-09-03's work was actually committed (`9fe21fe`) and that every blocker `aws-golive-launch-blockers.md` still listed as open was actually already fixed in code — that doc was stale, not the code.

## 2026-09-08/09 — Terraform Phases 1-3 applied to real AWS; staging infra live end-to-end

AWS CLI/Terraform installed, state backend bootstrapped (S3 + DynamoDB lock table), `terraform apply` succeeded: 57 resources created (VPC, fck-nat + SSM bastion, KMS CMK, RDS Postgres 16, ECR, ECS cluster/service, ALB). Two expected follow-ups both resolved same session: ECS was crash-looping with no image in ECR (built/pushed/force-redeployed from local WSL, after working around a `backend/.pytest_tmp` permission artifact blocking Docker's build-context walk — `sudo rm -rf` was the only thing that removed it, a 9p/drvfs quirk of `/mnt/d`); the DB schema didn't exist yet (applied via an SSM port-forward through the bastion, `alembic upgrade head` confirmed `0011` on real RDS). A real AWS credential was briefly pasted into chat and one committed copy caught by GitHub push protection — rotated and the offending commit rewritten before it ever left the machine. Phase 4 (frontend S3+CloudFront) Terraform authored and reviewed clean by Codex, not yet applied; Phase 5 (ACM/Route 53/ALB HTTPS/CloudFront domain) handoff drafted, gated on Phase 4 being applied first.

## 2026-09-10 — Analytics frontend precompute migration complete

Both desktop (`AnalyticsView.tsx`) and mobile (`MobileAnalyticsView.tsx`) migrated onto a single `useAnalyticsScope` hook consuming `GET /analytics/{scope}`, replacing the deleted 14 per-section analytics client functions, with cold-start/recompute polling and whole-scope retry UI. `tsc -b --noEmit` clean, 76 files/412 tests.

## 2026-09-11 — Investor 10-item feature batch committed; AWS staging prerequisites doc drafted

Profile page, account deletion (5-day grace period + exit survey + household cascade), email/phone change via OTP, theme toggle, import history + delete-import, Dashboard header XIRR, allocation sort toggle, AMC/asset-class drill-down modal, decimal-formatting consistency — 3 rounds of implementation + review (Round 1 → 8 Round-2 findings → 5 Round-3 findings) plus a same-session PM/tech-lead gap pass (3 more fixes). Round-3 and PM-gap fixes were done directly by the orchestrator (Codex usage-limited) — the mandatory adversarial-review gate for both was explicitly deferred, not run, a real flagged gap. Backend 649/8 skipped, frontend 437/79 files, `tsc` clean, all committed to `feat/enhanced-ui` (had sat uncommitted since implementation). AWS staging runbook drafted (`Docs/superpowers/plans/2026-09-11-aws-staging-prerequisites.md`) — every command explicitly for the user to run themselves.

## 2026-09-12 — Fund Score card redesign

Score out of 10 (display-only, backend still stores raw 0-100), reversed 1=best tier convention, plain-English Strengths/Watch-outs verdicts, expandable evidence/methodology sections. Built via `subagent-driven-development`, 9 tasks, no Codex. Final whole-branch review: 1 Critical + 5 Important + 9 Minor, all fixed; a scoped re-review of one fix caught a bug the fix itself introduced (duplicate accordion ids across multiple cards on one page). Two real spec-vs-plan deviations (a dropped tier progress bar, a computed verdict word never rendered) flagged to the user per CLAUDE.md rather than silently resolved — user chose to restore both. Backend 650/8 skipped, frontend 454/80 files, `tsc` clean. Precompute-cache backfill for the new fields explicitly deferred to the AWS/deployment phase (needs live ADR-006 infra).

## 2026-09-16 — Knowledge-graph refresh, codebase-analysis metadata added

`.ua/knowledge-graph.json` and related fingerprint/analysis metadata refreshed via `/understand` to match HEAD at the time (commit `05463e1`). Superseded again by subsequent commits — re-run before trusting it, per `CLAUDE.md`'s own note.

## 2026-09-17 — Real email-OTP delivery (Postmark), independent per-channel delivery mode; docs-viewer infra; audit/architecture doc batch

`PostmarkEmailProvider` added as the first real (non-stub) `EmailProvider` implementation (`e991646`); `email_delivery_mode` split out as its own setting independent of phone/SMS's `otp_delivery_mode` (`508fbbc`/`d0b8b3d`), with an autouse test fixture guarding every test against accidentally picking up a live local `.env` delivery mode. A large documentation batch landed: orchestration audits, backend audit report, AWS technical-architecture-flow doc, AWS go-live readiness report and launch-blockers doc, an AI-agent model-selection research note, and the SQLite→Postgres compliance audit. Separately, `docs.unifolio.in` shipped (`5a24d96`) — a static S3+CloudFront deploy of the knowledge-graph dashboard, isolated from `staging.unifolio.in` (own bucket/distribution/ACM cert/DNS record), gated by a CloudFront Function token check on `*.json` requests to keep cost near zero.

## 2026-09-18 — ADR-004 reopened: PAN persisted (encrypted), CAS PDF retained 30 days

Supersedes the original 2026-07-22 "no PAN, no raw file, ever" decision — see `decisions.md`. Migration `0015` adds `household_members.pan_encrypted`/`pan_lookup_hash` (AES-256-GCM envelope encryption + HMAC-SHA256 deterministic lookup hash) and `imports.file_reference`/`file_expires_at`; local CAS file storage with a 30-day expiry sweep (manual CLI entry point) added. `attribution.py` rewritten to match by PAN first (auto-attribute within the same household, hard-block a PAN already claimed by a different account via `CrossAccountPanBlockedError`), falling back to folio+AMC matching when the CAS has no PAN, with `backfill_pan_if_missing()` capturing PAN on first successful match. A review-fix made the PAN lookup index `UNIQUE` (was a TOCTOU race — two concurrent imports of the same PAN under different accounts could both see "no match"). `TrustPrimer` onboarding copy and `parser.py`'s stale "PAN never persisted" comments corrected to match. `tests/models/test_no_pan_field.py`'s guard broadened, not deleted, to cover every mapped model against the *new* rule (PAN only ever in the two named encrypted/hashed columns). `Database-Schema-Unifolio.md` and PRD-01 synced.

## 2026-09-19 — Cross-account PAN block surfaced as a UI popup; CAS S3 storage + Postmark infra Terraform; PAN/CAS/secrets technical docs

Frontend: a cross-account PAN block previously froze the Family upload flow with no explanation — now surfaces as an explicit "Import blocked" popup (`6de6ea7`). `tasks` branch merged into `feat/enhanced-ui`. Real infra commit (`2c360df`): `infra/modules/storage/` (CAS-files S3 bucket, private, SSE-KMS, lifecycle expiry), Postmark secrets in Secrets Manager, and the scheduled file-expiry job's Terraform wiring — all authored, not yet applied (no `.tfstate` for this environment existed at the time). Technical documentation trio added: PAN persistence/CAS-storage design summary, PAN-CAS attribution feature doc, Postmark email-OTP technical doc.

## 2026-09-22 — Phone-gate collision fix; SES email provider added behind existing abstraction; marketing-site Terraform

Bug fix (`c8a4a8e`/`31e112a`): signup's mandatory phone gate previously called `attach_pending_identity` unconditionally on any phone match, silently signing the caller into an unrelated existing account (stale email visible in Profile) instead of erroring like `signup_email` already does for a duplicate email. Now mirrors email's 409 "already exists — log in instead," the check moved from `otp/verify` to `otp/request` so it surfaces before the caller even types a code, and the already-exists alert got a clickable "Log in instead" shortcut on both channels. Separately: `SesEmailProvider` added behind the existing `EmailProvider` protocol (IAM-role auth via `boto3`, no new secret/token store, matching the codebase's existing AWS SDK usage pattern) — both Postmark and SES now raise a shared `EmailSendError` on failure, caught once per route and turned into a clean `502` instead of an unhandled `500`; an OTP request is no longer persisted if the send itself fails. `infra/envs/marketing/` Terraform + a new opt-in `cloudfront_function_arn` variable on the shared frontend module added for the marketing site. SES cutover + full Postmark removal planned in detail (`Docs/superpowers/plans/2026-09-22-ses-cutover-and-postmark-removal.md`) but explicitly gated — "do not implement/deploy until told to."

## 2026-09-23 — Postmark fully removed (code + Terraform), SES-only; QA schema/journey review; HTML OTP email templates

Postmark provider class, Terraform secrets/variables, and DNS all removed rather than kept dormant (deliberate simplicity choice — dormant cost would've been $0, not a cost-driven call). SES cutover execution guide written. Separately: a schema & user-journey review was written up in response to a QA investigation into signup/CAS-import behavior. Responsive HTML email templates added for both the email-OTP-verification and email-OTP-signup emails, with unit tests.

## 2026-09-24 — PAN check moved to upload time; Confirm Import never prompts; per-PAN statement-splitting drafted (not built)

Fixed a staging bug where every first import on a fresh account showed "we couldn't match this statement to an existing family member" and froze the Family flow — root cause: PAN-based attribution ran at Confirm, but a member's PAN was only ever stored *after* a confirm, so nothing could match on a first import. New `backend/app/services/import_/pan_claims.py` replaces `attribution.py`: `/imports/parse` now claims the parsed PAN for the uploading member as *pending* (`household_members.pan_pending_until`, migration `0016`), with conflicts (409s) returned right after upload instead of at Confirm; `/imports/confirm` only finalizes, no prompts; a new `POST /imports/sessions/{id}/discard` releases an abandoned claim. Frontend: all "Continue anyway / Switch to" UI removed in favor of upfront blocked-import popups. Final review (fresh reviewer): 3 Important fixed (claim moved after mfapi enrichment so SQLite's write lock isn't held across a network call; a Back button on Family's re-upload form; a lost unique-index race now retries instead of 500ing), 7 minors deferred. Backend 714/8 skipped, frontend 484 across 82 files, `tsc` clean. Cosmetic OTP-email desktop-alignment fix landed same day. A follow-on gap was identified and drafted as a plan, **not implemented**: a family CAS statement covering several people only ever reads the *first* folio's PAN (`casparser` exposes PAN per-folio, but folios carry no holder name) — everyone else's funds silently land under that one member. Plan: `Docs/superpowers/plans/2026-09-24-per-pan-statement-splitting.md` (status: draft, no code written).


## 2026-09-29 — CAS member detection built (Tasks 1-20), on `feat/enhanced-ui`

**Correction added 2026-10-01**: confirmed via `git log` as committed (`af92286`..`b40f52b`, the full CAS-member-detection commit run) — not uncommitted as this entry originally said.

One CAS upload now detects every person in the file (PAN groups first, name only for no-PAN folios), shows a "We found N people" popup, a ribbon-per-person review with one combined Confirm imports, and locks detected members on the dashboard until the user supplies relationship and PAN (unlock). Spec `Docs/orchestration/cas-member-detection-map.html`; plan `Docs/superpowers/plans/2026-09-29-cas-member-detection.md`; implementation ledger `.superpowers/sdd/2026-09-29-cas-member-detection/progress.md`.

- **Backend (Tasks 1-13):** migration `0018` (member lock/detection columns, `imports.upload_group_id`, two audit tables, never-relock trigger); name matching and PAN masking; multi-person parser and holder-name extraction; people detection and resolution prompts; one-transaction multi-person confirm; grouped file storage; member unlock, merge and portfolio-delete routes; server-side lock gate. Detail in `backend.md`, `database.md`.
- **Frontend (Tasks 14-19):** Q4/family-add onboarding screens deleted (`AddFamilyMembers`, `FamilyCasUpload`, `FamilyImportFlow`, `ParseQueue`, `Q4Household`, `UploadMyCas`); name-as-per-PAN copy; people popup; ribbon review; locked-member UI and unlock/edit popup; grouped Import History and delete dialogs; mobile twins.
- **PRD amendments (Task 20):** applied the spec's R6 table to `Updated-CAS-PRD.md` (FR-3 rule, FR-4 restored from "password" to PAN plus the name-matching rule), `PRD-02` (US-2, FR-6, Q4 removed), `PRD-01` (FR-9), `App-Flow-Unifolio.md` (v1.3; S6/S7/S24-S26 struck, S5 goes to S8, new screens); `Database-Schema-Unifolio.md` to v1.6. `DEFERRED_FEATURES.md` gained minors' folios, Ask for access (option C) and a general merge tool. Decisions and spec deviations in `decisions.md`.
- **Verified before the docs pass:** per-task reviews clean (ledger). **Not verified:** `functional_postgres` tests never run (no Docker in WSL); holder-name extraction only on synthetic CAMS/KFintech lines; mobile ribbon review has had no phone visual QA. Nothing committed; the user reviews and commits.


## 2026-09-30 — Staging QA fixes (auth + CAS member detection)

**Correction added 2026-10-01**: confirmed via `git log` as committed (`1ace61c`/`c404c2f`/`3541ef4`/`1cf9f35`/`d52bab6`) — not uncommitted as this entry originally said.

The user tested the auth redesign and member detection on staging and reported six issues. Diagnosed into `Docs/orchestration/2026-09-30-staging-qa-findings-map.html` (the duplicate-Kavita bug reproduced locally with the synthetic fixture PDFs: three causes), decided with the user, planned in `Docs/superpowers/plans/2026-09-30-staging-qa-fixes.md`, and built: Tasks 1-2 by Claude subagents with per-task reviews, Tasks 3-11 natively in-session (user's switch), TDD throughout.

- **Auth:** `flow` on both OTP-request routes; sign-up 409 / login 404 at request time; sign-up 409 at verify.
- **Onboarding:** multi-select goal; migration 0019 (`users.primary_goals`, expand phase).
- **Import review:** embedded 3-column ribbon grid, auto-confirm at 0 unresolved (amends the FR-4 note).
- **Unlock:** L3 popup with `use_detected_pan`.
- **People resolution:** exact-name attach for PAN-less people, asked same-person link for PAN people matching a name-only member, widened merge rule.
- **Import history:** statement period written at Confirm; migration 0020 backfill.
- **Not verified:** Postgres (0019 CHECK / JSONB, 0020 on JSONB); browser visual QA. Mid-session, `Docs/orchestration/qa-fixtures/` and `.superpowers/sdd/` were deleted by something outside the session.

## 2026-10-01 — Staging DB-access tooling; FamilyImportFlow bug found; CAS 10-year handoff written

Set up repeatable staging RDS access (SSM port-forwarding tunnel through the SSM-only bastion, `psql`/DBeaver on the other end) and used it to wipe all user-domain data for several rounds of stakeholder fresh-signup testing, confirming via before/after counts that reference/platform tables (`schemes`, `nav_history`, `scheme_ter`, `scheme_aaum`, `benchmark_index_history`, `arn_directory`, `fund_scores`) were never touched. That wipe is now `scripts/clean-staging-db.sh` — resolves the bastion/RDS endpoint/Secrets Manager ARN dynamically (no hardcoded IDs), runs the delete in one FK-safe transaction, and prints before/after counts — so it no longer needs a live session each time.

Diagnosed two user-reported issues against `attribution.py`: the "we couldn't match this statement to an existing family member" prompt on a fresh account's first import is expected behavior (no PAN/folio to match against yet), not a bug. But the missing "Continue anyway" button when the same prompt fires for a family member (vs. "Just Me") is a real, confirmed bug: `frontend/src/features/auth/FamilyImportFlow.tsx`'s `handleConfirm` only branches on `cross_account_pan_blocked` and falls through to a plain, button-less notice for `member_mismatch`, unlike `frontend/src/features/import/ImportFlow.tsx`, which has the full `memberMismatch` state + "Continue anyway"/"Switch to X" UI. Confirmed via `backend/app/api/imports.py` and `cas_imports.py` that both routes emit an identical 409 payload regardless of status, so the gap is purely frontend. Not fixed this session — diagnosed and scoped only.

Revisited the still-open 10-year CAS statement value-discrepancy item from `2026-09-23-schema-and-user-journey-review.md` §5: re-confirmed via grep that no Unifolio code branches on statement year-span, so the likely cause remains the third-party `casparser` library's page/fund-boundary detection — still unconfirmed, no new evidence gathered this session (no real multi-year test file was available; a stakeholder's actual 7yr/10yr pair couldn't be used for this). Wrote `Docs/investigations/2026-10-01-cas-10-year-parsing-discrepancy-handoff.md` so a dedicated session can pick this up with a real file (the user's own sparse 10-year statement) without re-deriving this context.

Corrected stale documentation: `CLAUDE.md`, `session.md`, and this log previously described the 2026-09-29 CAS member detection work and the 2026-09-30 QA fixes as uncommitted/awaiting review; `git log` confirms both are fully committed (`af92286`..`b40f52b` and `1ace61c`..`d52bab6` respectively).

## 2026-10-01 (cont'd) — AWS staging cost-reduction Scenario A applied to real AWS, verified healthy

Executed `Docs/2026-09-29-aws-staging-cost-analysis-and-reduction-plan.md`'s Scenario A end-to-end: `infra/modules/backend`'s Fargate task memory 2048→1024MB, `infra/modules/ecr`'s lifecycle policy gained a keep-last-10-tagged rule, a new `infra/modules/scheduler` extension added 6 EventBridge Scheduler rules (stop RDS/backend/`fck-nat` at 9PM IST, start all 3 at 5AM), an `aws_db_event_subscription` + SNS `ops_alerts` topic (2 email subscriptions) for restart-failure alerting, and a frontend maintenance banner (`frontend/src/components/core/maintenance-banner.tsx`) for the stop window. `terraform apply` run by the user (13 added, 1 changed, 2 destroyed) — Claude authored/validated the Terraform throughout but never ran `apply` itself, per this repo's standing constraint. Result: **$91.78/mo → $68.46/mo, -25%**, inside the $65-70 target with zero external dependency.

Two real bugs found and fixed before the user applied, not just surfaced in review: (1) `infra/envs/staging/terraform.tfvars` was missing `email_delivery_mode` entirely — any full `plan`/`apply` would have silently reverted live SES email delivery back to the `variables.tf` default of `"stub"`, a pre-existing gap unrelated to this session's own changes. Fixed by adding `email_delivery_mode = "ses"` to the gitignored tfvars file (confirmed safe — not a secret, already held `ses_from_email`/`ses_identity_arn`). (2) The bastion showed a forced destroy+recreate in `plan`. The user explicitly asked for a full investigation before any fix — delivered via `aws cloudtrail lookup-events` (zero `ModifyInstanceAttribute`/`DisassociateAddress` events ever touched the instance) plus a live state check (instance `stopped`, `PublicIpAddress: None`): root cause is a Terraform/AWS reporting quirk, not real drift — a stopped EC2 instance always reports no public IP (non-Elastic IPs are released on stop, reassigned fresh on start), which Terraform reads as drift against the config's `associate_public_ip_address = true` and proposes a pointless replace any time `plan` runs while the bastion happens to be stopped (which, under Scenario A's stopped-by-default bastion policy, is most of the time). Fixed by extending the existing `ami`-ignoring `lifecycle` block in `infra/modules/networking/main.tf` to also ignore `associate_public_ip_address`. Verified: plan dropped from "14 to add, 1 to change, 3 to destroy" to "13/1/2" with the bastion pair gone from the diff; post-apply the bastion instance ID, stopped state, and lack of public IP were all unchanged.

Post-apply, ran a full read-only health check across every changed component per the user's explicit request (ECS, ECR, RDS, bastion, all 6 new schedules, SNS, RDS event subscription). One real scare surfaced and resolved during this check: the ECS backend service showed `runningCount: 0` for roughly 6 minutes after the old task-def-5 task stopped, with `aws ecs list-tasks`/`describe-services` returning nothing for the new task-def-6 deployment — looking like a stuck rollout with the deployment circuit breaker disabled (no auto-rollback to explain it either way). Root-caused to two compounding, non-problems: normal Fargate ENI-provisioning/image-pull latency for the new task, and several of the diagnostic queries during the gap having used the wrong ECS service name (`staging-backend` instead of the real `unifolio-staging-backend`), which returns empty rather than erroring. The new task started normally at the 6-minute mark, registered healthy on the ALB target group, and a direct `curl https://<alb-dns>/health` returned `200`. `EMAIL_DELIVERY_MODE=ses` confirmed still correct on the live task definition.

**Scenario B (RDS `db.t4g.small`→`micro`, a further ~$10/mo) was explicitly held off** — see `decisions.md`. Separately, while reading `CLAUDE.md` for this pass, found its "Still open" list calling ADR-006's EventBridge+ECS batch-job Terraform "not yet picked up" was stale: `aws scheduler list-schedules` confirms all 7 of those schedules (`unifolio-staging-job-*`) are `ENABLED` and have been live since an earlier session's `2c360df`/`27e68ee`/`20a825e`. Corrected in `CLAUDE.md`. `Docs/2026-09-29-aws-staging-cost-analysis-and-reduction-plan.md` updated throughout to reflect "applied and verified" rather than "pending your review."

## 2026-10-01 — Consent, onboarding and profile changes (merged from a parallel branch push)

Planned from the user's change list and decided Q1–QF (`Docs/orchestration/2026-10-01-onboarding-consent-profile-changes-plan.md`, `decisions.md`), built in 13 tasks, committed on `feat/enhanced-ui`.

- **Onboarding:** privacy screen removed; name saved at the name step (self member created then, provisional until the first CAS); `/auth/me` gains `self_name` and `consent_outdated`; "Why choose? All of it." goal shortcut; `report_onboarding_goals.py`.
- **Consent:** migration 0022 `consent_records` (append-only triggers, no FKs, truncated IP + HMAC) and `pending_identity_verifications.consent_snapshot`; `/legal/*`; sign-up, upload, CAMS and reactivate consent; placeholder legal texts; `consent_trail.py`.
- **Members:** name and PAN come from the CAS; unlock is relationship only (PAN only if the statement had none); `PATCH /household-members/{id}`; migration 0021 member phone/email. Supersedes L1/L2/L3/L9 and the popup rename.
- **Profile** restructured into 5 sections; OTP email logo removed.
- **Consent IP-hash key derived from PAN_LOOKUP_PEPPER:** Dropped the separate `CONSENT_IP_HMAC_KEY` secret. The IP hash in `consent_records` now uses a key derived from the existing `PAN_LOOKUP_PEPPER` with a fixed label (`unifolio/consent-ip-hmac/v1`), so the release needs no new secret and no `terraform apply`.
- Full backend (1079) and frontend (682) suites, production build, lint, fresh and real-data (dev DB copy) migrations, and a live-API end-to-end run all green; fixed a stale service-level test and a pre-existing conditional-hook crash in `MobileFundDetailSheet.tsx`.

## 2026-10-01 — Member profile completion built (subagent-driven; Tasks 3-10 uncommitted)

Executed `Docs/superpowers/plans/2026-10-01-member-profile-completion.md` (spec `Docs/orchestration/member-profile-completion-map.html`) in 10 tasks via Claude subagents (Codex unavailable; user chose Claude subagents): Opus for Tasks 1-2, Sonnet for 3-10, a Sonnet review gate per task, no-commit mode via dangling snapshot commits. Session stopped after Task 2 and resumed after the user committed Tasks 1-2 (`0a0152a`..`3a4852e`). Tasks 1-2 are committed; the Task 2 fix round and Tasks 3-10 are uncommitted in the working tree (user commits manually). Not deployed.

- **What it does:** removes the detected-member lock; detected members open directly with a profile nudge, a dropdown %, the Complete profile popup (`PUT /household-members/{id}/profile`), a red PAN-on-another-account banner and a second warning on Save; Family and mobile views updated. Name and PAN are saved at Confirm like Self's. Decisions: `decisions.md` 2026-10-01 "Member profile completion". Backend/schema detail: `backend.md`, `database.md` (migration 0023).
- **Controller rulings during execution:** `MemberLockReason` deleted in Task 3, not Task 2; merge only for `origin=cas_detected` sources; the 0023 backfill flags other-account-held rows as `pan_conflict`; "Add data" never reserves a non-Self target's PAN at upload (stored at Confirm; other-account PAN starts the review and becomes `pan_conflict` instead of a 409); `@testing-library/user-event` is not installed so tests use `fireEvent`; "Change in Account Info" navigates to Profile -> Account Info on desktop via a new optional `onChangeInAccountInfo` prop; mobile has no account screen, so the link is pending the final review (render only when the prop is supplied).
- **Not verified:** no test covers "Add data" for a name-only member whose statement PAN another account already holds (the review now starts and Confirm stores it as `pan_conflict`, no 409); migration 0023 Postgres paths (`functional_postgres` skipped, no `TEST_DATABASE_URL`) must run before deploy; no browser visual QA. Per-task tests were the affected files only. Final whole-branch review pending. Deferred minors are in the ledger `.superpowers/sdd/2026-10-01-member-profile-completion/progress.md`.
- Docs updated: PRDs (App Flow, Database Schema), `DEFERRED_FEATURES.md` (`primary_goal` drop now 0024), supersession notes on the 2026-09-29 plan and CAS member detection map.

## 2026-10-05/06 — CAS import fixes: Phases 1–6 + Phase 7 prep built, local gate passed (uncommitted, not deployed)

Goal: the dashboard equals the CAS for every lookback and upload order, then remove the Import Review screen. Plan: `Docs/superpowers/plans/2026-10-06-cas-import-fixes-00-index.md` (p1–p7). Phases 1, 2, 5 and 6A were built by Codex (manual relay); 3, 4, 6B and 7 by the orchestrator when Codex was out of quota. Every phase had a fresh independent reviewer, and every finding was fixed or explicitly accepted. Full per-round record: `Docs/orchestration/cas-import-fixes-handoff.md` (Round log, carry-overs 1–23) and `Docs/orchestration/delegation-log.md`. Numbers: `Docs/orchestration/2026-10-06-cas-import-baseline.md` (sections "After phase 2" … "Phase 7 gate — FINAL").

What changed:
- **Rows:** the CAS opening balance is saved, which was the root cause of the 10-year value gap. Also twin rows, reversal/gift/bonus/segregation types, the folio key, import links, delete-by-links with opening restore, and fund identity from the daily AMFI master by ISIN, with the plan from AMFI and never from the ARN.
- **Numbers:** realised gains for sold funds, XIRR with switch legs, SIPs with the 3-missed rule, twins and the stamp-duty tolerance, monthly history on its own page (bulk, partial months flagged), hero realised/today's gain, honest distributor/TER labels, small display fixes, and review sessions that survive a restart.
- **Phase 7:**
  - a demat-statement error message;
  - `needs_review`/candidates on the preview;
  - unlisted held funds valued at the statement's NAV, with every CAS-only fund keeping its statement prices as its price history;
  - the reclassify script for kept data;
  - PRD-01 v1.5 (FR-5).
  - The review-screen removal (Task 3) was built, then restored the same day on the user's instruction: it waits until after staging and the user's screenshots. The prepared `confirmBody.ts` and `UnidentifiedFundsDialog.tsx` stay, unused.

Gate:
- 46 synthetic scenarios × normal/mfapi-blocked: all funds match, zero review items; the only non-passes are the 2 by-design empty delete orders.
- 2 real CAMS stakeholder statements, alone, in both orders, blocked and repeated: all funds match, zero review items.
- Postgres migration round-trip and `functional_postgres` pass.

Carry-over 16 (p20 XIRR gap) turned out to be a harness bug (a reinvestment ISIN missing from the truth's NAV lookup); the app was not tuned.

Not done (needs staging): a real KFintech statement, the C1–C14 frontend checklist, the staging wipe, the deploy, loading the scheme master once, then (after the user confirms the gate) the review-screen removal and its PRD-01 FR-10 / App-Flow edits.

## 2026-10-07 — Staging bastion: `InsufficientInstanceCapacity` root-caused and fixed (AZ swap)

Follow-on to the 2026-10-01 AWS staging cost-reduction work (bastion stopped-by-default under
Scenario A). Starting the bastion to do staging DB work via the SSM tunnel started failing.

**What went wrong:** `aws ec2 start-instances` failed with `InsufficientInstanceCapacity` —
AWS's own physical capacity shortage in `ap-south-1a`, checked only at start/placement time.
Confirmed via `aws cloudtrail lookup-events` (read-only): ~10+ repeated `StartInstances` calls
from Terraform's internal retry logic, all failing with `Server.InsufficientInstanceCapacity`,
08:28–08:46 UTC. Bumping `bastion_instance_type` from `t4g.nano` to `t4g.micro`
(`infra/modules/networking/variables.tf`) did **not** fix it — a `until aws ec2 start-instances
...; do sleep 30; done` retry loop still failed for 12+ attempts, proving the shortage was
AZ-wide for the whole `t4g` family, not instance-size-specific.

**What fixed it:** moved the bastion's `subnet_id` to the `ap-south-1b` public subnet instead
of `ap-south-1a` (`infra/modules/networking/main.tf`, commented inline with the date and a
note to switch back to `[0]` if `1b` ever becomes the constrained AZ instead). `subnet_id` is
an immutable EC2 attribute, so this is a destroy+create, not an in-place modify — confirmed via
a targeted `-target` plan showing `1 to add, 2 to change, 1 to destroy` before applying. New
instance `i-0b3f2f75cfef2465d` came up `running`/SSM `Online` in under 15 seconds with no
capacity error.

**Bundled in the same targeted apply** (because the new instance ID has to propagate
everywhere the old one was referenced, in the same apply, or these would be left pointing at
the destroyed instance): a `stop_bastion` EventBridge Scheduler entry (9PM IST, stop-only — no
auto-start, since bastion access is on-demand, not a standing schedule) and its IAM statement in
`infra/modules/scheduler/main.tf`, a new `bastion_instance_id` variable
(`infra/modules/scheduler/variables.tf`), and the wiring of
`module.networking.bastion_instance_id` into `module.scheduler` in
`infra/envs/staging/main.tf`.

All changes were applied via `-target`-scoped plan/apply (never full-environment), to keep
them isolated from unrelated pending work already sitting in the staging Terraform directory —
a `scheme_master_daily` scheduled job and a stale SNS subscription recreate — which stay
untouched and unapplied.

Not yet resolved: whether/when to proceed with that separate `scheme_master_daily`/SNS deploy
(a `terraform plan -out=scheme-master.tfplan` was started and interrupted, unrelated to this
fix) — flagged to the user, no decision made yet.

## 2026-10-08 — Analytics speed fix and stamp duty: built, gated, reviewed

Plan `Docs/superpowers/plans/2026-10-07-analytics-speed-and-stamp-duty.md`, built by Codex in three runs over the manual relay, reviewed and finished by Claude (orchestrator; the session moved to another Claude account mid-way, handoff `Docs/orchestration/2026-10-08-claude-session-handoff.md`). Round-by-round record: `Docs/orchestration/analytics-speed-stamp-duty-handoff.md`.

- **Analytics speed:** Analytics never refreshes TER; TER is linked once per scheme to SEBI's scheme code by exact cleaned name (migration 0031, no fuzzy matching: the 7 Oct fuzzy run gave ~1,040 funds another fund's TER); the job is now `ter-daily` at 06:20 IST with `--month`; the 06:00 NAV job warms category peers; stuck-run ceiling 15 minutes with a heartbeat; NSE history fresh within 4 days.
- **Stamp duty:** attached at parse to the same-day purchase it is 0.005% of (several purchases → each gets its own; reversed rows skipped), stored in `transactions.stamp_duty` (migration 0032), counted in every lot replay (`lot_rules.cost_per_unit`) and every cash flow (`lot_rules.paid_amount`). Real "CAS 10 Yr" Total Invested now equals the CAS cost within ₹0.02 (was ₹186 short).
- **Harness/generator (Run 3 + orchestrator):** the generator prints cost including stamp duty and drops a bounced SIP's own lot; new gates (invested = CAS cost per fund, no unattached stamp duty, Analytics never fetches TER, all sections present). Investigation found only test-side causes for every gap (ISIN alias lookup, one-member comparison on family files, 4-dp rounding, hand-made family files, synthetic prices below real NAV history).
- **Reviews:** Run 1 and Run 2 each reviewed by a fresh Opus reviewer with fixes and re-reviews; a final whole-change review approved after fixes (unreadable peer response no longer aborts the warm-up; a codeless TER feed is rejected; harness checks made able to fail).
- **Gates:** 592 affected backend tests pass; Postgres 0030↔0032 round trip and 43 Postgres/migration tests pass; synthetic gate 88/88; real files pass except the known empty statement CP219252880.
- **Deferred by the user:** the peer NAV download fix (Analytics 47 s–3.3 min locally on the largest file, depending on mfapi; staging estimated 1–6 min) and data saved before 0032 (staging is wiped). Logged in `DEFERRED_FEATURES.md`, with the merged-fund opening-cost gap found on the way.
- **Next:** staging deploy with `Docs/orchestration/2026-10-08-staging-deploy-guide-analytics-stamp-duty.md`.


## 2026-10-08 (cont'd) — Blank AMFI plan: fund shown "Regular · unverified"

Found on staging after the deploy: Motilal Oswal Midcap Fund showed "Regular · unverified" with the name "Motilal Oswal Midcap Fund - -", while Motilal Oswal Nifty Midcap 150 Index Fund in the same portfolio showed Direct. Cause, confirmed against AMFI's live NAVAll.txt (7 Oct NAVs): AMFI leaves the Plan and Option columns blank for all four Midcap Fund rows (533 current rows in the file; 264 are single-plan ETFs, ~269 others), so `schemes.plan_type` is null and the name has no plan word; the Direct-sibling NAV check can't run because no sibling is marked Direct either. The statement's own plan was parsed but ignored once AMFI matched. NAV evidence (₹116.40 vs the sibling growth plan's ₹100.65) suggests the holding is actually Direct.

- **Fixed (orchestrator-direct, small):** `identify.py` uses the statement's plan (name + ARN rule, FR-5) when AMFI's is blank, verified; still "regular, unverified" when the statement is unclear too. `confirm_people.py`: a hand-picked blank-plan fund took "regular" *and verified*; now the statement's plan, verified only when known. `scheme_universe.py`: names skip blank parts.
- **Tests:** 5 new (identify ×3, scheme universe, confirm override ×2); 84 pass across the 4 affected files; the override test failed on the old code. Independent code review: no issues.
- **Not fixed:** TER for blank-plan schemes (the TER job uses the scheme's own plan, still null). Already-imported funds keep the old label until re-imported; names update at the next scheme-master refresh.
- **Explainer for the manager:** artifact "Motilal Midcap Plan Mix-up".
- **Deployed to staging** the same day (backend image only, rolling restart; rollback image tag `pre-blank-plan-fix`); the user confirmed it working.

## 2026-10-08 (cont'd) — Phase 7: the Import Review screen removed

The user confirmed the Phase 7 gate (real CAMS and KFintech statements on staging, Import health all ✓, C1–C14). Task 3 built by Codex over the manual relay (handoff `Docs/orchestration/review-screen-removal-handoff.md`): the review stage, `ReviewTable`, `MemberRibbonReview`, `ImportConfirmed` and mobile `MobileReviewView` removed; `useImportFlow` stages now end in `fallback`/`confirming`; `useImportOrchestration` auto-confirms once per preview with the prepared `buildConfirmBody` and shows `UnidentifiedFundsDialog` when `needs_review`; success calls `onDone`/`onNavigateDashboard` with the notice. Codex's self-review fixed a fallback-retry bug. Orchestrator: 132 affected tests pass in WSL, `tsc -b` clean; Opus review found one Important issue (onboarding stuck on the spinner when `updateMe` fails after a successful import), fixed test-first in `SoloCasUpload.tsx` (+ `SoloCasUpload.finish.test.tsx`), scoped re-review CLOSED; dead `ctaLabel` prop removed. Docs: PRD-01 v1.6, App-Flow v1.5, decisions.md. Next: the user reviews the PRD-01 change, commits, then Task 6 (staging: wipe only with the user's OK, deploy, one full upload through the new flow).

## 2026-10-09/10 — Attribute 04: fund-manager allocation built, onboarded across 55 AMCs, closed out

Plan `Docs/superpowers/plans/2026-10-09-attribute-04-fund-manager-allocation.md` (rulings Runs 1–9 at the top); round log `Docs/orchestration/a04-fund-manager-handoff.md`. Built by Codex over the manual relay in 9 runs; every run re-verified by the orchestrator in WSL (Codex's Windows sandbox couldn't run the async tests from Run 6 on), live coverage reproduced per AMC, independently reviewed, fixes made test-first.
- **Runs 1–2:** `scheme_fund_managers` (migration 0035), per-AMC readers, the 55-entry source registry, matching (ISIN → exact → fuzzy within category, ambiguity refused), import with current-month checks, the monthly job + `FUND_MANAGER_ALERT` metric filter/alarm, household aggregation with a 3-month window, the manual-import CLI, and the frontend cards (desktop, mobile, PDF).
- **Runs 3–9 (onboarding):** 40 AMCs automatic (each AMC's own public download request where pages are JS-built), 10 MANUAL (HDFC, Kotak, Axis, ICICI Prudential, ITI, Trust, WhiteOak, Bandhan, Invesco, JM Financial — sites block scripts; readers built from the user's files), 5 off (Bajaj, AlphaGrep, IL&FS, Lakshya, Monarch — no current factsheet). Machinery added on the way: multi-file months, per-AMC date patterns, word-box readers, `min_schemes`, whole-file date scan, same-fund ties on canonical category, many date formats, U+FFFE cleanup. User decisions: manual import for the blocked AMCs; no access-control workarounds; Mahindra's encrypted public list stays automatic.
- **Close-out (10 Oct):** the real monthly job against local Postgres processed 40/40 AMCs, 1,424 funds matched, no alerts — but peaked at **2.9 GB** from unclosed PDFium handles; fixed (`9c64f77`, now 0.94 GB, under 2 minutes) and the job given 2 GB in Terraform (`5f2f779`; HSBC alone holds ~600 MB). The manual CLI verified on all 10 real files against Postgres (HDFC 53 active, Kotak 112, ICICI 156, Axis 88, Bandhan 87, Invesco 44, WhiteOak 22, ITI 20, JM 17, Trust 11). Synthetic gate 8/8 with new A04 checks (manager membership, roles, household values, card totals and order): 0 mismatches; Analytics 8.5–28.6 s.
- **Open, Priority 1 (before 10 Nov 2026):** the access gaps — `DEFERRED_FEATURES.md` top section; `Docs/orchestration/subproject1-execution/a04-factsheet-access-gaps.html`.

## 2026-10-09/10 — Sub-project 1: attributes 14, 12, 09 and 11 built and closed out

All built by Codex over the manual relay, each run re-verified by the orchestrator in WSL, independently reviewed, fixes made test-first. Plans: `Docs/superpowers/plans/2026-10-0{8,9}-attribute-*.md` (rulings at the top). Round logs: `Docs/orchestration/a14-*`, `a12-*`, `a09-*`, `a11-*-handoff.md`. Attribute 04 has its own entry above.
- **A14 Investment & withdrawal** (`bf0e6cd`, `976bb2f`, `b3dc253`, `6a50f18`, `ecd9760`): money in vs out per period as an 8th analytics section; gifts excluded from Gain at transfer value (`gifts_net`, user ruling); a fund in two folios uses the earliest statement end. Run 2 review fixes (chart bars reachable by assistive tech, a 12 px minimum slot per period with horizontal scroll, a failed section shows a message instead of a skeleton) are in `ecd9760`. Synthetic gate `a14_checks`: 0 mismatches.
- **A12 Benchmark TRI** (`b926933`, `0658f75`, `56f830b`): `benchmark_index_history.return_type` (migration 0033); the daily benchmark job fetches TRI from 1990 and price for 10 years; benchmark comparisons use TRI only, never price. Postgres 0032↔0033 round trip clean.
- **A09 Fund ranking** (`24a1f74`, `02d5a2c`, `a5d1919`, `94bc9d0`, `6c36e0c`, `9fe1174`): 5-factor composite rank within the canonical SEBI category (migration 0034: `scheme_rankings`, `ranking_weights`), one series per fund, live funds only (NAV in 30 days), `GET /analytics/funds/{id}/ranking`, the section on desktop/mobile/PDF. The category merge first slowed the Scorer to 150–200 s; fixed by scoring against one series per fund and the live-fund rule. Synthetic gate 8/8, `a09_checks` 0 mismatches.
- **A11 Scenario simulator** (`4ee7afe`…`af7c5e0` backend, `9ce9c1b`…`0290c76` frontend): 34 scenarios + 45 hypothetical assumptions (migrations 0036/0037), engine (start = close before the window, end on/before, 7-day bounds; multi-phase headline = whole event; canonical-category averages over one Growth series per fund; serve-time proxy for new funds; Franklin freeze), `GET /scenarios` and `/scenarios/{id}/results` (hypotheticals hidden unless `SCENARIO_HYPOTHETICALS_ENABLED`), daily recompute of ongoing scenarios in the NAV job, the Scenarios screen. User rulings: start NAV and multi-phase headline. **Close-out (10 Oct):** the local NAV-backfill trial aborted on IL&FS IDF units (NAV ₹21.86 lakh overflowed NUMERIC(10,4)) → migration 0038 widens `nav_history.nav` to (14,4) (`4ed4d12`); trial then 300/300 funds, 0 failures, ~27 s per 150 funds, 183 MB. Full local backfill 14,056 funds in 51 min (225 MB, 0.6% single-fund failures); all 29 scenarios computed in 81 s, 0 failed; three pre-2006 scenarios have no fund data (mfapi starts 2006; open decision). On the R2 synthetic couple: COVID −28.5% vs Nifty 50 TRI −30.2%, 2024 election −5.71% vs −5.86%, GFC −54.9% (all estimated).
- **Shared:** a parallel A04/A11 run in one working tree worked by committing only each run's files; Codex's Windows sandbox can't run asyncio tests, so every final run was done in WSL.

## 2026-10-12 — Sub-project 2 (look-through engine): AMC reconciliation closed, Playwright go/no-go decided, attributes 02/06/10/13/15 speced/planned/mapped

Continues the cross-session sub-project 2 work from 2026-10-09/10 (second account/session
picking up cold after a credit cutoff mid-reconciliation). Research/docs only — no backend
code written; `backend/` still has no `portfolio_disclosure_*`/`lookthrough.py`/`overlap.py`
module.

- **AMC reconciliation closed.** All 16 AMCs the 2026-10-10 ingestion plan had deferred as
  "needs Playwright" were individually live-rechecked (`curl` + Playwright network traces).
  Final tally: 13 need no Playwright at all in production (each needed exactly one Playwright
  trace to discover the real current JSON/AJAX endpoint — prior documented URLs had gone stale
  since the 2026-10-09 spike — then plain `curl`/`httpx` replay thereafter: Trust Mutual Fund
  via `POST /api/api/Trust/GetData`, SBI via `POST /ajaxcall/CMS/GetSchemePortfolioSheetsQS`,
  Bank of India via `AjaxService.asmx/GetDocuments`, Taurus plain-GET replayable (Half-Yearly-
  only cadence confirmed), Mirae Asset via `/downloads/portfolio` → `AjaxService/
  GetDownloadsData` (soft-404 traps avoided), LIC via a `/downloads/portfolio-filter-options` +
  `/downloads/portfolio-files` chain, Axis via a fully public `/cms/token` → `/cms/get-scheme-
  documents` chain with zero auth anywhere, Aditya Birla Sun Life via `/postlogin/CustomApi/
  Resources/FactsheetAccordionById`, plus 5 from earlier passes). 1 (HSBC) genuinely needs a
  browser — no replayable JSON API found underneath its WAF. 2 (Invesco, ITI) are confirmed
  `BOT_BLOCKED` via Cloudflare/WAF challenge even against a real headless-Chromium browser. 1
  (JM Financial) is a confirmed encrypted-API false positive (AES ciphertext, not a real
  workbook), already on the manual-fetch list for an unrelated reason. Full evidence:
  `Docs/analytics/investigations/2026-10-12-amc-disclosure-reconciliation-fifth-pass.md`.
- **Two notable adapter-registry findings surfaced during reconciliation, now documented for
  the eventual implementation:** Axis's entire chain (including discovery) is curl-replayable
  because its bearer-token endpoint is itself public/unauthenticated. Aditya Birla Sun Life's
  JSON API returns a `pdfUrl` pointing at a genuinely dead/retired CDN host
  (`abcscprod.azureedge.net`, confirmed `NXDOMAIN` via 3 independent public resolvers querying
  Azure's own authoritative nameservers) — the adapter must rewrite that host to the live main
  domain (`mutualfund.adityabirlacapital.com`), which serves the identical `/-/media/...` path.
- **Playwright go/no-go: decided no.** Not adopted as a production runtime dependency for one
  AMC; HSBC instead becomes a 16th standing-manual-fetch AMC (joining Edelweiss, Mahindra
  Manulife, JM Financial). Recorded in `decisions.md`'s "2026-10-12" entry.
- **Doc corrections made to match the fifth-pass findings** (nothing silently rewritten, every
  change inline-annotated): the 2026-10-09 consolidated spike doc's headline tier-counts table
  and master tier table; the 2026-10-10 ingestion plan's "Open items carried forward" section
  (`JSON_API` bucket grown from 14→22 AMCs, the stale 16-AMC "needs Playwright" bullet struck
  through with a breakdown of where each of the 16 actually landed) and its "Scope note"
  section.
- **Attributes 02/06/10/13/15 (cap allocation, overall stock holdings, overlap, asset
  allocation, P/E-P/B) — the engine's own consumers — now have a spec, implementation plan,
  and visual-map, written as one consolidated triad rather than five separate ones** (all five
  are explicitly scoped together in the 2026-10-09 engine spec as reading from the same
  look-through table): `Docs/analytics/2026-10-12-attributes-02-06-10-13-15-lookthrough-
  consumers-spec.md`, `.../plans/2026-10-12-...-plan.md`,
  `.../artifacts/2026-10-12-...-visual-map.html`. Core design: one shared
  `compute_lookthrough_table()` (fund weight × stock weight, grouped by ISIN, never by name)
  feeds attribute 06 directly and attributes 02/13/15 after further aggregation; attribute 10's
  fund-pair overlap half reads raw `scheme_holdings` instead (fund-level %, a different grain
  from the client-level table — explicitly flagged as the easy mistake to avoid). Two items
  flagged genuinely open rather than resolved: (1) a proposed `asset_type` enum-column amendment
  to the already-written 2026-10-09 engine spec's `scheme_holdings` table, needed by attribute
  13 and attribute 15's equity-only exclusion — needs the user's sign-off since it changes a
  previously-agreed schema; (2) attribute 15's exact NSE/BSE fetch mechanism for per-stock P/E,
  P/B — the sourcing *strategy* was already decided 2026-10-06 (free, in-house, no paid vendor),
  but no specific page/endpoint has been live-verified, unlike every AMC URL elsewhere in this
  sub-project; scheduled as that attribute's first implementation task (a feasibility spike),
  not guessed.
- **Nothing implemented.** Per the user's standing instruction for this entire sub-project
  ("this is not an implementation session"), all of the above is planning/documentation only.
  `session.md`'s "Latest (2026-10-12)" section carries the compact pointer version of this
  entry.

## 2026-10-13 — Sub-project 2 sixth-pass audit closed; attribute 15's P/E/P/B data source resolved (one confirmed, by-design gap)

A zero-open-items audit of the full look-through ingestion system, continuing straight from
2026-10-12's two explicitly-left-open items.

- **Audit found and fixed three real inconsistencies** across the engine spec and the
  2026-10-09 spike-consolidated doc: Kotak Mahindra resolved `BOT_BLOCKED` → `STATIC_REGEX` (a
  Wayback CDX query against its CDN found the live current disclosure path); AlphaGrep's
  previously-flagged "possibly broken" URL was a false alarm — the real template uses a 2-digit
  year-range format (`FY-{YY}-{YY+1}`) that this project's own docs had recorded as 4-digit;
  HSBC's row in the spike-consolidated doc had a self-contradictory tier label, corrected to
  match its already-decided `Standing manual-fetch` status. Final, now mutually consistent AMC
  count across both documents: 44 machine-fetchable + 1 (WhiteOak) research-gap + 6
  standing-manual-fetch + 1 different-grain (Monarch) + 5 expected-no-content = 57. Both
  `Docs/analytics/investigations/2026-10-09-amc-portfolio-disclosure-spike-consolidated.md`
  (new "Sixth pass" section) and
  `Docs/analytics/plans/2026-10-10-sub-project-2-lookthrough-ingestion-plan.md` updated to
  match.
- **`asset_type` amendment sign-off resolved** — Ayush approved the enum-column addition to
  `scheme_holdings` (see `decisions.md`); written into the engine spec's `SchemeHolding` model.
  The "needs sign-off" framing removed from the consumer spec (§7.1, §9) and plan (Task 1).
- **Attribute 15's P/E/P/B data-source question resolved**, per the two-step instruction
  (confirm `scheme_holdings` can't derive it itself; if not, live-verify a real free NSE/BSE
  source, never guess). Full write-up:
  `Docs/analytics/investigations/2026-10-13-attribute-15-pe-pb-sourcing-feasibility.md`.
  - Confirmed `scheme_holdings`' SEBI-mandated fields (no EPS/book-value/price field exists in
    that regulatory format) cannot derive P/E or P/B.
  - **Index-level P/E, P/B, Div Yield (Nifty 50/500 benchmark): resolved, free** —
    `niftyindices.com/BackPage/getpepbHistoricaldataDBtoString`, a sibling to the price-return
    and TRI endpoints `nse_indices_client.py` already uses; same request shape, same trading
    names, confirmed live for both indices with real September 2026 data.
  - **Per-stock P/E: resolved, free** — NSE's own daily
    `nsearchives.nseindia.com/content/equities/peDetail/PE_<DDMMYY>.csv` report, its exact
    file-naming convention discovered via NSE's `/api/daily-reports?key=CM` JSON feed and
    confirmed live via direct download.
  - **Symbol→ISIN mapping (required since the P/E file is symbol-keyed but the look-through
    engine's join key is ISIN): resolved, free** — NSE's own "CM - MII - Security File"
    (`content/cm/NSE_CM_security_<DDMMYYYY>.csv.gz`), filtered to `SctySrs == "EQ"` rows;
    spot-checked against RELIANCE (`INE002A01018`) and THERMAX (`INE152A01029`), both correct.
  - **Per-stock P/B: no free source found — a confirmed dead end, not an unexplored gap.**
    Live-checked: NSE's full 37-report daily-reports catalog has no P/B report; three plausible
    sibling file-path guesses by analogy to the P/E file's naming (`pbDetail/`, `pbrDetail/`)
    all returned HTTP 404; BSE's per-stock ratios page is a client-side Angular SPA whose
    backing API (`api.bseindia.com`) returned HTTP 403 (bot-blocked, same pattern as NSE's
    dynamic JSON endpoints).
  - Consumer spec §7.2 and plan Task 6 updated: portfolio P/E look-through is now fully
    buildable and scoped; per-stock P/B is flagged as a product-scope decision still needed
    from Ayush (ship P/E-only for the MVP and defer P/B to `DEFERRED_FEATURES.md`, recommended,
    vs. holding the attribute back for a paid data source) — not decided unilaterally.
- **Nothing implemented**, same standing instruction as 2026-10-12's entry above.
  `session.md`'s "Latest (2026-10-13)" section carries the compact pointer version of this
  entry.

## 2026-10-13 (cont'd) — Attribute 15's per-stock P/B revised: not a dead end, fully resolved; sub-project 2 attribute-coverage audit started

Ayush rejected the entry above's "per-stock P/B is a confirmed dead end, ship P/E-only"
recommendation, correctly pointing out it had only checked NSE and BSE: *"nothing should move
to deferred feature until we 110% sure about it"*, naming three untried sources (screener.in,
Yahoo Finance API, Google Finance API). He also flagged that sub-project 2's remaining
attributes' specs/plans/artifacts didn't feel fully done and asked for a completeness audit.

- **Per-stock P/B: reversed from dead-end to resolved.** All three named sources live-checked:
  - **Yahoo Finance's unofficial `quoteSummary` API** — plain unauthenticated calls return HTTP
    401 ("Invalid Crumb"), but the standard cookie+crumb handshake (`GET fc.yahoo.com` → `GET
    finance.yahoo.com/quote/<SYM>` → `GET query2.finance.yahoo.com/v1/test/getcrumb`, all sharing
    one cookie jar, then `GET query2.finance.yahoo.com/v10/finance/quoteSummary/<SYM>.NS?
    modules=defaultKeyStatistics,summaryDetail&crumb=<crumb>`) returns HTTP 200 with real
    `trailingPE`/`forwardPE` and `priceToBook`/`bookValue`/`trailingEps` — both P/E and P/B in one
    call, keyed by the same `.NS` symbol the NSE security-master mapping already solves for.
    Scale-tested across 14-15 sequential requests (RELIANCE, THERMAX, TCS, INFY, HDFCBANK) with
    one cookie/crumb pair — no HTTP 429, no blocking; the one failure (HDFC.NS → 404) is an
    expected stale ticker (HDFC Ltd merged into HDFC Bank in 2023), not a rate-limit signal.
  - **screener.in** — `https://www.screener.in/company/<SYMBOL>/consolidated/` is plain
    server-rendered HTML (not a JS shell), with real `Stock P/E`, `Book Value`, `Current Price`
    figures directly parseable. robots.txt disallows `/user/*` and query-param/report paths but
    not this path. Terms are at `/guides/terms/` (generic materials-license language, a
    ToS consideration for Ayush, not a technical blocker).
  - **Cross-validation:** Yahoo's RELIANCE figures (trailingPE 21.10, bookValue ₹668.04,
    priceToBook 1.74) matched screener.in's independently-sourced RELIANCE figures (Stock P/E
    21.1, Book Value ₹668, Current Price ₹1,164 → computed P/B 1.74) almost exactly — evidence
    neither source is a stale-cache fluke.
  - **Google Finance checked and correctly ruled out** — the old public API
    (`google.com/finance/info?q=...`) 302-redirects, retired ~2012; the current quote page
    (`google.com/finance/quote/<SYM>:NSE`) is server-rendered with a P/E field but no
    book-value/P/B field anywhere, confirmed via direct string search on the raw HTML.
  - Investigation doc rewritten with a "Revision note (same day)" explicitly stating the
    self-correction rather than silently rewriting the earlier conclusion; title changed from
    "...Fully Resolved Except One Genuine Gap" to "...Fully Resolved". Consumer spec §7.2 and
    plan Task 6 rewritten to drop all "P/E-only"/"defer P/B" framing — `pb_ratio` now sourced
    from Yahoo Finance (primary) with screener.in as a documented fallback/cross-check, joined
    via the same NSE symbol→ISIN mapping already used for P/E; the harmonic-mean formula test
    now exercises both ratios with real fetched data, no placeholder path.
  - **Nothing goes into `DEFERRED_FEATURES.md`.** The one remaining item is a non-blocking
    ToS-sourcing-preference call for Ayush (which free source to prefer for P/B — NSE has none
    either way), not a feasibility question.
- **Sub-project 2 attribute-coverage audit, closed** (the second half of Ayush's instruction).
  Verified the consumer spec, plan, and visual-map each already have a dedicated section per
  attribute (02/06/10/13/15) — contrary to Ayush's stated belief this wasn't done. Added a
  `.callout.ok` CSS rule to the visual-map (using its already-defined but previously-unused
  `--good`/`--good-bg` tokens) so resolved open items render visually distinct from open ones.
  A full-text scan (not just headings) found exactly one genuine gap: the visual-map's item 4,
  AMFI's semi-annual market-cap list exact URL/format (attribute 02's classification source).
  **Live-verified:** current period at `https://portal.amfiindia.com/spages/
  AverageMarketCapitalization30Jun2026.pdf` (HTTP 200, 1.1MB real PDF, parsed with `pypdf` —
  columns are `Sr. No.` (= AMFI rank), `Company name`, `ISIN`, BSE/NSE/MSEI market-cap figures,
  and `Categorization as per SEBI Circular dated Oct 6, 2017` already reading `Large Cap`/`Mid
  Cap`/`Small Cap` — exactly the 4 fields `market_cap_classifications (isin, rank, bucket,
  effective_date)` needs, no further transformation). A 2023-period file at the older
  `www.amfiindia.com/Themes/Theme1/downloads/AverageMarketCapitalizationoflistedcompanies
  duringthesixmonthsended30Jun2023.pdf`-style host/name was also found via search, confirming
  the convention has drifted at least twice (verbose name circa 2017-2025 on `www.amfiindia.com`,
  shorter name from 2026 on `portal.amfiindia.com/spages/`) — flagged in spec §4/plan Task 3 as
  needing the same twice-yearly manual re-verification as a `STATIC_REGEX` AMC entry, not a
  hardcoded-forever URL. The engine-level ingestion plan's own "Open items carried forward"
  section was checked and left as-is — each entry there is already an individually justified,
  named technical gap (research-gap AMCs, confirmed bot-blocks, genuine filename ambiguity), not
  an unexplored "TBD," so nothing needed fixing.
- **Both halves of Ayush's instruction are now done.** Attribute 15's P/E/P/B is 110%-verified
  feasible with nothing deferred; sub-project 2's remaining attributes have complete
  spec/plan/visual-map coverage with zero open items left. Both plans are ready to hand to an
  implementation session.
- **Nothing implemented**, same standing instruction.

## 2026-10-13 (cont'd) — Integration architecture speced, ToS call finalized, AMFI re-verified to 110%

Ayush's same-day follow-up on the above: proving a data source exists isn't proving it
integrates, the AMFI check wasn't deep enough ("I need this to be 110% accurate"), fix the
ToS-sourcing call now instead of leaving it open, and do a second/third full-text pass across
all 5 consumer attributes' docs so the only thing left for an intern is implementation and
testing. **Still research/docs only, nothing implemented.**

- **Integration architecture — new spec §7.3, `stock_master` as a second independent
  pipeline.** `stock_fundamentals_client.py` joins the same frozen-`*RefreshResult` family as
  `amfi_ter_client.py`, but is explicitly **not** a stage of the 5-stage AMC disclosure engine
  (Locate/Fetch/Parse/Normalize/Write) — the two pipelines never block each other;
  `valuation.py` is the only place they intersect, joining `LookthroughTable` and
  `stock_master` by ISIN at read time. ISIN universe to fetch = the union of every distinct
  non-`NULL` ISIN in `scheme_holdings` and the Nifty 50 + Nifty 500 constituent ISINs
  (needed for attribute 15's own benchmark comparison and attribute 02's cap-split comparison
  strip), re-derived every refresh, not hardcoded. Refresh cadence is **daily**, independent of
  any AMC's disclosure cadence — price moves daily even though EPS/book-value only changes
  quarterly — which gives attribute 15 a **second, independent cache-invalidation trigger** (a
  fresher `stock_master.as_of_date`) alongside the existing `disclosure_batches`-reaches-
  `WRITTEN` trigger the other 4 attributes share; either independently invalidates the cache,
  not merged into one. Fetch-mechanics-at-scale: one Yahoo cookie+crumb handshake reused across
  the whole daily run, a mid-run re-handshake if a request starts 401-ing again (crumb gone
  stale) rather than a full-run abort, one bad ISIN never fails the batch. Full 4-step
  per-ISIN symbol-resolution fallback chain specified: (1) ISIN → NSE trading symbol via the
  existing security-master mapping; (2) found → NSE `peDetail` CSV for `pe_ratio` + Yahoo
  `quoteSummary` for `pb_ratio`; (3) ISIN absent from NSE's current security master entirely
  (delisted/merged, e.g. HDFC Ltd's 2023 merger into HDFC Bank) → both `NULL` + footnote, no
  BSE-symbol fallback attempted (BSE's per-stock API is already confirmed bot-blocked — a
  stated, accepted gap, not an unexplored one); (4) symbol found but Yahoo 404s/omits
  `priceToBook` → screener.in fallback for that one ISIN only; (5) both fail → `pb_ratio NULL`
  + footnote, same mechanism as P/E's loss-making-stock exclusion. Propagated into plan Task
  6's new TDD checkboxes (ISIN-universe-union test, 4-branch fallback test, handshake-reuse-
  and-restale test, pipeline-independence test, dual-trigger cache-invalidation test) and the
  visual-map's attribute-15 callout + shared-data-flow table row.
- **ToS-sourcing-preference, finalized rather than left open.** NSE's own data preferred
  wherever it covers the need (all of P/E, the symbol→ISIN mapping, both index-level figures).
  For P/B specifically (the one metric NSE doesn't publish): Yahoo's `quoteSummary` is the live
  runtime primary; screener.in is a per-ISIN fallback only, never fetched in parallel for every
  stock, to minimize exposure to screener.in's more explicit commercial-use restriction; both
  failing → `NULL` + disclosed footnote. Stays within the existing "no paid vendor" rule — a
  licensed vendor remains a future option, not a prerequisite. Written into `decisions.md` (an
  addendum to the existing attribute 15 entry), spec §7.2, plan Task 6, and visual-map open
  item 2 — none of these still read "flagged for Ayush" or "non-blocking question remains."
- **AMFI market-cap list re-verified to the 110% standard Ayush demanded.** The earlier
  HTTP-200-plus-plausible-columns check wasn't deep enough. Parsed the full 48-page PDF with
  `pypdf` (not just skimmed the first page) — 5,427 data rows, the entire listed-companies
  universe, not just top-500 — and regex-extracted every row's `(rank, category)` pair: exactly
  3 category-transition points across all 5,427 rows, at rank 1→Large Cap, 101→Mid Cap,
  251→Small Cap, an exact structural match to the SEBI circular's own Large=1-100/
  Mid=101-250/Small=251+ definition — strong confirmation (not a coincidence a malformed parse
  could produce) that row order genuinely is AMFI's rank and the categorization column is
  genuinely correct. `robots.txt` checked on both `www.amfiindia.com` (disallows only
  `/admin/`/`/login/`/`/search/`, none relevant to this path) and `portal.amfiindia.com` (404,
  no restriction declared). **One real caveat found and disclosed, not hidden:** AMFI's own
  terms-of-use page (`https://www.amfiindia.com/terms-of-use`) restricts site use to "personal
  and non-commercial use only" — more explicit language than previously assumed. Decision:
  proceed anyway, caveat recorded — consistent with the project's own already-live,
  already-accepted practice of using AMFI data in production elsewhere
  (`amfi_ter_client.py`/`amfi_aaum_client.py`). Written into spec §4, plan Task 3, visual-map
  open item 4, and a new `decisions.md` bullet for attribute 02.
- **Second/third full-text pass over all 5 attributes' docs: done, zero further gaps found.**
  Re-read the visual-map's attribute 02/06/10/13 sections and the plan's Tasks 2, 4, 5 in full
  (not just headings or the sections touched by the two items above) — no stale
  cross-references or unspecified details found. Grepped spec/plan/visual-map for TBD/open-
  question/unresolved/non-blocking language; the only remaining hits are closed-status prose
  describing an already-accepted, already-resolved caveat, not a live open item.
- **Bar met: ready to hand to an intern.** All 5 consumer attributes' docs (spec, plan,
  visual-map) now specify the integration mechanism, not just data-source feasibility, with
  zero remaining research or design decisions — per Ayush's explicit end state, "the only thing
  left to do is implementation and testing."
- **Nothing implemented**, same standing instruction.

## 2026-10-19/20 — Chandra Tripathi XIRR/opening-cost fix: Root Cause B trigger redesigned on real data; intern pre-execution review then found 3 real gaps this session had missed

**2026-10-19.** Root Cause A (opening-cost plausibility guard,
`backend/app/services/import_/opening_balance.py`) and Root Cause B (XIRR opening-balance-
dating disclaimer, `backend/app/services/dashboard/xirr.py`) both have standing, previously-
written plans (`Docs/superpowers/plans/2026-10-19-root-cause-a-...md` /
`...root-cause-b-...md`, plus matching HTML artifacts). Ayush raised a concern that the old
Root Cause B trigger (`opening_cost_share >= 25%` AND XIRR > 35%) might miss cases where a
CAS statement's window is much shorter than the fund's true holding age. A 27-scenario
empirical grid, run against the real production `portfolio_xirr()` code (not hand-estimated),
disproved that specific concern (distortion depends on the true-age/window-age *ratio*, not
the window's absolute length — a 40yr lot in a 20yr window behaves identically to a 20yr lot
in a 10yr window) but found a different, real blind spot: a 10–24% opening-lineage cost share
can still swing a blended XIRR 2–8x past its true rate, silently, because the terminal value
split is by units/value, not cost — a cheap, ancient lot can dominate value growth on a small
slice of cost. Fix: drop the share floor; fire only when the headline rate exceeds 35% AND
`alt_rate` (recomputed excluding the undated opening lineage, already being computed anyway)
is `<= 35%` or `None`. Verified a strict improvement across all 27+4 scenarios: identical to
the old design everywhere except the 4 previously-missed cases, zero new false positives.
Also locked in, per Ayush's explicit override: the frontend disclaimer popup ships to
everyone immediately, no staged rollout (no real users yet, DB routinely wiped). Both the
plan `.md` and its HTML artifact were updated to match and committed (`a15f07c`). No code
touched — both plans remain documentation-only, per the standing rule that Root Cause A and
B's actual fixes land together, only once both are fully signed off.

**2026-10-20.** The intern's own separate Claude Code session, reading both plans before
executing them, raised three questions neither plan had resolved:
1. Should `test_real_check.py` (the real-CAS gate, run against the real
   `Docs/CAS Files/chandra.pdf`, password `MF@12345`) be re-run as a named acceptance step
   after implementation? Confirmed from the harness code: NAV data is self-contained via the
   `MASTER_FILE` snapshot env var, but `enrich.py`'s `MfApiClient` makes real
   `https://api.mfapi.in` calls (24h disk cache) — a genuine external dependency the plans
   never named as an acceptance requirement.
2. A real correctness gap in Root Cause B: `_opening_lineage()`'s FIFO replay runs on
   `transaction_rows`, filtered to `_FUND_RELEVANT_TYPES` for XIRR cash-flow purposes — a
   filter that excludes `DIVIDEND_REINVEST`/`BONUS`/`SEGREGATION`, all genuine
   `LOT_ADDING_TYPES` in `lot_rules.py`. Since `REVERSAL` (unlike every other consuming
   transaction type) consumes newest-lot-first, a missing newer lot could make the lineage
   tracer misattribute units/cost to the opening lot. Confirmed real by reading
   `lot_rules.py` directly, not a hypothetical edge case.
3. Root Cause A's plan doc has two genuine test-count arithmetic errors: "14/14 (10+1 flip)"
   doesn't sum to 14 (should be 11), and "15/15 (11+1+3)" omits Task 4's fourth new test
   despite the same sentence claiming Tasks 2–4 are all applied (should be 16/16 if Task 4
   ships).

Asked directly whether both plans were still "110% solid" after claiming full sign-off —
answer: no. Items 2 and 3 were real misses in this session's own prior work (a correctness
bug reused from a pre-filtered variable without re-auditing it for the new purpose; plain
arithmetic errors), not natural clarifying questions an implementer would otherwise raise.
Item 1 was a real gap in the acceptance criteria.

**Second-order catch, same failure pattern, one level down:** this session's own proposed
one-line fix for item 2 (widen the query's type filter) was itself under-audited — it missed
that `current_transactions` has no independent type filter and silently relies on the query
already being narrow, so widening it naively would have let the three newly-included types
flow into `current_transactions` and corrupt `current_holdings_xirr` for any household with
such a row. The intern's Claude Code session caught this during its own implementation-prep
pass. Agreed fix, handed back to that session to apply: add
`_LINEAGE_QUERY_TYPES = _FUND_RELEVANT_TYPES | {DIVIDEND_REINVEST, BONUS, SEGREGATION}` for
the query only; explicitly re-filter `transactions` and `current_transactions` back to
`_FUND_RELEVANT_TYPES` in Python; only `_opening_lineage_by_scheme` sees the unfiltered rows;
add tests proving `current_holdings_xirr` is unchanged by a bonus/reinvest row and that a
`REVERSAL` after one attributes to the correct lot.

**Status: still documentation only.** No edits were made to either plan doc, to
`opening_balance.py`, or to `xirr.py` from this side — per the standing rule, the intern's
own Claude Code session (a separate checkout) applies the three fixes above to the plan docs
and then executes both root causes together. What this will and won't fix for the real
Chandra Tripathi household, once implemented: Root Cause A should correct the portfolio's
total value/cost basis (the opening-lot plausibility guard); Root Cause B does **not** make
the headline lifetime XIRR numerically "correct" — the true purchase dates behind an old
opening balance are unknowable from a CAS statement alone — it makes a probably-distorted
number visibly flagged instead of silently wrong. The real-file gate
(`test_real_check.py` against `chandra.pdf`) is the step that actually proves both land
correctly on the real data, and has not been re-run since either plan last changed.
Lesson captured to memory: [[feedback_planning_closing_audit_discipline]].

## 2026-10-20 (later) — Chandra Tripathi fix built and put up as PR #8; reviews found five real bugs, all fixed test-first

Built Root Cause A (`opening_balance.py`), Root Cause B backend and frontend in a separate worktree/branch (`fix/chandra-opening-cost-xirr-disclaimer`) so the parallel analytics runs on `feat/leapswitch-staging` were never disturbed; subagent-driven (one track per root cause plus the frontend), commits per track. Real bugs found and fixed: the lineage query omitted lot-adding rows and, naively widened, would have leaked them into `current_holdings_xirr` as cash inflows (found while answering the intern's questions); same-day sells replayed before buys (independent review); `MANUAL` opening balances wrongly dropped from `alt_xirr` (independent review); redemption proceeds taken from the opening lot left in `alt_xirr` without their cost (manager's PR review); popup reopening after a scope switch (PR review). A second independent review closed test gaps (loosened band, current-holdings disclaimer, API pass-through, pinned `alt_xirr`) and fixed a 2.2:1 button contrast. Real-file gate run on the synthetic reproduction only (`chandra.pdf` unavailable): gap 1,082,539.38 -> 0.91; disclaimer fires for both members. Details: Root Cause B plan, "Implementation record". Lessons: a plan's code block can need a deviation the plan never anticipated (the widened query), so TDD against the *naive* version first proves the deviation is needed; and an exact-dict API test is a silent casualty of "additive" response fields.

## 2026-10-20 (later still) — Chandra Tripathi fix: gate run on the real `chandra.pdf`

Real file supplied (password `MF@12345`; `MF@123` is the synthetic convention and does not open it). Gate result: 46/46 funds match, invested-vs-CAS gap 0.07 / 0.91 with 0 funds over tolerance, disclaimer fires for both members (186.2% -> -6.6%, 127.5% -> -7.4%). Identical to the synthetic reproduction, which corrects an earlier guess in this session that the PR reviewer's quoted numbers had probably come from the synthetic file; they matched the real file. The harness still prints NOT PASS only from the -5.59% drift check (stale statement date), the same before and after; refreshing that baseline is the one open follow-up.

