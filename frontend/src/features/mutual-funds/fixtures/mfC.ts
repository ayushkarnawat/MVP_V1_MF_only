// SPEC FIXTURES (packet MF-C). Orchestrator-owned: never edit.
// NOT real backend output: the analytics sections have no golden-fixture generator yet. The overlap and look-through data below was
// produced by a script with exact Decimal arithmetic and validated against the backend pydantic response models (OverlapSummary and
// StockHoldingsSummary in backend/app/services/analytics/schemas.py), which are authoritative. Same household as MF-B (Kotak 15,40,000,
// HDFC 13,10,000, JM 9,80,000, SBI Bluechip 8,19,340; total 46,49,340). Every overlap figure is computed from the stock weights of
// the look-through rows below (pair overlap = the sum, over shared stocks, of the smaller weight; funds in matrix order by value).
// The look-through rows are the 24 rows of MF-B plus seven smaller stocks (six shared by Kotak and SBI, one held by JM only), so the
// table is complete (31 stocks, not truncated). The Other Analytics sections come from ./mfCother.
import { ANALYTICS_SECTION_NAMES } from "../types";
import type { AnalyticsScopeResponse, OverlapSummary, StockHoldingsSummary } from "../types";
import { MEMBERS } from "./index";
import { analyticsMfB, analyticsMfBMember } from "./mfB";
import { categoryRanking, fundRanking, scoreSummary, terDirectRegular, terSummary, valuationSummary } from "./mfCother";
const STOCK_HOLDINGS_C: StockHoldingsSummary = {
 "nav_as_of": "2026-10-24",
 "holdings_as_of": "2026-09-30",
 "total_portfolio_value": "4649340.00",
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
 "truncated": false,
 "total_stock_count": 31,
 "hide_headlines": false,
 "excluded_share": "2.10",
 "non_equity_share": "22.00",
 "rows": [
  {
   "isin": "INE040A01034",
   "instrument_name": "HDFC Bank Ltd",
   "sector_raw": "Financial Services",
   "asset_type": "equity_domestic",
   "exposure_pct": "5.7011",
   "exposure_value": "265063.52",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "7.80"
    },
    {
     "scheme_id": "S-JM",
     "scheme_name": "JM Flexi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "21.08",
     "stock_weight_pct": "7.10"
    },
    {
     "scheme_id": "S-SBI",
     "scheme_name": "SBI Bluechip Fund",
     "holdings_as_of": "2026-06-30",
     "cadence": "half_yearly",
     "age_tag": "on_cycle",
     "fund_weight_pct": "17.62",
     "stock_weight_pct": "9.20"
    }
   ]
  },
  {
   "isin": "INE090A01021",
   "instrument_name": "ICICI Bank Ltd",
   "sector_raw": "Financial Services",
   "asset_type": "equity_domestic",
   "exposure_pct": "5.5644",
   "exposure_value": "258707.87",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "6.90"
    },
    {
     "scheme_id": "S-JM",
     "scheme_name": "JM Flexi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "21.08",
     "stock_weight_pct": "8.20"
    },
    {
     "scheme_id": "S-SBI",
     "scheme_name": "SBI Bluechip Fund",
     "holdings_as_of": "2026-06-30",
     "cadence": "half_yearly",
     "age_tag": "on_cycle",
     "fund_weight_pct": "17.62",
     "stock_weight_pct": "8.80"
    }
   ]
  },
  {
   "isin": "INE002A01018",
   "instrument_name": "Reliance Industries Ltd",
   "sector_raw": "Energy",
   "asset_type": "equity_domestic",
   "exposure_pct": "4.2938",
   "exposure_value": "199633.36",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "5.60"
    },
    {
     "scheme_id": "S-JM",
     "scheme_name": "JM Flexi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "21.08",
     "stock_weight_pct": "4.80"
    },
    {
     "scheme_id": "S-SBI",
     "scheme_name": "SBI Bluechip Fund",
     "holdings_as_of": "2026-06-30",
     "cadence": "half_yearly",
     "age_tag": "on_cycle",
     "fund_weight_pct": "17.62",
     "stock_weight_pct": "8.10"
    }
   ]
  },
  {
   "isin": "INE009A01021",
   "instrument_name": "Infosys Ltd",
   "sector_raw": "Information Technology",
   "asset_type": "equity_domestic",
   "exposure_pct": "4.0786",
   "exposure_value": "189627.98",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "4.90"
    },
    {
     "scheme_id": "S-JM",
     "scheme_name": "JM Flexi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "21.08",
     "stock_weight_pct": "6.30"
    },
    {
     "scheme_id": "S-SBI",
     "scheme_name": "SBI Bluechip Fund",
     "holdings_as_of": "2026-06-30",
     "cadence": "half_yearly",
     "age_tag": "on_cycle",
     "fund_weight_pct": "17.62",
     "stock_weight_pct": "6.40"
    }
   ]
  },
  {
   "isin": "INE018A01030",
   "instrument_name": "Larsen & Toubro Ltd",
   "sector_raw": "Capital Goods",
   "asset_type": "equity_domestic",
   "exposure_pct": "2.3559",
   "exposure_value": "109533.80",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "4.40"
    },
    {
     "scheme_id": "S-SBI",
     "scheme_name": "SBI Bluechip Fund",
     "holdings_as_of": "2026-06-30",
     "cadence": "half_yearly",
     "age_tag": "on_cycle",
     "fund_weight_pct": "17.62",
     "stock_weight_pct": "5.10"
    }
   ]
  },
  {
   "isin": "INE154A01025",
   "instrument_name": "ITC Ltd",
   "sector_raw": "FMCG",
   "asset_type": "equity_domestic",
   "exposure_pct": "1.8880",
   "exposure_value": "87779.54",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "3.20"
    },
    {
     "scheme_id": "S-SBI",
     "scheme_name": "SBI Bluechip Fund",
     "holdings_as_of": "2026-06-30",
     "cadence": "half_yearly",
     "age_tag": "on_cycle",
     "fund_weight_pct": "17.62",
     "stock_weight_pct": "4.70"
    }
   ]
  },
  {
   "isin": "INE591G01025",
   "instrument_name": "Coforge Ltd",
   "sector_raw": "Information Technology",
   "asset_type": "equity_domestic",
   "exposure_pct": "1.7525",
   "exposure_value": "81479.68",
   "contributing_funds": [
    {
     "scheme_id": "S-JM",
     "scheme_name": "JM Flexi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "21.08",
     "stock_weight_pct": "3.10"
    },
    {
     "scheme_id": "S-HDFC",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "28.18",
     "stock_weight_pct": "3.90"
    }
   ]
  },
  {
   "isin": "INE027H01010",
   "instrument_name": "Max Healthcare Institute Ltd",
   "sector_raw": "Healthcare",
   "asset_type": "equity_domestic",
   "exposure_pct": "1.3808",
   "exposure_value": "64198.09",
   "contributing_funds": [
    {
     "scheme_id": "S-HDFC",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "28.18",
     "stock_weight_pct": "4.90"
    }
   ]
  },
  {
   "isin": "INE397D01024",
   "instrument_name": "Bharti Airtel Ltd",
   "sector_raw": "Telecommunication",
   "asset_type": "equity_domestic",
   "exposure_pct": "1.3579",
   "exposure_value": "63133.39",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "4.10"
    }
   ]
  },
  {
   "isin": "INE262H01021",
   "instrument_name": "Persistent Systems Ltd",
   "sector_raw": "Information Technology",
   "asset_type": "equity_domestic",
   "exposure_pct": "1.2963",
   "exposure_value": "60269.39",
   "contributing_funds": [
    {
     "scheme_id": "S-HDFC",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "28.18",
     "stock_weight_pct": "4.60"
    }
   ]
  },
  {
   "isin": "INE238A01034",
   "instrument_name": "Axis Bank Ltd",
   "sector_raw": "Financial Services",
   "asset_type": "equity_domestic",
   "exposure_pct": "1.2586",
   "exposure_value": "58516.59",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "3.80"
    }
   ]
  },
  {
   "isin": "INE053A01029",
   "instrument_name": "Indian Hotels Company Ltd",
   "sector_raw": "Consumer Services",
   "asset_type": "equity_domestic",
   "exposure_pct": "1.1836",
   "exposure_value": "55029.59",
   "contributing_funds": [
    {
     "scheme_id": "S-HDFC",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "28.18",
     "stock_weight_pct": "4.20"
    }
   ]
  },
  {
   "isin": "INE062A01020",
   "instrument_name": "State Bank of India",
   "sector_raw": "Financial Services",
   "asset_type": "equity_domestic",
   "exposure_pct": "1.1592",
   "exposure_value": "53895.15",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "3.50"
    }
   ]
  },
  {
   "isin": "INE296A01032",
   "instrument_name": "Bajaj Finance Ltd",
   "sector_raw": "Financial Services",
   "asset_type": "equity_domestic",
   "exposure_pct": "1.1383",
   "exposure_value": "52923.44",
   "contributing_funds": [
    {
     "scheme_id": "S-JM",
     "scheme_name": "JM Flexi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "21.08",
     "stock_weight_pct": "5.40"
    }
   ]
  },
  {
   "isin": "INE298A01020",
   "instrument_name": "Cummins India Ltd",
   "sector_raw": "Capital Goods",
   "asset_type": "equity_domestic",
   "exposure_pct": "1.0427",
   "exposure_value": "48478.67",
   "contributing_funds": [
    {
     "scheme_id": "S-HDFC",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "28.18",
     "stock_weight_pct": "3.70"
    }
   ]
  },
  {
   "isin": "INE467B01029",
   "instrument_name": "Tata Consultancy Services Ltd",
   "sector_raw": "Information Technology",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.9936",
   "exposure_value": "46195.84",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "3.00"
    }
   ]
  },
  {
   "isin": "INE171A01029",
   "instrument_name": "Federal Bank Ltd",
   "sector_raw": "Financial Services",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.9863",
   "exposure_value": "45856.44",
   "contributing_funds": [
    {
     "scheme_id": "S-HDFC",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "28.18",
     "stock_weight_pct": "3.50"
    }
   ]
  },
  {
   "isin": "INE226A01021",
   "instrument_name": "Voltas Ltd",
   "sector_raw": "Consumer Durables",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.9018",
   "exposure_value": "41927.75",
   "contributing_funds": [
    {
     "scheme_id": "S-HDFC",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "28.18",
     "stock_weight_pct": "3.20"
    }
   ]
  },
  {
   "isin": "INE101A01026",
   "instrument_name": "Mahindra & Mahindra Ltd",
   "sector_raw": "Automobile",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.8611",
   "exposure_value": "40035.47",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "2.60"
    }
   ]
  },
  {
   "isin": "INE974X01010",
   "instrument_name": "Tube Investments of India Ltd",
   "sector_raw": "Automobile",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.8454",
   "exposure_value": "39305.52",
   "contributing_funds": [
    {
     "scheme_id": "S-HDFC",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "28.18",
     "stock_weight_pct": "3.00"
    }
   ]
  },
  {
   "isin": "INE066A01021",
   "instrument_name": "Eicher Motors Ltd",
   "sector_raw": "Automobile",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.8221",
   "exposure_value": "38222.22",
   "contributing_funds": [
    {
     "scheme_id": "S-JM",
     "scheme_name": "JM Flexi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "21.08",
     "stock_weight_pct": "3.90"
    }
   ]
  },
  {
   "isin": "INE660A01013",
   "instrument_name": "Sundaram Finance Ltd",
   "sector_raw": "Financial Services",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.7890",
   "exposure_value": "36683.29",
   "contributing_funds": [
    {
     "scheme_id": "S-HDFC",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "28.18",
     "stock_weight_pct": "2.80"
    }
   ]
  },
  {
   "isin": "INE044A01036",
   "instrument_name": "Sun Pharmaceutical Industries Ltd",
   "sector_raw": "Healthcare",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.7618",
   "exposure_value": "35418.67",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "2.30"
    }
   ]
  },
  {
   "isin": "INE280A01028",
   "instrument_name": "Titan Company Ltd",
   "sector_raw": "Consumer Durables",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.7589",
   "exposure_value": "35283.84",
   "contributing_funds": [
    {
     "scheme_id": "S-JM",
     "scheme_name": "JM Flexi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "21.08",
     "stock_weight_pct": "3.60"
    }
   ]
  },
  {
   "isin": "INE585B01010",
   "instrument_name": "Maruti Suzuki India Ltd",
   "sector_raw": "Automobile and Auto Components",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.7259",
   "exposure_value": "33749.56",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "1.50"
    },
    {
     "scheme_id": "S-SBI",
     "scheme_name": "SBI Bluechip Fund",
     "holdings_as_of": "2026-06-30",
     "cadence": "half_yearly",
     "age_tag": "on_cycle",
     "fund_weight_pct": "17.62",
     "stock_weight_pct": "1.30"
    }
   ]
  },
  {
   "isin": "INE021A01026",
   "instrument_name": "Asian Paints Ltd",
   "sector_raw": "Consumer Durables",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.7125",
   "exposure_value": "33126.55",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "1.30"
    },
    {
     "scheme_id": "S-SBI",
     "scheme_name": "SBI Bluechip Fund",
     "holdings_as_of": "2026-06-30",
     "cadence": "half_yearly",
     "age_tag": "on_cycle",
     "fund_weight_pct": "17.62",
     "stock_weight_pct": "1.60"
    }
   ]
  },
  {
   "isin": "INE237A01028",
   "instrument_name": "Kotak Mahindra Bank Ltd",
   "sector_raw": "Financial Services",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.6949",
   "exposure_value": "32308.26",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "1.30"
    },
    {
     "scheme_id": "S-SBI",
     "scheme_name": "SBI Bluechip Fund",
     "holdings_as_of": "2026-06-30",
     "cadence": "half_yearly",
     "age_tag": "on_cycle",
     "fund_weight_pct": "17.62",
     "stock_weight_pct": "1.50"
    }
   ]
  },
  {
   "isin": "INE030A01027",
   "instrument_name": "Hindustan Unilever Ltd",
   "sector_raw": "Fast Moving Consumer Goods",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.6927",
   "exposure_value": "32205.98",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "1.40"
    },
    {
     "scheme_id": "S-SBI",
     "scheme_name": "SBI Bluechip Fund",
     "holdings_as_of": "2026-06-30",
     "cadence": "half_yearly",
     "age_tag": "on_cycle",
     "fund_weight_pct": "17.62",
     "stock_weight_pct": "1.30"
    }
   ]
  },
  {
   "isin": "INE917I01010",
   "instrument_name": "Bajaj Auto Ltd",
   "sector_raw": "Automobile and Auto Components",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.6772",
   "exposure_value": "31485.33",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "1.30"
    },
    {
     "scheme_id": "S-SBI",
     "scheme_name": "SBI Bluechip Fund",
     "holdings_as_of": "2026-06-30",
     "cadence": "half_yearly",
     "age_tag": "on_cycle",
     "fund_weight_pct": "17.62",
     "stock_weight_pct": "1.40"
    }
   ]
  },
  {
   "isin": "INE239A01024",
   "instrument_name": "Nestle India Ltd",
   "sector_raw": "Fast Moving Consumer Goods",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.6684",
   "exposure_value": "31076.19",
   "contributing_funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "33.12",
     "stock_weight_pct": "1.30"
    },
    {
     "scheme_id": "S-SBI",
     "scheme_name": "SBI Bluechip Fund",
     "holdings_as_of": "2026-06-30",
     "cadence": "half_yearly",
     "age_tag": "on_cycle",
     "fund_weight_pct": "17.62",
     "stock_weight_pct": "1.35"
    }
   ]
  },
  {
   "isin": "INE761H01022",
   "instrument_name": "Page Industries Ltd",
   "sector_raw": "Textiles",
   "asset_type": "equity_domestic",
   "exposure_pct": "0.2530",
   "exposure_value": "11762.83",
   "contributing_funds": [
    {
     "scheme_id": "S-JM",
     "scheme_name": "JM Flexi Cap Fund",
     "holdings_as_of": "2026-09-30",
     "cadence": "monthly",
     "age_tag": null,
     "fund_weight_pct": "21.08",
     "stock_weight_pct": "1.20"
    }
   ]
  }
 ]
};
const OVERLAP: OverlapSummary = {
 "matrix_funds": [
  {
   "scheme_id": "S-KOTAK",
   "scheme_name": "Kotak Multi Cap Fund",
   "current_value": "1540000.00"
  },
  {
   "scheme_id": "S-HDFC",
   "scheme_name": "HDFC Mid-Cap Opportunities Fund",
   "current_value": "1310000.00"
  },
  {
   "scheme_id": "S-JM",
   "scheme_name": "JM Flexi Cap Fund",
   "current_value": "980000.00"
  },
  {
   "scheme_id": "S-SBI",
   "scheme_name": "SBI Bluechip Fund",
   "current_value": "819340.00"
  }
 ],
 "matrix": [
  {
   "fund_a": {
    "scheme_id": "S-KOTAK",
    "scheme_name": "Kotak Multi Cap Fund",
    "current_value": "1540000.00"
   },
   "fund_b": {
    "scheme_id": "S-HDFC",
    "scheme_name": "HDFC Mid-Cap Opportunities Fund",
    "current_value": "1310000.00"
   },
   "overlap_pct": "0.00",
   "common_stocks": [],
   "common_total": 0
  },
  {
   "fund_a": {
    "scheme_id": "S-KOTAK",
    "scheme_name": "Kotak Multi Cap Fund",
    "current_value": "1540000.00"
   },
   "fund_b": {
    "scheme_id": "S-JM",
    "scheme_name": "JM Flexi Cap Fund",
    "current_value": "980000.00"
   },
   "overlap_pct": "23.70",
   "common_stocks": [
    {
     "isin": "INE040A01034",
     "instrument_name": "HDFC Bank Ltd",
     "weight_a": "7.80",
     "weight_b": "7.10"
    },
    {
     "isin": "INE090A01021",
     "instrument_name": "ICICI Bank Ltd",
     "weight_a": "6.90",
     "weight_b": "8.20"
    },
    {
     "isin": "INE009A01021",
     "instrument_name": "Infosys Ltd",
     "weight_a": "4.90",
     "weight_b": "6.30"
    },
    {
     "isin": "INE002A01018",
     "instrument_name": "Reliance Industries Ltd",
     "weight_a": "5.60",
     "weight_b": "4.80"
    }
   ],
   "common_total": 4
  },
  {
   "fund_a": {
    "scheme_id": "S-KOTAK",
    "scheme_name": "Kotak Multi Cap Fund",
    "current_value": "1540000.00"
   },
   "fund_b": {
    "scheme_id": "S-SBI",
    "scheme_name": "SBI Bluechip Fund",
    "current_value": "819340.00"
   },
   "overlap_pct": "40.60",
   "common_stocks": [
    {
     "isin": "INE040A01034",
     "instrument_name": "HDFC Bank Ltd",
     "weight_a": "7.80",
     "weight_b": "9.20"
    },
    {
     "isin": "INE090A01021",
     "instrument_name": "ICICI Bank Ltd",
     "weight_a": "6.90",
     "weight_b": "8.80"
    },
    {
     "isin": "INE002A01018",
     "instrument_name": "Reliance Industries Ltd",
     "weight_a": "5.60",
     "weight_b": "8.10"
    },
    {
     "isin": "INE009A01021",
     "instrument_name": "Infosys Ltd",
     "weight_a": "4.90",
     "weight_b": "6.40"
    },
    {
     "isin": "INE018A01030",
     "instrument_name": "Larsen & Toubro Ltd",
     "weight_a": "4.40",
     "weight_b": "5.10"
    },
    {
     "isin": "INE154A01025",
     "instrument_name": "ITC Ltd",
     "weight_a": "3.20",
     "weight_b": "4.70"
    },
    {
     "isin": "INE021A01026",
     "instrument_name": "Asian Paints Ltd",
     "weight_a": "1.30",
     "weight_b": "1.60"
    },
    {
     "isin": "INE030A01027",
     "instrument_name": "Hindustan Unilever Ltd",
     "weight_a": "1.40",
     "weight_b": "1.30"
    },
    {
     "isin": "INE237A01028",
     "instrument_name": "Kotak Mahindra Bank Ltd",
     "weight_a": "1.30",
     "weight_b": "1.50"
    },
    {
     "isin": "INE239A01024",
     "instrument_name": "Nestle India Ltd",
     "weight_a": "1.30",
     "weight_b": "1.35"
    },
    {
     "isin": "INE585B01010",
     "instrument_name": "Maruti Suzuki India Ltd",
     "weight_a": "1.50",
     "weight_b": "1.30"
    },
    {
     "isin": "INE917I01010",
     "instrument_name": "Bajaj Auto Ltd",
     "weight_a": "1.30",
     "weight_b": "1.40"
    }
   ],
   "common_total": 12
  },
  {
   "fund_a": {
    "scheme_id": "S-HDFC",
    "scheme_name": "HDFC Mid-Cap Opportunities Fund",
    "current_value": "1310000.00"
   },
   "fund_b": {
    "scheme_id": "S-JM",
    "scheme_name": "JM Flexi Cap Fund",
    "current_value": "980000.00"
   },
   "overlap_pct": "3.10",
   "common_stocks": [
    {
     "isin": "INE591G01025",
     "instrument_name": "Coforge Ltd",
     "weight_a": "3.90",
     "weight_b": "3.10"
    }
   ],
   "common_total": 1
  },
  {
   "fund_a": {
    "scheme_id": "S-HDFC",
    "scheme_name": "HDFC Mid-Cap Opportunities Fund",
    "current_value": "1310000.00"
   },
   "fund_b": {
    "scheme_id": "S-SBI",
    "scheme_name": "SBI Bluechip Fund",
    "current_value": "819340.00"
   },
   "overlap_pct": "0.00",
   "common_stocks": [],
   "common_total": 0
  },
  {
   "fund_a": {
    "scheme_id": "S-JM",
    "scheme_name": "JM Flexi Cap Fund",
    "current_value": "980000.00"
   },
   "fund_b": {
    "scheme_id": "S-SBI",
    "scheme_name": "SBI Bluechip Fund",
    "current_value": "819340.00"
   },
   "overlap_pct": "26.40",
   "common_stocks": [
    {
     "isin": "INE090A01021",
     "instrument_name": "ICICI Bank Ltd",
     "weight_a": "8.20",
     "weight_b": "8.80"
    },
    {
     "isin": "INE040A01034",
     "instrument_name": "HDFC Bank Ltd",
     "weight_a": "7.10",
     "weight_b": "9.20"
    },
    {
     "isin": "INE009A01021",
     "instrument_name": "Infosys Ltd",
     "weight_a": "6.30",
     "weight_b": "6.40"
    },
    {
     "isin": "INE002A01018",
     "instrument_name": "Reliance Industries Ltd",
     "weight_a": "4.80",
     "weight_b": "8.10"
    }
   ],
   "common_total": 4
  }
 ],
 "pairs_above_low": [
  {
   "fund_a": {
    "scheme_id": "S-KOTAK",
    "scheme_name": "Kotak Multi Cap Fund",
    "current_value": "1540000.00"
   },
   "fund_b": {
    "scheme_id": "S-SBI",
    "scheme_name": "SBI Bluechip Fund",
    "current_value": "819340.00"
   },
   "overlap_pct": "40.60",
   "common_stocks": [
    {
     "isin": "INE040A01034",
     "instrument_name": "HDFC Bank Ltd",
     "weight_a": "7.80",
     "weight_b": "9.20"
    },
    {
     "isin": "INE090A01021",
     "instrument_name": "ICICI Bank Ltd",
     "weight_a": "6.90",
     "weight_b": "8.80"
    },
    {
     "isin": "INE002A01018",
     "instrument_name": "Reliance Industries Ltd",
     "weight_a": "5.60",
     "weight_b": "8.10"
    },
    {
     "isin": "INE009A01021",
     "instrument_name": "Infosys Ltd",
     "weight_a": "4.90",
     "weight_b": "6.40"
    },
    {
     "isin": "INE018A01030",
     "instrument_name": "Larsen & Toubro Ltd",
     "weight_a": "4.40",
     "weight_b": "5.10"
    },
    {
     "isin": "INE154A01025",
     "instrument_name": "ITC Ltd",
     "weight_a": "3.20",
     "weight_b": "4.70"
    },
    {
     "isin": "INE021A01026",
     "instrument_name": "Asian Paints Ltd",
     "weight_a": "1.30",
     "weight_b": "1.60"
    },
    {
     "isin": "INE030A01027",
     "instrument_name": "Hindustan Unilever Ltd",
     "weight_a": "1.40",
     "weight_b": "1.30"
    },
    {
     "isin": "INE237A01028",
     "instrument_name": "Kotak Mahindra Bank Ltd",
     "weight_a": "1.30",
     "weight_b": "1.50"
    },
    {
     "isin": "INE239A01024",
     "instrument_name": "Nestle India Ltd",
     "weight_a": "1.30",
     "weight_b": "1.35"
    },
    {
     "isin": "INE585B01010",
     "instrument_name": "Maruti Suzuki India Ltd",
     "weight_a": "1.50",
     "weight_b": "1.30"
    },
    {
     "isin": "INE917I01010",
     "instrument_name": "Bajaj Auto Ltd",
     "weight_a": "1.30",
     "weight_b": "1.40"
    }
   ],
   "common_total": 12
  },
  {
   "fund_a": {
    "scheme_id": "S-JM",
    "scheme_name": "JM Flexi Cap Fund",
    "current_value": "980000.00"
   },
   "fund_b": {
    "scheme_id": "S-SBI",
    "scheme_name": "SBI Bluechip Fund",
    "current_value": "819340.00"
   },
   "overlap_pct": "26.40",
   "common_stocks": [
    {
     "isin": "INE090A01021",
     "instrument_name": "ICICI Bank Ltd",
     "weight_a": "8.20",
     "weight_b": "8.80"
    },
    {
     "isin": "INE040A01034",
     "instrument_name": "HDFC Bank Ltd",
     "weight_a": "7.10",
     "weight_b": "9.20"
    },
    {
     "isin": "INE009A01021",
     "instrument_name": "Infosys Ltd",
     "weight_a": "6.30",
     "weight_b": "6.40"
    },
    {
     "isin": "INE002A01018",
     "instrument_name": "Reliance Industries Ltd",
     "weight_a": "4.80",
     "weight_b": "8.10"
    }
   ],
   "common_total": 4
  },
  {
   "fund_a": {
    "scheme_id": "S-KOTAK",
    "scheme_name": "Kotak Multi Cap Fund",
    "current_value": "1540000.00"
   },
   "fund_b": {
    "scheme_id": "S-JM",
    "scheme_name": "JM Flexi Cap Fund",
    "current_value": "980000.00"
   },
   "overlap_pct": "23.70",
   "common_stocks": [
    {
     "isin": "INE040A01034",
     "instrument_name": "HDFC Bank Ltd",
     "weight_a": "7.80",
     "weight_b": "7.10"
    },
    {
     "isin": "INE090A01021",
     "instrument_name": "ICICI Bank Ltd",
     "weight_a": "6.90",
     "weight_b": "8.20"
    },
    {
     "isin": "INE009A01021",
     "instrument_name": "Infosys Ltd",
     "weight_a": "4.90",
     "weight_b": "6.30"
    },
    {
     "isin": "INE002A01018",
     "instrument_name": "Reliance Industries Ltd",
     "weight_a": "5.60",
     "weight_b": "4.80"
    }
   ],
   "common_total": 4
  }
 ],
 "matrix_truncated": false,
 "total_fund_count": 4,
 "common_stock_limit": 20,
 "bands": {
  "low": "20",
  "high": "40"
 },
 "concentration": [
  {
   "stock_count": 5,
   "exposure_pct": "21.9938"
  },
  {
   "stock_count": 10,
   "exposure_pct": "29.6693"
  },
  {
   "stock_count": 20,
   "exposure_pct": "40.0399"
  },
  {
   "stock_count": 31,
   "exposure_pct": "47.5963"
  }
 ],
 "total_stock_count": 31,
 "nav_as_of": "2026-10-24",
 "holdings_as_of": "2026-09-30",
 "total_portfolio_value": "4649340.00",
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
 "excluded_share": "2.10"
};

export const overlapSummary = (): OverlapSummary => structuredClone(OVERLAP);
export const stockHoldings = (): StockHoldingsSummary => structuredClone(STOCK_HOLDINGS_C);

const SETTLED = { computed_at: "2026-10-26T01:00:00Z", failed_at: null };

/** GET /analytics/combined with every section of MF-A, MF-B and MF-C settled (wrapper field names as the backend sends them). */
export function analyticsMfC(): AnalyticsScopeResponse {
  const members = structuredClone(MEMBERS);
  const base = analyticsMfB();
  return {
    scope: "combined", recomputing: false,
    sections: {
      ...Object.fromEntries(ANALYTICS_SECTION_NAMES.map(name => [name, { payload: {}, ...SETTLED }])),
      ...base.sections,
      stock_holdings: { payload: { members, stock_holdings: stockHoldings() }, ...SETTLED },
      overlap: { payload: { members, overlap: overlapSummary() }, ...SETTLED },
      valuation: { payload: { members, valuation: valuationSummary() }, ...SETTLED },
      ter: { payload: { members, ter: terSummary() }, ...SETTLED },
      ter_direct_regular: { payload: { members, ter: terDirectRegular() }, ...SETTLED },
      category_ranking: { payload: { members, ranking: categoryRanking() }, ...SETTLED },
      ranking: { payload: { members, ranking: fundRanking() }, ...SETTLED },
      score: { payload: { members, score: scoreSummary() }, ...SETTLED },
    },
  };
}

/** GET /analytics/m1: the same sections as bare payloads. */
export function analyticsMfCMember(): AnalyticsScopeResponse {
  const bare = (value: unknown) => ({ payload: value as Record<string, unknown>, ...SETTLED });
  return {
    scope: "m1", recomputing: false,
    sections: {
      ...Object.fromEntries(ANALYTICS_SECTION_NAMES.map(name => [name, { payload: {}, ...SETTLED }])),
      ...analyticsMfBMember().sections,
      stock_holdings: bare(stockHoldings()),
      overlap: bare(overlapSummary()),
      valuation: bare(valuationSummary()),
      ter: bare(terSummary()),
      ter_direct_regular: bare(terDirectRegular()),
      category_ranking: bare(categoryRanking()),
      ranking: bare(fundRanking()),
      score: bare(scoreSummary()),
    },
  };
}