import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverlapSection } from "./OverlapSection";
import { sampleOverlap } from "./overlapTestData";

describe("OverlapSection", () => {
  it("shows loading, unavailable, and fewer-than-two published funds", () => {
    const { rerender } = render(<OverlapSection data={null} isLoading />);
    expect(screen.getByLabelText("Loading fund overlap")).toBeInTheDocument();
    rerender(<OverlapSection data={null} />);
    expect(screen.getByText("No fund overlap data available")).toBeInTheDocument();
    rerender(<OverlapSection data={{ ...sampleOverlap, total_fund_count: 1, matrix_funds: sampleOverlap.matrix_funds.slice(0, 1), matrix: [], pairs_above_low: [] }} />);
    expect(screen.getByText(/Overlap needs at least two funds with published holdings/)).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Fund overlap heatmap" })).not.toBeInTheDocument();
  });
  it("renders symmetric cells, omits diagonal, and opens precomputed common stocks", () => {
    render(<OverlapSection data={sampleOverlap} />);
    const table = screen.getByRole("table", { name: "Fund overlap heatmap" });
    expect(within(table).getAllByRole("button", { name: /Fund A.*Fund B.*42.00%/ })).toHaveLength(2);
    expect(within(table).queryByRole("button", { name: /Fund A.*Fund A/ })).not.toBeInTheDocument();
    fireEvent.click(within(table).getAllByRole("button", { name: /Fund A.*Fund B.*42.00%/ })[1]);
    expect(screen.getByRole("table", { name: "Common stocks for Fund A and Fund B" })).toBeInTheDocument();
    expect(screen.getByText("Reliance Industries")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Common stock breakdown" })).toHaveFocus();
    expect(screen.getByText("8.00%")).toBeInTheDocument();
    expect(screen.getByText("6.00%")).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 25 common stocks/)).toBeInTheDocument();
    expect(screen.getByText(/70%-equity fund can overlap by at most 70%/)).toBeInTheDocument();
  });
  it("uses payload bands for exact boundary colours and shows cap/all-pairs list", () => {
    render(<OverlapSection data={{ ...sampleOverlap, matrix_truncated: true, total_fund_count: 15, bands: { low: "20", high: "42" } }} />);
    const table = screen.getByRole("table", { name: "Fund overlap heatmap" });
    expect(within(table).getAllByRole("button", { name: /42.00%/ })[0]).toHaveAttribute("data-band", "high");
    expect(within(table).getAllByRole("button", { name: /20.00%/ })[0]).toHaveAttribute("data-band", "moderate");
    expect(within(table).getAllByRole("button", { name: /10.00%/ })[0]).toHaveAttribute("data-band", "low");
    expect(screen.getByText(/Top 12 funds by value/)).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Pairs above 20%" });
    fireEvent.click(within(list).getByRole("button", { name: /Fund A.*Fund B/ }));
    expect(screen.getByText("Reliance Industries")).toBeInTheDocument();
  });
  it("hides headlines with partial coverage while preserving heatmap and banner", () => {
    render(<OverlapSection data={{ ...sampleOverlap, hide_headlines: true, coverage: { ...sampleOverlap.coverage, covered_value_pct: "40" } }} />);
    expect(screen.getByText("Based on 40.0% of your portfolio")).toBeInTheDocument();
    expect(screen.queryByText(/Top 10 stocks represent/)).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Fund overlap heatmap" })).toBeInTheDocument();
  });
  it("clears stale pair details", () => {
    const { rerender } = render(<OverlapSection data={sampleOverlap} />);
    const table = screen.getByRole("table", { name: "Fund overlap heatmap" });
    fireEvent.click(within(table).getAllByRole("button", { name: /42.00%/ })[0]);
    rerender(<OverlapSection data={{ ...sampleOverlap, matrix: [], pairs_above_low: [] }} />);
    expect(screen.queryByText("Reliance Industries")).not.toBeInTheDocument();
  });
  it("handles scientific decimal bands without using floats for display or comparison", () => {
    render(<OverlapSection data={{ ...sampleOverlap, bands: { low: "2E1", high: "4.2E1" } }} />);
    expect(screen.getByRole("region", { name: "Pairs above 20%" })).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Fund overlap heatmap" })).getAllByRole("button", { name: /42.00%/ })[0]).toHaveAttribute("data-band", "high");
  });
});


describe("T1.5 legacy removal", () => {
  it("legacy_overlap_section_no_longer_renders_concentration", () => {
    render(<OverlapSection data={sampleOverlap} />);
    expect(screen.getByRole("table", { name: "Fund overlap heatmap" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /stock concentration/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cumulative stock exposure curve")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view concentration|Top 10 stocks represent/i })).not.toBeInTheDocument();
  });
  it.each([true, false])("payload_with_and_without_the_curve_fields_still_parses (legacy curve=%s)", (curve) => {
    const payload = JSON.parse(JSON.stringify(sampleOverlap)) as typeof sampleOverlap;
    if (!curve) {
      Reflect.deleteProperty(payload, "concentration");
      Reflect.deleteProperty(payload, "total_stock_count");
    }
    render(<OverlapSection data={payload} />);
    expect(screen.getByRole("table", { name: "Fund overlap heatmap" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /stock concentration/i })).not.toBeInTheDocument();
  });
});
