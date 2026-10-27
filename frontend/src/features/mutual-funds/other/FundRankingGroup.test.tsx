import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fc from "../fixtures/mfC";
import * as fo from "../fixtures/mfCother";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { FundRankingRow, FundRankingSummary } from "../types";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);

import { analyticsStore } from "../data/analyticsStore";
import { FundRankingBody, FundRankingGroup } from "./FundRankingGroup";

const mount = (data: FundRankingSummary = fo.fundRanking()) => render(<FundRankingBody data={data} />);
const row = (id: string) => screen.getByTestId(`rank-row-${id}`);
const variant = (over: Partial<FundRankingRow>): FundRankingSummary => ({ funds: [{ ...fo.fundRanking().funds[0], ...over }] });

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});

describe("the leaderboard rows", () => {
  it("states the formula with weights that sum to 100 and tells the investor what a click does", () => {
    mount();
    expect(screen.getByTestId("rank-weights")).toHaveTextContent("Overall rank = composite score: 3Y return 25%, 5Y return 25%, category-relative 20%, low volatility 15%, low TER 15%. Click a fund to see its leaderboard neighbors and component breakdown.");
  });
  it("lists every fund, with its logo", () => {
    mount();
    expect(within(screen.getByRole("list", { name: "Fund ranking" })).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getAllByTestId("fund-logo")).toHaveLength(4);
  });
  it("shows the rank badge, category, ranked-on basis and plan for a ranked fund", () => {
    mount();
    expect(screen.getByTestId("rank-badge-S-KOTAK")).toHaveTextContent("#4");
    expect(row("S-KOTAK")).toHaveTextContent("Equity Scheme - Flexi Cap Fund");
    expect(row("S-KOTAK")).toHaveTextContent("Ranked on 3Y and 5Y returns");
    expect(row("S-KOTAK")).toHaveTextContent("Compared with Direct plan peers");
    expect(screen.getByTestId("rank-composite-S-KOTAK")).toHaveTextContent("Composite 82.0/100");
    expect(screen.getByTestId("rank-composite-S-JM")).toHaveTextContent("Composite 71.0/100");
  });
  it("tiers the badge on the composite score, switching at 33 and 66", () => {
    mount();
    expect(screen.getByTestId("rank-badge-S-KOTAK")).toHaveAttribute("data-tier", "high");
    expect(screen.getByTestId("rank-badge-S-JM")).toHaveAttribute("data-tier", "high");
    expect(screen.getByTestId("rank-badge-S-HDFC")).toHaveAttribute("data-tier", "mid");
    expect(screen.getByTestId("rank-badge-S-KOTAK")).toHaveStyle({ backgroundColor: "var(--pos-bg)", color: "var(--pos-text)" });
    expect(screen.getByTestId("rank-badge-S-HDFC")).toHaveStyle({ backgroundColor: "var(--warn-bg)", color: "var(--warn-text)" });
  });
  it("switches the badge tier at exactly 66 and 33 of the composite score", () => {
    const tierAt = (composite: string) => {
      const { unmount } = mount(variant({ composite_score: composite }));
      const tier = screen.getByTestId("rank-badge-S-KOTAK").getAttribute("data-tier");
      unmount();
      return tier;
    };
    expect(["66", "65.9", "33", "32.9"].map(tierAt)).toEqual(["high", "mid", "mid", "low"]);
  });
  it("writes the rank line, with the top share unless the category is thin", () => {
    mount();
    expect(screen.getByTestId("rank-line-S-KOTAK")).toHaveTextContent("#4 of 28 ranked · 40 in category · Top 11%");
    expect(screen.getByTestId("rank-line-S-JM")).toHaveTextContent("#11 of 42 ranked · 51 in category · Top 24%");
    expect(screen.getByTestId("rank-line-S-HDFC")).toHaveTextContent("3rd of 4 ranked Mid Cap funds · 14 in category");
  });
  it("badges a thin category with its peer count and explains it when the row is open", () => {
    mount();
    expect(row("S-HDFC")).toHaveTextContent("Thin Category (4 peers)");
    expect(row("S-KOTAK")).not.toHaveTextContent("Thin Category");
    expect(screen.queryByTestId("rank-thin-S-HDFC")).not.toBeInTheDocument();
    fireEvent.click(row("S-HDFC"));
    expect(screen.getByTestId("rank-thin-S-HDFC")).toHaveTextContent("Only 4 Mid Cap funds have a 3-year record, so this compares your fund with very few others.");
  });
  it("shows a message when there are no funds", () => {
    mount({ funds: [] });
    expect(screen.getByText("No fund ranking data available")).toBeInTheDocument();
  });
});

describe("expanding a row", () => {
  it("starts closed and opens the named leaderboard neighbours with the fund between them, in rank order", () => {
    mount();
    expect(row("S-KOTAK")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("rank-detail-S-KOTAK")).not.toBeInTheDocument();
    expect(screen.queryByText("Edelweiss Flexi Cap Fund")).not.toBeInTheDocument();
    fireEvent.click(row("S-KOTAK"));
    expect(row("S-KOTAK")).toHaveAttribute("aria-expanded", "true");
    const list = within(screen.getByRole("list", { name: "Leaderboard neighbors" }));
    expect(list.getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "#3 Edelweiss Flexi Cap Fund86.0/100", "#4 Kotak Multi Cap Fund (this fund)82.0/100", "#5 Baroda BNP Paribas Flexi Cap Fund79.0/100",
    ]);
    expect(screen.getByTestId("neighbor-you")).toHaveAttribute("data-you", "true");
    expect(screen.getByRole("heading", { name: "Leaderboard neighbors" })).toBeInTheDocument();
  });
  it("shows the five components with their weight, percentile, raw figure and a tier-coloured bar", () => {
    mount();
    fireEvent.click(row("S-KOTAK"));
    expect(screen.getByRole("heading", { name: "Component percentile within category" })).toBeInTheDocument();
    const text = (key: string) => screen.getByTestId(`comp-${key}-S-KOTAK`).textContent;
    expect(text("return_3y")).toBe("3Y return (25%)91st pct · 15.1%");
    expect(text("return_5y")).toBe("5Y return (25%)87th pct · 16.8%");
    expect(text("category_relative")).toBe("Category-relative (20%)78th pct · 2.1%");
    expect(text("low_volatility")).toBe("Low volatility (15%)72nd pct · 2.8%");
    expect(text("low_ter")).toBe("Low TER (15%)61st pct · 0.58%");
    expect(["return_3y", "return_5y", "category_relative", "low_volatility", "low_ter"].map(key => screen.getByTestId(`comp-${key}-S-KOTAK`).getAttribute("data-tier"))).toEqual(["high", "high", "high", "high", "mid"]);
    expect(["return_3y", "return_5y", "category_relative", "low_volatility", "low_ter"].map(key => screen.getByTestId(`comp-fill-${key}-S-KOTAK`).style.width)).toEqual(["91%", "87%", "78%", "72%", "61%"]);
    expect(screen.getByTestId("comp-fill-low_ter-S-KOTAK")).toHaveStyle({ backgroundColor: "var(--warn-text)" });
    expect(screen.getByTestId("comp-fill-return_3y-S-KOTAK")).toHaveStyle({ backgroundColor: "var(--pos)" });
  });
  it("draws no bar for a component without a percentile and shows its raw figure alone", () => {
    const data = variant({});
    data.funds[0].components.low_volatility = { percentile: null, raw: "0.0284" };
    data.funds[0].components.low_ter = { percentile: "20.0", raw: null };
    mount(data);
    fireEvent.click(row("S-KOTAK"));
    expect(screen.queryByTestId("comp-fill-low_volatility-S-KOTAK")).not.toBeInTheDocument();
    expect(screen.getByTestId("comp-low_volatility-S-KOTAK")).toHaveAttribute("data-tier", "none");
    expect(screen.getByTestId("comp-low_volatility-S-KOTAK")).toHaveTextContent("Low volatility (15%)— · 2.8%");
    expect(screen.getByTestId("comp-low_ter-S-KOTAK")).toHaveTextContent("Low TER (15%)20th pct");
    expect(screen.getByTestId("comp-low_ter-S-KOTAK")).toHaveAttribute("data-tier", "low");
  });
  it("also shows the fund's returns against its category for 1Y, 3Y and 5Y", () => {
    mount();
    fireEvent.click(row("S-KOTAK"));
    const table = screen.getByRole("table", { name: "Kotak Multi Cap Fund returns by period" });
    expect(["fund", "difference"].map(kind => ["1y", "3y", "5y"].map(key => within(table).getByTestId(`${kind}-${key}`).textContent))).toEqual([["18.4%", "15.1%", "16.8%"], ["+3.2pp", "+2.1pp", "+2.3pp"]]);
  });
  it("opens one row at a time and closes it on a second click", () => {
    mount();
    fireEvent.click(row("S-KOTAK"));
    fireEvent.click(row("S-JM"));
    expect(row("S-KOTAK")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("rank-detail-S-KOTAK")).not.toBeInTheDocument();
    expect(screen.getByTestId("rank-detail-S-JM")).toHaveTextContent("#10 UTI Flexi Cap Fund73.0/100");
    fireEvent.click(row("S-JM"));
    expect(screen.queryByTestId("rank-detail-S-JM")).not.toBeInTheDocument();
  });
});

describe("the three edge states", () => {
  it("shows a fund with no SEBI category as a card with a badge, not a button", () => {
    mount(variant({ category_unavailable: true }));
    expect(row("S-KOTAK").tagName).not.toBe("BUTTON");
    expect(row("S-KOTAK")).toHaveAttribute("data-state", "unavailable");
    expect(row("S-KOTAK")).toHaveTextContent("Category Unavailable");
    expect(within(row("S-KOTAK")).queryByRole("button")).not.toBeInTheDocument();
  });
  it("shows a fund with too little history as not ranked yet", () => {
    mount();
    expect(row("S-SBI")).toHaveAttribute("data-state", "insufficient");
    expect(row("S-SBI")).toHaveTextContent("Insufficient History");
    expect(row("S-SBI")).toHaveTextContent("Not ranked yet — needs 3 years of NAV history to be eligible.");
    expect(within(row("S-SBI")).queryByRole("button")).not.toBeInTheDocument();
  });
  it("shows a fund with too few peers its own numbers instead of a rank", () => {
    mount(variant({ too_few_peers: true, category_size: 3, category_universe_size: 8 }));
    expect(row("S-KOTAK")).toHaveAttribute("data-state", "too-few-peers");
    expect(row("S-KOTAK")).toHaveTextContent("Not enough peers");
    expect(row("S-KOTAK")).toHaveTextContent("Not enough peers to rank: 3 funds in this category have a 3-year record (8 in category).");
    expect(screen.getByTestId("rank-own-S-KOTAK")).toHaveTextContent("3Y return 15.1% · Expense ratio 0.58%");
    expect(row("S-KOTAK")).toHaveTextContent("Compared with Direct plan peers");
    expect(screen.getByRole("table", { name: "Kotak Multi Cap Fund returns by period" })).toBeInTheDocument();
    expect(within(row("S-KOTAK")).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rank-line-S-KOTAK")).not.toBeInTheDocument();
  });
  it("uses the singular for a single fund with a record, and a dash for a missing own figure", () => {
    const data = variant({ too_few_peers: true, category_size: 1, category_universe_size: 5 });
    data.funds[0].components.return_3y.raw = null;
    data.funds[0].components.low_ter.raw = null;
    mount(data);
    expect(row("S-KOTAK")).toHaveTextContent("Not enough peers to rank: 1 fund in this category has a 3-year record (5 in category).");
    expect(screen.getByTestId("rank-own-S-KOTAK")).toHaveTextContent("3Y return — · Expense ratio —");
  });
  it("checks the flags in the order unavailable, insufficient history, too few peers", () => {
    const { unmount } = mount(variant({ category_unavailable: true, insufficient_history: true, too_few_peers: true }));
    expect(row("S-KOTAK")).toHaveAttribute("data-state", "unavailable");
    unmount();
    mount(variant({ insufficient_history: true, too_few_peers: true }));
    expect(row("S-KOTAK")).toHaveAttribute("data-state", "insufficient");
  });
});

describe("the group", () => {
  const scope = { members: [{ id: "m1", name: "A" }, { id: "m2", name: "B" }] };
  it("loads its own section under the heading 'Fund Leaderboard' with one request", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(fc.analyticsMfC());
    renderInShell(<FundRankingGroup />, { path: "/portfolio/mutual-funds/analytics", scope });
    expect(await screen.findByRole("list", { name: "Fund ranking" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fund Leaderboard" })).toBeInTheDocument();
    fireEvent.click(row("S-KOTAK"));
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
  it("fails on its own with Retry", async () => {
    const response = fc.analyticsMfC();
    response.sections.ranking = { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    renderInShell(<FundRankingGroup />, { path: "/portfolio/mutual-funds/analytics", scope });
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
