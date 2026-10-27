import { screen, waitFor, within, configure } from "@testing-library/react";
import { useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRegistry } from "../../shell/registry/buildRegistry";
import { ShellRoutes } from "../../shell/ShellRoot";
import { renderInShell } from "../../shell/testing";
import HomePageDefault, { HomePage } from "./HomePage";
import { greetingLine } from "./homeFormat";
import { MEMBERS, mockHomeApi } from "./testing/homeApi";

// The whole front-end suite runs many files at once: give async queries room so a slow machine does not fail them.
configure({ asyncUtilTimeout: 5000 });

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ me: { user_id: "u-1" } }) }));

afterEach(() => { vi.unstubAllGlobals(); });

function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }

// The route flip (plan T11): `shell/routes/home.route.tsx` stops being a placeholder. The old Dashboard route is untouched.
describe("Home route flip", () => {
  const registry = buildRegistry();
  const home = registry.find(route => route.id === "home")!;

  it("makes the home route live, with the same path, menu place, layout and scope as before", () => {
    expect(home).toMatchObject({
      id: "home", path: "/home", label: "Home", section: "main", order: 1, layout: "app", scope: "family-or-member", status: "live", title: "Home",
    });
    expect(home.page).toBeTypeOf("function");
    expect(home.redirectTo).toBeUndefined();
  });

  it("loads the Home page component as the route's page", async () => {
    const module = await home.page!();
    expect(module.default).toBe(HomePage);
    expect(HomePageDefault).toBe(HomePage);
  });

  it("leaves the old Dashboard route exactly where it was", () => {
    const dashboard = registry.find(route => route.id === "portfolio-mutual-funds")!;
    expect(dashboard).toMatchObject({ path: "/portfolio/mutual-funds", status: "live", title: "Mutual Funds", section: "portfolio", scope: "family-or-member" });
    expect(String(dashboard.page)).toContain("DashboardWrapper");
  });

  it("keeps the landing route: the root path still redirects to /home", () => {
    expect(registry.find(route => route.id === "root")).toMatchObject({ path: "/", redirectTo: "/home", status: "live" });
  });

  it("shows the Home page at /home inside the shell, with the tab title and an enabled sidebar link", async () => {
    mockHomeApi();
    renderInShell(<><ShellRoutes /><Location /></>, { path: "/home", scope: { members: MEMBERS } });
    expect(await screen.findByRole("heading", { name: greetingLine("evening", "Asha"), level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Home", level: 1 })).toBeNull();
    await waitFor(() => expect(document.title).toBe("Home · Unifolio"));
    const nav = screen.getByRole("navigation", { name: /main|primary|sidebar/i });
    const link = within(nav).getByRole("link", { name: "Home" });
    expect(link).toHaveAttribute("href", "/home");
    expect(link).not.toHaveAttribute("aria-disabled");
  });

  it("lands on Home from the root path", async () => {
    mockHomeApi();
    renderInShell(<><ShellRoutes /><Location /></>, { path: "/", scope: { members: MEMBERS } });
    expect(await screen.findByRole("heading", { name: greetingLine("evening", "Asha"), level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/home");
  });
});
