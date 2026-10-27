import { fireEvent, screen, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShellRoutes } from "@/shell/ShellRoot";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { listHouseholdMembers } from "@/features/auth/api";
import type { MeResponse } from "@/features/auth/types";
import { deleteMemberPortfolio, getHouseholdImportHistory } from "@/features/import/api";
import { getLegalDocuments, getMyConsents } from "@/features/legal/api";
import { DOCS } from "@/features/legal/testFixtures";
import { CONSENTS_FIXTURE } from "./fixtures/consents";
import { ME_FIXTURE } from "./fixtures/me";
import { HOUSEHOLD_FIXTURE } from "./fixtures/members";

const auth = vi.hoisted(() => ({
  me: null as MeResponse | null,
  logout: vi.fn(), updateMe: vi.fn(), refreshMe: vi.fn(), requestAccountDeletion: vi.fn(), requestContactChange: vi.fn(), verifyContactChange: vi.fn(),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/features/auth/api", () => ({ listHouseholdMembers: vi.fn() }));
vi.mock("@/features/import/api", () => ({ getHouseholdImportHistory: vi.fn(), deleteHouseholdImport: vi.fn(), deleteMemberPortfolio: vi.fn() }));
vi.mock("@/features/legal/api", async importOriginal => ({
  ...(await importOriginal<typeof import("@/features/legal/api")>()),
  getLegalDocuments: vi.fn(),
  getMyConsents: vi.fn(),
}));
vi.mock("@/lib/apiClient", () => ({ invalidateApiCache: vi.fn() }));
vi.mock("@/features/dev/useDevToolsEnabled", () => ({ useDevToolsEnabled: () => false }));
vi.mock("@/features/dev/ImportHealth", () => ({ ImportHealth: () => <h1>Import health screen</h1> }));

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function mount(path: string, openImport?: (memberId?: string) => void) {
  return renderInShell(<><ShellRoutes /><Probe /></>, { path, openImport });
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
  "profile-subscription", "profile-tax", "profile-data-privacy", "profile-import-health",
];

beforeEach(() => {
  vi.clearAllMocks();
  auth.me = ME_FIXTURE;
  auth.updateMe.mockResolvedValue(undefined);
  auth.refreshMe.mockResolvedValue(undefined);
  vi.mocked(listHouseholdMembers).mockResolvedValue(HOUSEHOLD_FIXTURE);
  vi.mocked(getHouseholdImportHistory).mockResolvedValue([]);
  vi.mocked(deleteMemberPortfolio).mockResolvedValue({ deleted_transactions_count: 0, removed_member_ids: [], deleted_file: false });
  vi.mocked(getLegalDocuments).mockResolvedValue(DOCS);
  vi.mocked(getMyConsents).mockResolvedValue(CONSENTS_FIXTURE);
});

describe("Profile routes in the real shell registry (contract v1.4)", () => {
  it("has exactly the thirteen Profile routes, all live", () => {
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

describe("Personal Information, Settings, Import History and Subscription are real pages in the frame (deep link, twice in a row)", () => {
  it("/profile/personal shows the new page, with the account's name and masked PAN, not the old screen", async () => {
    for (let visit = 0; visit < 2; visit++) {
      const view = mount("/profile/personal");
      expect(await screen.findByRole("heading", { level: 2, name: "Personal Information" })).toBeInTheDocument();
      expect(await screen.findByText("AB******4F")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
      expect(screen.getByTestId("profile-name")).toHaveTextContent("Siddharth Surve");
      expect(screen.getByRole("heading", { level: 2, name: "Financial Details" })).toBeInTheDocument();
      expect(screen.queryByText("Old profile screen")).not.toBeInTheDocument();
      expect(currentLabel()).toBe("Personal Information");
      view.unmount();
    }
  });

  it("/profile/settings lists the four rows and marks Settings as current", async () => {
    for (let visit = 0; visit < 2; visit++) {
      const view = mount("/profile/settings");
      expect(await screen.findByRole("heading", { level: 2, name: "Settings" })).toBeInTheDocument();
      const rows = within(screen.getByRole("list", { name: "Settings sections" })).getAllByRole("listitem");
      expect(rows.map(row => within(row).getByTestId("settings-row-title").textContent)).toEqual(["Notifications", "Preferences", "Security", "Import History"]);
      expect(screen.queryByTestId("profile-pending")).not.toBeInTheDocument();
      expect(currentLabel()).toBe("Settings");
      view.unmount();
    }
  });

  it("a Settings row opens its page: Security opens the Coming soon page, Import History opens the history", async () => {
    mount("/profile/settings");
    await screen.findByRole("heading", { level: 2, name: "Settings" });
    fireEvent.click(within(screen.getByRole("list", { name: "Settings sections" })).getByRole("link", { name: /Security/ }));
    expect(await screen.findByRole("heading", { level: 2, name: "Security" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/settings/security");
    fireEvent.click(within(screen.getByTestId("profile-content")).getByRole("link", { name: "Settings" }));
    await screen.findByRole("heading", { level: 2, name: "Settings" });
    fireEvent.click(within(screen.getByRole("list", { name: "Settings sections" })).getByRole("link", { name: /Import History/ }));
    expect(await screen.findByText("No imports yet.")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/settings/import-history");
  });

  it("/profile/settings/import-history shows the existing history section and a Back link to Settings", async () => {
    for (let visit = 0; visit < 2; visit++) {
      const view = mount("/profile/settings/import-history");
      expect(await screen.findByRole("heading", { level: 2, name: "Import History" })).toBeInTheDocument();
      expect(await screen.findByText("No imports yet.")).toBeInTheDocument();
      expect(within(screen.getByTestId("profile-content")).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/profile/settings");
      expect(currentLabel()).toBe("Settings");
      view.unmount();
    }
  });

  it("/profile/subscription shows the Early access card and marks Subscription & Billing as current", async () => {
    for (let visit = 0; visit < 2; visit++) {
      const view = mount("/profile/subscription");
      expect(await screen.findByRole("heading", { level: 2, name: "Subscription & Billing" })).toBeInTheDocument();
      expect(screen.getByTestId("plan-row")).toHaveTextContent("Early access");
      expect(screen.queryByTestId("profile-pending")).not.toBeInTheDocument();
      expect(currentLabel()).toBe("Subscription & Billing");
      view.unmount();
    }
  });

  it("the Profile list moves between the new pages", async () => {
    mount("/profile/personal");
    await screen.findByText("AB******4F");
    fireEvent.click(within(navOf()).getByRole("link", { name: "Subscription & Billing" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Subscription & Billing" })).toBeInTheDocument();
    fireEvent.click(within(navOf()).getByRole("link", { name: "Personal Information" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Financial Details" })).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Profile sections" })).toHaveLength(1);
  });
});

describe("Family Members and Data & Privacy are real pages in the frame (deep link, twice in a row); no page is pending any more", () => {
  it("/profile/family shows the strip and one card per member, marks Family Members as current, and is not the pending page", async () => {
    for (let visit = 0; visit < 2; visit++) {
      const view = mount("/profile/family");
      expect(await screen.findByRole("heading", { level: 2, name: "Family Account" })).toBeInTheDocument();
      expect(await screen.findAllByTestId("member-card")).toHaveLength(3);
      expect(screen.getByRole("heading", { level: 2, name: "Family Members" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
      expect(screen.queryByTestId("profile-pending")).not.toBeInTheDocument();
      expect(currentLabel()).toBe("Family Members");
      view.unmount();
    }
  });

  it("/profile/data-privacy shows the four blocks, marks Data & Privacy as current, and is not the pending page", async () => {
    for (let visit = 0; visit < 2; visit++) {
      const view = mount("/profile/data-privacy");
      expect(await screen.findAllByTestId("consent-row")).toHaveLength(3);
      const headings = within(screen.getByTestId("profile-content")).getAllByRole("heading", { level: 2 }).map(heading => heading.textContent);
      expect(headings).toEqual(["Terms of Service", "Your consents", "What we store", "Delete account"]);
      expect(screen.queryByTestId("profile-pending")).not.toBeInTheDocument();
      expect(currentLabel()).toBe("Data & Privacy");
      view.unmount();
    }
  });

  it("the Profile list moves between the two pages and keeps one frame", async () => {
    mount("/profile/family");
    await screen.findAllByTestId("member-card");
    fireEvent.click(within(navOf()).getByRole("link", { name: "Data & Privacy" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Your consents" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/data-privacy");
    fireEvent.click(within(navOf()).getByRole("link", { name: "Family Members" }));
    expect((await screen.findAllByTestId("member-card")).length).toBe(3);
    expect(screen.getAllByRole("navigation", { name: "Profile sections" })).toHaveLength(1);
  });

  it("Add statement on the Family page reaches the shell's import hook with the chosen person", async () => {
    const openImport = vi.fn();
    mount("/profile/family", openImport);
    await screen.findAllByTestId("member-card");
    fireEvent.click(screen.getByRole("button", { name: "Add statement" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Add statement for whom?" })).getByRole("button", { name: "Aditi Surve" }));
    expect(openImport).toHaveBeenCalledWith("m-spouse");
  });

  it("'Change in Account Info' on the Family page opens the Personal Information page", async () => {
    mount("/profile/family");
    await screen.findAllByTestId("member-card");
    fireEvent.click(screen.getByRole("button", { name: "Change in Account Info" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Financial Details" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/personal");
  });

  it("every one of the seven Profile list pages is a real page: none shows the pending text", async () => {
    for (const path of ["/profile/personal", "/profile/family", "/profile/connected-accounts", "/profile/settings", "/profile/subscription", "/profile/tax", "/profile/data-privacy"]) {
      const view = mount(path);
      await screen.findByRole("navigation", { name: "Profile sections" });
      await screen.findAllByRole("heading", { level: 2 });
      expect(screen.queryByTestId("profile-pending"), path).not.toBeInTheDocument();
      expect(screen.queryByText("This page is being built."), path).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe("All eleven Profile pages (seven list pages, four Settings children) are real pages in the frame", () => {
  it.each([
    ["/profile/personal", "Personal Information"],
    ["/profile/family", "Family Members"],
    ["/profile/connected-accounts", "Connected Accounts"],
    ["/profile/settings", "Settings"],
    ["/profile/subscription", "Subscription & Billing"],
    ["/profile/tax", "Tax Information"],
    ["/profile/data-privacy", "Data & Privacy"],
    ["/profile/settings/notifications", "Settings"],
    ["/profile/settings/preferences", "Settings"],
    ["/profile/settings/security", "Settings"],
    ["/profile/settings/import-history", "Settings"],
  ])("%s: frame, one current item %j, not the pending page; deep link and remount twice", async (path, current) => {
    for (let visit = 0; visit < 2; visit++) {
      const view = mount(path);
      expect(await screen.findByRole("navigation", { name: "Profile sections" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
      expect((await screen.findAllByRole("heading", { level: 2 })).length).toBeGreaterThan(0);
      expect(screen.getByTestId("location")).toHaveTextContent(path);
      expect(screen.queryByTestId("profile-pending"), path).not.toBeInTheDocument();
      expect(screen.queryByText("This page is being built."), path).not.toBeInTheDocument();
      expect(screen.queryByText("Old profile screen")).not.toBeInTheDocument();
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
  it("/profile/personal no longer opens the old screen", async () => {
    mount("/profile/personal");
    await screen.findByRole("heading", { level: 2, name: "Personal Information" });
    expect(screen.queryByRole("heading", { name: "Old profile screen" })).not.toBeInTheDocument();
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
