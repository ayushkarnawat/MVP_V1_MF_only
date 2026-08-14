# Backend Changelog

> Running changelog of backend changes only — endpoints added/changed, services touched, migrations run, dependencies added. Distinct from `Docs/PRDs/TDD-Unifolio.md`, which stays the current-state architecture reference, not a change history. Backfilled 2026-08-14 from `session.md` and `Docs/superpowers/plans/`/`specs/`; append new entries at the bottom, dated, never rewrite past ones.

## 2026-08-04 — Phase 0: foundation

Project scaffold, `Decimal`-safe `calc.py`, SQLAlchemy models, `Base`/`SessionLocal` setup, Alembic wired from day one.

## 2026-08-04 — Phase 1: CAS import backend

`casparser` wrapper, `mfapi.in` enrichment client, two-phase parse/confirm API routes (`backend/app/services/import_/`, `backend/app/api/imports.py`). Migration `0001_initial_schema` — full initial schema (all reference + user-data tables per Database Schema doc, including `otp_requests`/`sessions` as foundational auth tables even though Phase 2's auth logic hadn't landed yet).

## 2026-08-05 — Phase 2: Auth + Onboarding backend

`backend/app/services/auth/` (`otp.py`, `session.py`, `schemas.py`), `backend/app/api/auth.py`: `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/session/refresh`, `GET`/`PATCH /auth/me`. `POST`/`GET /household-members` (owned by Dashboard service per the TDD's API-ownership table, not Auth). Session tokens: opaque bearer, SHA-256-hashed, 30-day TTL refreshed on activity. OTP: 6-digit, SHA-256-hashed, 5-min expiry, dev-stub delivery mode (`otp_delivery_mode` setting) gating whether the raw code is echoed in the API response.

## 2026-08-06 — Phase 3: Main Dashboard backend

Holdings/allocation compute services and routes (FIFO engine, Decimal throughout).

## 2026-08-06 — Migration 0002: transaction dedupe key widened

`0002_transaction_dedupe_includes_type` — dedupe unique constraint widened to `(folio_id, date, amount, units, type)`, fixing a real duplicate-detection bug (see `decisions.md`).

## 2026-08-07 — Distributor comparison (PRD-03 FR-11)

`GET /household-members/{id}/schemes/{scheme_id}/distributor-comparison` and ARN-directory resolution logic.

## 2026-08-10 to 2026-08-13 — Phase 4: Analytics backend, all 5 parts

- **Part 1 (allocation, FR-1/FR-2):** `analytics/allocation.py`, `analytics/schemas.py`; `GET /analytics/household-members/{id}/allocation`, `GET /analytics/household/aggregate/allocation`.
- **Part 2 (TER/AAUM, FR-10/FR-11):** `analytics/amfi_ter_client.py`, `analytics/amfi_aaum_client.py`, `analytics/ter.py`; `GET .../ter`, `.../ter/direct-regular` (+ aggregate variants).
- **Part 3 (NSE benchmark, FR-8/FR-9):** `analytics/nse_indices_client.py`, `analytics/xirr.py` (pure-Decimal Newton-Raphson, no numpy), `analytics/benchmark.py`; `GET .../benchmark`, `.../benchmark/funds` (+ aggregate variants).
- **Part 4 (category ranking, FR-3/FR-4):** `analytics/scheme_universe.py` (AMFI bulk `NAVAll.txt` ingestion), `analytics/category_ranking.py`; `GET .../category-ranking` (+ aggregate variant).
- **Part 5 (Scorer, FR-5/FR-6/FR-7):** `analytics/risk_metrics.py`, `analytics/scorer.py` (composite fund score + portfolio roll-up); `GET /funds/{scheme_id}/score`, `GET /household-members/{id}/score`, `GET /household/aggregate/score`.

Backend suite grew 156 → 357 passing (2 skipped) across all five parts, verified after each.

## 2026-08-1X — CAS Import lifecycle redesign (intern-authored)

`backend/app/services/import_/state_machine.py` — 11-state import lifecycle enforcing legal transitions; a buffer cache, lifecycle service, and member-attribution logic; coverage-gap detection and opening-balance resolution; a CAMS-portal mailback URL generator and pending-request lifecycle. New `OPENING_BALANCE` transaction type. Migration `0003_cas_import_lifecycle_and_coverage_gaps`. **Not yet independently reviewed by Claude Code** against CLAUDE.md's non-negotiables (Decimal-never-float, no PAN persistence) — passes the test suite, which is a distinct claim from "reviewed."

## 2026-08-13/14 — Dashboard load-time performance fixes

`backend/app/api/imports.py`'s `confirm_import_route`: background `BackgroundTasks` NAV prefetch on import confirm (Fix A). `backend/app/services/dashboard/nav.py`: new batch function `get_navs_on_or_before`, parallelizing only the pure-network fetch leg via `asyncio.gather` while keeping all DB reads/writes sequential on one `Session` (Fix B); dialect-native `ON CONFLICT DO NOTHING` upsert closing a concurrent-insert race. `backend/app/services/dashboard/holdings.py`: process-local per-day cache for `compute_holdings`, keyed by `(household_member_ids, date.today())`, with a generation-counter + single process-local lock spanning capture/publish/invalidate, and a bounded 15-minute self-healing TTL (Fix D — took 4 review rounds to close correctly, see `decisions.md`/`log.md`). Fix C (the real fix — ADR-006's scheduled recurring NAV-refresh job) remains deferred to deployment phase. Backend suite grew 156 → 326 passing, 2 skipped, across all four rounds.

## 2026-08-14 — Multi-method auth (planned, not yet implemented)

Design finalized (`Docs/superpowers/specs/2026-08-14-multi-method-auth-design.md`) and a full TDD implementation plan written (`Docs/superpowers/plans/2026-08-14-multi-method-auth-backend-plan.md`), covering: new `auth_identities` and `pending_identity_verifications` tables; widened `otp_requests` (nullable `phone_number`/`email`, exactly-one check constraint); new `Session.auth_method` column; a generalized `otp.py` (phone + email channels, one shared code path); a new `EmailProvider` protocol with only a `StubEmailProvider` implementation (Postmark deferred, see `decisions.md`); Google ID-token verification (`google-auth` — new dependency, no client secret needed); an identity/collision-resolution service implementing the account-linking policy and Google > Email > Phone precedence; a mandatory phone-gate signup-completion flow; a new `POST /auth/oauth/google` route; widened `/auth/otp/request`/`/auth/otp/verify` routes; and per-identifier OTP-request throttling. **Not yet executed as of this entry** — this is a plan, not a shipped change; update this entry (or add a new one) once the plan is actually implemented and merged.
