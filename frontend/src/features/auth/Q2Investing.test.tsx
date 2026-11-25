import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Q2Investing } from "./Q2Investing";

const options = [
  ["Mostly on my own", "self_directed", "compass"],
  ["Through an advisor or distributor", "advisor_assisted", "users"],
  ["A mix of both", "mixed", "briefcase"],
  ["Just getting started", "beginner", "sprout"],
] as const;

describe("Q2Investing tiles", () => {
  it("renders_each_option_with_a_lucide_icon_in_the_tile_and_no_hex", () => {
    render(<Q2Investing onBack={() => {}} onSkip={() => {}} onSelect={() => {}} />);
    for (const [title, , icon] of options) {
      const button = screen.getByRole("button", { name: new RegExp(title) });
      const glyph = button.querySelector(`svg.lucide-${icon}`);
      expect(glyph).toBeInTheDocument();
      expect(glyph?.parentElement).toHaveClass("rounded-[10px]", "bg-[var(--ui-card)]", "text-[var(--pos)]");
    }
    const sources = import.meta.glob<string>("./Q2Investing.tsx", { eager: true, query: "?raw", import: "default" });
    expect(sources["./Q2Investing.tsx"]).toBeDefined();
    expect(sources["./Q2Investing.tsx"]).not.toMatch(/#[\da-f]{3,8}\b/i);
  });
  it("selecting_an_option_still_calls_the_select_callback", () => {
    const onSelect = vi.fn();
    render(<Q2Investing onBack={() => {}} onSkip={() => {}} onSelect={onSelect} />);
    for (const [title, value] of options) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(title) }));
      expect(onSelect).toHaveBeenLastCalledWith(value);
    }
    expect(onSelect).toHaveBeenCalledTimes(4);
  });
});
