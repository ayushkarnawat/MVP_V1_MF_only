import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { CompositionResponse, TopHolding } from "../types";
import { SliceDialog, StockDialog } from "./holdingDialogs";

const top10 = () => fixture<CompositionResponse>("composition").top10;
const stock = (over: Partial<TopHolding> = {}): TopHolding => ({ name: "Example Ltd", isin: "INE000A01010", sector: "Energy", weight: "5.1000", ...over });

describe("StockDialog", () => {
  it("renders nothing without a holding", () => {
    render(<StockDialog holding={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the weight to two places, the sector and the ISIN, and closes", () => {
    const onClose = vi.fn();
    render(<StockDialog holding={stock()} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Example Ltd" });
    expect(within(dialog).getByText("Weight in this fund", { selector: "dt" }).nextElementSibling).toHaveTextContent("5.10%");
    expect(within(dialog).getByText("Sector", { selector: "dt" }).nextElementSibling).toHaveTextContent("Energy");
    expect(within(dialog).getByText("ISIN", { selector: "dt" }).nextElementSibling).toHaveTextContent("INE000A01010");
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves out an empty ISIN and dashes an empty sector", () => {
    render(<StockDialog holding={stock({ isin: "", sector: "" })} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("ISIN", { selector: "dt" })).toBeNull();
    expect(within(dialog).getByText("Sector", { selector: "dt" }).nextElementSibling).toHaveTextContent("—");
  });
});

describe("SliceDialog", () => {
  it("renders nothing without a slice", () => {
    render(<SliceDialog slice={null} top10={top10()} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a market-cap or asset-type slice shows its share only", () => {
    render(<SliceDialog slice={{ tab: "market_cap", label: "Mid Cap", pct: "20.0000" }} top10={top10()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Mid Cap (20.0%)" });
    expect(within(dialog).getByText("Share of classified equity", { selector: "dt" }).nextElementSibling).toHaveTextContent("20.0%");
    expect(within(dialog).queryByText("Top 10 holdings in this sector")).toBeNull();
  });

  it("a sector slice also lists the top-10 holdings that belong to it", () => {
    render(<SliceDialog slice={{ tab: "sector", label: "Energy", pct: "8.1000" }} top10={top10()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Energy (8.1%)" });
    expect(within(dialog).getAllByRole("listitem").map(li => li.textContent)).toEqual(["Reliance Industries Ltd5.1%"]);
  });
});
