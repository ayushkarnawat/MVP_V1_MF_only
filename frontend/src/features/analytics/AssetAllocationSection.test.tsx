import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapAllocationSection } from "./CapAllocationSection";
import { AssetAllocationSection } from "./AssetAllocationSection";
import type { AssetAllocationSummary } from "./types";
import { sampleAssetAllocation } from "./assetAllocationTestData";

describe("AssetAllocationSection", () => {
  it("handles loading, unavailable, and empty covered value", () => {
    const { rerender } = render(<AssetAllocationSection data={null} isLoading />);
    expect(screen.getByLabelText("Loading look-through asset allocation")).toBeInTheDocument();
    rerender(<AssetAllocationSection data={null} />);
    expect(screen.getByText("No look-through asset allocation data available")).toBeInTheDocument();
    rerender(<AssetAllocationSection data={{ ...sampleAssetAllocation, covered_value: "0" }} />);
    expect(screen.getByText("No covered holdings for this selection")).toBeInTheDocument();
  });
  it("shows two rings with only equity split, and drills through the shared cap path", () => {
    render(<AssetAllocationSection data={sampleAssetAllocation} />);
    expect(screen.getByLabelText("Asset classes ring")).toBeInTheDocument();
    expect(screen.getByLabelText("Equity size and other asset classes ring")).toBeInTheDocument();
    const legend = screen.getByLabelText("Look-through asset breakdown");
    expect(within(legend).getAllByRole("button")).toHaveLength(4);
    fireEvent.click(within(legend).getByRole("button", { name: /Equity.*80.00%/ }));
    fireEvent.click(screen.getByRole("button", { name: /Large Cap.*40.00%/ }));
    fireEvent.click(screen.getByRole("button", { name: /Large Stock/ }));
    expect(screen.getByText("Fund A")).toBeInTheDocument();
    expect(screen.getByText(/Percentages of covered portfolio value/)).toBeInTheDocument();
  });
  it("describes five-class payloads as Debt (cash included), not cash-like", () => {
    const five = { ...sampleAssetAllocation, arbitrage_funds: [{ scheme_id: "arb", scheme_name: "Arb Fund" }],
      as_disclosed: { ...sampleAssetAllocation.as_disclosed, classes: [...sampleAssetAllocation.as_disclosed.classes, { key: "others" as const, value: "0", percentage: "0" }] } };
    render(<AssetAllocationSection data={five} />);
    expect(screen.getByText(/Cash is included under Debt/)).toBeInTheDocument();
    expect(screen.getByText(/Entire fund value moves to Debt/)).toBeInTheDocument();
    expect(screen.queryByText(/Percentages of covered portfolio value/)).not.toBeInTheDocument();
    expect(screen.queryByText(/moves to cash-like/)).not.toBeInTheDocument();
  });
  it("shares Other drill-down without duplicate anchors or non-equity wording", () => {
    const { container } = render(<><CapAllocationSection data={sampleAssetAllocation.as_disclosed.cap_allocation} /><AssetAllocationSection data={sampleAssetAllocation} /></>);
    fireEvent.click(screen.getByRole("button", { name: /Equity.*80.00%/ }));
    const nested = screen.getByLabelText("Equity market-cap drill-down");
    expect(within(nested).queryByLabelText("Portfolio disclosure coverage")).not.toBeInTheDocument();
    fireEvent.click(within(nested).getByRole("button", { name: /Other \/ Unclassified.*10.00%/ }));
    expect(within(nested).queryByText("Not equity (debt, cash, gold, REITs)")).not.toBeInTheDocument();
    fireEvent.click(within(nested).getByRole("button", { name: /Foreign Stock/ }));
    expect(within(nested).getByText("Fund A")).toBeInTheDocument();
    const ids = [...container.querySelectorAll("[id]")].map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("toggles locally and resets the equity drill-down", () => {
    render(<AssetAllocationSection data={sampleAssetAllocation} />);
    fireEvent.click(screen.getByRole("button", { name: /Equity.*80.00%/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Treat arbitrage funds as cash-like/ }));
    expect(screen.getByRole("button", { name: /Cash-like.*100.00%/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Market-cap allocation" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Treat arbitrage funds as cash-like/ }));
    expect(screen.getByRole("button", { name: /Equity.*80.00%/ })).toBeInTheDocument();
  });
  it("preserves partial coverage and hides headlines", () => {
    render(<AssetAllocationSection data={{ ...sampleAssetAllocation, hide_headlines: true, coverage: { ...sampleAssetAllocation.coverage, covered_value_pct: "40" } }} />);
    expect(screen.getByText("Based on 40.0% of your portfolio")).toBeInTheDocument();
    expect(screen.queryByText(/Largest asset class:/)).not.toBeInTheDocument();
  });
  it("keeps scientific decimal and negative percentages exact", () => {
    render(<AssetAllocationSection data={{ ...sampleAssetAllocation, covered_value: "1E-7", as_disclosed: { ...sampleAssetAllocation.as_disclosed, classes: sampleAssetAllocation.as_disclosed.classes.map(c => c.key === "cash_like" ? { ...c, percentage: "-1E-2", value: "-1E-9" } : c) } }} />);
    expect(screen.queryByText("No covered holdings for this selection")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cash-like.*-0.01%/ })).toBeInTheDocument();
    expect(screen.getByText(/donut shows positive exposures/)).toBeInTheDocument();
  });
});


it.each([false, true])("names the two new classes while keeping old cash-like rendering (print=%s)", printMode => {
  const data: AssetAllocationSummary = structuredClone(sampleAssetAllocation);
  data.as_disclosed.classes.push(
    { key: "real_estate", value: "10", percentage: "1" },
    { key: "others", value: "10", percentage: "1" },
  );
  render(<AssetAllocationSection data={data} printMode={printMode} />);
  const legend = within(screen.getByLabelText("Look-through asset breakdown"));
  expect(legend.getByRole("button", { name: /Cash-like/ })).toBeInTheDocument();
  expect(legend.getByRole("button", { name: /Real Estate \(REITs and InvITs\)/ })).toBeInTheDocument();
  expect(legend.getByRole("button", { name: /Others/ })).toBeInTheDocument();
  expect(screen.getByLabelText("Asset classes ring")).toBeInTheDocument();
  expect(screen.getByLabelText("Equity size and other asset classes ring")).toBeInTheDocument();
});
