import { fireEvent, screen, within } from "@testing-library/react";
import { useLocation, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { listHouseholdMembers } from "@/features/auth/api";
import { deleteHouseholdImport, getHouseholdImportHistory } from "@/features/import/api";
import { invalidateApiCache } from "@/lib/apiClient";
import ImportHistoryPage from "./ImportHistoryPage";

const auth = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/features/auth/api", () => ({ listHouseholdMembers: vi.fn() }));
vi.mock("@/features/import/api", () => ({ getHouseholdImportHistory: vi.fn(), deleteHouseholdImport: vi.fn() }));
vi.mock("@/lib/apiClient", () => ({ invalidateApiCache: vi.fn() }));

// The section is reused unchanged and has its own tests; here it is a stand-in that records what it was given.
const section = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("@/features/profile/ImportHistorySection", () => ({
  ImportHistorySection: (props: Record<string, unknown> & { onChanged?: () => void }) => {
    section.props.push(props);
    return (
      <section data-testid="section-stub">
        <h2>Import History</h2>
        <button type="button" onClick={props.onChanged}>stub deleted an import</button>
      </section>
    );
  },
}));

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

const LIVE_ROUTES = buildRegistry().map(route => route.id.startsWith("profile") ? { ...route, status: "live" as const } : route);

function mount(refreshMembers = vi.fn()) {
  renderInShell(<><ImportHistoryPage /><Probe /></>, {
    path: "/profile/settings/import-history",
    routes: LIVE_ROUTES,
    scope: { refreshMembers },
  });
  return refreshMembers;
}

beforeEach(() => {
  vi.clearAllMocks();
  section.props.length = 0;
});

describe("ImportHistoryPage", () => {
  it("sits in the Profile frame with Settings marked as the current item", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
    const current = screen.getByRole("navigation", { name: "Profile sections" }).querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Settings");
  });

  it("mounts the existing import history section once, in the content column", () => {
    mount();
    expect(within(screen.getByTestId("profile-content")).getAllByTestId("section-stub")).toHaveLength(1);
  });

  it("gives the section the household import calls and the member list call", () => {
    mount();
    const props = section.props.at(-1);
    expect(props?.loadImportHistory).toBe(getHouseholdImportHistory);
    expect(props?.deleteImport).toBe(deleteHouseholdImport);
    expect(props?.loadMembers).toBe(listHouseholdMembers);
    expect(typeof props?.onChanged).toBe("function");
  });

  it("shows a Back button above the section, and no link in the content (QA fixes, B3)", () => {
    mount();
    const content = screen.getByTestId("profile-content");
    expect(within(content).queryAllByRole("link")).toHaveLength(0);
    const back = within(content).getByRole("button", { name: "Back" });
    expect(back.compareDocumentPosition(screen.getByTestId("section-stub")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(content).queryByText("Settings")).toBeNull();
  });

  it("Back opens Settings when this is the first screen of the visit", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/settings");
  });

  it("Back returns to the screen the person came from", () => {
    function Go() {
      const navigate = useNavigate();
      return <button type="button" onClick={() => void navigate("/profile/settings/import-history")}>arrive</button>;
    }
    renderInShell(<><Go /><ImportHistoryPage /><Probe /></>, { path: "/portfolio/mutual-funds", routes: LIVE_ROUTES, scope: { refreshMembers: vi.fn() } });
    fireEvent.click(screen.getByRole("button", { name: "arrive" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/settings/import-history");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/portfolio/mutual-funds");
  });

  it("after an import is deleted, clears the cached member data and then reloads the shell's member list", () => {
    const order: string[] = [];
    vi.mocked(invalidateApiCache).mockImplementation(() => { order.push("invalidate"); });
    const refreshMembers = vi.fn(() => { order.push("refresh"); });
    mount(refreshMembers);
    fireEvent.click(screen.getByRole("button", { name: "stub deleted an import" }));
    expect(order).toEqual(["invalidate", "refresh"]);
  });

  it("calls nothing on its own: the section does the loading", () => {
    const refreshMembers = mount();
    expect(getHouseholdImportHistory).not.toHaveBeenCalled();
    expect(deleteHouseholdImport).not.toHaveBeenCalled();
    expect(listHouseholdMembers).not.toHaveBeenCalled();
    expect(invalidateApiCache).not.toHaveBeenCalled();
    expect(refreshMembers).not.toHaveBeenCalled();
  });
});
