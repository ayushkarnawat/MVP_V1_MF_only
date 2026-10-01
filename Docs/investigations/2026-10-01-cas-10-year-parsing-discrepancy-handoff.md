# Handoff — 10-Year CAS Statement Value Discrepancy

**Date:** 2026-10-01
**Status:** Open bug, not yet root-caused. This doc exists so a new session can
pick this up cold, without re-deriving the prior investigation.

---

## 1. The bug, in one line

For a CAS statement spanning ~10 years, the total portfolio value Unifolio
displays doesn't match the total value printed on the actual CAS statement
itself. Shorter-span statements for the same kind of portfolio don't show
this (or at least haven't been observed to).

---

## 2. What's already confirmed (don't re-derive this)

- **Not Unifolio's own import code.** There is no logic anywhere in
  `backend/app/services/import_/` that branches on how many years a
  statement spans. Confirmed by grep across that directory and the API
  layer — no "if date range > N years" anywhere.
- **The parsing itself goes through a third-party library**, not
  hand-rolled PDF parsing: `casparser` (PyPI package), wrapped in
  `backend/app/services/import_/parser.py:1-14` (`parse_cas_pdf_bytes`,
  line 329). The docstring there is explicit that this is a ported wrapper
  around `casparser`'s `CASData`/`NSDLCASData` types.
- **Leading hypothesis (unconfirmed):** `casparser`'s internal page-break /
  fund-section-boundary detection misfires more often on longer PDFs — more
  pages means more boundaries to get right, and a longer document simply
  gives it more chances to merge/split a fund's transaction block
  incorrectly.
- **Full prior writeup:** `Docs/investigations/2026-09-23-schema-and-user-journey-review.md`
  §5, "Issues 3 & 4."

## 3. What was planned but never done

The original plan was to get **two CAS statements for the same portfolio**
— one requested at a 7-year lookback, one at 10-year — and diff the parsed
output side by side to see exactly where they diverge. That pair was never
obtained: the two-file comparison depends on a stakeholder's CAS data, which
isn't available for this kind of debugging.

What's available instead: **the user's own CAS statement, requested at a
10-year span, even though their actual investing history is only the last
1-2 years** (so the file is genuinely 10-year-long in page/date-range terms,
but sparse in content). This doesn't let you diff "same data, two lookback
windows" — but it does let you check whether the parser produces a wrong
total on *a* long-span document at all, in isolation, without touching
anyone else's data.

**File location:** ask the user where they saved it — likely
`scripts/` is not it; check the scratchpad path from this session
(`/tmp/claude-1000/-mnt-d-Unifolio-code/<session-id>/scratchpad/`) first, or
just ask them directly. It contains PAN and full transaction/holdings
detail — don't commit it, don't paste its contents into any doc, and treat
it like any other secret/PII input.

## 4. Where to actually look, concretely

1. **Isolate `casparser`'s raw output first**, independent of Unifolio's
   wrapper. Call `casparser.read_cas_pdf` (or whatever the installed
   version's entry point is — check `backend/app/services/import_/parser.py`
   imports) directly on the file, outside the FastAPI app, and sum the
   holdings/transactions yourself. Compare that sum to the total printed on
   the actual PDF statement (open it, read the last page's summary table).
   - If the raw `casparser` output is already wrong → bug is upstream,
     in the library itself (check its GitHub issues / changelog for the
     pinned version in `backend/requirements*.txt` or `pyproject.toml`).
   - If raw `casparser` output is correct but Unifolio's displayed total is
     wrong → bug is in Unifolio's own aggregation layer, not the parser.
     Check `backend/app/services/dashboard/holdings.py` and
     `backend/app/services/dashboard/snapshots.py` next — that's where
     current holdings value gets computed from transactions × latest NAV.
2. **If it only reproduces on the long file**, binary-search within it:
   truncate the PDF to fewer pages (or regenerate a shorter CAS via CAMS/
   KFintech portal if the user can) and find the page count where the
   computed total starts diverging. That pinpoints the boundary-detection
   theory concretely instead of leaving it as a guess.
3. Also sanity-check Unifolio's own decimal handling in
   `backend/app/core/decimal_utils.py` (`quantize_amount`, `quantize_nav`,
   `quantize_units`) — rounding at scale across ~10 years of transactions is
   a plausible, boring alternative explanation worth ruling out before
   blaming the third-party library.

## 5. Relevant files for a new session to read first

- `backend/app/services/import_/parser.py` — the `casparser` wrapper, start here.
- `backend/app/services/import_/people.py` — folio holder / fund-section grouping logic that sits on top of raw `casparser` output.
- `backend/app/services/dashboard/holdings.py`, `backend/app/services/dashboard/snapshots.py` — where displayed total value is actually computed.
- `backend/app/core/decimal_utils.py` — rounding/precision helpers, rule out before blaming the parser.
- `Docs/investigations/2026-09-23-schema-and-user-journey-review.md` §5 — prior writeup this handoff is based on.

## 6. Suggested opening message for the new session

> Pick up the 10-year CAS parsing value-discrepancy bug. Handoff doc:
> `Docs/investigations/2026-10-01-cas-10-year-parsing-discrepancy-handoff.md`.
> I have a real CAS file to test with at `<path>`.
