import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHouseholdImportHistory } from "@/features/import/api";
import type { HouseholdImportHistoryItem } from "@/features/import/types";
import { ImportDetailsDialog } from "./ImportDetailsDialog";

vi.mock("@/features/import/api", () => ({ getHouseholdImportHistory: vi.fn() }));

const item = (over: Partial<HouseholdImportHistoryItem> = {}): HouseholdImportHistoryItem => ({
  import_id: "i1", household_member_id: "m1", uploaded_at: "2026-11-06T08:00:00Z",
  statement_from_date: "2016-01-01", statement_to_date: "2026-10-05", status: "confirmed",
  new_transactions_count: 289, upload_group_id: null, member_name: "ROHAN VIJAY KULKARNI", group_people_count: 1, ...over,
});
const mount = (open = true, onClose = vi.fn()) => ({ onClose, ...render(<ImportDetailsDialog open={open} onClose={onClose} />) });

beforeEach(() => { vi.clearAllMocks(); });

describe("ImportDetailsDialog: the read-only import list shown over All set (QA fixes, B3)", () => {
  it("renders nothing while closed and loads nothing", () => {
    mount(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getHouseholdImportHistory).not.toHaveBeenCalled();
  });
  it("is a dialog titled Import details with a Back button, and loads the household's imports", async () => {
    vi.mocked(getHouseholdImportHistory).mockResolvedValue([item()]);
    mount();
    const dialog = screen.getByRole("dialog", { name: "Import details" });
    expect(within(dialog).getByRole("button", { name: /Back/ })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getAllByTestId("import-details-row")).toHaveLength(1));
    expect(getHouseholdImportHistory).toHaveBeenCalledTimes(1);
  });
  it("a row says what was imported, the statement period, the transaction count and that it is imported", async () => {
    vi.mocked(getHouseholdImportHistory).mockResolvedValue([item()]);
    mount();
    const row = await screen.findByTestId("import-details-row");
    expect(within(row).getByText("Mutual Funds · CAS statement")).toBeInTheDocument();
    expect(within(row).getByText("1 Jan 2016 – 5 Oct 2026")).toBeInTheDocument();
    expect(within(row).getByText("289 transactions · Imported")).toBeInTheDocument();
  });
  it("uses singular for one transaction, and a plain word for a status that is not finished", async () => {
    vi.mocked(getHouseholdImportHistory).mockResolvedValue([item({ new_transactions_count: 1 }), item({ import_id: "i2", status: "processing", new_transactions_count: null })]);
    mount();
    const rows = await screen.findAllByTestId("import-details-row");
    expect(within(rows[0]).getByText("1 transaction · Imported")).toBeInTheDocument();
    expect(within(rows[1]).getByText("0 transactions · Processing")).toBeInTheDocument();
  });
  it("one statement with several people is one row: counts add up and the people are named", async () => {
    vi.mocked(getHouseholdImportHistory).mockResolvedValue([
      item({ import_id: "a", upload_group_id: "g1", member_name: "SURESH IYER", new_transactions_count: 289, group_people_count: 2 }),
      item({ import_id: "b", upload_group_id: "g1", member_name: "LAKSHMI IYER", new_transactions_count: 159, group_people_count: 2 }),
    ]);
    mount();
    const rows = await screen.findAllByTestId("import-details-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("448 transactions · Imported")).toBeInTheDocument();
    expect(within(rows[0]).getByText("SURESH IYER, LAKSHMI IYER")).toBeInTheDocument();
  });
  it("says so when the statement period is not known", async () => {
    vi.mocked(getHouseholdImportHistory).mockResolvedValue([item({ statement_from_date: null, statement_to_date: null })]);
    mount();
    expect(await screen.findByText("Statement period unavailable")).toBeInTheDocument();
  });
  it("is read-only: there is no delete control anywhere", async () => {
    vi.mocked(getHouseholdImportHistory).mockResolvedValue([item()]);
    mount();
    await screen.findByTestId("import-details-row");
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });
  it("shows a loading line, then an empty line, or an error line", async () => {
    vi.mocked(getHouseholdImportHistory).mockResolvedValueOnce([]);
    const first = mount();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByText("No imports yet.")).toBeInTheDocument();
    first.unmount();
    vi.mocked(getHouseholdImportHistory).mockRejectedValueOnce(new Error("offline"));
    mount();
    expect(await screen.findByText("Could not load import details.")).toBeInTheDocument();
  });
  it("the Back button, the close cross and Escape all call onClose", async () => {
    vi.mocked(getHouseholdImportHistory).mockResolvedValue([item()]);
    const { onClose } = mount();
    await screen.findByTestId("import-details-row");
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
