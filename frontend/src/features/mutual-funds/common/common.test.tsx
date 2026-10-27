import { useState } from "react";
import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Layers, PieChart } from "lucide-react";
import { SectionCard } from "./SectionCard";
import { BarList, ChartTypeToggle, SlicedDonut, useSelectedSlice } from "./charts";
import type { Slice } from "../types";

const SLICES: Slice[] = [
  { key: "a", label: "HDFC Mutual Fund", value: "1310000.00", pct: "40", color: "var(--c1)" },
  { key: "b", label: "Kotak Mahindra Mutual Fund", value: "1540000.00", pct: "60", color: "var(--c2)" },
];

describe("SectionCard", () => {
  it("shows a skeleton while loading and no children", () => {
    render(<SectionCard title="Returns" state="loading" onRetry={() => {}}><p>body</p></SectionCard>);
    expect(screen.getByRole("status", { name: "Loading Returns" })).toBeInTheDocument();
    expect(screen.queryByText("body")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Returns" })).toBeInTheDocument();
  });
  it("shows the given skeleton instead of the default one", () => {
    render(<SectionCard title="Returns" state="loading" onRetry={() => {}} skeleton={<i>custom skeleton</i>}>x</SectionCard>);
    expect(screen.getByText("custom skeleton")).toBeInTheDocument();
  });
  it.each(["failed", "error"] as const)("shows the failure message and a Retry that calls onRetry when %s", state => {
    const onRetry = vi.fn();
    render(<SectionCard title="Returns" state={state} onRetry={onRetry}><p>body</p></SectionCard>);
    expect(screen.getByRole("alert")).toHaveTextContent("This section failed to load, but the rest of the page is unaffected.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("body")).not.toBeInTheDocument();
  });
  it("shows the children when ready and a hoverable info mark when info is given", () => {
    render(<SectionCard title="Returns" info="Annualised and absolute returns." state="ready" onRetry={() => {}}><p>body</p></SectionCard>);
    expect(screen.getByText("body")).toBeInTheDocument();
    const info = screen.getByRole("img", { name: "Annualised and absolute returns." });
    expect(info).toHaveAttribute("data-tooltip", "Annualised and absolute returns.");
    expect(info).toHaveAttribute("title", "Annualised and absolute returns.");
  });
});

describe("ChartTypeToggle", () => {
  const options = [{ id: "donut", label: "Donut", icon: PieChart }, { id: "bar", label: "Bar", icon: Layers }] as const;
  it("has a visible label and a radiogroup with the current option checked", () => {
    render(<ChartTypeToggle value="donut" options={options} onChange={() => {}} label="Chart type" />);
    expect(screen.getByText("Chart type")).toBeVisible();
    const group = screen.getByRole("radiogroup", { name: "Chart type" });
    expect(within(group).getByRole("radio", { name: "Donut" })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "Bar" })).toHaveAttribute("aria-checked", "false");
  });
  it("changes value on click and with the arrow keys", () => {
    const onChange = vi.fn();
    render(<ChartTypeToggle value="donut" options={options} onChange={onChange} label="Chart type" />);
    fireEvent.click(screen.getByRole("radio", { name: "Bar" }));
    expect(onChange).toHaveBeenLastCalledWith("bar");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Donut" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("bar");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Bar" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("donut");
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});

describe("BarList", () => {
  it("draws bars in proportion to their percentage and formats the value with the given function", () => {
    render(<BarList items={SLICES} selectedKey={null} onSelect={() => {}} formatValue={slice => `v:${slice.label}`} />);
    expect(screen.getByTestId("bar-a")).toHaveStyle({ width: "40%" });
    expect(screen.getByTestId("bar-b")).toHaveStyle({ width: "60%" });
    expect(screen.getByText("v:HDFC Mutual Fund")).toBeInTheDocument();
  });
  it("selects on click and marks the selected row", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<BarList items={SLICES} selectedKey={null} onSelect={onSelect} formatValue={() => ""} />);
    fireEvent.click(screen.getByRole("button", { name: /HDFC Mutual Fund/ }));
    expect(onSelect).toHaveBeenCalledWith("a");
    rerender(<BarList items={SLICES} selectedKey="a" onSelect={onSelect} formatValue={() => ""} />);
    expect(screen.getByRole("button", { name: /HDFC Mutual Fund/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /HDFC Mutual Fund/ })).toHaveAttribute("data-selected", "true");
    expect(screen.getByRole("button", { name: /Kotak/ })).toHaveAttribute("aria-pressed", "false");
  });
});

function Donut() {
  const sel = useSelectedSlice(SLICES);
  return <SlicedDonut slices={SLICES} selectedKey={sel.selectedKey} onSelect={sel.select} activeKey={sel.activeKey} onActiveChange={sel.hover} centre={{ label: "Total", value: "₹28.50 L" }} />;
}

describe("SlicedDonut", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("shows the total in the centre and no popup at rest", () => {
    render(<Donut />);
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Total");
    expect(screen.getByTestId("donut-centre-value")).toHaveTextContent("₹28.50 L");
    expect(screen.queryByTestId("donut-centre-pct")).not.toBeInTheDocument();
    expect(screen.getByTestId("donut-popup")).toHaveAttribute("data-visible", "false");
  });
  it("on hover pops the slice, dims the others to 38 percent, swaps the centre and opens the popup", () => {
    render(<Donut />);
    fireEvent.mouseEnter(screen.getByTestId("slice-a"));
    expect(screen.getByTestId("slice-a")).toHaveAttribute("data-popped", "true");
    expect(screen.getByTestId("slice-a").getAttribute("style")).toContain("translate(");
    expect(screen.getByTestId("slice-b")).toHaveAttribute("data-dim", "true");
    expect(screen.getByTestId("slice-b").style.opacity).toBe("0.38");
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("HDFC Mutual Fund");
    expect(screen.getByTestId("donut-centre-value")).toHaveTextContent("₹13.10 L");
    expect(screen.getByTestId("donut-centre-pct")).toHaveTextContent("40.0%");
    expect(screen.getByTestId("donut-popup")).toHaveAttribute("data-visible", "true");
    expect(screen.getByTestId("popup-pct")).toHaveTextContent("40.0%");
    expect(screen.getByTestId("popup-value")).toHaveTextContent("₹13,10,000");
    fireEvent.mouseLeave(screen.getByTestId("slice-a"));
    expect(screen.getByTestId("slice-b")).toHaveAttribute("data-dim", "false");
    expect(screen.getByTestId("donut-popup")).toHaveAttribute("data-visible", "false");
  });
  it("a click is a persistent selection that survives the mouse leaving", () => {
    render(<Donut />);
    fireEvent.mouseEnter(screen.getByTestId("slice-b"));
    fireEvent.click(screen.getByTestId("slice-b"));
    fireEvent.mouseLeave(screen.getByTestId("slice-b"));
    expect(screen.getByTestId("slice-b")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("slice-b")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("slice-b")).toHaveAttribute("data-popped", "true");
    expect(screen.getByTestId("slice-a")).toHaveAttribute("data-dim", "true");
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Kotak Mahindra Mutual Fund");
  });
  it("selects with the keyboard", () => {
    render(<Donut />);
    fireEvent.keyDown(screen.getByTestId("slice-a"), { key: "Enter" });
    expect(screen.getByTestId("slice-a")).toHaveAttribute("data-selected", "true");
    fireEvent.keyDown(screen.getByTestId("slice-b"), { key: " " });
    expect(screen.getByTestId("slice-b")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("slice-a")).toHaveAttribute("data-selected", "false");
  });
  it("draws arcs from the percentages", () => {
    render(<Donut />);
    const first = screen.getByTestId("slice-a").querySelector("circle")!;
    const second = screen.getByTestId("slice-b").querySelector("circle")!;
    expect(first.getAttribute("stroke")).toBe("var(--c1)");
    expect(first.getAttribute("stroke-dasharray")).toBe("171.93 267.89");
    expect(first.getAttribute("transform")).toBe("rotate(-90 100 100)");
    expect(second.getAttribute("transform")).toBe("rotate(54 100 100)");
  });
  it("does not pop the slice when the user prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }));
    render(<Donut />);
    fireEvent.mouseEnter(screen.getByTestId("slice-a"));
    expect(screen.getByTestId("slice-a")).toHaveAttribute("data-motion", "reduced");
    expect(screen.getByTestId("slice-a").getAttribute("style") ?? "").not.toContain("translate(");
    expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("HDFC Mutual Fund");
  });
});

describe("useSelectedSlice", () => {
  it("selects, clears, and drops a selection whose slice has gone", () => {
    const { result, rerender } = renderHook(({ slices }) => useSelectedSlice(slices), { initialProps: { slices: SLICES } });
    expect(result.current.selectedKey).toBeNull();
    act(() => result.current.select("a"));
    expect(result.current.selectedKey).toBe("a");
    act(() => result.current.clear());
    expect(result.current.selectedKey).toBeNull();
    act(() => result.current.select("b"));
    rerender({ slices: SLICES.slice(0, 1) });
    expect(result.current.selectedKey).toBeNull();
  });
  it("tracks the hovered slice separately from the selected one", () => {
    const { result } = renderHook(() => useSelectedSlice(SLICES));
    act(() => result.current.hover("a"));
    expect(result.current.activeKey).toBe("a");
    expect(result.current.selectedKey).toBeNull();
    act(() => result.current.hover(null));
    expect(result.current.activeKey).toBeNull();
  });
  it("is usable from a component that owns other state", () => {
    function Harness() { const [n, setN] = useState(0); const s = useSelectedSlice(SLICES); return <button onClick={() => { setN(n + 1); s.select("a"); }}>{`${n}:${s.selectedKey}`}</button>; }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("1:a");
  });
});
