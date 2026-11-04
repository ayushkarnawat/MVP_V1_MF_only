import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NameMismatchDialog } from "./NameMismatchDialog";

const props = (over: Partial<Parameters<typeof NameMismatchDialog>[0]> = {}) => ({
  isOpen: true,
  enteredName: "Asha Rao",
  statementName: "Dev Rao",
  onAddAsFamily: vi.fn(),
  onUploadDifferent: vi.fn(),
  ...over,
});
const addButton = () => screen.getByRole("button", { name: "Add Dev Rao as a family member" });

it("sends one add-as-family request however many times the button is clicked", () => {
  const p = props();
  render(<NameMismatchDialog {...p} />);
  fireEvent.click(addButton());
  fireEvent.click(addButton());
  expect(p.onAddAsFamily).toHaveBeenCalledTimes(1);
  expect(addButton()).toBeDisabled();
});

it("a server error lets the button work again", () => {
  const p = props();
  const { rerender } = render(<NameMismatchDialog {...p} />);
  fireEvent.click(addButton());
  rerender(<NameMismatchDialog {...p} error="Could not add this person." />);
  expect(addButton()).toBeEnabled();
  fireEvent.click(addButton());
  expect(p.onAddAsFamily).toHaveBeenCalledTimes(2);
});

it("Upload a different file is never blocked", () => {
  const p = props();
  render(<NameMismatchDialog {...p} />);
  fireEvent.click(addButton());
  fireEvent.click(screen.getByRole("button", { name: "Upload a different file" }));
  expect(p.onUploadDifferent).toHaveBeenCalledTimes(1);
});
