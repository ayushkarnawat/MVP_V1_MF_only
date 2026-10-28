import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { renderInShell } from "@/shell/testing";
import type { FundPageContext } from "../FundPageFrame";
import { IDS, fixture } from "../fixtures";
import type { OverlapCompareResponse, OverlapResponse, OverlapTopFund, PerformanceResponse, SummaryResponse, Unavailable } from "../types";
import { OverlapTab } from "./OverlapTab";

vi.mock("@/components/ui/charts", () => ({
  PieChart: ({ children }: { children?: ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  PieSlice: ({ index }: { index: number }) => <i data-testid={`pie-slice-${index}`} />,
  LineAreaChart: () => <div data-testid="line-chart" />,
}));

const api = vi.hoisted(() => ({ overlap: vi.fn(), overlapCompare: vi.fn(), performance: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const PATH = `/portfolio/mutual-funds/funds/${IDS.scheme}/overlap`;
const A = "Alpha Flexi Cap Fund - Direct Plan";
const ctx = (over: Partial<FundPageContext> = {}): FundPageContext => ({
  schemeId: IDS.scheme, scope: "combined", summary: fixture<SummaryResponse>("summary_family"), refreshing: false, ...over,
});
const funds = (count: number): OverlapTopFund[] =>
  Array.from({ length: count }, (_, index) => ({ scheme_id: `fund-${index + 1}`, scheme_name: `Peer Fund ${index + 1}`, overlap_pct: `${40 - index}.0000`, common_stock_count: 5 }));
const unavailable = (reason: string): Unavailable => ({ status: "unavailable", reason });

function Location() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{pathname + search}</output>;
}
function mount(context: FundPageContext = ctx()) {
  return renderInShell(<><OverlapTab ctx={context} /><Location /></>, { path: PATH });
}
const option = (name: RegExp | string) => screen.getByRole("option", { name });

beforeEach(() => {
  vi.clearAllMocks();
  api.overlap.mockImplementation(() => Promise.resolve(fixture<OverlapResponse>("overlap_fund")));
  api.overlapCompare.mockImplementation(() => Promise.resolve(fixture<OverlapCompareResponse>("overlap_compare")));
  api.performance.mockImplementation(() => Promise.resolve(fixture<PerformanceResponse>("performance_1y_equity")));
});

describe("OverlapTab", () => {
  it("loads the overlap for the fund and the scope and shows the normal state", async () => {
    mount();
    expect(screen.getByRole("status", { name: "Loading overlap" })).toBeInTheDocument();
    expect(await screen.findByTestId("overlap-normal")).toBeInTheDocument();
    expect(api.overlap).toHaveBeenCalledWith(IDS.scheme, "combined", expect.any(AbortSignal));
    expect(api.overlapCompare).not.toHaveBeenCalled();
  });

  it("asks in the member's scope when the page is in a member view", async () => {
    mount(ctx({ scope: IDS.asha }));
    await screen.findByTestId("overlap-normal");
    expect(api.overlap).toHaveBeenCalledWith(IDS.scheme, IDS.asha, expect.any(AbortSignal));
  });

  it("test_row_click_switches_to_comparison_without_changing_url_and_back_control_returns", async () => {
    mount();
    await screen.findByTestId("overlap-normal");
    const before = screen.getByTestId("location").textContent;
    fireEvent.click(option(/Golden Peer 1 Fund/));
    expect(await screen.findByTestId("overlap-comparison")).toBeInTheDocument();
    expect(screen.queryByTestId("overlap-normal")).toBeNull();
    expect(api.overlapCompare).toHaveBeenCalledWith(IDS.scheme, IDS.peer1, "combined", expect.any(AbortSignal));
    expect(screen.getByTestId("location")).toHaveTextContent(before!);
    expect(before).toBe(PATH);
    await screen.findByRole("tablist");
    fireEvent.click(screen.getByRole("button", { name: `Back to ${A}'s overlap` }));
    expect(screen.getByTestId("overlap-normal")).toBeInTheDocument();
    expect(screen.queryByTestId("overlap-comparison")).toBeNull();
    expect(screen.getByTestId("location")).toHaveTextContent(before!);
    expect(api.overlap).toHaveBeenCalledTimes(1);
  });

  it("coming back, focus returns to the row that was opened", async () => {
    api.overlap.mockImplementation(() => Promise.resolve({ ...fixture<OverlapResponse>("overlap_fund"), top_overlap_funds: funds(3) }));
    mount();
    await screen.findByTestId("overlap-normal");
    fireEvent.click(option(/Peer Fund 2/));
    await screen.findByRole("tablist");
    fireEvent.click(screen.getByRole("button", { name: `Back to ${A}'s overlap` }));
    expect(option(/Peer Fund 2/)).toHaveFocus();
  });

  it("the keyboard alone opens a comparison: arrows to a row, Enter", async () => {
    api.overlap.mockImplementation(() => Promise.resolve({ ...fixture<OverlapResponse>("overlap_fund"), top_overlap_funds: funds(3) }));
    mount();
    await screen.findByTestId("overlap-normal");
    const first = option(/Peer Fund 1/);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    fireEvent.keyDown(option(/Peer Fund 2/), { key: "Enter" });
    await screen.findByTestId("overlap-comparison");
    expect(api.overlapCompare).toHaveBeenCalledWith(IDS.scheme, "fund-2", "combined", expect.any(AbortSignal));
  });

  it("test_no_action_column_and_no_recommendation_callouts, in both states", async () => {
    mount();
    await screen.findByTestId("overlap-normal");
    expect(screen.queryByText(/Action/)).toBeNull();
    expect(screen.queryByText(/Our view|Consider Review|recommended alternative/i)).toBeNull();
    fireEvent.click(option(/Golden Peer 1 Fund/));
    await screen.findByRole("tablist");
    expect(screen.queryByText(/Action/)).toBeNull();
    expect(screen.queryByText(/Our view|Consider Review|recommended alternative/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /alternative/i })).toBeNull();
  });

  it("test_overlap_pct_consistent: the row's overlap in the list is the comparison donut's figure", async () => {
    mount();
    await screen.findByTestId("overlap-normal");
    expect(option(/Golden Peer 1 Fund/)).toHaveTextContent("18.0% overlap");
    expect(screen.getByTestId("overlap-donut-figure")).toHaveTextContent("18.0%");
    fireEvent.click(option(/Golden Peer 1 Fund/));
    await screen.findByRole("tablist");
    expect(screen.getByTestId("overlap-donut-figure")).toHaveTextContent("18.0%");
  });

  it("test_unavailable_no_disclosure_shows_explanatory_state_not_error", async () => {
    api.overlap.mockResolvedValue(unavailable("no_disclosure"));
    mount();
    expect(await screen.findByTestId("section-unavailable")).toHaveTextContent("Holdings not available yet for this fund house.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("overlap-normal")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("test_fund_not_held_state: a fund the chosen view does not hold gets its own sentence", async () => {
    api.overlap.mockResolvedValue(unavailable("not_held"));
    mount(ctx({ scope: IDS.dev }));
    expect(await screen.findByTestId("section-unavailable")).toHaveTextContent("You don't hold this fund in this view.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an unknown reason code still reads as a plain sentence, never a crash", async () => {
    api.overlap.mockResolvedValue(unavailable("something_new"));
    mount();
    expect(await screen.findByTestId("section-unavailable")).toHaveTextContent("Not available right now.");
  });

  it("a failed request is an error box with Retry that asks again", async () => {
    api.overlap.mockRejectedValueOnce(new ApiError(500, { detail: "x" }));
    mount();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load overlap.");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await screen.findByTestId("overlap-normal");
    expect(api.overlap).toHaveBeenCalledTimes(2);
  });

  it("a failed comparison leaves the Back control working and Back shows the normal state again without asking for the overlap twice", async () => {
    api.overlapCompare.mockRejectedValue(new ApiError(500, { detail: "x" }));
    mount();
    await screen.findByTestId("overlap-normal");
    fireEvent.click(option(/Golden Peer 1 Fund/));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load comparison.");
    fireEvent.click(screen.getByRole("button", { name: `Back to ${A}'s overlap` }));
    expect(screen.getByTestId("overlap-normal")).toBeInTheDocument();
    await waitFor(() => expect(api.overlap).toHaveBeenCalledTimes(1));
  });

  it("the page's fund name is used in the Back control and in the Top Funds instruction", async () => {
    mount();
    await screen.findByTestId("overlap-normal");
    expect(screen.getByText(`Choose a fund to see a full side-by-side comparison with ${A}.`)).toBeInTheDocument();
  });
});
