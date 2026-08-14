import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MobileAnalyticsView } from "./MobileAnalyticsView";
import * as api from "@/features/analytics/api";

vi.mock("@/features/analytics/api");

const sampleAllocationSummary = {
  by_category: [{ label: "Flexi Cap", current_value: "50000", percentage: "100.0" }],
  by_amc: [{ label: "Parag Parikh Mutual Fund", current_value: "50000", percentage: "100.0" }],
  total_value: "50000",
};

const sampleTerSummary = {
  weighted_ter: "0.75",
  covered_value: "50000",
  total_value: "50000",
  reference_period: "2026-07-31",
  uncovered_schemes: [],
};

const sampleDirectRegularComparison = {
  direct: {
    weighted_ter: "0.75",
    covered_value: "50000",
    total_value: "50000",
    reference_period: "2026-07-31",
    uncovered_schemes: [],
  },
  regular: {
    weighted_ter: null,
    covered_value: "0",
    total_value: "0",
    reference_period: null,
    uncovered_schemes: [],
  },
};

const sampleCategoryRanking = {
  funds: [
    {
      scheme_id: "scheme-1",
      scheme_name: "Parag Parikh Flexi Cap Fund - Direct Plan",
      sebi_category: "Flexi Cap Fund",
      category_unavailable: false,
      insufficient_history: false,
      scheme_return: "18.45",
      category_rank: 3,
      category_size: 42,
      percentile: "92.8",
      category_avg_return: "14.20",
      thin_category: false,
    },
  ],
};

describe("MobileAnalyticsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and renders mobile analytics dashboard", async () => {
    vi.mocked(api.getAggregateAllocation).mockResolvedValue({
      members: [],
      allocation: sampleAllocationSummary,
    });
    vi.mocked(api.getAggregateTer).mockResolvedValue({ members: [], ter: sampleTerSummary });
    vi.mocked(api.getAggregateDirectRegularTer).mockResolvedValue({
      members: [],
      ter: sampleDirectRegularComparison,
    });
    vi.mocked(api.getAggregateCategoryRanking).mockResolvedValue({
      members: [],
      ranking: sampleCategoryRanking,
    });

    render(<MobileAnalyticsView />);

    expect(screen.getByText("Mobile Analytics")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Portfolio Allocation")).toBeInTheDocument();
      expect(screen.getByText("Total Expense Ratio (TER) & Cost Analysis")).toBeInTheDocument();
      expect(screen.getByText("SEBI Category Ranking & Peer Comparison")).toBeInTheDocument();
    });
  });

  it("handles mobile error state when API fails", async () => {
    vi.mocked(api.getAggregateAllocation).mockRejectedValue(new Error("Mobile Fetch Error"));

    render(<MobileAnalyticsView />);

    await waitFor(() => {
      expect(screen.getByText("Analytics Load Error")).toBeInTheDocument();
      expect(screen.getByText("Mobile Fetch Error")).toBeInTheDocument();
    });
  });
});
