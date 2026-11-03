import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelHeadChange,
  getHeadChangeEligibility,
  getPendingHeadChange,
  listHouseholdMembers,
  previewHeadChange,
  requestHeadChangeStartCode,
  startHeadChange,
} from "@/features/auth/api";
import type { HeadChangeStatus, HouseholdMember, MeResponse } from "@/features/auth/types";
import { deleteMemberPortfolio, getHouseholdImportHistory } from "@/features/import/api";
import { invalidateApiCache } from "@/lib/apiClient";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { ME_FIXTURE } from "../fixtures/me";
import { HISTORY_FIXTURE, type ImportHistoryRow } from "../fixtures/importHistory";
import { HOUSEHOLD_FIXTURE } from "../fixtures/members";
import FamilyPage from "./FamilyPage";

// `setMe` plays what the real AuthContext does when `refreshMe` stores a new account: every component reading it renders again.
const auth = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const value: {
    me: MeResponse | null;
    logout: ReturnType<typeof vi.fn>;
    refreshMe: ReturnType<typeof vi.fn>;
    listeners: Set<() => void>;
    setMe: (next: MeResponse | null) => void;
  } = {
    me: null,
    logout: vi.fn(),
    refreshMe: vi.fn(),
    listeners,
    setMe(next) {
      value.me = next;
      listeners.forEach(listener => listener());
    },
  };
  return value;
});
vi.mock("@/features/auth/AuthContext", async () => {
  const React = await import("react");
  return {
    useAuth: () => {
      const [, force] = React.useReducer((n: number) => n + 1, 0);
      React.useEffect(() => {
        auth.listeners.add(force);
        return () => {
          auth.listeners.delete(force);
        };
      }, []);
      return auth;
    },
  };
});
vi.mock("@/features/auth/api", async () => {
  const actual = await vi.importActual<typeof import("@/features/auth/api")>("@/features/auth/api");
  return {
    ...actual,
    listHouseholdMembers: vi.fn(),
    getHeadChangeEligibility: vi.fn(),
    requestHeadChangeStartCode: vi.fn(),
    startHeadChange: vi.fn(),
    verifyHeadChangeCode: vi.fn(),
    resendHeadChangeCode: vi.fn(),
    cancelHeadChange: vi.fn(),
    getPendingHeadChange: vi.fn(),
    previewHeadChange: vi.fn(),
    completeHeadChange: vi.fn(),
  };
});
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
  vi.useRealTimers();
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
    // Changed from "not called": the page now reads the account once on arrival so a waiting Head of Family change is current.
    expect(auth.refreshMe).toHaveBeenCalledTimes(1);
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
    order.length = 0; // the page's own read of the account on arrival is not part of this order
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
    auth.refreshMe.mockClear(); // not counting the page's own read of the account on arrival
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

describe("FamilyPage: Change Head of Family", () => {
  it("button_shown_to_the_head_only", async () => {
    // 1. Payload without head_member_id behaves as not head
    auth.me = ME_FIXTURE;
    const { unmount } = renderInShell(<FamilyPage />, { path: "/profile/family", routes: LIVE_ROUTES });
    await ready();
    expect(screen.queryByRole("button", { name: "Change Head of Family" })).not.toBeInTheDocument();
    unmount();

    // 2. head_member_id points to someone else -> not shown
    auth.me = { ...ME_FIXTURE, head_member_id: "m-spouse" };
    const second = renderInShell(<FamilyPage />, { path: "/profile/family", routes: LIVE_ROUTES });
    await ready();
    expect(screen.queryByRole("button", { name: "Change Head of Family" })).not.toBeInTheDocument();
    second.unmount();

    // 3. head_member_id matches the self member -> shown
    auth.me = { ...ME_FIXTURE, head_member_id: "m-self" };
    renderInShell(<FamilyPage />, { path: "/profile/family", routes: LIVE_ROUTES });
    await ready();
    expect(screen.getByRole("button", { name: "Change Head of Family" })).toBeInTheDocument();
  });

  it("pending_banner_shows_time_left_and_cancel", async () => {
    const pending = {
      request_id: "req-pending-1",
      status: "pending" as const,
      expires_in_seconds: 545,
      verified_count: 1,
      ready: false,
      current_email_verified: true,
      current_phone_verified: false,
      new_email_verified: false,
      new_phone_verified: false,
    };
    auth.me = {
      ...ME_FIXTURE,
      head_member_id: "m-self",
      head_change_pending: pending,
    };
    vi.mocked(cancelHeadChange).mockResolvedValue({
      ...pending,
      status: "cancelled",
      expires_in_seconds: 0,
    });
    vi.mocked(getPendingHeadChange).mockResolvedValue({ request: pending });
    vi.mocked(previewHeadChange).mockResolvedValue({
      request_id: "req-pending-1",
      old_head: { member_id: "m-self", name: "Siddharth Surve" },
      new_head: {
        member_id: "m-father",
        name: "Ramesh Surve",
        email: "ramesh@example.in",
        phone_number: "+919812345678",
      },
      old_head_new_label: "child",
      members: [],
      everyone_signed_out: true,
    });

    mount();
    await ready();

    // Shows banner instead of the Change Head of Family button
    expect(screen.queryByRole("button", { name: "Change Head of Family" })).not.toBeInTheDocument();
    expect(
      screen.getByText("A Head of Family change is waiting for codes. 9:05 left."),
    ).toBeInTheDocument();

    // Continue reopens the dialog at step 2
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Enter the four codes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));

    // Cancel calls cancelHeadChange and refreshes me; the server now says nothing is pending
    auth.refreshMe.mockImplementation(async () => {
      auth.setMe({ ...ME_FIXTURE, head_member_id: "m-self", head_change_pending: null });
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(cancelHeadChange).toHaveBeenCalledTimes(1));
    expect(auth.refreshMe).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByTestId("head-change-pending-banner")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Change Head of Family" })).toBeInTheDocument();
  });

  it("member_list_cards_are_unchanged", async () => {
    auth.me = { ...ME_FIXTURE, head_member_id: "m-self" };
    mount();
    await ready();

    expect(cards().map(card => card.getAttribute("data-member-id"))).toEqual([
      "m-self",
      "m-spouse",
      "m-father",
    ]);
    expect(within(cardOf("Siddharth Surve")).getByTestId("access-pill")).toHaveTextContent("Admin");
    expect(within(cardOf("Aditi Surve")).getByTestId("access-pill")).toHaveTextContent("Member");
    expect(within(cardOf("Ramesh Surve")).getByTestId("access-pill")).toHaveTextContent("Member");
    expect(within(cardOf("Siddharth Surve")).getByRole("button", { name: "Change in Account Info" })).toBeInTheDocument();
    expect(within(cardOf("Aditi Surve")).getByRole("button", { name: "Delete Aditi Surve from your family" })).toBeInTheDocument();
    expect(within(cardOf("Ramesh Surve")).getByRole("button", { name: "Delete Ramesh Surve from your family" })).toBeInTheDocument();
  });
});

describe("FamilyPage: the pending Head of Family banner stays true to the server", () => {
  const settle = () =>
    act(async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    });

  const pendingStatus = (seconds: number): HeadChangeStatus => ({
    request_id: "req-pending-1",
    status: "pending",
    expires_in_seconds: seconds,
    verified_count: 1,
    ready: false,
    current_email_verified: true,
    current_phone_verified: false,
    new_email_verified: false,
    new_phone_verified: false,
  });

  const BANNER = "head-change-pending-banner";
  // What the server says is pending; refreshMe copies it into the account the page reads.
  let serverPending: HeadChangeStatus | null = null;

  beforeEach(() => {
    serverPending = null;
    auth.me = { ...ME_FIXTURE, head_member_id: "m-self" };
    auth.refreshMe.mockImplementation(async () => {
      auth.setMe({ ...ME_FIXTURE, head_member_id: "m-self", head_change_pending: serverPending });
    });
    vi.mocked(getHeadChangeEligibility).mockResolvedValue({
      members: [{ member_id: "m-father", reasons: [] }],
    });
    vi.mocked(requestHeadChangeStartCode).mockResolvedValue({ message: "Code sent.", otp: null });
    vi.mocked(startHeadChange).mockResolvedValue({
      request: pendingStatus(590),
      codes: [
        { party: "current", channel: "email", verified: true, otp: null },
        { party: "current", channel: "phone", verified: false, otp: null },
        { party: "new", channel: "email", verified: false, otp: null },
        { party: "new", channel: "phone", verified: false, otp: null },
      ],
    });
    vi.mocked(getPendingHeadChange).mockResolvedValue({ request: pendingStatus(590) });
    vi.mocked(previewHeadChange).mockResolvedValue({
      request_id: "req-pending-1",
      old_head: { member_id: "m-self", name: "Siddharth Surve" },
      new_head: { member_id: "m-father", name: "Ramesh Surve", email: "r@example.in", phone_number: "+919812345678" },
      old_head_new_label: "child",
      members: [],
      everyone_signed_out: true,
    });
  });

  async function openDialogToStep2() {
    fireEvent.click(screen.getByRole("button", { name: "Change Head of Family" }));
    await settle();
    fireEvent.click(screen.getByRole("radio", { name: /Ramesh Surve/i }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    fireEvent.change(screen.getByLabelText(/your email code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await settle();
    expect(screen.getByRole("heading", { name: "Enter the four codes" })).toBeInTheDocument();
  }

  it("reads_the_account_once_on_arrival_so_the_banner_is_current", async () => {
    serverPending = pendingStatus(300);
    mount();
    await settle();

    expect(auth.refreshMe).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(BANNER)).toHaveTextContent("A Head of Family change is waiting for codes. 5:00 left.");
  });

  it("the_banner_goes_away_when_its_countdown_reaches_zero", async () => {
    vi.useFakeTimers();
    serverPending = pendingStatus(3);
    mount();
    await settle();
    expect(screen.getByTestId(BANNER)).toHaveTextContent("0:03 left");
    serverPending = null; // by the time the clock runs out the server no longer has the request
    auth.refreshMe.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(screen.queryByTestId(BANNER)).not.toBeInTheDocument();
    expect(screen.queryByText(/0:00 left/)).not.toBeInTheDocument();
    expect(auth.refreshMe).toHaveBeenCalledTimes(1);
  });

  it("a_banner_that_counts_down_follows_the_clock_not_the_ticks", async () => {
    vi.useFakeTimers();
    serverPending = pendingStatus(545);
    mount();
    await settle();
    expect(screen.getByTestId(BANNER)).toHaveTextContent("9:05 left");

    await act(async () => {
      vi.setSystemTime(Date.now() + 60_000);
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(screen.getByTestId(BANNER)).toHaveTextContent("8:04 left");
  });

  it("closing_the_dialog_at_step_one_still_refreshes_the_account_so_a_request_the_server_made_shows_its_banner", async () => {
    mount();
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Change Head of Family" }));
    await settle();
    expect(screen.getByRole("heading", { name: "Choose who will be Head of Family" })).toBeInTheDocument();
    // The response to "start" was lost, but the server did create the request.
    serverPending = pendingStatus(500);
    auth.refreshMe.mockClear();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await settle();

    expect(auth.refreshMe).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(BANNER)).toBeInTheDocument();
  });

  it("a_request_handed_back_by_the_dialog_does_not_outlive_a_refresh_that_says_nothing_is_pending", async () => {
    mount();
    await settle();
    await openDialogToStep2();
    // The server no longer has the request (it expired while the dialog was open).
    serverPending = null;

    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    await settle();

    expect(screen.queryByTestId(BANNER)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change Head of Family" })).toBeInTheDocument();
  });

  it("a_failed_cancel_clears_the_local_copy_so_the_banner_cannot_come_back_from_it", async () => {
    mount();
    await settle();
    await openDialogToStep2();
    serverPending = pendingStatus(500);
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    await settle();
    expect(screen.getByTestId(BANNER)).toBeInTheDocument();

    // The request is gone on the server, so cancelling it fails with "not found".
    serverPending = null;
    // The same shape as the app's ApiError (this file replaces the module that defines it).
    vi.mocked(cancelHeadChange).mockRejectedValueOnce(
      Object.assign(new Error("Head change request not found."), {
        status: 404,
        payload: { code: "request_not_found", message: "Head change request not found." },
      }),
    );
    fireEvent.click(within(screen.getByTestId(BANNER)).getByRole("button", { name: "Cancel" }));
    await settle();

    expect(screen.queryByTestId(BANNER)).not.toBeInTheDocument();
  });

  it("reopening_from_the_banner_uses_the_time_that_is_left", async () => {
    vi.useFakeTimers();
    serverPending = pendingStatus(545);
    vi.mocked(getPendingHeadChange).mockReturnValue(new Promise(() => {}));
    vi.mocked(previewHeadChange).mockReturnValue(new Promise(() => {}));
    mount();
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    fireEvent.click(within(screen.getByTestId(BANNER)).getByRole("button", { name: "Continue" }));
    await settle();

    expect(screen.getByRole("heading", { name: "Enter the four codes" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("9:00 left")).toBeInTheDocument();
  });

  it("reopening_from_the_banner_when_nothing_is_pending_goes_back_to_step_one", async () => {
    serverPending = pendingStatus(545);
    vi.mocked(getPendingHeadChange).mockResolvedValue({ request: null });
    mount();
    await settle();

    fireEvent.click(within(screen.getByTestId(BANNER)).getByRole("button", { name: "Continue" }));
    await settle();

    expect(screen.getByRole("heading", { name: "Choose who will be Head of Family" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent(
      "That change is no longer open. You can start again.",
    );
  });
});
