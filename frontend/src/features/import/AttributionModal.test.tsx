import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttributionModal } from "./AttributionModal";

describe("AttributionModal", () => {
  const candidates = [
    { id: "m-1", name: "Rajesh Kumar", relationship: "self" },
    { id: "m-2", name: "Priya Kumar", relationship: "spouse" },
  ];

  it("renders mismatch prompt and confirms matched member on primary click", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <AttributionModal
        isOpen={true}
        matchedMemberName="Priya Kumar"
        matchedMemberId="m-2"
        candidates={candidates}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText(/Priya Kumar's statement/i)).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: /import for Priya Kumar/i });
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledWith("m-2");
  });

  it("calls onCancel when cancel or close button is clicked", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <AttributionModal
        isOpen={true}
        matchedMemberName="Priya Kumar"
        matchedMemberId="m-2"
        candidates={candidates}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(onCancel).toHaveBeenCalled();
  });
});
