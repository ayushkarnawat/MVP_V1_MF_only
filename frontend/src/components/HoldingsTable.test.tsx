import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HoldingsTable } from "./HoldingsTable";

describe("HoldingsTable", () => {
  const sampleHoldings = [
    {
      scheme_id: "scheme-1",
      scheme_name: "Parag Parikh Flexi Cap Fund",
      amc_name: "PPFAS Mutual Fund",
      plan_type: "DIRECT",
      units_held: "125.45",
      average_nav: "45.20",
      current_nav: "68.50",
      amount_invested: "5670.34",
      current_value: "8593.33",
      current_profit_total: "2922.99",
      realized_gain: "0.00",
      unrealized_gain: "2922.99",
      today_gain: "45.10",
    },
  ];

  it("renders holdings row with scheme name, plan badge, and gain indicators", () => {
    render(<HoldingsTable holdings={sampleHoldings} />);
    expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByText("₹8,593")).toBeInTheDocument();
  });

  it("triggers onSelectScheme callback when a row is clicked", () => {
    const handleSelect = vi.fn();
    render(<HoldingsTable holdings={sampleHoldings} onSelectScheme={handleSelect} />);
    
    fireEvent.click(screen.getByText("Parag Parikh Flexi Cap Fund"));
    expect(handleSelect).toHaveBeenCalledWith("scheme-1");
  });

  it("renders different plan types without a duplicate React key warning", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      render(
        <HoldingsTable
          holdings={[
            { ...sampleHoldings[0], household_member_id: "member-1" },
            {
              ...sampleHoldings[0],
              household_member_id: "member-1",
              plan_type: "REGULAR",
              units_held: "50.00",
            },
          ]}
        />
      );

      expect(screen.getAllByText("Parag Parikh Flexi Cap Fund")).toHaveLength(2);
      expect(consoleError.mock.calls.flat().join(" ")).not.toContain("same key");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps an unavailable-NAV holding visible without rendering zero valuation", () => {
    render(
      <HoldingsTable
        holdings={[
          {
            ...sampleHoldings[0],
            current_nav: null,
            current_nav_date: null,
            current_value: null,
            current_profit_total: null,
            unrealized_gain: null,
            today_gain: null,
            nav_unavailable: true,
          },
        ]}
      />
    );

    expect(screen.getByText("Parag Parikh Flexi Cap Fund")).toBeInTheDocument();
    expect(screen.getByText("NAV unavailable")).toBeInTheDocument();
    expect(screen.getByText("125.450")).toBeInTheDocument();
    expect(screen.getByText("₹5,670")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByText(/^₹0(?:\.00)?$/)).toHaveLength(0);
    expect(screen.queryByLabelText(/Fund Signal:/i)).not.toBeInTheDocument();
  });
});
