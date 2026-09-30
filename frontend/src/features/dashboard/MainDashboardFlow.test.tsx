import * as React from "react";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MainDashboardFlow } from "./MainDashboardFlow";
import * as authApi from "../auth/api";
import * as dashboardApi from "./api";
import { ApiError } from "../../lib/apiClient";

vi.mock("../auth/api", () => ({
  getHouseholdMembers: vi.fn(),
  completeMemberDetails: vi.fn(),
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

const importDone = vi.hoisted(() => vi.fn());

vi.mock("../import/ImportFlow", () => ({
  ImportFlow: ({ householdMemberId, renderMemberDetails }: { householdMemberId: string; renderMemberDetails?: (id: string, done: () => void) => React.ReactNode }) => {
    const [open, setOpen] = React.useState(false);
    return (
      <div>
        <span data-testid="import-for">{householdMemberId}</span>
        <button type="button" onClick={() => setOpen(true)}>open-u6</button>
        {open && renderMemberDetails?.(householdMemberId, () => { importDone(); setOpen(false); })}
      </div>
    );
  },
}));

vi.mock("../analytics/AnalyticsView", () => ({
  AnalyticsView: () => <div>Analytics test view</div>,
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
    importDone.mockClear();
    window.history.replaceState({}, "", "/");
    vi.mocked(dashboardApi.getMemberSips).mockResolvedValue([]);
    vi.mocked(dashboardApi.getAggregateSips).mockResolvedValue({ members: [], sips: [] });
    vi.mocked(dashboardApi.getMemberSipsMonthly).mockResolvedValue([]);
    vi.mocked(dashboardApi.getAggregateSipsMonthly).mockResolvedValue({ members: [], sips: [] });
  });

  it("records tab changes in browser history and restores Dashboard on Back", async () => {
    vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null, origin: "onboarding", lock_reason: null, details_required: false, pan_masked: null },
      { id: "m-2", name: "Bob", relationship: "spouse", relationship_other_label: null, origin: "manual", lock_reason: null, details_required: false, pan_masked: null },
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
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null, origin: "onboarding", lock_reason: null, details_required: false, pan_masked: null },
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
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null, origin: "onboarding", lock_reason: null, details_required: false, pan_masked: null },
      { id: "m-2", name: "Bob", relationship: "spouse", relationship_other_label: null, origin: "manual", lock_reason: null, details_required: false, pan_masked: null },
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
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null, origin: "onboarding", lock_reason: null, details_required: false, pan_masked: null },
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

  describe("locked members", () => {
    const base = { relationship_other_label: null, origin: "cas_detected", pan_masked: "BX******8L" };
    const lockedMembers = [
      { id: "m-1", name: "Alice", relationship: "self", relationship_other_label: null, origin: "onboarding", lock_reason: null, details_required: false, pan_masked: null },
      { ...base, id: "m-2", name: "Ramesh Sharma", relationship: null, lock_reason: "details_needed", details_required: true },
      { ...base, id: "m-3", name: "Kiran Sharma", relationship: "sibling", lock_reason: "pan_on_other_account", details_required: true },
    ];

    beforeEach(() => {
      vi.mocked(authApi.getHouseholdMembers).mockResolvedValue(lockedMembers as never);
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

    it("picking a details_needed member opens the dialog and stays in aggregate view", async () => {
      render(<MainDashboardFlow />);
      await pick(/Ramesh Sharma/);
      expect(await screen.findByText("Add Ramesh Sharma’s details")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Family Combined", hidden: true }).className).toContain("font-semibold");
      expect(dashboardApi.getMemberHoldings).not.toHaveBeenCalled();
    });

    it("picking a pan_on_other_account member opens L8", async () => {
      render(<MainDashboardFlow />);
      await pick(/Kiran Sharma/);
      expect(await screen.findByText("Kiran Sharma has their own Unifolio account")).toBeInTheDocument();
    });

    it("unlock success reloads members, switches to member view and drops the lock", async () => {
      vi.mocked(authApi.completeMemberDetails).mockResolvedValue({
        ...lockedMembers[1], relationship: "spouse", lock_reason: null, details_required: false,
      } as never);
      render(<MainDashboardFlow />);
      await pick(/Ramesh Sharma/);
      await screen.findByText("Add Ramesh Sharma’s details");
      vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([
        lockedMembers[0],
        { ...lockedMembers[1], relationship: "spouse", lock_reason: null, details_required: false },
        lockedMembers[2],
      ] as never);
      fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "spouse" } });
      fireEvent.change(screen.getByLabelText("PAN"), { target: { value: "BXQPS5678L" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => expect(dashboardApi.getMemberHoldings).toHaveBeenCalledWith("m-2", expect.anything()));
      expect(screen.getByRole("button", { name: "Per Member", hidden: true }).className).toContain("font-semibold");
      fireEvent.keyDown(screen.getByLabelText("Select household member"), { key: "ArrowDown" });
      const option = await screen.findByRole("option", { name: /Ramesh Sharma/ });
      expect(option.querySelector("svg.lucide-lock")).toBeNull();
    });

    it("A1: Add data picker shows locked members disabled and opens the unlock dialog", async () => {
      render(<MainDashboardFlow />);
      await screen.findByLabelText("Select household member");
      fireEvent.click(screen.getByRole("button", { name: "+ Add Data" }));
      const trigger = await screen.findByLabelText("Select family member to import for");
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      const row = await screen.findByRole("option", { name: /Ramesh Sharma/ });
      expect(row).toHaveTextContent("Add details first");
      expect(row).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(row);
      expect(await screen.findByText("Add Ramesh Sharma’s details")).toBeInTheDocument();
    });

    it("L9: Edit details in the member header opens the edit dialog", async () => {
      vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([
        lockedMembers[0],
        { ...lockedMembers[1], relationship: "spouse", lock_reason: null, details_required: false },
      ] as never);
      render(<MainDashboardFlow />);
      fireEvent.click(await screen.findByRole("button", { name: "Per Member" }));
      await pick(/Ramesh Sharma/);
      fireEvent.click(await screen.findByRole("button", { name: "Edit details" }));
      expect(await screen.findByText("Edit Ramesh Sharma’s details")).toBeInTheDocument();
    });

    it("U6 merge: import re-targets to the merge target and onDone is not called", async () => {
      // Only the locked m-2 exists, so Add data targets m-2.
      vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([lockedMembers[1]] as never);
      vi.mocked(authApi.completeMemberDetails).mockRejectedValue(
        new ApiError(409, {
          code: "pan_belongs_to_other_member",
          message: "x",
          details: { other_member_id: "m-1", other_member_name: "Alice", can_merge: true, source_fund_count: 1 },
        }),
      );
      vi.mocked(authApi.mergeMemberInto).mockResolvedValue({ folios_moved: 1, transactions_dropped: 0 });
      render(<MainDashboardFlow />);
      fireEvent.click(await screen.findByRole("button", { name: "+ Add Data" }));
      expect(await screen.findByTestId("import-for")).toHaveTextContent("m-2");
      fireEvent.click(screen.getByRole("button", { name: "open-u6" }));
      await screen.findByText("Add Ramesh Sharma’s details");
      vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([lockedMembers[0]] as never);
      fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "spouse" } });
      fireEvent.change(screen.getByLabelText("PAN"), { target: { value: "BXQPS5678L" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      fireEvent.click(await screen.findByRole("button", { name: "Merge into Alice" }));
      await waitFor(() => expect(authApi.mergeMemberInto).toHaveBeenCalledWith("m-2", "m-1"));
      await waitFor(() => expect(screen.getByTestId("import-for")).toHaveTextContent("m-1"));
      expect(importDone).not.toHaveBeenCalled();
    });

    it("L9: can_merge=false shows the inline 'already on X' error", async () => {
      vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([
        lockedMembers[0],
        { ...lockedMembers[1], relationship: "spouse", lock_reason: null, details_required: false },
      ] as never);
      vi.mocked(authApi.completeMemberDetails).mockRejectedValue(
        new ApiError(409, { code: "pan_belongs_to_other_member", message: "x", details: { other_member_id: "m-1", other_member_name: "Alice", can_merge: false, source_fund_count: 0 } }),
      );
      render(<MainDashboardFlow />);
      fireEvent.click(await screen.findByRole("button", { name: "Per Member" }));
      await pick(/Ramesh Sharma/);
      fireEvent.click(await screen.findByRole("button", { name: "Edit details" }));
      fireEvent.change(await screen.findByLabelText("PAN"), { target: { value: "BXQPS5678L" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("This PAN is already on Alice.")).toBeInTheDocument();
    });
  });
});
