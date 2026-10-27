import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FIVE_BENCHMARKS } from "../testData";
import { BenchmarkChart } from "./BenchmarkChart";

const rowsOf = () => within(screen.getByRole("region", { name: "Benchmark comparison" })).getAllByRole("listitem");

describe("BenchmarkChart", () => {
  it("renders nothing when there are no benchmarks", () => {
    const { container } = render(<BenchmarkChart portfolioPct="-27.00" benchmarks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is titled, with your portfolio first and then the five indices in the given order", () => {
    render(<BenchmarkChart portfolioPct="-27.00" benchmarks={FIVE_BENCHMARKS} />);
    expect(screen.getByRole("heading", { level: 3, name: "Benchmark comparison" })).toBeInTheDocument();
    expect(rowsOf().map(row => row.getAttribute("aria-label"))).toEqual([
      "Your portfolio, −27.0%", "Nifty 50, −30.2%", "Nifty 500, −31.4%", "Nifty LargeMidcap 250, −32.1%",
      "Nifty Midcap 150, −33.9%", "Nifty Smallcap 250, −36.2%",
    ]);
  });

  it("colours your portfolio by its sign and the indices in the index tone", () => {
    const { rerender } = render(<BenchmarkChart portfolioPct="-27.00" benchmarks={FIVE_BENCHMARKS} />);
    expect(screen.getByTestId("bar-fill-portfolio")).toHaveAttribute("data-tone", "loss");
    expect(screen.getByTestId("bar-fill-nifty_50")).toHaveAttribute("data-tone", "index");
    expect(screen.getByTestId("bar-fill-nifty_smallcap_250")).toHaveAttribute("data-tone", "index");
    rerender(<BenchmarkChart portfolioPct="12.50" benchmarks={FIVE_BENCHMARKS} />);
    expect(screen.getByTestId("bar-fill-portfolio")).toHaveAttribute("data-tone", "gain");
    expect(screen.getByRole("listitem", { name: "Your portfolio, +12.5%" })).toBeInTheDocument();
  });

  it("leaves your portfolio out when it has no return (pre-2006), keeping the index bars", () => {
    render(<BenchmarkChart portfolioPct={null} benchmarks={FIVE_BENCHMARKS} />);
    expect(rowsOf()).toHaveLength(5);
    expect(screen.queryByTestId("bar-portfolio")).toBeNull();
    expect(screen.queryByText("Your portfolio")).toBeNull();
  });

  it("explains what the indices are", () => {
    render(<BenchmarkChart portfolioPct="-27.00" benchmarks={FIVE_BENCHMARKS} />);
    expect(screen.getByText("Total return indices over the same dates.")).toBeInTheDocument();
  });

  it("scales all bars together: the longest bar is the smallest value", () => {
    render(<BenchmarkChart portfolioPct="-27.00" benchmarks={FIVE_BENCHMARKS} />);
    expect(screen.getByTestId("bar-fill-nifty_smallcap_250").style.width).toBe("100%");
    expect(screen.getByTestId("bar-fill-portfolio").style.width).toBe("74.59%");
  });
});
