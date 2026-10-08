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

**Still genuinely open — resolve before or during plan-writing, not by guessing:**

- **Verify attribute 04/09/12 against the TER-linking rework that landed the same day.**
  The planning doc's own closing section ("Next in this planning pass") flags this and
  says explicitly: "Not yet investigated this session." Commit `697f5fc` ("speed up
  analytics and link TER by SEBI scheme code", 2026-10-08) substantially rewrote
  `backend/app/services/analytics/amfi_ter_client.py` (269-line diff) and added migration
  `0031_scheme_ter_link`. Attribute 04's spec explicitly models its new fund-manager job on
  "mirroring `amfi_ter_client.py`'s upsert idiom," and attribute 09's composite score reads
  TER data this file produces — but nobody has re-read the reworked file against those two
  specs to confirm the idiom/assumptions still hold. **Do this before writing the plan**,
  not after — if the upsert idiom changed shape, attribute 04's resolver architecture
  section may need a small update, not a redesign, but it needs to actually be checked, not
  assumed.
- **Attribute 11's one HYPOTHETICAL scenario has no real assumption values yet.** "US
  recession + Fed pivot" is seeded in the schema with `'Assumption TBD at admin-entry
  time.'` — Ayush (or whoever has DB access) needs to supply the actual hypothetical return
  assumptions before this specific scenario can go live. The other 7 scenarios and the
  simulator engine itself are unaffected; this is a single-row data-entry gap, not a design
  gap.
- **Migration numbering.** The planning doc's SQL snippets don't hardcode a migration
  number. As of this pass, `backend/alembic/versions/` goes up to `0032` — re-check this
  directly (`ls backend/alembic/versions/`) before writing any migration, since more may
  have landed since this guide was written. The consolidated artifact's schema-map section
  carries the same warning.
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

### Verification results — 2026-10-08 (orchestrator, read against code at `d331b04`)

The two items above were checked against the code. Each plan must carry its row below.

| Attribute | Finding | What the plan must do |
|---|---|---|
| **12** | **Breaks today's benchmark section if built as the planning doc writes it.** The doc changes only `get_index_level_on_or_before`. But four other places in `nse_indices_client.py` are keyed by index alone and would mix TRI rows with price rows: `_upsert_index_history` (its existing-date check would skip every TRI row whose date already has a price row), `_cached_date_bounds`, the 8 Oct `_fetched_from` cache and the `fresh_within` check (TRI rows would make price history look fresh, so the price series would stop updating). | Key all five by `(index, return_type)`, defaulting to PRICE. Add a regression test proving price history still refreshes and `benchmark.py`'s XIRR is unchanged once TRI rows exist. |
| **04** | (a) The `SequenceMatcher` fuzzy idiom the doc says to copy **no longer exists**: the TER rework removed all fuzzy matching after every fuzzy TER match proved wrong (923 pointed at a different fund house). (b) **Propagation bug:** the doc's step 6 attaches managers to "every plan-variant row sharing that `amfi_code`", but `schemes.amfi_code` is unique per plan variant, so that join reaches one row. (c) The parts that survive: the in-memory `existing` dict with an upsert or "checked, NULL" row (`_upsert_scheme_ter`, `_mark_checked_no_match`), the `_compact_key` cleaned-name key, and the link-once-with-a-source pattern (`ter_scheme_code`, `ter_link_source` exact/manual, manual never overwritten). | Propagate by `(amc_name, base_name)` (indexed: `ix_schemes_amc_base`) or by the SEBI code `ter_scheme_code`, never by `amfi_code`. **Ask the user** whether 04 keeps an AMC-scoped fuzzy fallback (with the 0.80 threshold and ambiguity guard) or goes exact-only plus manual entries, like TER now does. |
| **09** | Still works: `ter._latest_ter_for_scheme` exists and skips "checked, no TER" NULL rows. But TER now covers only exactly-linked funds with a known Direct/Regular plan (about 7,000 linked), so more funds in a category have no TER. | Keep the planned weight renormalisation for missing TER. Rank the TER percentile only among funds that have one, and test a category where most funds lack TER. |
| **11** | The item above understates it. The planning doc's seed SQL adds assumption rows **only for "AI/tech valuation bust"**. **Four** of the five hypotheticals have none: Strait of Hormuz closure, US recession + Fed pivot, Rupee sharp depreciation, Indian equity "lost decade". Three have a one-line stated assumption in their description, but no per-asset-class %. None of the four is in the curated 8, so they only appear under "More scenarios". | The user supplies the 4 × 4 asset-class %s and notes. Until then, a hypothetical with no assumption rows must show an explicit "assumptions not set yet" state (or be hidden from "More"), never a 0% result. This needs a decision, test included. |
| **14** | Not affected (no TER, no benchmark). | None. Plan `Docs/superpowers/plans/2026-10-08-subproject1-a14-investment-withdrawal.md` stands. |

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
