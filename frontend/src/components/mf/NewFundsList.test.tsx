import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { formatRupees } from "@/lib/format";
import { NewFundsList, type NewFund } from "./NewFundsList";

const FUNDS: NewFund[] = [
  {
    scheme_id: "s1", scheme_name: "Alpha Flexi Cap Fund - Direct Growth", amc_name: "Alpha Mutual Fund",
    invested_amount: "150000.00", latest_transaction_date: "2026-10-28", transaction_count: 3,
    transactions: [
      { date: "2026-10-28", type: "PURCHASE_SIP", amount: "5000.00", units: "31.2500" },
      { date: "2026-09-28", type: "PURCHASE", amount: "100000.00", units: "625.0000" },
      { date: "2026-08-28", type: "SWITCH_IN", amount: "45000.00", units: "281.2500" },
    ],
  },
  {
    scheme_id: "s2", scheme_name: "Beta Large Cap Fund - Direct Growth", amc_name: null,
    invested_amount: "20000.00", latest_transaction_date: "2026-07-01", transaction_count: 25,
    transactions: [{ date: "2026-07-01", type: "REDEMPTION", amount: "1000.00", units: "5.0000" }],
  },
];
const mount = (props: Partial<Parameters<typeof NewFundsList>[0]> = {}) =>
  render(<MemoryRouter><NewFundsList funds={FUNDS} {...props} /></MemoryRouter>);
const row = (name: RegExp) => screen.getByRole("button", { name });

describe("NewFundsList", () => {
  it("lists every fund, no cap and no Show more", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ ...FUNDS[0], scheme_id: `x${index}`, scheme_name: `Fund number ${index}` }));
    mount({ funds: many });
    expect(screen.getAllByRole("button", { name: /Fund number/ })).toHaveLength(12);
    expect(screen.queryByRole("button", { name: /show more/i })).toBeNull();
  });
  it("shows name, fund house, transaction count, invested amount and latest date on each row", () => {
    mount();
    const first = row(/Alpha Flexi Cap Fund/);
    expect(first).toHaveTextContent("Alpha Mutual Fund");
    expect(first).toHaveTextContent("3 transactions");
    expect(first).toHaveTextContent(formatRupees("150000.00"));
    expect(first).toHaveTextContent("28 Oct 2026");
    expect(row(/Beta Large Cap Fund/)).toHaveTextContent("25 transactions");
  });
  it("says 1 transaction for a single transaction", () => {
    mount({ funds: [{ ...FUNDS[0], transaction_count: 1, transactions: [FUNDS[0].transactions[0]] }] });
    expect(row(/Alpha Flexi Cap Fund/)).toHaveTextContent("1 transaction");
    expect(row(/Alpha Flexi Cap Fund/).textContent).not.toContain("1 transactions");
  });
  it("starts with every fund closed, and a row opens and closes its transactions", () => {
    mount();
    expect(screen.queryByRole("table")).toBeNull();
    expect(row(/Alpha Flexi Cap Fund/)).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(row(/Alpha Flexi Cap Fund/));
    expect(row(/Alpha Flexi Cap Fund/)).toHaveAttribute("aria-expanded", "true");
    const table = screen.getByRole("table", { name: "Transactions in Alpha Flexi Cap Fund - Direct Growth" });
    expect(within(table).getAllByRole("columnheader").map(header => header.textContent)).toEqual(["Date", "Type", "Amount", "Units"]);
    fireEvent.click(row(/Alpha Flexi Cap Fund/));
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("labels the transaction types in plain words", () => {
    mount();
    fireEvent.click(row(/Alpha Flexi Cap Fund/));
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map(r => r.textContent)).toEqual([
      `28 Oct 2026SIP${formatRupees("5000.00")}31.2500`,
      `28 Sep 2026Purchase${formatRupees("100000.00")}625.0000`,
      `28 Aug 2026Switch in${formatRupees("45000.00")}281.2500`,
    ]);
    fireEvent.click(row(/Beta Large Cap Fund/));
    expect(screen.getAllByRole("table")[1]).toHaveTextContent("Redemption");
  });
  it("offers View all in Import History only when some transactions are not listed and the link is asked for", () => {
    mount({ showHistoryLink: true });
    fireEvent.click(row(/Alpha Flexi Cap Fund/));
    expect(screen.queryByRole("link", { name: "View all in Import History" })).toBeNull();
    fireEvent.click(row(/Beta Large Cap Fund/));
    expect(screen.getByRole("link", { name: "View all in Import History" })).toHaveAttribute("href", "/profile/settings/import-history");
  });
  it("shows no link when it is not asked for", () => {
    mount();
    fireEvent.click(row(/Beta Large Cap Fund/));
    expect(screen.queryByRole("link", { name: "View all in Import History" })).toBeNull();
  });
  it("hides every rupee amount when values are hidden", () => {
    const { container } = mount({ hideValues: true });
    fireEvent.click(row(/Alpha Flexi Cap Fund/));
    expect(container.textContent).not.toContain("₹");
    expect(container.textContent).toContain("••••••");
  });
  it("renders nothing for an empty list", () => {
    const { container } = mount({ funds: [] });
    expect(container).toBeEmptyDOMElement();
  });
});
