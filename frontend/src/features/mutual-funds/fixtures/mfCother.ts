// SPEC FIXTURES (packet MF-C, Other Analytics half). Orchestrator-owned: never edit.
// NOT real backend output: the analytics sections have no golden-fixture generator yet. Produced by a script with exact Decimal
// arithmetic (cost = value x TER / 100 rounded half up to paise, 3 and 5 years are 3x and 5x; the weighted TER and the weighted score
// are value weighted; every figure for a fund that appears in two sections is the same number in both) and validated against the
// backend pydantic response models (WeightedTerSummary, DirectRegularTerComparison, ValuationSummary, PortfolioScoreSummary,
// CategoryRankingSummary, FundRankingSummary in backend/app/services/analytics/schemas.py), which are authoritative.
// Household: the four valued funds of ./index.ts (Kotak 15,40,000, HDFC 13,10,000, JM 9,80,000, SBI Bluechip 8,19,340; total 46,49,340).
// SBI Bluechip has no TER on file, no category and too short a history; Axis Midcap has no value so no section lists it.
import type {
  CategoryRankingSummary, DirectRegularTerComparison, FundRankingSummary, PortfolioScoreSummary, ValuationSummary, WeightedTerSummary,
} from "../types";

const TER: WeightedTerSummary = {
 "weighted_ter": "0.64",
 "covered_value": "3830000.00",
 "total_value": "4649340.00",
 "reference_period": "2026-03-31",
 "uncovered_schemes": [
  "SBI Bluechip Fund"
 ],
 "cost_1y": "24505.00",
 "cost_3y": "73515.00",
 "cost_5y": "122525.00",
 "funds": [
  {
   "scheme_id": "S-KOTAK",
   "scheme_name": "Kotak Multi Cap Fund",
   "plan_type": "direct",
   "ter": "0.58",
   "value": "1540000.00",
   "cost_1y": "8932.00",
   "cost_3y": "26796.00",
   "cost_5y": "44660.00"
  },
  {
   "scheme_id": "S-HDFC",
   "scheme_name": "HDFC Mid-Cap Opportunities Fund",
   "plan_type": "direct",
   "ter": "0.71",
   "value": "1310000.00",
   "cost_1y": "9301.00",
   "cost_3y": "27903.00",
   "cost_5y": "46505.00"
  },
  {
   "scheme_id": "S-JM",
   "scheme_name": "JM Flexi Cap Fund",
   "plan_type": "direct",
   "ter": "0.64",
   "value": "980000.00",
   "cost_1y": "6272.00",
   "cost_3y": "18816.00",
   "cost_5y": "31360.00"
  },
  {
   "scheme_id": "S-SBI",
   "scheme_name": "SBI Bluechip Fund",
   "plan_type": "regular",
   "ter": null,
   "value": "819340.00",
   "cost_1y": null,
   "cost_3y": null,
   "cost_5y": null
  }
 ]
};
const TER_SAVINGS: WeightedTerSummary = {
 "weighted_ter": "0.64",
 "covered_value": "3830000.00",
 "total_value": "4649340.00",
 "reference_period": "2026-03-31",
 "uncovered_schemes": [
  "SBI Bluechip Fund"
 ],
 "cost_1y": "24505.00",
 "cost_3y": "73515.00",
 "cost_5y": "122525.00",
 "funds": [
  {
   "scheme_id": "S-KOTAK",
   "scheme_name": "Kotak Multi Cap Fund",
   "plan_type": "direct",
   "ter": "0.58",
   "value": "1540000.00",
   "cost_1y": "8932.00",
   "cost_3y": "26796.00",
   "cost_5y": "44660.00",
   "annual_ter_saving": "12782.00"
  },
  {
   "scheme_id": "S-HDFC",
   "scheme_name": "HDFC Mid-Cap Opportunities Fund",
   "plan_type": "direct",
   "ter": "0.71",
   "value": "1310000.00",
   "cost_1y": "9301.00",
   "cost_3y": "27903.00",
   "cost_5y": "46505.00",
   "annual_ter_saving": "8777.00"
  },
  {
   "scheme_id": "S-JM",
   "scheme_name": "JM Flexi Cap Fund",
   "plan_type": "direct",
   "ter": "0.64",
   "value": "980000.00",
   "cost_1y": "6272.00",
   "cost_3y": "18816.00",
   "cost_5y": "31360.00",
   "annual_ter_saving": "8036.00"
  },
  {
   "scheme_id": "S-SBI",
   "scheme_name": "SBI Bluechip Fund",
   "plan_type": "regular",
   "ter": null,
   "value": "819340.00",
   "cost_1y": null,
   "cost_3y": null,
   "cost_5y": null
  }
 ]
};
const DIRECT_REGULAR: DirectRegularTerComparison = {
 "direct": {
  "weighted_ter": "0.64",
  "covered_value": "3830000.00",
  "total_value": "3830000.00",
  "reference_period": "2026-03-31",
  "uncovered_schemes": [],
  "cost_1y": "24505.00",
  "cost_3y": "73515.00",
  "cost_5y": "122525.00",
  "funds": []
 },
 "regular": {
  "weighted_ter": null,
  "covered_value": "0",
  "total_value": "819340.00",
  "reference_period": "2026-03-31",
  "uncovered_schemes": [
   "SBI Bluechip Fund"
  ],
  "cost_1y": null,
  "cost_3y": null,
  "cost_5y": null,
  "funds": []
 }
};
const DIRECT_REGULAR_BOTH: DirectRegularTerComparison = {
 "direct": {
  "weighted_ter": "0.64",
  "covered_value": "3830000.00",
  "total_value": "3830000.00",
  "reference_period": "2026-03-31",
  "uncovered_schemes": [],
  "cost_1y": "24505.00",
  "cost_3y": "73515.00",
  "cost_5y": "122525.00",
  "funds": []
 },
 "regular": {
  "weighted_ter": "1.42",
  "covered_value": "819340.00",
  "total_value": "819340.00",
  "reference_period": "2026-03-31",
  "uncovered_schemes": [],
  "cost_1y": "11634.63",
  "cost_3y": "34903.89",
  "cost_5y": "58173.15",
  "funds": []
 }
};
const VALUATION: ValuationSummary = {
 "pe": {
  "ratio": "23.40",
  "coverage_pct": "86.40",
  "enough_data": true,
  "as_of_date": "2026-10-23",
  "missing": [
   {
    "isin": "INE758T01015",
    "instrument_name": "Zomato Ltd",
    "exposure_value": "65276.73",
    "percentage_equity": "1.80",
    "reason": "negative earnings (P/E not meaningful)"
   }
  ]
 },
 "pb": {
  "ratio": "4.10",
  "coverage_pct": "84.20",
  "enough_data": true,
  "as_of_date": "2026-10-22",
  "missing": [
   {
    "isin": "INE027H01010",
    "instrument_name": "Max Healthcare Institute Ltd",
    "exposure_value": "87035.64",
    "percentage_equity": "2.40",
    "reason": "no book value on file"
   },
   {
    "isin": null,
    "instrument_name": "Unlisted Holding Co",
    "exposure_value": "21758.91",
    "percentage_equity": "0.60",
    "reason": "not matched to a listed stock"
   }
  ]
 },
 "indices": [
  {
   "index_name": "nifty_50",
   "pe_ratio": "20.50",
   "pb_ratio": "3.60",
   "pe_as_of": "2026-10-23",
   "pb_as_of": "2026-10-22",
   "pe_delta_pct": "14.15",
   "pb_delta_pct": "13.89"
  },
  {
   "index_name": "nifty_500",
   "pe_ratio": "21.90",
   "pb_ratio": "3.80",
   "pe_as_of": "2026-10-23",
   "pb_as_of": "2026-10-22",
   "pe_delta_pct": "6.85",
   "pb_delta_pct": "7.89"
  }
 ],
 "total_equity_value": "3626485.20",
 "total_portfolio_value": "4649340.00",
 "nav_as_of": "2026-10-24",
 "holdings_as_of": "2026-09-30",
 "coverage": {
  "covered_value_pct": "91.41",
  "not_published_yet": [
   {
    "scheme_id": "S-HDOV",
    "scheme_name": "HDFC Overnight Fund"
   }
  ],
  "not_available_from_amc": [
   {
    "scheme_id": "S-AXINT",
    "scheme_name": "Axis International Fund of Fund"
   }
  ],
  "missing_value_schemes": [
   {
    "scheme_id": "S-AXIS",
    "scheme_name": "Axis Midcap Fund"
   }
  ],
  "funds": [
   {
    "scheme_id": "S-KOTAK",
    "scheme_name": "Kotak Multi Cap Fund",
    "holdings_as_of": "2026-09-30",
    "cadence": "monthly",
    "age_tag": null
   },
   {
    "scheme_id": "S-JM",
    "scheme_name": "JM Flexi Cap Fund",
    "holdings_as_of": "2026-09-30",
    "cadence": "monthly",
    "age_tag": null
   },
   {
    "scheme_id": "S-HDFC",
    "scheme_name": "HDFC Mid-Cap Opportunities Fund",
    "holdings_as_of": "2026-09-30",
    "cadence": "monthly",
    "age_tag": null
   },
   {
    "scheme_id": "S-SBI",
    "scheme_name": "SBI Bluechip Fund",
    "holdings_as_of": "2026-06-30",
    "cadence": "half_yearly",
    "age_tag": "on_cycle"
   }
  ]
 },
 "hide_headlines": false,
 "excluded_share": "2.10",
 "footnotes": [
  "Valuation data for Max Healthcare Institute Ltd is 4 days stale (last refreshed 19 Oct 2026).",
  "Nifty 500 P/B is from the previous trading day."
 ]
};
const SCORE: PortfolioScoreSummary = {
 "funds": [
  {
   "scheme_id": "S-KOTAK",
   "scheme_name": "Kotak Multi Cap Fund",
   "category_unavailable": false,
   "insufficient_history": false,
   "thin_category": false,
   "risk_adjusted_tier": 5,
   "cost_adjustment": "0.25",
   "final_score": "84.2",
   "return_percentile": "88.0",
   "risk_percentile": "79.0",
   "consistency_hit_rate": "85.0",
   "scheme_return": "0.1510",
   "category_avg_return": "0.1300",
   "downside_deviation": "0.0284",
   "category_avg_downside_deviation": "0.0330",
   "consistency_hits": 51,
   "consistency_total_windows": 60
  },
  {
   "scheme_id": "S-HDFC",
   "scheme_name": "HDFC Mid-Cap Opportunities Fund",
   "category_unavailable": false,
   "insufficient_history": false,
   "thin_category": true,
   "risk_adjusted_tier": 3,
   "cost_adjustment": "-0.25",
   "final_score": "62.9",
   "return_percentile": "58.0",
   "risk_percentile": "55.0",
   "consistency_hit_rate": "70.0",
   "scheme_return": "0.1440",
   "category_avg_return": "0.1690",
   "downside_deviation": "0.0391",
   "category_avg_downside_deviation": "0.0330",
   "consistency_hits": 42,
   "consistency_total_windows": 60
  },
  {
   "scheme_id": "S-JM",
   "scheme_name": "JM Flexi Cap Fund",
   "category_unavailable": false,
   "insufficient_history": false,
   "thin_category": false,
   "risk_adjusted_tier": 4,
   "cost_adjustment": "0.00",
   "final_score": "71.4",
   "return_percentile": "74.0",
   "risk_percentile": "68.0",
   "consistency_hit_rate": "72.0",
   "scheme_return": "0.1080",
   "category_avg_return": "0.1260",
   "downside_deviation": "0.0335",
   "category_avg_downside_deviation": "0.0330",
   "consistency_hits": 43,
   "consistency_total_windows": 60
  },
  {
   "scheme_id": "S-SBI",
   "scheme_name": "SBI Bluechip Fund",
   "category_unavailable": false,
   "insufficient_history": true,
   "thin_category": false,
   "risk_adjusted_tier": null,
   "cost_adjustment": null,
   "final_score": null,
   "return_percentile": null,
   "risk_percentile": null,
   "consistency_hit_rate": null,
   "scheme_return": null,
   "category_avg_return": null,
   "downside_deviation": null,
   "category_avg_downside_deviation": null,
   "consistency_hits": null,
   "consistency_total_windows": null
  }
 ],
 "weighted_score": "73.6",
 "covered_value": "3830000.00",
 "total_value": "4649340.00",
 "uncovered_schemes": [
  "SBI Bluechip Fund"
 ]
};
const CATEGORY_RANKING: CategoryRankingSummary = {
 "funds": [
  {
   "scheme_id": "S-KOTAK",
   "scheme_name": "Kotak Multi Cap Fund",
   "sebi_category": "Flexi Cap Fund",
   "category_unavailable": false,
   "insufficient_history": false,
   "scheme_return": "0.1510",
   "category_rank": 12,
   "category_size": 28,
   "percentile": "59.3",
   "category_avg_return": "0.1300",
   "thin_category": false,
   "periods": {
    "1y": {
     "fund_return": "0.1840",
     "category_avg": "0.1520",
     "peers": 28
    },
    "3y": {
     "fund_return": "0.1510",
     "category_avg": "0.1300",
     "peers": 28
    },
    "5y": {
     "fund_return": "0.1680",
     "category_avg": "0.1450",
     "peers": 24
    }
   },
   "plan_type": "direct"
  },
  {
   "scheme_id": "S-HDFC",
   "scheme_name": "HDFC Mid-Cap Opportunities Fund",
   "sebi_category": "Mid Cap Fund",
   "category_unavailable": false,
   "insufficient_history": false,
   "scheme_return": "0.1440",
   "category_rank": 11,
   "category_size": 14,
   "percentile": "23.1",
   "category_avg_return": "0.1690",
   "thin_category": true,
   "periods": {
    "1y": {
     "fund_return": "0.1900",
     "category_avg": "0.2150",
     "peers": 14
    },
    "3y": {
     "fund_return": "0.1440",
     "category_avg": "0.1690",
     "peers": 14
    },
    "5y": {
     "fund_return": "0.1790",
     "category_avg": "0.1920",
     "peers": 13
    }
   },
   "plan_type": "direct"
  },
  {
   "scheme_id": "S-JM",
   "scheme_name": "JM Flexi Cap Fund",
   "sebi_category": "Flexi Cap Fund",
   "category_unavailable": false,
   "insufficient_history": false,
   "scheme_return": "0.1080",
   "category_rank": 34,
   "category_size": 42,
   "percentile": "19.5",
   "category_avg_return": "0.1260",
   "thin_category": false,
   "periods": {
    "1y": {
     "fund_return": "0.1130",
     "category_avg": "0.1410",
     "peers": 42
    },
    "3y": {
     "fund_return": "0.1080",
     "category_avg": "0.1260",
     "peers": 42
    },
    "5y": {
     "fund_return": "0.1210",
     "category_avg": "0.1390",
     "peers": 38
    }
   },
   "plan_type": "direct"
  },
  {
   "scheme_id": "S-SBI",
   "scheme_name": "SBI Bluechip Fund",
   "sebi_category": null,
   "category_unavailable": true,
   "insufficient_history": false,
   "scheme_return": null,
   "category_rank": null,
   "category_size": 0,
   "percentile": null,
   "category_avg_return": null,
   "thin_category": false,
   "periods": {},
   "plan_type": "regular"
  }
 ]
};
const FUND_RANKING: FundRankingSummary = {
 "funds": [
  {
   "scheme_id": "S-KOTAK",
   "scheme_name": "Kotak Multi Cap Fund",
   "category_unavailable": false,
   "insufficient_history": false,
   "thin_category": false,
   "too_few_peers": false,
   "plan_type": "direct",
   "category_name": "Equity Scheme - Flexi Cap Fund",
   "composite_score": "82.0",
   "category_rank": 4,
   "category_size": 28,
   "category_universe_size": 40,
   "percentile": "89.3",
   "return_1y": "0.1840",
   "ranked_as": "3Y and 5Y returns",
   "neighbors": [
    {
     "scheme_id": "N-EDEL",
     "scheme_name": "Edelweiss Flexi Cap Fund",
     "category_rank": 3,
     "composite_score": "86.0"
    },
    {
     "scheme_id": "N-BARODA",
     "scheme_name": "Baroda BNP Paribas Flexi Cap Fund",
     "category_rank": 5,
     "composite_score": "79.0"
    }
   ],
   "components": {
    "return_3y": {
     "percentile": "91.0",
     "raw": "0.1510"
    },
    "return_5y": {
     "percentile": "87.0",
     "raw": "0.1680"
    },
    "category_relative": {
     "percentile": "78.0",
     "raw": "0.0210"
    },
    "low_volatility": {
     "percentile": "72.0",
     "raw": "0.0284"
    },
    "low_ter": {
     "percentile": "61.0",
     "raw": "0.58"
    }
   },
   "horizons": {
    "1y": {
     "fund_return": "0.1840",
     "category_avg": "0.1520",
     "peers": 28
    },
    "3y": {
     "fund_return": "0.1510",
     "category_avg": "0.1300",
     "peers": 28
    },
    "5y": {
     "fund_return": "0.1680",
     "category_avg": "0.1450",
     "peers": 24
    }
   }
  },
  {
   "scheme_id": "S-HDFC",
   "scheme_name": "HDFC Mid-Cap Opportunities Fund",
   "category_unavailable": false,
   "insufficient_history": false,
   "thin_category": true,
   "too_few_peers": false,
   "plan_type": "direct",
   "category_name": "Equity Scheme - Mid Cap Fund",
   "composite_score": "61.0",
   "category_rank": 3,
   "category_size": 4,
   "category_universe_size": 14,
   "percentile": null,
   "return_1y": "0.1900",
   "ranked_as": "3Y and 5Y returns",
   "neighbors": [
    {
     "scheme_id": "N-MOT",
     "scheme_name": "Motilal Oswal Midcap Fund",
     "category_rank": 2,
     "composite_score": "74.0"
    },
    {
     "scheme_id": "N-NIP",
     "scheme_name": "Nippon India Growth Fund",
     "category_rank": 4,
     "composite_score": "55.0"
    }
   ],
   "components": {
    "return_3y": {
     "percentile": "42.0",
     "raw": "0.1440"
    },
    "return_5y": {
     "percentile": "46.0",
     "raw": "0.1790"
    },
    "category_relative": {
     "percentile": "38.0",
     "raw": "-0.0250"
    },
    "low_volatility": {
     "percentile": "55.0",
     "raw": "0.0391"
    },
    "low_ter": {
     "percentile": "30.0",
     "raw": "0.71"
    }
   },
   "horizons": {
    "1y": {
     "fund_return": "0.1900",
     "category_avg": "0.2150",
     "peers": 14
    },
    "3y": {
     "fund_return": "0.1440",
     "category_avg": "0.1690",
     "peers": 14
    },
    "5y": {
     "fund_return": "0.1790",
     "category_avg": "0.1920",
     "peers": 13
    }
   }
  },
  {
   "scheme_id": "S-JM",
   "scheme_name": "JM Flexi Cap Fund",
   "category_unavailable": false,
   "insufficient_history": false,
   "thin_category": false,
   "too_few_peers": false,
   "plan_type": "direct",
   "category_name": "Equity Scheme - Flexi Cap Fund",
   "composite_score": "71.0",
   "category_rank": 11,
   "category_size": 42,
   "category_universe_size": 51,
   "percentile": "75.6",
   "return_1y": "0.1130",
   "ranked_as": "3Y and 5Y returns",
   "neighbors": [
    {
     "scheme_id": "N-UTI",
     "scheme_name": "UTI Flexi Cap Fund",
     "category_rank": 10,
     "composite_score": "73.0"
    },
    {
     "scheme_id": "N-FRK",
     "scheme_name": "Franklin India Flexi Cap Fund",
     "category_rank": 12,
     "composite_score": "69.0"
    }
   ],
   "components": {
    "return_3y": {
     "percentile": "68.0",
     "raw": "0.1080"
    },
    "return_5y": {
     "percentile": "65.0",
     "raw": "0.1210"
    },
    "category_relative": {
     "percentile": "60.0",
     "raw": "-0.0180"
    },
    "low_volatility": {
     "percentile": "49.0",
     "raw": "0.0335"
    },
    "low_ter": {
     "percentile": "52.0",
     "raw": "0.64"
    }
   },
   "horizons": {
    "1y": {
     "fund_return": "0.1130",
     "category_avg": "0.1410",
     "peers": 42
    },
    "3y": {
     "fund_return": "0.1080",
     "category_avg": "0.1260",
     "peers": 42
    },
    "5y": {
     "fund_return": "0.1210",
     "category_avg": "0.1390",
     "peers": 38
    }
   }
  },
  {
   "scheme_id": "S-SBI",
   "scheme_name": "SBI Bluechip Fund",
   "category_unavailable": false,
   "insufficient_history": true,
   "thin_category": false,
   "too_few_peers": false,
   "plan_type": "regular",
   "category_name": "Equity Scheme - Large Cap Fund",
   "composite_score": null,
   "category_rank": null,
   "category_size": 0,
   "category_universe_size": 0,
   "percentile": null,
   "return_1y": null,
   "ranked_as": null,
   "neighbors": [],
   "components": {
    "return_3y": {
     "percentile": null,
     "raw": null
    },
    "return_5y": {
     "percentile": null,
     "raw": null
    },
    "category_relative": {
     "percentile": null,
     "raw": null
    },
    "low_volatility": {
     "percentile": null,
     "raw": null
    },
    "low_ter": {
     "percentile": null,
     "raw": null
    }
   }
  }
 ]
};

export const terSummary = (): WeightedTerSummary => structuredClone(TER);
/** The same summary with the additive `annual_ter_saving` (rupees a year) on the three Direct funds: the backend does not send it yet. */
export const terSummaryWithSavings = (): WeightedTerSummary => structuredClone(TER_SAVINGS);
/** Direct plans have a TER; Regular plans hold only SBI Bluechip, which has none on file. */
export const terDirectRegular = (): DirectRegularTerComparison => structuredClone(DIRECT_REGULAR);
/** The same, with a Regular TER (1.42) so both pins and both bars show. */
export const terDirectRegularBoth = (): DirectRegularTerComparison => structuredClone(DIRECT_REGULAR_BOTH);
export const valuationSummary = (): ValuationSummary => structuredClone(VALUATION);
export const scoreSummary = (): PortfolioScoreSummary => structuredClone(SCORE);
export const categoryRanking = (): CategoryRankingSummary => structuredClone(CATEGORY_RANKING);
export const fundRanking = (): FundRankingSummary => structuredClone(FUND_RANKING);
