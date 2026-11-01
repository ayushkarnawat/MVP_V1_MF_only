import { fireEvent, screen, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import * as fx from "../fixtures";
import { expectInteractivity, failedLoad, loaded, loadingLoad } from "../testing";
import { HoldingsTable } from "./HoldingsTable";
import type { SortState } from "../mfCopy";
import type { HoldingRow } from "../types";

function Probe() { const l = useLocation(); return <output data-testid="loc">{l.pathname}</output>; }
const NOT_LIVE = buildRegistry().map(route => (route.id === "portfolio-mutual-funds-fund" ? { ...route, status: "placeholder" as const } : route));
const XIRR = { "S-KOTAK": "0.1420", "S-JM": "0.1860", "S-HDFC": "0.2130" };

function table(over: Partial<Parameters<typeof HoldingsTable>[0]> = {}, routes = buildRegistry()) {
  const props = { holdings: loaded(fx.holdings()), xirrByScheme: XIRR, sort: null as SortState | null, onSort: vi.fn(), query: "", onAnalyse: vi.fn(), onCompareDistributors: vi.fn(), ...over };
  const view = (p: typeof props) => <><HoldingsTable {...p} /><Probe /></>;
  const utils = renderInShell(view(props), { path: "/portfolio/mutual-funds", routes });
  return { props, ...utils, rerender: (next: typeof props) => utils.rerender(view(next)) };
}
const rowIds = () => screen.getAllByTestId(/^row-/).map(row => row.getAttribute("data-testid")!.slice(4));
const row = (key: string) => screen.getByTestId(`row-${key}`);

describe("HoldingsTable", () => {
  it("has the live count in its heading and the mockup's columns", () => {
    table();
    expect(screen.getByRole("heading", { name: "Mutual Funds (5)" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map(header => header.textContent?.replace(/[↑↓]/g, "").trim())).toEqual(["Fund", "Category", "Invested", "Value", "Gain/Loss", "XIRR", "Today's change"]);
  });
  it("shows a fund's figures, plan badge under the name and its category", () => {
    table();
    const kotak = row("S-KOTAK:m1");
    expect(within(kotak).getByText("Kotak Multi Cap Fund")).toBeInTheDocument();
    expect(within(kotak).getByText("Kotak Mahindra Mutual Fund")).toBeInTheDocument();
    expect(within(kotak).getByTestId("plan-badge")).toHaveTextContent(/^Direct$/);
    expect(within(kotak).getByTestId("fund-logo")).toBeInTheDocument();
    expect(within(kotak).getByTestId("category")).toHaveTextContent("Flexi Cap Fund");
    expect(within(kotak).getByTestId("invested")).toHaveTextContent("₹12,00,000");
    expect(within(kotak).getByTestId("value")).toHaveTextContent("₹15,40,000");
    expect(within(kotak).getByTestId("gain")).toHaveTextContent("+₹3,40,000");
    expect(within(kotak).getByTestId("gain")).toHaveAttribute("data-direction", "up");
    expect(within(kotak).getByTestId("xirr")).toHaveTextContent("14.2%");
    expect(within(kotak).getByTestId("today-amount")).toHaveTextContent("+₹4,620");
    expect(within(kotak).getByTestId("today-percent")).toHaveTextContent("+0.30%");
  });
  it("shows Regular for a regular plan and no badge for an unclassified one", () => {
    const unclassified: HoldingRow = { ...fx.holdings()[0], plan_type: "unclassified" };
    table({ holdings: loaded([fx.holdings()[3], unclassified]) });
    expect(within(row("S-SBI:m3")).getByTestId("plan-badge")).toHaveTextContent(/^Regular$/);
    expect(within(row("S-KOTAK:m1")).queryByTestId("plan-badge")).not.toBeInTheDocument();
  });
  it("colours a loss as down", () => {
    table();
    expect(within(row("S-JM:m2")).getByTestId("today-amount")).toHaveTextContent("-₹1,960");
    expect(within(row("S-JM:m2")).getByTestId("today-percent")).toHaveTextContent("-0.20%");
    expect(within(row("S-JM:m2")).getByTestId("today")).toHaveAttribute("data-direction", "down");
  });
  it("shows a dash for the category, XIRR, today's change and value of a fund with no price", () => {
    table();
    const axis = row("S-AXIS:m1");
    expect(within(axis).getByTestId("category")).toHaveTextContent(/^—$/);
    expect(within(axis).getByTestId("xirr")).toHaveTextContent(/^—$/);
    expect(within(axis).getByTestId("today")).toHaveTextContent(/^—$/);
    expect(within(axis).getByTestId("value")).toHaveTextContent(/^—$/);
    expect(within(axis).getByTestId("gain")).toHaveTextContent(/^—$/);
    expect(within(axis).getByTestId("invested")).toHaveTextContent("₹4,00,000");
  });
  it("shows a dash for today's change of a stale-NAV fund", () => {
    table();
    expect(within(row("S-SBI:m3")).getByTestId("today")).toHaveTextContent(/^—$/);
  });
  it("keeps the given order with no sort and sorts by the sort it is given", () => {
    const { unmount } = table();
    expect(rowIds()).toEqual(["S-KOTAK:m1", "S-JM:m2", "S-HDFC:m3", "S-SBI:m3", "S-AXIS:m1"]);
    unmount();
    table({ sort: { key: "today_change", dir: "desc" } });
    expect(rowIds()).toEqual(["S-HDFC:m3", "S-KOTAK:m1", "S-JM:m2", "S-SBI:m3", "S-AXIS:m1"]);
  });
  it("sorts by XIRR using the per-fund map", () => {
    table({ sort: { key: "xirr", dir: "desc" } });
    expect(rowIds().slice(0, 3)).toEqual(["S-HDFC:m3", "S-JM:m2", "S-KOTAK:m1"]);
  });
  it("a header click asks for descending first and then flips, with an arrow and aria-sort", () => {
    const { props, rerender } = table();
    fireEvent.click(screen.getByRole("button", { name: /^Value/ }));
    expect(props.onSort).toHaveBeenLastCalledWith({ key: "value", dir: "desc" });
    rerender({ ...props, sort: { key: "value", dir: "desc" } });
    expect(screen.getByRole("columnheader", { name: /Value/ })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByTestId("sort-arrow")).toHaveTextContent("↓");
    fireEvent.click(screen.getByRole("button", { name: /^Value/ }));
    expect(props.onSort).toHaveBeenLastCalledWith({ key: "value", dir: "asc" });
    rerender({ ...props, sort: { key: "value", dir: "asc" } });
    expect(screen.getByRole("columnheader", { name: /Value/ })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByTestId("sort-arrow")).toHaveTextContent("↑");
    expect(screen.getByRole("columnheader", { name: /Invested/ })).toHaveAttribute("aria-sort", "none");
  });
  it("makes the five numeric headers sortable and leaves Fund and Category plain", () => {
    table();
    for (const name of ["Invested", "Value", "Gain/Loss", "XIRR", "Today's change"]) expect(screen.getByRole("button", { name: new RegExp(`^${name.replace("/", "\\/")}`) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Fund$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Category/ })).not.toBeInTheDocument();
  });
  it("filters by fund or AMC name, case-insensitively, and the count follows", () => {
    const { unmount } = table({ query: "kotak" });
    expect(rowIds()).toEqual(["S-KOTAK:m1"]);
    expect(screen.getByRole("heading", { name: "Mutual Funds (1)" })).toBeInTheDocument();
    unmount();
    table({ query: "HDFC MUTUAL" });
    expect(rowIds()).toEqual(["S-HDFC:m3"]);
  });
  it("says so when nothing matches the search", () => {
    table({ query: "zzz" });
    expect(screen.getByText('No funds match "zzz"')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^row-/)).toHaveLength(0);
  });
  const loc = () => screen.getByTestId("loc");
  it("makes the fund name a real link to that fund's page", () => {
    table();
    const link = within(row("S-HDFC:m3")).getByRole("link", { name: "HDFC Mid-Cap Opportunities Fund" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/portfolio/mutual-funds/funds/S-HDFC");
    expect(within(row("S-HDFC:m3")).queryByRole("button", { name: "HDFC Mid-Cap Opportunities Fund" })).toBeNull();
  });
  it("opens the fund page from a click anywhere on the row, exactly once", () => {
    table();
    fireEvent.click(within(row("S-JM:m2")).getByTestId("invested"));
    expect(loc()).toHaveTextContent(/^\/portfolio\/mutual-funds\/funds\/S-JM$/);
  });
  it("opens the fund page with Enter on the row", () => {
    table();
    fireEvent.keyDown(row("S-KOTAK:m1"), { key: "Enter" });
    expect(loc()).toHaveTextContent(/^\/portfolio\/mutual-funds\/funds\/S-KOTAK$/);
  });
  it("opens the fund page once from a click on the name link (no double navigation)", () => {
    table();
    const link = within(row("S-HDFC:m3")).getByRole("link", { name: "HDFC Mid-Cap Opportunities Fund" });
    const before = window.history.length;
    fireEvent.click(link);
    expect(loc()).toHaveTextContent(/^\/portfolio\/mutual-funds\/funds\/S-HDFC$/);
    expect(window.history.length - before).toBeLessThanOrEqual(1);
  });
  it("reaches the name link with Tab and Enter on it opens that fund once", () => {
    table();
    const link = within(row("S-HDFC:m3")).getByRole("link", { name: "HDFC Mid-Cap Opportunities Fund" });
    link.focus();
    expect(link).toHaveFocus();
    expect(link).not.toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(link, { key: "Enter" });
    fireEvent.click(link);
    expect(loc()).toHaveTextContent(/^\/portfolio\/mutual-funds\/funds\/S-HDFC$/);
  });
  it("no link sits inside a button or a role element, and no popup button is left on a row", () => {
    table();
    for (const link of screen.getAllByRole("link")) expect(link.closest("button, [role=button]")).toBeNull();
    expect(within(row("S-JM:m2")).queryByRole("button")).toBeNull();
  });
  it("shows a fund with no scheme id as plain text with no link, and the row goes nowhere", () => {
    const blank: HoldingRow = { ...fx.holdings()[0], scheme_id: "" };
    table({ holdings: loaded([blank]) });
    const only = screen.getAllByTestId(/^row-/)[0];
    expect(within(only).queryByRole("link")).toBeNull();
    expect(within(only).getByText("Kotak Multi Cap Fund")).toBeInTheDocument();
    fireEvent.click(within(only).getByTestId("invested"));
    expect(loc()).toHaveTextContent(/^\/portfolio\/mutual-funds$/);
  });
  it("keeps the greyed Coming soon look and does not navigate when the fund route is not live", () => {
    table({}, NOT_LIVE);
    const name = within(row("S-JM:m2")).getByRole("link", { name: "JM Flexi Cap Fund" });
    expect(name).toHaveAttribute("aria-disabled", "true");
    expect(name).toHaveAttribute("title", "Coming soon");
    fireEvent.click(within(row("S-JM:m2")).getByTestId("invested"));
    expect(loc()).toHaveTextContent(/^\/portfolio\/mutual-funds$/);
  });
  it("marks a row as navigating, not opening a popup", () => {
    table();
    expect(row("S-JM:m2")).toHaveAttribute("data-effect", "navigate");
  });
  it("has a Compare Distributors button in the card header, before Analyse with Mira", () => {
    const { props } = table();
    const compare = screen.getByRole("button", { name: "Compare Distributors" });
    const analyse = screen.getByRole("button", { name: "Analyse with Mira" });
    expect(compare).toHaveAttribute("data-clickable");
    expect(compare).toHaveAttribute("data-effect", "open");
    expect(compare.compareDocumentPosition(analyse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Mutual Funds (5)" }).compareDocumentPosition(compare) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(compare);
    expect(props.onCompareDistributors).toHaveBeenCalledTimes(1);
    expect(props.onAnalyse).not.toHaveBeenCalled();
  });
  it("keeps Compare Distributors while a search matches nothing, and has no Export button", () => {
    table({ query: "zzz" });
    expect(screen.getByRole("button", { name: "Compare Distributors" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/export|download/i)).not.toBeInTheDocument();
  });
  it("keeps the full name readable on a long name through the link's text", () => {
    table();
    expect(within(row("S-HDFC:m3")).getByRole("link", { name: "HDFC Mid-Cap Opportunities Fund" })).toHaveTextContent("HDFC Mid-Cap Opportunities Fund");
  });
  it("keeps two rows of one fund held by two members apart", () => {
    const second: HoldingRow = { ...fx.holdings()[0], household_member_id: "m2", household_member_name: "Aarohi" };
    table({ holdings: loaded([fx.holdings()[0], second]) });
    expect(rowIds()).toEqual(["S-KOTAK:m1", "S-KOTAK:m2"]);
  });
  it("totals the priced funds and the totals do not move when the rows are sorted", () => {
    const { props, rerender } = table();
    expect(screen.getByTestId("foot-invested")).toHaveTextContent("₹35,78,000");
    expect(screen.getByTestId("foot-value")).toHaveTextContent("₹46,49,340");
    expect(screen.getByTestId("foot-gain")).toHaveTextContent("+₹10,71,340");
    rerender({ ...props, sort: { key: "gain", dir: "asc" } });
    expect(screen.getByTestId("foot-value")).toHaveTextContent("₹46,49,340");
    expect(screen.getByTestId("foot-gain")).toHaveTextContent("+₹10,71,340");
  });
  it("opens Mira from Analyse with Mira", () => {
    const { props } = table();
    fireEvent.click(screen.getByRole("button", { name: "Analyse with Mira" }));
    expect(props.onAnalyse).toHaveBeenCalledTimes(1);
  });
  it("shows a loading state and a failure card with Retry", () => {
    const { unmount } = table({ holdings: loadingLoad() });
    expect(screen.getByRole("status", { name: "Loading holdings" })).toBeInTheDocument();
    unmount();
    const holdings = failedLoad<HoldingRow[]>();
    table({ holdings });
    expect(screen.getByRole("heading", { name: "Couldn't load your holdings" })).toBeInTheDocument();
    expect(screen.getByText("This section failed to load, but the rest of the page is unaffected.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(holdings.retry).toHaveBeenCalledTimes(1);
  });
  it("marks every control with its effect (interactivity rule)", () => {
    const { container } = table({ sort: { key: "value", dir: "desc" } });
    expectInteractivity(container, 7);
  });
});


function familyParents() {
  const first = fx.holdings()[0];
  const children = [
    { ...first, household_member_id: "m1", household_member_name: "Asha", units_held: "10", amount_invested: "100.00", average_nav: "10", current_value: "200.00", realized_gain: "1.00", unrealized_gain: "100.00", xirr: "0.10",
      folios: [{ folio_id: "fa", folio_masked: "XXXX9012", units: "10", invested: "100.00", value: "200.00" }] },
    { ...first, household_member_id: "m2", household_member_name: "Dev", units_held: "30", amount_invested: "450.00", average_nav: "15", current_value: "600.00", realized_gain: "2.00", unrealized_gain: "150.00", xirr: null,
      folios: [{ folio_id: "fb", folio_masked: "XXXX3456", units: "30", invested: "450.00", value: "600.00" }] },
  ];
  return [{ ...first, amc_name: first.amc_name ?? "", asset_class: first.asset_class ?? "Other", plan_verified: true,
    sebi_category: first.sebi_category ?? null, stale_nav: false, nav_unavailable: false, price_from_statement: false,
    current_nav_date: first.current_nav_date ?? null, units_held: "40", average_price: "13.75", amount_invested: "550.00", current_value: "800.00", unrealized_gain: "250.00", realized_gain: "3.00", xirr: "0.12", opening_lot: null, children }];
}

describe("consolidated family holdings", () => {
  it("parent_row_shows_all_requirement_2_2_columns_and_a_split_bar", () => {
    table({ consolidated: familyParents() });
    expect(screen.getAllByRole("columnheader").map(x => x.textContent)).toEqual(["Fund", "Units", "Avg price", "Invested", "Current value", "Unrealised", "Realised", "XIRR"]);
    const parent = screen.getByTestId("parent-S-KOTAK:direct");
    expect(parent).toHaveTextContent("13.75");
    expect(parent).toHaveTextContent("₹550");
    expect(parent).toHaveTextContent("12.0%");
    expect(within(parent).getByTestId("split-bar")).toBeInTheDocument();
    expect(within(parent).getByTestId("share-m1")).toHaveStyle({ width: "25.00%" });
    expect(within(parent).getByTestId("share-m2")).toHaveStyle({ width: "75.00%" });
  });
  it("expand_opens_one_row_per_member_with_the_masked_folio", () => {
    table({ consolidated: familyParents() });
    fireEvent.click(screen.getByRole("button", { name: "Expand Kotak Multi Cap Fund" }));
    const a = screen.getByTestId("member-S-KOTAK:direct:m1");
    const b = screen.getByTestId("member-S-KOTAK:direct:m2");
    expect(a).toHaveTextContent("Asha"); expect(a).toHaveTextContent("XXXX9012");
    expect(b).toHaveTextContent("Dev"); expect(b).toHaveTextContent("XXXX3456");
    expect(within(a).getByTestId("child-xirr")).toHaveTextContent("10.0%");
    expect(within(b).getByTestId("child-xirr")).toHaveTextContent("—");
    expect(screen.getByTestId("family-phone-cards")).toBeInTheDocument();
  });
  it("plus_is_keyboard_operable_and_sets_aria_expanded", () => {
    table({ consolidated: familyParents() });
    const control = screen.getByRole("button", { name: "Expand Kotak Multi Cap Fund" });
    expect(control.tagName).toBe("BUTTON");
    expect(control).toHaveAttribute("aria-expanded", "false");
    control.focus(); expect(control).toHaveFocus();
    fireEvent.keyDown(control, { key: "Enter" });
    fireEvent.click(control); // Browser-generated activation from Enter on a native button.
    expect(control).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("loc")).toHaveTextContent("/portfolio/mutual-funds");
  });
  it("single_member_view_is_unchanged", () => {
    table();
    expect(screen.getAllByRole("columnheader").map(x => x.textContent?.trim())).toEqual(["Fund", "Category", "Invested", "Value", "Gain/Loss", "XIRR", "Today's change"]);
    expect(screen.queryByTestId("split-bar")).not.toBeInTheDocument();
  });
  it("fund_held_by_one_member_has_no_expander_or_bar", () => {
    const parents = familyParents(); parents[0].children = parents[0].children.slice(0, 1);
    table({ consolidated: parents });
    expect(screen.getByTestId("parent-S-KOTAK:direct")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Expand/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("split-bar")).not.toBeInTheDocument();
  });
  it("old_payload_without_consolidated_renders_todays_rows", () => {
    table(); expect(rowIds()).toHaveLength(5);
    expect(screen.queryByTestId("family-phone-cards")).not.toBeInTheDocument();
  });
});


it("keeps the family totals and never counts the expanded children twice", () => {
  table({ consolidated: familyParents() });
  expect(screen.getByTestId("foot-invested")).toHaveTextContent("₹550");
  expect(screen.getByTestId("foot-value")).toHaveTextContent("₹800");
  fireEvent.click(screen.getByRole("button", { name: "Expand Kotak Multi Cap Fund" }));
  expect(screen.getByTestId("foot-invested")).toHaveTextContent("₹550");
  expect(screen.getByTestId("foot-gain")).toHaveTextContent("+₹250");
  expect(screen.getByTestId("foot-realized")).toHaveTextContent("+₹3");
});
it("does not announce sorting on unsortable family columns", () => {
  table({ consolidated: familyParents() });
  expect(screen.getByRole("columnheader", { name: "Fund" })).not.toHaveAttribute("aria-sort");
});


it("split_shares_always_total_exactly_100_percent", () => {
  const parents = familyParents();
  const base = parents[0].children[0];
  parents[0].children = ["m1", "m2", "m3"].map(id => ({ ...base, household_member_id: id, household_member_name: id, units_held: "10" }));
  parents[0].units_held = "30";
  table({ consolidated: parents });
  const widths = ["m1", "m2", "m3"].map(id => Number.parseFloat(screen.getByTestId(`share-${id}`).style.width));
  expect(Math.round(widths.reduce((a, b) => a + b, 0) * 100)).toBe(10000);
  expect(widths.sort()).toEqual([33.33, 33.33, 33.34]);
});
