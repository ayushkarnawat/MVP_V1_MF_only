import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listHouseholdMembers } from "@/features/auth/api";
import type { HouseholdMember, MeResponse } from "@/features/auth/types";
import { deleteMemberPortfolio, getHouseholdImportHistory } from "@/features/import/api";
import { invalidateApiCache } from "@/lib/apiClient";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { ME_FIXTURE } from "../fixtures/me";
import { HISTORY_FIXTURE, type ImportHistoryRow } from "../fixtures/importHistory";
import { HOUSEHOLD_FIXTURE } from "../fixtures/members";
import FamilyPage from "./FamilyPage";

const auth = vi.hoisted(() => ({
  me: null as MeResponse | null,
  logout: vi.fn(),
  refreshMe: vi.fn(),
}));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/features/auth/api", () => ({ listHouseholdMembers: vi.fn() }));
vi.mock("@/features/import/api", () => ({ getHouseholdImportHistory: vi.fn(), deleteMemberPortfolio: vi.fn() }));
vi.mock("@/lib/apiClient", () => ({ invalidateApiCache: vi.fn() }));

// The existing Complete profile dialog has its own tests; here it is a stand-in that shows what it was given
// and lets the test play the "saved", "merged" and "closed" moments.
const dialog = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("@/features/dashboard/members/CompleteProfileDialog", () => ({
  CompleteProfileDialog: (props: {
    member: HouseholdMember; onSaved: (member: HouseholdMember) => void; onMerged: (targetId: string) => void;
    onClose: () => void; onChangeInAccountInfo?: () => void;
  }) => {
    dialog.props.push(props);
    return (
      <div role="dialog" aria-label="stub complete profile">
        <output data-testid="stub-member">{props.member.id}</output>
        <button type="button" onClick={() => props.onSaved({ ...props.member, pan_masked: "ZZ******9Z" })}>stub saved</button>
        <button type="button" onClick={() => props.onMerged("m-self")}>stub merged</button>
        <button type="button" onClick={props.onClose}>stub closed</button>
        <button type="button" onClick={() => props.onChangeInAccountInfo?.()}>stub account info</button>
      </div>
    );
  },
}));

const LIVE_ROUTES = buildRegistry().map(route => route.id.startsWith("profile") ? { ...route, status: "live" as const } : route);
const DELETED = { deleted_transactions_count: 1, removed_member_ids: [], deleted_file: false };

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function mount(options: { refreshMembers?: () => void; openImport?: (memberId?: string) => void } = {}) {
  const refreshMembers = options.refreshMembers ?? vi.fn();
  const openImport = options.openImport ?? vi.fn();
  renderInShell(<><FamilyPage /><Probe /></>, { path: "/profile/family", routes: LIVE_ROUTES, scope: { refreshMembers }, openImport });
  return { refreshMembers, openImport };
}

const scrolled = vi.fn();
const cards = () => screen.getAllByTestId("member-card");
const cardOf = (name: string) => screen.getByRole("article", { name });
const content = () => screen.getByTestId("profile-content");

async function ready() {
  await screen.findAllByTestId("member-card");
}

beforeEach(() => {
  vi.clearAllMocks();
  dialog.props.length = 0;
  scrolled.mockReset();
  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value(this: Element, ...args: unknown[]) { scrolled(this, ...args); },
  });
  auth.me = ME_FIXTURE;
  auth.refreshMe.mockResolvedValue(undefined);
  vi.mocked(listHouseholdMembers).mockResolvedValue(HOUSEHOLD_FIXTURE);
  vi.mocked(getHouseholdImportHistory).mockResolvedValue(HISTORY_FIXTURE);
  vi.mocked(deleteMemberPortfolio).mockResolvedValue(DELETED);
});

afterEach(() => {
  Reflect.deleteProperty(window.HTMLElement.prototype, "scrollIntoView");
});

describe("FamilyPage: the page", () => {
  it("sits in the Profile frame with Family Members as the current item", async () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
    const current = screen.getByRole("navigation", { name: "Profile sections" }).querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Family Members");
    await ready();
  });

  it("loads the household and the statements once each, and writes nothing on load", async () => {
    mount();
    await ready();
    expect(listHouseholdMembers).toHaveBeenCalledTimes(1);
    expect(getHouseholdImportHistory).toHaveBeenCalledTimes(1);
    expect(deleteMemberPortfolio).not.toHaveBeenCalled();
    expect(invalidateApiCache).not.toHaveBeenCalled();
    expect(auth.refreshMe).not.toHaveBeenCalled();
  });

  it("shows the Family Account strip and the Family Members list with their sub-titles", async () => {
    mount();
    await ready();
    expect(within(content()).getByRole("heading", { level: 2, name: "Family Account" })).toBeInTheDocument();
    expect(within(content()).getByRole("heading", { level: 2, name: "Family Members" })).toBeInTheDocument();
    expect(within(content()).getByText("The people whose portfolios you track. Add a statement to bring in their funds.")).toBeInTheDocument();
    expect(within(screen.getByTestId("family-list")).getAllByTestId("member-card")).toHaveLength(3);
  });

  it("shows one strip tile and one card per member, in the server's order, with the avatar colour following the position", async () => {
    mount();
    await ready();
    expect(screen.getAllByTestId("strip-name").map(name => name.textContent)).toEqual(["Siddharth", "Aditi", "Ramesh"]);
    expect(cards().map(card => card.getAttribute("data-member-id"))).toEqual(["m-self", "m-spouse", "m-father"]);
    expect(cards().map(card => within(card).getByTestId("initials-avatar").getAttribute("data-tone"))).toEqual(["0", "1", "2"]);
    expect(cards().map(card => within(card).getByTestId("access-pill").textContent)).toEqual(["Admin", "Member", "Member"]);
  });

  it("shows loading skeletons for the strip and the rows until the household arrives, then none", async () => {
    mount();
    expect(screen.getByTestId("family-loading")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("member-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("family-strip")).not.toBeInTheDocument();
    await ready();
    expect(screen.queryByTestId("family-loading")).not.toBeInTheDocument();
  });

  it("keeps showing the loading state while the account itself is not loaded", async () => {
    auth.me = null;
    mount();
    await act(async () => {});
    expect(screen.getByTestId("family-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("member-card")).not.toBeInTheDocument();
  });

  it("the self card shows the account's own phone and email", async () => {
    auth.me = { ...ME_FIXTURE, phone_number: "+919000000001", email: "account@example.in" };
    mount();
    await ready();
    expect(within(cardOf("Siddharth Surve")).getByTestId("field-phone")).toHaveTextContent("+919000000001");
    expect(within(cardOf("Siddharth Surve")).getByTestId("field-email")).toHaveTextContent("account@example.in");
    expect(within(cardOf("Aditi Surve")).getByTestId("field-phone")).toHaveTextContent("Not added");
  });

  it("never offers Add Member, Show or Hide, and shows no unmasked PAN", async () => {
    mount();
    await ready();
    expect(screen.queryByText(/add member/i)).not.toBeInTheDocument();
    for (const card of cards()) expect(within(card).queryByRole("button", { name: /show|hide|reveal|copy/i })).not.toBeInTheDocument();
    expect(content().textContent).not.toMatch(/[A-Z]{5}[0-9]{4}[A-Z]/);
  });

  it("the PAN held by another account shows the pill and the caption on that member's card only", async () => {
    mount();
    await ready();
    expect(within(cardOf("Aditi Surve")).getByTestId("pan-conflict")).toBeInTheDocument();
    expect(within(cardOf("Aditi Surve")).getByTestId("pan-conflict-caption")).toBeInTheDocument();
    expect(screen.getAllByTestId("pan-conflict")).toHaveLength(1);
    expect(screen.getAllByTestId("pan-conflict-caption")).toHaveLength(1);
  });
});

describe("FamilyPage: the household cannot be loaded", () => {
  it("shows one message with Retry and neither the strip nor any card", async () => {
    vi.mocked(listHouseholdMembers).mockRejectedValue(new Error("down"));
    mount();
    const alert = await screen.findByTestId("family-error");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveTextContent("Could not load your family members.");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByTestId("family-strip")).not.toBeInTheDocument();
    expect(screen.queryByTestId("member-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("family-loading")).not.toBeInTheDocument();
  });

  it("Retry shows the loading state, loads again, and on success shows the cards and no message", async () => {
    vi.mocked(listHouseholdMembers).mockRejectedValueOnce(new Error("down"));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(screen.getByTestId("family-loading")).toBeInTheDocument();
    await ready();
    expect(listHouseholdMembers).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("family-error")).not.toBeInTheDocument();
    expect(cards()).toHaveLength(3);
  });
});

describe("FamilyPage: the statements cannot be loaded", () => {
  it("still shows every card, says why deleting funds is unavailable, and disables Delete all funds on every card", async () => {
    vi.mocked(getHouseholdImportHistory).mockRejectedValue(new Error("down"));
    mount();
    await ready();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load your statements, so deleting funds is unavailable right now. Please try again later.");
    expect(screen.queryByTestId("family-error")).not.toBeInTheDocument();
    for (const name of ["Siddharth Surve", "Aditi Surve", "Ramesh Surve"]) {
      expect(screen.getByRole("button", { name: `Delete all funds for ${name}` })).toBeDisabled();
    }
  });

  it("Delete member and the other actions keep working", async () => {
    vi.mocked(getHouseholdImportHistory).mockRejectedValue(new Error("down"));
    mount();
    await ready();
    expect(screen.getByRole("button", { name: "Delete Aditi Surve from your family" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add statement" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Delete Aditi Surve from your family" }));
    expect(screen.getByRole("dialog", { name: "Delete Aditi Surve from your family?" })).toBeInTheDocument();
  });

  it("no banner when the statements load", async () => {
    mount();
    await ready();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("FamilyPage: no members yet", () => {
  beforeEach(() => {
    vi.mocked(listHouseholdMembers).mockResolvedValue([]);
  });

  it("shows the strip with only the Add statement tile and the empty line in the list card, and no card", async () => {
    mount();
    expect(await screen.findByTestId("family-empty")).toHaveTextContent("No family members yet. Add a statement and we will find the people in it.");
    expect(screen.getByTestId("family-strip")).toBeInTheDocument();
    expect(screen.queryAllByTestId("strip-member")).toHaveLength(0);
    expect(screen.getByTestId("add-statement-tile")).toBeInTheDocument();
    expect(screen.queryByTestId("member-card")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("family-list")).getByTestId("family-empty")).toBeInTheDocument();
  });

  it("the Add statement tile goes straight to the import flow with no person chosen, and opens no dialog", async () => {
    const { openImport } = mount();
    await screen.findByTestId("family-empty");
    fireEvent.click(screen.getByRole("button", { name: "Add statement" }));
    expect(openImport).toHaveBeenCalledTimes(1);
    expect(openImport).toHaveBeenCalledWith();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("FamilyPage: the strip", () => {
  it("Manage Members scrolls the member list into view", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Manage Members" }));
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.calls[0][0]).toBe(screen.getByTestId("family-list"));
  });

  it("pressing a person in the strip highlights that person's card only, and scrolls that card into view", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Show Aditi Surve in the list" }));
    expect(cards().map(card => card.getAttribute("data-highlighted"))).toEqual(["false", "true", "false"]);
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.calls[0][0]).toBe(cardOf("Aditi Surve"));
    fireEvent.click(screen.getByRole("button", { name: "Show Ramesh Surve in the list" }));
    expect(cards().map(card => card.getAttribute("data-highlighted"))).toEqual(["false", "false", "true"]);
    expect(scrolled.mock.calls[1][0]).toBe(cardOf("Ramesh Surve"));
  });

  it("nothing is highlighted before any press", async () => {
    mount();
    await ready();
    expect(cards().map(card => card.getAttribute("data-highlighted"))).toEqual(["false", "false", "false"]);
  });
});

describe("FamilyPage: Add statement", () => {
  it("the tile asks 'for whom', listing every household member", async () => {
    const { openImport } = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Add statement" }));
    const dialogBox = screen.getByRole("dialog", { name: "Add statement for whom?" });
    expect(within(dialogBox).getAllByTestId("whom-option").map(option => option.getAttribute("aria-label"))).toEqual(["Siddharth Surve", "Aditi Surve", "Ramesh Surve"]);
    expect(openImport).not.toHaveBeenCalled();
  });

  it("picking a person opens the import flow for that person only, and closes the dialog", async () => {
    const { openImport } = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Add statement" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Aditi Surve" }));
    expect(openImport).toHaveBeenCalledTimes(1);
    expect(openImport).toHaveBeenCalledWith("m-spouse");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("picking the account holder passes the self member's id", async () => {
    const { openImport } = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Add statement" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Siddharth Surve" }));
    expect(openImport).toHaveBeenCalledWith("m-self");
  });

  it("Cancel closes the dialog without opening the import flow", async () => {
    const { openImport } = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Add statement" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(openImport).not.toHaveBeenCalled();
  });
});

describe("FamilyPage: Edit profile", () => {
  async function open(buttonName: string | RegExp, card = "Aditi Surve") {
    const refreshMembers = vi.fn();
    mount({ refreshMembers });
    await ready();
    fireEvent.click(within(cardOf(card)).getByRole("button", { name: buttonName }));
    return refreshMembers;
  }

  it("the profile chip opens the existing Complete profile dialog for that member, with the account's phone and email", async () => {
    await open(/60% complete/);
    expect(screen.getByRole("dialog", { name: "stub complete profile" })).toBeInTheDocument();
    expect(screen.getByTestId("stub-member")).toHaveTextContent("m-spouse");
    const props = dialog.props.at(-1);
    expect(props?.accountPhone).toBe("+919876543210");
    expect(props?.accountEmail).toBe("siddharth@example.in");
  });

  it("Edit profile on a complete card opens it for that member", async () => {
    await open("Edit profile", "Siddharth Surve");
    expect(screen.getByTestId("stub-member")).toHaveTextContent("m-self");
  });

  it("closes when the dialog ends its sequence", async () => {
    await open(/60% complete/);
    fireEvent.click(screen.getByRole("button", { name: "stub closed" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("after a save: clears the cache, reloads the shell's members, refreshes the account, shows the saved PAN, and keeps the dialog open", async () => {
    const order: string[] = [];
    vi.mocked(invalidateApiCache).mockImplementation(() => { order.push("invalidate"); });
    auth.refreshMe.mockImplementation(() => { order.push("refreshMe"); return Promise.resolve(); });
    const refreshMembers = vi.fn(() => { order.push("refreshMembers"); });
    mount({ refreshMembers });
    await ready();
    fireEvent.click(within(cardOf("Aditi Surve")).getByRole("button", { name: /60% complete/ }));
    fireEvent.click(screen.getByRole("button", { name: "stub saved" }));
    expect(order).toEqual(["invalidate", "refreshMembers", "refreshMe"]);
    await waitFor(() => expect(within(cardOf("Aditi Surve")).getByTestId("pan-value")).toHaveTextContent("ZZ******9Z"));
    expect(within(cardOf("Siddharth Surve")).getByTestId("pan-value")).toHaveTextContent("AB******4F");
    expect(screen.getByRole("dialog", { name: "stub complete profile" })).toBeInTheDocument();
  });

  it("after a merge: closes the dialog, reloads the household, clears the cache, reloads the shell's members and refreshes the account", async () => {
    const refreshMembers = await open(/60% complete/);
    expect(listHouseholdMembers).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "stub merged" }));
    await waitFor(() => expect(listHouseholdMembers).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(invalidateApiCache).toHaveBeenCalledTimes(1);
    expect(refreshMembers).toHaveBeenCalledTimes(1);
    expect(auth.refreshMe).toHaveBeenCalledTimes(1);
  });

  it("the dialog's 'Change in Account Info' closes it and opens Personal Information", async () => {
    await open("Edit profile", "Siddharth Surve");
    fireEvent.click(screen.getByRole("button", { name: "stub account info" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/personal");
  });
});

describe("FamilyPage: Change in Account Info", () => {
  it("is on the self card only and opens Personal Information", async () => {
    mount();
    await ready();
    expect(screen.getAllByRole("button", { name: "Change in Account Info" })).toHaveLength(1);
    expect(within(cardOf("Siddharth Surve")).getByRole("button", { name: "Change in Account Info" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change in Account Info" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/personal");
  });
});

describe("FamilyPage: Delete all funds", () => {
  async function open(name: string) {
    const order: string[] = [];
    vi.mocked(invalidateApiCache).mockImplementation(() => { order.push("invalidate"); });
    const refreshMembers = vi.fn(() => { order.push("refreshMembers"); });
    mount({ refreshMembers });
    await ready();
    vi.mocked(listHouseholdMembers).mockImplementation(() => { order.push("reload"); return Promise.resolve(HOUSEHOLD_FIXTURE); });
    fireEvent.click(screen.getByRole("button", { name: `Delete all funds for ${name}` }));
    return { order, refreshMembers };
  }

  it("opens the existing dialog with the number of that member's statements, counting an upload group once", async () => {
    await open("Aditi Surve");
    const box = await screen.findByRole("dialog", { name: "Delete all of Aditi Surve’s funds?" });
    expect(within(box).getByText("This removes their funds from all 2 statements. Other people’s funds stay.")).toBeInTheDocument();
  });

  it("counts the self member's statements from their own rows (two rows in one group and one without a group make 2)", async () => {
    await open("Siddharth Surve");
    const box = await screen.findByRole("dialog");
    expect(within(box).getByText(/from all 2 statements\./)).toBeInTheDocument();
  });

  it("says '1 statement' for one and '0 statements' for none", async () => {
    const one: ImportHistoryRow = { ...HISTORY_FIXTURE[0], import_id: "only", household_member_id: "m-father", upload_group_id: "gx" };
    vi.mocked(getHouseholdImportHistory).mockResolvedValue([one]);
    await open("Ramesh Surve");
    expect(within(await screen.findByRole("dialog")).getByText(/from all 1 statement\./)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete all funds for Aditi Surve" }));
    expect(within(await screen.findByRole("dialog")).getByText(/from all 0 statements\./)).toBeInTheDocument();
  });

  it("Delete without the tick keeps the member: sends remove_member false, then clears the cache, reloads the shell's members and the list, and closes", async () => {
    const { order } = await open("Aditi Surve");
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleteMemberPortfolio).toHaveBeenCalledTimes(1);
    expect(deleteMemberPortfolio).toHaveBeenCalledWith("m-spouse", false);
    expect(order).toEqual(["invalidate", "refreshMembers", "reload"]);
  });

  it("Delete with 'Also remove ... from my family' ticked sends remove_member true", async () => {
    await open("Aditi Surve");
    const box = await screen.findByRole("dialog");
    fireEvent.click(within(box).getByLabelText("Also remove Aditi Surve from my family"));
    fireEvent.click(within(box).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteMemberPortfolio).toHaveBeenCalledWith("m-spouse", true));
  });

  it("the self member can never be removed here: no tick box, and the request always says false", async () => {
    await open("Siddharth Surve");
    const box = await screen.findByRole("dialog");
    expect(within(box).queryByLabelText(/Also remove/)).not.toBeInTheDocument();
    fireEvent.click(within(box).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteMemberPortfolio).toHaveBeenCalledWith("m-self", false));
  });

  it("Keep closes the dialog and sends nothing", async () => {
    await open("Aditi Surve");
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleteMemberPortfolio).not.toHaveBeenCalled();
    expect(invalidateApiCache).not.toHaveBeenCalled();
  });

  it("a failure shows the message in the dialog, keeps it open, and changes nothing else", async () => {
    vi.mocked(deleteMemberPortfolio).mockRejectedValueOnce(new Error("down"));
    const { order } = await open("Aditi Surve");
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Could not delete these funds. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(order).toEqual([]);
    expect(listHouseholdMembers).toHaveBeenCalledTimes(1);
  });
});

describe("FamilyPage: Delete member", () => {
  async function open(name: string) {
    const order: string[] = [];
    vi.mocked(invalidateApiCache).mockImplementation(() => { order.push("invalidate"); });
    const refreshMembers = vi.fn(() => { order.push("refreshMembers"); });
    mount({ refreshMembers });
    await ready();
    vi.mocked(listHouseholdMembers).mockImplementation(() => { order.push("reload"); return Promise.resolve(HOUSEHOLD_FIXTURE.filter(member => member.name !== name)); });
    fireEvent.click(screen.getByRole("button", { name: `Delete ${name} from your family` }));
    return { order, refreshMembers };
  }

  it("is offered on every card except the account holder's", async () => {
    mount();
    await ready();
    expect(screen.getAllByRole("button", { name: /from your family/ }).map(button => button.getAttribute("aria-label"))).toEqual([
      "Delete Aditi Surve from your family",
      "Delete Ramesh Surve from your family",
    ]);
    expect(within(cardOf("Siddharth Surve")).queryByRole("button", { name: /from your family/ })).not.toBeInTheDocument();
  });

  it("opens the confirmation for that person", async () => {
    await open("Ramesh Surve");
    expect(screen.getByRole("dialog", { name: "Delete Ramesh Surve from your family?" })).toBeInTheDocument();
    expect(deleteMemberPortfolio).not.toHaveBeenCalled();
  });

  it("Keep closes it and sends nothing", async () => {
    await open("Ramesh Surve");
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteMemberPortfolio).not.toHaveBeenCalled();
  });

  it("confirming sends remove_member true for that member, then clears the cache BEFORE reloading the shell's members and the list, and the card goes", async () => {
    const { order } = await open("Ramesh Surve");
    fireEvent.click(screen.getByRole("button", { name: "Delete member" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleteMemberPortfolio).toHaveBeenCalledTimes(1);
    expect(deleteMemberPortfolio).toHaveBeenCalledWith("m-father", true);
    expect(order).toEqual(["invalidate", "refreshMembers", "reload"]);
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(screen.queryByRole("article", { name: "Ramesh Surve" })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("strip-member")).toHaveLength(2);
  });

  it("a failure shows the message, keeps the dialog and the card, and reloads nothing", async () => {
    vi.mocked(deleteMemberPortfolio).mockRejectedValueOnce(new Error("down"));
    const { order } = await open("Ramesh Surve");
    fireEvent.click(screen.getByRole("button", { name: "Delete member" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete this member. Please try again.");
    expect(screen.getByRole("dialog", { name: "Delete Ramesh Surve from your family?" })).toBeInTheDocument();
    expect(cardOf("Ramesh Surve")).toBeInTheDocument();
    expect(order).toEqual([]);
  });
});
