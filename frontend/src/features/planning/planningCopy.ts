import { compareDecimalStrings } from "@/lib/decimal";
import { formatPercent, formatRupees } from "@/lib/format";

export const TITLE = "Planning";
export const SUBTITLE = "Explore different financial scenarios to plan better and make more informed decisions.";
export const PLAN_FUTURE_TITLE = "Plan your future";
export const PLAN_FUTURE_LINE = "Set goals, adjust assumptions and see how your wealth can grow over time.";
export const EXPLORE_TITLE = "Explore market scenarios";
export const EXPLORE_LINE = "See how your portfolio might perform in historical and hypothetical market events.";
export const COMING_SOON_TITLE = "Coming soon";
export const COMING_SOON_LINE = "Goal planning is on its way: retirement, your child's education, a home purchase and wealth goals.";
export const BACK_LABEL = "Back to Planning";
export const MARKET_SUBTITLE = "Here's what this portfolio would have captured during these periods, based on actual historical fund performance.";
export const COMPLIANCE_COPY = "Here's what this portfolio would have captured during this period, based on actual historical fund performance — not a prediction of future returns.";
export const ONGOING_SUFFIX = " Numbers will update as the event continues.";
export const NIFTY_CAVEAT = "Compared with an equity index. Debt and gold funds in your portfolio do not move like it.";
export const PRE_2006_NOTE = "Fund prices were not reported before 2006, so only the index is shown for this event.";
export const NO_HOLDINGS_TITLE = "You have no funds to replay yet.";
export const NO_HOLDINGS_LINE = "Import a statement to see how your funds would have done.";
export const IMPORT_LABEL = "Import a statement";
export const LIST_ERROR = "Scenarios aren't available right now.";
export const TRY_AGAIN = "Try again";
export const NO_SCENARIOS = "No scenarios are available yet.";
export const NO_DATA = "Not enough historical data to estimate";
export const NO_CHANGE = "No change to show";
export const MIRA_TITLE = "Insights from Mira";
export const MIRA_LINE = "Coming soon. Mira will point out what mattered most in each event.";
export const MIRA_BUTTON = "Learn more";
export const FREEZE_HEADLINE = "This wasn't a price fall — a ~20-month liquidity freeze";
export const FREEZE_BIG = "Frozen, not %";
export const NONE_FROZEN = "None of your funds were frozen in this event";
export const FAMILY_COMBINED = "Family combined";
export const FROZEN_TEXT = "Redemptions frozen";
export const NO_MEMBER_HOLDINGS = "No holdings for this member.";

export function outperformText(gap: string): string {
  const isBehind = compareDecimalStrings(gap, "0") < 0;
  const word = isBehind ? "Behind" : "Outperformed";
  const unsigned = gap.replace(/^[+-]/, "");
  const magnitude = formatPercent(unsigned, { digits: 1 }).replace("%", "");
  return `${word} by ${magnitude} percentage points`;
}

export function proxyLabel(basis: string | null): string {
  if (basis && basis.startsWith("sebi_category_average:")) {
    return "Category average estimate";
  }
  return "Asset-class average estimate";
}

export function noDataFunds(count: number): string {
  return `${count} ${count === 1 ? "fund has" : "funds have"} no data for this period`;
}

export function coversCaption(covered: string | null, total: string | null): string | null {
  if (covered === null || total === null) return null;
  return `Covers ${formatRupees(covered)} of ${formatRupees(total)}. Funds with no data are left out.`;
}
