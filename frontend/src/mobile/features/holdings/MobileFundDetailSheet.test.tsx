import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileFundDetailSheet } from "./MobileFundDetailSheet";
import type { HoldingRow } from "@/features/dashboard/types";

describe("MobileFundDetailSheet", () => {
  const sampleHolding: HoldingRow = {
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

  it("does not render when isOpen is false", () => {
    render(
      <MobileFundDetailSheet
        isOpen={false}
        holding={sampleHolding}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders full holding financial breakdown when open", () => {
    const handleClose = vi.fn();
    render(
      <MobileFundDetailSheet
        isOpen={true}
        holding={sampleHolding}
        onClose={handleClose}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Axis Bluechip Fund")).toBeInTheDocument();
    expect(screen.getByText("Axis Mutual Fund")).toBeInTheDocument();
    expect(screen.getByText("DIRECT")).toBeInTheDocument();
    expect(screen.getByText("Ayush")).toBeInTheDocument();
    expect(screen.getByText("Current Value")).toBeInTheDocument();
    expect(screen.getByText("Invested Amount")).toBeInTheDocument();
    expect(screen.getByText("Total Gain / Loss")).toBeInTheDocument();
    expect(screen.getByText("Units Held")).toBeInTheDocument();
    expect(screen.getByText("123.456")).toBeInTheDocument();
    expect(screen.getByText("Average NAV")).toBeInTheDocument();
    expect(screen.getByText("₹45.50")).toBeInTheDocument();
    expect(screen.getByText("Current NAV")).toBeInTheDocument();
    expect(screen.getByText("₹60.00")).toBeInTheDocument();
    expect(screen.getByText("2026-08-10")).toBeInTheDocument();

    // Trigger close via header button
    const closeBtn = screen.getByLabelText("Close details");
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
