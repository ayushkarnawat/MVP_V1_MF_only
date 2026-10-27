import { percentageProduct } from "../../../components/mf/lookthroughDisplay";
import { compareDecimalStrings, sumDecimalStrings } from "../../../lib/decimal";
import { colorAt } from "../allocation/allocationLogic";
import type { StockHoldingRow, StockHoldingsSummary } from "../types";

export const TOP_LIMIT = 10;

export type StockSort = "weight" | "name" | "funds";

export const STOCK_SORTS: ReadonlyArray<{ id: StockSort; label: string }> = [
  { id: "weight", label: "By weight" },
  { id: "name", label: "By name" },
  { id: "funds", label: "By # of funds" },
];

export function equityRows(summary: StockHoldingsSummary | null): StockHoldingRow[] {
  if (!summary || !summary.rows) return [];
  return summary.rows.filter(
    r => r.asset_type === "equity_domestic" || r.asset_type === "equity_international"
  );
}

export function stockKey(row: { isin?: string | null; instrument_name: string }): string {
  return row.isin ?? row.instrument_name;
}

export interface FundChip {
  schemeId: string;
  name: string;
  weight: string;
  color: string;
}

export function fundChips(rows: StockHoldingRow[]): FundChip[] {
  const map = new Map<string, { schemeId: string; name: string; weight: string }>();

  for (const row of rows) {
    for (const fund of row.contributing_funds) {
      if (!map.has(fund.scheme_id)) {
        map.set(fund.scheme_id, {
          schemeId: fund.scheme_id,
          name: fund.scheme_name,
          weight: fund.fund_weight_pct,
        });
      }
    }
  }

  const distinct = Array.from(map.values()).sort((a, b) => {
    const cmp = compareDecimalStrings(b.weight, a.weight);
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name);
  });

  return distinct.map((fund, index) => ({
    ...fund,
    color: colorAt(index),
  }));
}

export interface TopStock {
  rank: number;
  key: string;
  name: string;
  weight: string;
}

export function topStocksForFund(
  rows: StockHoldingRow[],
  schemeId: string,
  limit = TOP_LIMIT
): { stocks: TopStock[]; total: string } {
  const matches: Array<{ row: StockHoldingRow; weight: string }> = [];

  for (const row of rows) {
    const fund = row.contributing_funds.find(f => f.scheme_id === schemeId);
    if (fund) {
      matches.push({ row, weight: fund.stock_weight_pct });
    }
  }

  matches.sort((a, b) => {
    const cmp = compareDecimalStrings(b.weight, a.weight);
    if (cmp !== 0) return cmp;
    return a.row.instrument_name.localeCompare(b.row.instrument_name);
  });

  const sliced = matches.slice(0, limit);
  const stocks: TopStock[] = sliced.map((item, index) => ({
    rank: index + 1,
    key: stockKey(item.row),
    name: item.row.instrument_name,
    weight: item.weight,
  }));

  const total =
    stocks.length > 0 ? sumDecimalStrings(stocks.map(s => s.weight)) : "0";

  return { stocks, total };
}

export function medalFor(rank: number): "gold" | "silver" | "bronze" | null {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return null;
}

export function relativeWidth(
  weight: string,
  stocks: { weight: string }[]
): string {
  let largest = 0;
  for (const s of stocks) {
    const w = Number(s.weight);
    if (w > largest) largest = w;
  }
  if (largest === 0) return "0";
  const numWeight = Number(weight);
  return String(Math.round((numWeight / largest) * 10000) / 100);
}

export function sortStocks(
  rows: StockHoldingRow[],
  sort: StockSort
): StockHoldingRow[] {
  const copy = [...rows];

  return copy.sort((a, b) => {
    if (sort === "name") {
      return a.instrument_name.localeCompare(b.instrument_name);
    }

    if (sort === "funds") {
      const diffFunds = b.contributing_funds.length - a.contributing_funds.length;
      if (diffFunds !== 0) return diffFunds;
    }

    // Default or secondary sort: weight descending, then name
    const cmpWeight = compareDecimalStrings(b.exposure_pct, a.exposure_pct);
    if (cmpWeight !== 0) return cmpWeight;
    return a.instrument_name.localeCompare(b.instrument_name);
  });
}

export function heldInText(row: { contributing_funds: unknown[] }): string {
  const n = row.contributing_funds.length;
  return n === 1 ? "1 fund" : `${n} funds`;
}

export function portfolioShare(fundWeight: string, stockWeight: string): string {
  return percentageProduct(fundWeight, stockWeight);
}
