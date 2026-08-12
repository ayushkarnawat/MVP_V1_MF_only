import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MobileDashboardView } from "./MobileDashboardView";
import * as dashboardApi from "@/features/dashboard/api";
import * as importApi from "@/features/import/api";
import * as authApi from "@/features/auth/api";

vi.mock("@/features/dashboard/api", () => ({
  getAggregateHoldings: vi.fn(),
  getAggregateAllocation: vi.fn(),
  getMemberHoldings: vi.fn(),
  getMemberAllocation: vi.fn(),
}));

vi.mock("@/features/import/api", () => ({
  getMemberCoverageGaps: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/auth/api", () => ({
  listHouseholdMembers: vi.fn().mockResolvedValue([]),
}));

describe("MobileDashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(importApi.getMemberCoverageGaps).mockResolvedValue([]);
    vi.mocked(authApi.listHouseholdMembers).mockResolvedValue([]);
  });

  it("renders S21 Empty State when portfolio has 0 holdings", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [],
      members: [],
    });
    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
      members: [],
      allocation: {
        by_asset_class: [],
        by_amc: [],
        total_value: "0.00",
      },
    });

    render(<MobileDashboardView />);

    await waitFor(() => {
      expect(screen.getByText("No Holdings Found")).toBeInTheDocument();
      expect(screen.getByText(/\+ Upload CAS Statement/i)).toBeInTheDocument();
    });
  });

  it("renders portfolio hero, allocation card, and holdings list with search filtering", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [
        {
          scheme_id: "scheme-101",
          scheme_name: "HDFC Top 100 Fund",
          amc_name: "HDFC Mutual Fund",
          household_member_id: "m-1",
          household_member_name: "Ayush",
          plan_type: "DIRECT",
          units_held: "100.00",
          average_nav: "50.00",
          current_nav: "75.00",
          amount_invested: "5000.00",
          current_value: "7500.00",
          current_profit_total: "2500.00",
          realized_gain: "0.00",
          unrealized_gain: "2500.00",
          today_gain: "25.00",
        },
        {
          scheme_id: "scheme-102",
          scheme_name: "Parag Parikh Flexi Cap Fund",
          amc_name: "PPFAS Mutual Fund",
          household_member_id: "m-1",
          household_member_name: "Ayush",
          plan_type: "DIRECT",
          units_held: "50.00",
          average_nav: "60.00",
          current_nav: "90.00",
          amount_invested: "3000.00",
          current_value: "4500.00",
          current_profit_total: "1500.00",
          realized_gain: "0.00",
          unrealized_gain: "1500.00",
          today_gain: "15.00",
        },
      ],
      members: [{ id: "m-1", name: "Ayush", has_data: true }],
    });

    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
      members: [{ id: "m-1", name: "Ayush", has_data: true }],
      allocation: {
        by_asset_class: [
          { label: "Equity", current_value: "12000.00", percentage: 100.0 },
        ],
        by_amc: [
          { label: "HDFC Mutual Fund", current_value: "7500.00", percentage: 62.5 },
          { label: "PPFAS Mutual Fund", current_value: "4500.00", percentage: 37.5 },
        ],
        total_value: "12000.00",
      },
    });

    render(<MobileDashboardView />);

    await waitFor(() => {
      expect(screen.getByText("Total Portfolio Value")).toBeInTheDocument();
      expect(screen.getByText("Portfolio Allocation")).toBeInTheDocument();
      expect(screen.getByText("HDFC Top 100 Fund")).toBeInTheDocument();
      expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
      expect(screen.getByText("2 holdings")).toBeInTheDocument();
    });

    // Test dynamic search filter
    const searchInput = screen.getByPlaceholderText("Search funds or AMCs...");
    fireEvent.change(searchInput, { target: { value: "Parag" } });

    expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
    expect(screen.queryByText("HDFC Top 100 Fund")).not.toBeInTheDocument();
  });

  it("renders pending family imports strip when members have no data", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [
        {
          scheme_id: "scheme-101",
          scheme_name: "HDFC Top 100 Fund",
          amc_name: "HDFC Mutual Fund",
          household_member_id: "m-1",
          household_member_name: "Ayush",
          plan_type: "DIRECT",
          units_held: "100.00",
          average_nav: "50.00",
          current_nav: "75.00",
          amount_invested: "5000.00",
          current_value: "7500.00",
          current_profit_total: "2500.00",
          realized_gain: "0.00",
          unrealized_gain: "2500.00",
          today_gain: "25.00",
        },
      ],
      members: [
        { id: "m-1", name: "Ayush", has_data: true },
        { id: "m-2", name: "Spouse", has_data: false },
      ],
    });

    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
      members: [
        { id: "m-1", name: "Ayush", has_data: true },
        { id: "m-2", name: "Spouse", has_data: false },
      ],
      allocation: {
        by_asset_class: [
          { label: "Equity", current_value: "7500.00", percentage: 100.0 },
        ],
        by_amc: [],
        total_value: "7500.00",
      },
    });

    render(<MobileDashboardView />);

    await waitFor(() => {
      expect(screen.getByText("Pending Family Imports")).toBeInTheDocument();
      expect(screen.getByText("Spouse")).toBeInTheDocument();
    });
  });

  it("opens full-screen MobileFundDetailView when a holding card is tapped and returns on Back with scroll reset", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [
        {
          scheme_id: "scheme-101",
          scheme_name: "HDFC Top 100 Fund",
          amc_name: "HDFC Mutual Fund",
          household_member_id: "m-1",
          household_member_name: "Ayush",
          plan_type: "DIRECT",
          units_held: "100.00",
          average_nav: "50.00",
          current_nav: "75.00",
          amount_invested: "5000.00",
          current_value: "7500.00",
          current_profit_total: "2500.00",
          realized_gain: "0.00",
          unrealized_gain: "2500.00",
          today_gain: "25.00",
        },
        {
          scheme_id: "scheme-102",
          scheme_name: "Parag Parikh Flexi Cap Fund",
          amc_name: "PPFAS Mutual Fund",
          household_member_id: "m-1",
          household_member_name: "Ayush",
          plan_type: "DIRECT",
          units_held: "50.00",
          average_nav: "60.00",
          current_nav: "90.00",
          amount_invested: "3000.00",
          current_value: "4500.00",
          current_profit_total: "1500.00",
          realized_gain: "0.00",
          unrealized_gain: "1500.00",
          today_gain: "15.00",
        },
      ],
      members: [],
    });
    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
      members: [],
      allocation: {
        by_asset_class: [],
        by_amc: [],
        total_value: "12000.00",
      },
    });

    const parentContainer = document.createElement("div");
    document.body.appendChild(parentContainer);

    render(<MobileDashboardView />, { container: parentContainer });

    await waitFor(() => {
      expect(screen.getByText("HDFC Top 100 Fund")).toBeInTheDocument();
    });

    // Simulate scrolled container (e.g. user scrolled down dashboard to click holding)
    parentContainer.scrollTop = 600;
    expect(parentContainer.scrollTop).toBe(600);

    // Tap holding card to open full-screen detail view
    fireEvent.click(screen.getByText("HDFC Top 100 Fund"));

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("Holding Details")).toBeInTheDocument();
    expect(screen.getAllByText("HDFC Mutual Fund").length).toBeGreaterThanOrEqual(1);

    // Container scrollTop must be reset to 0
    expect(parentContainer.scrollTop).toBe(0);

    // Tap Back button to return to Dashboard
    fireEvent.click(screen.getByLabelText("Back to holdings"));
    expect(screen.getByText("Total Portfolio Value")).toBeInTheDocument();

    // Scroll down again and tap the second holding
    parentContainer.scrollTop = 400;
    expect(parentContainer.scrollTop).toBe(400);

    fireEvent.click(screen.getByText("Parag Parikh Flexi Cap Fund"));
    expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
    expect(parentContainer.scrollTop).toBe(0);

    document.body.removeChild(parentContainer);
  });

  it("does not trap the user when switching to a member with 0 holdings in Per Member view", async () => {
    vi.mocked(authApi.listHouseholdMembers).mockResolvedValue([
      { id: "m-1", name: "Ayush", relationship: "self", relationship_other_label: null },
      { id: "m-2", name: "Spouse", relationship: "spouse", relationship_other_label: null },
    ]);

    // Member 1 has data, Member 2 has 0 holdings
    vi.mocked(dashboardApi.getMemberHoldings).mockImplementation(async (memberId) => {
      if (memberId === "m-1") {
        return [
          {
            scheme_id: "scheme-101",
            scheme_name: "HDFC Top 100 Fund",
            amc_name: "HDFC Mutual Fund",
            household_member_id: "m-1",
            household_member_name: "Ayush",
            plan_type: "DIRECT",
            units_held: "100.00",
            average_nav: "50.00",
            current_nav: "75.00",
            amount_invested: "5000.00",
            current_value: "7500.00",
            current_profit_total: "2500.00",
            realized_gain: "0.00",
            unrealized_gain: "2500.00",
            today_gain: "25.00",
          },
        ];
      }
      return [];
    });

    vi.mocked(dashboardApi.getMemberAllocation).mockResolvedValue({
      by_asset_class: [],
      by_amc: [],
      total_value: "0.00",
    });

    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [],
      members: [
        { id: "m-1", name: "Ayush", has_data: true },
        { id: "m-2", name: "Spouse", has_data: false },
      ],
    });

    render(<MobileDashboardView />);

    // Switch to Per Member view
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Per Member" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Per Member" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Select household member")).toBeInTheDocument();
    });

    // Switch to Spouse (m-2) who has 0 holdings
    const memberSelect = screen.getByLabelText("Select household member");
    fireEvent.change(memberSelect, { target: { value: "m-2" } });

    // Verify empty state is rendered, BUT the member dropdown is STILL present and not trapped
    await waitFor(() => {
      expect(screen.getByText("No Holdings Found")).toBeInTheDocument();
      expect(screen.getByLabelText("Select household member")).toBeInTheDocument();
    });

    // Switch back to Ayush (m-1)
    fireEvent.change(screen.getByLabelText("Select household member"), { target: { value: "m-1" } });

    await waitFor(() => {
      expect(screen.getByText("HDFC Top 100 Fund")).toBeInTheDocument();
    });
  });

  it("calls onNavigateImport with specific member ID when + Import is clicked on a pending member", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [
        {
          scheme_id: "scheme-101",
          scheme_name: "HDFC Top 100 Fund",
          amc_name: "HDFC Mutual Fund",
          household_member_id: "m-1",
          household_member_name: "Ayush",
          plan_type: "DIRECT",
          units_held: "100.00",
          average_nav: "50.00",
          current_nav: "75.00",
          amount_invested: "5000.00",
          current_value: "7500.00",
          current_profit_total: "2500.00",
          realized_gain: "0.00",
          unrealized_gain: "2500.00",
          today_gain: "25.00",
        },
      ],
      members: [
        { id: "m-1", name: "Ayush", has_data: true },
        { id: "m-2", name: "Spouse", has_data: false },
      ],
    });

    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
      members: [],
      allocation: {
        by_asset_class: [],
        by_amc: [],
        total_value: "7500.00",
      },
    });

    const handleNavigateImport = vi.fn();
    render(<MobileDashboardView onNavigateImport={handleNavigateImport} />);

    await waitFor(() => {
      expect(screen.getByText("Pending Family Imports")).toBeInTheDocument();
      expect(screen.getByText("No CAS Data")).toBeInTheDocument();
    });

    // Click + Import for Spouse
    const importBtn = screen.getByRole("button", { name: "+ Import" });
    fireEvent.click(importBtn);

    expect(handleNavigateImport).toHaveBeenCalledWith("m-2");
  });
});
