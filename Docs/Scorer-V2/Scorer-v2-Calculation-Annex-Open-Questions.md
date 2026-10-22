# Scorer v2 — Calculation Annex: Open Questions for Sign-Off

The approved methodology (`Docs/Scorer-V2/Updated_and_Approved_Unifolio_Fund_Scoring_Methodology.md`)
is approved at the product/formula level. These are the definitions engineering needs to
produce deterministic code and golden tests — not objections to the methodology itself.
Grouped so the easy ones don't block on the hard ones.

## A. Needs your judgment — no safe engineering default

1. **Rolling horizons — resolved 2026-10-21.** Confirmed: option (b), a genuinely rolling
   window — trailing 12-month returns, sampled monthly, over the trailing lookback. Per
   Ayush's instruction, standardized on the exact convention V1's existing Consistency
   metric already uses (`backend/app/services/analytics/risk_metrics.py`), not a new
   definition: `month_end_dates` (calendar month-ends only, never a partial current month)
   → `build_monthly_series` (one NAV per anchor, last-seen value carried forward over gaps)
   → `rolling_12m_returns` (trailing-12-month return ending at each anchor; first 12 entries
   `None`). Scorer V2's Return and Consistency components reuse these three functions
   verbatim — no new rolling-window implementation.
2. **Recency-weighting curve — resolved 2026-10-21.** Linear decay, but the floor is
   derived from an exponential half-life rather than picked arbitrarily, so the shipped
   formula is simple to compute/explain while its one tunable number carries genuine
   industry-standard grounding:
   ```
   WINDOW_MONTHS = 60                                    # 5-year lookback, matches Q1
   RECENCY_HALF_LIFE_MONTHS = 24                          # reference half-life, the one knob
   FLOOR = 0.5 ** (WINDOW_MONTHS / RECENCY_HALF_LIFE_MONTHS)   # derived, ≈ 0.1768 — never hardcode this
   weight(months_back) = 1 - (months_back / WINDOW_MONTHS) * (1 - FLOOR)
   ```
   `FLOOR` must be computed from `RECENCY_HALF_LIFE_MONTHS` at the point of use (or as a
   derived module-level constant via the same formula), never hardcoded as a rounded
   literal — Ayush's explicit instruction, prioritizing score accuracy over a rounder
   tooltip number: a hardcoded `0.2` would silently drift out of sync with its own stated
   justification ("calibrated to a 24-month half-life") if `RECENCY_HALF_LIFE_MONTHS` is
   ever retuned later. Applies to both Return's weighted-average blend of the 49 rolling
   12-month returns and Consistency's weighted beats-category/top-quartile hit rates
   (weight each snapshot by this curve rather than counting hits unweighted).
3. **Sampling frequency — resolved 2026-10-21, direct consequence of Q1.** Monthly, via
   `month_end_dates`/`build_monthly_series` — same convention V1's risk engine already
   uses platform-wide. Not a separate decision once Q1 was answered.
4. **"Category average" definition — resolved 2026-10-21.** AAUM-weighted mean, confirmed
   against the actual code (`_aum_weighted_average` in `category_ranking.py`, reused as-is
   by `scorer.py` for Return and TER category averages already) — this is the single
   definition used everywhere "category average" appears on the platform today, and Scorer
   V2's Beats-Category-Average and Cost Level both reuse it verbatim rather than
   introducing a second, inconsistent meaning of "category average."
5. **Expense-ratio trend formula — resolved 2026-10-21, window mismatch fixed and AUM
   dead-zone moved 10%→20% on re-audit 2026-10-21.** Dead-zones set empirically against
   AMFI's live, whole-universe
   TER/AAUM data (not guessed, per Ayush's explicit instruction after rejecting V1's
   `_TER_DEAD_ZONE` reuse — see "Research basis" below), feeding a hybrid discrete-
   classification-then-magnitude-scaled scoring mechanism.

   **Window — pinned to a single number, not left as the approved doc's "2-3 years"
   range:**
   ```
   COST_TREND_WINDOW_MONTHS = 24   # both TER and AUM deltas computed over this SAME window
   ```
   Caught on a closing re-audit: the first pass computed the TER dead-zone off a 24-month
   comparison and the AUM dead-zone off a 36-month comparison — two different window
   lengths feeding thresholds that production code would apply to ONE window at a time
   (`ter_change_bps` and `aum_change_pct` for the same fund as of the same date). 24
   months is the lower bound of the methodology's stated "2-3 years," chosen for a
   practical reason flagged honestly rather than dressed up as a researched optimum: the
   TER clean-window research (below) already needed exactly this span to dodge the Jan-
   Apr 2026 schema break, so reusing it avoids a second multi-hour TER re-pull at 36
   months. Nothing in the data argues 24 is better than 30 or 36 for trend-detection itself
   — any number in the approved "2-3 years" range would have been equally defensible; this
   is a practicality-driven pick within a methodology-sanctioned range, not a guess outside
   it.

   **Implementation note for whoever builds this:** AMFI's AAUM feed is only published
   quarterly, so a production job computing `aum_change_pct` as of "24 months before
   evaluation date" won't find an exact match — use the nearest available AAUM quarter to
   that date (the calibration above did the same: Jul-Sep is the nearest full quarter to
   the TER leg's Oct anchor, not a calendar-exact match, and this is fine since the dead-
   zone is about materiality of a ~2-year move, not a specific day).

   **Dead-zones, both now calibrated on the same 24-month window:**
   ```
   TER_DEAD_ZONE_BPS = 5.0         # basis points, over COST_TREND_WINDOW_MONTHS
   AUM_DEAD_ZONE_PCT = 20.0        # percent, over the same window -- moved from 10.0, see below
   ```
   - TER: a clean (schema-consistent) Oct-2023→Oct-2025 comparison across 1,214 matched
     live schemes shows 60.3% of funds move less than 5bps over 2 years, and 23.5% show
     *exactly* zero change (TER is reported to 1bp precision, so zero is a real floor, not
     noise). 5bps is the natural elbow separating "most funds, no real trend" from the
     minority with a decisive move — not a round number.
   - AUM: re-pulled on the matched 24-month window (Jul-Sep 2023→Jul-Sep 2025, not the
     original 36-month Jul-Sep 2023→Jul-Sep 2026 run) across 6,637 matched schemes (6,352
     with a non-zero base): median *absolute* change is 40.4% over 2 years. A finer density
     check (2-point resolution, 0-40%) disproved the original "10% is a natural elbow"
     claim borrowed from TER's story — AUM has no comparable discontinuity, density is
     roughly flat-to-rising through 18% and only thins past ~20-24%. **Moved to 20%
     instead of keeping 10%, decided 2026-10-21, on a measurement-validity argument, not a
     density-curve one:** `aum_change_pct` over 24 months conflates two different things —
     net new money flowing in/out (the thing this component is actually trying to detect,
     per the methodology's "scale benefits" story) and pure NAV/price appreciation (units
     unchanged, AUM rises anyway because the market went up). Indian equity markets have
     returned comfortably more than 10% cumulative over most 2-year windows in the last
     decade, so a fund that received *zero* net new money can still show >10% AUM "growth"
     from price alone. At a 10% dead-zone, that fund gets misclassified as GROWING and
     either wrongly credited for "scale benefits passed on" (if TER is falling for
     unrelated reasons) or wrongly flagged as the worst-case "margin protection" box (if
     TER happens to be rising) — in both cases the AUM signal is actually noise (market
     beta), not the flow signal the component means to read. 20% sits further above typical
     2-year market-return noise, so a fund crossing it is more likely showing real net-flow
     growth/shrinkage, not just beta. The cost of this choice: real but modest flow-driven
     moves between 10-20% now get classified as FLAT and lose their credit/penalty — a false
     negative. The cost of staying at 10%: a float-the-whole-market bull run misclassifying
     a large share of genuinely flat-flow funds as "GROWING" — a false positive baked into
     every market-up year. For a component whose whole point is "did this fund actually
     pass on scale benefits," a false positive (rewarding/punishing funds for market beta
     they had no hand in) is the worse failure mode than a false negative (staying silent on
     a real but modest flow move), so 20% is the better threshold even though it reclassifies
     more funds as flat (32.6% under 20% vs. 14.3% under 10%, per the same calibration run).

   **Research basis / why these specific numbers, not V1's 5bp guess:** no external
   authority (SEBI circulars, AMFI guidelines, rating-agency methodologies) publishes a
   materiality threshold for either figure — confirmed via direct research, not assumed.
   V1's `_TER_DEAD_ZONE = 0.05` was itself an ungrounded guess at the time it was set and
   was explicitly rejected as a precedent for this question. Instead, both numbers above
   are calibrated against AMFI's live public API (independent of Unifolio's own ~2.5-month
   ingestion history) — see `Docs/data-resources-reference.md`'s AMFI TER/AAUM rows for the
   access details. **A critical confound was caught and corrected during this research:**
   an initial Oct-2023-vs-Oct-2026 TER run showed a false "+9.93bps rising" signal, which
   turned out to be an artifact of a SEBI TER-schema overhaul between Jan-2026 and Apr-2026
   (pre/post field-set change, confirmed via a live single-page schema probe) — not real
   fund-level drift. Re-running on a schema-consistent Oct-2023-vs-Oct-2025 window flipped
   the result to "-4.07bps falling" (the expected direction, consistent with genuine
   economies-of-scale effects) and roughly halved the dispersion. **Any production
   Cost Trend implementation must not naively diff TER across a window straddling Jan-Apr
   2026** — same caveat logged in `Docs/data-resources-reference.md`.

   **Scoring mechanism — hybrid (discrete classification decides the explanation,
   magnitude decides the exact number within it):**
   ```python
   TER_MAGNITUDE_CAP_BPS = 20.0    # ~p90 of real 2yr |change| (19bps) -- "fully decisive" move
   AUM_MAGNITUDE_CAP_PCT = 40.0    # ~median real 2yr |change| (40.4%, window-matched to TER
                                   # above -- was 50.0 off a mismatched 3yr pull before the
                                   # 2026-10-21 re-audit) -- deliberately NOT p90 (335.7% at
                                   # this window): that tail is dominated by tiny funds
                                   # ballooning off a near-zero base and would swamp
                                   # everyone else's score
   WITHIN_BOX_SPREAD = 10.0        # points added/subtracted around each box's base score

   # Re-derived 2026-10-21 after Ayush flagged the first pass as two guessed cells
   # ("let's cover all nine boxes, let's not guess") -- the earlier table invented nine
   # distinct, unevenly-spaced numbers with no textual basis for most of them. This
   # version uses ONLY what the methodology text actually says, plus one explicit
   # structural inference, and nothing else:
   #   - "A ratio falling AS AUM grows signals scale benefits passed on"
   #       -> (FALLING, GROWING) is explicitly singled out as the unique best case.
   #   - "A ratio rising WITHOUT AUM growth -- or rising while AUM is flat OR shrinking --
   #      signals margin protection" -- one sentence, one signal, for BOTH (RISING, FLAT)
   #      and (RISING, SHRINKING). The text never says shrinking is worse than flat, so
   #      they get the SAME score, not two invented severities (the old table's 10 vs 0
   #      was guessed, not licensed by the text).
   #   - "A flat ratio is treated as neutral" -- unconditional on AUM direction. All three
   #      FLAT-row cells get the SAME neutral score (the old table's 60/50/40 split across
   #      this row was also guessed -- the text draws no AUM distinction here at all).
   #   - That leaves three cells the text never touches: (FALLING, FLAT), (FALLING,
   #      SHRINKING), (RISING, GROWING). The first two mirror the RISING row's explicit
   #      "flat-or-shrinking, same score" grouping -- by the same logic (the text draws no
   #      distinction between flat and shrinking AUM on either side), they get one shared
   #      "good, not best" score. (RISING, GROWING) has no textual anchor and no grouping
   #      to inherit -- it is the one true open cell. Proposed here as the mirror-image of
   #      (FALLING, GROWING) (uniquely WORST, symmetric with uniquely BEST: raising fees
   #      despite having the clearest possible room to cut them is the one scenario with no
   #      defensive excuse at all) rather than folding it into the RISING/FLAT-or-SHRINKING
   #      bucket. This mirror step is NOT in the text -- flagging for Ayush to confirm or
   #      override before this is final.
   # Net result: a 5-level ordinal scale (best/good/neutral/bad/worst), evenly spaced at
   # 25-point intervals since there is no further empirical basis to space tiers unevenly
   # (unlike the dead-zone bps/pct figures above, this is a rubric-design choice, not a
   # fact to look up).
   BASE_SCORE = {
       ("FALLING", "GROWING"):   100,  # unique best -- explicit
       ("FALLING", "FLAT"):       75,  # good bucket -- inferred by symmetry w/ RISING row's grouping
       ("FALLING", "SHRINKING"):  75,  # same good bucket -- text draws no flat/shrinking distinction
       ("FLAT",    "GROWING"):    50,  # neutral -- explicit, unconditional on AUM
       ("FLAT",    "FLAT"):       50,  # neutral -- explicit
       ("FLAT",    "SHRINKING"):  50,  # neutral -- explicit
       ("RISING",  "FLAT"):       25,  # bad bucket -- explicit "margin protection"
       ("RISING",  "SHRINKING"):  25,  # same bad bucket -- text groups flat/shrinking together
       ("RISING",  "GROWING"):     0,  # unique worst -- decided 2026-10-21, see note below table
   }

   def classify_ter(ter_change_bps: float) -> str:
       if abs(ter_change_bps) < TER_DEAD_ZONE_BPS:
           return "FLAT"
       return "FALLING" if ter_change_bps < 0 else "RISING"

   def classify_aum(aum_change_pct: float) -> str:
       if abs(aum_change_pct) < AUM_DEAD_ZONE_PCT:
           return "FLAT"
       return "GROWING" if aum_change_pct > 0 else "SHRINKING"

   def cost_trend_score(ter_change_bps: float, aum_change_pct: float) -> float:
       ter_dir = classify_ter(ter_change_bps)
       aum_dir = classify_aum(aum_change_pct)
       base = BASE_SCORE[(ter_dir, aum_dir)]

       # magnitude fraction: 0 right at the dead-zone edge, 1 at the "fully decisive" cap
       ter_excess = max(0.0, abs(ter_change_bps) - TER_DEAD_ZONE_BPS)
       ter_frac = min(1.0, ter_excess / (TER_MAGNITUDE_CAP_BPS - TER_DEAD_ZONE_BPS))
       aum_excess = max(0.0, abs(aum_change_pct) - AUM_DEAD_ZONE_PCT)
       aum_frac = min(1.0, aum_excess / (AUM_MAGNITUDE_CAP_PCT - AUM_DEAD_ZONE_PCT))
       magnitude_frac = (ter_frac + aum_frac) / 2.0

       score = base - WITHIN_BOX_SPREAD + (2 * WITHIN_BOX_SPREAD * magnitude_frac)
       return max(0.0, min(100.0, score))
   ```
   `WITHIN_BOX_SPREAD = 10.0` keeps every box's score range (±10 around its base) clear of
   its neighbors — adjacent tiers are 25 points apart, so ±10 leaves a 5-point buffer on
   each side (e.g. the good bucket's range is [65, 85], the neutral bucket's is [40, 60]).
   This gives the plain-language explanation ("falling ER while AUM grows") its discrete
   box, while two funds in the same box with different magnitudes of move still get
   different scores, and a fund just inside vs. just outside a dead-zone boundary doesn't
   see an artificial cliff.

   **`(RISING, GROWING)` = 0, unique worst — decided 2026-10-21.** Kept as the mirror of
   `(FALLING, GROWING)`'s unique best, not folded into the 25-point bad bucket, because the
   two cases aren't actually symmetric in severity: `(RISING, FLAT)`/`(RISING, SHRINKING)`
   have a defensive story available ("costs are fixed, AUM isn't growing enough to spread
   them" — margin protection, but at least an explainable one), while `(RISING, GROWING)`
   has none — the fund has the clearest possible evidence that costs *should* be falling
   (confirmed scale growth, the exact condition the methodology names as the trigger for
   economies-of-scale savings) and still raised fees anyway. That is a strictly worse signal
   than the other two bad cells, not an equal one, so collapsing it into the same score would
   under-penalize the most indefensible case the formula can see — and the explainability
   principle (§ the doc's own design goal, "never a black-box number") is best served by a
   distinct plain-language verdict for it ("raised fees despite confirmed scale growth") that
   a shared score with the other two cells couldn't carry. Table above is final.
6. **PE/PB combination — resolved 2026-10-21 (both the combination mechanism and the
   scoring-direction question caught on re-audit).** Build-vs-buy is no longer a real
   choice: the in-house build is
   confirmed feasible and effectively free (Sub-project 2 already built the entire data
   substrate), so licensing Morningstar/ICRA/CRISIL has no remaining upside to weigh
   against it. Full implementation spec'd and ready to paste —
   `Docs/Scorer-V2/scorer-v2-pe-pb-feasibility-findings.md`. **Combination: confirmed**
   — simple average of the two relative-percentile scores (fund's PE vs category average,
   fund's PB vs category average), equal weight. No empirical calibration applies — unlike
   the cost-trend thresholds, there's no real-world ratio to discover here, just a rubric
   choice — and equal-weighting P/E and P/B absent a reason to favor one is the standard
   default in style-box-type composites (Morningstar et al.). The component is only 5% of
   the total score, so a fancier blend (geometric mean, one-dominant-metric, sector-
   dependent weighting) buys nothing.

   **Direction — resolved 2026-10-21: option (a), "cheaper = higher score."** Confirmed
   with Ayush. The existing feasibility-doc implementation (percentile-ranking `pe.ratio`/
   `pb.ratio` with lower treated as "cheaper") stands as spec'd, no code-comment changes
   needed. §4.3's "reflects investment style... rather than fund quality" is a caveat for
   how the UI *explains* the number to a user, not an instruction to neutralize direction —
   consistent with the component's deliberately small 5% weight, which caps the impact of
   an acknowledged style-tilt rather than trying to erase it.
7. **Benchmark per SEBI category — resolved 2026-10-21; the Sectoral/Thematic split found
   2026-10-22 (item 8) is closed by decision, not yet by build — see item 8.** Sectoral/
   Debt(Corporate Bond)/Hybrid/Gold/International all have confirmed
   sources or an explicit exclude-and-reweight fallback (Corporate Bond) — see
   `Docs/Scorer-V2/scorer-v2-benchmark-coverage-expansion-research.md`'s "Status: fully
   closed" section. Passive/index funds' near-zero-tracking-error case for Information
   Ratio is also resolved: treated as a divide-by-zero under the same §5 no-silent-
   substitution rule, with a mandatory visible disclosure (task #10 decides copy/placement)
   rather than a silently suppressed number. **One dependency carried forward, not an open
   question anymore:** this research treated "Sectoral/Thematic" as one category, which was
   correct when it was written but is now 8 months stale — SEBI's 26-Feb-2026 circular
   split it into two real categories. Item 8 below has since decided (2026-10-22) to build
   a holdings-based reclassifier so every fund is correctly labeled Sectoral or Thematic
   before Scorer V2 ships; once that classifier exists, this item's benchmark assignment
   needs a follow-up pass to confirm Sectoral and Thematic funds don't need different
   benchmark treatment (a pure-sector fund vs. a cross-sector thematic fund may track
   different index families) — a build-sequencing dependency, not an unresolved judgment
   call, so not blocking Section B.
8. **Minimum peer set widening — resolved 2026-10-21/22.** Pulled AMFI's live `NAVAll.txt`
   universe (same client Scorer V2 will use — `scheme_universe.py`'s
   `SchemeUniverseClient`/`canonical_category`/`get_category_peers`) and counted real
   distinct funds per canonical SEBI category the same way `get_category_peers` already
   does (dedup by `(amc_name, base_name)`, collapsing Direct/Regular/Growth/IDCW plan
   variants — not a raw scheme-row count, which overstates category size 2-4x). Result,
   live 2026-10-21: **24 of 64 live categories (37.5%) have fewer than 15 distinct funds**
   — this is a load-bearing design question, not an edge case, since over a third of
   categories hit it.

   **Bonus finding, not guessed, found while pulling this data:** two of those 24
   "small" categories are not actually small — they're a general pre-existing bug in
   `canonical_category`'s alias table (same bug shape it already exists to fix for
   Hybrid/Debt headings; Gold ETF and Children's Fund each split across two AMC-specific
   spellings of the same category). This isn't scorer-specific — it already affects the
   live V1 scorer and anything else that groups schemes by category — so the full
   writeup, confirmed AMC lists, ready-to-paste fix, and the related unsolved "Other
   Scheme - Index Funds" catch-all problem now live in `DEFERRED_FEATURES.md`'s
   "Added 2026-10-22 (category-alias data bug)" section, not here. Not applied in this
   planning session. For sizing purposes only: once fixed, Gold ETF's true population is
   25 funds (clears the 15 threshold outright) and Children's Fund's is 12 (still needs
   the widening rule below, just from a corrected starting count).

   **Correction found on the closing re-audit, 2026-10-22 — the Contra↔Value merge below
   was wrong and has been retracted.** The first pass of this answer justified merging
   Contra Fund into Value Fund on "SEBI makes an AMC pick one, so the regulator itself
   treats them as equivalent" — a specific, checkable regulatory claim I had NOT actually
   verified against a live source, only recalled. Per your instruction to check this again
   before moving on, I ran it through live web search rather than trusting the recollection,
   and it's **stale**: that mutual-exclusivity rule was real under SEBI's original Oct-2017
   categorization circular, but SEBI's **26-Feb-2026 circular** ("Categorization and
   Rationalization of Mutual Fund Schemes," replacing Master Circular Cl. 2.6, effective
   1-Apr-2026 — 8 months before today) explicitly *removed* it: "Mutual Funds shall be
   permitted to offer both Value and Contra funds subject to the condition that scheme
   portfolio overlap between the two schemes shall not be more than 50%." The identical
   "AMC picks one" rule for Balanced Hybrid vs Aggressive Hybrid was removed in the same
   circular. Without that rule, there is no regulator-established basis left for either
   pairing — "a Contra fund is value-ish" is exactly the kind of Unifolio-invented analogy
   this whole exercise was set up to avoid. **Both move to the low-confidence bucket below,
   not the merge bucket.** This is flagged in this much detail deliberately: it's the kind
   of error that looks small (two tiers in a table) but would have quietly corrupted real
   peer-set integrity for two live categories if it had shipped unverified — exactly the
   failure mode item 5's AUM rework was about.

   **Second, larger finding from the same re-audit — the live category universe has split
   since the last time this repo's `canonical_category` alias table was touched.** The same
   26-Feb-2026 circular **split "Sectoral Fund" and "Thematic Fund" into two separate
   equity categories** (previously one combined "Sectoral/Thematic" category; equity scheme
   types went from 11 to 13 specifically because of this split, confirmed via two
   independent sources with matching definitions: Sectoral = ≥80% in one sector, Thematic =
   ≥80% in a theme spanning 2+ sectors). Checked directly against the live AMFI pull (not
   just the news coverage) — the raw category headers already show the regulator's new
   split in practice, alongside AMC-level lag:
   - `"Equity Schemes - Sectoral Fund"` — 20 distinct funds (10 AMCs already using the new
     heading, e.g. Bandhan). **Clears 15 on its own, no widening needed if scored as its own
     category.**
   - `"Equity Schemes - Thematic Fund"` — 61 distinct funds (20 AMCs on the new heading).
     **Also clears 15 on its own.**
   - `"Equity Scheme - Sectoral/ Thematic"` — 174 distinct funds, 24 AMCs who have **not**
     yet relabeled to the post-circular split and are still filing under the old combined
     heading. `canonical_category`'s current alias table folds all three into this one
     bucket (255 funds total, matching this doc's earlier item-7 count), which was correct
     *before* Feb 2026 and is now papering over a real regulatory split with a stale
     string-merge. This is the same bug *shape* as Gold ETF/Children's Fund above (AMC
     label inconsistency hiding the true category boundary) but the opposite direction —
     there it was wrongly splitting one category into two; here it's wrongly merging two
     (now three) into one.
   - This is **not a quick alias-table fix like Gold ETF** — the 174 funds under the old
     combined heading genuinely are a mix of true sector-specific funds (Banking, Pharma,
     IT) and true cross-sector thematic funds (ESG, Business Cycle, Quant, Consumption),
     and nothing in AMFI's feed says which is which for that subset. Separating them
     correctly needs per-fund classification by actual mandate/holdings, not a string
     mapping — the same class of harder problem already flagged above for `"Other Scheme -
     Index Funds"`/`"Other Scheme - Other ETFs"`.
   - **This reopens item 7's "resolved" status, not just item 8's.** Item 7 assigned
     Sectoral/Thematic a benchmark and fallback as *one* category. If Scorer V2 now treats
     Sectoral and Thematic as the two distinct categories SEBI's current rules define, that
     benchmark-assignment work needs to be re-checked per-category (does a pure-sector fund
     need a different benchmark treatment than a cross-sector thematic fund? — an open
     question this doc had not previously asked, because the split didn't exist when item 7
     was researched). Flagging explicitly rather than quietly leaving item 7 marked
     "resolved" against a category structure that's now 8 months out of date.
   - **Decided 2026-10-22 — option (c): build the holdings-based reclassifier before Scorer
     V2 ships.** Scored strictly by SEBI's current rules, Sectoral and Thematic are two true
     categories (each already clears 15 on its own, so neither needs item 8's widening
     machinery once correctly split); the open problem was the 174-fund legacy-labeled pool
     AMFI's feed can't auto-split. Rejected: (a) score the clean 81 now and flag the 174
     low-confidence — leaves most of the category (174 of 255 funds) permanently
     under-scored; (b) keep all 255 as one combined category — knowingly scores pure-sector
     funds against cross-sector thematic funds as peers, which SEBI's current rules say
     they no longer are. Chosen instead: no fund in this category ships with Scorer V2
     until every one of the 255 is correctly classified as Sectoral or Thematic by actual
     mandate/holdings, not by whichever free-text heading its AMC happens to file under.
     **This is a net-new build item, not a data-fix** — a holdings-based classifier (likely:
     check each fund's top-sector concentration against its disclosed mandate/scheme
     objective — ≥80% single-sector weight reads as Sectoral, spread across 2+ sectors
     under one stated theme reads as Thematic) needs its own design pass. Belongs in task
     #11 (data/compute architecture) before build starts, not decided further here;
     flagging now so it's accounted for in that scoping conversation and doesn't surface as
     a surprise scope addition later.

   **Still open, found right after the above and not yet resolved — Scorer V2 work paused
     2026-10-22 before this was settled:** `canonical_category()`/`get_category_peers()`
     (the functions the reclassifier above would have to change) are shared infrastructure
     already used by **five live things**, not just the future Scorer V2 — the live V1
     `scorer.py`, `category_ranking.py`, `fund_ranking.py`, `scenario_engine.py`, and
     `amfi_factsheet_client.py`. Building the reclassifier forces a choice that hasn't been
     made yet: **(A)** fix it at the shared source, so all 5 features become correct
     together (more correct — the other 4 have the same staleness today, just unnoticed —
     but means regression-testing 4 already-shipped live features over a change motivated
     by a feature that isn't live yet); or **(B)** scope the reclassifier as a Scorer-V2-only
     override that leaves the shared function and the other 4 features untouched (safer,
     but creates two disagreeing sources of truth — category ranking could call a fund
     "Sectoral/Thematic" while Scorer V2 calls the same fund "Thematic Fund"). **Next session
     picking this up should get Ayush's call on (A) vs (B) before any reclassifier design
     work starts** — full detail: `00-RESUME-HERE.md` in this folder.

   **Decided 2026-10-22 — in scope, score for existing locked-in investors.** The
   26-Feb-2026 circular **discontinued Solution-Oriented Schemes outright** (Retirement
   Fund, Children's Fund) — no new subscriptions accepted as of the circular, existing
   investors stay invested, being functionally replaced by the new "Life Cycle Fund"
   category. This means `"Solution Oriented Scheme - Children's Fund"` (12 funds after the
   alias fix above) and `"Solution Oriented Scheme - Retirement Fund"` (29 funds) are now
   **permanently closed, shrinking-by-attrition categories**, not temporarily small ones —
   Children's Fund will never organically grow past 15 the way a young, still-accepting-
   subscriptions category might. Scorer V2 scores them anyway: an investor already holding
   one of these funds still needs to know how good it is relative to its peers, even though
   nobody can newly buy in — "can I still invest new money here" and "how is my existing
   holding doing" are different questions, and this scorer answers the second one too. No
   special-casing needed beyond what item 8's widening rule already handles for small,
   non-growing categories (both land in the low-confidence, no-merge tier below) — this was
   a scope call, not a new mechanics problem.

   **The widening rule itself, corrected — a conservative two-tier design, not "merge into
   whatever's closest":**
   1. **Merge only where there is a current, verified, regulator-established equivalence —
      not a Unifolio-invented one, and not something recalled-but-unchecked** — because a
      false merge directly breaks the methodology's own central promise ("every fund is
      scored only against other funds in its own SEBI scheme category," §1). After the
      Contra/Value retraction above, two cases survive verification:
      - **Gilt Fund ↔ Gilt Fund with 10-Year Constant Duration.** Both categories are
        restricted to the identical instrument universe (≥80% Government securities,
        zero credit risk) and differ *only* in one mandated parameter — a fixed ~10-year
        duration for the CMD variant versus manager discretion on duration for plain Gilt.
        This is the same *kind* of argument as the duration ladder below (a single-axis
        split within one otherwise-identical restricted universe), not an AMC-choice
        exclusivity claim, so it isn't affected by the Feb-2026 retraction above. Gilt -
        10yr CMD (5 funds) merges one hop into plain Gilt Fund (23 funds) — only the CMD
        category's funds get scored against the widened pool; Gilt Fund's own 23 are
        untouched.
      - **Adjacent bands on the debt duration ladder, one hop, with a corrected tie-break
        rule.** SEBI defines 8 duration-based Debt categories as contiguous bands on a
        single number (Macaulay duration): Overnight < Liquid < Ultra Short < Low < Money
        Market < Short < Medium < Medium-to-Long < Long. **Dynamic Bond is deliberately
        excluded from this ladder** even though it's often listed alongside these eight —
        it carries no fixed duration mandate at all (manager's discretion across the full
        spectrum), so treating it as "the next rung above Long" would merge a narrow,
        well-defined band into a category that could be anywhere, defeating the point of
        checking which narrow band a fund is actually in.
        - **Tie-break, corrected from the first pass:** a sub-15 band first tries to merge
          one hop into whichever adjacent band is *already independently ≥15* (doesn't
          need widening itself) — this avoids compounding two already-thin pools together.
          Only if **no** adjacent band is independently ≥15 does it merge symmetrically
          with its adjacent sub-15 neighbor instead, in which case **both** sides' funds
          rank against the combined pool (not just the smaller one borrowing from a
          falsely-assumed-stable larger one).
        - Applied to live numbers: **Long Duration (11)**'s only ladder-adjacent neighbor
          is Medium-to-Long (13) — also below 15, so this is the symmetric case: Long +
          Medium-to-Long merge into one 24-fund pool, both sides ranked against it. (The
          first pass of this answer wrongly treated Medium-to-Long as if it were already a
          stable ≥15 host for Long to borrow from, without checking that Medium-to-Long
          needed widening too — corrected here.) **Medium Duration (14)** was missed
          entirely in the first pass despite qualifying under this same rule — it sits
          between Short (27, independently ≥15) and Medium-to-Long (13, already resolved
          above into a 24-fund pool). Per the tie-break, it merges into the
          independently-stable neighbor: Medium Duration's 14 funds borrow into Short's 27
          (41 combined); Short's own 27 funds are untouched, and Medium-to-Long's
          already-resolved 24-fund pool isn't touched a second time.
        - This is NOT extended to credit-quality categories (Credit Risk Fund vs Corporate
          Bond Fund) even though they also sit on a single axis — those two exist
          specifically to isolate credit risk from each other (Corporate Bond mandates
          ≥80% AA+-and-above, Credit Risk mandates ≥65% AA-and-below); merging them would
          erase the exact distinction the category split was built to preserve.
   2. **Everything else below 15 is flagged low-confidence instead of force-merged** —
      **Contra Fund and Balanced Hybrid Fund now included here** (retracted from the merge
      tier above), plus Dividend Yield Fund, Floating Interest Rates Fund, Credit Risk Fund
      (borderline, at exactly 15), Silver/Hybrid/overseas-investing ETFs, Life Cycle Funds
      (brand new post-circular, may organically grow past 15 as more AMCs launch into it —
      worth re-checking in a future pass rather than assumed permanent), Fixed Term Plan,
      Debt "Other"/"Sectoral" catch-alls, Solution-Oriented Children's/Retirement (in scope
      per the decision above — frozen, closed-to-new-money, so stays in this tier
      permanently rather than being expected to grow past 15), etc. None of these has
      a verified regulator-sanctioned sibling the way Gilt/Gilt-CMD or the duration ladder
      do — a visible low-confidence flag is strictly more honest than a merge that can't be
      defended the same way.
   3. **Disclosure, reusing the pattern already locked in for item 7's passive/zero-
      tracking-error case:** a widened score must visibly say it was scored against an
      expanded peer group (naming both categories and the combined fund count) rather than
      presenting it as an ordinary single-category score — same "no silent substitution"
      mechanism (§5), same deferral of exact copy/placement to task #10.
   4. **Which count to check against 15:** `get_category_peers`'s existing `fund_count`
      field (plan-type-agnostic, i.e. counts a fund once regardless of how many Direct/
      Regular/Growth/IDCW variants it has) — already computed, already correct for this
      purpose, no new counting logic needed.
9. **Provisional-fund (1–3Y) component eligibility — resolved 2026-10-21/22.** Walked all
   11 components against what each one actually needs to compute, not a blanket "provisional
   = half the components":
   - **Need zero track record at all (point-in-time snapshots):** Valuation Overlay (5%)
     and Expense Ratio Level (6%) compare *current* PE/PB and *current* TER against the
     category average — neither needs a single day of NAV history. These are fully
     computable even for a fund days old, no "provisional" caveat applies to them
     specifically.
   - **Degrade gracefully, same §5 exclude-and-renormalize mechanism already used for
     missing components generally — not a special provisional-only code path:** Rolling
     Return (25%), Beats Category Average (12%), Top-Quartile Frequency (8%), Max Drawdown
     (7.5%), Sortino (10%). A 13-month-old fund simply has no 2-5Y rolling windows yet —
     only whatever window lengths actually fit inside its live history contribute to the
     blend (per item 1/2's resolved recency-weighted rolling-window design), with shorter
     windows naturally dominating the blend early on. This is real, not a workaround: a
     young fund's rolling-return history genuinely only contains 1Y observations.
   - **Computable but need their own minimum-observation floor, independent of the
     blanket 1-3Y gate:** Down Capture (7.5%), Up Capture (5%), Information Ratio (10%).
     These need a benchmark series and either qualifying up/down months (capture ratios)
     or enough monthly points for a stable tracking-error estimate (Information Ratio) —
     a fund could clear the 1-year minimum-track-record gate in §5 and still have, say,
     zero down-months in its short life (a fund launched into a pure bull run), in which
     case Down Capture has nothing to compute from and is excluded under the normal §5
     rule (excluded from numerator and denominator both, never zero-filled or guessed).
   - **Hard-excluded below 24 months, no partial version possible:** Expense Ratio Trend
     (4%) — item 5's `COST_TREND_WINDOW_MONTHS = 24` is a comparison between two points
     24 months apart; a fund younger than that has no second point to compare against, so
     there is no "partial trend" to show, only none at all.
   - **UI treatment:** the breakdown should list all 11 components by name always — an
     excluded one shows as "not yet available (needs N more months of history)" rather
     than being silently dropped from the list, keeping the same "never a black-box"
     promise for what's *not* scored, not just what is. The provisional badge itself,
     exact copy, and placement are task #10's call, not reinvented here. The already-
     proposed default in item 12 (score suppressed below 50% available weight) is the
     correct backstop for this case too — a typical 13-month fund still clears ~73.5%
     available weight even with Cost Trend and all three capture/IR components excluded,
     so it renders provisional; only a genuinely data-starved fund would fall below 50%
     and go fully unscored instead.
   - **One interaction worth naming, caught on re-check:** item 8 (category size) and item
     9 (fund age) are independent gates that can both apply to the same fund at once — e.g.
     a 13-month-old fund sitting in a sub-15 or low-confidence category gets *both* caveats
     simultaneously (provisional badge *and* low-confidence/widened-peer-set disclosure),
     not one overriding the other. No special-case handling needed — both mechanisms
     already degrade independently via the same §5 exclude-and-renormalize machinery — but
     worth saying explicitly so the UI (task #10) knows to show both badges together rather
     than assuming they're mutually exclusive.

## B. Proposed defaults — reply only if you want something different

10. **Final score = direct weighted sum, no second re-rank.** Already answered by
    reading §3 of the approved doc itself: `Score(f,t) = 0.25·Return + 0.12·BeatsAvg +
    ...` is a direct weighted combination of percentiles, with no re-rank pass afterward
    (unlike the current scorer's blend-then-rerank-then-TER-nudge). Flagging so it's
    explicit, not because it's actually open.
11. **Tier bands.** The approved doc doesn't mention tiers at all. Proposed default:
    keep the current 5-tier equal 20-point bands (80/60/40/20) applied to the final 0–100
    score, unless you want them changed.
12. **Minimum available-weight threshold.** Proposed default: if renormalized weight
    available is below 50% of total (i.e. more than half the components are missing),
    don't produce a score — mark unscored rather than showing a number built on a
    minority of its intended inputs. Open to a different threshold.

## C. Soft note, not a blocking question

13. The doc's overview sentence says "ten weighted components across six buckets," but
    the actual table has 11 components across 7 buckets (sums to 100% correctly). Likely
    just a stale summary sentence from an earlier draft — flagging in case it's not, but
    not treating it as blocking unless you say otherwise.
