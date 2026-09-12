import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { FundScoreDetailModal } from "./FundScoreDetailModal";
import * as api from "./api";

vi.mock("./api");

const sampleScoreRow = {
  scheme_id: "scheme-101",
  scheme_name: "Parag Parikh Flexi Cap Fund",
  category_unavailable: false,
  insufficient_history: false,
  thin_category: false,
  risk_adjusted_tier: 5, // displayTier = 1
  cost_adjustment: "0.25",
  final_score: "85.0", // displayScore 8.5
  return_percentile: "88.0",
  risk_percentile: "82.0",
  consistency_hit_rate: "80.0",
  scheme_return: "0.22",
  category_avg_return: "0.15",
  downside_deviation: "0.025",
  category_avg_downside_deviation: "0.03",
  consistency_hits: 12,
  consistency_total_windows: 15,
};

describe("FundScoreDetailModal (S20)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders modal with initialData breakdown when open", () => {
    render(
      <FundScoreDetailModal
        isOpen={true}
        onClose={vi.fn()}
        schemeId="scheme-101"
        initialData={sampleScoreRow}
      />
    );

    expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
    expect(screen.getByText("How this fund compares to similar funds in its category.")).toBeInTheDocument();
    expect(screen.getByText("8.5")).toBeInTheDocument();
    expect(screen.getByText("Tier 1 of 5")).toBeInTheDocument();
    expect(
      screen.getByText("Scores well mainly due to strong long-term performance and low cost.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Watch-outs")).not.toBeInTheDocument();
    expect(screen.queryByText("88.0%")).not.toBeInTheDocument();
  });

  it("fetches fund score from API when initialData is not supplied", async () => {
    vi.mocked(api.getFundScore).mockResolvedValue(sampleScoreRow);

    render(
      <FundScoreDetailModal
        isOpen={true}
        onClose={vi.fn()}
        schemeId="scheme-101"
      />
    );

    await waitFor(() => {
      expect(api.getFundScore).toHaveBeenCalledWith("scheme-101");
      expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
    });
  });

  it("returns null when isOpen is false", () => {
    const { container } = render(
      <FundScoreDetailModal
        isOpen={false}
        onClose={vi.fn()}
        schemeId="scheme-101"
        initialData={sampleScoreRow}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
