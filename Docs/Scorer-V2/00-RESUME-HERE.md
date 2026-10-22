# Scorer V2 — resume from here

**Status: ON HOLD since 2026-10-22, at Ayush's explicit request.** Not abandoned, not
deprioritized for a technical reason — there were too many non-trivial judgment calls
stacking up at once alongside other priorities, and he wants to make them with a clear
head in a dedicated session, not squeezed in. Zero code has been written for Scorer V2;
everything so far is planning/research docs, all now in this folder.

**If you are a future Claude/Codex session picking this back up: read this entire file
before reading anything else in this folder or touching any related code.** It tells you
exactly where the conversation stopped and what's genuinely decided vs. still open.

## What's in this folder

| File | What it is | Status |
|---|---|---|
| `Updated_and_Approved_Unifolio_Fund_Scoring_Methodology.md` | The approved spec: 11 weighted components across 7 buckets, percentile-ranked within SEBI category peers | Approved, final — do not re-litigate the weights/components themselves without a new explicit decision |
| `Scorer-v2-Calculation-Annex-Open-Questions.md` | The master open-questions tracker — Section A (judgment calls) items 1-9 all resolved; item 8 has one sub-decision still open (see below); Section B (items 10-12) and Section C (item 13) **not started** | In progress, paused mid-item-8 |
| `scorer-v2-pe-pb-feasibility-findings.md` | Valuation (PE/PB) component — fully closed 2026-10-21, paste-ready implementation code included | Closed, no action needed |
| `scorer-v2-benchmark-coverage-expansion-research.md` | Benchmark coverage for all 7 SEBI categories, the 4 risk-metric formulas (Down/Up Capture, Information Ratio), backend architecture for new benchmark data (`external_series_history` table) | Closed, no action needed |

Also relevant, not moved here (shared/repo-wide, not scorer-specific):
- `Docs/data-resources-reference.md` — repo-wide external data source index; check before researching any new data source from scratch.
- `DEFERRED_FEATURES.md` — has a Scorer V2 entry (points back here) and a separate, **general, not-scorer-specific** entry titled "Added 2026-10-22 (category-alias data bug — `scheme_universe.py`)" that surfaced during this planning work but affects the *live* V1 scorer and three other live features too. Worth fixing independently of whether/when Scorer V2 resumes.
- `backend/app/services/analytics/scheme_universe.py` — read, not touched. `canonical_category()`, `get_category_peers()`, `_CATEGORY_ALIASES`.

## The task list this work was tracked against (12 items)

1-7, 9: done. 8: in progress (see below). 10, 11, 12: not started.

1. Inventory every scorer-methodology doc (v1 and v2) — done.
2. Extract every scorer-related decision from `decisions.md` — done.
3. Extract every scorer-related deferred/open item from `DEFERRED_FEATURES.md`/`session.md` — done.
4. Compile master open-questions list — done, this is the annex doc.
5. Confirm valuation data substrate isn't a blocker — done.
6. Valuation (PE/PB) aggregator feasibility — done, fully closed, see the feasibility doc.
7. Architecture for the 4 net-new risk metrics — done, see the benchmark research doc.
8. **Resolve every open judgment call with Ayush — paused mid-way, see below.**
9. Re-review the entire approved methodology doc from scratch with Ayush — done.
10. Brainstorm/design the Scorer V2 frontend/UI rebuild — **not started.**
11. Brainstorm the data/compute architecture (precompute vs. on-demand, schema change) — **not started.**
12. Evaluate `jugaad-data` for broader NSE/stock-data needs beyond Scorer V2 — **not started.**

## Exactly where item 8 stopped

Items 1-7 and 9 of the annex doc's Section A are fully resolved and should not be
re-opened without new information. Item 8 (minimum peer-set widening) is resolved **except
for one live, unresolved sub-question** that surfaced on a closing re-audit and was still
being discussed when the pause happened:

**The open question:** fixing the Sectoral/Thematic category split (SEBI's 26-Feb-2026
circular split what used to be one "Sectoral/Thematic" category into two — "Sectoral
Fund" and "Thematic Fund" — but 174 of 255 live funds haven't been relabeled by their AMCs
yet, so a simple alias-table fix can't separate them) requires a **holdings-based
reclassifier** — new logic, not a data fix, since there's no field in AMFI's feed that
says which of the 174 legacy-labeled funds is actually single-sector vs. multi-sector
thematic.

Ayush already decided **yes, build the full reclassifier for all 255 funds** (not the
cheaper partial options of only fixing the 81 already-relabeled funds, or leaving all 255
as one combined bucket). What's still undecided is **scope**: `canonical_category()` and
`get_category_peers()` (the functions this reclassifier would have to change) are shared
infrastructure, already used today by **five live things**, not just the future Scorer V2:

- `scorer.py` — the live V1 scorer, in production
- `category_ranking.py` — a live analytics feature
- `fund_ranking.py` — a live analytics feature
- `scenario_engine.py` — the scenario-testing feature
- `amfi_factsheet_client.py` — factsheet matching

Two real options were on the table, each with genuine trade-offs, when the session paused:
- **(A) Fix it at the shared source** (`canonical_category()` itself) — correct for all
  5 features, since the 4 other live features are *also* currently treating pure-sector
  and cross-sector-thematic funds as peers, just unnoticed. Risk: regression-testing 4
  already-shipped, already-trusted live features because of a change motivated by a
  feature (Scorer V2) that isn't even live yet.
- **(B) Scope the reclassifier as a Scorer-V2-only override**, leaving the shared function
  and the 4 other live features untouched. Risk: creates two disagreeing sources of truth
  — category ranking could show a fund as "Sectoral/Thematic" while Scorer V2 shows it as
  "Thematic Fund," visible to a user looking at both screens.

**Pick up by asking Ayush which of (A) or (B) he wants**, then finish writing that
decision into the annex doc's item 8 (it currently documents both options with pros/cons
but no final pick), and only then move to Section B.

A related, separately-made decision (not blocked on the above): Solution-Oriented
Schemes (Children's Fund, Retirement Fund) stay **in scope** for Scorer V2 — they're
scored for existing, already-invested users even though the same Feb-2026 circular froze
new subscriptions into them. This lands them permanently in item 8's "low-confidence, no
merge" bucket rather than the "widen the peer set" bucket, since they'll never grow past
15 funds organically. This part is fully decided and written into the doc already.

## Section B and C — genuinely not started

Items 10-12 of the annex doc (proposed defaults, needs a sanity check before accepting)
and item 13 (a soft note) have not been discussed with Ayush at all this cycle. Don't
assume anything about them; read them fresh in the annex doc and start the same
one-by-one judgment-call conversation used for Section A.

## Standing rules that applied throughout this planning pass — keep applying them

- **Verify, don't recall.** The single biggest correction mid-session was a regulatory
  claim (SEBI's Contra/Value exclusivity rule) that turned out to be 8-months-stale
  because it came from trained-knowledge recall instead of a live check. Any claim about
  current SEBI rules, AMFI data shape, or similar external facts needs a live check before
  it goes in the doc as settled.
- **No implementation yet.** Per the project's standing instruction (`CLAUDE.md`), Scorer
  V2 build work is deferred to a dedicated future session. Fully-finalized, paste-ready
  code/spec text is fine to write directly into these docs (the feasibility doc already
  does this for Valuation); don't execute against or edit any backend file.
- **No defaults on real judgment calls.** Every open question in the annex doc that
  involves a genuine trade-off (scope, accuracy-vs-speed, product-scope) must go to Ayush
  explicitly, with real options and honest pros/cons, not a quiet pick.
- **Confirm-and-recheck before closing an item.** Items don't get marked "resolved" until
  a closing re-audit pass finds nothing left open — this caught two real mechanical bugs
  (the debt-duration merge logic) and the Contra/Value retraction above, on top of the
  Sectoral/Thematic and Solution-Oriented findings.
