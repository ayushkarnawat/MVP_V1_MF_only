# CAS import fix plan — items documented but not built in this pass

**Date:** 2026-10-06
**Status:** Deferred by user decision (2026-10-05/06). Nothing here is implemented.
**Parent plan:** `Docs/investigations/2026-10-05-cas-import-fix-plan-final.html`
(artifact: https://claude.ai/artifact/Jwgw3go9zSz7MnRZkJtsuR). Issue numbers (#n) refer to
that plan. Decisions: `decisions.md` 2026-10-06 entry. Tracker rows: `DEFERRED_FEATURES.md`.

Five items from the 25-issue CAS import deep dive are fully designed but held out of the
current pass. Each section below is self-contained enough to pick up cold.

> **Migration numbering note.** The fix plan's in-pass migrations are **0025–0028**:
> `DEFERRED_FEATURES.md` already reserves **0024** for dropping `users.primary_goal`.
> If more migrations land first, renumber; nothing below depends on the exact numbers.

---

## 1. Approximate purchase date for opening-balance lots (part of #1)

**What's in this pass instead.** #1 itself is being fixed: each fund's CAS opening balance
becomes one `OPENING_BALANCE` lot dated on the statement start date S, priced with the
hybrid cost (CAS "Total Cost Value" minus the FIFO cost of in-period purchases still held,
sanity-checked against the fund's pre-S NAV range; else units × NAV on S). The fund screen
shows only the certain facts: "incl. N units from before [S]" and "held since at least [S]".

**What's deferred.** An *estimated* purchase month, e.g. "Bought ~ Mar 2014".

- **How it would be computed.** Implied average cost per unit = opening-lot cost ÷ units.
  Walk the fund's `nav_history` backwards from S and take the latest date where NAV
  crossed that price. Use it only when `cost_source = cas_cost` (with `nav_on_start` the
  cost per unit is by definition the NAV on S, so the estimate would be meaningless).
  If NAV never reached the price, show only "before [S]".
- **Database.** `transactions.est_acquired_on` (date, nullable), filled for
  `origin = cas_opening` rows only. Recomputed whenever the opening row is replaced by the
  earliest-statement rule.
- **API.** Add `est_acquired_on` to the holding's `opening_lot: {units, since, cost_source}` object.
- **Frontend.** Fund detail and holdings row: "Bought ~[Mon YYYY] · estimated from
  average cost · exact dates not in this statement". Hidden once a longer statement
  supplies real rows (the opening lot disappears).
- **Caveat.** It's the date of the *average* price, not of any real purchase. It must never
  feed tax holding-period logic (#20) except as an explicitly "approximate" input.
- **Why deferred.** It's a nice-to-have on top of the value fix. The certain lower bound
  (today − S) already covers the long-term-holding question for any statement older than
  one year.

---

## 2. CAS parsing blocks the single web worker (#19)

**Problem.** Staging runs one uvicorn worker on 0.5 vCPU / 1 GB
(`infra/modules/backend/main.tf:85`, `docker-entrypoint.sh`). `api/imports.py:323` calls
`parse_cas_pdf_bytes` synchronously inside an `async` route, so the event loop is blocked for
the whole parse.

**Measured** (synthetic 20-year, ₹20 Cr file, `harness/test_perf.py`): 5.6 CPU-seconds
locally → about 11 s on staging's 0.5 vCPU, peak memory 213 MB. During that time every
other request (any user) waits. The ALB idle timeout is AWS's default 60 s (`aws_lb` has no
`idle_timeout`, `main.tf:310`); first-time snapshot computation for long histories was
estimated at 2.5–3.5 min, but that is fixed separately by #12's bulk rebuild.

**Fix (designed).**
1. Run the parse via `asyncio.to_thread(parse_cas_pdf_bytes, ...)`, the same pattern as
   `commit_off_loop` (fix `bb5225f`, 2026-08-27). The PDF parsing is mostly in pdfminer
   (Python) plus PyMuPDF/PDFium (releases the GIL), so a thread keeps the loop responsive
   even if CPU-bound work shares the GIL.
2. Optional later: a second uvicorn worker (`--workers 2`) once memory headroom is
   confirmed (Fargate memory never exceeded 18.3% of 2 GB; the task is now 1 GB).
3. Test: a holdings request returns within ~1 s while a 20-year parse is in flight.

**Staging timing run (also deferred).** When #19 is implemented, upload the synthetic
files one at a time to staging (`Docs/CAS Files/synthetic/`, password `MF@123`; start with
`p3_FY`, then `p10_10yr`, `p20_20yr`, `kfin_pk_10yr`) and record parse time, confirm time,
first dashboard load and peak task memory per file.

**Why deferred.** Only one person tests staging today, so the freeze affects nobody else.
It becomes required before real multi-user traffic.

---

## 3. Short-term / long-term capital gains report (#20)

**Today.** No STCG/LTCG or holding-period code exists in Unifolio.

**What we verified.** `casparser.analysis.gains.CapitalGainsReport` (casparser 1.3.0)
produces a correct per-FY report with 31-Jan-2018 grandfathering and the 23-Jul-2024 rate
change, **but only for statements without opening balances**. It raises
`IncompleteCASError` when any scheme's opening balance is non-zero, so it works on a
full-history (since-inception) file and refuses a 10-year file.
Example on the synthetic 20-year file: FY2024-25 Nippon LTCG ₹13.6 L, ₹9.7 L taxable.

**Design.**
- Build on our own FIFO lots after #1–#3 are fixed (complete rows, opening lots, gift and
  bonus lots), not on casparser's module, so it works for any lookback.
- Rules: equity vs debt classification from `schemes.sebi_category` (after #8's AMFI master
  normalisation), holding periods, grandfathering FMV as of 31-Jan-2018, the post-1-Apr-2023
  debt-fund rule, the 23-Jul-2024 rate and exemption-limit changes.
- Opening-balance lots: holding period is at least today − S (certain). Their cost is
  `cas_cost` or `nav_on_start`. Mark any gain computed from them as **approximate** unless the
  user enters the real cost and date (`transactions.cost_source = user_entered`, an enum
  value to add then).
- Gifted units (`type = gift_in`): Indian tax uses the donor's cost and date. Ask the user;
  until then mark approximate.
- No stored report table. Compute on request from transactions.
- Frontend: a Capital gains page by FY with an "approximate" badge and an "edit cost/date"
  action for opening and gift lots; CSV export.

**Why deferred.** It depends on #1–#3 landing first, and it's a new feature, not a bug fix.

---

## 4. Analytics data issues (#24)

Analytics computes correctly from its inputs (percentile formula consistent; portfolio XIRR
equals the dashboard's lifetime XIRR), but three inputs are wrong:

1. **Category split.** "Equity Scheme – Large Cap Fund" and "Equity Schemes – Large Cap Fund"
   show as two allocation slices. Category text comes from two sources (mfapi meta vs AMFI
   NAVAll headers) with different spellings. Fix: take `sebi_category` from the AMFI master
   (#8) and normalise (singular "Scheme", dash and whitespace variants) in one helper used by
   allocation, category ranking and `scheme_universe.get_category_universe`.
2. **Debt fund vs equity benchmark.** HDFC Liquid was benchmarked against the Nifty 500.
   `analytics/benchmark.py` maps categories to equity indices with no debt branch. Fix: a
   debt/liquid rule (a liquid/debt index if one is available in the benchmark data,
   otherwise "No suitable benchmark" instead of a misleading comparison).
3. **TER coverage 43%.** TER was found for ₹8.23 Cr of ₹19.08 Cr in the test portfolio.
   `amfi_ter_client.py` (~line 232) fuzzy-matches TER rows by name and only for schemes
   whose name already says Direct/Regular. Fix: join TER on AMFI code via the master (#8).
   This overlaps #17's backend fix; whichever lands first does it.

No schema change. **Why deferred:** user decision 2026-10-06. #8's AMFI master (in this pass)
is the prerequisite that makes items 1 and 3 small.

---

## 5. Minors' folios attributed to the guardian (#25)

**Problem.** A minor's folio usually carries no PAN of its own; the CAS prints the holder as
"NAME (MINOR)" and a "Guardian: NAME" line. `services/import_/people.py` groups PAN-less
folios into the addressee, so the child never appears as a separate member: their SIP and
units show under the guardian. Seen on synthetic `px_14yr.pdf` (ANANYA VIKAS RAO (MINOR)
under KAVYA).

**Design.** Detect a holder line ending in "(MINOR)" or a "Guardian:" line, and create a
separate person (relationship Child) in the "N members detected" popup. No schema change;
uses `household_members.relationship`. Their PAN stays empty (minors usually have none).

**Open product question (for when it's picked up).** Show minors as separate family
members (recommended; tax clubbing with the guardian can be shown later), or keep them under
the guardian?

**Why deferred.** User decision 2026-10-06. This is the same item as the "Minors' folios"
row already in `DEFERRED_FEATURES.md` (CAS Member Detection, decision I6 "Later"); this
section adds the concrete detection rule and test file.
