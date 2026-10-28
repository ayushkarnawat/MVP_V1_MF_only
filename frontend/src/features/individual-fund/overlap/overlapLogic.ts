import { compareDecimalStrings } from "@/lib/decimal";
import { formatPercent } from "@/lib/format";
import type { OverlapCompareResponse, OverlapDistribution, OverlapResponse } from "../types";

export type ComparisonTabId = "overview" | "common" | "unique" | "sector" | "market_cap" | "performance";

export const COMPARISON_TABS: readonly { id: ComparisonTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "common", label: "Common Holdings" },
  { id: "unique", label: "Unique Holdings" },
  { id: "sector", label: "Sector Comparison" },
  { id: "market_cap", label: "Market Cap Comparison" },
  { id: "performance", label: "Performance Comparison" },
];

export function stocks(count: number): string {
  return `${count} ${count === 1 ? "stock" : "stocks"}`;
}

/** "3 common stocks out of 12 total holdings" (the donut caption of the normal state). */
export function commonStocksCaption(common: number, total: number): string {
  const holdings = total === 1 ? "holding" : "holdings";
  return `${common} common ${common === 1 ? "stock" : "stocks"} out of ${total} total ${holdings}`;
}

/** "3 common stocks out of 12 and 3 total holdings respectively" (the donut caption of the comparison state). */
export function comparisonCaption(common: number, totalA: number, totalB: number): string {
  return `${common} common ${common === 1 ? "stock" : "stocks"} out of ${totalA} and ${totalB} total holdings respectively`;
}

/** Each fund's stock count, derived from the comparison counts (its unique stocks plus the common ones). */
export function fundStockTotals(counts: OverlapCompareResponse["counts"]): { a: number; b: number } {
  return { a: counts.unique_a + counts.common, b: counts.unique_b + counts.common };
}

/**
 * A bar width in percent of the widest bar, for drawing only (a coordinate, never shown as a figure).
 * Zero, a missing max or a max of zero gives 0; the result is clamped to 0 to 100.
 */
export function barWidth(value: string | null | undefined, max: string | null | undefined): number {
  if (value == null || max == null) return 0;
  const top = Number(max);
  const own = Number(value);
  if (!Number.isFinite(top) || !Number.isFinite(own) || top <= 0 || own <= 0) return 0;
  return Math.min(100, Math.round((own / top) * 10000) / 100);
}

/** The widest value of a list of Decimal strings ("0" for an empty list). */
export function maxDecimal(values: readonly string[]): string {
  return values.reduce((best, value) => (compareDecimalStrings(value, best) === 1 ? value : best), "0");
}

export type DistributionKey = "unique_to_fund" | "common" | "unique_to_others";

export interface DistributionSegment {
  key: DistributionKey;
  label: string;
  count: number;
  pct: string;
}

/** The three segments of the Overlap Distribution bar, always in this order, with the backend's own percent strings. */
export function distributionSegments(distribution: OverlapDistribution): DistributionSegment[] {
  return [
    { key: "unique_to_fund", label: "Unique to this fund", count: distribution.unique_to_fund_count, pct: distribution.unique_to_fund_pct },
    { key: "common", label: "Common to your other funds", count: distribution.common_count, pct: distribution.common_pct },
    { key: "unique_to_others", label: "Unique to your other funds", count: distribution.unique_to_others_count, pct: distribution.unique_to_others_pct },
  ];
}

/** The "Quick insights" sentence of the normal state, built only from the response's own figures. */
export function quickInsight(overlap: OverlapResponse): string {
  if (overlap.total_stock_count === 0) return "No stock holdings are published for this fund yet.";
  if (overlap.common_stock_count === 0) {
    return `None of this fund's ${stocks(overlap.total_stock_count)} ${overlap.total_stock_count === 1 ? "is" : "are"} held by your other funds.`;
  }
  const verb = overlap.common_stock_count === 1 ? "is" : "are";
  const lead = `${overlap.common_stock_count} of this fund's ${stocks(overlap.total_stock_count)} ${verb} also held by other funds in your portfolio, together ${formatPercent(overlap.overlap_pct, { digits: 1 })} of this fund.`;
  const top = overlap.by_sector[0];
  return top ? `${lead} The most overlap is in ${top.sector} (${formatPercent(top.pct, { digits: 1 })}).` : lead;
}

/** The sector where the two funds share the most (by the `common` weight), or null when they share nothing. */
export function topCommonSector(sectors: OverlapCompareResponse["sector_comparison"]): string | null {
  let best: { sector: string; common: string } | null = null;
  for (const row of sectors) {
    if (compareDecimalStrings(row.common, best?.common ?? "0") === 1) best = row;
  }
  return best ? best.sector : null;
}

/** The "Key takeaways" sentence of the comparison state. */
export function keyTakeaway(compare: OverlapCompareResponse): string {
  const { common } = compare.counts;
  if (common === 0) return "These two funds hold no stock in common.";
  const lead = `These two funds share ${stocks(common)} worth a combined ${formatPercent(compare.impact.common_both.pct, { digits: 1 })} of your portfolio.`;
  const sector = topCommonSector(compare.sector_comparison);
  return sector ? `${lead} They overlap most in ${sector}.` : lead;
}
