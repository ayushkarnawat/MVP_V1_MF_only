import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FundTerTable } from "./FundTerTable";
import type { FundTerRow, WeightedTerSummary } from "./types";

const funds: FundTerRow[] = [
  { scheme_id: "a", scheme_name: "Fund A", plan_type: "direct", ter: "0.65", value: "400000.00", cost_1y: "2600.00", cost_3y: "7800.00", cost_5y: "13000.00" },
  { scheme_id: "b", scheme_name: "Fund B", plan_type: "regular", ter: "1.10", value: "350000.00", cost_1y: "3850.00", cost_3y: "11550.00", cost_5y: "19250.00" },
  { scheme_id: "c", scheme_name: "Fund C", plan_type: "regular", ter: "0.90", value: "200000.00", cost_1y: "1800.00", cost_3y: "5400.00", cost_5y: "9000.00" },
  { scheme_id: "d", scheme_name: "Missing", plan_type: null, ter: null, value: "50000.00", cost_1y: null, cost_3y: null, cost_5y: null },
];
const summary: WeightedTerSummary = { weighted_ter: "0.87", covered_value: "950000.00", total_value: "1000000.00", reference_period: null, uncovered_schemes: ["Missing"], cost_1y: "8250.00", cost_3y: "24750.00", cost_5y: "41250.00", funds };

describe("FundTerTable", () => {
  it("shows the six columns and fund-wise projections", () => {
    render(<FundTerTable funds={funds} summary={summary} />);
    expect(screen.getAllByRole("columnheader").map(h => h.textContent)).toEqual(["Fund", "TER", "Your value", "Next 1 year", "Next 3 years", "Next 5 years"]);
    const row = screen.getByText("Fund A").closest("tr")!;
    for (const text of ["0.65%", "₹4,00,000", "₹2,600", "₹7,800", "₹13,000"]) expect(within(row).getByText(text)).toBeInTheDocument();
    expect(screen.getByText("Fund B")).toBeInTheDocument();
    expect(screen.getByText("Fund C")).toBeInTheDocument();
  });
  it("shows dashes for no TER and excludes its value from the totals", () => {
    render(<FundTerTable funds={funds} summary={summary} />);
    expect(within(screen.getByText("Missing").closest("tr")!).getAllByText("—")).toHaveLength(4);
    const total = screen.getByText("Total (3 funds with a TER)").closest("tr")!;
    for (const text of ["₹9,50,000", "₹8,250", "₹24,750", "₹41,250"]) expect(within(total).getByText(text)).toBeInTheDocument();
    expect(screen.getByText("Projected fees if your value and each fund's TER stay as they are today. Not a forecast of returns.")).toBeInTheDocument();
    expect(screen.getByText("1 funds without a TER are not included.")).toBeInTheDocument();
  });
  it("keeps a no-TER portfolio visible without fabricating costs", () => {
    render(<FundTerTable funds={[funds[3]]} summary={{ ...summary, covered_value: "0", cost_1y: null, cost_3y: null, cost_5y: null }} />);
    expect(screen.getByText("Missing")).toBeInTheDocument();
    const total = screen.getByText("Total (0 funds with a TER)").closest("tr")!;
    expect(within(total).getAllByText("—")).toHaveLength(4);
    expect(total).toHaveTextContent("₹0");
  });
  it("counts a zero TER as covered and hides the exclusion note", () => {
    render(<FundTerTable funds={[{ ...funds[0], ter: "0.00", cost_1y: "0.00", cost_3y: "0.00", cost_5y: "0.00" }]} summary={summary} />);
    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.getByText("Total (1 funds with a TER)")).toBeInTheDocument();
    expect(screen.queryByText(/without a TER are not included/)).not.toBeInTheDocument();
  });
  it("keeps money exact and rounds negative amounts half-up to rupees", () => {
    render(<FundTerTable funds={[{ ...funds[0], value: "9007199254740992.50", cost_1y: "-1234.50" }]} summary={summary} />);
    expect(screen.getByText("₹9,00,71,99,25,47,40,993")).toBeInTheDocument();
    expect(screen.getByText("-₹1,235")).toBeInTheDocument();
  });
  it("scrolls inside its container at phone width", () => {
    render(<FundTerTable funds={funds} summary={summary} />);
    expect(screen.getByRole("table").parentElement).toHaveClass("w-full", "overflow-auto");
    expect(screen.getByRole("table").parentElement?.parentElement).toHaveClass("min-w-0", "max-w-full");
  });
});
