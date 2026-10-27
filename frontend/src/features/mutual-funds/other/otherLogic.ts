import { formatPercent as formatLookthroughPercent } from "../../../components/mf/lookthroughDisplay";
import { compareDecimalStrings, diffDecimalStrings, sumDecimalStrings, toPercentString } from "../../../lib/decimal";
import { formatPercent, formatRupees } from "../../../lib/format";
import type {
  CategoryRankingSummary,
  CategoryRankRow,
  DirectRegularTerComparison,
  FundRankingComponent,
  FundRankingNeighbor,
  FundRankingRow,
  FundScoreRow,
  FundTerRow,
  PeriodReturn,
  ValuationSummary,
  WeightedTerSummary,
} from "../types";

export const GROUP_TITLES = {
  cost: "Cost & Valuation",
  scorer: "Fund Quality Scorer",
  category: "SEBI Category Ranking & Peer Comparison",
  ranking: "Fund Ranking",
} as const;

export function normalizeFraction(value: string): string {
  if (!value) return value;
  const trimmed = value.trim();
  const m = trimmed.match(/^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
  if (!m) return trimmed;
  const sign = m[1] === "-" ? "-" : "";
  const whole = m[2];
  const frac = m[3] ?? "";
  const exp = parseInt(m[4], 10);
  const digits = whole + frac;
  const decimalPos = whole.length + exp;
  if (decimalPos <= 0) {
    return `${sign}0.${"0".repeat(-decimalPos)}${digits}`.replace(/\.?0+$/, "");
  } else if (decimalPos >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalPos - digits.length)}`;
  } else {
    return `${sign}${digits.slice(0, decimalPos)}.${digits.slice(decimalPos)}`.replace(/\.?0+$/, "");
  }
}

export function rawPercent(
  value: string | null | undefined,
  options: { signed?: boolean; digits?: number } = {}
): string {
  if (value == null) return "—";
  const norm = normalizeFraction(value);
  const pctStr = toPercentString(norm);
  return formatPercent(pctStr, { digits: options.digits ?? 1, signed: options.signed ?? false });
}

export function terText(value: string | null | undefined): string {
  if (value == null) return "—";
  return formatPercent(value, { digits: 2 });
}

export function ratioText(value: string | null | undefined): string {
  if (value == null) return "—";
  return `${formatLookthroughPercent(value, 1)}x`;
}

export function pointsText(
  fund: string | null | undefined,
  category: string | null | undefined
): string {
  if (fund == null || category == null) return "—";
  const f = normalizeFraction(fund);
  const c = normalizeFraction(category);
  const diff = diffDecimalStrings(f, c);
  const pctDiff = toPercentString(diff);
  const isNeg = pctDiff.startsWith("-");
  const absPct = isNeg ? pctDiff.slice(1) : pctDiff;
  const formatted = formatLookthroughPercent(absPct, 1);
  if (formatted === "0.0") return "0.0pp";
  return `${isNeg ? "-" : "+"}${formatted}pp`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

export function wholePercentile(value: string): number {
  const [whole, fraction = ""] = value.split(".");
  let n = parseInt(whole, 10) || 0;
  if (fraction.length > 0 && fraction[0] >= "5") {
    n += 1;
  }
  return n;
}

export type PercentileTier = "high" | "mid" | "low";

export function percentileTier(percentile: string): PercentileTier {
  if (compareDecimalStrings(percentile, "66") >= 0) return "high";
  if (compareDecimalStrings(percentile, "33") >= 0) return "mid";
  return "low";
}

export const TIER_STYLE: Record<PercentileTier, { fill: string; bg: string; text: string }> = {
  high: { fill: "var(--pos)", bg: "var(--pos-bg)", text: "var(--pos-text)" },
  mid: { fill: "var(--warn-text)", bg: "var(--warn-bg)", text: "var(--warn-text)" },
  low: { fill: "var(--neg)", bg: "var(--neg-bg)", text: "var(--neg-text)" },
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function percentileWidth(percentile: string): string {
  return String(round2(Math.min(100, Math.max(2, Number(percentile)))));
}

// ---- TER logic ----

export type PlanState = "bar" | "none-held" | "no-ter";

export function planState(summary: WeightedTerSummary | undefined): PlanState {
  if (!summary) return "none-held";
  if (summary.weighted_ter !== null) return "bar";
  if (compareDecimalStrings(summary.total_value, "0") === 0) return "none-held";
  return "no-ter";
}

export interface TerLadderRow {
  fund: FundTerRow;
  hasTer: boolean;
  width: string;
  tone: "below" | "above" | "none";
}

export function terLadderRows(ter: WeightedTerSummary): TerLadderRow[] {
  const funds = ter.funds ?? [];
  const withTer = funds
    .filter(f => f.ter !== null)
    .sort((a, b) => {
      const cmp = compareDecimalStrings(a.ter!, b.ter!);
      if (cmp !== 0) return cmp;
      return a.scheme_name.localeCompare(b.scheme_name);
    });

  const withoutTer = funds
    .filter(f => f.ter === null)
    .sort((a, b) => {
      const cmp = compareDecimalStrings(b.value, a.value);
      if (cmp !== 0) return cmp;
      return a.scheme_name.localeCompare(b.scheme_name);
    });

  let largest = 0;
  for (const f of withTer) {
    const num = Number(f.ter);
    if (num > largest) largest = num;
  }

  const rows: TerLadderRow[] = [];

  for (const f of withTer) {
    const width = largest > 0 ? String(round2((Number(f.ter) / largest) * 100)) : "0";
    const tone =
      ter.weighted_ter === null || compareDecimalStrings(f.ter!, ter.weighted_ter) <= 0
        ? "below"
        : "above";
    rows.push({ fund: f, hasTer: true, width, tone });
  }

  for (const f of withoutTer) {
    rows.push({ fund: f, hasTer: false, width: "0", tone: "none" });
  }

  return rows;
}

export function planLabel(plan_type: string | null | undefined): string | null {
  if (plan_type === "direct") return "Direct";
  if (plan_type === "regular") return "Regular";
  return null;
}

export function terBadge(fund: FundTerRow): string | null {
  const label = planLabel(fund.plan_type);
  if (!label) return null;
  if (fund.plan_type === "direct" && fund.annual_ter_saving && compareDecimalStrings(fund.annual_ter_saving, "0") > 0) {
    return `Direct · saves ${formatRupees(fund.annual_ter_saving)}/yr`;
  }
  return label;
}

export function savingsLine(funds: FundTerRow[] | undefined): string | null {
  if (!funds) return null;
  const directWithSavings = funds.filter(
    f => f.plan_type === "direct" && f.annual_ter_saving && compareDecimalStrings(f.annual_ter_saving, "0") > 0
  );
  if (directWithSavings.length === 0) return null;
  const n = directWithSavings.length;
  const totalSavings = sumDecimalStrings(directWithSavings.map(f => f.annual_ter_saving!));
  return `Your ${n} Direct-plan ${n === 1 ? "holding is" : "holdings are"} already saving an estimated ${formatRupees(totalSavings)}/yr combined versus the Regular-plan version of the same ${n === 1 ? "scheme" : "schemes"} — see each fund's own saving below.`;
}

export interface TerTotals {
  count: number;
  value: string;
  cost1y: string | null;
  cost3y: string | null;
  cost5y: string | null;
}

export function terTotals(ter: WeightedTerSummary): TerTotals | null {
  const withTer = (ter.funds ?? []).filter(f => f.ter !== null);
  if (withTer.length === 0) return null;
  return {
    count: withTer.length,
    value: sumDecimalStrings(withTer.map(f => f.value)),
    cost1y: ter.cost_1y ?? null,
    cost3y: ter.cost_3y ?? null,
    cost5y: ter.cost_5y ?? null,
  };
}

export function noTerNote(funds: FundTerRow[] | undefined): string | null {
  if (!funds) return null;
  const noTer = funds.filter(f => f.ter === null);
  if (noTer.length === 0) return null;
  const n = noTer.length;
  return `${n} ${n === 1 ? "fund" : "funds"} without a TER ${n === 1 ? "is" : "are"} not included in the projected totals above.`;
}

export function terScaleMax(
  summary: WeightedTerSummary,
  comparison: DirectRegularTerComparison | null
): number {
  let max = 2.5;
  if (summary.weighted_ter) max = Math.max(max, Number(summary.weighted_ter));
  if (comparison?.direct?.weighted_ter) max = Math.max(max, Number(comparison.direct.weighted_ter));
  if (comparison?.regular?.weighted_ter) max = Math.max(max, Number(comparison.regular.weighted_ter));
  return max;
}

export function pinPercent(value: string, max: number): number {
  return round2(Math.min(100, Math.max(0, (Number(value) / max) * 100)));
}

export function periodsFor(
  ranking: CategoryRankingSummary | null,
  schemeId: string
): Partial<Record<"1y" | "3y" | "5y", PeriodReturn>> | null {
  if (!ranking) return null;
  const row = ranking.funds.find(f => f.scheme_id === schemeId);
  if (!row || !row.periods) return null;
  const hasReturn = (["1y", "3y", "5y"] as const).some(
    p => row.periods?.[p]?.fund_return !== null && row.periods?.[p]?.fund_return !== undefined
  );
  return hasReturn ? row.periods : null;
}

// ---- Valuation logic ----

export type ValuationKind = "pe" | "pb";
export type SeriesKey = "you" | "nifty_50" | "nifty_500";

export const SERIES: Record<SeriesKey, { label: string; short: string; color: string }> = {
  you: { label: "You", short: "You", color: "var(--pos)" },
  nifty_50: { label: "Nifty 50", short: "N50", color: "var(--c2)" },
  nifty_500: { label: "Nifty 500", short: "N500", color: "var(--c4)" },
};

export const KIND_TEXT: Record<ValuationKind, { label: string; basis: string }> = {
  pe: { label: "P/E", basis: "earnings" },
  pb: { label: "P/B", basis: "book value" },
};

export function ratioState(data: ValuationSummary, kind: ValuationKind): "hidden" | "not_enough" | "ok" {
  if (data.hide_headlines) return "hidden";
  const metric = data[kind];
  if (!metric.enough_data || metric.ratio === null) return "not_enough";
  return "ok";
}

export interface RatioRow {
  key: SeriesKey;
  label: string;
  short: string;
  color: string;
  ratio: string | null;
}

export function ratioRows(data: ValuationSummary, kind: ValuationKind): RatioRow[] {
  const state = ratioState(data, kind);
  const youRatio = state === "ok" ? data[kind].ratio : null;
  const youRow: RatioRow = { key: "you", ...SERIES.you, ratio: youRatio };
  const indexRows: RatioRow[] = data.indices.map(idx => {
    const key = idx.index_name;
    const conf = SERIES[key];
    const ratio = kind === "pe" ? idx.pe_ratio : idx.pb_ratio;
    return { key, ...conf, ratio };
  });
  return [youRow, ...indexRows];
}

export function pinPositions(rows: RatioRow[]): Record<SeriesKey, number | null> {
  const valid = rows.filter(r => r.ratio !== null);
  const res: Record<SeriesKey, number | null> = { you: null, nifty_50: null, nifty_500: null };

  if (valid.length === 0) return res;

  const nums = valid.map(r => Number(r.ratio));
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  const span = high - low;

  for (const r of rows) {
    if (r.ratio === null) {
      res[r.key] = null;
    } else if (span === 0) {
      res[r.key] = 50;
    } else {
      res[r.key] = round2(8 + ((Number(r.ratio) - low) / span) * 84);
    }
  }

  return res;
}

export function barWidths(rows: RatioRow[]): Record<SeriesKey, string> {
  const valid = rows.filter(r => r.ratio !== null);
  const res: Record<SeriesKey, string> = { you: "0", nifty_50: "0", nifty_500: "0" };

  if (valid.length === 0) return res;

  const nums = valid.map(r => Number(r.ratio));
  const largest = Math.max(...nums);

  for (const r of rows) {
    if (r.ratio === null || largest <= 0) {
      res[r.key] = "0";
    } else {
      res[r.key] = String(round2((Number(r.ratio) / largest) * 100));
    }
  }

  return res;
}

export function deltaSentence(data: ValuationSummary, kind: ValuationKind): string | null {
  if (ratioState(data, kind) !== "ok") return null;

  const basis = KIND_TEXT[kind].basis;
  const indicesWithDelta: Array<{ index_name: "nifty_50" | "nifty_500"; delta: string }> = [];

  for (const idx of data.indices) {
    const delta = kind === "pe" ? idx.pe_delta_pct : idx.pb_delta_pct;
    if (delta !== null && delta !== undefined) {
      indicesWithDelta.push({ index_name: idx.index_name, delta });
    }
  }

  if (indicesWithDelta.length === 0) return null;

  const parts: string[] = [];
  indicesWithDelta.forEach((item, index) => {
    const label = SERIES[item.index_name].label;
    const isZero = compareDecimalStrings(item.delta, "0") === 0;
    const isNeg = !isZero && item.delta.startsWith("-");
    const abs = isNeg ? item.delta.slice(1) : item.delta;
    const absFmt = formatLookthroughPercent(abs, 1);

    if (index === 0) {
      if (isZero) {
        parts.push(`Your portfolio is level with ${label} on ${basis}`);
      } else if (isNeg) {
        parts.push(`Your portfolio is ${absFmt}% cheaper on ${basis} than ${label}`);
      } else {
        parts.push(`Your portfolio is ${absFmt}% more expensive on ${basis} than ${label}`);
      }
    } else {
      if (isZero) {
        parts.push(`, and level with ${label}`);
      } else if (isNeg) {
        parts.push(`, and ${absFmt}% cheaper than ${label}`);
      } else {
        parts.push(`, and ${absFmt}% more expensive than ${label}`);
      }
    }
  });

  return `${parts.join("")}.`;
}

// ---- Scorer logic ----

export type FactorKey = "return" | "risk" | "consistency";
export const FACTOR_KEYS: readonly FactorKey[] = ["return", "risk", "consistency"] as const;
export const FACTOR_LABELS = {
  return: "Return",
  risk: "Downside protection",
  consistency: "Consistency of outperformance",
} as const;

export type Verdict = "excellent" | "strong" | "weak" | "poor";
export const VERDICT_LABEL: Record<Verdict, string> = {
  excellent: "Excellent",
  strong: "Strong",
  weak: "Weak",
  poor: "Poor",
};

export function displayTier(backendTier: number): number {
  return 6 - backendTier;
}

export function tierTone(tier: number): PercentileTier {
  return tier <= 2 ? "high" : tier === 3 ? "mid" : "low";
}

export function tierCaption(tier: number): string {
  return tier <= 2 ? "Top Tier Performer" : tier === 3 ? "Average Category Rank" : "Below Category Average";
}

export function whatThisMeans(tier: number): string {
  switch (tier) {
    case 1:
      return "A strong choice within its category based on historical data — suitable if you're comfortable with typical risk for this fund type.";
    case 2:
      return "A solid, dependable option within its category based on historical data.";
    case 3:
      return "An average performer within its category — worth comparing against a few alternatives before deciding.";
    case 4:
      return "A below-average performer within its category — consider reviewing whether it still fits your goals.";
    case 5:
      return "One of the weaker performers within its category based on historical data — worth a closer look before adding more.";
    default:
      return "An average performer within its category — worth comparing against a few alternatives before deciding.";
  }
}

export function portfolioVerdict(score: string): { label: string; tone: PercentileTier } {
  if (compareDecimalStrings(score, "70") >= 0) return { label: "High Quality Portfolio", tone: "high" };
  if (compareDecimalStrings(score, "50") >= 0) return { label: "Moderate Quality Portfolio", tone: "mid" };
  return { label: "Needs Review", tone: "low" };
}

export function verdictWord(percentile: string): Verdict {
  if (compareDecimalStrings(percentile, "80") >= 0) return "excellent";
  if (compareDecimalStrings(percentile, "50") >= 0) return "strong";
  if (compareDecimalStrings(percentile, "20") >= 0) return "weak";
  return "poor";
}

const FACTOR_SENTENCES: Record<FactorKey, Record<Verdict, string>> = {
  return: {
    excellent: "Strong long-term performance — has consistently outperformed similar funds.",
    strong: "Solid long-term performance, generally in line with or ahead of similar funds.",
    weak: "Below-average long-term performance compared to similar funds.",
    poor: "Long-term performance has lagged most similar funds.",
  },
  risk: {
    excellent: "Strong downside protection — has historically lost less than peers in falling markets.",
    strong: "Reasonable downside protection compared to similar funds.",
    weak: "Below-average downside protection — has historically fallen more than peers in weak markets.",
    poor: "Weak downside protection — has historically lost more than most peers in falling markets.",
  },
  consistency: {
    excellent: "Very consistent — has beaten its category median in most 12-month periods.",
    strong: "Fairly consistent — has beaten its category median in more than half of 12-month periods.",
    weak: "Inconsistent — has beaten its category median in less than half of 12-month periods.",
    poor: "Highly inconsistent — has rarely beaten its category median over rolling 12-month periods.",
  },
};

export function assessFactor(
  key: FactorKey,
  percentile: string
): {
  key: FactorKey;
  bucket: "strength" | "watchout";
  dot: "green" | "orange" | "red";
  verdict: Verdict;
  sentence: string;
} {
  const verdict = verdictWord(percentile);
  const dot =
    compareDecimalStrings(percentile, "50") >= 0
      ? "green"
      : compareDecimalStrings(percentile, "20") >= 0
        ? "orange"
        : "red";
  const bucket = dot === "green" ? "strength" : "watchout";
  const sentence = FACTOR_SENTENCES[key][verdict];
  return { key, bucket, dot, verdict, sentence };
}

export function factorPercentiles(
  fund: FundScoreRow
): Record<FactorKey, string> | null {
  if (
    fund.return_percentile === null ||
    fund.risk_percentile === null ||
    fund.consistency_hit_rate === null ||
    fund.return_percentile === undefined ||
    fund.risk_percentile === undefined ||
    fund.consistency_hit_rate === undefined
  ) {
    return null;
  }
  return {
    return: fund.return_percentile,
    risk: fund.risk_percentile,
    consistency: fund.consistency_hit_rate,
  };
}

const STRONG_PHRASES: Record<FactorKey, string> = {
  return: "strong long-term performance",
  risk: "strong downside protection",
  consistency: "consistent outperformance of peers",
};

const WEAK_PHRASES: Record<FactorKey, string> = {
  return: "weaker long-term performance",
  risk: "weaker downside protection",
  consistency: "inconsistent performance versus peers",
};

export function whySentence(fund: FundScoreRow): string | null {
  const pctMap = factorPercentiles(fund);
  if (!pctMap || fund.risk_adjusted_tier === null || fund.risk_adjusted_tier === undefined) return null;
  const tier = displayTier(fund.risk_adjusted_tier);

  const strongest = FACTOR_KEYS.reduce((best, k) =>
    compareDecimalStrings(pctMap[k], pctMap[best]) > 0 ? k : best
  );
  const weakest = FACTOR_KEYS.reduce((worst, k) =>
    compareDecimalStrings(pctMap[k], pctMap[worst]) < 0 ? k : worst
  );

  const bonus = fund.cost_adjustment !== null && fund.cost_adjustment !== undefined && compareDecimalStrings(fund.cost_adjustment, "0.25") === 0;
  const penalty = fund.cost_adjustment !== null && fund.cost_adjustment !== undefined && compareDecimalStrings(fund.cost_adjustment, "-0.25") === 0;

  if (tier === 1 || tier === 2) {
    return `Scores well mainly due to ${STRONG_PHRASES[strongest]}${bonus ? " and low cost" : ""}.`;
  }
  if (tier === 4 || tier === 5) {
    return `Held back mainly by ${WEAK_PHRASES[weakest]}${penalty ? " and higher-than-average cost" : ""}.`;
  }
  return `Performs roughly in line with similar funds, with strength in ${STRONG_PHRASES[strongest]} balanced by ${WEAK_PHRASES[weakest]}.`;
}

export function costLine(adjustment: string | null | undefined): string {
  if (adjustment === null || adjustment === undefined) return "Cost: no adjustment recorded.";
  if (compareDecimalStrings(adjustment, "0") === 0) return "Cost: category-median TER, no adjustment.";
  if (compareDecimalStrings(adjustment, "0") > 0) {
    return `Cost bonus: +${formatLookthroughPercent(adjustment, 2)} for a below-category expense ratio.`;
  }
  const abs = adjustment.startsWith("-") ? adjustment.slice(1) : adjustment;
  return `Cost penalty: -${formatLookthroughPercent(abs, 2)} for an above-category expense ratio.`;
}

export const SCORE_EXPLAINER: readonly [string, string, string] = [
  "Every fund is compared only with other funds in its own SEBI category, so a Large Cap fund is never ranked against a Mid Cap fund. Each fund gets a score out of 100 built from three things: Return (45%), Risk (30%, how much it loses in bad months; lower is better) and Consistency (25%, how often it has beaten its category average).",
  "A small cost adjustment is applied on top: up to 0.25 points up or down, depending on whether the fund's expense ratio is lower or higher than its category average. Differences under 0.05 percentage points are ignored.",
  "Tiers: Tier 1 is the top 20% of its category, Tier 2 the next 20%, down to Tier 5 for the bottom 20%. Portfolio label: 70 or more is High Quality Portfolio, 50 to 69 is Moderate Quality Portfolio, and below 50 is Needs Review. A modelling opinion based on past data, not a guarantee of future returns.",
] as const;

export function isScored(fund: FundScoreRow): boolean {
  return (
    !fund.category_unavailable &&
    !fund.insufficient_history &&
    fund.final_score !== null &&
    fund.final_score !== undefined &&
    fund.risk_adjusted_tier !== null &&
    fund.risk_adjusted_tier !== undefined
  );
}

export function unscoredReason(fund: FundScoreRow): string {
  if (fund.category_unavailable) {
    return "SEBI category data is not available for this fund.";
  }
  return "This fund does not have enough historical NAV data to evaluate downside risk and 12-month rolling consistency.";
}

// ---- Rankings logic ----

export function categoryOutperform(fund: CategoryRankRow): string | null {
  if (fund.scheme_return === null || fund.scheme_return === undefined || fund.category_avg_return === null || fund.category_avg_return === undefined || fund.sebi_category === null || fund.sebi_category === undefined) {
    return null;
  }
  const out = compareDecimalStrings(normalizeFraction(fund.scheme_return), normalizeFraction(fund.category_avg_return)) >= 0;
  const pt = pointsText(fund.scheme_return, fund.category_avg_return);
  const ptClean = pt.replace(/^[+-]/, "");
  return `${out ? "Outperforming" : "Trailing"} its ${fund.sebi_category} category average over 3Y by ${ptClean}.`;
}

export const RANK_WEIGHTS = [
  { key: "return_3y", label: "3Y return", weight: 25, unit: "fraction" },
  { key: "return_5y", label: "5Y return", weight: 25, unit: "fraction" },
  { key: "category_relative", label: "Category-relative", weight: 20, unit: "fraction" },
  { key: "low_volatility", label: "Low volatility", weight: 15, unit: "fraction" },
  { key: "low_ter", label: "Low TER", weight: 15, unit: "percent" },
] as const;

export function rankWeightsSentence(): string {
  const parts = RANK_WEIGHTS.map(item => {
    const lowerLabel = item.label.charAt(0).toLowerCase() + item.label.slice(1);
    return `${lowerLabel} ${item.weight}%`;
  });
  return `Overall rank = composite score: ${parts.join(", ")}.`;
}

export function shortCategory(name: string | null): string {
  if (!name) return "";
  const idx = name.indexOf(" - ");
  const part = idx !== -1 ? name.slice(idx + 3) : name;
  return part.endsWith(" Fund") ? part.slice(0, -5) : part;
}

export function rankLine(fund: FundRankingRow): string {
  const counts = `${fund.category_universe_size} in category`;
  if (fund.thin_category) {
    return `${ordinal(fund.category_rank ?? 0)} of ${fund.category_size} ranked ${shortCategory(fund.category_name)} funds · ${counts}`;
  }
  let line = `#${fund.category_rank} of ${fund.category_size} ranked · ${counts}`;
  if (fund.percentile !== null && fund.percentile !== undefined) {
    line += ` · Top ${100 - wholePercentile(fund.percentile)}%`;
  }
  return line;
}

export function componentText(
  component: FundRankingComponent,
  unit: "fraction" | "percent"
): string {
  const left = component.percentile !== null && component.percentile !== undefined
    ? `${ordinal(wholePercentile(component.percentile))} pct`
    : "—";
  let right = "";
  if (component.raw !== null && component.raw !== undefined) {
    right = unit === "percent" ? terText(component.raw) : rawPercent(component.raw);
  }
  if (left === "—" && !right) return "—";
  if (left === "—") return `— · ${right}`;
  if (!right) return left;
  return `${left} · ${right}`;
}

export function splitNeighbors(
  fund: FundRankingRow
): { above: FundRankingNeighbor[]; below: FundRankingNeighbor[] } {
  if (fund.category_rank === null || fund.category_rank === undefined) {
    return { above: [], below: [] };
  }
  const sorted = [...fund.neighbors].sort((a, b) => a.category_rank - b.category_rank);
  const above = sorted.filter(n => n.category_rank < fund.category_rank!);
  const below = sorted.filter(n => n.category_rank > fund.category_rank!);
  return { above, below };
}
