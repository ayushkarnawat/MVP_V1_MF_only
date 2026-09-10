import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AnalyticsView } from "./AnalyticsView";
import * as api from "./api";
import type { AnalyticsSectionState, MemberStatus } from "./types";

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
  direct: { weighted_ter: "0.65", covered_value: "100000", total_value: "100000", reference_period: "2026-07-31", uncovered_schemes: [] },
  regular: { weighted_ter: "1.15", covered_value: "66666.67", total_value: "66666.67", reference_period: "2026-07-31", uncovered_schemes: [] },
};

const sampleCategoryRanking = {
  funds: [
    { scheme_id: "scheme-1", scheme_name: "Parag Parikh Flexi Cap Fund - Direct Plan", sebi_category: "Flexi Cap Fund", category_unavailable: false, insufficient_history: false, scheme_return: "18.45", category_rank: 3, category_size: 42, percentile: "92.8", category_avg_return: "14.20", thin_category: false },
    { scheme_id: "scheme-2", scheme_name: "Old Legacy Fund", sebi_category: null, category_unavailable: true, insufficient_history: false, scheme_return: null, category_rank: null, category_size: 0, percentile: null, category_avg_return: null, thin_category: false },
  ],
};

const sampleScoreSummary = {
  funds: [
    { scheme_id: "scheme-1", scheme_name: "Parag Parikh Flexi Cap Fund - Direct Plan", category_unavailable: false, insufficient_history: false, thin_category: false, risk_adjusted_tier: 5, cost_adjustment: "0.25", final_score: "85.5", return_percentile: "88.0", risk_percentile: "82.0", consistency_hit_rate: "80.0" },
  ],
  weighted_score: "85.5",
  covered_value: "166666.67",
  total_value: "166666.67",
  uncovered_schemes: [],
};

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
    { scheme_id: "scheme-1", scheme_name: "Parag Parikh Flexi Cap Fund - Direct Plan", benchmark_index: "nifty_500" as const, fund_xirr: "0.1845", benchmark_xirr: "0.1410" },
  ],
  overall_portfolio_xirr: "0.1645",
  overall_broad_market_xirr: "0.1410",
};

function settled(
  payload: Record<string, unknown> | null,
  failedAt: string | null = null,
): AnalyticsSectionState {
  return { payload: failedAt ? null : payload, computed_at: failedAt ? null : "2026-09-01T00:00:00Z", failed_at: failedAt };
}

function buildSections(isAggregate: boolean, members: MemberStatus[] = []) {
  const wrap = (field: string, value: Record<string, unknown>): Record<string, unknown> =>
    isAggregate ? { members, [field]: value } : value;
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

describe("AnalyticsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and renders all 5 analytics sections for aggregate view", async () => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: "combined",
      recomputing: false,
      sections: buildSections(true, [
        { id: "m-1", name: "Alice", has_data: true },
        { id: "m-2", name: "Bob", has_data: false },
      ]),
    });

    render(<AnalyticsView viewMode="aggregate" memberId={null} />);

    expect(screen.getByText("Analytics & Portfolio Performance Dashboard")).toBeInTheDocument();
    expect(api.getAnalyticsScope).toHaveBeenCalledWith("combined", expect.any(AbortSignal));

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
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: "m-1",
      recomputing: false,
      sections: buildSections(false),
    });

    render(<AnalyticsView viewMode="member" memberId="m-1" />);

    await waitFor(() => {
      expect(api.getAnalyticsScope).toHaveBeenCalledWith("m-1", expect.any(AbortSignal));
      expect(screen.getByText("Flexi Cap")).toBeInTheDocument();
    });
  });

  it("does not fetch when in member mode with no member selected", () => {
    render(<AnalyticsView viewMode="member" memberId={null} />);
    expect(api.getAnalyticsScope).not.toHaveBeenCalled();
  });

  it("opens S20 score modal when fund score row is clicked", async () => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: "combined",
      recomputing: false,
      sections: buildSections(true, [{ id: "m-1", name: "Alice", has_data: true }]),
    });
    vi.mocked(api.getFundScore).mockResolvedValue(sampleScoreSummary.funds[0]);

    render(<AnalyticsView viewMode="aggregate" memberId={null} />);

    await waitFor(() => {
      expect(screen.getByText("Fund Quality Scorer & Composite Ratings")).toBeInTheDocument();
    });

    const scoreRowMatches = screen.getAllByText("Parag Parikh Flexi Cap Fund - Direct Plan");
    fireEvent.click(scoreRowMatches[scoreRowMatches.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("S20 · Unifolio Fund Score")).toBeInTheDocument();
    });
  });

  it("renders error boundary when the scope fetch fails", async () => {
    vi.mocked(api.getAnalyticsScope).mockRejectedValue(new Error("Network Error"));

    render(<AnalyticsView viewMode="aggregate" memberId={null} />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load Analytics Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Network Error")).toBeInTheDocument();
    });
  });

  it("aborts the analytics request when the view unmounts", async () => {
    let observedSignal: AbortSignal | undefined;
    vi.mocked(api.getAnalyticsScope).mockImplementation((_scope: string, signal?: AbortSignal) => {
      observedSignal = signal;
      return new Promise(() => {});
    });

    const { unmount } = render(<AnalyticsView viewMode="aggregate" memberId={null} />);
    unmount();

    expect(observedSignal?.aborted).toBe(true);
  });

  it("disables the Download PDF button while any section is still loading", () => {
    vi.mocked(api.getAnalyticsScope).mockImplementation(() => new Promise(() => {}));
    render(<AnalyticsView viewMode="aggregate" memberId={null} />);
    const button = screen.getByRole("button", { name: /download pdf/i });
    expect(button).toBeDisabled();
  });

  it("enables Download PDF once all sections have settled, and posts the assembled payload", async () => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: "combined",
      recomputing: false,
      sections: buildSections(true, []),
    });
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    vi.mocked(api.postExportPdf).mockResolvedValue(blob);
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

  it("shows a retry banner when a section has permanently failed, and re-fetches on click", async () => {
    const sectionsWithFailure = { ...buildSections(true, []), score: settled(null, "2026-09-01T00:00:00Z") };
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: "combined",
      recomputing: false,
      sections: sectionsWithFailure,
    });
    vi.mocked(api.retryAnalyticsScope).mockResolvedValue({ dispatched: true });

    render(<AnalyticsView viewMode="aggregate" memberId={null} />);

    const retryButton = await screen.findByRole("button", { name: /retry/i });
    fireEvent.click(retryButton);

    await waitFor(() => expect(api.retryAnalyticsScope).toHaveBeenCalledWith("combined"));
    await waitFor(() => expect(api.getAnalyticsScope).toHaveBeenCalledTimes(2));
  });
});
