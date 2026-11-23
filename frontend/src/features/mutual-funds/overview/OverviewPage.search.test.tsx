import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ImportContext, ScopeContext } from "../../../shell/scope/ScopeContext";
import type { ScopeValue } from "../../../shell/scope/scopeTypes";
import type { HoldingRow, SipRow } from "../types";
import type { PageFilterSource } from "../../../components/search/searchResultTypes";
import { analyticsStore } from "../data/analyticsStore";
import { HoldingsTable } from "./HoldingsTable";
import { SipTimeline } from "./SipTimeline";
import OverviewPage from "./OverviewPage";

const api = vi.hoisted(() => ({
  getHoldingsBundle: vi.fn(), getAllocation: vi.fn(), getSips: vi.fn(), getSipsMonthly: vi.fn(),
  getCoverageGaps: vi.fn(), getHistoryPoints: vi.fn(), getAnalyticsScope: vi.fn(),
  retryAnalyticsScope: vi.fn(), getWealthBenchmarks: vi.fn(), getWealthSeries: vi.fn(),
}));
const searchProps = vi.hoisted(() => vi.fn());
vi.mock("../api", () => api);
vi.mock("../../auth/session", () => ({ getToken: () => "example-session" }));
vi.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ me: { user_id: "example-user" } }) }));
vi.mock("../../../components/wealth-graph/WealthGraph", () => ({ WealthGraph: () => null }));
vi.mock("../../../components/wealth-graph/useWealthSeries", () => ({
  useWealthSeries: () => ({ status: "loading", data: null, refreshing: false, retry: vi.fn() }),
}));
vi.mock("../../../components/search/PageSearch", () => ({
  PageSearch: (props: PageFilterSource & { userId: string | null }) => {
    searchProps(props);
    const { pageKey, noun, total, matched, chipsAllowed } = props;
    return <div data-testid="page-search-stub" data-page-key={pageKey} data-noun={noun}
      data-total={total} data-matched={matched} data-chips-allowed={JSON.stringify(chipsAllowed)} />;
  },
}));

const holdings: HoldingRow[] = [
  { scheme_id: "growth", scheme_name: "Example Growth Fund", amc_name: "Orchid AMC",
    category: "Flexi Cap", sebi_category: "Flexi Cap", household_member_id: "asha", household_member_name: "Asha",
    plan_type: "direct", units_held: "100.00", average_nav: "10.00", current_nav: "12.00",
    amount_invested: "1000.00", current_value: "1200.00", current_profit_total: "200.00",
    realized_gain: "0.00", unrealized_gain: "200.00", today_gain: "0.00" },
  { scheme_id: "income", scheme_name: "Example Income Fund", amc_name: "Lotus AMC",
    category: "Debt", sebi_category: "Debt", household_member_id: "bela", household_member_name: "Bela",
    plan_type: "direct", units_held: "200.00", average_nav: "10.00", current_nav: "11.00",
    amount_invested: "2000.00", current_value: "2200.00", current_profit_total: "200.00",
    realized_gain: "0.00", unrealized_gain: "200.00", today_gain: "0.00" },
];
const sips: SipRow[] = holdings.map(holding => ({
  scheme_id: holding.scheme_id, scheme_name: holding.scheme_name,
  household_member_id: holding.household_member_id, household_member_name: holding.household_member_name,
  sip_date: "5", sip_amount: "1000.00", next_due_date: "2026-12-05", status: "active",
}));
const scope: ScopeValue = { viewMode: "aggregate", memberId: null, scopeKey: "aggregate",
  members: [{ id: "asha", name: "Asha" }, { id: "bela", name: "Bela" }], userId: "example-user",
  setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn(),
};
function mount(search = "", children: ReactNode = <OverviewPage />) {
  return render(<MemoryRouter initialEntries={[`/portfolio/mutual-funds${search}`]}>
    <ScopeContext.Provider value={scope}><ImportContext.Provider value={{ openImport: vi.fn() }}>
      {children}
    </ImportContext.Provider></ScopeContext.Provider>
  </MemoryRouter>);
}
const fundRows = () => screen.queryAllByTestId(/^row-/).map(row => row.textContent);
const capsules = () => screen.queryAllByTestId(/^sip-cap-/).map(row => row.textContent);
const ready = () => screen.findByTestId("foot-value");
const loadHoldings = { status: "data" as const, data: holdings, retry: vi.fn() };
const loadSips = { status: "data" as const, data: sips, retry: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  analyticsStore.invalidate();
  api.getHoldingsBundle.mockResolvedValue({ holdings, members: [], realized: { total: "0.00", funds: [] },
    xirr: { lifetime: null, current: null, disclaimers: { lifetime: null, current: null } } });
  api.getAllocation.mockResolvedValue({ by_asset_class: [], by_amc: [], total_value: "3400.00", nav_unavailable_count: 0 });
  api.getSips.mockResolvedValue(sips);
  api.getSipsMonthly.mockResolvedValue([]);
  api.getCoverageGaps.mockResolvedValue([]);
  api.getHistoryPoints.mockResolvedValue([]);
  api.getAnalyticsScope.mockResolvedValue({ scope: "combined", recomputing: false, sections: {
    benchmark_funds: { payload: { funds: [] }, computed_at: "2026-11-23T00:00:00Z", failed_at: null },
  } });
  api.getWealthBenchmarks.mockResolvedValue({ options: [], recommended_index: null });
});
afterEach(() => { cleanup(); analyticsStore.invalidate(); });

describe("OverviewPage search", () => {
  it("the raw Search investments input is gone", async () => {
    mount();
    await ready();
    expect(screen.queryByRole("textbox", { name: "Search investments" })).not.toBeInTheDocument();
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
  });

  it("the box gets pageKey overview, noun funds, chips category and member", async () => {
    mount();
    await ready();
    const box = screen.getByTestId("page-search-stub");
    expect(box).toHaveAttribute("data-page-key", "overview");
    expect(box).toHaveAttribute("data-noun", "funds");
    expect(box).toHaveAttribute("data-chips-allowed", JSON.stringify(["category", "member"]));
    expect(searchProps).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "example-user" }));
  });

  it("total is the number of funds and matched is the number shown", async () => {
    mount("?q=growth");
    await ready();
    expect(screen.getByTestId("page-search-stub")).toHaveAttribute("data-total", "2");
    expect(screen.getByTestId("page-search-stub")).toHaveAttribute("data-matched", "1");
    expect(fundRows()).toHaveLength(1);
  });

  it("?q= filters the funds table", async () => {
    mount("?q=growth");
    await ready();
    expect(screen.getByTestId("row-growth:asha")).toBeInTheDocument();
    expect(screen.queryByTestId("row-income:bela")).not.toBeInTheDocument();
  });

  it("?f=category: filters the table", async () => {
    mount("?f=category%3AFlexi%20Cap");
    await ready();
    expect(screen.getByTestId("row-growth:asha")).toBeInTheDocument();
    expect(screen.queryByTestId("row-income:bela")).not.toBeInTheDocument();
  });

  it("?q= also filters the SIP capsules", async () => {
    mount("?q=growth");
    await screen.findByTestId("sip-cap-2026-12-05");
    const section = document.getElementById("overview-sips")!;
    expect(within(section).getAllByText(/Example Growth Fund/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("sip-cap-2026-12-05")).toHaveAttribute("data-count", "1");
    expect(within(section).queryByText(/Example Income Fund/)).not.toBeInTheDocument();
  });

  it("with no q and no f the table and the SIP capsules are exactly as before", async () => {
    const baseline = mount("", <>
      <HoldingsTable holdings={loadHoldings} xirrByScheme={{}} sort={null}
        onSort={vi.fn()} query="" onAnalyse={vi.fn()} onCompareDistributors={vi.fn()} />
      <SipTimeline sips={loadSips} />
    </>);
    const expectedRows = fundRows();
    const expectedCapsules = capsules();
    expect(expectedRows).toHaveLength(2);
    expect(expectedCapsules).toHaveLength(1);
    baseline.unmount();
    mount();
    await ready();
    await screen.findByTestId("sip-cap-2026-12-05");
    expect(fundRows()).toEqual(expectedRows);
    expect(capsules()).toEqual(expectedCapsules);
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
  });

  it('the no-match message still reads No funds match "x" when nothing matches', async () => {
    mount("?q=x");
    expect(await screen.findByText('No funds match "x"')).toBeInTheDocument();
    expect(fundRows()).toEqual([]);
    expect(screen.getByTestId("page-search-stub")).toHaveAttribute("data-matched", "0");
  });
});
