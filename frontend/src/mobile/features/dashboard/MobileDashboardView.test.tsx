import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
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
  getAggregateDistributorComparison: vi.fn(),
  getMemberDistributorComparison: vi.fn(),
  getFundNavHistory: vi.fn().mockResolvedValue({
    scheme_id: "",
    period: "1Y",
    requested_period: "1Y",
    clamped: false,
    points: [],
    overall_return_pct: null,
  }),
}));

vi.mock("@/features/import/api", () => ({
  getMemberCoverageGaps: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/auth/api", () => ({
  listHouseholdMembers: vi.fn().mockResolvedValue([]),
  updateMemberProfile: vi.fn(),
  mergeMemberInto: vi.fn(),
}));

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ me: { phone_number: "+919800000001", email: "ayush@example.com" } }),
}));

describe("MobileDashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(importApi.getMemberCoverageGaps).mockResolvedValue([]);
    vi.mocked(authApi.listHouseholdMembers).mockResolvedValue([]);
  });


  it("renders the dismissible dashboard notice above an empty portfolio", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({ holdings: [], members: [] });
    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({ members: [], allocation: { by_asset_class: [], by_amc: [], total_value: "0.00" } });
    const dismiss = vi.fn();
    render(<MobileDashboardView importNotice={{ text: "This statement was already imported" }} onDismissImportNotice={dismiss} />);
    expect(screen.getByText("This statement was already imported")).toBeVisible();
    await screen.findByText("No Holdings Found");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss import notice" }));
    expect(dismiss).toHaveBeenCalledTimes(1);
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
          plan_type: "direct",
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
          plan_type: "direct",
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
      expect(screen.getByText("Family total")).toBeInTheDocument();
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

  it("excludes NAV-unavailable holdings from NAV-dependent portfolio totals", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [
        {
          scheme_id: "scheme-valued",
          scheme_name: "Valued Fund",
          household_member_id: "m-1",
          household_member_name: "Ayush",
          plan_type: "direct",
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
          scheme_id: "scheme-no-nav",
          scheme_name: "NAV Missing Fund",
          household_member_id: "m-1",
          household_member_name: "Ayush",
          plan_type: "direct",
          units_held: "80.00",
          average_nav: "50.00",
          current_nav: null,
          current_nav_date: null,
          amount_invested: "4000.00",
          current_value: null,
          current_profit_total: null,
          realized_gain: "0.00",
          unrealized_gain: null,
          today_gain: null,
          nav_unavailable: true,
        },
      ],
      members: [{ id: "m-1", name: "Ayush", has_data: true }],
    });
    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
      members: [{ id: "m-1", name: "Ayush", has_data: true }],
      allocation: {
        by_asset_class: [{ label: "Equity", current_value: "7500.00", percentage: 100 }],
        by_amc: [],
        total_value: "7500.00",
        nav_unavailable_count: 1,
      },
    });

    render(<MobileDashboardView />);

    // All hero figures exclude the unpriced holding (4000 invested).
    const investedLabel = await screen.findByText("Total Invested");
    expect(within(investedLabel.parentElement!).getByText("₹5,000")).toBeInTheDocument();

    expect(screen.getByText("1 funds without a price aren’t included")).toBeInTheDocument();
  });

  it("opens the portfolio-wide distributor comparison from the embedded Holdings header", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [
        {
          scheme_id: "scheme-101",
          scheme_name: "HDFC Top 100 Fund",
          amc_name: "HDFC Mutual Fund",
          household_member_id: "m-1",
          household_member_name: "Ayush",
          plan_type: "direct",
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
    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
      members: [{ id: "m-1", name: "Ayush", has_data: true }],
      allocation: {
        by_asset_class: [
          { label: "Equity", current_value: "7500.00", percentage: 100.0 },
        ],
        by_amc: [],
        total_value: "7500.00",
      },
    });
    vi.mocked(dashboardApi.getAggregateDistributorComparison).mockResolvedValue({
      members: [],
      rows: [],
    });

    render(<MobileDashboardView />);

    await waitFor(() => {
      expect(screen.getByText("Holdings")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /compare distributors/i }));

    await waitFor(() => {
      expect(dashboardApi.getAggregateDistributorComparison).toHaveBeenCalled();
      expect(screen.getByText("DISTRIBUTOR COMPARISON")).toBeInTheDocument();
    });
  });

  it("filters the Holdings list by family member in Family Combined view, combined with search", async () => {
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      holdings: [
        {
          scheme_id: "scheme-101",
          scheme_name: "HDFC Top 100 Fund",
          amc_name: "HDFC Mutual Fund",
          household_member_id: "m-1",
          household_member_name: "Ayush",
          plan_type: "direct",
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
          household_member_id: "m-2",
          household_member_name: "Spouse",
          plan_type: "direct",
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
      members: [
        { id: "m-1", name: "Ayush", has_data: true },
        { id: "m-2", name: "Spouse", has_data: true },
      ],
    });

    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
      members: [
        { id: "m-1", name: "Ayush", has_data: true },
        { id: "m-2", name: "Spouse", has_data: true },
      ],
      allocation: {
        by_asset_class: [
          { label: "Equity", current_value: "12000.00", percentage: 100.0 },
        ],
        by_amc: [],
        total_value: "12000.00",
      },
    });

    render(<MobileDashboardView />);

    await waitFor(() => {
      expect(screen.getByText("HDFC Top 100 Fund")).toBeInTheDocument();
      expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
      expect(screen.getByText("2 holdings")).toBeInTheDocument();
    });

    // Filter Holdings list down to just Spouse's holding
    const memberFilterTrigger = screen.getByLabelText(
      "Filter holdings by family member"
    );
    fireEvent.keyDown(memberFilterTrigger, { key: "ArrowDown" });
    const spouseOption = await screen.findByRole("option", { name: "Spouse" });
    fireEvent.click(spouseOption);

    await waitFor(() => {
      expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
      expect(screen.queryByText("HDFC Top 100 Fund")).not.toBeInTheDocument();
      expect(screen.getByText("1 holding")).toBeInTheDocument();
    });

    // Combined with search: narrowing the search term further while the
    // member filter is still active should exclude the remaining holding too
    const searchInput = screen.getByPlaceholderText("Search funds or AMCs...");
    fireEvent.change(searchInput, { target: { value: "HDFC" } });

    await waitFor(() => {
      expect(screen.queryByText("Parag Parikh Flexi Cap Fund")).not.toBeInTheDocument();
      expect(screen.getByText("No matching funds")).toBeInTheDocument();
    });
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
          plan_type: "direct",
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
          plan_type: "direct",
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
          plan_type: "direct",
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
    expect(screen.getByText("Family total")).toBeInTheDocument();

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
      { id: "m-1", name: "Ayush", relationship: "self", relationship_other_label: null, origin: "onboarding", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false },
      { id: "m-2", name: "Spouse", relationship: "spouse", relationship_other_label: null, origin: "manual", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false },
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
            plan_type: "direct",
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
    const memberTrigger = screen.getByLabelText("Select household member");
    fireEvent.keyDown(memberTrigger, { key: "ArrowDown" });
    const spouseOption = await screen.findByRole("option", { name: /spouse/i });
    fireEvent.click(spouseOption);

    // Verify empty state is rendered, BUT the member dropdown is STILL present and not trapped
    await waitFor(() => {
      expect(screen.getByText("No Holdings Found")).toBeInTheDocument();
      expect(screen.getByLabelText("Select household member")).toBeInTheDocument();
    });

    // Switch back to Ayush (m-1)
    const memberTrigger2 = screen.getByLabelText("Select household member");
    fireEvent.keyDown(memberTrigger2, { key: "ArrowDown" });
    const ayushOption = await screen.findByRole("option", { name: /ayush/i });
    fireEvent.click(ayushOption);

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
          plan_type: "direct",
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
  describe("profile completion (mobile)", () => {
    const base = {
      relationship_other_label: null, origin: "cas", phone_number: null, email: null, name_from_statement: false,
      pan_conflict: null, pan_editable: false, removed_with_last_import: false,
    };
    const me = { ...base, id: "m-1", name: "Ayush", relationship: "self", origin: "self", pan_masked: "AB******4F", profile_completion: 100, missing_fields: [] };
    const ramesh = { ...base, id: "m-2", name: "Ramesh Sharma", relationship: null, pan_masked: "BX******8L", profile_completion: 40, missing_fields: ["relationship", "phone_number", "email"] };

    async function pickRamesh(members: object[], name: RegExp = /ramesh sharma/i) {
      vi.mocked(authApi.listHouseholdMembers).mockResolvedValue(members as any);
      vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({ holdings: [], members: [] } as any);
      vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({ members: [], allocation: { by_asset_class: [], by_amc: [], total_value: "0.00" } } as any);
      vi.mocked(dashboardApi.getMemberHoldings).mockResolvedValue([]);
      vi.mocked(dashboardApi.getMemberAllocation).mockResolvedValue({ by_asset_class: [], by_amc: [], total_value: "0.00" } as any);
      render(<MobileDashboardView />);
      fireEvent.click(await screen.findByRole("button", { name: "Per Member" }));
      const trigger = await screen.findByLabelText("Select household member");
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      const option = await screen.findByRole("option", { name });
      expect(option).not.toHaveTextContent("(null)");
      expect(option).not.toHaveTextContent(/add details first/i);
      fireEvent.click(option);
    }

    it("picking a detected member loads their data", async () => {
      await pickRamesh([me, ramesh]);
      await waitFor(() => expect(dashboardApi.getMemberHoldings).toHaveBeenCalledWith("m-2", expect.anything()));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("shows the nudge under the member picker and opens Complete profile", async () => {
      await pickRamesh([me, ramesh]);
      fireEvent.click(await screen.findByText(/40% complete/));
      expect(await screen.findByRole("heading", { name: "Complete Ramesh Sharma’s profile" })).toBeInTheDocument();
    });

    it("saving reloads members and the dialog keeps showing its own success stage", async () => {
      vi.mocked(authApi.updateMemberProfile).mockResolvedValue({ ...ramesh, relationship: "spouse", profile_completion: 100, missing_fields: [] } as any);
      await pickRamesh([me, ramesh]);
      fireEvent.click(await screen.findByText(/40% complete/));
      await screen.findByRole("heading", { name: "Complete Ramesh Sharma’s profile" });
      const calls = vi.mocked(authApi.listHouseholdMembers).mock.calls.length;
      fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9800000002" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(vi.mocked(authApi.listHouseholdMembers).mock.calls.length).toBeGreaterThan(calls));
      // onSaved fires before the dialog's own stage; reloading must not unmount it.
      expect(await screen.findByRole("heading", { name: "Ramesh Sharma’s profile is complete" })).toBeInTheDocument();
    });

    it("Self's popup has no Change in Account Info link: mobile has nowhere to send it", async () => {
      await pickRamesh([{ ...me, profile_completion: 60, missing_fields: ["pan", "email"] }, ramesh], /ayush/i);
      fireEvent.click(await screen.findByText(/60% complete/));
      expect(await screen.findByRole("heading", { name: "Complete Ayush’s profile" })).toBeInTheDocument();
      expect(screen.queryByText("Change in Account Info")).toBeNull();
    });

    it("pan conflict member shows the red banner", async () => {
      await pickRamesh([me, { ...ramesh, pan_conflict: "other_account" }]);
      expect(await screen.findByRole("alert")).toHaveTextContent("PAN is on another Unifolio account");
    });
  });
  it("hero excludes unpriced holdings from value and invested", async () => {
    const base = { scheme_id: "s1", scheme_name: "Known", household_member_id: "m1", household_member_name: "Neha", plan_type: "direct" as const, units_held: "1", average_nav: "100", current_nav: "120", amount_invested: "100", current_value: "120", current_profit_total: "20", realized_gain: "0", unrealized_gain: "20", today_gain: "0" };
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({ holdings: [base, { ...base, scheme_id: "s2", scheme_name: "Unpriced", amount_invested: "50", nav_unavailable: true, current_nav: null, current_value: null, unrealized_gain: null }], members: [] });
    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({ allocation: { by_asset_class: [], by_amc: [], total_value: "999" }, members: [] });
    render(<MobileDashboardView />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("₹120");
    expect(screen.getByText("Total Invested").parentElement).toHaveTextContent("₹100");
  });

});
