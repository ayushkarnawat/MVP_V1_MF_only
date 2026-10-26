import { fireEvent, screen, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShellRoutes } from "@/shell/ShellRoot";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";

const auth = vi.hoisted(() => ({
  me: { user_id: "u-1", email: "alice@example.test", phone_number: "123" } as { user_id: string; email: string | null; phone_number: string | null } | null,
  logout: vi.fn(), requestAccountDeletion: vi.fn(), requestContactChange: vi.fn(), verifyContactChange: vi.fn(),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/features/profile/ProfileView", () => ({ ProfileView: () => <h1>Old profile screen</h1> }));
vi.mock("@/features/dev/ImportHealth", () => ({ ImportHealth: () => <h1>Import health screen</h1> }));

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function mount(path: string) {
  return renderInShell(<><ShellRoutes /><Probe /></>, { path });
}

const navOf = () => screen.getByRole("navigation", { name: "Profile sections" });
const currentLabel = () => {
  const current = navOf().querySelectorAll('[aria-current="page"]');
  expect(current).toHaveLength(1);
  return current[0].textContent;
};

const PROFILE_IDS = [
  "profile", "profile-personal", "profile-family", "profile-connected-accounts", "profile-settings",
  "profile-settings-notifications", "profile-settings-preferences", "profile-settings-security", "profile-settings-import-history",
  "profile-subscription", "profile-tax", "profile-data-privacy", "profile-legacy", "profile-import-health",
];

beforeEach(() => { vi.clearAllMocks(); });

describe("Profile routes in the real shell registry (contract v1.4)", () => {
  it("has exactly the fourteen Profile routes, all live", () => {
    const profile = buildRegistry().filter(route => route.id === "profile" || route.id.startsWith("profile-"));
    expect(profile.map(route => route.id).sort()).toEqual([...PROFILE_IDS].sort());
    expect(profile.filter(route => route.status !== "live").map(route => route.id)).toEqual([]);
  });

  it("keeps every Profile route unscoped, in the app layout, with only `profile` as a footer item", () => {
    const profile = buildRegistry().filter(route => route.id === "profile" || route.id.startsWith("profile-"));
    for (const route of profile) {
      expect(route.scope, route.id).toBe("none");
      expect(route.layout, route.id).toBe("app");
      expect(route.section, route.id).toBe(route.id === "profile" ? "footer" : null);
    }
  });

  it("redirects /profile to /profile/personal", async () => {
    mount("/profile");
    await screen.findByTestId("location");
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/personal");
  });
});

describe("Coming soon pages inside the Profile frame (deep link and refresh, no prior navigation)", () => {
  it.each([
    ["/profile/connected-accounts", "Connected Accounts", "Connected Accounts"],
    ["/profile/tax", "Tax Information", "Tax Information"],
    ["/profile/settings/notifications", "Notifications", "Settings"],
    ["/profile/settings/preferences", "Preferences", "Settings"],
    ["/profile/settings/security", "Security", "Settings"],
  ])("%s shows the frame, the page heading %j and marks %j as current, twice in a row", async (path, heading, current) => {
    for (let visit = 0; visit < 2; visit++) {
      const view = mount(path);
      expect(await screen.findByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
      expect(currentLabel()).toBe(current);
      expect(screen.getByTestId("coming-soon-tag")).toBeInTheDocument();
      view.unmount();
    }
  });

  it("a Settings child page has a Back link that opens Settings", async () => {
    mount("/profile/settings/security");
    await screen.findByRole("heading", { level: 2, name: "Security" });
    fireEvent.click(within(screen.getByTestId("profile-content")).getByRole("link", { name: "Settings" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/settings");
  });

  it("Connected Accounts lists the planned accounts", async () => {
    mount("/profile/connected-accounts");
    const list = await screen.findByRole("list", { name: "Planned accounts" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
  });
});

describe("Pages not built yet are a pending page inside the frame (replaced one by one by the next runs)", () => {
  it.each([
    ["/profile/family", "Family Members", "Family Members"],
    ["/profile/settings", "Settings", "Settings"],
    ["/profile/settings/import-history", "Import History", "Settings"],
    ["/profile/subscription", "Subscription & Billing", "Subscription & Billing"],
    ["/profile/data-privacy", "Data & Privacy", "Data & Privacy"],
  ])("%s shows the route title %j under the frame and marks %j", async (path, title, current) => {
    for (let visit = 0; visit < 2; visit++) {
      const view = mount(path);
      expect(await screen.findByRole("heading", { level: 2, name: title })).toBeInTheDocument();
      expect(screen.getByTestId("profile-pending")).toHaveTextContent("This page is being built.");
      expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
      expect(currentLabel()).toBe(current);
      view.unmount();
    }
  });
});

describe("Navigation inside the frame", () => {
  it("moves from one Profile page to another through the list, keeping one frame", async () => {
    mount("/profile/family");
    await screen.findByRole("heading", { level: 2, name: "Family Members" });
    fireEvent.click(within(navOf()).getByRole("link", { name: "Connected Accounts" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Connected Accounts" })).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Profile sections" })).toHaveLength(1);
    expect(currentLabel()).toBe("Connected Accounts");
    fireEvent.click(within(navOf()).getByRole("link", { name: "Settings" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/settings");
  });

  it("Logout in the list asks first and signs out only on confirm", async () => {
    mount("/profile/tax");
    await screen.findByRole("heading", { level: 2, name: "Tax Information" });
    fireEvent.click(within(navOf()).getByRole("button", { name: "Logout" }));
    expect(auth.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, log out" }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});

describe("Routes that stay as they are", () => {
  it("/profile/legacy opens the existing Profile screen, without the new frame", async () => {
    mount("/profile/legacy");
    expect(await screen.findByRole("heading", { name: "Old profile screen" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Profile sections" })).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/legacy");
  });

  it("/profile/import-health still opens the dev screen", async () => {
    mount("/profile/import-health");
    expect(await screen.findByRole("heading", { name: "Import health screen" })).toBeInTheDocument();
  });

  it("an unknown /profile/xyz falls to the shell's not-found page, not a blank page", async () => {
    mount("/profile/xyz");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText("We could not find this page.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Profile sections" })).not.toBeInTheDocument();
  });
});
