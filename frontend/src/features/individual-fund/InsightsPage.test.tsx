import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { useScope } from "@/shell/scope/ScopeContext";
import { renderInShell } from "@/shell/testing";
import { deferred } from "./__support__/deferred";
import InsightsRoute, { InsightsPage } from "./InsightsPage";
import { IDS, fixture } from "./fixtures";
import type {
  InsightsResponse, ManagerResponse, PeriodReturnsResponse, RollingResponse, ScatterResponse, SummaryResponse, Unavailable,
} from "./types";

// The kit charts cannot measure a width in jsdom, so they are stubs; everything else is the real page.
vi.mock("@/components/ui/charts", () => ({
  LineAreaChart: () => <div data-testid="line-chart" />,
  GroupedBarChart: () => <div data-testid="bar-chart" />,
  ScatterChart: () => <div data-testid="scatter-chart" />,
}));
const api = vi.hoisted(() => ({
  summary: vi.fn(), insights: vi.fn(), manager: vi.fn(), rolling: vi.fn(), periodReturns: vi.fn(), scatter: vi.fn(),
  performance: vi.fn(), returns: vi.fn(), score: vi.fn(), categorySeries: vi.fn(), categoryReturns: vi.fn(),
  risk: vi.fn(), composition: vi.fn(), holdings: vi.fn(), folioNumber: vi.fn(),
}));
vi.mock("./api", () => ({ fundPageApi: api }));

const PATH = `/portfolio/mutual-funds/funds/${IDS.scheme}/insights`;
const members = [{ id: IDS.asha, name: "ASHA RAO" }, { id: IDS.dev, name: "Dev Rao" }, { id: IDS.meera, name: "Meera Rao" }];
const NAME = "Alpha Flexi Cap Fund - Direct Plan";
const SLOTS = ["slot-smart", "slot-key", "slot-strengths", "slot-rolling", "slot-period", "slot-scatter", "slot-manager"];
const un = (reason: string): Unavailable => ({ status: "unavailable", reason });

function setDefaults() {
  api.summary.mockImplementation(() => Promise.resolve(fixture<SummaryResponse>("summary_family")));
  api.insights.mockImplementation(() => Promise.resolve(fixture<InsightsResponse>("insights_full")));
  api.manager.mockImplementation(() => Promise.resolve(fixture<ManagerResponse>("manager")));
  api.rolling.mockImplementation(() => Promise.resolve(fixture<RollingResponse>("rolling_3y")));
  api.periodReturns.mockImplementation(() => Promise.resolve(fixture<PeriodReturnsResponse>("period_returns_1y")));
  api.scatter.mockImplementation(() => Promise.resolve(fixture<ScatterResponse>("scatter")));
}
const mount = (options: Parameters<typeof renderInShell>[1] = {}) => renderInShell(<InsightsPage schemeId={IDS.scheme} />, { path: PATH, ...options });
const settled = async () => {
  await screen.findByTestId("fact-expense_ratio_vs_category");
  await screen.findByTestId("manager-0");
  await screen.findByTestId("line-chart");
  await screen.findByTestId("bar-chart");
  await screen.findByTestId("scatter-chart");
};

beforeEach(() => {
  vi.clearAllMocks();
  setDefaults();
});

describe("InsightsPage", () => {
  it("renders the frame without the stat band, then every card from the fixtures", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    await settled();
    expect(screen.queryByRole("region", { name: "Fund summary" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Smart Insights Beta" })).toBeInTheDocument();
    expect(screen.getAllByTestId(/^smart-card-\d+$/)).toHaveLength(3);
    expect(screen.getByRole("list", { name: "Key insights" })).toBeInTheDocument();
    expect(screen.getByTestId("sc-strengths")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rolling Returns" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Period Returns" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Risk-Return (3 Years)" })).toBeInTheDocument();
    expect(screen.getAllByTestId("manager-name")[0]).toHaveTextContent("Ananya Shah");
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Insights")).toHaveAttribute("aria-current", "page");
  });

  it("test_layout_classes_two_columns_overview_and_insights: two equal columns from 1100 px, 20 px gaps, the seven slots in order, Smart Insights across both columns", async () => {
    mount();
    await settled();
    const grid = screen.getByTestId("insights-grid");
    expect(grid.className).toContain("grid");
    expect(grid.className).toContain("gap-5");
    expect(grid.className).toContain("min-[1100px]:grid-cols-2");
    expect([...grid.children].map(child => child.getAttribute("data-testid"))).toEqual(SLOTS);
    expect(screen.getByTestId("slot-smart").className).toContain("min-[1100px]:col-span-2");
    for (const slot of SLOTS) expect(screen.getByTestId(slot).className).toContain("min-w-0");
    expect(screen.getByTestId("slot-key")).toContainElement(screen.getByRole("heading", { name: "Key Insights" }));
    expect(screen.getByTestId("slot-strengths")).toContainElement(screen.getByRole("heading", { name: "Strengths and Considerations" }));
    expect(screen.getByTestId("slot-rolling")).toContainElement(screen.getByRole("heading", { name: "Rolling Returns" }));
    expect(screen.getByTestId("slot-period")).toContainElement(screen.getByRole("heading", { name: "Period Returns" }));
    expect(screen.getByTestId("slot-scatter")).toContainElement(screen.getByRole("heading", { name: "Risk-Return (3 Years)" }));
    expect(screen.getByTestId("slot-manager")).toContainElement(screen.getByRole("heading", { name: "Fund Manager and Strategy" }));
    for (const heading of ["Key Insights", "Strengths and Considerations", "Rolling Returns", "Period Returns", "Risk-Return (3 Years)", "Fund Manager and Strategy"]) {
      expect(screen.getByRole("heading", { name: heading }).closest("section")!.className).toContain("p-5");
    }
  });

  it("test_insights_calls_start_on_tab_open_and_summary_is_reused: one request for each Insights endpoint and one summary, none for the Overview endpoints", async () => {
    mount();
    await settled();
    expect(api.summary).toHaveBeenCalledTimes(1);
    expect(api.summary).toHaveBeenCalledWith(IDS.scheme, "combined", expect.any(AbortSignal));
    expect(api.insights).toHaveBeenCalledTimes(1);
    expect(api.insights).toHaveBeenCalledWith(IDS.scheme, "combined", expect.any(AbortSignal));
    expect(api.manager).toHaveBeenCalledTimes(1);
    expect(api.manager).toHaveBeenCalledWith(IDS.scheme, expect.any(AbortSignal));
    expect(api.rolling).toHaveBeenCalledTimes(1);
    expect(api.rolling).toHaveBeenCalledWith(IDS.scheme, 3, expect.any(AbortSignal));
    expect(api.periodReturns).toHaveBeenCalledTimes(1);
    expect(api.periodReturns).toHaveBeenCalledWith(IDS.scheme, "1Y", expect.any(AbortSignal));
    expect(api.scatter).toHaveBeenCalledTimes(1);
    expect(api.scatter).toHaveBeenCalledWith(IDS.scheme, expect.any(AbortSignal));
    for (const name of ["performance", "returns", "score", "categorySeries", "categoryReturns", "risk", "composition", "holdings", "folioNumber"] as const) {
      expect(api[name]).not.toHaveBeenCalled();
    }
  });

  it("the three insight cards share one request, and one Retry brings all three back", async () => {
    api.insights.mockRejectedValueOnce(new Error("down")).mockImplementation(() => Promise.resolve(fixture<InsightsResponse>("insights_full")));
    mount();
    expect(await screen.findByText("Couldn't load smart insights.")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load key insights.")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load strengths and considerations.")).toBeInTheDocument();
    expect(await screen.findByTestId("manager-0")).toBeInTheDocument();
    expect(await screen.findByTestId("scatter-chart")).toBeInTheDocument();
    const before = { manager: api.manager.mock.calls.length, rolling: api.rolling.mock.calls.length, scatter: api.scatter.mock.calls.length, summary: api.summary.mock.calls.length };
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    expect(await screen.findByTestId("smart-card-0")).toBeInTheDocument();
    expect(await screen.findByTestId("fact-expense_ratio_vs_category")).toBeInTheDocument();
    expect(api.insights).toHaveBeenCalledTimes(2);
    expect({ manager: api.manager.mock.calls.length, rolling: api.rolling.mock.calls.length, scatter: api.scatter.mock.calls.length, summary: api.summary.mock.calls.length }).toEqual(before);
  });

  it("test_failed_card_shows_error_and_retry_refetches_only_that_card (the manager)", async () => {
    api.manager.mockRejectedValueOnce(new Error("down")).mockImplementation(() => Promise.resolve(fixture<ManagerResponse>("manager")));
    mount();
    expect(await screen.findByText("Couldn't load fund manager.")).toBeInTheDocument();
    await screen.findByTestId("scatter-chart");
    await screen.findByTestId("fact-expense_ratio_vs_category");
    const before = { insights: api.insights.mock.calls.length, rolling: api.rolling.mock.calls.length, period: api.periodReturns.mock.calls.length, scatter: api.scatter.mock.calls.length };
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("manager-0")).toBeInTheDocument();
    expect(api.manager).toHaveBeenCalledTimes(2);
    expect({ insights: api.insights.mock.calls.length, rolling: api.rolling.mock.calls.length, period: api.periodReturns.mock.calls.length, scatter: api.scatter.mock.calls.length }).toEqual(before);
  });

  it("test_tier1_and_2_render_before_tier3_resolves: the header, the manager and the charts show while the insights are still pending", async () => {
    const pending = deferred<InsightsResponse>();
    api.insights.mockReturnValue(pending.promise);
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(await screen.findByTestId("manager-0")).toBeInTheDocument();
    expect(await screen.findByTestId("line-chart")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading smart insights" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading key insights" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading strengths and considerations" })).toBeInTheDocument();
    await act(async () => { pending.resolve(fixture<InsightsResponse>("insights_full")); });
    expect(screen.getAllByTestId(/^smart-card-\d+$/)).toHaveLength(3);
  });

  it("test_no_section_throws_on_all_unavailable_payloads: every card says why, the page still renders", async () => {
    api.insights.mockImplementation(() => Promise.resolve(un("no_history")));
    api.manager.mockImplementation(() => Promise.resolve(un("no_manager_data")));
    api.rolling.mockImplementation(() => Promise.resolve(un("no_history")));
    api.periodReturns.mockImplementation(() => Promise.resolve(un("peers_unavailable")));
    api.scatter.mockImplementation(() => Promise.resolve(un("peers_unavailable")));
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(await screen.findByTestId("rolling-note")).toHaveTextContent("This fund has less than 3 years of history");
    await screen.findByText("Manager details not available for this fund house.");
    await screen.findAllByText("Category comparison is not available for this fund yet.");
    expect(screen.getAllByText("No price history yet for this fund.")).toHaveLength(3);
    expect(screen.getAllByText("Category comparison is not available for this fund yet.")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Smart Insights Beta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Mira a follow-up" })).toBeInTheDocument();
    expect(screen.queryByTestId("line-chart")).toBeNull();
    expect(screen.queryByTestId("bar-chart")).toBeNull();
    expect(screen.queryByTestId("scatter-chart")).toBeNull();
  });

  it("a sparse fund shows what it has: one card, one key row, and the strengths card says there is nothing yet", async () => {
    // Hand-made from the full golden (one fact, in the key list and the top three): the sparse golden is being regenerated, so the shape is built here.
    const sparse = fixture<InsightsResponse>("insights_full");
    const only = sparse.key.find(fact => fact.id === "expense_ratio_vs_category")!;
    Object.assign(sparse, { key: [only], strengths: [], considerations: [], top_three: [only] });
    api.insights.mockImplementation(() => Promise.resolve(sparse));
    mount();
    await settled();
    expect(screen.getAllByTestId(/^smart-card-\d+$/)).toHaveLength(1);
    expect(within(screen.getByRole("list", { name: "Key insights" })).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByTestId("sc-empty")).toHaveTextContent("Not enough data to draw insights yet");
  });

  it("test_member_switch_aborts_inflight_and_refetches_personal_sections_only: the insights follow the member, the fund-level cards do not", async () => {
    function Picker() {
      const { setMember } = useScope();
      return <button type="button" onClick={() => setMember(IDS.dev)}>Pick Dev</button>;
    }
    renderInShell(<><InsightsPage schemeId={IDS.scheme} /><Picker /></>, { path: PATH, scope: { members, viewMode: "aggregate" } });
    await settled();
    for (const fn of Object.values(api)) fn.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Pick Dev" }));
    await act(async () => {});
    expect(api.summary).toHaveBeenCalledWith(IDS.scheme, IDS.dev, expect.any(AbortSignal));
    expect(api.insights).toHaveBeenCalledWith(IDS.scheme, IDS.dev, expect.any(AbortSignal));
    expect(api.manager).not.toHaveBeenCalled();
    expect(api.rolling).not.toHaveBeenCalled();
    expect(api.periodReturns).not.toHaveBeenCalled();
    expect(api.scatter).not.toHaveBeenCalled();
  });

  it("a member's scope is what the first requests carry", async () => {
    mount({ scope: { members, viewMode: "member", memberId: IDS.asha } });
    await settled();
    expect(api.summary).toHaveBeenCalledWith(IDS.scheme, IDS.asha, expect.any(AbortSignal));
    expect(api.insights).toHaveBeenCalledWith(IDS.scheme, IDS.asha, expect.any(AbortSignal));
    expect(api.manager).toHaveBeenCalledWith(IDS.scheme, expect.any(AbortSignal));
  });

  it("test_not_held_member_shows_fund_level_cards: a member who does not hold the fund still gets every Insights card", async () => {
    api.summary.mockImplementation(() => Promise.resolve(fixture<SummaryResponse>("summary_not_held")));
    mount({ scope: { members, viewMode: "member", memberId: IDS.dev } });
    await settled();
    expect(screen.getByTestId("insights-grid")).toBeInTheDocument();
    expect(screen.getAllByTestId("manager-name")[0]).toHaveTextContent("Ananya Shah");
  });

  it("an unknown fund shows the not found page and no cards", async () => {
    api.summary.mockRejectedValue(new ApiError(404, { detail: "Scheme not found." }));
    mount();
    expect(await screen.findByRole("heading", { name: "Fund not found" })).toBeInTheDocument();
    expect(screen.queryByTestId("insights-grid")).toBeNull();
  });

  it("the tab strip leads back to Overview and marks Insights current", async () => {
    // The Overview and Insights routes are live, so both tabs are real links in the real registry.
    mount();
    const tabs = await screen.findByRole("navigation", { name: "Fund sections" });
    expect(within(tabs).getByRole("link", { name: "Insights" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Overview" })).toHaveAttribute("href", `/portfolio/mutual-funds/funds/${IDS.scheme}`);
  });
});

describe("Insights route", () => {
  it("the real route renders the page inside the shell at the Insights URL", async () => {
    renderInShell(undefined, { path: PATH });
    expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(await screen.findByTestId("fact-expense_ratio_vs_category")).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(screen.getByTestId("insights-grid"));
    expect(api.insights).toHaveBeenCalledWith(IDS.scheme, "combined", expect.any(AbortSignal));
  });

  it("test_route_files_are_live: the Insights route file is live and loads the real page module; Overview and Overlap are live too", async () => {
    const routes = buildRegistry();
    const byId = (id: string) => routes.find(route => route.id === id)!;
    expect(byId("portfolio-mutual-funds-fund-insights")).toMatchObject({
      status: "live", path: "/portfolio/mutual-funds/funds/:schemeId/insights", label: "Fund Insights", scope: "family-or-member",
    });
    expect((await byId("portfolio-mutual-funds-fund-insights").page!()).default).toBe(InsightsRoute);
    expect(byId("portfolio-mutual-funds-fund").status).toBe("live");
    expect(byId("portfolio-mutual-funds-fund-overlap").status).toBe("live");
  });
});
