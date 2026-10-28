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
const legacy = vi.hoisted(() => ({
  postOpeningBalance: vi.fn(), getAggregateDistributorComparison: vi.fn(), getMemberDistributorComparison: vi.fn(), getFundNavHistory: vi.fn(),
}));
const auth = vi.hoisted(() => ({ me: { user_id: "u-1" } as { user_id: string } | null }));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../../auth/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../api", () => mocks);
// The moved legacy parts call these old API modules themselves (they live in components/mf, outside the feature).
vi.mock("../../import/api", () => ({ postOpeningBalance: legacy.postOpeningBalance }));
vi.mock("../../dashboard/api", () => ({
  getAggregateDistributorComparison: legacy.getAggregateDistributorComparison,
  getMemberDistributorComparison: legacy.getMemberDistributorComparison,
  getFundNavHistory: legacy.getFundNavHistory,
}));

import { analyticsStore } from "../data/analyticsStore";
import OverviewPage from "./OverviewPage";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];
const bundle = (rows = fx.holdings()) => { const r = fx.aggregateHoldings(); return { holdings: rows, members: r.members, xirr: { lifetime: "0.1612", current: "0.1480", disclaimers: { lifetime: { alt_xirr: "0.1105", opening_cost_share: "0.3800" }, current: null } }, realized: r.realized_summary! }; };

function Probe() { const l = useLocation(); return <output data-testid="loc">{l.pathname + l.search}</output>; }
function mount(opts: Parameters<typeof renderInShell>[1] = {}, path = "/portfolio/mutual-funds") {
  return renderInShell(<><OverviewPage /><Probe /></>, { path, scope: { members }, ...opts });
}
const page = async () => { await screen.findByTestId("value-total"); await screen.findByTestId("row-S-KOTAK:m1"); await screen.findByRole("heading", { name: "AMC Allocation" }); };

const directRow = { arn_code: null, distributor_name: null, arn_status: null, amount_invested: "3672000.00", current_value: "4822992.00", current_profit_total: "1150992.00", realized_gain: "0.00", unrealized_gain: "1150992.00", schemes: [] };
const brokerRow = { arn_code: "ARN-99214", distributor_name: "Prudent Wealth Advisors", arn_status: "ACTIVE", amount_invested: "1028000.00", current_value: "1355608.00", current_profit_total: "327608.00", realized_gain: "0.00", unrealized_gain: "327608.00", schemes: [] };
const gaps = () => fx.coverageGaps();
const memberMount = (opts: Parameters<typeof renderInShell>[1] = {}) => mount({ scope: { members, viewMode: "member", memberId: "m1" }, ...opts });
const memberBundle = (realizedFunds = fx.aggregateHoldings().realized_summary!.funds) => ({ ...bundle(fx.memberHoldings().holdings), members: [], realized: { total: "210000.00", funds: realizedFunds } });

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  Object.values(legacy).forEach(m => m.mockReset());
  auth.me = { user_id: "u-1" };
  legacy.getAggregateDistributorComparison.mockResolvedValue({ members: [], rows: [directRow, brokerRow] });
  legacy.getMemberDistributorComparison.mockResolvedValue([directRow, brokerRow]);
  legacy.getFundNavHistory.mockResolvedValue({ scheme_id: "S-KOTAK", period: "1Y", requested_period: "1Y", clamped: false, points: [], overall_return_pct: null });
  legacy.postOpeningBalance.mockResolvedValue({});
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
  it("opens the Fund Details popup from a row and stays on the page", async () => {
    mount();
    await page();
    fireEvent.click(within(screen.getByTestId("row-S-KOTAK:m1")).getByRole("button", { name: "Kotak Multi Cap Fund" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Fund Details");
    expect(dialog).toHaveTextContent("Kotak Multi Cap Fund");
    expect(dialog).toHaveTextContent("Kotak Mahindra Mutual Fund");
    expect(dialog).toHaveTextContent("₹15,40,000");
    expect(screen.getByTestId("loc")).toHaveTextContent(/^\/portfolio\/mutual-funds$/);
    await waitFor(() => expect(legacy.getFundNavHistory).toHaveBeenCalledWith("S-KOTAK", expect.anything(), expect.anything()));
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

describe("OverviewPage, the legacy parts wired back in (MF-D1)", () => {
  it("opens Compare Distributors from the table header and loads the comparison only then", async () => {
    mount();
    await page();
    expect(legacy.getAggregateDistributorComparison).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Compare Distributors" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Distributor Comparison");
    expect(await within(dialog).findByText("Direct Plan (No Broker)")).toBeInTheDocument();
    expect(within(dialog).getByText("Prudent Wealth Advisors")).toBeInTheDocument();
    expect(legacy.getAggregateDistributorComparison).toHaveBeenCalledTimes(1);
    expect(legacy.getMemberDistributorComparison).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("asks for the selected member's comparison in a member view", async () => {
    memberMount();
    await screen.findByTestId("row-S-KOTAK:m1");
    fireEvent.click(screen.getByRole("button", { name: "Compare Distributors" }));
    await screen.findByText("Direct Plan (No Broker)");
    expect(legacy.getMemberDistributorComparison).toHaveBeenCalledTimes(1);
    expect(legacy.getMemberDistributorComparison.mock.calls[0][0]).toBe("m1");
    expect(legacy.getAggregateDistributorComparison).not.toHaveBeenCalled();
  });
  it("builds no Export button and no PDF download anywhere on the page", async () => {
    mount();
    await page();
    expect(screen.queryByRole("button", { name: /export/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/export|download pdf/i)).not.toBeInTheDocument();
  });
  it("shows a row's own member's figures in the Fund Details popup when two members hold the fund", async () => {
    const second = { ...fx.holdings()[0], household_member_id: "m2", household_member_name: "Aarohi", current_value: "999000.00", unrealized_gain: "99000.00", current_profit_total: "99000.00" };
    mocks.getHoldingsBundle.mockResolvedValue(bundle([fx.holdings()[0], second]));
    mount();
    await screen.findByTestId("row-S-KOTAK:m2");
    fireEvent.click(within(screen.getByTestId("row-S-KOTAK:m2")).getByTestId("invested"));
    expect(screen.getByRole("dialog")).toHaveTextContent("₹9,99,000");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("₹15,40,000");
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.click(within(screen.getByTestId("row-S-KOTAK:m1")).getByTestId("invested"));
    expect(screen.getByRole("dialog")).toHaveTextContent("₹15,40,000");
  });
  it("opens the popup with Enter on a row, closes it with Escape, and a fund without a price shows no price chart", async () => {
    mount();
    await page();
    fireEvent.keyDown(screen.getByTestId("row-S-AXIS:m1"), { key: "Enter" });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Axis Midcap Fund");
    expect(dialog).toHaveTextContent("NAV unavailable");
    expect(legacy.getFundNavHistory).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("lists the fully sold funds, collapsed, right under the holdings table", async () => {
    mount();
    await page();
    const toggle = screen.getByRole("button", { name: /Sold funds \(1\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Old Fund/)).not.toBeInTheDocument();
    const order = [screen.getByRole("heading", { name: "Mutual Funds (5)" }), toggle, screen.getByRole("heading", { name: "AMC Allocation" })];
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Old Fund · Siddharth/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Sold funds" })).getByText("₹2,10,000")).toBeInTheDocument();
  });
  it("narrows the sold funds to the selected member in a member view", async () => {
    const other = { ...fx.aggregateHoldings().realized_summary!.funds[0], scheme_id: "S-OLD2", scheme_name: "Other Old Fund", household_member_id: "m2", household_member_name: "Aarohi" };
    mocks.getHoldingsBundle.mockResolvedValue(memberBundle([...fx.aggregateHoldings().realized_summary!.funds, other]));
    memberMount();
    await screen.findByTestId("row-S-KOTAK:m1");
    fireEvent.click(screen.getByRole("button", { name: /Sold funds \(1\)/ }));
    expect(screen.getByText(/Old Fund · Siddharth/)).toBeInTheDocument();
    expect(screen.queryByText(/Other Old Fund/)).not.toBeInTheDocument();
  });
  it("shows no sold-funds section when nothing is fully sold", async () => {
    mocks.getHoldingsBundle.mockResolvedValue({ ...bundle(), realized: { total: "5.00", funds: [{ ...fx.aggregateHoldings().realized_summary!.funds[0], fully_sold: false }] } });
    mount();
    await page();
    expect(screen.queryByRole("button", { name: /Sold funds/ })).not.toBeInTheDocument();
  });
  it("shows no coverage-gap banner in the family view and does not ask for gaps", async () => {
    mount();
    await page();
    expect(screen.queryByText(/Coverage Gap Detected/)).not.toBeInTheDocument();
    expect(mocks.getCoverageGaps).not.toHaveBeenCalled();
  });
  it("shows the coverage-gap banner above the summary strip in a member view", async () => {
    mocks.getHoldingsBundle.mockResolvedValue(memberBundle());
    mocks.getCoverageGaps.mockResolvedValue(gaps());
    memberMount();
    const banner = await screen.findByText(/Coverage Gap Detected \(1 folio missing earlier purchases\)/);
    await screen.findByTestId("value-total");
    expect(banner.compareDocumentPosition(screen.getByRole("group", { name: "Total Portfolio Value" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mocks.getCoverageGaps.mock.calls[0][0]).toBe("m1");
  });
  it("saves an opening balance, then reloads holdings, allocation, gaps, history and the analytics", async () => {
    mocks.getHoldingsBundle.mockResolvedValue(memberBundle());
    mocks.getCoverageGaps.mockResolvedValueOnce(gaps()).mockResolvedValue([]);
    memberMount();
    await screen.findByTestId("row-S-KOTAK:m1");
    fireEvent.click(await screen.findByRole("button", { name: /Resolve Gap/ }));
    expect((document.getElementById("opening-units") as HTMLInputElement).value).toBe("10.000");
    fireEvent.click(screen.getByRole("button", { name: "Save Opening Balance" }));
    await waitFor(() => expect(screen.queryByText(/Coverage Gap Detected/)).not.toBeInTheDocument());
    expect(legacy.postOpeningBalance).toHaveBeenCalledWith("f1", { units: "10.000", date: "2024-01-05", amount: undefined, nav: undefined });
    await screen.findByTestId("row-S-KOTAK:m1");
    expect(mocks.getHoldingsBundle).toHaveBeenCalledTimes(2);
    expect(mocks.getAllocation).toHaveBeenCalledTimes(2);
    expect(mocks.getCoverageGaps).toHaveBeenCalledTimes(2);
    expect(mocks.getHistoryPoints).toHaveBeenCalledTimes(2);
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledTimes(1);
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("m1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("leaves the page as it was when saving the opening balance fails", async () => {
    mocks.getHoldingsBundle.mockResolvedValue(memberBundle());
    mocks.getCoverageGaps.mockResolvedValue(gaps());
    legacy.postOpeningBalance.mockRejectedValue(new Error("Opening balance rejected"));
    memberMount();
    await screen.findByTestId("row-S-KOTAK:m1");
    fireEvent.click(await screen.findByRole("button", { name: /Resolve Gap/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Opening Balance" }));
    expect(await screen.findByText("Opening balance rejected")).toBeInTheDocument();
    expect(mocks.getHoldingsBundle).toHaveBeenCalledTimes(1);
    expect(mocks.retryAnalyticsScope).not.toHaveBeenCalled();
  });
  it("shows the post-import notice for this user above the page and dismisses it without leaving", async () => {
    mount({ state: { importNotice: { text: "Ramesh: 9 transactions added", details: ["2 duplicates skipped"] }, importNoticeUser: "u-1" } });
    await page();
    const notice = screen.getByText("Ramesh: 9 transactions added");
    expect(screen.getByText("2 duplicates skipped")).toBeInTheDocument();
    expect(notice.compareDocumentPosition(screen.getByRole("group", { name: "Total Portfolio Value" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss import notice" }));
    expect(screen.queryByText("Ramesh: 9 transactions added")).not.toBeInTheDocument();
    expect(screen.getByTestId("loc")).toHaveTextContent(/^\/portfolio\/mutual-funds$/);
    expect(screen.getByTestId("row-S-KOTAK:m1")).toBeInTheDocument();
  });
  it("shows no notice that was written for another user", async () => {
    mount({ state: { importNotice: { text: "Ramesh: 9 transactions added" }, importNoticeUser: "u-2" } });
    await page();
    expect(screen.queryByText("Ramesh: 9 transactions added")).not.toBeInTheDocument();
  });
  it("keeps the post-import notice on the empty state and on the page error", async () => {
    mocks.getHoldingsBundle.mockResolvedValue(bundle([]));
    const first = mount({ state: { importNotice: { text: "Ramesh: 9 transactions added" }, importNoticeUser: "u-1" } });
    await screen.findByRole("heading", { name: "No mutual funds yet" });
    expect(screen.getByText("Ramesh: 9 transactions added")).toBeInTheDocument();
    first.unmount();
    mocks.getHoldingsBundle.mockRejectedValue(new Error("x"));
    mocks.getAllocation.mockRejectedValue(new Error("y"));
    mount({ state: { importNotice: { text: "Ramesh: 9 transactions added" }, importNoticeUser: "u-1" } });
    await screen.findByRole("heading", { name: "Couldn't load your mutual funds" });
    expect(screen.getByText("Ramesh: 9 transactions added")).toBeInTheDocument();
  });
  it("puts the parts in order: notice, gap banner, summary, SIPs, table, sold funds, cards", async () => {
    mocks.getHoldingsBundle.mockResolvedValue(memberBundle());
    mocks.getCoverageGaps.mockResolvedValue(gaps());
    memberMount({ state: { importNotice: { text: "Ramesh: 9 transactions added" }, importNoticeUser: "u-1" } });
    await screen.findByTestId("row-S-KOTAK:m1");
    const order = [
      screen.getByText("Ramesh: 9 transactions added"), await screen.findByText(/Coverage Gap Detected/), screen.getByRole("group", { name: "Total Portfolio Value" }),
      screen.getByRole("heading", { name: "SIPs" }), screen.getByRole("heading", { name: "Mutual Funds (2)" }), screen.getByRole("button", { name: /Sold funds/ }),
      screen.getByRole("heading", { name: "AMC Allocation" }),
    ];
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `part ${i}`).toBeTruthy();
  });
  it("marks the legacy parts so the interactivity rule skips them, and they add no gap of their own", async () => {
    mocks.getHoldingsBundle.mockResolvedValue(memberBundle());
    mocks.getCoverageGaps.mockResolvedValue(gaps());
    const { container } = memberMount({ state: { importNotice: { text: "Ramesh: 9 transactions added" }, importNoticeUser: "u-1" } });
    await screen.findByTestId("row-S-KOTAK:m1");
    await screen.findByText(/Coverage Gap Detected/);
    const marked = [...container.querySelectorAll("[data-legacy]")];
    expect(marked.length).toBeGreaterThanOrEqual(3);
    for (const el of marked) expect(el.className).toContain("contents");
    expectInteractivity(container, 15);
  });
});

describe("Holdings rows and the Fund Details popup open the fund page (IF-E)", () => {
  it("keeps the table free of links: a row and its name still open the popup (register C159)", async () => {
    mount();
    await page();
    for (const row of screen.getAllByTestId(/^row-/)) expect(within(row).queryByRole("link")).toBeNull();
    fireEvent.click(within(screen.getByTestId("row-S-KOTAK:m1")).getByRole("button", { name: "Kotak Multi Cap Fund" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Fund Details");
    expect(screen.getByTestId("loc")).toHaveTextContent(/^\/portfolio\/mutual-funds$/);
  });
  it("adds an Open fund page link to the popup, and following it goes to that fund's page", async () => {
    mount();
    await page();
    fireEvent.click(within(screen.getByTestId("row-S-KOTAK:m1")).getByRole("button", { name: "Kotak Multi Cap Fund" }));
    const link = within(screen.getByRole("dialog")).getByRole("link", { name: "Open fund page" });
    expect(link).toHaveAttribute("href", "/portfolio/mutual-funds/funds/S-KOTAK");
    fireEvent.click(link);
    expect(screen.getByTestId("loc")).toHaveTextContent(/^\/portfolio\/mutual-funds\/funds\/S-KOTAK$/);
  });
  it("points the link at the fund of the row that was opened, and at nothing else", async () => {
    mount();
    await page();
    const second = fx.holdings()[1];
    fireEvent.click(within(screen.getByTestId(`row-${second.scheme_id}:${second.household_member_id}`)).getByRole("button", { name: second.scheme_name }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(second.scheme_name);
    expect(within(dialog).getAllByRole("link")).toHaveLength(1);
    expect(within(dialog).getByRole("link", { name: "Open fund page" })).toHaveAttribute("href", `/portfolio/mutual-funds/funds/${encodeURIComponent(second.scheme_id)}`);
  });
  it("has a keyboard-reachable link, and the popup still closes", async () => {
    mount();
    await page();
    fireEvent.click(within(screen.getByTestId("row-S-KOTAK:m1")).getByRole("button", { name: "Kotak Multi Cap Fund" }));
    const link = within(screen.getByRole("dialog")).getByRole("link", { name: "Open fund page" });
    link.focus();
    expect(link).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
