# Handoff — Opening-Cost Plausibility Guard Inflates Total Invested + XIRR

**Date:** 2026-10-10 (investigation), documented 2026-10-12/13 ahead of a staging DB wipe,
end-to-end verified 2026-10-13 (synthetic file), re-verified 2026-10-14 against the real
`chandra.pdf` (the actual household CAS, not the synthetic reconstruction).
**Status:** All three symptoms now root-caused and confirmed end-to-end against the
running app, against the **real file**. **Root Cause C turned out not to be a bug at
all** — see §4. **No fix implemented yet for A or B — by explicit user decision, fix
direction needs Ayush's input first (§6); this is a product decision, not a pure code
choice.**

**2026-10-14 update, read this first:** the real `chandra.pdf` was run through the full
import → dashboard pipeline (not just `casparser`). This closed out every open item from
the 2026-10-13 pass:
- Root Cause A: audited all 38 opening-lot schemes across **both** household members, not
  just the 2 already known. Still exactly 2 affected (§2.3) — but found a **third,
  latent, not-yet-triggered defect** in the same guard: 3 Axis schemes' mfapi.in history
  contains a single corrupted `nav=0.00000` data point that silently defeats the lower
  bound of the plausibility check for any fund whose history contains it (§2.4). Harmless
  this time only because those 3 funds' real costs are legitimately low; a future
  genuinely-wrong-but-positive CAS cost on a fund with the same mfapi.in defect would
  sail through undetected.
- Root Cause B: confirmed `current_holdings_xirr` is **not** a separate bug — for this
  household it's numerically identical to `lifetime_xirr` because nothing has ever been
  fully redeemed (§3.3). More importantly, found a household member (Chandra Tripathi)
  whose entire portfolio has **zero** Root Cause A hits (every opening lot correctly
  priced at CAS cost) yet whose XIRR is still extreme (197.8%, even higher than
  Surendra's 104.3%) — direct proof Root Cause B inflates XIRR independently of Root
  Cause A, not merely as an amplifier of it (§3.4).
- Root Cause C: **resolved, and it is not a bug.** The entire ₹14.58L-ish gap is
  explained by comparing a live "today" portfolio value against the CAS statement's own
  valuation date (2026-08-24, ~7 weeks earlier) — see §4. It does **not** share a cause
  with, and is **not fixed by**, Root Cause A.

## 0. How this was found

Ayush opened Chandra Tripathi's (a co-founder's family member's) household dashboard on
staging after a weekend capacity bump, and noticed "Total Invested" didn't match the
real CAMS/KFintech Consolidated Account Statement, and that Lifetime XIRR showed
110.58% — implausibly high. He supplied a screenshot of the real statement's Portfolio
Summary page (period 01-Apr-2026 to 25-Aug-2026) for comparison.

## 1. The three symptoms, one line each

| Symptom | Dashboard showed | Real CAS statement | Status |
|---|---|---|---|
| Total Invested inflated | ₹1,63,73,196 | ₹1,52,66,000.05 (Cost Value) | **Root-caused — §2** |
| Lifetime XIRR implausible | 110.58% | n/a (not printed on a CAS) | **Root-caused — §3** |
| Market Value gap | ₹2,39,61,083 | ₹2,54,18,899.10 | **Resolved — not a bug, §4** |

## 2. Root Cause A — opening-cost plausibility guard rejects genuine legacy costs

### 2.1 The code

`backend/app/services/import_/opening_balance.py`, `price_opening_lot()`:

```python
# backend/app/services/import_/opening_balance.py:48-58
series = sorted(nav_series or [])
before = [n for d, n in series if d < start]
cost = ((scheme.valuation_cost - held_cost) / remaining
        if remaining > 0 and scheme.valuation_cost is not None else None)
# Artifact #1: use the whole pre-start NAV range to reject implausible CAS cost.
plausible = cost is not None and cost > 0 and (not before or min(before) <= cost <= max(before))
source = CostSource.CAS_COST if plausible else CostSource.NAV_ON_START
if not plausible:
    on_start = [n for d, n in series if d <= start]
    first_nav = next((t.nav for t in sorted(txns, key=lambda t: t.txn_date) if t.nav and t.nav > 0), None)
    cost = on_start[-1] if on_start else first_nav or scheme.valuation_nav or Decimal("0")
```

This is the "hybrid cost method" (module docstring: "Hybrid CAS opening cost; artifact
#1, 'Decided: the hybrid cost method'"). Intent: trust the CAS-printed opening-lot cost
(`CostSource.CAS_COST`) unless the implied cost-per-unit falls outside the range of the
scheme's own pre-statement-start NAV history — in which case assume the CAS cost is
corrupted/garbage and substitute the NAV at/just before the statement start
(`CostSource.NAV_ON_START`) instead.

`nav_series` is **not** read from Unifolio's own `nav_history` DB table at import time —
it's fetched live from `https://api.mfapi.in/mf/{amfi_code}` on every import
(`backend/app/services/import_/service.py:292` calls `price_opening_lot(scheme, txns,
parse_result.statement_from, histories.get(scheme.key))`; `histories` is built from
`backend/app/services/dashboard/nav.py`'s `_fetch_nav_history_uncached()`, which hits
mfapi.in directly and generally returns the scheme's full history from inception). This
rules out "shallow local NAV backfill" as an explanation — the guard's blind spot is
structural, not a data-freshness problem.

### 2.2 The blind spot

The guard cannot distinguish "genuinely corrupted CAS cost data" from "a real, correct,
very old purchase price that happens to sit below (or very near) the lowest NAV mfapi.in's
date range happens to cover for that scheme." mfapi.in's returned series is not guaranteed
to reach back to a fund's true inception — only to whatever range that API source has
indexed — so "below the observed floor" proves "outside what we could fetch," not
"wrong."

### 2.3 Confirmed, exact reconciliation

Household member **Surendra Kumar Tripathi** (`d9b4456a-e776-4a60-a0f3-5dd9a20f7fd3`),
from the same consolidated family CAS as Chandra Tripathi's dashboard:

**HDFC Flexi Cap Fund - Regular Plan - Growth** (ISIN `INF179K01608`, AMFI `101762`,
folio `743845 / 47`):
- Real CAS: 603.209 units, Cost Value ₹30,000.00 (≈₹49.73/unit), no in-period
  transactions (pure legacy opening balance).
- mfapi.in's pre-2026-04-01 NAV floor for AMFI `101762`: ₹91.226 — real cost/unit is
  **~46% below** this floor → rejected as implausible.
- Stored instead: `NAV_ON_START` (NAV at/just before 2026-04-01) = ₹1,844.368/unit →
  stored cost ₹11,12,539.38.
- **Excess: ₹11,12,539.38 − ₹30,000.00 = ₹10,82,539.38.**

**Sundaram Multi Asset Allocation Fund - Regular Growth** (ISIN `INF903JA1LH5`, AMFI
`152311`, folio `61010262913 / 0`):
- Real CAS: 9,999.5 units, Cost Value ₹100,000.00 (≈₹10.0003/unit), no in-period
  transactions.
- mfapi.in's pre-2026-04-01 NAV floor for AMFI `152311`: ₹10.0148 — real cost/unit is
  only **~0.15% below** this floor (almost certainly a legitimate purchase-day timing
  difference, not corrupted data) → still rejected.
- Stored instead: `NAV_ON_START` = ₹12.4664/unit → stored cost ₹1,24,657.77.
- **Excess: ₹1,24,657.77 − ₹100,000.00 = ₹24,657.77.**

**Combined excess: ₹10,82,539.38 + ₹24,657.77 = ₹11,07,197.15**, which matches the
dashboard-vs-statement Total Invested gap (₹1,63,73,196 − ₹1,52,66,000.05 =
**₹11,07,195.95**) to within ~₹1 (rounding across the full household). This closes Root
Cause A with full numeric certainty — these two funds account for the entire gap.

Evidence trail used to confirm this (not reproducible once staging is wiped, which is
why the synthetic file in §5 exists):
- `imports.raw_parser_output` (JSONB) for this household member's import — the complete
  raw casparser parse, including each scheme's real `valuation.cost`/`valuation.nav`/
  `valuation.value` and `open`/`close` units.
- A direct SSM-tunnelled `psql` query against `transactions`/`folios`/`schemes` joined on
  `household_member_id`, filtering `type = 'opening_balance'` and grouping by
  `cost_source`, confirming both funds' stored `cost_source = 'nav_on_start'`.
- A live fetch of `https://api.mfapi.in/mf/101762` and `.../152311` to get the actual
  pre-2026-04-01 NAV floors quoted above.

### 2.4 Household-wide audit against the real file, 2026-10-14 — "is it really just these two?"

Ayush asked not to just re-check HDFC and Sundaram but to go through the real file's
**every** opening-lot scheme (not the 2 already known), across **both** household
members, and specifically to look again at a "flexi cap" fund he flagged as looking off.

Ran the real `chandra.pdf` (password `MF@12345`) through the full import → dashboard
pipeline with the production scheme master loaded, traced every `price_opening_lot()`
call, and cross-checked each of the 38 opening-lot schemes' pre-start NAV floor/ceiling
against its stored cost and `cost_source`. Result: **still exactly 2 of 38**, same two
funds as §2.3, with the exact same NAV-per-unit outputs the synthetic file produced
(₹1,844.3680/unit HDFC, ₹12.4664/unit Sundaram) — the synthetic file's reconstruction was
faithful, and no other scheme in the household is misclassified by this guard.

**Both hits belong to Surendra Kumar Tripathi, not Chandra.** His HDFC Flexi Cap holding
is 100% opening-balance (603.209 of 603.209 units, zero in-period purchases) — this is
almost certainly the fund Ayush meant by "flexi cap... seems to be off": it's the
flagship, most-visible instance of this exact bug in this exact household, and it also
sits inside the member whose XIRR this guard directly inflates (§3.4). The household also
holds 3 other "Flexi Cap"-named funds (Chandra's own HDFC Flexi Cap, ICICI Prudential
Flexicap, Parag Parikh Flexi Cap) — all of them priced correctly at `cas_cost`; none is
named "Axis Flexi Cap" (no such fund exists in this household). If "access flexi cap"
meant something else, it needs re-stating — but the single fund that is actually
misclassified by this guard, in this household, is Surendra's HDFC Flexi Cap, and it's now
fully accounted for.

Also reconciled unit-level data for all 44 schemes system-wide (summing units across every
folio per ISIN, both members combined, including the two IDCW payout/reinvestment ISIN
pairs below): **zero unit mismatches** anywhere in the household once properly aggregated.
The app's unit/value aggregation is correct to the unit everywhere it was checked.

### 2.5 New, related finding — a single corrupt mfapi.in data point can silently defeat the lower bound

While building the household-wide audit table, three Axis schemes
(`INF846K01CQ8` Axis Focused Fund, `INF846K01DP8` Axis Large Cap Fund, `INF846K01EH3`
Axis Mid Cap Fund — all under Surendra) showed a pre-start NAV **floor of ₹0.00000**, a
pattern no other scheme in the table showed. Traced to the data source, not our code:

```
$ curl -s https://api.mfapi.in/mf/120468 | ...  # Axis Focused Fund - Direct Plan
zero-nav points: 1
{'date': '07-04-2013', 'nav': '0.00000'}
```

All three Axis AMFI codes (`120468`, `120465`, `120505`) return the exact same single
corrupted row, `07-04-2013, nav=0.00000` — the same date across multiple schemes at the
same AMC strongly suggests a one-off AMC/registrar data-feed glitch on that date that
mfapi.in ingested verbatim, not anything in our fetch or parsing code.

The guard's plausibility check is `min(before) <= cost <= max(before)` (§2.1). A single
`0.00000` entry anywhere in the pre-start window drags `min(before)` to `0`, which makes
the lower bound trivially satisfied by **any** positive cost — the two-sided band quietly
degrades to a one-sided (ceiling-only) check for that scheme. It was harmless here only
because the real CAS costs for these 3 funds (₹47.95, ₹50.21, ₹116.80 per unit) are
legitimately plausible anyway; nothing was actually being screened out that should have
been caught. But the mechanism means: if a future fund's mfapi.in history happens to
contain one bad zero (or any non-positive) data point anywhere in the relevant window, a
genuinely corrupted CAS cost that happens to be a small positive number would pass this
guard undetected, with no log or flag anywhere. This is a **latent fragility in the same
guard as Root Cause A**, not yet causing an observed symptom, worth fixing alongside it
(see §6's updated option 1).

## 3. Root Cause B — XIRR dated at statement start, not true purchase date

### 3.1 The code

`backend/app/services/dashboard/cash_flow.py:1-7` (module docstring, self-documented
design choice):

> "Purchases/SIP debits and opening balances as investment outflows (**opening balances
> on statement start**), redemptions and dividend payouts as inflow, per PRD-03 FR-7."

Confirmed at the insertion site: `backend/app/services/import_/confirm_people.py:793`
creates every `OPENING_BALANCE` transaction with `date=lot.start`, where `lot.start` is
`parse_result.statement_from` (the statement's own start date, 2026-04-01 for this file)
— **not** any true historical purchase date, because the CAS never prints one for a
legacy opening balance.

`backend/app/services/dashboard/xirr.py`'s `portfolio_xirr()` then builds its cash-flow
timeline directly from `transaction.date`:

```python
# backend/app/services/dashboard/xirr.py:32-46
def _signed_amount(transaction, extra_debit_types=frozenset()) -> Decimal:
    return -paid_amount(transaction) if transaction.type in (_XIRR_DEBIT_TYPES | extra_debit_types) else paid_amount(transaction)

def portfolio_xirr(transactions, current_value, extra_debit_types=frozenset()) -> Decimal | None:
    flows = [(transaction.date, _signed_amount(transaction, extra_debit_types)) for transaction in transactions]
    flows.append((date.today(), current_value))
    return xirr(flows)
```

### 3.2 Why this inflates XIRR for this household

38 of this household's 44 transactions are `OPENING_BALANCE` rows, all dated
2026-04-01. These represent holdings that, per the real CAS, are genuinely years old
(e.g. the HDFC Flexi Cap and Sundaram holdings above have zero in-period activity —
pure legacy balances). XIRR annualizes whatever real multi-year gain those holdings have
actually earned over an artificially short window (statement start 2026-04-01 to
today, ~6 months), because it has no way to know the money was actually invested years
earlier. Compressing a multi-year return into a ~6-month annualization window inflates
the annualized rate — consistent with, though not independently numerically reconciled
to, the observed 110.58%.

This is a **structural design characteristic**, not a one-off logic bug: it will
reproduce on any portfolio where opening-balance (pre-statement) holdings dominate cost
basis, which is common for a founder/early-adopter importing a statement that starts
partway through their real investing history.

### 3.3 "Current XIRR was looking wrong too" — checked, not a separate bug

Ayush flagged that `current_holdings_xirr` (the XIRR shown for currently-held funds only,
distinct from `lifetime_xirr` which includes fully-exited positions) "was looking wrong"
too, and asked whether that's a separate issue from the lifetime-XIRR disclaimer direction
already agreed for §3.2.

`backend/app/services/dashboard/xirr.py`'s `calculate_dashboard_xirr()` computes the two
numbers from genuinely different transaction/value sets — `current_holdings_xirr` filters
down to only schemes with non-zero units held today (`current_scheme_ids`), while
`lifetime_xirr` uses every holding regardless. They are not the same code path. But for
**this household specifically**, both members came back numerically identical to 20+
decimal places (`1.977764954497334097943291344` for Chandra, both metrics;
`1.042959247428681752655934790` for Surendra, both metrics). Checked why: **neither
member has ever fully exited a scheme** — every holdings row for both members has
non-zero units held, and there are no `SWITCH_IN`/`SWITCH_OUT` transactions in this
household's data. With no exited positions, `current_scheme_ids` covers every scheme in
`holdings`, so `current_transactions`/`current_value` collapse to exactly the same inputs
`lifetime_xirr` uses — the two numbers are identical by construction for this household,
not because of a bug in the `current_holdings_xirr` code path itself.

**Conclusion: there is no second, independent XIRR bug.** `current_holdings_xirr`
inherits 100% of Root Cause B's distortion in this household because it's computing over
the same cash-flow set as `lifetime_xirr` — a disclaimer/fix for Root Cause B will cover
both metrics here. (A household with a fully-redeemed scheme *would* produce two
genuinely different numbers; that path hasn't been audited since no such household exists
in the test data, but the code's filtering logic looks correct for that case — it's just
untested by this investigation.)

### 3.4 Proof Root Cause B is independent of Root Cause A, not just an amplifier of it

Both opening-lot misclassifications from §2.3/§2.4 belong to Surendra Kumar Tripathi.
Chandra Tripathi's own portfolio (5 holdings, all opening lots priced correctly at
`cas_cost` — zero Root Cause A hits) still shows an extreme XIRR: **197.8%**, actually
*higher* than Surendra's 104.3% despite Surendra being the one with the cost-plausibility
bug. This is strong, clean evidence that Root Cause B — dating every legacy opening
balance at the statement's own start date (2026-04-01) rather than the real, years-earlier
purchase date — inflates XIRR entirely on its own, with a correctly-priced cost basis and
zero contribution from Root Cause A. Fixing Root Cause A alone will **not** bring
Chandra's XIRR down to a plausible level; Root Cause B needs its own fix (or disclaimer)
regardless of what's decided for A.

## 4. Root Cause C — Market Value gap (resolved 2026-10-14: not a bug)

Dashboard Market Value (₹2,39,61,083 at the time of the original report) vs the real
statement's printed Market Value (₹2,54,18,899.10) — about 5.7% short. Re-run against the
real `chandra.pdf` on 2026-10-14 (app total ₹2,41,55,149.77 vs CAS truth
₹2,54,18,899.13 that day — the exact gap moves day to day since it's a live NAV
comparison, see below), broken down scheme-by-scheme by ISIN across the whole household:

- **42 of 44 schemes** showed a small negative gap (app value a few percent *below* the
  CAS-printed value), ranging roughly −1% to −7%, **always in the same direction** (app
  lower, never higher).
- **2 of 44 schemes** (Templeton India Value Fund, Mahindra Manulife Equity Savings Fund —
  both IDCW/dividend-paying variants) initially looked like a complete miss — 100% of
  value under one ISIN in the app, 100% under a *different* ISIN in the CAS truth. This
  looked like a scheme-identification bug at first, but checking units and cost basis
  resolved it: identical units held (3364.190, 1529.977) and nearly-identical cost on both
  sides. `backend/app/services/import_/identify.py:49` deliberately matches a CAS
  scheme's ISIN against the master's `isin_reinvest` column, not just `isin` — this is
  **working as designed**: the master's single scheme row correctly absorbs both the
  payout-plan and reinvestment-plan ISINs as the same underlying holding. The ~6%/~4%
  value gap on these two is the same cause as every other scheme, not a second bug (next
  point).

**Root cause of the universal small gap: the CAS statement's own valuation date is
2026-08-24** (read directly from every scheme's `valuation.date` in the real file's raw
parse — all 46 schemes share this one date, confirming it's the CAS's single
as-of-date, not per-scheme). The app, when this comparison was run, was pricing every
holding at **today's live NAV** (~2026-10-14, about 7 weeks later). A live portfolio
tracker showing "today's" value while being compared against a statement frozen at an
earlier date will always show a different number whenever the market has moved in the
intervening weeks — each scheme's individual gap is just that scheme's own NAV change
over those ~7 weeks, which is exactly why the gaps vary scheme-by-scheme (−1% to −7%)
instead of being one fixed percentage.

**This fully closes Root Cause C, and the answer to "does fixing A also fix C" is no —
they are unrelated.** Root Cause A is about a wrongly-computed *opening cost*; Root Cause
C was about comparing a *live value* to a *stale statement snapshot*. Fixing A changes
nothing about which NAV the dashboard uses for "today's" market value. There is no code
bug here to fix — the dashboard is doing exactly what a live tracker should do (show
current value); it will only ever match a CAS statement's printed Market Value on the
statement's own valuation date, by construction. If this comparison needs to be made
easier for users/support to do without confusion, that's a UI/labeling question (e.g.
showing "as of today" vs "as of statement date" explicitly), not a backend fix — flagged
here rather than assumed, per CLAUDE.md's ask-before-assuming rule.

### 4.1 Superseded — original open-investigation notes (§4/§4.1 as of 2026-10-13)

Dashboard Market Value ₹2,39,61,083 vs real statement ₹2,54,18,899.10 (~₹14.58L short,
about 5.7%). No investigation was done on this in the original session. Candidate
explanations, untested:
- Live-NAV-at-dashboard-view-time vs the statement's 25-Aug-2026 valuation date drift —
  plausible and not necessarily a bug, but not confirmed.
- A missing or mismatched scheme somewhere in the ~44-folio household (scheme-by-scheme
  reconciliation was not done).

**A fix session should treat this as a separate, open third investigation** — don't
assume it shares a root cause with §2/§3 just because it surfaced in the same report.

*(2026-10-14: this turned out to be correct — see §4's resolution above. It is not a
bug, and it does not share a cause with §2/§3.)*

#### What the real CAS PDF could additionally settle (original plan, now executed)

As of 2026-10-13 Ayush has the real file available again and can hand it to the fix
session. The synthetic file (§5) is sufficient to reproduce and fix Root Causes A and B
(it carries the real per-scheme cost/NAV/valuation numbers verbatim), but it **cannot**
resolve Root Cause C, because `gen_chandra_repro.py` only consumed `valuation.cost`,
`valuation.nav` and `valuation.value` per scheme (the single statement-date snapshot) —
it did not carry forward the information needed to isolate *which* scheme(s) contribute
to the ₹14.58L Market Value gap. Specifically, with the real PDF (or a fresh
`raw_parser_output` re-parse of it) a fix session could get exact numbers for:

- **Per-scheme Market Value reconciliation.** Sum each of the 46 schemes' real
  `valuation.value` against the dashboard's per-fund current value (not just the
  household total) to find exactly which scheme(s) carry the ₹14.58L shortfall, rather
  than guessing it's evenly distributed or NAV-drift-only.
- **Whether live-NAV drift alone explains it.** Compare the real statement's per-scheme
  NAV as of 25-Aug-2026 against mfapi.in's NAV for the same scheme on the same date
  (not "today") — if every scheme's drift-adjusted value sums close to ₹2,54,18,899.10,
  that confirms the "it's just valuation-date drift, not a bug" hypothesis from §4;
  if one or two schemes account for most of the gap instead, that points at a missing or
  misclassified holding instead.
- **A full `cost_source` audit across all 46 schemes**, not just the two already
  confirmed. §2.3 shows the HDFC and Sundaram excesses sum to within ~₹1 of the entire
  Total Invested gap, which strongly implies no other scheme was misclassified by the
  plausibility guard by a material amount — but this was inferred from the aggregate
  matching almost exactly, not confirmed scheme-by-scheme. The real PDF lets that be
  checked directly instead of assumed.
- **An exact, independently-computed XIRR for Root Cause B.** §3.2 currently says the
  compressed-window theory is "consistent with, though not independently numerically
  reconciled to, the observed 110.58%." With the real PDF's full transaction list
  (already available in `raw_parser_output` if staging still has it, or re-derivable by
  re-parsing the real PDF), a fix session can replay `portfolio_xirr()`'s exact cash-flow
  list by hand and confirm the number is produced by the dated-at-statement-start
  mechanism in §3.1, not by some other unrelated factor.

None of this blocks starting on Root Causes A and B — the synthetic file already carries
everything needed for those. Supplying the real PDF is specifically to unblock Root
Cause C and the two audit items above, which the synthetic file can't do.

*(2026-10-14: all four bullets above were executed against the real file — results are
in §2.4/§2.5 for the A audit, §3.3/§3.4 for the XIRR items, and §4 for the Market Value
reconciliation.)*

## 5. Synthetic reproduction file (covers Root Causes A and B — real-file verification in §5.1)

`Docs/CAS Files/synthetic/pdfs/realistic/r4_oak_family_legacy_cost_bug.pdf` — password
`MF@123` (same convention as every other file in `Docs/CAS Files/synthetic/`).

Built by `Docs/CAS Files/synthetic/gen_chandra_repro.py` from
`Docs/CAS Files/synthetic/chandra_repro_data/member_a.json` and `member_b.json` — a
PII-scrubbed copy of the real household's two `imports.raw_parser_output` records (fund
names, ISINs, AMFI/RTA codes, units, costs and transactions are the **real, verbatim**
values from the real bug; investor name/email/mobile/address/folio numbers/nominees are
entirely fictitious, generated by the script, not present anywhere in the committed
data files).

Verified (this session) at the `casparser` level only:
- Parses with `cas_type=DETAILED`, `file_type=CAMS`, **zero parse warnings**.
- 44 folios, 46 schemes — matches the real file's structure.
- Total Cost Value ₹1,52,66,000.05 / Market Value ₹2,54,18,899.13 — matches the real
  statement's printed totals (3-paise float-rounding difference only).
- Both bug-triggering schemes present with exact real values: HDFC Flexi Cap Fund -
  Regular Plan - Growth (603.209 units, ISIN `INF179K01608`, cost ₹30,000.00) and
  Sundaram Multi Asset Allocation Fund - Regular Growth (9,999.5 units, ISIN
  `INF903JA1LH5`, cost ₹100,000.00).

**✅ VERIFIED end-to-end, 2026-10-13** — run through `harness/test_deep.py` with
`MASTER_FILE=navall_2026-10-06.txt` (see gotcha below). Confirms, against live mfapi.in
NAV data:
- `out["invested_skipped_nav_on_start"]` contains exactly `"HDFC Flexi Cap Fund -
  Regular Plan - Growth"` and `"SUNDARAM MULTI ASSET ALLOCATION FUND - REGULAR GRO[WTH]"`
  — Root Cause A reproduces for both bug-triggering funds, no others.
- Traced `price_opening_lot()` directly: HDFC Flexi Cap's legacy lot (603.209 units, CAS
  cost ₹30,000) resolves `cost_source=nav_on_start`, stored NAV **₹1,844.3680/unit** —
  exact match to §2.3's reconciliation. Sundaram's lot (9,999.5 units, CAS cost
  ₹1,00,000) resolves the same way, stored NAV **₹12.4664/unit** — exact match.
- `xirr.lifetime_app` came back ~101% for this (differently-composed, two-fictional-
  member) household, and the harness's own independently-computed
  `lifetime_truth_incl_switch_legs` pegged the binary search's upper bound (1000%,
  i.e. "very high, specific value not meaningful at that end of the search range") —
  confirming Root Cause B's mechanism (statement-start-dated legacy opening balances
  compress a multi-year gain into a ~6-month XIRR window) produces an implausible
  number from this file's data too, independent of exactly matching 110.58%.

**Gotcha found during verification — update this file / the harness README if picked
up again:** setting `MASTER_FILE` as an env var is **not enough** on its own. A custom
script must also call `refresh_scheme_master(db, text)` explicitly (as
`test_deep.py:333-336` does) before the import; skip that call and every scheme
resolves as `identification="unlisted"` with `suggested_amfi_code=None`, so
`price_opening_lot()` is passed `nav_series=None` for every fund. Its guard's `(not
before or ...)` branch then **auto-passes as plausible** regardless of the real
cost/NAV numbers — silently masking both Root Causes A and B rather than failing loudly.
This was confirmed the hard way: the harness was first run without this call, came back
`invested_skipped_nav_on_start: []` (looked like "bug not reproduced"), and only
calling `refresh_scheme_master` explicitly surfaced the real result above.

Not yet re-verified: the household-member-split logic (which folio belongs to which
member) wasn't replicated exactly from the real file — this synthetic file assigns
`member_a.json`'s 39 folios and `member_b.json`'s 5 folios to two fictional household
members by source file, not by whatever matching logic the real import actually used.
Also found, unrelated to Root Causes A/B/C: one reconciliation mismatch, "Kotak Mid Cap
Fund - Direct Plan - Growth" (folio `1003288`), `units_differ` by `-149.681` — traced to
5 skipped transactions ("missing amount, units, or NAV — Systematic Purchase (Continuous
Offer) - Instalment NN/60 - via myCAM"). This looks like a pre-existing real-world
casparser edge case present in the real household's raw data itself (member_a.json,
not introduced by the generator) — flagged here, not investigated further, out of scope
for this session.

`truth.json` carries a `r4_oak_family_legacy_cost_bug.pdf` entry (added by the generator
script) with per-fund open/close/cost/value truth, following the existing convention
used by every other file in that directory.

### 5.1 Real-file end-to-end run, 2026-10-14 (not the synthetic reconstruction)

Ayush supplied the real `chandra.pdf` again (root-level duplicate found unprotected by
`.gitignore` and deleted — see §9). Ran it through the same import → dashboard pipeline
as §5, with the production scheme master loaded (`refresh_scheme_master`, same gotcha
applies), via an ad-hoc scratch script (deleted after use, per the repo's no-PII-script
convention — see §9).

Result: **zero parse warnings, all 46 schemes matched cleanly against the scheme master,
126 transactions added across both real household members with zero confirm-time
warnings.** Everything in §2.4, §2.5, §3.3, §3.4 and §4 above is from this real-file run,
not the synthetic file — the synthetic file's §5 verification is confirmed faithful
(identical NAV-per-unit outputs for both known bugs), but every new finding in this
2026-10-14 pass used the real data, not the reconstruction.

One unrelated, pre-existing data quirk also surfaced here independently of the synthetic
file's own Kotak Mid Cap note above: none found beyond what's already listed — the real
file's import was completely clean (0 warnings on both parse and confirm), which is
itself informative: the Kotak Mid Cap reconciliation mismatch noted for the synthetic
file above is specific to how the generator handled that one scheme's skipped
instalments, not a property of the real household's data.

## 6. Candidate fix directions — **not decided, for the next session to evaluate**

Per the systematic-debugging Iron Law, root cause is now understood but no fix has been
chosen. These are starting points, not a prescription — several involve a product
decision (flag per CLAUDE.md's "ask before assuming... ADR-or-schema conflicts" rule
rather than picking one unilaterally):

**For Root Cause A (opening-cost guard):**
1. Narrow the guard to only reject overtly impossible values (≤0, or far above the
   observed ceiling) instead of bounding on the low side against an NAV series that may
   not reach the fund's true inception — the HDFC case shows a real cost 46% below the
   fetched floor, which the current two-sided band cannot tell apart from garbage data.
2. Before trusting mfapi.in's floor as a rejection threshold, check whether its returned
   series' earliest date is itself suspiciously late relative to the fund's likely
   inception (if so, treat the plausibility check as inconclusive and default to
   `CAS_COST`).
3. Clarify intent with the person who wrote "Decided: the hybrid cost method" (the
   artifact #1 decision doc, if it still exists) — was the two-sided band a deliberate
   choice to also catch suspiciously-too-high fabricated costs, or just an
   implementation convenience? That changes which side of the band is safe to loosen.
4. **(New, 2026-10-14, §2.5)** Whatever shape option 1/2 takes, also make the floor/
   ceiling computation robust to a single corrupt data point in the fetched series —
   e.g. drop non-positive NAV entries before computing `min(before)`/`max(before)`, or
   require some minimum number of agreeing nearby points before trusting an extreme
   value. The 3 Axis funds in §2.5 show this isn't hypothetical: mfapi.in's data already
   contains at least one real zero-NAV outlier in production data this household
   actually has.

**For Root Cause B (XIRR dating):**
1. Date opening-balance cash flows at a real historical date where derivable (none
   exists on a CAS for a pre-statement legacy holding, so this likely needs either a
   user-supplied estimate or a documented limitation, not a code-only fix).
2. Surface a disclaimer/warning on XIRR when a large share of cost basis has no
   in-period transaction (e.g., >X% of cost basis is opening-balance-only) — tells the
   user the number is unreliable instead of silently showing a precise-looking but
   misleading percentage. **(2026-10-14, §3.3)** this disclaimer needs to cover both
   `lifetime_xirr` and `current_holdings_xirr` — for any household without a fully-
   exited position, both numbers are driven by the same opening-balance dates and both
   need the same warning, not just the lifetime figure.
3. This may be a genuine product-level open question (how *should* XIRR treat legacy
   opening balances at all, structurally) rather than a bug with one correct fix — flag
   it as such rather than silently picking an approach. **(2026-10-14, §3.4)** this is
   now confirmed to matter independently of Root Cause A: Chandra Tripathi's XIRR is
   extreme (197.8%) with zero Root Cause A hits anywhere in her portfolio, so whatever
   is decided here needs to stand on its own, not be treated as "covered" once A is
   fixed.

**For Root Cause C (Market Value gap):** no fix needed — §4 found this isn't a bug. If
anything is worth doing, it's a UI/labeling clarification (e.g. showing the "as of"
date next to Market Value, or a toggle to view the portfolio as of a past statement
date) so a user comparing the dashboard to a CAS they're holding understands why the
numbers differ — a product/design decision, not flagged as urgent.

## 7. Relevant files for a new session to read first

- `backend/app/services/import_/opening_balance.py` — `price_opening_lot()`, the Root
  Cause A guard (line ~53).
- `backend/app/services/import_/service.py` — where `nav_series` is fetched and
  `price_opening_lot()` is called (~line 292).
- `backend/app/services/dashboard/nav.py` — `_fetch_nav_history_uncached()` /
  `_fetch_nav_history()`, confirms the live mfapi.in fetch.
- `backend/app/services/dashboard/cash_flow.py` — `_DEBIT_TYPES`/`_CREDIT_TYPES`,
  opening-balance-at-statement-start design.
- `backend/app/services/dashboard/xirr.py` — `portfolio_xirr()`, `_signed_amount()`.
- `backend/app/services/import_/confirm_people.py:793` — where `OPENING_BALANCE`
  transactions are actually inserted with `date=lot.start`.
- `Docs/CAS Files/synthetic/gen_chandra_repro.py`,
  `Docs/CAS Files/synthetic/chandra_repro_data/*.json` — the synthetic repro file and
  its source data.
- `Docs/CAS Files/synthetic/harness/test_deep.py`, `README.md` — how to run a file
  through the real import → dashboard pipeline against independent truth.
- `backend/app/services/import_/identify.py` — `identify_scheme()`; `isin_reinvest`
  matching (§4) and the `"unlisted"` fallback that masks §2's guard when the scheme
  master isn't loaded (§5's gotcha).

## 8. Suggested opening message for a fix session

> Root cause is understood for all three symptoms (§2–§4 of
> `Docs/investigations/2026-10-10-chandra-tripathi-cas-opening-cost-plausibility-bug-handoff.md`).
> Root Cause C (Market Value gap) turned out not to be a bug — no fix needed there. Root
> Causes A and B still need a fix, but the direction is a product decision — read §6 and
> ask me before picking one. Start with Root Cause A (§2, §6): form one hypothesis, test
> it minimally against the synthetic file (§5) or the real one (§5.1), verify against
> `truth.json`/the real numbers, then do the same for Root Cause B (§3, §6) as a fully
> separate change — don't bundle the two fixes together, and don't assume fixing one
> changes the other (§3.4 shows B inflates XIRR with zero contribution from A).

## 9. Repo-hygiene note, 2026-10-14

While adding the real `chandra.pdf` for this investigation, found a byte-identical,
**unprotected** duplicate sitting at the repo root (`chandra.pdf`, not
`Docs/CAS Files/chandra.pdf`) — `.gitignore`'s `/Docs/CAS Files/*.pdf` rule only covers
the nested path, so the root-level copy would have been swept up by a broad `git add .`
and committed as plaintext real household PII. Confirmed identical with the user, deleted
the root-level copy on their explicit instruction. The nested, gitignored copy is the only
one that should ever exist in a checkout.

Also: every ad-hoc debug script written during this investigation
(`test_debug_r4.py`, `test_debug_chandra_real.py` under
`Docs/CAS Files/synthetic/harness/`) is scratch, not part of the test gate, and is deleted
once its findings are extracted — neither should be present in a later `git status`. If
you find one still present, delete it; it was left behind by mistake.
