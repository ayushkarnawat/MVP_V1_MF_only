/** Deterministic plain-English rules for the Fund Score card (design doc
 * §6): which of the three factors are Strengths vs. Watch-outs, what verdict
 * word and sentence each gets, the card's one-line "why" summary, and the
 * closing "what this means for you" sentence. Pure functions, no React
 * dependency, so the rules are testable without rendering anything. */

export type FactorKey = "return" | "risk" | "consistency";
export type Bucket = "strength" | "watchout";
export type DotColor = "green" | "orange" | "red";
export type Verdict = "excellent" | "strong" | "weak" | "poor";

export const FACTOR_KEYS: FactorKey[] = ["return", "risk", "consistency"];

export const FACTOR_LABELS: Record<FactorKey, string> = {
  return: "Return",
  risk: "Downside protection",
  consistency: "Consistency of outperformance",
};

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

const WHY_PHRASES: Record<FactorKey, { strong: string; weak: string }> = {
  return: { strong: "strong long-term performance", weak: "weaker long-term performance" },
  risk: { strong: "strong downside protection", weak: "weaker downside protection" },
  consistency: {
    strong: "consistent outperformance of peers",
    weak: "inconsistent performance versus peers",
  },
};

const WHAT_THIS_MEANS_FOR_YOU: Record<number, string> = {
  1: "A strong choice within its category based on historical data — suitable if you're comfortable with typical risk for this fund type.",
  2: "A solid, dependable option within its category based on historical data.",
  3: "An average performer within its category — worth comparing against a few alternatives before deciding.",
  4: "A below-average performer within its category — consider reviewing whether it still fits your goals.",
  5: "One of the weaker performers within its category based on historical data — worth a closer look before adding more.",
};

/** Backend tier convention is 5=best; display convention is 1=best.
 * Display-only — never change what the backend stores or returns. */
export function displayTierFromBackendTier(tier: number): number {
  return 6 - tier;
}

export function verdictWord(percentile: number): Verdict {
  if (percentile >= 80) return "excellent";
  if (percentile >= 50) return "strong";
  if (percentile >= 20) return "weak";
  return "poor";
}

export function bucketAndColor(percentile: number): { bucket: Bucket; dotColor: DotColor } {
  if (percentile >= 50) return { bucket: "strength", dotColor: "green" };
  if (percentile >= 20) return { bucket: "watchout", dotColor: "orange" };
  return { bucket: "watchout", dotColor: "red" };
}

export interface FactorAssessment {
  bucket: Bucket;
  dotColor: DotColor;
  verdict: Verdict;
  sentence: string;
}

export function assessFactor(factor: FactorKey, percentile: number): FactorAssessment {
  const verdict = verdictWord(percentile);
  const { bucket, dotColor } = bucketAndColor(percentile);
  return { bucket, dotColor, verdict, sentence: FACTOR_SENTENCES[factor][verdict] };
}

export function buildWhySentence(params: {
  returnPct: number;
  riskPct: number;
  consistencyPct: number;
  displayTier: number;
  costAdjustment: number | null;
}): string {
  const { returnPct, riskPct, consistencyPct, displayTier, costAdjustment } = params;
  const values: Record<FactorKey, number> = {
    return: returnPct,
    risk: riskPct,
    consistency: consistencyPct,
  };
  const strongest = FACTOR_KEYS.reduce((a, b) => (values[b] > values[a] ? b : a));
  const weakest = FACTOR_KEYS.reduce((a, b) => (values[b] < values[a] ? b : a));
  const costBonus = costAdjustment !== null && Math.abs(costAdjustment - 0.25) < 0.001;
  const costPenalty = costAdjustment !== null && Math.abs(costAdjustment + 0.25) < 0.001;

  if (displayTier <= 2) {
    return `Scores well mainly due to ${WHY_PHRASES[strongest].strong}${costBonus ? " and low cost" : ""}.`;
  }
  if (displayTier >= 4) {
    return `Held back mainly by ${WHY_PHRASES[weakest].weak}${costPenalty ? " and higher-than-average cost" : ""}.`;
  }
  return `Performs roughly in line with similar funds, with strength in ${WHY_PHRASES[strongest].strong} balanced by weaker ${WHY_PHRASES[weakest].weak}.`;
}

export function whatThisMeansForYou(displayTier: number): string {
  return WHAT_THIS_MEANS_FOR_YOU[displayTier] ?? WHAT_THIS_MEANS_FOR_YOU[3];
}
