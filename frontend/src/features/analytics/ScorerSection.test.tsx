import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScorerSection } from "./ScorerSection";
import type { PortfolioScoreSummary } from "./types";

const sampleScoreSummary: PortfolioScoreSummary = {
  funds: [
    {
      scheme_id: "scheme-101",
      scheme_name: "Parag Parikh Flexi Cap Fund",
      category_unavailable: false,
      insufficient_history: false,
      thin_category: false,
      risk_adjusted_tier: 5,
      cost_adjustment: "0.25",
      final_score: "82.0",
      return_percentile: "88.0",
      risk_percentile: "82.0",
      consistency_hit_rate: "80.0",
    },
    {
      scheme_id: "scheme-102",
      scheme_name: "New Unrated Scheme",
      category_unavailable: false,
      insufficient_history: true,
      thin_category: false,
      risk_adjusted_tier: null,
      cost_adjustment: null,
      final_score: null,
      return_percentile: null,
      risk_percentile: null,
      consistency_hit_rate: null,
    },
  ],
  weighted_score: "85.5",
  covered_value: "100000",
  total_value: "100000",
  uncovered_schemes: ["Excluded Fund X"],
};

describe("ScorerSection", () => {
  it("renders portfolio weighted score and fund rows with tier badges and breakdown lines", () => {
    const handleSelect = vi.fn();
    render(<ScorerSection scoreSummary={sampleScoreSummary} onSelectFundScore={handleSelect} />);

    expect(screen.getByText("Fund Quality Scorer & Composite Ratings")).toBeInTheDocument();
    expect(screen.getByText("85.5")).toBeInTheDocument();
    expect(screen.getByText("82.0")).toBeInTheDocument();
    expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
    expect(screen.getByText("T5")).toBeInTheDocument();
    expect(screen.getByText("Insufficient History")).toBeInTheDocument();
    expect(screen.getByText("Excluded Fund X")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Parag Parikh Flexi Cap Fund"));
    expect(handleSelect).toHaveBeenCalledWith("scheme-101", "Parag Parikh Flexi Cap Fund");
  });

  it("handles null score summary gracefully", () => {
    render(<ScorerSection scoreSummary={null} />);
    expect(screen.getByText("Score Unavailable / Insufficient History")).toBeInTheDocument();
    expect(screen.getByText("No fund score data available")).toBeInTheDocument();
  });
});
