import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AnalyticsView } from "./AnalyticsView";
import * as api from "./api";

vi.mock("./api");

const sampleAllocationSummary = {
  by_category: [
    { label: "Flexi Cap", current_value: "100000", percentage: "60.0" },
    { label: "Large Cap", current_value: "66666.67", percentage: "40.0" },
  ],
  by_amc: [
    { label: "Parag Parikh Mutual Fund", current_value: "100000", percentage: "60.0" },
    { label: "HDFC Mutual Fund", current_value: "66666.67", percentage: "40.0" },
  ],
  total_value: "166666.67",
};

const sampleTerSummary = {
  weighted_ter: "0.85",
  covered_value: "166666.67",
  total_value: "166666.67",
  reference_period: "2026-07-31",
  uncovered_schemes: [],
};

const sampleDirectRegularComparison = {
  direct: {
    weighted_ter: "0.65",
    covered_value: "100000",
    total_value: "100000",
    reference_period: "2026-07-31",
    uncovered_schemes: [],
  },
  regular: {
    weighted_ter: "1.15",
    covered_value: "66666.67",
    total_value: "66666.67",
    reference_period: "2026-07-31",
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
    {
      scheme_id: "scheme-2",
      scheme_name: "Old Legacy Fund",
      sebi_category: null,
      category_unavailable: true,
      insufficient_history: false,
      scheme_return: null,
      category_rank: null,
      category_size: 0,
      percentile: null,
      category_avg_return: null,
      thin_category: false,
    },
  ],
};

describe("AnalyticsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and renders aggregate analytics data", async () => {
    vi.mocked(api.getAggregateAllocation).mockResolvedValue({
      members: [
        { id: "m-1", name: "Alice", has_data: true },
        { id: "m-2", name: "Bob", has_data: false },
      ],
      allocation: sampleAllocationSummary,
    });
    vi.mocked(api.getAggregateTer).mockResolvedValue({
      members: [],
      ter: sampleTerSummary,
    });
    vi.mocked(api.getAggregateDirectRegularTer).mockResolvedValue({
      members: [],
      ter: sampleDirectRegularComparison,
    });
    vi.mocked(api.getAggregateCategoryRanking).mockResolvedValue({
      members: [],
      ranking: sampleCategoryRanking,
    });

    render(<AnalyticsView viewMode="aggregate" memberId={null} />);

    expect(screen.getByText("Portfolio Analytics & Fee Depth")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Portfolio Allocation")).toBeInTheDocument();
      expect(screen.getByText("Total Expense Ratio (TER) & Cost Analysis")).toBeInTheDocument();
      expect(screen.getByText("SEBI Category Ranking & Peer Comparison")).toBeInTheDocument();
    });

    expect(screen.getByText("0.85%")).toBeInTheDocument();
    expect(screen.getByText("Parag Parikh Flexi Cap Fund - Direct Plan")).toBeInTheDocument();
    expect(screen.getByText("Category Unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it("fetches and renders per-member analytics data", async () => {
    vi.mocked(api.getMemberAllocation).mockResolvedValue(sampleAllocationSummary);
    vi.mocked(api.getMemberTer).mockResolvedValue(sampleTerSummary);
    vi.mocked(api.getMemberDirectRegularTer).mockResolvedValue(sampleDirectRegularComparison);
    vi.mocked(api.getMemberCategoryRanking).mockResolvedValue(sampleCategoryRanking);

    render(<AnalyticsView viewMode="member" memberId="m-1" />);

    await waitFor(() => {
      expect(api.getMemberAllocation).toHaveBeenCalledWith("m-1");
      expect(api.getMemberTer).toHaveBeenCalledWith("m-1");
      expect(api.getMemberDirectRegularTer).toHaveBeenCalledWith("m-1");
      expect(api.getMemberCategoryRanking).toHaveBeenCalledWith("m-1");
    });

    await waitFor(() => {
      expect(screen.getByText("Flexi Cap")).toBeInTheDocument();
    });
  });

  it("switches allocation tabs between Category and AMC", async () => {
    vi.mocked(api.getAggregateAllocation).mockResolvedValue({
      members: [],
      allocation: sampleAllocationSummary,
    });
    vi.mocked(api.getAggregateTer).mockResolvedValue({ members: [], ter: sampleTerSummary });
    vi.mocked(api.getAggregateDirectRegularTer).mockResolvedValue({ members: [], ter: sampleDirectRegularComparison });
    vi.mocked(api.getAggregateCategoryRanking).mockResolvedValue({ members: [], ranking: sampleCategoryRanking });

    render(<AnalyticsView viewMode="aggregate" memberId={null} />);

    await waitFor(() => {
      expect(screen.getByText("By AMC")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("By AMC"));
    expect(screen.getByText("Parag Parikh Mutual Fund")).toBeInTheDocument();
  });

  it("renders error boundary when API fails", async () => {
    vi.mocked(api.getAggregateAllocation).mockRejectedValue(new Error("Network Error"));

    render(<AnalyticsView viewMode="aggregate" memberId={null} />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load Analytics Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Network Error")).toBeInTheDocument();
    });
  });
});
