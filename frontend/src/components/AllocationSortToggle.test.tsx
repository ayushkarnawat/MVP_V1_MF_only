import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AllocationSortToggle } from "./AllocationSortToggle";

it("exposes the active sort order and requests the other order on click", () => {
  const onChange = vi.fn();
  const { rerender } = render(<AllocationSortToggle order="asc" onChange={onChange} />);
  expect(screen.getByRole("button", { name: "Smallest first" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Largest first" })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Largest first" }));
  expect(onChange).toHaveBeenCalledWith("desc");
  rerender(<AllocationSortToggle order="desc" onChange={onChange} />);
  expect(screen.getByRole("button", { name: "Largest first" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Smallest first" }));
  expect(onChange).toHaveBeenLastCalledWith("asc");
});
