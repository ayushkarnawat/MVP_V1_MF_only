vi.mock("../dev/useDevToolsEnabled", () => ({ useDevToolsEnabled: () => false }));
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MainDashboardFlow } from "./MainDashboardFlow";
import * as authApi from "../auth/api";
import * as dashboardApi from "./api";
import { ApiError } from "../../lib/apiClient";

vi.mock("../auth/api", () => ({
  getHouseholdMembers: vi.fn(),
  updateMemberProfile: vi.fn(),
  mergeMemberInto: vi.fn(),
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

vi.mock("../import/ImportFlow", () => ({
  ImportFlow: ({ householdMemberId, onDone }: { householdMemberId: string; onDone?: (notice?: { text: string; details?: string[] }) => void }) => (
    <div data-testid="import-for">{householdMemberId}<button onClick={() => onDone?.({ text: "This statement was already imported" })}>Close duplicate import</button><button onClick={() => onDone?.({ text: "12 transactions added · 2 already saved", details: ["Alice: 3 added", "Ramesh: 9 added, 2 already saved", "History starts mid-year."] })}>Finish import</button></div>
  ),
}));

vi.mock("../history/HistoryView", () => ({
  HistoryView: ({ viewMode }: { viewMode: string }) => <div>History test view ({viewMode})</div>,
}));

vi.mock("../analytics/AnalyticsView", () => ({
  AnalyticsView: () => <div>Analytics test view</div>,
}));

vi.mock("../scenarios/ScenariosScreen", () => ({
  ScenariosScreen: () => <div>Scenarios test view</div>,
}));

vi.mock("../auth/AuthContext", () => {
  // Stable identity: the flow reloads members whenever `me` changes.
  const value = {
    me: { user_id: "u-1", phone_number: "+919999999999", email: "alice@example.com" },
    loading: false,
    logout: vi.fn(),
  };
  return { useAuth: () => value };
});

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
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null, origin: "onboarding", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false },
      { id: "m-2", name: "Bob", relationship: "spouse", relationship_other_label: null, origin: "manual", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false },
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

    fireEvent.click(screen.getByRole("button", { name: "Scenarios" }));
    expect(screen.getByText("Scenarios test view")).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ unifolioTab: "scenarios" });
    act(() => { fireEvent.popState(window, { state: { unifolioTab: "analytics" } }); });
    expect(screen.getByText("Analytics test view")).toBeInTheDocument();
    act(() => { fireEvent.popState(window, { state: { unifolioTab: "scenarios" } }); });
    expect(screen.getByText("Scenarios test view")).toBeInTheDocument();

    act(() => {
      window.history.replaceState({ unifolioTab: "dashboard" }, "", "/");
      fireEvent.popState(window);
    });

    expect(await screen.findByText("No Holdings Found")).toBeInTheDocument();
  });

  it("opens the History tab and keeps it on Back/Forward", async () => {
    vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null, origin: "onboarding", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false },
      { id: "m-2", name: "Bob", relationship: "spouse", relationship_other_label: null, origin: "manual", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false },
    ]);
    vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({ members: [], holdings: [] });
    vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
      members: [],
      allocation: { by_asset_class: [], by_amc: [], total_value: "0.00" },
    });
    render(<MainDashboardFlow />);
    await screen.findByText("No Holdings Found");
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText("History test view (aggregate)")).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ unifolioTab: "history" });
    // Back leaves History (the browser delivers the earlier entry's state)…
    act(() => {
      fireEvent.popState(window, { state: { unifolioTab: "dashboard" } });
    });
    expect(screen.queryByText("History test view (aggregate)")).not.toBeInTheDocument();
    // …and Forward returns to it.
    act(() => {
      fireEvent.popState(window, { state: { unifolioTab: "history" } });
    });
    expect(screen.getByText("History test view (aggregate)")).toBeInTheDocument();
  });

  it("opens Profile as a history-backed tab with account controls", async () => {
    vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null, origin: "onboarding", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false },
    ]);
    vi.mocked(dashboardApi.getMemberHoldings).mockResolvedValue([]);
    vi.mocked(dashboardApi.getMemberAllocation).mockResolvedValue({
      by_asset_class: [],
      by_amc: [],
      total_value: "0.00",
    });

    render(<MainDashboardFlow />);
    await screen.findByText("No Holdings Found");

    fireEvent.click(screen.getByRole("button", { name: "Profile" }));

    expect(await screen.findByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Account Info" })).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("+919999999999")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import History" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
    expect(screen.queryByText("Danger Zone")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument();
    expect(window.history.state).toMatchObject({ unifolioTab: "profile" });
  });

  it("fetches household members and defaults landing view", async () => {
    vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null, origin: "onboarding", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false },
      { id: "m-2", name: "Bob", relationship: "spouse", relationship_other_label: null, origin: "manual", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false },
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
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null, origin: "onboarding", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false },
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

  describe("profile completion", () => {
    const base = { relationship_other_label: null, origin: "cas_detected", pan_masked: "BX******8L", phone_number: null, email: null, name_from_statement: true, pan_conflict: null, pan_editable: false, profile_completion: 40, missing_fields: ["relationship", "phone_number", "email"] as string[], removed_with_last_import: false };
    const alice = { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null, origin: "onboarding", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false };
    const ramesh = { ...base, id: "m-2", name: "Ramesh Sharma", relationship: null };
    const members = [alice, ramesh];

    beforeEach(() => {
      vi.mocked(authApi.getHouseholdMembers).mockResolvedValue(members as never);
      vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({ members: [], holdings: [] });
      vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({
        members: [],
        allocation: { by_asset_class: [], by_amc: [], total_value: "0.00" },
      });
      vi.mocked(dashboardApi.getMemberHoldings).mockResolvedValue([]);
      vi.mocked(dashboardApi.getMemberAllocation).mockResolvedValue({ by_asset_class: [], by_amc: [], total_value: "0.00" });
    });

    async function pick(name: RegExp) {
      const trigger = await screen.findByLabelText("Select household member");
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      fireEvent.click(await screen.findByRole("option", { name }));
    }

    async function openRamesh() {
      render(<MainDashboardFlow />);
      fireEvent.click(await screen.findByRole("button", { name: "Per Member" }));
      await pick(/Ramesh Sharma/);
    }

    it("picking a detected member opens their dashboard", async () => {
      await openRamesh();
      await waitFor(() => expect(dashboardApi.getMemberHoldings).toHaveBeenCalledWith("m-2", expect.anything()));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("shows the nudge for an incomplete member on dashboard and analytics tabs", async () => {
      await openRamesh();
      expect(await screen.findByText(/40% complete/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
      expect(await screen.findByText("Analytics test view")).toBeInTheDocument();
      expect(screen.getByText(/40% complete/)).toBeInTheDocument();
    });

    it("clicking the nudge opens Complete profile; saving reloads members and keeps the dialog's own stage", async () => {
      vi.mocked(authApi.updateMemberProfile).mockResolvedValue({ ...ramesh, pan_conflict: "other_account" } as never);
      await openRamesh();
      fireEvent.click(await screen.findByText(/40% complete/));
      expect(await screen.findByRole("heading", { name: "Complete Ramesh Sharma’s profile" })).toBeInTheDocument();
      const calls = vi.mocked(authApi.getHouseholdMembers).mock.calls.length;
      fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9800000002" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(vi.mocked(authApi.getHouseholdMembers).mock.calls.length).toBeGreaterThan(calls));
      // onSaved fires before the dialog's own warning; it must still be shown.
      expect(await screen.findByRole("heading", { name: "Ramesh Sharma’s details are saved" })).toBeInTheDocument();
    });

    it("pan conflict member shows the red banner", async () => {
      vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice, { ...ramesh, pan_conflict: "other_account" }] as never);
      await openRamesh();
      expect(await screen.findByRole("alert")).toHaveTextContent("PAN is on another Unifolio account");
    });

    it("a complete member shows Edit profile instead of the nudge", async () => {
      vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice, { ...ramesh, relationship: "spouse", profile_completion: 100, missing_fields: [] }] as never);
      await openRamesh();
      expect(await screen.findByRole("button", { name: "Edit profile" })).toBeInTheDocument();
      expect(screen.queryByText(/% complete/)).toBeNull();
    });

    it("merge from the profile dialog re-targets selection", async () => {
      vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice, { ...ramesh, pan_masked: null, pan_editable: true }] as never);
      vi.mocked(authApi.updateMemberProfile).mockRejectedValue(
        new ApiError(409, {
          code: "pan_belongs_to_other_member",
          message: "x",
          details: { can_merge: true, other_member_id: "m-1", other_member_name: "Alice", source_fund_count: 1 },
        }),
      );
      vi.mocked(authApi.mergeMemberInto).mockResolvedValue({ folios_moved: 1, transactions_dropped: 0 });
      await openRamesh();
      fireEvent.click(await screen.findByText(/40% complete/));
      await screen.findByRole("heading", { name: "Complete Ramesh Sharma’s profile" });
      vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice] as never);
      fireEvent.change(screen.getByLabelText("PAN"), { target: { value: "BXQPS5678L" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      fireEvent.click(await screen.findByRole("button", { name: /Merge/ }));
      await waitFor(() => expect(authApi.mergeMemberInto).toHaveBeenCalledWith("m-2", "m-1"));
      await waitFor(() => expect(dashboardApi.getMemberHoldings).toHaveBeenLastCalledWith("m-1", expect.anything()));
    });

    it("Change in Account Info takes a Self member to the Profile tab", async () => {
      vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([{ ...alice, profile_completion: 60, missing_fields: ["phone_number"] }, ramesh] as never);
      render(<MainDashboardFlow />);
      fireEvent.click(await screen.findByRole("button", { name: "Per Member" }));
      await pick(/Alice/);
      fireEvent.click(await screen.findByText(/60% complete/));
      fireEvent.click(await screen.findByText("Change in Account Info"));
      expect(await screen.findByRole("navigation", { name: "Profile sections" })).toBeInTheDocument();
    });

    it("Add data picker lists every member enabled", async () => {
      render(<MainDashboardFlow />);
      fireEvent.click(await screen.findByRole("button", { name: "+ Add Data" }));
      const trigger = await screen.findByLabelText("Select family member to import for");
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      const row = await screen.findByRole("option", { name: /Ramesh Sharma/ });
      expect(row).not.toHaveAttribute("aria-disabled", "true");
      expect(screen.queryByText("Add details first")).toBeNull();
      fireEvent.click(row);
      expect(await screen.findByTestId("import-for")).toHaveTextContent("m-2");
    });
  });
});

 it("shows and dismisses the dashboard notice after a duplicate import closes", async () => {
    vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([{ id: "m-1", name: "Alice", relationship: "self", origin: "onboarding", profile_completion: 100, missing_fields: [] }] as any);
    vi.mocked(dashboardApi.getMemberHoldings).mockResolvedValue([]);
    vi.mocked(dashboardApi.getMemberAllocation).mockResolvedValue({ by_asset_class: [], by_amc: [], total_value: "0.00" });
    render(<MainDashboardFlow />);
    await screen.findByText("No Holdings Found");
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add Data" }));
    fireEvent.click(await screen.findByText("Close duplicate import"));
    expect(await screen.findByText("This statement was already imported")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss import notice" }));
    expect(screen.queryByText("This statement was already imported")).not.toBeInTheDocument();
 });

it("shows the success notice and family details after returning to the dashboard", async () => {
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([{ id: "m-1", name: "Alice", relationship: "self", origin: "onboarding", profile_completion: 100, missing_fields: [] }] as any);
  vi.mocked(dashboardApi.getMemberHoldings).mockResolvedValue([]);
  vi.mocked(dashboardApi.getMemberAllocation).mockResolvedValue({ by_asset_class: [], by_amc: [], total_value: "0.00" });
  render(<MainDashboardFlow />);
  await screen.findByText("No Holdings Found");
  fireEvent.click(screen.getByRole("button", { name: "+ Add Data" }));
  fireEvent.click(await screen.findByText("Finish import"));
  expect(await screen.findByText("12 transactions added · 2 already saved")).toBeVisible();
  expect(screen.getByText("Alice: 3 added")).toBeVisible();
  expect(screen.getByText("Ramesh: 9 added, 2 already saved")).toBeVisible();
  expect(screen.getByText("History starts mid-year.")).toBeVisible();
});
