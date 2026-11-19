import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { OpeningBalanceModal } from "./OpeningBalanceModal";
import * as api from "@/features/import/api";
import { resetFolioVisibilityForTests } from "@/lib/folioVisibility";

describe("OpeningBalanceModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const gapItem = {
    folio_id: "fol-123",
    folio_number: "12345/67",
    scheme_id: "sch-1",
    scheme_name: "HDFC Top 100 Fund",
    deficit_units: "50.000",
    first_deficit_date: "2024-02-15",
  };

  it("renders deficit details and submits opening balance", async () => {
    vi.spyOn(api, "postOpeningBalance").mockResolvedValue({
      transaction_id: "txn-1",
      folio_id: "fol-123",
      type: "opening_balance",
      date: "2024-01-01",
      units: "50.000",
      amount: "5000.00",
      nav: "100.0000",
      has_coverage_gap: false,
    });

    const onResolved = vi.fn();
    const onClose = vi.fn();

    render(
      <OpeningBalanceModal
        isOpen={true}
        gap={gapItem}
        onClose={onClose}
        onResolved={onResolved}
      />
    );

    expect(screen.getByText(/HDFC Top 100 Fund/i)).toBeInTheDocument();
    expect(screen.getByText(/50.000 units missing/i)).toBeInTheDocument();

    const unitsInput = screen.getByLabelText(/opening units/i);
    const dateInput = screen.getByLabelText(/effective date/i);

    fireEvent.change(unitsInput, { target: { value: "50.000" } });
    fireEvent.change(dateInput, { target: { value: "2024-01-01" } });

    const submitBtn = screen.getByRole("button", { name: /save opening balance/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.postOpeningBalance).toHaveBeenCalledWith("fol-123", {
        units: "50.000",
        date: "2024-01-01",
        amount: undefined,
        nav: undefined,
      });
      expect(onResolved).toHaveBeenCalled();
    });
  });

  // Batch C 17c: the dialog's own private mask is gone; it shows the full number through the shared FolioNumber.
  it("shows the folio number in full with an eye beside it (no private mask)", () => {
    resetFolioVisibilityForTests();
    render(<OpeningBalanceModal isOpen gap={{ ...gapItem, folio_number: "1234567/89" }} onClose={vi.fn()} onResolved={vi.fn()} />);
    expect(screen.getByText("1234567/89")).toBeInTheDocument();
    expect(screen.queryByText(/XXXX7\/89/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hide folio numbers" }));
    expect(screen.getByText("XXXX4567/89")).toBeInTheDocument();
    expect(screen.queryByText("1234567/89")).toBeNull();
    expect(screen.queryByText(/1234567/)).not.toBeInTheDocument();
  });
});
