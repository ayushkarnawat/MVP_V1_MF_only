import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getHouseholdMembers } from "../../features/auth/api";
import type { HouseholdMember } from "../../features/auth/types";
import { ScopeProvider } from "../../shell/scope/ScopeProvider";
import { useScope } from "../../shell/scope/ScopeContext";
import { useSearchIntent } from "./useSearchIntent";

// The scope provider and the page's intent hook both tidy the same history entry. This runs them together on the REAL
// provider: a jump with a member and a section must scroll once, land on the member and leave no intent behind.
const auth = vi.hoisted(() => ({ me: { user_id: "account-a" } }));
vi.mock("../../features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../features/auth/api", () => ({ getHouseholdMembers: vi.fn() }));
vi.mock("../../lib/apiClient", () => ({ invalidateApiCache: vi.fn() }));

function member(id: string, name: string): HouseholdMember {
  return { id, name, relationship: "self", relationship_other_label: null, origin: "onboarding",
    pan_masked: null, phone_number: null, email: null, name_from_statement: false,
    pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false };
}

function Page() {
  useSearchIntent();
  const scope = useScope();
  const navigate = useNavigate();
  const location = useLocation();
  return <>
    <output data-testid="member">{scope.memberId ?? "none"}</output>
    <output data-testid="state">{JSON.stringify(location.state)}</output>
    <button onClick={() => { void navigate("/portfolio/mutual-funds/overlap", { state: { searchIntent: { scope: { memberId: "b" }, section: "overlap-heatmap" } } }); }}>Jump</button>
    <section id="overlap-heatmap">Heatmap</section>
  </>;
}

let scrollSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  auth.me = { user_id: "account-a" };
  vi.mocked(getHouseholdMembers).mockResolvedValue([member("a", "Asha"), member("b", "Bela")]);
  scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);
});
afterEach(() => { scrollSpy.mockRestore(); });

it("a jump with a member and a section scrolls once, lands on the member and leaves no intent behind", async () => {
  render(<MemoryRouter initialEntries={["/home"]}><ScopeProvider><Page /></ScopeProvider></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Jump" })).toBeInTheDocument());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  act(() => { fireEvent.click(screen.getByRole("button", { name: "Jump" })); });
  await waitFor(() => expect(screen.getByTestId("member").textContent).toBe("b"));
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("null"));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  expect(scrollSpy).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("member").textContent).toBe("b");
});
