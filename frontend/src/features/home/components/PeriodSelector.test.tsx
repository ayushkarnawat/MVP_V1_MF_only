import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PeriodSelector } from "./PeriodSelector";

const LABELS = ["1D", "1W", "1M", "1Y", "Custom"];

function buttons() {
  return screen.getAllByRole("radio");
}

describe("PeriodSelector", () => {
  it("shows a labelled group with the five periods in order", () => {
    render(<PeriodSelector value="1M" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Period" })).toBeInTheDocument();
    expect(buttons().map(button => button.textContent)).toEqual(LABELS);
  });

  it("marks only the current period as checked and makes only it tabbable", () => {
    render(<PeriodSelector value="1W" onChange={() => {}} />);
    const checked = buttons().map(button => button.getAttribute("aria-checked"));
    expect(checked).toEqual(["false", "true", "false", "false", "false"]);
    expect(buttons().map(button => button.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
  });

  it("calls onChange with the period value when a button is clicked", () => {
    const onChange = vi.fn();
    render(<PeriodSelector value="1M" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "1Y" }));
    expect(onChange).toHaveBeenLastCalledWith("1Y");
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));
    expect(onChange).toHaveBeenLastCalledWith("custom");
    fireEvent.click(screen.getByRole("radio", { name: "1D" }));
    expect(onChange).toHaveBeenLastCalledWith("1D");
  });

  it("moves with the arrow keys and wraps around", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PeriodSelector value="1M" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "1M" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("1Y");
    fireEvent.keyDown(screen.getByRole("radio", { name: "1M" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("1W");

    rerender(<PeriodSelector value="1D" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "1D" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("custom");

    rerender(<PeriodSelector value="custom" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Custom" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("1D");
  });

  it("moves keyboard focus to the period the arrow key selects", () => {
    render(<PeriodSelector value="1M" onChange={() => {}} />);
    const current = screen.getByRole("radio", { name: "1M" });
    current.focus();
    fireEvent.keyDown(current, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "1Y" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("radio", { name: "1Y" }), { key: "ArrowLeft" });
    expect(screen.getByRole("radio", { name: "1M" })).toHaveFocus();
  });

  it("ignores other keys", () => {
    const onChange = vi.fn();
    render(<PeriodSelector value="1M" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "1M" }), { key: "a" });
    fireEvent.keyDown(screen.getByRole("radio", { name: "1M" }), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a custom label on the Custom button while keeping its meaning", () => {
    const onChange = vi.fn();
    render(<PeriodSelector value="custom" customLabel="12 Oct – 20 Oct" onChange={onChange} />);
    const custom = buttons()[4];
    expect(custom.textContent).toBe("12 Oct – 20 Oct");
    expect(custom.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(custom);
    expect(onChange).toHaveBeenCalledWith("custom");
  });

  it("disables every button and does not call onChange", () => {
    const onChange = vi.fn();
    render(<PeriodSelector value="1M" disabled onChange={onChange} />);
    for (const button of buttons()) expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "1Y" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still calls onChange when the selected period is clicked again (the page decides what to do)", () => {
    const onChange = vi.fn();
    render(<PeriodSelector value="1M" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "1M" }));
    expect(onChange).toHaveBeenCalledWith("1M");
  });
});
