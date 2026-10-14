import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ValuationSection } from "./ValuationSection";
import { sampleValuation } from "./valuationTestData";

describe("ValuationSection", () => {
  it("handles loading, unavailable and no equity", () => {
    const { rerender } = render(<ValuationSection data={null} isLoading />);
    expect(screen.getByLabelText("Loading portfolio valuation")).toBeInTheDocument();
    rerender(<ValuationSection data={null} />);
    expect(screen.getByText("No portfolio valuation data available")).toBeInTheDocument();
    rerender(<ValuationSection data={{ ...sampleValuation, total_equity_value: "0" }} />);
    expect(screen.getByText("No equity holdings for this selection")).toBeInTheDocument();
  });
  it("renders two ratio comparisons, both indices, exact deltas and sources", () => {
    render(<ValuationSection data={sampleValuation} />);
    const pe = screen.getByRole("group", { name: "P/E valuation" });
    const pb = screen.getByRole("group", { name: "P/B valuation" });
    expect(within(pe).getByText("25.00x")).toBeInTheDocument();
    expect(within(pb).getByText("3.35x")).toBeInTheDocument();
    expect(within(pe).getByText("Nifty 50")).toBeInTheDocument();
    expect(within(pe).getByText("Nifty 500")).toBeInTheDocument();
    expect(within(pb).getByText("Nifty 50")).toBeInTheDocument();
    expect(within(pb).getByText("Nifty 500")).toBeInTheDocument();
    expect(screen.getByText(/9.65% more expensive on earnings than Nifty 50/)).toBeInTheDocument();
    expect(screen.getByText(/P\/E from NSE.*P\/B from Yahoo Finance/)).toBeInTheDocument();
    expect(screen.getByText(/Some P\/B values use screener.in/)).toBeInTheDocument();
    expect(screen.getByText(/Loss Stock.*negative earnings/)).toBeInTheDocument();
  });
  it("handles separate insufficient coverage and missing holdings reasons", () => {
    render(<ValuationSection data={{ ...sampleValuation, pb: { ...sampleValuation.pb, ratio: null, enough_data: false, coverage_pct: "60", missing: [{ isin: "B", instrument_name: "Merged Stock", exposure_value: "240", percentage_equity: "40", reason: "delisted/merged" }] } }} />);
    expect(within(screen.getByRole("group", { name: "P/B valuation" })).getByText(/Not enough data/)).toBeInTheDocument();
    expect(screen.getByText(/Merged Stock.*delisted\/merged/)).toBeInTheDocument();
    expect(screen.getByText("25.00x")).toBeInTheDocument();
  });
  it("hides ratios and deltas with partial disclosure coverage", () => {
    render(<ValuationSection data={{ ...sampleValuation, hide_headlines: true, coverage: { ...sampleValuation.coverage, covered_value_pct: "40" } }} />);
    expect(screen.getByText("Based on 40.0% of your portfolio")).toBeInTheDocument();
    expect(screen.queryByText("25.00x")).not.toBeInTheDocument();
    expect(screen.queryByText("3.35x")).not.toBeInTheDocument();
    expect(screen.queryByText(/more expensive/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Portfolio ratio hidden/)).toHaveLength(2);
  });
  it("handles missing index data and exact scientific/negative delta strings", () => {
    render(<ValuationSection data={{ ...sampleValuation, pe: { ...sampleValuation.pe, ratio: "2.5E1" }, indices: sampleValuation.indices.map(i => i.index_name === "nifty_50" ? { ...i, pe_delta_pct: "-1E-2" } : { ...i, pe_ratio: null, pe_delta_pct: null }) }} />);
    expect(screen.getByText("25.00x")).toBeInTheDocument();
    expect(screen.getByText(/0.01% cheaper on earnings than Nifty 50/)).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });
});
