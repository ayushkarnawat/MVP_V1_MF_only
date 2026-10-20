# Score explainer check: methodology doc vs code (P1-T6 gate)
Date 2026-10-20. Sources: `Docs/Updated_and_Approved_Unifolio_Fund_Scoring_Methodology.md`, `backend/app/services/analytics/scorer.py`, `fund_ranking.py`, `frontend/src/features/analytics/ScorerSection.tsx`, `FundScoreCard.tsx`.

## Result: THE DOC AND THE CODE DISAGREE on the Fund Quality Score. Stopped per plan; the user decides.

| Item | Approved methodology doc | Code today |
|---|---|---|
| Fund Quality Score inputs | Ten components in six buckets: Return 25%, Beats-average 12%, Top-quartile 8%, Drawdown 7.5%, Down-capture 7.5%, Sortino 10%, Information ratio 10%, Up-capture 5%, Valuation 5%, Cost level 6%, Cost trend 4% (sums to 100) | Three factors only: Return 45%, Risk (downside deviation, inverted) 30%, Consistency 25% (`scorer.py:45-47`), then a TER nudge of ±0.25 with a 0.05pp dead zone. The nudge is added to the composite percentile, result clamped 0-100 |
| Score meaning | Weighted sum of category percentiles | Composite percentile of the 45/30/25 mix (plus nudge); the tier comes from that percentile |
| Tiers | not defined | Percentile bands 80/60/40/20 give Tier 5/4/3/2/1 (`_tier_from_percentile`); UI says Tier 1 = "Top 20%" (matches) |
| Portfolio verdict bands | not defined | Frontend only: 70+ High Quality, 50+ Moderate, else Needs Review (`ScorerSection.tsx:88`) |
| Composite rating (Fund Ranking) | not described in this doc | 25% 3Y return, 25% 5Y return, 20% category-relative, 15% low volatility, 15% low TER (`fund_ranking.py:57-62`; stored in `RankingWeight`, defaults only) |

What does agree: the 45/30/25 weights the UI already shows (the S20 text), the five tiers, the verdict bands as shown, and the five composite-rating weights.

## Decision needed
The explainer must describe one methodology. Options: (A) explain what the code does today (45/30/25 + cost nudge) and leave the ten-component doc as a future target; (B) treat the doc as the truth and plan a scorer change first (a separate, larger task); (C) hold the explainer until the scoring is settled. P1-T6 is on hold until then. P1-T5 (tier colours) is unaffected.

## Decision (2026-10-20)
User chose option A: the explainer describes what the code does today (45/30/25 plus the TER adjustment). The ten-component doc stays a future target. P1-T6 runs as its own run after R3, once the user approves the copy (D7).
