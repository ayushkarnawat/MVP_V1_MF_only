import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LineAreaChart, type LineAreaChartProps } from "./line-area-chart";

const labels = (i: number) => `D${i + 1}`;
const base: LineAreaChartProps = {
  series: [{ key: "value", name: "Portfolio", color: "#22C55E", values: [100, 140, 120, 180], area: true }],
  labels,
  formatValue: v => `₹${v}`,
  ariaLabel: "Portfolio value",
  width: 600,
  height: 240,
};

function mockPlotRect() {
  // The plot area starts at x = 56 and is 532 px wide when width is 600 and there is no second axis.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 56, width: 532, top: 0, height: 204, right: 588, bottom: 204, x: 56, y: 0, toJSON: () => ({}),
  } as DOMRect);
}

afterEach(() => vi.restoreAllMocks());

describe("LineAreaChart", () => {
  it("draws a line and a gradient area for a series with area set, and names the chart", () => {
    render(<LineAreaChart {...base} />);
    expect(screen.getByRole("img", { name: "Portfolio value" })).toBeInTheDocument();
    expect(screen.getByTestId("series-line-value").getAttribute("d")).toMatch(/^M/);
    expect(screen.getByTestId("series-area-value").getAttribute("fill")).toMatch(/^url\(#.+-value\)$/);
  });

  it("does not draw an area for a series without area", () => {
    render(<LineAreaChart {...base} series={[{ ...base.series[0], area: false }]} />);
    expect(screen.queryByTestId("series-area-value")).toBeNull();
  });

  it("makes the top tick cover the maximum value (the clipped-axis regression)", () => {
    render(<LineAreaChart {...base} series={[{ ...base.series[0], values: [0, 50, 87] }]} />);
    const ticks = screen.getAllByTestId("y-tick").map(node => Number((node.textContent ?? "").replace("₹", "")));
    expect(Math.max(...ticks)).toBeGreaterThanOrEqual(87);
    expect(Math.min(...ticks)).toBeLessThanOrEqual(0);
  });

  it("does not draw a hidden series and ignores it for the axis", () => {
    render(
      <LineAreaChart
        {...base}
        series={[
          { key: "a", name: "A", color: "#22C55E", values: [1, 2, 3] },
          { key: "b", name: "B", color: "#2563EB", values: [1000, 2000, 3000], visible: false },
        ]}
      />,
    );
    expect(screen.getByTestId("series-line-a")).toBeInTheDocument();
    expect(screen.queryByTestId("series-line-b")).toBeNull();
    const ticks = screen.getAllByTestId("y-tick").map(node => Number((node.textContent ?? "").replace("₹", "")));
    expect(Math.max(...ticks)).toBeLessThan(100);
  });

  it("draws a dot, not a line, for a one-point series, and never throws", () => {
    render(<LineAreaChart {...base} series={[{ ...base.series[0], values: [42] }]} />);
    expect(screen.getByTestId("series-dot-value")).toBeInTheDocument();
    expect(screen.queryByTestId("series-line-value")).toBeNull();
  });

  it("draws only the frame when there is no data", () => {
    render(<LineAreaChart {...base} series={[{ ...base.series[0], values: [] }]} />);
    expect(screen.getByTestId("chart-frame")).toBeInTheDocument();
    expect(screen.queryByTestId("series-line-value")).toBeNull();
    expect(screen.queryAllByTestId("y-tick")).toHaveLength(0);
  });

  it("labels the x axis with at most six labels, the first one at index 0", () => {
    render(<LineAreaChart {...base} series={[{ ...base.series[0], values: Array.from({ length: 40 }, (_, i) => i) }]} />);
    const texts = screen.getAllByTestId("x-label").map(node => node.textContent);
    expect(texts.length).toBeLessThanOrEqual(6);
    expect(texts[0]).toBe("D1");
  });

  it("draws a second series on a right-hand percentage axis", () => {
    render(
      <LineAreaChart
        {...base}
        width={620}
        secondSeries={{ name: "Nifty 50", color: "#2563EB", values: [0, 2, 1, 6] }}
        formatPercent={v => `${v}%`}
      />,
    );
    expect(screen.getByTestId("series-line-second")).toBeInTheDocument();
    const rightTicks = screen.getAllByTestId("y2-tick").map(node => node.textContent);
    expect(rightTicks.every(text => text?.endsWith("%"))).toBe(true);
    expect(Number(rightTicks.at(-1)?.replace("%", ""))).toBeGreaterThanOrEqual(6);
  });

  it("shows no right-hand axis without a second series", () => {
    render(<LineAreaChart {...base} />);
    expect(screen.queryAllByTestId("y2-tick")).toHaveLength(0);
  });

  it("shows a crosshair and a tooltip with every visible series on pointer move, and removes them on leave", () => {
    mockPlotRect();
    render(
      <LineAreaChart
        {...base}
        series={[
          { key: "value", name: "Portfolio", color: "#22C55E", values: [100, 140, 120, 180], area: true },
          { key: "cost", name: "Invested", color: "#2563EB", values: [90, 90, 100, 100] },
        ]}
        tooltipLabel={i => `Day ${i + 1}`}
      />,
    );
    const overlay = screen.getByTestId("chart-overlay");
    fireEvent.pointerMove(overlay, { clientX: 56 });
    expect(screen.getByTestId("crosshair")).toBeInTheDocument();
    let tooltip = screen.getByRole("tooltip");
    expect(within(tooltip).getByTestId("tooltip-title")).toHaveTextContent("Day 1");
    expect(within(tooltip).getAllByTestId("tooltip-row").map(row => row.textContent)).toEqual(["Portfolio: ₹100", "Invested: ₹90"]);

    fireEvent.pointerMove(overlay, { clientX: 56 + 532 });
    tooltip = screen.getByRole("tooltip");
    expect(within(tooltip).getByTestId("tooltip-title")).toHaveTextContent("Day 4");
    expect(within(tooltip).getAllByTestId("tooltip-row").map(row => row.textContent)).toEqual(["Portfolio: ₹180", "Invested: ₹100"]);

    fireEvent.pointerLeave(overlay);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.queryByTestId("crosshair")).toBeNull();
  });

  it("includes the second series, formatted as a percentage, in the tooltip", () => {
    mockPlotRect();
    render(
      <LineAreaChart
        {...base}
        width={620}
        secondSeries={{ name: "Nifty 50", color: "#2563EB", values: [0, 2, 1, 6] }}
        formatPercent={v => `${v}%`}
      />,
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 56, width: 512, top: 0, height: 204, right: 568, bottom: 204, x: 56, y: 0, toJSON: () => ({}) } as DOMRect);
    fireEvent.pointerMove(screen.getByTestId("chart-overlay"), { clientX: 56 + 512 });
    const rows = within(screen.getByRole("tooltip")).getAllByTestId("tooltip-row").map(row => row.textContent);
    expect(rows).toEqual(["Portfolio: ₹180", "Nifty 50: 6%"]);
  });

  it("uses the axis label as the tooltip title when no tooltip label is given", () => {
    mockPlotRect();
    render(<LineAreaChart {...base} />);
    fireEvent.pointerMove(screen.getByTestId("chart-overlay"), { clientX: 56 });
    expect(screen.getByTestId("tooltip-title")).toHaveTextContent("D1");
  });
});
