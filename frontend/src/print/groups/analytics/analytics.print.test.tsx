import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { analyticsMfC, analyticsMfCMember } from "../../../features/mutual-funds/fixtures/mfC";
import { categoryRanking, fundRanking, terSummary, valuationSummary } from "../../../features/mutual-funds/fixtures/mfCother";
import { analyticsStore } from "../../../features/mutual-funds/data/analyticsStore";
import { CategoryRankingBody } from "../../../features/mutual-funds/other/CategoryRankingGroup";
import { TerLadder } from "../../../features/mutual-funds/other/TerLadder";
import { ValuationByFund } from "../../../features/mutual-funds/other/ValuationByFund";
import { categoryComparisonSummary, periodsFor, ratioText, rawPercent, terText } from "../../../features/mutual-funds/other/otherLogic";
import type { AnalyticsSectionName, ValuationValue } from "../../../features/mutual-funds/types";
import { formatDataDate } from "../../../lib/dataDates";
import { PrintModeProvider } from "../../../lib/printMode";
import { ScopeContext } from "../../../shell/scope/ScopeContext";
import { PRINT_SECTIONS } from "../../sectionRegistry";
import { PrintSettledContext } from "../../usePrintSettled";
import { analyticsPrintSections } from "../analyticsPrint";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../../features/mutual-funds/api", () => mocks);
vi.mock("../../../features/auth/session", () => ({ getToken: () => "invented-print-token" }));

const ids = ["analytics-cost", "analytics-category", "analytics-ranking"];
function sampleValuation() {
  const data = valuationSummary();
  const value = (ratio: string): ValuationValue => ({ value: ratio, source: "computed", as_of: "2026-10-12", basis: "trailing", method: "harmonic", coverage_pct: "100", reason: null });
  data.funds = [
    { scheme_id: "DEMO-A", scheme_name: "Demo Equity Fund", pe: value("30.6"), pb: value("4.65") },
    { scheme_id: "DEMO-B", scheme_name: "Example Equity Fund", pe: value("21.9"), pb: value("3.6") },
  ];
  data.pe.overseas = [{ isin: "DEMO-OVERSEAS", instrument_name: "Demo Overseas Company", exposure_value: "100", percentage_equity: "2", reason: "No local ratio available" }];
  data.coverage.funds[0].age_tag = "older_than_60_days";
  return data;
}
function response() {
  const data = analyticsMfC();
  data.sections.valuation!.payload = { members: [], valuation: sampleValuation() };
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
  expect(container.querySelector('button, [role="button"], [title], [data-tooltip]')).toBeNull();
  expect(container.querySelector('[class*="overflow-x-auto"], [class*="overflow-y-auto"], [class*="min-w-[640px]"]')).toBeNull();
  for (const element of container.querySelectorAll("*")) {
    expect(element.className.toString().split(/\s+/)).not.toEqual(expect.arrayContaining(["sticky"]));
    expect(element.className.toString().split(/\s+/)).not.toEqual(expect.arrayContaining(["fixed"]));
    expect(["sticky", "fixed"]).not.toContain(getComputedStyle(element).position);
  }
  for (const heading of container.querySelectorAll("h2, h3, h4, h5")) expect(heading).toHaveStyle({ breakAfter: "avoid" });
  for (const table of container.querySelectorAll("table")) {
    expect(table).toHaveClass("w-full", "table-fixed");
    expect(table.querySelector("thead")).toHaveStyle({ display: "table-header-group" });
    for (const row of table.querySelectorAll("tr")) expect(row).toHaveStyle({ breakInside: "avoid" });
  }
  for (const item of container.querySelectorAll("li")) expect(item).toHaveStyle({ breakInside: "avoid" });
}
beforeEach(() => {
  analyticsStore.invalidate();
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.getAnalyticsScope.mockResolvedValue(response());
});
afterEach(() => { cleanup(); analyticsStore.invalidate(); vi.restoreAllMocks(); });

it("registers every section of the group", async () => {
  expect(Object.keys(analyticsPrintSections).sort()).toEqual([...ids].sort());
  for (const id of ids) {
    const view = mount(id);
    await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
    expect(view.container.textContent).not.toContain("This section is not in the PDF yet.");
    expect(view.container.textContent).not.toContain("Fund Quality Scores");
    expectStatic(view.container);
    view.unmount();
  }
});
it("prints every TER fund's returns and the default valuation spectrum", async () => {
  mount("analytics-cost");
  await screen.findByTestId("ter-weighted");
  expect(screen.getByText("Each fund's 1Y/3Y/5Y returns are shown.")).toBeInTheDocument();
  for (const fund of terSummary().funds ?? []) {
    const detail = screen.getByTestId(`ladder-detail-${fund.scheme_id}`);
    const periods = periodsFor(categoryRanking(), fund.scheme_id);
    if (periods) for (const period of ["1y", "3y", "5y"] as const) expect(within(detail).getByTestId(`ladder-return-${fund.scheme_id}-${period}`)).toHaveTextContent(rawPercent(periods[period]?.fund_return));
    else expect(detail).toHaveTextContent("No return data on file for this fund.");
  }
  expect(screen.getByTestId("ter-weighted")).toHaveTextContent(terText(terSummary().weighted_ter));
  expect(screen.getByTestId("spectrum-pe")).toBeInTheDocument();
  expect(screen.getByTestId("spectrum-pb")).toBeInTheDocument();
  expect(screen.queryByTestId("vbar-pe-portfolio")).toBeNull();
  expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  expect(mocks.retryAnalyticsScope).not.toHaveBeenCalled();
});
it("prints the two stock lists, average explanation, source text and Nifty 500 figures", async () => {
  mount("analytics-cost");
  const card = await screen.findByRole("region", { name: "Valuation by Fund" });
  const data = sampleValuation();
  for (const metric of [data.pe, data.pb]) for (const stock of metric.missing) expect(within(card).getByText(stock.instrument_name)).toBeInTheDocument();
  expect(within(card).getByText("Demo Overseas Company")).toBeInTheDocument();
  expect(within(card).getByText(/earnings or book value behind each rupee/)).toBeInTheDocument();
  const index = data.indices.find(row => row.index_name === "nifty_500")!;
  expect(within(card).getByText(`Nifty 500 P/E ${ratioText(index.pe_ratio)} · P/B ${ratioText(index.pb_ratio)}`)).toBeInTheDocument();
  for (const fund of data.funds!) {
    const row = within(card).getByRole("row", { name: new RegExp(fund.scheme_name) });
    expect(row).toHaveTextContent(ratioText(fund.pe.value));
    expect(row).toHaveTextContent(ratioText(fund.pb.value));
    expect(row).toHaveTextContent("Worked out from the fund's published holdings.");
  }
});
it("prints all category cards and the unchanged summary without chips", async () => {
  const view = mount("analytics-category");
  await screen.findByTestId("category-summary");
  const data = categoryRanking();
  expect(screen.getByTestId("category-summary")).toHaveTextContent(categoryComparisonSummary(data));
  for (const fund of data.funds) expect(screen.getByTestId(`cat-row-${fund.scheme_id}`)).toHaveTextContent(fund.scheme_name);
  expect(screen.getByRole("list", { name: "Category comparisons" })).not.toHaveClass("lg:grid-cols-2");
  expectStatic(view.container);
});
it("prints every ranking row, period, rank and total without a scroll wrapper", async () => {
  const view = mount("analytics-ranking");
  await screen.findByRole("table", { name: "Performance rankings" });
  for (const fund of fundRanking().funds) {
    expect(screen.getByTestId(`performance-row-${fund.scheme_id}`)).toHaveTextContent(fund.scheme_name);
    for (const period of ["1Y", "3Y", "5Y"] as const) {
      const value = fund.periods?.[period];
      if (value?.status === "ranked" && value.rank !== null && value.total > 0) {
        expect(screen.getByTestId(`rank-number-${fund.scheme_id}-${period}`)).toHaveTextContent(String(value.rank));
        expect(screen.getByTestId(`rank-total-${fund.scheme_id}-${period}`)).toHaveTextContent(`/${value.total}`);
      }
    }
  }
  for (const name of ["1 year", "3 years", "5 years"]) expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
  expectStatic(view.container);
});
it.each(ids)("%s waits for loaded data before reporting settled", async id => {
  let finish!: (data: ReturnType<typeof response>) => void;
  mocks.getAnalyticsScope.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = mount(id);
  expect(view.settled).toHaveBeenCalledWith(id, false);
  expect(view.settled).not.toHaveBeenCalledWith(id, true);
  await act(async () => { finish(response()); });
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
});
it.each(ids)("%s prints its failure sentence and reports settled on a read failure", async id => {
  mocks.getAnalyticsScope.mockRejectedValue(new Error("Invented read failure"));
  const view = mount(id);
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith(id, true));
  expect(screen.getAllByRole("alert")[0]).toHaveTextContent("This section failed to load, but the rest of the page is unaffected.");
  expectStatic(view.container);
  expect(mocks.retryAnalyticsScope).not.toHaveBeenCalled();
});
it.each(["ter", "ter_direct_regular", "category_ranking", "valuation"] as const)("cost waits for %s and settles when that section fails", async (name: AnalyticsSectionName) => {
  const data = response();
  data.sections[name] = { payload: null, computed_at: null, failed_at: null };
  mocks.getAnalyticsScope.mockResolvedValue(data);
  const view = mount("analytics-cost");
  await waitFor(() => expect(mocks.getAnalyticsScope).toHaveBeenCalled());
  expect(view.settled).not.toHaveBeenCalledWith("analytics-cost", true);
  data.sections[name] = { payload: null, computed_at: null, failed_at: "2026-11-24T00:00:00Z" };
  await act(async () => { await analyticsStore.refresh("combined"); });
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith("analytics-cost", true));
});
it("prints cost data dates and older holdings through the screen helpers", async () => {
  mount("analytics-cost");
  const footer = await screen.findByTestId("analytics-cost-dates");
  const data = sampleValuation();
  for (const text of [formatDataDate("prices", data.nav_as_of), formatDataDate("holdings", data.holdings_as_of), formatDataDate("ratios", data.pe.as_of_date), formatDataDate("fees", terSummary().reference_period)]) expect(footer).toHaveTextContent(text);
  expect(footer).toHaveTextContent("1 fund has older holdings");
  expect(footer).toHaveTextContent(data.coverage.funds[0].scheme_name);
});
it("omits the cost date footer when data dates are off", async () => {
  const view = mount("analytics-cost", false);
  await waitFor(() => expect(view.settled).toHaveBeenCalledWith("analytics-cost", true));
  expect(screen.queryByTestId("analytics-cost-dates")).toBeNull();
});
it("uses the selected member's bare analytics payload", async () => {
  mocks.getAnalyticsScope.mockResolvedValue(analyticsMfCMember());
  const view = mount("analytics-ranking", true, "m1");
  await screen.findByTestId("performance-row-S-KOTAK");
  expect(mocks.getAnalyticsScope).toHaveBeenCalledWith("m1");
  expect(view.settled).toHaveBeenCalledWith("analytics-ranking", true);
});
it("print branches ignore query while screen controls remain available outside print mode", () => {
  const data = sampleValuation();
  const view = render(<><TerLadder ter={terSummary()} comparison={null} ranking={categoryRanking()} /><ValuationByFund data={data} /><CategoryRankingBody data={categoryRanking()} /></>);
  fireEvent.click(screen.getByTestId("ladder-toggle-S-KOTAK"));
  fireEvent.click(screen.getByRole("button", { name: "Behind somewhere" }));
  view.rerender(<PrintModeProvider value={{ folios: "none", dataDates: true }}><TerLadder ter={terSummary()} comparison={null} ranking={categoryRanking()} query="no matching fund" /><ValuationByFund data={data} query="no matching fund" /><CategoryRankingBody data={categoryRanking()} query="no matching fund" /></PrintModeProvider>);
  expect(screen.getAllByTestId(/^ladder-detail-/)).toHaveLength((terSummary().funds ?? []).length);
  expect(screen.getAllByTestId(/^cat-row-/)).toHaveLength(categoryRanking().funds.length);
  expect(screen.getByText("Demo Equity Fund")).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
});
