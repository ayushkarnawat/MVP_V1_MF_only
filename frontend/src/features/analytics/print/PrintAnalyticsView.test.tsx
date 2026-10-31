import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PrintAnalyticsView } from "./PrintAnalyticsView";
import * as api from "../api";
import type { AnalyticsExportPayload } from "../types";
import { sampleStockHoldings } from "../stockHoldingsTestData";
import { sampleCapAllocation } from "../capAllocationTestData";
import { sampleAssetAllocation } from "../assetAllocationTestData";
import { sampleOverlap } from "../overlapTestData";
import { sampleValuation } from "../valuationTestData";

const payload: AnalyticsExportPayload = {
  scopeName: "Family Aggregate",
  allocation: { by_category: [], by_amc: [], total_value: "100000" },
  ter: null,
  terComparison: null,
  ranking: null,
  fundManager: null,
  scoreSummary: {
    funds: [
      {
        scheme_id: "s-1",
        scheme_name: "Test Flexi Cap Fund",
        category_unavailable: false,
        insufficient_history: false,
        thin_category: false,
        risk_adjusted_tier: 4,
        cost_adjustment: "0.25",
        final_score: "72.5",
        return_percentile: "70",
        risk_percentile: "65",
        consistency_hit_rate: "80",
        scheme_return: null,
        category_avg_return: null,
        downside_deviation: null,
        category_avg_downside_deviation: null,
        consistency_hits: null,
        consistency_total_windows: null,
      },
    ],
    weighted_score: "72.5",
    covered_value: "100000",
    total_value: "100000",
    uncovered_schemes: [],
  },
  portfolioBenchmark: null,
  fundBenchmark: null,
};

const fundRankingRow = {
  scheme_id: "s-9", scheme_name: "Ranked Flexi Cap Fund", category_name: "Equity Scheme - Flexi Cap Fund",
  category_unavailable: false, insufficient_history: false, thin_category: false, too_few_peers: false,
  composite_score: "81.40", category_rank: 8, category_size: 62, category_universe_size: 70, percentile: "87.10",
  return_1y: null, ranked_as: null, neighbors: [],
  components: {
    return_3y: { percentile: "92", raw: "0.241" }, return_5y: { percentile: null, raw: null },
    category_relative: { percentile: null, raw: null }, low_volatility: { percentile: null, raw: null },
    low_ter: { percentile: null, raw: null },
  },
};

describe("PrintAnalyticsView", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.printReady;
    delete document.documentElement.dataset.printError;
    window.history.pushState({}, "", "/print/analytics?token=tok-123");
    vi.spyOn(api, "getExportPayload").mockResolvedValue(payload);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the fund ranking leaderboard from its own export field", async () => {
    vi.spyOn(api, "getExportPayload").mockResolvedValue({ ...payload, fundRanking: { funds: [fundRankingRow] } });
    render(<PrintAnalyticsView />);
    expect((await screen.findAllByText(/Ranked Flexi Cap Fund/)).length).toBeGreaterThan(0);
  });

  it("prints fund managers from their own export field after Category Ranking", async () => {
    vi.spyOn(api, "getExportPayload").mockResolvedValue({ ...payload, fundManager: {
      manager_groups: [{ manager_name: "PDF Manager", role: "Assistant Fund Manager", total_household_value: "100000",
        funds: [{ scheme_id: "s-1", scheme_name: "PDF Held Fund", household_value: "100000", sequence_order: 1, role: "Assistant Fund Manager" }] }],
      unavailable_schemes: [{ scheme_id: "s-2", scheme_name: "PDF Pending Fund", amc_name: "Pending AMC" }],
    } });
    render(<PrintAnalyticsView />);
    await screen.findByText("PDF Manager");
    expect(screen.queryByText("Assistant Fund Manager")).not.toBeInTheDocument();
    expect(screen.getByText("PDF Manager").closest("tr")).toHaveTextContent("₹1,00,000");
    expect(screen.queryByText("PDF Held Fund")).not.toBeInTheDocument();
    expect(screen.getByText(/PDF Pending Fund/)).toHaveTextContent("Pending AMC");
    const category = screen.getByRole("heading", { name: "SEBI Category Ranking & Peer Comparison" });
    const manager = screen.getByRole("heading", { name: "Fund Manager Allocation" });
    expect(category.closest(".print-section")?.nextElementSibling).toBe(manager.closest(".print-section"));
  });

  it("prints the same manager table without roles or fund lists", async () => {
    vi.spyOn(api, "getExportPayload").mockResolvedValue({
      ...payload,
      fundManager: {
        manager_groups: [{
          manager_name: "Jane Doe", role: null, total_household_value: "150000",
          funds: [{ scheme_id: "f1", scheme_name: "Printed Fund One", household_value: "150000", sequence_order: 0, role: "Assistant Fund Manager" }],
        }],
        unavailable_schemes: [],
      },
    });
    render(<PrintAnalyticsView />);
    await screen.findByRole("table", { name: "Fund manager allocation" });
    expect(screen.getByText("Jane Doe").closest("tr")).toHaveTextContent("₹1,50,000");
    expect(screen.queryByText("Printed Fund One")).not.toBeInTheDocument();
    expect(screen.queryByText("Assistant Fund Manager")).not.toBeInTheDocument();
  });

  it("still prints an older export saved before fund ranking existed", async () => {
    render(<PrintAnalyticsView />);
    await waitFor(() => expect(screen.getByText("Test Flexi Cap Fund")).toBeInTheDocument());
    expect(screen.queryByText(/Ranked Flexi Cap Fund/)).not.toBeInTheDocument();
  });

  it("renders every fund's score card inline, with no click required", async () => {
    render(<PrintAnalyticsView />);
    await waitFor(() => expect(screen.getByText("Test Flexi Cap Fund")).toBeInTheDocument());
    expect(screen.getByText("7.3")).toBeInTheDocument();
    expect(screen.getByText("Family Aggregate")).toBeInTheDocument();
  });

  it("sets the print-ready marker once rendered", async () => {
    render(<PrintAnalyticsView />);
    await waitFor(() =>
      expect(document.documentElement.dataset.printReady).toBe("true"),
    );
    expect(document.documentElement.dataset.printError).toBeUndefined();
  });

  it("sets only the print-error marker when the payload fetch fails", async () => {
    vi.mocked(api.getExportPayload).mockRejectedValue(new Error("payload unavailable"));

    render(<PrintAnalyticsView />);

    await waitFor(() =>
      expect(document.documentElement.dataset.printError).toBe("true"),
    );
    expect(document.documentElement.dataset.printReady).toBeUndefined();
    expect(screen.getByTestId("print-error")).toHaveTextContent("payload unavailable");
  });
  describe("look-through sections and investment & withdrawal", () => {
    const withdrawal = {
      total_invested: "3840000.00", total_withdrawn: "600000.00", net_invested: "3240000.00",
      current_value: "3500000.00", absolute_gain: "260000.00",
      monthly: [{ period: "2026-01", invested: "5000.00", withdrawn: "0.00", entries: [] }],
      yearly: [{ period: "2026", invested: "5000.00", withdrawn: "0.00", entries: [] }],
      sip_summary: { active_count: 2, total_monthly_amount: "15000.00", missed_count: 0 }, gifts_net: "0.00",
    };
    const full = () => ({
      ...payload,
      fundManager: { manager_groups: [], unavailable_schemes: [] },
      assetAllocation: sampleAssetAllocation, capAllocation: sampleCapAllocation,
      stockHoldings: sampleStockHoldings, overlap: sampleOverlap, valuation: sampleValuation,
      investmentWithdrawal: withdrawal,
    }) as unknown as AnalyticsExportPayload;
    const headingOrder = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

    it("prints the new blocks in the stated order and still sets print-ready", async () => {
      vi.spyOn(api, "getExportPayload").mockResolvedValue(full());
      render(<PrintAnalyticsView />);
      await screen.findByRole("heading", { name: "Portfolio valuation" });
      const order = headingOrder();
      const at = (name: string) => order.indexOf(name);
      expect(at("Look-through asset allocation")).toBeGreaterThan(at("Allocation"));
      const chain = ["Look-through asset allocation", "Market-cap allocation", "Overall stock holdings", "Fund overlap", "Portfolio valuation"].map(at);
      expect(chain.every((n, i) => n >= 0 && (i === 0 || n > chain[i - 1]))).toBe(true);
      expect(at("Investment & Withdrawal")).toBeGreaterThan(at("Fund Manager Allocation"));
      for (const name of ["Look-through asset allocation", "Market-cap allocation", "Overall stock holdings", "Fund overlap", "Portfolio valuation", "Investment & Withdrawal"]) {
        expect(screen.getByRole("heading", { name }).closest(".print-section")).not.toBeNull();
      }
      await waitFor(() => expect(document.documentElement.dataset.printReady).toBe("true"));
    });

    it("renders an older export without the new fields exactly as before", async () => {
      render(<PrintAnalyticsView />);
      await screen.findByText("Test Flexi Cap Fund");
      for (const name of ["Look-through asset allocation", "Market-cap allocation", "Overall stock holdings", "Fund overlap", "Portfolio valuation", "Investment & Withdrawal"]) {
        expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
      }
    });

    it("omits a block whose section failed (null) without breaking the others", async () => {
      vi.spyOn(api, "getExportPayload").mockResolvedValue({ ...full(), overlap: null } as AnalyticsExportPayload);
      render(<PrintAnalyticsView />);
      await screen.findByRole("heading", { name: "Portfolio valuation" });
      expect(screen.queryByRole("heading", { name: "Fund overlap" })).not.toBeInTheDocument();
    });

    it("prints static views: no toggles, search, View all or scroll regions", async () => {
      vi.spyOn(api, "getExportPayload").mockResolvedValue(full());
      render(<PrintAnalyticsView />);
      await screen.findByRole("heading", { name: "Portfolio valuation" });
      expect(screen.queryByRole("button", { name: "View all" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Search stocks")).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Allocation denominator" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Treat arbitrage funds as cash-like/)).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Period" })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Scrollable overlap matrix" })).not.toBeInTheDocument();
      // Nothing printed may point at a click: no "view all", no tap hint, no disabled call-to-action.
      expect(screen.queryByText(/view all stocks/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Tap a period/i)).not.toBeInTheDocument();
      // Content that a click would reveal is printed instead.
      expect(screen.getByText(/Large Cap — top holdings/)).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Common stock breakdown" })).toBeInTheDocument();
      // Both cap-allocation denominators are printed, since a PDF cannot click the toggle.
      expect(screen.getByText(/% of equity only/)).toBeInTheDocument();
      expect(screen.getByText(/% of total portfolio/)).toBeInTheDocument();
    });
  });
  it.each([true, false])("T1.5 print_and_mobile_views_render_without_it (print curve=%s)", async (curve) => {
    const overlap = JSON.parse(JSON.stringify(sampleOverlap)) as typeof sampleOverlap;
    if (!curve) {
      Reflect.deleteProperty(overlap, "concentration");
      Reflect.deleteProperty(overlap, "total_stock_count");
    }
    vi.mocked(api.getExportPayload).mockResolvedValue({ ...payload, overlap, stockHoldings: sampleStockHoldings });
    render(<PrintAnalyticsView />);
    expect(await screen.findByRole("table", { name: "Fund overlap heatmap" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /stock concentration/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overall stock holdings" })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.dataset.printReady).toBe("true"));
  });

});
