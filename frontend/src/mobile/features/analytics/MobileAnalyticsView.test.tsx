import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MobileAnalyticsView } from "./MobileAnalyticsView";
import * as api from "@/features/analytics/api";
import type { AnalyticsSectionState } from "@/features/analytics/types";

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
  covered_value: "50000",
  total_value: "50000",
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

function settled(
  payload: Record<string, unknown> | null,
  failedAt: string | null = null,
): AnalyticsSectionState {
  return {
    payload: failedAt ? null : payload,
    computed_at: failedAt ? null : "2026-09-01T00:00:00Z",
    failed_at: failedAt,
  };
}

function buildSections(isAggregate: boolean) {
  const wrap = (field: string, value: Record<string, unknown>): Record<string, unknown> =>
    isAggregate ? { members: [], [field]: value } : value;
  return {
    allocation: settled(wrap("allocation", sampleAllocationSummary)),
    ter: settled(wrap("ter", sampleTerSummary)),
    ter_direct_regular: settled(wrap("ter", sampleDirectRegularComparison)),
    category_ranking: settled(wrap("ranking", sampleCategoryRanking)),
    score: settled(wrap("score", sampleScoreSummary)),
    benchmark: settled(wrap("benchmark", samplePortfolioBenchmark)),
    benchmark_funds: settled(wrap("comparison", sampleFundBenchmark)),
  };
}

describe("MobileAnalyticsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and renders all 5 sections for mobile analytics dashboard", async () => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: "combined",
      recomputing: false,
      sections: buildSections(true),
    });

    render(<MobileAnalyticsView />);

    expect(screen.getByText("Portfolio Total Value")).toBeInTheDocument();
    expect(api.getAnalyticsScope).toHaveBeenCalledWith("combined", expect.any(AbortSignal));

    await waitFor(() => {
      expect(screen.getByText("Portfolio Allocation")).toBeInTheDocument();
      expect(screen.getByText("Total Expense Ratio (TER) & Cost Analysis")).toBeInTheDocument();
      expect(screen.getByText("SEBI Category Ranking & Peer Comparison")).toBeInTheDocument();
      expect(screen.getByText("Fund Quality Scorer & Composite Ratings")).toBeInTheDocument();
      expect(screen.getByText("Benchmark Comparison (XIRR)")).toBeInTheDocument();
    });
  });

  it("uses the member id as the consolidated analytics scope", async () => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: "m-1",
      recomputing: false,
      sections: buildSections(false),
    });

    render(<MobileAnalyticsView memberId="m-1" />);

    await waitFor(() => {
      expect(api.getAnalyticsScope).toHaveBeenCalledWith("m-1", expect.any(AbortSignal));
      expect(screen.getByText("Flexi Cap")).toBeInTheDocument();
    });
  });

  it("handles mobile error state when API fails", async () => {
    vi.mocked(api.getAnalyticsScope).mockRejectedValue(new Error("Mobile Fetch Error"));

    render(<MobileAnalyticsView />);

    await waitFor(() => {
      expect(screen.getByText("Analytics Load Error")).toBeInTheDocument();
      expect(screen.getByText("Mobile Fetch Error")).toBeInTheDocument();
    });
  });

  it("retries the whole scope when a section has permanently failed", async () => {
    const failedSections = {
      ...buildSections(true),
      score: settled(null, "2026-09-01T00:00:00Z"),
    };
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: "combined",
      recomputing: false,
      sections: failedSections,
    });
    vi.mocked(api.retryAnalyticsScope).mockResolvedValue({ dispatched: true });

    render(<MobileAnalyticsView />);

    const retryButton = await screen.findByRole("button", { name: /retry/i });
    fireEvent.click(retryButton);

    await waitFor(() => expect(api.retryAnalyticsScope).toHaveBeenCalledWith("combined"));
    await waitFor(() => expect(api.getAnalyticsScope).toHaveBeenCalledTimes(2));
  });
});
