import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HouseholdMembersSection } from "./HouseholdMembersSection";
import type { HouseholdImportHistoryItem } from "../import/types";
import type { HouseholdMember } from "../auth/types";

const member = (id: string, name: string, relationship: HouseholdMember["relationship"]): HouseholdMember => ({
  id, name, relationship, relationship_other_label: null, origin: "cas", lock_reason: null, details_required: false, pan_masked: null,
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
});
