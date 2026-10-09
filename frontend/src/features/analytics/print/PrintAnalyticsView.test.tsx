import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PrintAnalyticsView } from "./PrintAnalyticsView";
import * as api from "../api";
import type { AnalyticsExportPayload } from "../types";

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
    expect(screen.getByText("Assistant Fund Manager")).toBeInTheDocument();
    // The manager's total and, printed open, the fund's own value.
    expect(screen.getAllByText("₹1,00,000")).toHaveLength(2);
    expect(screen.getByText("PDF Held Fund")).toBeInTheDocument();
    expect(screen.getByText(/PDF Pending Fund/)).toHaveTextContent("Pending AMC");
    const category = screen.getByRole("heading", { name: "SEBI Category Ranking & Peer Comparison" });
    const manager = screen.getByRole("heading", { name: "Fund Manager Allocation" });
    expect(category.closest(".print-section")?.nextElementSibling).toBe(manager.closest(".print-section"));
  });

  it("prints every manager's funds without a click (a PDF can't expand a card)", async () => {
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
    expect(await screen.findByText("Printed Fund One")).toBeInTheDocument();
    expect(screen.getByText("Assistant Fund Manager")).toBeInTheDocument();
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
});
