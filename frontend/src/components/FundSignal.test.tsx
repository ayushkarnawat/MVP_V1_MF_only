import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FundSignal } from "./FundSignal";

describe("FundSignal", () => {
  it("renders positive return arc and icon", () => {
    render(<FundSignal returnPercentage={12.5} schemeName="Axis Small Cap" />);
    const container = screen.getByRole("region");
    aria-label: expect(container).toHaveAttribute(
      "aria-label",
      expect.stringContaining("gain of 12.5%")
    );
  });

  it("renders negative return arc and icon", () => {
    render(<FundSignal returnPercentage={-4.2} schemeName="HDFC Top 100" />);
    const container = screen.getByRole("region");
    expect(container).toHaveAttribute(
      "aria-label",
      expect.stringContaining("loss of 4.2%")
    );
  });

  it("expands sparkline popout on hover or click", () => {
    render(<FundSignal returnPercentage={18.0} schemeName="Nippon India" />);
    const container = screen.getByRole("region");

    fireEvent.mouseEnter(container);
    expect(screen.getByText("Trend (1Y)")).toBeInTheDocument();
  });
});
