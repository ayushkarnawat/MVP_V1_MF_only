import { sampleValuation } from "@/features/analytics/valuationTestData";
import { sampleOverlap } from "@/features/analytics/overlapTestData";
import { sampleAssetAllocation } from "@/features/analytics/assetAllocationTestData";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MobileAnalyticsView } from "./MobileAnalyticsView";
import { sampleStockHoldings } from "@/features/analytics/stockHoldingsTestData";
import { sampleCapAllocation } from "@/features/analytics/capAllocationTestData";
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

const sampleInvestmentWithdrawal = {
  total_invested: "10000.00", total_withdrawn: "2000.00", net_invested: "8000.00",
  current_value: "8500.00", absolute_gain: "500.00", monthly: [], yearly: [],
  sip_summary: { active_count: 0, total_monthly_amount: "0.00", missed_count: 0 },
  gifts_net: "0.00",
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
    stock_holdings: settled(wrap("stock_holdings", sampleStockHoldings)),
    valuation: settled(wrap("valuation", sampleValuation)),
    overlap: settled(wrap("overlap", sampleOverlap)),
    asset_allocation: settled(wrap("asset_allocation", sampleAssetAllocation)),
    cap_allocation: settled(wrap("cap_allocation", sampleCapAllocation)),
    fund_manager: settled(wrap("fund_manager", {
      manager_groups: [{ manager_name: "Mobile Manager", role: "Overseas Investments", total_household_value: "50000",
        funds: [{ scheme_id: "scheme-1", scheme_name: "Mobile Manager Fund", household_value: "50000", sequence_order: 1, role: "Overseas Investments" }] }],
      unavailable_schemes: [],
    })),
    ter: settled(wrap("ter", sampleTerSummary)),
    ter_direct_regular: settled(wrap("ter", sampleDirectRegularComparison)),
    category_ranking: settled(wrap("ranking", sampleCategoryRanking)),
    score: settled(wrap("score", sampleScoreSummary)),
    benchmark: settled(wrap("benchmark", samplePortfolioBenchmark)),
    benchmark_funds: settled(wrap("comparison", sampleFundBenchmark)),
    investment_withdrawal: settled(wrap("data", sampleInvestmentWithdrawal)),
    ranking: settled(wrap("ranking", { funds: [] })),
  };
}

describe("MobileAnalyticsView", () => {
  it.each([true, false])("unwraps valuation for both scopes (aggregate=%s)", async (aggregate) => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: aggregate ? "combined" : "m-1", recomputing: false, sections: buildSections(aggregate) });
    render(<MobileAnalyticsView memberId={aggregate ? null : "m-1"} />);
    expect(await screen.findByRole("heading", { name: "Portfolio valuation" })).toBeInTheDocument();
    expect(screen.getByText("25.00x")).toBeInTheDocument();
  });
  it.each([true, false])("unwraps overlap and opens the existing full stock table (aggregate=%s)", async (aggregate) => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: aggregate ? "combined" : "m-1", recomputing: false, sections: buildSections(aggregate) });
    render(<MobileAnalyticsView memberId={aggregate ? null : "m-1"} />);
    expect(await screen.findByRole("heading", { name: "Fund overlap" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View all" }));
    expect(screen.getByRole("table", { name: "All stored stock holdings" })).toBeInTheDocument();
  });
  it.each([true, false])("unwraps look-through asset allocation (aggregate=%s)", async (aggregate) => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: aggregate ? "combined" : "m-1", recomputing: false, sections: buildSections(aggregate) });
    render(<MobileAnalyticsView memberId={aggregate ? null : "m-1"} />);
    expect(await screen.findByRole("heading", { name: "Look-through asset allocation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Equity.*80.00%/ })).toBeInTheDocument();
  });
  it("settles a failed valuation section with an empty card and retry action", async () => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: "combined", recomputing: false,
      sections: { ...buildSections(true), valuation: settled(null, "2026-10-14T00:00:00Z") } });
    render(<MobileAnalyticsView />);
    expect(await screen.findByText("No portfolio valuation data available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading portfolio valuation")).not.toBeInTheDocument();
  });
  it("settles a failed overlap section with an empty card and retry action", async () => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: "combined", recomputing: false,
      sections: { ...buildSections(true), overlap: settled(null, "2026-10-14T00:00:00Z") } });
    render(<MobileAnalyticsView />);
    expect(await screen.findByText("No fund overlap data available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading fund overlap")).not.toBeInTheDocument();
  });
  it("settles a failed look-through asset section with an empty card and retry action", async () => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: "combined", recomputing: false,
      sections: { ...buildSections(true), asset_allocation: settled(null, "2026-10-14T00:00:00Z") } });
    render(<MobileAnalyticsView />);
    expect(await screen.findByText("No look-through asset allocation data available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading look-through asset allocation")).not.toBeInTheDocument();
  });
  it("settles a failed cap section with an empty card and retry action", async () => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: "combined", recomputing: false,
      sections: { ...buildSections(true), cap_allocation: settled(null, "2026-10-14T00:00:00Z") } });
    render(<MobileAnalyticsView />);
    expect(await screen.findByText("No market-cap allocation data available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading market-cap allocation")).not.toBeInTheDocument();
  });
  it.each([true, false])("unwraps cap_allocation for both scopes (aggregate=%s)", async (aggregate) => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: aggregate ? "combined" : "m-1", recomputing: false, sections: buildSections(aggregate) });
    render(<MobileAnalyticsView memberId={aggregate ? null : "m-1"} />);
    expect(await screen.findByRole("heading", { name: "Market-cap allocation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Other \/ Unclassified.*30.00%/ })).toBeInTheDocument();
  });
  it.each([true, false])("renders stock holdings immediately after allocation (aggregate=%s)", async (isAggregate) => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: isAggregate ? "combined" : "m-1", recomputing: false, sections: buildSections(isAggregate) });
    render(<MobileAnalyticsView memberId={isAggregate ? null : "m-1"} />);
    const heading = await screen.findByRole("heading", { name: "Overall stock holdings" });
    const allocation = screen.getByRole("heading", { name: "Portfolio Allocation" });
    expect(allocation.closest("section")?.nextElementSibling).toBe(heading.closest("section"));
    expect(screen.getByRole("button", { name: /Reliance Industries.*6.55%/ })).toBeInTheDocument();
  });

  it("settles a failed stock section and keeps the household retry action", async () => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: "combined", recomputing: false,
      sections: { ...buildSections(true), stock_holdings: settled(null, "2026-10-14T00:00:00Z") } });
    render(<MobileAnalyticsView />);
    expect(await screen.findByText("No stock holdings data available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading overall stock holdings")).not.toBeInTheDocument();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([true, false])("renders the fund_manager table after Category Ranking (aggregate=%s)", async (isAggregate) => {
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({
      scope: isAggregate ? "combined" : "m-1", recomputing: false, sections: buildSections(isAggregate),
    });
    render(<MobileAnalyticsView memberId={isAggregate ? null : "m-1"} />);
    const row = (await screen.findByText("Mobile Manager")).closest("tr")!;
    const heading = screen.getByRole("heading", { name: "Fund Manager Allocation" });
    const category = screen.getByRole("heading", { name: "SEBI Category Ranking & Peer Comparison" });
    expect(category.closest("section")?.nextElementSibling).toBe(heading.closest("section"));
    expect(row).toHaveTextContent("Mobile Manager");
    expect(screen.getByRole("table", { name: "Fund manager allocation" })).toContainElement(row);
    expect(screen.queryByText("Overseas Investments")).not.toBeInTheDocument();
    expect(screen.queryByText("Mobile Manager Fund")).not.toBeInTheDocument();
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
      expect(screen.getByText("Fund Ranking")).toBeInTheDocument();
      expect(screen.getByText("Fund Quality Scorer & Composite Ratings")).toBeInTheDocument();
      expect(screen.getByText("Benchmark Comparison (XIRR)")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Investment & Withdrawal" })).toBeInTheDocument();
      expect(screen.getByText("₹8,500")).toBeInTheDocument();
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
  it.each([true, false])("T1.5 print_and_mobile_views_render_without_it (phone curve=%s)", async (curve) => {
    const overlap = JSON.parse(JSON.stringify(sampleOverlap)) as typeof sampleOverlap;
    if (!curve) {
      Reflect.deleteProperty(overlap, "concentration");
      Reflect.deleteProperty(overlap, "total_stock_count");
    }
    vi.mocked(api.getAnalyticsScope).mockResolvedValue({ scope: "combined", recomputing: false,
      sections: { ...buildSections(true), overlap: settled({ members: [], overlap }) } });
    render(<MobileAnalyticsView />);
    expect(await screen.findByRole("table", { name: "Fund overlap heatmap" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /stock concentration/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cumulative stock exposure curve")).not.toBeInTheDocument();
  });

});
