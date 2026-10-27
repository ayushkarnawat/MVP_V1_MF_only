import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fc from "../fixtures/mfC";
import * as fo from "../fixtures/mfCother";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { CategoryRankingSummary, CategoryRankRow } from "../types";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);

import { analyticsStore } from "../data/analyticsStore";
import { CategoryRankingBody, CategoryRankingGroup } from "./CategoryRankingGroup";

const mount = (data: CategoryRankingSummary = fo.categoryRanking()) => render(<CategoryRankingBody data={data} />);
const row = (id: string) => screen.getByTestId(`cat-row-${id}`);
const withPercentiles = (...values: string[]): CategoryRankingSummary => ({
  funds: values.map((percentile, index): CategoryRankRow => ({ ...fo.categoryRanking().funds[0], scheme_id: `P${index}`, scheme_name: `Fund ${index}`, percentile })),
});

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});

describe("the rows", () => {
  it("explains the ranking basis, then lists every fund in the payload's order", () => {
    mount();
    expect(screen.getByText("Ranked on the blended 3Y/5Y return. Click a fund to see its full 1Y/3Y/5Y return vs. its category.")).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Category ranking" })).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(["S-KOTAK", "S-HDFC", "S-JM", "S-SBI"].map(id => row(id).textContent!.includes("Fund"))).toEqual([true, true, true, true]);
    expect(screen.getAllByTestId("fund-logo")).toHaveLength(4);
  });
  it("shows the rank badge, the category with the rank out of the category size, and the percentile", () => {
    mount();
    expect(screen.getByTestId("cat-badge-S-KOTAK")).toHaveTextContent("#12");
    expect(screen.getByTestId("cat-badge-S-HDFC")).toHaveTextContent("#11");
    expect(screen.getByTestId("cat-badge-S-JM")).toHaveTextContent("#34");
    expect(row("S-KOTAK")).toHaveTextContent("Flexi Cap Fund · rank 12 of 28");
    expect(row("S-HDFC")).toHaveTextContent("Mid Cap Fund · rank 11 of 14");
    expect(screen.getByTestId("cat-pct-S-KOTAK")).toHaveTextContent("59th pct · Top 41%");
    expect(screen.getByTestId("cat-pct-S-HDFC")).toHaveTextContent("23rd pct · Top 77%");
    expect(screen.getByTestId("cat-pct-S-JM")).toHaveTextContent("20th pct · Top 80%");
  });
  it("sizes the percentile bar from the percentile itself", () => {
    mount();
    expect(screen.getByTestId("cat-fill-S-KOTAK")).toHaveStyle({ width: "59.3%" });
    expect(screen.getByTestId("cat-fill-S-HDFC")).toHaveStyle({ width: "23.1%" });
    expect(screen.getByTestId("cat-fill-S-JM")).toHaveStyle({ width: "19.5%" });
  });
  it("colours the percentile tier red, amber or green, switching at exactly 33 and 66", () => {
    mount(withPercentiles("66", "65.99", "33", "32.99", "100", "0"));
    expect(["P0", "P1", "P2", "P3", "P4", "P5"].map(id => row(id).getAttribute("data-tier"))).toEqual(["high", "mid", "mid", "low", "high", "low"]);
    expect(["P0", "P1", "P3"].map(id => screen.getByTestId(`cat-fill-${id}`).getAttribute("data-tier"))).toEqual(["high", "mid", "low"]);
    expect(screen.getByTestId("cat-fill-P0")).toHaveStyle({ backgroundColor: "var(--pos)" });
    expect(screen.getByTestId("cat-fill-P1")).toHaveStyle({ backgroundColor: "var(--warn-text)" });
    expect(screen.getByTestId("cat-fill-P3")).toHaveStyle({ backgroundColor: "var(--neg)" });
    expect(screen.getByTestId("cat-badge-P0")).toHaveStyle({ backgroundColor: "var(--pos-bg)", color: "var(--pos-text)" });
    expect(screen.getByTestId("cat-badge-P3")).toHaveStyle({ backgroundColor: "var(--neg-bg)", color: "var(--neg-text)" });
  });
  it("marks a thin category with its peer count, and only that one", () => {
    mount();
    expect(screen.getByTestId("cat-thin-S-HDFC")).toHaveTextContent("Thin Category (14 peers)");
    expect(screen.queryByTestId("cat-thin-S-KOTAK")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cat-thin-S-JM")).not.toBeInTheDocument();
  });
  it("says which plan the peers are, only for a Direct or Regular plan", () => {
    const data = fo.categoryRanking();
    data.funds[1].plan_type = "unclassified";
    data.funds[2].plan_type = null;
    mount(data);
    expect(row("S-KOTAK")).toHaveTextContent("Compared with Direct plan peers");
    expect(row("S-HDFC")).not.toHaveTextContent("plan peers");
    expect(row("S-JM")).not.toHaveTextContent("plan peers");
    mount({ funds: [{ ...fo.categoryRanking().funds[0], scheme_id: "R", scheme_name: "R Fund", plan_type: "regular" }] });
    expect(screen.getByTestId("cat-row-R")).toHaveTextContent("Compared with Regular plan peers");
  });
  it("shows no percentile bar for a ranked fund that has no percentile", () => {
    const data = fo.categoryRanking();
    data.funds[0].percentile = null;
    mount(data);
    expect(screen.queryByTestId("cat-fill-S-KOTAK")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cat-pct-S-KOTAK")).not.toBeInTheDocument();
    expect(row("S-KOTAK")).toHaveAttribute("data-tier", "none");
  });
  it("shows a message when no fund is ranked", () => {
    mount({ funds: [] });
    expect(screen.getByText("No category ranking data available")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Category ranking" })).not.toBeInTheDocument();
  });
});

describe("expanding a row", () => {
  it("opens, in place, the fund against its category average for 1Y, 3Y and 5Y with the exact gap in points", () => {
    mount();
    expect(row("S-KOTAK")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("cat-detail-S-KOTAK")).not.toBeInTheDocument();
    fireEvent.click(row("S-KOTAK"));
    expect(row("S-KOTAK")).toHaveAttribute("aria-expanded", "true");
    const detail = screen.getByTestId("cat-detail-S-KOTAK");
    const table = within(detail).getByRole("table", { name: "Kotak Multi Cap Fund returns by period" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Return", "1Y", "3Y", "5Y"]);
    expect(["fund", "category", "difference"].map(kind => ["1y", "3y", "5y"].map(key => within(table).getByTestId(`${kind}-${key}`).textContent))).toEqual([
      ["18.4%", "15.1%", "16.8%"], ["15.2%", "13.0%", "14.5%"], ["+3.2pp", "+2.1pp", "+2.3pp"],
    ]);
    expect(within(table).getByText("Category average covers 28 funds (1Y), 28 (3Y), 24 (5Y).")).toBeInTheDocument();
    expect(screen.getByTestId("cat-outperform-S-KOTAK")).toHaveTextContent("Outperforming its Flexi Cap Fund category average over 3Y by 2.1pp.");
  });
  it("shows a trailing fund with negative gaps", () => {
    mount();
    fireEvent.click(row("S-JM"));
    const table = screen.getByRole("table", { name: "JM Flexi Cap Fund returns by period" });
    expect(["1y", "3y", "5y"].map(key => within(table).getByTestId(`difference-${key}`).textContent)).toEqual(["-2.8pp", "-1.8pp", "-1.8pp"]);
    expect(screen.getByTestId("cat-outperform-S-JM")).toHaveTextContent("Trailing its Flexi Cap Fund category average over 3Y by 1.8pp.");
  });
  it("compares only with the category average: three rows, never a named peer", () => {
    mount();
    fireEvent.click(row("S-KOTAK"));
    const detail = screen.getByTestId("cat-detail-S-KOTAK");
    expect(within(detail).getAllByRole("row")).toHaveLength(4);
    expect(within(detail).getAllByRole("rowheader").map(cell => cell.textContent)).toEqual(["Fund", "Category average", "Difference"]);
    expect(detail.textContent).not.toMatch(/Edelweiss|Baroda|peer fund|vs\./);
  });
  it("opens one row at a time and closes it on a second click", () => {
    mount();
    fireEvent.click(row("S-KOTAK"));
    fireEvent.click(row("S-JM"));
    expect(row("S-KOTAK")).toHaveAttribute("aria-expanded", "false");
    expect(row("S-JM")).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByTestId("cat-detail-S-KOTAK")).not.toBeInTheDocument();
    fireEvent.click(row("S-JM"));
    expect(screen.queryByTestId("cat-detail-S-JM")).not.toBeInTheDocument();
  });
  it("shows a dash where a period has no figure and no table when the fund has no periods", () => {
    const data = fo.categoryRanking();
    data.funds[0].periods = { "3y": { fund_return: "0.1510", category_avg: null, peers: 0 } };
    data.funds[2].periods = undefined;
    mount(data);
    fireEvent.click(row("S-KOTAK"));
    expect(screen.getByTestId("fund-1y")).toHaveTextContent("—");
    expect(screen.getByTestId("category-3y")).toHaveTextContent("—");
    expect(screen.getByTestId("difference-3y")).toHaveTextContent("—");
    fireEvent.click(row("S-JM"));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByTestId("cat-outperform-S-JM")).toBeInTheDocument();
  });
});

describe("the edge states", () => {
  it("shows a fund with no SEBI category as a card with a badge and a message, not a button", () => {
    mount();
    const sbi = row("S-SBI");
    expect(sbi.tagName).not.toBe("BUTTON");
    expect(sbi).toHaveAttribute("data-state", "unavailable");
    expect(sbi).toHaveTextContent("SBI Bluechip Fund");
    expect(sbi).toHaveTextContent("Category Unavailable");
    expect(sbi).toHaveTextContent("SEBI category data is not available for this fund scheme to compute rank positioning.");
    expect(within(sbi).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cat-fill-S-SBI")).not.toBeInTheDocument();
  });
  it("shows a fund with too little history the same way, with its own message", () => {
    const data = fo.categoryRanking();
    data.funds[3] = { ...data.funds[3], category_unavailable: false, insufficient_history: true };
    mount(data);
    expect(row("S-SBI")).toHaveAttribute("data-state", "insufficient");
    expect(row("S-SBI")).toHaveTextContent("Insufficient History");
    expect(row("S-SBI")).toHaveTextContent("Fund has insufficient historical NAV records to meet category ranking requirements.");
  });
});

describe("the group", () => {
  const scope = { members: [{ id: "m1", name: "A" }, { id: "m2", name: "B" }] };
  it("loads its own section under the heading 'Category Rank' with one request", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(fc.analyticsMfC());
    renderInShell(<CategoryRankingGroup />, { path: "/portfolio/mutual-funds/analytics", scope });
    expect(await screen.findByRole("list", { name: "Category ranking" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Category Rank" })).toBeInTheDocument();
    fireEvent.click(row("S-KOTAK"));
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
  it("fails on its own with Retry", async () => {
    const response = fc.analyticsMfC();
    response.sections.category_ranking = { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    renderInShell(<CategoryRankingGroup />, { path: "/portfolio/mutual-funds/analytics", scope });
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("combined");
  });
});

describe("every control", () => {
  it("is marked with its effect and exposes its state", () => {
    const { container } = mount();
    fireEvent.click(row("S-KOTAK"));
    expectInteractivity(container, 3);
    expect(container.querySelectorAll("[data-clickable]")).toHaveLength(3);
  });
});
