import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewTable } from "./ReviewTable";
import type { ImportPreviewResponse } from "./types";
import { person, scheme } from "./testFixtures";

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
    people: [], unassigned_temp_ids: [], name_notices: [], same_person_prompts: [],
    expires_at: "2026-09-29T11:00:00Z",
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

  it("does not render parse warnings in the UI even when present in preview data", () => {
    const warningMsg = "Skipped transaction on 2024-01-01: missing amount";
    const preview = buildPreview({ parse_warnings: [warningMsg] });
    render(<ReviewTable preview={preview} confirming={false} onConfirm={vi.fn()} />);

    expect(screen.queryByText(/import warnings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(warningMsg)).not.toBeInTheDocument();
    expect(preview.parse_warnings).toEqual([warningMsg]);
  });

  it("renders the schemes prop instead of preview.schemes", () => {
    const preview = buildPreview({ schemes: [scheme("a"), scheme("b")] });
    render(
      <ReviewTable preview={preview} schemes={[scheme("a")]} confirming={false} onConfirm={vi.fn()} />,
    );
    expect(screen.getByText("Fund a")).toBeInTheDocument();
    expect(screen.queryByText("Fund b")).not.toBeInTheDocument();
  });

  it("hides the Confirm button with hideConfirm", () => {
    render(<ReviewTable preview={buildPreview()} confirming={false} onConfirm={vi.fn()} hideConfirm />);
    expect(screen.queryByRole("button", { name: /confirm import/i })).not.toBeInTheDocument();
  });

  it("reports the live unresolved count", async () => {
    const onCount = vi.fn();
    const preview = buildPreview({ schemes: [scheme("a", { plan_type: "unclassified" })] });
    render(
      <ReviewTable preview={preview} confirming={false} onConfirm={vi.fn()} onUnresolvedCountChange={onCount} />,
    );
    expect(onCount).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: /^direct$/i }));
    expect(onCount).toHaveBeenLastCalledWith(0);
  });

  it("reports scheme confirmations as they change", async () => {
    const onChange = vi.fn();
    const preview = buildPreview({ schemes: [scheme("a", { plan_type: "unclassified" })] });
    render(
      <ReviewTable
        preview={preview} confirming={false} onConfirm={vi.fn()} hideConfirm onConfirmationsChange={onChange}
      />,
    );
    expect(onChange).toHaveBeenLastCalledWith([]);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: /^regular$/i }));
    expect(onChange).toHaveBeenLastCalledWith([{ temp_id: "a", plan_type_override: "regular" }]);
  });

  it("tags matched-by-name and assigned-by-you funds and offers Move to", () => {
    const onMove = vi.fn();
    const preview = buildPreview({ schemes: [scheme("a"), scheme("b")] });
    render(
      <ReviewTable
        preview={preview} confirming={false} onConfirm={vi.fn()}
        matchedByName={["a"]} assignedByYou={["b"]}
        moveTargets={[person("me", "Aditi Sharma"), person("r", "Ramesh Sharma")]} onMove={onMove}
      />,
    );
    expect(screen.getByText("matched by name")).toBeInTheDocument();
    expect(screen.getByText("assigned by you")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: /move fund a to/i }), { target: { value: "r" } });
    expect(onMove).toHaveBeenCalledWith("a", "r");
    expect(screen.queryByRole("combobox", { name: /move fund b to/i })).not.toBeInTheDocument();
  });

  it("shows (PAN not on statement) when the statement has no PAN", () => {
    render(<ReviewTable preview={buildPreview({ pan_masked: null })} confirming={false} onConfirm={vi.fn()} />);
    expect(screen.getByText("(PAN not on statement)")).toBeInTheDocument();
    expect(screen.queryByText("Not found in CAS")).not.toBeInTheDocument();
  });
});
