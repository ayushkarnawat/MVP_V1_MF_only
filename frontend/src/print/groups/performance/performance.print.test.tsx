import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analyticsStore } from "../../../features/mutual-funds/data/analyticsStore";
import * as fx from "../../../features/mutual-funds/fixtures";
import { analyticsMfB, analyticsMfBMember, benchmarkSummary, benchmarkSummaryWithoutWindows, fundBenchmark, investmentWithdrawal } from "../../../features/mutual-funds/fixtures/mfB";
import { comparisonFundsForWindow, fundDifference, INDEX_DEFS, signedXirr, WINDOW_DEFS, windowUnavailableText, windowView } from "../../../features/mutual-funds/performance/benchmarkLogic";
import { formatSignedPercent, formatSignedRupees, percentOf } from "../../../features/mutual-funds/mfCopy";
import type { HistoryPoint, XirrBundle } from "../../../features/mutual-funds/types";
import { formatPercent, formatRupees } from "../../../lib/format";
import { diffDecimalStrings } from "../../../lib/decimal";
import { PrintModeProvider } from "../../../lib/printMode";
import { ScopeContext } from "../../../shell/scope/ScopeContext";
import { PRINT_SECTIONS } from "../../sectionRegistry";
import { PrintSettledContext } from "../../usePrintSettled";
import { performancePrintSections } from "../performancePrint";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn(), getHoldingsBundle: vi.fn(), getHistoryPoints: vi.fn(), getMonthDetail: vi.fn() }));
vi.mock("../../../features/mutual-funds/api", () => mocks);
vi.mock("../../../features/auth/session", () => ({ getToken: () => "invented-print-token" }));
const ids = ["performance-returns", "performance-portfolio-history", "performance-benchmark-comparison"];
const xirr: XirrBundle = { lifetime: "0.1612", current: "0.1480", disclaimers: { lifetime: { alt_xirr: "0.1105", opening_cost_share: "0.3800" }, current: { alt_xirr: null, opening_cost_share: "0.2100" } } };
const points: HistoryPoint[] = [
  { month: "2024-12-31", value: 120000, invested: 100000, valueText: "120000.00", investedText: "100000.00", partial: false, missing: [] },
  { month: "2025-09-30", value: 150000, invested: 110000, valueText: "150000.00", investedText: "110000.00", partial: false, missing: [] },
  { month: "2025-12-31", value: 180000, invested: 120000, valueText: "180000.00", investedText: "120000.00", partial: false, missing: [] },
  { month: "2026-10-31", value: 210000, invested: 140000, valueText: "210000.00", investedText: "140000.00", partial: false, missing: [] },
];
function mount(id: string, memberId: string | null = null) {
  const settled = vi.fn<(id: string, ready: boolean) => void>();
  const view = render(<PrintModeProvider value={{ folios: "none", dataDates: true }}><ScopeContext.Provider value={{ viewMode: memberId ? "member" : "aggregate", memberId, members: [], scopeKey: memberId ? `member:${memberId}` : "aggregate", setMember: () => {}, setAggregate: () => {}, refreshMembers: () => {} }}><PrintSettledContext.Provider value={settled}>{PRINT_SECTIONS[id].render()}</PrintSettledContext.Provider></ScopeContext.Provider></PrintModeProvider>);
  return { ...view, settled };
}
function expectStatic(container: HTMLElement) {
  expect(container.querySelector('button,[role="button"],[title],[role="tooltip"],a')).toBeNull();
  expect(container.querySelector('[class*="overflow-x-auto"],[class*="max-h-"],[class*="truncate"]')).toBeNull();
  for (const element of container.querySelectorAll("*")) expect(["sticky", "fixed"]).not.toContain(getComputedStyle(element).position);
  for (const row of container.querySelectorAll("tr,li")) expect(row).toHaveStyle({ breakInside: "avoid" });
  for (const heading of container.querySelectorAll("h3,h4,h5")) expect(heading).toHaveStyle({ breakAfter: "avoid" });
  for (const table of container.querySelectorAll("table")) {
    expect(table).toHaveClass("w-full", "table-fixed");
    expect(table.querySelector("thead")).toHaveStyle({ display: "table-header-group" });
  }
}
beforeEach(() => {
  analyticsStore.invalidate(); Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.getAnalyticsScope.mockResolvedValue(analyticsMfB());
  mocks.getHistoryPoints.mockResolvedValue(points);
  mocks.getHoldingsBundle.mockResolvedValue({ holdings: fx.holdings().map(row => ({ ...row, current_nav_date: "2026-11-12" })), members: [], xirr, realized: null });
});
afterEach(() => { cleanup(); analyticsStore.invalidate(); });

it("registers every section of the group", async () => {
  expect(Object.keys(performancePrintSections).sort()).toEqual([...ids].sort());
  for (const id of ids) {
    const view = mount(id);
    await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
    expect(view.container.textContent).not.toContain("This section is not in the PDF yet.");
    expectStatic(view.container); view.unmount();
  }
  expect(mocks.retryAnalyticsScope).not.toHaveBeenCalled();
  expect(mocks.getMonthDetail).not.toHaveBeenCalled();
});
it("prints both XIRR bases, expanded disclaimers, absolute tiles and the complete fund table", async () => {
  mount(ids[0]);
  expect(await screen.findByTestId("xirr-value")).toHaveTextContent(signedXirr(xirr.lifetime));
  expect(screen.getByTestId("current-xirr-value")).toHaveTextContent(signedXirr(xirr.current));
  expect(screen.getByText("Current holdings")).toBeInTheDocument();
  expect(screen.getAllByTestId("disclaimer-panel")).toHaveLength(2);
  expect(screen.getByText(/Without the undated portion, the lifetime XIRR/)).toHaveTextContent("11.1%");
  expect(screen.getByText("There is not enough dated activity left to compute one.")).toBeInTheDocument();
  expect(screen.queryByText(/Tap to see why|Switch to Current Holdings above/)).toBeNull();
  const money = investmentWithdrawal();
  expect(screen.getByTestId("abs-invested")).toHaveTextContent(formatRupees(money.net_invested));
  expect(screen.getByTestId("abs-value")).toHaveTextContent(formatRupees(money.current_value));
  expect(screen.getByTestId("abs-gain")).toHaveTextContent(formatSignedRupees(money.absolute_gain));
  expect(screen.getByTestId("abs-return")).toHaveTextContent(formatSignedPercent(percentOf(money.absolute_gain, money.net_invested), 1));
  for (const fund of fundBenchmark().funds.filter(row => row.fund_xirr !== null)) expect(screen.getByTestId(`fxirr-${fund.scheme_id}`)).toHaveTextContent(signedXirr(fund.fund_xirr));
});
it("prints all eight indices and all four windows with the screen's XIRR and differences", async () => {
  mount(ids[2]);
  const table = await screen.findByRole("table", { name: "Portfolio vs Broad Market" });
  for (const index of INDEX_DEFS) expect(within(table).getByRole("columnheader", { name: index.label })).toBeInTheDocument();
  for (const window of WINDOW_DEFS) {
    const view = windowView(benchmarkSummary(), window.id);
    const row = screen.getByTestId(`benchmark-window-${window.id}`);
    expect(row).toHaveTextContent(window.label);
    if (!view.available) expect(row).toHaveTextContent(windowUnavailableText(view.reason));
    else {
      expect(within(row).getAllByRole("cell")[0]).toHaveTextContent(signedXirr(view.portfolio));
      INDEX_DEFS.forEach((index, i) => {
        const cell = within(row).getAllByRole("cell")[i + 1];
        expect(cell).toHaveTextContent(signedXirr(view.indices[index.key]));
        expect(cell).toHaveTextContent(formatSignedPercent(fundDifference({ fund: view.portfolio, benchmark: view.indices[index.key] ?? null }), 1));
      });
    }
  }
  for (const { fund, view } of comparisonFundsForWindow(fundBenchmark(), "SI")) {
    const row = screen.getByTestId(`benchmark-fund-${fund.scheme_id}`);
    expect(row).toHaveTextContent(fund.scheme_name);
    expect(row).toHaveTextContent(signedXirr(view.fund));
    expect(row).toHaveTextContent(signedXirr(view.benchmark));
    expect(row).toHaveTextContent(formatSignedPercent(fundDifference(view), 1));
  }
});
it("prints every declared fund and each distinct backend note once below the table", async () => {
  const data = analyticsMfB();
  const template = fundBenchmark().funds[0];
  const declared = Array.from({ length: 7 }, (_, i) => ({ scheme_id: `demo-${i}`, scheme_name: `Demo Held Fund ${i}`, source: "factsheet" as const, index_key: "nifty_500", declared_name: "Nifty 500 TRI", note: "Demo backend benchmark note.", mapping_age_days: 1, windows: [{ window: "SI" as const, start_date: "2020-01-01", fund_xirr: template.fund_xirr, benchmark_xirr: template.benchmark_xirr, reason: null }] }));
  data.sections.benchmark_funds!.payload = { members: [], comparison: { ...fundBenchmark(), declared_comparison: declared } };
  mocks.getAnalyticsScope.mockResolvedValue(data);
  mount(ids[2]);
  await screen.findByTestId("benchmark-fund-demo-6");
  expect(screen.getAllByTestId(/^benchmark-fund-/)).toHaveLength(7);
  expect(screen.getAllByText("Demo backend benchmark note.")).toHaveLength(1);
  for (const item of declared) expect(screen.getByTestId(`benchmark-fund-${item.scheme_id}`)).toHaveTextContent("Nifty 500 Total Return");
});
it("prints recomputing and opening-balance window sentences without controls", async () => {
  const data = analyticsMfB(); data.sections.benchmark!.payload = { members: [], benchmark: benchmarkSummaryWithoutWindows() };
  mocks.getAnalyticsScope.mockResolvedValue(data);
  const view = mount(ids[2]);
  expect(await screen.findAllByText(windowUnavailableText("recomputing"))).toHaveLength(3);
  view.unmount(); analyticsStore.invalidate();
  const summary = benchmarkSummary(); summary.windows = [{ window: "1Y", available: false, start_date: null, portfolio_xirr: null, indices: [], unavailable_reason: "opening_balance_in_window" }];
  data.sections.benchmark!.payload = { members: [], benchmark: summary }; mocks.getAnalyticsScope.mockResolvedValue(data);
  mount(ids[2]); expect(await screen.findByText(windowUnavailableText("opening_balance_in_window"))).toBeInTheDocument();
});
it("maps all history points to the static chart and year-end values to the supplied table", async () => {
  const view = mount(ids[1]);
  const chart = await screen.findByRole("img", { name: "Value over time" });
  expect(chart.querySelectorAll("polyline")).toHaveLength(2);
  expect(chart.querySelector('polyline[stroke="var(--pos)"]')?.getAttribute("points")?.split(" ")).toHaveLength(points.length);
  expect(chart.textContent).toContain("₹");
  expect(chart.querySelector("circle")).toBeNull();
  expect(screen.getByText("Portfolio value")).toBeInTheDocument(); expect(screen.getAllByText("Invested").length).toBeGreaterThan(0);
  const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
  for (const [i, point] of [points[0], points[2], points[3]].entries()) {
    expect(rows[i]).toHaveTextContent(formatRupees(point.valueText));
    expect(rows[i]).toHaveTextContent(formatRupees(point.investedText));
    const gain = diffDecimalStrings(point.valueText, point.investedText!);
    expect(rows[i]).toHaveTextContent(formatSignedRupees(gain));
    expect(rows[i]).toHaveTextContent(formatPercent(percentOf(gain, point.investedText!), { digits: 1, signed: true }));
  }
  expectStatic(view.container);
});
it("keeps the supplied history contract for a partial year and a solid invested line (the sample prints it solid)", async () => {
  mount(ids[1]);
  const chart = await screen.findByRole("img", { name: "Value over time" });
  expect(chart.querySelector('polyline[stroke="var(--ui-text-muted)"]')).not.toHaveAttribute("stroke-dasharray");
  expect(screen.getByText("2026 (to 12 Nov)")).toBeInTheDocument();
  expect(screen.queryByText("2024 (to 12 Nov)")).toBeNull();
});
it("recognises a December year end from the screen hook's full ISO date", async () => {
  mocks.getHistoryPoints.mockResolvedValue([{ ...points[3], month: "2026-12-31" }]);
  mocks.getHoldingsBundle.mockResolvedValue({ holdings: fx.holdings().map(row => ({ ...row, current_nav_date: "2026-12-31" })), members: [], xirr, realized: null });
  mount(ids[1]);
  const table = await screen.findByRole("table");
  expect(within(table).getByRole("cell", { name: /^2026$/ })).toBeInTheDocument();
  expect(within(table).queryByText("2026 (to 31 Dec)")).toBeNull();
});
it("prints null XIRR, empty history and unavailable declared funds without hiding them", async () => {
  mocks.getHoldingsBundle.mockResolvedValue({ holdings: [], members: [], xirr: { lifetime: null, current: null, disclaimers: { lifetime: null, current: null } }, realized: null });
  const returns = mount(ids[0]);
  expect(await screen.findAllByText("Insufficient Transaction History for XIRR")).toHaveLength(2);
  returns.unmount(); mocks.getHistoryPoints.mockResolvedValue([]);
  const history = mount(ids[1]); expect(await screen.findAllByText("No history yet")).toHaveLength(2); history.unmount();
  analyticsStore.invalidate();
  const data = analyticsMfB(); data.sections.benchmark_funds!.payload = { members: [], comparison: { ...fundBenchmark(), declared_comparison: [{ scheme_id: "demo-unavailable", scheme_name: "Demo Unavailable Fund", source: "none", index_key: null, declared_name: null, note: "Demo no fair benchmark.", mapping_age_days: null, windows: [] }] } };
  mocks.getAnalyticsScope.mockResolvedValue(data); mount(ids[2]);
  const row = await screen.findByTestId("benchmark-fund-demo-unavailable");
  expect(row).toHaveTextContent("No benchmark"); expect(within(row).getAllByText("—")).toHaveLength(3);
});
it.each(ids)("settles %s when its read fails and prints its failure sentence", async id => {
  mocks.getAnalyticsScope.mockRejectedValue(new Error("invented failure")); mocks.getHistoryPoints.mockRejectedValue(new Error("invented failure")); mocks.getHoldingsBundle.mockRejectedValue(new Error("invented failure"));
  const view = mount(id);
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
  expect(screen.getByText(id === ids[0] ? "Couldn't load XIRR" : id === ids[1] ? "History couldn't be loaded. Please try again." : "Couldn't load the benchmark comparison.")).toBeInTheDocument();
  expect(screen.getAllByRole("alert").length).toBeGreaterThan(0); expectStatic(view.container);
});
it("settles analytics failures returned by the server without retry buttons", async () => {
  const data = analyticsMfB();
  for (const name of ["benchmark", "benchmark_funds", "investment_withdrawal"] as const) data.sections[name] = { ...data.sections[name]!, payload: null, failed_at: "2026-11-24T00:00:00Z" };
  mocks.getAnalyticsScope.mockResolvedValue(data);
  for (const id of [ids[0], ids[2]]) {
    const view = mount(id); await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0); expectStatic(view.container); view.unmount();
  }
});
it.each(ids)("does not settle %s while its reads remain pending", (id) => {
  const pending = new Promise<never>(() => {});
  mocks.getAnalyticsScope.mockReturnValue(pending); mocks.getHistoryPoints.mockReturnValue(pending); mocks.getHoldingsBundle.mockReturnValue(pending);
  const view = mount(id); expect(view.settled).not.toHaveBeenCalledWith(id, true); expect(view.container.textContent).toBe("");
});
it("uses member scope for the same hooks without screen state or month-detail reads", async () => {
  mocks.getAnalyticsScope.mockResolvedValue(analyticsMfBMember());
  for (const id of ids) { const view = mount(id, "m1"); await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true)); view.unmount(); }
  expect(mocks.getHoldingsBundle.mock.calls[0][0]).toEqual({ viewMode: "member", memberId: "m1" });
  expect(mocks.getHistoryPoints.mock.calls[0][0]).toEqual({ viewMode: "member", memberId: "m1" });
  expect(mocks.getAnalyticsScope.mock.calls[0][0]).toBe("m1"); expect(mocks.getMonthDetail).not.toHaveBeenCalled();
});
