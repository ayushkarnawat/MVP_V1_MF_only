import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HoldingRow } from "./types";
import { AllocationDrilldownModal } from "./AllocationDrilldownModal";

const holdings: HoldingRow[] = [
  {
    scheme_id: "one", scheme_name: "Matching Fund", amc_name: "Alpha AMC", asset_class: "Equity",
    household_member_id: "m-1", household_member_name: "Alice", plan_type: "DIRECT",
    units_held: "12.345", average_nav: "26.2900000", current_nav: "30.1000",
    amount_invested: "324.00", current_value: "371.00", current_profit_total: "47.00",
    realized_gain: "0.00", unrealized_gain: "47.00", today_gain: "1.00",
  },
  {
    scheme_id: "two", scheme_name: "Other Fund", amc_name: "Beta AMC", asset_class: "Debt",
    household_member_id: "m-1", household_member_name: "Alice", plan_type: "DIRECT",
    units_held: "5.000", average_nav: "10.00", current_nav: "11.00",
    amount_invested: "50.00", current_value: "55.00", current_profit_total: "5.00",
    realized_gain: "0.00", unrealized_gain: "5.00", today_gain: "0.00",
  },
];

describe("AllocationDrilldownModal", () => {
  it.each([
    ["amc" as const, "Alpha AMC"],
    ["asset" as const, "Equity"],
  ])("uses one modal for %s grouping", (groupType, groupLabel) => {
    render(
      <AllocationDrilldownModal
        isOpen
        onClose={vi.fn()}
        groupType={groupType}
        groupLabel={groupLabel}
        holdings={holdings}
      />,
    );

    expect(screen.getByRole("dialog", { name: groupLabel })).toBeInTheDocument();
    expect(screen.getByText("Matching Fund")).toBeInTheDocument();
    expect(screen.getByText("12.35 units · Avg NAV ₹26.29")).toBeInTheDocument();
    expect(screen.queryByText("Other Fund")).not.toBeInTheDocument();
    expect(screen.getByTestId("drilldown-subtotal")).toHaveTextContent("₹371");
  });

  it("sums current_value across all matching holdings for the subtotal", () => {
    render(
      <AllocationDrilldownModal
        isOpen
        onClose={vi.fn()}
        groupType="asset"
        groupLabel="All"
        holdings={holdings.map((h) => ({ ...h, asset_class: "All" }))}
      />,
    );

    expect(screen.getByTestId("drilldown-subtotal")).toHaveTextContent("₹426");
  });
});
