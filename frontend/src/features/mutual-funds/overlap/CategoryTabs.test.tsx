import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderInShell as render } from "@/shell/testing";
import { CategoryTabs } from "./CategoryTabs";

const categories = ["Large Cap", "Mid Cap", "Small Cap", "Flexi Cap"];

describe("category tab keyboard access", () => {
  it("selects categories through the tab strip", () => {
    const change = vi.fn();
    render(<CategoryTabs categories={categories} value="Large Cap" onChange={change} />);
    expect(screen.getByRole("tab", { name: "Large Cap" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Small Cap" }));
    expect(change).toHaveBeenCalledWith("Small Cap");
  });
  it("opens the menu with ArrowDown, moves focus with arrows and chooses with Enter", () => {
    const change = vi.fn();
    render(<CategoryTabs categories={categories} value="Large Cap" onChange={change} />);
    const button = screen.getByRole("button", { name: "Choose category" });
    fireEvent.keyDown(button, { key: "ArrowDown" });
    expect(button).toHaveAttribute("aria-expanded", "true");
    const first = screen.getByRole("menuitemradio", { name: "Large Cap" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const mid = screen.getByRole("menuitemradio", { name: "Mid Cap" });
    expect(mid).toHaveFocus();
    fireEvent.keyDown(mid, { key: "Enter" });
    expect(change).toHaveBeenCalledWith("Mid Cap");
    expect(button).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
  it("Escape closes the menu and restores focus", () => {
    render(<CategoryTabs categories={categories} value="Large Cap" onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Choose category" });
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole("menuitemradio", { name: "Large Cap" }), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});
