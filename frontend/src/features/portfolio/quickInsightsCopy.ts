import { formatPercent, formatRupees } from "@/lib/format";
import type { PortfolioInsights, PortfolioInsightsResponse } from "./types";

export type InsightId = "largest-holding" | "spread" | "plan-split" | "largest-amc" | "sips";

export interface InsightPart {
  text: string;
  bold: boolean;
}

export interface InsightLine {
  id: InsightId;
  parts: InsightPart[];
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
        { text: insights.largest_holding.fund_name, bold: true },
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
    const parts: InsightPart[] = [
      {
        text: `${formatPercent(insights.plan_split.direct.pct, { digits: 0 })} Direct`,
        bold: true,
      },
      {
        text: `, ${formatPercent(insights.plan_split.regular.pct, { digits: 0 })} Regular`,
        bold: false,
      },
    ];
    const u = formatPercent(insights.plan_split.unclassified.pct, { digits: 0 });
    if (u !== "0%") {
      parts.push({
        text: `, ${u} Unclassified`,
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
