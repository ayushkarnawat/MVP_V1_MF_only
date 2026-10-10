import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MobileBottomNav } from "./MobileBottomNav";

it("adds an accessible Scenarios destination beside the existing mobile tabs", () => {
  const onTabChange = vi.fn();
  render(<MobileBottomNav activeTab="scenarios" onTabChange={onTabChange} />);
  expect(screen.getAllByRole("button")).toHaveLength(4);
  const button = screen.getByRole("button", { name: "Scenarios" });
  expect(button).toHaveAttribute("aria-current", "page");
  fireEvent.click(button);
  expect(onTabChange).toHaveBeenCalledWith("scenarios");
});
