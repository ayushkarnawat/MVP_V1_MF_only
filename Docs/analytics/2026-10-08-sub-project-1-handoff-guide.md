# Sub-project 1 — Handoff / Implementation Reading Guide

**Date:** 2026-10-08
**Audience:** whoever picks up Sub-project 1 next to run `writing-plans` and execute the
build. If that's you, this document is your entry point — read it before anything else
in this folder.

**What this is not:** an implementation plan. No plan has been written. This guide exists
so the next person can read everything already produced, in the right order, and know
exactly where the brainstorming phase stopped and what's left to do.

---

## 1. Where this phase stopped

Sub-project 1 (analytics attributes 04, 09, 11, 12, 14) went through the full
`brainstorming` skill architectural path: backend design (an earlier session), then a
consolidated frontend-mockup pass (this session). Both phases produced written specs and
HTML visual artifacts, reviewed and signed off.

**Per the brainstorming skill's own hard gate: written-spec approval only permits
invoking `writing-plans`.** That invocation has **not** happened. This handoff is the
stopping point — the next action on this sub-project, by whoever reads this, is to invoke
`writing-plans` (or re-confirm scope first if anything here looks stale — see §5).

Do not treat anything in this folder as permission to start writing product code
directly. The spec/artifact approval covers the design; it does not cover skipping the
planning step.

## 2. Read order

Read in this order — each layer assumes the one before it:

1. **This document** (you're here).
2. `2026-10-07-sub-project-1-planning.md` — backend source of truth. Covers all 5
   attributes' schema, computation logic, job/infra needs, and API contracts. Read this
   in full before the frontend specs; the frontend specs deliberately don't restate it.
3. `2026-10-08-sub-project-1-frontend-spec.md` — the consolidated frontend spec. Covers
   navigation placement, the locked design system, cross-cutting rules, and what's
   explicitly deferred. Read this before any per-attribute spec.
4. `artifacts/2026-10-08-sub-project-1-frontend-visual-map.html` — open this in a browser
   alongside #3. It embeds all 4 attributes' mockups at real scale in the app's actual
   tokens, plus (as of this pass) a cross-attribute schema map section near the bottom.
5. The 4 per-attribute pairs, in whatever order matches how you want to sequence
   implementation (they're independent of each other — see §4):
   - `2026-10-08-attribute-04-fund-manager-spec.md` + `artifacts/2026-10-08-attribute-04-fund-manager-visual-map.html`
   - `2026-10-08-attribute-09-fund-ranking-spec.md` + `artifacts/2026-10-08-attribute-09-fund-ranking-visual-map.html`
   - `2026-10-08-attribute-11-scenario-simulator-spec.md` + `artifacts/2026-10-08-attribute-11-scenario-simulator-visual-map.html`
   - `2026-10-08-attribute-14-investment-withdrawal-spec.md` + `artifacts/2026-10-08-attribute-14-investment-withdrawal-visual-map.html`

   Each artifact now has a "Schema & pipeline" (or "Schema & data flow") section near the
   bottom with an ER diagram (or, for 14, a data-flow diagram — it has no new table) and a
   flow/sequence diagram, grounded directly in the backend planning doc. These were added
   in this pass specifically so the diagrams are readable without cross-referencing the
   planning doc line-by-line — but the planning doc remains the source of truth if anything
   looks inconsistent.

6. `2026-10-06-analytics-pdf-attribute-gap-analysis.md` and
   `2026-10-06-analytics-pdf-deep-understanding.md` — earlier-phase docs explaining *why*
   these 5 attributes were selected out of the original PDF requirements. Useful
   background, not required to proceed, since scope is now locked in the specs above.

Attribute 12 (TRI benchmark) has a backend section in the planning doc but **no frontend
spec, no artifact, no frontend surface at all** — confirmed by grep, stated explicitly in
the consolidated spec's scope note. Don't look for a 12 frontend pair; it doesn't exist by
design.

## 3. What's locked vs. what's still open

**Locked — do not re-litigate without going back to Ayush:**

- Navigation placement for all 4 attributes (frontend spec §1) — 04/09/14 as new stacked
  Analytics sections, 11 as a new top-level `Scenarios` route.
- The design system (frontend spec §2): `frontend/src/styles/tokens.css` is final, no new
  colors/fonts, except attribute 11's two scoped non-token colors (violet + sky blue) for
  hypothetical-scenario and redemption-freeze treatment only — don't reuse those two
  elsewhere without asking.
- Charting: no new dependency. Attribute 14 adds a `bar-chart.tsx` sibling to the existing
  `pie-chart.tsx`, both on the already-installed `@visx/*`/`d3-shape` stack.
- Cross-cutting rules (frontend spec §4): decimal discipline via
  `diffDecimalStrings`/`toPercentString` (never raw float math), the honest-data floor (no
  attribute ever renders a fabricated/zeroed value for missing/insufficient data — each
  has its own explicit text for this state), attribute 11's compliance disclaimer framing,
  and "reuse over invention" for chrome/badges/patterns.
- Backend schema and computation logic per attribute (planning doc) — all of it, including
  the exact-first/fuzzy-fallback/ambiguity-guard matching design for attribute 04 (see
  `[[feedback_matching_design_philosophy]]`-equivalent reasoning already baked into the
  spec — don't re-propose banning fuzzy matching outright).

**Explicitly deferred — in scope for a later pass, not this one (frontend spec §5):**

- Attribute 11's family-member cards: the current mockup (expandable card, click to reveal
  fund-level rows) is the accepted functional baseline. A richer interactive treatment is
  wanted later but should not block this implementation.
- "Correlation X-Ray" (stock-in-a-fund cross-reference, the Adani-Hindenburg case) —
  blocked on Sub-project 2's look-through engine, which doesn't exist yet. Tracked in
  `DEFERRED_FEATURES.md`.

**Fixed in this pass, 2026-10-08 (orchestrator verification against code at `d331b04`,
reconciling an earlier draft of this section with a second independent pass against the
same code) — the planning doc and affected specs/artifacts have been updated, re-read them
rather than trusting this summary alone:**

- **Attribute 12 — was "almost broken."** The original plan only updated
  `get_index_level_on_or_before`. Four other places in `nse_indices_client.py` are keyed by
  `index_name` alone — `_upsert_index_history`, `_cached_date_bounds`, the `_fetched_from`
  cache, and `ensure_index_history_fresh`'s freshness check — and since daily price history
  already covers nearly every trading day, leaving them unfixed meant essentially every TRI
  backfill row would be silently dropped on upsert, not just "mixed" with price rows. **Now
  fixed:** the planning doc's "Attribute 12" section documents keying all five by `(index,
  return_type)`, defaulting to `PRICE`, plus a required regression test (seed a PRICE and a
  TRI row for the same date, assert both persist independently and `benchmark.py`'s
  existing output is unchanged). Not yet implemented — this is a doc fix, the code change
  and test still need writing during execution.
- **Attribute 04 — propagation bug.** The doc's step 6 said managers propagate to "every
  plan-variant row sharing that `amfi_code`" — wrong, `schemes.amfi_code` is `unique=True`
  per row (confirmed in `backend/app/models/reference.py`), so that join reached exactly
  one row, not a scheme family. **Now fixed:** propagates by `(amc_name, base_name)` via the
  existing `ix_schemes_amc_base` index instead. Also corrected: every reference to "TER's
  fuzzy matching" in this section described TER's *original* design — migration `0031`
  fully removed TER's fuzzy matching the same day this section was written (~1,040 schemes
  had been linked to the wrong fund), replacing it with exact-compact-name-only matching.
  Attribute 04's own hybrid design (exact-first, scoped 0.80-threshold fuzzy fallback,
  ambiguity guard, persisted confidence) is **not invalidated by this** — the factsheet PDFs
  this pipeline reads have no joinable code at all (unlike TER's AMFI feed), so a
  genuinely different constraint justifies keeping a fuzzy fallback here even though TER
  itself no longer has one. This is also consistent with Ayush's own general matching-design
  philosophy (hybrid layered matching preferred over banning fuzzy outright) — **no decision
  is actually pending here**, despite an earlier verification pass flagging this as a
  blocking question; the existing design is the right fit and needs no change.
- **Attribute 09 — reduced TER coverage, not a design break.** `ter._latest_ter_for_scheme`
  still works unchanged; TER now covers only ~7,000 exactly-linked schemes (down from the
  fuzzy-matched count before `0031`), so more funds in any category now lack TER entirely.
  The existing renormalization logic (step 7) already handles a missing-TER scheme
  correctly — **now added:** an explicit requirement for a test covering a category where
  most funds lack TER, and the frontend spec's "Missing 5Y" state was broadened to cover
  missing-TER too, since it's now a common case, not a rare one.
- **Attribute 11 — four hypotheticals have no assumptions, not one.** This section
  originally undercounted the gap as "one HYPOTHETICAL scenario [US recession + Fed pivot]
  has no real assumption values yet, Ayush needs to supply them" — re-verified against the
  actual seed SQL: only **AI/tech valuation bust** has `scenario_hypothetical_assumptions`
  rows; Strait of Hormuz closure, US recession + Fed pivot, Rupee sharp depreciation, and
  Indian equity "lost decade" have **zero** each. **Now fixed:** the compute logic's
  previously-undocumented fallback for a missing assumption row is now specified (an
  `assumptions_not_set` flag, no computed value at all, never a 0% or fabricated number),
  and both the backend doc and the attribute 11 frontend spec document this new state.
  **Still genuinely pending (see below), not resolved by this fix:** the actual 4×4
  percentages/notes, and whether an unset hypothetical is hidden from "More scenarios" or
  shown with the explicit state.
- **Attribute 14 — not affected, but one claim in an earlier draft of this table was
  wrong.** That draft said a plan file, `Docs/superpowers/plans/2026-10-08-subproject1-a14-
  investment-withdrawal.md`, "stands" — checked via `find` across the repo 2026-10-08: **no
  such file exists.** No `writing-plans` invocation has happened for attribute 14 or any
  other attribute in this sub-project — the HARD-GATE above is intact, nothing has been
  silently planned or built ahead of it. This was a stale/incorrect forward-reference in
  that draft, not a real gate violation; corrected here so it isn't repeated.
- **Migration numbering.** The planning doc's SQL snippets don't hardcode a migration
  number. As of this pass, `backend/alembic/versions/` goes up to `0032` (`0031_scheme_
  ter_link.py` was the most recent, landing the same day) — re-check this directly (`ls
  backend/alembic/versions/`) before writing any migration, since more may have landed
  since this guide was written. The consolidated artifact's schema-map section carries the
  same warning.
- **Attribute 11's NAV backfill batching strategy** (planning doc, Option B architecture)
  involves a 3-step precompute pipeline with real infra cost (batch NAV backfill, per-
  scenario compute, serving). The planning doc describes the approach but the actual job
  scheduling/Terraform work is not yet built — treat this as part of the implementation
  plan, not something already provisioned.
- **SEBI-consultant clearance on attribute 11's compliance disclaimer text** — shipped as a
  working default per Ayush's instruction, explicitly flagged in the frontend spec as not
  yet legally reviewed. Don't treat the current copy as final without checking whether
  that review happened in the meantime.
- **Attribute 04's per-AMC coverage is inherently exploratory, not fully pre-specifiable.**
  The resolver *architecture* (3-tier: static-HTML regex / per-AMC backend-API trace /
  permanent `MANUAL_PENDING`) is engineer-ready and needs no further design. But only 2 of 9
  sampled AMCs resolve with zero extra engineering — most of the remaining ~49 AMCs need a
  one-time, per-AMC network-trace to find that AMC's own backend API, done lazily as
  coverage grows (same posture as TER's own rollout). Whoever plans this should budget it
  as ongoing, incremental engineering work, not a single estimable task with a fixed
  end-date.

**Still genuinely open — blocking, needs Ayush's input, not guessed here:**

1. **Attribute 11's actual hypothetical assumptions.** The Equity/Debt/Hybrid/Other
   `assumed_pct_change` + `assumption_note` for each of the 4 unseeded hypotheticals
   (Strait of Hormuz closure, US recession + Fed pivot, Rupee sharp depreciation, Indian
   equity "lost decade") — 16 numbers + 16 notes, same shape as the already-seeded AI/tech
   valuation bust template in the planning doc.
2. **Attribute 11's display choice for an unset hypothetical** — hidden from "More
   scenarios" until assumptions are supplied, or shown with the explicit "assumptions not
   set yet" state. Both are consistent with the honest-data floor; this is a
   product-presentation call, not a correctness one.

## 4. Suggested implementation sequencing (not a plan — just an observation)

The 4 attributes are independent of each other (no shared new table, no shared new
component beyond already-existing chrome). The cross-attribute schema map in the
consolidated artifact shows this visually. A few things worth knowing before sequencing:

- Attribute 04 (fund manager) and attribute 09 (fund ranking) are the lowest-infra lift —
  no new scheduled job beyond what's described, additive tables that join cleanly off
  existing `schemes`.
- Attribute 11 (scenario simulator) is the heaviest lift — new top-level route, 4-table
  schema extension, a 3-step precompute pipeline, and 4 distinct result-shape states on
  the frontend. If sequencing by risk, do this one with the most lead time.
- Attribute 14 (investment/withdrawal) has zero new database schema — it's a pure
  aggregation layer over existing `transactions`/`holdings.py`/`sip.py`/`cash_flow.py`.
  Cheapest to validate end-to-end first if you want an early connected-pipeline proof.

This is an observation for whoever writes the plan, not a decision — `writing-plans` may
reasonably sequence differently once it accounts for team size, review bandwidth, etc.

## 5. Before you run `writing-plans`

1. Confirm the specs still reflect current reality: `git log` on
   `Docs/analytics/2026-10-08-*` and `backend/alembic/versions/` since 2026-10-08, in case
   something in the backend shifted after this pass (e.g., a migration landed, a table
   name changed).
2. Re-read the brainstorming skill's hard gate once more before invoking it: "written-spec
   approval only permits invoking `writing-plans`" — not any other implementation skill.
3. If anything in §3's "still genuinely open" list is unresolved and blocks planning,
   surface it to Ayush before proceeding rather than guessing — per this project's
   `CLAUDE.md`: "Ask before assuming on anything the docs mark as an open question or
   'needs your input'."

## 6. After `writing-plans`

Out of scope for this guide — `writing-plans`' own process governs what happens next
(plan review, execution method selection, etc.). This guide's job ends at the point where
that skill is invoked.
