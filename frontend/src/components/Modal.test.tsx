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

it("the sheet locks background scrolling while open and restores it; the default variant leaves it alone", () => {
  document.body.style.overflow = "auto";
  const center = render(<Modal isOpen onClose={vi.fn()} title="Center">Body</Modal>);
  expect(document.body.style.overflow).toBe("auto");
  center.unmount();
  const sheet = render(<Modal isOpen onClose={vi.fn()} title="Sheet" variant="sheet">Body</Modal>);
  expect(document.body.style.overflow).toBe("hidden");
  sheet.unmount();
  expect(document.body.style.overflow).toBe("auto");
  document.body.style.overflow = "";
});

describe("Modal focus management (both variants)", () => {
  for (const variant of ["center", "sheet"] as const) {
    it(`${variant}: moves focus in, wraps Tab, restores focus on close`, () => {
      const opener = document.createElement("button");
      document.body.appendChild(opener);
      opener.focus();
      const { rerender } = render(
        <Modal isOpen onClose={vi.fn()} title="T" variant={variant}>
          <input aria-label="a" />
          <button type="button">last</button>
        </Modal>,
      );
      const close = screen.getByRole("button", { name: /close modal/i });
      expect(document.activeElement).toBe(close);
      const last = screen.getByRole("button", { name: "last" });
      last.focus();
      fireEvent.keyDown(window, { key: "Tab" });
      expect(document.activeElement).toBe(close);
      close.focus();
      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(last);
      rerender(
        <Modal isOpen={false} onClose={vi.fn()} title="T" variant={variant}>
          <input aria-label="a" />
        </Modal>,
      );
      expect(document.activeElement).toBe(opener);
      opener.remove();
    });
  }

  it("does not steal focus when the parent re-renders with a new onClose", () => {
    const { rerender } = render(
      <Modal isOpen onClose={() => {}} title="T"><input aria-label="a" /></Modal>,
    );
    const input = screen.getByLabelText("a");
    input.focus();
    rerender(<Modal isOpen onClose={() => {}} title="T"><input aria-label="a" /></Modal>);
    expect(document.activeElement).toBe(input);
  });

  it("two open modals have distinct title ids wired to aria-labelledby", () => {
    render(
      <>
        <Modal isOpen onClose={vi.fn()} title="One">a</Modal>
        <Modal isOpen onClose={vi.fn()} title="Two">b</Modal>
      </>,
    );
    const dialogs = screen.getAllByRole("dialog");
    const ids = dialogs.map((d) => d.getAttribute("aria-labelledby"));
    expect(new Set(ids).size).toBe(2);
    expect(screen.getByRole("dialog", { name: "One" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Two" })).toBeInTheDocument();
  });
});