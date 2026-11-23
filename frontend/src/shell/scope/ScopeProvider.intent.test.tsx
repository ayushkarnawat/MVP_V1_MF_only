import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { getHouseholdMembers } from "../../features/auth/api";
import type { HouseholdMember } from "../../features/auth/types";
import { ScopeProvider } from "./ScopeProvider";
import { useScope } from "./ScopeContext";
import { readScopeIntent } from "./scopeIntent";

// These tests run on the REAL ScopeProvider (not TestScopeProvider, whose setAggregate behaves differently).
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

const FUND_PAGE = "/portfolio/mutual-funds/funds/INF123";
const OTHER_ROW = "/portfolio/debt";

function Probe() {
  const scope = useScope();
  const navigate = useNavigate();
  const location = useLocation();
  return <>
    <output data-testid="mode">{scope.viewMode}</output>
    <output data-testid="member">{scope.memberId ?? "none"}</output>
    <output data-testid="jump">{scope.scopeJump?.label ?? "none"}</output>
    <output data-testid="path">{location.pathname}</output>
    <output data-testid="state">{JSON.stringify(location.state)}</output>
    <button onClick={() => scope.setMember("a")}>Pick Alice</button>
    <button onClick={() => scope.setMember("b")}>Pick Bob</button>
    <button onClick={scope.setAggregate}>Aggregate</button>
    <button onClick={() => scope.scopeJump?.undo()}>Undo</button>
    <button onClick={() => { void navigate(FUND_PAGE, { state: { searchIntent: { scope: { memberId: "b" } } } }); }}>Jump to Bob</button>
    <button onClick={() => { void navigate(FUND_PAGE, { state: { searchIntent: { scope: "family" } } }); }}>Jump to family</button>
    <button onClick={() => { void navigate(FUND_PAGE, { state: { searchIntent: { scope: { memberId: "zzz" } } } }); }}>Jump to nobody</button>
    <button onClick={() => { void navigate(FUND_PAGE, { state: { importNotice: "kept", searchIntent: { scope: { memberId: "b" }, section: "overview-sips", open: true } } }); }}>Jump with page keys</button>
    <button onClick={() => { void navigate(OTHER_ROW); }}>Go elsewhere</button>
  </>;
}

function mount(path = "/home", state?: unknown) {
  return render(<MemoryRouter initialEntries={[{ pathname: path, state }]}><ScopeProvider><Probe /></ScopeProvider></MemoryRouter>);
}
const text = (id: string) => screen.getByTestId(id).textContent;
async function loaded() { await waitFor(() => expect(screen.getByRole("button", { name: "Pick Bob" })).toBeInTheDocument()); await waitFor(() => expect(text("mode")).toBe("aggregate")); }
const click = (name: string) => act(() => { fireEvent.click(screen.getByRole("button", { name })); });

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  auth.me = { user_id: "account-a" };
  vi.mocked(getHouseholdMembers).mockResolvedValue(family);
});

it("readScopeIntent reads only a well-formed scope and returns null for anything else", () => {
  expect(readScopeIntent({ searchIntent: { scope: "family" } })).toEqual({ scope: "family" });
  expect(readScopeIntent({ searchIntent: { scope: { memberId: "b" }, section: "x", open: true } })).toEqual({ scope: { memberId: "b" } });
  for (const bad of [null, undefined, 7, "x", {}, { searchIntent: null }, { searchIntent: {} }, { searchIntent: { scope: 3 } }, { searchIntent: { scope: { memberId: 4 } } }, { searchIntent: { scope: { memberId: "" } } }, { searchIntent: { scope: "everyone" } }]) {
    expect(readScopeIntent(bad)).toBeNull();
  }
});

it("a jump from Home with intent member Bob ends on Bob after the reset rule", async () => {
  mount("/home"); await loaded();
  click("Pick Alice");
  expect(text("member")).toBe("a");
  click("Jump to Bob"); // /home to a fund page is a move between sidebar rows: the reset rule runs, the intent must still win
  await waitFor(() => expect(text("member")).toBe("b"));
  expect(text("mode")).toBe("member");
  expect(text("path")).toBe(FUND_PAGE);
});

it("a jump with intent family ends on family", async () => {
  mount("/portfolio/mutual-funds"); await loaded();
  click("Pick Bob");
  expect(text("mode")).toBe("member");
  click("Jump to family");
  await waitFor(() => expect(text("mode")).toBe("aggregate"));
  expect(text("jump")).toBe("Family");
});

it("intent is applied once and cleared: the scope part leaves the history entry, other keys stay", async () => {
  mount("/home"); await loaded();
  click("Jump with page keys");
  await waitFor(() => expect(text("member")).toBe("b"));
  await waitFor(() => expect(JSON.parse(text("state") ?? "null")).toEqual({ importNotice: "kept", searchIntent: { section: "overview-sips", open: true } }));
  click("Pick Alice"); // a later manual pick must not be overridden by a second application
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(text("member")).toBe("a");
});

it("an intent with only a scope leaves no searchIntent behind", async () => {
  mount("/home"); await loaded();
  click("Jump to Bob");
  await waitFor(() => expect(text("member")).toBe("b"));
  await waitFor(() => expect(text("state")).toBe("null"));
});

it("an intent for an unknown member id is ignored", async () => {
  mount("/home"); await loaded();
  click("Pick Alice");
  click("Jump to nobody");
  await waitFor(() => expect(text("path")).toBe(FUND_PAGE));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(text("jump")).toBe("none");
  expect(text("mode")).toBe("aggregate"); // the reset rule's ordinary result for a different sidebar row, nothing from the intent
});

it("intent that arrives before the household loads is applied after it loads", async () => {
  let release: (value: HouseholdMember[]) => void = () => undefined;
  vi.mocked(getHouseholdMembers).mockReturnValue(new Promise<HouseholdMember[]>(resolve => { release = resolve; }));
  mount(FUND_PAGE, { searchIntent: { scope: { memberId: "b" } } });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(text("jump")).toBe("none");
  await act(async () => { release(family); });
  await waitFor(() => expect(text("member")).toBe("b"));
  expect(text("mode")).toBe("member");
});

it("Undo restores the previous selector", async () => {
  mount("/portfolio/mutual-funds"); await loaded();
  click("Pick Alice");
  click("Jump to Bob");
  await waitFor(() => expect(text("jump")).toBe("Bob"));
  expect(text("member")).toBe("b");
  click("Undo");
  await waitFor(() => expect(text("member")).toBe("a"));
  expect(text("mode")).toBe("member");
  expect(text("jump")).toBe("none");
});

it("a manual selector change clears the undo", async () => {
  mount("/home"); await loaded();
  click("Jump to Bob");
  await waitFor(() => expect(text("jump")).toBe("Bob"));
  click("Aggregate");
  expect(text("jump")).toBe("none");
});

it("navigating to another page clears the undo", async () => {
  mount("/home"); await loaded();
  click("Jump to Bob");
  await waitFor(() => expect(text("jump")).toBe("Bob"));
  click("Go elsewhere");
  await waitFor(() => expect(text("path")).toBe(OTHER_ROW));
  expect(text("jump")).toBe("none");
});
