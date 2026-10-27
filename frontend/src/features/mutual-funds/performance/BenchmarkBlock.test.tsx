import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../fixtures";
import * as fb from "../fixtures/mfB";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { AnalyticsScopeResponse, FundVsBenchmarkSummary, PortfolioBenchmarkSummary } from "../types";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);

import { analyticsStore } from "../data/analyticsStore";
import { BenchmarkBlock } from "./BenchmarkBlock";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];

function scopeWith(over: { benchmark?: PortfolioBenchmarkSummary; funds?: FundVsBenchmarkSummary } = {}): AnalyticsScopeResponse {
  const response = fb.analyticsMfB();
  if (over.benchmark) response.sections.benchmark = { ...response.sections.benchmark!, payload: { members: fx.MEMBERS, benchmark: over.benchmark } };
  if (over.funds) response.sections.benchmark_funds = { ...response.sections.benchmark_funds!, payload: { members: fx.MEMBERS, comparison: over.funds } };
  return response;
}
const mount = (opts: Parameters<typeof renderInShell>[1] = {}) =>
  renderInShell(<BenchmarkBlock />, { path: "/portfolio/mutual-funds/performance", scope: { members }, ...opts });
const ready = () => screen.findByTestId("marker-portfolio");
const click = (name: string | RegExp, role = "button") => fireEvent.click(screen.getByRole(role, { name }));

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  mocks.getAnalyticsScope.mockResolvedValue(scopeWith());
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});

describe("controls", () => {
  it("shows the heading, the two tabs, eight index chips and four window segments, with the defaults selected", async () => {
    mount();
    await ready();
    const block = screen.getByTestId("block-benchmark");
    expect(within(block).getByRole("heading", { name: "Benchmark Comparison (XIRR)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Portfolio vs Broad Market" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Per-Fund vs Benchmark" })).toHaveAttribute("aria-selected", "false");
    const chips = within(screen.getByRole("group", { name: "Benchmark indices" })).getAllByRole("button");
    expect(chips.map(chip => chip.textContent)).toEqual(["Nifty 50", "Nifty 500", "LargeMidcap 250", "Midcap 150", "Nifty Next 50", "Smallcap 250", "Nifty 100", "Nifty 200"]);
    expect(chips.filter(chip => chip.getAttribute("aria-pressed") === "true").map(chip => chip.textContent)).toEqual(["Nifty 500"]);
    const windows = within(screen.getByRole("group", { name: "Time window" })).getAllByRole("button");
    expect(windows.map(button => button.textContent)).toEqual(["1Y", "3Y", "5Y", "Since Inception"]);
    expect(screen.getByRole("button", { name: "Since Inception" })).toHaveAttribute("aria-pressed", "true");
  });
  it("has a labelled Race Track and Bar Chart toggle with Race Track first", async () => {
    mount();
    await ready();
    expect(screen.getByRole("radiogroup", { name: "Chart type" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Race Track" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Bar Chart" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("time windows", () => {
  it("shows where the window really starts, and re-slices the rates without another request", async () => {
    mount();
    await ready();
    expect(screen.getByTestId("window-start")).toHaveTextContent("Measured from 01 Apr 2022");
    expect(screen.getByTestId("marker-portfolio")).toHaveAttribute("aria-label", "Your Portfolio +16.1%");
    click("1Y");
    expect(screen.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Since Inception" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("window-start")).toHaveTextContent("Measured from 30 Sep 2025");
    expect(screen.getByTestId("marker-portfolio")).toHaveAttribute("aria-label", "Your Portfolio +18.3%");
    expect(screen.getByTestId("marker-nifty_500")).toHaveAttribute("aria-label", "Nifty 500 +14.1%");
    click("3Y");
    expect(screen.getByTestId("marker-portfolio")).toHaveAttribute("aria-label", "Your Portfolio +17.2%");
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
  it("disables a window with too little history, with a tooltip, and ignores a click on it", async () => {
    mount();
    await ready();
    const five = screen.getByRole("button", { name: "5Y" });
    expect(five).toHaveAttribute("aria-disabled", "true");
    expect(five).toHaveAttribute("title", "Not enough history for this window yet.");
    expect(five).toHaveAttribute("data-tooltip", "Not enough history for this window yet.");
    fireEvent.click(five);
    expect(five).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Since Inception" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-disabled", "false");
  });
  it("explains a window lost to an opening balance inside it", async () => {
    const summary = fb.benchmarkSummary();
    const row = summary.windows!.find(item => item.window === "3Y")!;
    Object.assign(row, { available: false, start_date: null, portfolio_xirr: null, unavailable_reason: "opening_balance_in_window" });
    mocks.getAnalyticsScope.mockResolvedValue(scopeWith({ benchmark: summary }));
    mount();
    await ready();
    expect(screen.getByRole("button", { name: "3Y" })).toHaveAttribute("title", "Unavailable: an opening balance from your statement falls inside this window, so money added and starting value cannot be told apart.");
  });
  it("shows only Since Inception, with a quiet note, for a payload stored before the windows existed", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(scopeWith({ benchmark: fb.benchmarkSummaryWithoutWindows(), funds: fb.fundBenchmarkWithoutWindows() }));
    mount();
    await ready();
    expect(screen.getByTestId("recomputing-note")).toHaveTextContent("Only Since Inception is available right now.");
    expect(screen.getByTestId("marker-portfolio")).toHaveAttribute("aria-label", "Your Portfolio +16.1%");
    expect(screen.getByTestId("marker-nifty_500")).toHaveAttribute("aria-label", "Nifty 500 +11.0%");
    for (const name of ["1Y", "3Y", "5Y"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByRole("button", { name })).toHaveAttribute("title", "This window is still being recalculated and will appear after the next analytics refresh.");
    }
    expect(screen.queryByTestId("window-start")).not.toBeInTheDocument();
  });
  it("has no recomputing note when the windows are there", async () => {
    mount();
    await ready();
    expect(screen.queryByTestId("recomputing-note")).not.toBeInTheDocument();
  });
});

describe("index chips and the race track", () => {
  it("starts with markers for the portfolio and Nifty 500, and lists every value below", async () => {
    mount();
    await ready();
    expect(screen.getAllByTestId(/^marker-/).map(marker => marker.getAttribute("data-testid"))).toEqual(["marker-nifty_500", "marker-portfolio"]);
    const values = within(screen.getByRole("list", { name: "Benchmark values" }));
    expect(values.getByTestId("value-portfolio")).toHaveTextContent("Your Portfolio: +16.1%");
    expect(values.getByTestId("value-nifty_500")).toHaveTextContent("Nifty 500: +11.0%");
  });
  it("shows and hides a marker with its chip, and the chip keeps its selected look", async () => {
    mount();
    await ready();
    const chip = screen.getByTestId("chip-nifty_50");
    expect(screen.queryByTestId("marker-nifty_50")).not.toBeInTheDocument();
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("marker-nifty_50")).toHaveAttribute("aria-label", "Nifty 50 +10.4%");
    fireEvent.mouseLeave(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("marker-nifty_50")).not.toBeInTheDocument();
  });
  it("allows every chip to be switched off, leaving only the portfolio", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("chip-nifty_500"));
    expect(screen.getAllByTestId(/^marker-/)).toHaveLength(1);
    expect(screen.getByTestId("marker-portfolio")).toHaveAttribute("data-x", "50");
  });
  it("shows a dash, no marker and no zero for an index with no rate", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("chip-nifty_200"));
    expect(screen.queryByTestId("marker-nifty_200")).not.toBeInTheDocument();
    expect(screen.getByTestId("value-nifty_200")).toHaveTextContent("Nifty 200: —");
    expect(screen.getByTestId("value-nifty_200").textContent).toBe("Nifty 200: —");
  });
  it("wears the crown on the highest rate and moves it when another overtakes", async () => {
    mount();
    await ready();
    expect(screen.getByTestId("marker-portfolio")).toHaveAttribute("data-crown", "true");
    expect(screen.getByTestId("marker-nifty_500")).toHaveAttribute("data-crown", "false");
    expect(screen.getAllByTestId("crown")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("chip-nifty_smallcap_250"));
    expect(screen.getByTestId("marker-nifty_smallcap_250")).toHaveAttribute("data-crown", "true");
    expect(screen.getByTestId("marker-portfolio")).toHaveAttribute("data-crown", "false");
    expect(screen.getAllByTestId("crown")).toHaveLength(1);
  });
  it("nudges close values across the axis but keeps their true positions along it", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("chip-nifty_smallcap_250"));
    expect(screen.getByTestId("marker-nifty_500")).toHaveAttribute("data-x", "5");
    expect(screen.getByTestId("marker-portfolio")).toHaveAttribute("data-x", "93.61");
    expect(screen.getByTestId("marker-portfolio")).toHaveAttribute("data-offset", "0");
    expect(screen.getByTestId("marker-nifty_smallcap_250")).toHaveAttribute("data-x", "95");
    expect(screen.getByTestId("marker-nifty_smallcap_250")).toHaveAttribute("data-offset", "-14");
  });
  it("labels alternate above and below the axis", async () => {
    mount();
    await ready();
    expect(screen.getByTestId("marker-nifty_500")).toHaveAttribute("data-above", "true");
    expect(screen.getByTestId("marker-portfolio")).toHaveAttribute("data-above", "false");
  });
});

describe("the detail panel", () => {
  it("opens under the track titled with the clicked entity, listing its rate in every window against the portfolio", async () => {
    mount();
    await ready();
    expect(screen.queryByTestId("benchmark-detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("marker-nifty_500"));
    const panel = screen.getByRole("region", { name: "Nifty 500 by period" });
    expect(within(panel).getByRole("heading", { name: "Nifty 500" })).toBeInTheDocument();
    expect(within(panel).getByTestId("detail-1Y")).toHaveTextContent("+14.1%");
    expect(within(panel).getByTestId("detail-1Y")).toHaveTextContent("+4.3%");
    expect(within(panel).getByTestId("detail-3Y")).toHaveTextContent("+15.4%");
    expect(within(panel).getByTestId("detail-5Y")).toHaveTextContent("Unavailable");
    expect(within(panel).getByTestId("detail-SI")).toHaveTextContent("+11.0%");
    expect(within(panel).getByTestId("detail-SI")).toHaveTextContent("+5.1%");
  });
  it("keeps the clicked marker selected after the mouse leaves, and moves to the next one clicked", async () => {
    mount();
    await ready();
    const first = screen.getByTestId("marker-nifty_500");
    fireEvent.click(first);
    fireEvent.mouseLeave(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("marker-portfolio"));
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("region", { name: "Your Portfolio by period" })).toBeInTheDocument();
    expect(within(screen.getByTestId("detail-SI")).getByText("—")).toBeInTheDocument();
  });
  it("closes when the selected index is switched off", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("marker-nifty_500"));
    fireEvent.click(screen.getByTestId("chip-nifty_500"));
    expect(screen.queryByTestId("benchmark-detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("chip-nifty_500"));
    expect(screen.getByTestId("marker-nifty_500")).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("benchmark-detail")).not.toBeInTheDocument();
  });
  it("follows the chart type: the same selection and panel in the bar view", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("marker-nifty_500"));
    click("Bar Chart", "radio");
    expect(screen.getByRole("radio", { name: "Bar Chart" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("race-track")).not.toBeInTheDocument();
    const bars = within(screen.getByRole("list", { name: "Benchmark bars" }));
    expect(bars.getAllByRole("button").map(button => button.getAttribute("data-key"))).toEqual(["portfolio", "nifty_500"]);
    expect(screen.getByTestId("bar-portfolio")).toHaveStyle({ width: "100%" });
    expect(screen.getByTestId("bar-nifty_500")).toHaveStyle({ width: "68.36%" });
    expect(bars.getByRole("button", { name: /Nifty 500/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Nifty 500 by period" })).toBeInTheDocument();
    fireEvent.click(bars.getByRole("button", { name: /Your Portfolio/ }));
    expect(screen.getByRole("region", { name: "Your Portfolio by period" })).toBeInTheDocument();
    click("Race Track", "radio");
    expect(screen.getByTestId("marker-portfolio")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Per-Fund vs Benchmark", () => {
  const openFunds = async () => {
    mount();
    await ready();
    click("Per-Fund vs Benchmark", "tab");
    await screen.findByTestId("fund-row-S-KOTAK");
  };
  it("lists the funds with an XIRR as collapsed rows with a difference badge and a mini track", async () => {
    await openFunds();
    expect(screen.getByRole("tab", { name: "Per-Fund vs Benchmark" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("fund-diff-S-KOTAK")).toHaveTextContent("-2.7% vs Benchmark");
    expect(screen.getByTestId("fund-diff-S-JM")).toHaveTextContent("+5.8% vs Benchmark");
    expect(screen.getByTestId("mini-fund-S-KOTAK")).toHaveAttribute("data-x", "5");
    expect(screen.getByTestId("mini-bench-S-KOTAK")).toHaveAttribute("data-x", "95");
    expect(screen.getByTestId("fund-toggle-S-KOTAK")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("fund-row-S-NONE")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fund-row-S-AXIS")).not.toBeInTheDocument();
  });
  it("shows the overall portfolio and broad market rates for the chosen window", async () => {
    await openFunds();
    const summary = screen.getByTestId("fund-summary");
    expect(summary).toHaveTextContent("Overall Portfolio XIRR: +16.1%");
    expect(summary).toHaveTextContent("Broad Market (Nifty 500): +11.0%");
    click("1Y");
    expect(summary).toHaveTextContent("Overall Portfolio XIRR: +18.3%");
    expect(summary).toHaveTextContent("Broad Market (Nifty 500): +14.1%");
  });
  it("shows five rows and a Show More link counting the rest, and Show Less afterwards", async () => {
    await openFunds();
    expect(within(screen.getByRole("list", { name: "Funds against their benchmarks" })).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByTestId("fund-row-S-UTI")).not.toBeInTheDocument();
    click("Show More (1 remaining)");
    expect(screen.getByTestId("fund-row-S-UTI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show Less" })).toHaveAttribute("aria-expanded", "true");
    click("Show Less");
    expect(screen.queryByTestId("fund-row-S-UTI")).not.toBeInTheDocument();
  });
  it("re-slices the fund rows to the chosen window with no request, dropping funds without a rate there", async () => {
    await openFunds();
    click("3Y");
    expect(screen.queryByTestId("fund-row-S-PPFAS")).not.toBeInTheDocument();
    expect(screen.getByTestId("fund-diff-S-KOTAK")).toHaveTextContent("-2.1% vs Benchmark");
    expect(screen.queryByRole("button", { name: /Show More/ })).not.toBeInTheDocument();
    click("1Y");
    expect(screen.getByTestId("fund-diff-S-KOTAK")).toHaveTextContent("-4.0% vs Benchmark");
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
  it("expands a row in place, one at a time, naming the benchmark and both rates", async () => {
    await openFunds();
    fireEvent.click(screen.getByTestId("fund-toggle-S-KOTAK"));
    expect(screen.getByTestId("fund-toggle-S-KOTAK")).toHaveAttribute("aria-expanded", "true");
    const detail = screen.getByTestId("fund-detail-S-KOTAK");
    expect(detail).toHaveTextContent("Benchmark: Nifty 500 (Total Return)");
    expect(screen.getByTestId("fund-xirr-S-KOTAK")).toHaveTextContent("+14.2%");
    expect(screen.getByTestId("bench-xirr-S-KOTAK")).toHaveTextContent("+16.9%");
    fireEvent.click(screen.getByTestId("fund-toggle-S-HDFC"));
    expect(screen.queryByTestId("fund-detail-S-KOTAK")).not.toBeInTheDocument();
    expect(screen.getByTestId("fund-detail-S-HDFC")).toHaveTextContent("Benchmark: Midcap 150 (Total Return)");
    fireEvent.click(screen.getByTestId("fund-toggle-S-HDFC"));
    expect(screen.queryByTestId("fund-detail-S-HDFC")).not.toBeInTheDocument();
  });
  it("says so when no fund has a rate", async () => {
    const funds = fb.fundBenchmark();
    for (const fund of funds.funds) { fund.fund_xirr = null; fund.benchmark_xirr = null; fund.windows = fund.windows!.map(w => ({ ...w, fund_xirr: null, benchmark_xirr: null })); }
    mocks.getAnalyticsScope.mockResolvedValue(scopeWith({ funds }));
    mount();
    await ready();
    click("Per-Fund vs Benchmark", "tab");
    expect(await screen.findByText("No per-fund benchmark comparison available")).toBeInTheDocument();
    expect(screen.getByText("Import holdings with transaction history to evaluate individual scheme returns against assigned Nifty benchmarks.")).toBeInTheDocument();
  });
  it("keeps Since Inception and says the other windows are being recalculated when the fund rows have no windows", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(scopeWith({ funds: fb.fundBenchmarkWithoutWindows() }));
    mount();
    await ready();
    click("Per-Fund vs Benchmark", "tab");
    await screen.findByTestId("fund-row-S-KOTAK");
    expect(screen.getByTestId("fund-diff-S-KOTAK")).toHaveTextContent("-2.7% vs Benchmark");
    expect(screen.queryByTestId("funds-recomputing-note")).not.toBeInTheDocument();
    click("1Y");
    expect(screen.getByTestId("funds-recomputing-note")).toHaveTextContent("Per-fund figures for this time window are being recalculated and will appear after the next refresh.");
    expect(screen.queryByTestId("fund-row-S-KOTAK")).not.toBeInTheDocument();
  });
});

describe("states and scope", () => {
  it("shows a loading status, then the track", async () => {
    let resolve: (value: AnalyticsScopeResponse) => void = () => {};
    mocks.getAnalyticsScope.mockReturnValue(new Promise<AnalyticsScopeResponse>(r => { resolve = r; }));
    mount();
    expect(screen.getByRole("status", { name: "Loading benchmark comparison" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Benchmark Comparison (XIRR)" })).toBeInTheDocument();
    resolve(scopeWith());
    await ready();
    expect(screen.queryByRole("status", { name: "Loading benchmark comparison" })).not.toBeInTheDocument();
  });
  it("fails on its own with a Retry that asks for the analytics again", async () => {
    mocks.getAnalyticsScope.mockResolvedValueOnce({ scope: "combined", recomputing: false, sections: { benchmark: { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" } } });
    mount();
    expect(await screen.findByText("Couldn't load the benchmark comparison.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Benchmark Comparison (XIRR)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Per-Fund vs Benchmark" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("combined"));
    await ready();
  });
  it("reads the bare member payloads and asks for the member's scope", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(fb.analyticsMfBMember());
    mount({ scope: { members, viewMode: "member", memberId: "m1" } });
    await ready();
    expect(mocks.getAnalyticsScope.mock.calls[0][0]).toBe("m1");
    expect(screen.getByTestId("marker-portfolio")).toHaveAttribute("aria-label", "Your Portfolio +16.1%");
  });
  it("marks every control with its effect and exposes the selected state (interactivity rule)", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(screen.getByTestId("marker-nifty_500"));
    expectInteractivity(container, 14);
    click("Per-Fund vs Benchmark", "tab");
    await screen.findByTestId("fund-row-S-KOTAK");
    fireEvent.click(screen.getByTestId("fund-toggle-S-KOTAK"));
    expectInteractivity(container, 8);
  });
});
