import { render, screen, fireEvent } from "@testing-library/react";
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

  it("tapping a legend row toggles its highlight on, and tapping it again toggles it off", () => {
    render(
      <AllocationDonut data={sampleData} totalValue="200000.00" enableTapHighlight />
    );

    // Nothing selected initially — "Equity" appears only once, in the legend
    // (the donut center's own render prop only fires once something is
    // actively selected/hovered, per the shared PieCenter's contract).
    expect(screen.getAllByText("Equity")).toHaveLength(1);

    // Click bubbles up from the label span to the legend row's onClick handler.
    const equityLabel = screen.getByText("Equity");
    fireEvent.click(equityLabel);

    // Tapping "Equity" selects it — its label now also appears in the donut center.
    expect(screen.getAllByText("Equity")).toHaveLength(2);

    fireEvent.click(equityLabel);

    // Tapping the same row again toggles the selection back off.
    expect(screen.getAllByText("Equity")).toHaveLength(1);
  });
});
