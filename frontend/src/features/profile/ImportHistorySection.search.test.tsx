import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportHistorySection } from "./ImportHistorySection";

const first = { import_id: "asha-import", household_member_id: "asha", member_name: "Asha",
  uploaded_at: "2026-11-03T10:30:00Z", statement_from_date: "2026-09-12", statement_to_date: "2026-10-20",
  status: "needs_review", new_transactions_count: 5, upload_group_id: "november-upload", group_people_count: 2 };
const imports = [first,
  { ...first, import_id: "bela-import", household_member_id: "bela", member_name: "Bela" },
  { ...first, import_id: "chitra-import", household_member_id: "chitra", member_name: "Chitra",
    uploaded_at: "2026-09-10T10:30:00Z", statement_from_date: "2025-04-01", statement_to_date: "2026-03-31",
    status: "import_successful", upload_group_id: "september-upload" },
  { ...first, import_id: "diya-import", household_member_id: "diya", member_name: "Diya",
    uploaded_at: "2026-09-10T10:30:00Z", statement_from_date: "2025-04-01", statement_to_date: "2026-03-31",
    status: "import_successful", upload_group_id: "september-upload" },
];
function mount(rows = imports) {
  const deleteImport = vi.fn().mockResolvedValue({ deleted_transactions_count: 5, removed_member_ids: [], deleted_file: false });
  const onChanged = vi.fn();
  const view = render(<ImportHistorySection loadImportHistory={vi.fn().mockResolvedValue(rows)}
    loadMembers={vi.fn().mockResolvedValue([])} deleteImport={deleteImport} onChanged={onChanged} />);
  return { ...view, deleteImport, onChanged };
}
const field = () => screen.getByRole("textbox", { name: "Search imports" });
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });
const names = () => screen.queryAllByRole("listitem").map(row => row.querySelector("span")?.textContent);

afterEach(cleanup);

describe("ImportHistorySection search", () => {
  it("the field appears only when there are imports", async () => {
    const empty = mount([]);
    expect(screen.queryByRole("textbox", { name: "Search imports" })).not.toBeInTheDocument();
    await screen.findByText("No imports yet.");
    expect(screen.queryByRole("textbox", { name: "Search imports" })).not.toBeInTheDocument();
    empty.unmount();
    mount();
    await screen.findByText("Bela");
    expect(field()).toHaveAttribute("placeholder", "Search imports");
    expect(screen.getByRole("heading", { name: "Import History" }).parentElement).toContainElement(field());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("typing filters the groups", async () => {
    mount();
    await screen.findByText("Bela");
    type("bela");
    expect(names()).toEqual(["Asha", "Bela"]);
    expect(screen.queryByText("Chitra")).not.toBeInTheDocument();
    expect(screen.queryByText("1 Apr 2025 – 31 Mar 2026")).not.toBeInTheDocument();
  });

  it('no match shows No imports match "x".', async () => {
    mount();
    await screen.findByText("Bela");
    type("x");
    expect(screen.getByText('No imports match "x".')).toBeInTheDocument();
    expect(names()).toEqual([]);
    expect(screen.queryByText("12 Sep 2026 – 20 Oct 2026")).not.toBeInTheDocument();
  });

  it("clearing the field restores every group", async () => {
    mount();
    await screen.findByText("Bela");
    type("bela");
    expect(names()).toEqual(["Asha", "Bela"]);
    type("");
    expect(names()).toEqual(["Asha", "Bela", "Chitra", "Diya"]);
    expect(screen.getByText("12 Sep 2026 – 20 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("1 Apr 2025 – 31 Mar 2026")).toBeInTheDocument();
  });

  it("deleting an import still works while a filter is on", async () => {
    const { deleteImport, onChanged } = mount();
    await screen.findByText("Bela");
    type("November");
    fireEvent.click(screen.getByRole("button", { name: "Delete Bela’s funds from the 3 Nov 2026 import" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this statement’s funds?" });
    expect(within(dialog).getByLabelText("Only Bela’s funds from this statement")).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteImport).toHaveBeenCalledExactlyOnceWith("bela-import", "person"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(field()).toHaveValue("November");
    expect(screen.getByRole("button", { name: "Delete import from 3 Nov 2026" })).toBeInTheDocument();
    expect(screen.queryByText("Chitra")).not.toBeInTheDocument();
    type("");
    expect(screen.getByText("Chitra")).toBeInTheDocument();
    expect(screen.getByText("Diya")).toBeInTheDocument();
  });

  it("with the field empty the section renders exactly as before", async () => {
    mount();
    await screen.findByText("Bela");
    expect(field()).toHaveValue("");
    expect(names()).toEqual(["Asha", "Bela", "Chitra", "Diya"]);
    expect(screen.getByText("12 Sep 2026 – 20 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("1 Apr 2025 – 31 Mar 2026")).toBeInTheDocument();
    expect(screen.getByText("Imported 3 Nov 2026 · needs review")).toBeInTheDocument();
    expect(screen.getByText("Imported 10 Sep 2026 · import successful")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual([
      "Delete Asha’s funds from the 3 Nov 2026 import", "Delete Bela’s funds from the 3 Nov 2026 import",
      "Delete Chitra’s funds from the 10 Sep 2026 import", "Delete Diya’s funds from the 10 Sep 2026 import",
    ]);
  });
});
