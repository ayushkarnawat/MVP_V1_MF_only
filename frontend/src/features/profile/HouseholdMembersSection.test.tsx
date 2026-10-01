import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as authApi from "../auth/api";
import { HouseholdMembersSection } from "./HouseholdMembersSection";
import type { HouseholdImportHistoryItem } from "../import/types";
import type { HouseholdMember } from "../auth/types";

const member = (id: string, name: string, relationship: HouseholdMember["relationship"]): HouseholdMember => ({
  id, name, relationship, relationship_other_label: null, origin: "cas", lock_reason: null, details_required: false, pan_masked: null, phone_number: null, email: null, pan_on_statement: false, name_from_statement: false,
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

  it("member card shows name and PAN read-only and edits relationship/phone/email", async () => {
    const ramesh: HouseholdMember = {
      ...member("m2", "Ramesh Sharma", "parent"), pan_masked: "AB******8L", name_from_statement: true, phone_number: "+919811111111", email: "r@example.com",
    };
    const updateMember = vi.spyOn(authApi, "updateMember").mockResolvedValue({ ...ramesh, phone_number: "+919822222222" });
    const onChanged = vi.fn();
    render(<HouseholdMembersSection loadMembers={vi.fn().mockResolvedValue([member("m1", "Aditi Sharma", "self"), ramesh])} loadImportHistory={vi.fn().mockResolvedValue([])} onChanged={onChanged} />);
    const card = await screen.findByRole("article", { name: "Ramesh Sharma" });
    expect(within(card).getByText("AB******8L")).toBeInTheDocument();
    expect(within(card).getByText("from your statement")).toBeInTheDocument();
    expect(within(card).getByText("Parent")).toBeInTheDocument();
    expect(within(card).getByText("+919811111111")).toBeInTheDocument();
    expect(within(card).getByText("r@example.com")).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "Edit Ramesh Sharma" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByDisplayValue("+919811111111"), { target: { value: "+919822222222" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateMember).toHaveBeenCalledWith("m2", expect.objectContaining({ relationship: "parent", phone_number: "+919822222222", email: "r@example.com" })));
    expect(await screen.findByText("+919822222222")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("an unnamed PAN reads Not on your statement and locked members offer Complete details", async () => {
    const locked: HouseholdMember = { ...member("m3", "Locked Person", "parent"), relationship: null, lock_reason: "details_needed", details_required: true };
    render(<HouseholdMembersSection loadMembers={vi.fn().mockResolvedValue([locked])} loadImportHistory={vi.fn().mockResolvedValue([])} />);
    const card = await screen.findByRole("article", { name: "Locked Person" });
    expect(within(card).getByText("Not on your statement")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Complete details" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("self card shows account contact read-only", async () => {
    render(
      <HouseholdMembersSection
        loadMembers={vi.fn().mockResolvedValue(MEMBERS)}
        loadImportHistory={vi.fn().mockResolvedValue([])}
        accountPhone="+919999999999"
        accountEmail="aditi@example.com"
      />,
    );
    const card = await screen.findByRole("article", { name: "Aditi Sharma" });
    expect(within(card).getByText("+919999999999")).toBeInTheDocument();
    expect(within(card).getByText("aditi@example.com")).toBeInTheDocument();
    expect(within(card).getByText("Change in Account Info")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
  });
});
