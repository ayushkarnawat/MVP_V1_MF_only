import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fc from "../fixtures/mfC";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { OverlapSummary } from "../types";
import { Heatmap } from "./Heatmap";

const TOP = "S-KOTAK~S-SBI";
const mount = (data: OverlapSummary | null = fc.overlapSummary(), selectedKey: string | null = TOP, state: "loading" | "ready" | "failed" | "error" = "ready", onSelect = vi.fn(), onRetry = vi.fn()) => {
  const view = renderInShell(<Heatmap state={state} data={data} onRetry={onRetry} selectedKey={selectedKey} onSelect={onSelect} />, { path: "/portfolio/mutual-funds/overlap" });
  return { ...view, onSelect, onRetry, again: (key: string | null) => view.rerender(<Heatmap state={state} data={data} onRetry={onRetry} selectedKey={key} onSelect={onSelect} />) };
};
const cell = (row: string, column: string) => screen.getByTestId(`cell-${row}-${column}`);

describe("the grid", () => {
  it("has the numbered heading, the info mark, the hint and the covered-funds line", () => {
    mount();
    expect(screen.getByRole("heading", { name: "2. Overlap Heatmap" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Every fund pair's overlap %/ })).toBeInTheDocument();
    expect(screen.getByText("Click any cell to see the stocks shared between that pair.")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap-scope")).toHaveTextContent("Covered funds, largest portfolio value first");
  });
  it("says the top funds by value out of the covered funds when the matrix was cut", () => {
    const data = fc.overlapSummary();
    data.matrix_truncated = true;
    data.total_fund_count = 15;
    mount(data);
    expect(screen.getByTestId("heatmap-scope")).toHaveTextContent("Top 4 funds by value, out of 15 covered funds");
  });
  it("draws the three bands in the legend from the payload's bands", () => {
    mount();
    expect(["low", "moderate", "high"].map(band => screen.getByTestId(`legend-${band}`).textContent)).toEqual(["Low < 20%", "Moderate 20–40%", "High ≥ 40%"]);
  });
  it("labels the columns and rows in value order with the fund initials and the full name as a tooltip", () => {
    mount();
    const table = screen.getByRole("table", { name: "Overlap heatmap" });
    const columns = within(table).getAllByRole("columnheader").filter(header => header.getAttribute("data-testid"));
    expect(columns.map(header => header.textContent)).toEqual(["KMC", "HMO", "JFC", "SB"]);
    expect(columns.map(header => header.getAttribute("title"))).toEqual(["Kotak Multi Cap Fund", "HDFC Mid-Cap Opportunities Fund", "JM Flexi Cap Fund", "SBI Bluechip Fund"]);
    expect(screen.getByTestId("hm-row-S-SBI")).toHaveAttribute("title", "SBI Bluechip Fund");
    expect(screen.getAllByTestId(/^hm-row-/)).toHaveLength(4);
  });
  it("puts a dash on the diagonal (with a tooltip) and a button for every other cell, mirrored pairs alike", () => {
    mount();
    expect(screen.getAllByRole("button")).toHaveLength(12);
    for (const id of ["S-KOTAK", "S-HDFC", "S-JM", "S-SBI"]) {
      const diagonal = cell(id, id);
      expect(diagonal).toHaveTextContent("—");
      expect(diagonal.tagName).not.toBe("BUTTON");
      expect(diagonal).toHaveAttribute("title", "A fund is not compared with itself.");
    }
    expect(cell("S-KOTAK", "S-SBI")).toHaveTextContent("41%");
    expect(cell("S-SBI", "S-KOTAK")).toHaveTextContent("41%");
    expect(cell("S-KOTAK", "S-JM")).toHaveTextContent("24%");
    expect(cell("S-JM", "S-SBI")).toHaveTextContent("26%");
    expect(cell("S-HDFC", "S-JM")).toHaveTextContent("3%");
    expect(cell("S-KOTAK", "S-HDFC")).toHaveTextContent("0%");
  });
  it("bands each cell and gives the exact overlap and both full names in its tooltip and name", () => {
    mount();
    expect(cell("S-KOTAK", "S-SBI")).toHaveAttribute("data-band", "high");
    expect(cell("S-KOTAK", "S-JM")).toHaveAttribute("data-band", "moderate");
    expect(cell("S-JM", "S-SBI")).toHaveAttribute("data-band", "moderate");
    expect(cell("S-HDFC", "S-JM")).toHaveAttribute("data-band", "low");
    expect(cell("S-KOTAK", "S-HDFC")).toHaveAttribute("data-band", "low");
    expect(cell("S-KOTAK", "S-SBI")).toHaveAttribute("title", "Kotak Multi Cap Fund × SBI Bluechip Fund: 40.60% overlap");
    expect(cell("S-SBI", "S-KOTAK")).toHaveAttribute("aria-label", "SBI Bluechip Fund × Kotak Multi Cap Fund: 40.60% overlap");
  });
  it("moves the bands with the payload: nothing is hard-coded at 20 and 40", () => {
    const data = fc.overlapSummary();
    data.bands = { low: "10", high: "30" };
    mount(data);
    expect(cell("S-KOTAK", "S-JM")).toHaveAttribute("data-band", "moderate");
    expect(cell("S-JM", "S-SBI")).toHaveAttribute("data-band", "moderate");
    expect(cell("S-HDFC", "S-JM")).toHaveAttribute("data-band", "low");
    expect(screen.getByTestId("legend-high")).toHaveTextContent("High ≥ 30%");
    expect(cell("S-KOTAK", "S-SBI")).toHaveAttribute("data-band", "high");
  });
  it("draws a thin bar under each percentage as a share of the highest overlap in the grid", () => {
    mount();
    expect(screen.getByTestId("cell-bar-S-KOTAK-S-SBI")).toHaveStyle({ width: "100%" });
    expect(screen.getByTestId("cell-bar-S-JM-S-SBI")).toHaveStyle({ width: "65.02%" });
    expect(screen.getByTestId("cell-bar-S-KOTAK-S-HDFC")).toHaveStyle({ width: "0%" });
  });
});

describe("selecting a pair", () => {
  it("marks both mirrored cells of the selected pair, and only those, with a persistent selected state", () => {
    mount();
    for (const [row, column] of [["S-KOTAK", "S-SBI"], ["S-SBI", "S-KOTAK"]]) {
      expect(cell(row, column)).toHaveAttribute("aria-pressed", "true");
      expect(cell(row, column)).toHaveAttribute("data-selected", "true");
    }
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(2);
  });
  it("reports the pair key whichever mirrored cell is clicked", () => {
    const { onSelect } = mount();
    fireEvent.click(cell("S-SBI", "S-JM"));
    fireEvent.click(cell("S-JM", "S-SBI"));
    expect(onSelect.mock.calls).toEqual([["S-JM~S-SBI"], ["S-JM~S-SBI"]]);
  });
  it("keeps the selection when the mouse leaves, and moves it only when the selected key changes", () => {
    const { again } = mount();
    fireEvent.mouseEnter(cell("S-KOTAK", "S-JM"));
    fireEvent.mouseLeave(cell("S-KOTAK", "S-JM"));
    expect(cell("S-KOTAK", "S-SBI")).toHaveAttribute("aria-pressed", "true");
    again("S-JM~S-SBI");
    expect(cell("S-KOTAK", "S-SBI")).toHaveAttribute("aria-pressed", "false");
    expect(cell("S-JM", "S-SBI")).toHaveAttribute("aria-pressed", "true");
    expect(cell("S-SBI", "S-JM")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("the detail beside the grid", () => {
  it("is titled with both funds and shows the selected pair's overlap, the shared-stock count and its band", () => {
    mount();
    const detail = screen.getByTestId("pair-detail");
    expect(detail).toHaveAttribute("aria-label", "Kotak Multi Cap Fund × SBI Bluechip Fund shared holdings");
    expect(within(detail).getByRole("heading", { name: "Kotak Multi Cap Fund × SBI Bluechip Fund — shared holdings" })).toBeInTheDocument();
    expect(screen.getByTestId("pair-detail-summary")).toHaveTextContent("40.60% overlap · 12 shared stocks");
    expect(screen.getByTestId("pair-detail-band")).toHaveTextContent("High");
    expect(screen.getByTestId("pair-detail-band")).toHaveAttribute("data-band", "high");
  });
  it("lists the shared stocks largest shared weight first with each fund's weight", () => {
    mount();
    const items = within(screen.getByRole("list", { name: "Shared stocks" })).getAllByRole("listitem");
    expect(items).toHaveLength(12);
    expect(items[0]).toHaveTextContent("HDFC Bank Ltd");
    expect(items[0]).toHaveTextContent("KMC 7.80% · SB 9.20%");
    expect(items[1]).toHaveTextContent("ICICI Bank Ltd");
    expect(items[5]).toHaveTextContent("ITC Ltd");
    expect(screen.getByTestId("shared-INE030A01027")).toHaveTextContent("KMC 1.40% · SB 1.30%");
    expect(screen.queryByTestId("pair-detail-limit")).not.toBeInTheDocument();
  });
  it("follows the selection: a different pair gives its own title and stocks", () => {
    const { again } = mount();
    again("S-JM~S-SBI");
    expect(screen.getByRole("heading", { name: "JM Flexi Cap Fund × SBI Bluechip Fund — shared holdings" })).toBeInTheDocument();
    expect(screen.getByTestId("pair-detail-summary")).toHaveTextContent("26.40% overlap · 4 shared stocks");
    expect(screen.getByTestId("pair-detail-band")).toHaveTextContent("Moderate");
    expect(within(screen.getByRole("list", { name: "Shared stocks" })).getAllByRole("listitem")).toHaveLength(4);
  });
  it("says a pair shares nothing, and says one shared stock in the singular", () => {
    const { again } = mount();
    again("S-HDFC~S-KOTAK");
    expect(screen.getByTestId("pair-detail-none")).toHaveTextContent("No shared stocks between these two funds.");
    expect(screen.getByTestId("pair-detail-summary")).toHaveTextContent("0.00% overlap · 0 shared stocks");
    again("S-HDFC~S-JM");
    expect(screen.getByTestId("pair-detail-summary")).toHaveTextContent("3.10% overlap · 1 shared stock");
    expect(screen.getByTestId("pair-detail-summary")).not.toHaveTextContent("1 shared stocks");
  });
  it("says how many of the shared stocks are listed when the backend cut the list", () => {
    const data = fc.overlapSummary();
    data.matrix[2].common_total = 31;
    data.matrix[2].common_stocks = data.matrix[2].common_stocks.slice(0, 5);
    mount(data);
    expect(screen.getByTestId("pair-detail-limit")).toHaveTextContent("Showing the largest 5 of 31 shared stocks.");
    expect(screen.getByTestId("pair-detail-summary")).toHaveTextContent("31 shared stocks");
    expect(within(screen.getByRole("list", { name: "Shared stocks" })).getAllByRole("listitem")).toHaveLength(5);
  });
  it("shows the detail for a pair that has no cell in the grid and marks no cell", () => {
    const data = fc.overlapSummary();
    const outside = structuredClone(data.matrix[2]);
    outside.fund_a = { scheme_id: "S-X", scheme_name: "Outside One Fund", current_value: "1000.00" };
    outside.fund_b = { scheme_id: "S-Y", scheme_name: "Outside Two Fund", current_value: "900.00" };
    data.pairs_above_low.push(outside);
    mount(data, "S-X~S-Y");
    expect(screen.getByRole("heading", { name: "Outside One Fund × Outside Two Fund — shared holdings" })).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });
  it("shows no detail without a selection", () => {
    mount(fc.overlapSummary(), null);
    expect(screen.queryByTestId("pair-detail")).not.toBeInTheDocument();
  });
});

describe("states and rules", () => {
  it("keeps the heading while loading and offers Retry when the section failed", () => {
    const view = mount(null, null, "loading");
    expect(screen.getByRole("status", { name: "Loading 2. Overlap Heatmap" })).toBeInTheDocument();
    view.unmount();
    const { onRetry } = mount(null, null, "failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("marks every control with its effect and gives every inert element a tooltip (interactivity rule)", () => {
    const { container } = mount();
    expectInteractivity(container, 12);
    expect(container.querySelectorAll("button[data-effect=select]")).toHaveLength(12);
  });
});
