import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScatterChart, type ScatterChartProps } from "./scatter-chart";

const base: ScatterChartProps = {
  points: [
    { id: "a", name: "Alpha Fund", x: 12, y: 8 },
    { id: "b", name: "Beta Fund", x: 18, y: 14, highlight: true },
    { id: "c", name: "Gamma Fund", x: 22, y: 5 },
  ],
  xLabel: "Risk",
  yLabel: "Return",
  ariaLabel: "Risk and return of funds in the category",
  width: 600,
  height: 280,
};

const radius = (id: string) => Number(screen.getByTestId(`point-${id}`).querySelector("circle")!.getAttribute("r"));

describe("ScatterChart", () => {
  it("draws one point per fund and names the chart and the axes", () => {
    render(<ScatterChart {...base} />);
    expect(screen.getByRole("group", { name: "Risk and return of funds in the category" })).toBeInTheDocument();
    expect(screen.getAllByTestId(/^point-/)).toHaveLength(3);
    expect(screen.getByTestId("x-axis-title")).toHaveTextContent("Risk");
    expect(screen.getByTestId("y-axis-title")).toHaveTextContent("Return");
  });

  it("draws the highlighted point larger and ringed", () => {
    render(<ScatterChart {...base} />);
    expect(radius("b")).toBeGreaterThan(radius("a"));
    expect(screen.getByTestId("point-b")).toHaveAttribute("data-highlight", "true");
    expect(screen.getByTestId("point-b").querySelector("circle")!.getAttribute("stroke")).not.toBe("none");
    expect(screen.getByTestId("point-a")).toHaveAttribute("data-highlight", "false");
  });

  it("makes the axis ticks cover every point", () => {
    render(<ScatterChart {...base} />);
    const xTicks = screen.getAllByTestId("x-tick").map(node => Number(node.textContent));
    const yTicks = screen.getAllByTestId("y-tick").map(node => Number(node.textContent));
    expect(Math.min(...xTicks)).toBeLessThanOrEqual(12);
    expect(Math.max(...xTicks)).toBeGreaterThanOrEqual(22);
    expect(Math.min(...yTicks)).toBeLessThanOrEqual(5);
    expect(Math.max(...yTicks)).toBeGreaterThanOrEqual(14);
  });

  it("places a point with a larger value further right and higher up", () => {
    render(<ScatterChart {...base} />);
    const centre = (id: string) => {
      const circle = screen.getByTestId(`point-${id}`).querySelector("circle")!;
      return { x: Number(circle.getAttribute("cx")), y: Number(circle.getAttribute("cy")) };
    };
    expect(centre("c").x).toBeGreaterThan(centre("a").x);
    expect(centre("b").y).toBeLessThan(centre("a").y);
  });

  it("calls onPointClick with the id on click, Enter and Space", () => {
    const onPointClick = vi.fn();
    render(<ScatterChart {...base} onPointClick={onPointClick} />);
    fireEvent.click(screen.getByTestId("point-a"));
    fireEvent.keyDown(screen.getByTestId("point-b"), { key: "Enter" });
    fireEvent.keyDown(screen.getByTestId("point-c"), { key: " " });
    expect(onPointClick.mock.calls.map(call => call[0])).toEqual(["a", "b", "c"]);
  });

  it("makes points focusable named buttons only when a handler is given", () => {
    const { rerender } = render(<ScatterChart {...base} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    rerender(<ScatterChart {...base} onPointClick={() => {}} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAttribute("tabindex", "0");
    expect(buttons[0]).toHaveAccessibleName("Alpha Fund: Risk 12, Return 8");
  });

  it("draws only the frame when there are no points", () => {
    render(<ScatterChart {...base} points={[]} />);
    expect(screen.getByTestId("chart-frame")).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^point-/)).toHaveLength(0);
  });

  it("does not throw for a single point", () => {
    render(<ScatterChart {...base} points={[{ id: "only", name: "Only", x: 10, y: 10 }]} />);
    expect(screen.getByTestId("point-only")).toBeInTheDocument();
  });
});
