import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AllHoldingsDialog } from "@/features/individual-fund/overview/AllHoldingsDialog";
import type { HoldingsListResponse } from "@/features/individual-fund/types";

const api = vi.hoisted(() => ({ holdings: vi.fn() }));
vi.mock("@/features/individual-fund/api", () => ({ fundPageApi: api }));
const body: HoldingsListResponse = {
  status: "ready", scheme_id: "example", holdings_as_of: "2026-09-30", age_tag: null, count: 3,
  rows: [
    { name: "Example Solar", isin: "INE111000001", sector: "Energy", asset_type: "equity", weight: "20.00" },
    { name: "Example Bank", isin: "INE222000002", sector: "Financial Services", asset_type: "equity", weight: "30.00" },
    { name: "Horizon Textile", isin: "INE333000003", sector: "Textiles", asset_type: "equity", weight: "10.00" },
  ],
};
const names = () => screen.getAllByTestId("all-row").map((row) => within(row).getAllByRole("cell")[1].textContent);
async function mount() {
  const onClose = vi.fn();
  const view = render(<AllHoldingsDialog schemeId="example" isOpen onClose={onClose} />);
  await screen.findByTestId("all-count");
  return { ...view, onClose };
}
beforeEach(() => { vi.clearAllMocks(); api.holdings.mockResolvedValue(body); });
afterEach(cleanup);

describe("all holdings dialog search", () => {
  it("the dialog has a Search holdings field", async () => {
    await mount();
    const input = screen.getByRole("textbox", { name: "Search holdings" });
    expect(input).toHaveAttribute("placeholder", "Search holdings");
    expect(input.compareDocumentPosition(screen.getByRole("table")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("typing filters the rows", async () => {
    await mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Search holdings" }), { target: { value: "energy" } });
    expect(names()).toEqual(["Example Solar"]);
    expect(screen.getByTestId("all-count")).toHaveTextContent("3 holdings");
  });
  it('no match shows No holdings match "x".', async () => {
    await mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Search holdings" }), { target: { value: "x" } });
    expect(screen.getByText('No holdings match "x".')).toBeInTheDocument();
    expect(screen.queryAllByTestId("all-row")).toHaveLength(0);
  });
  it("clearing the field restores every row", async () => {
    await mount();
    const input = screen.getByRole("textbox", { name: "Search holdings" });
    fireEvent.change(input, { target: { value: "solar" } });
    expect(names()).toEqual(["Example Solar"]);
    fireEvent.change(input, { target: { value: "" } });
    expect(names()).toEqual(["Example Bank", "Example Solar", "Horizon Textile"]);
  });
  it("sorting still works on the filtered rows", async () => {
    await mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Search holdings" }), { target: { value: "example" } });
    expect(names()).toEqual(["Example Bank", "Example Solar"]);
    fireEvent.click(screen.getByRole("button", { name: "Weight" }));
    expect(names()).toEqual(["Example Solar", "Example Bank"]);
    expect(screen.getByRole("columnheader", { name: "Weight" })).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: "Stock" }));
    expect(names()).toEqual(["Example Bank", "Example Solar"]);
    fireEvent.click(screen.getByRole("button", { name: "Stock" }));
    expect(names()).toEqual(["Example Solar", "Example Bank"]);
  });
  it("with the field empty the dialog renders exactly as before", async () => {
    const { onClose } = await mount();
    expect(screen.getByRole("textbox", { name: "Search holdings" })).toHaveValue("");
    expect(screen.getByRole("dialog", { name: "All holdings, as on September 2026" })).toBeInTheDocument();
    expect(screen.getByTestId("all-count")).toHaveTextContent(/^3 holdings$/);
    expect(screen.getAllByTestId("all-row").map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["1", "Example Bank", "Financial Services", "30.00%"],
      ["2", "Example Solar", "Energy", "20.00%"],
      ["3", "Horizon Textile", "Textiles", "10.00%"],
    ]);
    expect(screen.queryByText(/No holdings match/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
