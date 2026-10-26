import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { useScope } from "@/shell/scope/ScopeContext";
import { renderInShell } from "@/shell/testing";
import { deferred } from "./__support__/deferred";
import OverviewRoute, { OverviewPage } from "./OverviewPage";
import { IDS, fixture } from "./fixtures";
import type {
  CategoryReturnsResponse, CategorySeriesResponse, InceptionReturnsResponse, PerformanceResponse, ScoreResponse, SummaryResponse, Unavailable,
} from "./types";

// The kit chart cannot measure a width in jsdom, so it is a stub; everything else is the real page.
vi.mock("@/components/ui/charts", () => ({ LineAreaChart: () => <div data-testid="line-chart" /> }));
const api = vi.hoisted(() => ({
  summary: vi.fn(), performance: vi.fn(), returns: vi.fn(), score: vi.fn(), categorySeries: vi.fn(), categoryReturns: vi.fn(),
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
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(await screen.findByText("Category comparison is not available for this fund yet.")).toBeInTheDocument();
    expect(screen.getAllByTestId("section-unavailable")).toHaveLength(2);
    expect(screen.getByTestId("tile-value-figure")).toHaveTextContent("₹2,250");
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
    for (const fn of Object.values(api)) fn.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Pick Dev" }));
    await act(async () => {});
    expect(api.summary).toHaveBeenCalledWith(IDS.scheme, IDS.dev, expect.any(AbortSignal));
    expect(api.score).toHaveBeenCalledWith(IDS.scheme, IDS.dev, expect.any(AbortSignal));
    expect(api.returns).toHaveBeenCalledWith(IDS.scheme, "inception", IDS.dev, expect.any(AbortSignal));
    expect(api.performance).not.toHaveBeenCalled();
    expect(api.categorySeries).not.toHaveBeenCalled();
    expect(api.categoryReturns).not.toHaveBeenCalled();
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
});

describe("Overview route", () => {
  it("the real route renders the page inside the shell at the fund URL, and the family view asks for the combined scope", async () => {
    renderInShell(undefined, { path: PATH });
    expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(await screen.findByTestId("tile-value-figure")).toHaveTextContent("₹2,250");
    expect(screen.getByRole("main")).toContainElement(screen.getByTestId("fund-page"));
    expect(api.summary).toHaveBeenCalledWith(IDS.scheme, "combined", expect.any(AbortSignal));
  });

  it("test_route_files_are_live_and_overlap_is_placeholder: the fund route is live, its page loads, Insights and Overlap are still placeholders", async () => {
    const routes = buildRegistry();
    const byId = (id: string) => routes.find(route => route.id === id)!;
    expect(byId("portfolio-mutual-funds-fund")).toMatchObject({ status: "live", path: "/portfolio/mutual-funds/funds/:schemeId", label: "Fund Overview", scope: "family-or-member" });
    expect(byId("portfolio-mutual-funds-fund-insights").status).toBe("placeholder");
    expect(byId("portfolio-mutual-funds-fund-overlap").status).toBe("placeholder");
    const page = await byId("portfolio-mutual-funds-fund").page!();
    expect(page.default).toBe(OverviewRoute);
  });
});
