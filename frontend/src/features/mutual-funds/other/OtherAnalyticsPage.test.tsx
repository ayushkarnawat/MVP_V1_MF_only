import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fc from "../fixtures/mfC";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";

const mocks = vi.hoisted(() => ({
  getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn(), getHoldingsBundle: vi.fn(), getAllocation: vi.fn(), getSips: vi.fn(),
  getSipsMonthly: vi.fn(), getCoverageGaps: vi.fn(), getHistoryPoints: vi.fn(), getMonthDetail: vi.fn(),
}));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);

import { analyticsStore } from "../data/analyticsStore";
import OtherAnalyticsPage from "./OtherAnalyticsPage";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];
const mount = (opts: Parameters<typeof renderInShell>[1] = {}) =>
  renderInShell(<OtherAnalyticsPage />, { path: "/portfolio/mutual-funds/analytics", scope: { members }, ...opts });
const ready = () => screen.findByTestId("score-weighted");
const FAILED = { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" };
const UNSETTLED = { payload: null, computed_at: null, failed_at: null };

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  mocks.getAnalyticsScope.mockResolvedValue(fc.analyticsMfC());
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});

describe("the page", () => {
  it("has the Other Analytics header, the tab strip with this tab current, and no Coming soon", async () => {
    mount();
    await ready();
    expect(screen.getByRole("heading", { level: 1, name: "Other Analytics" })).toBeInTheDocument();
    expect(screen.getByText("Cost, quality, and ranking views that go deeper than the headline dashboard.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" }).querySelector("[data-tab=analytics] [aria-current=page]")).not.toBeNull();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });
  it("shows the four groups in order, visually separated, with their exact titles and descriptions", async () => {
    mount();
    await ready();
    const groups = [...screen.getByTestId("analytics-groups").children];
    expect(groups.map(group => group.getAttribute("data-testid"))).toEqual(["group-cost", "group-scorer", "group-category", "group-ranking"]);
    const titles = ["Cost & Valuation", "Fund Quality Scorer", "SEBI Category Ranking & Peer Comparison", "Fund Ranking"];
    expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.id)).toEqual(["heading-cost", "heading-scorer", "heading-category", "heading-ranking"]);
    titles.forEach((name, index) => expect(screen.getAllByRole("heading", { level: 2 })[index]).toHaveAccessibleName(name));
    expect(screen.getByText("How expensive your funds are to hold, and how richly their holdings are priced.")).toBeInTheDocument();
    expect(screen.getByText("Unifolio's proprietary score — 45% Return, 30% Downside Risk, 25% Consistency vs. SEBI category peers, with a small TER cost nudge. Click a fund for its full breakdown.")).toBeInTheDocument();
    expect(screen.getByText("Where each fund sits among every other fund SEBI classifies in the same category.")).toBeInTheDocument();
    expect(screen.getByText("A transparent, formula-only composite — 3Y return 25% / 5Y return 25% / category-relative 20% / low volatility 15% / low TER 15%. Distinct from the Fund Quality Scorer above, which is proprietary.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.querySelector("[aria-hidden=true]")?.textContent)).toEqual(["1", "2", "3", "4"]);
  });
  it("puts the right cards in each group", async () => {
    mount();
    await ready();
    const titles = (id: string) => within(screen.getByTestId(id)).getAllByRole("heading", { level: 3 }).map(heading => heading.textContent);
    expect(titles("group-cost")).toEqual(["Total Expense Ratio (TER) & Cost Analysis", "Portfolio Valuation vs. Benchmarks"]);
    expect(titles("group-scorer")).toEqual(["Fund Quality Scores"]);
    expect(titles("group-category")).toEqual(["Category Rank"]);
    expect(titles("group-ranking")).toEqual(["Fund Leaderboard"]);
  });
  it("asks for the analytics once and for nothing else: every click is client side", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("ladder-toggle-S-KOTAK"));
    fireEvent.click(screen.getByRole("radio", { name: "Bar Chart" }));
    fireEvent.click(screen.getByTestId("score-card-S-JM"));
    fireEvent.click(screen.getByTestId("acc-evidence"));
    fireEvent.click(screen.getByTestId("cat-row-S-KOTAK"));
    fireEvent.click(screen.getByTestId("rank-row-S-KOTAK"));
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
    expect(mocks.getHoldingsBundle).not.toHaveBeenCalled();
    expect(mocks.getAllocation).not.toHaveBeenCalled();
    expect(mocks.getSips).not.toHaveBeenCalled();
  });
  it("asks for the selected member and reads the bare member payloads", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(fc.analyticsMfCMember());
    mount({ scope: { members, viewMode: "member", memberId: "m1" } });
    await ready();
    expect(mocks.getAnalyticsScope.mock.calls[0][0]).toBe("m1");
    expect(screen.getByTestId("ter-weighted")).toHaveTextContent("0.64%");
    expect(screen.getByTestId("score-verdict")).toHaveTextContent("High Quality Portfolio");
    expect(screen.getByTestId("rank-row-S-KOTAK")).toBeInTheDocument();
  });
});

describe("failure, loading and retry", () => {
  it("shows a page error with Retry when the analytics cannot be fetched, and recovers", async () => {
    mocks.getAnalyticsScope.mockRejectedValue(new Error("x"));
    mount();
    expect(await screen.findByRole("heading", { name: "Couldn't load your analytics" })).toBeInTheDocument();
    expect(screen.getByText("There was a problem reaching our servers. Your data is safe — this is just a connection issue.")).toBeInTheDocument();
    expect(screen.queryByTestId("analytics-groups")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" })).toBeInTheDocument();
    mocks.getAnalyticsScope.mockResolvedValue(fc.analyticsMfC());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await ready();
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("combined");
  });
  it("lets one section fail without touching the rest: one Retry, every other group whole", async () => {
    const response = fc.analyticsMfC();
    response.sections.score = FAILED;
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    await screen.findByTestId("ter-weighted");
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
    expect(within(screen.getByTestId("group-scorer")).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Fund Quality Scorer" })).toBeInTheDocument();
    expect(screen.getByTestId("rank-row-S-KOTAK")).toBeInTheDocument();
    expect(screen.getByTestId("cat-row-S-KOTAK")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("combined");
  });
  it("gives each failed section its own Retry, with the heading of its card kept", async () => {
    const response = fc.analyticsMfC();
    response.sections.valuation = FAILED;
    response.sections.category_ranking = FAILED;
    response.sections.ranking = FAILED;
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    await ready();
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(3);
    for (const title of ["Portfolio Valuation vs. Benchmarks", "Category Rank", "Fund Leaderboard"]) expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  });
  it("shows a loading status in each card whose section has not settled", async () => {
    const response = fc.analyticsMfC();
    for (const name of ["ter", "valuation", "score", "category_ranking", "ranking"] as const) response.sections[name] = UNSETTLED;
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    await screen.findByRole("status", { name: "Loading Fund Leaderboard" });
    expect(screen.getAllByRole("status").map(status => status.getAttribute("aria-label"))).toEqual([
      "Loading Total Expense Ratio (TER) & Cost Analysis", "Loading Portfolio Valuation vs. Benchmarks", "Loading Fund Quality Scores", "Loading Category Rank", "Loading Fund Leaderboard",
    ]);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(4);
  });
});

describe("one rupee value and one return per fund", () => {
  it("shows Kotak's value once, and its 3Y return identically in the cost ladder and the category rank", async () => {
    const { container } = mount();
    await ready();
    expect(container.textContent!.split("₹15,40,000").length - 1).toBe(1);
    fireEvent.click(screen.getByTestId("ladder-toggle-S-KOTAK"));
    fireEvent.click(screen.getByTestId("cat-row-S-KOTAK"));
    const ladder = screen.getByTestId("ladder-return-S-KOTAK-3y").textContent;
    const category = within(screen.getByRole("table", { name: "Kotak Multi Cap Fund returns by period" })).getByTestId("fund-3y").textContent;
    expect(ladder).toBe("15.1%");
    expect(category).toBe(ladder);
  });
  it("shows Kotak's TER once in the ladder and the same figure as the Low TER component", async () => {
    mount();
    await ready();
    expect(screen.getByTestId("ladder-ter-S-KOTAK")).toHaveTextContent("0.58%");
    fireEvent.click(screen.getByTestId("rank-row-S-KOTAK"));
    expect(screen.getByTestId("comp-low_ter-S-KOTAK")).toHaveTextContent("0.58%");
  });
});

describe("every control on the page", () => {
  it("is marked with its effect and exposes its state", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(screen.getByTestId("ladder-toggle-S-JM"));
    fireEvent.click(screen.getByTestId("score-card-S-HDFC"));
    fireEvent.click(screen.getByTestId("acc-methodology"));
    fireEvent.click(screen.getByTestId("cat-row-S-JM"));
    fireEvent.click(screen.getByTestId("rank-row-S-JM"));
    expectInteractivity(container, 18);
    expect(container.querySelectorAll("[data-clickable]")).toHaveLength(18);
  });
});
