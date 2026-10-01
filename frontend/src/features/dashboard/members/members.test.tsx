import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/apiClient";
import * as authApi from "../../auth/api";
import type { HouseholdMember } from "../../auth/types";
import { EditMemberDialog } from "./EditMemberDialog";
import { MemberDetailsDialog } from "./MemberDetailsDialog";
import { OtherAccountDialog } from "./OtherAccountDialog";

vi.mock("../../auth/api", () => ({
  completeMemberDetails: vi.fn(),
  mergeMemberInto: vi.fn(),
  updateMember: vi.fn(),
}));

const locked: HouseholdMember = {
  id: "m-2",
  name: "Ramesh Sharma",
  relationship: null,
  relationship_other_label: null,
  origin: "cas_detected",
  lock_reason: "details_needed",
  details_required: true,
  pan_masked: "BX******8L",
  phone_number: null,
  email: null,
  pan_on_statement: true,
  name_from_statement: true,
};

// A CAS person whose statement carried no PAN: the unlock popup asks for it.
const noPan: HouseholdMember = { ...locked, name: "Meera Rao", pan_masked: null, pan_on_statement: false };

function apiError(status: number, code: string, message = "x", details?: Record<string, unknown>) {
  return new ApiError(status, { code, message, ...(details ? { details } : {}) });
}

function setup(member: HouseholdMember = noPan) {
  const onUnlocked = vi.fn();
  const onCancel = vi.fn();
  render(<MemberDetailsDialog member={member} onUnlocked={onUnlocked} onCancel={onCancel} />);
  return { onUnlocked, onCancel };
}

function fill(rel: string, pan: string) {
  fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: rel } });
  fireEvent.change(screen.getByLabelText("PAN"), { target: { value: pan } });
}

const cont = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));

describe("MemberDetailsDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the title and the label field only for Other", () => {
    setup();
    expect(screen.getByText("Add Meera Rao’s details")).toBeInTheDocument();
    expect(screen.queryByLabelText("How are you related?")).toBeNull();
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "other" } });
    expect(screen.getByLabelText("How are you related?")).toBeInTheDocument();
  });

  it("L1: missing fields", () => {
    setup();
    cont();
    expect(screen.getByText("Choose a relationship.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "other" } });
    cont();
    expect(screen.getByText("Type how you’re related.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("How are you related?"), { target: { value: "Cousin" } });
    expect(screen.queryByText("Type how you’re related.")).toBeNull();
    cont();
    expect(screen.getByText("Enter Meera Rao’s PAN.")).toBeInTheDocument();
    expect(authApi.completeMemberDetails).not.toHaveBeenCalled();
  });

  it("L2: bad PAN format", () => {
    setup();
    fill("spouse", "ABC");
    cont();
    expect(screen.getByText("Enter a valid PAN: 5 letters, 4 digits, then 1 letter.")).toBeInTheDocument();
  });

  it("normalises the PAN and unlocks on success", async () => {
    vi.mocked(authApi.completeMemberDetails).mockResolvedValue({ ...noPan, relationship: "spouse", lock_reason: null });
    const { onUnlocked } = setup();
    fill("spouse", "bxqps 5678l");
    cont();
    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(authApi.completeMemberDetails).toHaveBeenCalledWith("m-2", {
      relationship: "spouse",
      relationship_other_label: null,
      pan: "BXQPS5678L",
    });
  });

  it("unlock with a statement PAN shows name and PAN read-only and a relationship dropdown only", async () => {
    vi.mocked(authApi.completeMemberDetails).mockResolvedValue({ ...locked, relationship: "parent", lock_reason: null });
    const { onUnlocked } = setup(locked);
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "PAN" })).toBeNull();
    expect(screen.getAllByText("Ramesh Sharma").length).toBeGreaterThan(0);
    expect(screen.getByText("BX******8L")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "parent" } });
    cont();
    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(authApi.completeMemberDetails).toHaveBeenCalledWith("m-2", { relationship: "parent", relationship_other_label: null });
    expect(vi.mocked(authApi.completeMemberDetails).mock.calls[0][1]).not.toHaveProperty("pan");
  });

  it("unlock without a statement PAN shows a PAN field", async () => {
    vi.mocked(authApi.completeMemberDetails).mockResolvedValue({ ...noPan, relationship: "spouse", lock_reason: null });
    setup();
    expect(screen.getByRole("textbox", { name: "PAN" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "spouse" } });
    cont();
    expect(screen.getByText("Enter Meera Rao’s PAN.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("PAN"), { target: { value: "abcde1234f" } });
    cont();
    await waitFor(() => expect(authApi.completeMemberDetails).toHaveBeenCalled());
    expect(authApi.completeMemberDetails).toHaveBeenCalledWith("m-2", {
      relationship: "spouse", relationship_other_label: null, pan: "ABCDE1234F",
    });
  });

  it("field_not_editable shows the server message", async () => {
    vi.mocked(authApi.completeMemberDetails).mockRejectedValue(
      apiError(422, "field_not_editable", "Edit this person from Profile → Family Members."),
    );
    setup(locked);
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "parent" } });
    cont();
    expect(await screen.findByText("Edit this person from Profile → Family Members.")).toBeInTheDocument();
  });

  it("L7: generic failure", async () => {
    vi.mocked(authApi.completeMemberDetails).mockRejectedValue(new Error("network"));
    setup();
    fill("spouse", "ABCDE1234F");
    cont();
    expect(await screen.findByText("We couldn’t save these details. Try again.")).toBeInTheDocument();
  });

  it("L4: duplicate popup uses source_fund_count, Check the PAN returns with values kept", async () => {
    vi.mocked(authApi.completeMemberDetails).mockRejectedValue(
      apiError(409, "pan_belongs_to_other_member", "m", {
        other_member_id: "m-1", other_member_name: "Dad", can_merge: true, source_fund_count: 2,
      }),
    );
    setup();
    fill("spouse", "ABCDE1234F");
    cont();
    expect(await screen.findByText("This PAN is already on Dad")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Meera Rao and Dad may be the same person. Merging moves Meera Rao’s 2 funds into Dad and removes Meera Rao from your family list.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check the PAN" }));
    expect(await screen.findByLabelText("PAN")).toHaveValue("ABCDE1234F");
  });

  it("L4: the duplicate popup tells two same-named people apart (staging-QA 5C)", async () => {
    vi.mocked(authApi.completeMemberDetails).mockRejectedValueOnce(
      apiError(409, "pan_belongs_to_other_member", "m", {
        other_member_id: "k1", other_member_name: "Kavita Shanbhag", can_merge: true,
        source_fund_count: 1, source_pan_label: "BN******1M",
      }),
    );
    render(
      <MemberDetailsDialog member={{ ...noPan, name: "Kavita Shanbhag" }} onUnlocked={vi.fn()} onCancel={vi.fn()} />,
    );
    fill("parent", "BNZPK4321M");
    cont();
    expect(
      await screen.findByText(
        "Kavita Shanbhag (BN******1M, 1 fund) and Kavita Shanbhag (already on your dashboard) may be the same person. Merging moves the 1 fund into the one on your dashboard and removes the duplicate.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Merge them" })).toBeInTheDocument();
  });

  it("L4: Merge into Dad calls mergeMemberInto and reports the target", async () => {
    vi.mocked(authApi.completeMemberDetails).mockRejectedValue(
      apiError(409, "pan_belongs_to_other_member", "m", {
        other_member_id: "m-1", other_member_name: "Dad", can_merge: true, source_fund_count: 1,
      }),
    );
    vi.mocked(authApi.mergeMemberInto).mockResolvedValue({ folios_moved: 1, transactions_dropped: 0 });
    const { onUnlocked } = setup();
    fill("spouse", "ABCDE1234F");
    cont();
    fireEvent.click(await screen.findByRole("button", { name: "Merge into Dad" }));
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledWith({ id: "m-1", name: "Dad" }));
    expect(authApi.mergeMemberInto).toHaveBeenCalledWith("m-2", "m-1");
  });

  it("L5: cross-account PAN shows the own-account popup", async () => {
    vi.mocked(authApi.completeMemberDetails).mockRejectedValue(apiError(409, "cross_account_pan_blocked"));
    const { onCancel } = setup();
    fill("spouse", "ABCDE1234F");
    cont();
    expect(await screen.findByText("Meera Rao has their own Unifolio account")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("L6: Cancel asks to confirm; Enter details restores typed values; Back to dashboard leaves", () => {
    const { onCancel } = setup();
    fill("other", "ABCDE1234F");
    fireEvent.change(screen.getByLabelText("How are you related?"), { target: { value: "Cousin" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Skip adding Meera Rao’s details?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You can’t open Meera Rao’s dashboard until these details are added. You can add them any time by picking Meera Rao from the member list.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enter details" }));
    expect(screen.getByLabelText("PAN")).toHaveValue("ABCDE1234F");
    expect(screen.getByLabelText("How are you related?")).toHaveValue("Cousin");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("OtherAccountDialog L8", () => {
  it("uses they/their copy", () => {
    render(<OtherAccountDialog isOpen memberName="Kiran Sharma" variant="picked" onOk={vi.fn()} />);
    expect(screen.getByText("Kiran Sharma has their own Unifolio account")).toBeInTheDocument();
    expect(
      screen.getByText("Their funds are included in your family total. Their own dashboard stays with their account."),
    ).toBeInTheDocument();
  });
});

describe("EditMemberDialog L9", () => {
  const unlocked: HouseholdMember = {
    ...locked, relationship: "spouse", lock_reason: null, details_required: false,
    phone_number: "+919876543210", email: "r@example.com",
  };

  it("edit dialog changes relationship, phone and email through updateMember", async () => {
    vi.mocked(authApi.updateMember).mockResolvedValue({ ...unlocked, relationship: "parent", phone_number: "+919812345678", email: "new@example.com" });
    const onSaved = vi.fn();
    render(<EditMemberDialog member={unlocked} onSaved={onSaved} onCancel={vi.fn()} />);
    expect(screen.getByText("Edit Ramesh Sharma’s details")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "PAN" })).toBeNull();
    expect(screen.getByText("BX******8L")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toHaveValue("+919876543210");
    expect(screen.getByLabelText("Email")).toHaveValue("r@example.com");
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "parent" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+919812345678" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(authApi.updateMember).toHaveBeenCalledWith("m-2", {
      relationship: "parent", relationship_other_label: null,
      phone_number: "+919812345678", email: "new@example.com",
    });
  });

  it("shows a 422 message inline and stays open", async () => {
    vi.mocked(authApi.updateMember).mockRejectedValue(apiError(422, "invalid_phone", "Enter a valid phone number."));
    const onSaved = vi.fn();
    render(<EditMemberDialog member={unlocked} onSaved={onSaved} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a valid phone number.")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
