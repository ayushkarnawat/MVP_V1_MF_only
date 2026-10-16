# LeapSwitch QA report — Sub-projects 1 & 2 (2026-10-16)

Based on the 20 screenshots provided against the
[LeapSwitch QA — Sub-projects 1 & 2](https://claude.ai/artifact/DgtdQyZecqBctxtFwz1ay1)
checklist, inspected directly (not summarized from your notes), plus everything not
screenshotted, which you said you checked and approved manually. Screenshot references
below are repo-relative paths under `Docs/analytics/`.

**Update (same day, second pass):** Section B's screenshots were originally the real
`CAS_...CP225296748...` account instead of `big_family_ayush_anand_7yr.pdf`; all 9 were
replaced with correct `big_family` ones (Functional checks section rewritten below). Then
A4 was replaced with a corrected screenshot taken under **Anand Karnawat** instead of Ayush
— this single screenshot resolves every AMC that was previously listed as "untested,"
including one methodology error not caught until now: Tata is also Anand's holding, not
Ayush's, so the original A5-tata.png test was checking the wrong member for Tata too, the
same mistake as Bandhan/Edelweiss/HSBC/Invesco/WhiteOak. The AMC coverage table and the
methodology-gap section below are both rewritten to close this out.

## Headline finding: HDFC is no longer broken

AWS staging (14–16 Oct) had HDFC at zero automated coverage — its Wayback CDX fallback was
being rate-limited (`HTTP 429`). On LeapSwitch, HDFC shows real data:

- `A1-banner-full.png`: viewing `big_family`, member **Ayush Karnawat**, "Overall stock
  holdings" reports **"Based on 100.0% of your portfolio"** with no AMC listed as
  unavailable — covers Ayush's 3 HDFC funds (Mid Cap, Small Cap, Flexi Cap) along with
  everything else he holds.
- `A2-stock-holdings.png`: **HDFC Flexi Cap Fund** appears as a real contributing fund to
  HDFC Bank Ltd. (5.71% of fund · 0.23% of portfolio, holdings as on 31 Aug 2026).
- `A2-overlap.png`: HDFC Mid Cap Fund and HDFC Flexi Cap Fund both appear as real columns
  in the Fund overlap heatmap, consistent with the stock-holdings view.

This is a genuine "thought it was broken, it's actually working" finding — worth
confirming whether something changed in the resolver, or whether LeapSwitch's network
path to `web.archive.org` simply isn't rate-limited the way AWS's was.

## Second headline finding: the manual-AMC picture is a mix, not uniform

Anand Karnawat's corrected coverage banner (`A4-anand.png`, "Based on 71.0% of your
portfolio") settles every AMC that was previously an open question, and the answer
isn't one-directional:

- **Confirmed still not available, matching AWS exactly:** Bandhan (all 3 funds),
  Invesco (both funds), HSBC (all 3 funds) — explicitly named in the exclusion list.
- **Confirmed now working, contradicting AWS:** Edelweiss (2 funds) and WhiteOak
  (1 fund) — neither appears in the exclusion list, so both are covered. Combined with
  HDFC above, that's three AMCs that were broken, manual, or research-gap on AWS and are
  now live on LeapSwitch.
- **Tata** turned out to have the same wrong-member problem as Bandhan etc. (it's Anand's
  holding, not Ayush's) — now confirmed working too, from the same screenshot.

Full per-AMC detail and evidence is in the table below.

## AMC coverage table — what was actually confirmed vs. not

| AMC (big_family) | Expected (AWS, 14–16 Oct) | Actually confirmed on LeapSwitch | Evidence |
|---|---|---|---|
| **HDFC** | Broken (zero coverage) | **Working** — contradicts AWS | A1, A2-stock-holdings, A2-overlap |
| **Nippon India** | Check (3 unrelated codes unmatched) | **Working**, all 3 held funds (Large/Small/Growth Mid Cap) | A5-nippon.png — all 3 appear as contributing funds under the (incidentally still-expanded) HDFC Bank Ltd. breakdown |
| **Quant** | Check (2 sheets failed sum-check) | **Working**, all 3 held funds (ELSS/Flexi/Small Cap) | A5-quant.png — same mechanism, under Bharti Airtel's contributing-funds list |
| **Tata** (Anand's holding — not Ayush's, corrected) | Check (1 sheet failed sum-check) | **Working** — not in Anand's exclusion list | Corrected A4-anand.png: Anand's banner lists 8 specific excluded funds by name; none of Tata's 3 are among them |
| **Bandhan** | Manual (AES-encrypted listing, no automated path) | **Confirmed matches AWS — not available** | Corrected A4-anand.png: all 3 Bandhan funds (ELSS, Small Cap, Flexi Cap) explicitly listed "not available from this AMC" |
| **Invesco** (big_family's holding) | Manual (PDF-only, no Excel yet) | **Confirmed matches AWS — not available** | Same screenshot: both Invesco funds (Contra, Large & Mid Cap) explicitly listed |
| **HSBC** | Manual ("not collected yet" per deploy guide) | **Confirmed matches AWS — not available** | Same screenshot: all 3 HSBC funds (ELSS, Midcap, Flexi Cap) explicitly listed |
| **Edelweiss** | Manual by design, but a Sept file had been verified locally | **Working — contradicts the "standing manual" expectation** | Same screenshot: Edelweiss's 2 held funds are *not* in the 8-fund exclusion list, out of 71.0% coverage covering everything else |
| **WhiteOak** | Research-gap, never fully onboarded | **Working — contradicts expectation** | Same screenshot: WhiteOak Flexi Cap is not in the exclusion list either |
| **Invesco** (the *real* CP225296748 account's own, separate, holding) | Manual, not available | **Confirmed correctly unavailable** | A3 shows "Invesco India Mid Cap Fund - Direct Plan - Growth — not available from this AMC" at 74.1% coverage |
| Axis, DSP, Franklin, ICICI, Kotak, Mirae Asset, Motilal Oswal, Parag Parikh, SBI, UTI, Nippon India, Quant | Working | **Working**, confirmed | Ayush's 100%-coverage, zero-exclusion view (A1); Nippon India and Quant additionally confirmed directly in A5 |

### Methodology gap — resolved

The original gap had two causes, both now fixed by the corrected A4 screenshot:

1. **The original A4 used the wrong search field.** "Overall stock holdings" has a *stock*
   search box (searches company names like "Reliance"), not an AMC/fund search — typing
   "bandhan" correctly returned "No stocks match your search" regardless of whether the
   Bandhan funds were covered. The fix was reading the coverage banner's own exclusion list
   directly instead, which is what the corrected screenshot does.
2. **Bandhan, Invesco, HSBC, Edelweiss, WhiteOak, and Tata are all held by Anand Karnawat,
   not Ayush**, in `big_family`'s data (confirmed in `truth.json`). Every earlier big_family
   screenshot (A1, A2, old A4, A5) was under "Per Member → Ayush Karnawat," which
   structurally cannot show any of these 6 AMCs.

The corrected A4, taken under Anand Karnawat, reads the banner correctly and resolves all
six in one screenshot — see the AMC table above for the per-AMC results.

## Functional checks (sub-project 2) — all pass, on big_family (Ayush Karnawat)

Confirmed from the corrected B1-a/b, B2-a/b, B3-a/b, B4-a/b, B5.png — `big_family`, member
Ayush Karnawat, 100% coverage, 0 exclusions (consistent with A1/A2):

- **Cross-section consistency (B6's check, done implicitly):** "Based on 100.0% of your
  portfolio" / "Derivative and other positions excluded from this view: 0.33%" appears
  word-for-word across Overall stock holdings, Market-cap allocation, Look-through asset
  allocation, Fund overlap, and Portfolio valuation. Same invariant as before, now
  confirmed on a second, much larger account (100 stocks, 26+ covered funds vs. the real
  account's 3) — still holding.
- **Fund overlap at real scale**: "Top 12 funds by value, out of 26 covered funds. The
  pair list below includes all covered funds" — the truncation note the checklist asked
  for is present and accurate, not silently cut off. Drill-down into SBI Flexicap × HDFC
  Mid Cap (10.41% overlap) shows real per-stock weights for both funds (Aurobindo Pharma,
  Coforge, Indian Bank, Federal Bank, Cummins India, AIA Engineering, Sona BLW, Eternal,
  AU Small Finance Bank).
- **Look-through asset allocation — arbitrage toggle, properly exercised this time**:
  B3-a (unchecked) and B3-b (checked) both show identical figures (Equity 95.11%, Debt
  0.02%, Gold 0%, Cash-like 4.54%, ₹1,68,15,275 total) and the same "No covered Arbitrage
  Fund holdings for this selection" note — correctly explaining why the toggle does
  nothing here, rather than silently failing to respond to the click.
- **Market-cap allocation**: "% of total portfolio" bucket values (Large 49.53%, Mid
  20.45%, Small 23.72%, Other 5.96%) are internally consistent with the look-through
  ring's equity-only cap split (49.53/20.45/23.72/1.41 — the 1.41% "Other" here, vs. 5.96%
  on a total-portfolio basis, is the expected difference: the equity ring's denominator
  excludes non-equity value that the total-portfolio view's "Other" bucket absorbs).
- **Portfolio valuation**: portfolio P/E 23.38x vs. Nifty 50 19.65x vs. Nifty 500 21.83x
  (18.98% / 7.10% more expensive); P/B 3.37x vs. 2.82x / 3.11x (19.42% / 8.28% more
  expensive). Coverage 94.5% (P/E) / 98.6% (P/B) of equity exposure, each excluded holding
  carrying a specific real reason (NSE P/E unavailable, no ISIN disclosed, P/E excluded
  for loss-making/unavailable earnings, Yahoo and screener.in both failed for P/B).

**Independent corroboration worth noting:** the automated synthetic-CAS value-check
harness (separate from this manual pass, run against the *whole* big_family household —
both Ayush and Anand — rather than Ayush alone) also found zero correctness mismatches
across stock holdings, overlap, and valuation, computed from first principles against the
raw `scheme_holdings`/`market_cap_classifications`/`stock_master` tables rather than by
re-deriving the app's own numbers. Two independently-built checks, two different scopes
(Ayush-only here vs. the full household there), same clean result.

**Not independently verified by me:** the PDF export (B7) — no screenshot provided, and
separately, the harness's own attempt to measure PDF print time was skipped because no
frontend dev server was reachable from this session. Print timing specifically remains
unconfirmed from any source so far.

## Sub-project 1 (section C) — self-attested, not independently verified

No screenshots were provided for C1–C5 (Fund Manager, Fund Ranking, Scenario Simulator,
TRI benchmark, Investment & Withdrawal). Per your note, you checked and approved these
manually. Recorded here as passed-by-attestation, not confirmed from evidence the way
everything above is — flagging the distinction rather than blurring it.

## Still open

1. **Angel One, Union, Navi, Zerodha, Wealth Company, Groww**: still genuinely untestable
   through the UI — no account (real or synthetic) holds funds from any of these 6. DB-level
   check on `disclosure_batches` remains the only path if you want this fully closed out.
2. **Why is HDFC (and Edelweiss, and WhiteOak) now working when AWS had them as
   broken/manual/research-gap?** Worth a short follow-up with whoever owns the resolvers —
   did fixes land, were these manually imported on LeapSwitch specifically, or does
   LeapSwitch's egress path simply not hit the same blocks AWS did? If it's the latter,
   the AWS-side fixes are still needed for production, since production stays on AWS.
3. **PDF print-time**: still unconfirmed from any source — no screenshot for B7, and the
   automated harness's attempt was skipped (no frontend dev server reachable).
