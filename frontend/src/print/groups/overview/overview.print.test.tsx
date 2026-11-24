import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as fx from "../../../features/mutual-funds/fixtures";
import { analyticsMfB, analyticsMfBMember, fundBenchmark } from "../../../features/mutual-funds/fixtures/mfB";
import { analyticsStore } from "../../../features/mutual-funds/data/analyticsStore";
import { buildOverviewInsights, formatSignedRupees, formatXirr, holdingTotals, monthlySipTotal, percentOf, slugify, sortHoldings } from "../../../features/mutual-funds/mfCopy";
import type { ConsolidatedHolding, HistoryPoint } from "../../../features/mutual-funds/types";
import { sumDecimalStrings } from "../../../lib/decimal";
import { formatCompactRupees, formatDate, formatPercent, formatRupees } from "../../../lib/format";
import { maskFolio } from "../../../lib/folioVisibility";
import { PrintModeProvider } from "../../../lib/printMode";
import { CAUTION_CHIP } from "../../../lib/xirrDisplay";
import { ScopeContext } from "../../../shell/scope/ScopeContext";
import { PRINT_SECTIONS } from "../../sectionRegistry";
import { PrintSettledContext } from "../../usePrintSettled";
import { overviewPrintSections } from "../overviewPrint";
import { HistoryChartPrint } from "../performance/HistoryChartPrint";

const mocks = vi.hoisted(() => ({ getHoldingsBundle: vi.fn(), getAllocation: vi.fn(), getSips: vi.fn(), getHistoryPoints: vi.fn(), getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn(), getSipsMonthly: vi.fn(), getWealthSeries: vi.fn(), getWealthBenchmarks: vi.fn(), getCoverageGaps: vi.fn() }));
vi.mock("../../../features/mutual-funds/api", () => mocks);
vi.mock("../../../features/auth/session", () => ({ getToken: () => "invented-print-token" }));
const ids = ["overview-value-over-time", "overview-sips", "overview-mutual-funds", "overview-amc-allocation", "overview-family-members", "overview-quick-insights"];
const points: HistoryPoint[] = [
  { month: "2014-12-31", value: 100000, valueText: "100000.00", invested: 90000, investedText: "90000.00", partial: false, missing: [] },
  { month: "2020-12-31", value: 150000, valueText: "150000.00", invested: 120000, investedText: "120000.00", partial: false, missing: [] },
  { month: "2026-10-31", value: 200000, valueText: "200000.00", invested: 160000, investedText: "160000.00", partial: false, missing: [] },
];
function parents(): ConsolidatedHolding[] {
  const base = fx.holdings()[0];
  const children = ["m1", "m2"].map((id, i) => ({ ...base, household_member_id: id, household_member_name: `Demo Member ${i}`, units_held: "10", xirr: "0.12", folios: [{ folio_id: `demo-${i}`, folio_number: `9000111${i} / 0`, folio_masked: "XXXX1110", units: "10", invested: base.amount_invested, value: base.current_value }] }));
  return [{ ...base, amc_name: base.amc_name!, asset_class: "equity", sebi_category: base.sebi_category ?? null, plan_verified: true, units_held: "20", average_price: "10", current_nav_date: "2026-10-31", stale_nav: false, nav_unavailable: false, price_from_statement: false, opening_lot: null, xirr: "0.12", children }];
}
function bundle(consolidated?: ConsolidatedHolding[]) {
  return { holdings: fx.holdings(), consolidated, members: structuredClone(fx.MEMBERS), xirr: { lifetime: "0.1612", current: "0.148", disclaimers: { lifetime: null, current: null } }, realized: fx.aggregateHoldings().realized_summary };
}
function mount(id: string, memberId: string | null = null, folios: "full" | "masked" | "none" = "none") {
  const settled = vi.fn<(id: string, ready: boolean) => void>(); const setMember = vi.fn();
  const view = render(<PrintModeProvider value={{ folios, dataDates: true }}><ScopeContext.Provider value={{ viewMode: memberId ? "member" : "aggregate", memberId, members: [], scopeKey: memberId ? `member:${memberId}` : "aggregate", setMember, setAggregate: () => {}, refreshMembers: () => {} }}><PrintSettledContext.Provider value={settled}>{PRINT_SECTIONS[id].render()}</PrintSettledContext.Provider></ScopeContext.Provider></PrintModeProvider>);
  return { ...view, settled, setMember };
}
function expectStatic(container: HTMLElement) {
  expect(container.querySelector('button,[role="button"],a,[data-clickable]')).toBeNull();
  expect(container.querySelector('[class*="overflow-x-auto"],[class*="max-h-"],[class*="min-w-["],[class*="truncate"]')).toBeNull();
  for (const titled of container.querySelectorAll("[title]")) {
    expect(titled.matches('[data-testid="xirr-caution"],th')).toBe(true);
  }
  for (const element of container.querySelectorAll("*")) expect(["sticky", "fixed"]).not.toContain(getComputedStyle(element).position);
  for (const heading of container.querySelectorAll("h3,h4")) expect(heading).toHaveStyle({ breakAfter: "avoid" });
  for (const row of container.querySelectorAll("tr,li")) expect(row).toHaveStyle({ breakInside: "avoid" });
  for (const table of container.querySelectorAll("table")) {
    expect(table).toHaveClass("w-full", "table-fixed");
    if (table.querySelector("thead")) expect(table.querySelector("thead")).toHaveStyle({ display: "table-header-group" });
  }
}
beforeEach(() => {
  analyticsStore.invalidate(); Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.getHoldingsBundle.mockResolvedValue(bundle()); mocks.getAllocation.mockResolvedValue(fx.allocation().allocation);
  mocks.getSips.mockResolvedValue(fx.sips().sips); mocks.getHistoryPoints.mockResolvedValue(points); mocks.getAnalyticsScope.mockImplementation((scope: string) => Promise.resolve(scope === "combined" ? analyticsMfB() : analyticsMfBMember()));
});
afterEach(() => { cleanup(); analyticsStore.invalidate(); });

it("registers every section of the group", async () => {
  expect(Object.keys(overviewPrintSections).sort()).toEqual([...ids].sort());
  for (const id of ids) {
    const view = mount(id); await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
    expect(view.container.textContent).not.toContain("This section is not in the PDF yet."); expectStatic(view.container); view.unmount();
  }
  expect(mocks.getWealthSeries).not.toHaveBeenCalled(); expect(mocks.getWealthBenchmarks).not.toHaveBeenCalled();
  expect(mocks.getSipsMonthly).not.toHaveBeenCalled(); expect(mocks.getCoverageGaps).not.toHaveBeenCalled(); expect(mocks.retryAnalyticsScope).not.toHaveBeenCalled();
});
it("prints the whole monthly history with the supplied chart, axes, two lines and legend", async () => {
  mount(ids[0]);
  const chart = await screen.findByRole("img", { name: "Value and money invested (net of withdrawals), 2014 to 2026" });
  expect(chart.textContent).toContain("₹"); expect(chart.textContent).toContain("2014"); expect(chart.textContent).toContain("2026");
  expect(chart.querySelectorAll("polyline")).toHaveLength(2);
  expect(chart.querySelector('polyline[stroke="var(--pos)"]')?.getAttribute("points")?.split(" ")).toHaveLength(points.length);
  expect(screen.getByText("Portfolio value")).toBeInTheDocument(); expect(screen.getByText("Invested")).toBeInTheDocument(); expect(chart.querySelector("circle")).toBeNull();
  const expected = render(<HistoryChartPrint points={points} title="Expected fixture" />);
  expect([...chart.querySelectorAll("polyline")].map(line => line.getAttribute("points"))).toEqual([...expected.container.querySelectorAll("polyline")].map(line => line.getAttribute("points")));
});
it("prints all active and stopped SIPs and the screen's monthly total without a monthly fetch", async () => {
  const view = mount(ids[1]); const tables = await screen.findAllByRole("table");
  const rows = fx.sips().sips;
  for (const sip of rows) {
    const table = sip.status === "stopped" ? tables[1] : tables[0];
    const row = within(table).getByText(sip.scheme_name).closest("tr")!;
    expect(row).toHaveTextContent(sip.household_member_name); expect(row).toHaveTextContent(formatRupees(sip.sip_amount)); expect(row).toHaveTextContent(formatDate(sip.next_due_date));
  }
  expect(within(tables[0]).getByText("Monthly SIP total").closest("tr")).toHaveTextContent(formatRupees(monthlySipTotal(rows)));
  expect(mocks.getSips.mock.calls[0].slice(0, 2)).toEqual([{ viewMode: "aggregate", memberId: null }, true]); expectStatic(view.container);
});
it("printed_table_has_returns_and_xirr_columns_and_the_chip", async () => {
  const data = analyticsMfBMember(); const funds = fundBenchmark(); funds.funds = [{ ...funds.funds[0], scheme_id: "S-KOTAK", xirr_basis: "since_purchase", since_purchase_return: "0.20", xirr_caution: "young", fund_xirr: "0.418" }];
  data.sections.benchmark_funds!.payload = funds as unknown as Record<string, unknown>; mocks.getAnalyticsScope.mockResolvedValue(data);
  const view = mount(ids[2], "m1"); await screen.findByTestId("foot-value");
  const order = sortHoldings(fx.holdings(), null, {});
  expect([...view.container.querySelectorAll('[data-testid^="row-"]')].map(row => row.getAttribute("data-testid"))).toEqual(order.map(row => `row-${row.scheme_id}:${row.household_member_id}`));
  const totals = holdingTotals(fx.holdings()); expect(screen.getByTestId("foot-invested")).toHaveTextContent(formatRupees(totals.invested)); expect(screen.getByTestId("foot-value")).toHaveTextContent(formatRupees(totals.value));
  expect(screen.getByTestId("foot-gain")).toHaveTextContent(formatSignedRupees(totals.unrealised));
  const cells = within(screen.getByTestId("row-S-KOTAK:m1"));
  expect(screen.getAllByRole("columnheader").map(h => h.textContent?.trim())).toEqual(["Fund", "Category", "Invested", "Value", "Gain/Loss", "Returns", "XIRR", "Today's change"]);
  expect(cells.getByTestId("returns").textContent).toBe(formatXirr("0.20"));
  expect(cells.getByTestId("xirr")).toHaveTextContent(formatXirr("0.418"));
  expect(within(cells.getByTestId("xirr")).getByTestId("xirr-caution").textContent).toBe(CAUTION_CHIP.young.text);
  expect(within(cells.getByTestId("returns")).queryByTestId("xirr-caution")).toBeNull();
  expectStatic(view.container);
});
it.each(["full", "masked", "none"] as const)("forces a family table and expands every member with %s folios", async folios => {
  const family = parents(); mocks.getHoldingsBundle.mockResolvedValue(bundle(family));
  const view = mount(ids[2], null, folios); const table = await screen.findByRole("table", { name: "Mutual Funds (1)" });
  expect(table).toHaveStyle({ display: "table" }); expect(within(table).getAllByRole("columnheader")).toHaveLength(9);
  for (const child of family[0].children) {
    const row = screen.getByTestId(`member-S-KOTAK:direct:${child.household_member_id}`);
    expect(row).toHaveStyle({ display: "table-row" }); expect(row).toHaveTextContent(child.household_member_name); expect(row).toHaveTextContent(formatXirr(child.xirr));
    const folio = child.folios![0].folio_number;
    if (folios === "none") expect(view.container.textContent).not.toContain(folio);
    else expect(row).toHaveTextContent(folios === "full" ? folio : maskFolio(folio));
  }
  expectStatic(view.container);
});
it("printed_table_no_longer_shows_the_since_purchase_sub_label", async () => {
  const family = parents(); family[0].children[0].xirr_basis = "since_purchase"; family[0].children[0].since_purchase_return = "0.20";
  family[0].children = [family[0].children[0]];
  mocks.getHoldingsBundle.mockResolvedValue(bundle(family)); mount(ids[2]);
  const row = await screen.findByTestId("member-S-KOTAK:direct:m1");
  expect(within(row).getByTestId("child-returns").textContent).toBe(formatXirr("0.20"));
  expect(within(row).getByTestId("child-xirr").textContent).toBe(formatXirr(family[0].children[0].xirr));
  expect(within(row).queryByText("since purchase")).toBeNull();
  expect(row).not.toHaveTextContent("Return since purchase, not annualised");
});
it("includes fully sold funds expanded and respects the member scope", async () => {
  const data = bundle(); data.realized!.funds.push({ ...data.realized!.funds[0], scheme_id: "demo-unsold", scheme_name: "Demo Not Fully Sold", fully_sold: false }, { ...data.realized!.funds[0], scheme_id: "demo-other", scheme_name: "Demo Other Member Sold", household_member_id: "m2" });
  mocks.getHoldingsBundle.mockResolvedValue(data); const view = mount(ids[2], "m1");
  expect(await screen.findByRole("region", { name: "Sold funds" })).toHaveTextContent("Old Fund"); expect(screen.queryByText(/Demo Other Member Sold|Demo Not Fully Sold/)).toBeNull(); expectStatic(view.container);
});
it("prints every AMC with the same signed percentage and rupee value and no selection", async () => {
  mount(ids[3]); await screen.findByRole("heading", { name: "AMC Allocation" }); const data = fx.allocation().allocation;
  for (const amc of data.by_amc) { const row = screen.getByTestId(`legend-${slugify(amc.label)}`); expect(row).toHaveTextContent(amc.label); expect(row).toHaveTextContent(formatPercent(String(amc.percentage), { digits: 1 })); expect(row).toHaveTextContent(formatRupees(amc.current_value)); }
  expect(screen.getByTestId("donut-centre-value")).toHaveTextContent(formatCompactRupees(data.total_value));
  for (const slice of screen.getAllByTestId(/^slice-/)) { expect(slice).toHaveAttribute("data-selected", "false"); expect(slice).toHaveAttribute("data-popped", "false"); }
});
it("prints the same family values and shares with no scope controls or helper text", async () => {
  const view = mount(ids[4]); await screen.findByRole("heading", { name: "Family Members" });
  const values = fx.MEMBERS.map(member => sumDecimalStrings(fx.holdings().filter(row => !row.nav_unavailable && row.household_member_id === member.id).map(row => row.current_value ?? "0"))); const total = sumDecimalStrings(values);
  fx.MEMBERS.forEach((member, i) => { const row = screen.getByTestId(`family-row-${member.id}`); expect(row).toHaveTextContent(member.name); expect(row).toHaveTextContent(formatRupees(values[i])); expect(row).toHaveTextContent(formatPercent(percentOf(values[i], total), { digits: 1 })); });
  expect(screen.queryByText(/Click a member/)).toBeNull(); expect(view.setMember).not.toHaveBeenCalled(); expectStatic(view.container);
});
it("prints nothing and settles immediately for family members in a member report", async () => {
  const view = mount(ids[4], "m1"); await waitFor(() => expect(view.settled).toHaveBeenCalledWith(ids[4], true)); expect(view.container).toBeEmptyDOMElement(); expect(mocks.getHoldingsBundle).not.toHaveBeenCalled();
});
it("prints exactly the screen's generated insight lines", async () => {
  mount(ids[5]); await screen.findByRole("heading", { name: "Quick Insights" });
  expect(screen.getAllByRole("listitem").map(row => row.textContent)).toEqual(buildOverviewInsights(fx.allocation().allocation, fx.holdings(), monthlySipTotal(fx.sips().sips)));
});
it.each(ids)("settles %s with a printed failure sentence when reads fail", async id => {
  for (const mock of [mocks.getHoldingsBundle, mocks.getAllocation, mocks.getSips, mocks.getHistoryPoints, mocks.getAnalyticsScope]) mock.mockRejectedValue(new Error("invented failure"));
  const view = mount(id); await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true)); expect(view.container.textContent).toMatch(/couldn't|failed to load/i); expectStatic(view.container);
});
it.each(ids)("does not settle %s while its reads are pending", (id) => {
  const pending = new Promise<never>(() => {}); for (const mock of [mocks.getHoldingsBundle, mocks.getAllocation, mocks.getSips, mocks.getHistoryPoints, mocks.getAnalyticsScope]) mock.mockReturnValue(pending);
  const view = mount(id); expect(view.settled).not.toHaveBeenCalledWith(id, true); expect(view.container).toBeEmptyDOMElement();
});
it("keeps holdings visible and settles when per-fund analytics fail", async () => {
  mocks.getAnalyticsScope.mockRejectedValue(new Error("invented analytics failure")); const view = mount(ids[2]); await waitFor(() => expect(view.settled).toHaveBeenCalledWith(ids[2], true)); expect(screen.getByTestId("row-S-KOTAK:m1")).toBeInTheDocument(); expectStatic(view.container);
});
it("prints empty history and SIP states without controls", async () => {
  mocks.getHistoryPoints.mockResolvedValue([]); const history = mount(ids[0]); expect(await screen.findByText("No history yet")).toBeInTheDocument(); history.unmount();
  mocks.getSips.mockResolvedValue([]); const sips = mount(ids[1]); expect(await screen.findByText("No active SIPs.")).toBeInTheDocument(); expectStatic(sips.container);
});
it("prints a zero monthly total when there are only stopped SIPs", async () => {
  mocks.getSips.mockResolvedValue(fx.sips().sips.filter(row => row.status === "stopped")); mount(ids[1]);
  expect(await screen.findByText("Stopped SIPs")).toBeInTheDocument(); expect(screen.getByText(/Monthly SIP total/)).toHaveTextContent(formatRupees(monthlySipTotal([])));
});

it("print_mapping_passes_xirr_caution", async () => {
  const data = analyticsMfBMember(); const funds = fundBenchmark();
  funds.funds = fx.holdings().slice(0, 3).map((row, index) => ({
    ...funds.funds[0], scheme_id: row.scheme_id, fund_xirr: "0.418", since_purchase_return: "0.065",
    xirr_caution: index === 0 ? "young" : index === 1 ? "single_transaction" : null,
  }));
  data.sections.benchmark_funds!.payload = funds as unknown as Record<string, unknown>;
  mocks.getAnalyticsScope.mockResolvedValue(data); mount(ids[2], "m1");
  for (const fund of funds.funds) {
    const holding = fx.holdings().find(row => row.scheme_id === fund.scheme_id)!;
    const cells = within(await screen.findByTestId(`row-${fund.scheme_id}:${holding.household_member_id}`));
    await waitFor(() => expect(cells.getByTestId("returns").textContent).toBe(formatXirr(fund.since_purchase_return)));
    if (fund.xirr_caution) expect(within(cells.getByTestId("xirr")).getByTestId("xirr-caution").textContent).toBe(CAUTION_CHIP[fund.xirr_caution].text);
    else expect(cells.queryByTestId("xirr-caution")).toBeNull();
  }
});
