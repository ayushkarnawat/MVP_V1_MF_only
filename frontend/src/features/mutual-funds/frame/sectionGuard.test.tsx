import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { indexVisible, sectionsForTab, type MfTabId } from "../../../lib/pageSections";
import { renderInShell } from "../../../shell/testing";
import * as fx from "../fixtures";
import * as fb from "../fixtures/mfB";
import * as fc from "../fixtures/mfC";
import type { HistoryPoint } from "../types";

const mocks = vi.hoisted(() => ({
  getAnalyticsScope: vi.fn(),
  retryAnalyticsScope: vi.fn(),
  getHoldingsBundle: vi.fn(),
  getAllocation: vi.fn(),
  getSips: vi.fn(),
  getSipsMonthly: vi.fn(),
  getCoverageGaps: vi.fn(),
  getHistoryPoints: vi.fn(),
  getMonthDetail: vi.fn(),
  getWealthBenchmarks: vi.fn(),
  getWealthSeries: vi.fn(),
}));

vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ me: { user_id: "u-1" } }) }));
vi.mock("../api", () => mocks);
vi.mock("../../import/api", () => ({ postOpeningBalance: vi.fn().mockResolvedValue({}) }));
vi.mock("../../dashboard/api", () => ({
  getAggregateDistributorComparison: vi.fn().mockResolvedValue({ members: [], rows: [] }),
  getMemberDistributorComparison: vi.fn().mockResolvedValue([]),
  getFundNavHistory: vi.fn().mockResolvedValue({
    scheme_id: "S-KOTAK",
    period: "1Y",
    requested_period: "1Y",
    clamped: false,
    points: [],
    overall_return_pct: null,
  }),
}));

import { analyticsStore } from "../data/analyticsStore";
import AllocationPage from "../allocation/AllocationPage";
import HoldingsPage from "../holdings/HoldingsPage";
import OtherAnalyticsPage from "../other/OtherAnalyticsPage";
import OverlapPage from "../overlap/OverlapPage";
import OverviewPage from "../overview/OverviewPage";
import PerformancePage from "../performance/PerformancePage";
import TransactionsPage from "../transactions/TransactionsPage";

const members = [
  { id: "m1", name: "Siddharth" },
  { id: "m2", name: "Aarohi" },
  { id: "m3", name: "Parents" },
];

const FIVE_HISTORY: HistoryPoint[] = [
  ["2026-06-30", "1800000.00"],
  ["2026-07-31", "1860000.00"],
  ["2026-08-31", "1920000.00"],
  ["2026-09-30", "1990000.00"],
  ["2026-10-31", "2060000.00"],
].map(([month, text]) => ({
  month,
  value: Number(text),
  invested: 1500000,
  valueText: text,
  investedText: "1500000.00",
  partial: false,
  missing: [],
}));

// Conditional sections across tabs:
// - Overview: member mode hides Family Members; holdings-not-ready hides Value over time;
//   SoldFundsSection and SummaryStrip are not indexed.
// - Overlap: fewer than two funds (or category card grid) hides all 4 cards (0 sections).
// - Other Analytics: SHOW_FUND_QUALITY_SCORES = false hides Fund Quality Scorer (3 visible groups).
const TAB_CASES: Array<{
  tab: MfTabId;
  path: string;
  render: () => ReturnType<typeof renderInShell>;
  waitForReady: () => Promise<unknown>;
  useCombinedAnalytics?: boolean;
}> = [
  {
    tab: "overview",
    path: "/portfolio/mutual-funds",
    render: () => renderInShell(<OverviewPage />, { path: "/portfolio/mutual-funds", scope: { members } }),
    waitForReady: async () => {
      await screen.findByTestId("value-total");
      await screen.findByRole("heading", { name: "AMC Allocation" });
      await screen.findByRole("heading", { name: "Quick Insights" });
    },
    useCombinedAnalytics: true,
  },
  {
    tab: "performance",
    path: "/portfolio/mutual-funds/performance",
    render: () => renderInShell(<PerformancePage />, { path: "/portfolio/mutual-funds/performance", scope: { members } }),
    waitForReady: async () => {
      await screen.findByTestId("xirr-value");
      await screen.findByTestId("point-2026-10-31");
      await screen.findByTestId("block-benchmark");
    },
    useCombinedAnalytics: true,
  },
  {
    tab: "allocation",
    path: "/portfolio/mutual-funds/allocation",
    render: () => renderInShell(<AllocationPage />, { path: "/portfolio/mutual-funds/allocation", scope: { members } }),
    waitForReady: () => screen.findByTestId("manager-row-harsha-upadhyaya-kotak-mahindra-mf"),
  },
  {
    tab: "holdings",
    path: "/portfolio/mutual-funds/holdings",
    render: () => renderInShell(<HoldingsPage />, { path: "/portfolio/mutual-funds/holdings", scope: { members } }),
    waitForReady: () => screen.findByRole("table", { name: "All stock holdings" }),
  },
  {
    tab: "transactions",
    path: "/portfolio/mutual-funds/transactions",
    render: () => renderInShell(<TransactionsPage />, { path: "/portfolio/mutual-funds/transactions", scope: { members } }),
    waitForReady: () => screen.findByTestId("tile-invested-value"),
  },
  {
    tab: "overlap",
    path: "/portfolio/mutual-funds/overlap",
    render: () => renderInShell(<OverlapPage />, { path: "/portfolio/mutual-funds/overlap", scope: { members } }),
    waitForReady: () => screen.findByTestId("stat-strip"),
    useCombinedAnalytics: true,
  },
  {
    tab: "analytics",
    path: "/portfolio/mutual-funds/analytics",
    render: () => renderInShell(<OtherAnalyticsPage />, { path: "/portfolio/mutual-funds/analytics", scope: { members } }),
    waitForReady: () => screen.findByTestId("group-ranking"),
    useCombinedAnalytics: true,
  },
];

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();

  const agg = fx.aggregateHoldings();
  mocks.getHoldingsBundle.mockResolvedValue({
    holdings: fx.holdings(),
    members: agg.members,
    xirr: {
      lifetime: "0.1612",
      current: "0.1480",
      disclaimers: {
        lifetime: { alt_xirr: "0.1105", opening_cost_share: "0.3800" },
        current: null,
      },
    },
    realized: agg.realized_summary!,
  });
  mocks.getAllocation.mockResolvedValue(fx.allocation().allocation);
  mocks.getSips.mockResolvedValue(fx.sips().sips);
  mocks.getSipsMonthly.mockResolvedValue([]);
  mocks.getCoverageGaps.mockResolvedValue([]);
  mocks.getHistoryPoints.mockResolvedValue(FIVE_HISTORY);
  mocks.getMonthDetail.mockResolvedValue(fx.monthDetail());
  mocks.getWealthBenchmarks.mockResolvedValue({ options: [], recommended_index: null });
  mocks.getWealthSeries.mockResolvedValue({
    period: "1Y",
    from_date: "2025-11-23",
    to_date: "2026-11-23",
    points: [],
    benchmarks: {},
    partial: false,
    missing_funds: [],
  });
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});

describe("Mutual Funds section anchors guard", () => {
  it.each(TAB_CASES)(
    "$tab renders every section id from sectionsForTab exactly once and leaves no unindexed SectionCard",
    async ({ tab, render, waitForReady, useCombinedAnalytics }) => {
      mocks.getAnalyticsScope.mockResolvedValue(
        useCombinedAnalytics ? (tab === "overlap" || tab === "analytics" ? fc.analyticsMfC() : fx.analyticsCombined()) : fb.analyticsMfB()
      );

      const { container } = render();
      await waitForReady();

      const expected = sectionsForTab(tab);
      expect(indexVisible(tab)).toBe(expected.length >= 3);

      for (const section of expected) {
        const matches = container.querySelectorAll(`[id="${section.id}"]`);
        expect(matches, `Expected exactly one element with id="${section.id}" on ${tab}`).toHaveLength(1);
      }

      const idSelector = expected.map(s => `[id="${s.id}"]`).join(", ");
      const labelledSections = [...container.querySelectorAll("section[aria-labelledby]")];
      for (const el of labelledSections) {
        const covered = idSelector ? el.closest(idSelector) !== null : false;
        const excluded = el.hasAttribute("data-section-excluded");
        expect(
          covered || excluded,
          `Found <section aria-labelledby> on ${tab} that is neither in sectionsForTab("${tab}") nor marked data-section-excluded`
        ).toBe(true);
      }
    }
  );
});
