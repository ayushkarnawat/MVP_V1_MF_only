import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MobileHoldingsView } from "./MobileHoldingsView";
import * as dashboardApi from "@/features/dashboard/api";
import * as authApi from "@/features/auth/api";

vi.mock("@/features/dashboard/api", () => ({
  getAggregateHoldings: vi.fn(),
  getMemberHoldings: vi.fn(),
}));

vi.mock("@/features/auth/api", () => ({
  listHouseholdMembers: vi.fn().mockResolvedValue([]),
}));

describe("MobileHoldingsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.listHouseholdMembers).mockResolvedValue([]);
  });

  it("renders S21 Empty State when portfolio has 0 holdings", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [],
      members: [],
    });

    render(<MobileHoldingsView />);

    await waitFor(() => {
      expect(screen.getByText("No Holdings Found")).toBeInTheDocument();
      expect(screen.getByText(/\+ Upload CAS Statement/i)).toBeInTheDocument();
    });
  });

  it("renders summary-first holding cards with FundSignal, Scheme name, Member, and Current Value", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [
        {
          scheme_id: "scheme-101",
          scheme_name: "Parag Parikh Flexi Cap Fund",
          amc_name: "PPFAS Mutual Fund",
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
      members: [{ id: "m-1", name: "Ayush", has_data: true }],
    });

    render(<MobileHoldingsView />);

    await waitFor(() => {
      expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
      expect(screen.getByText("Ayush")).toBeInTheDocument();
      expect(screen.getByText("₹7,500")).toBeInTheDocument();
      expect(screen.getByText("1 holding")).toBeInTheDocument();
    });
  });

  it("filters holding cards dynamically via search input", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [
        {
          scheme_id: "scheme-101",
          scheme_name: "Parag Parikh Flexi Cap Fund",
          amc_name: "PPFAS Mutual Fund",
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
          scheme_name: "HDFC Top 100 Fund",
          amc_name: "HDFC Mutual Fund",
          household_member_id: "m-1",
          household_member_name: "Ayush",
          plan_type: "REGULAR",
          units_held: "50.00",
          average_nav: "60.00",
          current_nav: "80.00",
          amount_invested: "3000.00",
          current_value: "4000.00",
          current_profit_total: "1000.00",
          realized_gain: "0.00",
          unrealized_gain: "1000.00",
          today_gain: "10.00",
        },
      ],
      members: [],
    });

    render(<MobileHoldingsView />);

    await waitFor(() => {
      expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
      expect(screen.getByText("HDFC Top 100 Fund")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search funds or AMCs...");
    fireEvent.change(searchInput, { target: { value: "Parag" } });

    expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
    expect(screen.queryByText("HDFC Top 100 Fund")).not.toBeInTheDocument();
  });

  it("opens dedicated MobileFundDetailView when a holding card is tapped and returns on Back", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [
        {
          scheme_id: "scheme-101",
          scheme_name: "Parag Parikh Flexi Cap Fund",
          amc_name: "PPFAS Mutual Fund",
          household_member_id: "m-1",
          household_member_name: "Ayush",
          plan_type: "DIRECT",
          units_held: "100.000",
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
      members: [],
    });

    render(<MobileHoldingsView />);

    await waitFor(() => {
      expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
    });

    // Click card to open full-screen detail view
    fireEvent.click(screen.getByText("Parag Parikh Flexi Cap Fund"));

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("Holding Details")).toBeInTheDocument();
    expect(screen.getAllByText("PPFAS Mutual Fund").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Avg NAV")).toBeInTheDocument();

    // Click Back to return to holdings list
    fireEvent.click(screen.getByLabelText("Back to holdings"));
    expect(screen.getByText("All Holdings")).toBeInTheDocument();
  });
});
