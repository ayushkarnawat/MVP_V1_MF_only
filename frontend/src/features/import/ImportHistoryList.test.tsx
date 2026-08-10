import { render, screen, waitFor } from "@testing-library/react";
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
