import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analyticsMfB, analyticsMfBMember, stockHoldings } from "../../../features/mutual-funds/fixtures/mfB";
import { analyticsStore } from "../../../features/mutual-funds/data/analyticsStore";
import { AllStocksTable } from "../../../features/mutual-funds/holdings/AllStocksTable";
import { equityRows, fundChips, portfolioShare, sortStocks, stockKey, topStocksForFund } from "../../../features/mutual-funds/holdings/holdingsLogic";
import { formatPercent } from "../../../lib/format";
import { formatPercent as lookthroughPercent } from "../../../components/mf/lookthroughDisplay";
import { PrintModeProvider } from "../../../lib/printMode";
import { ScopeContext } from "../../../shell/scope/ScopeContext";
import { PRINT_SECTIONS } from "../../sectionRegistry";
import { PrintSettledContext } from "../../usePrintSettled";
import { holdingsPrintSections } from "../holdingsPrint";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../../features/mutual-funds/api", () => mocks);
vi.mock("../../../features/auth/session", () => ({ getToken: () => "invented-print-token" }));
const ids = ["holdings-top-by-fund", "holdings-all-stocks"];
function mount(id: string, memberId: string | null = null) {
  const settled = vi.fn<(id: string, ready: boolean) => void>();
  const view = render(<PrintModeProvider value={{ folios: "none", dataDates: true }}>
    <ScopeContext.Provider value={{ viewMode: memberId ? "member" : "aggregate", memberId, members: [], scopeKey: memberId ? `member:${memberId}` : "aggregate", setMember: () => {}, setAggregate: () => {}, refreshMembers: () => {} }}>
      <PrintSettledContext.Provider value={settled}>{PRINT_SECTIONS[id].render()}</PrintSettledContext.Provider>
    </ScopeContext.Provider>
  </PrintModeProvider>);
  return { ...view, settled };
}
function expectStatic(container: HTMLElement) {
  expect(container.querySelector('button, [role="button"], [title], [data-tooltip], a')).toBeNull();
  expect(container.querySelector('[class*="overflow-x-auto"], [class*="overflow-y-auto"], [class*="max-h-"]')).toBeNull();
  for (const element of container.querySelectorAll("*")) expect(["sticky", "fixed"]).not.toContain(getComputedStyle(element).position);
  for (const heading of container.querySelectorAll("h3,h4")) expect(heading).toHaveStyle({ breakAfter: "avoid" });
  for (const row of container.querySelectorAll("tr,li")) expect(row).toHaveStyle({ breakInside: "avoid" });
  for (const table of container.querySelectorAll("table")) {
    expect(table).toHaveClass("w-full", "table-fixed");
    expect(table.querySelector("thead")).toHaveStyle({ display: "table-header-group" });
  }
}
beforeEach(() => { analyticsStore.invalidate(); Object.values(mocks).forEach(mock => mock.mockReset()); mocks.getAnalyticsScope.mockResolvedValue(analyticsMfB()); });
afterEach(() => { cleanup(); analyticsStore.invalidate(); });

it("registers every section of the group", async () => {
  expect(Object.keys(holdingsPrintSections).sort()).toEqual([...ids].sort());
  for (const id of ids) {
    const view = mount(id);
    await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
    expect(view.container.textContent).not.toContain("This section is not in the PDF yet.");
    expectStatic(view.container);
    view.unmount();
  }
});
it("prints a complete top-ten block for every fund with the screen's weights and bars", async () => {
  mount(ids[0]);
  const rows = equityRows(stockHoldings());
  for (const fund of fundChips(rows)) {
    const block = await screen.findByTestId(`print-fund-${fund.schemeId}`);
    expect(block).toHaveTextContent(fund.name);
    expect(block).toHaveStyle({ breakInside: "avoid" });
    const top = topStocksForFund(rows, fund.schemeId);
    expect(within(block).getAllByRole("listitem")).toHaveLength(top.stocks.length);
    for (const stock of top.stocks) {
      const item = within(block).getByTestId(`top-row-${stock.rank}`);
      expect(item).toHaveTextContent(stock.name);
      expect(item).toHaveTextContent(formatPercent(stock.weight, { digits: 2 }));
      expect(item.querySelector(`[data-testid="top-bar-${stock.rank}"]`)).not.toBeNull();
    }
  }
  expect(screen.queryByText("Pick a fund to see its 10 largest stock positions.")).toBeNull();
});
it("prints all stocks in weight order with every fund detail opened and plain links", async () => {
  const view = mount(ids[1]);
  await screen.findByRole("table", { name: "All stock holdings" });
  const rows = sortStocks(equityRows(stockHoldings()), "weight");
  expect(screen.getAllByTestId(/^stock-row-/).map(row => row.dataset.testid)).toEqual(rows.map(row => `stock-row-${stockKey(row)}`));
  for (const row of rows) {
    const detail = screen.getByTestId(`stock-detail-${stockKey(row)}`);
    for (const fund of row.contributing_funds) {
      const item = within(detail).getByTestId(`stock-fund-${stockKey(row)}-${fund.scheme_id}`);
      expect(item).toHaveTextContent(fund.scheme_name);
      expect(item).toHaveTextContent(`${lookthroughPercent(fund.stock_weight_pct)}% of fund`);
      expect(item).toHaveTextContent(`${lookthroughPercent(portfolioShare(fund.fund_weight_pct, fund.stock_weight_pct))}% of portfolio`);
    }
  }
  expectStatic(view.container);
});
it("ignores a stock search in print and keeps the backend truncation captions", async () => {
  const data = stockHoldings();
  data.truncated = true;
  data.total_stock_count = 99;
  const view = render(<PrintModeProvider value={{ folios: "none", dataDates: false }}><AllStocksTable state="ready" data={data} onRetry={() => {}} query="no matching stock" /></PrintModeProvider>);
  expect(screen.getAllByTestId(/^stock-row-/)).toHaveLength(equityRows(data).length);
  expect(screen.getByTestId("stock-count")).toHaveTextContent(`Showing the largest ${equityRows(data).length} of 99`);
  view.unmount();
  const response = analyticsMfB();
  response.sections.stock_holdings!.payload = { stock_holdings: data, members: [] };
  mocks.getAnalyticsScope.mockResolvedValue(response);
  mount(ids[0]);
  expect(await screen.findByTestId("top-note")).toHaveTextContent(`largest ${equityRows(data).length} of 99`);
});
it.each(ids)("%s waits for data and settles after loading", async id => {
  let finish!: (data: ReturnType<typeof analyticsMfB>) => void;
  mocks.getAnalyticsScope.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = mount(id);
  expect(view.settled).not.toHaveBeenCalledWith(id, true);
  await act(async () => { finish(analyticsMfB()); });
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
});
it.each(ids)("%s prints a failed read in place and settles", async id => {
  mocks.getAnalyticsScope.mockRejectedValue(new Error("Invented failure"));
  const view = mount(id);
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
  expect(screen.getByRole("alert")).toHaveTextContent("This section failed to load, but the rest of the page is unaffected.");
  expectStatic(view.container);
  expect(mocks.retryAnalyticsScope).not.toHaveBeenCalled();
});
it("uses the selected member's bare holdings payload", async () => {
  mocks.getAnalyticsScope.mockResolvedValue(analyticsMfBMember());
  const view = mount(ids[1], "m1");
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(ids[1], true));
  expect(mocks.getAnalyticsScope).toHaveBeenCalledWith("m1");
  expect(screen.getAllByTestId(/^stock-row-/)).toHaveLength(equityRows(stockHoldings()).length);
});
