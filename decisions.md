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

## 2026-08-14 — Multi-method auth: Postmark confirmed as the email provider (SES-vs-Postmark question closed)

**Why:** deliverability for a login-critical OTP outweighs Amazon SES's lower cost and AWS-infra alignment at this volume — settled definitively, not left as a recommendation. Wiring it up is still deferred (see the `EmailProvider`/Postmark-timing entry above), but *which* provider is no longer open.

## 2026-08-14 — Multi-method auth: email stays visible in the UI on the stub provider; Postmark becomes a firm pre-production prerequisite

**Why:** resolves an open question the design spec had explicitly flagged rather than silently picking an answer — email-as-a-method is never hidden from users, including in early dev, but `otp.py`'s existing stub-mode guard means it genuinely can't send real email once this feature runs against Postgres. Postmark wiring is therefore required before (or as part of) this feature's first Postgres/production deploy, not an open-ended "someday."

## 2026-08-14 — Multi-method auth: `pending_identity_verifications` uses one shared ~10-minute TTL for both triggers

**Why:** the phone-gate case (mid-signup, hunting for your phone) and the step-up-link case (re-authenticating an existing account) are arguably different UX situations, but a single shared window was chosen over two different values for simplicity — flagged as an open item in the design spec, explicitly resolved this way by the user rather than left to implementation-time guessing.

## 2026-08-14 — Multi-method auth: `Session.auth_method` built now, not deferred

**Why:** originally flagged as optional/deferrable in the design spec; the user asked for it to be added as a firm decision mid-session — it's a small addition and directly useful for recording which method actually completed a phone-gated signup (the completing method, not the originating Google/email identity).

## 2026-08-14 — Standing documentation discipline established: `decisions.md`, `log.md`, `backend.md`, `database.md`

Four new append-only root-level tracking files, each distinct from an existing doc (see each file's own header). **Why:** this session's multi-method-auth work was substantial enough (a design spec, a follow-on frontend spec, two full implementation plans, six-plus rounds of decision resolution) that relying on `session.md` alone — a short, prunable, overwritten-each-session pointer — risked losing the "why" behind decisions once `session.md` gets pruned. A corresponding CLAUDE.md section ("End-of-Session Documentation") was drafted to make updating all of these a standing requirement, not proposed as optional — pending the user's manual merge into `CLAUDE.md`/`session.md` (not committed automatically here, to avoid a race with concurrent edits to those two specific files).
