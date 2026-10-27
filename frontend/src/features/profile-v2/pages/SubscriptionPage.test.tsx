import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import SubscriptionPage from "./SubscriptionPage";

const auth = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

const LIVE_ROUTES = buildRegistry().map(route => route.id.startsWith("profile") ? { ...route, status: "live" as const } : route);

beforeEach(() => { vi.clearAllMocks(); });

describe("SubscriptionPage", () => {
  function mount() {
    renderInShell(<SubscriptionPage />, { path: "/profile/subscription", routes: LIVE_ROUTES });
  }

  it("sits in the Profile frame with Subscription & Billing marked as the current item", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
    const current = screen.getByRole("navigation", { name: "Profile sections" }).querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Subscription & Billing");
  });

  it("shows the plan card and nothing else in the content column", () => {
    mount();
    const content = screen.getByTestId("profile-content");
    expect(within(content).getByTestId("subscription-card")).toBeInTheDocument();
    expect(within(content).getByRole("heading", { level: 2, name: "Subscription & Billing" })).toBeInTheDocument();
    expect(within(content).getByTestId("plan-row")).toHaveTextContent("Current planEarly access");
    expect(within(content).getByTestId("plan-badge")).toHaveTextContent("Active");
    expect(within(content).queryAllByRole("link")).toHaveLength(0);
    expect(within(content).queryAllByRole("button")).toHaveLength(0);
  });
});
