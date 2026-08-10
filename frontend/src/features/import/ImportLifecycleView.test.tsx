import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { ImportLifecycleView } from "./ImportLifecycleView";
import * as api from "./api";

describe("ImportLifecycleView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders password retry prompt when in password_required state and submits new password", async () => {
    vi.spyOn(api, "retryCasImportPassword").mockResolvedValue({
      import_id: "imp-1",
      household_member_id: "m-1",
      status: "import_successful",
      new_transactions_count: 3,
      duplicate_transactions_count: 0,
      error_code: null,
      error_message: null,
      statement_from_date: "2024-01-01",
      statement_to_date: "2024-06-30",
      source_cas_type: "cams",
      uploaded_at: "2026-08-10T12:00:00Z",
      confirmed_at: "2026-08-10T12:01:00Z",
    });

    render(
      <ImportLifecycleView
        importId="imp-1"
        initialStatus={{
          import_id: "imp-1",
          household_member_id: "m-1",
          status: "password_required",
          error_code: "wrong_password",
          error_message: "Incorrect PDF password.",
          new_transactions_count: null,
          duplicate_transactions_count: null,
          statement_from_date: null,
          statement_to_date: null,
          source_cas_type: null,
          uploaded_at: "2026-08-10T12:00:00Z",
          confirmed_at: null,
        }}
        onDone={vi.fn()}
      />
    );

    expect(screen.getByText(/Incorrect PDF password/i)).toBeInTheDocument();
    const input = screen.getByLabelText(/re-enter pdf password/i);
    fireEvent.change(input, { target: { value: "NEW_PASS" } });

    const submitBtn = screen.getByRole("button", { name: /retry unlock/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.retryCasImportPassword).toHaveBeenCalledWith("imp-1", "NEW_PASS");
    });
  });

  it("renders summary statement error when validation_failed with summary_cas", () => {
    const onReset = vi.fn();
    render(
      <ImportLifecycleView
        importId="imp-1"
        initialStatus={{
          import_id: "imp-1",
          household_member_id: "m-1",
          status: "validation_failed",
          error_code: "summary_cas",
          error_message: "This is a Summary CAS. Please request a Detailed statement instead.",
          new_transactions_count: null,
          duplicate_transactions_count: null,
          statement_from_date: null,
          statement_to_date: null,
          source_cas_type: null,
          uploaded_at: "2026-08-10T12:00:00Z",
          confirmed_at: null,
        }}
        onDone={vi.fn()}
        onReset={onReset}
      />
    );

    expect(screen.getByText(/summary statement/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: /try another file/i });
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(onReset).toHaveBeenCalled();
  });
});
