import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MainDashboardFlow } from "./MainDashboardFlow";
import * as authApi from "../auth/api";
import * as dashboardApi from "./api";

vi.mock("../auth/api", () => ({
  getHouseholdMembers: vi.fn(),
}));

vi.mock("./api", () => ({
  getMemberHoldings: vi.fn(),
  getMemberAllocation: vi.fn(),
  getMemberSips: vi.fn(),
  getMemberSipsMonthly: vi.fn(),
  getAggregateHoldings: vi.fn(),
  getAggregateAllocation: vi.fn(),
  getAggregateSips: vi.fn(),
  getAggregateSipsMonthly: vi.fn(),
}));

vi.mock("../analytics/AnalyticsView", () => ({
  AnalyticsView: () => <div>Analytics test view</div>,
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    me: { user_id: "u-1", phone_number: "+919999999999", email: "alice@example.com" },
    loading: false,
    logout: vi.fn(),
  }),
}));

describe("MainDashboardFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    vi.mocked(dashboardApi.getMemberSips).mockResolvedValue([]);
    vi.mocked(dashboardApi.getAggregateSips).mockResolvedValue({ members: [], sips: [] });
    vi.mocked(dashboardApi.getMemberSipsMonthly).mockResolvedValue([]);
    vi.mocked(dashboardApi.getAggregateSipsMonthly).mockResolvedValue({ members: [], sips: [] });
  });

  it("records tab changes in browser history and restores Dashboard on Back", async () => {
    vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null },
      { id: "m-2", name: "Bob", relationship: "spouse", relationship_other_label: null },
    ]);
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({ members: [], holdings: [] });
    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
      members: [],
      allocation: { by_asset_class: [], by_amc: [], total_value: "0.00" },
    });

    render(<MainDashboardFlow />);
    await screen.findByText("No Holdings Found");

    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    expect(screen.getByText("Analytics test view")).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ unifolioTab: "analytics" });

    act(() => {
      window.history.replaceState({ unifolioTab: "dashboard" }, "", "/");
      fireEvent.popState(window);
    });

    expect(await screen.findByText("No Holdings Found")).toBeInTheDocument();
  });

  it("opens Profile as a history-backed tab with account controls", async () => {
    vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null },
    ]);
    vi.mocked(dashboardApi.getMemberHoldings).mockResolvedValue([]);
    vi.mocked(dashboardApi.getMemberAllocation).mockResolvedValue({
      by_asset_class: [],
      by_amc: [],
      total_value: "0.00",
    });

    render(<MainDashboardFlow />);
    await screen.findByText("No Holdings Found");

    fireEvent.click(screen.getByRole("button", { name: /profile/i }));

    expect(await screen.findByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByText("Account Info")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("+919999999999")).toBeInTheDocument();
    expect(screen.getByText("Import History")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
    expect(screen.getByText("Danger Zone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ unifolioTab: "profile" });
  });

  it("fetches household members and defaults landing view", async () => {
    vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null },
      { id: "m-2", name: "Bob", relationship: "spouse", relationship_other_label: null },
    ]);

    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({
      members: [
        { id: "m-1", name: "Alice", has_data: true },
        { id: "m-2", name: "Bob", has_data: true },
      ],
      holdings: [],
    });

    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
      members: [
        { id: "m-1", name: "Alice", has_data: true },
        { id: "m-2", name: "Bob", has_data: true },
      ],
      allocation: { by_asset_class: [], by_amc: [], total_value: "0.00" },
    });

    render(<MainDashboardFlow />);

    await waitFor(() => {
      expect(screen.getByText("Unifolio")).toBeInTheDocument();
      expect(screen.getByText("Family Combined")).toBeInTheDocument();
    });

    const toggles = screen.getAllByLabelText("Toggle theme");
    expect(toggles).toHaveLength(1);
  });

  it("renders exactly one theme toggle on the Add Data screen", async () => {
    vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null },
    ]);

    vi.mocked(dashboardApi.getMemberHoldings).mockResolvedValue([]);
    vi.mocked(dashboardApi.getMemberAllocation).mockResolvedValue({
      by_asset_class: [],
      by_amc: [],
      total_value: "0.00",
    });

    render(<MainDashboardFlow />);

    await waitFor(() => {
      expect(screen.getByText("+ Add Data")).toBeInTheDocument();
    });

    const addDataBtn = screen.getByText("+ Add Data");
    fireEvent.click(addDataBtn);

    await waitFor(() => {
      expect(screen.getByText("Back to Dashboard")).toBeInTheDocument();
    });

    const toggles = screen.getAllByLabelText("Toggle theme");
    expect(toggles).toHaveLength(1);
  });
});
