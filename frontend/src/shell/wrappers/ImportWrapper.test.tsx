import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHouseholdMembers } from "../../features/auth/api";
import type { HouseholdMember } from "../../features/auth/types";
import { ScopeProvider } from "../scope/ScopeProvider";
import { useScope } from "../scope/ScopeContext";
import ImportWrapper from "./ImportWrapper";

// Batch C 17d (C-9): after an import the wrapper waits for the fresh member list, then decides where the page lands.
// Design: Docs/orchestration/2026-11-12-batch-c-planning-workbook.html, section 5 ("Which view after an import: every case").
// Uses the real ScopeProvider so the scope reset rule is part of what is tested. Red until C-9 builds it.
const auth = vi.hoisted(() => ({ me: { user_id: "account-a" } }));
vi.mock("../../features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../features/auth/api", () => ({ getHouseholdMembers: vi.fn() }));
vi.mock("../../lib/apiClient", () => ({ invalidateApiCache: vi.fn() }));
vi.mock("../../features/import/ImportFlow", () => ({
  ImportFlow: ({ householdMemberId, onDone }: { householdMemberId: string; onDone?: (notice?: unknown, outcome?: unknown) => void }) => (
    <div>
      <output data-testid="flow-member">{householdMemberId}</output>
      <button onClick={() => onDone?.({ text: "Import complete · 14 new funds, 58 transactions added" })}>Finish import</button>
      <button onClick={() => onDone?.({ text: "wrong person" }, { landOnPersonId: "c" })}>Finish wrong-person import for Chandra</button>
      <button onClick={() => onDone?.({ text: "wrong person" }, { landOnPersonId: "b" })}>Finish wrong-person import for Bob</button>
      <button onClick={() => onDone?.({ text: "wrong person" }, { landOnPersonId: "zzz" })}>Finish for a stranger</button>
    </div>
  ),
}));

function member(id: string, name: string): HouseholdMember {
  return { id, name, relationship: "self", relationship_other_label: null, origin: "onboarding",
    pan_masked: null, phone_number: null, email: null, name_from_statement: false,
    pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false };
}
const A = member("a", "Alice");
const B = member("b", "Bob");
const C = member("c", "Chandra");

function Landing() {
  const location = useLocation();
  const state = (location.state ?? {}) as { importNotice?: unknown; importNoticeUser?: unknown };
  return <>
    <output data-testid="landing">landed</output>
    <output data-testid="notice">{JSON.stringify(state.importNotice ?? null)}</output>
    <output data-testid="notice-user">{String(state.importNoticeUser ?? "")}</output>
  </>;
}

function Probe() {
  const scope = useScope();
  const navigate = useNavigate();
  return <>
    <output data-testid="mode">{scope.viewMode}</output>
    <output data-testid="member">{scope.memberId ?? "none"}</output>
    <output data-testid="members">{scope.members.map(value => value.name).join(",")}</output>
    <button onClick={() => scope.setMember("b")}>Pick Bob</button>
    <button onClick={() => { void navigate("/portfolio/mutual-funds"); }}>Go to Mutual Funds without importing</button>
    <button onClick={() => { void navigate("/import"); }}>Open Add data</button>
    <button onClick={() => { void navigate("/elsewhere"); }}>Go somewhere else</button>
  </>;
}

function mount() {
  return render(
    <MemoryRouter initialEntries={["/import"]}>
      <ScopeProvider>
        <Probe />
        <Routes>
          <Route path="/import" element={<ImportWrapper />} />
          <Route path="/portfolio/mutual-funds" element={<Landing />} />
          <Route path="/elsewhere" element={<output data-testid="elsewhere">elsewhere</output>} />
        </Routes>
      </ScopeProvider>
    </MemoryRouter>,
  );
}
const loaded = (names: string) => waitFor(() => expect(screen.getByTestId("members").textContent).toBe(names));
const finish = (label: string | RegExp = "Finish import") => fireEvent.click(screen.getByRole("button", { name: label }));
const landed = () => waitFor(() => expect(screen.getByTestId("landing")).toBeInTheDocument());
const expectPick = (mode: string, id: string) => {
  expect(screen.getByTestId("mode").textContent).toBe(mode);
  expect(screen.getByTestId("member").textContent).toBe(id);
};
const serve = (...lists: HouseholdMember[][]) => lists.forEach(list => vi.mocked(getHouseholdMembers).mockResolvedValueOnce(list));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  auth.me = { user_id: "account-a" };
});

describe("ImportWrapper: the member list and the view after an import (Batch C 17d)", () => {
  it("waits for the members request before navigating back", async () => {
    let release!: (list: HouseholdMember[]) => void;
    vi.mocked(getHouseholdMembers).mockResolvedValueOnce([A]).mockImplementationOnce(() => new Promise<HouseholdMember[]>(resolve => { release = resolve; }));
    mount(); await loaded("Alice");
    finish();
    await act(async () => {});
    expect(screen.queryByTestId("landing")).toBeNull();
    expect(screen.getByTestId("flow-member")).toBeInTheDocument();
    await act(async () => { release([A, B]); });
    await landed();
  });

  it("the household grew: the new member is in the list at once, without a remount, and the page lands on Family Combined", async () => {
    serve([A], [A, B]);
    mount(); await loaded("Alice");
    expectPick("member", "a");
    finish(); await landed();
    expect(screen.getByTestId("members")).toHaveTextContent("Alice,Bob");
    expectPick("aggregate", "a");
  });

  it("no new member while viewing one person of a family: the page stays on that person", async () => {
    serve([A, B], [A, B]);
    mount(); await loaded("Alice,Bob");
    fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
    finish(); await landed();
    expectPick("member", "b");
  });

  it("no new member and a one-person household: stays on that person", async () => {
    serve([A], [A]);
    mount(); await loaded("Alice");
    finish(); await landed();
    expectPick("member", "a");
  });

  it("viewing Family Combined: stays on Family Combined, whatever the import did", async () => {
    serve([A, B], [A, B, C]);
    mount(); await loaded("Alice,Bob");
    expectPick("aggregate", "a");
    finish(); await landed();
    expectPick("aggregate", "a");
    expect(screen.getByTestId("members")).toHaveTextContent("Alice,Bob,Chandra");
  });

  it("a wrong-person import that created a new person lands on that person, not on Family Combined", async () => {
    serve([A], [A, C]);
    mount(); await loaded("Alice");
    finish("Finish wrong-person import for Chandra"); await landed();
    expect(screen.getByTestId("members")).toHaveTextContent("Alice,Chandra");
    expectPick("member", "c");
  });

  it("a wrong-person import for someone already in the family lands on that person", async () => {
    serve([A, B], [A, B]);
    mount(); await loaded("Alice,Bob");
    finish("Finish wrong-person import for Bob"); await landed();
    expectPick("member", "b");
  });

  it("a person the refreshed list does not know is ignored: the normal rule applies (the household grew, so Family Combined)", async () => {
    serve([A], [A, B]);
    mount(); await loaded("Alice");
    finish("Finish for a stranger"); await landed();
    expectPick("aggregate", "a");
  });

  it("a failed refresh does not block navigation and leaves the view where it was", async () => {
    vi.mocked(getHouseholdMembers).mockResolvedValueOnce([A, B]).mockRejectedValueOnce(new Error("offline"));
    mount(); await loaded("Alice,Bob");
    fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
    finish(); await landed();
    expectPick("member", "b");
    expect(screen.getByTestId("members")).toHaveTextContent("Alice,Bob");
  });

  it("the import note and the user it was written for travel with the navigation, as before", async () => {
    serve([A], [A]);
    mount(); await loaded("Alice");
    finish(); await landed();
    expect(JSON.parse(screen.getByTestId("notice").textContent!)).toEqual({ text: "Import complete · 14 new funds, 58 transactions added" });
    expect(screen.getByTestId("notice-user").textContent).toBe("account-a");
  });

  it("a second import does not leave a stale list", async () => {
    serve([A], [A, B], [A, B, C]);
    mount(); await loaded("Alice");
    finish(); await landed();
    expect(screen.getByTestId("members")).toHaveTextContent("Alice,Bob");
    fireEvent.click(screen.getByRole("button", { name: "Open Add data" }));
    await screen.findByTestId("flow-member");
    finish(); await landed();
    expect(screen.getByTestId("members")).toHaveTextContent("Alice,Bob,Chandra");
  });

  it("leaving Add data any other way is unchanged: a household of two or more still returns to Family Combined (today's rule)", async () => {
    serve([A, B]);
    mount(); await loaded("Alice,Bob");
    fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
    fireEvent.click(screen.getByRole("button", { name: "Go to Mutual Funds without importing" }));
    await landed();
    expectPick("aggregate", "a");
    expect(getHouseholdMembers).toHaveBeenCalledTimes(1);
  });

  it("leaving Add data while the member list is still loading does not pull the person back to Mutual Funds", async () => {
    let release!: (list: HouseholdMember[]) => void;
    vi.mocked(getHouseholdMembers).mockResolvedValueOnce([A, B]).mockImplementationOnce(() => new Promise<HouseholdMember[]>(resolve => { release = resolve; }));
    mount(); await loaded("Alice,Bob");
    fireEvent.click(screen.getByRole("button", { name: "Pick Bob" }));
    finish();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Go somewhere else" }));
    expect(await screen.findByTestId("elsewhere")).toBeInTheDocument();
    await act(async () => { release([A, B, C]); });
    expect(screen.queryByTestId("landing")).toBeNull();
    expect(screen.getByTestId("elsewhere")).toBeInTheDocument();
  });
});
