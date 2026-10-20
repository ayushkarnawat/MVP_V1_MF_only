import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryDetailModal } from "./HistoryDetailModal";
import type { MonthDetail, MonthFundRow } from "../dashboard/types";
const row = (id: string, member: string, value: string | null, more: Partial<MonthFundRow> = {}): MonthFundRow => ({
  scheme_id: id, scheme_name: `Fund ${id}`, household_member_id: member, household_member_name: member === "a" ? "Anita" : "Dev",
  units: "10.000", nav: "10.0000", nav_date: "2024-03-28", value, cost: "100.00", change_in_value: "50.00", new_money: "100.00", opening_holdings: "0.00", switched_net: "0.00", gifts_net: "0.00", market_movement: "-50.00", priced: true, ...more,
});
const detail: MonthDetail = { month: "2024-03-31", previous_month: "2024-02-29", total_value: "1300.00", previous_value: "1200.00", change: "100.00", new_money: "200.00", opening_holdings: "0.00", switches_net: "0.00", gifts_net: "0.00", market_movement: "-100.00", switched_in: "200.00", switched_out: "200.00", is_partial: false, missing_scheme_names: [], funds: [row("A", "a", "500.00"), row("B", "b", "800.00")] };

describe("HistoryDetailModal", () => {
  it("shows API tiles, exact negatives and the full residual explanation", () => {
    render(<HistoryDetailModal detail={detail} viewMode="aggregate" onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "March 2024" })).toBeInTheDocument();
    expect(screen.getByText("Portfolio value").parentElement).toHaveTextContent("₹1,300");
    expect(screen.getByText("Change this month").parentElement).toHaveTextContent("₹100");
    expect(screen.getByText("Market movement", { selector: "dt" }).parentElement).toHaveTextContent("-₹100");
    expect(screen.getByText("Market movement is what is left after new money, opening holdings, switches and gifted units.")).toBeInTheDocument();
    expect(screen.getByText("Switched between funds ₹200 in / ₹200 out")).toBeInTheDocument();
  });
  it("sorts by exact value, keeps sold-out last and uses dashes for missing prices", () => {
    const funds = [row("Sold", "a", "0.00", { units: "0", cost: "0.00" }), row("Missing", "a", null, { priced: false, nav: null, nav_date: null, change_in_value: null, market_movement: null }), ...detail.funds];
    render(<HistoryDetailModal detail={{ ...detail, funds }} viewMode="aggregate" onClose={vi.fn()} />);
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map(r => r.textContent?.match(/Fund (B|A|Missing|Sold)/)?.[0])).toEqual(["Fund B", "Fund A", "Fund Missing", "Fund Sold"]);
    expect(rows[2]).toHaveTextContent("No price for this month");
    expect(within(rows[2]).getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });
  it("member filtering updates rows and totals, and All restores API totals", () => {
    render(<HistoryDetailModal detail={detail} viewMode="aggregate" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Anita" }));
    expect(screen.queryByText("Fund B")).not.toBeInTheDocument();
    expect(screen.getByText("Portfolio value").parentElement).toHaveTextContent("₹500");
    expect(screen.getByText("Market movement", { selector: "dt" }).parentElement).toHaveTextContent("-₹50");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Portfolio value").parentElement).toHaveTextContent("₹1,300");
  });
  it("partial months blank change and market movement and name the missing funds", () => {
    render(<HistoryDetailModal detail={{ ...detail, is_partial: true, change: null, market_movement: null, missing_scheme_names: ["Missing Fund"] }} viewMode="member" onClose={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Missing Fund");
    expect(screen.getByText("Change this month").parentElement).toHaveTextContent("—");
    expect(screen.getByText("Market movement", { selector: "dt" }).parentElement).toHaveTextContent("—");
  });
  it("shows nonzero opening, net switch and gift lines separately from new money", () => {
    render(<HistoryDetailModal detail={{ ...detail, previous_month: null, opening_holdings: "1000.00", switches_net: "-1.00", gifts_net: "500.00" }} viewMode="member" onClose={vi.fn()} />);
    expect(screen.getByText("Opening holdings").parentElement).toHaveTextContent("₹1,000");
    expect(screen.getByText("Switches (net)").parentElement).toHaveTextContent("-₹1");
    expect(screen.getByText("Gifted units").parentElement).toHaveTextContent("₹500");
    expect(screen.getByText("New money").parentElement).toHaveTextContent("₹200");
  });
  it("omits zero movement lines and tolerates saved fields being absent", () => {
    const { opening_holdings: _o, switches_net: _s, gifts_net: _g, ...old } = detail;
    const { container } = render(<HistoryDetailModal detail={{ ...old, switched_in: "0.00", switched_out: "0.00" }} viewMode="member" onClose={vi.fn()} />);
    expect(screen.queryByText(/Switched between funds|Opening holdings|Switches \(net\)|Gifted units/)).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });
  it("Escape closes and the sheet keeps keyboard focus inside", () => {
    const close = vi.fn();
    render(<HistoryDetailModal detail={detail} viewMode="aggregate" onClose={close} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });
});


it("filtering a partial family to a fully priced member restores comparable totals", () => {
  render(<HistoryDetailModal detail={{ ...detail, change: null, market_movement: null, is_partial: true, missing_scheme_names: ["Fund B"], funds: [detail.funds[0], { ...detail.funds[1], change_in_value: null, market_movement: null }] }} viewMode="aggregate" onClose={vi.fn()} />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Anita" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("Change this month").parentElement).toHaveTextContent("₹50");
});

it("sorts large decimal values exactly and scrolls the fund table internally", () => {
  render(<HistoryDetailModal detail={{ ...detail, funds: [row("A", "a", "9007199254740992.00"), row("B", "b", "9007199254740993.00")] }} viewMode="aggregate" onClose={vi.fn()} />);
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Fund B");
  expect(table.parentElement).toHaveClass("overflow-auto", "w-full");
  const close = screen.getByRole("button", { name: "Close modal" });
  const last = screen.getByRole("button", { name: "Dev" });
  last.focus();
  fireEvent.keyDown(window, { key: "Tab" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
  expect(last).toHaveFocus();
});


it("keeps All and the member filter visible in a one-member family view", () => {
  render(<HistoryDetailModal detail={{ ...detail, funds: [detail.funds[0]] }} viewMode="aggregate" onClose={vi.fn()} />);
  expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Anita" }));
  expect(screen.getByRole("button", { name: "Anita" })).toHaveAttribute("aria-pressed", "true");
});
