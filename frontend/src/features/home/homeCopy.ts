import { formatDayMonth, formatPercent, formatRupees } from "./homeFormat";
import type {
  HomePeriod,
  HomeScopeKind,
  MoversResponse,
  SummaryResponse,
  WealthSeriesResponse,
} from "./types";

function unsigned(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/^[+-]/, "");
}

export function periodLabel(period: HomePeriod): string {
  switch (period) {
    case "1D":
      return "today";
    case "1W":
      return "this week";
    case "1M":
      return "this month";
    case "1Y":
      return "this year";
    case "custom":
      return "in range";
  }
}

export function wealthCaption(scope: HomeScopeKind, memberName?: string | null): string {
  if (scope === "aggregate") {
    return "Your family's wealth";
  }
  const trimmed = memberName?.trim();
  if (!trimmed) {
    return "Your wealth";
  }
  return `${trimmed}'s wealth`;
}

export function periodNote(period: HomePeriod, data: WealthSeriesResponse | null): string {
  if (period === "1D" && data && data.points && data.points.length >= 2) {
    const first = data.points[0];
    const last = data.points[data.points.length - 1];
    return `1D compares two NAV days (${formatDayMonth(first.date)} and ${formatDayMonth(last.date)}). Mutual fund NAVs publish once a day, so there is no intraday line.`;
  }
  return "";
}

export function buildStatusSentence(
  summary: SummaryResponse,
  _movers?: MoversResponse | null,
): string | null {
  if (!summary.has_holdings) {
    return null;
  }
  if (summary.direction === "flat") {
    return `${summary.scope_label} is little changed ${summary.since_label}.`;
  }

  const amount = formatRupees(unsigned(summary.change_amount));
  const pctPart =
    summary.change_pct != null
      ? ` (${formatPercent(unsigned(summary.change_pct), { digits: 2 })})`
      : "";
  const driverPart =
    summary.top_contributor != null
      ? ` ${summary.top_contributor} drove most of the ${summary.direction === "up" ? "gains" : "losses"}.`
      : "";

  return `${summary.scope_label} is ${summary.direction} ${amount}${pctPart} ${summary.since_label}.${driverPart}`;
}

export function buildGlanceSentence(
  summary: SummaryResponse,
  movers?: MoversResponse | null,
): string | null {
  if (!summary.has_holdings) {
    return null;
  }
  if (summary.direction === "flat") {
    return `Your portfolio is little changed ${summary.since_label}.`;
  }

  if (summary.direction === "up") {
    const topGainer = movers?.gains?.[0]?.label;
    const clause = topGainer
      ? `, with ${topGainer.toLowerCase()} contributing the most.`
      : ".";
    return `Your portfolio gained ${formatRupees(unsigned(summary.change_amount))} ${summary.since_label}${clause}`;
  }

  const topLoser = movers?.losses?.[0]?.label;
  const clause = topLoser
    ? `, with ${topLoser.toLowerCase()} weighing on it the most.`
    : ".";
  return `Your portfolio lost ${formatRupees(unsigned(summary.change_amount))} ${summary.since_label}${clause}`;
}
