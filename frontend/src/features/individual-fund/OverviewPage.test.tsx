import { act, fireEvent, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { useScope } from "@/shell/scope/ScopeContext";
import { renderInShell } from "@/shell/testing";
import { liveFundRoutes } from "./__support__/liveRoutes";
import { deferred } from "./__support__/deferred";
import OverviewRoute, { OverviewPage } from "./OverviewPage";
import { IDS, fixture } from "./fixtures";
import type {
  CategoryReturnsResponse, CategorySeriesResponse, CompositionResponse, HoldingsListResponse, InceptionReturnsResponse, PerformanceResponse,
  RiskResponse, ScoreResponse, SummaryResponse, Unavailable,
} from "./types";

// The kit charts cannot measure a width in jsdom, so they are stubs; everything else is the real page.
vi.mock("@/components/ui/charts", () => ({
  LineAreaChart: () => <div data-testid="line-chart" />,
  PieChart: ({ children }: { children?: ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  PieSlice: ({ index }: { index: number }) => <i data-testid={`pie-slice-${index}`} />,
}));
const api = vi.hoisted(() => ({
  summary: vi.fn(), performance: vi.fn(), returns: vi.fn(), score: vi.fn(), categorySeries: vi.fn(), categoryReturns: vi.fn(),
  risk: vi.fn(), composition: vi.fn(), holdings: vi.fn(), folioNumber: vi.fn(),
}));
vi.mock("./api", () => ({ fundPageApi: api }));

const PATH = `/portfolio/mutual-funds/funds/${IDS.scheme}`;
const members = [{ id: IDS.asha, name: "ASHA RAO" }, { id: IDS.dev, name: "Dev Rao" }, { id: IDS.meera, name: "Meera Rao" }];
const NAME = "Alpha Flexi Cap Fund - Direct Plan";

function setDefaults() {
  api.summary.mockImplementation(() => Promise.resolve(fixture<SummaryResponse>("summary_family")));
  api.performance.mockImplementation(() => Promise.resolve(fixture<PerformanceResponse>("performance_1y_equity")));
  api.returns.mockImplementation((_id: string, mode: string) => Promise.resolve(mode === "current" ? fixture("returns_current") : fixture<InceptionReturnsResponse>("returns_inception")));
  api.score.mockImplementation(() => Promise.resolve(fixture<ScoreResponse>("score_stored")));
  api.categorySeries.mockImplementation(() => Promise.resolve(fixture<CategorySeriesResponse>("peers_series_1y")));
  api.categoryReturns.mockImplementation(() => Promise.resolve(fixture<CategoryReturnsResponse>("peers_returns")));
  api.risk.mockImplementation(() => Promise.resolve(fixture<RiskResponse>("risk_equity")));
  api.composition.mockImplementation(() => Promise.resolve(fixture<CompositionResponse>("composition")));
  api.holdings.mockImplementation(() => Promise.resolve(fixture<HoldingsListResponse>("holdings_all")));
}

function mount(options: Parameters<typeof renderInShell>[1] = {}) {
  return renderInShell(<OverviewPage schemeId={IDS.scheme} />, { path: PATH, ...options });
}

beforeEach(() => {
  vi.clearAllMocks();
  setDefaults();
});

describe("OverviewPage", () => {
  it("renders the header, the stat band, the performance chart and the returns table from the fixtures", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(await screen.findByTestId("tile-value-figure")).toHaveTextContent("₹2,250");
    expect(await screen.findByTestId("score-number")).toHaveTextContent("72");
    expect(await screen.findByRole("heading", { name: "Performance" })).toBeInTheDocument();
    expect(await screen.findByTestId("line-chart")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Returns" })).toBeInTheDocument();
    expect(await screen.findByTestId("cell-fund-1Y")).toHaveTextContent("10.0%");
  });

  it("test_layout_classes_two_columns_overview: 62 / 38 from 1280 px, performance then returns on the left", async () => {
    mount();
    const grid = await screen.findByTestId("overview-grid");
    expect(grid.className).toContain("xl:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]");
    const left = screen.getByTestId("overview-left");
    expect(grid.firstElementChild).toBe(left);
    expect(screen.getByTestId("overview-right")).toBeInTheDocument();
    const performance = screen.getByRole("heading", { name: "Performance" });
    const returns = screen.getByRole("heading", { name: "Returns" });
    expect(left).toContainElement(performance);
    expect(left).toContainElement(returns);
    expect(performance.compareDocumentPosition(returns) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the stat band sits between the title block and the tab strip", async () => {
    mount();
    const band = await screen.findByRole("region", { name: "Fund summary" });
    const tabs = screen.getByRole("navigation", { name: "Fund sections" });
    expect(screen.getByTestId("fund-header").compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(band.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("test_tier1_and_2_render_before_tier3_resolves: summary, performance and inception returns show while the score and the category are pending", async () => {
    const score = deferred<ScoreResponse>();
    const categorySeries = deferred<CategorySeriesResponse>();
    const categoryReturns = deferred<CategoryReturnsResponse>();
    api.score.mockReturnValue(score.promise);
    api.categorySeries.mockReturnValue(categorySeries.promise);
    api.categoryReturns.mockReturnValue(categoryReturns.promise);
    mount();
    expect(await screen.findByTestId("tile-value-figure")).toHaveTextContent("₹2,250");
    expect(await screen.findByTestId("line-chart")).toBeInTheDocument();
    expect(await screen.findByTestId("cell-fund-1Y")).toHaveTextContent("10.0%");
    expect(screen.getByRole("status", { name: "Loading score" })).toBeInTheDocument();
    expect(screen.getByTestId("legend-category-figure")).toHaveTextContent("…");
    expect(screen.getByTestId("cell-category-1Y")).toHaveAttribute("data-state", "pending");
    await act(async () => {
      score.resolve(fixture<ScoreResponse>("score_stored"));
      categorySeries.resolve(fixture<CategorySeriesResponse>("peers_series_1y"));
      categoryReturns.resolve(fixture<CategoryReturnsResponse>("peers_returns"));
    });
    expect(screen.getByTestId("score-number")).toHaveTextContent("72");
    expect(screen.getByTestId("legend-category-figure")).toHaveTextContent("+13.1%");
    expect(screen.getByTestId("cell-category-1Y")).toHaveTextContent("13.1%");
  });

  it("test_failed_card_shows_error_and_retry_refetches_only_that_card (the score)", async () => {
    api.score.mockRejectedValueOnce(new Error("down")).mockImplementation(() => Promise.resolve(fixture<ScoreResponse>("score_stored")));
    mount();
    expect(await screen.findByText("Couldn't load the score.")).toBeInTheDocument();
    expect(screen.getByTestId("tile-value-figure")).toHaveTextContent("₹2,250");
    const before = { summary: api.summary.mock.calls.length, performance: api.performance.mock.calls.length, returns: api.returns.mock.calls.length };
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("score-number")).toHaveTextContent("72");
    expect(api.score).toHaveBeenCalledTimes(2);
    expect({ summary: api.summary.mock.calls.length, performance: api.performance.mock.calls.length, returns: api.returns.mock.calls.length }).toEqual(before);
  });

  it("a failed performance does not blank the other cards", async () => {
    api.performance.mockRejectedValue(new Error("down"));
    mount();
    expect(await screen.findByText("Couldn't load performance.")).toBeInTheDocument();
    expect(await screen.findByTestId("cell-fund-1Y")).toHaveTextContent("10.0%");
    expect(screen.getByTestId("tile-value-figure")).toHaveTextContent("₹2,250");
  });

  it("test_no_section_throws_on_all_unavailable_payloads: the page still renders", async () => {
    const un = (reason: string): Unavailable => ({ status: "unavailable", reason });
    api.performance.mockImplementation(() => Promise.resolve(un("no_history")));
    api.returns.mockImplementation(() => Promise.resolve(un("no_history")));
    api.score.mockImplementation(() => Promise.resolve(un("peers_unavailable")));
    api.categorySeries.mockImplementation(() => Promise.resolve(un("peers_unavailable")));
    api.categoryReturns.mockImplementation(() => Promise.resolve(un("peers_unavailable")));
    api.risk.mockImplementation(() => Promise.resolve(un("no_history")));
    api.composition.mockImplementation(() => Promise.resolve(un("no_disclosure")));
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(await screen.findByText("Category comparison is not available for this fund yet.")).toBeInTheDocument();
    // Performance, Returns, Top 10 Holdings and Fund Allocation each print their own reason; Risk Metrics has its own short message.
    await screen.findByTestId("risk-unavailable");
    expect(screen.getAllByTestId("section-unavailable")).toHaveLength(4);
    expect(screen.getByTestId("risk-unavailable")).toHaveTextContent("Not enough history to show risk figures yet.");
    expect(screen.getAllByText("Holdings not available yet for this fund house.")).toHaveLength(2);
    expect(screen.getByTestId("tile-value-figure")).toHaveTextContent("₹2,250");
    expect(screen.getByTestId("detail-value-value")).toHaveTextContent("₹2,250");
  });

  it("test_family_scope_default_combined: every scoped request says combined", async () => {
    mount();
    await screen.findByTestId("tile-value-figure");
    await screen.findByTestId("score-number");
    expect(api.summary).toHaveBeenCalledWith(IDS.scheme, "combined", expect.any(AbortSignal));
    expect(api.score).toHaveBeenCalledWith(IDS.scheme, "combined", expect.any(AbortSignal));
    expect(api.returns).toHaveBeenCalledWith(IDS.scheme, "inception", "combined", expect.any(AbortSignal));
    expect(api.performance).toHaveBeenCalledWith(IDS.scheme, "1Y", expect.any(AbortSignal));
  });

  it("a member view asks for that member's summary, score and returns", async () => {
    api.summary.mockImplementation(() => Promise.resolve(fixture<SummaryResponse>("summary_member")));
    mount({ scope: { members, viewMode: "member", memberId: IDS.asha } });
    await screen.findByTestId("tile-value-figure");
    expect(screen.getByTestId("tile-value-figure")).toHaveTextContent("₹1,500");
    expect(api.summary).toHaveBeenCalledWith(IDS.scheme, IDS.asha, expect.any(AbortSignal));
    expect(api.score).toHaveBeenCalledWith(IDS.scheme, IDS.asha, expect.any(AbortSignal));
    expect(api.returns).toHaveBeenCalledWith(IDS.scheme, "inception", IDS.asha, expect.any(AbortSignal));
  });

  it("test_member_switch_aborts_inflight_and_refetches_personal_sections_only", async () => {
    function Picker() {
      const { setMember } = useScope();
      return <button type="button" onClick={() => setMember(IDS.dev)}>Pick Dev</button>;
    }
    renderInShell(<><OverviewPage schemeId={IDS.scheme} /><Picker /></>, { path: PATH, scope: { members, viewMode: "aggregate" } });
    await screen.findByTestId("tile-value-figure");
    await screen.findByTestId("score-number");
    await screen.findByTestId("cell-category-1Y");
    await screen.findByTestId("legend-category-figure");
    await screen.findByTestId("risk-row-volatility");
    await screen.findByTestId("top-row-1");
    for (const fn of Object.values(api)) fn.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Pick Dev" }));
    await act(async () => {});
    expect(api.summary).toHaveBeenCalledWith(IDS.scheme, IDS.dev, expect.any(AbortSignal));
    expect(api.score).toHaveBeenCalledWith(IDS.scheme, IDS.dev, expect.any(AbortSignal));
    expect(api.returns).toHaveBeenCalledWith(IDS.scheme, "inception", IDS.dev, expect.any(AbortSignal));
    expect(api.performance).not.toHaveBeenCalled();
    expect(api.categorySeries).not.toHaveBeenCalled();
    expect(api.categoryReturns).not.toHaveBeenCalled();
    expect(api.risk).not.toHaveBeenCalled();
    expect(api.composition).not.toHaveBeenCalled();
  });

  it("a member switch while the summary is still loading aborts the request in flight", async () => {
    const signals: AbortSignal[] = [];
    api.summary.mockImplementation((_id: string, _scope: string, signal: AbortSignal) => { signals.push(signal); return new Promise(() => {}); });
    function Picker() {
      const { setMember } = useScope();
      return <button type="button" onClick={() => setMember(IDS.dev)}>Pick Dev</button>;
    }
    renderInShell(<><OverviewPage schemeId={IDS.scheme} /><Picker /></>, { path: PATH, scope: { members, viewMode: "aggregate" } });
    expect(await screen.findByRole("status", { name: "Loading fund" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pick Dev" }));
    await act(async () => {});
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it("test_not_held_member_shows_fund_level_cards: the tiles say who holds it, the chart and the table stay", async () => {
    api.summary.mockImplementation(() => Promise.resolve(fixture<SummaryResponse>("summary_not_held")));
    mount({ scope: { members, viewMode: "member", memberId: IDS.meera } });
    expect(await screen.findByTestId("not-held")).toHaveTextContent("Not held by Meera Rao");
    expect(await screen.findByTestId("line-chart")).toBeInTheDocument();
    expect(await screen.findByTestId("cell-fund-1Y")).toHaveTextContent("10.0%");
    expect(screen.getByTestId("score-number")).toHaveTextContent("72");
  });

  it("an unknown fund shows the not found page and no sections", async () => {
    api.summary.mockRejectedValue(new ApiError(404, { detail: "Scheme not found." }));
    mount();
    expect(await screen.findByRole("heading", { name: "Fund not found" })).toBeInTheDocument();
    expect(screen.queryByTestId("overview-grid")).toBeNull();
  });

  it("the right column holds Your Investment Details, Risk Metrics and Fund Allocation, and Top 10 Holdings sits under Returns on the left", async () => {
    mount();
    await screen.findByTestId("overview-grid");
    const right = screen.getByTestId("overview-right");
    const left = screen.getByTestId("overview-left");
    expect(await within(right).findByRole("heading", { name: "Your Investment Details" })).toBeInTheDocument();
    expect(await within(right).findByRole("heading", { name: "Risk Metrics (3Y)" })).toBeInTheDocument();
    expect(await within(right).findByRole("heading", { name: "Fund Allocation" })).toBeInTheDocument();
    const top = await within(left).findByRole("heading", { name: "Top 10 Holdings (38 stocks)" });
    const returns = within(left).getByRole("heading", { name: "Returns" });
    expect(returns.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const headings = (root: HTMLElement) => within(root).getAllByRole("heading", { level: 3 }).map(h => h.textContent);
    expect(headings(left)).toEqual(["Performance", "Returns", "Top 10 Holdings (38 stocks)"]);
    expect(headings(right)).toEqual(["Your Investment Details", "Risk Metrics (3Y)", "Fund Allocation"]);
  });

  it("test_narrow_order: below 1280 px the six cards flow Performance, Details, Returns, Risk, Top 10, Allocation (order classes), and from 1280 px the two stacks are columns", async () => {
    mount();
    await screen.findByTestId("overview-grid");
    const slots = ["performance", "details", "returns", "risk", "top-holdings", "allocation"];
    slots.forEach((slot, index) => {
      const el = screen.getByTestId(`slot-${slot}`);
      expect(el.className).toContain(`order-${index + 1}`);
      expect(el.className).toContain("xl:order-none");
    });
    for (const id of ["overview-left", "overview-right"]) {
      expect(screen.getByTestId(id).className).toContain("contents");
      expect(screen.getByTestId(id).className).toContain("xl:block");
      expect(screen.getByTestId(id).className).toContain("xl:space-y-5");
    }
    expect(within(screen.getByTestId("overview-left")).getByTestId("slot-top-holdings")).toBeInTheDocument();
    expect(within(screen.getByTestId("overview-right")).getByTestId("slot-risk")).toBeInTheDocument();
  });

  it("test_tier2_cards_load_on_their_own: Risk Metrics, Top 10 Holdings and Fund Allocation show their loading status while the rest of the page is already there", async () => {
    const risk = deferred<RiskResponse>();
    const composition = deferred<CompositionResponse>();
    api.risk.mockReturnValue(risk.promise);
    api.composition.mockReturnValue(composition.promise);
    mount();
    expect(await screen.findByTestId("detail-value-value")).toHaveTextContent("₹2,250");
    expect(await screen.findByTestId("cell-fund-1Y")).toHaveTextContent("10.0%");
    expect(screen.getByRole("status", { name: "Loading risk metrics" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading holdings" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading allocation" })).toBeInTheDocument();
    await act(async () => {
      risk.resolve(fixture<RiskResponse>("risk_equity"));
      composition.resolve(fixture<CompositionResponse>("composition"));
    });
    expect(screen.getByTestId("risk-volatility-value")).toHaveTextContent("14.2%");
    expect(screen.getByTestId("top-row-1")).toHaveTextContent("HDFC Bank Ltd");
    expect(screen.getByTestId("alloc-row-0")).toHaveTextContent("Large Cap");
  });

  it("the composition is fetched once for both Top 10 Holdings and Fund Allocation, with no scope; the risk figures likewise", async () => {
    mount();
    await screen.findByTestId("top-row-1");
    await screen.findByTestId("alloc-row-0");
    await screen.findByTestId("risk-row-volatility");
    expect(api.composition).toHaveBeenCalledTimes(1);
    expect(api.composition).toHaveBeenCalledWith(IDS.scheme, expect.any(AbortSignal));
    expect(api.risk).toHaveBeenCalledTimes(1);
    expect(api.risk).toHaveBeenCalledWith(IDS.scheme, expect.any(AbortSignal));
    expect(api.holdings).not.toHaveBeenCalled();
  });

  it("test_failed_card_shows_error_and_retry_refetches_only_that_card (Risk Metrics)", async () => {
    api.risk.mockRejectedValueOnce(new Error("down")).mockImplementation(() => Promise.resolve(fixture<RiskResponse>("risk_equity")));
    mount();
    expect(await screen.findByText("Couldn't load risk metrics.")).toBeInTheDocument();
    expect(await screen.findByTestId("top-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("detail-value-value")).toHaveTextContent("₹2,250");
    const before = { summary: api.summary.mock.calls.length, composition: api.composition.mock.calls.length, performance: api.performance.mock.calls.length };
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("risk-row-volatility")).toBeInTheDocument();
    expect(api.risk).toHaveBeenCalledTimes(2);
    expect({ summary: api.summary.mock.calls.length, composition: api.composition.mock.calls.length, performance: api.performance.mock.calls.length }).toEqual(before);
  });

  it("a failed composition shows an error in both cards that use it, and one Retry brings both back", async () => {
    api.composition.mockRejectedValueOnce(new Error("down")).mockImplementation(() => Promise.resolve(fixture<CompositionResponse>("composition")));
    mount();
    expect(await screen.findByText("Couldn't load holdings.")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load allocation.")).toBeInTheDocument();
    expect(await screen.findByTestId("risk-volatility-value")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    expect(await screen.findByTestId("top-row-1")).toBeInTheDocument();
    expect(await screen.findByTestId("alloc-row-0")).toBeInTheDocument();
    expect(api.composition).toHaveBeenCalledTimes(2);
  });

  it("the allocation centre shows the household's current value for this scope", async () => {
    mount();
    expect(await screen.findByTestId("alloc-centre-value")).toHaveTextContent("₹2,250");
    expect(screen.getByTestId("alloc-centre-label")).toHaveTextContent("Current value");
  });

  it("test_not_held_member_shows_fund_level_cards (right column): the details say who does not hold it, the risk, holdings and allocation stay, and the centre reads 100%", async () => {
    api.summary.mockImplementation(() => Promise.resolve(fixture<SummaryResponse>("summary_not_held")));
    mount({ scope: { members, viewMode: "member", memberId: IDS.meera } });
    expect(await screen.findByTestId("details-not-held")).toHaveTextContent("Not held by Meera Rao.");
    expect(await screen.findByTestId("risk-volatility-value")).toHaveTextContent("14.2%");
    expect(await screen.findByTestId("top-row-1")).toHaveTextContent("HDFC Bank Ltd");
    expect(await screen.findByTestId("alloc-centre-value")).toHaveTextContent("100%");
    expect(screen.queryByTestId("detail-units")).toBeNull();
  });

  it("a member's own numbers show in the details after the switch, and the folio list follows the scope", async () => {
    api.summary.mockImplementation((_id: string, scope: string) =>
      Promise.resolve(fixture<SummaryResponse>(scope === IDS.asha ? "summary_member" : "summary_family")));
    mount({ scope: { members, viewMode: "member", memberId: IDS.asha } });
    expect(await screen.findByTestId("detail-value-value")).toHaveTextContent("₹1,500");
    expect(screen.getByTestId("detail-units-value")).toHaveTextContent("100.000");
    expect(screen.getByTestId(`folio-${IDS.folioAsha}`)).toHaveTextContent("Folio number");
  });
});

describe("Overview route", () => {
  it("the real route renders the page inside the shell at the fund URL, and the family view asks for the combined scope", async () => {
    renderInShell(undefined, { path: PATH, routes: liveFundRoutes() });
    expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(await screen.findByTestId("tile-value-figure")).toHaveTextContent("₹2,250");
    expect(screen.getByRole("main")).toContainElement(screen.getByTestId("fund-page"));
    expect(api.summary).toHaveBeenCalledWith(IDS.scheme, "combined", expect.any(AbortSignal));
  });

  it("test_route_files_are_live_and_overlap_is_placeholder: both fund route files are placeholders for now, the page modules still load and Overlap is a placeholder", async () => {
    const routes = buildRegistry();
    const byId = (id: string) => routes.find(route => route.id === id)!;
    // IF page not exposed yet, register C166, flip status and page when the Individual Fund backend ships.
    expect(byId("portfolio-mutual-funds-fund")).toMatchObject({ status: "placeholder", path: "/portfolio/mutual-funds/funds/:schemeId", label: "Fund Overview", scope: "family-or-member" });
    expect((await byId("portfolio-mutual-funds-fund").page!()).default).toBe((await import("@/shell/layout/PlaceholderPage")).default);
    expect(byId("portfolio-mutual-funds-fund-insights")).toMatchObject({ status: "placeholder" });
    expect(byId("portfolio-mutual-funds-fund-overlap").status).toBe("placeholder");
    // The page module itself still loads; the real-route test above mounts it through a live override.
    expect(OverviewRoute).toBeTypeOf("function");
    expect((await import("./OverviewPage")).default).toBeTypeOf("function");
  });
});
