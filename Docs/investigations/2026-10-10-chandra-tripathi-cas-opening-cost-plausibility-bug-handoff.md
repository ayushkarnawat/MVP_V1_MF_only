# Handoff — Opening-Cost Plausibility Guard Inflates Total Invested + XIRR

**Date:** 2026-10-10 (investigation), documented 2026-10-12/13 ahead of a staging DB wipe.
**Status:** Root-caused for two of three symptoms. **No fix implemented yet — by explicit
user decision, this session only identified and documented the bug.** A synthetic
reproduction file now exists for Root Causes A and B, independent of staging DB state
that may be gone by the time this is picked up — see §5's unverified caveat before
relying on it, though. Ayush also has the real CAS PDF available again and can supply it
to the fix session on request; see §4.1 for what that specifically unlocks (mainly Root
Cause C).

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
| Market Value gap | ₹2,39,61,083 | ₹2,54,18,899.10 | **Not investigated — §4, open** |

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

## 4. Open, not investigated — Market Value gap

Dashboard Market Value ₹2,39,61,083 vs real statement ₹2,54,18,899.10 (~₹14.58L short,
about 5.7%). No investigation was done on this in the original session. Candidate
explanations, untested:
- Live-NAV-at-dashboard-view-time vs the statement's 25-Aug-2026 valuation date drift —
  plausible and not necessarily a bug, but not confirmed.
- A missing or mismatched scheme somewhere in the ~44-folio household (scheme-by-scheme
  reconciliation was not done).

**A fix session should treat this as a separate, open third investigation** — don't
assume it shares a root cause with §2/§3 just because it surfaced in the same report.

### 4.1 What the real CAS PDF can additionally settle, if supplied again

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

## 5. Synthetic reproduction file (covers Root Causes A and B only — see §4.1 for C)

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

**⚠ UNVERIFIED — do not treat as confirmed:** this file has only been checked at the
`casparser` parse level (above). **It has not been run through this repo's own
import → dashboard harness** (`Docs/CAS Files/synthetic/harness/test_deep.py`), and
nobody has confirmed the running app actually reproduces `cost_source = nav_on_start`
for either fund, or an inflated XIRR, end-to-end. "Parses correctly with the right raw
numbers" is not the same claim as "reproduces the bug in the app" — the plausibility
guard in §2 depends on `price_opening_lot()` being called with the live mfapi.in NAV
series at import time, and nothing about that path has been exercised against this file
yet. Running the harness **must be the fix session's first step** (§8), before any fix
is attempted — treat §2/§3's root causes as confirmed only against the real household's
data (via `raw_parser_output`, per §2.3's evidence trail), and this synthetic file's
reproduction of them as an open hypothesis until the harness run says otherwise.
Additionally, the household-member-split logic (which folio belongs to which member)
wasn't replicated exactly from the real file; this synthetic file assigns
`member_a.json`'s 39 folios and `member_b.json`'s 5 folios to two fictional household
members by source file, not by whatever matching logic the real import actually used —
a further reason the end-to-end behavior could differ from the real case.

`truth.json` carries a `r4_oak_family_legacy_cost_bug.pdf` entry (added by the generator
script) with per-fund open/close/cost/value truth, following the existing convention
used by every other file in that directory.

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

**For Root Cause B (XIRR dating):**
1. Date opening-balance cash flows at a real historical date where derivable (none
   exists on a CAS for a pre-statement legacy holding, so this likely needs either a
   user-supplied estimate or a documented limitation, not a code-only fix).
2. Surface a disclaimer/warning on XIRR when a large share of cost basis has no
   in-period transaction (e.g., >X% of cost basis is opening-balance-only) — tells the
   user the number is unreliable instead of silently showing a precise-looking but
   misleading percentage.
3. This may be a genuine product-level open question (how *should* XIRR treat legacy
   opening balances at all, structurally) rather than a bug with one correct fix — flag
   it as such rather than silently picking an approach.

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

## 8. Suggested opening message for the new session

> Pick up the opening-cost-plausibility / inflated-XIRR bug. Handoff doc:
> `Docs/investigations/2026-10-10-chandra-tripathi-cas-opening-cost-plausibility-bug-handoff.md`.
>
> Use the synthetic repro file at
> `Docs/CAS Files/synthetic/pdfs/realistic/r4_oak_family_legacy_cost_bug.pdf` (password
> `MF@123`) for Root Causes A and B — it carries the real household's exact per-scheme
> cost/NAV/valuation numbers. **First, and before anything else**, run it through
> `Docs/CAS Files/synthetic/harness/test_deep.py` to actually confirm the running app
> reproduces `cost_source = nav_on_start` for the HDFC Flexi Cap and Sundaram Multi Asset
> funds and an inflated XIRR end-to-end — §5 is explicit that this has **only** been
> checked at the `casparser` parse level so far, not through the app itself, so don't
> treat it as settled until the harness run confirms it.
>
> I can supply the real CAS PDF again if useful — ask me for it if you need to go beyond
> Root Causes A/B. It's specifically useful for Root Cause C (§4, the Market Value gap,
> not yet investigated) and for the scheme-by-scheme / XIRR audits in §4.1 that the
> synthetic file can't do on its own, since it only carries the single-date valuation
> snapshot, not the full raw parse.
>
> Then follow systematic-debugging: form a single hypothesis for a fix to Root Cause A
> (§2, §6), test it minimally, verify against `truth.json`, then do the same for Root
> Cause B (§3, §6) — these are two independent bugs, don't bundle a single fix for both.
> Root Cause C (§4, the Market Value gap) is a separate, not-yet-investigated bug — start
> that fresh rather than assuming it shares a cause with A or B. Several candidate fixes
> in §6 are product decisions, not pure code choices — flag them back to Ayush rather
> than picking one, per this repo's CLAUDE.md working-style rule.
