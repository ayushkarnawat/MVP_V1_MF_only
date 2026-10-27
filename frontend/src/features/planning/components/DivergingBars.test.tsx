import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DivergingBars } from "./DivergingBars";
import type { BarRow } from "./DivergingBars";

const ROWS: BarRow[] = [
  { key: "equity", label: "Equity", value: "-10", text: "−₹10 −10.0%", tone: "loss" },
  { key: "debt", label: "Debt", value: "5", text: "+₹5 +5.0%", tone: "gain" },
];
const fill = (key: string) => screen.getByTestId(`bar-fill-${key}`);

describe("DivergingBars", () => {
  it("lists every row in the given order with its label and text", () => {
    render(<DivergingBars rows={ROWS} ariaLabel="Impact by asset class" />);
    const list = screen.getByRole("list", { name: "Impact by asset class" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Equity");
    expect(items[0]).toHaveTextContent("−₹10 −10.0%");
    expect(items[1]).toHaveTextContent("Debt");
    expect(screen.getByTestId("bar-text-debt")).toHaveTextContent("+₹5 +5.0%");
  });

  it("makes each row focusable with an accessible name made of its label and text", () => {
    render(<DivergingBars rows={ROWS} ariaLabel="Chart" />);
    const row = screen.getByRole("listitem", { name: "Equity, −₹10 −10.0%" });
    expect(row).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("listitem", { name: "Debt, +₹5 +5.0%" })).toHaveAttribute("tabindex", "0");
  });

  it("uses an explicit accessible name when one is given", () => {
    render(<DivergingBars rows={[{ ...ROWS[0], name: "Equity, −₹11,61,000, −27.0%" }]} ariaLabel="Chart" />);
    expect(screen.getByRole("listitem", { name: "Equity, −₹11,61,000, −27.0%" })).toBeInTheDocument();
  });

  it("draws a negative bar left of the zero line and a positive one right of it", () => {
    render(<DivergingBars rows={ROWS} ariaLabel="Chart" />);
    expect(fill("equity")).toHaveAttribute("data-side", "left");
    expect(fill("equity").style.right).toBe("33.33%");
    expect(fill("equity").style.width).toBe("66.67%");
    expect(fill("debt")).toHaveAttribute("data-side", "right");
    expect(fill("debt").style.left).toBe("66.67%");
    expect(fill("debt").style.width).toBe("33.33%");
  });

  it("puts a 1 px zero line at the same place in every row", () => {
    render(<DivergingBars rows={ROWS} ariaLabel="Chart" />);
    expect(screen.getByTestId("bar-zero-equity").style.left).toBe("66.67%");
    expect(screen.getByTestId("bar-zero-debt").style.left).toBe("66.67%");
  });

  it("scales every bar against the same range, so widths are proportional", () => {
    render(<DivergingBars rows={[
      { key: "a", label: "A", value: "-8", text: "a", tone: "loss" },
      { key: "b", label: "B", value: "-2", text: "b", tone: "loss" },
    ]} ariaLabel="Chart" />);
    expect(screen.getByTestId("bar-zero-a").style.left).toBe("100%");
    expect(fill("a").style.width).toBe("100%");
    expect(fill("b").style.width).toBe("25%");
    expect(fill("a").style.right).toBe("0%");
  });

  it("starts an all-positive chart at the left edge", () => {
    render(<DivergingBars rows={[{ key: "g", label: "G", value: "4", text: "g", tone: "gain" }]} ariaLabel="Chart" />);
    expect(screen.getByTestId("bar-zero-g").style.left).toBe("0%");
    expect(fill("g").style.left).toBe("0%");
    expect(fill("g").style.width).toBe("100%");
  });

  it("colours bars and values by tone with the shared tokens, never a raw colour", () => {
    render(<DivergingBars rows={[
      ...ROWS, { key: "nifty-50", label: "Nifty 50", value: "-30.2", text: "−30.2%", tone: "index" },
    ]} ariaLabel="Chart" />);
    expect(fill("equity")).toHaveClass("bg-[var(--neg)]");
    expect(fill("debt")).toHaveClass("bg-[var(--pos)]");
    expect(fill("nifty-50")).toHaveClass("bg-[var(--c3)]");
    expect(fill("nifty-50")).toHaveAttribute("data-tone", "index");
    expect(screen.getByTestId("bar-text-equity")).toHaveClass("text-[var(--neg-text)]");
    expect(screen.getByTestId("bar-text-debt")).toHaveClass("text-[var(--pos-text)]");
    expect(screen.getByTestId("bar-text-nifty-50")).toHaveClass("text-[var(--ui-text)]");
  });

  it("draws a zero value as an empty bar on the right", () => {
    render(<DivergingBars rows={[...ROWS, { key: "other", label: "Other", value: "0.00", text: "₹0", tone: "gain" }]} ariaLabel="Chart" />);
    expect(fill("other")).toHaveAttribute("data-side", "right");
    expect(fill("other").style.width).toBe("0%");
  });

  it("shows a message and no bars when nothing changed", () => {
    render(<DivergingBars rows={[
      { key: "a", label: "A", value: "0.00", text: "₹0", tone: "gain" },
      { key: "b", label: "B", value: "-0.00", text: "₹0", tone: "gain" },
    ]} ariaLabel="Chart" />);
    expect(screen.getByText("No change to show")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByTestId("bar-fill-a")).toBeNull();
  });

  it("shows the same message for no rows at all", () => {
    render(<DivergingBars rows={[]} ariaLabel="Chart" />);
    expect(screen.getByText("No change to show")).toBeInTheDocument();
  });

  it("has no tooltip on a row (L40)", () => {
    render(<DivergingBars rows={ROWS} ariaLabel="Chart" />);
    for (const row of screen.getAllByRole("listitem")) {
      expect(row).not.toHaveAttribute("title");
      expect(row.querySelector("[title]")).toBeNull();
    }
  });

  it("hides the drawn track from assistive technology, because the text carries the value", () => {
    render(<DivergingBars rows={ROWS} ariaLabel="Chart" />);
    expect(screen.getByTestId("bar-track-equity")).toHaveAttribute("aria-hidden", "true");
  });
});
