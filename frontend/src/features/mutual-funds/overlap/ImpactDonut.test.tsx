import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fc from "../fixtures/mfC";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { OverlapSummary } from "../types";
import { ImpactDonut } from "./ImpactDonut";

const mount = (data: OverlapSummary | null = fc.overlapSummary(), state: "loading" | "ready" | "failed" | "error" = "ready", onRetry = vi.fn()) =>
  renderInShell(<ImpactDonut state={state} data={data} onRetry={onRetry} />, { path: "/portfolio/mutual-funds/overlap" });
const row = (key: string) => screen.getByTestId(`impact-row-${key}`);

/** The fixture with a fourth pair above the low band between HDFC and JM, so the "other" row is not empty. */
function withOtherPair(): OverlapSummary {
  const data = fc.overlapSummary();
  const hdfcJm = data.matrix[3];
  hdfcJm.overlap_pct = "21.00";
  data.pairs_above_low.push(hdfcJm);
  return data;
}

describe("the card", () => {
  it("has the numbered heading, the info mark, the one-line description and the headline sentence", () => {
    mount();
    expect(screen.getByRole("heading", { name: "4. Overlap Impact" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /How much of your portfolio sits in funds that overlap/ })).toBeInTheDocument();
    expect(screen.getByText("How much of your portfolio sits in overlapping vs. unique holdings.")).toBeInTheDocument();
    expect(screen.getByTestId("impact-headline")).toHaveTextContent("71.8% of portfolio in top 3 overlapping pairs");
  });
  it("words the headline for two pairs and for one pair", () => {
    const two = fc.overlapSummary();
    two.pairs_above_low = two.pairs_above_low.slice(0, 2);
    const view = mount(two);
    expect(screen.getByTestId("impact-headline")).toHaveTextContent("71.8% of portfolio in top 2 overlapping pairs");
    view.unmount();
    const one = fc.overlapSummary();
    one.pairs_above_low = one.pairs_above_low.slice(0, 1);
    mount(one);
    expect(screen.getByTestId("impact-headline")).toHaveTextContent("50.7% of portfolio in top overlapping pair");
  });
  it("lists three rows with the share and the rupees: top three pairs, other pairs, unique holdings", () => {
    mount();
    const list = screen.getByRole("list", { name: "Overlap impact" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(["top3", "other", "unique"].map(key => row(key).textContent)).toEqual([
      "Top 3 overlapping pairs71.8%₹33,39,340", "Other overlapping pairs0.0%₹0", "Unique holdings28.2%₹13,10,000",
    ]);
  });
  it("counts the funds of a fourth pair under other pairs, and a fund already in the top pairs only once", () => {
    mount(withOtherPair());
    expect(screen.getByTestId("impact-value-top3")).toHaveTextContent("₹33,39,340");
    expect(screen.getByTestId("impact-value-other")).toHaveTextContent("₹13,10,000");
    expect(screen.getByTestId("impact-pct-other")).toHaveTextContent("28.2%");
    expect(screen.getByTestId("impact-value-unique")).toHaveTextContent("₹0");
    expect(screen.getByTestId("impact-pct-unique")).toHaveTextContent("0.0%");
  });
});

describe("the donut and the selection", () => {
  it("starts with the top-three row selected, its slice popped and the other slices dimmed, and its name in the centre", () => {
    mount();
    expect(row("top3")).toHaveAttribute("aria-pressed", "true");
    expect(row("top3")).toHaveAttribute("data-selected", "true");
    expect(row("other")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("slice-top3")).toHaveAttribute("data-dim", "false");
    expect(screen.getByTestId("slice-top3")).toHaveAttribute("data-popped", "true");
    expect(screen.getByTestId("slice-unique")).toHaveAttribute("data-dim", "true");
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Top 3 overlapping pairs");
    expect(screen.getByTestId("donut-centre-value")).toHaveTextContent("₹33.39 L");
    expect(screen.getByTestId("donut-centre-pct")).toHaveTextContent("71.8%");
  });
  it("selects a legend row on a click: the row stays selected, its slice pops and the centre changes to it", () => {
    mount();
    fireEvent.click(row("unique"));
    expect(row("unique")).toHaveAttribute("aria-pressed", "true");
    expect(row("top3")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("slice-unique")).toHaveAttribute("data-popped", "true");
    expect(screen.getByTestId("slice-top3")).toHaveAttribute("data-dim", "true");
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Unique holdings");
    expect(screen.getByTestId("donut-centre-pct")).toHaveTextContent("28.2%");
    fireEvent.mouseLeave(row("unique"));
    expect(row("unique")).toHaveAttribute("aria-pressed", "true");
  });
  it("selects the legend row when its slice is clicked", () => {
    mount();
    fireEvent.click(screen.getByTestId("slice-other"));
    expect(row("other")).toHaveAttribute("aria-pressed", "true");
    expect(row("top3")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Other overlapping pairs");
  });
  it("shows the same rupees and percent for a slice in the legend, the centre and the hover popup", () => {
    mount(withOtherPair());
    fireEvent.mouseEnter(screen.getByTestId("slice-other"));
    expect(screen.getByTestId("popup-value")).toHaveTextContent("₹13,10,000");
    expect(screen.getByTestId("popup-pct")).toHaveTextContent("28.2%");
    expect(screen.getByTestId("impact-value-other")).toHaveTextContent("₹13,10,000");
    expect(screen.getByTestId("impact-pct-other")).toHaveTextContent("28.2%");
  });
});

describe("states and rules", () => {
  it("says so, with no donut, when no pair overlaps above the low band", () => {
    const data = fc.overlapSummary();
    data.pairs_above_low = [];
    mount(data);
    expect(screen.getByTestId("impact-empty")).toHaveTextContent("No fund pairs overlap above the low band, so none of your portfolio sits in overlapping funds.");
    expect(screen.queryByTestId("slice-top3")).not.toBeInTheDocument();
    expect(screen.queryByTestId("impact-headline")).not.toBeInTheDocument();
  });
  it("keeps the heading while loading and offers Retry when the section failed", () => {
    const retry = vi.fn();
    const view = mount(null, "loading");
    expect(screen.getByRole("status", { name: "Loading 4. Overlap Impact" })).toBeInTheDocument();
    view.unmount();
    mount(null, "error", retry);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it("marks every control with its effect (interactivity rule)", () => {
    const { container } = mount();
    fireEvent.click(row("other"));
    expectInteractivity(container, 6);
  });
});
