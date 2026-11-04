# Synthetic gate: p20_3yr and p20_7yr fail on the Nippon Index Fund (opening-cost convention)

**Found:** 3 Nov 2026, while recording the S0 baseline for UI round 2. **Status:** cause found and confirmed by experiment; **owner decision needed** (which convention is right for real statements). **Not part of UI round 2.** Nothing in this note was changed in the product code.

## 1. What fails
The synthetic gate (`Docs/CAS Files/synthetic/harness/tools/run_gate.sh`, 44 scenarios, each normal and `MFAPI_BLOCKED=1`) gives **85 of 88 at head `4ee95496`**. The three failures:

| Run | Failing check | Fund | CAS printed cost | App invested amount | Difference |
|---|---|---|---|---|---|
| `p20_3yr` normal and blocked | `invested_mismatch` (`test_deep.py:591`) | Nippon India Index Fund - Nifty 50 Plan - Direct | 6,898,642.73 | 7,619,904.41 | +721,261.68 |
| `p20_7yr` blocked | same | same | 6,898,642.73 | 7,346,669.23 | +448,026.50 |

Units match exactly (289,300.787). In the 3yr run the app's realised gain for that fund is 567,732.86 against a truth of 7,535.86. `p20_7yr` normal passes and `p20_20yr` passes (a 20-year statement has no opening balance). Every other scenario passes. The 7 Oct record said 88/88.

## 2. Not a regression of UI round 2
The same three runs fail identically at the round's start commit `0b73a390` (same numbers, both modes). The other 85 runs pass at head, so nothing worse than the starting state.

## 3. Cause (bisected, then confirmed by experiment)
- **Bisect:** `p20_3yr` and `p20_7yr` pass at `b584ef07^` and fail at `b584ef07` ("fix: opening-cost plausibility guard no longer rejects untouched legacy lots (Root Cause A)", 20 Oct 2026, the Chandra Tripathi fix). The only file with logic changed is `backend/app/services/import_/opening_balance.py`.
- **What the commit changed for an opening lot that was PARTLY SOLD in the period** (`remaining != scheme.open_units`): the opening lot's cost per unit used to come from FIFO subtraction, `(valuation_cost - cost of in-period lots still held) / remaining opening units`. It now comes first from **average cost**, `valuation_cost / (remaining opening units + in-period units still held)`, and FIFO subtraction is only the second choice. Both readings pass the NAV band check on this fund, so the first one wins.
- **Why the numbers move:** the statement's printed "Total Cost Value" is the same figure under both readings, but the average reading spreads it over all held units and gives the opening lot a blended per-unit cost. The FIFO engine then consumes opening units first, so cost shifts between the units that were sold (realised gain) and the units still held (invested amount and unrealised gain). For this fund about ₹7.2 lakh (3yr) and ₹4.5 lakh (7yr) moves.
- **Confirmed by experiment** (scratch clone at head, nothing committed): swapping only the order of the two branches (FIFO first, average second) makes `p20_3yr` and `p20_7yr` pass again.
- **Why the synthetic harness disagrees:** the generator (`Docs/CAS Files/synthetic/gen_scenarios.py`, `_consume`) removes units oldest-first and prints the cost of the **remaining lots** (FIFO remaining cost) as "Total Cost Value". Its truth (`truth.json`, harness `cost_cas`) is therefore the FIFO convention. The Root Cause A change assumes the opposite convention.

## 4. What each side rests on
- **For average cost** (Root Cause A plan, `Docs/superpowers/plans/2026-10-19-root-cause-a-chandra-tripathi-opening-cost-plausibility-guard-fix.md`, lines 22 to 33): the plan states that CAMS/KFintech print "average cost per unit x closing units", citing casparser's source (one `cost` field, a regex over the PDF text, FIFO only in a separate gains module) and web explainers. **No real statement with a partly sold opening lot was used.** Both real failures behind the fix (the Chandra folios) had untouched opening lots, where the two readings are the same number. So the real-file gate on `chandra.pdf` (invested gap 1,082,539 to 0.91) validates the untouched-lot fix, not the average-first ordering for touched lots. The only evidence for that ordering is reasoning plus one hand-built unit test, `test_touched_lot_prefers_average_cost_over_fifo_subtraction`.
- **For FIFO remaining cost:** the synthetic generator and its 7 Oct truth, built to mimic CAMS statements (the generator comments say it was checked against CAMS behaviour for reversals). That is also unproven against a real touched lot.
- The two sides disagree and neither has been checked against a real statement that exposes the difference.

## 5. Who is affected
Any fund whose statement window starts after the fund's first purchase (an opening balance) **and** where some of the opening units are sold inside the window. For those funds the held cost basis (invested amount, unrealised gain), the realised gain and the opening-balance cash flow used for XIRR depend on which convention is right. Funds with untouched opening lots, full-history statements and funds with no opening balance are unaffected. The size of the error is not bounded by the 3 and 7 year Nippon example: it depends on how far the in-period buy prices are from the opening cost.

## 6. How to settle it with real data (recommended first step)
Use a real long-history CAS the owner already holds (`Desktop/Unifolio/CAS Files/`, never committed), for a fund with partial sales. From its full transaction ledger compute the cost of the remaining units both ways (FIFO remaining lots, and total cost over held units, i.e. average) and compare with the printed "Total Cost Value" for that fund. Whichever matches the printed figure is the convention CAMS or KFintech use. Run it on one CAMS and one KFintech statement, since they may differ. Print counts and differences only (see `harness/test_real_check.py` and `tools/run_real.sh`, which already follow that rule).

## 7. Options
1. **Verify first (recommended),** then pick 2 or 3.
2. **Real statements print average cost:** keep `opening_balance.py` as is and change the synthetic generator to print average cost, regenerate `truth.json`, and re-baseline the gate (the three runs then pass at 88/88).
3. **Real statements print FIFO remaining cost:** restore FIFO-first for touched lots in `opening_balance.py` (the order swap used in the experiment), keep the untouched-lot fix, and update `test_touched_lot_prefers_average_cost_over_fifo_subtraction` and the Root Cause A plan note.
4. **They differ by RTA:** pick by `file_type` (CAMS or KFintech) and say so in the code and the plan.

## 8. Reproduce
From a WSL clone of the repo, with `python3` from the project venv:
```
cd backend
MFAPI_BLOCKED=1 SEQ=p20_3yr.pdf MASTER_FILE="../Docs/CAS Files/synthetic/navall_2026-10-06.txt" \
  OUT=/tmp/p20_3yr.json python3 -m pytest "../Docs/CAS Files/synthetic/harness/test_deep.py" -q \
  -p no:cacheprovider -p no:warnings --rootdir "../Docs/CAS Files/synthetic/harness"
```
At `b584ef07^` it passes (8 seconds); at `b584ef07` and later it fails on `invested_mismatch`. The same run with the two `if plausible(...)` branches in the touched-lot block of `price_opening_lot` swapped passes.

## 9. Related
`session.md` and `CLAUDE.md` already note a stale drift baseline in the harness after the Chandra work ("refresh the harness's stale -5.59% drift baseline so the gate can print PASS"). This is the same family of harness-versus-fix disagreement and should be settled together.
