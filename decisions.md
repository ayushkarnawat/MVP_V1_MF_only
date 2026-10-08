# Decisions Log

> Append-only, dated log of every decision made on this project — product, UX, and technical. Distinct from `Docs/PRDs/ADR-Technical-Stack-Decisions.md`, which stays reserved for big formal architecture decisions with full alternatives-considered writeups; this file covers everything else, and links to an ADR by reference rather than restating it once a decision graduates to one. Never trim or rewrite past entries — append corrections/reversals as new dated entries instead.

## 2026-07-22 — Core technical stack (ADR-001–006)

React SPA/Vite (not Next.js, no micro-frontends), FastAPI (not Django), AWS RDS Postgres, scoped S3 (no raw CAS PDF retention), ECS Express Mode, EventBridge Scheduler + Fargate `RunTask` for background jobs. **Why:** see `Docs/PRDs/ADR-Technical-Stack-Decisions.md` for full alternatives-considered reasoning — not restated here.

## 2026-07-22 — No raw CAS PDF storage, no PAN persistence

Final, non-negotiable per ADR-004 and the Database Schema doc. **Why:** minimizes stored PII, cleaner DPDP-Act compliance posture; the platform's value is structured data/analytics, not document custody.

## 2026-08-04/05 — Phone + OTP is the sole signup/login method (original, later revised)

PRD-02 FR-2: phone+OTP only, no password, ever. **Why:** matches the dominant Indian fintech pattern (Groww/INDmoney), removes the single biggest documented onboarding-drop-off source. **Superseded 2026-08-14** — see the multi-method-auth entries below; phone remains the universal anchor but is no longer the *only* entry method.

## 2026-08-05 — Sign Up / Log In landing screen ahead of phone entry (PRD-02 FR-2b)

Both buttons lead to the identical phone+OTP flow — framing only, not two auth mechanisms. **Why:** first-time and returning users see language matching their actual situation, at zero backend cost since new-vs-existing was already handled transparently. **Superseded 2026-08-14** for the entry screen specifically — see multi-method-auth entries.

## 2026-08-05 — Family CAS Upload: queue-then-batch-parse, not parse-on-upload (PRD-02 FR-10–14)

Each family member gets an independent upload card; a single "Parse Files" button parses every queued file, rather than parsing the instant each file is chosen. **Why:** parsing on upload would interrupt the person mid-upload-flow for every other member once more than one file is in play.

## 2026-08-06 — Transaction dedupe key widened to include `type`

`(folio_id, date, amount, units, type)`, up from a 4-column key. **Why:** a same-day purchase and redemption of equal magnitude collided under the old key once both were normalized to positive magnitudes — a real bug, not preemptive hardening. See `Docs/superpowers/specs/2026-08-06-transaction-dedupe-type-migration-design.md`.

## 2026-08-10 — Category-ranking blend weights: 40/60 (3yr/5yr), Morningstar-derived

PRD-04's Resolved Open Questions fixed the blend *inputs* but not the blend *weights*. **Why:** adopted Morningstar's published 3/5/10yr weighting (20/30/50), renormalized without the unused 10yr leg, since no in-house weighting had been specified. Flagged in-code per CLAUDE.md's "stop and say so" rather than silently assumed.

## 2026-08-10 — Benchmark mapping: 4 indices, substring-match fallback to Nifty 500

Every SEBI category not matching "LARGE"/"MID" substrings (Flexi/Multi/Small Cap, Sectoral, Debt, Hybrid, etc.) falls back to Nifty 500 as the broad-market default; no fund is ever excluded from comparison. **Why:** only 4 benchmark indices exist in scope (PRD-04), so every category needs *some* mapping rather than a gap.

## 2026-08-10 — AMFI TER fuzzy-match threshold: 0.55, not `enrich.py`'s existing 0.92

**Why:** local scheme names carry a "- Direct/Regular Plan - Growth" suffix AMFI's plan-generic `Scheme_Name` never has, capping a genuine match's ratio around 0.67 — 0.92 would reject real matches. 0.55 was chosen with a comfortable margin verified live against both a real match (~0.67) and an unrelated pair (~0.26).

## 2026-08-13 — Scorer weighting: Return 45% / Risk 30% / Consistency 25%, fixed

Chosen over Morningstar's 3/5/10yr-CAGR-weighted approach. **Why:** Ayush's one hard product requirement for Analytics — the score must be genuinely Unifolio's own, not a re-skin of Morningstar/CRISIL/PowerUp. Keeps risk isolated as its own ingredient (not folded into a risk-adjusted return) and makes consistency a first-class graded ingredient. Full stakeholder-facing rationale: `Docs/Scorer-Methodology-Unifolio.md`.

## 2026-08-13/14 — Dashboard NAV-cache race (Fix D, round 4): accept the remaining limitation, no round 5

No per-key single-flight coordination — two concurrent requests on a cold/expired cache key can both run a full independent computation (no stale data, just an occasional redundant one). **Why:** explicit user decision — no longer a correctness bug, and the real long-term fix is the deferred Fix C (ADR-006's scheduled NAV refresh job), not a more elaborate process-local cache. Documented in `holdings.py`'s cache-scope comment.

## 2026-08-12 — Model-orchestration skill: Claude as orchestrator, Codex as default worker

**Why:** delegate ~90%+ of implementation/refactor/boilerplate work to Codex while Claude Code retains architecture, multi-file interface design, complex debugging, and final assembly — plus a mandatory per-task handoff doc and adversarial-review gate before any Codex-implemented change counts as done. Full design: `Docs/superpowers/specs/2026-08-12-model-orchestration-skill-design.md`.

## 2026-08-14 — Multi-method auth: phone is the universal identity anchor, no exceptions

Every account converges on a verified phone number regardless of which method (Google, email, or phone) it started with. **Why:** reverses this same design effort's own earlier draft (which made phone fully optional to match "equal entry points" literally) — enforced structurally via a new `pending_identity_verifications` table and a `phone_required` API response, not a boolean flag, so an incomplete account is impossible to create rather than merely discouraged. See `Docs/superpowers/specs/2026-08-14-multi-method-auth-design.md` §1.

## 2026-08-14 — Multi-method auth: identity precedence is Google > Email > Phone

Applied wherever only one identity can be shown or selected — populating the denormalized `users.email` field, and which method a step-up account-linking prompt names. **Why:** needed a deterministic rule once an account can hold more than one verified identity; Google/email are richer/more recently-asserted signals than the baseline phone anchor.

## 2026-08-14 — Multi-method auth: account-linking is step-up re-auth, never silent auto-merge on an unverified email match

Auto-link only when both sides are independently verified; otherwise require re-authenticating via the existing account's own method before attaching a new identity. **Why:** an unverified `users.email` field proves nothing about who actually controls that mailbox — auto-linking against it would let anyone who happens to own that address take over an existing account's financial data.

## 2026-08-14 — Multi-method auth: `EmailProvider` abstraction now, Postmark wiring later

A `send_email(to, subject, body)` protocol ships with only a `StubEmailProvider` implementation; Postmark is the confirmed eventual choice but is not wired up in this pass. **Why:** mirrors this codebase's own existing precedent of deferring real SMS delivery for phone OTP the same way — keeps the architecture ready for a real provider (one new class + a config flip) without building it before it's needed. Real implication surfaced, not hidden: email-as-a-method won't function once this feature reaches Postgres/production until Postmark actually lands — a firm prerequisite for that deploy, not an open-ended "someday."

## 2026-08-14 — Multi-method auth: Sign in with Apple deferred to Future Scope

**Why:** the one method with a real recurring paid prerequisite (a $99/year Apple Developer Program membership, required regardless of App Store distribution) — the product decision was to confirm that cost is worth it separately rather than bundle it into this build. A disabled "Coming soon" placeholder button ships now on the frontend to reserve its UI slot.

## 2026-08-14 — Multi-method auth schema/migration design confirmed compliant with the Migration Plan guardrails

Checked against `Docs/PRDs/Migration-Plan-SQLite-to-Postgres.md`: all new tables/columns go through Alembic (never hand-edited DDL), all new queries are ORM-only (no dialect-specific raw SQL), and the design introduces zero JSON/JSONB columns. **Why:** this is the first new schema surface designed since that guardrail doc was written — confirming compliance explicitly rather than assuming it, per the doc's own "no file is allowed to go stale" spirit.

## 2026-08-06 — A held scheme with no obtainable NAV silently drops from the dashboard

Phase 3 design choice: excluded from holdings/allocation/aggregates with no error or placeholder. **Why:** no "NAV unavailable" UI treatment had been designed at the time; silently dropping was judged less confusing than a broken row. **Still open** — carried forward in every session-state update since, worth revisiting once a real treatment is decided.

## 2026-08-07 — Full independent review pass required before merging any agent-authored branch, not just a passing test suite

Google Antigravity's own report claimed full passing tests for the frontend redesign; actual state was 39/104 frontend tests failing plus 6 `tsc` errors. **Why:** never trust an agent's self-reported test status — root-caused and fixed every failure, distinguishing real app bugs (an accessibility regression, a `Decimal`-never-`float` violation on the dashboard's most visible number, a silent member-misattribution risk in "Add Data" re-entry) from tests merely stale after copy/behavior changes. This standard was later applied again to the intern's CAS import lifecycle work (see 2026-08-14 entry below) and formalized into the model-orchestration skill's adversarial-review gate (2026-08-12).

## 2026-08-07 — `impeccable` plugin untracked from git history, kept on disk

**Why:** keep it usable for whichever coding agent works in this checkout, without letting a vendored plugin drift stale against its own upstream update mechanism inside this app's own git history.

## 2026-08-10 — Analytics (PRD-04) backend build order fixed at 5 steps, Scorer last

Allocation → TER/AAUM → Benchmark → Category Ranking → Scorer. **Why:** each step's dependencies become explicit (Scorer depends on the outputs of TER/AAUM, Benchmark, and Ranking) and each step ships independently testable/committable rather than as one monolithic change. See `Docs/superpowers/plans/2026-08-10-phase-4-analytics-backend-design.md`.

## 2026-08-10/11 — FR-10's "AUM-weighted" TER clarified to mean holding-value-weighted, not platform AAUM

**Why:** PRD-04's own text reads ambiguously; resolved during design research that the weighted TER should reflect the *user's own* holding value per scheme, not the fund's platform-wide AAUM (the service never reads `scheme_aaum` as a result). Flagged in-code per CLAUDE.md's "stop and say so" rather than silently picked either way.

## 2026-08-10/11 — Benchmark-hypothetical XIRR replays real cash flows against the index, transaction-by-transaction

Purchases buy hypothetical index units at that day's index level, redemptions sell that many units; only the terminal value differs. **Why:** flagged in-code as a judgment call not fully spelled out by PRD-04 — chosen over a simplified single-cash-flow approximation to keep the benchmark comparison faithful to the portfolio's actual cash-flow timing.

## 2026-08-13 — Scorer's full FR-7 breakdown is never persisted

Recomputed fresh on every read rather than stored alongside the daily `FundScore` row. **Why:** avoids creating a second source of truth that could drift from the persisted score. Global Constraint in the Scorer implementation plan.

## 2026-08-13 — Scorer tier boundaries are inclusive on the lower bound

`>=80` → tier 5 ... `>=20` → tier 2, else tier 1. **Why:** simple, consistent rule applied uniformly across all cutoffs rather than mixing inclusive/exclusive framing.

## 2026-08-13 — Fix C (real scheduled NAV refresh) stays deferred to deployment phase

Fix A/B/D are explicitly local-dev-first mitigations layered on on-demand NAV fetching, not "the fix." **Why:** the real fix is ADR-006's EventBridge Scheduler + ECS Express Mode recurring NAV-refresh job, which needs its own design pass (schedule cadence, partial-failure handling, bulk-vs-per-scheme fetch client) and isn't built until AWS deployment per the Migration Plan's Readiness Checklist — consistent with CLAUDE.md's "local development first" non-negotiable.

## 2026-08-14 — Branch reconciliation: discard in-progress local Badge/Select fix in favor of the intern's independently-landed equivalent

Ayush's explicit call once the intern (`aditishanbhag`) pushed commits fixing the same two problems (Badge `className` support, a broken Radix-`Select` test interaction) a partial local fix was already mid-flight on. **Why:** the intern's commits fixed both issues independently and correctly, using an equally valid but different `Select` test pattern — keeping two competing fixes for the same bug would only create merge noise with no benefit.

## 2026-08-14 — Intern-authored CAS import lifecycle redesign and UI foundation: "tests pass" is not "reviewed correct"

The 11-state CAS import lifecycle state machine, coverage-gap detection, opening-balance resolution, CAMS-portal mailback flow, and shadcn/Tailwind UI foundation all passed the full suite (357/2 backend, 190/190 frontend) but have had no independent Claude Code review pass. **Why:** explicitly refusing to equate passing tests with reviewed-correct against CLAUDE.md's non-negotiables (`Decimal`-never-`float`, no raw CAS PDF storage, no PAN persistence) — same standard set on 2026-08-07 — flagged as an open item requiring a dedicated review, specifically because this batch touches money/state-machine logic (opening balances, coverage gaps).

## 2026-08-14 — Multi-method auth: pill-button order locked — Google, Apple (disabled), Email, Phone

**Why:** explicit product decision, not derived from any convention (not alphabetical, not by expected usage frequency) — recorded so it isn't silently reshuffled later. Apple's slot stays reserved even while disabled, so the layout doesn't reflow once real Apple sign-in ships.

## 2026-08-14 — Multi-method auth: Postmark confirmed as the email provider (SES-vs-Postmark question closed) — **Superseded 2026-09-22/23**, see the SES-switch entry near the end of this file

**Why:** deliverability for a login-critical OTP outweighs Amazon SES's lower cost and AWS-infra alignment at this volume — settled definitively, not left as a recommendation. Wiring it up is still deferred (see the `EmailProvider`/Postmark-timing entry above), but *which* provider is no longer open.

## 2026-08-14 — Multi-method auth: email stays visible in the UI on the stub provider; Postmark becomes a firm pre-production prerequisite

**Why:** resolves an open question the design spec had explicitly flagged rather than silently picking an answer — email-as-a-method is never hidden from users, including in early dev, but `otp.py`'s existing stub-mode guard means it genuinely can't send real email once this feature runs against Postgres. Postmark wiring is therefore required before (or as part of) this feature's first Postgres/production deploy, not an open-ended "someday."

## 2026-08-14 — Multi-method auth: `pending_identity_verifications` uses one shared ~10-minute TTL for both triggers

**Why:** the phone-gate case (mid-signup, hunting for your phone) and the step-up-link case (re-authenticating an existing account) are arguably different UX situations, but a single shared window was chosen over two different values for simplicity — flagged as an open item in the design spec, explicitly resolved this way by the user rather than left to implementation-time guessing.

## 2026-08-14 — Multi-method auth: `Session.auth_method` built now, not deferred

**Why:** originally flagged as optional/deferrable in the design spec; the user asked for it to be added as a firm decision mid-session — it's a small addition and directly useful for recording which method actually completed a phone-gated signup (the completing method, not the originating Google/email identity).

## 2026-08-14 — Multi-method auth: email OTP delivery confirmed intentionally stubbed now, mirroring phone exactly — `NoEmailProviderConfiguredError` is not a reachable state today

Confirmed via direct code trace plus the existing (already-passing) test suite that no code change was needed here. Email OTP already runs through the same shared `otp_delivery_mode` setting phone uses (`config.py`, default `"stub"`, unset in `.env.example`), and in stub mode email's flow is architecturally identical to phone's: `otp.py`'s `if channel == "email" and settings.otp_delivery_mode != "stub":` guard is false whenever mode is `"stub"`, so `EmailProvider`/`StubEmailProvider` is never even called — the OTP is generated and stored exactly like phone's, and `raw_otp` is returned in the API response's `otp` field, the same mechanism phone has always used to surface a testable code to a developer (not a console log). `test_otp_request_accepts_email` and roughly 15 other route-level tests already exercise this against the app's real default config with zero monkeypatching, and already pass at 441/2.

**Why:** explicit user instruction — `NoEmailProviderConfiguredError`/its 503 mapping must not be a reachable state right now, only a genuine misconfiguration once real email delivery is deliberately turned on before Postmark is wired. Confirmed this is already true: the error path is only reachable by explicitly setting `OTP_DELIVERY_MODE` away from `"stub"` (exercised on purpose via monkeypatch in `test_otp_request_returns_503_when_no_email_provider_is_configured`), never by anything that happens during ordinary local development or testing.

**How to apply:** the frontend implementation plan needs **no special-case handling** for a 503 on `/auth/otp/request` under current conditions — a stubbed email OTP request is an ordinary, successful 200 response, structurally identical to phone's, so the plan's existing generic error-surfacing pattern already covers it correctly as-is. This only becomes a live concern the moment `OTP_DELIVERY_MODE` is deliberately switched to a real value as part of wiring up Postmark, which is its own separate, already-flagged future task (see the `EmailProvider`/Postmark-timing entries above) — not something to design defensively around now.

## 2026-08-14 — Multi-method auth: Critical Finding 2 (missing backfill migration) ruled a plan defect, not an implementation defect

**Why:** the design spec explicitly named a one-time backfill of existing `users` rows into `auth_identities` as required work, but scoped it as "planning-phase work, not built here" — and this was never actually converted into a task in the implementation plan. Recorded explicitly as a gap in the plan I authored, not an execution slip by any implementer, because attributing it correctly matters for how this project's history reads later: the per-task review process worked exactly as designed (every task matched its own brief), but a whole-branch review was still necessary to catch a hole in the plan's own coverage. **How to apply:** when a design spec defers something to "a later migration" or "future work" without naming the specific task that will do it, treat that as an open task-planning risk, not a settled deferral — cross-check the plan's task list explicitly names it before treating the plan as complete.

## 2026-08-14 — Multi-method auth: false-positive review findings must be verified against `git show`, not trusted from a truncated diff

**Why:** a task reviewer concluded `MeResponse` had been entirely deleted based on a `git diff -U10` hunk that merely fell outside the shown context window — not actual absence. Caught before a bogus fix round was dispatched, by checking `git show`/`wc -l` directly. **How to apply:** any review finding of the shape "X was removed / never existed" gets a direct existence check (`git show <commit>:<path>`, or `grep`) before it's treated as real, regardless of how confident the reviewer's diff-based reasoning sounds.

## 2026-08-15 — Multi-method auth frontend plan: pill-order transcription error corrected in the plan itself, not just flagged

The frontend implementation plan's own Global Constraints line read "Email, Phone, Google, Apple," contradicting the Goal line two lines above it, Task 7's JSX comment, Task 10's ordering test, and this file's 2026-08-14 pill-order entry — all four of which already agreed on "Google, Apple (disabled), Email, Phone." **Why:** flagged during the pre-flight conflict scan required before Task 1; rather than leave the contradiction sitting in the plan for a future reader to trip over, the user asked for the Global Constraints line to be corrected in place. Fixed directly in `Docs/superpowers/plans/2026-08-14-multi-method-auth-frontend-plan.md` — confirmed order for implementation is **Google, Apple (disabled), Email, Phone**, Apple shown as a visibly-present, non-interactive "Coming soon" pill from the start (not added later) even though real Apple sign-in stays Future Scope on the backend.

## 2026-08-15 — Multi-method auth frontend: no OAuth redirect flow exists — the hard-stop concern about redirect/session reconciliation doesn't apply to this plan

Before starting frontend implementation, the user set a hard-stop checkpoint at "the task covering the OAuth redirect flow and its reconciliation with the router-less step-machine and AuthContext's session-on-load model." A full read of the plan and its backing frontend spec (`2026-08-14-multi-method-auth-frontend-design.md` §2, "OAuth flow in a router-less SPA") found zero occurrences of a redirect flow anywhere — Google Identity Services' popup/token flow was deliberately chosen specifically *because* it avoids a redirect: the credential arrives via a JS callback inside the SPA's existing execution context, the page never unmounts, and `AuthEntryFlow`'s `useState<Step>` machine is never at risk of being wiped by a reload. **Why this matters:** a full-page redirect would have been the one thing that genuinely broke this architecture (no router to restore state after a reload) — the spec explicitly reasoned through this and rejected it before any code was written, which is why no task in the 10-task plan needed to solve a redirect/reconciliation problem at all. Confirmed with the user directly rather than silently proceeding past their intended checkpoint on a mismatched premise; user redirected the hard stop to **Task 9 (`AuthEntryFlow` orchestration)** instead — the actual place the Google credential handler integrates with the step machine and existing `login()`/session-on-load flow — as the closest real match to their original intent.

## 2026-08-17 — Multi-method auth frontend: missing-Google-client-ID banner deliberately reverted after live browser testing

The final whole-branch review's Finding 7 flagged that `GoogleButton` failed silently when `VITE_GOOGLE_OAUTH_CLIENT_ID` was unset, and a fix wave added a visible "Google Sign-In isn't configured" error banner for that case. After the fix landed, the user tested the actual running dev server in their own browser and explicitly rejected this banner — they want `GoogleButton` to render exactly as it did before, silently, regardless of client-ID configuration. **Why:** a direct, deliberate product call made from live visual testing, not a defect report — the user's own words were "I don't want this error message to show... don't show the error." Reverted in commit `f9b6bdb`, explicitly preserving the same finding-set's Finding 6 (GIS button width measurement/clamping, same file) untouched. **How to apply:** if a future pass revisits "what should happen when Google isn't configured," this decision is the reason the answer isn't a visible banner — check with the user again before reintroducing one, don't silently re-add it as a "obvious improvement."

## 2026-08-17 — Multi-method auth frontend plan: complete, final review clean

All 10 tasks + 1 out-of-plan `App.test.tsx` fix + the final whole-branch review's 1 Critical/6 Important findings, all fixed and independently re-verified twice (controller directly, then an independent scoped re-reviewer) — full detail in `backend.md`'s frontend-completion entry and `log.md`. Notably, closing this plan out also surfaced and fixed a genuine environment-level bug unrelated to the feature itself: `frontend/node_modules/@rolldown` was missing its Linux native binding, which had been silently causing the "transient vitest worker timeout" flakiness treated as unavoidable noise for the entire session up to this point. Fixed with zero footprint on the committed repo (gitignored `node_modules` only, `package.json`/lockfile untouched) — confirmed by a subsequent full-suite run with zero flakes at all, a first for this session.

## 2026-08-14 — Standing documentation discipline established: `decisions.md`, `log.md`, `backend.md`, `database.md`

Four new append-only root-level tracking files, each distinct from an existing doc (see each file's own header). **Why:** this session's multi-method-auth work was substantial enough (a design spec, a follow-on frontend spec, two full implementation plans, six-plus rounds of decision resolution) that relying on `session.md` alone — a short, prunable, overwritten-each-session pointer — risked losing the "why" behind decisions once `session.md` gets pruned. A corresponding CLAUDE.md section ("End-of-Session Documentation") was drafted to make updating all of these a standing requirement, not proposed as optional — pending the user's manual merge into `CLAUDE.md`/`session.md` (not committed automatically here, to avoid a race with concurrent edits to those two specific files).

## 2026-08-17 — Email signup reverses to email+password (was email+OTP)

Email signup moves from email+OTP to email+password — reverses the
2026-08-14 multi-method-auth decision that made email one of three
transparent-OTP-style methods (that entry is marked superseded, not
edited — this file is append-only). **Why:** password-manager autofill
removes more real friction on email than email-OTP's inbox-check step
saves — phone+OTP and Google both keep their zero-friction, instant-
verification advantage, so the passwordless principle stays intact
everywhere it was actually earning its keep. Google and phone+OTP are
unchanged. Full design: `Docs/superpowers/specs/2026-08-17-email-password-signup-design.md`.

Two real findings surfaced during design review, not just implementation:
(1) a genuine namespace-squatting gap where an unverified signup email
could occupy the `EMAIL_PASSWORD` identity slot before its real owner ever
tries — traced explicitly (no real-account hijack is possible; a fresh
signup only attaches to an existing account if the entered *phone number*
matches) and closed with a decoupled email-confirmation step that gates
only `/auth/login/email`, never signup or the phone gate itself, so there's
zero added friction on the happy path; (2) a successful password reset
also confirms the email if it wasn't already, since clicking a link mailed
to that exact address is equally strong proof of mailbox control — this is
what makes squatting self-service-recoverable without a support ticket.

## 2026-08-17 — Password authentication removed entirely; email reverts to email+OTP for both signup and login

**Reverses the entry immediately above this one** (this file is append-
only — that entry is marked superseded, not edited). Password-based
email signup/login, password reset, and every `password_hash`/
`email_confirmed_at` field backing them are removed from the schema,
backend, and frontend — no password field survives anywhere in the
product. Email now uses the same OTP-verification pattern phone+OTP and
the (already-built) email-OTP-signup-confirmation infrastructure already
used: `signup_email` sends an email OTP directly (no password collected),
and login is now request-code-then-verify against email+OTP as well —
the `EMAIL_OTP` provider identity (benched, unused, in the 2026-08-17
entry above) is reactivated as the active email provider; `EMAIL_PASSWORD`
takes its place as the now-benched, kept-but-unused enum value, per the
same "Postgres can't cheaply drop an enum value" reasoning already
established for `EMAIL_OTP`.

**Why:** management decision. This is a reversal of judgment, not new
information about user behavior or a walked-back technical finding — the
password-manager-autofill rationale in the entry above was a real
tradeoff call at the time; leaving it uncontradicted here would misstate
why the code changed. Google and phone+OTP were never password-based and
are unaffected either way.

## 2026-08-19 — Left Auth Showcase Panel: Single Continuous Deliberate SVG Path Motion

The left authentication showcase panel was redesigned (`AuthShowcasePanel.tsx`) to replace random floating bubbles and cycling statistics with a single, deliberate continuous path integrated into the central 3D dark slate card.
- **Trajectory Motion**: The path draws progressively from a subtle chaotic waveform on the left into an increasingly structured upward compounding curve on the right.
- **Play-Once Session Guard**: Uses `hasAnimatedInSession` module state so the 3.2s animation draws exactly once on initial page load and stays in its completed state across auth step transitions, avoiding jarring resets.
- **Hover-Only Milestone Metrics**: Replaced automated cycling stats with a cursor-hover tooltip that reveals milestone data (`+14.8%`, `+28.4%`, `+41.2%`, `+56.8%`) at the nearest data point.

**Why:** Creates a calm, premium, deliberate financial visualization that communicates portfolio progression without distracting motion or false complexity.

## 2026-08-19 — Comprehensive Frontend Validation & Typo Detection Engine

Implemented client-side validation across all auth screens for both Email and Phone channels (`frontend/src/features/auth/validation.ts`):
- **Email Validation**: Structural checking (missing `@`, multiple `@`, spaces, consecutive dots, dot/hyphen boundaries) + missing TLD prompts + intelligent typo suggestions (e.g. `name@gmial.com` -> *"Did you mean name@gmail.com?"*) without silent modification.
- **Indian Mobile Phone Validation**: Enforces 10-digit requirements, valid Indian prefixes (`6`, `7`, `8`, `9`), rejects non-digits/decimals, and normalizes `+91`, `91`, `0` prefixes to standard `+91XXXXXXXXXX`.
- **Dynamic Live Recovery UX**: Errors trigger on blur and submit, and clear/update dynamically in real time as the user types corrections.

**Why:** Eliminates failed OTP submissions, prevents subtle user typos, and provides human-friendly error guidance directly below input fields.

## 2026-08-19 — Hand-Drawn Hero Illustrations & Bespoke Option Card SVGs

Replaced generic vector artwork with bespoke hand-drawn illustrations sourced from the project's illustration sheet:
- Extracted 5 transparent high-resolution PNGs with subtle Unifolio green accents (`#22C55E` / `#16A34A`) and light/dark theme assets, rendered in `OnboardingIllustration.tsx` with an ambient emerald radial glow.
- Replaced generic Lucide icons on **Household** (`Q4Household.tsx`) and **Privacy & Security** (`TrustPrimer.tsx`) option cards with custom hand-drawn SVGs matching the stroke weight and character of the rest of the onboarding cards.

**Why:** Creates a cohesive, bespoke visual identity across the entire onboarding and authentication experience while strictly honoring the brand's monochrome-with-green-accent design philosophy.

## 2026-09-18 — PAN persistence and CAS file retention (reopens 2026-07-22 decision)

ADR-004's original "no PAN, no raw file, ever" is superseded. PAN is now stored encrypted per household member (attribution matching); the raw CAS PDF is retained 30 days then deleted. **Why:** name/email-based attribution was fragile (nicknames, similar family names) and couldn't detect the same PAN already tracked under a different account. See `Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md`.

## 2026-09-24 — PAN attribution moved from Confirm-time to upload-time (amends the 2026-09-18 entry above)

Amends, doesn't reverse, the entry above — same PAN storage, same matching rules, different point in the flow where the check/claim happens. **Why:** a member's PAN was only ever stored *after* a Confirm, so PAN-based attribution could never match on a first import — every fresh account's first upload showed a false "couldn't match this statement" error. `/imports/parse` now claims the PAN as pending immediately; Confirm Import never prompts. See `Docs/superpowers/specs/2026-09-24-pan-at-upload-attribution-design.md`.

## 2026-09-22/23 — Email provider switched from Postmark to Amazon SES; Postmark removed entirely, not kept dormant

Reverses the 2026-08-14 "Postmark confirmed" decision. `SesEmailProvider` added behind the existing `EmailProvider` abstraction (IAM-role auth via `boto3`, no new secret/token store — the abstraction built in 2026-08-14 paid for itself exactly as intended); Postmark's provider class, Terraform secrets/variables, and DNS records were then removed from the codebase entirely rather than kept as a dormant rollback path. **Why:** SES aligns with the AWS infra already being stood up for staging (IAM-role auth instead of a separately-managed API token) and removes a second email-sending surface to keep configured/secured; full comparison in `Docs/orchestration/email-provider-alternatives-comparison.md`. Keeping Postmark dormant would have cost $0 (free tier, no expiry) — removing it was a deliberate simplicity choice, not a cost-driven one. Phone/SMS OTP is unaffected, still `"stub"` in staging.

## 2026-09-22 — Phone-gate collision now errors like email's, instead of silently logging in

Signup's mandatory phone gate previously called `attach_pending_identity` unconditionally whenever the entered phone number matched an existing identity, silently completing the caller's signup as a sign-in to that unrelated existing account. **Why:** found as a live bug, not a design gap — brought in line with `signup_email`'s existing 409 "already exists — log in instead" behavior for a duplicate email, and moved the check from `otp/verify` to `otp/request` so it surfaces before the caller types a code, matching email's timing exactly.


## 2026-09-29 — CAS member detection: decisions I1-I16 and implementation rulings

Spec: `Docs/orchestration/cas-member-detection-map.html` (decisions table). Nothing was left open in the spec; the rulings below were taken during implementation where the spec or plan was silent or conflicted.

**Spec decisions I1-I16:** I1 one-person file shows no popup, one ribbon. I2 nominees ignored. I3 the detected PAN is kept aside until unlock; unlock errors L1-L8 [L1/L2/L3/L9 superseded 2026-10-01]. I4 a typed PAN that differs from the statement is a hard error, no override (L3). I5 no upload for a locked person (A1, U6, M9). I6 minors deferred. I7 a person later found on another account: option B (their funds from this statement count in the family total, their own dashboard stays locked); option C "Ask for access" deferred. I8 deleting from a shared file: one person, everyone, or a member's whole portfolio (M17). I9 a name only gets more complete (updated only when the new statement has more name tokens; otherwise ours stays, no popup). I10 partial name match on the first import shows U1 before the people popup; the statement's name is taken at Confirm imports. I11 all ribbons reviewed before Confirm imports. I12 server-side lock. I13 cross-account check at upload. I14 PRD amendments (applied 2026-09-29, see `Docs/PRDs/`). I15 unlocked is permanent, enforced by a database trigger. I16 deletion logic as designed in M17.

**Deviations from the spec (recorded, all adopted):**
- `POST /imports/sessions/{id}/acknowledge` added; not in the spec's API table. It exists so every prompt (U5/U6/U7) is answered the same way and returns the preview.
- U7 and U8 reuse the code `cross_account_pan_blocked` with the session kept.
- An expired review session is 410 on `/imports/confirm` too (was 404).
- D2 ("Also remove from my family") sits on the profile page, and is hidden for Me (M17: self is never removed).
- `/cas-imports` answers 409 `review_required` instead of being removed (M18).
- F26: Import History stays a flat API list with group fields; the frontend groups by `upload_group_id` (spec says grouped). Cost if wrong: move grouping server-side later.
- F37: spec copy using he/his/him is rendered as they/their (the spec's own L8 pattern), since gender is unknown for detected people.
- F17: curly apostrophe used in all UI copy per the spec; normalised to `'` before name validation and matching (backend and frontend).
- Postgres enum type names follow the codebase convention (`memberorigin` ...), not the spec's snake_case.
- `ParsedPerson.folio_keys` / `unassigned_folio_keys` are `(amc, folio_key)` tuples (RAM session, no JSON), so cross-AMC folio-number collisions are safe.
- Ribbon copy stays plural-only, "({n} unresolved holdings)" (spec verbatim, grammar for 1 accepted). Live unresolved count uses ReviewTable's blocking rule (needs AMFI code or plan type), broader than the backend's unclassified-only count.
- Unlock/edit form shared between both (`memberDetailsForm.tsx`); [superseded 2026-10-01: names/PANs are no longer editable] L9 edit requires re-typing the PAN because the raw PAN is never returned.

**Technical rulings:**
- The U4/U13 PAN switch holds the old PAN only in RAM (F6). A server restart mid-review leaves the member with the pending new PAN, which lapses after 65 minutes; accepted for MVP.
- Holder-name filter rejects scheme-ish words rather than requiring all caps; a person whose name contains such a word falls back to an editable placeholder.
- First upload for a non-self target runs both the target checks (U5/U4) and the self-by-name checks (U2/U3).
- Confirm `include=False` is valid only for people already on another account (U8); a person newly on another account at confirm time is a 422 until re-upload (race, rare); `moved_funds` accepted only for matched-by-name/unassigned funds.
- Parallel confirms of the same family CAS can duplicate name-only people (no hash to match); the M11 merge covers it. A confirm during an in-flight resolve on the same session is 410.
- A group PDF saved before commit is cleaned up if the commit fails (no orphaned S3 object).
- F34: a name-only person's PAN typed at L5 stays `pan_source = user_entered`, unverified at unlock; unlock skips L3 for it. Merge eligibility and L4 `can_merge` treat `user_entered` PANs as name-only.
- Same-account non-merge L4 copy "This PAN is already on {other}." and the "Dad" example interpolate the member name (spec silent on the former).
- U1 ask-mode (M8) copy is from the spec's M8 row ("Update X to Y?", Update / Keep mine).
- Mobile history delete falls back to person scope if the household-wide list fetch fails; mobile reuses the desktop ribbon styling (needs phone QA).
- No back control from the upload screen to the privacy page (final-review ruling): the privacy step is a one-way onboarding gate, so upload offers no way back to it.
- Analytics export and PDF routes are gated by `require_unlocked_member` on member scope, like the other analytics member-scope routes: a locked member's analytics cannot be exported (final-review ruling). `POST /folios/{id}/opening-balance` and `POST /cas-imports/request` are gated the same way.
- New committing routes are plain `def` (or use `commit_off_loop` if async), per the `bb5225f` event-loop rule.


## 2026-09-30 — Staging QA fixes: six decisions (auth + CAS member detection)

From the user's staging test of the auth redesign and CAS member detection. Findings, causes and fixes: `Docs/orchestration/2026-09-30-staging-qa-findings-map.html`. Plan: `Docs/superpowers/plans/2026-09-30-staging-qa-fixes.md`.

1. **Sign-up with a registered phone** is rejected before any code is sent (409 "An account with this phone number already exists."), with a verify-time 409 backstop. **Log In with an unknown phone or email** is rejected at request time too (404 "No account found … sign up instead."). The account-enumeration tradeoff was accepted by the user; the 60-second resend throttle bounds probing. Closes `session.md` item 9.
2. **Onboarding "What brings you to Unifolio?" is multi-select.** Stored as `users.primary_goals` (JSON on SQLite, JSONB with a containment CHECK on Postgres) via expand/contract: 0019 adds and backfills, `PATCH /me` dual-writes the first goal to `primary_goal` until a later migration drops it. A separate table was considered and rejected (four checkboxes, one reader).
3. **Ribbons with 0 unresolved funds confirm themselves**, including ribbons with funds matched by name or assigned by the user. This **amends the member-detection FR-4 note** ("the user must see those folios … before Confirm imports"): the closed ribbon header always shows the "N matched by name" count instead, and any confirmed ribbon can still be opened.
4. **[Superseded 2026-10-01 — unlock no longer takes a typed PAN except QC; see the 2026-10-01 section] L3 (typed PAN ≠ statement PAN at unlock) is a popup**, modelled on U4: "The one on the statement" unlocks with the stored detected PAN (`use_detected_pan`), "The one I entered" saves nothing and opens a normal upload (M9 still blocks uploads *for* a locked member). I4/M10 now read "no override: choose the statement's PAN or a different statement".
5. **A PAN-less person attaches automatically to exactly one existing member with an exact name match** (funds tagged "matched by name", movable). Two same-named members → a new member, as before. This supersedes the 2026-09-29 ruling that parallel confirms "can duplicate name-only people; the M11 merge covers it".
6. **A PAN-bearing person whose name matches exactly one PAN-less member is asked** ("Is this the Kavita Shanbhag you already have?", reusing U13's same-person prompt). Yes: the PAN becomes that member's detected PAN at Confirm (or a pending claim if they're unlocked). No: a new member.

**Also decided while building:** the merge rule widened so a locked duplicate whose detected PAN equals the target's PAN can merge (before, only a name-only source could, stranding the PAN-bearing duplicate); merging verifies the target's typed PAN. Two deviations from the findings map: the statement-period backfill is its own migration `0020` (the goal-column drop becomes `0021`), and the new auth errors use plain-string `detail` like the existing ones.

**Final-review fixes (2026-09-30, same change):** (a) Me (the `self` member) is never a candidate for the 5A exact-name attach or the 5B "same person?" prompt. Me is found only by PAN or `resolve_self`, per F11. The 30 Sep decisions didn't mention Me, so this keeps F11 intact rather than overriding it. (b) On an "Add data for X" upload, the target X wins over a 5A exact-name match on another member. (c) Confirm refuses (422, "changed during this review") when a locked member linked by 5B already has a *different* detected PAN, which happens when two tabs link the same person to two PANs.

**Go-live audit follow-ups (2026-09-30, same change):** `UpdateMeBody` still accepts the legacy single `primary_goal` and saves it as a one-item list, so a cached old frontend isn't silently dropped mid-rollout. `users.primary_goals` is declared `none_as_null` so a Python `None` is SQL NULL (a JSON null would fail the Postgres CHECK). Accepted, not fixed: the request-time 404/409 auth checks run before the resend throttle, so registered numbers and emails can be probed without a rate limit (email was already probeable via `/auth/signup/email`), and a rate limit is a follow-up. Also accepted: exact-name attach (5A) can merge two different real people with an identical name, since their funds stay tagged "matched by name" and movable; a PAN linked via 5B stays on the member if that import is later deleted; on mobile, "The one I entered" inside the import screen closes the popup rather than reopening upload.

## 2026-10-01 — AWS staging cost-reduction: Scenario A applied, Scenario B held off

Full numbers and rationale: `Docs/2026-09-29-aws-staging-cost-analysis-and-reduction-plan.md`. Narrative: `log.md`'s 2026-10-01 (cont'd) entry.

**Scenario A (night-stop RDS/backend/`fck-nat` 9PM-5AM IST + Fargate memory 2048→1024MB + bastion stopped-by-default) implemented and applied.** $91.78/mo → $68.46/mo, -25%, inside the user's $65-70/mo target. **Why this one:** every lever is either schedule-based automation (trivially reversible by disabling the EventBridge rule) or a resource-size cut backed by 30 days of real utilization data with wide headroom (Fargate memory never exceeded 18.3%) — no external dependency, no database risk, no partner risk.

**Scenario B (RDS `db.t4g.small`→`micro` on top of Scenario A, a further ~$10/mo to ~$58.38/mo total) explicitly held off, user decision.** **Why:** Scenario A alone already meets the cost target, so the only reason to take Scenario B is the extra savings — and unlike every Scenario A lever, this one carries a real (if probably low) failure mode against **live data**: 30 days of `FreeableMemory` on the current `small` (2GB) instance shows ~1.35-1.4GB in continuous use, while `micro` has only 1GB total RAM. RDS does auto-tune Postgres's memory parameters down for a smaller instance class, so the current usage number isn't proof the workload *needs* 1.4GB — but it's also not proof `micro` would be fine, and a connection/query burst from the CAS-import or analytics-recompute batch jobs against a 1GB instance has a real path to swap or OOM. **How to apply going forward:** if this is revisited, don't flip it directly — resize during the night-stop low-traffic window, watch `FreeableMemory`/`CPUUtilization`/`DatabaseConnections` for 48-72 hours with `small` ready as an immediate rollback, and only treat it as final once that window is clean (per the plan doc's §4 recommendation). Not a rejection of the idea, just a deferral until there's appetite for a monitored trial against production-adjacent data.

## 2026-10-01 — Consent, onboarding and profile changes (decisions Q1–QF; merged from a parallel branch push)

Source: `Docs/orchestration/2026-10-01-onboarding-consent-profile-changes-plan.md`. All answered 2026-10-01.

- **Q1** the onboarding privacy screen (and its "Account Aggregator" line) is removed entirely. **Q2** unticked checkbox, not "By continuing you agree". **Q3** PAN disclaimer on every upload. **Q4** also on the CAMS-request path. **Q5** re-consent is built now. **Q6** consent records are never deleted for now (incl. account hard-delete); retention to be set with the lawyer; no purge job. **Q7** "all of the above" is a UI shortcut storing all 4 goals, not its own value; **Q7b** wording "Why choose? All of it." **Q8** member phone/email are contact info only, unverified. **Q9** self member shows account phone/email read-only. **Q10** PAN and name are never editable, except QC. **Q11** no withdraw-consent control now (lawyer).
- **QA** onboarding name is provisional, replaced by the CAS name. **QB** unnamed (`needs_name`) people get a one-time name in the people popup, replaced by the CAS later. **QC** no PAN on the statement: stays empty, except a PAN field in the unlock popup for those members only. **QD** unlock PAN typing dropped otherwise: relationship dropdown only. **QE** existing typed names/PANs: no migration. **QF** users who skipped the old privacy screen are re-asked once (accepted). Delete-import confirmation keeps the transaction count (E3).
- Raw IPs are never stored in `consent_records`, only truncated IP plus keyed HMAC. Legal texts are placeholders pending the lawyer (final T&C, Privacy, PAN disclaimer wording, purpose list, retention period, withdraw design).
- **Supersedes (2026-10-01)** the 2026-09-29/30 member-detection rules L1/L2 (typed PAN at unlock), L3 (detected-PAN mismatch popup, `use_detected_pan`), L9 (edit name/PAN of an unlocked member) and the people-popup rename pencil (U9), except where QB/QC keep a narrow form. Original entries above are kept for history.

## 2026-10-01 — Consent IP-hash key: derived, not a new secret

The consent-record IP hash is keyed by a key derived from `PAN_LOOKUP_PEPPER`
(HMAC with the fixed label `unifolio/consent-ip-hmac/v1`) instead of a separate
`CONSENT_IP_HMAC_KEY`. Why: no new secret, no Terraform apply (which would have rewritten
the shared pan-keys secret). Cost: pepper rotation also rotates future IP hashes.

## 2026-10-01 — Member profile completion replaces the detected-member lock

Source: `Docs/orchestration/member-profile-completion-map.html` (https://claude.ai/artifact/8oEaUu5UDtkP9dptxrroux), plan `Docs/superpowers/plans/2026-10-01-member-profile-completion.md`. Decided in the 1 Oct review. Supersedes Part 6 and L1-L9 of the CAS member detection map and the member-unlock rules in the earlier 2026-10-01 consent/profile entry.

- **The detected-member lock is removed.** A detected person's dashboard opens directly; there is no unlock screen and no 403 gate. `details_completed_at`, `lock_reason`, their CHECKs and the never-relock trigger are dropped (migration 0023).
- **Name and PAN are saved at Confirm imports,** encrypted and stored exactly like Self's (`pan_encrypted` / `pan_lookup_hash`, `pan_source='cas'`). Exception: a PAN another account holds goes to `detected_pan_*` with `pan_conflict='other_account'`.
- **A (no upload-time reservation).** A detected member's PAN is not reserved at upload; it is written only at Confirm. Self's upload-time pending claim is unchanged. If another account takes the PAN during the review, Confirm treats it as the other-account case. Ruled during execution: "Add data" never reserves a non-Self target's PAN at upload either, so an other-account PAN now starts the review and becomes `pan_conflict` at Confirm instead of a 409.
- **Relationship, phone and email are optional** and saved only on popup Save (`PUT /household-members/{id}/profile`).
- **Q1 name is editable.** This **supersedes the 1 Oct morning rule "names can't be edited"** for the popup. A popup edit sets `name_source='user_edited'`; on a later CAS it follows the existing CAS-name rules (a completely different name asks, a longer variant updates, a shorter one is kept). Only onboarding `user_entered` names are replaced silently.
- **Q2** a member whose CAS had no PAN: PAN is editable, required (422 `pan_required`, nothing written) and counts toward the %. **Q3** PAN on another account: the dashboard opens with a red banner, every Save that leaves `pan_conflict` set shows a second warning, the PAN never counts (max 80%). **Q4** Self has a % too; phone and email are read-only (from `users`) with a "Change in Account Info" link; only Self's name is editable. **Q5** five fields at 20% each, computed on every read and never stored; Exit always asks "Skip completing {name}’s profile?".
- **Execution rulings.** Merge is allowed only when the source is `origin='cas_detected'` (replaces the old `not source.is_locked` guard). The 0023 backfill also flags rows whose detected PAN another account holds as `pan_conflict`. `MemberLockReason` was deleted in Task 3, not Task 2, to keep the app importable between tasks. Deleting a detected member's last import keeps the member once they have profile data (`removed_with_last_import`). Migration number is 0023; the deferred `users.primary_goal` drop moves to 0024.

## 2026-10-05/06 — CAS import fix plan: decisions for the 25-issue deep dive

Source: `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html` (artifact https://claude.ai/artifact/Jwgw3go9zSz7MnRZkJtsuR); #n = issue number there. Deferred items in detail: `Docs/investigations/2026-10-06-cas-import-deferred-items.md`. Supersedes the 2026-10-01 handoff's conclusion that the 10-year value discrepancy is not in Unifolio's code: casparser is correct and the bugs are ours (opening balance never saved, plus 24 others). Nothing is implemented yet.

- **#1 opening-balance cost: hybrid.** CAS "Total Cost Value" minus the FIFO cost of in-period purchases still held, sanity-checked against the fund's pre-start NAV range; otherwise units × NAV on the statement start date. One opening lot per folio, dated on the earliest statement's start. **The approximate purchase date ("Bought ~ Mar 2014") is documented, not built in this pass** (2026-10-06).
- **#3 gifted units:** lot cost = NAV on the gift date (as the CAS prints); type kept as `gift_in` so a later tax feature can ask for the donor's cost.
- **#5 deleting an import:** a `transaction_imports` link table, not rebuild-on-delete.
- **#6 reconciliation:** closing-balance + NAV check after confirm, stored in the existing `folios.coverage_gap_details`, shown on a **staging-only** Import health page (Profile menu → Import health; backend route registered only when `ENVIRONMENT=staging`, read-only).
- **#7 plan type when nothing decides:** Regular with an "unverified" tag (`folios.plan_verified`).
- **#8 fund identity:** **option D**: a daily upsert of AMFI NAVAll (~14,354 live schemes, ~1.5 MB; not 40k new rows a day) into the existing `schemes` table, ISIN-first lookup + NAV fingerprint; casparser's bundled ISIN list as fallback for closed funds; mfapi only for NAV history. Unidentifiable closed funds import as "closed fund" (`schemes.amfi_code` nullable).
- **#11 active SIPs:** an SIP is stopped after more than 3 missed monthly instalments; it reactivates automatically when a later upload shows a new instalment (derived per request, nothing stored). Updates the 2026-08-18 SIP cadence spec.
- **#12 portfolio history:** its own page. **Desktop: a new top-nav "History" tab; mobile: opened from the dashboard value card ("History ›"), the bottom bar stays at 3 tabs** (2026-10-06).
- **#22 upload errors:** placed by a stable `error_code`: wrong password inline on the upload screen with the file kept; scanned/damaged/non-CAMS-KFin/summary/demat on an error card with the right action; double confirm as a dashboard toast.
- **Removing the review screen (PRD-01 FR-5/FR-10 conflict): sequenced, not immediate.** Implement the fixes, test with the synthetic suite, and remove the review screen only when the parser is shown to be fixed (Import health all ✓ on every synthetic file and upload order), just before staging. PRD-01 to be updated at that point (2026-10-06).
- **Documented, not implemented in this pass:** #19 (parse off the event loop) and its staging timing run (synthetic files uploaded one by one when #19 is built; only one tester today), #20 (STCG/LTCG report), #24 (analytics data issues), #25 (minors as separate members; product question still open), and the #1 approximate date. Tracked in `DEFERRED_FEATURES.md` (2026-10-06 section).
- **Migration numbering:** the plan uses 0025–0028, because 0024 is already reserved for the `users.primary_goal` drop.

## 2026-10-06 — CAS import fix plan: untested areas become phase checkpoints, not a prerequisite

Implement the fixes tested so far first; the areas not yet tested run at fixed checkpoints in the plan's order of work (`Docs/investigations/2026-10-05-cas-import-fix-plan-final.html`, "Order of work") instead of before implementation starts. **Why:** none of them can change the designed fixes, and most exercise code those fixes change, so testing them now would mean testing twice.

- **Postgres-specific behaviour:** during phases 3–6, with each migration (0025–0028 up/down + backfill on the partitioned `transactions` table, Postgres functional tests).
- **Daily jobs** (NAV, TER, AAUM, analytics recompute, account deletion, CAS file expiry, plus the new AMFI master job): after phase 5, since #8 changes the `schemes` table they read.
- **Frontend checklist (C1–C14, user screenshots):** after phase 6, once all frontend fixes are in.
- **Real KFintech CAS + stakeholders' own files:** part of the phase 7 gate. The review screen is removed only when Import health is all ✓ on every synthetic file and upload order **and** on 1–2 real KFintech statements. The synthetic KFintech layout may miss real quirks; this is the main residual risk. Needs files from the user.
- **Real NSDL/CDSL CAS:** anytime, low priority (only checks #22's message).
- **Fund scores / category ranking vs independent data:** later, with #24. **Staging timing run:** later, with #19.

## 2026-10-06 — Analytics PDF open questions (4 of 4 answered)

Source: `Docs/analytics/2026-10-06-analytics-pdf-attribute-gap-analysis.md` §4. Full
cross-reference: `Docs/analytics/2026-10-06-analytics-pdf-deep-understanding.md`,
`Docs/analytics/artifacts/2026-10-06-analytics-pdf-visual-map.html`.

- **Attribute 09 (Mutual Fund Ranking) is NOT the Scorer, and was never really in conflict with
  it — correcting this session's own earlier framing.** Per Ayush: attribute 09's formula
  (PDF's 5-factor 25/25/20/15/15) is a separate, independent feature modeled on open peer-ranking
  sites (AdvisorKhoj/MoneyControl-style), performance-driven and fund-vs-fund. The Scorer
  (Unifolio's own proprietary fund-quality score) is a completely different, unrelated feature.
  **Scorer v2 (11-component, approved but unbuilt) stays on hold** until all 11 of its components
  have real data behind them — not reprioritized by this PDF. **Build attribute 09 as its own new
  feature**, literally on the PDF's 5-factor formula, independent of Scorer v1/v2 entirely; no
  formula reconciliation needed because there was never one formula to reconcile.
- **Attribute 12 (TRI benchmark sourcing): reopened and resolved — free and reachable.** Deep-dive
  investigation (`Docs/analytics/investigations/2026-10-06-tri-sourcing-feasibility-confirmed.md`) found and
  live-verified a sibling NSE endpoint (`POST .../BackPage/getTotalReturnIndexString`) serving real
  TRI data for all 4 existing benchmark indices, free, no new auth, economically validated against
  a known historical value. This is now a small, well-scoped build (schema `series_type` field +
  a second fetch function), not an open research question. **Not yet decided: whether to build it
  now as part of this PDF's work, or schedule it separately** — a sequencing call, left open.
- **Attribute 15 (stock P/E, P/B, sector): build free in-house, no paid vendor exception.** Scrape
  NSE/BSE company-fundamentals pages and/or parse AMC-published factsheets, accepting the extra
  engineering/upkeep cost to stay within the in-house-only rule. Scoped as part of the look-through
  engine's ingestion work, not a separate vendor contract.
## 2026-10-06 — Attribute 09 (fund ranking): "category-relative" parameter partially resolved, exact formula still pending

Source: brainstorming session for Sub-project 1 (attribute 09 build), continued from the
2026-10-06 Analytics PDF open-questions entry above. **Not a decision to implement from yet —
Ayush was explicit: revisit this again before any Sub-project 1 implementation starts,
specifically after further AdvisorKhoj/MoneyControl research, not treated as settled now.**

- **What's confirmed:** the PDF's composite-score formula (`0.25×3Y + 0.25×5Y + 0.20×category-
  relative + 0.15×low-volatility + 0.15×low-TER`) names "category-relative" as a fifth parameter
  distinct from the 3Y/5Y return percentiles already in the formula. Per Ayush: it measures the
  fund's return **against its own category average**, not a broad market index — "evaluates
  whether a manager beats peers, not just the general market." This direction (category-average-
  relative, not index-relative) is settled.
- **What's still open:** the exact mechanics of that comparison. WebSearch research into
  AdvisorKhoj/MoneyControl (the PDF's own stated methodology models) found AdvisorKhoj's
  "Consistent Performers" ranking uses rolling returns plus *consistency of beating the category
  average* via "a proprietary algorithm" (no published formula), and CRISIL's methodology (which
  MoneyControl surfaces) uses mean-return-and-volatility across four overlapping 9/18/27/36-month
  windows with weights 17.5/22.5/27.5/32.5% — neither is a direct, citable match for a single
  "category-relative" percentile input. Three candidate mechanics remain undecided: (a) single-
  period alpha (fund return − category average return), percentile-ranked; (b) consistency of
  beating the category average across multiple periods (AdvisorKhoj-style); (c) a multi-period
  overlapping-window weighted approach (CRISIL-style). Ayush: "even I am not sure... out of the
  options... which it should be."
- **Separately flagged, not blocking:** the ranked-fund table (PDF's "How to show it") displays
  1Y/3Y/5Y rank columns, but the weighted composite formula only ever references 3Y/5Y — 1Y rank
  needs computing for table display regardless of how "category-relative" is resolved; this is
  not in dispute, just not yet built.
- **Action before implementation:** re-examine AdvisorKhoj (advisorkhoj.com) and MoneyControl
  (moneycontrol.com/mutual-funds) more closely for a citable "category-relative performance"
  definition before picking (a)/(b)/(c) above, or decide to pick one as Unifolio's own judgment
  call if no clean external precedent exists. Do not implement attribute 09's composite score
  against any of the three candidates without this revisit.

## 2026-10-06 — Sub-project 1 "admin-configurable" values: DB-backed, no admin UI

Covers both attribute 09's ranking weights (25/25/20/15/15 default) and attribute 11's drawdown
scenario-date table, both of which the PDF calls "admin-configurable." Checked: no admin role/
permission system exists anywhere in the codebase today (no `is_admin`, no admin auth guard, no
admin UI) — building one would be a first-ever admin surface, out of proportion to either
attribute's actual feature scope.

**Decided:** store both in real DB tables (not hardcoded Python constants), but with no edit UI —
edited directly via the existing SSM-tunnel + `psql`/DBeaver access pattern (`scripts/clean-
staging-db.sh`'s pattern for staging DB access), same as how staging data resets already happen
without a UI. For attribute 11 specifically, this is paired with a documented "how to add a
scenario" guide (fields, how to source/verify dates, worked example) so Ayush can add new
scenarios correctly without needing a dev session each time — see the attribute-11 scenario-model
entry below for what that guide needs to cover.

Why DB-backed over hardcoded: Ayush found pure hardcoding "a little redundant" given values
*will* change over time (new scenarios added, possibly weight tuning later) and a migration-only
path means a full dev cycle for every tweak. Why no UI: a full admin screen is disproportionate
build effort for two config tables edited rarely, by one person, who already has DB access.

- **AMC portfolio-disclosure format survey: started now, first pass complete.** Finding
  (`Docs/analytics/investigations/2026-10-06-amc-portfolio-disclosure-format-survey.md`): the monthly
  disclosure is a **SEBI-prescribed format** (confirmed via SEBI's own Master Circular formats
  document), not 40+ ad hoc AMC inventions — core fields (ISIN, Industry, Quantity, Market Value,
  **% to NAV**) are regulatorily mandated, and `% to NAV` is exactly the "security weight inside
  fund" term the look-through formula (PDF section 00) needs, pre-computed by the AMC. What's
  still genuinely unresolved: no single aggregated cross-AMC feed (~40 separate monthly fetches,
  likely per-AMC adapters), and real file download links weren't confirmed machine-fetchable yet
  (JS-rendered AMC pages) — spike 2 (pull and diff 8-10 real files) is the recommended next step,
  not yet done.

## 2026-10-06 — CAS import: three Phase 6/7 calls (user: "go with your recommendations")

- **A held fund in no fund list imports as an "unlisted fund".** Before, a held fund missing from the AMFI master with no candidate to pick blocked the whole upload (and the planned fallback dialog would have been a dead end). Now it imports as a CAS-only fund valued at the NAV the statement prints, with a "Statement price" badge. Every CAS-only fund, closed or held, also keeps the prices its statements print as its price history, so monthly history no longer leaves such funds out (this also closes the earlier "partial months for merged-away funds" follow-up). A held fund that *does* have candidates still asks; the fallback dialog's "Not listed" imports it as unlisted. Rejected: skipping the fund (the dashboard would no longer equal the statement).
- **Stamp duty doesn't split a SIP.** From 1 July 2020 the 0.005% stamp duty lowers each instalment slightly. SIP amounts within 0.01% (at least ₹0.05) are now one SIP, and the series shows its latest amount. Rejected: adding the stamp-duty row back before grouping (depends on every layout printing that row the same way).
- **The TER "Save ~x% per year with Direct" line is dropped.** It compared two different groups of funds, so it wasn't a saving. Per-fund savings (same fund, Direct vs Regular) stay in Distributor Comparison. A ₹ total of those per-fund savings can come later.
- **Privacy note on statement prices (review L4, accepted):** a CAS-only fund's stored prices are shared reference data (`nav_history`, keyed by scheme and date, no user id). The prices are public facts, but their *dates* are the dates on one user's statement rows, so another holder of the same unlisted fund could see that someone transacted on those dates. They aren't deleted with an import or account. Accepted for MVP (no user link, no amounts or units); revisit with the DPDP retention review (ADR-004).

## 2026-10-06 — Phase 7 gate: local part passed; review screen stays until after staging

- **Local gate result:** every synthetic statement and upload order (46 scenarios, also with mfapi.in down) and two real stakeholder CAMS statements reconcile with zero funds needing review.
- **The Import Review screen stays (user, 2026-10-06):** "Do not remove the review screen … We will stage first then we will give you the screenshots … and then you can remove it." The removal (Task 3) was briefly built and then restored the same day. Its prepared, tested pieces `features/import/confirmBody.ts` and `UnidentifiedFundsDialog.tsx` stay in the tree, unused.
- **Order from here:**
  1. Staging: wipe (user's OK), deploy, a scheme-master one-off load.
  2. Upload real statements (including KFintech) with the review screen still present. Import health must be all ✓.
  3. The C1–C14 screenshots.
  4. The user confirms the gate.
  5. Then Task 3 (the removal) and the PRD-01 FR-10 / App-Flow edits.
- **Staging data:** reset with `scripts/clean-staging-db.sh` (the plan's default; no real users). Needs the user's go-ahead. `backend/scripts/reclassify_folio_plans.py` exists for any environment whose data is kept.

## 2026-10-07 — Logout confirmation, OTP email, consent by continuing, 30-day deletion grace, name-only member picker

Reviewed on the plan page https://claude.ai/artifact/UH899y4fhr6BbDdYE4Q9aU (user decisions applied there).
- **Logout** asks first ("Log out of Unifolio?", Cancel / Yes, log out), on desktop Profile and the mobile header.
- **OTP email:** highlighted words use the brand green `#22C55E` (light and dark); "you can safely ignore this email" is replaced by "contact us at support@unifolio.in" (mailbox being set up).
- **Consent by continuing:** no tick boxes. Sign-up ("Get OTP", Google "Continue"), re-consent ("Agree") and reactivation show "By continuing/…, you agree to our Terms & Conditions and Privacy Policy" with links to new public `/legal/terms` and `/legal/privacy` pages (new tab). The upload page shows "Your data is encrypted and safe with us." / "By continuing, you agree to our privacy policy.", where "privacy policy" opens the PAN disclaimer popup (Ok). Clicking the button is the consent.
- **Phone sign-up consent is recorded at the "Get OTP" click**, not at OTP verify: the versions travel with `/auth/otp/request` and are held on the OTP row (migration 0030) until verify. Supersedes the 2026-10-01 verify-time capture for phone.
- **CAMS request records no consent** (no box, no line); the PAN consent is recorded only at upload. Supersedes the 2026-10-01 `cams_request` consent.
- **Account deletion grace: 30 days** (was 5). Accounts already pending keep their 5-day date.
- **Member pickers show the name only** (no "(relationship)", no "(Me)", no %); the % stays on the "N% complete" chip and Family Members cards.

## 2026-10-07 — Sub-project 1 planning consolidated into a running doc

Full detail: `Docs/analytics/2026-10-07-sub-project-1-planning.md`. Covers attribute 09's
unresolved "category-relative" mechanics, the admin-configurability call, and attribute
11's full design (back-tested per-scheme rupee replay, no single benchmark-per-scenario
schema, 8-scenario starting library, precomputed-table Option B over live-query Option A,
costing). **Nothing in it has been executed** — no migrations, no spikes, no staging
changes; this is planning only, per the brainstorming skill's architectural path.

- **Backfill scope confirmed scenario-count-independent:** the one-time NAV-history
  backfill (Step 1) covers every scenario simultaneously, since `mfapi.in` returns a
  scheme's full history in one call — adding more scenarios later never re-triggers it.
  Only Step 2 (the per-scenario fall-% table) scales with scenario count, and does so
  trivially (~14,354 rows/scenario).
- **Testing sequencing agreed, not yet run:** a local-dev-only spike (real `mfapi.in`
  calls, local DB, local egress IP — fully isolated from staging's shared NAT IP and the
  production daily NAV job) on a small batch first, then — only if clean — a throttled,
  off-hours, one-off Fargate backfill. Staging's `nav_history` is never touched by the
  spike itself, only by the eventual real backfill.
