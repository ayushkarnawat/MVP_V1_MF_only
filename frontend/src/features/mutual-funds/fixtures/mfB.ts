// SPEC FIXTURES (packet MF-B). Orchestrator-owned: never edit.
// NOT real backend output: the analytics sections have no golden-fixture generator yet. The data below was produced by a
// script with exact Decimal arithmetic (every total reconciles) and validated against the backend pydantic response models
// (backend/app/services/analytics/schemas.py), which are authoritative. One household: the four funds of ./index.ts
// (Kotak Multi Cap 15,40,000, JM Flexi Cap 9,80,000, HDFC Mid-Cap 13,10,000, SBI Bluechip 8,19,340; total 46,49,340).
import { ANALYTICS_SECTION_NAMES } from "../types";
import type {
  AnalyticsScopeResponse, AnalyticsAllocationSummary, AssetAllocationSummary, BenchmarkWindowRow, CapAllocationSummary,
  FundManagerAllocationSummary, FundVsBenchmarkSummary, InvestmentWithdrawalResult, PortfolioBenchmarkSummary, StockHoldingsSummary,
} from "../types";
import { MEMBERS } from "./index";

const BENCHMARK: PortfolioBenchmarkSummary = {
 "portfolio_xirr": "0.1612",
 "benchmarks": [
  {
   "index": "nifty_50",
   "xirr": "0.1043"
  },
  {
   "index": "nifty_500",
   "xirr": "0.1102"
  },
  {
   "index": "nifty_largemidcap_250",
   "xirr": "0.1180"
  },
  {
   "index": "nifty_midcap_150",
   "xirr": "0.1475"
  }
 ],
 "windows": [
  {
   "window": "1Y",
   "available": true,
   "start_date": "2025-09-30",
   "portfolio_xirr": "0.1830",
   "unavailable_reason": null,
   "indices": [
    {
     "index": "nifty_50",
     "xirr": "0.1210"
    },
    {
     "index": "nifty_500",
     "xirr": "0.1405"
    },
    {
     "index": "nifty_largemidcap_250",
     "xirr": "0.1502"
    },
    {
     "index": "nifty_midcap_150",
     "xirr": "0.1894"
    },
    {
     "index": "nifty_next_50",
     "xirr": "0.0920"
    },
    {
     "index": "nifty_smallcap_250",
     "xirr": "0.2105"
    },
    {
     "index": "nifty_100",
     "xirr": "0.1280"
    },
    {
     "index": "nifty_200",
     "xirr": "0.1352"
    }
   ]
  },
  {
   "window": "3Y",
   "available": true,
   "start_date": "2023-09-30",
   "portfolio_xirr": "0.1721",
   "unavailable_reason": null,
   "indices": [
    {
     "index": "nifty_50",
     "xirr": "0.1388"
    },
    {
     "index": "nifty_500",
     "xirr": "0.1544"
    },
    {
     "index": "nifty_largemidcap_250",
     "xirr": "0.1672"
    },
    {
     "index": "nifty_midcap_150",
     "xirr": "0.2210"
    },
    {
     "index": "nifty_next_50",
     "xirr": "0.1730"
    },
    {
     "index": "nifty_smallcap_250",
     "xirr": "0.2415"
    },
    {
     "index": "nifty_100",
     "xirr": "0.1415"
    },
    {
     "index": "nifty_200",
     "xirr": "0.1480"
    }
   ]
  },
  {
   "window": "5Y",
   "available": false,
   "start_date": null,
   "portfolio_xirr": null,
   "unavailable_reason": null,
   "indices": [
    {
     "index": "nifty_50",
     "xirr": null
    },
    {
     "index": "nifty_500",
     "xirr": null
    },
    {
     "index": "nifty_largemidcap_250",
     "xirr": null
    },
    {
     "index": "nifty_midcap_150",
     "xirr": null
    },
    {
     "index": "nifty_next_50",
     "xirr": null
    },
    {
     "index": "nifty_smallcap_250",
     "xirr": null
    },
    {
     "index": "nifty_100",
     "xirr": null
    },
    {
     "index": "nifty_200",
     "xirr": null
    }
   ]
  },
  {
   "window": "SI",
   "available": true,
   "start_date": "2022-04-01",
   "portfolio_xirr": "0.1612",
   "unavailable_reason": null,
   "indices": [
    {
     "index": "nifty_50",
     "xirr": "0.1043"
    },
    {
     "index": "nifty_500",
     "xirr": "0.1102"
    },
    {
     "index": "nifty_largemidcap_250",
     "xirr": "0.1180"
    },
    {
     "index": "nifty_midcap_150",
     "xirr": "0.1475"
    },
    {
     "index": "nifty_next_50",
     "xirr": "0.0890"
    },
    {
     "index": "nifty_smallcap_250",
     "xirr": "0.1620"
    },
    {
     "index": "nifty_100",
     "xirr": "0.1060"
    },
    {
     "index": "nifty_200",
     "xirr": null
    }
   ]
  }
 ]
};

const BENCH_FUNDS: FundVsBenchmarkSummary = {
 "funds": [
  {
   "scheme_id": "S-KOTAK",
   "scheme_name": "Kotak Multi Cap Fund",
   "benchmark_index": "nifty_500",
   "fund_xirr": "0.1420",
   "benchmark_xirr": "0.1690",
   "windows": [
    {
     "window": "1Y",
     "fund_xirr": "0.1010",
     "benchmark_xirr": "0.1405"
    },
    {
     "window": "3Y",
     "fund_xirr": "0.1330",
     "benchmark_xirr": "0.1544"
    },
    {
     "window": "5Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "SI",
     "fund_xirr": "0.1420",
     "benchmark_xirr": "0.1690"
    }
   ]
  },
  {
   "scheme_id": "S-JM",
   "scheme_name": "JM Flexi Cap Fund",
   "benchmark_index": "nifty_500",
   "fund_xirr": "0.1860",
   "benchmark_xirr": "0.1280",
   "windows": [
    {
     "window": "1Y",
     "fund_xirr": "0.2210",
     "benchmark_xirr": "0.1405"
    },
    {
     "window": "3Y",
     "fund_xirr": "0.1912",
     "benchmark_xirr": "0.1544"
    },
    {
     "window": "5Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "SI",
     "fund_xirr": "0.1860",
     "benchmark_xirr": "0.1280"
    }
   ]
  },
  {
   "scheme_id": "S-HDFC",
   "scheme_name": "HDFC Mid-Cap Opportunities Fund",
   "benchmark_index": "nifty_midcap_150",
   "fund_xirr": "0.2130",
   "benchmark_xirr": "0.2020",
   "windows": [
    {
     "window": "1Y",
     "fund_xirr": "0.2310",
     "benchmark_xirr": "0.1894"
    },
    {
     "window": "3Y",
     "fund_xirr": "0.2395",
     "benchmark_xirr": "0.2210"
    },
    {
     "window": "5Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "SI",
     "fund_xirr": "0.2130",
     "benchmark_xirr": "0.2020"
    }
   ]
  },
  {
   "scheme_id": "S-SBI",
   "scheme_name": "SBI Bluechip Fund",
   "benchmark_index": "nifty_100",
   "fund_xirr": "0.1120",
   "benchmark_xirr": "0.1060",
   "windows": [
    {
     "window": "1Y",
     "fund_xirr": "0.0990",
     "benchmark_xirr": "0.1280"
    },
    {
     "window": "3Y",
     "fund_xirr": "0.1150",
     "benchmark_xirr": "0.1415"
    },
    {
     "window": "5Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "SI",
     "fund_xirr": "0.1120",
     "benchmark_xirr": "0.1060"
    }
   ]
  },
  {
   "scheme_id": "S-PPFAS",
   "scheme_name": "Parag Parikh Flexi Cap Fund",
   "benchmark_index": "nifty_500",
   "fund_xirr": "0.1690",
   "benchmark_xirr": "0.1102",
   "windows": [
    {
     "window": "1Y",
     "fund_xirr": "0.1740",
     "benchmark_xirr": "0.1405"
    },
    {
     "window": "3Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "5Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "SI",
     "fund_xirr": "0.1690",
     "benchmark_xirr": "0.1102"
    }
   ]
  },
  {
   "scheme_id": "S-UTI",
   "scheme_name": "UTI Nifty 50 Index Fund",
   "benchmark_index": "nifty_50",
   "fund_xirr": "0.1517",
   "benchmark_xirr": "0.1308",
   "windows": [
    {
     "window": "1Y",
     "fund_xirr": "0.1180",
     "benchmark_xirr": "0.1210"
    },
    {
     "window": "3Y",
     "fund_xirr": "0.1402",
     "benchmark_xirr": "0.1388"
    },
    {
     "window": "5Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "SI",
     "fund_xirr": "0.1517",
     "benchmark_xirr": "0.1308"
    }
   ]
  },
  {
   "scheme_id": "S-AXIS",
   "scheme_name": "Axis Midcap Fund",
   "benchmark_index": "nifty_midcap_150",
   "fund_xirr": null,
   "benchmark_xirr": null,
   "windows": [
    {
     "window": "1Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "3Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "5Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "SI",
     "fund_xirr": null,
     "benchmark_xirr": null
    }
   ]
  },
  {
   "scheme_id": "S-NONE",
   "scheme_name": "No Data Fund",
   "benchmark_index": "nifty_500",
   "fund_xirr": null,
   "benchmark_xirr": null,
   "windows": [
    {
     "window": "1Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "3Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "5Y",
     "fund_xirr": null,
     "benchmark_xirr": null
    },
    {
     "window": "SI",
     "fund_xirr": null,
     "benchmark_xirr": null
    }
   ]
  }
 ],
 "overall_portfolio_xirr": "0.1612",
 "overall_broad_market_xirr": "0.1102"
};

const ASSET_ALLOCATION: AssetAllocationSummary = {
 "as_disclosed": {
  "classes": [
   {
    "key": "equity",
    "value": "3315000.00",
    "percentage": "78.00"
   },
   {
    "key": "debt",
    "value": "595000.00",
    "percentage": "14.00"
   },
   {
    "key": "gold",
    "value": "212500.00",
    "percentage": "5.00"
   },
   {
    "key": "cash_like",
    "value": "127500.00",
    "percentage": "3.00"
   }
  ],
  "equity_outer": [
   {
    "key": "LARGE",
    "value": "1785000.00",
    "percentage": "42.00"
   },
   {
    "key": "MID",
    "value": "850000.00",
    "percentage": "20.00"
   },
   {
    "key": "SMALL",
    "value": "255000.00",
    "percentage": "6.00"
   },
   {
    "key": "OTHER",
    "value": "425000.00",
    "percentage": "10.00"
   }
  ],
  "cap_allocation": {
   "buckets": [
    {
     "key": "LARGE",
     "value": "1785000.00",
     "percentage_total": "38.39",
     "percentage_equity": "53.85",
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
      }
     ],
     "row_count": 15
    },
    {
     "key": "MID",
     "value": "850000.00",
     "percentage_total": "18.28",
     "percentage_equity": "25.64",
     "rows": [
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
      }
     ],
     "row_count": 8
    },
    {
     "key": "SMALL",
     "value": "255000.00",
     "percentage_total": "5.48",
     "percentage_equity": "7.69",
     "rows": [
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
      }
     ],
     "row_count": 1
    },
    {
     "key": "OTHER",
     "value": "1759340.00",
     "percentage_total": "37.84",
     "percentage_equity": "12.82",
     "rows": [],
     "row_count": 0
    }
   ],
   "other": {
    "non_equity_value": "1334340.00",
    "unclassified_equity_value": "425000.00",
    "non_equity_rows": [
     {
      "isin": "IN0020230085",
      "instrument_name": "7.18% Government of India 2033",
      "sector_raw": "Sovereign",
      "asset_type": "debt",
      "exposure_pct": "3.4000",
      "exposure_value": "158077.56",
      "contributing_funds": [
       {
        "scheme_id": "S-SBI",
        "scheme_name": "SBI Bluechip Fund",
        "holdings_as_of": "2026-06-30",
        "cadence": "half_yearly",
        "age_tag": "on_cycle",
        "fund_weight_pct": "17.62",
        "stock_weight_pct": "19.30"
       }
      ]
     },
     {
      "isin": null,
      "instrument_name": "Treasury Bills and cash",
      "sector_raw": null,
      "asset_type": "cash_equivalent",
      "exposure_pct": "1.8000",
      "exposure_value": "83688.12",
      "contributing_funds": [
       {
        "scheme_id": "S-SBI",
        "scheme_name": "SBI Bluechip Fund",
        "holdings_as_of": "2026-06-30",
        "cadence": "half_yearly",
        "age_tag": "on_cycle",
        "fund_weight_pct": "17.62",
        "stock_weight_pct": "10.20"
       },
       {
        "scheme_id": "S-HDFC",
        "scheme_name": "HDFC Mid-Cap Opportunities Fund",
        "holdings_as_of": "2026-09-30",
        "cadence": "monthly",
        "age_tag": null,
        "fund_weight_pct": "28.18",
        "stock_weight_pct": "2.60"
       }
      ]
     }
    ],
    "unclassified_equity_rows": [
     {
      "isin": "INE935N01020",
      "instrument_name": "Dixon Technologies (India) Ltd",
      "sector_raw": "Consumer Durables",
      "asset_type": "equity_domestic",
      "exposure_pct": "1.2000",
      "exposure_value": "55792.08",
      "contributing_funds": [
       {
        "scheme_id": "S-HDFC",
        "scheme_name": "HDFC Mid-Cap Opportunities Fund",
        "holdings_as_of": "2026-09-30",
        "cadence": "monthly",
        "age_tag": null,
        "fund_weight_pct": "28.18",
        "stock_weight_pct": "4.30"
       }
      ]
     }
    ],
    "non_equity_count": 2,
    "unclassified_equity_count": 1
   },
   "total_portfolio_value": "4649340.00",
   "total_equity_value": "3315000.00",
   "nav_as_of": "2026-10-24",
   "holdings_as_of": "2026-09-30",
   "classification_as_of": "2026-07-01",
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
  }
 },
 "arbitrage_as_cash": {
  "classes": [
   {
    "key": "equity",
    "value": "2975000.00",
    "percentage": "70.00"
   },
   {
    "key": "debt",
    "value": "595000.00",
    "percentage": "14.00"
   },
   {
    "key": "gold",
    "value": "212500.00",
    "percentage": "5.00"
   },
   {
    "key": "cash_like",
    "value": "467500.00",
    "percentage": "11.00"
   }
  ],
  "equity_outer": [
   {
    "key": "LARGE",
    "value": "1785000.00",
    "percentage": "42.00"
   },
   {
    "key": "MID",
    "value": "850000.00",
    "percentage": "20.00"
   },
   {
    "key": "SMALL",
    "value": "255000.00",
    "percentage": "6.00"
   },
   {
    "key": "OTHER",
    "value": "85000.00",
    "percentage": "2.00"
   }
  ],
  "cap_allocation": {
   "buckets": [
    {
     "key": "LARGE",
     "value": "1785000.00",
     "percentage_total": "38.39",
     "percentage_equity": "53.85",
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
      }
     ],
     "row_count": 15
    },
    {
     "key": "MID",
     "value": "850000.00",
     "percentage_total": "18.28",
     "percentage_equity": "25.64",
     "rows": [
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
      }
     ],
     "row_count": 8
    },
    {
     "key": "SMALL",
     "value": "255000.00",
     "percentage_total": "5.48",
     "percentage_equity": "7.69",
     "rows": [
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
      }
     ],
     "row_count": 1
    },
    {
     "key": "OTHER",
     "value": "1759340.00",
     "percentage_total": "37.84",
     "percentage_equity": "12.82",
     "rows": [],
     "row_count": 0
    }
   ],
   "other": {
    "non_equity_value": "1334340.00",
    "unclassified_equity_value": "425000.00",
    "non_equity_rows": [
     {
      "isin": "IN0020230085",
      "instrument_name": "7.18% Government of India 2033",
      "sector_raw": "Sovereign",
      "asset_type": "debt",
      "exposure_pct": "3.4000",
      "exposure_value": "158077.56",
      "contributing_funds": [
       {
        "scheme_id": "S-SBI",
        "scheme_name": "SBI Bluechip Fund",
        "holdings_as_of": "2026-06-30",
        "cadence": "half_yearly",
        "age_tag": "on_cycle",
        "fund_weight_pct": "17.62",
        "stock_weight_pct": "19.30"
       }
      ]
     },
     {
      "isin": null,
      "instrument_name": "Treasury Bills and cash",
      "sector_raw": null,
      "asset_type": "cash_equivalent",
      "exposure_pct": "1.8000",
      "exposure_value": "83688.12",
      "contributing_funds": [
       {
        "scheme_id": "S-SBI",
        "scheme_name": "SBI Bluechip Fund",
        "holdings_as_of": "2026-06-30",
        "cadence": "half_yearly",
        "age_tag": "on_cycle",
        "fund_weight_pct": "17.62",
        "stock_weight_pct": "10.20"
       },
       {
        "scheme_id": "S-HDFC",
        "scheme_name": "HDFC Mid-Cap Opportunities Fund",
        "holdings_as_of": "2026-09-30",
        "cadence": "monthly",
        "age_tag": null,
        "fund_weight_pct": "28.18",
        "stock_weight_pct": "2.60"
       }
      ]
     }
    ],
    "unclassified_equity_rows": [
     {
      "isin": "INE935N01020",
      "instrument_name": "Dixon Technologies (India) Ltd",
      "sector_raw": "Consumer Durables",
      "asset_type": "equity_domestic",
      "exposure_pct": "1.2000",
      "exposure_value": "55792.08",
      "contributing_funds": [
       {
        "scheme_id": "S-HDFC",
        "scheme_name": "HDFC Mid-Cap Opportunities Fund",
        "holdings_as_of": "2026-09-30",
        "cadence": "monthly",
        "age_tag": null,
        "fund_weight_pct": "28.18",
        "stock_weight_pct": "4.30"
       }
      ]
     }
    ],
    "non_equity_count": 2,
    "unclassified_equity_count": 1
   },
   "total_portfolio_value": "4649340.00",
   "total_equity_value": "3315000.00",
   "nav_as_of": "2026-10-24",
   "holdings_as_of": "2026-09-30",
   "classification_as_of": "2026-07-01",
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
  }
 },
 "total_portfolio_value": "4649340.00",
 "covered_value": "4250000.00",
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
 "arbitrage_funds": [
  {
   "scheme_id": "S-HDARB",
   "scheme_name": "HDFC Arbitrage Fund"
  }
 ]
};

const CAP_ALLOCATION: CapAllocationSummary = {
 "buckets": [
  {
   "key": "LARGE",
   "value": "1785000.00",
   "percentage_total": "38.39",
   "percentage_equity": "53.85",
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
    }
   ],
   "row_count": 15
  },
  {
   "key": "MID",
   "value": "850000.00",
   "percentage_total": "18.28",
   "percentage_equity": "25.64",
   "rows": [
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
    }
   ],
   "row_count": 8
  },
  {
   "key": "SMALL",
   "value": "255000.00",
   "percentage_total": "5.48",
   "percentage_equity": "7.69",
   "rows": [
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
    }
   ],
   "row_count": 1
  },
  {
   "key": "OTHER",
   "value": "1759340.00",
   "percentage_total": "37.84",
   "percentage_equity": "12.82",
   "rows": [],
   "row_count": 0
  }
 ],
 "other": {
  "non_equity_value": "1334340.00",
  "unclassified_equity_value": "425000.00",
  "non_equity_rows": [
   {
    "isin": "IN0020230085",
    "instrument_name": "7.18% Government of India 2033",
    "sector_raw": "Sovereign",
    "asset_type": "debt",
    "exposure_pct": "3.4000",
    "exposure_value": "158077.56",
    "contributing_funds": [
     {
      "scheme_id": "S-SBI",
      "scheme_name": "SBI Bluechip Fund",
      "holdings_as_of": "2026-06-30",
      "cadence": "half_yearly",
      "age_tag": "on_cycle",
      "fund_weight_pct": "17.62",
      "stock_weight_pct": "19.30"
     }
    ]
   },
   {
    "isin": null,
    "instrument_name": "Treasury Bills and cash",
    "sector_raw": null,
    "asset_type": "cash_equivalent",
    "exposure_pct": "1.8000",
    "exposure_value": "83688.12",
    "contributing_funds": [
     {
      "scheme_id": "S-SBI",
      "scheme_name": "SBI Bluechip Fund",
      "holdings_as_of": "2026-06-30",
      "cadence": "half_yearly",
      "age_tag": "on_cycle",
      "fund_weight_pct": "17.62",
      "stock_weight_pct": "10.20"
     },
     {
      "scheme_id": "S-HDFC",
      "scheme_name": "HDFC Mid-Cap Opportunities Fund",
      "holdings_as_of": "2026-09-30",
      "cadence": "monthly",
      "age_tag": null,
      "fund_weight_pct": "28.18",
      "stock_weight_pct": "2.60"
     }
    ]
   }
  ],
  "unclassified_equity_rows": [
   {
    "isin": "INE935N01020",
    "instrument_name": "Dixon Technologies (India) Ltd",
    "sector_raw": "Consumer Durables",
    "asset_type": "equity_domestic",
    "exposure_pct": "1.2000",
    "exposure_value": "55792.08",
    "contributing_funds": [
     {
      "scheme_id": "S-HDFC",
      "scheme_name": "HDFC Mid-Cap Opportunities Fund",
      "holdings_as_of": "2026-09-30",
      "cadence": "monthly",
      "age_tag": null,
      "fund_weight_pct": "28.18",
      "stock_weight_pct": "4.30"
     }
    ]
   }
  ],
  "non_equity_count": 2,
  "unclassified_equity_count": 1
 },
 "total_portfolio_value": "4649340.00",
 "total_equity_value": "3315000.00",
 "nav_as_of": "2026-10-24",
 "holdings_as_of": "2026-09-30",
 "classification_as_of": "2026-07-01",
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

const ALLOCATION: AnalyticsAllocationSummary = {
 "by_category": [
  {
   "label": "Flexi Cap Fund",
   "current_value": "2520000.00",
   "percentage": "54.20"
  },
  {
   "label": "Mid Cap Fund",
   "current_value": "1310000.00",
   "percentage": "28.18"
  },
  {
   "label": "Large Cap Fund",
   "current_value": "819340.00",
   "percentage": "17.62"
  }
 ],
 "by_amc": [
  {
   "label": "Kotak Mahindra Mutual Fund",
   "current_value": "1540000.00",
   "percentage": "33.12"
  },
  {
   "label": "JM Financial Mutual Fund",
   "current_value": "980000.00",
   "percentage": "21.08"
  },
  {
   "label": "HDFC Mutual Fund",
   "current_value": "1310000.00",
   "percentage": "28.18"
  },
  {
   "label": "SBI Mutual Fund",
   "current_value": "819340.00",
   "percentage": "17.62"
  }
 ],
 "total_value": "4649340.00"
};

const FUND_MANAGER: FundManagerAllocationSummary = {
 "manager_groups": [
  {
   "manager_name": "Harsha Upadhyaya",
   "amc_name": "Kotak Mahindra MF",
   "percentage": "33.12",
   "role": "Fund Manager",
   "total_household_value": "1540000.00",
   "funds": [
    {
     "scheme_id": "S-KOTAK",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_value": "1540000.00",
     "sequence_order": 1,
     "role": "Fund Manager"
    }
   ]
  },
  {
   "manager_name": "Chirag Setalvad",
   "amc_name": "HDFC MF",
   "percentage": "28.18",
   "role": "Fund Manager",
   "total_household_value": "1310000.00",
   "funds": [
    {
     "scheme_id": "S-HDFC",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_value": "1310000.00",
     "sequence_order": 1,
     "role": "Fund Manager"
    }
   ]
  },
  {
   "manager_name": "Satish Ramanathan",
   "amc_name": "JM Financial MF",
   "percentage": "10.54",
   "role": "Fund Manager",
   "total_household_value": "490000.00",
   "funds": [
    {
     "scheme_id": "S-JM",
     "scheme_name": "JM Flexi Cap Fund",
     "household_value": "490000.00",
     "sequence_order": 1,
     "role": "Fund Manager"
    }
   ]
  },
  {
   "manager_name": "Asit Bhandarkar",
   "amc_name": "JM Financial MF",
   "percentage": "10.54",
   "role": "Co-Fund Manager",
   "total_household_value": "490000.00",
   "funds": [
    {
     "scheme_id": "S-JM",
     "scheme_name": "JM Flexi Cap Fund",
     "household_value": "490000.00",
     "sequence_order": 1,
     "role": "Co-Fund Manager"
    }
   ]
  }
 ],
 "unavailable_schemes": [
  {
   "scheme_id": "S-SBI",
   "scheme_name": "SBI Bluechip Fund",
   "amc_name": "SBI Mutual Fund"
  }
 ],
 "portfolio_value": "4649340.00",
 "covered_value": "3830000.00",
 "covered_percentage": "82.38"
};

const STOCK_HOLDINGS: StockHoldingsSummary = {
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
  }
 ],
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
 "truncated": true,
 "total_stock_count": 31,
 "hide_headlines": false,
 "excluded_share": "2.10",
 "non_equity_share": "22.00"
};

const INVESTMENT: InvestmentWithdrawalResult = {
 "total_invested": "941895.00",
 "total_withdrawn": "23500.00",
 "net_invested": "918395.00",
 "current_value": "4649340.00",
 "absolute_gain": "3712445.00",
 "monthly": [
  {
   "period": "2025-11",
   "invested": "50575.00",
   "withdrawn": "0.00",
   "entries": [
    {
     "transaction_id": "t-0001",
     "date": "2025-11-01",
     "type": "opening_balance",
     "amount": "240000.00",
     "direction": "opening",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0002",
     "date": "2025-11-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0003",
     "date": "2025-11-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0004",
     "date": "2025-11-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0005",
     "date": "2025-11-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0006",
     "date": "2025-11-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "0.00",
   "switched_out": "0.00"
  },
  {
   "period": "2025-12",
   "invested": "150575.00",
   "withdrawn": "0.00",
   "entries": [
    {
     "transaction_id": "t-0012",
     "date": "2025-12-12",
     "type": "purchase",
     "amount": "100000.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0007",
     "date": "2025-12-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0008",
     "date": "2025-12-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0009",
     "date": "2025-12-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0010",
     "date": "2025-12-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0011",
     "date": "2025-12-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "0.00",
   "switched_out": "0.00"
  },
  {
   "period": "2026-01",
   "invested": "50575.00",
   "withdrawn": "0.00",
   "entries": [
    {
     "transaction_id": "t-0013",
     "date": "2026-01-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0014",
     "date": "2026-01-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0015",
     "date": "2026-01-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0016",
     "date": "2026-01-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0017",
     "date": "2026-01-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "0.00",
   "switched_out": "0.00"
  },
  {
   "period": "2026-02",
   "invested": "50575.00",
   "withdrawn": "0.00",
   "entries": [
    {
     "transaction_id": "t-0018",
     "date": "2026-02-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0019",
     "date": "2026-02-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0020",
     "date": "2026-02-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0021",
     "date": "2026-02-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0022",
     "date": "2026-02-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "0.00",
   "switched_out": "0.00"
  },
  {
   "period": "2026-03",
   "invested": "50575.00",
   "withdrawn": "23500.00",
   "entries": [
    {
     "transaction_id": "t-0028",
     "date": "2026-03-18",
     "type": "redemption",
     "amount": "22000.00",
     "direction": "withdrawn",
     "scheme_name": "SBI Bluechip Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0029",
     "date": "2026-03-20",
     "type": "dividend_payout",
     "amount": "1500.00",
     "direction": "withdrawn",
     "scheme_name": "SBI Bluechip Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0023",
     "date": "2026-03-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0024",
     "date": "2026-03-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0025",
     "date": "2026-03-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0026",
     "date": "2026-03-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0027",
     "date": "2026-03-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "0.00",
   "switched_out": "0.00"
  },
  {
   "period": "2026-04",
   "invested": "50575.00",
   "withdrawn": "0.00",
   "entries": [
    {
     "transaction_id": "t-0030",
     "date": "2026-04-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0031",
     "date": "2026-04-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0032",
     "date": "2026-04-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0033",
     "date": "2026-04-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0034",
     "date": "2026-04-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "0.00",
   "switched_out": "0.00"
  },
  {
   "period": "2026-05",
   "invested": "50575.00",
   "withdrawn": "0.00",
   "entries": [
    {
     "transaction_id": "t-0035",
     "date": "2026-05-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0036",
     "date": "2026-05-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0037",
     "date": "2026-05-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0038",
     "date": "2026-05-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0039",
     "date": "2026-05-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "0.00",
   "switched_out": "0.00"
  },
  {
   "period": "2026-06",
   "invested": "50575.00",
   "withdrawn": "0.00",
   "entries": [
    {
     "transaction_id": "t-0045",
     "date": "2026-06-10",
     "type": "switch_out",
     "amount": "50000.00",
     "direction": "switched_out",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0046",
     "date": "2026-06-10",
     "type": "switch_in",
     "amount": "50000.00",
     "direction": "switched_in",
     "scheme_name": "Axis Midcap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0040",
     "date": "2026-06-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0041",
     "date": "2026-06-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0042",
     "date": "2026-06-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0043",
     "date": "2026-06-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0044",
     "date": "2026-06-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "50000.00",
   "switched_out": "50000.00"
  },
  {
   "period": "2026-07",
   "invested": "50575.00",
   "withdrawn": "0.00",
   "entries": [
    {
     "transaction_id": "t-0047",
     "date": "2026-07-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0048",
     "date": "2026-07-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0049",
     "date": "2026-07-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0050",
     "date": "2026-07-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0051",
     "date": "2026-07-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "0.00",
   "switched_out": "0.00"
  },
  {
   "period": "2026-08",
   "invested": "45570.00",
   "withdrawn": "0.00",
   "entries": [
    {
     "transaction_id": "t-0057",
     "date": "2026-08-05",
     "type": "reversal",
     "amount": "5005.00",
     "direction": "reversal",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0052",
     "date": "2026-08-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0053",
     "date": "2026-08-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0054",
     "date": "2026-08-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0055",
     "date": "2026-08-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0056",
     "date": "2026-08-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "0.00",
   "switched_out": "0.00"
  },
  {
   "period": "2026-09",
   "invested": "50575.00",
   "withdrawn": "0.00",
   "entries": [
    {
     "transaction_id": "t-0058",
     "date": "2026-09-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0059",
     "date": "2026-09-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0060",
     "date": "2026-09-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0061",
     "date": "2026-09-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0062",
     "date": "2026-09-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "0.00",
   "switched_out": "0.00"
  },
  {
   "period": "2026-10",
   "invested": "50575.00",
   "withdrawn": "0.00",
   "entries": [
    {
     "transaction_id": "t-0063",
     "date": "2026-10-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0064",
     "date": "2026-10-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0065",
     "date": "2026-10-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0066",
     "date": "2026-10-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0067",
     "date": "2026-10-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "0.00",
   "switched_out": "0.00"
  }
 ],
 "yearly": [
  {
   "period": "2025",
   "invested": "201150.00",
   "withdrawn": "0.00",
   "entries": [
    {
     "transaction_id": "t-0001",
     "date": "2025-11-01",
     "type": "opening_balance",
     "amount": "240000.00",
     "direction": "opening",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0002",
     "date": "2025-11-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0003",
     "date": "2025-11-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0004",
     "date": "2025-11-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0005",
     "date": "2025-11-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0006",
     "date": "2025-11-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0012",
     "date": "2025-12-12",
     "type": "purchase",
     "amount": "100000.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0007",
     "date": "2025-12-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0008",
     "date": "2025-12-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0009",
     "date": "2025-12-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0010",
     "date": "2025-12-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0011",
     "date": "2025-12-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "0.00",
   "switched_out": "0.00"
  },
  {
   "period": "2026",
   "invested": "500745.00",
   "withdrawn": "23500.00",
   "entries": [
    {
     "transaction_id": "t-0013",
     "date": "2026-01-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0014",
     "date": "2026-01-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0015",
     "date": "2026-01-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0016",
     "date": "2026-01-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0017",
     "date": "2026-01-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0018",
     "date": "2026-02-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0019",
     "date": "2026-02-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0020",
     "date": "2026-02-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0021",
     "date": "2026-02-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0022",
     "date": "2026-02-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0028",
     "date": "2026-03-18",
     "type": "redemption",
     "amount": "22000.00",
     "direction": "withdrawn",
     "scheme_name": "SBI Bluechip Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0029",
     "date": "2026-03-20",
     "type": "dividend_payout",
     "amount": "1500.00",
     "direction": "withdrawn",
     "scheme_name": "SBI Bluechip Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0023",
     "date": "2026-03-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0024",
     "date": "2026-03-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0025",
     "date": "2026-03-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0026",
     "date": "2026-03-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0027",
     "date": "2026-03-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0030",
     "date": "2026-04-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0031",
     "date": "2026-04-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0032",
     "date": "2026-04-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0033",
     "date": "2026-04-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0034",
     "date": "2026-04-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0035",
     "date": "2026-05-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0036",
     "date": "2026-05-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0037",
     "date": "2026-05-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0038",
     "date": "2026-05-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0039",
     "date": "2026-05-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0045",
     "date": "2026-06-10",
     "type": "switch_out",
     "amount": "50000.00",
     "direction": "switched_out",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0046",
     "date": "2026-06-10",
     "type": "switch_in",
     "amount": "50000.00",
     "direction": "switched_in",
     "scheme_name": "Axis Midcap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0040",
     "date": "2026-06-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0041",
     "date": "2026-06-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0042",
     "date": "2026-06-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0043",
     "date": "2026-06-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0044",
     "date": "2026-06-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0047",
     "date": "2026-07-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0048",
     "date": "2026-07-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0049",
     "date": "2026-07-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0050",
     "date": "2026-07-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0051",
     "date": "2026-07-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0057",
     "date": "2026-08-05",
     "type": "reversal",
     "amount": "5005.00",
     "direction": "reversal",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0052",
     "date": "2026-08-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0053",
     "date": "2026-08-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0054",
     "date": "2026-08-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0055",
     "date": "2026-08-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0056",
     "date": "2026-08-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0058",
     "date": "2026-09-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0059",
     "date": "2026-09-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0060",
     "date": "2026-09-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0061",
     "date": "2026-09-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0062",
     "date": "2026-09-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0063",
     "date": "2026-10-24",
     "type": "purchase_sip",
     "amount": "3336.00",
     "direction": "invested",
     "scheme_name": "Kotak Multi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    },
    {
     "transaction_id": "t-0064",
     "date": "2026-10-26",
     "type": "purchase_sip",
     "amount": "5005.00",
     "direction": "invested",
     "scheme_name": "JM Flexi Cap Fund",
     "household_member_id": "m2",
     "household_member_name": "Aarohi"
    },
    {
     "transaction_id": "t-0065",
     "date": "2026-10-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0066",
     "date": "2026-10-27",
     "type": "purchase_sip",
     "amount": "12995.00",
     "direction": "invested",
     "scheme_name": "HDFC Mid-Cap Opportunities Fund",
     "household_member_id": "m3",
     "household_member_name": "Parents"
    },
    {
     "transaction_id": "t-0067",
     "date": "2026-10-27",
     "type": "purchase_sip",
     "amount": "16244.00",
     "direction": "invested",
     "scheme_name": "Parag Parikh Flexi Cap Fund",
     "household_member_id": "m1",
     "household_member_name": "Siddharth"
    }
   ],
   "switched_in": "50000.00",
   "switched_out": "50000.00"
  }
 ],
 "sip_summary": {
  "active_count": 5,
  "total_monthly_amount": "50575.00",
  "missed_count": 1
 },
 "gifts_net": "18500.00",
 "total_switched_in": "50000.00",
 "total_switched_out": "50000.00",
 "switch_count": 1,
 "opening_holdings": "240000.00"
};


export const benchmarkSummary = (): PortfolioBenchmarkSummary => structuredClone(BENCHMARK);
/** The same payload as stored before the MB backend: no `windows` anywhere. */
export function benchmarkSummaryWithoutWindows(): PortfolioBenchmarkSummary {
  const { windows: _windows, ...rest } = structuredClone(BENCHMARK);
  void _windows;
  return rest;
}
export const benchmarkWindowRows = (): BenchmarkWindowRow[] => structuredClone(BENCHMARK.windows ?? []);
export const fundBenchmark = (): FundVsBenchmarkSummary => structuredClone(BENCH_FUNDS);
export function fundBenchmarkWithoutWindows(): FundVsBenchmarkSummary {
  const copy = structuredClone(BENCH_FUNDS);
  for (const fund of copy.funds) delete fund.windows;
  return copy;
}
export const assetAllocation = (): AssetAllocationSummary => {
  const data = structuredClone(ASSET_ALLOCATION);
  for (const [variant, debtValue, debtPct] of [
    [data.as_disclosed, "722500.00", "17.00"],
    [data.arbitrage_as_cash, "1062500.00", "25.00"],
  ] as const) {
    variant.classes = [
      variant.classes[0], { key: "debt", value: debtValue, percentage: debtPct }, variant.classes[2],
      { key: "real_estate", value: "0.00", percentage: "0.00" },
      { key: "others", value: "0.00", percentage: "0.00" },
    ];
  }
  return data;
};
export const capAllocation = (): CapAllocationSummary => {
  const data = structuredClone(CAP_ALLOCATION);
  data.unclassified_share_pct = "12.82";
  data.buckets.forEach((bucket, index) => {
    bucket.percentage_classified = ["61.76", "29.41", "8.83", "0.00"][index];
  });
  return data;
};
export const analyticsAllocation = (): AnalyticsAllocationSummary => structuredClone(ALLOCATION);
export const fundManager = (): FundManagerAllocationSummary => {
  const data = structuredClone(FUND_MANAGER);
  // The 980000 JM fund belongs to its Fund Manager; its Co-Fund Manager is not another allocation.
  data.manager_groups = data.manager_groups.filter(group => group.manager_name !== "Asit Bhandarkar");
  for (const group of data.manager_groups) {
    group.main_source = "marked";
    if (group.manager_name === "Satish Ramanathan") {
      group.total_household_value = "980000.00";
      group.percentage = "21.08";
      group.funds[0].household_value = "980000.00";
    }
  }
  return data;
};
export const stockHoldings = (): StockHoldingsSummary => structuredClone(STOCK_HOLDINGS);
export const investmentWithdrawal = (): InvestmentWithdrawalResult => structuredClone(INVESTMENT);

const SETTLED = { computed_at: "2026-10-26T01:00:00Z", failed_at: null };

/** GET /analytics/combined with every section this bundle reads settled. The wrapper field names are the backend's
 * (benchmark_funds -> "comparison", investment_withdrawal -> "data"); a member payload is the bare section. */
export function analyticsMfB(): AnalyticsScopeResponse {
  const members = structuredClone(MEMBERS);
  return {
    scope: "combined", recomputing: false,
    sections: {
      ...Object.fromEntries(ANALYTICS_SECTION_NAMES.map(name => [name, { payload: {}, ...SETTLED }])),
      benchmark: { payload: { members, benchmark: benchmarkSummary() }, ...SETTLED },
      benchmark_funds: { payload: { members, comparison: fundBenchmark() }, ...SETTLED },
      investment_withdrawal: { payload: { members, data: investmentWithdrawal() }, ...SETTLED },
      asset_allocation: { payload: { members, asset_allocation: assetAllocation() }, ...SETTLED },
      cap_allocation: { payload: { members, cap_allocation: capAllocation() }, ...SETTLED },
      allocation: { payload: { members, allocation: analyticsAllocation() }, ...SETTLED },
      fund_manager: { payload: { members, fund_manager: fundManager() }, ...SETTLED },
      stock_holdings: { payload: { members, stock_holdings: stockHoldings() }, ...SETTLED },
    },
  };
}

/** GET /analytics/m1: the same sections as bare payloads. */
export function analyticsMfBMember(): AnalyticsScopeResponse {
  return {
    scope: "m1", recomputing: false,
    sections: {
      ...Object.fromEntries(ANALYTICS_SECTION_NAMES.map(name => [name, { payload: {}, ...SETTLED }])),
      benchmark: { payload: benchmarkSummary() as unknown as Record<string, unknown>, ...SETTLED },
      benchmark_funds: { payload: fundBenchmark() as unknown as Record<string, unknown>, ...SETTLED },
      investment_withdrawal: { payload: investmentWithdrawal() as unknown as Record<string, unknown>, ...SETTLED },
      asset_allocation: { payload: assetAllocation() as unknown as Record<string, unknown>, ...SETTLED },
      cap_allocation: { payload: capAllocation() as unknown as Record<string, unknown>, ...SETTLED },
      allocation: { payload: analyticsAllocation() as unknown as Record<string, unknown>, ...SETTLED },
      fund_manager: { payload: fundManager() as unknown as Record<string, unknown>, ...SETTLED },
      stock_holdings: { payload: stockHoldings() as unknown as Record<string, unknown>, ...SETTLED },
    },
  };
}
