import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileFundDetailView } from "./MobileFundDetailView";
import type { HoldingRow } from "@/features/dashboard/types";

describe("MobileFundDetailView", () => {
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
    category: "Large Cap Equity",
  };

  it("renders full holding financial breakdown and performance chart", () => {
    const handleBack = vi.fn();
    render(
      <MobileFundDetailView
        holding={sampleHolding}
        onBack={handleBack}
      />
    );

    expect(screen.getByText("FUND DETAILS")).toBeInTheDocument();
    expect(screen.getByText("Axis Bluechip Fund")).toBeInTheDocument();
    expect(screen.getAllByText("Axis Mutual Fund").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Direct").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Ayush")).toBeInTheDocument();
    expect(screen.getByText("Large Cap Equity")).toBeInTheDocument();
    expect(screen.getAllByText("Current Value").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Invested")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("6M")).toBeInTheDocument();
    expect(screen.getByText("Units")).toBeInTheDocument();
    expect(screen.getByText("123.456")).toBeInTheDocument();
    expect(screen.getByText("Avg NAV")).toBeInTheDocument();
    expect(screen.getAllByText(/45.50/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Current NAV")).toBeInTheDocument();
    expect(screen.getAllByText(/60.00/i).length).toBeGreaterThanOrEqual(1);

    // Trigger back
    const backBtn = screen.getByLabelText("Back to holdings");
    fireEvent.click(backBtn);
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it("switches performance timeframe when pills are clicked", () => {
    render(
      <MobileFundDetailView
        holding={sampleHolding}
        onBack={vi.fn()}
      />
    );

    const oneYearBtn = screen.getByText("1Y");
    fireEvent.click(oneYearBtn);
    expect(oneYearBtn).toHaveClass("bg-[var(--color-surface)]");
  });

  it("resets scroll container scrollTop to 0 when mounted inside a scrolled container", () => {
    const parentContainer = document.createElement("div");
    parentContainer.scrollTop = 450;
    document.body.appendChild(parentContainer);

    render(
      <MobileFundDetailView
        holding={sampleHolding}
        onBack={vi.fn()}
      />,
      { container: parentContainer }
    );

    expect(parentContainer.scrollTop).toBe(0);
    document.body.removeChild(parentContainer);
  });

  it("resets scroll container scrollTop to 0 when switching holdings", () => {
    const parentContainer = document.createElement("div");
    parentContainer.scrollTop = 300;
    document.body.appendChild(parentContainer);

    const { rerender } = render(
      <MobileFundDetailView
        holding={sampleHolding}
        onBack={vi.fn()}
      />,
      { container: parentContainer }
    );

    expect(parentContainer.scrollTop).toBe(0);

    // Simulate user scrolling inside the view
    parentContainer.scrollTop = 500;
    expect(parentContainer.scrollTop).toBe(500);

    // Rerender with another holding
    const anotherHolding: HoldingRow = {
      ...sampleHolding,
      scheme_id: "scheme-102",
      scheme_name: "HDFC Top 100 Fund",
    };

    rerender(
      <MobileFundDetailView
        holding={anotherHolding}
        onBack={vi.fn()}
      />
    );

    expect(parentContainer.scrollTop).toBe(0);
    expect(screen.getByText("HDFC Top 100 Fund")).toBeInTheDocument();
    document.body.removeChild(parentContainer);
  });
});
