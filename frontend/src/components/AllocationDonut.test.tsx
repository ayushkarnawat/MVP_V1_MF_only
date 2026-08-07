import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AllocationDonut } from "./AllocationDonut";

describe("AllocationDonut", () => {
  const sampleData = [
    { label: "Equity", current_value: "150000.00", percentage: 75 },
    { label: "Debt", current_value: "50000.00", percentage: 25 },
  ];

  it("renders breakdown legend items with absolute values and percentages", () => {
    render(<AllocationDonut data={sampleData} totalValue="200000.00" title="Asset Allocation" />);
    expect(screen.getByText("Asset Allocation")).toBeInTheDocument();
    expect(screen.getByText("Equity")).toBeInTheDocument();
    expect(screen.getByText("75.0%")).toBeInTheDocument();
    expect(screen.getByText("Debt")).toBeInTheDocument();
    expect(screen.getByText("25.0%")).toBeInTheDocument();
  });

  it("handles empty data gracefully", () => {
    render(<AllocationDonut data={[]} />);
    expect(screen.getByText("No allocation data available")).toBeInTheDocument();
  });
});
