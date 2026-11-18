import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, useNavigate } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { getHouseholdMembers } from "../../features/auth/api";
import type { HouseholdMember } from "../../features/auth/types";
import { invalidateApiCache } from "../../lib/apiClient";
import { ScopeProvider } from "./ScopeProvider";
import { useScope } from "./ScopeContext";

const auth = vi.hoisted(() => ({ me: { user_id: "account-a" } }));
vi.mock("../../features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../features/auth/api", () => ({ getHouseholdMembers: vi.fn() }));
vi.mock("../../lib/apiClient", () => ({ invalidateApiCache: vi.fn() }));

function member(id: string, name = id): HouseholdMember {
  return { id, name, relationship: "self", relationship_other_label: null, origin: "onboarding",
    pan_masked: null, phone_number: null, email: null, name_from_statement: false,
    pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false };
}

const family = [member("a", "Alice"), member("b", "Bob")];
const key = "unifolio.shell.scope";
const destinations = ["/portfolio/mutual-funds/holdings", "/portfolio/mutual-funds/funds/INF123", "/portfolio/debt", "/portfolio/mutual-funds", "/profile"];

function Probe() {
  const scope = useScope();
  const navigate = useNavigate();
  return <>
    <output data-testid="mode">{scope.viewMode}</output>
    <output data-testid="member">{scope.memberId ?? "none"}</output>
    <output data-testid="key">{scope.scopeKey}</output>
    <output data-testid="members">{scope.members.map(value => value.name).join(",")}</output>
    <output data-testid="selected">{scope.selectedMember?.name ?? "none"}</output>
    <output data-testid="profile">{JSON.stringify(scope.members.map(member => Reflect.get(member, "profile")))}</output>
    <button onClick={() => scope.setMember("b")}>Pick Bob</button>
    <button onClick={scope.setAggregate}>Aggregate</button>
    <button onClick={() => { void scope.refreshMembers(); }}>Refresh</button>
    <button onClick={() => { invalidateApiCache(); void scope.refreshMembers(); }}>Caller invalidates</button>
    {destinations.map(path => <button key={path} onClick={() => { void navigate(path); }}>{path}</button>)}
  </>;
}

function mount(path = "/portfolio/mutual-funds") {
  return render(<MemoryRouter initialEntries={[path]}><ScopeProvider><Probe /></ScopeProvider></MemoryRouter>);
}

async function loaded(names = "Alice,Bob") {
  await waitFor(() => expect(screen.getByTestId("members").textContent).toBe(names));
}

function expectPick(mode: string, id: string, scopeKey = mode === "aggregate" ? "aggregate" : `member:${id}`) {
  expect(screen.getByTestId("mode").textContent).toBe(mode);
  expect(screen.getByTestId("member").textContent).toBe(id);
  expect(screen.getByTestId("key").textContent).toBe(scopeKey);
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.me = { user_id: "account-a" };
  vi.mocked(getHouseholdMembers).mockResolvedValue(family);
});

it("starts one member in member mode", async () => {
  vi.mocked(getHouseholdMembers).mockResolvedValue([family[0]]);
  mount(); await loaded("Alice"); expectPick("member", "a");
});

it("carries fetched profile metadata for member banners and dialogs", async () => {
  mount(); await loaded();
  expect(JSON.parse(screen.getByTestId("profile").textContent!)).toEqual(family);
});

it("starts several members aggregate with the first preselected", async () => {
  mount(); await loaded(); expectPick("aggregate", "a");
  expect(screen.getByTestId("selected")).toHaveTextContent("Alice");
});

it("ports the Self name fallback", async () => {
  vi.mocked(getHouseholdMembers).mockResolvedValue([member("a", "")]);
  mount(); await loaded("Self"); expectPick("member", "a");
});

it("switches members and aggregate mode and changes scopeKey", async () => {
  mount(); await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  expectPick("member", "b");
  expect(screen.getByTestId("selected")).toHaveTextContent("Bob");
  fireEvent.click(screen.getByRole("button", { name: "Aggregate" }));
  expectPick("aggregate", "a");
});

it("refreshes names without invalidating or discarding a valid pick", async () => {
  mount(); await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  vi.mocked(getHouseholdMembers).mockResolvedValue([family[0], member("b", "Robert")]);
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await loaded("Alice,Robert"); expectPick("member", "b");
  expect(screen.getByTestId("selected")).toHaveTextContent("Robert");
  expect(invalidateApiCache).not.toHaveBeenCalled();
});

it("supports callers invalidating before a refresh", async () => {
  const events: string[] = [];
  vi.mocked(getHouseholdMembers).mockImplementation(async () => { events.push("fetch"); return family; });
  vi.mocked(invalidateApiCache).mockImplementation(() => { events.push("invalidate"); });
  mount(); await loaded(); events.length = 0;
  fireEvent.click(screen.getByRole("button", { name: "Caller invalidates" }));
  await waitFor(() => expect(events).toEqual(["invalidate", "fetch"]));
});

it.each([
  ["/portfolio/mutual-funds", "/portfolio/mutual-funds/holdings", "member", "b"],
  ["/portfolio/mutual-funds", "/portfolio/mutual-funds/funds/INF123", "member", "b"],
  ["/portfolio/mutual-funds", "/portfolio/debt", "aggregate", "a"],
  ["/home", "/portfolio/mutual-funds", "aggregate", "a"],
  ["/home", "/profile", "member", "b"],
])("applies the reset rule from %s to %s", async (from, to, mode, id) => {
  mount(from); await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  fireEvent.click(screen.getByRole("button", { name: to }));
  await waitFor(() => expectPick(mode, id));
});

it("never resets a single-member household", async () => {
  vi.mocked(getHouseholdMembers).mockResolvedValue([family[0]]);
  mount("/home"); await loaded("Alice");
  fireEvent.click(screen.getByRole("button", { name: "/portfolio/debt" }));
  expectPick("member", "a");
});

it("persists a picked member across remount without overwriting it while loading", async () => {
  const first = mount(); await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  await waitFor(() => expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ mode: "member", memberId: "b", path: "/portfolio/mutual-funds" }));
  first.unmount();
  let finish!: (members: HouseholdMember[]) => void;
  vi.mocked(getHouseholdMembers).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  mount();
  expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ mode: "member", memberId: "b", path: "/portfolio/mutual-funds" });
  await act(async () => { finish(family); });
  await loaded(); expectPick("member", "b");
});

it("records the page the saved scope was last on, following in-app navigation", async () => {
  mount(); await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  fireEvent.click(screen.getByRole("button", { name: "/portfolio/mutual-funds/holdings" }));
  await waitFor(() => expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual({ mode: "member", memberId: "b", path: "/portfolio/mutual-funds/holdings" }));
});

it("restores a saved pick when the same sidebar row is reloaded", async () => {
  sessionStorage.setItem(key, JSON.stringify({ mode: "member", memberId: "b", path: "/portfolio/mutual-funds/history" }));
  mount("/portfolio/mutual-funds"); await loaded(); expectPick("member", "b");
});

it("resets a saved pick when the page is opened directly on a different sidebar row (address-bar navigation)", async () => {
  sessionStorage.setItem(key, JSON.stringify({ mode: "member", memberId: "b", path: "/portfolio/debt" }));
  mount("/portfolio/mutual-funds"); await loaded(); expectPick("aggregate", "a");
});

it("does not reset a saved pick when the saved page and the opened page do not cross family-or-member rows", async () => {
  sessionStorage.setItem(key, JSON.stringify({ mode: "member", memberId: "b", path: "/portfolio/mutual-funds" }));
  mount("/profile/personal"); await loaded(); expectPick("member", "b");
});

it("falls back when the persisted member no longer exists", async () => {
  sessionStorage.setItem(key, JSON.stringify({ mode: "member", memberId: "removed" }));
  mount(); await loaded(); expectPick("aggregate", "a");
});

it("resets a saved pick when navigation crosses rows before the member fetch finishes", async () => {
  sessionStorage.setItem(key, JSON.stringify({ mode: "member", memberId: "b" }));
  let finish!: (members: HouseholdMember[]) => void;
  vi.mocked(getHouseholdMembers).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  mount("/home");
  fireEvent.click(screen.getByRole("button", { name: "/portfolio/mutual-funds" }));
  await act(async () => { finish(family); });
  await loaded(); expectPick("aggregate", "a");
});

it("uses single-member mode after a saved aggregate household shrinks", async () => {
  sessionStorage.setItem(key, JSON.stringify({ mode: "aggregate", memberId: "a" }));
  vi.mocked(getHouseholdMembers).mockResolvedValue([family[0]]);
  mount(); await loaded("Alice"); expectPick("member", "a");
});

it.each(["invalid json", JSON.stringify({ mode: "bad", memberId: "a" }), JSON.stringify({ mode: "member", memberId: 12 }), "null"])(
  "ignores malformed persisted state %s", async stored => {
    sessionStorage.setItem(key, stored); mount(); await loaded(); expectPick("aggregate", "a");
  },
);

it("handles throwing storage without breaking selection", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
  Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new Error("blocked"); } });
  try {
    mount(); await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Pick Bob" })); expectPick("member", "b");
  } finally { Object.defineProperty(window, "sessionStorage", descriptor); }
});

it("leaves members empty on initial fetch failure without rejecting", async () => {
  vi.mocked(getHouseholdMembers).mockRejectedValue(new Error("offline"));
  mount();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByTestId("members").textContent).toBe(""); expectPick("aggregate", "none");
});

it("keeps the current list and pick on refresh failure", async () => {
  mount(); await loaded(); fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  vi.mocked(getHouseholdMembers).mockRejectedValue(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await act(async () => { await Promise.resolve(); });
  await loaded(); expectPick("member", "b");
});

it("does not refetch or reset a pick on ordinary rerenders, but refetches when me changes", async () => {
  const view = mount(); await loaded(); fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  const ui = <MemoryRouter><ScopeProvider><Probe /></ScopeProvider></MemoryRouter>;
  view.rerender(ui); expect(getHouseholdMembers).toHaveBeenCalledTimes(1); expectPick("member", "b");
  auth.me = { user_id: "account-a" };
  view.rerender(<MemoryRouter><ScopeProvider><Probe /></ScopeProvider></MemoryRouter>);
  await waitFor(() => expect(getHouseholdMembers).toHaveBeenCalledTimes(2));
  await loaded(); expectPick("member", "b");
});

it("ignores a late response belonging to the previous me", async () => {
  let finishOld!: (members: HouseholdMember[]) => void;
  vi.mocked(getHouseholdMembers).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValueOnce([member("c", "Carol")]);
  const view = mount();
  auth.me = { user_id: "account-b" };
  view.rerender(<MemoryRouter><ScopeProvider><Probe /></ScopeProvider></MemoryRouter>);
  await loaded("Carol"); expectPick("member", "c");
  await act(async () => { finishOld(family); });
  await loaded("Carol"); expectPick("member", "c");
});

it("falls back when refresh removes the picked member", async () => {
  mount(); await loaded(); fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  vi.mocked(getHouseholdMembers).mockResolvedValue([family[0], member("c", "Carol")]);
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await loaded("Alice,Carol"); expectPick("aggregate", "a");
});

it("keeps a navigation queued during loading when me changes before the fetch finishes", async () => {
  sessionStorage.setItem(key, JSON.stringify({ mode: "member", memberId: "b" }));
  vi.mocked(getHouseholdMembers).mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(family);
  const view = mount("/home");
  fireEvent.click(screen.getByRole("button", { name: "/portfolio/mutual-funds" }));
  auth.me = { user_id: "account-a" };
  view.rerender(<MemoryRouter initialEntries={["/home"]}><ScopeProvider><Probe /></ScopeProvider></MemoryRouter>);
  await loaded(); expectPick("aggregate", "a");
});

// ---- Batch C 17d (C-9): refreshMembers hands back the fresh list; the import-done navigation keeps the pick ----
function RefreshCapture() {
  const scope = useScope();
  const [out, setOut] = useState("pending");
  return <>
    <button onClick={() => { void Promise.resolve(scope.refreshMembers()).then(result => { const text = result === undefined ? "void" : result === null ? "null" : result.map(value => value.name).join(","); setOut(previous => previous === "pending" ? text : `${previous}|${text}`); }); }}>Refresh and capture</button>
    <output data-testid="captured">{out}</output>
  </>;
}
function ImportNav() {
  const navigate = useNavigate();
  return <>
    <button onClick={() => { void navigate("/portfolio/mutual-funds", { replace: true, state: { importNotice: null, importNoticeUser: "account-a" } }); }}>Import-done navigation</button>
    <button onClick={() => { void navigate("/portfolio/mutual-funds", { state: { origin: "/home" } }); }}>Navigation with other state</button>
  </>;
}
function mountImport() {
  return render(<MemoryRouter initialEntries={["/import"]}><ScopeProvider><Probe /><RefreshCapture /><ImportNav /></ScopeProvider></MemoryRouter>);
}

it("refreshMembers resolves with the fresh list so a caller can tell whether the household grew", async () => {
  mountImport(); await loaded();
  vi.mocked(getHouseholdMembers).mockResolvedValueOnce([...family, member("c", "Carol")]);
  fireEvent.click(screen.getByRole("button", { name: "Refresh and capture" }));
  await waitFor(() => expect(screen.getByTestId("captured").textContent).toBe("Alice,Bob,Carol"));
  expect(screen.getByTestId("members").textContent).toBe("Alice,Bob,Carol");
});

it("refreshMembers resolves with null when the refresh fails, and keeps the list and the pick", async () => {
  mountImport(); await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  vi.mocked(getHouseholdMembers).mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh and capture" }));
  await waitFor(() => expect(screen.getByTestId("captured").textContent).toBe("null"));
  expect(screen.getByTestId("members").textContent).toBe("Alice,Bob");
  expectPick("member", "b");
});

it("refreshMembers resolves with null when a newer refresh replaced it (a stale answer is never handed back)", async () => {
  mountImport(); await loaded();
  let releaseFirst!: (list: HouseholdMember[]) => void;
  vi.mocked(getHouseholdMembers)
    .mockImplementationOnce(() => new Promise<HouseholdMember[]>(resolve => { releaseFirst = resolve; }))
    .mockResolvedValueOnce([...family, member("c", "Carol")]);
  fireEvent.click(screen.getByRole("button", { name: "Refresh and capture" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh and capture" }));
  await waitFor(() => expect(screen.getByTestId("captured").textContent).toBe("Alice,Bob,Carol"));
  await act(async () => { releaseFirst(family); });
  await waitFor(() => expect(screen.getByTestId("captured").textContent).toBe("Alice,Bob,Carol|null"));
  expect(screen.getByTestId("members").textContent).toBe("Alice,Bob,Carol"); // the old answer never overwrote the newer list
});

it("the import-done navigation does not reset the pick: leaving Add data after an import keeps the member the user was viewing", async () => {
  mountImport(); await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  fireEvent.click(screen.getByRole("button", { name: "Import-done navigation" }));
  await act(async () => {});
  expectPick("member", "b");
});

it("any other way of leaving Add data still resets a household of two or more to Family Combined (the existing rule)", async () => {
  mountImport(); await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  fireEvent.click(screen.getByRole("button", { name: "/portfolio/mutual-funds" }));
  await act(async () => {});
  expectPick("aggregate", "a");
});

it("a navigation with some other state is not the import-done navigation and still resets", async () => {
  mountImport(); await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  fireEvent.click(screen.getByRole("button", { name: "Navigation with other state" }));
  await act(async () => {});
  expectPick("aggregate", "a");
});

it("the exemption is for that one navigation only: the next move between rows resets as usual", async () => {
  mountImport(); await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  fireEvent.click(screen.getByRole("button", { name: "Import-done navigation" }));
  await act(async () => {});
  expectPick("member", "b");
  fireEvent.click(screen.getByRole("button", { name: "/portfolio/debt" }));
  await act(async () => {});
  expectPick("aggregate", "a");
});

// Orchestrator review of C-9: the exemption is for the import-done navigation itself (a replace), not for every later visit to that history entry.
function BrowserBack() {
  const navigate = useNavigate();
  return <button onClick={() => { void navigate(-1); }}>Browser Back</button>;
}

it("pressing Back onto the import-done history entry is an ordinary move: a household of two or more still resets to Family Combined", async () => {
  render(
    <MemoryRouter
      initialEntries={["/import", { pathname: "/portfolio/mutual-funds", state: { importNotice: null, importNoticeUser: "account-a" } }, "/portfolio/debt"]}
      initialIndex={2}
    >
      <ScopeProvider><Probe /><BrowserBack /></ScopeProvider>
    </MemoryRouter>,
  );
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
  expectPick("member", "b");
  fireEvent.click(screen.getByRole("button", { name: "Browser Back" }));
  await act(async () => {});
  expectPick("aggregate", "a");
});
