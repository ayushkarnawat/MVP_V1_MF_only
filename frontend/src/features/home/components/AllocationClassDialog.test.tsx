import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatLegendPercent } from "../allocationCopy";
import { formatRupees } from "../homeFormat";
import type { ClassRowOut } from "../types";
import { AllocationClassDialog } from "./AllocationClassDialog";

const ROW: ClassRowOut = {
  key: "equity", label: "Equity", status: "live", value: "2200.00", percentage: "42.21",
  funds: [
    { scheme_id: "s1", name: "Alpha Flexi Cap Fund - Direct Growth", value: "1500.00", share_of_class: "68.18" },
    { scheme_id: "s2", name: "Beta Large Cap Fund - Direct Growth", value: "700.00", share_of_class: "31.82" },
  ],
};
const open = (row: ClassRowOut = ROW, extra: { hideValues?: boolean; onClose?: () => void } = {}) =>
  render(<AllocationClassDialog open row={row} onClose={extra.onClose ?? vi.fn()} hideValues={extra.hideValues} />);

describe("AllocationClassDialog", () => {
  it("names the class and shows its value and share", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "Equity" });
    expect(dialog).toHaveTextContent(formatRupees("2200.00"));
    expect(dialog).toHaveTextContent(formatLegendPercent("42.21"));
  });
  it("lists the funds in the order given with value and share of the class", () => {
    open();
    const table = screen.getByRole("table", { name: "Funds in Equity" });
    expect(within(table).getAllByRole("columnheader").map(header => header.textContent)).toEqual(["Fund", "Value", "Share of class"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Alpha Flexi Cap Fund - Direct Growth");
    expect(rows[0]).toHaveTextContent(formatRupees("1500.00"));
    expect(rows[0]).toHaveTextContent(formatLegendPercent("68.18"));
    expect(rows[1]).toHaveTextContent("Beta Large Cap Fund - Direct Growth");
  });
  it("shows the totals and a plain message when the class has no funds", () => {
    open({ ...ROW, funds: [] });
    const dialog = screen.getByRole("dialog", { name: "Equity" });
    expect(dialog).toHaveTextContent(formatRupees("2200.00"));
    expect(within(dialog).getByText("Fund details are not available for this class yet.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("table")).toBeNull();
  });
  it("shows the same message when the funds field is missing (an old payload)", () => {
    const { funds: _funds, ...old } = ROW;
    open(old);
    expect(screen.getByText("Fund details are not available for this class yet.")).toBeInTheDocument();
  });
  it("hides every rupee amount when values are hidden, and keeps the shares", () => {
    open(ROW, { hideValues: true });
    const dialog = screen.getByRole("dialog", { name: "Equity" });
    expect(dialog.textContent).not.toContain("₹");
    expect(dialog).toHaveTextContent("••••••");
    expect(dialog).toHaveTextContent(formatLegendPercent("68.18"));
  });
  it("full coverage shows no remainder line", () => {
    open();
    expect(screen.queryByTestId("class-remainder")).toBeNull();
  });
  it("partial coverage shows what is not attributed to a fund, as its own line and not as a fund row", () => {
    // Backend example: a class worth 500.00 of which one disclosed fund is 10.00 (2.00% of the class).
    open({ key: "others", label: "Others", status: "live", value: "500.00", percentage: "50.00", funds: [
      { scheme_id: "s9", name: "Covered Other", value: "10.00", share_of_class: "2.00" },
    ] });
    const table = screen.getByRole("table", { name: "Funds in Others" });
    expect(within(table).getAllByRole("row").slice(1)).toHaveLength(1);
    const line = screen.getByTestId("class-remainder");
    expect(line).toHaveTextContent("Not attributed to a fund");
    expect(line).toHaveTextContent(formatRupees("490.00"));
    expect(line).toHaveTextContent(formatLegendPercent("98.00"));
    expect(table).not.toHaveTextContent("Not attributed");
  });
  it("the remainder is worked out in whole paise, so decimal sums do not leave a phantom line", () => {
    open({ key: "debt", label: "Debt", status: "live", value: "0.30", percentage: "5.00", funds: [
      { scheme_id: "a", name: "A", value: "0.10", share_of_class: "33.33" },
      { scheme_id: "b", name: "B", value: "0.20", share_of_class: "66.67" },
    ] });
    expect(screen.queryByTestId("class-remainder")).toBeNull();
  });
  it("hides the remainder amount when values are hidden, and keeps its share", () => {
    open({ key: "others", label: "Others", status: "live", value: "500.00", percentage: "50.00", funds: [
      { scheme_id: "s9", name: "Covered Other", value: "10.00", share_of_class: "2.00" },
    ] }, { hideValues: true });
    const line = screen.getByTestId("class-remainder");
    expect(line.textContent).not.toContain("₹");
    expect(line).toHaveTextContent("••••••");
    expect(line).toHaveTextContent(formatLegendPercent("98.00"));
  });
  it("a class with no funds shows no remainder line, only the plain message", () => {
    open({ ...ROW, funds: [] });
    expect(screen.queryByTestId("class-remainder")).toBeNull();
  });
  it("Esc and the Close button call onClose", () => {
    const onClose = vi.fn();
    open(ROW, { onClose });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("renders nothing when it is not open", () => {
    render(<AllocationClassDialog open={false} row={ROW} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
