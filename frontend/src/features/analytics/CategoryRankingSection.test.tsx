import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryRankingSection } from "./CategoryRankingSection";
import type { CategoryRankRow } from "./types";

const periodFund: CategoryRankRow = {
  scheme_id: "period-fund", scheme_name: "Period Fund", sebi_category: "Flexi Cap",
  category_unavailable: false, insufficient_history: false, thin_category: false,
  category_avg_return: "0.08", plan_type: "direct",
  periods: { "1y": { fund_return: "0.124", category_avg: "0.10", peers: 10 },
    "3y": { fund_return: "0.12", category_avg: "0.08", peers: 10 },
    "5y": { fund_return: null, category_avg: "0.09", peers: 8 } },
};

describe("legacy category comparison", () => {
  it("renders the current payload without retired fields and ignores old rank fields", () => {
    const { container, rerender } = render(<CategoryRankingSection ranking={{ funds: [periodFund] }} />);
    expect(screen.getByRole("table", { name: "Returns by period" })).toBeInTheDocument();
    expect(screen.getByText("+12.40%")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|undefined|Category Rank:|percentile|Top \d/i);
    const before = container.textContent;
    rerender(<CategoryRankingSection ranking={{ funds: [{ ...periodFund, percentile: "99", category_rank: 1, category_size: 900, scheme_return: "999" }] }} />);
    expect(container.textContent).toBe(before);
  });
  it.each([["direct", "Direct"], ["regular", "Regular"]])("keeps the %s plan label", (plan_type, label) => {
    render(<CategoryRankingSection ranking={{ funds: [{ ...periodFund, plan_type }] }} />);
    expect(screen.getByText(`Compared with ${label} plan peers`)).toBeInTheDocument();
  });
  it("renders an old payload without periods as updating", () => {
    render(<CategoryRankingSection ranking={{ funds: [{ ...periodFund, periods: undefined, scheme_return: "999", percentile: "99", category_rank: 1 }] }} />);
    expect(screen.getByText("Return comparisons are updating.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/999|percentile|Category Rank:/)).not.toBeInTheDocument();
  });
  it("keeps exact negative and exponent-form period figures", () => {
    render(<CategoryRankingSection ranking={{ funds: [{ ...periodFund, periods: { "1y": { fund_return: "0E-27", category_avg: "1E-3", peers: 10 } } }] }} />);
    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.getByText("+0.10%")).toBeInTheDocument();
    expect(screen.getByText("-0.10%")).toBeInTheDocument();
  });
  it("keeps the history and unavailable notices", () => {
    render(<CategoryRankingSection ranking={{ funds: [{ ...periodFund, insufficient_history: true, periods: {} },
      { ...periodFund, scheme_id: "missing", scheme_name: "Missing", category_unavailable: true, periods: {} }] }} />);
    expect(screen.getByText("Needs at least 3 years of history")).toBeInTheDocument();
    expect(screen.getByText("Category data is not available for this fund.")).toBeInTheDocument();
  });
  it("renders loading and empty states", () => {
    const { rerender } = render(<CategoryRankingSection ranking={null} isLoading />);
    expect(screen.queryByText("No category comparison data available")).not.toBeInTheDocument();
    rerender(<CategoryRankingSection ranking={null} />);
    expect(screen.getByText("No category comparison data available")).toBeInTheDocument();
  });
});
