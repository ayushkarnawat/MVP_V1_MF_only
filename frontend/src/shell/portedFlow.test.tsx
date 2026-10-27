import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import type { HouseholdMember } from "../features/auth/types";
import * as authApi from "../features/auth/api";
import * as dashboardApi from "../features/dashboard/api";
import { ApiError } from "../lib/apiClient";
import { ShellRoot, ShellRoutes } from "./ShellRoot";
import { ScopeProvider } from "./scope/ScopeProvider";
import { buildRegistry } from "./registry/buildRegistry";
import { RegistryContext } from "./registry/RegistryContext";
import { ImportProvider } from "./nav/ImportProvider";
import { useScope } from "./scope/ScopeContext";

// The Home page fetches its own data; route tests keep it out of the way like the other live screens.
vi.mock("../features/home/HomePage", () => ({ default: () => <h1>Home</h1> }));
vi.mock("../features/dev/useDevToolsEnabled", () => ({ useDevToolsEnabled: () => false }));
vi.mock("../features/auth/api", () => ({ getHouseholdMembers: vi.fn(), updateMemberProfile: vi.fn(), mergeMemberInto: vi.fn() }));
vi.mock("../features/dashboard/api", () => ({ getMemberHoldings: vi.fn(), getMemberAllocation: vi.fn(), getMemberSips: vi.fn(), getMemberSipsMonthly: vi.fn(), getAggregateHoldings: vi.fn(), getAggregateAllocation: vi.fn(), getAggregateSips: vi.fn(), getAggregateSipsMonthly: vi.fn() }));
vi.mock("../features/history/HistoryView", () => ({ HistoryView: ({ viewMode }: { viewMode: string }) => <h1>History test view ({viewMode})</h1> }));
vi.mock("../features/analytics/AnalyticsView", () => ({ AnalyticsView: () => <h1>Analytics test view</h1> }));
vi.mock("../features/scenarios/ScenariosScreen", () => ({ ScenariosScreen: () => <h1>Scenarios test view</h1> }));
vi.mock("../features/import/ImportFlow", () => ({ ImportFlow: ({ householdMemberId, onDone }: { householdMemberId: string; onDone?: (notice?: { text: string; details?: string[] }) => void }) => <div data-testid="import-for">{householdMemberId}
  <button onClick={() => onDone?.({ text: "This statement was already imported" })}>Close duplicate import</button>
  <button onClick={() => onDone?.({ text: "12 transactions added · 2 already saved", details: ["Alice: 3 added", "Ramesh: 9 added, 2 already saved", "History starts mid-year."] })}>Finish import</button>
</div> }));
vi.mock("../features/auth/AuthContext", () => {
  const value = { me: { user_id: "u1", phone_number: "+919999999999", email: "alice@example.com" }, logout: vi.fn() };
  return { useAuth: () => value };
});

const alice: HouseholdMember = { id: "m-1", name: "Alice (Me)", relationship: "self", relationship_other_label: null, origin: "onboarding", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false };
const ramesh: HouseholdMember = { ...alice, id: "m-2", name: "Ramesh Sharma", relationship: null, origin: "cas_detected", pan_masked: "BX******8L", name_from_statement: true, profile_completion: 40, missing_fields: ["relationship", "phone_number", "email"] };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice, ramesh]);
  vi.mocked(dashboardApi.getMemberHoldings).mockResolvedValue([]);
  vi.mocked(dashboardApi.getMemberAllocation).mockResolvedValue({ by_asset_class: [], by_amc: [], total_value: "0.00" });
  vi.mocked(dashboardApi.getAggregateHoldings).mockResolvedValue({ members: [], holdings: [] });
  vi.mocked(dashboardApi.getAggregateAllocation).mockResolvedValue({ members: [], allocation: { by_asset_class: [], by_amc: [], total_value: "0.00" } });
  vi.mocked(dashboardApi.getMemberSips).mockResolvedValue([]);
  vi.mocked(dashboardApi.getAggregateSips).mockResolvedValue({ members: [], sips: [] });
  vi.mocked(dashboardApi.getMemberSipsMonthly).mockResolvedValue([]);
  vi.mocked(dashboardApi.getAggregateSipsMonthly).mockResolvedValue({ members: [], sips: [] });
});

function Controls() {
  const navigate = useNavigate();
  const location = useLocation();
  const scope = useScope();
  return <><output data-testid="url">{location.pathname}</output><output data-testid="scope">{scope.scopeKey}</output>
    <button onClick={() => { void navigate(-1); }}>Browser back</button><button onClick={() => { void navigate(1); }}>Browser forward</button>
    <button onClick={() => { void navigate("/planning"); }}>Go Planning</button></>;
}
// /portfolio/mutual-funds now renders the new Overview (features/mutual-funds), so the Dashboard has no route of its own.
// These ported flows (scope, notices, import return) still exercise the Dashboard through its wrapper at that path.
// /portfolio/mutual-funds/analytics renders the new Other Analytics page too (packet MF-C), so the old Analytics screen is mounted the same way.
const legacyRoutes = buildRegistry().map(route => route.id === "portfolio-mutual-funds" ? { ...route, page: () => import("./wrappers/DashboardWrapper") }
  : route.id === "portfolio-mutual-funds-analytics" ? { ...route, page: () => import("./wrappers/AnalyticsWrapper") } : route);
function mount(path = "/portfolio/mutual-funds") {
  return render(<MemoryRouter initialEntries={[path]}><RegistryContext.Provider value={legacyRoutes}><ScopeProvider><ImportProvider><ShellRoutes /><Controls /></ImportProvider></ScopeProvider></RegistryContext.Provider></MemoryRouter>);
}
async function pick(name: RegExp) {
  const trigger = await screen.findByRole("combobox", { name: "Portfolio scope" });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name }));
}
async function openRamesh() { mount(); await pick(/Ramesh Sharma/); }
async function dashboard() { await screen.findByText("No Holdings Found", {}, { timeout: 5000 }); }

it("records Analytics and Planning URLs and restores Dashboard on Back", async () => {
  mount(); await dashboard();
  fireEvent.click(screen.getByRole("link", { name: "Analytics" }));
  await screen.findByRole("heading", { name: "Analytics test view" });
  expect(screen.getByTestId("url")).toHaveTextContent("/portfolio/mutual-funds/analytics");
  fireEvent.click(screen.getByRole("button", { name: "Go Planning" }));
  await screen.findByRole("heading", { name: "Scenarios test view" });
  expect(screen.getByRole("link", { name: "Planning" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByTestId("url")).toHaveTextContent("/planning");
  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  await screen.findByRole("heading", { name: "Analytics test view" });
  fireEvent.click(screen.getByRole("button", { name: "Browser forward" }));
  await screen.findByRole("heading", { name: "Scenarios test view" });
  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  await screen.findByRole("heading", { name: "Analytics test view" });
  fireEvent.click(screen.getByRole("button", { name: "Browser back" })); await dashboard();
  expect(screen.getByTestId("url").textContent).toBe("/portfolio/mutual-funds");
});

it("opens History and keeps it on Back/Forward with ordered enabled tabs", async () => {
  mount(); await dashboard();
  const tabs = screen.getByRole("navigation", { name: "Mutual Fund pages" });
  expect(within(tabs).getAllByRole("link").map(link => link.textContent)).toEqual(["Dashboard", "History", "Analytics"]);
  fireEvent.click(within(tabs).getByRole("link", { name: "History" }));
  await screen.findByRole("heading", { name: "History test view (aggregate)" });
  expect(screen.getByTestId("url")).toHaveTextContent("/portfolio/mutual-funds/history");
  fireEvent.click(screen.getByRole("button", { name: "Browser back" })); await dashboard();
  expect(screen.queryByText("History test view (aggregate)")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Browser forward" }));
  expect(await screen.findByRole("heading", { name: "History test view (aggregate)" })).toBeInTheDocument();
});

it("opens Profile from the sidebar with account controls and no chrome logout", async () => {
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice]);
  mount(); await dashboard();
  expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Profile" }));
  await screen.findByRole("heading", { name: "Profile" });
  expect(screen.getByRole("heading", { name: "Account Info" })).toBeInTheDocument();
  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  expect(screen.getByText("+919999999999")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Import History" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
  expect(screen.queryByText("Danger Zone")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument();
  expect(screen.getByTestId("url")).toHaveTextContent("/profile/personal");
});

it("fetches household members and defaults to aggregate with one theme toggle and shell chrome", async () => {
  mount(); await dashboard();
  expect(authApi.getHouseholdMembers).toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Unifolio home" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Portfolio scope" })).toHaveTextContent("Family Combined");
  expect(screen.getByTestId("scope")).toHaveTextContent("aggregate");
  expect(screen.getAllByLabelText("Toggle theme")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute("href", "/portfolio/mutual-funds/analytics");
});

it("renders exactly one theme toggle on Add Data and leaves through Back", async () => {
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice]);
  mount(); await dashboard();
  fireEvent.click(screen.getByRole("button", { name: "+ Add data" }));
  await screen.findByTestId("import-for");
  expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/portfolio/mutual-funds");
  expect(screen.getAllByLabelText("Toggle theme")).toHaveLength(1);
  expect(screen.queryByRole("navigation", { name: "Main navigation" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Back" })); await dashboard();
});

it("picking a detected member fetches their dashboard without automatically opening a dialog", async () => {
  await openRamesh();
  await waitFor(() => expect(dashboardApi.getMemberHoldings).toHaveBeenCalledWith("m-2", expect.anything()));
  expect(screen.getByTestId("scope")).toHaveTextContent("member:m-2");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("shows the incomplete-member nudge on Dashboard and Analytics but not aggregate, Profile or Planning", async () => {
  await openRamesh(); expect(await screen.findByText(/40% complete/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Analytics" }));
  await screen.findByRole("heading", { name: "Analytics test view" });
  expect(screen.getByText(/40% complete/)).toBeInTheDocument();
  await pick(/Family Combined/); expect(screen.queryByText(/40% complete/)).not.toBeInTheDocument();
  await pick(/Ramesh Sharma/);
  fireEvent.click(screen.getByRole("link", { name: "Profile" })); await screen.findByRole("heading", { name: "Profile" });
  expect(screen.queryByText(/40% complete/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Planning" })); await screen.findByRole("heading", { name: "Scenarios test view" });
  expect(screen.queryByText(/40% complete/)).not.toBeInTheDocument();
});

it("saving Complete profile reloads members and preserves the dialog's warning stage", async () => {
  vi.mocked(authApi.updateMemberProfile).mockResolvedValue({ ...ramesh, pan_conflict: "other_account" });
  await openRamesh(); fireEvent.click(await screen.findByText(/40% complete/));
  await screen.findByRole("heading", { name: "Complete Ramesh Sharma’s profile" });
  const calls = vi.mocked(authApi.getHouseholdMembers).mock.calls.length;
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "9800000002" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(vi.mocked(authApi.getHouseholdMembers).mock.calls.length).toBeGreaterThan(calls));
  expect(await screen.findByRole("heading", { name: "Ramesh Sharma’s details are saved" })).toBeInTheDocument();
});

it("shows a PAN conflict banner for the selected member", async () => {
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice, { ...ramesh, pan_conflict: "other_account" }]);
  await openRamesh(); expect(await screen.findByRole("alert")).toHaveTextContent("PAN is on another Unifolio account");
});

it("shows Edit profile instead of the nudge for a complete member", async () => {
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice, { ...ramesh, profile_completion: 100, missing_fields: [] }]);
  await openRamesh(); expect(await screen.findByRole("button", { name: "Edit profile" })).toBeInTheDocument();
  expect(screen.queryByText(/% complete/)).not.toBeInTheDocument();
});

it("merging from the real profile dialog selects the target member", async () => {
  // Three members, merging into the third: with only one member left a household defaults to that member, so a
  // two-member fixture would pass even if the merge never selected its target.
  const carol = { ...ramesh, id: "m-3", name: "Carol Mehta", pan_masked: "CQ******9K", profile_completion: 100, missing_fields: [] };
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice, { ...ramesh, pan_masked: null, pan_editable: true }, carol]);
  vi.mocked(authApi.updateMemberProfile).mockRejectedValue(new ApiError(409, { code: "pan_belongs_to_other_member", message: "x", details: { can_merge: true, other_member_id: "m-3", other_member_name: "Carol Mehta", source_fund_count: 1 } }));
  vi.mocked(authApi.mergeMemberInto).mockResolvedValue({ folios_moved: 1, transactions_dropped: 0 });
  await openRamesh(); fireEvent.click(await screen.findByText(/40% complete/));
  await screen.findByRole("heading", { name: "Complete Ramesh Sharma’s profile" });
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice, carol]);
  fireEvent.change(screen.getByLabelText("PAN"), { target: { value: "BXQPS5678L" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  fireEvent.click(await screen.findByRole("button", { name: /Merge/ }));
  await waitFor(() => expect(authApi.mergeMemberInto).toHaveBeenCalledWith("m-2", "m-3"));
  await waitFor(() => expect(dashboardApi.getMemberHoldings).toHaveBeenLastCalledWith("m-3", expect.anything()));
});

it("Change in Account Info opens the Profile route and its sections", async () => {
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([{ ...alice, profile_completion: 60, missing_fields: ["phone_number"] }, ramesh]);
  mount(); await pick(/Alice/); fireEvent.click(await screen.findByText(/60% complete/));
  fireEvent.click(await screen.findByText("Change in Account Info"));
  expect(await screen.findByRole("navigation", { name: "Profile sections" })).toBeInTheDocument();
  expect(screen.getByTestId("url")).toHaveTextContent("/profile/personal");
});

it("all member options are enabled, undecorated and selectable for scope and Add data", async () => {
  mount(); await dashboard();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Portfolio scope" }), { key: "ArrowDown" });
  const options = await screen.findAllByRole("option");
  for (const option of options) { expect(option.querySelector("svg.lucide-lock")).toBeNull(); expect(option).not.toHaveTextContent("%"); }
  fireEvent.click(screen.getByRole("option", { name: "Family Combined" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Add data" }));
  const trigger = await screen.findByLabelText("Select family member to import for");
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const row = await screen.findByRole("option", { name: "Ramesh Sharma" });
  expect(row).not.toHaveAttribute("aria-disabled", "true");
  expect(screen.queryByText("Add details first")).not.toBeInTheDocument();
  fireEvent.click(row); expect(await screen.findByTestId("import-for")).toHaveTextContent("m-2");
});

it("shows and dismisses the duplicate import notice after returning from Analytics", async () => {
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice]);
  mount(); await dashboard(); fireEvent.click(screen.getByRole("link", { name: "Analytics" }));
  await screen.findByRole("heading", { name: "Analytics test view" });
  fireEvent.click(screen.getByRole("button", { name: "+ Add data" }));
  fireEvent.click(await screen.findByText("Close duplicate import"));
  expect(await screen.findByText("This statement was already imported")).toBeVisible();
  expect(screen.getByTestId("url").textContent).toBe("/portfolio/mutual-funds");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss import notice" }));
  expect(screen.queryByText("This statement was already imported")).not.toBeInTheDocument();
});

it("does not resurrect an earlier dismissed-then-replaced import notice via Browser back", async () => {
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice]);
  mount(); await dashboard();
  fireEvent.click(screen.getByRole("button", { name: "+ Add data" }));
  fireEvent.click(await screen.findByText("Close duplicate import"));
  expect(await screen.findByText("This statement was already imported")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "+ Add data" }));
  fireEvent.click(await screen.findByText("Finish import"));
  expect(await screen.findByText("12 transactions added · 2 already saved")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss import notice" }));
  expect(screen.queryByText("12 transactions added · 2 already saved")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  expect(screen.queryByText("This statement was already imported")).not.toBeInTheDocument();
});

it("shows the success notice and family details after returning to Dashboard", async () => {
  vi.mocked(authApi.getHouseholdMembers).mockResolvedValue([alice]);
  mount(); await dashboard(); fireEvent.click(screen.getByRole("button", { name: "+ Add data" }));
  fireEvent.click(await screen.findByText("Finish import"));
  expect(await screen.findByText("12 transactions added · 2 already saved")).toBeVisible();
  for (const text of ["Alice: 3 added", "Ramesh: 9 added, 2 already saved", "History starts mid-year."]) expect(screen.getByText(text)).toBeVisible();
});

it("ShellRoot supplies real scope and import providers inside its router", async () => {
  render(<ShellRoot />);
  expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  expect(await screen.findByRole("combobox", { name: "Portfolio scope" })).toHaveTextContent("Family Combined");
  fireEvent.click(screen.getByRole("button", { name: "+ Add data" }));
  expect(await screen.findByTestId("import-for")).toHaveTextContent("m-1");
});
