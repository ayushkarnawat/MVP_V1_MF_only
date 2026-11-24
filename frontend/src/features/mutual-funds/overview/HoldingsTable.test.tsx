import { CAUTION_CHIP } from "../../../lib/xirrDisplay";
import { fireEvent, screen, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetFolioVisibilityForTests } from "@/lib/folioVisibility";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import * as fx from "../fixtures";
import { formatXirr, type SortState } from "../mfCopy";
import { expectInteractivity, failedLoad, loaded, loadingLoad } from "../testing";
import { HoldingsTable } from "./HoldingsTable";
import type { ConsolidatedHolding, FundBenchmarkRow, HoldingRow } from "../types";

function Probe() { const l = useLocation(); return <output data-testid="loc">{l.pathname}</output>; }
const NOT_LIVE = buildRegistry().map(route => (route.id === "portfolio-mutual-funds-fund" ? { ...route, status: "placeholder" as const } : route));
const XIRR = { "S-KOTAK": "0.1420", "S-JM": "0.1860", "S-HDFC": "0.2130" };

// FE-1b contract: OverviewPage builds xirrMetaByScheme from bench.data.funds in the
// same mapping as xirrByScheme. Keys are scheme_id and metadata keeps the API names.
// The optional prop is declared here so these tests type-check before the table accepts it.
type XirrMetaByScheme = Partial<Record<string, Pick<FundBenchmarkRow, "xirr_as_of" | "xirr_basis" | "since_purchase_return" | "xirr_caution">>>;
type TableOverrides = Partial<Parameters<typeof HoldingsTable>[0]> & { xirrMetaByScheme?: XirrMetaByScheme };

function table(over: TableOverrides = {}, routes = buildRegistry()) {
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
    expect(screen.getAllByRole("columnheader").map(header => header.textContent?.replace(/[↑↓]/g, "").trim())).toEqual(["Fund", "Category", "Invested", "Value", "Gain/Loss", "Returns", "XIRR", "Today's change"]);
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
  it("makes the six numeric headers sortable and leaves Fund and Category plain", () => {
    table();
    for (const name of ["Invested", "Value", "Gain/Loss", "Returns", "XIRR", "Today's change"]) expect(screen.getByRole("button", { name: new RegExp(`^${name.replace("/", "\\/")}`) })).toBeInTheDocument();
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
      folios: [{ folio_id: "fa", folio_masked: "XXXX9012", folio_number: "10234567 / 0", units: "10", invested: "100.00", value: "200.00" }] },
    { ...first, household_member_id: "m2", household_member_name: "Dev", units_held: "30", amount_invested: "450.00", average_nav: "15", current_value: "600.00", realized_gain: "2.00", unrealized_gain: "150.00", xirr: null,
      folios: [{ folio_id: "fb", folio_masked: "XXXX3456", folio_number: "55501234 / 1", units: "30", invested: "450.00", value: "600.00" }] },
  ];
  return [{ ...first, amc_name: first.amc_name ?? "", asset_class: first.asset_class ?? "Other", plan_verified: true,
    sebi_category: first.sebi_category ?? null, stale_nav: false, nav_unavailable: false, price_from_statement: false,
    current_nav_date: first.current_nav_date ?? null, units_held: "40", average_price: "13.75", amount_invested: "550.00", current_value: "800.00", unrealized_gain: "250.00", realized_gain: "3.00", xirr: "0.12", opening_lot: null, children }];
}

describe("HoldingsTable: per-fund return basis", () => {
  it.each(["annualised", "absent"] as const)("keeps the main-row value when the return basis is %s", basis => {
    table(basis === "absent" ? {} : {
      xirrMetaByScheme: { "S-KOTAK": { xirr_basis: "annualised", since_purchase_return: "0.2" } },
    });
    const cell = within(row("S-KOTAK:m1")).getByTestId("xirr");
    expect(cell).toHaveTextContent(/^14\.2%$/);
    expect(within(cell).queryByText("since purchase")).not.toBeInTheDocument();
  });

  it("shows the existing dash when same-day flows have null XIRR", () => {
    table({
      xirrByScheme: { "S-KOTAK": null },
      xirrMetaByScheme: { "S-KOTAK": { xirr_basis: null, since_purchase_return: null } },
    });
    expect(within(row("S-KOTAK:m1")).getByTestId("xirr").textContent).toBe(formatXirr(null));
  });
});

describe("consolidated family holdings", () => {
  it("parent_row_shows_all_requirement_2_2_columns_and_a_split_bar", () => {
    table({ consolidated: familyParents() });
    expect(screen.getAllByRole("columnheader").map(x => x.textContent)).toEqual(["Fund", "Units", "Avg price", "Invested", "Current value", "Unrealised", "Realised", "Returns", "XIRR"]);
    const parent = screen.getByTestId("parent-S-KOTAK:direct");
    expect(parent).toHaveTextContent("13.75");
    expect(parent).toHaveTextContent("₹550");
    expect(parent).toHaveTextContent("12.0%");
    expect(within(parent).getByTestId("split-bar")).toBeInTheDocument();
    expect(within(parent).getByTestId("share-m1")).toHaveStyle({ width: "25.00%" });
    expect(within(parent).getByTestId("share-m2")).toHaveStyle({ width: "75.00%" });
  });
  it("expand_opens_one_row_per_member_with_the_full_folio_number", () => {
    table({ consolidated: familyParents() });
    fireEvent.click(screen.getByRole("button", { name: "Expand Kotak Multi Cap Fund" }));
    const a = screen.getByTestId("member-S-KOTAK:direct:m1");
    const b = screen.getByTestId("member-S-KOTAK:direct:m2");
    expect(a).toHaveTextContent("Asha"); expect(a).toHaveTextContent("10234567 / 0");
    expect(b).toHaveTextContent("Dev"); expect(b).toHaveTextContent("55501234 / 1");
    expect(a).not.toHaveTextContent("XXXX9012"); // the old masked field is never shown (Batch C 17c)
    expect(b).not.toHaveTextContent("XXXX3456");
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
    expect(screen.getAllByRole("columnheader").map(x => x.textContent?.trim())).toEqual(["Fund", "Category", "Invested", "Value", "Gain/Loss", "Returns", "XIRR", "Today's change"]);
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

it("split_shares_survives_exponent_negative_or_junk_units_without_crashing", () => {
  const parents = familyParents();
  const base = parents[0].children[0];
  parents[0].children = [["m1", "1E+3"], ["m2", "2"], ["m3", "-1"], ["m4", "oops"]].map(([id, units]) => ({ ...base, household_member_id: id, household_member_name: id, units_held: units }));
  table({ consolidated: parents });
  const widths = ["m1", "m2", "m3", "m4"].map(id => Number.parseFloat(screen.getByTestId(`share-${id}`).style.width));
  expect(widths).toEqual([0, 100, 0, 0]);
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

describe("Category column (UI round 2, change 2)", () => {
  it("the Category cell shows the short form and a dash when there is none", () => {
    const categories = ["Equity Scheme - Flexi Cap Fund", "Equity Schemes - Mid Cap Fund", "Debt Scheme - Liquid Fund", "Large Cap Fund", null];
    const rows = fx.holdings().map((holding, index) => ({ ...holding, sebi_category: categories[index] }));
    table({ holdings: loaded(rows) });
    const byFund = Object.fromEntries(screen.getAllByTestId(/^row-/).map(tr => [tr.getAttribute("data-testid")!.slice(4).split(":")[0], within(tr).getByTestId("category").textContent]));
    expect(byFund).toEqual({ "S-KOTAK": "Flexi Cap Fund", "S-JM": "Mid Cap Fund", "S-HDFC": "Liquid Fund", "S-SBI": "Large Cap Fund", "S-AXIS": "—" });
  });
});

// Batch C 17c (C-7): full folio numbers with an eye beside each. Design: workbook Batch C section 4.
describe("holdings folio numbers: full, with one eye that hides them all", () => {
  beforeEach(() => resetFolioVisibilityForTests());
  const expandKotak = () => {
    table({ consolidated: familyParents() });
    fireEvent.click(screen.getByRole("button", { name: "Expand Kotak Multi Cap Fund" }));
    return { a: screen.getByTestId("member-S-KOTAK:direct:m1"), b: screen.getByTestId("member-S-KOTAK:direct:m2") };
  };
  it("each expanded member row has its own eye beside the number", () => {
    const { a, b } = expandKotak();
    expect(within(a).getByRole("button", { name: "Hide folio numbers" })).toHaveAttribute("aria-pressed", "false");
    expect(within(b).getByRole("button", { name: "Hide folio numbers" })).toHaveAttribute("aria-pressed", "false");
  });
  it("one click hides every folio number on the page as XXXX plus the last four of the folio part and the sub-folio", () => {
    const { a, b } = expandKotak();
    fireEvent.click(within(a).getByRole("button", { name: "Hide folio numbers" }));
    expect(a).toHaveTextContent("XXXX4567 / 0");
    expect(b).toHaveTextContent("XXXX1234 / 1");
    expect(a).not.toHaveTextContent("10234567");
    expect(within(b).getByRole("button", { name: "Show folio numbers" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(b).getByRole("button", { name: "Show folio numbers" }));
    expect(a).toHaveTextContent("10234567 / 0");
  });
  it("a fund held by one member shows the number after the member's name on the parent row, with the eye", () => {
    const parents = familyParents(); parents[0].children = parents[0].children.slice(0, 1);
    table({ consolidated: parents });
    const parent = screen.getByTestId("parent-S-KOTAK:direct");
    expect(parent).toHaveTextContent("Asha");
    expect(parent).toHaveTextContent("10234567 / 0");
    expect(within(parent).getByRole("button", { name: "Hide folio numbers" })).toBeInTheDocument();
  });
  it("a long number wraps inside its cell instead of being cut off (monospace, overflow-wrap anywhere)", () => {
    const { a } = expandKotak();
    const number = within(a).getByText("10234567 / 0");
    expect(number).toHaveClass("font-mono");
    expect(number).toHaveClass("[overflow-wrap:anywhere]");
  });
});

describe("Returns and annualised XIRR columns", () => {
  const meta: XirrMetaByScheme = {
    "S-KOTAK": { xirr_basis: "since_purchase", since_purchase_return: "0.065", xirr_caution: "young" },
    "S-JM": { since_purchase_return: "-0.001", xirr_caution: "single_transaction" },
    "S-HDFC": { since_purchase_return: "0", xirr_caution: null },
  };
  const rates = { "S-KOTAK": "0.418", "S-JM": "0.1", "S-HDFC": "0" };
  const show = () => table({ xirrByScheme: rates, xirrMetaByScheme: meta });
  const cell = (key: string, id: string) => within(row(key)).getByTestId(id);
  it("columns_are_gain_loss_returns_xirr_in_that_order", () => {
    show(); const headers = screen.getAllByRole("columnheader").map(h => h.textContent?.trim());
    expect(headers.slice(headers.indexOf("Gain/Loss"), headers.indexOf("XIRR") + 1)).toEqual(["Gain/Loss", "Returns", "XIRR"]);
  });
  it("returns_cell_shows_the_since_purchase_return_for_every_row", () => {
    show();
    for (const holding of fx.holdings()) {
      expect(cell(`${holding.scheme_id}:${holding.household_member_id}`, "returns").textContent).toBe(formatXirr(meta[holding.scheme_id]?.since_purchase_return));
    }
  });
  it("xirr_cell_shows_the_annualised_rate_never_the_since_purchase_figure", () => {
    show();
    expect(cell("S-KOTAK:m1", "xirr")).toHaveTextContent(formatXirr("0.418"));
    expect(cell("S-KOTAK:m1", "xirr")).not.toHaveTextContent(formatXirr("0.065"));
  });
  it("chip_sits_on_the_xirr_cell_only_where_the_caution_applies", () => {
    show();
    for (const [id, caution] of [["S-KOTAK:m1", "young"], ["S-JM:m2", "single_transaction"]] as const) {
      const chip = within(cell(id, "xirr")).getByTestId("xirr-caution");
      expect(chip.textContent).toBe(CAUTION_CHIP[caution].text);
      expect(chip).toHaveAttribute("title", CAUTION_CHIP[caution].tip);
      expect(chip).toHaveAttribute("aria-label", CAUTION_CHIP[caution].tip);
      expect(within(cell(id, "returns")).queryByTestId("xirr-caution")).toBeNull();
    }
    expect(within(cell("S-HDFC:m3", "xirr")).queryByTestId("xirr-caution")).toBeNull();
  });
  it("the_since_purchase_sub_label_under_xirr_is_gone", () => {
    show(); expect(screen.queryByText("since purchase")).toBeNull();
  });
  it("a_fund_bought_once_gets_one_transaction_while_its_neighbours_do_not", () => {
    show(); expect(within(cell("S-JM:m2", "xirr")).getByText("one transaction")).toBeInTheDocument();
    expect(within(row("S-HDFC:m3")).queryByTestId("xirr-caution")).toBeNull();
    expect(within(row("S-KOTAK:m1")).queryByText("one transaction")).toBeNull();
  });
  it("family_parent_and_each_child_get_their_own_chip", () => {
    const parent: ConsolidatedHolding = { ...familyParents()[0], xirr: "0.418", since_purchase_return: "0.065", xirr_caution: "young" };
    parent.children[0] = { ...parent.children[0], since_purchase_return: "0", xirr_caution: "single_transaction" };
    parent.children[1] = { ...parent.children[1], xirr: "-0.001", since_purchase_return: "-0.001", xirr_caution: "young" };
    table({ consolidated: [parent] });
    const parentRow = within(screen.getByTestId("parent-S-KOTAK:direct"));
    expect(parentRow.getByTestId("returns").textContent).toBe(formatXirr("0.065"));
    expect(within(parentRow.getByTestId("xirr")).getByTestId("xirr-caution").textContent).toBe(CAUTION_CHIP.young.text);
    expect(within(parentRow.getByTestId("returns")).queryByTestId("xirr-caution")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Kotak Multi Cap Fund" }));
    for (const child of parent.children) {
      const cells = within(screen.getByTestId(`member-S-KOTAK:direct:${child.household_member_id}`));
      expect(cells.getByTestId("child-returns").textContent).toBe(formatXirr(child.since_purchase_return));
      expect(cells.getByTestId("child-xirr")).toHaveTextContent(formatXirr(child.xirr));
      const chip = within(cells.getByTestId("child-xirr")).getByTestId("xirr-caution");
      expect(chip.textContent).toBe(CAUTION_CHIP[child.xirr_caution!].text);
      expect(within(cells.getByTestId("child-returns")).queryByTestId("xirr-caution")).toBeNull();
    }
  });
  it("more_than_four_members_shows_dashes_for_child_rows", () => {
    const parent: ConsolidatedHolding = { ...familyParents()[0], since_purchase_return: "0.065" };
    parent.children = ["m1", "m2", "m3", "m4", "m5"].map(id => ({ ...parent.children[0], household_member_id: id, household_member_name: id, xirr: null, since_purchase_return: null, xirr_caution: null }));
    table({ consolidated: [parent] });
    fireEvent.click(screen.getByRole("button", { name: "Expand Kotak Multi Cap Fund" }));
    for (const child of parent.children) {
      const cells = within(screen.getByTestId(`member-S-KOTAK:direct:${child.household_member_id}`));
      for (const id of ["child-xirr", "child-returns"]) expect(cells.getByTestId(id).textContent).toBe(formatXirr(null));
      expect(cells.queryByTestId("xirr-caution")).toBeNull();
    }
    expect(within(screen.getByTestId("parent-S-KOTAK:direct")).getByTestId("returns").textContent).toBe(formatXirr("0.065"));
  });
  it("missing_returns_shows_a_dash_and_xirr_still_shows", () => {
    table(); expect(cell("S-KOTAK:m1", "returns").textContent).toBe(formatXirr(null));
    expect(cell("S-KOTAK:m1", "xirr").textContent).toBe(formatXirr(XIRR["S-KOTAK"]));
    expect(within(row("S-KOTAK:m1")).queryByTestId("xirr-caution")).toBeNull();
  });
  it("net_zero_row_shows_dashes_in_both", () => {
    table({ xirrByScheme: { "S-KOTAK": null }, xirrMetaByScheme: { "S-KOTAK": { since_purchase_return: null, xirr_caution: null } } });
    for (const id of ["returns", "xirr"]) expect(cell("S-KOTAK:m1", id).textContent).toBe(formatXirr(null));
    expect(within(row("S-KOTAK:m1")).queryByTestId("xirr-caution")).toBeNull();
  });
  it("sorts_by_returns_and_by_xirr_with_missing_values_last", () => {
    const { props, rerender, unmount } = show();
    for (const key of ["returns", "xirr"] as const) {
      for (const dir of ["asc", "desc"] as const) {
        rerender({ ...props, sort: { key, dir } });
        const ordered = key === "returns" ? ["S-JM:m2", "S-HDFC:m3", "S-KOTAK:m1"] : ["S-HDFC:m3", "S-JM:m2", "S-KOTAK:m1"];
        expect(rowIds().slice(0, 3)).toEqual(dir === "asc" ? ordered : [...ordered].reverse());
        expect(rowIds().slice(3)).toEqual(["S-SBI:m3", "S-AXIS:m1"]);
      }
    }
    unmount();
    const parents: ConsolidatedHolding[] = [
      { ...familyParents()[0], scheme_id: "S-A", xirr: "0.418", since_purchase_return: "-0.001", xirr_basis: "since_purchase" },
      { ...familyParents()[0], scheme_id: "S-B", xirr: "0", since_purchase_return: "0.065" },
      { ...familyParents()[0], scheme_id: "S-C", xirr: null, since_purchase_return: null },
    ];
    const family = table({ consolidated: parents });
    for (const key of ["returns", "xirr"] as const) {
      for (const dir of ["asc", "desc"] as const) {
        family.rerender({ ...family.props, sort: { key, dir } });
        const ordered = key === "returns" ? ["S-A", "S-B"] : ["S-B", "S-A"];
        const expected = dir === "asc" ? ordered : [...ordered].reverse();
        expect(screen.getAllByTestId(/^parent-/).map(parent => parent.getAttribute("data-testid"))).toEqual([...expected, "S-C"].map(id => `parent-${id}:direct`));
      }
    }
  });
  it("sort_menu_has_a_returns_entry", () => {
    const { props } = show();
    const controls = screen.getAllByRole("columnheader").map(h => within(h).queryByRole("button")).filter(h => h !== null);
    const labels = controls.map(h => h.textContent?.trim());
    expect(labels.slice(labels.indexOf("Gain/Loss"), labels.indexOf("XIRR") + 1)).toEqual(["Gain/Loss", "Returns", "XIRR"]);
    fireEvent.click(screen.getByRole("button", { name: /^Returns/ }));
    expect(props.onSort).toHaveBeenCalledWith({ key: "returns", dir: "desc" });
  });
  it("header_tooltips_use_the_owner_wording", () => {
    show();
    expect(screen.getByRole("columnheader", { name: /^Returns/ })).toHaveAttribute("title", "Total gain as a share of money paid in, not annualised.");
    expect(screen.getByRole("columnheader", { name: /^XIRR/ })).toHaveAttribute("title", "Yearly rate, worked out from the dates of your investments.");
  });
});
