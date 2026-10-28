import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { OverlapResponse, OverlapTopFund } from "../types";
import { TopOverlapFunds } from "./TopOverlapFunds";

const NAME = "Alpha Flexi Cap Fund - Direct Plan";
const golden = () => fixture<OverlapResponse>("overlap_fund").top_overlap_funds;
const many = (count: number): OverlapTopFund[] =>
  Array.from({ length: count }, (_, index) => ({
    scheme_id: `fund-${index + 1}`, scheme_name: `Peer Fund ${index + 1}`, overlap_pct: `${50 - index}.5000`, common_stock_count: 10 - (index % 10),
  }));
const listbox = () => screen.getByRole("listbox", { name: "Funds to compare" });
const options = () => within(listbox()).getAllByRole("option");

function mount(funds: OverlapTopFund[], extra: { onCompare?: (id: string) => void; restoreFocusId?: string | null } = {}) {
  const onCompare = extra.onCompare ?? vi.fn();
  render(<TopOverlapFunds funds={funds} fundName={NAME} onCompare={onCompare} restoreFocusId={extra.restoreFocusId} />);
  return onCompare;
}

describe("TopOverlapFunds", () => {
  it("is a labelled listbox of options: fund name, overlap and common stocks, with the instruction line and no Action column", () => {
    mount(golden());
    expect(screen.getByText(`Choose a fund to see a full side-by-side comparison with ${NAME}.`)).toBeInTheDocument();
    expect(options()).toHaveLength(1);
    expect(options()[0]).toHaveAccessibleName("Golden Peer 1 Fund 18.0% overlap · 3 stocks in common");
    expect(screen.queryByText("Action")).toBeNull();
    expect(within(listbox()).queryByRole("button")).toBeNull();
    expect(within(listbox()).queryByRole("link")).toBeNull();
  });

  it("a click on a row asks for the comparison with that fund", () => {
    const onCompare = mount(golden());
    fireEvent.click(options()[0]);
    expect(onCompare).toHaveBeenCalledTimes(1);
    expect(onCompare).toHaveBeenCalledWith("dfb6f3a4-ed3e-5d4c-81e4-7343b0862d60");
  });

  it("test_top_overlap_funds_not_limited_to_twelve: 14 funds are 14 options, in the API order", () => {
    mount(many(14));
    expect(options()).toHaveLength(14);
    expect(options().map(option => option.getAttribute("data-testid"))[13]).toBe("top-fund-fund-14");
    expect(within(options()[0]).getByText("Peer Fund 1")).toBeInTheDocument();
    expect(within(options()[13]).getByText("Peer Fund 14")).toBeInTheDocument();
  });

  it("roving focus: only the first option is in the tab order, arrows, Home and End move focus and selection (not past the ends)", () => {
    mount(many(4));
    expect(options().map(option => option.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
    expect(options().map(option => option.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false"]);
    options()[0].focus();
    fireEvent.keyDown(options()[0], { key: "ArrowDown" });
    expect(options()[1]).toHaveFocus();
    expect(options().map(option => option.getAttribute("aria-selected"))).toEqual(["false", "true", "false", "false"]);
    expect(options().map(option => option.getAttribute("tabindex"))).toEqual(["-1", "0", "-1", "-1"]);
    fireEvent.keyDown(options()[1], { key: "End" });
    expect(options()[3]).toHaveFocus();
    fireEvent.keyDown(options()[3], { key: "ArrowDown" });
    expect(options()[3]).toHaveFocus();
    fireEvent.keyDown(options()[3], { key: "ArrowUp" });
    expect(options()[2]).toHaveFocus();
    fireEvent.keyDown(options()[2], { key: "Home" });
    expect(options()[0]).toHaveFocus();
    fireEvent.keyDown(options()[0], { key: "ArrowUp" });
    expect(options()[0]).toHaveFocus();
  });

  it("arrow keys are kept from scrolling the page, and Enter and Space open the focused row's comparison", () => {
    const onCompare = mount(many(3));
    const down = fireEvent.keyDown(options()[0], { key: "ArrowDown" });
    expect(down).toBe(false);
    expect(onCompare).not.toHaveBeenCalled();
    const space = fireEvent.keyDown(options()[1], { key: " " });
    expect(space).toBe(false);
    expect(onCompare).toHaveBeenLastCalledWith("fund-2");
    fireEvent.keyDown(options()[2], { key: "Enter" });
    expect(onCompare).toHaveBeenLastCalledWith("fund-3");
    fireEvent.keyDown(options()[2], { key: "a" });
    fireEvent.keyDown(options()[2], { key: "Tab" });
    expect(onCompare).toHaveBeenCalledTimes(2);
  });

  it("focusing a row with the mouse or Tab makes it the active option", () => {
    mount(many(3));
    fireEvent.focus(options()[2]);
    expect(options()[2]).toHaveAttribute("aria-selected", "true");
    expect(options()[2]).toHaveAttribute("tabindex", "0");
    expect(options()[0]).toHaveAttribute("tabindex", "-1");
  });

  it("coming back from a comparison, the row that was open takes focus again", () => {
    mount(many(3), { restoreFocusId: "fund-2" });
    expect(options()[1]).toHaveFocus();
    expect(options()[1]).toHaveAttribute("tabindex", "0");
  });

  it("an id that is no longer listed restores nothing and focus stays where it is", () => {
    mount(many(3), { restoreFocusId: "gone" });
    expect(document.body).toHaveFocus();
    expect(options()[0]).toHaveAttribute("tabindex", "0");
  });

  it("with no fund to compare it says so and shows no listbox", () => {
    mount([]);
    expect(screen.getByTestId("top-funds-empty")).toHaveTextContent("No other fund in your portfolio has published holdings to compare with.");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
