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
    expect(screen.getByTestId("bar-invested-2026-01").getAttribute("height")).toBe("200");
    expect(screen.getByTestId("bar-withdrawn-2026-01").getAttribute("height")).toBe("100");
    expect(screen.getByTestId("bar-invested-2026-02").getAttribute("height")).toBe("0");
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
