// Fixtures for packet ASKS-FE-M: the additive backend fields of register C160/C161 (ledger units, NAV and folio,
// the missed SIP, per-class funds, overlap impact pairs and the low-boundary pairs). There is no backend golden
// for them yet, so every number below is derived by hand from numbers already in the sibling fixtures; the
// arithmetic is written next to each block and checked again in mfAsks.test.ts. Orchestrator-owned: never edit.
import type {
  AnalyticsScopeResponse,
  AssetAllocationClass,
  AssetAllocationClassFund,
  AssetAllocationSummary,
  InvestmentWithdrawalEntry,
  InvestmentWithdrawalResult,
  OverlapDriver,
  OverlapImpactPair,
  OverlapPair,
  OverlapSummary,
} from "../types";
import { analyticsMfB, assetAllocation, investmentWithdrawal } from "./mfB";
import { analyticsMfC, overlapSummary } from "./mfC";

// ---- ledger: units, NAV and folio -------------------------------------------------------------------------------
// units = amount / NAV, both exact here: 16244.00 / 81.2200 = 200.000 and 22000.00 / 88.0000 = 250.000.
// Folio "1234567/89" is masked by the backend to "XXXX" + its last four letters or digits: the digits are
// 123456789, the last four 6789, so "XXXX6789". t-0029 carries a folio only (units and NAV null), t-0046 nothing.
const LEDGER_DETAIL: Record<string, Pick<InvestmentWithdrawalEntry, "units" | "nav" | "folio">> = {
  "t-0067": { units: "200.000", nav: "81.2200", folio: "XXXX7890" },
  "t-0028": { units: "250.000", nav: "88.0000", folio: "XXXX6789" },
  "t-0029": { units: null, nav: null, folio: "XXXX6789" },
};

/** The ledger payload of the Transactions page with the optional detail on three entries (monthly and yearly buckets alike)
 * and the missed SIP: HDFC Mid-Cap, first missed instalment due 5 Oct 2026 (the mockup's example). */
export function investmentWithdrawalWithDetail(): InvestmentWithdrawalResult {
  const data = investmentWithdrawal();
  for (const bucket of [...data.monthly, ...data.yearly]) {
    for (const entry of bucket.entries) {
      const detail = LEDGER_DETAIL[entry.transaction_id];
      if (detail) Object.assign(entry, detail);
    }
  }
  data.sip_summary.missed_sip_fund = "HDFC Mid-Cap Opportunities Fund";
  data.sip_summary.missed_sip_date = "2026-10-05";
  return data;
}

// ---- asset classes with their funds -----------------------------------------------------------------------------
// Class totals are the sibling fixture's. Each `percentage` is the fund's value over the sum of the class's funds
// times 100 at 28 significant digits (the backend's Decimal division), e.g. 1190000.00 / 3315000.00 * 100.
const f = (scheme_id: string, scheme_name: string, value: string, percentage: string): AssetAllocationClassFund => ({ scheme_id, scheme_name, value, percentage });
const KOTAK = "Kotak Multi Cap Fund";
const JM = "JM Flexi Cap Fund";
const HDFC = "HDFC Mid-Cap Opportunities Fund";
const SBI = "SBI Bluechip Fund";
const ARB = "HDFC Arbitrage Fund";
const OVN = "HDFC Overnight Fund";
const AXI = "Axis International Fund of Fund";

// As disclosed. Equity 3315000.00 = 1190000.00 + 892500.00 + 595000.00 + 340000.00 + 297500.00.
const DISCLOSED_FUNDS: Record<AssetAllocationClass["key"], AssetAllocationClassFund[]> = {
  equity: [
    f("S-KOTAK", KOTAK, "1190000.00", "35.89743589743589743589743590"),
    f("S-JM", JM, "892500.00", "26.92307692307692307692307692"),
    f("S-HDFC", HDFC, "595000.00", "17.94871794871794871794871795"),
    f("S-HDARB", ARB, "340000.00", "10.25641025641025641025641026"),
    f("S-SBI", SBI, "297500.00", "8.974358974358974358974358974"),
  ],
  // Debt 595000.00 = 476000.00 + 119000.00 (80 % and 20 %): SBI Bluechip is a fund in two classes.
  debt: [f("S-HDOV", OVN, "476000.00", "80.0"), f("S-SBI", SBI, "119000.00", "20.0")],
  // Gold 212500.00 is one fund.
  gold: [f("S-AXINT", AXI, "212500.00", "100")],
  // Cash-like 127500.00 = 76500.00 + 51000.00 (60 % and 40 %).
  cash_like: [f("S-HDOV", OVN, "76500.00", "60.0"), f("S-KOTAK", KOTAK, "51000.00", "40.0")],
};

// With arbitrage as cash: the 340000.00 of HDFC Arbitrage moves from equity (2975000.00 = 1190000 + 892500 + 595000 + 297500,
// shares exactly 40, 30, 20 and 10 %) to cash-like (467500.00 = 340000 + 76500 + 51000).
const AS_CASH_FUNDS: Record<AssetAllocationClass["key"], AssetAllocationClassFund[]> = {
  equity: [
    f("S-KOTAK", KOTAK, "1190000.00", "40.0"),
    f("S-JM", JM, "892500.00", "30.0"),
    f("S-HDFC", HDFC, "595000.00", "20.0"),
    f("S-SBI", SBI, "297500.00", "10.0"),
  ],
  debt: DISCLOSED_FUNDS.debt,
  gold: DISCLOSED_FUNDS.gold,
  cash_like: [
    f("S-HDARB", ARB, "340000.00", "72.72727272727272727272727273"),
    f("S-HDOV", OVN, "76500.00", "16.36363636363636363636363636"),
    f("S-KOTAK", KOTAK, "51000.00", "10.90909090909090909090909091"),
  ],
};

/** The look-through asset allocation with `funds` on every class of both variants. */
export function assetAllocationWithFunds(): AssetAllocationSummary {
  const data = assetAllocation();
  for (const cls of data.as_disclosed.classes) cls.funds = structuredClone(DISCLOSED_FUNDS[cls.key]);
  for (const cls of data.arbitrage_as_cash.classes) cls.funds = structuredClone(AS_CASH_FUNDS[cls.key]);
  return data;
}

// ---- overlap: impact pairs and the low-boundary pair --------------------------------------------------------------
// contribution_pct = min(weight_a, weight_b); share_of_pair_pct = contribution_pct / overlap_pct * 100 at 28 digits.
const driver = (isin: string, instrument_name: string, contribution_pct: string, share_of_pair_pct: string): OverlapDriver => ({ isin, instrument_name, contribution_pct, share_of_pair_pct });

/** Kotak x SBI, overlap 40.60: the five largest of its twelve shared stocks (7.80 / 40.60 = 19.2118...). */
const KOTAK_SBI_DRIVERS = [
  driver("INE040A01034", "HDFC Bank Ltd", "7.80", "19.21182266009852216748768473"),
  driver("INE090A01021", "ICICI Bank Ltd", "6.90", "16.99507389162561576354679803"),
  driver("INE002A01018", "Reliance Industries Ltd", "5.60", "13.79310344827586206896551724"),
  driver("INE009A01021", "Infosys Ltd", "4.90", "12.06896551724137931034482759"),
  driver("INE018A01030", "Larsen & Toubro Ltd", "4.40", "10.83743842364532019704433498"),
];
/** JM x SBI, overlap 26.40: all four shared stocks (8.20 / 26.40 = 31.0606...). */
const JM_SBI_DRIVERS = [
  driver("INE090A01021", "ICICI Bank Ltd", "8.20", "31.06060606060606060606060606"),
  driver("INE040A01034", "HDFC Bank Ltd", "7.10", "26.89393939393939393939393939"),
  driver("INE009A01021", "Infosys Ltd", "6.30", "23.86363636363636363636363636"),
  driver("INE002A01018", "Reliance Industries Ltd", "4.80", "18.18181818181818181818181818"),
];
/** Kotak x JM, overlap 23.70: all four shared stocks, the smaller side counts (HDFC Bank 7.80 vs 7.10 gives 7.10). */
const KOTAK_JM_DRIVERS = [
  driver("INE040A01034", "HDFC Bank Ltd", "7.10", "29.95780590717299578059071730"),
  driver("INE090A01021", "ICICI Bank Ltd", "6.90", "29.11392405063291139240506329"),
  driver("INE009A01021", "Infosys Ltd", "4.90", "20.67510548523206751054852321"),
  driver("INE002A01018", "Reliance Industries Ltd", "4.80", "20.25316455696202531645569620"),
];

/** HDFC Mid-Cap x SBI Bluechip at exactly the low band (20): minimums 9.00 + 6.00 + 5.00 = 20.00. */
function boundaryPair(base: OverlapPair): OverlapPair {
  return {
    ...structuredClone(base),
    overlap_pct: "20.00",
    common_total: 3,
    common_stocks: [
      { isin: "INE397D01024", instrument_name: "Bharti Airtel Ltd", weight_a: "9.00", weight_b: "12.00" },
      { isin: "INE238A01034", instrument_name: "Axis Bank Ltd", weight_a: "7.50", weight_b: "6.00" },
      { isin: "INE062A01020", instrument_name: "State Bank of India", weight_a: "5.00", weight_b: "5.00" },
    ],
  };
}

/** The overlap summary with the top-3 impact pairs and one pair at the low band. The band is `low: "20"`, so that pair is
 * left out of the strict `pairs_above_low` and is in the matrix at 20.00. */
export function overlapSummaryWithAsks(): OverlapSummary {
  const data = overlapSummary();
  const index = data.matrix.findIndex(pair => pair.fund_a.scheme_id === "S-HDFC" && pair.fund_b.scheme_id === "S-SBI");
  data.matrix[index] = boundaryPair(data.matrix[index]);
  const [kotakSbi, jmSbi, kotakJm] = data.pairs_above_low;
  const impact = (pair: OverlapPair, drivers: OverlapDriver[]): OverlapImpactPair => ({
    fund_a: structuredClone(pair.fund_a), fund_b: structuredClone(pair.fund_b), overlap_pct: pair.overlap_pct, drivers: structuredClone(drivers),
  });
  data.impact_pairs = [impact(kotakSbi, KOTAK_SBI_DRIVERS), impact(jmSbi, JM_SBI_DRIVERS), impact(kotakJm, KOTAK_JM_DRIVERS)];
  data.pairs_at_low_boundary = [structuredClone(data.matrix[index])];
  return data;
}

// ---- the analytics bundles the page tests mount -------------------------------------------------------------------
/** analyticsMfB() with the ledger detail and the per-class funds. */
export function analyticsAsksB(): AnalyticsScopeResponse {
  const scope = analyticsMfB();
  const members = (scope.sections.investment_withdrawal!.payload as { members: unknown }).members;
  scope.sections.investment_withdrawal!.payload = { members, data: investmentWithdrawalWithDetail() };
  scope.sections.asset_allocation!.payload = { members, asset_allocation: assetAllocationWithFunds() };
  return scope;
}

/** analyticsMfC() with the impact pairs and the low-boundary pair. */
export function analyticsAsksC(): AnalyticsScopeResponse {
  const scope = analyticsMfC();
  const members = (scope.sections.overlap!.payload as { members: unknown }).members;
  scope.sections.overlap!.payload = { members, overlap: overlapSummaryWithAsks() };
  return scope;
}
