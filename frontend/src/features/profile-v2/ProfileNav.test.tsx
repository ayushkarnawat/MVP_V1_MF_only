import { fireEvent, screen, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { ProfileNav } from "./ProfileNav";

const auth = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

const LABELS = ["Personal Information", "Family Members", "Connected Accounts", "Settings", "Subscription & Billing", "Tax Information", "Data & Privacy"];
const HREFS = ["/profile/personal", "/profile/family", "/profile/connected-accounts", "/profile/settings", "/profile/subscription", "/profile/tax", "/profile/data-privacy"];

// The nav is tested on its own: every Profile route counts as live here, so these tests do not depend on which route files are already switched on (routes.test.tsx checks the real registry).
const LIVE_ROUTES = buildRegistry().map(route => route.id.startsWith("profile") ? { ...route, status: "live" as const } : route);

function mount(path = "/profile/family") {
  renderInShell(<><ProfileNav /><Probe /></>, { path, routes: LIVE_ROUTES });
  return screen.getByRole("navigation", { name: "Profile sections" });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("ProfileNav", () => {
  it("is a navigation named 'Profile sections' with the seven links in contract order and real hrefs", () => {
    const nav = mount();
    const links = within(nav).getAllByRole("link");
    expect(links.map(link => link.textContent)).toEqual(LABELS);
    expect(links.map(link => link.getAttribute("href"))).toEqual(HREFS);
    for (const link of links) expect(link).not.toHaveAttribute("aria-disabled");
  });

  it("puts a separator and then a Logout button after the links (not a link)", () => {
    const nav = mount();
    expect(within(nav).getByRole("separator")).toBeInTheDocument();
    const logout = within(nav).getByRole("button", { name: "Logout" });
    expect(logout).toHaveAttribute("type", "button");
    expect(within(nav).queryByRole("link", { name: "Logout" })).not.toBeInTheDocument();
    expect(within(nav).getAllByRole("button")).toHaveLength(1);
  });

  it("hides every icon from assistive technology", () => {
    const nav = mount();
    const icons = nav.querySelectorAll("svg");
    expect(icons.length).toBe(8);
    for (const icon of icons) expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it.each([
    ["/profile/personal", "Personal Information"],
    ["/profile/family", "Family Members"],
    ["/profile/connected-accounts", "Connected Accounts"],
    ["/profile/settings", "Settings"],
    ["/profile/settings/security", "Settings"],
    ["/profile/settings/import-history", "Settings"],
    ["/profile/subscription", "Subscription & Billing"],
    ["/profile/tax", "Tax Information"],
    ["/profile/data-privacy", "Data & Privacy"],
  ])("at %s exactly one element is marked aria-current=page: %s", (path, label) => {
    const nav = mount(path);
    const current = nav.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe(label);
  });

  it("marks nothing on a Profile path that is not in the list", () => {
    const nav = mount("/profile/legacy");
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it("styles the current link with the selected tint and no other link", () => {
    const nav = mount("/profile/settings/preferences");
    expect(within(nav).getByRole("link", { name: "Settings" }).className).toContain("bg-[var(--pos-bg)]");
    expect(within(nav).getByRole("link", { name: "Family Members" }).className).not.toContain("bg-[var(--pos-bg)]");
    expect(within(nav).getByRole("link", { name: "Family Members" }).className).toContain("hover:bg-[var(--ui-row-hover)]");
  });

  it("navigates without a reload when a link is clicked", () => {
    const nav = mount("/profile/family");
    fireEvent.click(within(nav).getByRole("link", { name: "Tax Information" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/tax");
    expect(nav.querySelectorAll('[aria-current="page"]')[0].textContent).toBe("Tax Information");
  });

  it("asks before logging out: Cancel keeps the user signed in, only the confirm button calls logout", () => {
    const nav = mount();
    fireEvent.click(within(nav).getByRole("button", { name: "Logout" }));
    expect(screen.getByText("Log out of Unifolio?")).toBeInTheDocument();
    expect(auth.logout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(auth.logout).not.toHaveBeenCalled();
    expect(screen.queryByText("Log out of Unifolio?")).not.toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "Logout" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, log out" }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
});
