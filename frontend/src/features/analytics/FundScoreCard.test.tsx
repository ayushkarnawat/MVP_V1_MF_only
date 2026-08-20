import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FundScoreCard } from "./FundScoreCard";
import type { FundScoreRow } from "./types";

const baseRow: FundScoreRow = {
  scheme_id: "s-1",
  scheme_name: "Test Flexi Cap Fund",
  category_unavailable: false,
  insufficient_history: false,
  thin_category: false,
  risk_adjusted_tier: 4,
  cost_adjustment: "0.25",
  final_score: "72.5",
  return_percentile: "70",
  risk_percentile: "65",
  consistency_hit_rate: "80",
};

describe("FundScoreCard", () => {
  it("renders the overall score and all three ingredient cards", () => {
    render(<FundScoreCard data={baseRow} />);
    expect(screen.getByText("72.5")).toBeInTheDocument();
    expect(screen.getByText("Return")).toBeInTheDocument();
    expect(screen.getByText("Risk")).toBeInTheDocument();
    expect(screen.getByText("Consistency")).toBeInTheDocument();
  });

  it("shows the category-unavailable notice instead of ingredient cards", () => {
    render(<FundScoreCard data={{ ...baseRow, category_unavailable: true }} />);
    expect(screen.getByText("Category Data Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Return")).not.toBeInTheDocument();
  });
});
