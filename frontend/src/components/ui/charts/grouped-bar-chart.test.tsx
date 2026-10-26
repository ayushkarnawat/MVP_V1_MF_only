import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupedBarChart, type GroupedBarChartProps } from "./grouped-bar-chart";

const base: GroupedBarChartProps = {
  buckets: [
    { label: "0-1%", values: [10, 14] },
    { label: "1-2%", values: [20, 8] },
    { label: "2-3%", values: [5, 12] },
  ],
  seriesColors: ["#0D9488", "#2563EB"],
  formatValue: v => `${v}%`,
  ariaLabel: "Period returns",
  width: 600,
  height: 220,
};

const bars = () => screen.getAllByTestId(/^bar-\d+-\d+$/);
const num = (node: Element, attribute: string) => Number(node.getAttribute(attribute));

describe("GroupedBarChart", () => {
  it("draws one group per bucket with one bar per series, and labels each bucket", () => {
    render(<GroupedBarChart {...base} />);
    expect(screen.getAllByTestId(/^bucket-\d+$/)).toHaveLength(3);
    expect(bars()).toHaveLength(6);
    expect(screen.getAllByTestId("bucket-label").map(node => node.textContent)).toEqual(["0-1%", "1-2%", "2-3%"]);
    expect(screen.getByRole("group", { name: "Period returns" })).toBeInTheDocument();
  });

  it("scales bar heights to the values", () => {
    render(<GroupedBarChart {...base} />);
    const tallest = num(screen.getByTestId("bar-1-0"), "height");
    const half = num(screen.getByTestId("bar-0-0"), "height");
    expect(tallest).toBeGreaterThan(half);
    expect(half / tallest).toBeCloseTo(10 / 20, 2);
  });

  it("draws a negative bar below the zero line and a positive bar above it", () => {
    render(<GroupedBarChart {...base} buckets={[{ label: "a", values: [-10, 10] }]} />);
    const baselineY = num(screen.getByTestId("bar-baseline"), "y1");
    const negative = screen.getByTestId("bar-0-0");
    const positive = screen.getByTestId("bar-0-1");
    expect(num(negative, "y")).toBeCloseTo(baselineY, 3);
    expect(num(positive, "y") + num(positive, "height")).toBeCloseTo(baselineY, 3);
    expect(num(negative, "height")).toBeGreaterThan(0);
  });

  it("calls onBucketClick with the index on click, Enter and Space", () => {
    const onBucketClick = vi.fn();
    render(<GroupedBarChart {...base} onBucketClick={onBucketClick} />);
    fireEvent.click(screen.getByTestId("bucket-1"));
    fireEvent.keyDown(screen.getByTestId("bucket-2"), { key: "Enter" });
    fireEvent.keyDown(screen.getByTestId("bucket-0"), { key: " " });
    expect(onBucketClick.mock.calls.map(call => call[0])).toEqual([1, 2, 0]);
  });

  it("makes each bucket a focusable named button only when a click handler is given", () => {
    const { rerender } = render(<GroupedBarChart {...base} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    rerender(<GroupedBarChart {...base} onBucketClick={() => {}} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAttribute("tabindex", "0");
    expect(buttons[0]).toHaveAccessibleName("0-1%: 10%, 14%");
  });

  it("dims the other buckets while one is hovered", () => {
    render(<GroupedBarChart {...base} />);
    fireEvent.pointerEnter(screen.getByTestId("bucket-1"));
    expect(screen.getByTestId("bucket-0")).toHaveAttribute("data-dimmed", "true");
    expect(screen.getByTestId("bucket-1")).toHaveAttribute("data-dimmed", "false");
    fireEvent.pointerLeave(screen.getByTestId("bucket-1"));
    expect(screen.getByTestId("bucket-0")).toHaveAttribute("data-dimmed", "false");
  });

  it("draws only the frame when there are no buckets", () => {
    render(<GroupedBarChart {...base} buckets={[]} />);
    expect(screen.getByTestId("chart-frame")).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^bar-\d+-\d+$/)).toHaveLength(0);
  });

  describe("when the bucket count changes", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("morphs to the new count instead of snapping (the first frame already has the new number of bars)", () => {
      const { rerender } = render(<GroupedBarChart {...base} />);
      rerender(
        <GroupedBarChart
          {...base}
          buckets={[
            { label: "a", values: [1, 2] }, { label: "b", values: [3, 4] }, { label: "c", values: [5, 6] },
            { label: "d", values: [7, 8] }, { label: "e", values: [9, 10] },
          ]}
        />,
      );
      expect(bars()).toHaveLength(6);
      act(() => {
        vi.advanceTimersByTime(16);
      });
      expect(bars()).toHaveLength(10);
      act(() => {
        vi.advanceTimersByTime(450);
      });
      expect(bars()).toHaveLength(10);
      expect(screen.getAllByTestId("bucket-label").map(node => node.textContent)).toEqual(["a", "b", "c", "d", "e"]);
    });
  });
});
