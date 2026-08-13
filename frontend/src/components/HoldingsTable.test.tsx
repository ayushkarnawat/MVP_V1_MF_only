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
});
