import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/apiClient";
import { mergeMemberInto, updateMemberProfile } from "../../auth/api";
import type { HouseholdMember } from "../../auth/types";
import { CompleteProfileDialog } from "./CompleteProfileDialog";

vi.mock("../../auth/api", () => ({
  updateMemberProfile: vi.fn(),
  mergeMemberInto: vi.fn(),
}));

const member = (over: Partial<HouseholdMember> = {}): HouseholdMember => ({
  id: "m-r", name: "Ramesh Sharma", relationship: null, relationship_other_label: null, origin: "cas_detected",
  pan_masked: "AB******4K", phone_number: null, email: null, name_from_statement: true,
  pan_conflict: null, pan_editable: false, profile_completion: 40,
  missing_fields: ["relationship", "phone_number", "email"], removed_with_last_import: true, ...over,
});

const noPan = (over: Partial<HouseholdMember> = {}) =>
  member({ pan_masked: null, pan_editable: true, profile_completion: 20, missing_fields: ["pan", "relationship", "phone_number", "email"], ...over });

const dupError = (details: Record<string, unknown>) =>
  new ApiError(409, { code: "pan_belongs_to_other_member", message: "x", details: { can_merge: true, ...details } });

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

function setup(m: HouseholdMember, extra: Partial<React.ComponentProps<typeof CompleteProfileDialog>> = {}) {
  const props = { onSaved: vi.fn(), onMerged: vi.fn(), onClose: vi.fn() };
  render(<CompleteProfileDialog member={m} {...props} {...extra} />);
  return props;
}

describe("CompleteProfileDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the CAS PAN greyed and read-only, name editable, relationship optional", () => {
    setup(member());
    expect(screen.getByRole("heading", { name: "Complete Ramesh Sharma’s profile" })).toBeInTheDocument();
    const pan = screen.getByLabelText("PAN");
    expect(pan).toHaveValue("AB******4K");
    expect(pan).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("Relationship")).not.toBeRequired();
    expect(screen.getByText("From your CAS. Can’t be changed.")).toBeInTheDocument();
  });

  it("Save sends only changed fields and reports the saved member", async () => {
    vi.mocked(updateMemberProfile).mockResolvedValue(member({ relationship: "parent", profile_completion: 60 }));
    const { onSaved, onClose } = setup(member());
    type("Relationship", "parent");
    click("Save");
    await waitFor(() => expect(onClose).toHaveBeenCalled()); // below 100%: straight back to the dashboard
    expect(updateMemberProfile).toHaveBeenCalledWith("m-r", { relationship: "parent", relationship_other_label: null });
    expect(onSaved).toHaveBeenCalled();
  });

  it("member with no PAN: PAN is a required input and Save is blocked until typed", () => {
    setup(noPan());
    click("Save");
    expect(screen.getByText("Enter Ramesh Sharma’s PAN to save.")).toBeInTheDocument();
    expect(updateMemberProfile).not.toHaveBeenCalled();
  });

  it("rejects a malformed PAN before sending", () => {
    setup(noPan());
    type("PAN", "abc");
    click("Save");
    expect(screen.getByText("Enter a valid PAN: 5 letters, 4 digits, then 1 letter.")).toBeInTheDocument();
    expect(updateMemberProfile).not.toHaveBeenCalled();
  });

  it("Other relationship needs a label", () => {
    setup(member());
    type("Relationship", "other");
    click("Save");
    expect(screen.getByText("Type how you’re related.")).toBeInTheDocument();
  });

  it("shows a server error inline and stays open", async () => {
    vi.mocked(updateMemberProfile).mockRejectedValue(new ApiError(500, { code: "boom", message: "x" }));
    const { onClose } = setup(member());
    type("Email address", "r@example.com");
    click("Save");
    expect(await screen.findByText("We couldn’t save these details. Try again.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Exit asks to skip; Keep editing keeps typed values", () => {
    const { onClose } = setup(member());
    type("Email address", "r@example.com");
    click("Exit");
    expect(screen.getByRole("heading", { name: "Skip completing Ramesh Sharma’s profile?" })).toBeInTheDocument();
    click("Keep editing");
    expect(screen.getByLabelText("Email address")).toHaveValue("r@example.com");
    click("Exit");
    click("Skip for now");
    expect(onClose).toHaveBeenCalled();
  });

  it("reaching 100% shows the success state", async () => {
    vi.mocked(updateMemberProfile).mockResolvedValue(member({ profile_completion: 100, missing_fields: [] }));
    setup(member({ profile_completion: 80, missing_fields: ["email"] }));
    type("Email address", "r@example.com");
    click("Save");
    expect(await screen.findByText("Ramesh Sharma’s profile is complete")).toBeInTheDocument();
  });

  it("a save that leaves pan_conflict set shows the warning popup", async () => {
    vi.mocked(updateMemberProfile).mockResolvedValue(member({ pan_conflict: "other_account" }));
    const { onClose } = setup(member({ pan_conflict: "other_account" }));
    type("Phone number", "9800000002");
    click("Save");
    expect(await screen.findByRole("heading", { name: "Ramesh Sharma’s details are saved" })).toBeInTheDocument();
    expect(screen.getByText("Their profile can’t be completed here")).toBeInTheDocument();
    click("OK");
    expect(onClose).toHaveBeenCalled();
  });

  it("a duplicate PAN offers the merge and reports the target", async () => {
    vi.mocked(updateMemberProfile).mockRejectedValue(
      dupError({ other_member_id: "m-d", other_member_name: "Dad", source_fund_count: 2, source_pan_label: "PAN not on statement" }),
    );
    vi.mocked(mergeMemberInto).mockResolvedValue({ folios_moved: 2, transactions_dropped: 0 });
    const { onMerged } = setup(noPan());
    type("PAN", "abcps1234k");
    click("Save");
    expect(await screen.findByText("This PAN is already on Dad")).toBeInTheDocument();
    expect(updateMemberProfile).toHaveBeenCalledWith("m-r", { pan: "ABCPS1234K" });
    fireEvent.click(await screen.findByRole("button", { name: /merge/i }));
    await waitFor(() => expect(onMerged).toHaveBeenCalledWith("m-d"));
    expect(mergeMemberInto).toHaveBeenCalledWith("m-r", "m-d");
  });

  it("duplicate popup uses source_fund_count; Check the PAN returns with values kept", async () => {
    vi.mocked(updateMemberProfile).mockRejectedValue(dupError({ other_member_id: "m-1", other_member_name: "Dad", source_fund_count: 2 }));
    setup(noPan());
    type("PAN", "ABCDE1234F");
    click("Save");
    expect(
      await screen.findByText("Ramesh Sharma and Dad may be the same person. Merging moves Ramesh Sharma’s 2 funds into Dad and removes Ramesh Sharma from your family list."),
    ).toBeInTheDocument();
    click("Check the PAN");
    expect(await screen.findByLabelText("PAN")).toHaveValue("ABCDE1234F");
  });

  it("the duplicate popup tells two same-named people apart", async () => {
    vi.mocked(updateMemberProfile).mockRejectedValue(
      dupError({ other_member_id: "k1", other_member_name: "Kavita Shanbhag", source_fund_count: 1, source_pan_label: "BN******1M" }),
    );
    setup(noPan({ name: "Kavita Shanbhag" }));
    type("PAN", "BNZPK4321M");
    click("Save");
    expect(
      await screen.findByText("Kavita Shanbhag (BN******1M, 1 fund) and Kavita Shanbhag (already on your dashboard) may be the same person. Merging moves the 1 fund into the one on your dashboard and removes the duplicate."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Merge them" })).toBeInTheDocument();
  });

  it("a failed merge shows an error and does not report a merge", async () => {
    vi.mocked(updateMemberProfile).mockRejectedValue(dupError({ other_member_id: "m-d", other_member_name: "Dad", source_fund_count: 1 }));
    vi.mocked(mergeMemberInto).mockRejectedValue(new Error("nope"));
    const { onMerged } = setup(noPan());
    type("PAN", "ABCPS1234K");
    click("Save");
    fireEvent.click(await screen.findByRole("button", { name: /merge/i }));
    expect(await screen.findByText("We couldn’t save these details. Try again.")).toBeInTheDocument();
    expect(onMerged).not.toHaveBeenCalled();
  });

  it("cross_account_pan_blocked shows an inline error", async () => {
    vi.mocked(updateMemberProfile).mockRejectedValue(new ApiError(409, { code: "cross_account_pan_blocked", message: "x" }));
    setup(noPan());
    type("PAN", "ABCPS1234K");
    click("Save");
    expect(await screen.findByText("This PAN is already tracked under a different Unifolio account.")).toBeInTheDocument();
  });

  it("Self: phone and email are read-only with a link to Account Info", () => {
    const onChangeInAccountInfo = vi.fn();
    setup(member({ relationship: "self" }), { accountPhone: "+919800000001", accountEmail: null, onChangeInAccountInfo });
    expect(screen.getByLabelText("Phone number")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Phone number")).toHaveValue("+919800000001");
    expect(screen.queryByLabelText("Relationship")).not.toBeInTheDocument();
    click("Change in Account Info");
    expect(onChangeInAccountInfo).toHaveBeenCalledTimes(1);
  });

  it("Self without an Account Info callback shows no Change in Account Info link", () => {
    setup(member({ relationship: "self" }), { accountPhone: "+919800000001", accountEmail: null });
    expect(screen.queryByText("Change in Account Info")).toBeNull();
  });

  it("the PAN input is aria-required only when the member has no PAN", () => {
    setup(noPan());
    expect(screen.getByLabelText("PAN")).toHaveAttribute("aria-required", "true");
  });

  it("an editable conflict PAN is not aria-required", () => {
    setup(noPan({ pan_masked: "AB******4K", pan_conflict: "other_account" }));
    expect(screen.getByLabelText("PAN")).not.toHaveAttribute("aria-required");
  });

  it("the warning after a rename names the member by the saved name", async () => {
    vi.mocked(updateMemberProfile).mockResolvedValue(member({ name: "Ramesh K Sharma", pan_conflict: "other_account" }));
    setup(member({ pan_conflict: "other_account" }));
    type("Name", "Ramesh K Sharma");
    click("Save");
    expect(await screen.findByRole("heading", { name: "Ramesh K Sharma’s details are saved" })).toBeInTheDocument();
  });

  it("Self: Save sends only the name, never phone or email", async () => {
    vi.mocked(updateMemberProfile).mockResolvedValue(member({ relationship: "self", name: "Aditi S", profile_completion: 60 }));
    setup(member({ relationship: "self" }), { accountPhone: "+919800000001", accountEmail: "a@b.com" });
    type("Name", "Aditi S");
    click("Save");
    await waitFor(() => expect(updateMemberProfile).toHaveBeenCalledWith("m-r", { name: "Aditi S" }));
  });
});
