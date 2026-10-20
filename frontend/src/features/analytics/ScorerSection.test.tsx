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
      scheme_return: "0.22",
      category_avg_return: "0.15",
      downside_deviation: "0.025",
      category_avg_downside_deviation: "0.03",
      consistency_hits: 12,
      consistency_total_windows: 15,
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
      scheme_return: null,
      category_avg_return: null,
      downside_deviation: null,
      category_avg_downside_deviation: null,
      consistency_hits: null,
      consistency_total_windows: null,
    },
  ],
  weighted_score: "85.5",
  covered_value: "100000",
  total_value: "100000",
  uncovered_schemes: ["Excluded Fund X"],
};

describe("ScorerSection", () => {
  it("offers the score explainer in the section header", () => {
    render(<ScorerSection scoreSummary={sampleScoreSummary} />);
    fireEvent.click(screen.getByRole("button", { name: "How is this calculated?" }));
    expect(screen.getByText("How the Unifolio Fund Score works")).toBeInTheDocument();
  });

  it("hides the score explainer in printMode", () => {
    render(<ScorerSection scoreSummary={sampleScoreSummary} printMode />);
    expect(screen.queryByRole("button", { name: "How is this calculated?" })).toBeNull();
    expect(screen.queryByText("How the Unifolio Fund Score works")).toBeNull();
  });

  it.each([
    ["70", "High Quality Portfolio", "var(--color-positive)"],
    ["50", "Moderate Quality Portfolio", "var(--color-text-secondary)"],
    ["49.9", "Needs Review", "var(--color-warning)"],
  ])("colours the portfolio verdict for score %s", (weighted_score, label, color) => {
    render(<ScorerSection scoreSummary={{ ...sampleScoreSummary, weighted_score }} />);
    expect(screen.getByText(label)).toHaveStyle({ color });
  });

  it.each([[1, 5], [5, 1]])("colours both tier markers for backend tier %s", (backendTier, displayTier) => {
    render(<ScorerSection scoreSummary={{ ...sampleScoreSummary, funds: [{ ...sampleScoreSummary.funds[0], risk_adjusted_tier: backendTier }] }} />);
    for (const text of [`T${displayTier}`, `Tier ${displayTier}`]) {
      expect(screen.getByText(text).getAttribute("style")).toContain(`--tier-${displayTier}-bg`);
      expect(screen.getByText(text).getAttribute("style")).toContain(`--tier-${displayTier}-fg`);
    }
  });

  it("renders portfolio weighted score and fund rows with tier badges and breakdown lines", () => {
    const handleSelect = vi.fn();
    render(<ScorerSection scoreSummary={sampleScoreSummary} onSelectFundScore={handleSelect} />);

    expect(screen.getByText("Fund Quality Scorer & Composite Ratings")).toBeInTheDocument();
    expect(screen.getByText("Tap for score breakdown")).toBeInTheDocument();
    expect(screen.queryByText(/S20/)).toBeNull();
    expect(screen.getByText("85.5")).toBeInTheDocument();
    expect(screen.getByText("82.0")).toBeInTheDocument();
    expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
    expect(screen.getByText("T1")).toBeInTheDocument();
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
