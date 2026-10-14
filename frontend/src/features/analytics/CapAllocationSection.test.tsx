import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapAllocationSection } from "./CapAllocationSection";
import { sampleCapAllocation } from "./capAllocationTestData";

describe("CapAllocationSection", () => {
  it("handles loading, unavailable and zero-equity states", () => {
    const { rerender } = render(<CapAllocationSection data={null} isLoading />);
    expect(screen.getByLabelText("Loading market-cap allocation")).toBeInTheDocument();
    rerender(<CapAllocationSection data={null} />);
    expect(screen.getByText("No market-cap allocation data available")).toBeInTheDocument();
    rerender(<CapAllocationSection data={{ ...sampleCapAllocation, total_portfolio_value: "0", total_equity_value: "0" }} />);
    expect(screen.getByText("No holdings for this selection")).toBeInTheDocument();
    rerender(<CapAllocationSection data={{ ...sampleCapAllocation, total_equity_value: "0" }} />);
    fireEvent.click(screen.getByRole("button", { name: "% of equity only" }));
    expect(screen.getByText("No equity holdings for this selection")).toBeInTheDocument();
  });
  it("says so when a drill-down list is capped, on screen and in print", () => {
    const capped = { ...sampleCapAllocation, buckets: sampleCapAllocation.buckets.map((b) => b.key === "LARGE" ? { ...b, row_count: 120 } : b) };
    const { unmount } = render(<CapAllocationSection data={capped} />);
    fireEvent.click(screen.getByRole("button", { name: /Large Cap/ }));
    expect(screen.getByText("Showing the largest 1 of 120 holdings in this group.")).toBeInTheDocument();
    unmount();
    render(<CapAllocationSection data={capped} printMode />);
    expect(screen.getByText("Top 1 of 120 shown.")).toBeInTheDocument();
  });
  it("renders one Other slice, exact denominator values, dates and no Nifty strip", () => {
    render(<CapAllocationSection data={sampleCapAllocation} />);
    const legend = screen.getByLabelText("Market-cap breakdown");
    expect(within(legend).getAllByRole("button")).toHaveLength(4);
    expect(within(legend).getByRole("button", { name: /Large Cap.*40.00%/ })).toBeInTheDocument();
    expect(within(legend).getByRole("button", { name: /Other \/ Unclassified.*30.00%/ })).toBeInTheDocument();
    expect(screen.getByText(/AMFI classification effective from 1 Jan 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "% of equity only" }));
    expect(within(legend).getByRole("button", { name: /Large Cap.*50.00%/ })).toBeInTheDocument();
    expect(within(legend).getByRole("button", { name: /Other \/ Unclassified.*12.50%/ })).toBeInTheDocument();
    expect(screen.queryByText(/Nifty 500/)).not.toBeInTheDocument();
  });
  it("splits Other into non-equity and unmapped equity with stock/fund drill-down", () => {
    render(<CapAllocationSection data={sampleCapAllocation} />);
    fireEvent.click(screen.getByRole("button", { name: /Other \/ Unclassified.*30.00%/ }));
    expect(screen.getByRole("heading", { name: "Not equity (debt, cash, gold, REITs)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Equity not in AMFI list" })).toBeInTheDocument();
    expect(screen.getByText("₹200")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Equity not in AMFI list" }).nextElementSibling).toHaveTextContent("₹100");
    fireEvent.click(screen.getByRole("button", { name: /Foreign Stock/ }));
    expect(screen.getByText("Fund A")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "% of equity only" }));
    expect(screen.getByText("Excluded from the equity-only view")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Cash/ })).not.toBeInTheDocument();
  });
  it("shows classified stocks and hides headline sentences with partial coverage", () => {
    render(<CapAllocationSection data={{ ...sampleCapAllocation, hide_headlines: true,
      coverage: { ...sampleCapAllocation.coverage, covered_value_pct: "40" } }} />);
    expect(screen.queryByText(/Largest allocation:/)).not.toBeInTheDocument();
    expect(screen.getByText("Based on 40.0% of your portfolio")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Large Cap.*40.00%/ }));
    expect(screen.getByRole("button", { name: /Large Stock/ })).toBeInTheDocument();
  });
  it("does not mistake scientific Decimal strings for zero equity", () => {
    render(<CapAllocationSection data={{ ...sampleCapAllocation, total_equity_value: "1E-7", total_portfolio_value: "1E-2" }} />);
    fireEvent.click(screen.getByRole("button", { name: "% of equity only" }));
    expect(screen.queryByText("No equity holdings for this selection")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Large Cap.*50.00%/ })).toBeInTheDocument();
  });
});
