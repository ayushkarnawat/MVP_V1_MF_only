import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FundRankingSection } from "./FundRankingSection";

const data = { funds: [{ scheme_id: "A", scheme_name: "HDFC Flexi Cap Fund", sebi_category: "Equity Scheme - Flexi Cap Fund", plan_type: "direct",
  periods: { "1Y": { rank: 4, total: 38, status: "ranked" }, "3Y": { rank: 2, total: 30, status: "ranked" },
    "5Y": { rank: null, total: 20, status: "not_enough_history" } }, disclaimer_key: null, ranked_as: null }] };

describe("legacy Performance Ranking adapter", () => {
  it("renders the new period ranks without requiring the Mutual Funds page shell", () => {
    render(<FundRankingSection data={data} />);
    expect(screen.getByRole("heading", { name: "Performance Ranking" })).toBeInTheDocument();
    expect(screen.getByTestId("rank-number-A-1Y")).toHaveTextContent("4");
    expect(screen.getByTestId("rank-cell-A-5Y")).toHaveTextContent("Not enough history for 5 years.");
  });
  it("shows an updating state for an old composite payload", () => {
    render(<FundRankingSection data={{ funds: [{ scheme_id: "A", scheme_name: "Old fund", composite_score: "90", components: {} }] }} />);
    expect(screen.getByRole("status", { name: "Updating Performance Ranking" })).toHaveTextContent("Performance rankings are updating.");
    expect(screen.queryByText("Old fund")).not.toBeInTheDocument();
  });
  it("keeps loading and absent-data states", () => {
    const view = render(<FundRankingSection data={null} isLoading />);
    expect(screen.getByLabelText("Loading Performance Ranking")).toBeInTheDocument();
    view.rerender(<FundRankingSection data={null} />);
    expect(screen.getByText("No performance ranking data available.")).toBeInTheDocument();
  });
});
