import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analyticsMfC, analyticsMfCMember, overlapSummary, stockHoldings } from "../../../features/mutual-funds/fixtures/mfC";
import { analyticsStore } from "../../../features/mutual-funds/data/analyticsStore";
import { CommonHoldings } from "../../../features/mutual-funds/overlap/CommonHoldings";
import { TopPairs } from "../../../features/mutual-funds/overlap/TopPairs";
import { buildOverlapInsights, commonStocks, equityStockHoldings, highestPair, impactBreakdown, inclusivePairs, pairKeyOf } from "../../../features/mutual-funds/overlap/overlapLogic";
import { formatPercent, formatRupees } from "../../../lib/format";
import { PrintModeProvider } from "../../../lib/printMode";
import { ScopeContext } from "../../../shell/scope/ScopeContext";
import { PRINT_SECTIONS } from "../../sectionRegistry";
import { PrintSettledContext } from "../../usePrintSettled";
import { overlapPrintSections } from "../overlapPrint";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../../features/mutual-funds/api", () => mocks);
vi.mock("../../../features/auth/session", () => ({ getToken: () => "invented-print-token" }));
const ids = ["overlap-common-holdings", "overlap-heatmap", "overlap-top-pairs", "overlap-impact"];
function sample() {
  const summary = overlapSummary();
  summary.excluded_funds = [{ name: "Demo Excluded Fund", reason: "No published holdings" }];
  const top = highestPair(summary)!;
  summary.impact_pairs = [{ fund_a: top.fund_a, fund_b: top.fund_b, overlap_pct: top.overlap_pct, drivers: [{ isin: "DEMO-STOCK", instrument_name: "Demo Shared Company", contribution_pct: "5.00", share_of_pair_pct: "10.00" }] }];
  return summary;
}
function response() { const data = analyticsMfC(); data.sections.overlap!.payload = { members: [], overlap: sample() }; return data; }
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
  expect(container.querySelector('button,[role="button"],[title],[data-tooltip],a')).toBeNull();
  expect(container.querySelector('[class*="overflow-x-auto"],[class*="overflow-y-auto"],[class*="max-h-"],[class*="truncate"]')).toBeNull();
  for (const element of container.querySelectorAll("*")) expect(["sticky", "fixed"]).not.toContain(getComputedStyle(element).position);
  for (const heading of container.querySelectorAll("h3,h4,h5")) expect(heading).toHaveStyle({ breakAfter: "avoid" });
  for (const row of container.querySelectorAll("tr,li")) expect(row).toHaveStyle({ breakInside: "avoid" });
  for (const table of container.querySelectorAll("table")) {
    expect(table).toHaveClass("w-full", "table-fixed");
    if (table.querySelector("thead")) expect(table.querySelector("thead")).toHaveStyle({ display: "table-header-group" });
  }
}
beforeEach(() => { analyticsStore.invalidate(); Object.values(mocks).forEach(mock => mock.mockReset()); mocks.getAnalyticsScope.mockResolvedValue(response()); });
afterEach(() => { cleanup(); analyticsStore.invalidate(); });

it("registers every section of the group", async () => {
  expect(Object.keys(overlapPrintSections).sort()).toEqual([...ids].sort());
  for (const id of ids) {
    const view = mount(id);
    await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
    expect(view.container.textContent).not.toContain("This section is not in the PDF yet.");
    expect(screen.getByText("All funds")).toBeInTheDocument();
    expect(screen.getByLabelText("Funds not shown")).toHaveTextContent("Demo Excluded Fund: No published holdings");
    expect(screen.getByLabelText("Portfolio disclosure coverage")).toHaveTextContent("Based on");
    expect(screen.queryByTestId("stat-strip")).toBeNull();
    expectStatic(view.container);
    view.unmount();
  }
  expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  expect(mocks.retryAnalyticsScope).not.toHaveBeenCalled();
});
it("prints every common holding and every full fund name with the screen's exposure", async () => {
  mount(ids[0]);
  await screen.findByRole("table", { name: "Common holdings" });
  const common = commonStocks(equityStockHoldings(stockHoldings(), sample()));
  expect(common.length).toBeGreaterThan(10);
  expect(screen.getAllByTestId(/^common-row-/)).toHaveLength(common.length);
  for (const item of common) {
    const row = screen.getByTestId(`common-row-${item.key}`);
    expect(row).toHaveTextContent(item.row.instrument_name);
    expect(row).toHaveTextContent(formatPercent(item.row.exposure_pct, { digits: 2 }));
    for (const fund of item.funds) expect(row).toHaveTextContent(fund.scheme_name);
  }
});
it("lists more than three funds in a common holding without a +N chip", () => {
  const data = stockHoldings();
  const row = data.rows.find(item => item.contributing_funds.length > 1)!;
  row.contributing_funds = Array.from({ length: 5 }, (_, index) => ({ ...row.contributing_funds[0], scheme_id: `DEMO-${index}`, scheme_name: `Demo Full Fund ${index}` }));
  data.rows = [row];
  const view = render(<PrintModeProvider value={{ folios: "none", dataDates: false }}><CommonHoldings state="ready" data={data} onRetry={() => {}} /></PrintModeProvider>);
  for (const fund of row.contributing_funds) expect(view.container).toHaveTextContent(fund.scheme_name);
  expect(view.container.textContent).not.toMatch(/\+\d/);
  expect(view.container.querySelector("button,[title]")).toBeNull();
});
it("maps the heatmap funds and matrix and prints the same strongest pair's stocks", async () => {
  mount(ids[1]);
  const table = await screen.findByRole("table", { name: "Pairwise overlap (%)" });
  const summary = sample();
  for (const fund of summary.matrix_funds) expect(table).toHaveTextContent(fund.scheme_name);
  for (const pair of summary.matrix) expect(screen.getByTestId(`print-hm-cell-${pair.fund_a.scheme_id}-${pair.fund_b.scheme_id}`)).toHaveTextContent(formatPercent(pair.overlap_pct, { digits: 0 }));
  const top = highestPair(summary)!;
  expect(screen.getByText(`${top.fund_a.scheme_name} × ${top.fund_b.scheme_name} — shared holdings`)).toBeInTheDocument();
  for (const stock of top.common_stocks) expect(screen.getByText(stock.instrument_name)).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Overlap bands" })).toBeInTheDocument();
});
it("prints all available top pairs and unchanged key insights", async () => {
  mount(ids[2]);
  await screen.findByRole("table", { name: "Top overlapping fund pairs" });
  const data = sample();
  expect(screen.getAllByTestId(/^pair-row-/)).toHaveLength(Math.min(15, inclusivePairs(data).length));
  for (const pair of inclusivePairs(data).slice(0, 15)) {
    const row = screen.getByTestId(`pair-row-${pairKeyOf(pair)}`);
    expect(row).toHaveTextContent(pair.fund_a.scheme_name);
    expect(row).toHaveTextContent(pair.fund_b.scheme_name);
    expect(row).toHaveTextContent(formatPercent(pair.overlap_pct, { digits: 0 }));
  }
  for (const sentence of buildOverlapInsights(data)) expect(screen.getByTestId("key-insights")).toHaveTextContent(sentence);
});
it("caps top pairs at fifteen with a showing note and ignores the page query", () => {
  const data = sample(); const template = data.matrix[0];
  const funds = Array.from({ length: 7 }, (_, index) => ({ scheme_id: `DEMO-${index}`, scheme_name: `Demo Full Fund Name ${index}`, current_value: "100.00" }));
  data.pairs_above_low = funds.flatMap((fund, index) => funds.slice(index + 1).map(other => ({ ...template, fund_a: fund, fund_b: other, overlap_pct: "50.00" })));
  data.pairs_at_low_boundary = [];
  const view = render(<PrintModeProvider value={{ folios: "none", dataDates: false }}><TopPairs state="ready" data={data} onRetry={() => {}} selectedKey={pairKeyOf(data.pairs_above_low[0])} onSelect={() => {}} query="no matching pair" /></PrintModeProvider>);
  expect(screen.getAllByTestId(/^pair-row-/)).toHaveLength(15);
  expect(screen.getByText("Showing 15 of 21 fund pairs.")).toBeInTheDocument();
  expect(view.container.querySelector("button,a,[class*=truncate]")).toBeNull();
});
it("prints the impact donut flat with the portfolio total and every driver", async () => {
  mount(ids[3]);
  await screen.findByTestId("legend-top3");
  const data = sample();
  for (const item of impactBreakdown(data)) {
    const row = screen.getByTestId(`legend-${item.key}`);
    expect(row).toHaveTextContent(formatPercent(item.pct, { digits: 1 }));
    expect(row).toHaveTextContent(formatRupees(item.value));
  }
  for (const slice of document.querySelectorAll('[data-testid^="slice-"]')) {
    expect(slice).toHaveAttribute("data-selected", "false");
    expect(slice).toHaveAttribute("data-popped", "false");
  }
  expect(screen.getByTestId("donut-centre-label")).toHaveTextContent("Portfolio");
  expect(screen.getByTestId("donut-centre-value")).toHaveTextContent(formatRupees(data.total_portfolio_value));
  expect(screen.getByLabelText("What drives the overlap")).toHaveTextContent("Demo Shared Company");
  for (const pair of data.impact_pairs ?? []) for (const stock of pair.drivers) {
    expect(screen.getByLabelText("What drives the overlap")).toHaveTextContent(`${formatPercent(stock.contribution_pct, { digits: 2 })} of net assets · ${formatPercent(stock.share_of_pair_pct, { digits: 1 })} of the overlap`);
  }
});
it.each(ids)("%s waits for loaded data and reports settled", async id => {
  let finish!: (data: ReturnType<typeof response>) => void;
  mocks.getAnalyticsScope.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = mount(id);
  expect(view.settled).not.toHaveBeenCalledWith(id, true);
  await act(async () => { finish(response()); });
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
});
it.each(ids)("%s prints a failed read in place and reports settled", async id => {
  mocks.getAnalyticsScope.mockRejectedValue(new Error("Invented failure"));
  const view = mount(id);
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
  expect(screen.getByRole("alert")).toHaveTextContent("This section failed to load, but the rest of the page is unaffected.");
  expectStatic(view.container);
});
it.each(["overlap", "stock_holdings"] as const)("common holdings waits for %s and settles its stored failure", async name => {
  const data = response();
  data.sections[name] = { payload: null, computed_at: null, failed_at: null };
  mocks.getAnalyticsScope.mockResolvedValue(data);
  const view = mount(ids[0]);
  await waitFor(() => expect(mocks.getAnalyticsScope).toHaveBeenCalled());
  expect(view.settled).not.toHaveBeenCalledWith(ids[0], true);
  data.sections[name] = { payload: null, computed_at: null, failed_at: "2026-11-24T00:00:00Z" };
  await act(async () => { await analyticsStore.refresh("combined"); });
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(ids[0], true));
  expect(screen.getByRole("alert")).toHaveTextContent("This section failed to load");
});
it("reads member payloads and settles an empty comparison", async () => {
  const data = analyticsMfCMember();
  const summary = sample(); summary.matrix_funds = []; summary.total_fund_count = 0;
  data.sections.overlap!.payload = { ...summary };
  mocks.getAnalyticsScope.mockResolvedValue(data);
  const view = mount(ids[1], "m1");
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(ids[1], true));
  expect(screen.getByText("No equity funds to compare.")).toBeInTheDocument();
  expect(mocks.getAnalyticsScope).toHaveBeenCalledWith("m1");
});
