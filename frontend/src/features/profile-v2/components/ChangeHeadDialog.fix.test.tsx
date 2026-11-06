import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as authApi from "@/features/auth/api";
import { setSignInNotice } from "@/features/auth/session";
import type { HouseholdMember, MeResponse } from "@/features/auth/types";
import { ME_FIXTURE } from "../fixtures/me";
import { HOUSEHOLD_FIXTURE } from "../fixtures/members";
import { ChangeHeadDialog } from "./ChangeHeadDialog";

const auth = vi.hoisted(() => ({ me: null as MeResponse | null, logout: vi.fn(), refreshMe: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/features/auth/api", async () => {
  const actual = await vi.importActual<typeof import("@/features/auth/api")>("@/features/auth/api");
  return {
    ...actual,
    getHeadChangeEligibility: vi.fn(), requestHeadChangeStartCode: vi.fn(), startHeadChange: vi.fn(), verifyHeadChangeCode: vi.fn(),
    resendHeadChangeCode: vi.fn(), cancelHeadChange: vi.fn(), getPendingHeadChange: vi.fn(), previewHeadChange: vi.fn(), completeHeadChange: vi.fn(),
  };
});
// The existing Complete profile dialog has its own tests; here it is a stand-in that shows what it was given and lets a test end its sequence.
const profile = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("@/features/dashboard/members/CompleteProfileDialog", () => ({
  CompleteProfileDialog: (props: {
    member: HouseholdMember; accountPhone?: string | null; accountEmail?: string | null;
    onSaved: (member: HouseholdMember) => void; onMerged: (targetId: string) => void; onClose: () => void;
  }) => {
    profile.props.push(props);
    return (
      <div role="dialog" aria-label="Complete profile stub" data-member={props.member.id}>
        <button type="button" onClick={() => props.onSaved(props.member)}>stub save</button>
        <button type="button" onClick={() => props.onMerged("m-father")}>stub merge</button>
        <button type="button" onClick={props.onClose}>stub close</button>
      </div>
    );
  },
}));

const [SELF, SPOUSE, FATHER] = HOUSEHOLD_FIXTURE;
const MEMBERS: HouseholdMember[] = [
  SELF, SPOUSE, FATHER,
  { ...FATHER, id: "m-sibling", name: "Neha Surve", relationship: "sibling" } as HouseholdMember,
  { ...FATHER, id: "m-cousin", name: "Karan Surve", relationship: "other" } as HouseholdMember,
  { ...FATHER, id: "m-importing", name: "Meera Surve", relationship: "parent" } as HouseholdMember,
];
const ELIGIBILITY = {
  members: [
    { member_id: "m-spouse", reasons: ["no_email", "no_phone"] },
    { member_id: "m-father", reasons: [] },
    { member_id: "m-sibling", reasons: ["no_pan", "pan_registered_elsewhere"] },
    { member_id: "m-cousin", reasons: ["email_in_use"] },
    { member_id: "m-importing", reasons: ["import_in_progress"] },
  ],
};

const title = () => screen.queryByRole("heading", { name: "Choose who will be Head of Family" });
const profileDialog = () => screen.queryByRole("dialog", { name: "Complete profile stub" });

function mount(over: Partial<Parameters<typeof ChangeHeadDialog>[0]> = {}) {
  const handlers = { onClose: vi.fn(), onMembersChanged: vi.fn() };
  render(<ChangeHeadDialog members={MEMBERS} {...handlers} {...over} />);
  return handlers;
}

beforeEach(() => {
  vi.clearAllMocks();
  profile.props.length = 0;
  setSignInNotice(null);
  auth.me = { ...ME_FIXTURE, head_member_id: "m-self", phone_number: "+919000000001", email: "head@example.in" } as MeResponse;
  vi.mocked(authApi.getHeadChangeEligibility).mockResolvedValue(ELIGIBILITY);
  vi.mocked(authApi.requestHeadChangeStartCode).mockResolvedValue({ message: "Code sent.", otp: "123456" });
});

describe("ChangeHeadDialog: fix a member's missing details from the list (QA fixes, C1)", () => {
  it("a member with only fixable reasons is a clickable row with an Add details chip and a plain hint", async () => {
    mount();
    const spouse = await screen.findByRole("button", { name: /Aditi Surve/ });
    expect(spouse).toBeEnabled();
    expect(within(spouse).getByText("Add details")).toBeInTheDocument();
    expect(within(spouse).getByText("Needs an email address and a phone number.")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Aditi Surve/ })).toBeNull();
    expect(within(screen.getByRole("button", { name: /Karan Surve/ })).getByText("Needs a different email address.")).toBeInTheDocument();
  });
  it("a member with a reason that cannot be fixed here stays a disabled row with that reason, even when other reasons are fixable", async () => {
    mount();
    await screen.findByRole("radio", { name: /Ramesh Surve/ });
    expect(screen.getByRole("radio", { name: /Neha Surve/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Neha Surve/ })).toBeNull();
    expect(screen.getByRole("radio", { name: /Meera Surve/ })).toBeDisabled();
    expect(screen.getByText("Finish or cancel the statement you are importing first.")).toBeInTheDocument();
    expect(screen.queryByText("Add their PAN in their profile first.")).toBeNull();
  });
  it("an eligible member is still a radio, selectable as before", async () => {
    mount();
    const father = await screen.findByRole("radio", { name: /Ramesh Surve/ });
    expect(father).toBeEnabled();
    fireEvent.click(father);
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
  it("clicking a fixable row hides this dialog and opens the Complete profile dialog for that member, with the account's contact", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Aditi Surve/ }));
    expect(profileDialog()).toHaveAttribute("data-member", "m-spouse");
    expect(title()).toBeNull();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const props = profile.props.at(-1);
    expect(props?.accountPhone).toBe("+919000000001");
    expect(props?.accountEmail).toBe("head@example.in");
  });
  it("when its sequence ends the list is read again from the server and the dialog comes back", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Aditi Surve/ }));
    expect(authApi.getHeadChangeEligibility).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "stub close" }));
    await waitFor(() => expect(authApi.getHeadChangeEligibility).toHaveBeenCalledTimes(2));
    expect(profileDialog()).toBeNull();
    expect(await screen.findByRole("heading", { name: "Choose who will be Head of Family" })).toBeInTheDocument();
  });
  it("a member who is eligible after the fix is selected for the person, and Next is enabled", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Aditi Surve/ }));
    vi.mocked(authApi.getHeadChangeEligibility).mockResolvedValue({
      members: ELIGIBILITY.members.map(item => (item.member_id === "m-spouse" ? { ...item, reasons: [] } : item)),
    });
    fireEvent.click(screen.getByRole("button", { name: "stub save" }));
    fireEvent.click(screen.getByRole("button", { name: "stub close" }));
    const spouse = await screen.findByRole("radio", { name: /Aditi Surve/ });
    await waitFor(() => expect(spouse).toBeChecked());
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
  it("a member who still has a reason is not selected, and the remaining reason shows on the row", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Aditi Surve/ }));
    vi.mocked(authApi.getHeadChangeEligibility).mockResolvedValue({
      members: ELIGIBILITY.members.map(item => (item.member_id === "m-spouse" ? { ...item, reasons: ["no_phone"] } : item)),
    });
    fireEvent.click(screen.getByRole("button", { name: "stub close" }));
    const spouse = await screen.findByRole("button", { name: /Aditi Surve/ });
    expect(within(spouse).getByText("Needs a phone number.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
  it("a member merged away disappears from the list", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Aditi Surve/ }));
    vi.mocked(authApi.getHeadChangeEligibility).mockResolvedValue({ members: ELIGIBILITY.members.filter(item => item.member_id !== "m-spouse") });
    fireEvent.click(screen.getByRole("button", { name: "stub merge" }));
    fireEvent.click(screen.getByRole("button", { name: "stub close" }));
    await screen.findByRole("radio", { name: /Ramesh Surve/ });
    expect(screen.queryByText(/Aditi Surve/)).toBeNull();
  });
  it("a selection made before is dropped when that member is no longer eligible after the edit", async () => {
    mount();
    fireEvent.click(await screen.findByRole("radio", { name: /Ramesh Surve/ }));
    fireEvent.click(screen.getByRole("button", { name: /Aditi Surve/ }));
    vi.mocked(authApi.getHeadChangeEligibility).mockResolvedValue({
      members: ELIGIBILITY.members.map(item => (item.member_id === "m-father" ? { ...item, reasons: ["no_phone"] } : item)),
    });
    fireEvent.click(screen.getByRole("button", { name: "stub close" }));
    await screen.findByRole("button", { name: /Ramesh Surve/ });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
  it("tells the page the members changed after a save and after a merge, so the Family list is fresh", async () => {
    const { onMembersChanged } = mount();
    fireEvent.click(await screen.findByRole("button", { name: /Aditi Surve/ }));
    fireEvent.click(screen.getByRole("button", { name: "stub save" }));
    expect(onMembersChanged).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "stub merge" }));
    expect(onMembersChanged).toHaveBeenCalledTimes(2);
  });
  it("does not need onMembersChanged", async () => {
    render(<ChangeHeadDialog members={MEMBERS} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Aditi Surve/ }));
    fireEvent.click(screen.getByRole("button", { name: "stub save" }));
    expect(profileDialog()).not.toBeNull();
  });
  it("once the start code is sent every row is disabled, fixable ones included", async () => {
    mount();
    fireEvent.click(await screen.findByRole("radio", { name: /Ramesh Surve/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByLabelText(/your email code/i);
    expect(screen.getByRole("button", { name: /Aditi Surve/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Ramesh Surve/ })).toBeDisabled();
  });
  it("closing the whole dialog still works while the fixable rows are showing", async () => {
    const { onClose } = mount();
    await screen.findByRole("button", { name: /Aditi Surve/ });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
