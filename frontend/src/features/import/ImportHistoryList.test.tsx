import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { ImportHistoryList } from "./ImportHistoryList";
import * as api from "./api";

describe("ImportHistoryList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and renders import history items", async () => {
    vi.spyOn(api, "getMemberImportHistory").mockResolvedValue([
      {
        import_id: "imp-1",
        household_member_id: "m-1",
        status: "import_successful",
        error_code: null,
        error_message: null,
        new_transactions_count: 25,
        duplicate_transactions_count: 4,
        statement_from_date: "2023-01-01",
        statement_to_date: "2024-01-01",
        source_cas_type: "cams",
        uploaded_at: "2024-01-02T10:00:00Z",
        confirmed_at: "2024-01-02T10:01:00Z",
      },
    ]);

    render(<ImportHistoryList memberId="m-1" />);

    await waitFor(() => {
      expect(screen.getByText(/2023-01-01 to 2024-01-01/i)).toBeInTheDocument();
      expect(screen.getByText(/25 new transactions/i)).toBeInTheDocument();
      expect(screen.getByText(/4 duplicates/i)).toBeInTheDocument();
    });
  });

  it("renders empty state when there are no historical imports", async () => {
    vi.spyOn(api, "getMemberImportHistory").mockResolvedValue([]);

    render(<ImportHistoryList memberId="m-1" />);

    await waitFor(() => {
      expect(screen.getByText(/no previous imports found/i)).toBeInTheDocument();
    });
  });
});
const NEW_FUND = {
  scheme_id: "s1", scheme_name: "Alpha Flexi Cap Fund", amc_name: "Alpha Mutual Fund", invested_amount: "150000.00",
  latest_transaction_date: "2026-10-28", transaction_count: 1,
  transactions: [{ date: "2026-10-28", type: "PURCHASE", amount: "150000.00", units: "1000.0000" }],
};

describe("ImportHistoryList: new funds per import (UI round 2, change 8)", () => {
  const item = (over: Record<string, unknown> = {}) => ({
    import_id: "imp-1", household_member_id: "m-1", status: "import_successful", error_code: null, error_message: null,
    new_transactions_count: 25, duplicate_transactions_count: 0, statement_from_date: "2023-01-01", statement_to_date: "2024-01-01",
    source_cas_type: "cams", uploaded_at: "2024-01-02T10:00:00Z", confirmed_at: "2024-01-02T10:01:00Z", ...over,
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("a successful import has a Show new funds button, a failed one does not", async () => {
    vi.spyOn(api, "getMemberImportHistory").mockResolvedValue([item(), item({ import_id: "imp-2", status: "password_required" })] as never);
    render(<ImportHistoryList memberId="m-1" />);
    await screen.findAllByText(/2023-01-01 to 2024-01-01/i);
    expect(screen.getAllByRole("button", { name: "Show new funds" })).toHaveLength(1);
  });
  it("opens an import, fetches its new funds once and lists them", async () => {
    vi.spyOn(api, "getMemberImportHistory").mockResolvedValue([item()] as never);
    const fetchFunds = vi.spyOn(api, "getImportNewFunds").mockResolvedValue([NEW_FUND]);
    render(<ImportHistoryList memberId="m-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show new funds" }));
    expect(await screen.findByRole("button", { name: /Alpha Flexi Cap Fund/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide new funds" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Hide new funds" }));
    expect(screen.queryByRole("button", { name: /Alpha Flexi Cap Fund/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show new funds" }));
    expect(await screen.findByRole("button", { name: /Alpha Flexi Cap Fund/ })).toBeInTheDocument();
    expect(fetchFunds).toHaveBeenCalledTimes(1);
    expect(fetchFunds).toHaveBeenCalledWith("imp-1");
  });
  it("an import with no new funds says so", async () => {
    vi.spyOn(api, "getMemberImportHistory").mockResolvedValue([item()] as never);
    vi.spyOn(api, "getImportNewFunds").mockResolvedValue([]);
    render(<ImportHistoryList memberId="m-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show new funds" }));
    expect(await screen.findByText("No new funds in this import.")).toBeInTheDocument();
  });
  it("a failed request shows a plain message and the old list stays", async () => {
    vi.spyOn(api, "getMemberImportHistory").mockResolvedValue([item()] as never);
    vi.spyOn(api, "getImportNewFunds").mockRejectedValue(new Error("boom"));
    render(<ImportHistoryList memberId="m-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show new funds" }));
    expect(await screen.findByText("Could not load new funds.")).toBeInTheDocument();
    expect(screen.getByText(/25 new transactions/i)).toBeInTheDocument();
  });
});

describe("ImportHistoryList: a failed new-funds request can be tried again (review fix)", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it("shows the list on the second try after a failure", async () => {
    vi.spyOn(api, "getMemberImportHistory").mockResolvedValue([{
      import_id: "imp-1", household_member_id: "m-1", status: "import_successful", error_code: null, error_message: null,
      new_transactions_count: 25, duplicate_transactions_count: 0, statement_from_date: "2023-01-01", statement_to_date: "2024-01-01",
      source_cas_type: "cams", uploaded_at: "2024-01-02T10:00:00Z", confirmed_at: "2024-01-02T10:01:00Z",
    }] as never);
    const fetchFunds = vi.spyOn(api, "getImportNewFunds").mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([NEW_FUND]);
    render(<ImportHistoryList memberId="m-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show new funds" }));
    expect(await screen.findByText("Could not load new funds.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide new funds" }));
    fireEvent.click(screen.getByRole("button", { name: "Show new funds" }));
    expect(await screen.findByRole("button", { name: /Alpha Flexi Cap Fund/ })).toBeInTheDocument();
    expect(fetchFunds).toHaveBeenCalledTimes(2);
  });
});
