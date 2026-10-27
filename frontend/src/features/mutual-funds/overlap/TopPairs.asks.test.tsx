import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fa from "../fixtures/mfAsks";
import * as fc from "../fixtures/mfC";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { OverlapSummary } from "../types";
import { TopPairs } from "./TopPairs";

const TOP = "S-KOTAK~S-SBI";
const EDGE = "S-HDFC~S-SBI";
const mount = (data: OverlapSummary | null, selectedKey: string | null = TOP, onSelect = vi.fn()) =>
  renderInShell(<TopPairs state="ready" data={data} onRetry={vi.fn()} selectedKey={selectedKey} onSelect={onSelect} />, { path: "/portfolio/mutual-funds/overlap" });
const rows = () => screen.getAllByTestId(/^pair-row-/).map(row => row.getAttribute("data-testid")!.replace("pair-row-", ""));

describe("the pairs at exactly the low band", () => {
  it("are listed after the pairs above it, numbered in order, because the list is inclusive", () => {
    mount(fa.overlapSummaryWithAsks());
    expect(rows()).toEqual([TOP, "S-JM~S-SBI", "S-JM~S-KOTAK", EDGE]);
    expect(screen.getByTestId(`pair-row-${EDGE}`).querySelector("td")).toHaveTextContent("4");
  });
  it("show their own overlap, shared stocks, combined weight and band", () => {
    mount(fa.overlapSummaryWithAsks());
    expect(screen.getByTestId(`pair-overlap-${EDGE}`)).toHaveTextContent("20%");
    expect(screen.getByTestId(`pair-shared-${EDGE}`)).toHaveTextContent("3");
    expect(screen.getByTestId(`pair-combined-${EDGE}`)).toHaveTextContent("45.8%");
    expect(screen.getByTestId(`pair-bar-${EDGE}`)).toHaveAttribute("data-band", "moderate");
    expect(screen.getByTestId(`pair-bar-${EDGE}`)).toHaveStyle({ width: "20%" });
    expect(screen.getByTestId(`pair-row-${EDGE}`)).toHaveTextContent("HDFC Mid-Cap Opportunities Fund");
    expect(screen.getByTestId(`pair-row-${EDGE}`)).toHaveTextContent("SBI Bluechip Fund");
  });
  it("can be selected like any other pair", () => {
    const onSelect = vi.fn();
    mount(fa.overlapSummaryWithAsks(), TOP, onSelect);
    fireEvent.click(screen.getByTestId(`pair-button-${EDGE}`));
    expect(onSelect).toHaveBeenCalledWith(EDGE);
  });
  it("show the selected state on their row", () => {
    mount(fa.overlapSummaryWithAsks(), EDGE);
    expect(screen.getByTestId(`pair-row-${EDGE}`)).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId(`pair-button-${EDGE}`)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId(`pair-row-${TOP}`)).toHaveAttribute("data-selected", "false");
  });
  it("count towards the five-row limit like any other pair", () => {
    const data = fa.overlapSummaryWithAsks();
    ["S-X1", "S-X2", "S-X3"].forEach((id, index) => {
      const extra = structuredClone(data.pairs_above_low[2]);
      extra.fund_a = { scheme_id: id, scheme_name: `Alpha ${index}`, current_value: "1000.00" };
      extra.fund_b = { scheme_id: `${id}b`, scheme_name: `Beta ${index}`, current_value: "1000.00" };
      extra.overlap_pct = `${30 + index}.00`;
      data.pairs_above_low.push(extra);
    });
    mount(data);
    expect(rows()).toHaveLength(5);
    expect(rows()).not.toContain(EDGE);
    fireEvent.click(screen.getByRole("button", { name: "View all fund overlaps →" }));
    expect(rows()).toHaveLength(7);
    expect(rows()[6]).toBe(EDGE);
  });
  it("do not change the key insights, which stay about the pairs above the low band", () => {
    const first = mount(fc.overlapSummary());
    const plain = screen.getByTestId("key-insights").textContent;
    first.unmount();
    mount(fa.overlapSummaryWithAsks());
    expect(screen.getByTestId("key-insights").textContent).toBe(plain);
  });
});

describe("when there is nothing above the low band", () => {
  it("lists a lone pair at the band instead of saying there are none", () => {
    const data = fa.overlapSummaryWithAsks();
    data.pairs_above_low = [];
    mount(data, EDGE);
    expect(rows()).toEqual([EDGE]);
    expect(screen.queryByTestId("pairs-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("key-insights")).not.toBeInTheDocument();
  });
  it("still says so when the boundary list is empty too", () => {
    const data = fa.overlapSummaryWithAsks();
    data.pairs_above_low = [];
    data.pairs_at_low_boundary = [];
    mount(data, null);
    expect(screen.getByTestId("pairs-empty")).toHaveTextContent("No pairs above this threshold.");
  });
});

describe("on an old payload and with the field null", () => {
  it("lists only the strict pairs", () => {
    const first = mount(fc.overlapSummary());
    expect(rows()).toEqual([TOP, "S-JM~S-SBI", "S-JM~S-KOTAK"]);
    first.unmount();
    const nulled = fc.overlapSummary();
    nulled.pairs_at_low_boundary = null;
    mount(nulled);
    expect(rows()).toEqual([TOP, "S-JM~S-SBI", "S-JM~S-KOTAK"]);
  });
  it("keeps every control marked", () => {
    const { container } = mount(fa.overlapSummaryWithAsks());
    expectInteractivity(container, 4);
  });
});
