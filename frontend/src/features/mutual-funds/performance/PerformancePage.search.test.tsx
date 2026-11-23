import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageFilterSource } from "../../../components/search/searchResultTypes";
import { ImportContext, ScopeContext } from "../../../shell/scope/ScopeContext";
import type { ScopeValue } from "../../../shell/scope/scopeTypes";
import { analyticsStore } from "../data/analyticsStore";
import * as fx from "../fixtures";
import * as fb from "../fixtures/mfB";
import type { FundBenchmarkRow, HistoryPoint } from "../types";
import { BenchmarkBlock } from "./BenchmarkBlock";
import PerformancePage from "./PerformancePage";

const api = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn(),
  getHoldingsBundle: vi.fn(), getHistoryPoints: vi.fn(), getMonthDetail: vi.fn(),
  getAllocation: vi.fn(), getSips: vi.fn(), getSipsMonthly: vi.fn(), getCoverageGaps: vi.fn() }));
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

const funds: FundBenchmarkRow[] = [
  { scheme_id: "growth", scheme_name: "Example Growth Fund", benchmark_index: "nifty_500",
    fund_xirr: "0.12", benchmark_xirr: "0.10" },
  { scheme_id: "income", scheme_name: "Example Income Fund", benchmark_index: "nifty_50",
    fund_xirr: "0.08", benchmark_xirr: "0.09" },
];
const history: HistoryPoint[] = [{ month: "2026-10-31", value: 1200, invested: 1000,
  valueText: "1200.00", investedText: "1000.00", partial: false, missing: [] }];
const scope: ScopeValue = { viewMode: "aggregate", memberId: null, scopeKey: "aggregate",
  members: [{ id: "asha", name: "Asha" }, { id: "bela", name: "Bela" }], userId: "example-user",
  setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn(),
};
function mount(search = "", children: ReactNode = <PerformancePage />) {
  return render(<MemoryRouter initialEntries={[`/portfolio/mutual-funds/performance${search}`]}>
    <ScopeContext.Provider value={scope}><ImportContext.Provider value={{ openImport: vi.fn() }}>
      {children}
    </ImportContext.Provider></ScopeContext.Provider>
  </MemoryRouter>);
}
async function openFunds() {
  fireEvent.click(screen.getByRole("tab", { name: "Per-Fund vs Benchmark" }));
  await screen.findByTestId("fund-row-growth");
}
const fundRows = () => screen.queryAllByTestId(/^fund-row-/).map(row => row.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  analyticsStore.invalidate();
  const response = fb.analyticsMfB();
  response.sections.benchmark_funds = { payload: { comparison: { funds,
    overall_portfolio_xirr: "0.12", overall_broad_market_xirr: "0.10" } },
    computed_at: "2026-11-23T00:00:00Z", failed_at: null };
  api.getAnalyticsScope.mockResolvedValue(response);
  api.getHoldingsBundle.mockResolvedValue({ holdings: fx.holdings(), members: [], realized: null,
    xirr: { lifetime: "0.12", current: "0.10", disclaimers: { lifetime: null, current: null } } });
  api.getHistoryPoints.mockResolvedValue(history);
});
afterEach(() => { cleanup(); analyticsStore.invalidate(); });

describe("PerformancePage search", () => {
  it("the box gets pageKey performance, noun funds and no chips", async () => {
    mount();
    await openFunds();
    const box = screen.getByTestId("page-search-stub");
    expect(box).toHaveAttribute("data-page-key", "performance");
    expect(box).toHaveAttribute("data-noun", "funds");
    expect(box).toHaveAttribute("data-chips-allowed", "[]");
    expect(searchProps).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "example-user" }));
    expect(within(screen.getByRole("navigation", { name: "Mutual Funds sections" }).parentElement!)
      .getByTestId("page-search-stub")).toBe(box);
  });

  it("total is the number of benchmark rows and matched the number shown", async () => {
    mount("?q=growth");
    await openFunds();
    expect(screen.getByTestId("page-search-stub")).toHaveAttribute("data-total", "2");
    expect(screen.getByTestId("page-search-stub")).toHaveAttribute("data-matched", "1");
    expect(fundRows()).toHaveLength(1);
  });

  it("?q= filters the fund versus benchmark list", async () => {
    mount("?q=growth");
    await openFunds();
    expect(screen.getByTestId("fund-row-growth")).toHaveTextContent("Example Growth Fund");
    expect(screen.queryByTestId("fund-row-income")).not.toBeInTheDocument();
  });

  it("the rest of the page is unchanged with ?q=", async () => {
    const baseline = mount();
    await screen.findByTestId("xirr-value");
    await screen.findByTestId("point-2026-10-31");
    const tile = screen.getByTestId("xirr-value").textContent;
    const historyText = screen.getByTestId("block-history").textContent;
    baseline.unmount();
    mount("?q=growth");
    await screen.findByTestId("xirr-value");
    await screen.findByTestId("point-2026-10-31");
    expect(screen.getByTestId("xirr-value").textContent).toBe(tile);
    expect(screen.getByTestId("block-history").textContent).toBe(historyText);
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
  });

  it("with no q the list is exactly as before", async () => {
    const baseline = mount("", <BenchmarkBlock />);
    await openFunds();
    const expected = fundRows();
    expect(expected).toHaveLength(2);
    baseline.unmount();
    mount();
    await openFunds();
    expect(fundRows()).toEqual(expected);
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
  });
});
