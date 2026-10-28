import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OverlapDonut } from "./OverlapDonut";

// jsdom cannot measure a width, so the kit pie is a stub that records the props the donut hands to it.
interface PieStubProps {
  data: { label: string; value: number; color?: string; formattedValue?: string }[];
  size?: number;
  children?: ReactNode;
}
const pie = vi.hoisted(() => ({ props: null as null | PieStubProps }));
vi.mock("@/components/ui/charts", () => ({
  PieChart: (props: PieStubProps) => {
    pie.props = props;
    return <div data-testid="pie-chart">{props.children}</div>;
  },
  PieSlice: ({ index }: { index: number }) => <i data-testid={`pie-slice-${index}`} />,
}));

beforeEach(() => {
  pie.props = null;
});

describe("OverlapDonut", () => {
  it("draws the overlap and the rest as two slices, with the figure, the label and the caption", () => {
    render(<OverlapDonut pct="18.0000" label="overlap with your portfolio" caption="3 common stocks out of 12 total holdings" />);
    expect(pie.props!.data.map(slice => [slice.label, slice.value])).toEqual([["Overlap", 18], ["Not overlapping", 82]]);
    expect(pie.props!.data[0].color).toBe("var(--c2)");
    expect(screen.getAllByTestId(/^pie-slice-/)).toHaveLength(2);
    expect(screen.getByTestId("overlap-donut")).toHaveAttribute("role", "img");
    expect(screen.getByTestId("overlap-donut")).toHaveAttribute("aria-label", "Overlap 18.0%");
    expect(screen.getByTestId("overlap-donut-figure")).toHaveTextContent("18.0%");
    expect(screen.getByTestId("overlap-donut-label")).toHaveTextContent("overlap with your portfolio");
    expect(screen.getByTestId("overlap-donut-caption")).toHaveTextContent("3 common stocks out of 12 total holdings");
  });

  it("takes the rest from the exact decimal difference, never below zero", () => {
    const { rerender } = render(<OverlapDonut pct="17.3333" label="l" caption="c" />);
    expect(pie.props!.data[1].value).toBe(82.6667);
    rerender(<OverlapDonut pct="0.0000" label="l" caption="c" />);
    expect(pie.props!.data.map(slice => slice.value)).toEqual([0, 100]);
    expect(screen.getByTestId("overlap-donut-figure")).toHaveTextContent("0.0%");
    rerender(<OverlapDonut pct="100.0000" label="l" caption="c" />);
    expect(pie.props!.data.map(slice => slice.value)).toEqual([100, 0]);
    rerender(<OverlapDonut pct="100.0001" label="l" caption="c" />);
    expect(pie.props!.data[1].value).toBe(0);
  });
});
