import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../fixtures";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { HistoryPoint, XirrBundle } from "../types";

const mocks = vi.hoisted(() => ({
  getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn(), getHoldingsBundle: vi.fn(), getAllocation: vi.fn(), getSips: vi.fn(),
  getSipsMonthly: vi.fn(), getCoverageGaps: vi.fn(), getHistoryPoints: vi.fn(), getMonthDetail: vi.fn(),
}));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);

import { analyticsStore } from "../data/analyticsStore";
import PerformancePage from "./PerformancePage";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];
const XIRR: XirrBundle = { lifetime: "0.1612", current: "0.1480", disclaimers: { lifetime: { alt_xirr: "0.1105", opening_cost_share: "0.3800" }, current: null } };
const bundle = (xirr = XIRR) => ({ holdings: fx.holdings(), members: fx.MEMBERS, xirr, realized: null });
const FIVE: HistoryPoint[] = [["2026-06-30", "1800000.00"], ["2026-07-31", "1860000.00"], ["2026-08-31", "1920000.00"], ["2026-09-30", "1990000.00"], ["2026-10-31", "2060000.00"]].map(([month, text], i) => ({
  month, value: Number(text), invested: 1500000, valueText: text, investedText: "1500000.00", partial: i === 2, missing: i === 2 ? ["HDFC Mid-Cap Opportunities Fund"] : [],
}));
const many = (n: number): HistoryPoint[] => Array.from({ length: n }, (_, i) => ({ month: `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-28`, value: 100 + i, invested: 90, valueText: `${100 + i}.00`, investedText: "90.00", partial: false, missing: [] }));

function mount(opts: Parameters<typeof renderInShell>[1] = {}) {
  return renderInShell(<PerformancePage />, { path: "/portfolio/mutual-funds/performance", scope: { members }, ...opts });
}
const ready = async () => { await screen.findByTestId("xirr-value"); await screen.findByTestId("abs-gain"); await screen.findByTestId("point-2026-10-31"); };

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  mocks.getHoldingsBundle.mockResolvedValue(bundle());
  mocks.getHistoryPoints.mockResolvedValue(FIVE);
  mocks.getMonthDetail.mockResolvedValue(fx.monthDetail());
  mocks.getAnalyticsScope.mockResolvedValue(fx.analyticsCombined());
});

describe("PerformancePage frame and blocks", () => {
  it("has the Performance header, the tab strip with this tab current, and three blocks in order", async () => {
    mount();
    await ready();
    expect(screen.getByRole("heading", { level: 1, name: "Performance" })).toBeInTheDocument();
    expect(screen.getByText("Returns, portfolio value over time, and how you stack up against the market.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" }).querySelector("[data-tab=performance] [aria-current=page]")).not.toBeNull();
    const blocks = [...screen.getByTestId("performance-blocks").querySelectorAll("[data-testid^=block-]")].map(el => el.getAttribute("data-testid"));
    expect(blocks).toEqual(["block-returns", "block-history", "block-benchmark"]);
  });
  it("leaves the benchmark comparison as a placeholder for the next run", async () => {
    mount();
    await ready();
    const block = screen.getByTestId("block-benchmark");
    expect(within(block).getByRole("heading", { name: "Benchmark Comparison (XIRR)" })).toBeInTheDocument();
    expect(block).toHaveTextContent("Coming soon");
  });
  it("loads only what it needs", async () => {
    mount();
    await ready();
    expect(mocks.getAllocation).not.toHaveBeenCalled();
    expect(mocks.getSips).not.toHaveBeenCalled();
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
  it("shows a page error with Retry when the XIRR, the history and the analytics all fail", async () => {
    mocks.getHoldingsBundle.mockRejectedValue(new Error("x"));
    mocks.getHistoryPoints.mockRejectedValue(new Error("x"));
    mocks.getAnalyticsScope.mockRejectedValue(new Error("x"));
    mount();
    expect(await screen.findByRole("heading", { name: "Couldn't load your performance data" })).toBeInTheDocument();
    expect(screen.getByText("There was a problem reaching our servers. Your data is safe — this is just a connection issue.")).toBeInTheDocument();
    expect(screen.queryByTestId("block-returns")).not.toBeInTheDocument();
    mocks.getHoldingsBundle.mockResolvedValue(bundle()); mocks.getHistoryPoints.mockResolvedValue(FIVE); mocks.getAnalyticsScope.mockResolvedValue(fx.analyticsCombined());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await ready();
  });
  it("asks for the selected member everywhere", async () => {
    mocks.getAnalyticsScope.mockResolvedValue({ scope: "m1", recomputing: false, sections: { benchmark_funds: { payload: { funds: [], overall_portfolio_xirr: null, overall_broad_market_xirr: null }, computed_at: "x", failed_at: null }, investment_withdrawal: { payload: fx.analyticsCombined().sections.investment_withdrawal!.payload!.data as Record<string, unknown>, computed_at: "x", failed_at: null } } });
    mount({ scope: { members, viewMode: "member", memberId: "m1" } });
    await ready();
    expect(mocks.getHoldingsBundle.mock.calls[0][0]).toEqual({ viewMode: "member", memberId: "m1" });
    expect(mocks.getHistoryPoints.mock.calls[0][0]).toEqual({ viewMode: "member", memberId: "m1" });
    expect(mocks.getAnalyticsScope.mock.calls[0][0]).toBe("m1");
  });
  it("marks every control with its effect (interactivity rule)", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(screen.getByTestId("point-2026-08-31"));
    expectInteractivity(container, 8);
  });
});

describe("Returns block", () => {
  it("shows the lifetime XIRR with p.a. and switches to the current-holdings XIRR", async () => {
    mount();
    await ready();
    expect(screen.getByRole("heading", { name: "Returns" })).toBeInTheDocument();
    expect(screen.getByTestId("xirr-value")).toHaveTextContent("+16.1%");
    expect(screen.getByTestId("block-returns")).toHaveTextContent("p.a.");
    expect(screen.getByRole("tab", { name: "Lifetime" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Current Holdings" }));
    expect(screen.getByRole("tab", { name: "Current Holdings" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("xirr-value")).toHaveTextContent("+14.8%");
    expect(screen.queryByTestId("disclaimer-button")).not.toBeInTheDocument();
  });
  it("shows the same XIRR as the Overview strip does", async () => {
    mount();
    await ready();
    expect(screen.getByTestId("xirr-value").textContent).toContain("16.1%");
  });
  it("offers the opening-balance disclaimer inline and closes it when the basis changes", async () => {
    mount();
    await ready();
    const button = screen.getByTestId("disclaimer-button");
    expect(button).toHaveTextContent("38% of this return is based on an undated opening balance — may be inflated. Tap to see why.");
    expect(screen.queryByTestId("disclaimer-panel")).not.toBeInTheDocument();
    fireEvent.click(button);
    const panel = screen.getByTestId("disclaimer-panel");
    expect(panel).toHaveTextContent("Unifolio treats it as invested on the day the statement starts");
    expect(panel).toHaveTextContent("Without the undated portion, the lifetime XIRR would be 11.1%.");
    expect(panel).toHaveTextContent("Switch to Current Holdings above to see the XIRR computed only from funds you still hold.");
    fireEvent.click(screen.getByRole("tab", { name: "Current Holdings" }));
    fireEvent.click(screen.getByRole("tab", { name: "Lifetime" }));
    expect(screen.queryByTestId("disclaimer-panel")).not.toBeInTheDocument();
  });
  it("says so when the alternative XIRR cannot be computed", async () => {
    mocks.getHoldingsBundle.mockResolvedValue(bundle({ ...XIRR, disclaimers: { lifetime: { alt_xirr: null, opening_cost_share: "0.9000" }, current: null } }));
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("disclaimer-button"));
    expect(screen.getByTestId("disclaimer-panel")).toHaveTextContent("There is not enough dated activity left to compute one.");
  });
  it("shows the insufficient-history message instead of an XIRR and keeps the absolute return", async () => {
    mocks.getHoldingsBundle.mockResolvedValue(bundle({ lifetime: null, current: null, disclaimers: { lifetime: null, current: null } }));
    mount();
    expect(await screen.findByText("Insufficient Transaction History for XIRR")).toBeInTheDocument();
    expect(screen.getByText("XIRR needs transaction dates spread over a multi-month window. Yours all fall on the same day — absolute return is shown instead.")).toBeInTheDocument();
    expect(screen.queryByTestId("xirr-value")).not.toBeInTheDocument();
    expect(await screen.findByTestId("abs-return")).toHaveTextContent("+29.9%");
  });
  it("shows the absolute return tiles from the investment and withdrawal section", async () => {
    mount();
    await ready();
    expect(screen.getByTestId("abs-invested")).toHaveTextContent("₹35,78,000");
    expect(screen.getByTestId("abs-value")).toHaveTextContent("₹46,49,340");
    expect(screen.getByTestId("abs-gain")).toHaveTextContent("+₹10,71,340");
    expect(screen.getByTestId("abs-return")).toHaveTextContent("+29.9%");
  });
  it("lists each fund's XIRR and its difference from its benchmark, leaving out a fund with no XIRR", async () => {
    mount();
    await ready();
    expect(screen.getByRole("heading", { name: "Fund XIRR at a glance" })).toBeInTheDocument();
    expect(screen.getByTestId("fxirr-S-KOTAK")).toHaveTextContent("Kotak Multi Cap Fund");
    expect(screen.getByTestId("fxirr-S-KOTAK")).toHaveTextContent("+14.2%");
    expect(screen.getByTestId("fxirr-S-KOTAK")).toHaveTextContent("-2.7%");
    expect(screen.getByTestId("fxirr-S-JM")).toHaveTextContent("+5.8%");
    expect(screen.getByTestId("fxirr-S-HDFC")).toHaveTextContent("+1.1%");
    expect(screen.queryByTestId("fxirr-S-NONE")).not.toBeInTheDocument();
  });
  it("lets the absolute return and the fund table fail without hiding the XIRR", async () => {
    mocks.getAnalyticsScope.mockResolvedValue({ scope: "combined", recomputing: false, sections: {
      benchmark_funds: { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" }, investment_withdrawal: { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" } } });
    mount();
    expect(await screen.findByTestId("xirr-value")).toHaveTextContent("+16.1%");
    expect(await screen.findByText("Couldn't load absolute return")).toBeInTheDocument();
    expect(screen.getByText("Per-fund XIRR isn't available right now.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Retry" }).length).toBeGreaterThanOrEqual(2);
  });
});

describe("Portfolio History block", () => {
  it("draws a point per month-end, a hollow one where a fund had no price, with the caption and legend", async () => {
    mount();
    await ready();
    expect(screen.getByRole("heading", { name: "Portfolio History" })).toBeInTheDocument();
    expect(screen.getAllByTestId(/^point-/)).toHaveLength(5);
    expect(screen.getByTestId("point-2026-08-31")).toHaveAttribute("data-hollow", "true");
    expect(screen.getByTestId("point-2026-09-30")).toHaveAttribute("data-hollow", "false");
    expect(screen.getByText("History starts Jun 2026 (earliest statement uploaded). Hollow dot = a fund had no price that month.")).toBeInTheDocument();
    expect(screen.getByText("Portfolio value")).toBeInTheDocument();
    expect(screen.getByText("Cost of holdings")).toBeInTheDocument();
  });
  it("re-slices the points for 1Y, 3Y, 5Y and All without another request", async () => {
    mocks.getHistoryPoints.mockResolvedValue(many(30));
    mount();
    await screen.findByTestId("point-2026-06-28");
    const count = () => screen.getAllByTestId(/^point-/).length;
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(count()).toBe(30);
    fireEvent.click(screen.getByRole("button", { name: "1Y" }));
    expect(count()).toBe(12);
    expect(screen.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "3Y" }));
    expect(count()).toBe(30);
    fireEvent.click(screen.getByRole("button", { name: "5Y" }));
    expect(count()).toBe(30);
    expect(mocks.getHistoryPoints).toHaveBeenCalledTimes(1);
  });
  it("shows a month card on hover or click with its figures, a persistent selection and the missing-price note", async () => {
    mount();
    await ready();
    expect(screen.queryByTestId("history-tooltip")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("point-2026-08-31"));
    const card = screen.getByTestId("history-tooltip");
    expect(card).toHaveTextContent("Aug 2026");
    expect(card).toHaveTextContent("Portfolio value ₹19,20,000");
    expect(card).toHaveTextContent("Cost of holdings ₹15,00,000");
    expect(card).toHaveTextContent("Gain ₹4,20,000");
    expect(card).toHaveTextContent("No price for this month: HDFC Mid-Cap Opportunities Fund");
    expect(screen.getByTestId("point-2026-08-31")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("point-2026-09-30"));
    expect(screen.getByTestId("history-tooltip")).toHaveTextContent("Sep 2026");
    expect(screen.getByTestId("history-tooltip")).not.toHaveTextContent("No price for this month");
    expect(screen.getByTestId("point-2026-08-31")).toHaveAttribute("aria-pressed", "false");
  });
  it("opens the month's detail from See details with member chips, four tiles and the per-fund table", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("point-2026-08-31"));
    fireEvent.click(screen.getByRole("button", { name: "See details" }));
    const dialog = await screen.findByRole("dialog", { name: "August 2026" });
    expect(mocks.getMonthDetail.mock.calls[0].slice(0, 2)).toEqual([{ viewMode: "aggregate", memberId: null }, "2026-08-31"]);
    expect(within(dialog).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Siddharth" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Parents" })).toBeInTheDocument();
    expect(within(dialog).getByTestId("tile-portfolio-value")).toHaveTextContent("₹19,20,000");
    expect(within(dialog).getByTestId("tile-change")).toHaveTextContent("—");
    expect(within(dialog).getByTestId("tile-new-money")).toHaveTextContent("₹1,44,874");
    expect(within(dialog).getByTestId("tile-market-movement")).toHaveTextContent("—");
    expect(dialog).toHaveTextContent("Incomplete prices: HDFC Mid-Cap Opportunities Fund. Change and market movement are unavailable.");
    const kotak = within(dialog).getByTestId("month-row-S-KOTAK:m1");
    expect(kotak).toHaveTextContent("4,218.332");
    expect(kotak).toHaveTextContent("₹58.20");
    expect(kotak).toHaveTextContent("31 Aug 2026");
    expect(kotak).toHaveTextContent("₹2,45,507");
    expect(kotak).toHaveTextContent("₹2,10,000");
    expect(kotak).toHaveTextContent("+₹8,420");
    expect(kotak).toHaveTextContent("+₹7,100");
    expect(within(dialog).getByTestId("month-row-S-HDFC:m3")).toHaveTextContent("No price for this month");
  });
  it("filters the month's funds by member chip", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("point-2026-08-31"));
    fireEvent.click(screen.getByRole("button", { name: "See details" }));
    const dialog = await screen.findByRole("dialog", { name: "August 2026" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Siddharth" }));
    expect(within(dialog).getByRole("button", { name: "Siddharth" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).queryByTestId("month-row-S-HDFC:m3")).not.toBeInTheDocument();
    expect(within(dialog).getByTestId("month-row-S-KOTAK:m1")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "All" }));
    expect(within(dialog).getByTestId("month-row-S-HDFC:m3")).toBeInTheDocument();
  });
  it("shows an error with Retry when the month fails to load", async () => {
    mocks.getMonthDetail.mockRejectedValueOnce(new Error("x")).mockResolvedValue(fx.monthDetail());
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("point-2026-08-31"));
    fireEvent.click(screen.getByRole("button", { name: "See details" }));
    const dialog = await screen.findByRole("dialog", { name: "August 2026" });
    expect(await within(dialog).findByText("Couldn't load this month. Try again.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByTestId("tile-portfolio-value")).toBeInTheDocument());
  });
  it("shows the empty message when there is no history", async () => {
    mocks.getHistoryPoints.mockResolvedValue([]);
    mount();
    expect(await screen.findByText("No history yet")).toBeInTheDocument();
    expect(screen.getByText("Upload a statement to see your portfolio month by month.")).toBeInTheDocument();
    expect(screen.getByTestId("xirr-value")).toBeInTheDocument();
  });
  it("shows its own error with Retry and keeps the Returns block", async () => {
    mocks.getHistoryPoints.mockRejectedValueOnce(new Error("x")).mockResolvedValue(FIVE);
    mount();
    expect(await screen.findByText("History couldn't be loaded. Please try again.")).toBeInTheDocument();
    expect(screen.getByTestId("xirr-value")).toBeInTheDocument();
    const history = screen.getByTestId("block-history");
    fireEvent.click(within(history).getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("point-2026-10-31")).toBeInTheDocument();
  });
});
