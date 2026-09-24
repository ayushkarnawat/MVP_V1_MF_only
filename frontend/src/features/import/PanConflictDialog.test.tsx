import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PanConflictDialog } from "./PanConflictDialog";

describe("PanConflictDialog", () => {
  it("shows the title, message and both actions", () => {
    const onChangeFile = vi.fn();
    const onSecondary = vi.fn();
    render(
      <PanConflictDialog
        isOpen
        message="Please choose Mom's own CAS."
        secondaryLabel="Skip Mom for now"
        onChangeFile={onChangeFile}
        onSecondary={onSecondary}
      />,
    );

    expect(screen.getByText("This PAN already exists")).toBeInTheDocument();
    expect(screen.getByText("Please choose Mom's own CAS.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /change cas file/i }));
    expect(onChangeFile).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /skip mom for now/i }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    render(
      <PanConflictDialog isOpen={false} message="m" secondaryLabel="Cancel" onChangeFile={vi.fn()} onSecondary={vi.fn()} />,
    );
    expect(screen.queryByText("This PAN already exists")).not.toBeInTheDocument();
  });
});
