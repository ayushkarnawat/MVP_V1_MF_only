import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { WaitingForCasView } from "./WaitingForCasView";
import * as api from "./api";

describe("WaitingForCasView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders waiting state and triggers cancellation", async () => {
    vi.spyOn(api, "cancelImportRequest").mockResolvedValue({
      import_id: "imp-req-1",
      household_member_id: "m-1",
      status: "expired",
      error_code: null,
      error_message: null,
      new_transactions_count: null,
      duplicate_transactions_count: null,
      statement_from_date: null,
      statement_to_date: null,
      source_cas_type: null,
      uploaded_at: "2026-08-10T12:00:00Z",
      confirmed_at: null,
    });

    const onCancelled = vi.fn();

    render(
      <WaitingForCasView
        importId="imp-req-1"
        memberId="m-1"
        onCancelled={onCancelled}
        onUploadReceived={vi.fn()}
      />
    );

    expect(screen.getByText(/waiting for cams email delivery/i)).toBeInTheDocument();

    const cancelBtn = screen.getByRole("button", { name: /cancel request/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(api.cancelImportRequest).toHaveBeenCalledWith("imp-req-1");
      expect(onCancelled).toHaveBeenCalled();
    });
  });

  it("calls onUploadSubmit when file is uploaded in waiting view", async () => {
    const onUploadSubmit = vi.fn();
    render(
      <WaitingForCasView
        importId="imp-req-1"
        memberId="m-1"
        onCancelled={vi.fn()}
        onUploadSubmit={onUploadSubmit}
      />
    );

    const fileInput = screen.getByLabelText(/CAS PDF/i);
    const mockFile = new File(["dummy pdf content"], "CAS_statement.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [mockFile] } });
    const passwordInput = screen.getByLabelText(/PDF Password/i);
    fireEvent.change(passwordInput, { target: { value: "SECRET123" } });

    const submitBtn = screen.getByRole("button", { name: /Upload & Parse Statement/i });
    fireEvent.click(submitBtn);

    expect(onUploadSubmit).toHaveBeenCalledWith(mockFile, "SECRET123");
  });
});
