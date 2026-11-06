import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AllocationDonut } from "./AllocationDonut";

const R = 58;
const C = 2 * Math.PI * R;
const round2 = (value: number) => Math.round(value * 100) / 100;

const ROWS = [
  { key: "equity", label: "Equity", value: "2200.00", percentage: "60.00", color: "var(--c1)" },
  { key: "debt", label: "Debt", value: "1000.00", percentage: "25.00", color: "var(--c2)" },
  { key: "gold", label: "Gold", value: "500.00", percentage: "15.00", color: "var(--c3)" },
];

function slice(key: string) {
  return screen.getByTestId(`slice-${key}`);
}

describe("AllocationDonut", () => {
  it("draws an image with the default label and the centre texts", () => {
    render(<AllocationDonut rows={ROWS} centerValue="₹52.12 L" />);
    expect(screen.getByRole("img", { name: "Asset allocation" })).toBeInTheDocument();
    expect(screen.getByTestId("donut-center-value").textContent).toBe("₹52.12 L");
    expect(screen.getByTestId("donut-center-label").textContent).toBe("Total value");
  });

  it("takes its own label and centre caption", () => {
    render(<AllocationDonut rows={ROWS} centerValue="₹1" centerLabel="Value" ariaLabel="Mix" />);
    expect(screen.getByRole("img", { name: "Mix" })).toBeInTheDocument();
    expect(screen.getByTestId("donut-center-label").textContent).toBe("Value");
  });

  it("draws one stroked circle per slice with the geometry of the signed-off mockup", () => {
    render(<AllocationDonut rows={ROWS} centerValue="x" />);
    let used = 0;
    for (const row of ROWS) {
      const length = C * Number(row.percentage) / 100;
      const circle = slice(row.key);
      expect(circle.getAttribute("r")).toBe("58");
      expect(circle.getAttribute("cx")).toBe("80");
      expect(circle.getAttribute("cy")).toBe("80");
      expect(circle.getAttribute("fill")).toBe("none");
      expect(circle.getAttribute("stroke")).toBe(row.color);
      expect(circle.getAttribute("stroke-width")).toBe("22");
      expect(circle.getAttribute("stroke-dasharray")).toBe(`${round2(length)} ${round2(C - length)}`);
      expect(circle.getAttribute("stroke-dashoffset")).toBe(String(-round2(used)));
      expect(circle.getAttribute("transform")).toBe("rotate(-90 80 80)");
      used += length;
    }
  });

  it("skips a slice with no share", () => {
    render(<AllocationDonut rows={[...ROWS, { key: "others", label: "Others", value: "0.00", percentage: "0.00", color: "var(--ui-divider)" }]} centerValue="x" />);
    expect(screen.queryByTestId("slice-others")).toBeNull();
    expect(screen.getAllByTestId(/^slice-/)).toHaveLength(3);
  });

  it("draws a single full ring for a single class", () => {
    render(<AllocationDonut rows={[{ key: "debt", label: "Debt", value: "5.00", percentage: "100.00", color: "var(--c1)" }]} centerValue="x" />);
    expect(slice("debt").getAttribute("stroke-dasharray")).toBe(`${round2(C)} 0`);
  });

  it("draws no slices and still shows the centre when there is nothing to draw", () => {
    render(<AllocationDonut rows={[]} centerValue="₹0" />);
    expect(screen.queryAllByTestId(/^slice-/)).toHaveLength(0);
    expect(screen.getByTestId("donut-center-value").textContent).toBe("₹0");
  });

  it("names each slice for assistive technology and a tooltip", () => {
    render(<AllocationDonut rows={ROWS} centerValue="x" />);
    expect(slice("equity").querySelector("title")?.textContent).toBe("Equity 60.0%");
  });

  it("is not interactive without a click handler", () => {
    render(<AllocationDonut rows={ROWS} centerValue="x" />);
    expect(slice("equity").getAttribute("role")).toBeNull();
    expect(slice("equity").getAttribute("tabindex")).toBeNull();
  });

  it("makes slices buttons with a handler: click, Enter and Space call it with the class key", () => {
    const onSliceClick = vi.fn();
    render(<AllocationDonut rows={ROWS} centerValue="x" onSliceClick={onSliceClick} />);
    const circle = slice("debt");
    expect(circle.getAttribute("role")).toBe("button");
    expect(circle.getAttribute("tabindex")).toBe("0");
    expect(circle.getAttribute("aria-label")).toBe("Debt 25.0%");
    fireEvent.click(circle);
    fireEvent.keyDown(circle, { key: "Enter" });
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    circle.dispatchEvent(space);
    expect(onSliceClick).toHaveBeenCalledTimes(3);
    expect(onSliceClick).toHaveBeenLastCalledWith("debt");
    expect(space.defaultPrevented).toBe(true);
    fireEvent.keyDown(circle, { key: "a" });
    expect(onSliceClick).toHaveBeenCalledTimes(3);
  });

  it("uses only palette variables", () => {
    const { container } = render(<AllocationDonut rows={ROWS} centerValue="x" />);
    expect(container.innerHTML).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(container.innerHTML).toContain("var(--ui-text)");
  });
});

describe("AllocationDonut: hover, focus and selected state (UI round 2, change 6)", () => {
  it("dims every other slice when a class is active, from outside (the legend)", () => {
    render(<AllocationDonut rows={ROWS} centerValue="x" onSliceClick={() => {}} activeKey="debt" />);
    expect(slice("debt").getAttribute("data-dim")).toBe("false");
    // QA fixes, A2: dimming is a class (so it can fade), never an inline opacity.
    expect(slice("debt").style.opacity).toBe("");
    expect(slice("debt").getAttribute("class") ?? "").not.toContain("opacity-[0.38]");
    for (const key of ["equity", "gold"]) {
      expect(slice(key).getAttribute("data-dim")).toBe("true");
      expect(slice(key).style.opacity).toBe("");
      expect(slice(key).getAttribute("class") ?? "").toContain("opacity-[0.38]");
    }
  });
  it("dims nothing when no class is active", () => {
    render(<AllocationDonut rows={ROWS} centerValue="x" onSliceClick={() => {}} activeKey={null} />);
    for (const row of ROWS) expect(slice(row.key).getAttribute("data-dim")).toBe("false");
  });
  it("reports the hovered and the focused slice, and null when the pointer or focus leaves", () => {
    const onActiveChange = vi.fn();
    render(<AllocationDonut rows={ROWS} centerValue="x" onSliceClick={() => {}} onActiveChange={onActiveChange} />);
    fireEvent.mouseEnter(slice("gold"));
    fireEvent.mouseLeave(slice("gold"));
    fireEvent.focus(slice("equity"));
    fireEvent.blur(slice("equity"));
    expect(onActiveChange.mock.calls.map(call => call[0])).toEqual(["gold", null, "equity", null]);
  });
  it("marks the selected slice with aria-pressed and the others as not pressed", () => {
    render(<AllocationDonut rows={ROWS} centerValue="x" onSliceClick={() => {}} selectedKey="debt" />);
    expect(slice("debt").getAttribute("aria-pressed")).toBe("true");
    expect(slice("equity").getAttribute("aria-pressed")).toBe("false");
    expect(slice("gold").getAttribute("aria-pressed")).toBe("false");
  });
  it("a donut without a click handler has no pressed state and does not report hover", () => {
    const onActiveChange = vi.fn();
    render(<AllocationDonut rows={ROWS} centerValue="x" onActiveChange={onActiveChange} />);
    expect(slice("debt").getAttribute("aria-pressed")).toBeNull();
    fireEvent.mouseEnter(slice("debt"));
    expect(onActiveChange).not.toHaveBeenCalled();
  });
});
