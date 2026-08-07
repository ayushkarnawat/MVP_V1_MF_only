import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DashboardView } from "./DashboardView";
import * as api from "./api";

vi.mock("./api", () => ({
  getMemberHoldings: vi.fn(),
  getMemberAllocation: vi.fn(),
  getAggregateHoldings: vi.fn(),
  getAggregateAllocation: vi.fn(),
  getDistributorComparison: vi.fn(),
}));

describe("DashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders S21 Empty State when member has 0 holdings", async () => {
    vi.mocked(api.getMemberHoldings).mockResolvedValue([]);
    vi.mocked(api.getMemberAllocation).mockResolvedValue({
      by_asset_class: [],
      by_amc: [],
      total_value: "0.00",
    });

    render(<DashboardView viewMode="member" memberId="m-1" />);

    await waitFor(() => {
      expect(screen.getByText("No Holdings Found")).toBeInTheDocument();
      expect(screen.getByText(/\+ Upload CAS Statement/i)).toBeInTheDocument();
    });
  });

  it("renders portfolio summary hero and holdings table when data exists", async () => {
    vi.mocked(api.getMemberHoldings).mockResolvedValue([
      {
        scheme_id: "scheme-101",
        scheme_name: "HDFC Top 100 Fund",
        amc_name: "HDFC Mutual Fund",
        household_member_id: "m-1",
        household_member_name: "John",
        plan_type: "DIRECT",
        units_held: "100.00",
        average_nav: "50.00",
        current_nav: "75.00",
        amount_invested: "5000.00",
        current_value: "7500.00",
        current_profit_total: "2500.00",
        realized_gain: "0.00",
        unrealized_gain: "2500.00",
        today_gain: "50.00",
      },
    ]);
    vi.mocked(api.getMemberAllocation).mockResolvedValue({
      by_asset_class: [{ label: "Equity", current_value: "7500.00", percentage: 100 }],
      by_amc: [{ label: "HDFC", current_value: "7500.00", percentage: 100 }],
      total_value: "7500.00",
    });

    render(<DashboardView viewMode="member" memberId="m-1" />);

    await waitFor(() => {
      expect(screen.getByText("Total Portfolio Value")).toBeInTheDocument();
      // The fixture's single holding equals the portfolio total, so "₹7,500"
      // legitimately appears more than once (hero, donut center, donut
      // legend, table cell) — assert presence, not uniqueness.
      expect(screen.getAllByText("₹7,500").length).toBeGreaterThan(0);
      expect(screen.getByText("HDFC Top 100 Fund")).toBeInTheDocument();
      expect(screen.getByText("Equity")).toBeInTheDocument();
    });
  });

  it("renders S22 placeholder for family member without CAS data in aggregate view", async () => {
    vi.mocked(api.getAggregateHoldings).mockResolvedValue({
      members: [
        { id: "m-1", name: "Alice", has_data: true },
        { id: "m-2", name: "Bob", has_data: false },
      ],
      holdings: [
        {
          scheme_id: "scheme-101",
          scheme_name: "Axis Long Term Equity",
          household_member_id: "m-1",
          household_member_name: "Alice",
          plan_type: "DIRECT",
          units_held: "50.00",
          average_nav: "60.00",
          current_nav: "80.00",
          amount_invested: "3000.00",
          current_value: "4000.00",
          current_profit_total: "1000.00",
          realized_gain: "0.00",
          unrealized_gain: "1000.00",
          today_gain: "20.00",
        },
      ],
    });
    vi.mocked(api.getAggregateAllocation).mockResolvedValue({
      members: [
        { id: "m-1", name: "Alice", has_data: true },
        { id: "m-2", name: "Bob", has_data: false },
      ],
      allocation: {
        by_asset_class: [{ label: "Equity", current_value: "4000.00", percentage: 100 }],
        by_amc: [{ label: "Axis", current_value: "4000.00", percentage: 100 }],
        total_value: "4000.00",
      },
    });

    render(<DashboardView viewMode="aggregate" memberId={null} />);

    await waitFor(() => {
      expect(screen.getByText("Pending Family Imports")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("No CAS Data")).toBeInTheDocument();
    });
  });
});
