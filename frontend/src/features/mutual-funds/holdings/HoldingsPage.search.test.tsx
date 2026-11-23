import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { PageFilterSource } from "../../../components/search/searchResultTypes";
import { ImportContext, ScopeContext } from "../../../shell/scope/ScopeContext";
import type { ScopeValue } from "../../../shell/scope/scopeTypes";
import { analyticsStore } from "../data/analyticsStore";
import type { StockHoldingRow, StockHoldingsSummary } from "../types";
import { AllStocksTable } from "./AllStocksTable";
import { TopHoldingsByFund } from "./TopHoldingsByFund";
import HoldingsPage from "./HoldingsPage";

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

const stocks: StockHoldingRow[] = [
  { isin: "INE000000001", instrument_name: "Example Motors", sector_raw: "Automobiles",
    asset_type: "equity_domestic", exposure_pct: "5.00", exposure_value: "5000.00",
    contributing_funds: [{ scheme_id: "growth", scheme_name: "Example Growth Fund",
      holdings_as_of: "2026-10-31", cadence: "monthly", age_tag: null,
      fund_weight_pct: "100.00", stock_weight_pct: "5.00" }] },
  { isin: "INE000000002", instrument_name: "Orchid Bank", sector_raw: "Banking",
    asset_type: "equity_domestic", exposure_pct: "3.00", exposure_value: "3000.00",
    contributing_funds: [{ scheme_id: "growth", scheme_name: "Example Growth Fund",
      holdings_as_of: "2026-10-31", cadence: "monthly", age_tag: null,
      fund_weight_pct: "100.00", stock_weight_pct: "3.00" }] },
];
function summary(truncated = false): StockHoldingsSummary {
  return { rows: stocks, nav_as_of: "2026-11-20", holdings_as_of: "2026-10-31",
    total_portfolio_value: "100000.00", truncated, total_stock_count: truncated ? 240 : 2,
    coverage: { covered_value_pct: "100.00", not_published_yet: [], not_available_from_amc: [],
      missing_value_schemes: [], funds: [] }, hide_headlines: false, excluded_share: "0.00", non_equity_share: "0.00" };
}
const scope: ScopeValue = { viewMode: "aggregate", memberId: null, scopeKey: "aggregate",
  members: [{ id: "asha", name: "Asha" }, { id: "bela", name: "Bela" }], userId: "example-user",
  setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn(),
};
function mount(search = "", children: ReactNode = <HoldingsPage />) {
  return render(<MemoryRouter initialEntries={[`/portfolio/mutual-funds/holdings${search}`]}>
    <ScopeContext.Provider value={scope}><ImportContext.Provider value={{ openImport: vi.fn() }}>
      {children}
    </ImportContext.Provider></ScopeContext.Provider>
  </MemoryRouter>);
}
function response(data: StockHoldingsSummary) {
  return { scope: "combined", recomputing: false, sections: {
    stock_holdings: { payload: { members: [], stock_holdings: data }, computed_at: "2026-11-23T00:00:00Z", failed_at: null },
  } };
}
const ready = () => screen.findByRole("table", { name: "All stock holdings" });
const stockRows = () => screen.queryAllByTestId(/^stock-row-/).map(row => row.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  analyticsStore.invalidate();
  api.getAnalyticsScope.mockResolvedValue(response(summary()));
});
afterEach(() => { cleanup(); analyticsStore.invalidate(); });

describe("HoldingsPage search", () => {
  it("the box gets pageKey holdings, noun stocks and no chips", async () => {
    mount();
    await ready();
    const box = screen.getByTestId("page-search-stub");
    expect(box).toHaveAttribute("data-page-key", "holdings");
    expect(box).toHaveAttribute("data-noun", "stocks");
    expect(box).toHaveAttribute("data-chips-allowed", "[]");
    expect(searchProps).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "example-user" }));
  });

  it("total is the number of stock rows and matched the number shown", async () => {
    mount("?q=motors");
    await ready();
    expect(screen.getByTestId("page-search-stub")).toHaveAttribute("data-total", "2");
    expect(screen.getByTestId("page-search-stub")).toHaveAttribute("data-matched", "1");
    expect(stockRows()).toHaveLength(1);
  });

  it("?q= filters the all-holdings table and leaves the top-by-fund card alone", async () => {
    const baseline = mount();
    await ready();
    const expectedTop = screen.getByTestId("card-top-holdings").textContent;
    baseline.unmount();
    mount("?q=motors");
    await ready();
    const table = screen.getByTestId("card-all-stocks");
    expect(within(table).getByTestId("stock-row-INE000000001")).toBeInTheDocument();
    expect(within(table).queryByTestId("stock-row-INE000000002")).not.toBeInTheDocument();
    expect(screen.getByTestId("card-top-holdings").textContent).toBe(expectedTop);
  });

  it("the truncation note shows when the list is truncated", async () => {
    api.getAnalyticsScope.mockResolvedValue(response(summary(true)));
    mount("?q=motors");
    await ready();
    expect(screen.getByText("Searching the largest 2 of 240 stocks")).toBeInTheDocument();
  });

  it("with no q the page is exactly as before", async () => {
    const data = summary();
    const baseline = mount("", <>
      <TopHoldingsByFund state="ready" data={data} onRetry={vi.fn()} />
      <AllStocksTable state="ready" data={data} onRetry={vi.fn()} />
    </>);
    const expectedRows = stockRows();
    const expectedTop = screen.getByRole("list", { name: "Top holdings" }).textContent;
    expect(expectedRows).toHaveLength(2);
    baseline.unmount();
    mount();
    await ready();
    expect(stockRows()).toEqual(expectedRows);
    expect(screen.getByRole("list", { name: "Top holdings" }).textContent).toBe(expectedTop);
    expect(screen.queryByText(/^Searching the largest/)).not.toBeInTheDocument();
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
  });
});
