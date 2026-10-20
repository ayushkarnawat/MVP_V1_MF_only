// frontend/src/components/ui/charts/bar-chart.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BarChart } from "./bar-chart";

describe("BarChart", () => {
  it("renders a bar group for every bucket, including a zero-amount one", () => {
    render(
      <BarChart
        width={600}
        height={200}
        data={[
          { period: "2026-01", invested: 10000, withdrawn: 0 },
          { period: "2026-02", invested: 0, withdrawn: 0 },
        ]}
      />
    );
    expect(screen.getAllByTestId(/^bar-group-/)).toHaveLength(2);
    expect(screen.getByTestId("bar-group-2026-02")).toBeInTheDocument();
  });

  it("calls onBarClick with the period when a bar group is clicked", () => {
    const onBarClick = vi.fn();
    render(
      <BarChart width={600} height={200} data={[{ period: "2026-01", invested: 10000, withdrawn: 2000 }]} onBarClick={onBarClick} />
    );
    fireEvent.click(screen.getByTestId("bar-group-2026-01"));
    expect(onBarClick).toHaveBeenCalledWith("2026-01");
  });

  it("scales the tallest bar to the full plot height and a zero bar to nothing", () => {
    render(
      <BarChart
        width={600}
        height={234}
        data={[
          { period: "2026-01", invested: 10000, withdrawn: 5000 },
          { period: "2026-02", invested: 0, withdrawn: 0 },
        ]}
      />
    );
    // plot height = 234 - 8 top - 8 bottom - 18 label band = 200
    expect(Number(screen.getByTestId("bar-invested-2026-01").getAttribute("height"))).toBeCloseTo(200 * 2 / 3);
    expect(Number(screen.getByTestId("bar-withdrawn-2026-01").getAttribute("height"))).toBeCloseTo(200 / 3);
    expect(screen.getByTestId("bar-invested-2026-02").getAttribute("height")).toBe("0");
  });

  it("draws withdrawals below the baseline", () => {
    render(<BarChart width={600} height={234} data={[{ period: "p", invested: 10000, withdrawn: 5000 }]} />);
    const baseline = Number(screen.getByTestId("bar-baseline").getAttribute("y1"));
    const invested = screen.getByTestId("bar-invested-p");
    const withdrawn = screen.getByTestId("bar-withdrawn-p");
    expect(Number(invested.getAttribute("y")) + Number(invested.getAttribute("height"))).toBeCloseTo(baseline);
    expect(Number(withdrawn.getAttribute("y"))).toBeGreaterThanOrEqual(baseline);
    expect(Number(withdrawn.getAttribute("y")) + Number(withdrawn.getAttribute("height"))).toBeCloseTo(208);
  });

  it("puts the baseline at the bottom when nothing was withdrawn", () => {
    render(<BarChart width={600} height={234} data={[{ period: "p", invested: 10000, withdrawn: 0 }]} />);
    expect(Number(screen.getByTestId("bar-baseline").getAttribute("y1"))).toBe(208);
    expect(Number(screen.getByTestId("bar-invested-p").getAttribute("y"))).toBe(8);
  });

  it("stacks lighter switch segments beyond the cash bars", () => {
    render(<BarChart width={600} height={234} data={[{ period: "p", invested: 100, withdrawn: 50, switchedIn: 100, switchedOut: 50 }]} />);
    const invested = screen.getByTestId("bar-invested-p");
    const withdrawn = screen.getByTestId("bar-withdrawn-p");
    const incoming = screen.getByTestId("bar-switched-in-p");
    const outgoing = screen.getByTestId("bar-switched-out-p");
    expect(Number(incoming.getAttribute("y")) + Number(incoming.getAttribute("height"))).toBeCloseTo(Number(invested.getAttribute("y")));
    expect(Number(outgoing.getAttribute("y"))).toBeCloseTo(Number(withdrawn.getAttribute("y")) + Number(withdrawn.getAttribute("height")));
    expect(incoming).toHaveAttribute("fill-opacity", "0.45");
    expect(outgoing).toHaveAttribute("fill-opacity", "0.45");
  });

  it("a period with no movement has no bar but is still tappable", () => {
    const onBarClick = vi.fn();
    render(<BarChart width={320} data={[{ period: "quiet", invested: 0, withdrawn: 0 }]} onBarClick={onBarClick} />);
    for (const kind of ["invested", "withdrawn", "switched-in", "switched-out"]) {
      expect(screen.getByTestId(`bar-${kind}-quiet`)).toHaveAttribute("height", "0");
    }
    fireEvent.click(screen.getByTestId("bar-group-quiet"));
    expect(onBarClick).toHaveBeenCalledWith("quiet");
  });

  it("clamps reversal bars without letting a positive switch extend outside the plot", () => {
    render(<BarChart width={320} height={234} data={[{ period: "p", invested: -5000, withdrawn: 0, switchedIn: 2000 }]} />);
    expect(screen.getByTestId("bar-invested-p")).toHaveAttribute("height", "0");
    const segment = screen.getByTestId("bar-switched-in-p");
    expect(Number(segment.getAttribute("y"))).toBeCloseTo(8);
    expect(Number(segment.getAttribute("height"))).toBeCloseTo(200);
  });

  it("keeps every segment inside the plot when withdrawn or a switch value is negative", () => {
    // plot spans y=8..208 at height 234 (8 margin top and bottom, 18 label band)
    render(<BarChart width={320} height={234} data={[
      { period: "a", invested: 100, withdrawn: -100, switchedOut: 50 },
      { period: "b", invested: 100, withdrawn: 0, switchedIn: -50 },
    ]} />);
    for (const id of ["bar-invested-a", "bar-withdrawn-a", "bar-switched-out-a", "bar-invested-b", "bar-switched-in-b"]) {
      const bar = screen.queryByTestId(id);
      if (!bar) continue;
      const y = Number(bar.getAttribute("y"));
      const height = Number(bar.getAttribute("height"));
      expect(y).toBeGreaterThanOrEqual(8 - 0.001);
      expect(y + height).toBeLessThanOrEqual(208 + 0.001);
    }
    // one shared scale from the clamped values only: 100 up and 50 down fill the 200px plot
    expect(Number(screen.getByTestId("bar-invested-a").getAttribute("height"))).toBeCloseTo(200 * 100 / 150);
    expect(Number(screen.getByTestId("bar-invested-b").getAttribute("height"))).toBeCloseTo(200 * 100 / 150);
  });

  it("labels periods under the bars, thinning labels when they would overlap", () => {
    const data = Array.from({ length: 24 }, (_, i) => ({ period: `p${i}`, invested: 1, withdrawn: 0 }));
    render(<BarChart width={600} height={200} data={data} formatLabel={(p) => p.toUpperCase()} />);
    // 584px of plot / 48px per label -> at most 12 labels -> every 2nd period
    expect(screen.getByText("P0")).toBeInTheDocument();
    expect(screen.getByText("P2")).toBeInTheDocument();
    expect(screen.queryByText("P1")).not.toBeInTheDocument();
  });

  it("opens a period from the keyboard and names it for screen readers", () => {
    const onBarClick = vi.fn();
    render(<BarChart width={600} height={200} data={[{ period: "2026-01", invested: 10000, withdrawn: 0 }]} formatLabel={() => "Jan 26"} onBarClick={onBarClick} />);
    const group = screen.getByRole("button", { name: "Jan 26" });
    expect(group).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(group, { key: "Enter" });
    fireEvent.keyDown(group, { key: " " });
    expect(onBarClick).toHaveBeenCalledTimes(2);
  });

  it("exposes the periods to assistive tech: the chart is a group, not an image", () => {
    render(<BarChart width={600} height={200} data={[{ period: "2026-01", invested: 1, withdrawn: 0 }]} onBarClick={vi.fn()} />);
    expect(screen.getByRole("group", { name: /invested and withdrawn by period/i })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("keeps bars tappable when there are too many for the width: scrolls instead of squeezing", () => {
    const data = Array.from({ length: 240 }, (_, i) => ({ period: `p${i}`, invested: 1, withdrawn: 1 }));
    render(<BarChart width={320} height={200} data={data} />);
    // 240 periods x 12px minimum + 16px margins
    expect(screen.getByRole("group", { name: /invested and withdrawn/i }).getAttribute("width")).toBe("2896");
    expect(screen.getByTestId("bar-chart-scroll").style.overflowX).toBe("auto");
    // two bars plus the gap fit inside one 12px slot
    const w = Number(screen.getByTestId("bar-invested-p0").getAttribute("width"));
    expect(2 * w + 2).toBeLessThanOrEqual(12);
  });
});
