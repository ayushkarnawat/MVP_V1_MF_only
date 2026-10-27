import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HouseholdMember, MeResponse } from "@/features/auth/types";
import { deleteMemberPortfolio, getHouseholdImportHistory } from "@/features/import/api";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { RegistryContext } from "@/shell/registry/RegistryContext";
import { ImportContext, useScope } from "@/shell/scope/ScopeContext";
import { ScopeProvider } from "@/shell/scope/ScopeProvider";
import { ME_FIXTURE } from "../fixtures/me";
import { HISTORY_FIXTURE } from "../fixtures/importHistory";
import { HOUSEHOLD_FIXTURE } from "../fixtures/members";
import FamilyPage from "./FamilyPage";

// Review Focus 1: deleting a member while the top bar's selector holds that member must not leave the shell's scope on a deleted id.
// This test runs the REAL scope provider (not the test stand-in), so it proves the mechanism the page relies on:
// clear the API cache, then ask the scope provider to reload its members, which drops a pick that no longer exists.
const auth = vi.hoisted(() => ({ me: null as MeResponse | null, logout: vi.fn(), refreshMe: vi.fn() }));
const members = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/features/auth/api", () => ({ listHouseholdMembers: members.list, getHouseholdMembers: members.list }));
vi.mock("@/features/import/api", () => ({ getHouseholdImportHistory: vi.fn(), deleteMemberPortfolio: vi.fn() }));
vi.mock("@/lib/apiClient", () => ({ invalidateApiCache: vi.fn() }));

const ROUTES = buildRegistry().map(route => route.id.startsWith("profile") ? { ...route, status: "live" as const } : route);

function Probe() {
  const scope = useScope();
  return (
    <div>
      <output data-testid="scope-mode">{scope.viewMode}</output>
      <output data-testid="scope-member">{scope.memberId ?? "none"}</output>
      <output data-testid="scope-count">{String(scope.members.length)}</output>
      {scope.members.map(member => (
        <button key={member.id} type="button" onClick={() => scope.setMember(member.id)}>{`pick ${member.id}`}</button>
      ))}
    </div>
  );
}

function mount() {
  render(
    <MemoryRouter initialEntries={["/profile/family"]}>
      <RegistryContext.Provider value={ROUTES}>
        <ScopeProvider>
          <ImportContext.Provider value={{ openImport: vi.fn() }}>
            <Probe />
            <FamilyPage />
          </ImportContext.Provider>
        </ScopeProvider>
      </RegistryContext.Provider>
    </MemoryRouter>,
  );
}

const without = (id: string): HouseholdMember[] => HOUSEHOLD_FIXTURE.filter(member => member.id !== id);
const mode = () => screen.getByTestId("scope-mode");
const picked = () => screen.getByTestId("scope-member");

async function readyWith(id: string) {
  await screen.findAllByTestId("member-card");
  await waitFor(() => expect(screen.getByTestId("scope-count")).toHaveTextContent("3"));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: `pick ${id}` })); });
  expect(mode()).toHaveTextContent("member");
  expect(picked()).toHaveTextContent(id);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  auth.me = ME_FIXTURE;
  auth.refreshMe.mockResolvedValue(undefined);
  members.list.mockResolvedValue(HOUSEHOLD_FIXTURE);
  vi.mocked(getHouseholdImportHistory).mockResolvedValue(HISTORY_FIXTURE);
  vi.mocked(deleteMemberPortfolio).mockResolvedValue({ deleted_transactions_count: 1, removed_member_ids: [], deleted_file: false });
});

describe("FamilyPage with the real scope provider", () => {
  it("Delete member: the deleted person is no longer the selected member, the scope falls back to the household", async () => {
    mount();
    await readyWith("m-father");
    members.list.mockResolvedValue(without("m-father"));
    fireEvent.click(screen.getByRole("button", { name: "Delete Ramesh Surve from your family" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete member" }));
    await waitFor(() => expect(screen.getByTestId("scope-count")).toHaveTextContent("2"));
    expect(picked()).not.toHaveTextContent("m-father");
    expect(mode()).toHaveTextContent("aggregate");
    expect(picked()).toHaveTextContent("m-self");
    await waitFor(() => expect(screen.getAllByTestId("member-card")).toHaveLength(2));
  });

  it("Delete member of a person who is NOT selected leaves the selection alone", async () => {
    mount();
    await readyWith("m-spouse");
    members.list.mockResolvedValue(without("m-father"));
    fireEvent.click(screen.getByRole("button", { name: "Delete Ramesh Surve from your family" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete member" }));
    await waitFor(() => expect(screen.getByTestId("scope-count")).toHaveTextContent("2"));
    expect(mode()).toHaveTextContent("member");
    expect(picked()).toHaveTextContent("m-spouse");
  });

  it("Delete all funds with the member removed has the same effect on the selection", async () => {
    mount();
    await readyWith("m-father");
    members.list.mockResolvedValue(without("m-father"));
    fireEvent.click(screen.getByRole("button", { name: "Delete all funds for Ramesh Surve" }));
    const box = await screen.findByRole("dialog");
    fireEvent.click(within(box).getByLabelText("Also remove Ramesh Surve from my family"));
    fireEvent.click(within(box).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByTestId("scope-count")).toHaveTextContent("2"));
    expect(picked()).not.toHaveTextContent("m-father");
    expect(mode()).toHaveTextContent("aggregate");
  });

  it("a failed delete leaves the selection and the member list alone", async () => {
    vi.mocked(deleteMemberPortfolio).mockRejectedValueOnce(new Error("down"));
    mount();
    await readyWith("m-father");
    const loadsBefore = members.list.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Delete Ramesh Surve from your family" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete member" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete this member. Please try again.");
    expect(screen.getByTestId("scope-count")).toHaveTextContent("3");
    expect(picked()).toHaveTextContent("m-father");
    expect(members.list).toHaveBeenCalledTimes(loadsBefore);
  });
});
