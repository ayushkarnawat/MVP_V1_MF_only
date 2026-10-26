import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "./fixtures";
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
  mocks.getAnalyticsScope.mockResolvedValue(fx.analyticsCombined());
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
  it("renders the Performance page at its own path with the benchmark block still a placeholder", async () => {
    mount("/portfolio/mutual-funds/performance");
    expect(await screen.findByRole("heading", { level: 1, name: "Performance" })).toBeInTheDocument();
    expect(await screen.findByTestId("block-benchmark")).toHaveTextContent("Coming soon");
  });
  it.each([
    ["/portfolio/mutual-funds/allocation", "Allocation"],
    ["/portfolio/mutual-funds/holdings", "Holdings"],
    ["/portfolio/mutual-funds/transactions", "Transactions"],
    ["/portfolio/mutual-funds/overlap", "Overlap"],
  ])("renders %s inside the frame with a Coming soon body", async (path, title) => {
    mount(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" })).toBeInTheDocument();
    expect(mocks.getHoldingsBundle).not.toHaveBeenCalled();
  });
  it.each([
    ["/portfolio/mutual-funds/analytics", "Analytics screen"],
    ["/portfolio/mutual-funds/history", "History screen"],
  ])("leaves %s on the old screen with its temporary strip until its own run", async (path, heading) => {
    mount(path);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Fund pages" })).toBeInTheDocument();
  });
  it("changes no route status in this run (Performance goes live with the benchmark block)", () => {
    const status = Object.fromEntries(buildRegistry().filter(route => route.id.startsWith("portfolio-mutual-funds")).map(route => [route.id, route.status]));
    expect(status).toMatchObject({
      "portfolio-mutual-funds": "live", "portfolio-mutual-funds-analytics": "live", "portfolio-mutual-funds-history": "live",
      "portfolio-mutual-funds-performance": "placeholder", "portfolio-mutual-funds-allocation": "placeholder", "portfolio-mutual-funds-holdings": "placeholder",
      "portfolio-mutual-funds-transactions": "placeholder", "portfolio-mutual-funds-overlap": "placeholder",
    });
  });
});
