import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TopOverlapFunds } from "@/features/individual-fund/overlap/TopOverlapFunds";
import type { OverlapTopFund } from "@/features/individual-fund/types";

const funds: OverlapTopFund[] = [
  { scheme_id: "growth", scheme_name: "Example Growth Fund", overlap_pct: "30.0", common_stock_count: 3 },
  { scheme_id: "bond", scheme_name: "Horizon Bond Fund", overlap_pct: "20.0", common_stock_count: 2 },
  { scheme_id: "equity", scheme_name: "Example Equity Growth Fund", overlap_pct: "10.0", common_stock_count: 1 },
];
function mount(rows = funds) {
  const onCompare = vi.fn();
  render(<TopOverlapFunds funds={rows} fundName="Example Main Fund" onCompare={onCompare} />);
  return onCompare;
}
function search(text: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Search funds" }), { target: { value: text } });
}
const options = () => within(screen.getByRole("listbox", { name: "Funds to compare" })).getAllByRole("option");
afterEach(cleanup);

describe("top overlap funds search", () => {
  it("the list has a Search funds field", () => {
    mount();
    const input = screen.getByRole("textbox", { name: "Search funds" });
    expect(input).toHaveAttribute("placeholder", "Search funds");
    expect(input.compareDocumentPosition(screen.getByRole("listbox")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("typing filters the funds", () => {
    const onCompare = mount();
    search("growth");
    expect(options().map((row) => row.getAttribute("data-testid"))).toEqual(["top-fund-growth", "top-fund-equity"]);
    expect(screen.queryByText("Horizon Bond Fund")).not.toBeInTheDocument();
    fireEvent.click(options()[1]);
    expect(onCompare).toHaveBeenCalledWith("equity");
  });
  it("ArrowDown and ArrowUp move within the filtered list", () => {
    const onCompare = mount();
    search("growth");
    const [first, last] = options();
    act(() => first.focus());
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(last).toHaveFocus();
    expect(last).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveAttribute("aria-selected", "false");
    fireEvent.keyDown(last, { key: "ArrowDown" });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Enter" });
    expect(onCompare).toHaveBeenCalledWith("equity");
    fireEvent.keyDown(last, { key: "ArrowUp" });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(first).toHaveFocus();
  });
  it("Home and End go to the first and last filtered fund", () => {
    mount();
    search("growth");
    const [first, last] = options();
    act(() => first.focus());
    fireEvent.keyDown(first, { key: "End" });
    expect(last).toHaveFocus();
    expect(last).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(last, { key: "Home" });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("tabindex", "0");
  });
  it('no match shows No funds match "x".', () => {
    mount();
    search("x");
    expect(screen.getByText('No funds match "x".')).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.queryByTestId("top-funds-empty")).not.toBeInTheDocument();
  });
  it("the empty-portfolio message is unchanged", () => {
    mount([]);
    expect(screen.getByTestId("top-funds-empty")).toHaveTextContent("No other fund in your portfolio has published holdings to compare with.");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/No funds match/)).not.toBeInTheDocument();
  });
  it("with the field empty the list renders exactly as before", () => {
    mount();
    expect(screen.getByRole("textbox", { name: "Search funds" })).toHaveValue("");
    expect(screen.getByText("Choose a fund to see a full side-by-side comparison with Example Main Fund.")).toBeInTheDocument();
    expect(options().map((row) => row.textContent)).toEqual([
      expect.stringContaining("Example Growth Fund"), expect.stringContaining("Horizon Bond Fund"), expect.stringContaining("Example Equity Growth Fund"),
    ]);
    expect(options().map((row) => row.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(options()[0]).toHaveAccessibleName("Example Growth Fund 30.0% overlap · 3 stocks in common");
    expect(options()[1]).toHaveAccessibleName("Horizon Bond Fund 20.0% overlap · 2 stocks in common");
    expect(options()[2]).toHaveAccessibleName("Example Equity Growth Fund 10.0% overlap · 1 stock in common");
  });
});
