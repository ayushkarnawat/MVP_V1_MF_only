import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "./fixtures";
import * as fb from "./fixtures/mfB";
import { buildRegistry } from "../../shell/registry/buildRegistry";
import { renderInShell } from "../../shell/testing";

const mocks = vi.hoisted(() => ({
  getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn(), getHoldingsBundle: vi.fn(), getAllocation: vi.fn(), getSips: vi.fn(),
  getSipsMonthly: vi.fn(), getCoverageGaps: vi.fn(), getHistoryPoints: vi.fn(), getMonthDetail: vi.fn(),
}));
vi.mock("../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("./api", () => mocks);
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ me: null }) }));
vi.mock("../analytics/AnalyticsView", () => ({ AnalyticsView: () => <h1>Analytics screen</h1> }));
vi.mock("../history/HistoryView", () => ({ HistoryView: () => <h1>History screen</h1> }));
vi.mock("../dashboard/DashboardView", () => ({ DashboardView: () => <h1>Dashboard screen</h1> }));

import { analyticsStore } from "./data/analyticsStore";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }];
const mount = (path: string) => renderInShell(undefined, { path, scope: { members } });

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  const holdings = fx.aggregateHoldings();
  mocks.getHoldingsBundle.mockResolvedValue({ holdings: holdings.holdings, members: holdings.members, xirr: { lifetime: "0.1612", current: "0.1480", disclaimers: { lifetime: null, current: null } }, realized: holdings.realized_summary });
  mocks.getAllocation.mockResolvedValue(fx.allocation().allocation);
  mocks.getSips.mockResolvedValue(fx.sips().sips);
  mocks.getSipsMonthly.mockResolvedValue([]);
  mocks.getCoverageGaps.mockResolvedValue([]);
  mocks.getHistoryPoints.mockResolvedValue([]);
  mocks.getAnalyticsScope.mockResolvedValue(fb.analyticsMfB());
});

describe("Mutual Funds routes", () => {
  it("renders the new Overview at /portfolio/mutual-funds, not the old Dashboard or its temporary tab strip", async () => {
    mount("/portfolio/mutual-funds");
    expect(await screen.findByRole("heading", { level: 1, name: "All Investments" })).toBeInTheDocument();
    await screen.findByTestId("value-total");
    expect(screen.queryByRole("heading", { name: "Dashboard screen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Mutual Fund pages" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" })).toBeInTheDocument();
  });
  it("renders the Performance page at its own path, with the benchmark block built", async () => {
    mount("/portfolio/mutual-funds/performance");
    expect(await screen.findByRole("heading", { level: 1, name: "Performance" })).toBeInTheDocument();
    const block = await screen.findByTestId("block-benchmark");
    expect(block).toHaveTextContent("Benchmark Comparison (XIRR)");
    expect(block).not.toHaveTextContent("Coming soon");
    expect(screen.getByRole("tab", { name: "Per-Fund vs Benchmark" })).toBeInTheDocument();
  });
  it.each([
    ["/portfolio/mutual-funds/allocation", "Allocation", "allocation-cards"],
    ["/portfolio/mutual-funds/holdings", "Holdings", "holdings-cards"],
    ["/portfolio/mutual-funds/transactions", "Transactions", "transactions-cards"],
  ])("renders %s as a real page inside the frame", async (path, title, testId) => {
    mount(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" })).toBeInTheDocument();
  });
  it("renders Overlap inside the frame with a Coming soon body, and asks for nothing", async () => {
    mount("/portfolio/mutual-funds/overlap");
    expect(await screen.findByRole("heading", { level: 1, name: "Overlap" })).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(mocks.getHoldingsBundle).not.toHaveBeenCalled();
    expect(mocks.getAnalyticsScope).not.toHaveBeenCalled();
  });
  it.each([
    ["/portfolio/mutual-funds/analytics", "Analytics screen"],
    ["/portfolio/mutual-funds/history", "History screen"],
  ])("leaves %s on the old screen with its temporary strip until its own run", async (path, heading) => {
    mount(path);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Fund pages" })).toBeInTheDocument();
  });
  it("has Performance, Allocation, Holdings and Transactions live, and only Overlap still a placeholder", () => {
    const status = Object.fromEntries(buildRegistry().filter(route => route.id.startsWith("portfolio-mutual-funds")).map(route => [route.id, route.status]));
    expect(status).toMatchObject({
      "portfolio-mutual-funds": "live", "portfolio-mutual-funds-analytics": "live", "portfolio-mutual-funds-history": "live",
      "portfolio-mutual-funds-performance": "live", "portfolio-mutual-funds-allocation": "live", "portfolio-mutual-funds-holdings": "live",
      "portfolio-mutual-funds-transactions": "live", "portfolio-mutual-funds-overlap": "placeholder",
    });
  });
});
