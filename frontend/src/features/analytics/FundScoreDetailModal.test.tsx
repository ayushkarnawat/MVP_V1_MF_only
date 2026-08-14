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
  risk_adjusted_tier: 5,
  cost_adjustment: "0.25",
  final_score: "85.5",
  return_percentile: "88.0",
  risk_percentile: "82.0",
  consistency_hit_rate: "80.0",
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
    expect(screen.getByText("85.5")).toBeInTheDocument();
    expect(screen.getByText("Tier 5 of 5")).toBeInTheDocument();
    expect(screen.getByText("88.0%")).toBeInTheDocument();
    expect(screen.getByText("82.0%")).toBeInTheDocument();
    expect(screen.getByText("80.0%")).toBeInTheDocument();
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
