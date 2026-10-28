import { act, fireEvent, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { useScope } from "@/shell/scope/ScopeContext";
import { renderInShell } from "@/shell/testing";
import OverlapRoute, { OverlapPage } from "./OverlapPage";
import { IDS, fixture } from "./fixtures";
import type { OverlapCompareResponse, OverlapResponse, PerformanceResponse, SummaryResponse, Unavailable } from "./types";

// The kit charts cannot measure a width in jsdom, so they are stubs; everything else is the real page.
vi.mock("@/components/ui/charts", () => ({
  LineAreaChart: () => <div data-testid="line-chart" />,
  PieChart: ({ children }: { children?: ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  PieSlice: ({ index }: { index: number }) => <i data-testid={`pie-slice-${index}`} />,
}));
const api = vi.hoisted(() => ({ summary: vi.fn(), overlap: vi.fn(), overlapCompare: vi.fn(), performance: vi.fn() }));
vi.mock("./api", () => ({ fundPageApi: api }));

const OVERVIEW = `/portfolio/mutual-funds/funds/${IDS.scheme}`;
const PATH = `${OVERVIEW}/overlap`;
const INSIGHTS = `${OVERVIEW}/insights`;
const members = [{ id: IDS.asha, name: "ASHA RAO" }, { id: IDS.dev, name: "Dev Rao" }];
const NAME = "Alpha Flexi Cap Fund - Direct Plan";
const un = (reason: string): Unavailable => ({ status: "unavailable", reason });

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
function Picker() {
  const { setMember } = useScope();
  return <button type="button" onClick={() => setMember(IDS.dev)}>Pick Dev</button>;
}
const mount = (options: Parameters<typeof renderInShell>[1] = {}) =>
  renderInShell(<><OverlapPage schemeId={IDS.scheme} /><Location /><Picker /></>, { path: PATH, ...options });

beforeEach(() => {
  vi.clearAllMocks();
  api.summary.mockImplementation((_id: string, scope: string) =>
    Promise.resolve(fixture<SummaryResponse>(scope === IDS.dev ? "summary_member" : "summary_family")));
  api.overlap.mockImplementation(() => Promise.resolve(fixture<OverlapResponse>("overlap_fund")));
  api.overlapCompare.mockImplementation(() => Promise.resolve(fixture<OverlapCompareResponse>("overlap_compare")));
  api.performance.mockImplementation(() => Promise.resolve(fixture<PerformanceResponse>("performance_1y_equity")));
});

describe("OverlapPage", () => {
  it("renders the shared frame (header, breadcrumb, tabs) with the Overlap tab current, and the normal state below it", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(await screen.findByTestId("overlap-normal")).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Fund sections" });
    expect(within(tabs).getAllByRole("link").map(link => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Overview", OVERVIEW], ["Overlap", PATH], ["Insights", INSIGHTS],
    ]);
    expect(within(tabs).getByRole("link", { name: "Overlap" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(within(tabs).queryByText("Coming soon")).toBeNull();
  });

  it("the breadcrumb links the fund and marks Overlap as the current page", async () => {
    mount();
    const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: NAME })).toHaveAttribute("href", OVERVIEW);
    expect(within(nav).getByText("Overlap")).toHaveAttribute("aria-current", "page");
    expect(within(nav).queryByText("Insights")).toBeNull();
  });

  it("does not show the stat band above the tabs, and asks only the summary and the overlap", async () => {
    mount();
    await screen.findByTestId("overlap-normal");
    expect(screen.queryByRole("region", { name: "Fund summary" })).toBeNull();
    expect(api.summary).toHaveBeenCalledWith(IDS.scheme, "combined", expect.any(AbortSignal));
    expect(api.overlap).toHaveBeenCalledWith(IDS.scheme, "combined", expect.any(AbortSignal));
    expect(api.performance).not.toHaveBeenCalled();
    expect(api.overlapCompare).not.toHaveBeenCalled();
  });

  it("the Overlap tab does not request anything before the summary has loaded (a missing fund never asks for its overlap)", async () => {
    api.summary.mockRejectedValue(new ApiError(404, { detail: "Not found" }));
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: "Fund not found" })).toBeInTheDocument();
    expect(api.overlap).not.toHaveBeenCalled();
  });

  it("test_row_click_switches_to_comparison_without_changing_url_and_back_control_returns, inside the frame", async () => {
    mount();
    await screen.findByTestId("overlap-normal");
    fireEvent.click(screen.getByRole("option", { name: /Golden Peer 1 Fund/ }));
    expect(await screen.findByTestId("overlap-comparison")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(PATH);
    expect(screen.getByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    await screen.findByRole("tablist", { name: "Comparison views" });
    fireEvent.click(screen.getByRole("button", { name: `Back to ${NAME}'s overlap` }));
    expect(screen.getByTestId("overlap-normal")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(PATH);
  });

  it("fund-value consistency: the comparison header's value for this fund is the page's own current value in the same view", async () => {
    mount();
    await screen.findByTestId("overlap-normal");
    fireEvent.click(screen.getByRole("option", { name: /Golden Peer 1 Fund/ }));
    const a = await screen.findByTestId("compare-fund-a");
    expect(a).toHaveTextContent(NAME);
    expect(a).toHaveTextContent("Current value ₹2,250");
    expect(fixture<SummaryResponse>("summary_family").tiles.current_value).toBe("2250.00");
  });

  it("test_member_scope_change_refetches_and_resets_comparison_to_normal", async () => {
    mount({ scope: { members, viewMode: "aggregate" } });
    await screen.findByTestId("overlap-normal");
    fireEvent.click(screen.getByRole("option", { name: /Golden Peer 1 Fund/ }));
    await screen.findByRole("tablist", { name: "Comparison views" });
    expect(api.overlapCompare).toHaveBeenCalledWith(IDS.scheme, IDS.peer1, "combined", expect.any(AbortSignal));
    api.overlap.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Pick Dev" }));
    await act(async () => {});
    expect(await screen.findByTestId("overlap-normal")).toBeInTheDocument();
    expect(screen.queryByTestId("overlap-comparison")).toBeNull();
    expect(api.overlap).toHaveBeenCalledWith(IDS.scheme, IDS.dev, expect.any(AbortSignal));
    expect(api.summary).toHaveBeenLastCalledWith(IDS.scheme, IDS.dev, expect.any(AbortSignal));
  });

  it("a member who does not hold the fund sees the explanation, not an error, and the frame is still there", async () => {
    api.overlap.mockImplementation((_id: string, scope: string) =>
      Promise.resolve(scope === IDS.dev ? un("not_held") : fixture<OverlapResponse>("overlap_fund")));
    api.summary.mockImplementation((_id: string, scope: string) =>
      Promise.resolve(fixture<SummaryResponse>(scope === IDS.dev ? "summary_not_held" : "summary_family")));
    mount({ scope: { members, viewMode: "member", memberId: IDS.dev } });
    expect(await screen.findByTestId("section-unavailable")).toHaveTextContent("You don't hold this fund in this view.");
    expect(screen.getByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("test_overlap_tab_enabled_in_FundTabs_and_route_is_live: the real route renders this page inside the shell at the overlap URL", async () => {
    renderInShell(undefined, { path: PATH });
    expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(await screen.findByTestId("overlap-normal")).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(screen.getByTestId("fund-page"));
    expect(api.overlap).toHaveBeenCalledWith(IDS.scheme, "combined", expect.any(AbortSignal));
  });

  it("test_route_files_are_live: all three Individual Fund routes are live and load their real page modules", async () => {
    const routes = buildRegistry();
    const byId = (id: string) => routes.find(route => route.id === id)!;
    expect(byId("portfolio-mutual-funds-fund-overlap")).toMatchObject({
      status: "live", path: "/portfolio/mutual-funds/funds/:schemeId/overlap", label: "Fund Overlap", scope: "family-or-member",
    });
    expect((await byId("portfolio-mutual-funds-fund-overlap").page!()).default).toBe(OverlapRoute);
    expect(byId("portfolio-mutual-funds-fund").status).toBe("live");
    expect(byId("portfolio-mutual-funds-fund-insights").status).toBe("live");
  });

  it("when the Overlap route is not live its tab is the disabled Coming soon tab again", async () => {
    const routes = buildRegistry().map(route => (route.id === "portfolio-mutual-funds-fund-overlap" ? { ...route, status: "placeholder" as const } : route));
    renderInShell(<OverlapPage schemeId={IDS.scheme} />, { path: PATH, routes });
    const tabs = await screen.findByRole("navigation", { name: "Fund sections" });
    expect(within(tabs).getByText("Overlap")).toHaveAttribute("aria-disabled", "true");
    expect(within(tabs).getByText("Overlap")).toHaveAttribute("title", "Coming soon");
    expect(within(tabs).getByRole("link", { name: "Overlap" })).not.toHaveAttribute("href");
  });
});
