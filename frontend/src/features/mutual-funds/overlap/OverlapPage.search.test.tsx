import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageFilterSource } from "../../../components/search/searchResultTypes";
import { ImportContext, ScopeContext } from "../../../shell/scope/ScopeContext";
import type { ScopeValue } from "../../../shell/scope/scopeTypes";
import { analyticsStore } from "../data/analyticsStore";
import * as fc from "../fixtures/mfC";
import type { OverlapCommonStock, OverlapPair, OverlapSummary } from "../types";
import { CommonHoldings } from "./CommonHoldings";
import { Heatmap } from "./Heatmap";
import { ImpactDonut } from "./ImpactDonut";
import { equityStockHoldings } from "./overlapLogic";
import { StatStrip } from "./StatStrip";
import { TopPairs } from "./TopPairs";
import OverlapPage from "./OverlapPage";

const api = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
const searchProps = vi.hoisted(() => vi.fn());
vi.mock("../api", () => api);
vi.mock("../../auth/session", () => ({ getToken: () => "example-session" }));
vi.mock("../../../components/search/PageSearch", () => ({
  PageSearch: (props: PageFilterSource & { userId: string | null }) => {
    searchProps(props);
    const { pageKey, noun, total, matched, chipsAllowed } = props;
    return <div data-testid="page-search-stub" data-page-key={pageKey} data-noun={noun}
      data-total={total} data-matched={matched} data-chips-allowed={JSON.stringify(chipsAllowed)} />;
  },
}));

const stocks: OverlapCommonStock[] = [
  { isin: "INE000000001", instrument_name: "Example Motors", weight_a: "5.00", weight_b: "4.00" },
  { isin: "INE000000002", instrument_name: "Orchid Bank", weight_a: "3.00", weight_b: "2.00" },
];
const growth = { scheme_id: "growth", scheme_name: "Example Growth Fund", current_value: "1000.00" };
const income = { scheme_id: "income", scheme_name: "Example Income Fund", current_value: "2000.00" };
const reserve = { scheme_id: "reserve", scheme_name: "Example Reserve Fund", current_value: "3000.00" };
const pairs: OverlapPair[] = [
  { fund_a: growth, fund_b: income, overlap_pct: "60.00", common_stocks: stocks, common_total: 2 },
  { fund_a: income, fund_b: reserve, overlap_pct: "40.00", common_stocks: [stocks[1]], common_total: 1 },
];
const overlap: OverlapSummary = { ...fc.overlapSummary(), equity_funds: [growth, income, reserve],
  matrix_funds: [growth, income, reserve], matrix: [...pairs,
    { fund_a: growth, fund_b: reserve, overlap_pct: "0.00", common_stocks: [], common_total: 0 }],
  pairs_above_low: pairs, pairs_at_low_boundary: [], impact_pairs: null,
  total_fund_count: 3, matrix_truncated: false, by_category: undefined, excluded_funds: [],
};
const stockSummary = fc.stockHoldings();
const commonData = equityStockHoldings(stockSummary, overlap);
const scope: ScopeValue = { viewMode: "aggregate", memberId: null, scopeKey: "aggregate",
  members: [{ id: "asha", name: "Asha" }, { id: "bela", name: "Bela" }], userId: "example-user",
  setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn(),
};
function mount(search = "", children: ReactNode = <OverlapPage />) {
  return render(<MemoryRouter initialEntries={[`/portfolio/mutual-funds/overlap${search}`]}>
    <ScopeContext.Provider value={scope}><ImportContext.Provider value={{ openImport: vi.fn() }}>
      {children}
    </ImportContext.Provider></ScopeContext.Provider>
  </MemoryRouter>);
}
const ready = () => screen.findByTestId("pair-row-growth~income");
const pairRows = () => screen.queryAllByTestId(/^pair-row-/).map(row => row.textContent);
const sharedRows = () => screen.queryAllByTestId(/^shared-/).map(row => row.textContent);
const heatmap = () => screen.getByRole("table", { name: "Overlap heatmap" });

beforeEach(() => {
  vi.clearAllMocks();
  analyticsStore.invalidate();
  const response = fc.analyticsMfC();
  response.sections.overlap = { payload: { overlap }, computed_at: "2026-11-23T00:00:00Z", failed_at: null };
  response.sections.stock_holdings = { payload: { stock_holdings: stockSummary },
    computed_at: "2026-11-23T00:00:00Z", failed_at: null };
  api.getAnalyticsScope.mockResolvedValue(response);
});
afterEach(() => { cleanup(); analyticsStore.invalidate(); });

describe("OverlapPage search", () => {
  it("the box gets pageKey overlap, noun pairs", async () => {
    mount();
    await ready();
    const box = screen.getByTestId("page-search-stub");
    expect(box).toHaveAttribute("data-page-key", "overlap");
    expect(box).toHaveAttribute("data-noun", "pairs");
    expect(box).toHaveAttribute("data-chips-allowed", "[]");
    expect(searchProps).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "example-user" }));
    expect(within(screen.getByRole("navigation", { name: "Mutual Funds sections" }).parentElement!)
      .getByTestId("page-search-stub")).toBe(box);
  });

  it("total and matched count pairs", async () => {
    mount("?q=growth");
    await ready();
    expect(screen.getByTestId("page-search-stub")).toHaveAttribute("data-total", "2");
    expect(screen.getByTestId("page-search-stub")).toHaveAttribute("data-matched", "1");
    expect(pairRows()).toHaveLength(1);
  });

  it("?q= filters the top pairs", async () => {
    mount("?q=growth");
    await ready();
    expect(screen.queryByTestId("pair-row-income~reserve")).not.toBeInTheDocument();
    expect(screen.getByTestId("pair-row-growth~income")).toHaveTextContent("Example Growth Fund");
  });

  it("?q= filters the common stocks of the open pair", async () => {
    mount("?q=motors");
    await ready();
    fireEvent.click(screen.getByTestId("cell-growth-income"));
    const detail = screen.getByTestId("pair-detail");
    expect(within(detail).getByTestId("shared-INE000000001")).toHaveTextContent("Example Motors");
    expect(within(detail).queryByTestId("shared-INE000000002")).not.toBeInTheDocument();
  });

  it("the heatmap is unchanged with ?q=", async () => {
    const baseline = mount();
    await ready();
    const expected = heatmap().innerHTML;
    const stats = screen.getByTestId("card-stat-strip").textContent;
    const impact = screen.getByTestId("card-impact").textContent;
    baseline.unmount();
    mount("?q=growth");
    await ready();
    expect(heatmap().innerHTML).toBe(expected);
    expect(screen.getByTestId("card-stat-strip").textContent).toBe(stats);
    expect(screen.getByTestId("card-impact").textContent).toBe(impact);
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
  });

  it("with no q the page is exactly as before", async () => {
    const baseline = mount("", <>
      <StatStrip summary={overlap} />
      <CommonHoldings state="ready" data={commonData} onRetry={vi.fn()} />
      <Heatmap state="ready" data={overlap} onRetry={vi.fn()} selectedKey="growth~income" onSelect={vi.fn()} />
      <TopPairs state="ready" data={overlap} onRetry={vi.fn()} selectedKey="growth~income" onSelect={vi.fn()} />
      <ImpactDonut state="ready" data={overlap} onRetry={vi.fn()} />
    </>);
    const expectedPairs = pairRows();
    const expectedStocks = sharedRows();
    const expectedHeatmap = heatmap().textContent;
    expect(expectedPairs).toHaveLength(2);
    expect(expectedStocks).toHaveLength(2);
    baseline.unmount();
    mount();
    await ready();
    expect(pairRows()).toEqual(expectedPairs);
    expect(sharedRows()).toEqual(expectedStocks);
    expect(heatmap().textContent).toBe(expectedHeatmap);
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
  });
});
