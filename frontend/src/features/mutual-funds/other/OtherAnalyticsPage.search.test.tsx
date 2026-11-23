import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageFilterSource } from "../../../components/search/searchResultTypes";
import { ImportContext, ScopeContext } from "../../../shell/scope/ScopeContext";
import type { ScopeValue } from "../../../shell/scope/scopeTypes";
import { analyticsStore } from "../data/analyticsStore";
import * as fc from "../fixtures/mfC";
import * as fo from "../fixtures/mfCother";
import type { CategoryRankRow, FundTerRow, ValuationValue } from "../types";
import { CategoryRankingGroup } from "./CategoryRankingGroup";
import { CostValuationGroup } from "./CostValuationGroup";
import { PerformanceRankingGroup } from "./PerformanceRankingGroup";
import OtherAnalyticsPage from "./OtherAnalyticsPage";

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

const costFunds: FundTerRow[] = [
  { scheme_id: "growth", scheme_name: "Example Growth Fund", plan_type: "direct", ter: "0.50",
    value: "1000.00", cost_1y: "5.00", cost_3y: "15.00", cost_5y: "25.00" },
  { scheme_id: "income", scheme_name: "Example Income Fund", plan_type: "regular", ter: "0.80",
    value: "2000.00", cost_1y: "16.00", cost_3y: "48.00", cost_5y: "80.00" },
];
const ratio: ValuationValue = { value: "20.00", source: "factsheet", as_of: "2026-10-31",
  basis: "trailing", method: "factsheet", coverage_pct: "100.00", reason: null };
const categories: CategoryRankRow[] = costFunds.map(fund => ({
  scheme_id: fund.scheme_id, scheme_name: fund.scheme_name, plan_type: fund.plan_type,
  sebi_category: "Flexi Cap", category_unavailable: false, insufficient_history: false,
  category_avg_return: "0.10", thin_category: false, periods: {
    "1y": { fund_return: "0.12", category_avg: "0.10", peers: 30 },
    "3y": { fund_return: "0.12", category_avg: "0.10", peers: 25 },
    "5y": { fund_return: "0.12", category_avg: "0.10", peers: 20 },
  },
}));
const scope: ScopeValue = { viewMode: "aggregate", memberId: null, scopeKey: "aggregate",
  members: [{ id: "asha", name: "Asha" }, { id: "bela", name: "Bela" }], userId: "example-user",
  setMember: vi.fn(), setAggregate: vi.fn(), refreshMembers: vi.fn(),
};
function mount(search = "", children: ReactNode = <OtherAnalyticsPage />) {
  return render(<MemoryRouter initialEntries={[`/portfolio/mutual-funds/analytics${search}`]}>
    <ScopeContext.Provider value={scope}><ImportContext.Provider value={{ openImport: vi.fn() }}>
      {children}
    </ImportContext.Provider></ScopeContext.Provider>
  </MemoryRouter>);
}
const ready = () => screen.findByTestId("ter-weighted");
function valuationCard() {
  return screen.getByRole("heading", { name: "Valuation by Fund" }).closest("section")!;
}
const valuationRows = () => within(valuationCard()).queryAllByRole("row").slice(1).map(row => row.textContent);
const categoryRows = () => screen.queryAllByTestId(/^cat-row-/).map(row => row.textContent);
const rankingRows = () => screen.queryAllByTestId(/^performance-row-/).map(row => row.textContent);
const ladderRows = () => screen.queryAllByTestId(/^ladder-(growth|income)$/).map(row => row.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  analyticsStore.invalidate();
  const response = fc.analyticsMfC();
  const ter = { ...fo.terSummary(), funds: costFunds, total_value: "3000.00", covered_value: "3000.00",
    weighted_ter: "0.70", cost_1y: "21.00", cost_3y: "63.00", cost_5y: "105.00", uncovered_schemes: [] };
  const valuation = { ...fo.valuationSummary(), funds: costFunds.map(fund => ({
    scheme_id: fund.scheme_id, scheme_name: fund.scheme_name, pe: ratio, pb: { ...ratio, value: "3.00" },
  })) };
  const ranking = fo.fundRanking();
  ranking.funds = ranking.funds.slice(0, 2).map((fund, index) => ({ ...fund,
    scheme_id: costFunds[index].scheme_id, scheme_name: costFunds[index].scheme_name,
  }));
  const settled = { computed_at: "2026-11-23T00:00:00Z", failed_at: null };
  response.sections.ter = { payload: { ter }, ...settled };
  response.sections.valuation = { payload: { valuation }, ...settled };
  response.sections.category_ranking = { payload: { ranking: { funds: categories } }, ...settled };
  response.sections.ranking = { payload: { ranking }, ...settled };
  api.getAnalyticsScope.mockResolvedValue(response);
});
afterEach(() => { cleanup(); analyticsStore.invalidate(); });

describe("OtherAnalyticsPage search", () => {
  it("the box gets pageKey analytics, noun funds", async () => {
    mount();
    await ready();
    const box = screen.getByTestId("page-search-stub");
    expect(box).toHaveAttribute("data-page-key", "analytics");
    expect(box).toHaveAttribute("data-noun", "funds");
    expect(box).toHaveAttribute("data-chips-allowed", "[]");
    expect(searchProps).toHaveBeenLastCalledWith(expect.objectContaining({ userId: "example-user" }));
    expect(within(screen.getByRole("navigation", { name: "Mutual Funds sections" }).parentElement!)
      .getByTestId("page-search-stub")).toBe(box);
  });

  it("total is the number of cost funds and matched the number matching", async () => {
    mount("?q=growth");
    await ready();
    expect(screen.getByTestId("page-search-stub")).toHaveAttribute("data-total", "2");
    expect(screen.getByTestId("page-search-stub")).toHaveAttribute("data-matched", "1");
    expect(screen.getByTestId("ladder-growth")).toBeInTheDocument();
    expect(screen.queryByTestId("ladder-income")).not.toBeInTheDocument();
  });

  it("?q= filters Valuation by Fund", async () => {
    mount("?q=growth");
    await ready();
    expect(valuationRows()).toHaveLength(1);
    expect(within(valuationCard()).getByText("Example Growth Fund")).toBeInTheDocument();
    expect(within(valuationCard()).queryByText("Example Income Fund")).not.toBeInTheDocument();
  });

  it("?q= filters the category comparison cards", async () => {
    mount("?q=growth");
    await screen.findByTestId("cat-row-growth");
    expect(categoryRows()).toHaveLength(1);
    expect(screen.queryByTestId("cat-row-income")).not.toBeInTheDocument();
  });

  it("?q= filters the performance ranking", async () => {
    mount("?q=growth");
    await screen.findByTestId("performance-row-growth");
    expect(rankingRows()).toHaveLength(1);
    expect(screen.queryByTestId("performance-row-income")).not.toBeInTheDocument();
  });

  it("headings and explanations stay with ?q=", async () => {
    const baseline = mount();
    await ready();
    // A fund's own card heading goes with the fund when it is filtered out; the page, group and card headings stay.
    const isFundHeading = (text: string | null) => /^Example (Growth|Income) Fund$/.test(text ?? "");
    const headings = () => screen.getAllByRole("heading").map(heading => heading.textContent).filter(text => !isFundHeading(text));
    const titles = headings();
    const explanations = [
      "How expensive your funds are to hold, and how richly their holdings are priced.",
      "Your fund returns compared with the average of funds in the same category and plan type, weighted by fund size.",
      "Each period compares funds in the same SEBI category and plan type.",
    ];
    baseline.unmount();
    const matching = mount("?q=growth");
    await ready();
    expect(headings()).toEqual(titles);
    for (const text of explanations) expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByTestId("group-scorer")).not.toBeInTheDocument();
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
    matching.unmount();
    mount("?q=unrelated");
    await ready();
    expect(screen.getByRole("heading", { name: "Valuation by Fund" })).toBeInTheDocument();
    expect(screen.getByText("No fund valuation figures are available yet.")).toBeInTheDocument();
    expect(screen.getByText(/^(No category comparison data available\.|No funds match this filter\.)$/)).toBeInTheDocument();
    expect(screen.getByText("No funds to rank for this selection.")).toBeInTheDocument();
    for (const text of explanations) expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("with no q the page is exactly as before", async () => {
    const baseline = mount("", <><CostValuationGroup /><CategoryRankingGroup /><PerformanceRankingGroup /></>);
    await screen.findByTestId("performance-row-growth");
    const expected = { valuation: valuationRows(), category: categoryRows(), ranking: rankingRows(), ter: ladderRows() };
    expect(expected.valuation).toHaveLength(2);
    expect(expected.category).toHaveLength(2);
    expect(expected.ranking).toHaveLength(2);
    expect(expected.ter).toHaveLength(2);
    baseline.unmount();
    mount();
    await screen.findByTestId("performance-row-growth");
    expect({ valuation: valuationRows(), category: categoryRows(), ranking: rankingRows(), ter: ladderRows() }).toEqual(expected);
    expect(screen.getByTestId("page-search-stub")).toBeInTheDocument();
  });
});
