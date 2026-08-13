import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FundSignal, FundSignalGraph } from "./FundSignal";

describe("FundSignal", () => {
  it("renders positive return arc and icon", () => {
    render(<FundSignal returnPercentage={12.5} schemeName="Axis Small Cap" />);
    const container = screen.getByRole("img");
    expect(container).toHaveAttribute(
      "aria-label",
      expect.stringContaining("gain of 12.5%")
    );
  });

  it("renders negative return arc and icon", () => {
    render(<FundSignal returnPercentage={-4.2} schemeName="HDFC Top 100" />);
    const container = screen.getByRole("img");
    expect(container).toHaveAttribute(
      "aria-label",
      expect.stringContaining("loss of 4.2%")
    );
  });
});

describe("FundSignalGraph", () => {
  it("renders the trend graph inline with the 30D/90D/1Y toggle, no hover needed", () => {
    render(<FundSignalGraph returnPercentage={18.0} />);
    expect(screen.getByText("Trend (1Y)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30D" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90D" })).toBeInTheDocument();
  });
});
