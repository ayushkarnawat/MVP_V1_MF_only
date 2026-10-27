import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fb from "../fixtures/mfB";
import { expectInteractivity } from "../testing";
import type { InvestmentWithdrawalBucket } from "../types";
import { Ledger } from "./Ledger";
import type { LedgerFilter } from "./transactionsLogic";

const buckets = () => fb.investmentWithdrawal().monthly;
function Harness({ filter, onFilter = vi.fn(), data = buckets() }: { filter: LedgerFilter; onFilter?: (f: LedgerFilter) => void; data?: InvestmentWithdrawalBucket[] }) {
  return <Ledger buckets={data} filter={filter} onFilter={onFilter} />;
}
const rowIds = () => screen.getAllByTestId(/^ledger-row-/).map(row => row.getAttribute("data-testid")?.replace("ledger-row-", ""));

describe("the rows", () => {
  it("lists the newest transactions first with date, fund and member, type and amount", () => {
    render(<Harness filter="all" />);
    const table = within(screen.getByRole("table", { name: "All transactions" }));
    expect(table.getAllByRole("columnheader").map(header => header.textContent)).toEqual(["Date", "Fund", "Type", "Amount"]);
    expect(rowIds().slice(0, 4)).toEqual(["t-0067", "t-0066", "t-0065", "t-0064"]);
    const first = screen.getByTestId("ledger-row-t-0067");
    expect(first).toHaveTextContent("27 Oct 2026");
    expect(first).toHaveTextContent("Parag Parikh Flexi Cap Fund");
    expect(first).toHaveTextContent("Siddharth");
    expect(first).toHaveTextContent("SIP");
    expect(first).toHaveTextContent("₹16,244");
    expect(screen.getByText("Click a transaction to see its details.")).toBeInTheDocument();
  });
  it("gives each row a coloured icon chip for its kind", () => {
    render(<Harness filter="all" />);
    expect(screen.getByTestId("kind-t-0067")).toHaveAttribute("data-kind", "purchase");
  });
  it("shows only the first fifty rows, counts the rest and shows all on request, then fewer", () => {
    render(<Harness filter="all" />);
    expect(rowIds()).toHaveLength(50);
    const more = screen.getByRole("button", { name: "Show all (16 remaining)" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(rowIds()).toHaveLength(66);
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(rowIds()).toHaveLength(50);
  });
  it("has no show-all button when everything fits", () => {
    render(<Harness filter="redemptions" />);
    expect(screen.queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
  });
  it("says so when there is nothing at all or nothing of the chosen type", () => {
    const { unmount } = render(<Harness filter="all" data={[]} />);
    expect(screen.getByTestId("ledger-empty")).toHaveTextContent("No transactions yet");
    unmount();
    const onlyPurchases = buckets().map(bucket => ({ ...bucket, entries: bucket.entries.filter(entry => entry.direction === "invested") }));
    render(<Harness filter="redemptions" data={onlyPurchases} />);
    expect(screen.getByTestId("ledger-empty")).toHaveTextContent("No transactions of this type");
  });
});

describe("the type filter", () => {
  it("shows four pills with the current one pressed and reports a click", () => {
    const onFilter = vi.fn();
    render(<Harness filter="purchases" onFilter={onFilter} />);
    const group = within(screen.getByRole("group", { name: "Transaction type" }));
    expect(group.getAllByRole("button").map(button => [button.textContent, button.getAttribute("aria-pressed")])).toEqual([
      ["All", "false"], ["Purchases", "true"], ["Redemptions", "false"], ["Switches", "false"],
    ]);
    fireEvent.click(group.getByRole("button", { name: "Switches" }));
    expect(onFilter).toHaveBeenCalledWith("switches");
  });
  it("lists only redemptions, newest first, with the right labels", () => {
    render(<Harness filter="redemptions" />);
    expect(rowIds()).toEqual(["t-0029", "t-0028"]);
    expect(screen.getByTestId("ledger-row-t-0029")).toHaveTextContent("Dividend payout");
    expect(screen.getByTestId("ledger-row-t-0028")).toHaveTextContent("Redemption");
    expect(screen.getByTestId("kind-t-0028")).toHaveAttribute("data-kind", "redemption");
  });
  it("lists the two legs of a switch", () => {
    render(<Harness filter="switches" />);
    expect(rowIds()).toEqual(["t-0046", "t-0045"]);
    expect(screen.getByTestId("ledger-row-t-0046")).toHaveTextContent("Switch in");
    expect(screen.getByTestId("ledger-row-t-0045")).toHaveTextContent("Switch out");
    expect(screen.getByTestId("kind-t-0046")).toHaveAttribute("data-kind", "switch");
  });
  it("shows a bounced SIP under Purchases with its own label and icon kind", () => {
    render(<Harness filter="purchases" />);
    fireEvent.click(screen.getByRole("button", { name: "Show all (12 remaining)" }));
    expect(screen.getByTestId("ledger-row-t-0057")).toHaveTextContent("Bounced SIP (reversed)");
    expect(screen.getByTestId("kind-t-0057")).toHaveAttribute("data-kind", "reversal");
  });
});

describe("expanding a row in place", () => {
  it("opens the details directly under the row and closes them again, one row at a time", () => {
    render(<Harness filter="redemptions" />);
    const toggle = within(screen.getByTestId("ledger-row-t-0028")).getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const detail = screen.getByTestId("ledger-detail-t-0028");
    expect(screen.getByTestId("ledger-row-t-0028").nextElementSibling).toBe(detail);
    expect(detail).toHaveTextContent("Parents");
    expect(detail).toHaveTextContent("Redemption");
    expect(detail).toHaveTextContent("18 Mar 2026");
    expect(detail).toHaveTextContent("₹22,000");
    expect(detail).toHaveTextContent("t-0028");
    expect(detail).toHaveTextContent("Units, NAV and folio are not part of this data yet.");
    fireEvent.click(within(screen.getByTestId("ledger-row-t-0029")).getByRole("button"));
    expect(screen.queryByTestId("ledger-detail-t-0028")).not.toBeInTheDocument();
    expect(screen.getByTestId("ledger-detail-t-0029")).toBeInTheDocument();
  });
  it("keeps an open row open when the filter still contains it, and closes it when it does not", () => {
    const { rerender } = render(<Harness filter="all" />);
    fireEvent.click(within(screen.getByTestId("ledger-row-t-0046")).getByRole("button"));
    rerender(<Harness filter="switches" />);
    expect(screen.getByTestId("ledger-detail-t-0046")).toBeInTheDocument();
    rerender(<Harness filter="redemptions" />);
    expect(screen.queryByTestId("ledger-detail-t-0046")).not.toBeInTheDocument();
    rerender(<Harness filter="switches" />);
    expect(screen.queryByTestId("ledger-detail-t-0046")).not.toBeInTheDocument();
  });
});

describe("interactivity", () => {
  it("marks every control with its effect and its state", () => {
    const { container } = render(<Harness filter="all" />);
    fireEvent.click(within(screen.getByTestId("ledger-row-t-0067")).getByRole("button"));
    expectInteractivity(container, 6);
  });
});
