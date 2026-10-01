import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HouseholdMembersSection } from "./HouseholdMembersSection";
import type { HouseholdImportHistoryItem } from "../import/types";
import type { HouseholdMember } from "../auth/types";

const member = (id: string, name: string, relationship: HouseholdMember["relationship"]): HouseholdMember => ({
  id, name, relationship, relationship_other_label: null, origin: "cas", pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: 100, missing_fields: [], removed_with_last_import: false,
});

const history = (id: string, memberId: string, group: string): HouseholdImportHistoryItem => ({
  import_id: id, household_member_id: memberId, uploaded_at: "2026-09-10T10:30:00Z", statement_from_date: null,
  statement_to_date: null, status: "import_successful", new_transactions_count: 1, upload_group_id: group,
  member_name: "x", group_people_count: 1,
});

const MEMBERS = [member("m1", "Aditi Sharma", "self"), member("m2", "Ramesh Sharma", "parent")];
// Ramesh appears in two statements (g1, g2); a second row for g1 must not double count.
const HISTORY = [history("i1", "m2", "g1"), history("i2", "m2", "g2"), history("i3", "m1", "g1")];

describe("HouseholdMembersSection", () => {
  it("lists members with a Delete all funds action", async () => {
    render(<HouseholdMembersSection loadMembers={vi.fn().mockResolvedValue(MEMBERS)} loadImportHistory={vi.fn().mockResolvedValue(HISTORY)} />);
    expect(await screen.findByText("Ramesh Sharma")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Delete all funds/ })).toHaveLength(2);
  });

  it("D2 shows the statement count and sends removeMember only when ticked", async () => {
    const deletePortfolio = vi.fn().mockResolvedValue({ deleted_transactions_count: 2, removed_member_ids: ["m2"], deleted_file: true });
    const onChanged = vi.fn();
    render(
      <HouseholdMembersSection
        loadMembers={vi.fn().mockResolvedValue(MEMBERS)}
        loadImportHistory={vi.fn().mockResolvedValue(HISTORY)}
        deletePortfolio={deletePortfolio}
        onChanged={onChanged}
      />,
    );
    await screen.findByText("Ramesh Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Delete all funds for Ramesh Sharma" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete all of Ramesh Sharma’s funds?" });
    expect(within(dialog).getByText("This removes their funds from all 2 statements. Other people’s funds stay.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText("Also remove Ramesh Sharma from my family"));
    expect(within(dialog).getByText("If you remove them and later upload a statement with Ramesh Sharma again, you’ll need to add their details again.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deletePortfolio).toHaveBeenCalledWith("m2", true));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("D2 without the checkbox keeps the member; Keep does nothing", async () => {
    const deletePortfolio = vi.fn().mockResolvedValue({ deleted_transactions_count: 2, removed_member_ids: [], deleted_file: false });
    render(
      <HouseholdMembersSection loadMembers={vi.fn().mockResolvedValue(MEMBERS)} loadImportHistory={vi.fn().mockResolvedValue(HISTORY)} deletePortfolio={deletePortfolio} />,
    );
    await screen.findByText("Ramesh Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Delete all funds for Ramesh Sharma" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deletePortfolio).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete all funds for Ramesh Sharma" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deletePortfolio).toHaveBeenCalledWith("m2", false));
  });

  it("does not offer to remove Me from the family", async () => {
    render(<HouseholdMembersSection loadMembers={vi.fn().mockResolvedValue(MEMBERS)} loadImportHistory={vi.fn().mockResolvedValue(HISTORY)} />);
    await screen.findByText("Aditi Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Delete all funds for Aditi Sharma" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText(/Also remove/)).not.toBeInTheDocument();
  });

  it("disables deletion and says so when the statements could not be loaded", async () => {
    render(<HouseholdMembersSection loadMembers={vi.fn().mockResolvedValue(MEMBERS)} loadImportHistory={vi.fn().mockRejectedValue(new Error("x"))} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load your statements/i);
    expect(screen.getByRole("button", { name: "Delete all funds for Ramesh Sharma" })).toBeDisabled();
  });

  it("each card shows its profile % and opens Complete profile", async () => {
    const ramesh: HouseholdMember = {
      ...member("m2", "Ramesh Sharma", "parent"), pan_masked: "AB******8L", name_from_statement: true,
      phone_number: "+919811111111", email: "r@example.com", profile_completion: 80, missing_fields: ["phone_number"],
    };
    render(<HouseholdMembersSection loadMembers={vi.fn().mockResolvedValue([member("m1", "Aditi Sharma", "self"), ramesh])} loadImportHistory={vi.fn().mockResolvedValue([])} />);
    const card = await screen.findByRole("article", { name: "Ramesh Sharma" });
    expect(within(card).getByText("AB******8L")).toBeInTheDocument();
    expect(within(card).getByText("from your statement")).toBeInTheDocument();
    expect(within(card).getByText("Parent")).toBeInTheDocument();
    expect(within(card).getByText(/80%/)).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: /80%/ }));
    expect(await screen.findByRole("dialog", { name: "Complete Ramesh Sharma’s profile" })).toBeInTheDocument();
  });

  it("a complete card shows Edit profile, which opens the same dialog", async () => {
    render(<HouseholdMembersSection loadMembers={vi.fn().mockResolvedValue(MEMBERS)} loadImportHistory={vi.fn().mockResolvedValue([])} />);
    const card = await screen.findByRole("article", { name: "Ramesh Sharma" });
    expect(within(card).queryByText(/% complete/)).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Edit profile" }));
    expect(await screen.findByRole("dialog", { name: "Complete Ramesh Sharma’s profile" })).toBeInTheDocument();
  });

  it("relationship shows for every member, including detected ones once chosen", async () => {
    const detected: HouseholdMember = { ...member("m3", "Detected Person", "parent"), origin: "cas_detected" };
    const unset: HouseholdMember = { ...member("m4", "Unset Person", "parent"), relationship: null, origin: "cas_detected" };
    render(<HouseholdMembersSection loadMembers={vi.fn().mockResolvedValue([detected, unset])} loadImportHistory={vi.fn().mockResolvedValue([])} />);
    const card = await screen.findByRole("article", { name: "Detected Person" });
    expect(within(card).getByText("Parent")).toBeInTheDocument();
    expect(within(await screen.findByRole("article", { name: "Unset Person" })).getByText("Not set")).toBeInTheDocument();
  });

  it("shows Not on your statement for no PAN and a caption for a PAN on another account", async () => {
    const other: HouseholdMember = { ...member("m3", "Other Person", "parent"), pan_conflict: "other_account" };
    render(<HouseholdMembersSection loadMembers={vi.fn().mockResolvedValue([other])} loadImportHistory={vi.fn().mockResolvedValue([])} />);
    const card = await screen.findByRole("article", { name: "Other Person" });
    expect(within(card).getByText("Not on your statement")).toBeInTheDocument();
    expect(within(card).getByText("On another Unifolio account")).toBeInTheDocument();
  });

  it("Self card shows account phone and email and its own %", async () => {
    const self: HouseholdMember = { ...member("m1", "Aditi Sharma", "self"), profile_completion: 60, missing_fields: ["pan", "email"] };
    render(
      <HouseholdMembersSection
        loadMembers={vi.fn().mockResolvedValue([self])}
        loadImportHistory={vi.fn().mockResolvedValue([])}
        accountPhone="+919999999999"
        accountEmail="aditi@example.com"
      />,
    );
    const card = await screen.findByRole("article", { name: "Aditi Sharma" });
    expect(within(card).getByText("+919999999999")).toBeInTheDocument();
    expect(within(card).getByText("aditi@example.com")).toBeInTheDocument();
    expect(within(card).getByText(/60%/)).toBeInTheDocument();
    // No callback, nowhere to go: the link isn't shown (final review I-3).
    expect(within(card).queryByRole("button", { name: "Change in Account Info" })).toBeNull();
  });

  it("Change in Account Info calls the callback from the card and from the dialog", async () => {
    const onChangeInAccountInfo = vi.fn();
    render(
      <HouseholdMembersSection
        loadMembers={vi.fn().mockResolvedValue(MEMBERS)}
        loadImportHistory={vi.fn().mockResolvedValue([])}
        onChangeInAccountInfo={onChangeInAccountInfo}
      />,
    );
    const card = await screen.findByRole("article", { name: "Aditi Sharma" });
    fireEvent.click(within(card).getByRole("button", { name: "Change in Account Info" }));
    expect(onChangeInAccountInfo).toHaveBeenCalledTimes(1);
    fireEvent.click(within(card).getByRole("button", { name: "Edit profile" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("Change in Account Info"));
    expect(onChangeInAccountInfo).toHaveBeenCalledTimes(2);
  });
});
