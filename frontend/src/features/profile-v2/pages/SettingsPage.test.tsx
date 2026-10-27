import { fireEvent, screen, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import SettingsPage from "./SettingsPage";

const auth = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));
const dev = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/features/dev/useDevToolsEnabled", () => ({ useDevToolsEnabled: () => dev.enabled }));

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{JSON.stringify({ path: location.pathname, state: location.state })}</output>;
}

const LIVE_ROUTES = buildRegistry().map(route => route.id.startsWith("profile") ? { ...route, status: "live" as const } : route);

function mount() {
  return renderInShell(<><SettingsPage /><Probe /></>, { path: "/profile/settings", routes: LIVE_ROUTES });
}

const locationNow = () => JSON.parse(screen.getByTestId("location").textContent ?? "{}") as { path: string; state: unknown };

beforeEach(() => {
  vi.clearAllMocks();
  dev.enabled = false;
});

describe("SettingsPage", () => {
  it("sits in the Profile frame with Settings marked as the current item", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
    const current = screen.getByRole("navigation", { name: "Profile sections" }).querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Settings");
    expect(within(screen.getByTestId("profile-content")).getByRole("heading", { level: 2, name: "Settings" })).toBeInTheDocument();
  });

  it("has the one-line subtitle and the four rows", () => {
    mount();
    const content = screen.getByTestId("profile-content");
    expect(within(content).getByText("Manage how Unifolio works for you.")).toBeInTheDocument();
    const rows = within(within(content).getByRole("list", { name: "Settings sections" })).getAllByRole("listitem");
    expect(rows.map(row => within(row).getByRole("link").getAttribute("href"))).toEqual([
      "/profile/settings/notifications",
      "/profile/settings/preferences",
      "/profile/settings/security",
      "/profile/settings/import-history",
    ]);
  });

  it("does not show the import history itself (it lives on its own page)", () => {
    mount();
    expect(screen.queryByText("No imports yet.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Import History" })).not.toBeInTheDocument();
  });

  it("leaves out the Import health link when dev tools are off", () => {
    mount();
    expect(screen.queryByRole("button", { name: "Import health (staging)" })).not.toBeInTheDocument();
    expect(screen.queryByText(/import health/i)).not.toBeInTheDocument();
  });

  it("shows the Import health (staging) button at the foot when dev tools are on", () => {
    dev.enabled = true;
    mount();
    const content = screen.getByTestId("profile-content");
    const button = within(content).getByRole("button", { name: "Import health (staging)" });
    const list = within(content).getByRole("list", { name: "Settings sections" });
    expect(list.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens Import health and marks the entry as coming from Profile, so its Back pops straight back here", () => {
    dev.enabled = true;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Import health (staging)" }));
    expect(locationNow()).toEqual({ path: "/profile/import-health", state: { from: "profile" } });
  });

  it("opens the Coming soon rows' pages through the links", () => {
    mount();
    fireEvent.click(screen.getByRole("link", { name: /Security/ }));
    expect(locationNow().path).toBe("/profile/settings/security");
  });
});
