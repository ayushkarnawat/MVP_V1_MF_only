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

const sampleScoreSummary = {
  funds: [
    {
      scheme_id: "scheme-1",
      scheme_name: "Parag Parikh Flexi Cap Fund - Direct Plan",
      category_unavailable: false,
      insufficient_history: false,
      thin_category: false,
      risk_adjusted_tier: 5,
      cost_adjustment: "0.25",
      final_score: "85.5",
      return_percentile: "88.0",
      risk_percentile: "82.0",
      consistency_hit_rate: "80.0",
    },
  ],
  weighted_score: "85.5",
  covered_value: "166666.67",
  total_value: "166666.67",
  uncovered_schemes: [],
};

// Backend XIRR values are raw decimal fractions (e.g. "0.1645" for 16.45%,
// see backend/app/services/analytics/benchmark.py's _xirr_str) — not
// already-scaled percentages.
const samplePortfolioBenchmark = {
  portfolio_xirr: "0.1645",
  benchmarks: [
    { index: "nifty_50" as const, xirr: "0.1230" },
    { index: "nifty_500" as const, xirr: "0.1410" },
    { index: "nifty_largemidcap_250" as const, xirr: "0.1500" },
    { index: "nifty_midcap_150" as const, xirr: "0.1720" },
  ],
};

const sampleFundBenchmark = {
  funds: [
    {
      scheme_id: "scheme-1",
      scheme_name: "Parag Parikh Flexi Cap Fund - Direct Plan",
      benchmark_index: "nifty_500" as const,
      fund_xirr: "0.1845",
      benchmark_xirr: "0.1410",
    },
  ],
  overall_portfolio_xirr: "0.1645",
  overall_broad_market_xirr: "0.1410",
};

describe("AnalyticsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupAggregateMocks() {
    vi.mocked(api.getAggregateAllocation).mockResolvedValue({
      members: [
        { id: "m-1", name: "Alice", has_data: true },
        { id: "m-2", name: "Bob", has_data: false },
      ],
      allocation: sampleAllocationSummary,
    });
    vi.mocked(api.getAggregateTer).mockResolvedValue({ members: [], ter: sampleTerSummary });
    vi.mocked(api.getAggregateDirectRegularTer).mockResolvedValue({ members: [], ter: sampleDirectRegularComparison });
    vi.mocked(api.getAggregateCategoryRanking).mockResolvedValue({ members: [], ranking: sampleCategoryRanking });
    vi.mocked(api.getAggregateScore).mockResolvedValue({ members: [], score: sampleScoreSummary });
    vi.mocked(api.getAggregateBenchmark).mockResolvedValue({ members: [], benchmark: samplePortfolioBenchmark });
    vi.mocked(api.getAggregateFundBenchmark).mockResolvedValue({ members: [], comparison: sampleFundBenchmark });
  }

  function setupMemberMocks() {
    vi.mocked(api.getMemberAllocation).mockResolvedValue(sampleAllocationSummary);
    vi.mocked(api.getMemberTer).mockResolvedValue(sampleTerSummary);
    vi.mocked(api.getMemberDirectRegularTer).mockResolvedValue(sampleDirectRegularComparison);
    vi.mocked(api.getMemberCategoryRanking).mockResolvedValue(sampleCategoryRanking);
    vi.mocked(api.getMemberScore).mockResolvedValue(sampleScoreSummary);
    vi.mocked(api.getMemberBenchmark).mockResolvedValue(samplePortfolioBenchmark);
    vi.mocked(api.getMemberFundBenchmark).mockResolvedValue(sampleFundBenchmark);
  }

  it("fetches and renders all 5 analytics sections for aggregate view", async () => {
    setupAggregateMocks();

    render(<AnalyticsView viewMode="aggregate" memberId={null} />);

    expect(screen.getByText("Analytics & Portfolio Performance Dashboard")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Portfolio Allocation")).toBeInTheDocument();
      expect(screen.getByText("Total Expense Ratio (TER) & Cost Analysis")).toBeInTheDocument();
      expect(screen.getByText("SEBI Category Ranking & Peer Comparison")).toBeInTheDocument();
      expect(screen.getByText("Fund Quality Scorer & Composite Ratings")).toBeInTheDocument();
      expect(screen.getByText("Benchmark Comparison (XIRR)")).toBeInTheDocument();
    });

    expect(screen.getByText("0.85%")).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it("fetches and renders per-member analytics data for all 5 sections", async () => {
    setupMemberMocks();

    render(<AnalyticsView viewMode="member" memberId="m-1" />);

    await waitFor(() => {
      expect(api.getMemberAllocation).toHaveBeenCalledWith("m-1", expect.any(AbortSignal));
      expect(api.getMemberTer).toHaveBeenCalledWith("m-1", expect.any(AbortSignal));
      expect(api.getMemberDirectRegularTer).toHaveBeenCalledWith("m-1", expect.any(AbortSignal));
      expect(api.getMemberCategoryRanking).toHaveBeenCalledWith("m-1", expect.any(AbortSignal));
      expect(api.getMemberScore).toHaveBeenCalledWith("m-1", expect.any(AbortSignal));
      expect(api.getMemberBenchmark).toHaveBeenCalledWith("m-1", expect.any(AbortSignal));
      expect(api.getMemberFundBenchmark).toHaveBeenCalledWith("m-1", expect.any(AbortSignal));
    });

    await waitFor(() => {
      expect(screen.getByText("Flexi Cap")).toBeInTheDocument();
    });
  });

  it("opens S20 score modal when fund score row is clicked", async () => {
    setupAggregateMocks();
    vi.mocked(api.getFundScore).mockResolvedValue(sampleScoreSummary.funds[0]);

    render(<AnalyticsView viewMode="aggregate" memberId={null} />);

    await waitFor(() => {
      expect(screen.getByText("Fund Quality Scorer & Composite Ratings")).toBeInTheDocument();
    });

    // The same fund name renders in both CategoryRankingSection and ScorerSection at
    // once (shared fixture data) — ScorerSection renders after CategoryRankingSection
    // in AnalyticsView, so its row is the last match.
    const scoreRowMatches = screen.getAllByText("Parag Parikh Flexi Cap Fund - Direct Plan");
    fireEvent.click(scoreRowMatches[scoreRowMatches.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("S20 · Unifolio Fund Score")).toBeInTheDocument();
    });
  });

  it("renders error boundary when API fails", async () => {
    vi.mocked(api.getAggregateAllocation).mockRejectedValue(new Error("Network Error"));

    render(<AnalyticsView viewMode="aggregate" memberId={null} />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load Analytics Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Network Error")).toBeInTheDocument();
    });
  });

  it("aborts analytics requests when the view unmounts", () => {
    let observedSignal: AbortSignal | undefined;
    vi.mocked(api.getAggregateAllocation).mockImplementation((signal) => {
      observedSignal = signal;
      return new Promise(() => {});
    });
    vi.mocked(api.getAggregateTer).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getAggregateDirectRegularTer).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getAggregateCategoryRanking).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getAggregateScore).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getAggregateBenchmark).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getAggregateFundBenchmark).mockImplementation(() => new Promise(() => {}));

    const { unmount } = render(
      <AnalyticsView viewMode="aggregate" memberId={null} />,
    );
    unmount();

    expect(observedSignal?.aborted).toBe(true);
  });

  it("disables the Download PDF button while any section is still loading", () => {
    render(<AnalyticsView viewMode="aggregate" memberId={null} />);
    const button = screen.getByRole("button", { name: /download pdf/i });
    expect(button).toBeDisabled();
  });

  it("enables Download PDF once all sections have loaded, and posts the assembled payload", async () => {
    setupAggregateMocks();
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    vi.mocked(api.postExportPdf).mockResolvedValue(blob);
    // createObjectURL/revokeObjectURL don't exist in jsdom by default
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });

    render(<AnalyticsView viewMode="aggregate" memberId={null} />);
    const button = await screen.findByRole("button", { name: /download pdf/i });
    await waitFor(() => expect(button).toBeEnabled());

    fireEvent.click(button);

    await waitFor(() => expect(api.postExportPdf).toHaveBeenCalledTimes(1));
    const call = vi.mocked(api.postExportPdf).mock.calls[0][0];
    expect(call.scope).toBe("aggregate");
    expect(call.payload.scopeName).toBe("Family Aggregate");
  });
});
