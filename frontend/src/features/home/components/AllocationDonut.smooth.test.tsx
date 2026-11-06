import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AllocationDonut } from "./AllocationDonut";

const ROWS = [
  { key: "equity", label: "Equity", value: "2200.00", percentage: "60.00", color: "var(--c1)" },
  { key: "debt", label: "Debt", value: "1000.00", percentage: "25.00", color: "var(--c2)" },
  { key: "gold", label: "Gold", value: "500.00", percentage: "15.00", color: "var(--c3)" },
];
const slice = (key: string) => screen.getByTestId(`slice-${key}`);
const hit = (key: string) => screen.getByTestId(`hit-${key}`);
const classOf = (key: string) => slice(key).getAttribute("class") ?? "";

describe("AllocationDonut: smooth hover (QA fixes, A2)", () => {
  it("every slice fades: a 150 ms ease on opacity and stroke width, switched off for reduced motion", () => {
    render(<AllocationDonut rows={ROWS} centerValue="x" onSliceClick={() => {}} />);
    for (const row of ROWS) {
      expect(classOf(row.key)).toContain("transition-[opacity,stroke-width]");
      expect(classOf(row.key)).toContain("duration-150");
      expect(classOf(row.key)).toContain("motion-reduce:transition-none");
    }
  });
  it("a donut without a click handler fades too, and dims through a class", () => {
    render(<AllocationDonut rows={ROWS} centerValue="x" activeKey="debt" />);
    expect(classOf("equity")).toContain("transition-[opacity,stroke-width]");
    expect(classOf("equity")).toContain("opacity-[0.38]");
    expect(slice("equity").style.opacity).toBe("");
  });
  it("the active slice grows from 22 to 25, the others stay 22, and none grow when nothing is active", () => {
    const { rerender } = render(<AllocationDonut rows={ROWS} centerValue="x" onSliceClick={() => {}} activeKey="debt" />);
    expect(slice("debt").getAttribute("stroke-width")).toBe("25");
    expect(slice("equity").getAttribute("stroke-width")).toBe("22");
    expect(slice("gold").getAttribute("stroke-width")).toBe("22");
    rerender(<AllocationDonut rows={ROWS} centerValue="x" onSliceClick={() => {}} activeKey={null} />);
    for (const row of ROWS) expect(slice(row.key).getAttribute("stroke-width")).toBe("22");
  });
  it("each slice has a wider transparent hit ring with the same arc, so the gaps do not drop the hover", () => {
    render(<AllocationDonut rows={ROWS} centerValue="x" onSliceClick={() => {}} />);
    for (const row of ROWS) {
      const ring = hit(row.key);
      expect(ring.getAttribute("stroke")).toBe("transparent");
      expect(ring.getAttribute("stroke-width")).toBe("28");
      expect(ring.getAttribute("stroke-dasharray")).toBe(slice(row.key).getAttribute("stroke-dasharray"));
      expect(ring.getAttribute("stroke-dashoffset")).toBe(slice(row.key).getAttribute("stroke-dashoffset"));
      expect(ring.getAttribute("transform")).toBe("rotate(-90 80 80)");
      expect(ring.getAttribute("aria-hidden")).toBe("true");
      expect(ring.getAttribute("role")).toBeNull();
      expect(ring.getAttribute("tabindex")).toBeNull();
    }
  });
  it("the hit ring reports hover and leave, and a click on it opens the class like the slice does", () => {
    const onActiveChange = vi.fn();
    const onSliceClick = vi.fn();
    render(<AllocationDonut rows={ROWS} centerValue="x" onSliceClick={onSliceClick} onActiveChange={onActiveChange} />);
    fireEvent.mouseEnter(hit("gold"));
    fireEvent.mouseLeave(hit("gold"));
    fireEvent.click(hit("debt"));
    expect(onActiveChange.mock.calls.map(call => call[0])).toEqual(["gold", null]);
    expect(onSliceClick).toHaveBeenCalledWith("debt");
  });
  it("the hit rings are drawn only for an interactive donut and are not counted as slices", () => {
    const { unmount } = render(<AllocationDonut rows={ROWS} centerValue="x" />);
    expect(screen.queryByTestId("hit-equity")).toBeNull();
    unmount();
    render(<AllocationDonut rows={ROWS} centerValue="x" onSliceClick={() => {}} />);
    expect(screen.getAllByTestId(/^slice-/)).toHaveLength(3);
    expect(screen.getAllByTestId(/^hit-/)).toHaveLength(3);
  });
  it("keeps keyboard behaviour: a slice is still focusable and focus reports the key", () => {
    const onActiveChange = vi.fn();
    render(<AllocationDonut rows={ROWS} centerValue="x" onSliceClick={() => {}} onActiveChange={onActiveChange} />);
    expect(slice("equity").getAttribute("tabindex")).toBe("0");
    fireEvent.focus(slice("equity"));
    fireEvent.blur(slice("equity"));
    expect(onActiveChange.mock.calls.map(call => call[0])).toEqual(["equity", null]);
  });
  it("the donut and the legend row are memoised so only a changed part redraws", async () => {
    const { AllocationLegendRow } = await import("./AllocationLegendRow");
    expect((AllocationDonut as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
    expect((AllocationLegendRow as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  });
});
