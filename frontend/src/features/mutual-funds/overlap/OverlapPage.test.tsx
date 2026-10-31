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
import OverlapPage from "./OverlapPage";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];
const mount = (opts: Parameters<typeof renderInShell>[1] = {}) =>
  renderInShell(<OverlapPage />, { path: "/portfolio/mutual-funds/overlap", scope: { members }, ...opts });
const ready = () => screen.findByTestId("overlap-cards");
const TOP = "S-KOTAK~S-SBI";
const cell = (row: string, column: string) => screen.getByTestId(`cell-${row}-${column}`);

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  mocks.getAnalyticsScope.mockResolvedValue(fc.analyticsMfC());
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});

describe("the page", () => {
  it("has the Overlap header, the tab strip with this tab current, and the six blocks in order", async () => {
    mount();
    await ready();
    await screen.findByTestId("stat-strip");
    expect(screen.getByRole("heading", { level: 1, name: "Overlap" })).toBeInTheDocument();
    expect(screen.getByText("How much your equity funds duplicate each other's stock picks.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" }).querySelector("[data-tab=overlap] [aria-current=page]")).not.toBeNull();
    const blocks = [...screen.getByTestId("overlap-cards").children].map(block => block.getAttribute("data-testid"));
    expect(blocks).toEqual(["card-stat-strip", "card-common-holdings", "card-heatmap", "card-top-pairs", "card-impact", "card-concentration"]);
    expect(screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent)).toEqual([
      "1. Common Holdings", "2. Overlap Heatmap", "3. Top Overlapping Fund Pairs", "4. Overlap Impact", "5. Stock Concentration",
    ]);
  });
  it("puts the full coverage banner above the stat strip (audit finding 2)", async () => {
    mount();
    const banner = await screen.findByRole("complementary", { name: "Portfolio disclosure coverage" });
    const strip = await screen.findByTestId("stat-strip");
    expect(banner).toHaveTextContent("Based on 91.4% of your portfolio");
    expect(banner).toHaveTextContent("HDFC Overnight Fund — not published yet");
    expect(banner).toHaveTextContent("Axis International Fund of Fund — not available from this AMC");
    expect(banner.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("stat-funds-value")).toHaveTextContent("4 of 7");
  });
  it("asks for the analytics once and for nothing else: every click is client side", async () => {
    mount();
    await ready();
    await screen.findByTestId("stat-strip");
    fireEvent.click(cell("S-JM", "S-SBI"));
    fireEvent.click(screen.getByTestId("impact-row-unique"));
    fireEvent.click(screen.getByRole("button", { name: "View all common holdings →" }));
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
    expect(mocks.getHoldingsBundle).not.toHaveBeenCalled();
    expect(mocks.getAllocation).not.toHaveBeenCalled();
  });
});

describe("one selected pair, two ways to pick it", () => {
  it("opens with the highest-overlap pair selected in the grid, the table and the detail", async () => {
    mount();
    await screen.findByTestId("pair-detail");
    expect(screen.getByRole("heading", { name: "Kotak Multi Cap Fund × SBI Bluechip Fund — shared holdings" })).toBeInTheDocument();
    expect(cell("S-KOTAK", "S-SBI")).toHaveAttribute("aria-pressed", "true");
    expect(cell("S-SBI", "S-KOTAK")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId(`pair-button-${TOP}`)).toHaveAttribute("aria-pressed", "true");
  });
  it("selects the same pair in the table and opens the same detail when a heatmap cell is clicked", async () => {
    mount();
    await screen.findByTestId("pair-detail");
    fireEvent.click(cell("S-SBI", "S-JM"));
    expect(screen.getByTestId("pair-button-S-JM~S-SBI")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId(`pair-button-${TOP}`)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { name: "JM Flexi Cap Fund × SBI Bluechip Fund — shared holdings" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: true }).filter(button => button.getAttribute("data-testid")?.startsWith("cell-"))).toHaveLength(2);
  });
  it("highlights the matching heatmap cells and opens the same detail when a pair row is clicked", async () => {
    mount();
    await screen.findByTestId("pair-detail");
    fireEvent.click(screen.getByTestId("pair-button-S-JM~S-KOTAK"));
    expect(cell("S-KOTAK", "S-JM")).toHaveAttribute("aria-pressed", "true");
    expect(cell("S-JM", "S-KOTAK")).toHaveAttribute("aria-pressed", "true");
    expect(cell("S-KOTAK", "S-SBI")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { name: "Kotak Multi Cap Fund × JM Flexi Cap Fund — shared holdings" })).toBeInTheDocument();
    expect(screen.getByTestId("pair-detail-summary")).toHaveTextContent("23.70% overlap · 4 shared stocks");
  });
  it("shows the same overlap for a pair in the heatmap cell, the pair table and the detail", async () => {
    mount();
    await screen.findByTestId("pair-detail");
    expect(cell("S-JM", "S-SBI")).toHaveTextContent("26%");
    expect(screen.getByTestId("pair-overlap-S-JM~S-SBI")).toHaveTextContent("26%");
    fireEvent.click(cell("S-JM", "S-SBI"));
    expect(screen.getByTestId("pair-detail-summary")).toHaveTextContent("26.40%");
  });
});

describe("scope and data", () => {
  it("asks for the selected member and reads the bare member payload", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(fc.analyticsMfCMember());
    mount({ scope: { members, viewMode: "member", memberId: "m1" } });
    await screen.findByTestId("stat-strip");
    expect(mocks.getAnalyticsScope.mock.calls[0][0]).toBe("m1");
    expect(screen.getByTestId("stat-pairs-value")).toHaveTextContent("3 of 6");
  });
  it("shows the documented empty state, still with the coverage banner, when fewer than two funds have holdings", async () => {
    const response = fc.analyticsMfC();
    const overlap = fc.overlapSummary();
    overlap.matrix_funds = overlap.matrix_funds.slice(0, 1);
    overlap.matrix = [];
    overlap.pairs_above_low = [];
    overlap.total_fund_count = 1;
    response.sections.overlap = { payload: { members: [], overlap }, computed_at: "2026-10-26T01:00:00Z", failed_at: null };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    expect(await screen.findByTestId("overlap-empty")).toHaveTextContent("Overlap needs at least two funds with published holdings.");
    expect(screen.queryByTestId("stat-strip")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Overlap heatmap" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Portfolio disclosure coverage" })).toBeInTheDocument();
  });
  it("notes the cut grid when the portfolio has more covered funds than the matrix shows", async () => {
    const response = fc.analyticsMfC();
    const overlap = fc.overlapSummary();
    overlap.matrix_truncated = true;
    overlap.total_fund_count = 15;
    response.sections.overlap = { payload: { members: [], overlap }, computed_at: "2026-10-26T01:00:00Z", failed_at: null };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    expect(await screen.findByTestId("heatmap-scope")).toHaveTextContent("Top 4 funds by value, out of 15 covered funds");
    expect(screen.getByTestId("stat-funds-value")).toHaveTextContent("15 of 18");
  });
});

describe("errors, section by section", () => {
  it("shows a page error with Retry when the data cannot be fetched, and recovers", async () => {
    mocks.getAnalyticsScope.mockRejectedValue(new Error("x"));
    mount();
    expect(await screen.findByRole("heading", { name: "Couldn't load overlap analysis" })).toBeInTheDocument();
    expect(screen.getByText("There was a problem reaching our servers. Your data is safe — this is just a connection issue.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" })).toBeInTheDocument();
    mocks.getAnalyticsScope.mockResolvedValue(fc.analyticsMfC());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await ready();
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("combined");
  });
  it("lets the overlap section fail alone: the strip and the four overlap cards each offer Retry while Common Holdings still shows", async () => {
    const response = fc.analyticsMfC();
    response.sections.overlap = { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    expect(await screen.findAllByRole("button", { name: "Retry" })).toHaveLength(5);
    expect(screen.getByText("Couldn't load the overlap summary.")).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Common holdings" })).toBeInTheDocument();
    for (const title of ["2. Overlap Heatmap", "3. Top Overlapping Fund Pairs", "4. Overlap Impact", "5. Stock Concentration"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });
  it("lets the stock section fail alone: only Common Holdings offers Retry", async () => {
    const response = fc.analyticsMfC();
    response.sections.stock_holdings = { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    await screen.findByTestId("stat-strip");
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
    expect(within(screen.getByTestId("card-common-holdings")).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Overlap heatmap" })).toBeInTheDocument();
  });
});

describe("leaving the page and the rules", () => {
  it("opens the Holdings page, at the all-holdings card, from a concentration chip", async () => {
    renderInShell(undefined, { path: "/portfolio/mutual-funds/overlap", scope: { members } });
    fireEvent.click(await screen.findByTestId("conc-chip-5"));
    expect(await screen.findByTestId("holdings-cards")).toBeInTheDocument();
    expect(screen.getByTestId("card-all-stocks")).toHaveAttribute("id", "all-holdings");
    expect(screen.getByRole("heading", { level: 1, name: "Holdings" })).toBeInTheDocument();
  });
  it("marks every control on the page with its effect (interactivity rule)", async () => {
    const { container } = mount();
    await screen.findByTestId("pair-detail");
    fireEvent.click(cell("S-JM", "S-SBI"));
    fireEvent.click(screen.getByTestId("impact-row-other"));
    fireEvent.click(screen.getByTestId("common-toggle-INE040A01034"));
    expectInteractivity(container, 30);
  });
});


function t14Summary() {
  const summary = fc.overlapSummary();
  const category = (ids: string[]) => {
    const funds = summary.matrix_funds.filter(f => ids.includes(f.scheme_id));
    const pairs = summary.matrix.filter(p => ids.includes(p.fund_a.scheme_id) && ids.includes(p.fund_b.scheme_id));
    return { ...summary, matrix_funds: funds, matrix: pairs, pairs_above_low: pairs,
      impact_pairs: [], pairs_at_low_boundary: [], total_fund_count: funds.length, matrix_truncated: false };
  };
  return Object.assign(summary, {
    by_category: {
      "Large Cap": category(summary.matrix_funds.slice(0, 2).map(f => f.scheme_id)),
      "Mid Cap": category([]),
      "Small Cap": category([]),
      "Flexi Cap": category([summary.matrix_funds[2].scheme_id]),
    },
    excluded_funds: [{ name: "Debt example", reason: "This is a debt fund, so it isn't counted in an equity overlap." }],
  });
}

function mountT14(summary = t14Summary()) {
  const response = fc.analyticsMfC();
  response.sections.overlap = { payload: { members: [], overlap: summary }, computed_at: "2026-10-26T01:00:00Z", failed_at: null };
  mocks.getAnalyticsScope.mockResolvedValue(response);
  mount();
}

describe("T1.4 equity categories", () => {
  it("offers All funds and By category and remembers the chosen category", async () => {
    mountT14();
    fireEvent.click(await screen.findByRole("tab", { name: "By category" }));
    fireEvent.click(screen.getByRole("button", { name: "Large Cap: 2 funds" }));
    expect(screen.getByRole("tab", { name: "Large Cap" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "All funds" }));
    fireEvent.click(screen.getByRole("tab", { name: "By category" }));
    expect(screen.getByRole("tab", { name: "Large Cap" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table", { name: "Overlap heatmap" })).toBeInTheDocument();
  });
  it("greys a one-fund card and opens a message with a button back to All funds", async () => {
    mountT14();
    fireEvent.click(await screen.findByRole("tab", { name: "By category" }));
    const card = screen.getByRole("button", { name: "Flexi Cap: 1 fund" });
    expect(card).toHaveClass("opacity-60");
    fireEvent.click(card);
    expect(screen.getByTestId("overlap-empty")).toHaveTextContent("Overlap needs at least two funds");
    fireEvent.click(screen.getByRole("button", { name: "Back to All funds" }));
    expect(screen.getByRole("tab", { name: "All funds" })).toHaveAttribute("aria-selected", "true");
  });
  it("says no funds for an empty category", async () => {
    mountT14();
    fireEvent.click(await screen.findByRole("tab", { name: "By category" }));
    expect(screen.getByRole("button", { name: "Small Cap: no funds" })).toBeDisabled();
  });
  it("names not-shown funds and their plain reason", async () => {
    mountT14();
    expect(await screen.findByRole("note", { name: "Funds not shown" })).toHaveTextContent("Debt example");
    expect(screen.getByRole("note", { name: "Funds not shown" })).toHaveTextContent("This is a debt fund, so it isn't counted in an equity overlap.");
    expect(screen.getByTestId("stat-funds-note")).toHaveTextContent("1 fund is not shown in this equity comparison.");
  });
  it("shows a page-level message when there are no equity funds", async () => {
    const data = t14Summary();
    data.matrix_funds = []; data.matrix = []; data.total_fund_count = 0;
    mountT14(data);
    expect(await screen.findByTestId("overlap-empty")).toHaveTextContent("No equity funds to compare.");
    expect(screen.queryByRole("table", { name: "Overlap heatmap" })).not.toBeInTheDocument();
  });
  it("says overlap needs two when there is one equity fund", async () => {
    const data = t14Summary();
    data.matrix_funds = data.matrix_funds.slice(0, 1); data.matrix = []; data.total_fund_count = 1;
    mountT14(data);
    expect(await screen.findByTestId("overlap-empty")).toHaveTextContent("Overlap needs at least two funds with published holdings.");
    expect(await screen.findByRole("tab", { name: "All funds" })).toHaveAttribute("aria-selected", "true");
  });
  it("renders an old payload as All funds only", async () => {
    mount();
    expect(await screen.findByRole("tab", { name: "All funds" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "By category" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Overlap heatmap" })).toBeInTheDocument();
  });
  it("shows other-category funds only in All funds", async () => {
    const data = t14Summary();
    const other = data.matrix_funds[3];
    mountT14(data);
    expect(await screen.findByTestId(`hm-row-${other.scheme_id}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "By category" }));
    fireEvent.click(screen.getByRole("button", { name: "Large Cap: 2 funds" }));
    expect(screen.queryByTestId(`hm-row-${other.scheme_id}`)).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^hm-row-/)).toHaveLength(2);
  });
});
