import { formatPercent as formatLookthroughPercent } from "../../../components/mf/lookthroughDisplay";
import { compareDecimalStrings, diffDecimalStrings, sumDecimalStrings, toPercentString } from "../../../lib/decimal";
import { formatPercent, formatRupees } from "../../../lib/format";
import type {
  CategoryRankingSummary,
  CategoryRankRow,
  DirectRegularTerComparison,
  FundScoreRow,
  FundTerRow,
  PeriodReturn,
  PeriodRank,
  PerformanceRankingResult,
  ValuationSummary,
  WeightedTerSummary,
} from "../types";

export const SHOW_FUND_QUALITY_SCORES = false;

export const GROUP_TITLES = {
  cost: "Cost & Valuation",
  scorer: "Fund Quality Scorer",
  category: "Category Average Comparison",
  ranking: "Performance Ranking",
} as const;

export const CARD_TITLES = {
  cost: [
    "Total Expense Ratio (TER) & Cost Analysis",
    "Portfolio Valuation vs. Benchmarks",
    "Valuation by Fund",
  ],
  scorer: ["Fund Quality Scores"],
  category: ["Returns against the category average"],
  ranking: ["Rank in your fund's category"],
} as const satisfies Record<keyof typeof GROUP_TITLES, readonly string[]>;

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
  if (!metric.enough_data || metric.ratio === null || !!metric.unavailable_reason) return "not_enough";
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
  const period = fund.periods?.["3y"];
  if (!fund.sebi_category || fund.category_unavailable || fund.insufficient_history || period?.fund_return == null || period.category_avg == null) return null;
  const out = compareDecimalStrings(normalizeFraction(period.fund_return), normalizeFraction(period.category_avg)) >= 0;
  const gap = pointsText(period.fund_return, period.category_avg).replace(/^[+-]/, "");
  return `${out ? "Outperforming" : "Trailing"} its ${fund.sebi_category} category average over 3Y by ${gap}.`;
}

export function shortCategory(name: string | null): string {
  if (!name) return "";
  const idx = name.indexOf(" - ");
  const part = idx !== -1 ? name.slice(idx + 3) : name;
  return part.endsWith(" Fund") ? part.slice(0, -5) : part;
}

export type CategoryAverageWeighting = "fund_size" | "equal" | null;

export function categoryAverageSentence(
  weightingOrRow?:
    | CategoryAverageWeighting
    | {
        category_avg_weighting?: CategoryAverageWeighting;
        category_avg_funds_without_size?: number;
        weighting?: CategoryAverageWeighting;
        funds_without_size?: number;
        periods?: Partial<Record<"1y" | "3y" | "5y", Partial<PeriodReturn>>>;
      },
  fundsWithoutSize?: number | null,
): string | null {
  let weighting: CategoryAverageWeighting = null;
  let count = 0;

  if (typeof weightingOrRow === "object" && weightingOrRow !== null) {
    if (weightingOrRow.category_avg_weighting !== undefined && weightingOrRow.category_avg_weighting !== null) {
      weighting = weightingOrRow.category_avg_weighting;
      count = weightingOrRow.category_avg_funds_without_size ?? 0;
    } else if (weightingOrRow.weighting !== undefined && weightingOrRow.weighting !== null) {
      weighting = weightingOrRow.weighting;
      count = weightingOrRow.funds_without_size ?? 0;
    } else if (weightingOrRow.periods) {
      const p = (["3y", "1y", "5y"] as const)
        .map(k => weightingOrRow.periods?.[k])
        .find(item => item?.weighting != null);
      weighting = p?.weighting ?? null;
      count = p?.funds_without_size ?? 0;
    }
  } else {
    weighting = weightingOrRow ?? null;
    count = fundsWithoutSize ?? 0;
  }

  if (weighting === "equal") {
    return "Equal average: no fund in this category has a size on record.";
  }
  if (weighting === "fund_size") {
    if (count > 0) {
      return count === 1
        ? "Weighted by fund size. 1 fund has no size on record and is left out."
        : `Weighted by fund size. ${count} funds have no size on record and are left out.`;
    }
    return "Weighted by fund size.";
  }
  return null;
}

export const PERFORMANCE_PERIODS = ["1Y", "3Y", "5Y"] as const;

function rankingRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validPeriodRank(value: unknown): value is PeriodRank {
  if (!rankingRecord(value) || !Number.isInteger(value.total) || (value.total as number) < 0) return false;
  if (value.status === "ranked") return Number.isInteger(value.rank) && (value.rank as number) >= 1 && (value.rank as number) <= (value.total as number);
  return (value.status === "not_enough_history" || value.status === "not_ranked_index_fund") && value.rank === null;
}

export function isPerformanceRanking(value: unknown): value is PerformanceRankingResult {
  if (!rankingRecord(value) || !Array.isArray(value.funds)) return false;
  return value.funds.every(fund => rankingRecord(fund) && typeof fund.scheme_id === "string"
    && typeof fund.scheme_name === "string" && rankingRecord(fund.periods)
    && PERFORMANCE_PERIODS.every(period => validPeriodRank((fund.periods as Record<string, unknown>)[period])));
}

export function performanceComparisonCounts(data: PerformanceRankingResult): { top: number; total: number } {
  let top = 0, total = 0;
  for (const fund of data.funds) {
    for (const key of PERFORMANCE_PERIODS) {
      const period = fund.periods?.[key];
      if (period?.status !== "ranked" || period.rank === null || period.total < 1) continue;
      total += 1;
      if (period.rank * 4 <= period.total) top += 1;
    }
  }
  return { top, total };
}

export function performanceRankPosition(rank: number, total: number): number {
  return Math.max(3, Math.min(97, total > 1 ? (rank - 1) / (total - 1) * 100 : 0));
}

export function performanceRankColor(rank: number, total: number): string {
  return rank * 4 <= total ? "var(--pos)" : rank * 2 <= total ? "var(--c2)"
    : rank * 4 <= total * 3 ? "var(--warn-text)" : "var(--neg)";
}

export function performanceRankBanner(data: PerformanceRankingResult): string {
  const { top, total } = performanceComparisonCounts(data);
  return `Your funds rank in the top quarter in ${top} of ${total} comparisons. A rank such as 4/38 means this fund is 4th best out of 38 funds in the same category. Lower is better. The dot shows where the fund sits, from best (left) to last (right); the green stretch is the top quarter.`;
}


export const CATEGORY_PERIODS = ["1y", "3y", "5y"] as const;
export type CategoryPeriod = typeof CATEGORY_PERIODS[number];
export type CategoryFilter = "all" | "behind" | "ahead";
export const CATEGORY_PERIOD_LABELS: Record<CategoryPeriod, string> = { "1y": "1 year", "3y": "3 years", "5y": "5 years" };

function categoryComparisons(fund: CategoryRankRow) {
  if (fund.category_unavailable || fund.insufficient_history) return [];
  return CATEGORY_PERIODS.flatMap(period => {
    const row = fund.periods?.[period];
    if (row?.fund_return == null || row.category_avg == null) return [];
    const value = normalizeFraction(row.fund_return), average = normalizeFraction(row.category_avg);
    if (![value, average].every(text => /^[+-]?\d+(?:\.\d+)?$/.test(text))) return [];
    return [{ period, value, average, gap: diffDecimalStrings(value, average) }];
  });
}

export function categoryGapText(value: string, average: string): string {
  const gap = diffDecimalStrings(normalizeFraction(value), normalizeFraction(average));
  // Shift the point exactly and round once, so 0.149 points shows +0.1 (not 0.15 then 0.2).
  const negative = gap.startsWith("-");
  const [whole, fraction = ""] = (negative ? gap.slice(1) : gap).split(".");
  const padded = fraction.padEnd(2, "0");
  const shifted = `${whole}${padded.slice(0, 2)}`.replace(/^0+(?=\d)/, "") + (padded.length > 2 ? `.${padded.slice(2)}` : "");
  return formatPercent(`${negative ? "-" : ""}${shifted}`, { digits: 1, signed: true }).replace(/%$/, " pts");
}

export function filterCategoryFunds(data: CategoryRankingSummary, filter: CategoryFilter): CategoryRankRow[] {
  if (filter === "all") return data.funds;
  return data.funds.filter(fund => {
    const comparisons = categoryComparisons(fund);
    return filter === "behind" ? comparisons.some(row => compareDecimalStrings(row.gap, "0") < 0)
      : comparisons.length > 0 && comparisons.every(row => compareDecimalStrings(row.gap, "0") > 0);
  });
}

export function categoryComparisonSummary(data: CategoryRankingSummary): string {
  const comparisons = data.funds.flatMap(fund => categoryComparisons(fund).map(row => ({ ...row, name: fund.scheme_name })));
  const ahead = comparisons.filter(row => compareDecimalStrings(row.gap, "0") > 0).length;
  // Strictly greater beats the average; equal returns are neither ahead nor behind.
  // The largest shortfall wins; ties keep payload order, then 1Y/3Y/5Y order.
  const worst = comparisons.reduce<typeof comparisons[number] | null>((chosen, row) =>
    compareDecimalStrings(row.gap, "0") < 0 && (!chosen || compareDecimalStrings(row.gap, chosen.gap) < 0) ? row : chosen, null);
  const watch = worst ? `${worst.name} over ${CATEGORY_PERIOD_LABELS[worst.period]} (${categoryGapText(worst.value, worst.average)}).`
    : comparisons.length ? "none is behind its category average." : "we do not have enough return data yet.";
  return `Your funds beat their category average in ${ahead} of ${comparisons.length} comparisons. Each number is your fund's return minus the average return of funds in the same category, in percentage points. Plus is better. The one to watch: ${watch}`;
}

export function categoryComparisonScale(data: CategoryRankingSummary): [number, number] {
  let low = "0", high = "0.35";
  for (const fund of data.funds) for (const row of categoryComparisons(fund)) for (const value of [row.value, row.average]) {
    if (compareDecimalStrings(value, low) < 0) low = value;
    if (compareDecimalStrings(value, high) > 0) high = value;
  }
  // Number conversion is for CSS geometry only; gaps and classifications above stay exact strings.
  return [Number(low), Number(high)];
}

export function categoryLinePositions(value: string, average: string, scale: [number, number]) {
  const position = (text: string) => 3 + (Number(normalizeFraction(text)) - scale[0]) / (scale[1] - scale[0]) * 94;
  return { fund: position(value), average: position(average) };
}
