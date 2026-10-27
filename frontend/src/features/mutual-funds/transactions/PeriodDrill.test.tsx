import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { breakdownTotals, groupByFund } from "../../../components/mf/periodBreakdown";
import { formatRupees } from "../../../lib/format";
import * as fb from "../fixtures/mfB";
import { expectInteractivity } from "../testing";
import { PeriodDrill } from "./PeriodDrill";

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

const month = (period: string) => fb.investmentWithdrawal().monthly.find(bucket => bucket.period === period)!;

describe("PeriodDrill", () => {
  it("is titled with the period, sits in a region of its own and scrolls into view", () => {
    render(<PeriodDrill bucket={month("2026-03")} />);
    expect(screen.getByRole("region", { name: "March 2026 breakdown" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "March 2026" })).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalled();
  });
  it("lists the same per-fund rows and totals as the shared period breakdown, in its order", () => {
    const bucket = month("2026-03");
    render(<PeriodDrill bucket={bucket} />);
    const { rows } = groupByFund(bucket.entries, null);
    const table = screen.getByRole("table", { name: "March 2026 fund breakdown" });
    expect(within(table).getAllByRole("columnheader").map(header => header.textContent)).toEqual(["Fund", "Invested", "Withdrawn", "Switched in", "Switched out", "Net"]);
    expect(rows.map(row => row.schemeName)).toEqual(["HDFC Mid-Cap Opportunities Fund", "SBI Bluechip Fund", "Parag Parikh Flexi Cap Fund", "JM Flexi Cap Fund", "Kotak Multi Cap Fund"]);
    const shown = screen.getAllByTestId(/^drill-row-/);
    expect(shown.map(row => row.getAttribute("data-testid"))).toEqual(rows.map(row => `drill-row-${row.schemeName}`));
    rows.forEach((row, index) => {
      for (const amount of [row.invested, row.withdrawn, row.switchedIn, row.switchedOut, row.net]) expect(shown[index]).toHaveTextContent(formatRupees(amount));
      expect(shown[index]).toHaveTextContent(row.memberNames.join(", "));
    });
    const totals = breakdownTotals(rows);
    for (const amount of [totals.invested, totals.withdrawn, totals.net]) expect(screen.getByTestId("drill-footer")).toHaveTextContent(formatRupees(amount));
    expect(screen.getByTestId("drill-footer")).toHaveTextContent("₹50,575");
    expect(screen.getByTestId("drill-footer")).toHaveTextContent("₹23,500");
    expect(screen.getByTestId("drill-footer")).toHaveTextContent("₹27,075");
  });
  it("shows the period totals as chips, with opening holdings only where there are some", () => {
    const { unmount } = render(<PeriodDrill bucket={month("2025-11")} />);
    expect(screen.getByTestId("drill-total-opening-holdings")).toHaveTextContent("Opening holdings ₹2,40,000");
    unmount();
    render(<PeriodDrill bucket={month("2026-03")} />);
    expect(screen.getByTestId("drill-total-invested")).toHaveTextContent("Invested ₹50,575");
    expect(screen.getByTestId("drill-total-withdrawn")).toHaveTextContent("Withdrawn ₹23,500");
    expect(screen.queryByTestId("drill-total-opening-holdings")).not.toBeInTheDocument();
  });
  it("expands a fund in place to its dated transactions, one fund at a time", () => {
    render(<PeriodDrill bucket={month("2026-03")} />);
    const sbi = screen.getByRole("button", { name: "SBI Bluechip Fund transactions" });
    expect(sbi).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(sbi);
    expect(sbi).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("entry-t-0028")).toHaveTextContent("18 Mar 2026 · Parents · Redemption");
    expect(screen.getByTestId("entry-t-0028")).toHaveTextContent("₹22,000");
    expect(screen.getByTestId("entry-t-0029")).toHaveTextContent("20 Mar 2026 · Parents · Dividend payout");
    fireEvent.click(screen.getByRole("button", { name: "JM Flexi Cap Fund transactions" }));
    expect(screen.queryByTestId("entry-t-0028")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "JM Flexi Cap Fund dated transactions" })).getAllByRole("listitem")).toHaveLength(1);
  });
  it("filters by household member with an All chip first and the members in alphabetical order, and keeps the totals consistent with the rows shown", () => {
    render(<PeriodDrill bucket={month("2026-03")} />);
    const chips = within(screen.getByRole("group", { name: "Household member" }));
    expect(chips.getAllByRole("button").map(button => button.textContent)).toEqual(["All", "Aarohi", "Parents", "Siddharth"]);
    expect(chips.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chips.getByRole("button", { name: "Parents" }));
    expect(chips.getByRole("button", { name: "Parents" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId(/^drill-row-/).map(row => row.getAttribute("data-testid"))).toEqual(["drill-row-HDFC Mid-Cap Opportunities Fund", "drill-row-SBI Bluechip Fund"]);
    expect(screen.getByTestId("drill-footer")).toHaveTextContent("₹25,990");
    expect(screen.getByTestId("drill-total-invested")).toHaveTextContent("Invested ₹25,990");
    fireEvent.click(chips.getByRole("button", { name: "All" }));
    expect(screen.getAllByTestId(/^drill-row-/)).toHaveLength(5);
  });
  it("shows the yearly bucket with the year as its title", () => {
    render(<PeriodDrill bucket={fb.investmentWithdrawal().yearly.find(bucket => bucket.period === "2026")!} />);
    expect(screen.getByRole("heading", { name: "2026" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "2026 fund breakdown" })).toBeInTheDocument();
  });
  it("says so for a period without transactions, and for one with only the opening balance", () => {
    const empty = { period: "2026-04", invested: "0.00", withdrawn: "0.00", entries: [] };
    const { unmount } = render(<PeriodDrill bucket={empty} />);
    expect(screen.getByText("No transactions in this period")).toBeInTheDocument();
    unmount();
    const opening = { ...empty, entries: [{ transaction_id: "o", date: "2026-04-01", type: "opening_balance", amount: "100.00", direction: "opening" as const, scheme_name: "F", household_member_id: "m1", household_member_name: "A" }] };
    render(<PeriodDrill bucket={opening} />);
    expect(screen.getByText("Only opening holdings in this period")).toBeInTheDocument();
  });
  it("marks every control with its effect and its state", () => {
    const { container } = render(<PeriodDrill bucket={month("2026-03")} />);
    fireEvent.click(screen.getByRole("button", { name: "SBI Bluechip Fund transactions" }));
    expectInteractivity(container, 9);
  });
});
