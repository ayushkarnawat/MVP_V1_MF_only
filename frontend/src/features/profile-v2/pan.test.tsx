import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShellRoutes } from "@/shell/ShellRoot";
import { renderInShell } from "@/shell/testing";
import { listHouseholdMembers } from "@/features/auth/api";
import type { MeResponse } from "@/features/auth/types";
import { getHouseholdImportHistory } from "@/features/import/api";
import { ME_FIXTURE } from "./fixtures/me";
import { HOUSEHOLD_FIXTURE } from "./fixtures/members";

const auth = vi.hoisted(() => ({
  me: null as MeResponse | null,
  logout: vi.fn(), updateMe: vi.fn(), refreshMe: vi.fn(), requestAccountDeletion: vi.fn(), requestContactChange: vi.fn(), verifyContactChange: vi.fn(),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/features/auth/api", () => ({ listHouseholdMembers: vi.fn() }));
vi.mock("@/features/import/api", () => ({ getHouseholdImportHistory: vi.fn(), deleteHouseholdImport: vi.fn(), deleteMemberPortfolio: vi.fn() }));
vi.mock("@/lib/apiClient", () => ({ invalidateApiCache: vi.fn() }));
vi.mock("@/features/dev/useDevToolsEnabled", () => ({ useDevToolsEnabled: () => false }));

const FULL_PAN = /[A-Z]{5}[0-9]{4}[A-Z]/;

beforeEach(() => {
  vi.clearAllMocks();
  auth.me = ME_FIXTURE;
  vi.mocked(listHouseholdMembers).mockResolvedValue(HOUSEHOLD_FIXTURE);
  vi.mocked(getHouseholdImportHistory).mockResolvedValue([]);
});

describe("PAN is only ever shown masked", () => {
  it("the fixtures are masked (so the check below is meaningful)", () => {
    for (const member of HOUSEHOLD_FIXTURE) expect(member.pan_masked ?? "").not.toMatch(FULL_PAN);
  });

  it("Personal Information shows the masked PAN and no 10-character PAN", async () => {
    renderInShell(<ShellRoutes />, { path: "/profile/personal" });
    await screen.findByText("AB******4F");
    expect(document.body.textContent ?? "").not.toMatch(FULL_PAN);
  });

  it("Family Members shows masked PANs and no 10-character PAN", async () => {
    renderInShell(<ShellRoutes />, { path: "/profile/family" });
    expect(await screen.findAllByTestId("member-card")).toHaveLength(3);
    expect(screen.getByText("CD******7K")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(FULL_PAN);
  });
});
