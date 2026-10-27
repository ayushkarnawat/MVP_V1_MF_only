import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstrumentDonut, type InstrumentDonutProps } from "./InstrumentDonut";

const ONE = [{ key: "mutual-funds", label: "Mutual Funds", percentage: "100.00", value: "5212.00", color: "var(--c1)" }];
const TWO = [
  { key: "mutual-funds", label: "Mutual Funds", percentage: "60.00", value: "3000.00", color: "var(--c1)" },
  { key: "gold", label: "Gold", percentage: "40.00", value: "2000.00", color: "var(--c6)" },
];

function setup(overrides: Partial<InstrumentDonutProps> = {}) {
  const onActiveChange = vi.fn();
  const props: InstrumentDonutProps = {
    rows: ONE,
    centerLabel: "Total Portfolio",
    centerValue: "₹5,212",
    activeKey: null,
    onActiveChange,
    ...overrides,
  };
  const view = render(<InstrumentDonut {...props} />);
  return { ...view, onActiveChange };
}

const circle = (key: string) => screen.getByTestId(`slice-${key}`).querySelector("circle")!;

describe("InstrumentDonut: drawing", () => {
  it("draws a 200 by 200 svg with a track ring and the default accessible name", () => {
    setup();
    const svg = screen.getByRole("img", { name: "Asset allocation" });
    expect(svg).toHaveAttribute("viewBox", "0 0 200 200");
    const track = screen.getByTestId("donut-track");
    expect(track).toHaveAttribute("r", "70");
    expect(track).toHaveAttribute("stroke-width", "28");
    expect(track).toHaveAttribute("stroke", "var(--ui-divider)");
  });

  it("uses a given accessible name", () => {
    setup({ ariaLabel: "Allocation by class" });
    expect(screen.getByRole("img", { name: "Allocation by class" })).toBeInTheDocument();
  });

  it("draws one full ring, with no gap, for a single slice", () => {
    setup();
    const ring = circle("mutual-funds");
    expect(ring).toHaveAttribute("stroke", "var(--c1)");
    expect(ring).toHaveAttribute("stroke-dasharray", "439.82 0");
    expect(ring).toHaveAttribute("transform", "rotate(-90 100 100)");
    expect(ring).toHaveAttribute("r", "70");
    expect(ring).toHaveAttribute("stroke-width", "28");
  });

  it("leaves a four unit gap between slices and starts each one where the last ended", () => {
    setup({ rows: TWO });
    expect(circle("mutual-funds")).toHaveAttribute("stroke-dasharray", "259.89 179.93");
    expect(circle("mutual-funds")).toHaveAttribute("transform", "rotate(-90 100 100)");
    expect(circle("gold")).toHaveAttribute("stroke-dasharray", "171.93 267.89");
    expect(circle("gold")).toHaveAttribute("transform", "rotate(126 100 100)");
    expect(circle("gold")).toHaveAttribute("stroke", "var(--c6)");
  });

  it("draws only the track when there are no slices", () => {
    setup({ rows: [] });
    expect(screen.getByTestId("donut-track")).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^slice-/)).toHaveLength(0);
  });

  it("names every slice for assistive technology", () => {
    setup({ rows: TWO });
    expect(screen.getByRole("img", { name: "Mutual Funds 60.0%" })).toBe(screen.getByTestId("slice-mutual-funds"));
    expect(screen.getByRole("img", { name: "Gold 40.0%" })).toBe(screen.getByTestId("slice-gold"));
  });
});

describe("InstrumentDonut: centre", () => {
  it("shows the label and the value, and no percentage unless one is given", () => {
    setup();
    expect(screen.getByTestId("donut-center-label")).toHaveTextContent("Total Portfolio");
    expect(screen.getByTestId("donut-center-value")).toHaveTextContent("₹5,212");
    expect(screen.queryByTestId("donut-center-pct")).toBeNull();
  });

  it("shows the percentage when given", () => {
    setup({ centerLabel: "Mutual Funds", centerPct: "100.0%" });
    expect(screen.getByTestId("donut-center-label")).toHaveTextContent("Mutual Funds");
    expect(screen.getByTestId("donut-center-pct")).toHaveTextContent("100.0%");
  });
});

describe("InstrumentDonut: hover and focus", () => {
  it("reports the hovered or focused slice and the end of the hover", () => {
    const { onActiveChange } = setup({ rows: TWO });
    const slice = screen.getByTestId("slice-gold");
    fireEvent.mouseEnter(slice);
    expect(onActiveChange).toHaveBeenLastCalledWith("gold");
    fireEvent.mouseLeave(slice);
    expect(onActiveChange).toHaveBeenLastCalledWith(null);
    fireEvent.focus(slice);
    expect(onActiveChange).toHaveBeenLastCalledWith("gold");
    fireEvent.blur(slice);
    expect(onActiveChange).toHaveBeenLastCalledWith(null);
    expect(slice).toHaveAttribute("tabindex", "0");
  });

  it("pops the active slice out and dims the others", () => {
    setup({ rows: TWO, activeKey: "gold" });
    expect(screen.getByTestId("slice-gold")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("slice-gold")).toHaveAttribute("data-dim", "false");
    expect(screen.getByTestId("slice-mutual-funds")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("slice-mutual-funds")).toHaveAttribute("data-dim", "true");
  });

  it("dims nothing when no slice is active", () => {
    setup({ rows: TWO });
    for (const key of ["mutual-funds", "gold"]) {
      expect(screen.getByTestId(`slice-${key}`)).toHaveAttribute("data-active", "false");
      expect(screen.getByTestId(`slice-${key}`)).toHaveAttribute("data-dim", "false");
    }
  });

  it("keeps the centre inside the figure", () => {
    setup();
    expect(within(screen.getByTestId("donut-center")).getByTestId("donut-center-value")).toBeInTheDocument();
  });
});
