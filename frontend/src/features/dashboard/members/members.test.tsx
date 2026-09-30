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
};

function apiError(status: number, code: string, message = "x", details?: Record<string, unknown>) {
  return new ApiError(status, { code, message, ...(details ? { details } : {}) });
}

function setup() {
  const onUnlocked = vi.fn();
  const onCancel = vi.fn();
  render(<MemberDetailsDialog member={locked} onUnlocked={onUnlocked} onCancel={onCancel} />);
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
    expect(screen.getByText("Add Ramesh Sharma’s details")).toBeInTheDocument();
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
    expect(screen.getByText("Enter Ramesh Sharma’s PAN.")).toBeInTheDocument();
    expect(authApi.completeMemberDetails).not.toHaveBeenCalled();
  });

  it("L2: bad PAN format", () => {
    setup();
    fill("spouse", "ABC");
    cont();
    expect(screen.getByText("Enter a valid PAN: 5 letters, 4 digits, then 1 letter.")).toBeInTheDocument();
  });

  it("normalises the PAN and unlocks on success", async () => {
    vi.mocked(authApi.completeMemberDetails).mockResolvedValue({ ...locked, relationship: "spouse", lock_reason: null });
    const { onUnlocked } = setup();
    fill("spouse", "bxqps 5678l");
    cont();
    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(authApi.completeMemberDetails).toHaveBeenCalledWith("m-2", {
      name: "Ramesh Sharma",
      relationship: "spouse",
      relationship_other_label: null,
      pan: "BXQPS5678L",
    });
  });

  // Staging-QA decision 4 (2026-09-30): L3 is a popup, modelled on U4.
  const mismatch = () => apiError(409, "detected_pan_mismatch", "m", { detected_pan_masked: "BX******8L" });

  it("L3: a mismatched PAN opens the popup with both PANs masked, no inline error", async () => {
    vi.mocked(authApi.completeMemberDetails).mockRejectedValueOnce(mismatch());
    setup();
    fill("spouse", "LCWPK3816R");
    cont();
    expect(await screen.findByText("This PAN doesn’t match your statement")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You entered LC******6R for Ramesh Sharma. The statement you uploaded shows BX******8L. Which one is correct?",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Check the PAN and try again/)).toBeNull();
  });

  it("L3: 'The one on the statement' resubmits with use_detected_pan and no typed PAN", async () => {
    vi.mocked(authApi.completeMemberDetails)
      .mockRejectedValueOnce(mismatch())
      .mockResolvedValueOnce({ ...locked, relationship: "spouse", lock_reason: null, details_required: false });
    const { onUnlocked } = setup();
    fill("spouse", "LCWPK3816R");
    cont();
    fireEvent.click(await screen.findByRole("button", { name: "The one on the statement (BX******8L)" }));
    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    const second = vi.mocked(authApi.completeMemberDetails).mock.calls[1][1];
    expect(second).toEqual(expect.objectContaining({ relationship: "spouse", use_detected_pan: true }));
    expect(second).not.toHaveProperty("pan");
  });

  it("L3: 'The one I entered' saves nothing and asks for a different statement", async () => {
    vi.mocked(authApi.completeMemberDetails).mockRejectedValueOnce(mismatch());
    const onUploadDifferent = vi.fn();
    render(
      <MemberDetailsDialog member={locked} onUnlocked={vi.fn()} onCancel={vi.fn()} onUploadDifferent={onUploadDifferent} />,
    );
    fill("spouse", "LCWPK3816R");
    cont();
    fireEvent.click(await screen.findByRole("button", { name: /The one I entered \(LC\*\*\*\*\*\*6R\)/ }));
    expect(onUploadDifferent).toHaveBeenCalledTimes(1);
    expect(authApi.completeMemberDetails).toHaveBeenCalledTimes(1);
  });

  it("L3: closing the popup returns to the form with the PAN still typed", async () => {
    vi.mocked(authApi.completeMemberDetails).mockRejectedValueOnce(mismatch());
    setup();
    fill("spouse", "LCWPK3816R");
    cont();
    await screen.findByText("This PAN doesn’t match your statement");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByDisplayValue("LCWPK3816R")).toBeInTheDocument();
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
        "Ramesh Sharma and Dad may be the same person. Merging moves Ramesh Sharma’s 2 funds into Dad and removes Ramesh Sharma from your family list.",
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
      <MemberDetailsDialog member={{ ...locked, name: "Kavita Shanbhag" }} onUnlocked={vi.fn()} onCancel={vi.fn()} />,
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
    expect(await screen.findByText("Ramesh Sharma has their own Unifolio account")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("L6: Cancel asks to confirm; Enter details restores typed values; Back to dashboard leaves", () => {
    const { onCancel } = setup();
    fill("other", "ABCDE1234F");
    fireEvent.change(screen.getByLabelText("How are you related?"), { target: { value: "Cousin" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Skip adding Ramesh Sharma’s details?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You can’t open Ramesh Sharma’s dashboard until these details are added. You can add them any time by picking Ramesh Sharma from the member list.",
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
  it("shows the cross-account error inline and stays open", async () => {
    vi.mocked(authApi.completeMemberDetails).mockRejectedValue(apiError(409, "cross_account_pan_blocked"));
    const onSaved = vi.fn();
    const unlocked = { ...locked, relationship: "spouse" as const, lock_reason: null, details_required: false };
    render(<EditMemberDialog member={unlocked} onSaved={onSaved} onCancel={vi.fn()} />);
    expect(screen.getByText("Edit Ramesh Sharma’s details")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("PAN"), { target: { value: "ABCDE1234F" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("This PAN is already on another Unifolio account. Ramesh Sharma’s PAN hasn’t changed."),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
