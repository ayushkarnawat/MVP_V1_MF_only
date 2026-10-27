import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listHouseholdMembers } from "@/features/auth/api";
import type { HouseholdMember, MeResponse } from "@/features/auth/types";
import { invalidateApiCache } from "@/lib/apiClient";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { ME_EMPTY_FIXTURE, ME_FIXTURE } from "../fixtures/me";
import { HOUSEHOLD_FIXTURE } from "../fixtures/members";
import PersonalInfoPage from "./PersonalInfoPage";

const auth = vi.hoisted(() => ({
  me: null as MeResponse | null,
  logout: vi.fn(),
  updateMe: vi.fn(),
  refreshMe: vi.fn(),
  requestContactChange: vi.fn(),
  verifyContactChange: vi.fn(),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/features/auth/api", () => ({ listHouseholdMembers: vi.fn() }));
vi.mock("@/lib/apiClient", () => ({ invalidateApiCache: vi.fn() }));

// The existing Complete profile dialog has its own tests; here it is a stand-in that shows what it was given
// and lets the test play the "saved", "merged" and "closed" moments.
const dialog = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("@/features/dashboard/members/CompleteProfileDialog", () => ({
  CompleteProfileDialog: (props: {
    member: HouseholdMember; onSaved: (member: HouseholdMember) => void; onMerged: (targetId: string) => void; onClose: () => void;
  }) => {
    dialog.props.push(props);
    return (
      <div role="dialog" aria-label="stub complete profile">
        <output data-testid="stub-member">{props.member.id}</output>
        <button type="button" onClick={() => props.onSaved({ ...props.member, pan_masked: "ZZ******9Z" })}>stub saved</button>
        <button type="button" onClick={() => props.onMerged("m-spouse")}>stub merged</button>
        <button type="button" onClick={props.onClose}>stub closed</button>
      </div>
    );
  },
}));

const LIVE_ROUTES = buildRegistry().map(route => route.id.startsWith("profile") ? { ...route, status: "live" as const } : route);

function mount(refreshMembers = vi.fn()) {
  renderInShell(<PersonalInfoPage />, { path: "/profile/personal", routes: LIVE_ROUTES, scope: { refreshMembers } });
  return refreshMembers;
}

const content = () => screen.getByTestId("profile-content");

beforeEach(() => {
  vi.clearAllMocks();
  dialog.props.length = 0;
  auth.me = ME_FIXTURE;
  auth.updateMe.mockResolvedValue(undefined);
  auth.refreshMe.mockResolvedValue(undefined);
  vi.mocked(listHouseholdMembers).mockResolvedValue(HOUSEHOLD_FIXTURE);
});

describe("PersonalInfoPage: the page", () => {
  it("sits in the Profile frame with Personal Information as the current item", async () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
    const current = screen.getByRole("navigation", { name: "Profile sections" }).querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Personal Information");
    await screen.findByText("AB******4F");
  });

  it("shows the header card, the Personal Information card and the Financial Details card", async () => {
    mount();
    await screen.findByText("AB******4F");
    expect(within(content()).getByTestId("profile-header-card")).toBeInTheDocument();
    expect(within(content()).getByRole("heading", { level: 2, name: "Personal Information" })).toBeInTheDocument();
    expect(within(content()).getByRole("heading", { level: 2, name: "Financial Details" })).toBeInTheDocument();
  });

  it("loads the household once and shows the self member's masked PAN, the account type and the join month", async () => {
    mount();
    expect(await screen.findByText("AB******4F")).toBeInTheDocument();
    expect(listHouseholdMembers).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("fact-account-type")).toHaveTextContent("Family");
    expect(screen.getByTestId("fact-member-since")).toHaveTextContent("Oct 2025");
    expect(screen.getByTestId("profile-name")).toHaveTextContent("Siddharth Surve");
  });

  it("never offers Show or Hide for the PAN, and shows no PAN other than the masked one", async () => {
    mount();
    await screen.findByText("AB******4F");
    expect(screen.queryByRole("button", { name: /^(show|hide)/i })).not.toBeInTheDocument();
    expect(content().textContent).not.toMatch(/[A-Z]{5}[0-9]{4}[A-Z]/);
  });

  it("shows skeletons for the PAN and account type until the household arrives, then replaces them", async () => {
    mount();
    expect(screen.getByTestId("pan-loading")).toBeInTheDocument();
    expect(screen.getByTestId("account-type-loading")).toBeInTheDocument();
    expect(screen.getByTestId("profile-name")).toHaveTextContent("Siddharth Surve");
    await screen.findByText("AB******4F");
    expect(screen.queryByTestId("pan-loading")).not.toBeInTheDocument();
    expect(screen.queryByTestId("account-type-loading")).not.toBeInTheDocument();
  });

  it("shows loading cards and no account details while the account itself is not loaded", async () => {
    auth.me = null;
    mount();
    expect(screen.getByTestId("personal-loading")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("profile-header-card")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Personal Information" })).not.toBeInTheDocument();
    await act(async () => {});
  });

  it("does not write anything on its own: no profile update, no refresh of the account on load", async () => {
    mount();
    await screen.findByText("AB******4F");
    expect(auth.updateMe).not.toHaveBeenCalled();
    expect(auth.refreshMe).not.toHaveBeenCalled();
    expect(invalidateApiCache).not.toHaveBeenCalled();
  });
});

describe("PersonalInfoPage: the account's own data", () => {
  it("fills the Personal Information and Financial Details cards from the account", async () => {
    mount();
    await screen.findByText("AB******4F");
    expect(screen.getByTestId("row-email")).toHaveTextContent("siddharth@example.in");
    expect(screen.getByTestId("row-phone")).toHaveTextContent("+919876543210");
    expect(screen.getByTestId("row-investor-type")).toHaveTextContent("A mix of both");
    expect(screen.getAllByTestId("goal-chip").map(chip => chip.textContent)).toEqual(["Consolidated portfolio view", "Family wealth tracking"]);
  });

  it("for an account that has answered nothing: name falls back to the phone, 'Not added' for the email, 'Not answered' twice, Add goals", async () => {
    auth.me = ME_EMPTY_FIXTURE;
    mount();
    await screen.findByText("AB******4F");
    expect(screen.getByTestId("profile-name")).toHaveTextContent("+919876543210");
    expect(screen.getByTestId("row-email")).toHaveTextContent("Not added");
    expect(screen.getByTestId("row-investor-type")).toHaveTextContent("Not answered");
    expect(screen.getByTestId("row-goals")).toHaveTextContent("Not answered");
    expect(screen.getByRole("button", { name: "Add goals" })).toBeInTheDocument();
  });

  it("hides 'Member since' when the account has no created_at", async () => {
    auth.me = { ...ME_FIXTURE, created_at: undefined as unknown as string };
    mount();
    await screen.findByText("AB******4F");
    expect(screen.queryByTestId("fact-member-since")).not.toBeInTheDocument();
  });
});

describe("PersonalInfoPage: the household list fails while the account loads", () => {
  it("still shows name, email and phone; PAN 'Not available'; no account type; a banner with Retry", async () => {
    vi.mocked(listHouseholdMembers).mockRejectedValue(new Error("down"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your household. Your name, email and phone are still shown.");
    expect(screen.getByTestId("profile-name")).toHaveTextContent("Siddharth Surve");
    expect(screen.getByTestId("profile-email")).toHaveTextContent("siddharth@example.in");
    expect(screen.getByTestId("profile-phone")).toHaveTextContent("+919876543210");
    expect(screen.getByTestId("fact-pan")).toHaveTextContent("Not available");
    expect(screen.queryByTestId("fact-account-type")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Profile" })).toBeDisabled();
    expect(screen.getByRole("heading", { level: 2, name: "Financial Details" })).toBeInTheDocument();
  });

  it("Retry loads again, and on success the PAN, the type and Edit Profile come back and the banner goes", async () => {
    vi.mocked(listHouseholdMembers).mockRejectedValueOnce(new Error("down"));
    mount();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("AB******4F")).toBeInTheDocument();
    expect(listHouseholdMembers).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("fact-account-type")).toHaveTextContent("Family");
    expect(screen.getByRole("button", { name: "Edit Profile" })).toBeEnabled();
  });
});

describe("PersonalInfoPage: Edit Profile", () => {
  async function openEdit() {
    const refreshMembers = mount();
    await screen.findByText("AB******4F");
    fireEvent.click(screen.getByRole("button", { name: "Edit Profile" }));
    return refreshMembers;
  }

  it("opens the existing Complete profile dialog for the self member, with the account's phone and email and no 'Change in Account Info' link", async () => {
    await openEdit();
    expect(screen.getByRole("dialog", { name: "stub complete profile" })).toBeInTheDocument();
    expect(screen.getByTestId("stub-member")).toHaveTextContent("m-self");
    const props = dialog.props.at(-1);
    expect(props?.accountPhone).toBe("+919876543210");
    expect(props?.accountEmail).toBe("siddharth@example.in");
    expect(props?.onChangeInAccountInfo).toBeUndefined();
  });

  it("closes when the dialog ends its sequence", async () => {
    await openEdit();
    fireEvent.click(screen.getByRole("button", { name: "stub closed" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("after a save: clears the cache, reloads the shell's members, refreshes the account, and shows the saved PAN", async () => {
    const order: string[] = [];
    vi.mocked(invalidateApiCache).mockImplementation(() => { order.push("invalidate"); });
    auth.refreshMe.mockImplementation(() => { order.push("refreshMe"); return Promise.resolve(); });
    const refreshMembers = vi.fn(() => { order.push("refreshMembers"); });
    mount(refreshMembers);
    await screen.findByText("AB******4F");
    fireEvent.click(screen.getByRole("button", { name: "Edit Profile" }));
    fireEvent.click(screen.getByRole("button", { name: "stub saved" }));
    expect(order).toEqual(["invalidate", "refreshMembers", "refreshMe"]);
    expect(await screen.findByTestId("pan-value")).toHaveTextContent("ZZ******9Z");
    expect(screen.getByRole("dialog", { name: "stub complete profile" })).toBeInTheDocument();
  });

  it("after a merge: reloads the household, clears the cache, reloads the shell's members and refreshes the account", async () => {
    const refreshMembers = await openEdit();
    expect(listHouseholdMembers).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "stub merged" }));
    await waitFor(() => expect(listHouseholdMembers).toHaveBeenCalledTimes(2));
    expect(invalidateApiCache).toHaveBeenCalledTimes(1);
    expect(refreshMembers).toHaveBeenCalledTimes(1);
    expect(auth.refreshMe).toHaveBeenCalledTimes(1);
  });
});

describe("PersonalInfoPage: the dialogs opened from the cards", () => {
  it("saves the goals through the account's update call, then closes the dialog", async () => {
    mount();
    await screen.findByText("AB******4F");
    fireEvent.click(screen.getByRole("button", { name: "Edit goals" }));
    expect(screen.getByRole("dialog", { name: "What brings you to Unifolio?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Why choose? All of it." }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(auth.updateMe).toHaveBeenCalledWith({
      primary_goals: ["consolidated_view", "understand_holdings", "family_management", "performance_comparison"],
    });
  });

  it("saves the investor type through the account's update call, then closes the dialog", async () => {
    mount();
    await screen.findByText("AB******4F");
    fireEvent.click(screen.getByRole("button", { name: "Edit investor type" }));
    fireEvent.click(screen.getByRole("radio", { name: /Just getting started/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(auth.updateMe).toHaveBeenCalledWith({ investor_type: "beginner" });
  });

  it("opens the real contact-change dialog for the email and closes it on Cancel without a request", async () => {
    mount();
    await screen.findByText("AB******4F");
    fireEvent.click(screen.getByRole("button", { name: "Change email address" }));
    expect(screen.getByRole("dialog", { name: "Change email" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(auth.requestContactChange).not.toHaveBeenCalled();
  });
});
