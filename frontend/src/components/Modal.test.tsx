import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders modal content when open", () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Test Modal">
        <div>Modal Body Content</div>
      </Modal>
    );

    expect(screen.getByText("Test Modal")).toBeInTheDocument();
    expect(screen.getByText("Modal Body Content")).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Test Modal">
        <div>Modal Body Content</div>
      </Modal>
    );

    expect(screen.queryByText("Test Modal")).not.toBeInTheDocument();
  });

  it("triggers onClose when close button or Escape key is pressed", () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal">
        <div>Modal Body Content</div>
      </Modal>
    );

    const closeBtn = screen.getByRole("button", { name: /close modal/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});


it("default variant stays centered and sheet is opt-in", async () => {
  const styles = (await import("./Modal.module.css")).default;
  const { rerender } = render(<Modal isOpen onClose={vi.fn()} title="Variant">Body</Modal>);
  expect(screen.getByRole("dialog")).not.toHaveClass(styles.sheet);
  rerender(<Modal isOpen onClose={vi.fn()} title="Variant" variant="sheet">Body</Modal>);
  expect(screen.getByRole("dialog")).toHaveClass(styles.sheet);
});
