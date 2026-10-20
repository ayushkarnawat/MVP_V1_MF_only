import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PeriodBreakdown } from "./PeriodBreakdownTable";
import type { InvestmentWithdrawalBucket, InvestmentWithdrawalEntry } from "./types";

function entry(direction: InvestmentWithdrawalEntry["direction"], amount: string, type = "purchase_sip"): InvestmentWithdrawalEntry {
  return { transaction_id: direction, date: "2024-02-29", type, amount, direction, scheme_name: "Alpha", household_member_id: "m1", household_member_name: "Priya" };
}
const bucket: InvestmentWithdrawalBucket = {
  period: "2024-02", invested: "10000.00", withdrawn: "2000.00", switched_in: "3000.00", switched_out: "4000.00",
  entries: [entry("invested", "10000.00"), entry("withdrawn", "2000.00", "redemption"), entry("switched_in", "3000.00", "switch_in"),
    entry("switched_out", "4000.00", "switch_out"), entry("opening", "500000.00", "opening_balance")],
};

describe("PeriodBreakdown", () => {
  it("renders summary chips and a totals row with opening holdings outside the table", () => {
    render(<PeriodBreakdown bucket={bucket} periodTitle="February 2024" />);
    const summary = screen.getByRole("group", { name: "Period totals" });
    expect(summary).toHaveTextContent("Invested ₹10,000");
    expect(summary).toHaveTextContent("Withdrawn ₹2,000");
    expect(summary).toHaveTextContent("Switched in ₹3,000");
    expect(summary).toHaveTextContent("Switched out ₹4,000");
    expect(summary).toHaveTextContent("Opening holdings ₹5,00,000");
    const total = screen.getByRole("row", { name: /^Total/ });
    expect(within(total).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["Total", "₹10,000", "₹2,000", "₹3,000", "₹4,000", "₹7,000"]);
    expect(screen.queryByRole("group", { name: "Household member" })).not.toBeInTheDocument();
  });

  it("shows the empty state", () => {
    render(<PeriodBreakdown bucket={{ ...bucket, invested: "0.00", withdrawn: "0.00", entries: [] }} periodTitle="March 2024" />);
    expect(screen.getByText("No transactions in this period")).toBeInTheDocument();
  });

  it("uses exact negative rupee displays and half-up rounding without losing large integers", () => {
    render(<PeriodBreakdown bucket={{ ...bucket, entries: [entry("reversal", "9007199254740993.50", "reversal")] }} periodTitle="February 2024" />);
    const total = screen.getByRole("row", { name: /^Total/ });
    expect(within(total).getAllByText("-₹9,00,71,99,25,47,40,994")).toHaveLength(2);
  });

  it("opens and closes each fund's transactions with date, member and plain label", () => {
    render(<PeriodBreakdown bucket={bucket} periodTitle="February 2024" />);
    const toggle = screen.getByRole("button", { name: /Alpha transactions/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Alpha transactions" });
    expect(within(list).getByText("SIP")).toBeInTheDocument();
    expect(within(list).getAllByText(/29 February 2024/)).toHaveLength(4);
    expect(within(list).getAllByText(/Priya/)).toHaveLength(4);
    fireEvent.click(toggle);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
