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
