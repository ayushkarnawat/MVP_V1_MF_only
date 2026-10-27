import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fc from "../fixtures/mfC";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { OverlapPair, OverlapSummary } from "../types";
import { TopPairs } from "./TopPairs";

const TOP = "S-KOTAK~S-SBI";
const mount = (data: OverlapSummary | null = fc.overlapSummary(), selectedKey: string | null = TOP, state: "loading" | "ready" | "failed" | "error" = "ready", onSelect = vi.fn(), onRetry = vi.fn()) => {
  const view = renderInShell(<TopPairs state={state} data={data} onRetry={onRetry} selectedKey={selectedKey} onSelect={onSelect} />, { path: "/portfolio/mutual-funds/overlap" });
  return { ...view, onSelect, onRetry, again: (key: string | null) => view.rerender(<TopPairs state={state} data={data} onRetry={onRetry} selectedKey={key} onSelect={onSelect} />) };
};
const rows = () => screen.getAllByTestId(/^pair-row-/).map(row => row.getAttribute("data-testid")!.replace("pair-row-", ""));

/** The fixture's three pairs above the low band plus four more (overlap 22 to 28), each between two made-up funds. */
function manyPairs(): OverlapSummary {
  const data = fc.overlapSummary();
  [28, 27, 25, 22].forEach((overlap, index) => {
    const extra: OverlapPair = structuredClone(data.pairs_above_low[2]);
    extra.fund_a = { scheme_id: `S-A${index}`, scheme_name: `Alpha ${index} Fund`, current_value: "100000.00" };
    extra.fund_b = { scheme_id: `S-B${index}`, scheme_name: `Beta ${index} Fund`, current_value: "50000.00" };
    extra.overlap_pct = `${overlap}.00`;
    data.pairs_above_low.push(extra);
  });
  return data;
}

describe("the table", () => {
  it("has the numbered heading, the info mark and the six columns", () => {
    mount();
    expect(screen.getByRole("heading", { name: "3. Top Overlapping Fund Pairs" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /pairs of your funds that share the most/i })).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Top overlapping fund pairs" })).getAllByRole("columnheader").map(h => h.textContent)).toEqual(
      ["#", "Fund 1", "Fund 2", "Overlap", "Shared Stocks", "Combined Weight"]);
  });
  it("lists the pairs above the low band largest overlap first, numbered, with both fund names", () => {
    mount();
    expect(rows()).toEqual([TOP, "S-JM~S-SBI", "S-JM~S-KOTAK"]);
    const first = screen.getByTestId(`pair-row-${TOP}`);
    expect(first).toHaveTextContent("1");
    expect(first).toHaveTextContent("Kotak Multi Cap Fund");
    expect(first).toHaveTextContent("SBI Bluechip Fund");
    expect(screen.getByTestId("pair-row-S-JM~S-SBI")).toHaveTextContent("2");
    expect(screen.getByTestId("pair-row-S-JM~S-KOTAK")).toHaveTextContent("JM Flexi Cap Fund");
  });
  it("shows the overlap in whole percent, the shared stock count and the combined weight to one place", () => {
    mount();
    expect([TOP, "S-JM~S-SBI", "S-JM~S-KOTAK"].map(key => screen.getByTestId(`pair-overlap-${key}`).textContent)).toEqual(["41%", "26%", "24%"]);
    expect([TOP, "S-JM~S-SBI", "S-JM~S-KOTAK"].map(key => screen.getByTestId(`pair-shared-${key}`).textContent)).toEqual(["12", "4", "4"]);
    expect([TOP, "S-JM~S-SBI", "S-JM~S-KOTAK"].map(key => screen.getByTestId(`pair-combined-${key}`).textContent)).toEqual(["50.7%", "38.7%", "54.2%"]);
  });
  it("draws a coloured bar as wide as the overlap, banded from the payload", () => {
    mount();
    expect(screen.getByTestId(`pair-bar-${TOP}`)).toHaveStyle({ width: "40.6%" });
    expect(screen.getByTestId(`pair-bar-${TOP}`)).toHaveAttribute("data-band", "high");
    expect(screen.getByTestId("pair-bar-S-JM~S-SBI")).toHaveStyle({ width: "26.4%" });
    expect(screen.getByTestId("pair-bar-S-JM~S-SBI")).toHaveAttribute("data-band", "moderate");
    const data = fc.overlapSummary();
    data.bands = { low: "20", high: "25" };
    mount(data);
    expect(screen.getAllByTestId("pair-bar-S-JM~S-SBI").map(bar => bar.getAttribute("data-band"))).toEqual(["moderate", "high"]);
  });
});

describe("selecting a pair", () => {
  it("marks the selected pair's row and button as pressed and the others not", () => {
    mount();
    expect(screen.getByTestId(`pair-button-${TOP}`)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId(`pair-row-${TOP}`)).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("pair-button-S-JM~S-SBI")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("pair-row-S-JM~S-SBI")).toHaveAttribute("data-selected", "false");
  });
  it("names the button after both funds and reports the pair key on a click", () => {
    const { onSelect } = mount();
    const button = screen.getByRole("button", { name: "JM Flexi Cap Fund × SBI Bluechip Fund" });
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("S-JM~S-SBI");
  });
  it("follows the selected key it is given (the heatmap and this table share one selection)", () => {
    const { again } = mount();
    again("S-JM~S-KOTAK");
    expect(screen.getByTestId(`pair-button-${TOP}`)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("pair-button-S-JM~S-KOTAK")).toHaveAttribute("aria-pressed", "true");
    again(null);
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });
});

describe("View all fund overlaps", () => {
  it("shows five pairs, then all seven after View all fund overlaps →, and Show fewer goes back", () => {
    mount(manyPairs());
    expect(rows()).toHaveLength(5);
    expect(rows()[0]).toBe(TOP);
    const button = screen.getByRole("button", { name: "View all fund overlaps →" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(rows()).toHaveLength(7);
    expect(rows().slice(5)).toEqual(["S-JM~S-KOTAK", "S-A3~S-B3"]);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(rows()).toHaveLength(5);
  });
  it("has no button with five pairs or fewer", () => {
    mount();
    expect(screen.queryByRole("button", { name: /View all fund overlaps/ })).not.toBeInTheDocument();
  });
});

describe("the key insights callout", () => {
  it("lists the three sentences, built from the payload's numbers, under a Key insights: heading", () => {
    mount();
    const callout = screen.getByRole("complementary", { name: "Key insights" });
    expect(within(callout).getByRole("heading", { name: "Key insights:" })).toBeInTheDocument();
    expect(within(callout).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Kotak Multi Cap Fund and SBI Bluechip Fund share 41% overlap — together they account for 51% of your portfolio, so a correction in their shared holdings would hit both at once.",
      "Funds in your top 3 overlapping pairs hold 71.8% of your portfolio value.",
      "HDFC Mid-Cap Opportunities Fund has the lowest overlap with the rest of your portfolio — it is doing the most diversification work.",
    ]);
  });
  it("changes with the data: a different top pair and different numbers give different sentences", () => {
    const data = fc.overlapSummary();
    data.pairs_above_low = [data.matrix[1]];
    mount(data);
    expect(screen.getByRole("complementary", { name: "Key insights" })).toHaveTextContent("Kotak Multi Cap Fund and JM Flexi Cap Fund share 24% overlap — together they account for 54% of your portfolio");
    expect(screen.getByRole("complementary", { name: "Key insights" })).toHaveTextContent("Funds in your top overlapping pair hold 54.2% of your portfolio value.");
  });
});

describe("states", () => {
  it("says there are no pairs above the threshold and shows neither a table nor insights", () => {
    const data = fc.overlapSummary();
    data.pairs_above_low = [];
    mount(data, null);
    expect(screen.getByTestId("pairs-empty")).toHaveTextContent("No pairs above this threshold.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Key insights" })).not.toBeInTheDocument();
  });
  it("keeps the heading while loading and offers Retry when the section failed", () => {
    const view = mount(null, null, "loading");
    expect(screen.getByRole("status", { name: "Loading 3. Top Overlapping Fund Pairs" })).toBeInTheDocument();
    view.unmount();
    const { onRetry } = mount(null, null, "failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("marks every control with its effect (interactivity rule)", () => {
    const { container } = mount(manyPairs());
    fireEvent.click(screen.getByRole("button", { name: "View all fund overlaps →" }));
    expectInteractivity(container, 8);
  });
});
