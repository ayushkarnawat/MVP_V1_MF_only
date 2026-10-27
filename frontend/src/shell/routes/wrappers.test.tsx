import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useLocation, useNavigate } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { DashboardView } from "../../features/dashboard/DashboardView";
import type { DashboardViewProps } from "../../features/dashboard/DashboardView";
import { HistoryView } from "../../features/history/HistoryView";
import type { HistoryViewProps } from "../../features/history/HistoryView";
import { AnalyticsView } from "../../features/analytics/AnalyticsView";
import type { AnalyticsViewProps } from "../../features/analytics/AnalyticsView";
import { ImportHealth } from "../../features/dev/ImportHealth";
import PlanningPage from "../../features/planning/PlanningPage";
import { ShellRoutes } from "../ShellRoot";
import DashboardWrapper from "../wrappers/DashboardWrapper";
import { renderInShell } from "../testing";
import { buildRegistry } from "../registry/buildRegistry";

const auth = vi.hoisted(() => ({
  me: { user_id: "u-1", email: "alice@example.test", phone_number: "123" } as { user_id: string; email: string | null; phone_number: string | null } | null,
  logout: vi.fn(), requestAccountDeletion: vi.fn(), requestContactChange: vi.fn(), verifyContactChange: vi.fn(),
}));
vi.mock("../../features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../lib/apiClient", () => ({ invalidateApiCache: vi.fn() }));
// The Home page fetches its own data; route tests keep it out of the way like the other live screens.
vi.mock("../../features/home/HomePage", () => ({ default: () => <h1>Home</h1> }));
vi.mock("../../features/dashboard/DashboardView", () => ({ DashboardView: vi.fn((props: DashboardViewProps) => <>
  <h1>Dashboard screen</h1><button onClick={props.onDismissImportNotice}>Dismiss notice</button>
  <button onClick={props.onOpenHistory}>Open history</button><button onClick={() => props.onAddDataForMember?.("b")}>Dashboard import</button>
</>) }));
vi.mock("../../features/history/HistoryView", () => ({ HistoryView: vi.fn((_props: HistoryViewProps) => <h1>History screen</h1>) }));
vi.mock("../../features/analytics/AnalyticsView", () => ({ AnalyticsView: vi.fn((props: AnalyticsViewProps) => <>
  <h1>Analytics screen</h1><button onClick={() => props.onAddDataForMember?.("b")}>Analytics import</button>
</>) }));
vi.mock("../../features/planning/PlanningPage", () => ({ default: vi.fn(() => <h1>Scenarios screen</h1>) }));
vi.mock("../../features/profile-v2/pages/PersonalInfoPage", () => ({ default: () => <h1>Personal Information screen</h1> }));
vi.mock("../../features/dev/ImportHealth", () => ({ ImportHealth: vi.fn((props: ComponentProps<typeof ImportHealth>) => <>
  <h1>Import health screen</h1><button onClick={props.onBack}>Health back</button>
</>) }));

const members = [{ id: "a", name: "Alice (Me)" }, { id: "b", name: "Bob" }];
const openImport = vi.fn();
const refreshMembers = vi.fn();
const scope = { viewMode: "member" as const, memberId: "b", members, refreshMembers };
beforeEach(() => {
  vi.clearAllMocks();
  auth.me = { user_id: "u-1", email: "alice@example.test", phone_number: "123" };
});

function Location() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="location">{JSON.stringify({ path: location.pathname + location.search + location.hash, state: location.state })}</output>
    <button onClick={() => { void navigate(-1); }}>History back</button><button onClick={() => { void navigate(1); }}>History forward</button>
    <button onClick={() => { void navigate(location.pathname, { replace: true }); }}>Replace here</button>
    <button onClick={() => { void navigate("/profile"); }}>Go Profile</button>
    <button onClick={() => { void navigate("/profile/import-health", { state: { from: "profile" } }); }}>Go import health</button></>;
}

// /portfolio/mutual-funds/analytics renders the new Other Analytics page (features/mutual-funds), so the old Analytics screen has no
// route of its own; these checks still exercise it through its wrapper at that path (packet MF-C).
const legacyRoutes = buildRegistry().map(route => route.id === "portfolio-mutual-funds-analytics" ? { ...route, page: () => import("../wrappers/AnalyticsWrapper") } : route);
function mount(path: string, state?: unknown) {
  return renderInShell(<><ShellRoutes /><Location /></>, { path, state, scope, openImport, routes: legacyRoutes });
}

// The Dashboard no longer has a route (/portfolio/mutual-funds renders the new Overview), so its wrapper is mounted directly.
function mountDashboard(path: string, state?: unknown) {
  return renderInShell(<><DashboardWrapper /><Location /></>, { path, state, scope, openImport });
}

it.each(["member", "aggregate"] as const)("passes %s scope and callbacks to Dashboard", async viewMode => {
  renderInShell(<DashboardWrapper />, { path: "/portfolio/mutual-funds", scope: { ...scope, viewMode }, openImport });
  await screen.findByRole("heading", { name: "Dashboard screen" });
  expect(vi.mocked(DashboardView).mock.calls.at(-1)?.[0]).toMatchObject({ viewMode, memberId: "b", onAddDataForMember: openImport });
  fireEvent.click(screen.getByRole("button", { name: "Dashboard import" })); expect(openImport).toHaveBeenCalledWith("b");
});

it.each(["member", "aggregate"] as const)("passes %s scope and member name to History", async viewMode => {
  renderInShell(undefined, { path: "/portfolio/mutual-funds/history", scope: { ...scope, viewMode } });
  await screen.findByRole("heading", { name: "History screen" });
  expect(vi.mocked(HistoryView).mock.calls.at(-1)?.[0]).toEqual({ viewMode, memberId: "b", memberName: "Bob" });
});

it.each(["member", "aggregate"] as const)("passes %s scope and callbacks to Analytics", async viewMode => {
  renderInShell(undefined, { path: "/portfolio/mutual-funds/analytics", scope: { ...scope, viewMode }, openImport, routes: legacyRoutes });
  await screen.findByRole("heading", { name: "Analytics screen" });
  expect(vi.mocked(AnalyticsView).mock.calls.at(-1)?.[0]).toEqual({ viewMode, memberId: "b", activeMemberName: "Bob", onAddDataForMember: openImport });
  fireEvent.click(screen.getByRole("button", { name: "Analytics import" })); expect(openImport).toHaveBeenCalledWith("b");
});

it("passes the import notice then replaces the same URL with cleared state on dismissal", async () => {
  const notice = { text: "Imported", details: ["Ready"] };
  mountDashboard("/portfolio/mutual-funds?period=1#holdings", { importNotice: notice, importNoticeUser: "u-1" });
  await screen.findByRole("heading", { name: "Dashboard screen" });
  expect(vi.mocked(DashboardView).mock.calls.at(-1)?.[0].importNotice).toEqual(notice);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));
  await waitFor(() => expect(JSON.parse(screen.getByTestId("location").textContent!)).toEqual({ path: "/portfolio/mutual-funds?period=1#holdings", state: null }));
  expect(vi.mocked(DashboardView).mock.calls.at(-1)?.[0].importNotice).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "History back" }));
  expect(JSON.parse(screen.getByTestId("location").textContent!).state).toBeNull();
});

it("opens History from the old Dashboard wrapper", async () => {
  mountDashboard("/portfolio/mutual-funds");
  fireEvent.click(await screen.findByRole("button", { name: "Open history" }));
  await waitFor(() => expect(JSON.parse(screen.getByTestId("location").textContent!).path).toBe("/portfolio/mutual-funds/history"));
});

it("supports browser back and forward between live pages", async () => {
  mount("/portfolio/mutual-funds/history");
  await screen.findByRole("heading", { name: "History screen" });
  fireEvent.click(screen.getByRole("button", { name: "Go Profile" }));
  await screen.findByRole("heading", { name: "Personal Information screen" });
  fireEvent.click(screen.getByRole("button", { name: "History back" }));
  await screen.findByRole("heading", { name: "History screen" });
  fireEvent.click(screen.getByRole("button", { name: "History forward" }));
  await screen.findByRole("heading", { name: "Personal Information screen" });
});

it("renders the Planning page without props", async () => {
  mount("/planning"); await screen.findByRole("heading", { name: "Scenarios screen" });
  expect(PlanningPage).toHaveBeenCalledWith({}, undefined);
});

it("/profile opens the new Personal Information page, not the old screen", async () => {
  mount("/profile");
  await screen.findByRole("heading", { name: "Personal Information screen" });
  expect(JSON.parse(screen.getByTestId("location").textContent!).path).toBe("/profile/personal");
  expect(screen.queryByRole("heading", { name: "Profile screen" })).not.toBeInTheDocument();
});

it("Import health's Back lands on Profile even when deep-linked with no history to go back to", async () => {
  mount("/profile/import-health");
  await screen.findByRole("heading", { name: "Import health screen" });
  fireEvent.click(screen.getByRole("button", { name: "Health back" }));
  await screen.findByRole("heading", { name: "Personal Information screen" });
  expect(JSON.parse(screen.getByTestId("location").textContent!).path).toBe("/profile/personal");
});

it.each([
  ["another user's", { importNotice: { text: "Ramesh: 9 added" }, importNoticeUser: "u-2" }],
  ["an unattributed", { importNotice: { text: "Ramesh: 9 added" } }],
])("does not show %s import notice left in browser history", async (_label, state) => {
  mountDashboard("/portfolio/mutual-funds", state);
  await screen.findByRole("heading", { name: "Dashboard screen" });
  expect(vi.mocked(DashboardView).mock.calls.at(-1)?.[0].importNotice).toBeNull();
});

it("Import health's Back lands on Profile after its own history entry was replaced (no leaving the app)", async () => {
  mount("/profile/import-health");
  await screen.findByRole("heading", { name: "Import health screen" });
  fireEvent.click(screen.getByRole("button", { name: "Replace here" }));
  fireEvent.click(screen.getByRole("button", { name: "Health back" }));
  await screen.findByRole("heading", { name: "Personal Information screen" });
});

// The old Profile screen used to open Import health; these keep its Back rules covered now that Import health is reached from Settings
// (the page marks the entry with state { from: "profile" }, as SettingsPage does): Back pops straight to the opener with no duplicate
// entry and no Back loop.
it("Import health's Back pops straight back to the screen that opened it with no duplicate entry", async () => {
  mount("/home"); await screen.findByRole("heading", { name: "Home" });
  fireEvent.click(screen.getByRole("button", { name: "Go import health" }));
  await screen.findByRole("heading", { name: "Import health screen" });
  fireEvent.click(screen.getByRole("button", { name: "Health back" }));
  await screen.findByRole("heading", { name: "Home" });
  expect(JSON.parse(screen.getByTestId("location").textContent!).path).toBe("/home");
  fireEvent.click(screen.getByRole("button", { name: "History back" }));
  await screen.findByRole("heading", { name: "Home" });
  expect(JSON.parse(screen.getByTestId("location").textContent!).path).toBe("/home");
});

it("Import health's Back does not leave Import health one browser Back away (no Back loop)", async () => {
  mount("/home"); await screen.findByRole("heading", { name: "Home" });
  fireEvent.click(screen.getByRole("button", { name: "Go import health" }));
  await screen.findByRole("heading", { name: "Import health screen" });
  fireEvent.click(screen.getByRole("button", { name: "Health back" }));
  await screen.findByRole("heading", { name: "Home" });
  fireEvent.click(screen.getByRole("button", { name: "History back" }));
  await screen.findByRole("heading", { name: "Home" });
  expect(JSON.parse(screen.getByTestId("location").textContent!).path).not.toBe("/profile/import-health");
});

it.each(["member", "aggregate"] as const)("passes memberId to ImportHealth only in %s mode", async viewMode => {
  renderInShell(undefined, { path: "/profile/import-health", scope: { ...scope, viewMode } });
  await screen.findByRole("heading", { name: "Import health screen" });
  expect(vi.mocked(ImportHealth).mock.calls.at(-1)?.[0].memberId).toBe(viewMode === "member" ? "b" : undefined);
});

it.each([
  ["/portfolio/mutual-funds/history", "History screen", true],
  ["/portfolio/mutual-funds/analytics", "Analytics screen", true],
  ["/planning", "Scenarios screen", false],
  ["/profile/personal", "Personal Information screen", false],
  ["/profile/import-health", "Import health screen", false],
] as const)("renders deep links and remounts at %s with the temporary strip correctly placed", async (path, heading, tabs) => {
  for (let visit = 0; visit < 2; visit++) {
    const view = mount(path);
    await screen.findByRole("heading", { name: heading });
    const strip = screen.queryByRole("navigation", { name: "Mutual Fund pages" });
    if (tabs) {
      expect(strip).toBeInTheDocument();
      expect(strip!.compareDocumentPosition(screen.getByRole("heading", { name: heading })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    } else expect(strip).not.toBeInTheDocument();
    view.unmount();
  }
});

it("enables only the requested routes and preserves the existing import route", () => {
  const live = buildRegistry().filter(route => route.status === "live").map(route => route.id).sort();
  expect(live).toEqual(["root", "not-found", "home", "portfolio", "portfolio-equity", "import", "planning", "portfolio-mutual-funds", "portfolio-mutual-funds-analytics", "portfolio-mutual-funds-history", "profile", "profile-import-health", "profile-personal", "portfolio-mutual-funds-performance", "portfolio-mutual-funds-allocation", "portfolio-mutual-funds-holdings", "portfolio-mutual-funds-transactions", "portfolio-mutual-funds-overlap", "profile-family", "profile-connected-accounts", "profile-settings", "profile-settings-notifications", "profile-settings-preferences", "profile-settings-security", "profile-settings-import-history", "profile-subscription", "profile-tax", "profile-data-privacy"].sort());
});
