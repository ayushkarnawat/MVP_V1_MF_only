import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fc from "../fixtures/mfC";
import * as fo from "../fixtures/mfCother";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { CategoryRankingSummary, CategoryRankRow } from "../types";
import { analyticsStore } from "../data/analyticsStore";
import { CategoryRankingBody, CategoryRankingGroup } from "./CategoryRankingGroup";
import OtherAnalyticsPage from "./OtherAnalyticsPage";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);
const period = (fund_return: string | null, category_avg: string | null) => ({ fund_return, category_avg, peers: 10 });
function sample(): CategoryRankingSummary {
  const base = { ...fo.categoryRanking().funds[0], category_unavailable: false, insufficient_history: false, thin_category: false };
  // The backend has removed these fields. Real comparisons must use only periods.
  delete (base as Partial<CategoryRankRow>).scheme_return;
  delete (base as Partial<CategoryRankRow>).category_rank;
  delete (base as Partial<CategoryRankRow>).category_size;
  delete (base as Partial<CategoryRankRow>).percentile;
  return { funds: [
    { ...base, scheme_id: "A", scheme_name: "Alpha Fund", plan_type: "direct", periods: {
      "1y": period("0.284", "0.198"), "3y": period("0.15", "0.12"), "5y": period("0.18", "0.14"),
    } },
    { ...base, scheme_id: "B", scheme_name: "Beta Fund", plan_type: "regular", periods: {
      "1y": period("0.10", "0.121"), "3y": period("0.19", "0.15"), "5y": period(null, "0.14"),
    } },
    { ...base, scheme_id: "C", scheme_name: "New Fund", insufficient_history: true, periods: {} },
  ] };
}
const mount = (data = sample()) => render(<CategoryRankingBody data={data} />);
const row = (id: string) => screen.getByTestId(`cat-row-${id}`);
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  analyticsStore.invalidate();
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});

describe("Category Average Comparison", () => {
  it("row_shows_both_dots_the_gap_line_and_the_exact_figures", () => {
    mount();
    const line = screen.getByTestId("comparison-A-1y");
    expect(within(line).getByTestId("fund-dot")).toBeInTheDocument();
    expect(within(line).getByTestId("category-dot")).toBeInTheDocument();
    expect(within(line).getByTestId("category-dot")).toHaveClass("border-2");
    expect(within(line).getByTestId("gap-line")).toBeInTheDocument();
    expect(line).toHaveTextContent("+8.6%");
    expect(line).toHaveTextContent("28.4% vs 19.8%");
    const f = parseFloat(within(line).getByTestId("fund-dot").style.left);
    const a = parseFloat(within(line).getByTestId("category-dot").style.left);
    expect(f).toBeGreaterThan(a);
    expect(parseFloat(within(line).getByTestId("gap-line").style.width)).toBeCloseTo(f - a);
    expect(screen.getAllByTestId("fund-logo")).toHaveLength(3);
    expect(row("A")).toHaveTextContent("Direct plan");
    expect(row("B")).toHaveTextContent("Regular plan");
  });
  it("gap_line_is_green_when_ahead_and_red_when_behind", () => {
    mount();
    expect(within(screen.getByTestId("comparison-A-1y")).getByTestId("gap-line")).toHaveStyle({ backgroundColor: "var(--pos)" });
    expect(within(screen.getByTestId("comparison-B-1y")).getByTestId("gap-line")).toHaveStyle({ backgroundColor: "var(--neg)" });
  });
  it("summary_counts_ahead_comparisons_and_names_the_one_to_watch", () => {
    mount();
    expect(screen.getByTestId("category-summary")).toHaveTextContent("Your funds beat their category average in 4 of 5 comparisons. Each number is your fund's return minus the average return of funds in the same category. Plus is better. The one to watch: Beta Fund over 1 year (-2.1%).");
  });
  it("chips_filter_the_cards", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Behind somewhere" }));
    expect(row("B")).toBeInTheDocument();
    expect(screen.queryByTestId("cat-row-A")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cat-row-C")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ahead everywhere" }));
    expect(row("A")).toBeInTheDocument();
    expect(screen.queryByTestId("cat-row-B")).not.toBeInTheDocument();
    expect(screen.getByTestId("category-summary")).toHaveTextContent("4 of 5 comparisons");
    fireEvent.click(screen.getByRole("button", { name: "All funds" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
  it("no_rank_badge_or_percentile_text_anywhere", () => {
    const old = sample();
    old.funds = old.funds.map(fund => ({ ...fund, category_rank: 1, percentile: "99", category_size: 900 }));
    const { container } = mount(old);
    expect(container.textContent).not.toMatch(/rank|percentile|pct|Top \d|#1/i);
    expect(container.querySelector('[data-testid^="cat-badge"], [data-testid^="cat-pct"], [data-testid^="cat-fill"]')).toBeNull();
  });
  it("cards_are_open_without_a_click", () => {
    mount();
    for (const key of ["1y", "3y", "5y"]) expect(screen.getByTestId(`comparison-A-${key}`)).toBeInTheDocument();
    expect(within(row("A")).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByTestId("comparison-B-5y")).toHaveTextContent("Needs 5 years of history");
    expect(row("C")).toHaveTextContent("Needs at least 3 years of history");
  });
  it("payload_that_still_carries_old_fields_ignores_them", () => {
    const { rerender, container } = mount();
    const before = container.textContent;
    const old = sample();
    old.funds = old.funds.map(fund => ({ ...fund, scheme_return: "999", category_avg_return: "999", category_rank: 888, percentile: "99", category_size: 777 }));
    rerender(<CategoryRankingBody data={old} />);
    expect(container.textContent).toBe(before);
    expect(container.textContent).not.toMatch(/999|888|777/);
  });
  it("heading_text_appears_once", async () => {
    const response = fc.analyticsMfC();
    response.sections.category_ranking = { payload: { members: [], ranking: sample() }, computed_at: "2026-10-31T00:00:00Z", failed_at: null };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    renderInShell(<OtherAnalyticsPage />, { path: "/portfolio/mutual-funds/analytics", scope: { members: [{ id: "m1", name: "Member" }], viewMode: "aggregate", memberId: null } });
    expect(await screen.findAllByRole("heading", { name: "Category Average Comparison" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Returns against the category average" })).toHaveLength(1);
  });
  it("shows an empty state and keeps each filter accessible", () => {
    const { container } = mount({ funds: [] });
    expect(screen.getByText("No category comparison data available.")).toBeInTheDocument();
    expectInteractivity(container, 3);
    expect(screen.getByRole("button", { name: "All funds" })).toHaveAttribute("aria-pressed", "true");
  });
  it("shows updating and unavailable states without using old blended figures", () => {
    const data = sample();
    data.funds[0].periods = undefined;
    data.funds[1].category_unavailable = true;
    mount(data);
    expect(row("A")).toHaveTextContent("Return comparisons are updating.");
    expect(row("B")).toHaveTextContent("Category data is not available for this fund.");
  });
  it("loads its section once and retains Retry", async () => {
    const response = fc.analyticsMfC();
    response.sections.category_ranking = { payload: null, computed_at: null, failed_at: "2026-10-31T00:00:00Z" };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    renderInShell(<CategoryRankingGroup />, { path: "/portfolio/mutual-funds/analytics", scope: { members: [{ id: "m1", name: "Member" }], viewMode: "aggregate", memberId: null } });
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("combined");
  });

  describe("category average weighting sentence on card", () => {
    it("renders Weighted by fund size. when fund_size with 0 without size", () => {
      const data = sample();
      data.funds[0].category_avg_weighting = "fund_size";
      data.funds[0].category_avg_funds_without_size = 0;
      mount(data);
      expect(within(row("A")).getByText("Weighted by fund size.")).toBeInTheDocument();
      expect(within(row("A")).getByText("Category average covers 10 funds (1Y), 10 (3Y), 10 (5Y).")).toBeInTheDocument();
    });

    it("renders singular sentence when 1 fund has no size on record", () => {
      const data = sample();
      data.funds[0].category_avg_weighting = "fund_size";
      data.funds[0].category_avg_funds_without_size = 1;
      mount(data);
      expect(within(row("A")).getByText("Weighted by fund size. 1 fund has no size on record and is left out.")).toBeInTheDocument();
    });

    it("renders plural sentence when 3 funds have no size on record", () => {
      const data = sample();
      data.funds[0].category_avg_weighting = "fund_size";
      data.funds[0].category_avg_funds_without_size = 3;
      mount(data);
      expect(within(row("A")).getByText("Weighted by fund size. 3 funds have no size on record and are left out.")).toBeInTheDocument();
    });

    it("renders Equal average sentence when weighting is equal", () => {
      const data = sample();
      data.funds[0].category_avg_weighting = "equal";
      data.funds[0].category_avg_funds_without_size = 10;
      mount(data);
      expect(within(row("A")).getByText("Equal average: no fund in this category has a size on record.")).toBeInTheDocument();
    });

    it("renders no weighting sentence when weighting is null or absent", () => {
      const data = sample();
      data.funds[0].category_avg_weighting = null;
      mount(data);
      expect(within(row("A")).queryByText(/Weighted by fund size/)).not.toBeInTheDocument();
      expect(within(row("A")).queryByText(/Equal average/)).not.toBeInTheDocument();
    });
  });
});
