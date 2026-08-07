import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders title, description, and action button", () => {
    const handleAction = vi.fn();
    render(
      <EmptyState
        title="No Mutual Funds Found"
        description="Upload a CAS PDF statement to begin tracking your portfolio."
        actionLabel="Upload CAS"
        onAction={handleAction}
      />
    );

    expect(screen.getByText("No Mutual Funds Found")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Upload a CAS PDF statement to begin tracking your portfolio."
      )
    ).toBeInTheDocument();

    const actionBtn = screen.getByRole("button", { name: /upload cas/i });
    expect(actionBtn).toBeInTheDocument();
    fireEvent.click(actionBtn);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });
});
