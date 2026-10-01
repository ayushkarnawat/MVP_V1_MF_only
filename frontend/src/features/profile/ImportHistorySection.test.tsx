import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportHistorySection } from "./ImportHistorySection";
import type { HouseholdImportHistoryItem } from "../import/types";
import type { HouseholdMember } from "../auth/types";

function row(over: Partial<HouseholdImportHistoryItem>): HouseholdImportHistoryItem {
  return {
    import_id: "i1", household_member_id: "m1", uploaded_at: "2026-09-10T10:30:00Z",
    statement_from_date: "2025-04-01", statement_to_date: "2026-03-31", status: "import_successful",
    new_transactions_count: 5, upload_group_id: "g1", member_name: "Aditi Sharma", group_people_count: 2, ...over,
  };
}

const member = (id: string, name: string, locked: boolean): HouseholdMember => ({
  id, name, relationship: locked ? null : "self", relationship_other_label: null, origin: "cas",
  pan_masked: null, phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false, profile_completion: locked ? 40 : 100, missing_fields: locked ? ["relationship"] : [], removed_with_last_import: locked,
});

const FAMILY = [
  row({ import_id: "i1", household_member_id: "m1", member_name: "Aditi Sharma" }),
  row({ import_id: "i2", household_member_id: "m2", member_name: "Ramesh Sharma" }),
];

describe("ImportHistorySection", () => {
  it("groups the flat list into one entry per statement with a row per person", async () => {
    render(<ImportHistorySection loadImportHistory={vi.fn().mockResolvedValue(FAMILY)} />);
    expect(await screen.findAllByText("1 Apr 2025 – 31 Mar 2026")).toHaveLength(1);
    expect(screen.getByText("Aditi Sharma")).toBeInTheDocument();
    expect(screen.getByText("Ramesh Sharma")).toBeInTheDocument();
  });

  it("D1: deleting one person offers only-them or everyone, and sends the chosen scope", async () => {
    const deleteImport = vi.fn().mockResolvedValue({ deleted_transactions_count: 5, removed_member_ids: [], deleted_file: false });
    render(
      <ImportHistorySection
        loadImportHistory={vi.fn().mockResolvedValue(FAMILY)}
        loadMembers={vi.fn().mockResolvedValue([member("m1", "Aditi Sharma", false), member("m2", "Ramesh Sharma", true)])}
        deleteImport={deleteImport}
      />,
    );
    await screen.findByText("Ramesh Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Delete Ramesh Sharma’s funds from the 10 Sep 2026 import" }));

    const dialog = await screen.findByRole("dialog", { name: "Delete this statement’s funds?" });
    expect(within(dialog).getByLabelText("Only Ramesh Sharma’s funds from this statement")).toBeChecked();
    expect(within(dialog).getByLabelText("Everyone in this statement (2 people)")).not.toBeChecked();
    // removed_with_last_import is set and Ramesh has no other statement, so he goes with it.
    expect(within(dialog).getByText("Ramesh Sharma has no other data and will be removed from your family.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByLabelText("Everyone in this statement (2 people)"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteImport).toHaveBeenCalledWith("i2", "group"));
    expect(await screen.findByText("No imports yet.")).toBeInTheDocument();
  });

  it("removal names come from removed_with_last_import", async () => {
    const run = async (flag: boolean) => {
      const { unmount } = render(
        <ImportHistorySection
          loadImportHistory={vi.fn().mockResolvedValue(FAMILY)}
          loadMembers={vi.fn().mockResolvedValue([member("m1", "Aditi Sharma", false), { ...member("m2", "Ramesh Sharma", true), removed_with_last_import: flag }])}
        />,
      );
      await screen.findByText("Ramesh Sharma");
      fireEvent.click(screen.getByRole("button", { name: "Delete Ramesh Sharma’s funds from the 10 Sep 2026 import" }));
      const dialog = await screen.findByRole("dialog", { name: "Delete this statement’s funds?" });
      const present = within(dialog).queryByText("Ramesh Sharma has no other data and will be removed from your family.") !== null;
      unmount();
      return present;
    };
    expect(await run(true)).toBe(true);
    expect(await run(false)).toBe(false);
  });

  it("D1: Only-this-person sends person scope and leaves the others listed", async () => {
    const deleteImport = vi.fn().mockResolvedValue({ deleted_transactions_count: 5, removed_member_ids: [], deleted_file: false });
    render(<ImportHistorySection loadImportHistory={vi.fn().mockResolvedValue(FAMILY)} deleteImport={deleteImport} />);
    await screen.findByText("Ramesh Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Delete Ramesh Sharma’s funds from the 10 Sep 2026 import" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteImport).toHaveBeenCalledWith("i2", "person"));
    await waitFor(() => expect(screen.queryByText("Ramesh Sharma")).not.toBeInTheDocument());
    // Aditi's row remains; with nobody else in the statement it collapses to the plain delete.
    expect(screen.getByRole("button", { name: "Delete import from 10 Sep 2026" })).toBeInTheDocument();
  });

  it("D1: Keep closes the dialog without deleting", async () => {
    const deleteImport = vi.fn();
    render(<ImportHistorySection loadImportHistory={vi.fn().mockResolvedValue(FAMILY)} deleteImport={deleteImport} />);
    await screen.findByText("Ramesh Sharma");
    fireEvent.click(screen.getByRole("button", { name: "Delete Aditi Sharma’s funds from the 10 Sep 2026 import" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleteImport).not.toHaveBeenCalled();
  });

  it("a one-person statement keeps the simple delete confirmation", async () => {
    const deleteImport = vi.fn().mockResolvedValue({ deleted_transactions_count: 5, removed_member_ids: [], deleted_file: true });
    render(
      <ImportHistorySection
        loadImportHistory={vi.fn().mockResolvedValue([row({ group_people_count: 1, upload_group_id: null })])}
        deleteImport={deleteImport}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Delete import from 10 Sep 2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete import" }));
    await waitFor(() => expect(deleteImport).toHaveBeenCalledWith("i1", "person"));
  });

  it("rows don’t show transaction counts", async () => {
    render(<ImportHistorySection loadImportHistory={vi.fn().mockResolvedValue(FAMILY)} />);
    await screen.findByText("Ramesh Sharma");
    expect(screen.queryByText(/txns|transactions/)).toBeNull();
    cleanup();
    render(<ImportHistorySection loadImportHistory={vi.fn().mockResolvedValue([row({ group_people_count: 1, upload_group_id: null })])} />);
    await screen.findByText("1 Apr 2025 – 31 Mar 2026");
    expect(screen.queryByText(/txns|transactions/)).toBeNull();
  });

  it("delete confirmation still mentions transactions", async () => {
    render(<ImportHistorySection loadImportHistory={vi.fn().mockResolvedValue([row({ group_people_count: 1, upload_group_id: null })])} />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete import from 10 Sep 2026" }));
    expect(screen.getByText("This removes 5 transactions tied to this import from your holdings.")).toBeInTheDocument();
  });
});
