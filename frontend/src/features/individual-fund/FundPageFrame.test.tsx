import { useEffect } from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes, useLocation, useParams } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import type { ShellRoute } from "@/shell/registry/types";
import { useScope } from "@/shell/scope/ScopeContext";
import { renderInShell } from "@/shell/testing";
import { deferred } from "./__support__/deferred";
import { FundPageFrame } from "./FundPageFrame";
import { IDS, fixture } from "./fixtures";
import type { SummaryResponse } from "./types";

const api = vi.hoisted(() => ({ summary: vi.fn() }));
vi.mock("./api", () => ({ fundPageApi: api }));

const OVERVIEW = `/portfolio/mutual-funds/funds/${IDS.scheme}`;
const INSIGHTS = `${OVERVIEW}/insights`;
const members = [{ id: IDS.asha, name: "ASHA RAO" }, { id: IDS.dev, name: "Dev Rao" }];
const summary = () => fixture<SummaryResponse>("summary_family");

/** The registry with some placeholder routes switched to live, so the frame is tested apart from the route files. */
function liveRoutes(ids: string[]): ShellRoute[] {
  return buildRegistry().map(route =>
    ids.includes(route.id)
      ? { ...route, status: "live" as const, page: async () => ({ default: () => <h1>{`${route.id} page`}</h1> }) }
      : route,
  );
}
const ROUTES = liveRoutes(["portfolio", "portfolio-mutual-funds-fund", "portfolio-mutual-funds-fund-insights"]);

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function Frame({ tab, children }: { tab: "overview" | "insights"; children?: Parameters<typeof FundPageFrame>[0]["children"] }) {
  const { schemeId = "" } = useParams();
  return <FundPageFrame schemeId={schemeId} tab={tab}>{children ?? (() => <p>page body</p>)}</FundPageFrame>;
}

function mount(path = OVERVIEW, options: Parameters<typeof renderInShell>[1] = {}) {
  return renderInShell(
    <>
      <Routes>
        <Route path="/portfolio/mutual-funds/funds/:schemeId" element={<Frame tab="overview" />} />
        <Route path="/portfolio/mutual-funds/funds/:schemeId/insights" element={<Frame tab="insights" />} />
      </Routes>
      <Location />
    </>,
    { path, routes: ROUTES, ...options },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.summary.mockImplementation(() => Promise.resolve(summary()));
});

describe("FundPageFrame", () => {
  it("shows a loading status and the first two crumbs while the summary loads", () => {
    api.summary.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByRole("status", { name: "Loading fund" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mutual Funds" })).toHaveAttribute("href", "/portfolio/mutual-funds");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("test_breadcrumb_links_use_paths_and_current_fund_is_text", async () => {
    mount();
    const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Investments" })).toHaveAttribute("href", "/portfolio");
    expect(within(nav).getByRole("link", { name: "Mutual Funds" })).toHaveAttribute("href", "/portfolio/mutual-funds");
    const current = within(nav).getByText("Alpha Flexi Cap Fund - Direct Plan");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(within(nav).queryByRole("link", { name: "Alpha Flexi Cap Fund - Direct Plan" })).toBeNull();
  });

  it("on the Insights tab the crumbs link the fund and mark Insights as current", async () => {
    mount(INSIGHTS);
    const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Alpha Flexi Cap Fund - Direct Plan" })).toHaveAttribute("href", OVERVIEW);
    expect(within(nav).getByText("Insights")).toHaveAttribute("aria-current", "page");
  });

  it("test_header_shows_plan_category_amc_and_no_growth_pill", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: "Alpha Flexi Cap Fund - Direct Plan" })).toBeInTheDocument();
    expect(screen.getAllByTestId("fund-pill").map(pill => pill.textContent)).toEqual(["Direct Plan", "Flexi Cap", "Alpha AMC"]);
    expect(screen.queryByText(/growth/i)).toBeNull();
  });

  it("test_logo_uses_scheme_logo_with_initial_fallback", async () => {
    mount();
    const header = await screen.findByTestId("fund-header");
    expect(within(header).getByText("A")).toBeInTheDocument();
  });

  it("test_add_investment_and_more_are_disabled_with_coming_soon_tooltip (a click does nothing)", async () => {
    const openImport = vi.fn();
    mount(OVERVIEW, { openImport });
    for (const button of [await screen.findByRole("button", { name: "Add Investment" }), screen.getByRole("button", { name: "More" })]) {
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAttribute("title", "Coming soon");
      fireEvent.click(button);
    }
    expect(openImport).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent(OVERVIEW);
  });

  it("the tab strip: Overview is current, Overlap is disabled, Insights is a link", async () => {
    mount();
    const tabs = await screen.findByRole("navigation", { name: "Fund sections" });
    expect(within(tabs).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Overview" })).toHaveAttribute("href", OVERVIEW);
    expect(within(tabs).getByText("Overlap")).toHaveAttribute("aria-disabled", "true");
    expect(within(tabs).getByText("Overlap")).toHaveAttribute("title", "Coming soon");
    expect(within(tabs).queryByRole("link", { name: "Overlap" })).toBeNull();
    expect(within(tabs).getByRole("link", { name: "Insights" })).toHaveAttribute("href", INSIGHTS);
    expect(within(tabs).getByRole("link", { name: "Insights" })).not.toHaveAttribute("aria-current");
  });

  it("when the Insights route is not live its tab is the disabled Coming soon tab", async () => {
    const routes = liveRoutes(["portfolio-mutual-funds-fund"]).map(route => (route.id === "portfolio-mutual-funds-fund-insights" ? { ...route, status: "placeholder" as const } : route));
    renderInShell(<FundPageFrame schemeId={IDS.scheme} tab="overview">{() => <p>page body</p>}</FundPageFrame>, { path: OVERVIEW, routes });
    const tabs = await screen.findByRole("navigation", { name: "Fund sections" });
    expect(within(tabs).getByRole("link", { name: "Insights" })).not.toHaveAttribute("href");
    expect(within(tabs).getByText("Insights")).toHaveAttribute("aria-disabled", "true");
  });

  it("test_tab_switch_navigates_and_keeps_member: the same member is asked for after switching tab", async () => {
    mount(OVERVIEW, { scope: { members, viewMode: "member", memberId: IDS.asha } });
    fireEvent.click(await screen.findByRole("link", { name: "Insights" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(INSIGHTS));
    const crumbs = await screen.findByRole("navigation", { name: "Breadcrumb" });
    await waitFor(() => expect(within(crumbs).getByText("Insights")).toHaveAttribute("aria-current", "page"));
    expect(await screen.findByRole("heading", { level: 1, name: "Alpha Flexi Cap Fund - Direct Plan" })).toBeInTheDocument();
    expect(api.summary.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(api.summary.mock.calls.every(call => call[1] === IDS.asha)).toBe(true);
  });

  it("asks for the combined scope in the family view and for the member id in a member view", async () => {
    const first = mount();
    await screen.findByRole("heading", { level: 1 });
    expect(api.summary).toHaveBeenCalledTimes(1);
    expect(api.summary).toHaveBeenCalledWith(IDS.scheme, "combined", expect.any(AbortSignal));
    first.unmount();
    api.summary.mockClear();
    mount(OVERVIEW, { scope: { members, viewMode: "member", memberId: IDS.dev } });
    await screen.findByRole("heading", { level: 1 });
    expect(api.summary).toHaveBeenCalledWith(IDS.scheme, IDS.dev, expect.any(AbortSignal));
  });

  it("test_unknown_scheme_shows_not_found_state with a link back to Mutual Funds", async () => {
    api.summary.mockRejectedValue(new ApiError(404, { detail: "Scheme not found." }));
    mount();
    expect(await screen.findByRole("heading", { name: "Fund not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Mutual Funds" })).toHaveAttribute("href", "/portfolio/mutual-funds");
    expect(screen.queryByText("page body")).toBeNull();
  });

  it("any other failure shows the page error, and Retry asks again", async () => {
    api.summary.mockRejectedValueOnce(new ApiError(500, "down")).mockResolvedValue(summary());
    mount();
    expect(await screen.findByRole("heading", { name: "Couldn't load this fund" })).toBeInTheDocument();
    expect(screen.getByText("There was a problem reaching our servers. Your data is safe — this is just a connection issue.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Alpha Flexi Cap Fund - Direct Plan" })).toBeInTheDocument();
    expect(api.summary).toHaveBeenCalledTimes(2);
  });

  it("aboveTabs is drawn between the title block and the tab strip, and children below the tabs", async () => {
    renderInShell(
      <FundPageFrame schemeId={IDS.scheme} tab="overview" aboveTabs={() => <p>above</p>}>{() => <p>below</p>}</FundPageFrame>,
      { path: OVERVIEW, routes: ROUTES },
    );
    const header = await screen.findByTestId("fund-header");
    const above = screen.getByText("above");
    const tabs = screen.getByRole("navigation", { name: "Fund sections" });
    const below = screen.getByText("below");
    expect(header.compareDocumentPosition(above) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(above.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tabs.compareDocumentPosition(below) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hands the scheme id, scope and summary to its children", async () => {
    renderInShell(
      <FundPageFrame schemeId={IDS.scheme} tab="overview">
        {ctx => <p>{`${ctx.schemeId} | ${ctx.scope} | ${ctx.summary.scheme.name} | ${ctx.refreshing}`}</p>}
      </FundPageFrame>,
      { path: OVERVIEW, routes: ROUTES },
    );
    expect(await screen.findByText(`${IDS.scheme} | combined | Alpha Flexi Cap Fund - Direct Plan | false`)).toBeInTheDocument();
  });

  it("a member switch keeps the children mounted (fund-level sections do not reload) and marks the page as refreshing until the new summary arrives", async () => {
    let mounts = 0;
    function Body({ refreshing }: { refreshing: boolean }) {
      const { setMember } = useScope();
      useEffect(() => { mounts += 1; }, []);
      return <><p>{refreshing ? "refreshing" : "settled"}</p><button type="button" onClick={() => setMember(IDS.dev)}>Pick Dev</button></>;
    }
    const slow = deferred<SummaryResponse>();
    api.summary.mockImplementationOnce(() => Promise.resolve(summary())).mockImplementationOnce(() => slow.promise);
    renderInShell(
      <FundPageFrame schemeId={IDS.scheme} tab="overview">{ctx => <Body refreshing={ctx.refreshing} />}</FundPageFrame>,
      { path: OVERVIEW, routes: ROUTES, scope: { members, viewMode: "aggregate" } },
    );
    expect(await screen.findByText("settled")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pick Dev" }));
    expect(await screen.findByText("refreshing")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Alpha Flexi Cap Fund - Direct Plan" })).toBeInTheDocument();
    expect(api.summary).toHaveBeenLastCalledWith(IDS.scheme, IDS.dev, expect.any(AbortSignal));
    slow.resolve({ ...summary(), scope: IDS.dev });
    expect(await screen.findByText("settled")).toBeInTheDocument();
    expect(mounts).toBe(1);
  });
});
