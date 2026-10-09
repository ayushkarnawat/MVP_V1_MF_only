import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AnalyticsView } from "./AnalyticsView";
import * as api from "./api";
import { ANALYTICS_SECTION_NAMES } from "./types";
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
    { scheme_id: "scheme-1", scheme_name: "Parag Parikh Flexi Cap Fund - Direct Plan", category_unavailable: false, insufficient_history: false, thin_category: false, risk_adjusted_tier: 5, cost_adjustment: "0.25", final_score: "85.5", return_percentile: "88.0", risk_percentile: "82.0", consistency_hit_rate: "80.0", scheme_return: null, category_avg_return: null, downside_deviation: null, category_avg_downside_deviation: null, consistency_hits: null, consistency_total_windows: null },
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

const sampleInvestmentWithdrawal = {
  total_invested: "10000.00", total_withdrawn: "2000.00", net_invested: "8000.00",
  current_value: "8500.00", absolute_gain: "500.00", monthly: [], yearly: [],
  sip_summary: { active_count: 0, total_monthly_amount: "0.00", missed_count: 0 },
  gifts_net: "0.00",
};

const sampleFundRanking = {
  funds: [{
    scheme_id: "rank-1", scheme_name: "Ranking Growth Fund", category_name: "Equity Scheme - Flexi Cap Fund",
    category_unavailable: false, insufficient_history: false, thin_category: false, too_few_peers: false,
    composite_score: "75.00", category_rank: 2, category_size: 5, category_universe_size: 7,
    percentile: "60.00", return_1y: "0.12", ranked_as: "Ranking Growth Series",
    neighbors: [{ scheme_id: "rank-peer", scheme_name: "Ranking Peer Fund", category_rank: 1, composite_score: "80.00" }],
    components: {
      return_3y: { percentile: "60.00", raw: "0.15" },
      return_5y: { percentile: null, raw: null },
      category_relative: { percentile: null, raw: null },
      low_volatility: { percentile: null, raw: null },
      low_ter: { percentile: null, raw: null },
    },
  }],
};

function settled(
  payload: Record<string, unknown> | null,
  failedAt: string | null = null,
): AnalyticsSectionState {
  return { payload: failedAt ? null : payload, computed_at: failedAt ? null : "2026-09-01T00:00:00Z", failed_at: failedAt };
}

const sampleFundManager = {
  manager_groups: [{ manager_name: "Jane Doe", role: null, total_household_value: "50000",
    funds: [{ scheme_id: "scheme-1", scheme_name: "Manager Held Fund", household_value: "50000", sequence_order: 0, role: null }] }],
  unavailable_schemes: [],
};

function buildSections(isAggregate: boolean, members: MemberStatus[] = []) {
  const wrap = (field: string, value: Record<string, unknown>): Record<string, unknown> =>
    isAggregate ? { members, [field]: value } : value;
  return {
    allocation: settled(wrap("allocation", sampleAllocationSummary)),
    fund_manager: settled(wrap("fund_manager", sampleFundManager)),
    ter: settled(wrap("ter", sampleTerSummary)),
    ter_direct_regular: settled(wrap("ter", sampleDirectRegularComparison)),
    category_ranking: settled(wrap("ranking", sampleCategoryRanking)),
    ranking: settled(wrap("ranking", sampleFundRanking)),
    score: settled(wrap("score", sampleScoreSummary)),
    benchmark: settled(wrap("benchmark", samplePortfolioBenchmark)),
    benchmark_funds: settled(wrap("comparison", sampleFundBenchmark)),
    investment_withdrawal: settled(wrap("data", sampleInvestmentWithdrawal)),
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
      expect(screen.getByRole("heading", { name: "Investment & Withdrawal" })).toBeInTheDocument();
      expect(screen.getByText("₹8,500")).toBeInTheDocument();
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
    expect(call.payload.fundManager).toEqual(sampleFundManager);
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

describe("ANALYTICS_SECTION_NAMES", () => {
  it("includes investment_withdrawal as the 8th registered section", () => {
    expect(ANALYTICS_SECTION_NAMES).toContain("investment_withdrawal");
  });
});


describe("Fund Manager dashboard wiring", () => {
  it.each([true, false])("renders the fund_manager payload after Category Ranking (aggregate=%s)", async (isAggregate) => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: isAggregate ? "combined" : "m-1", recomputing: false, sections: buildSections(isAggregate),
    });
    render(<AnalyticsView viewMode={isAggregate ? "aggregate" : "member"} memberId={isAggregate ? null : "m-1"} />);
    const card = await screen.findByRole("button", { name: /Jane Doe/ });
    const heading = screen.getByRole("heading", { name: "Fund Manager Allocation" });
    const category = screen.getByRole("heading", { name: "SEBI Category Ranking & Peer Comparison" });
    expect(category.closest("section")?.nextElementSibling).toBe(heading.closest("section"));
    fireEvent.click(card);
    expect(screen.getByText("Manager Held Fund")).toBeInTheDocument();
  });

  it("keeps PDF export disabled while fund_manager alone is pending", async () => {
    const sections = buildSections(true);
    sections.fund_manager = { payload: null, computed_at: null, failed_at: null };
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: "combined", recomputing: false, sections });
    render(<AnalyticsView viewMode="aggregate" memberId={null} />);
    await screen.findByText("0.85%");
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeDisabled();
    expect(screen.queryByText("No fund manager data available")).not.toBeInTheDocument();
  });

  it("settles a failed fund_manager section with an empty state and retry available", async () => {
    const sections = { ...buildSections(true), fund_manager: settled(null, "2026-10-09T00:00:00Z") };
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: "combined", recomputing: false, sections });
    render(<AnalyticsView viewMode="aggregate" memberId={null} />);
    await screen.findByText("No fund manager data available");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeEnabled();
  });
});

describe("Fund Ranking dashboard wiring", () => {
  it.each([true, false])("renders the snake_case ranking payload (aggregate=%s) after Category Ranking", async (isAggregate) => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: isAggregate ? "combined" : "m-1", recomputing: false, sections: buildSections(isAggregate),
    });
    render(<AnalyticsView viewMode={isAggregate ? "aggregate" : "member"} memberId={isAggregate ? null : "m-1"} />);
    const fundRankingHeading = await screen.findByRole("heading", { name: "Fund Ranking" });
    const categoryHeading = screen.getByRole("heading", { name: "SEBI Category Ranking & Peer Comparison" });
    expect(categoryHeading.compareDocumentPosition(fundRankingHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("#2 Ranking Growth Fund (you)")).toBeInTheDocument();
    expect(screen.getByText("#1 Ranking Peer Fund")).toBeInTheDocument();
    expect(screen.getByText("Ranked on Ranking Growth Series")).toBeInTheDocument();
  });
});
