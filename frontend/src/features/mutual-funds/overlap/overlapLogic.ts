import { percentageProduct } from "../../../components/mf/lookthroughDisplay";
import { compareDecimalStrings, diffDecimalStrings, sumDecimalStrings } from "../../../lib/decimal";
import { formatPercent } from "../../../lib/format";
import { paths } from "../../../shell/nav/paths";
import { excludedFundCount, percentOf } from "../mfCopy";
import type {
  ConcentrationPoint,
  FundContribution,
  OverlapFund,
  OverlapImpactPair,
  OverlapPair,
  OverlapSummary,
  StockHoldingRow,
  StockHoldingsSummary,
} from "../types";

export const COMMON_LIMIT = 10;
export const PAIR_LIMIT = 5;
export const IMPACT_PAIRS = 3;

export type Band = "low" | "moderate" | "high";
export interface Bands {
  low: string;
  high: string;
}

export const BAND_WORD: Record<Band, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
};

export function bandOf(pct: string, bands: Bands): Band {
  if (compareDecimalStrings(pct, bands.high) >= 0) return "high";
  if (compareDecimalStrings(pct, bands.low) >= 0) return "moderate";
  return "low";
}

export function bandLegendText(band: Band, bands: Bands): string {
  const low = formatPercent(bands.low, { digits: 0 });
  const high = formatPercent(bands.high, { digits: 0 });
  if (band === "low") return `Low < ${low}`;
  if (band === "moderate") return `Moderate ${low.replace("%", "")}–${high}`;
  return `High ≥ ${high}`;
}

export function pairKey(idA: string, idB: string): string {
  return [idA, idB].sort((a, b) => a.localeCompare(b)).join("~");
}

export function pairKeyOf(pair: OverlapPair): string {
  return pairKey(pair.fund_a.scheme_id, pair.fund_b.scheme_id);
}

export function sortedPairs(pairs: OverlapPair[]): OverlapPair[] {
  return [...pairs].sort((a, b) => {
    const cmp = compareDecimalStrings(b.overlap_pct, a.overlap_pct);
    if (cmp !== 0) return cmp;
    const aCmp = a.fund_a.scheme_name.localeCompare(b.fund_a.scheme_name);
    if (aCmp !== 0) return aCmp;
    return a.fund_b.scheme_name.localeCompare(b.fund_b.scheme_name);
  });
}

export function pairCount(n: number): number {
  return n < 2 ? 0 : (n * (n - 1)) / 2;
}

export function pairsWithOverlap(summary: OverlapSummary): number {
  return summary.matrix.filter(p => bandOf(p.overlap_pct, summary.bands) !== "low").length;
}

export function highestPair(summary: OverlapSummary): OverlapPair | null {
  return sortedPairs(summary.matrix)[0] ?? null;
}

export function findPair(summary: OverlapSummary, key: string | null): OverlapPair | null {
  if (!key) return null;
  const inMatrix = summary.matrix.find(p => pairKeyOf(p) === key);
  if (inMatrix) return inMatrix;
  const inAboveLow = summary.pairs_above_low.find(p => pairKeyOf(p) === key);
  if (inAboveLow) return inAboveLow;
  return (summary.pairs_at_low_boundary ?? []).find(p => pairKeyOf(p) === key) ?? null;
}

export function riskBand(summary: OverlapSummary): Band | null {
  const top = highestPair(summary);
  return top ? bandOf(top.overlap_pct, summary.bands) : null;
}

export function riskNote(band: Band | null): string {
  if (band === null) return "needs at least two funds";
  if (band === "low") return "no fund pair shares meaningful exposure";
  if (band === "moderate") return "a few fund pairs share meaningful exposure";
  return "some fund pairs duplicate a large share of each other's holdings";
}

export function excludedNote(n: number): string {
  if (n === 0) return "all your funds have stock holdings to look through";
  if (n === 1) return "1 fund excluded — no stock holdings to look through";
  return `${n} funds excluded — no stock holdings to look through`;
}

export function analysedCount(summary: OverlapSummary): { analysed: number; of: number; excluded: number } {
  const excluded = excludedFundCount(summary.coverage);
  const analysed = summary.total_fund_count;
  return { analysed, of: analysed + excluded, excluded };
}

export function fundInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1 && words[words.length - 1].toLowerCase() === "fund") {
    words.pop();
  }
  return words.slice(0, 3).map(w => w[0].toUpperCase()).join("");
}

export function combinedWeight(pair: OverlapPair, total: string): string | null {
  return percentOf(sumDecimalStrings([pair.fund_a.current_value, pair.fund_b.current_value]), total);
}

export interface ImpactRow {
  key: "top3" | "other" | "unique";
  label: string;
  value: string;
  pct: string;
}

export function impactBreakdown(summary: OverlapSummary): ImpactRow[] {
  const pairs = sortedPairs(summary.pairs_above_low);
  const topFundsMap = new Map<string, OverlapFund>();
  for (const p of pairs.slice(0, 3)) {
    if (!topFundsMap.has(p.fund_a.scheme_id)) topFundsMap.set(p.fund_a.scheme_id, p.fund_a);
    if (!topFundsMap.has(p.fund_b.scheme_id)) topFundsMap.set(p.fund_b.scheme_id, p.fund_b);
  }
  const otherFundsMap = new Map<string, OverlapFund>();
  for (const p of pairs.slice(3)) {
    if (!topFundsMap.has(p.fund_a.scheme_id) && !otherFundsMap.has(p.fund_a.scheme_id)) {
      otherFundsMap.set(p.fund_a.scheme_id, p.fund_a);
    }
    if (!topFundsMap.has(p.fund_b.scheme_id) && !otherFundsMap.has(p.fund_b.scheme_id)) {
      otherFundsMap.set(p.fund_b.scheme_id, p.fund_b);
    }
  }

  const topFunds = Array.from(topFundsMap.values());
  const otherFunds = Array.from(otherFundsMap.values());

  const topValue = topFunds.length > 0 ? sumDecimalStrings(topFunds.map(f => f.current_value)) : "0";
  const otherValue = otherFunds.length > 0 ? sumDecimalStrings(otherFunds.map(f => f.current_value)) : "0";
  const sumTopOther = sumDecimalStrings([topValue, otherValue]);
  const uniqueValue = diffDecimalStrings(summary.total_portfolio_value, sumTopOther);

  const topPct = percentOf(topValue, summary.total_portfolio_value) ?? "0.0000";
  const otherPct = percentOf(otherValue, summary.total_portfolio_value) ?? "0.0000";
  const uniquePct = diffDecimalStrings("100.0000", sumDecimalStrings([topPct, otherPct]));

  return [
    { key: "top3", label: "Top 3 overlapping pairs", value: topValue, pct: topPct },
    { key: "other", label: "Other overlapping pairs", value: otherValue, pct: otherPct },
    { key: "unique", label: "Unique holdings", value: uniqueValue, pct: uniquePct },
  ];
}

export function buildOverlapInsights(summary: OverlapSummary): string[] {
  if (summary.pairs_above_low.length === 0) return [];
  const top = sortedPairs(summary.pairs_above_low)[0];
  const total = summary.total_portfolio_value;
  const cw = combinedWeight(top, total);
  const weightText = cw ? formatPercent(cw, { digits: 0 }) : "—";
  const s1 = `${top.fund_a.scheme_name} and ${top.fund_b.scheme_name} share ${formatPercent(top.overlap_pct, { digits: 0 })} overlap — together they account for ${weightText} of your portfolio, so a correction in their shared holdings would hit both at once.`;

  const count = Math.min(3, summary.pairs_above_low.length);
  const impact = impactBreakdown(summary);
  const X = formatPercent(impact[0].pct, { digits: 1 });
  const s2 = summary.pairs_above_low.length === 1
    ? `Funds in your top overlapping pair hold ${X} of your portfolio value.`
    : `Funds in your top ${count} overlapping pairs hold ${X} of your portfolio value.`;

  const sentences = [s1, s2];

  if (summary.matrix_funds.length >= 3) {
    let minFund = summary.matrix_funds[0];
    let minSum = "999999999";
    for (const f of summary.matrix_funds) {
      const fundPairs = summary.matrix.filter(
        p => p.fund_a.scheme_id === f.scheme_id || p.fund_b.scheme_id === f.scheme_id
      );
      const totalOverlap = sumDecimalStrings(fundPairs.map(p => p.overlap_pct));
      if (minSum === "999999999") {
        minSum = totalOverlap;
        minFund = f;
      } else {
        const cmp = compareDecimalStrings(totalOverlap, minSum);
        if (cmp < 0) {
          minSum = totalOverlap;
          minFund = f;
        } else if (cmp === 0 && f.scheme_name.localeCompare(minFund.scheme_name) < 0) {
          minSum = totalOverlap;
          minFund = f;
        }
      }
    }
    sentences.push(`${minFund.scheme_name} has the lowest overlap with the rest of your portfolio — it is doing the most diversification work.`);
  }

  return sentences;
}

export function stockKey(row: StockHoldingRow): string {
  return row.isin ?? row.instrument_name;
}

export interface CommonStock {
  key: string;
  row: StockHoldingRow;
  funds: FundContribution[];
}

export function commonStocks(summary: StockHoldingsSummary | null): CommonStock[] {
  if (!summary || !summary.rows) return [];
  const qualifying = summary.rows.filter(
    r => (r.asset_type === "equity_domestic" || r.asset_type === "equity_international") && r.contributing_funds.length >= 2
  );

  const items: CommonStock[] = qualifying.map(r => {
    const fundsSorted = [...r.contributing_funds].sort((a, b) => {
      const prodA = percentageProduct(a.fund_weight_pct, a.stock_weight_pct);
      const prodB = percentageProduct(b.fund_weight_pct, b.stock_weight_pct);
      const cmp = compareDecimalStrings(prodB, prodA);
      if (cmp !== 0) return cmp;
      return a.scheme_name.localeCompare(b.scheme_name);
    });
    return {
      key: stockKey(r),
      row: r,
      funds: fundsSorted,
    };
  });

  items.sort((a, b) => {
    const cmp = compareDecimalStrings(b.row.exposure_pct, a.row.exposure_pct);
    if (cmp !== 0) return cmp;
    return a.row.instrument_name.localeCompare(b.row.instrument_name);
  });

  return items;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function barWidth(value: string, largest: string): string {
  const numLargest = Number(largest);
  if (!numLargest || numLargest <= 0) return "0";
  const numValue = Number(value);
  return String(round2((numValue / numLargest) * 100));
}

export function headlinePoint(points: ConcentrationPoint[]): ConcentrationPoint | null {
  const valid = points.filter(p => p.stock_count <= 10);
  if (valid.length === 0) return null;
  return valid.reduce((best, cur) => (cur.stock_count > best.stock_count ? cur : best));
}

export interface CurvePoint {
  n: number;
  pct: string;
  x: number;
  y: number;
}

export function concentrationCurve(points: ConcentrationPoint[]): { points: CurvePoint[]; line: string } {
  if (!points || points.length === 0) return { points: [], line: "" };
  let maxN = 0;
  let maxExposure = 0;
  for (const p of points) {
    if (p.stock_count > maxN) maxN = p.stock_count;
    const num = Number(p.exposure_pct);
    if (num > maxExposure) maxExposure = num;
  }
  const maxPct = Math.max(100, maxExposure);

  const curvePoints: CurvePoint[] = points.map(p => {
    const x = round2(40 + (p.stock_count / maxN) * 520);
    const y = round2(160 - (Number(p.exposure_pct) / maxPct) * 130);
    return { n: p.stock_count, pct: p.exposure_pct, x, y };
  });

  const line = curvePoints.map(p => `${p.x},${p.y}`).join(" ");
  return { points: curvePoints, line };
}

export function allStocksPath(): string {
  return `${paths.mutualFunds.holdings()}#all-holdings`;
}

/** The pairs the Top Pairs table lists: those above the low band plus those exactly at it (backend C160 leaves
 * `pairs_above_low` strict), each pair once, largest overlap first. The stat strip counts pairs at the band as
 * overlapping too, so the table agrees with it. */
export function inclusivePairs(summary: OverlapSummary): OverlapPair[] {
  const seen = new Set<string>();
  const joined: OverlapPair[] = [];
  for (const pair of [...summary.pairs_above_low, ...(summary.pairs_at_low_boundary ?? [])]) {
    const key = pairKeyOf(pair);
    if (seen.has(key)) continue;
    seen.add(key);
    joined.push(pair);
  }
  return sortedPairs(joined);
}

/** The top pairs with the stocks behind their overlap (backend C160), in the backend's order; empty when the field is
 * absent or null, and a pair with no drivers is left out. */
export function impactPairs(summary: OverlapSummary): OverlapImpactPair[] {
  return (summary.impact_pairs ?? []).filter(pair => pair.drivers.length > 0);
}

