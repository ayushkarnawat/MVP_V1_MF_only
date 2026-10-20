import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TerSection } from "./TerSection";
import type { DirectRegularTerComparison, WeightedTerSummary } from "./types";

const summary = (weighted_ter: string | null): WeightedTerSummary => ({
  weighted_ter, covered_value: "1000", total_value: "1000", reference_period: "2026-09-01", uncovered_schemes: [],
});

describe("TerSection (#17)", () => {
  it("never claims a Direct saving from the two averages", () => {
    // The Direct and Regular groups hold different funds, so their gap isn't
    // a saving; per-fund savings live in Distributor Comparison (decided 6 Oct).
    render(<TerSection ter={summary("0.80")} comparison={{ direct: summary("0.60"), regular: summary("1.45") }} />);
    expect(screen.queryByText(/Save ~/)).not.toBeInTheDocument();
    expect(screen.getByText("Direct Plans TER")).toBeInTheDocument();
  });

  it("shows a dash, not ₹0, when there is no comparison", () => {
    render(<TerSection ter={null} comparison={null} />);
    expect(screen.getAllByText("— / —").length).toBeGreaterThan(0);
  });

  it("draws both bars when both plans have a TER", () => {
    render(<TerSection ter={summary("0.80")} comparison={{ direct: summary("0.70"), regular: summary("1.47") }} />);
    expect(screen.getByText("Direct Plans TER")).toBeInTheDocument();
    expect(screen.getByText("Regular Plans TER")).toBeInTheDocument();
  });

  it("draws only the Direct bar and says there are no Regular plans", () => {
    render(<TerSection ter={summary("0.70")} comparison={{ direct: summary("0.70"), regular: { ...summary(null), total_value: "0.00" } }} />);
    expect(screen.getByText("Direct Plans TER")).toBeInTheDocument();
    expect(screen.queryByText("Regular Plans TER")).toBeNull();
    expect(screen.getByText("No Regular plans in this portfolio, so there is nothing to compare against.")).toBeInTheDocument();
  });

  it("says no TER is on record when the plan is held but has none", () => {
    render(<TerSection ter={summary("0.70")} comparison={{ direct: summary("0.70"), regular: { ...summary(null), total_value: "50000.00" } }} />);
    expect(screen.queryByText("Regular Plans TER")).toBeNull();
    expect(screen.getByText("No TER on record for the Regular plans you hold.")).toBeInTheDocument();
  });

  it("hides the comparison block when neither plan has a TER", () => {
    render(<TerSection ter={summary(null)} comparison={{ direct: summary(null), regular: summary(null) }} />);
    expect(screen.queryByText("Direct vs. Regular Fee Comparison")).toBeNull();
  });

  it.each(["0.00", "50000.00"])("handles a Regular-only comparison with Direct value %s", total_value => {
    render(<TerSection ter={summary("1.47")} comparison={{ direct: { ...summary(null), total_value }, regular: summary("1.47") }} />);
    expect(screen.queryByText("Direct Plans TER")).toBeNull();
    expect(screen.getByText("Regular Plans TER")).toBeInTheDocument();
    expect(screen.getByText(total_value === "0.00"
      ? "No Direct plans in this portfolio, so there is nothing to compare against."
      : "No TER on record for the Direct plans you hold.")).toBeInTheDocument();
  });

  it.each(["direct", "regular"] as const)("renders a saved comparison with the %s summary absent", absent => {
    const comparison = { direct: summary("0.00"), regular: summary("1.47") };
    const { [absent]: _omitted, ...saved } = comparison;
    const { container } = render(<TerSection ter={summary("0.70")} comparison={saved as DirectRegularTerComparison} />);
    const label = absent === "direct" ? "Direct" : "Regular";
    expect(screen.queryByText(`${label} Plans TER`)).toBeNull();
    expect(screen.getByText(`No ${label} plans in this portfolio, so there is nothing to compare against.`)).toBeInTheDocument();
    expect(screen.getByText(absent === "direct" ? "Regular Plans TER" : "Direct Plans TER")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/NaN|undefined/);
  });
});


describe("TER projections", () => {
  const portfolio = { ...summary("0.87"), cost_1y: "8250.00", cost_3y: "24750.00", cost_5y: "41250.00", funds: [
    { scheme_id: "a", scheme_name: "Projected Fund", plan_type: "direct", ter: "0.65", value: "400000.00", cost_1y: "2600.00", cost_3y: "7800.00", cost_5y: "13000.00" },
  ] };
  it("shows portfolio, Direct and Regular rupees per year alongside percentages", () => {
    render(<TerSection ter={portfolio} comparison={{ direct: { ...summary("0.65"), cost_1y: "2600.00" }, regular: { ...summary("1.03"), cost_1y: "5650.00" } }} />);
    for (const value of ["₹8,250", "₹2,600", "₹5,650"]) expect(screen.getByText(`${value} / year at today's value`)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Projected TER costs by fund" })).toBeInTheDocument();
  });
  it("an old payload has no table or yearly lines and no NaN or undefined", () => {
    const { container } = render(<TerSection ter={summary("0.80")} comparison={{ direct: summary("0.60"), regular: summary("1.45") }} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/year at today's value/)).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });
  it("the static section used in print exposes all cost horizons without a click", () => {
    render(<TerSection ter={portfolio} comparison={null} />);
    expect(screen.getByText("Projected Fund")).toBeInTheDocument();
    for (const text of ["Next 1 year", "Next 3 years", "Next 5 years"]) expect(screen.getByRole("columnheader", { name: text })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it.each(["direct", "regular"] as const)("shows only available yearly costs for a %s-only portfolio", plan => {
    const comparison: DirectRegularTerComparison = { direct: { ...summary(null), total_value: "0" }, regular: { ...summary(null), total_value: "0" } };
    comparison[plan] = { ...summary("0.65"), cost_1y: "2600.00" };
    render(<TerSection ter={{ ...portfolio, cost_1y: "2600.00" }} comparison={comparison} />);
    expect(screen.getAllByText("₹2,600 / year at today's value")).toHaveLength(2);
  });
});


it("keeps card coverage money exact, with one half-up rounding", () => {
  render(<TerSection ter={{ ...summary("0.80"), covered_value: "9007199254740992.50", total_value: "100.4999" }} comparison={null} />);
  expect(screen.getByText("₹9,00,71,99,25,47,40,993 / ₹100")).toBeInTheDocument();
});
