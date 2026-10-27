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
