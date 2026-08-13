import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewTable } from "./ReviewTable";
import type { ImportPreviewResponse } from "./types";

function buildPreview(overrides: Partial<ImportPreviewResponse> = {}): ImportPreviewResponse {
  return {
    session_id: "sess1",
    filename: "cas.pdf",
    investor_name: "Test Investor",
    investor_email: "t@example.com",
    pan_masked: "A********F",
    schemes: [],
    transactions: [],
    transaction_count: 0,
    parse_warnings: [],
    cas_type: "DETAILED",
    file_type: "FileType.CAMS",
    ...overrides,
  };
}

describe("ReviewTable", () => {
  it("disables Confirm when a pending scheme has no AMFI override", () => {
    const preview = buildPreview({
      schemes: [
        {
          temp_id: "t1", name: "Ambiguous Fund", isin: null, amfi_code: null,
          suggested_amfi_code: null, suggested_name: null, match_confidence: 0.5,
          match_status: "pending", folio: "F1", amc: "AMC1", transaction_count: 1,
          plan_type: "direct", category: null,
        },
      ],
    });
    render(<ReviewTable preview={preview} confirming={false} onConfirm={vi.fn()} />);

    expect(screen.getByRole("button", { name: /confirm import/i })).toBeDisabled();
  });

  it("enables Confirm once every pending/unclassified scheme has an override", async () => {
    const preview = buildPreview({
      schemes: [
        {
          temp_id: "t1", name: "Ambiguous Fund", isin: null, amfi_code: null,
          suggested_amfi_code: null, suggested_name: null, match_confidence: 0.5,
          match_status: "pending", folio: "F1", amc: "AMC1", transaction_count: 1,
          plan_type: "unclassified", category: null,
        },
      ],
    });
    render(<ReviewTable preview={preview} confirming={false} onConfirm={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/amfi code/i), { target: { value: "125497" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: /^direct$/i }));

    expect(screen.getByRole("button", { name: /confirm import/i })).toBeEnabled();
  });

  it("calls onConfirm with only the filled-in overrides, omitting already-confident schemes", () => {
    const onConfirm = vi.fn();
    const preview = buildPreview({
      schemes: [
        {
          temp_id: "t1", name: "Confident Fund", isin: null, amfi_code: "999",
          suggested_amfi_code: "999", suggested_name: "Confident Fund", match_confidence: 1,
          match_status: "confirmed", folio: "F1", amc: "AMC1", transaction_count: 1,
          plan_type: "direct", category: null,
        },
      ],
    });
    render(<ReviewTable preview={preview} confirming={false} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    expect(onConfirm).toHaveBeenCalledWith([]);
  });

  it("renders parse warnings when present", () => {
    const preview = buildPreview({ parse_warnings: ["Skipped transaction on 2024-01-01: missing amount"] });
    render(<ReviewTable preview={preview} confirming={false} onConfirm={vi.fn()} />);

    expect(screen.getByText(/skipped transaction on 2024-01-01/i)).toBeInTheDocument();
  });
});
