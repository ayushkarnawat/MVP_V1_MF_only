import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryChart } from "./HistoryChart";
import type { HistoryPoint } from "./api";

const points: HistoryPoint[] = [
  { month: "2024-01-31", value: 100, invested: 90, valueText: "100.49", investedText: "90.00", partial: false, missing: [] },
  { month: "2024-03-31", value: 1234.5, invested: 1000, valueText: "1234.50", investedText: "1000.00", partial: true, missing: ["Missing Fund"] },
];
function pointer(svg: Element, type: string, x: number, pointerType = "mouse") {
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, width: 640 } as DOMRect);
  const event = new MouseEvent(type, { bubbles: true, clientX: x });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(svg, event);
}
describe("HistoryChart", () => {
  it("hover shows exact money, cost and gain with a snapped marker", () => {
    render(<HistoryChart points={points} selectedMonth={null} onSelectMonth={vi.fn()} />);
    pointer(screen.getByRole("img"), "pointermove", 640);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Mar 2024");
    expect(tooltip).toHaveTextContent("Portfolio value ₹1,235");
    expect(tooltip).toHaveTextContent("Cost of holdings ₹1,000");
    expect(tooltip).toHaveTextContent("Gain ₹235");
    expect(tooltip).toHaveTextContent("Missing Fund");
  });
  it("subtracts before rounding displayed gain", () => {
    render(<HistoryChart points={[{ ...points[0], valueText: "1234.4999999999999", investedText: "1000.00" }]} selectedMonth={null} onSelectMonth={vi.fn()} />);
    pointer(screen.getByRole("img"), "pointermove", 320);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Gain ₹234");
  });
  it("click selects the ISO month", () => {
    const select = vi.fn();
    render(<HistoryChart points={points} selectedMonth={null} onSelectMonth={select} />);
    pointer(screen.getByRole("img"), "click", 640);
    expect(select).toHaveBeenCalledWith("2024-03-31");
  });
  it("supports arrows, Enter and Escape", () => {
    const select = vi.fn();
    render(<HistoryChart points={points} selectedMonth={null} onSelectMonth={select} />);
    const svg = screen.getByRole("img");
    expect(svg).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Jan 2024");
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "Enter" });
    expect(select).toHaveBeenCalledWith("2024-03-31");
    fireEvent.keyDown(svg, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
  it("first touch selects a card, See details or second touch opens", () => {
    const select = vi.fn();
    render(<HistoryChart points={points} selectedMonth={null} onSelectMonth={select} />);
    const svg = screen.getByRole("img");
    pointer(svg, "pointerdown", 640, "touch");
    pointer(svg, "pointerup", 640, "touch");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Mar 2024");
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "See details" }));
    expect(select).toHaveBeenCalledTimes(1);
    pointer(svg, "pointerdown", 640, "touch");
    pointer(svg, "pointerup", 640, "touch");
    expect(select).toHaveBeenCalledTimes(2);
  });
  it("renders the legend and last month-end subtitle", () => {
    render(<HistoryChart points={points} selectedMonth={null} onSelectMonth={vi.fn()} />);
    expect(screen.getByText("Cost of holdings")).toBeInTheDocument();
    expect(screen.getByText("Month-end values · latest 31 March 2024")).toBeInTheDocument();
  });
  it("one old saved point without invested renders safely and hides cost, area and gain", () => {
    const { container } = render(<HistoryChart points={[{ month: "2024-01-31", value: 100, partial: true, missing: [] } as unknown as HistoryPoint]} selectedMonth={null} onSelectMonth={vi.fn()} />);
    pointer(screen.getByRole("img"), "pointermove", 320);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Portfolio value ₹100");
    expect(within(screen.getByRole("tooltip")).queryByText(/Cost of holdings|Gain/)).not.toBeInTheDocument();
    expect(container.querySelector('path[fill-opacity]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
  });
});


it("a touch drag on the selected month does not open details", () => {
  const select = vi.fn();
  render(<HistoryChart points={points} selectedMonth={null} onSelectMonth={select} />);
  const svg = screen.getByRole("img");
  pointer(svg, "pointerdown", 640, "touch");
  pointer(svg, "pointerup", 640, "touch");
  pointer(svg, "pointerdown", 640, "touch");
  pointer(svg, "pointerup", 500, "touch");
  expect(select).not.toHaveBeenCalled();
});

it("an out-and-back touch drag that ends where it began does not count as the second tap", () => {
  const select = vi.fn();
  render(<HistoryChart points={points} selectedMonth={null} onSelectMonth={select} />);
  const svg = screen.getByRole("img");
  pointer(svg, "pointerdown", 640, "touch");
  pointer(svg, "pointerup", 640, "touch");
  pointer(svg, "pointerdown", 640, "touch");
  pointer(svg, "pointermove", 500, "touch");
  pointer(svg, "pointermove", 640, "touch");
  pointer(svg, "pointerup", 640, "touch");
  expect(select).not.toHaveBeenCalled();
});
