import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DashboardView } from "./DashboardView";
import * as api from "./api";
import * as importApi from "../import/api";

vi.mock("./api", () => ({
  getMemberHoldings: vi.fn(),
  getMemberAllocation: vi.fn(),
  getAggregateHoldings: vi.fn(),
  getAggregateAllocation: vi.fn(),
  getDistributorComparison: vi.fn(),
}));

vi.mock("../import/api", () => ({
  getMemberCoverageGaps: vi.fn().mockResolvedValue([]),
}));

describe("DashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(importApi.getMemberCoverageGaps).mockResolvedValue([]);
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

  it("renders CoverageGapBanner when member has unresolved coverage gaps", async () => {
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

    const importApi = await import("../import/api");
    vi.spyOn(importApi, "getMemberCoverageGaps").mockResolvedValue([
      {
        folio_id: "fol-1",
        folio_number: "12345/67",
        scheme_id: "scheme-101",
        scheme_name: "HDFC Top 100 Fund",
        deficit_units: "50.000",
        first_deficit_date: "2024-02-15",
      },
    ]);

    render(<DashboardView viewMode="member" memberId="m-1" />);

    await waitFor(() => {
      expect(screen.getByText(/coverage gap detected/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /resolve gap/i })).toBeInTheDocument();
    });
  });

  it("compares distributors using the clicked holding's own member id in aggregate view, not the page-level memberId", async () => {
    vi.mocked(api.getAggregateHoldings).mockResolvedValue({
      members: [
        { id: "m-1", name: "Alice", has_data: true },
        { id: "m-2", name: "Bob", has_data: true },
      ],
      holdings: [
        {
          scheme_id: "scheme-A", scheme_name: "Alice Fund", household_member_id: "m-1", household_member_name: "Alice",
          plan_type: "DIRECT", units_held: "50.00", average_nav: "60.00", current_nav: "80.00",
          amount_invested: "3000.00", current_value: "4000.00", current_profit_total: "1000.00",
          realized_gain: "0.00", unrealized_gain: "1000.00", today_gain: "20.00",
        },
        {
          scheme_id: "scheme-B", scheme_name: "Bob Fund", household_member_id: "m-2", household_member_name: "Bob",
          plan_type: "DIRECT", units_held: "50.00", average_nav: "60.00", current_nav: "80.00",
          amount_invested: "3000.00", current_value: "4000.00", current_profit_total: "1000.00",
          realized_gain: "0.00", unrealized_gain: "1000.00", today_gain: "20.00",
        },
      ],
    } as any);
    vi.mocked(api.getAggregateAllocation).mockResolvedValue({
      members: [
        { id: "m-1", name: "Alice", has_data: true },
        { id: "m-2", name: "Bob", has_data: true },
      ],
      allocation: { by_asset_class: [], by_amc: [], total_value: "8000.00" },
    } as any);
    vi.mocked(api.getDistributorComparison).mockResolvedValue([]);

    // Page-level memberId ("m-1") intentionally differs from the clicked
    // holding's owner ("m-2") — matching MainDashboardFlow's real behavior
    // of defaulting selectedMemberId to the first family member even while
    // viewMode is "aggregate".
    render(<DashboardView viewMode="aggregate" memberId="m-1" />);

    await waitFor(() => {
      expect(screen.getByText("Bob Fund")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Bob Fund"));

    await waitFor(() => {
      expect(screen.getByText("Compare Returns by Distributor")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Compare Returns by Distributor"));

    await waitFor(() => {
      expect(api.getDistributorComparison).toHaveBeenCalledWith("m-2", "scheme-B");
    });
  });

  it("narrows the Holdings list by the selected family member, and hides the filter outside aggregate view", async () => {
    const aggregateFixture = {
      members: [
        { id: "m-1", name: "Alice", has_data: true },
        { id: "m-2", name: "Bob", has_data: true },
      ],
      holdings: [
        {
          scheme_id: "scheme-A", scheme_name: "Alice Fund", household_member_id: "m-1", household_member_name: "Alice",
          plan_type: "DIRECT", units_held: "50.00", average_nav: "60.00", current_nav: "80.00",
          amount_invested: "3000.00", current_value: "4000.00", current_profit_total: "1000.00",
          realized_gain: "0.00", unrealized_gain: "1000.00", today_gain: "20.00",
        },
        {
          scheme_id: "scheme-B", scheme_name: "Bob Fund", household_member_id: "m-2", household_member_name: "Bob",
          plan_type: "DIRECT", units_held: "50.00", average_nav: "60.00", current_nav: "80.00",
          amount_invested: "3000.00", current_value: "4000.00", current_profit_total: "1000.00",
          realized_gain: "0.00", unrealized_gain: "1000.00", today_gain: "20.00",
        },
      ],
    };
    vi.mocked(api.getAggregateHoldings).mockResolvedValue(aggregateFixture as any);
    vi.mocked(api.getAggregateAllocation).mockResolvedValue({
      members: aggregateFixture.members,
      allocation: { by_asset_class: [], by_amc: [], total_value: "8000.00" },
    } as any);

    const { rerender } = render(<DashboardView viewMode="aggregate" memberId={null} />);

    await waitFor(() => {
      expect(screen.getByText("Alice Fund")).toBeInTheDocument();
      expect(screen.getByText("Bob Fund")).toBeInTheDocument();
    });

    // The member filter only renders in aggregate view.
    const filterTrigger = screen.getByLabelText("Filter holdings by family member");
    expect(filterTrigger).toBeInTheDocument();

    fireEvent.pointerDown(filterTrigger);
    fireEvent.click(filterTrigger);

    const bobOption = await screen.findByText("Bob", { selector: '[role="option"] *, [role="option"]' });
    fireEvent.click(bobOption);

    await waitFor(() => {
      expect(screen.queryByText("Alice Fund")).not.toBeInTheDocument();
      expect(screen.getByText("Bob Fund")).toBeInTheDocument();
    });

    // Switching to a single-member view hides the filter entirely.
    vi.mocked(api.getMemberHoldings).mockResolvedValue([aggregateFixture.holdings[0]] as any);
    vi.mocked(api.getMemberAllocation).mockResolvedValue({
      by_asset_class: [],
      by_amc: [],
      total_value: "4000.00",
    });
    rerender(<DashboardView viewMode="member" memberId="m-1" />);

    await waitFor(() => {
      expect(screen.getByText("Alice Fund")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Filter holdings by family member")).not.toBeInTheDocument();
  });
});

