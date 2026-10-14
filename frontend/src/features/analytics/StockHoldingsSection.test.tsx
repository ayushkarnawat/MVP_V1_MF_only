import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StockHoldingsSection } from "./StockHoldingsSection";
import { sampleStockHoldings } from "./stockHoldingsTestData";

describe("StockHoldingsSection", () => {
  it("renders loading, empty and unavailable states", () => {
    const { rerender } = render(<StockHoldingsSection data={null} isLoading />);
    expect(screen.getByLabelText("Loading overall stock holdings")).toBeInTheDocument();
    rerender(<StockHoldingsSection data={null} />);
    expect(screen.getByText("No stock holdings data available")).toBeInTheDocument();
    rerender(<StockHoldingsSection data={{ ...sampleStockHoldings, rows: [], total_stock_count: 0 }} />);
    expect(screen.getByText("No equity stocks disclosed for this selection")).toBeInTheDocument();
    expect(screen.getByText("Based on 100.0% of your portfolio")).toBeInTheDocument();
  });

  it("renders exact weighted segments, fund legend, dates and drill-down", () => {
    render(<StockHoldingsSection data={sampleStockHoldings} />);
    expect(screen.getByRole("heading", { name: "Overall stock holdings" })).toBeInTheDocument();
    expect(screen.getByText(/Top 10 stocks represent 6.55%/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Reliance Industries.*Fund A: 3.20%.*Fund B: 2.10%.*Fund C: 1.25%/ })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Fund legend")).getByText("Fund A")).toBeInTheDocument();
    expect(screen.getByText(/Values as on 13 Oct 2026.*Holdings as on 31 Mar 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /12.00%.*non-equity/ })).toHaveAttribute("href", "#asset-allocation");
    const stock = screen.getByRole("button", { name: /Reliance Industries.*6.55%/ });
    fireEvent.click(stock);
    expect(stock).toHaveAttribute("aria-expanded", "true");
    const detail = screen.getByLabelText("Funds holding Reliance Industries");
    expect(within(detail).getByText(/Fund B.*older than 60 days/)).toBeInTheDocument();
    expect(within(detail).getByText(/Fund C.*on its half-yearly cycle/)).toBeInTheDocument();
    expect(within(detail).getByText(/8.00% of fund.*3.20% of portfolio/)).toBeInTheDocument();
  });

  it("searches stored rows by name, ISIN, sector and fund with an explicit no-match state", () => {
    render(<StockHoldingsSection data={sampleStockHoldings} />);
    fireEvent.click(screen.getByRole("button", { name: "View all" }));
    const table = screen.getByRole("table", { name: "All stored stock holdings" });
    expect(within(table).getByRole("columnheader", { name: "Sector" })).toBeInTheDocument();
    expect(within(table).getByText("Petroleum Products")).toBeInTheDocument();
    expect(within(table).getByText("₹65,500")).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Search stocks" });
    for (const query of ["reliance", "INE002A01018", "petroleum", "Fund B"]) {
      fireEvent.change(search, { target: { value: query } });
      expect(within(table).getByText("Reliance Industries")).toBeInTheDocument();
    }
    fireEvent.change(search, { target: { value: "no match" } });
    expect(screen.getByText("No stocks match your search")).toBeInTheDocument();
  });

  it("shows only top 10 bars but searches the complete stored payload and reports truncation", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ ...sampleStockHoldings.rows[0], isin: `ISIN${i}`, instrument_name: `Stock ${i}`, exposure_pct: String(100 - i) }));
    render(<StockHoldingsSection data={{ ...sampleStockHoldings, rows: rows.reverse(), truncated: true, total_stock_count: 150 }} />);
    expect(screen.getAllByRole("img")).toHaveLength(10);
    expect(screen.getByText("Showing the top 100 of 150 stocks; your full portfolio is longer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stock 0.*100.00%/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View all" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search stocks" }), { target: { value: "ISIN99" } });
    expect(within(screen.getByRole("table")).getByText("Stock 99")).toBeInTheDocument();
    const stock = within(screen.getByRole("table")).getByRole("button", { name: "Stock 99" });
    fireEvent.click(stock);
    expect(stock).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("table")).getByLabelText("Funds holding Stock 99")).toBeInTheDocument();
  });

  it("opens a stock’s fund breakdown when its bar is clicked", () => {
    render(<StockHoldingsSection data={sampleStockHoldings} />);
    fireEvent.click(screen.getByRole("img", { name: /Reliance Industries/ }));
    expect(screen.getByLabelText("Funds holding Reliance Industries")).toBeInTheDocument();
  });

  it("hides headlines below the coverage threshold while keeping rows, banner and notes", () => {
    render(<StockHoldingsSection data={{ ...sampleStockHoldings, hide_headlines: true,
      coverage: { ...sampleStockHoldings.coverage, covered_value_pct: "40", not_published_yet: [{ scheme_id: "d", scheme_name: "Pending Fund" }] } }} />);
    expect(screen.queryByText(/Top 10 stocks represent/)).not.toBeInTheDocument();
    expect(screen.getByText("Based on 40.0% of your portfolio")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reliance Industries/ })).toBeInTheDocument();
    expect(screen.getByText(/Pending Fund.*not published yet/)).toBeInTheDocument();
  });
});
