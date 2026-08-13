import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileHoldingCardSummary } from "./MobileHoldingCardSummary";
import type { HoldingRow } from "@/features/dashboard/types";

describe("MobileHoldingCardSummary", () => {
  const baseHolding: HoldingRow = {
    scheme_id: "scheme-101",
    scheme_name: "Axis Bluechip Fund",
    amc_name: "Axis Mutual Fund",
    household_member_id: "m-1",
    household_member_name: "Ayush",
    plan_type: "DIRECT",
    units_held: "123.456",
    average_nav: "45.50",
    current_nav: "60.00",
    current_nav_date: "2026-08-10",
    amount_invested: "5617.25",
    current_value: "7407.36",
    current_profit_total: "1790.11",
    realized_gain: "0.00",
    unrealized_gain: "1790.11",
    today_gain: "15.00",
  };

  it("shows a Direct plan-type badge and no stale-NAV badge for a fresh DIRECT holding", () => {
    render(<MobileHoldingCardSummary holding={baseHolding} />);

    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.queryByText("stale")).not.toBeInTheDocument();
  });

  it("shows a Regular plan-type badge and a stale-NAV badge when the holding is REGULAR with a stale NAV", () => {
    const staleRegularHolding: HoldingRow = {
      ...baseHolding,
      plan_type: "REGULAR",
      stale_nav: true,
    };

    render(<MobileHoldingCardSummary holding={staleRegularHolding} />);

    expect(screen.getByText("Regular")).toBeInTheDocument();
    expect(screen.getByText("stale")).toBeInTheDocument();
  });

  it("calls onSelect with the holding when the card is clicked", () => {
    const handleSelect = vi.fn();
    render(
      <MobileHoldingCardSummary holding={baseHolding} onSelect={handleSelect} />
    );

    fireEvent.click(screen.getByLabelText("Axis Bluechip Fund holding"));
    expect(handleSelect).toHaveBeenCalledWith(baseHolding);
  });
});
