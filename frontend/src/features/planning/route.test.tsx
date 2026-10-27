import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { ShellRoutes } from "@/shell/ShellRoot";
import { renderInShell } from "@/shell/testing";
import { getScenarioResult, listScenarios } from "./api";
import PlanningPage from "./PlanningPage";

vi.mock("./api", () => ({ listScenarios: vi.fn(), getScenarioResult: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => ({ me: { user_id: "u-1" } }) }));

beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, ""); });

describe("the /planning route", () => {
  it("is live, in the app layout, with no member scope, and loads the Planning page", async () => {
    const route = buildRegistry().find(entry => entry.id === "planning");
    expect(route).toMatchObject({ path: "/planning", status: "live", layout: "app", scope: "none", title: "Planning" });
    const loaded = await route?.page?.();
    expect(loaded && "default" in loaded ? loaded.default : undefined).toBe(PlanningPage);
  });

  it("renders the Planning landing through the registry, not the old Scenarios screen", async () => {
    renderInShell(undefined, { path: "/planning" });
    expect(await screen.findByRole("heading", { level: 1, name: "Planning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plan your future/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Explore market scenarios/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Scenarios" })).toBeNull();
    await waitFor(() => expect(document.title).toBe("Planning · Unifolio"));
    expect(listScenarios).not.toHaveBeenCalled();
    expect(getScenarioResult).not.toHaveBeenCalled();
  });

  it("marks Planning as the current page in the sidebar", async () => {
    renderInShell(<ShellRoutes />, { path: "/planning" });
    await screen.findByRole("heading", { level: 1, name: "Planning" });
    expect(screen.getByRole("link", { name: "Planning" })).toHaveAttribute("aria-current", "page");
  });
});
