import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocation } from "react-router";
import * as fx from "../fixtures";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";

const mocks = vi.hoisted(() => ({
  getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn(), getHoldingsBundle: vi.fn(), getAllocation: vi.fn(), getSips: vi.fn(),
  getSipsMonthly: vi.fn(), getCoverageGaps: vi.fn(), getHistoryPoints: vi.fn(), getMonthDetail: vi.fn(),
}));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);

import { analyticsStore } from "../data/analyticsStore";
import OverviewPage from "./OverviewPage";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];
const bundle = (rows = fx.holdings()) => { const r = fx.aggregateHoldings(); return { holdings: rows, members: r.members, xirr: { lifetime: "0.1612", current: "0.1480", disclaimers: { lifetime: { alt_xirr: "0.1105", opening_cost_share: "0.3800" }, current: null } }, realized: r.realized_summary! }; };

function Probe() { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output>; }
function mount(opts: Parameters<typeof renderInShell>[1] = {}, path = "/portfolio/mutual-funds") {
  return renderInShell(<><OverviewPage /><Probe /></>, { path, scope: { members }, ...opts });
}
const page = async () => { await screen.findByTestId("value-total"); await screen.findByTestId("row-S-KOTAK:m1"); await screen.findByRole("heading", { name: "AMC Allocation" }); };

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  mocks.getHoldingsBundle.mockResolvedValue(bundle());
  mocks.getAllocation.mockResolvedValue(fx.allocation().allocation);
  mocks.getSips.mockResolvedValue(fx.sips().sips);
  mocks.getSipsMonthly.mockResolvedValue([]);
  mocks.getCoverageGaps.mockResolvedValue([]);
  mocks.getHistoryPoints.mockResolvedValue([]);
  mocks.getAnalyticsScope.mockResolvedValue(fx.analyticsCombined());
});

describe("OverviewPage", () => {
  it("renders the header, summary strip, synopsis, SIPs, holdings table and the three cards in the mockup's order", async () => {
    mount();
    await page();
    expect(screen.getByRole("heading", { level: 1, name: "All Investments" })).toBeInTheDocument();
    expect(screen.getByTestId("value-total")).toHaveTextContent("₹46,49,340");
    await waitFor(() => expect(screen.getByTestId("synopsis")).toHaveTextContent("Spread across 4 AMCs and 5 funds — 82% in Direct plans, with ₹50,575 in active SIPs this month."));
    const order = ["Total Portfolio Value", "SIPs", "Mutual Funds (5)", "AMC Allocation", "Family Members", "Quick Insights"].map(name => {
      const el = name === "Total Portfolio Value" ? screen.getByRole("group", { name }) : screen.getByRole("heading", { name });
      return el;
    });
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("listitem").map(li => li.textContent)).toEqual(expect.arrayContaining([
      "Your largest holding is Kotak Multi Cap Fund — 33.1% of your MF portfolio", "Spread across 4 AMCs and 5 funds", "82% Direct, 18% Regular", "₹50,575 in active SIPs scheduled this month",
    ])));
  });
  it("shows the tab strip with Overview as the current tab", async () => {
    mount();
    await page();
    const nav = screen.getByRole("navigation", { name: "Mutual Funds sections" });
    expect(nav.querySelector("[data-tab=overview] [aria-current=page]")).not.toBeNull();
  });
  it("shows the same figures in the strip, the table footer and the AMC legend", async () => {
    mount();
    await page();
    expect(screen.getByTestId("foot-value").textContent).toBe(screen.getByTestId("value-total").textContent);
    expect(screen.getByTestId("foot-invested").textContent).toBe(screen.getByTestId("value-invested").textContent);
    const legend = screen.getAllByTestId(/^legend-/).map(el => el.getAttribute("data-value")!);
    expect(legend.reduce((sum, v) => sum + Number(v), 0)).toBe(4649340);
  });
  it("shows a fund with one rupee value in the table and in its AMC drill-down", async () => {
    mount();
    await page();
    const tableValue = within(screen.getByTestId("row-S-HDFC:m3")).getByTestId("value").textContent;
    fireEvent.click(within(screen.getByTestId("legend-hdfc-mutual-fund")).getByRole("button"));
    expect(within(screen.getByRole("dialog")).getByTestId("drill-row")).toHaveTextContent(tableValue!);
  });
  it("fills the XIRR column from the per-fund benchmark section, with a dash when a fund has none", async () => {
    mount();
    await page();
    await waitFor(() => expect(within(screen.getByTestId("row-S-KOTAK:m1")).getByTestId("xirr")).toHaveTextContent("14.2%"));
    expect(within(screen.getByTestId("row-S-JM:m2")).getByTestId("xirr")).toHaveTextContent("18.6%");
    expect(within(screen.getByTestId("row-S-SBI:m3")).getByTestId("xirr")).toHaveTextContent("—");
  });
  it("keeps the table when the benchmark section has failed", async () => {
    mocks.getAnalyticsScope.mockResolvedValue({ scope: "combined", recomputing: false, sections: { benchmark_funds: { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" } } });
    mount();
    await page();
    await waitFor(() => expect(within(screen.getByTestId("row-S-KOTAK:m1")).getByTestId("xirr")).toHaveTextContent("—"));
    expect(within(screen.getByTestId("row-S-KOTAK:m1")).getByTestId("value")).toHaveTextContent("₹15,40,000");
  });
  it("makes one analytics request for the whole page", async () => {
    mount();
    await page();
    await waitFor(() => expect(within(screen.getByTestId("row-S-KOTAK:m1")).getByTestId("xirr")).toHaveTextContent("14.2%"));
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
  it("applies the sort in the query string on load and ignores a bad one", async () => {
    const first = mount({}, "/portfolio/mutual-funds?sort=today_change&dir=desc");
    await page();
    expect(screen.getAllByTestId(/^row-/).map(r => r.getAttribute("data-testid"))[0]).toBe("row-S-HDFC:m3");
    first.unmount();
    mount({}, "/portfolio/mutual-funds?sort=nonsense");
    await page();
    expect(screen.getAllByTestId(/^row-/).map(r => r.getAttribute("data-testid"))[0]).toBe("row-S-KOTAK:m1");
  });
  it("writes the sort to the query string when a header is clicked", async () => {
    mount();
    await page();
    fireEvent.click(screen.getByRole("button", { name: /^Value/ }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/portfolio/mutual-funds?sort=value&dir=desc");
    expect(screen.getAllByTestId(/^row-/)[0]).toHaveAttribute("data-testid", "row-S-KOTAK:m1");
    fireEvent.click(screen.getByRole("button", { name: /^Value/ }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/portfolio/mutual-funds?sort=value&dir=asc");
    expect(screen.getAllByTestId(/^row-/)[0]).toHaveAttribute("data-testid", "row-S-SBI:m3");
  });
  it("filters the table from the search box in the utility row", async () => {
    mount();
    await page();
    fireEvent.change(screen.getByRole("textbox", { name: "Search investments" }), { target: { value: "kotak" } });
    expect(screen.getAllByTestId(/^row-/)).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Mutual Funds (1)" })).toBeInTheDocument();
  });
  it("opens the fund's page from a row", async () => {
    mount();
    await page();
    fireEvent.click(within(screen.getByTestId("row-S-KOTAK:m1")).getByRole("button", { name: "Kotak Multi Cap Fund" }));
    expect(screen.getByTestId("loc")).toHaveTextContent("/portfolio/mutual-funds/funds/S-KOTAK");
  });
  it("opens the Mira dialog from Analyse with Mira", async () => {
    mount();
    await page();
    fireEvent.click(screen.getByRole("button", { name: "Analyse with Mira" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Mira is coming soon");
  });
  it("shows the empty state with an Add your first investment button that opens the import flow", async () => {
    mocks.getHoldingsBundle.mockResolvedValue(bundle([]));
    const openImport = vi.fn();
    mount({ openImport });
    expect(await screen.findByRole("heading", { name: "No mutual funds yet" })).toBeInTheDocument();
    expect(screen.getByText("Import your family's CAS statement and every fund, its value, and its performance will show up here.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Total Portfolio Value" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add your first investment" }));
    expect(openImport).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole("heading", { level: 1, name: "All Investments" })).toBeInTheDocument();
  });
  it("shows a page error with Retry only when both the holdings and the allocation fail", async () => {
    mocks.getHoldingsBundle.mockRejectedValue(new Error("x"));
    mocks.getAllocation.mockRejectedValue(new Error("y"));
    mount();
    expect(await screen.findByRole("heading", { name: "Couldn't load your mutual funds" })).toBeInTheDocument();
    expect(screen.getByText("There was a problem reaching our servers. Your data is safe — this is just a connection issue.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "SIPs" })).not.toBeInTheDocument();
    mocks.getHoldingsBundle.mockResolvedValue(bundle());
    mocks.getAllocation.mockResolvedValue(fx.allocation().allocation);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await page();
    expect(mocks.getHoldingsBundle).toHaveBeenCalledTimes(2);
    expect(mocks.getAllocation).toHaveBeenCalledTimes(2);
  });
  it("lets the allocation section fail alone and drops Quick Insights with it", async () => {
    mocks.getAllocation.mockRejectedValue(new Error("y"));
    mount();
    await screen.findByTestId("value-total");
    expect(await screen.findByRole("heading", { name: "Couldn't load your AMC allocation" })).toBeInTheDocument();
    expect(screen.getByTestId("row-S-KOTAK:m1")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Quick Insights" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("synopsis")).not.toBeInTheDocument();
  });
  it("asks for the selected member and leaves the family card out in a member view", async () => {
    mocks.getHoldingsBundle.mockResolvedValue({ ...bundle(fx.memberHoldings().holdings), members: [] });
    const openImport = vi.fn();
    mount({ scope: { members, viewMode: "member", memberId: "m1" }, openImport });
    await screen.findByTestId("row-S-KOTAK:m1");
    expect(mocks.getHoldingsBundle.mock.calls[0][0]).toEqual({ viewMode: "member", memberId: "m1" });
    expect(mocks.getCoverageGaps).toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Family Members" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Investment" }));
    expect(openImport).toHaveBeenCalledWith("m1");
  });
  it("marks every control with its effect (interactivity rule)", async () => {
    const { container } = mount();
    await page();
    expectInteractivity(container, 20);
  });
});
