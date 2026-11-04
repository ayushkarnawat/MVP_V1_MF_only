import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SegmentedTabs } from "./SegmentedTabs";

const OPTIONS = [{ value: "a", label: "One" }, { value: "b", label: "Two" }, { value: "c", label: "Three" }] as const;
function Harness() {
  const [value, setValue] = useState<"a" | "b" | "c">("a");
  return <SegmentedTabs label="Pick" options={OPTIONS} value={value} onChange={setValue} />;
}

describe("SegmentedTabs keyboard use (S6 review, 3 Nov)", () => {
  it("an arrow key selects the next tab AND moves focus to it, so the next arrow key keeps walking", () => {
    render(<Harness />);
    const one = screen.getByRole("tab", { name: "One" });
    one.focus();
    fireEvent.keyDown(one, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Two" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Three" }));
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute("aria-selected", "true");
  });
  it("ArrowLeft wraps to the last tab, End and Home jump, and focus follows each time", () => {
    render(<Harness />);
    const one = screen.getByRole("tab", { name: "One" });
    one.focus();
    fireEvent.keyDown(one, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Three" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "One" }));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Three" }));
  });
});
