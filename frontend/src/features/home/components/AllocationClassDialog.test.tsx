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
