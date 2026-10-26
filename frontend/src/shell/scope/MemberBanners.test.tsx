import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { CompleteProfileDialogProps } from "../../features/dashboard/members/CompleteProfileDialog";
import type { HouseholdMember } from "../../features/auth/types";
import { invalidateApiCache } from "../../lib/apiClient";
import { renderInShell } from "../testing";
import { MemberBanners } from "./MemberBanners";
import { useScope } from "./ScopeContext";
import { useLocation } from "react-router";

vi.mock("../../features/auth/AuthContext", () => ({ useAuth: () => ({ me: { phone_number: "123", email: "a@example.test" } }) }));
vi.mock("../../lib/apiClient", () => ({ invalidateApiCache: vi.fn() }));
vi.mock("../../features/dashboard/members/CompleteProfileDialog", () => ({ CompleteProfileDialog: (props: CompleteProfileDialogProps) => <div role="dialog" aria-label={props.member.name}>
  <span>{props.accountPhone} {props.accountEmail}</span>
  <button onClick={() => props.onSaved(props.member)}>Save</button>
  <button onClick={() => props.onMerged("b")}>Merge</button>
  <button onClick={props.onClose}>Close</button>
  <button onClick={props.onChangeInAccountInfo}>Account info</button>
</div> }));

const raw: HouseholdMember = { id: "a", name: "Alice", relationship: "self", relationship_other_label: null, origin: "onboarding", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 50, missing_fields: ["pan"], removed_with_last_import: false };
const refreshMembers = vi.fn();
beforeEach(() => { vi.clearAllMocks(); refreshMembers.mockResolvedValue(undefined); });

function Probe() { return <><output data-testid="pick">{useScope().memberId}</output><output data-testid="path">{useLocation().pathname}</output></>; }
function mount({ path = "/portfolio/mutual-funds", viewMode = "member", profile = raw }: { path?: string; viewMode?: "member" | "aggregate"; profile?: HouseholdMember } = {}) {
  const members = [{ id: "a", name: "Alice", profile }, { id: "b", name: "Bob", profile: { ...raw, id: "b", name: "Bob" } }];
  return renderInShell(<><MemberBanners /><Probe /></>, { path, scope: { viewMode, memberId: "a", members, refreshMembers } });
}

it("shows the PAN conflict and profile nudge for a selected member", () => {
  mount({ profile: { ...raw, pan_conflict: "other_account" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Alice’s PAN");
  expect(screen.getByRole("progressbar", { name: "Profile completion" })).toHaveAttribute("aria-valuenow", "50");
  fireEvent.click(screen.getByRole("button", { name: /50% complete/ }));
  expect(screen.getByRole("dialog", { name: "Alice" })).toHaveTextContent("123 a@example.test");
});

it.each([
  ["/portfolio/mutual-funds", "aggregate"], ["/profile", "member"], ["/profile/personal", "member"], ["/import", "member"],
] as const)("hides banners on %s in %s mode", (path, viewMode) => {
  mount({ path, viewMode });
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("opens Edit profile for a complete member and closes the dialog", () => {
  mount({ profile: { ...raw, profile_completion: 100 } });
  fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("invalidates before refreshing after save", () => {
  const events: string[] = [];
  vi.mocked(invalidateApiCache).mockImplementation(() => { events.push("invalidate"); });
  refreshMembers.mockImplementation(() => { events.push("refresh"); });
  mount(); fireEvent.click(screen.getByRole("button", { name: /50% complete/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(events).toEqual(["invalidate", "refresh"]);
});

it("awaits refresh before selecting a merged member and closing", async () => {
  let finish!: () => void;
  refreshMembers.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  mount(); fireEvent.click(screen.getByRole("button", { name: /50% complete/ }));
  fireEvent.click(screen.getByRole("button", { name: "Merge" }));
  expect(invalidateApiCache).toHaveBeenCalledTimes(1);
  expect(refreshMembers).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("pick")).toHaveTextContent("a");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  finish();
  await waitFor(() => expect(screen.getByTestId("pick")).toHaveTextContent("b"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("closes the dialog and navigates to Profile for account changes", async () => {
  mount(); fireEvent.click(screen.getByRole("button", { name: /50% complete/ }));
  fireEvent.click(screen.getByRole("button", { name: "Account info" }));
  await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/profile"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
