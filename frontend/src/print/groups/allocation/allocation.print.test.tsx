import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analyticsMfB, analyticsMfBMember, assetAllocation, capAllocation, analyticsAllocation, fundManager, fundBenchmark } from "../../../features/mutual-funds/fixtures/mfB";
import { analyticsStore } from "../../../features/mutual-funds/data/analyticsStore";
import { assetSlices, bucketSlices, classFunds, managerKey } from "../../../features/mutual-funds/allocation/allocationLogic";
import { formatXirr } from "../../../features/mutual-funds/mfCopy";
import type { AssetClassKey } from "../../../features/mutual-funds/types";
import { formatPercent, formatRupees } from "../../../lib/format";
import { formatDataDate, olderDataMarker } from "../../../lib/dataDates";
import { PrintModeProvider } from "../../../lib/printMode";
import { ScopeContext } from "../../../shell/scope/ScopeContext";
import { PRINT_SECTIONS } from "../../sectionRegistry";
import { PrintSettledContext } from "../../usePrintSettled";
import { allocationPrintSections } from "../allocationPrint";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../../features/mutual-funds/api", () => mocks);
vi.mock("../../../features/auth/session", () => ({ getToken: () => "invented-print-token" }));
const ids = ["allocation-asset-class", "allocation-market-cap", "allocation-category-amc", "allocation-fund-manager"];
function sampleAsset() {
  const data = assetAllocation();
  data.as_disclosed.classes.forEach((item, index) => { item.funds = [{ scheme_id: `DEMO-${index}`, scheme_name: `Demo Fund ${index}`, value: item.value, percentage: "100.00" }]; });
  return data;
}
function response() {
  const data = analyticsMfB();
  data.sections.asset_allocation!.payload = { members: [], asset_allocation: sampleAsset() };
  return data;
}
function mount(id: string, dataDates = true, memberId: string | null = null) {
  const settled = vi.fn<(id: string, ready: boolean) => void>();
  const view = render(<PrintModeProvider value={{ folios: "none", dataDates }}>
    <ScopeContext.Provider value={{ viewMode: memberId ? "member" : "aggregate", memberId, members: [], scopeKey: memberId ? `member:${memberId}` : "aggregate", setMember: () => {}, setAggregate: () => {}, refreshMembers: () => {} }}>
      <PrintSettledContext.Provider value={settled}>{PRINT_SECTIONS[id].render()}</PrintSettledContext.Provider>
    </ScopeContext.Provider>
  </PrintModeProvider>);
  return { ...view, settled };
}
function expectStatic(container: HTMLElement) {
  expect(container.querySelector('button,[role="button"],input,[title],[data-tooltip],a')).toBeNull();
  expect(container.querySelector('[class*="overflow-x-auto"],[class*="overflow-y-auto"],[class*="max-h-"]')).toBeNull();
  for (const element of container.querySelectorAll("*")) expect(["sticky", "fixed"]).not.toContain(getComputedStyle(element).position);
  for (const heading of container.querySelectorAll("h3,h4,h5")) expect(heading).toHaveStyle({ breakAfter: "avoid" });
  for (const row of container.querySelectorAll("tr,li")) expect(row).toHaveStyle({ breakInside: "avoid" });
  for (const table of container.querySelectorAll("table")) {
    expect(table).toHaveClass("w-full", "table-fixed");
    if (table.querySelector("thead")) expect(table.querySelector("thead")).toHaveStyle({ display: "table-header-group" });
  }
}
beforeEach(() => { analyticsStore.invalidate(); Object.values(mocks).forEach(mock => mock.mockReset()); mocks.getAnalyticsScope.mockResolvedValue(response()); });
afterEach(() => { cleanup(); analyticsStore.invalidate(); vi.restoreAllMocks(); });

it("registers every section of the group", async () => {
  expect(Object.keys(allocationPrintSections).sort()).toEqual([...ids].sort());
  for (const id of ids) {
    const view = mount(id);
    await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
    expect(view.container.textContent).not.toContain("This section is not in the PDF yet.");
    expectStatic(view.container);
    view.unmount();
  }
  expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  expect(mocks.retryAnalyticsScope).not.toHaveBeenCalled();
});
it("prints the disclosed asset slices, rupee values, every contributing fund and arbitrage variant", async () => {
  mount(ids[0]);
  const data = sampleAsset();
  for (const slice of assetSlices(data.as_disclosed).filter(item => item.key !== "others")) {
    const legend = await screen.findByTestId(`legend-${slice.key}`);
    expect(legend).toHaveTextContent(slice.label);
    expect(legend).toHaveTextContent(formatRupees(slice.value));
    expect(legend).toHaveTextContent(formatPercent(slice.pct, { digits: 1 }));
    const list = screen.getByTestId(`asset-funds-${slice.key}`);
    for (const fund of classFunds(data.as_disclosed, slice.key as AssetClassKey) ?? []) {
      expect(list).toHaveTextContent(fund.scheme_name);
      expect(list).toHaveTextContent(formatRupees(fund.value));
      expect(list).toHaveTextContent(formatPercent(fund.percentage, { digits: 1 }));
    }
  }
  expect(screen.getByTestId("arbitrage-print-note")).toHaveTextContent("If arbitrage funds were treated as cash-like");
  for (const slice of assetSlices(data.arbitrage_as_cash)) expect(screen.getByTestId("arbitrage-print-note")).toHaveTextContent(formatPercent(slice.pct, { digits: 1 }));
  expect(screen.getByLabelText("Portfolio disclosure coverage")).toHaveTextContent("Based on");
});
it("prints every cap bucket's stocks, exposure values and truncation caption without fund drills", async () => {
  const data = capAllocation();
  data.buckets[0].row_count = data.buckets[0].rows.length + 3;
  const payload = response(); payload.sections.cap_allocation!.payload = { members: [], cap_allocation: data };
  mocks.getAnalyticsScope.mockResolvedValue(payload);
  mount(ids[1]);
  for (const bucket of data.buckets) {
    const table = await screen.findByTestId(`cap-stocks-${bucket.key}`);
    expect(within(table).getAllByRole("row")).toHaveLength(bucket.rows.length + 1);
    for (const stock of bucket.rows) {
      const row = within(table).getByRole("row", { name: new RegExp(stock.instrument_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
      expect(row).toHaveTextContent(formatRupees(stock.exposure_value));
    }
  }
  expect(screen.getByText(`Showing the largest ${data.buckets[0].rows.length} of ${data.buckets[0].row_count} holdings in this group.`)).toBeInTheDocument();
  expect(screen.getByText(/could not be sorted into Large, Mid or Small/)).toBeInTheDocument();
  expect(screen.queryByText(/% of fund/)).toBeNull();
});
it("prints By Category then By AMC in descending order with values and percentages", async () => {
  mount(ids[2]);
  const data = analyticsAllocation();
  const headings = await screen.findAllByRole("heading", { level: 4 });
  expect(headings.map(heading => heading.textContent)).toEqual(["By Category", "By AMC"]);
  for (const [kind, items] of [["category", data.by_category], ["amc", data.by_amc]] as const) {
    const view = screen.getByTestId(`allocation-${kind}-print`);
    const slices = bucketSlices(items, "desc");
    expect(within(view).getAllByTestId(/^legend-/).filter(row => row.tagName === "TR").map(row => row.textContent)).toEqual(slices.map(slice => expect.stringContaining(slice.label)));
    for (const slice of slices) {
      const row = within(view).getByTestId(`legend-${slice.key}`);
      expect(row).toHaveTextContent(formatRupees(slice.value));
      expect(row).toHaveTextContent(formatPercent(slice.pct, { digits: 1 }));
    }
  }
});
it("uses a table beyond nine slices and a donut at nine", async () => {
  const data = analyticsAllocation();
  const item = data.by_category[0];
  data.by_category = Array.from({ length: 10 }, (_, index) => ({ ...item, label: `Demo Category ${index}` }));
  data.by_amc = Array.from({ length: 9 }, (_, index) => ({ ...item, label: `Demo AMC ${index}` }));
  const payload = response(); payload.sections.allocation!.payload = { members: [], allocation: data };
  mocks.getAnalyticsScope.mockResolvedValue(payload);
  mount(ids[2]);
  const category = await screen.findByTestId("allocation-category-print");
  expect(category.querySelector("svg")).toBeNull();
  expect(within(category).getAllByRole("row")).toHaveLength(11);
  expect(screen.getByTestId("allocation-amc-print").querySelector("svg")).not.toBeNull();
});
it("prints the manager table, every fund with XIRR, totals and unavailable warning", async () => {
  mount(ids[3]);
  const table = await screen.findByRole("table", { name: "Fund manager allocation" });
  expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
  const data = fundManager();
  const benchmarks = fundBenchmark();
  for (const group of data.manager_groups) {
    const detail = screen.getByTestId(`manager-detail-${managerKey(group)}`);
    for (const fund of group.funds) {
      const item = within(detail).getByTestId(`manager-fund-${managerKey(group)}-${fund.scheme_id}`);
      expect(item).toHaveTextContent(fund.scheme_name);
      expect(item).toHaveTextContent(formatRupees(fund.household_value));
      expect(item).toHaveTextContent(formatXirr(benchmarks.funds.find(row => row.scheme_id === fund.scheme_id)?.fund_xirr));
    }
  }
  expect(table.querySelector("tfoot")).toHaveTextContent(formatRupees(data.covered_value));
  for (const fund of data.unavailable_schemes) expect(screen.getByText(`${fund.scheme_name} (${fund.amc_name})`)).toBeInTheDocument();
});
it.each(ids)("%s waits for data and settles after loading", async id => {
  let finish!: (data: ReturnType<typeof response>) => void;
  mocks.getAnalyticsScope.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = mount(id);
  expect(view.settled).not.toHaveBeenCalledWith(id, true);
  await act(async () => { finish(response()); });
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
});
it.each(ids)("%s prints a failed read in place and settles without buttons", async id => {
  mocks.getAnalyticsScope.mockRejectedValue(new Error("Invented failure"));
  const view = mount(id);
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
  expect(screen.getByRole("alert")).toHaveTextContent("This section failed to load, but the rest of the page is unaffected.");
  expectStatic(view.container);
});
it.each(ids)("%s prints dates through the screen helpers and only warranted older markers", async id => {
  const today = new Date();
  const asset = sampleAsset(); const cap = capAllocation();
  asset.holdings_as_of = "2020-01-01";
  const payload = response();
  payload.sections.asset_allocation!.payload = { members: [], asset_allocation: asset };
  mocks.getAnalyticsScope.mockResolvedValue(payload);
  const view = mount(id);
  const footer = await screen.findByTestId("allocation-print-dates");
  const dates = [["prices", asset.nav_as_of], ["holdings", asset.holdings_as_of], ["marketCapList", cap.classification_as_of]] as const;
  for (const [kind, iso] of dates) expect(footer).toHaveTextContent(formatDataDate(kind, iso));
  expect(within(footer).queryAllByText("Older than usual")).toHaveLength(dates.filter(([kind, iso]) => olderDataMarker(kind, iso, today).older).length);
  expectStatic(view.container);
});
it("omits date footers when the option is off and reads member payloads", async () => {
  mocks.getAnalyticsScope.mockResolvedValue(analyticsMfBMember());
  const view = mount(ids[0], false, "m1");
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(ids[0], true));
  expect(screen.queryByTestId("allocation-print-dates")).toBeNull();
  expect(mocks.getAnalyticsScope).toHaveBeenCalledWith("m1");
});
