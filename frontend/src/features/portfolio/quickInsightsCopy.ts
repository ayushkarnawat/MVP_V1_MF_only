import { formatPercent, formatRupees } from "@/lib/format";
import type { PortfolioInsights, PortfolioInsightsResponse } from "./types";

export type InsightId = "largest-holding" | "spread" | "plan-split" | "largest-amc" | "sips";

export interface InsightPart {
  text: string;
  bold: boolean;
  /** Set only on the fund name of the largest-holding line: that part opens the fund's page. */
  schemeId?: string;
}

export interface InsightLine {
  id: InsightId;
  parts: InsightPart[];
}

const PCT_SCALE = 10_000n; // ten-thousandths of a percent: the backend sends four decimals

function toScaled(pct: string): bigint | null {
  const match = pct.trim().match(/^(\d+)(?:\.(\d*))?$/);
  if (!match) return null;
  return BigInt(match[1]) * PCT_SCALE + BigInt((match[2] ?? "").padEnd(4, "0").slice(0, 4));
}

/**
 * Whole-percent shares that add up to 100. Rounding each share on its own can total 99 or 101 (62.5 + 37.5
 * gives 63 + 38), so the largest remainders take the missing points. Only applied when the raw shares really
 * do total 100 (to within 0.01); otherwise each share is rounded half up on its own, as before.
 */
export function wholePercentShares(pcts: string[]): number[] {
  const scaled = pcts.map(toScaled);
  const fallback = () => pcts.map(p => Number(formatPercent(p, { digits: 0 }).replace("%", "")));
  if (scaled.some(v => v === null)) return fallback();
  const values = scaled as bigint[];
  const total = values.reduce((a, b) => a + b, 0n);
  const off = total > 100n * PCT_SCALE ? total - 100n * PCT_SCALE : 100n * PCT_SCALE - total;
  if (off > 100n) return fallback();
  const floors = values.map(v => v / PCT_SCALE);
  let missing = 100 - floors.reduce((a, b) => a + Number(b), 0);
  if (missing < 0 || missing > values.length) return fallback();
  const order = values
    .map((v, index) => ({ index, remainder: v % PCT_SCALE }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  const shares = floors.map(Number);
  for (const { index } of order) {
    if (missing === 0) break;
    shares[index] += 1;
    missing -= 1;
  }
  return shares;
}

export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function insightLines(insights: PortfolioInsights): InsightLine[] {
  const lines: InsightLine[] = [];

  if (insights.largest_holding !== null) {
    lines.push({
      id: "largest-holding",
      parts: [
        { text: "Your largest holding is ", bold: false },
        { text: insights.largest_holding.fund_name, bold: true, schemeId: insights.largest_holding.scheme_id },
        {
          text: ` — ${formatPercent(insights.largest_holding.pct_of_portfolio, { digits: 1 })} of your total portfolio`,
          bold: false,
        },
      ],
    });
  }

  if (insights.spread.fund_count > 0) {
    lines.push({
      id: "spread",
      parts: [
        { text: "Spread across ", bold: false },
        { text: countLabel(insights.spread.amc_count, "AMC", "AMCs"), bold: true },
        { text: " and ", bold: false },
        { text: countLabel(insights.spread.fund_count, "fund", "funds"), bold: true },
      ],
    });
  }

  if (insights.plan_split !== null) {
    const [directShare, regularShare, unclassifiedShare] = wholePercentShares([
      insights.plan_split.direct.pct,
      insights.plan_split.regular.pct,
      insights.plan_split.unclassified.pct,
    ]);
    const parts: InsightPart[] = [
      {
        text: `${directShare}% Direct`,
        bold: true,
      },
      {
        text: `, ${regularShare}% Regular`,
        bold: false,
      },
    ];
    if (unclassifiedShare !== 0) {
      parts.push({
        text: `, ${unclassifiedShare}% Unclassified`,
        bold: false,
      });
    }
    lines.push({
      id: "plan-split",
      parts,
    });
  }

  if (insights.largest_amc !== null) {
    lines.push({
      id: "largest-amc",
      parts: [
        { text: "Your largest single AMC exposure is ", bold: false },
        {
          text: `${insights.largest_amc.amc_name} at ${formatPercent(insights.largest_amc.pct_of_portfolio, { digits: 0 })}`,
          bold: true,
        },
      ],
    });
  }

  if (insights.sips.active_count > 0) {
    lines.push({
      id: "sips",
      parts: [
        { text: formatRupees(insights.sips.monthly_total), bold: true },
        { text: " in active SIPs scheduled this month", bold: false },
      ],
    });
  }

  return lines;
}

export function insightText(line: InsightLine): string {
  return line.parts.map((part) => part.text).join("");
}

export function hasInsights(data: PortfolioInsightsResponse): boolean {
  return !data.empty && insightLines(data.insights).length > 0;
}
