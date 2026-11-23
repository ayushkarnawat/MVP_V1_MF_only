import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { getHouseholdMembers } from "../../features/auth/api";
import { ScopeProvider } from "./ScopeProvider";
import { useScope } from "./ScopeContext";

// Pages may not import the auth feature (only its session file), so the signed-in user's id, which the search
// recents are keyed by, travels through the scope value.
const auth = vi.hoisted(() => ({ me: { user_id: "account-a" } as { user_id: string } | null }));
vi.mock("../../features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../features/auth/api", () => ({ getHouseholdMembers: vi.fn() }));
vi.mock("../../lib/apiClient", () => ({ invalidateApiCache: vi.fn() }));

function Probe() { return <output data-testid="uid">{useScope().userId ?? "none"}</output>; }
const mount = () => render(<MemoryRouter initialEntries={["/home"]}><ScopeProvider><Probe /></ScopeProvider></MemoryRouter>);

beforeEach(() => {
  vi.resetAllMocks();
  auth.me = { user_id: "account-a" };
  vi.mocked(getHouseholdMembers).mockResolvedValue([]);
});

it("the scope value carries the signed-in user's id", async () => {
  mount();
  await waitFor(() => expect(screen.getByTestId("uid").textContent).toBe("account-a"));
});

it("the user id is null when nobody is signed in", async () => {
  auth.me = null;
  mount();
  await waitFor(() => expect(screen.getByTestId("uid").textContent).toBe("none"));
});
