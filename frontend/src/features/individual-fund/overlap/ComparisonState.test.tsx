import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { deferred } from "../__support__/deferred";
import type { FundPageContext } from "../FundPageFrame";
import { IDS, fixture } from "../fixtures";
import type { OverlapCompareResponse, PerformanceResponse, SummaryResponse, Unavailable } from "../types";
import { ComparisonState } from "./ComparisonState";

interface PieStubProps { data: { label: string; value: number }[]; children?: ReactNode }
vi.mock("@/components/ui/charts", () => ({
  PieChart: (props: PieStubProps) => <div data-testid="pie-chart">{props.children}</div>,
  PieSlice: ({ index }: { index: number }) => <i data-testid={`pie-slice-${index}`} />,
  LineAreaChart: () => <div data-testid="line-chart" />,
}));

const api = vi.hoisted(() => ({ overlapCompare: vi.fn(), performance: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const A = "Alpha Flexi Cap Fund - Direct Plan";
const B = "Golden Peer 1 Fund";
const compare = () => fixture<OverlapCompareResponse>("overlap_compare");
const ctx = (over: Partial<FundPageContext> = {}): FundPageContext => ({
  schemeId: IDS.scheme, scope: "combined", summary: fixture<SummaryResponse>("summary_family"), refreshing: false, ...over,
});
const tabs = () => within(screen.getByRole("tablist", { name: "Comparison views" })).getAllByRole("tab");
const tab = (name: string) => screen.getByRole("tab", { name });

function mount(props: { context?: FundPageContext; onBack?: () => void } = {}) {
  const onBack = props.onBack ?? vi.fn();
  render(<ComparisonState ctx={props.context ?? ctx()} otherSchemeId={IDS.peer1} onBack={onBack} />);
  return onBack;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.overlapCompare.mockImplementation(() => Promise.resolve(compare()));
  api.performance.mockImplementation((id: string) =>
    Promise.resolve(fixture<PerformanceResponse>(id === IDS.scheme ? "performance_1y_equity" : "performance_all_young_fund")));
});

describe("ComparisonState", () => {
  it("asks for the pair in the page's scope, and focuses its heading when it opens (a screen reader hears the new state)", async () => {
    mount();
    expect(screen.getByRole("heading", { level: 2, name: "Fund comparison" })).toHaveFocus();
    expect(api.overlapCompare).toHaveBeenCalledWith(IDS.scheme, IDS.peer1, "combined", expect.any(AbortSignal));
    await screen.findByRole("tablist");
  });

  it("asks in the member's scope when a member is chosen", async () => {
    mount({ context: ctx({ scope: IDS.dev }) });
    await screen.findByRole("tablist");
    expect(api.overlapCompare).toHaveBeenCalledWith(IDS.scheme, IDS.peer1, IDS.dev, expect.any(AbortSignal));
  });

  it("asks again when the scope changes under it", async () => {
    const { rerender } = render(<ComparisonState ctx={ctx()} otherSchemeId={IDS.peer1} onBack={() => {}} />);
    await screen.findByRole("tablist");
    rerender(<ComparisonState ctx={ctx({ scope: IDS.dev })} otherSchemeId={IDS.peer1} onBack={() => {}} />);
    await waitFor(() => expect(api.overlapCompare).toHaveBeenLastCalledWith(IDS.scheme, IDS.peer1, IDS.dev, expect.any(AbortSignal)));
  });

  it("while loading, the Back control and the heading are already there and a status is announced", () => {
    api.overlapCompare.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByRole("status", { name: "Loading comparison" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Back to ${A}'s overlap` })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("the labelled Back control hands control back to the tab (test_row_click_..._and_back_control_returns, component half)", async () => {
    const onBack = mount();
    await screen.findByRole("tablist");
    fireEvent.click(screen.getByRole("button", { name: `Back to ${A}'s overlap` }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("header: both funds with their logo, name and current value, then the overlap donut with its caption", async () => {
    mount();
    const a = await screen.findByTestId("compare-fund-a");
    expect(a).toHaveTextContent(A);
    expect(a).toHaveTextContent("Current value ₹2,250");
    expect(screen.getByTestId("compare-fund-b")).toHaveTextContent(B);
    expect(screen.getByTestId("compare-fund-b")).toHaveTextContent("Current value ₹120");
    expect(screen.getByTestId("overlap-donut-figure")).toHaveTextContent("18.0%");
    expect(screen.getByTestId("overlap-donut-label")).toHaveTextContent("overlap");
    expect(screen.getByTestId("overlap-donut-caption")).toHaveTextContent("3 common stocks out of 12 and 3 total holdings respectively");
  });

  it("fund-value consistency: fund A's value in the comparison header is the page's own current value, and its name the page's fund", async () => {
    const summary = fixture<SummaryResponse>("summary_family");
    mount({ context: ctx({ summary }) });
    const a = await screen.findByTestId("compare-fund-a");
    expect(summary.tiles.current_value).toBe("2250.00");
    expect(a).toHaveTextContent("Current value ₹2,250");
    expect(a).toHaveTextContent(summary.scheme.name);
  });

  it("test_six_comparison_subtabs_with_persistent_selection: six tabs, Overview first with its counts, and the choice stays selected", async () => {
    mount();
    await screen.findByRole("tablist");
    expect(tabs().map(t => t.textContent)).toEqual(["Overview", "Common Holdings", "Unique Holdings", "Sector Comparison", "Market Cap Comparison", "Performance Comparison"]);
    expect(tab("Overview")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("count-common")).toHaveTextContent("3");
    fireEvent.click(tab("Sector Comparison"));
    expect(tab("Sector Comparison")).toHaveAttribute("aria-selected", "true");
    expect(tab("Overview")).toHaveAttribute("aria-selected", "false");
    expect(within(screen.getByRole("tabpanel", { name: "Sector Comparison" })).getByRole("table", { name: "Sector comparison" })).toBeInTheDocument();
    expect(screen.queryByTestId("count-common")).toBeNull();
  });

  it("each sub-tab shows its own panel", async () => {
    mount();
    await screen.findByRole("tablist");
    fireEvent.click(tab("Common Holdings"));
    expect(screen.getByRole("table", { name: "Common holdings of the two funds" })).toBeInTheDocument();
    fireEvent.click(tab("Unique Holdings"));
    expect(screen.getByRole("region", { name: `Unique to ${A}` })).toBeInTheDocument();
    fireEvent.click(tab("Market Cap Comparison"));
    expect(screen.getByRole("table", { name: "Market cap comparison" })).toBeInTheDocument();
    fireEvent.click(tab("Overview"));
    expect(screen.getByTestId("impact-donut")).toBeInTheDocument();
  });

  it("test_performance_comparison_calls_performance_endpoint_for_both_funds: nothing is requested until the sub-tab opens, then once for each fund", async () => {
    mount();
    await screen.findByRole("tablist");
    expect(api.performance).not.toHaveBeenCalled();
    fireEvent.click(tab("Performance Comparison"));
    await screen.findByTestId("line-chart");
    expect(api.performance.mock.calls.map(call => [call[0], call[1]])).toEqual(expect.arrayContaining([[IDS.scheme, "1Y"], [IDS.peer1, "1Y"]]));
    expect(api.performance).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("perf-return-a")).toHaveTextContent("+10.0%");
  });

  it("key takeaways sit under the tabs for every sub-tab", async () => {
    mount();
    await screen.findByRole("tablist");
    expect(screen.getByRole("heading", { name: "Key takeaways" })).toBeInTheDocument();
    expect(screen.getByTestId("key-takeaways")).toHaveTextContent("These two funds share 3 stocks worth a combined 18.6% of your portfolio. They overlap most in Industrials.");
    fireEvent.click(tab("Unique Holdings"));
    expect(screen.getByTestId("key-takeaways")).toBeInTheDocument();
  });

  it("a fund without published holdings is an explanation (not an error) and the Back control stays", async () => {
    api.overlapCompare.mockResolvedValue({ status: "unavailable", reason: "no_disclosure" } satisfies Unavailable);
    const onBack = mount();
    expect(await screen.findByTestId("section-unavailable")).toHaveTextContent("Holdings not available yet for this fund house.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `Back to ${A}'s overlap` }));
    expect(onBack).toHaveBeenCalled();
  });

  it("a fund that is not held in this view says so", async () => {
    api.overlapCompare.mockResolvedValue({ status: "unavailable", reason: "not_held" } satisfies Unavailable);
    mount();
    expect(await screen.findByTestId("section-unavailable")).toHaveTextContent("You don't hold this fund in this view.");
  });

  it("a failed request is an error box with Retry, and Retry asks again", async () => {
    api.overlapCompare.mockRejectedValueOnce(new ApiError(500, { detail: "x" }));
    mount();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load comparison.");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await screen.findByRole("tablist");
    expect(api.overlapCompare).toHaveBeenCalledTimes(2);
  });

  it("an answer that arrives for an earlier request is ignored when the other fund changes", async () => {
    const slow = deferred<OverlapCompareResponse>();
    api.overlapCompare.mockImplementationOnce(() => slow.promise);
    const { rerender } = render(<ComparisonState ctx={ctx()} otherSchemeId="first" onBack={() => {}} />);
    const other = compare();
    other.fund_b.scheme_name = "Second Fund";
    api.overlapCompare.mockImplementationOnce(() => Promise.resolve(other));
    rerender(<ComparisonState ctx={ctx()} otherSchemeId="second" onBack={() => {}} />);
    expect(await screen.findByTestId("compare-fund-b")).toHaveTextContent("Second Fund");
    await act(async () => { slow.resolve(compare()); });
    await waitFor(() => expect(screen.getByTestId("compare-fund-b")).toHaveTextContent("Second Fund"));
    expect(api.overlapCompare).toHaveBeenLastCalledWith(IDS.scheme, "second", "combined", expect.any(AbortSignal));
  });
});
