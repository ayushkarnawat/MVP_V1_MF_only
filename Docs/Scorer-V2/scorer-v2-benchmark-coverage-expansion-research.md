# Scorer v2 — Benchmark Coverage Expansion Research

Investigation date: 2026-10-20/21. Question: can the 4-index benchmark coverage in
`backend/app/services/analytics/nse_indices_client.py` be expanded to cover Sectoral,
Debt, Hybrid, Gold and International categories — the shared root blocker for 3 of the 5
net-new risk metrics (Down Capture, Up Capture, Information Ratio)? Freeware-only, same
philosophy as Sub-projects 1/2. All findings below are from live requests made during this
research session, not assumed from documentation.

## Reusable technique: NSE's undocumented discovery API

`niftyindices.com`'s historical-data endpoints (`getHistoricaldatatabletoString`,
`getTotalReturnIndexString`) require an exact, correctly-cased index name with no
enumeration — every prior attempt to source a new benchmark name (including earlier in
this same research session) was pure guessing against those two endpoints. There is a
second, separate family of three POST endpoints, also under `/BackPage/`, that exist
specifically so the site's own UI doesn't have to hardcode names — they enumerate the
*entire* index catalog NSE currently has live data for:

1. `gethistoricaltypedata1` — no params. Returns the 3 top-level categories: `Equity`,
   `Fixed Income`, `Multi Asset`.
2. `gethistoricaltypeSubindexdata` — JSON body `{"cinfo": {"indextype": "<category>"}}`.
   Returns sub-categories within that top-level category (e.g. Fixed Income →
   `Corporate Bond`, `Government Securities`, `Money Market`, `SDL Indices`,
   `Target Maturity Index`).
3. `gethistoricaltypeindexdata` — **form-urlencoded** body (not JSON — this is the one
   genuinely non-obvious shape), keys `cinfo[indextype]` and `cinfo[indexgroup]`, where
   `indextype` = the sub-category name from step 2 and `indexgroup` = which *data table*
   you want (`Historical Index Data`, `Total returns Index Values ` [sic, trailing space],
   or `P/E, P/B & Div.Yield values`). Returns the exact canonical index names NSE has data
   for in that sub-category/data-type combination.

This was cracked by downloading and reading `jugaad-data`'s actual source
(`jugaad_data/nse/history.py`, PyPI package `jugaad-data`, source at
[github.com/jugaad-py/jugaad-data](https://github.com/jugaad-py/jugaad-data)) rather than
guessing — its `index_type_list`/`index_subtype_list`/`index_name_list` methods wrap
exactly these three endpoints and were the source of the exact field names and encoding.
Separately, [satwikbasu/indian-market-data-endpoints](https://github.com/satwikbasu/indian-market-data-endpoints/blob/main/endpoints/niftyindices-tri-api.md)
is a community reverse-engineering writeup of the *data* endpoints (headers, the TRI
endpoint's single-quoted-string payload quirk) referenced earlier in this same research
pass — useful background, but it does not document the discovery endpoints above.

**An important negative finding, not just a positive one:** an index being *enumerable* in
this catalog does not guarantee it's *populated* — see Corporate Bond below, where the
sub-category itself exists in the taxonomy but returns zero index names under either data
type. The discovery API tells you what NSE's own site can currently query; it doesn't
promise every index NSE has ever published a name for still has a live data table behind
it.

**Where else this is useful, beyond this immediate task:**

- **PE/PB valuation data** (`indexgroup: "P/E, P/B & Div.Yield values"`) is the same
  discovery mechanism and the same underlying data family already confirmed usable for
  Scorer v2's Valuation component — see `scorer-v2-pe-pb-feasibility-findings.md`. Worth
  cross-checking task #6 (valuation aggregator feasibility) against this discovery API to
  confirm the exact index-level PE/PB series names it expects, rather than re-guessing.
- **Any future benchmark-coverage need** (e.g. if a new SEBI category or sub-index is
  added later) should start here, not with name-guessing — this discovery chain is the
  correct first step every time, not a one-off trick for this task.
- Not useful beyond the above: this is specific to NSE/niftyindices.com's own index
  catalog. It has no bearing on fund-level data (NAV, holdings, AUM), which come from
  AMFI/AMC sources entirely outside this system.

**Host-page call-site, resolved:** the discovery endpoints are called from
`developer.js` (hosted at `liveindexsa.niftyindices.com/assets/js/developer.js`, 31KB),
loaded on the same historical-data page already identified above — an earlier pass had
only grepped the sibling bundle `historicalData.js` on that page and missed it. Reading
the actual calling code confirms these are plain jQuery `$.ajax` POST calls with **no
special headers, auth token, session cookie, or referrer dependency** — e.g.
`$.ajax({ type: "POST", url: "/BackPage/gethistoricaltypedata1", success: ... })`, and for
the third endpoint, `sendjson.cinfo = getjson; $.ajax({ type: "POST", url:
"/BackPage/gethistoricaltypeindexdata", data: sendjson, ... })` — jQuery's default
`data:` serialization for a plain object is exactly the form-urlencoded `cinfo[key]=value`
shape `jugaad-data` already confirmed correct. Nothing beyond what's already been
live-tested is required; there is no hidden session/auth dependency to worry about before
relying on these endpoints in production code.

## Live-tested results, by category

| Category / sub-category | Status | Index(es) confirmed live |
|---|---|---|
| Sectoral | ✅ confirmed | Nifty Bank (and by the same mechanism, any other sectoral index — all under the `Equity` top-level category, same endpoint pattern as the existing 4) |
| Debt — Government Securities | ✅ confirmed | 12 indices incl. `NIFTY COMPOSITE G-SEC INDEX`, `NIFTY 10 YR BENCHMARK G-SEC` |
| Debt — SDL | ✅ confirmed | 3/5/10-year SDL indices |
| Debt — Money Market (→ Liquid/Overnight funds) | ✅ confirmed | **`NIFTY 1D RATE INDEX`** — this is the current SEBI-mandated benchmark for Liquid/Overnight categories (replaced the older "Nifty Liquid Index" in the 2021-23 SEBI reform); Liquid is fully solved |
| Debt — Target Maturity | ✅ confirmed | Bharat Bond series (April 2025/2030/2031/2032/2033) |
| Debt — Corporate Bond | ❌ genuinely empty, confirmed via 3 independent methods | see root cause below |
| Hybrid (all SEBI sub-categories: Aggressive/Balanced/Conservative) | ❌ genuinely empty, confirmed via 3 independent methods; resolved via Option B synthetic blend | see root cause below |
| International | ✅ confirmed — currency-adjusted, TRI not price | S&P 500 **Total Return** (`^SP500TR`, Yahoo Finance chart endpoint, live-confirmed, history to 4 Jan 1988) × USD/INR (`USDINR=X`, same mechanism) — stored value is the INR-adjusted Gross-TRI composite, not raw USD price |
| Gold | ✅ decided — LBMA × USD/INR × duty/GST reconstruction, MCX as fallback-of-last-resort | see Gold section below |

## Corporate Bond and Hybrid: root cause (confirmed, not a naming or payload bug)

Three independent checks, not one, converge on the same conclusion:

1. **Discovery-API enumeration.** `gethistoricaltypeindexdata` for `indextype: "Corporate
   Bond"` returns `[]` under both `Historical Index Data` and `Total returns Index Values `.
   The Hybrid sub-category (`Multi Asset` → `Hybrid Indices`) enumerates 7 real, working
   indices (e.g. `NIFTY MULTI ASSET – EQUITY : DEBT : ARBITRAGE : REITS/INVITS
   (50:20:20:10)`) — but **none of them is the classic "NIFTY 50 Hybrid Composite Debt
   65:35" index** that mutual fund factsheets have historically cited for Aggressive
   Hybrid funds. That name does appear on a static NSE marketing page
   (`/indices/fixed-income/hybrid-indices/nifty-50-hybrid-composite-debt-65-35-index`), but
   it is not in NSE's live discovery catalog.
2. **Direct name guesses against the proven-correct request shape.** Tested `NIFTY 50
   Hybrid Composite Debt 65:35` (and punctuation variants), `NIFTY AAA Corporate Bond
   Index`, `NIFTY Corporate Bond Index A-II` (the alternate name some fund houses cite —
   see below) against both `getHistoricaldatatabletoString` and
   `getTotalReturnIndexString`, using the exact `cinfo` payload shape confirmed correct by
   `jugaad-data`'s own working source (not my earlier, wrong, double-quoted-JSON shape).
   All return `[]`.
3. **Regulatory cross-check.** Per SEBI's 27 June 2024 Master Circular (two-tier
   benchmarking framework) and AMFI's published Tier-1 benchmark list, the actual mandated
   benchmark for most Corporate Bond Fund schemes is the **CRISIL Corporate Debt A-II
   Index** (a minority of AMCs, e.g. Nippon India and HSBC, use "NIFTY Corporate Bond Index
   A-II" as an alternate — tested above, also empty). For Aggressive Hybrid Fund, the
   mandated benchmark is the **CRISIL Hybrid 35+65 – Aggressive Index** (no Nifty
   alternative found cited by any AMC). CRISIL has no free public API and explicitly
   prohibits redistribution of its index data (portal-only access, confirmed via
   CRISIL's own indices page).

**Conclusion: this is a genuine, structural, vendor-level gap, not something further
reverse-engineering will close.** The categories' own regulator-mandated benchmarks live
with a different data provider (CRISIL) that doesn't offer a free feed, and NSE's own
nominal alternative names for the same categories have zero live data behind them despite
being enumerable in NSE's own catalog.

### Fallback options for Corporate Bond

| Option | What it does | Pros | Cons |
|---|---|---|---|
| **A — Nifty 500 fallback** (current v1-style catch-all behaviour) | Route Corporate Bond funds to the existing equity catch-all, same as any unmapped category today | Zero new code; always produces *a* number | The 3 benchmark-dependent metrics (Down/Up Capture, Information Ratio) become numerically present but conceptually meaningless — an equity index has no real volatility/correlation relationship to a corporate-bond fund's returns, so the resulting percentiles could mislead rather than inform |
| **B — Synthetic blend** | Construct a Unifolio-built index from available free components (e.g. a credit-spread proxy built from AAA PSU Bond / Banking & PSU Debt style indices plus G-Sec) | More category-appropriate than A | Corporate Bond funds don't have a natural, externally-defined decomposition the way Hybrid funds do (see below) — there's no authoritative "this is what a corporate bond portfolio equals" formula to replicate; this would be inventing a benchmark no regulator or index provider has ever published, with no external validation and real credibility risk if ever challenged |
| **C — Exclude per the already-approved §5 rule** | Per `Updated_and_Approved_Unifolio_Fund_Scoring_Methodology.md` §5 ("No silent data substitution"): when an input can't be calculated, exclude it from both the score and its weighting denominator, for that category only | Fully consistent with the methodology already signed off — no new policy needed. Zero fabricated-benchmark risk. Fully transparent and honest: the score for Corporate Bond funds is built from the remaining ~8 components (Return, Consistency, Sortino [no benchmark needed], Valuation, Cost), re-weighted to still sum to 100% | Corporate Bond funds get somewhat less granular differentiation among peers than other categories; no Down/Up Capture or Information Ratio insight shown for this one category |

**Decision confirmed: Option C.** This is the exact scenario §5's silent-substitution rule
was written for, and using it here means zero new engineering risk and zero credibility
exposure — it's a pre-approved mechanism, not a new judgment call.

**Scope, explicit:** this exclude-and-reweight treatment applies to the Corporate Bond
category only. It is not a general policy for "any category with a benchmark gap" — Hybrid
has its own gap and its own, different resolution (Option B, below), not this one. Any
future category found to have a similar benchmark-data gap needs its own explicit decision,
not an automatic application of this one.

**Accuracy impact, quantified:** the 3 excluded components (Down Capture 7.5%, Up Capture
5%, Information Ratio 10%) total **22.5 percentage points** of the 100% weight. Under
Option C these aren't lost — the remaining 77.5% (Return 25, BeatsAvg 12, TopQuartileFreq
8, Drawdown 7.5, Sortino 10, Valuation 5, CostLevel 6, CostTrend 4) is renormalized to
100%, so every Corporate Bond fund still gets a fully-weighted score, just built from 8
components instead of 11. The real question isn't "how much weight is missing" but "how
much differentiating signal is missing" — and that's lower than 22.5% suggests, for a
structural reason: Down/Up Capture and Information Ratio measure a fund's behavior
*relative to an equity-style market benchmark in up/down swings* — a concept with real
differentiating power for equity funds, but a weak one for corporate bond funds, which
move together far more tightly within a category (driven by the same interest-rate and
credit cycles) and don't have a meaningful "upside participation" story the way equity
funds do. Even if these 3 metrics *could* be computed, they likely wouldn't differentiate
Corporate Bond peers well. What's retained — Return, Consistency (2 components),
Drawdown (absolute, benchmark-free), Sortino (benchmark-free), Valuation, Cost (2
components) — already covers the dimensions that actually drive differentiation among debt
funds (returns, consistency, own volatility, cost). **Net assessment: low-to-moderate
accuracy impact**, not a fundamental integrity loss — the methodology isn't getting
Corporate Bond funds *wrong*, it's measuring them on 8 well-chosen dimensions instead of
11.

### Fallback options for Hybrid

Same three options apply, but the calculus is different for one structural reason: a
Hybrid fund's category **is itself defined by a fixed equity:debt split** (SEBI's own
categorization rules — Aggressive Hybrid = 65-80% equity / 20-35% debt, Balanced Hybrid =
40-60%/40-60%, Conservative Hybrid = 10-25%/75-90%). That means, unlike Corporate Bond,
there *is* an externally-defined, auditable formula to reconstruct: blend an
already-live, free equity index (Nifty 500, or a narrower one matched to the fund's actual
equity holdings style) with an already-live, free debt index (e.g. Nifty Composite G-Sec)
at the SEBI-mandated midpoint ratio for that sub-category.

**Decision confirmed: Option B (synthetic blend) for Hybrid, not Option C.** The blend here
is defensible and reproducible in a way it isn't for Corporate Bond — it's reconstructing a
real regulatory category definition from two real, live, free inputs, not inventing a
number from nothing.

**Mandatory compliance disclaimer, confirmed as a hard requirement, not a nice-to-have:**
this blend must never be presented as an official index. Wherever it appears — in the data
model (e.g. a `source` or `label` field on the `BenchmarkIndex` enum member), in any API
response that exposes it, and in every UI surface that shows the Hybrid benchmark or any
metric derived from it (Down Capture, Up Capture, Information Ratio) — it must be labeled
as a **"Unifolio-constructed"** blend, explicitly stated as not an official CRISIL/NSE
index. This is a regulatory concern, not a cosmetic one: Unifolio is not a registered
Research Analyst (RA) or Investment Adviser (RIA), and presenting a self-constructed
benchmark without this disclaimer risks being read as holding out investment-advisory
index/research output under SEBI's RA/RIA regulations. The exact disclaimer copy is a
task #10 (frontend/UI) decision; the requirement itself — that one must exist, consistently,
everywhere this blend surfaces — is confirmed now and must carry through to the data model,
not be left as a UI-only afterthought.

**Accuracy impact, quantified:** unlike Corporate Bond, no weight is lost here — all 11
components remain, computed as usual, including all 3 benchmark-dependent ones (22.5%
combined weight), just against the synthetic blend instead of an exact CRISIL index. The
accuracy question for Hybrid isn't "how much is missing" but "how precise is the benchmark
fit." A fund whose actual equity sleeve skews more mid/small-cap than Nifty 500, or whose
debt sleeve runs materially longer/shorter duration than the Composite G-Sec proxy, will
show some distortion in its absolute Down/Up Capture and Information Ratio values relative
to what a fund-specific, perfectly-matched index would show. This is meaningfully
mitigated by the scoring methodology's own design: scores are percentile ranks *within
category*, and every fund in a given Hybrid sub-category is measured against the *same*
synthetic blend — so a systematic bias from the blend choice shifts every peer's metric in
roughly the same direction and washes out substantially in the relative ranking, even
though it would distort an absolute, cross-category comparison. **Net assessment: no
weight loss, moderate-but-mitigated precision risk** — exactly the kind of approximation
the mandatory "Unifolio-constructed" disclaimer above exists to flag honestly.

## Gold: Option 1 source choice — reconsidered after exhaustive investigation

Option 1 confirmed (a third source-routed free fetch, same architectural pattern as
International: new `BenchmarkIndex` enum member, new fetch function, routed through the
existing daily job and `BenchmarkIndexHistory` table, no new table/job). Per explicit
instruction, IBJA was reverse-engineered first, with MCX only as the fallback if that
genuinely failed — it did.

### IBJA reverse-engineering attempt (exhausted, not a time-boxed give-up)

`ibjarates.com`'s homepage renders a Chart.js line chart of trailing gold/silver rates.
Reading the page's actual markup (not just guessing at an AJAX endpoint) found the exact
mechanism: the chart data is **server-rendered directly into a hidden `<input>` field at
page-load time** —

```html
<input type="hidden" id="HdnGold" value='{"labels":["22/06/2026",...,"19/10/2026"],
"purity999":[...],"purity916":[...]}' />
```

— and the page's inline script reads that hidden field's value with `JSON.parse()` and
feeds it straight to `new Chart(...)`. This is the ASP.NET WebForms server-side-rendering
pattern (consistent with IBJA's site being .NET-based, same family of pattern as NSE's own
site). The practical findings:

- **No separate JSON/AJAX API exists for this chart** — there's nothing to call
  standalone; the data only exists already-embedded in the HTML response.
- **The embedded window is short and fixed**: observed range was 22/06/2026 to 19/10/2026
  — roughly 4 trailing months, not years. There is no URL parameter, query string, or form
  post that changes this window; it's whatever the server decided to embed on that
  request.
- This rules out building a multi-year backfilled history for free: at best, a daily
  scraper could accumulate ~4 months of trailing data from today forward, with **no way to
  backfill** the 3-5 years Scorer v2's methodology (§5, minimum track record) requires for
  any fund scored against this benchmark.
- IBJA's own official path for this data remains the paid API with a registered
  `ACCESS_TOKEN` (confirmed in an earlier pass this session) — consistent with the pattern
  already seen with CRISIL above: the authoritative, best-fit source is vendor-gated, not
  genuinely reverse-engineerable for free.

**Conclusion: IBJA is not usable as a free historical source**, not due to insufficient
effort but due to a genuine structural fact — the free surface only ever exposes a short
trailing window with no backfill mechanism, by design.

### Re-checking MCX before accepting it: its free depth is shallower than first assumed

The initial pass assumed MCX bhavcopy was a clean, freely-backfillable daily archive.
Re-checking MCX's own stated terms (per Ayush's explicit "don't settle, check harder"
pushback) found that's not actually true: **MCX's own datafeed page states free
historical data is limited to roughly 3 months, excluding the most recent 12 months**
— true bulk multi-year history is "provided on request," i.e. a formal/commercial
process, not a self-serve download. A daily scraper could only accumulate forward from
today — **the same backfill problem as IBJA**, not the clean advantage it looked like
in the first pass. On top of that, it's a futures settlement price, not SEBI's literal
"Domestic Price of (Physical) Gold" language — MCX was weak on both access *and* fit.

### A third path: reconstructing the SID's own formula

Before accepting a lesser proxy, it's worth asking what Gold ETF Scheme Information
Documents actually say their benchmark *is*, mechanically — not just the name SEBI uses.
Checked directly: ICICI Prudential Gold ETF's SID states it is "benchmarked against the
domestic price of gold as derived from the LBMA AM fixing prices... there is no publicly
available index that directly tracks domestic gold prices" — and more specifically, Gold
ETF NAVs are computed from "the LBMA AM price converted at the RBI reference rate,
adjusted for import duty and other charges." That's a fully specified formula, not a
black box:

```
Domestic Price of Gold = LBMA fix (USD) × USD/INR rate × (1 + import duty + GST)
```

Every piece of this is freely obtainable:

- **LBMA daily PM fix**: World Gold Council's own Goldhub site removed free historical
  LBMA data in March 2025 (per ICE Benchmark Administration's request) — only a
  since-1978 monthly/quarterly/annual currency-averages file remains there. But the
  GitHub repo [`unbalancedparentheses/forex-centuries`](https://github.com/unbalancedparentheses/forex-centuries)
  publishes `data/sources/lbma/lbma_gold_daily.csv` — daily PM fix from 1968,
  **auto-updated weekly via its own CI pipeline** — a genuine, currently-maintained,
  decades-deep free source. (Uses PM fix, not the SID's AM fix — a known, minor,
  documentable deviation, not a structural gap like MCX's futures-vs-spot mismatch.)
- **USD/INR rate**: the SID literally specifies the RBI reference rate; the pragmatic
  choice is Yahoo Finance's `USDINR=X` via the exact same chart-JSON mechanism already
  proven and in production for the International benchmark — zero new integration
  pattern, not a new reverse-engineering effort.
- **Import duty + GST**: not a daily feed at all — a handful of discrete policy
  rate-changes over any realistic lookback window (15%→6% Jul 2024, 6%→15% May 2026;
  GST flat 3% since Jul 2017), maintainable as a small lookup table, the same pattern
  already used for other regulatory tables in this codebase.

### Decision: reconstruct via LBMA × FX × duty, MCX demoted to last-resort fallback

This supersedes the earlier MCX-as-primary call. It's a closer match to what SEBI/AMCs
actually mean by "Domestic Price of Gold" (this *is* their formula, not an analogue of
it), and it has deeper, already-available, auto-refreshing free history than either MCX
or IBJA turned out to have. It is still an approximation — PM fix instead of AM fix, no
local transaction-charge premium — so the same "Unifolio-reconstructed, not an official
index" disclosure discipline applies as for the Hybrid blend, just for a smaller,
better-characterized gap than MCX's futures-vs-spot mismatch. **MCX remains documented
as the fallback-of-last-resort** if the GitHub CSV source ever disappears or stops
updating — a real but low-probability risk worth having a plan for, not a reason to
prefer MCX now.

**Mandatory documentation and frontend-disclosure requirement, confirmed (unchanged in
kind from the original MCX decision, now scoped to the smaller actual gap):**
- Document in code/data-model comments at the point the Gold `BenchmarkIndex` is
  defined/fetched: "Unifolio-reconstructed approximation of the LBMA-based Domestic
  Price of Gold formula AMC SIDs define — PM fix (not AM), no local transaction-charge
  premium." Full source list: `Docs/data-resources-reference.md`.
- Wherever this benchmark or any metric derived from it is shown on the frontend, a
  disclosure must state this is a reconstructed approximation, not an official,
  AMC-published rate. Exact placement/copy is a task #10 (frontend/UI brainstorm)
  decision — flagged here now so it isn't dropped by the time that task starts.

## Down Capture, Up Capture, Information Ratio: formulas, verified against industry sources

Task #7's remaining pieces, now that benchmark coverage is resolved. Verified against
Morningstar's own published methodology and CFA-Institute-level sources, not just assumed —
per Ayush's explicit "go through this entire research again" instruction.

**Reused from existing decisions (not re-litigated), cross-checked against the codebase's
actual TRI history, not just assumed:**
- Benchmark series = **Gross TRI** (dividend-reinvested), matching the 9 Oct decision that
  "benchmark comparisons read TRI only." Cross-checking
  `Docs/analytics/investigations/2026-10-06-tri-sourcing-feasibility-confirmed.md` (the
  original feasibility work behind that decision, done during the analytics redesign) surfaced
  two details worth carrying forward into this task: (1) NSE's TRI endpoint also returns a
  `NTR_Value` (Net Total Return, withholding-tax-adjusted) field, not published for 2 of the 4
  indices — the codebase already correctly reads `TotalReturnsIndex` (Gross), never
  `NTR_Value`, and Down/Up Capture and IR should do the same for consistency; (2) the TRI
  endpoint's field names (`Date`/`TotalReturnsIndex`) differ from the price endpoint's
  (`HistoricalDate`/`CLOSE`) — already handled correctly by `_fetch_tri_history`, no new
  parsing concern for these three metrics since they read the same cached, already-normalized
  `benchmark_index_history` table.
- Monthly periodicity, no recency weighting (§4.1 scopes that to Return/Consistency only),
  trailing up to 5yr window floored at §5's 3yr minimum — all unchanged from the prior pass.

**Formulas, confirmed as the correct industry standard — no better alternative found:**

- **Down/Up Capture Ratio** — Morningstar's own published methodology confirms geometric
  (compounded) monthly returns over qualifying months, not a simple average — exactly the
  form already proposed:
  `Capture = [(Π(1+R_fund,i) over qualifying months)^(12/n) - 1] / [(Π(1+R_bench,i) over qualifying months)^(12/n) - 1] × 100`
  Up-months = benchmark return > 0; down-months = benchmark return < 0. **One refinement found
  during verification**: Morningstar's methodology excludes months where the benchmark return
  is *exactly* zero from both classifications, rather than folding a zero into either bucket —
  adopted here too, a small but real correctness detail that wasn't in the first draft.
  Down Capture is lower-is-better → the methodology's "invert before percentile" bucket (§2),
  same as Drawdown and expense ratio; Up Capture is higher-is-better, normal direction.
- **Information Ratio** — CFA/practitioner-standard: excess return over tracking error,
  annualized consistently —
  `IR = (mean(R_fund,i − R_bench,i) × √12) / stdev(R_fund,i − R_bench,i)`
  — matches what was proposed. Note for completeness, not adopted: there's an academic
  variant (the "appraisal ratio," using regression alpha over residual standard deviation
  instead of simple tracking error) — a genuinely different, less common definition used in
  factor-model contexts, not the practitioner-standard one Morningstar/most fund-rating
  services use. No reason to deviate from the simple-tracking-error version here.

**A real improvement found during this verification, not just confirmation:** the earlier
plan for International used `^GSPC` (S&P 500 price-only). Re-checking Yahoo Finance for a
Total Return equivalent (so International wouldn't be the one category computing Down/Up
Capture and IR against a non-dividend-reinvested benchmark while every other category uses
Gross TRI) found **`^SP500TR`** — live-tested this session via the identical chart-API
mechanism, confirmed working, with `firstTradeDate` of **4 Jan 1988** (nearly 38 years of
free history). This is folded into the architecture section below — International now uses
TRI like every other category, closing what would otherwise have been a real, International-
specific methodological gap.

**No-silent-substitution edge cases — decided, with a standing rule attached:** a fund with
zero down-months in its window, or nearly-zero tracking error (e.g. a pure index fund,
making Information Ratio's denominator ~0), both hit a genuine divide-by-zero. Per Ayush's
explicit instruction, these are **not** to be silently excluded and reweighted with no visible
trace — every §5 no-silent-substitution case, for every fund and every metric, must carry a
visible, explained frontend disclosure (a badge/message stating which metric was excluded for
that specific fund and why), not just a quietly adjusted denominator. **This is a general
standing rule, not scoped to this edge case** — it retroactively applies to the Corporate
Bond decision above too, which previously had a reweighting decision but no explicit
frontend-disclosure requirement attached (unlike Hybrid and Gold, which already had one).
Corporate Bond's entry in the Status section below is updated accordingly. Exact
badge/message placement and copy is a task #10 (frontend/UI brainstorm) decision, same as the
Hybrid and Gold disclosures — flagged here now so none of the five are dropped by the time
that task starts (the fifth being the "no Growth option at all" residual below, added
2026-10-21 per the same standing rule).

**Acceptance criterion to carry into implementation, not just planning:** once these
fetch/compute functions actually exist, measure the real added run time of the daily job
(LBMA + USD/INR + S&P500 TRI delta-fetches, plus the Gold and International composite
computations) against the ~2-5 second estimate above, rather than treating the estimate as
final — flagged here so it isn't lost before task #11/implementation.

## TRI deep-dive, per Ayush's request — a genuine open dependency found, not just prior-work recap

Went back through every sub-project 1/2 doc that touches TRI (the a12 plan/handoff, the
deferred-plan history, `2026-10-20-benchmark-xirr-check.md`, `analytics-correction-plan-
status.md`'s full P0–P2 table), not just the one investigation doc already cited. Most of it
confirms what's already folded in above (Gross-not-Net TRI, `BackPage` casing, field-name
mapping, the per-transaction/per-trading-day replay convention `benchmark.py` already uses —
confirmed again via `2026-10-20-benchmark-xirr-check.md`'s worked SIP example, directly
reusable as the month-end-pricing convention for Down/Up Capture and IR's monthly series).

**One real, unresolved item surfaced that's directly relevant here, not just background:**
`analytics-correction-plan-status.md`'s **P2.2 "Distribution treatment consistency"** —
status UNCHECKED, explicitly deferred, explicitly flagged as "revisit alongside any future
TRI work, not standalone." The question: does a fund's own monthly-return series (built from
its published NAV, via `build_monthly_series`) consistently reflect reinvested distributions
the same way the TRI benchmark does? Checked the actual code to see if this is handled:
`PlanType` (`backend/app/models/enums.py`) only distinguishes Direct/Regular — there is **no
growth-vs-IDCW distinction anywhere in the scheme model**. An IDCW (payout) scheme's NAV
drops on each distribution and isn't reinvested in the series the way TRI assumes; a Growth
scheme's NAV has no distributions to begin with (all gains stay in NAV) and is the
apples-to-apples comparison TRI actually wants. Today, any scheme — IDCW or Growth — runs
through the identical `build_monthly_series`/`monthly_returns` pipeline with no distinction,
meaning an IDCW scheme compared against TRI-based Down/Up Capture or Information Ratio would
be structurally understated relative to a Growth scheme of the same underlying portfolio,
not because it performed worse but because of a representation mismatch between its NAV
series and the benchmark's reinvestment assumption.

**Resolved — not actually a new judgment call, this is already solved in the codebase.**
Traced the full path before writing this off as an open item: `get_category_peers()`
(`scheme_universe.py:261-302`) already groups every scheme by `(amc_name, base_name)`, picks
the Growth-option scheme as each underlying fund's `representative` via `rank_key`
(`"growth" in text and "idcw" not in text and "dividend" not in text`), and builds a
`representative_of: dict[scheme_id → representative_id]` map — with this exact reasoning
already in its docstring: *"IDCW NAVs drop at each payout, so their NAV returns understate
the fund; a held IDCW plan is ranked by its fund's Growth series."* `scorer.py`'s
`_score_against_peers` (line 363) resolves every scheme to its `series_id` via this map
before computing anything, and the category peer universe itself (`peers.schemes`) is
Growth-representatives only — so Return, Consistency, Drawdown, and Sortino are already
scored off the Growth series today, never an IDCW scheme's own distorted NAV.
`fund_ranking.py` surfaces this honestly via `ranked_as`, telling the user which scheme name
their score actually came from when they hold an IDCW variant.

**What this means for V2:** no new design or data sourcing needed. Down Capture, Up Capture,
and Information Ratio just need to pull their fund-side monthly series through the same
`peers.representative_of`/`peers.schemes` plumbing the existing 7 components already use —
not a new decision, just build it the same way V1 already does. P2.2 can be marked resolved
for Scorer V2's purposes (it remains open in a generic sense for any future component that
might bypass this peer plumbing, but that's a code-review discipline point, not a design gap).

**Execution checklist for whoever builds Down Capture, Up Capture, and Information Ratio
(mandatory, not optional — add to the implementation plan verbatim):**
1. Fetch the fund-side monthly return series via `series_id =
   peers.representative_of.get(scheme.id)` — the exact same lookup `_score_against_peers`
   (`scorer.py:363`) already uses for the other 7 components. Never fetch NAV history
   directly off the held scheme's own `scheme.id` for these 3 metrics.
2. The category peer universe for percentile ranking must be `peers.schemes` (already
   Growth-representatives only, deduped one-per-fund) — not a fresh query of every scheme row
   in the category, which would double-count funds and reintroduce raw IDCW series into the
   comparison set.
3. Add one regression test asserting this holds: construct (or pick from fixtures) an
   IDCW-flavored scheme and its fund's Growth twin, run Down Capture/Up Capture/Information
   Ratio for both, assert all three numbers are bit-for-bit identical. A failure here means a
   future edit accidentally bypassed the peer plumbing — this is the regression this test
   exists to catch.
4. `fund_ranking.py`'s existing `ranked_as` disclosure needs no new code to cover these 3
   metrics — it already fires whenever `series_id != scheme.id`, regardless of which
   components were computed from that series.

**Does a user get to see an IDCW scheme's own score, separately from its Growth twin's?**
Checked the actual API, not assumed: `GET /funds/{scheme_id}/ranking`
(`backend/app/api/analytics.py:51-60`) accepts **any** `scheme_id`, not just held or
Growth-flavored ones, and calls `compute_fund_ranking(db, scheme)` directly. So looking up an
IDCW scheme by its own `scheme_id` already works today — it returns one score (the fund's,
computed off its Growth series) plus the `ranked_as` disclosure naming the Growth plan it was
actually scored from. There's no second, IDCW-specific score to show, by design: Growth and
IDCW are the same underlying portfolio, so a separate "IDCW score" would just be a distorted
version of the same number, which is exactly what this whole mechanism exists to avoid
showing. Nothing new needed for V2 here; this is existing V1 behavior, confirmed still
correct. (A frontend question, not a backend one, for task #10: whether a fund screener/search
surface should let a user search for and land on a scheme by its IDCW name directly, versus
only linking to scheme pages from held holdings — either way, the score page itself already
behaves correctly once reached.)

**One narrow residual, pre-existing in V1, not new to V2 — now paired with a disclosure
requirement per the standing rule above:** if a fund genuinely has no Growth option at all (a
handful of older debt/FMP schemes), `rank_key`'s fallback picks the lowest `amfi_code` among
whatever IDCW variants exist, so that fund's representative series could still be IDCW-based.
This already affects V1's existing components exactly as much as it would affect V2's three
new ones — not a regression, not something V2 needs to solve that V1 hasn't already accepted,
and genuinely unfixable (the clean Growth comparison data was simply never published for these
funds). What **is** new for V2: per the no-silent-substitution standing rule above, this case
now needs the same visible frontend disclosure treatment as Corporate Bond/Hybrid/Gold/the two
zero-denominator cases — a badge/message telling the user "this fund has no Growth-option
NAV series; its score and `ranked_as` series are based on an IDCW plan, which may slightly
understate performance due to payout-driven NAV drops." Exact copy/placement is the same task
#10 decision as the other four cases; flagged here as the fifth so it isn't dropped.

## Backend/schema/job architecture: International and Gold

Confirmed against the actual code (`nse_indices_client.py`, `benchmark.py`,
`backend/scripts/jobs/refresh_benchmark_daily.py`, `backend/app/models/reference.py`), not
assumed, and against the actual staging deploy (`deploy/leapswitch/crontab.leapswitch`).

**Staging correction:** `refresh_benchmark_daily.py` is NOT scheduled via AWS EventBridge on
the current staging target. Staging now runs on the LeapSwitch VM
([[project_leapswitch_staging_migration]]), where this same job file is invoked by a plain
root crontab line: `0 6 * * * $RUN benchmark-daily scripts/jobs/refresh_benchmark_daily.py`
(`deploy/leapswitch/crontab.leapswitch:27`). EventBridge remains the mechanism for whatever
AWS environment this eventually also runs in, but it is not what staging uses today. Net
effect for this change: zero new cron/schedule entries either way — the existing line calls
the same file; Gold/International support is added inside that file, not alongside it.

**What already exists, reused as-is:**
- `benchmark_index_history` (`index_name`, `date`, `return_type`, `value`) — the one table
  every `BenchmarkIndex` already writes its final, ready-to-compare value into. International
  and Gold both end up writing here too, under two new enum members — no new columns, no new
  table for the *output* side.
- The daily job's loop structure and the "fetch only what's missing, keep stale cache on
  failure" posture (`ensure_index_history_fresh`'s pattern) — reused in spirit for the new
  sources, not reinvented.

**Genuinely new — one small table, not none and not two:** the first draft of this section
recommended persisting nothing between runs (refetch LBMA/FX fresh every day). Ayush's
pushback was right to reject that: a full refetch of the entire LBMA CSV and the entire
Yahoo FX history every single day (rather than just the day's new row) is wasteful job time
and has no fallback if either source has a bad day. The middle ground, built on what already
exists rather than two bespoke tables: one new generic table,

```
external_series_history(series: str, date: date, value: Numeric(14,4), PK(series, date))
```

— the same shape as `benchmark_index_history`, with a string key instead of an enum because
these series are raw *inputs*, not user-facing benchmarks, and don't belong in the
`BenchmarkIndex` enum (which drives category-to-benchmark selection elsewhere, e.g.
`_benchmark_index_for_category` — polluting it with internal inputs would be a semantic
leak, not just a style nit). Populated with three series, using the exact same
incremental-delta-fetch logic as `ensure_index_history_fresh` (check cached bounds, fetch
only the missing range, upsert, leave stale cache in place on failure):
- `lbma_gold_pm_fix` — delta-fetched from the `forex-centuries` CSV
- `usdinr` — delta-fetched from Yahoo Finance's chart API
- `sp500_tri_usd` — delta-fetched from the same Yahoo Finance mechanism, ticker `^SP500TR`
  (**not** `^GSPC`, corrected below)

One table, three keys, reused by both Gold and International (see below) — not Gold-specific
infrastructure, and justified by three concrete present uses, not spare future capacity.

**Correction, found during the formula-verification research pass below: use `^SP500TR`
(Total Return), not `^GSPC` (price-only).** The original plan used raw S&P 500 price,
which would have been a real, documented inconsistency — 3 of the 4 existing NSE benchmarks
already use Gross TRI (dividend-reinvested), per the 9 Oct decision that "benchmark
comparisons read TRI only" ([[project_leapswitch_staging_migration]] is unrelated; see
`Docs/analytics/investigations/2026-10-06-tri-sourcing-feasibility-confirmed.md` for that
decision's own history). Live-tested this session:
`query1.finance.yahoo.com/v8/finance/chart/^SP500TR` returns a clean response via the exact
same mechanism already proven for `^GSPC`, with `firstTradeDate` of **4 Jan 1988** — nearly
38 years of free history, comparable depth to the LBMA series. This closes what would
otherwise have been a genuine International-only gap (price-return benchmark while every
other category uses TRI) rather than requiring a documented exception for it.

**Currency adjustment for International — decided, not deferred:** yes, currency-adjust.
Raw USD S&P 500 TRI is not a fair comparison for an INR-denominated fund's INR return. The
final value this writes into `benchmark_index_history` under `BenchmarkIndex.INTERNATIONAL`
is `sp500_tri_usd(date) × usdinr(date)` — both pulled from the new cache above, computed the
same way Gold's composite is computed, and sharing the same `usdinr` series Gold already
needs (fetched once per run, used twice, not duplicated). This means International stops
being a single-fetch index like the 4 NSE ones and becomes a 2-factor composite exactly like
Gold's 3-factor one — the same new "compute composite, persist only the final value" code
path serves both, so this isn't two different new mechanisms, it's one mechanism with two
callers.

**Net new surface, summarized:**
- 2 new Postgres enum values (`international`, `gold`) on `BenchmarkIndex` — additive-only,
  not cleanly reversible later (same caveat as `AuthIdentityProvider` elsewhere in this
  codebase), but low-risk since an unused value is harmless.
- 1 new table (`external_series_history`), used by 3 series, not a Gold-only or
  International-only table.
- 2-3 new small fetch functions (Yahoo index/FX client, LBMA CSV client) plus one new
  composite-compute function (shared by Gold and International).
- A few new branches inside the existing `refresh_benchmark_daily.py` loop — no new job
  file, no new cron/EventBridge entry on either staging or production.

Not over-engineering: the alternative that would have been — a dedicated `gold_price_history`
table, a separate Gold-only job, no reuse between Gold's and International's FX need — is
explicitly what this avoids. The one new table is minimal, justified by three immediate
uses, and modeled directly on a pattern already proven in production for the 4 NSE indices.

**USD/INR source and fetch cadence, confirmed:** same place as everything else here — the
Yahoo Finance unofficial chart endpoint (`query1.finance.yahoo.com/v8/finance/chart/USDINR=X`),
fetched once per day inside the existing `refresh_benchmark_daily.py` run (LeapSwitch
crontab, `0 6 * * *`), not a separate job and not fetched live at request time. One daily
fetch populates `external_series_history`'s `usdinr` row for that day; both Gold's and
International's composite-compute step read it from there, so it's fetched once and used
twice, never fetched per-consumer.

**Loading-time estimate — two different things, not one:**
- **End-user/app-facing loading time: no change, by construction.** The whole point of the
  precompute-then-persist pattern (identical to how the 4 NSE indices already work) is that
  nothing in the user-facing request path ever calls LBMA/Yahoo directly — it's a plain
  indexed read from `benchmark_index_history`, same query shape and same latency as today.
- **The daily batch job's own added run time: a rough estimate, not a measured number** (none
  of this is built yet). The existing job's own comment benchmarks one index's full TRI
  history fetch at **~1 MB, ~0.3 s**. The three new calls are all smaller: USD/INR and S&P500
  delta-fetches only need the last few missing days once the cache is warm (a few KB each,
  sub-second); the LBMA CSV has no date-range parameter so it's re-downloaded in full each
  run, but at roughly 14,500 daily rows since 1968 that's well under 1 MB — comparably sized
  to the TRI fetch already benchmarked, so also well under a second. **Best estimate: on the
  order of 2-5 extra seconds added to the existing overnight 06:00 job run**, not reflected
  anywhere a user would notice, since this runs once overnight. Worth re-measuring once built
  rather than treating this estimate as final.

## Status: fully closed

1. Corporate Bond fallback: **confirmed** — Option C (exclude, re-weight denominator per
   §5), scoped to Corporate Bond only, not a general policy. Accuracy impact: low-to-
   moderate (22.5% of weight redistributed, concentrated in metrics with low
   differentiating power for this category anyway).
2. Hybrid fallback: **confirmed** — Option B (SEBI-ratio synthetic blend), with a mandatory
   "Unifolio-constructed, not an official index" disclaimer required in the data model and
   every UI surface that shows it (RIA/RA compliance concern, not cosmetic). Accuracy
   impact: no weight lost; moderate-but-mitigated benchmark-fit precision risk, dampened by
   within-category relative ranking.
3. Gold source: **confirmed** — LBMA (forex-centuries CSV) × USD/INR (Yahoo Finance) × duty/
   GST, reconstructing the exact formula Gold ETF SIDs themselves use, after a genuine
   (not time-boxed) re-investigation found both IBJA and MCX free access shallower than
   first assumed. MCX kept as documented fallback-of-last-resort. Documented as a
   "Unifolio-reconstructed" approximation with a mandatory frontend disclosure requirement,
   placement TBD at task #10.
4. Discovery-API host-page call-site: **resolved** — `developer.js`, plain `$.ajax` calls,
   no hidden auth/session dependency.
5. International currency adjustment: **confirmed** — currency-adjust. The value persisted
   under `BenchmarkIndex.INTERNATIONAL` is `sp500_tri_usd(date) × usdinr(date)` — S&P 500
   **Total Return** (`^SP500TR`, not raw price), for a fair comparison against an
   INR-denominated fund's INR return, and for TRI consistency with the other 4 categories.
6. Backend/schema/job architecture for both: **confirmed** — see the section above. One new
   generic `external_series_history` table (shared by Gold and International, not
   index-specific), two new `BenchmarkIndex` enum values, no new job file or schedule entry
   on either the LeapSwitch staging crontab or (eventually) AWS EventBridge.

Benchmark coverage for all 5 net-new-risk-metric categories (Sectoral, Debt, Hybrid, Gold,
International) is fully resolved, including the backend architecture and the currency
question. Task #7 can now move to the Down/Up Capture and Information Ratio formula
specifics.

## Cross-cutting findings, beyond this task

Every external data source/technique found during this research (not just `jugaad-data`,
and not just for Gold) is now tracked in one place, not a per-source file:
**`Docs/data-resources-reference.md`**. Check there first for any future attribute's data
needs before re-researching from scratch; add to it, don't fork a new doc per resource.
