import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FundScoreCard } from "./FundScoreCard";
import type { FundScoreRow } from "./types";

const baseRow: FundScoreRow = {
  scheme_id: "s-1",
  scheme_name: "Test Flexi Cap Fund",
  category_unavailable: false,
  insufficient_history: false,
  thin_category: false,
  risk_adjusted_tier: 4, // displayTier = 2
  cost_adjustment: "0.25",
  final_score: "78.4", // displayScore 7.8
  return_percentile: "70", // strong -> Strength, green
  risk_percentile: "65", // strong -> Strength, green
  consistency_hit_rate: "15", // poor -> Watch-out, red
  scheme_return: "0.184",
  category_avg_return: "0.15",
  downside_deviation: "0.03",
  category_avg_downside_deviation: "0.035",
  consistency_hits: 2,
  consistency_total_windows: 13,
};

describe("FundScoreCard", () => {
  it("renders the score out of 10, flipped tier, and the why sentence", () => {
    render(<FundScoreCard data={baseRow} />);
    expect(screen.getByText("7.8")).toBeInTheDocument();
    expect(screen.getByText("/ 10")).toBeInTheDocument();
    expect(screen.getByText("Tier 2 of 5")).toBeInTheDocument();
    expect(
      screen.getByText("Scores well mainly due to strong long-term performance and low cost.")
    ).toBeInTheDocument();
  });

  it("groups factors into Strengths and Watch-outs with plain labels, no raw percentiles or weight badges", () => {
    render(<FundScoreCard data={baseRow} />);
    expect(screen.getByText("What's driving your score")).toBeInTheDocument();
    expect(screen.getByText("Strengths")).toBeInTheDocument();
    expect(screen.getByText("Watch-outs")).toBeInTheDocument();
    expect(screen.getByText("Return")).toBeInTheDocument();
    expect(screen.getByText("Downside protection")).toBeInTheDocument();
    expect(screen.getByText("Consistency of outperformance")).toBeInTheDocument();
    expect(screen.queryByText("70%")).not.toBeInTheDocument();
    expect(screen.queryByText("45% Wt")).not.toBeInTheDocument();
    expect(screen.queryByText("The 3 Core Methodology Ingredients")).not.toBeInTheDocument();
  });

  it("renders the what-this-means-for-you block", () => {
    render(<FundScoreCard data={baseRow} />);
    expect(screen.getByText("What this means for you")).toBeInTheDocument();
  });

  it("reveals evidence numbers only after expanding See the evidence", () => {
    render(<FundScoreCard data={baseRow} />);
    expect(screen.queryByText("18.40%")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("See the evidence"));
    expect(screen.getByText("18.40%")).toBeInTheDocument();
    expect(screen.getByText("2 of 13")).toBeInTheDocument();
  });

  it("reveals methodology only after expanding How we calculate this score", () => {
    render(<FundScoreCard data={baseRow} />);
    expect(screen.queryByText(/45% of score/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("How we calculate this score"));
    expect(screen.getByText(/45% of score/)).toBeInTheDocument();
  });

  it("keeps the Transparent Methodology Commitment box as the last element", () => {
    render(<FundScoreCard data={baseRow} />);
    expect(screen.getByText("Transparent Methodology Commitment")).toBeInTheDocument();
  });

  it("shows the category-unavailable notice instead of the score", () => {
    render(<FundScoreCard data={{ ...baseRow, category_unavailable: true }} />);
    expect(screen.getByText("Category Data Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("What's driving your score")).not.toBeInTheDocument();
  });

  it("shows the insufficient-history notice instead of the score", () => {
    render(<FundScoreCard data={{ ...baseRow, insufficient_history: true }} />);
    expect(screen.getByText("Insufficient Track Record")).toBeInTheDocument();
  });
});
