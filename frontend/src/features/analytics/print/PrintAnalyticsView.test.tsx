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

  it("renders every fund's score card inline, with no click required", async () => {
    render(<PrintAnalyticsView />);
    await waitFor(() => expect(screen.getByText("Test Flexi Cap Fund")).toBeInTheDocument());
    expect(screen.getByText("72.5")).toBeInTheDocument();
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
