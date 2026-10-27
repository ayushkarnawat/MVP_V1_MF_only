import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fb from "../fixtures/mfB";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";

const mocks = vi.hoisted(() => ({
  getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn(), getHoldingsBundle: vi.fn(), getAllocation: vi.fn(), getSips: vi.fn(),
  getSipsMonthly: vi.fn(), getCoverageGaps: vi.fn(), getHistoryPoints: vi.fn(), getMonthDetail: vi.fn(),
}));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);

import { analyticsStore } from "../data/analyticsStore";
import TransactionsPage from "./TransactionsPage";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];
const mount = (opts: Parameters<typeof renderInShell>[1] = {}) =>
  renderInShell(<TransactionsPage />, { path: "/portfolio/mutual-funds/transactions", scope: { members }, ...opts });
const ready = () => screen.findByTestId("tile-invested-value");
const rows = () => screen.getAllByTestId(/^ledger-row-/).map(row => row.getAttribute("data-testid")?.replace("ledger-row-", ""));
const scrollIntoView = vi.fn();

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
  analyticsStore.invalidate();
  mocks.getAnalyticsScope.mockResolvedValue(fb.analyticsMfB());
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});
afterEach(() => {
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

describe("the page", () => {
  it("has the Transactions header, the tab strip with this tab current, and the two cards in order", async () => {
    mount();
    await ready();
    expect(screen.getByRole("heading", { level: 1, name: "Transactions" })).toBeInTheDocument();
    expect(screen.getByText("Every rupee in and out of your mutual funds, by period and by fund.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" }).querySelector("[data-tab=transactions] [aria-current=page]")).not.toBeNull();
    const cards = [...screen.getByTestId("transactions-cards").querySelectorAll("[data-testid^=card-]")].map(card => card.getAttribute("data-testid"));
    expect(cards).toEqual(["card-cash-flow", "card-ledger"]);
    expect(screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent)).toEqual(["Cash Flow Over Time", "All Transactions"]);
  });
  it("asks for the analytics once and for nothing else, whatever is clicked", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("period-2026-03"));
    fireEvent.click(screen.getByRole("button", { name: "Yearly" }));
    fireEvent.click(screen.getByTestId("tile-withdrawn"));
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
    expect(mocks.getHoldingsBundle).not.toHaveBeenCalled();
    expect(mocks.getAllocation).not.toHaveBeenCalled();
  });
  it("asks for the selected member and reads the bare member payload", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(fb.analyticsMfBMember());
    mount({ scope: { members, viewMode: "member", memberId: "m1" } });
    await ready();
    expect(mocks.getAnalyticsScope.mock.calls[0][0]).toBe("m1");
    expect(screen.getByTestId("tile-invested-value")).toHaveTextContent("₹9,41,895");
  });
  it("shows a page error with Retry when the section cannot be fetched, and recovers", async () => {
    mocks.getAnalyticsScope.mockRejectedValue(new Error("x"));
    mount();
    expect(await screen.findByRole("heading", { name: "Couldn't load your transactions" })).toBeInTheDocument();
    expect(screen.getByText("There was a problem reaching our servers. Your data is safe — this is just a connection issue.")).toBeInTheDocument();
    mocks.getAnalyticsScope.mockResolvedValue(fb.analyticsMfB());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await ready();
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("combined");
  });
  it("lets the stored section fail on its own: both cards keep their headings and each offers Retry", async () => {
    const response = fb.analyticsMfB();
    response.sections.investment_withdrawal = { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    expect(await screen.findAllByRole("button", { name: "Retry" })).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Cash Flow Over Time" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All Transactions" })).toBeInTheDocument();
  });
  it("shows an empty message in both cards for a household with no transactions", async () => {
    const data = fb.investmentWithdrawal();
    data.monthly = [];
    data.yearly = [];
    const response = fb.analyticsMfB();
    response.sections.investment_withdrawal = { payload: { members: [], data }, computed_at: "x", failed_at: null };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    await ready();
    expect(screen.getByText("No transactions yet", { selector: "p:not([data-testid])" })).toBeInTheDocument();
    expect(screen.getByTestId("ledger-empty")).toHaveTextContent("No transactions yet");
    expect(screen.queryByTestId("cash-bars")).not.toBeInTheDocument();
  });
});

describe("notes and the SIP banner", () => {
  it("shows the opening-holdings note and the gifts note with their amounts", async () => {
    mount();
    await ready();
    expect(screen.getByTestId("opening-note")).toHaveTextContent(
      "Opening holdings ₹2,40,000 (counted in Total invested above, not drawn as a bar — these units were already held before Unifolio started tracking).",
    );
    expect(screen.getByTestId("gifts-note")).toHaveTextContent("Gain excludes ₹18,500 of units received as gifts.");
  });
  it("words the gifts note the other way when units were given away", async () => {
    const data = fb.investmentWithdrawal();
    data.gifts_net = "-4200.00";
    const response = fb.analyticsMfB();
    response.sections.investment_withdrawal = { payload: { members: [], data }, computed_at: "x", failed_at: null };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    await ready();
    expect(screen.getByTestId("gifts-note")).toHaveTextContent("Gain includes ₹4,200 of units given away as gifts.");
  });
  it("leaves both notes out when there is nothing to say", async () => {
    const data = fb.investmentWithdrawal();
    data.gifts_net = "0.00";
    data.opening_holdings = "0.00";
    const response = fb.analyticsMfB();
    response.sections.investment_withdrawal = { payload: { members: [], data }, computed_at: "x", failed_at: null };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    await ready();
    expect(screen.queryByTestId("opening-note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gifts-note")).not.toBeInTheDocument();
  });
  it("shows the SIP banner with the count, the monthly amount and the missed instalment", async () => {
    mount();
    await ready();
    expect(screen.getByTestId("sip-count")).toHaveTextContent("5 active SIPs");
    expect(screen.getByTestId("sip-monthly")).toHaveTextContent("₹50,575/month");
    expect(screen.getByTestId("sip-missed")).toHaveTextContent("1 missed instalment");
  });
});

describe("the tiles and the ledger share one filter", () => {
  it("applies the type of a clicked tile to the ledger, marks the tile, and scrolls the ledger into view", async () => {
    mount();
    await ready();
    expect(rows()).toHaveLength(50);
    fireEvent.click(screen.getByTestId("tile-withdrawn"));
    expect(rows()).toEqual(["t-0029", "t-0028"]);
    expect(screen.getByTestId("tile-withdrawn")).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("group", { name: "Transaction type" })).getByRole("button", { name: "Redemptions" })).toHaveAttribute("aria-pressed", "true");
    expect(scrollIntoView).toHaveBeenCalled();
  });
  it("shows the tile highlighted when the ledger's own pill is used, and clears it for All", async () => {
    mount();
    await ready();
    fireEvent.click(within(screen.getByRole("group", { name: "Transaction type" })).getByRole("button", { name: "Switches" }));
    expect(screen.getByTestId("tile-switched")).toHaveAttribute("aria-pressed", "true");
    expect(rows()).toEqual(["t-0046", "t-0045"]);
    fireEvent.click(within(screen.getByRole("group", { name: "Transaction type" })).getByRole("button", { name: "All" }));
    expect(["tile-invested", "tile-withdrawn", "tile-switched"].map(id => screen.getByTestId(id).getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
  });
  it("leaves the filter alone when the net invested tile is clicked", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("tile-withdrawn"));
    fireEvent.click(screen.getByTestId("tile-net"));
    expect(rows()).toEqual(["t-0029", "t-0028"]);
  });
});

describe("the period drill", () => {
  it("opens a titled breakdown under the chart for a clicked period, keeps the column selected and scrolls to it", async () => {
    mount();
    await ready();
    expect(screen.queryByTestId("period-drill")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("period-2026-03"));
    expect(screen.getByRole("region", { name: "March 2026 breakdown" })).toBeInTheDocument();
    expect(screen.getByTestId("period-2026-03")).toHaveAttribute("aria-pressed", "true");
    expect(scrollIntoView).toHaveBeenCalled();
    fireEvent.mouseLeave(screen.getByTestId("period-2026-03"));
    expect(screen.getByTestId("period-2026-03")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("period-2026-06"));
    expect(screen.queryByRole("region", { name: "March 2026 breakdown" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "June 2026 breakdown" })).toBeInTheDocument();
    expect(screen.getByTestId("period-2026-03")).toHaveAttribute("aria-pressed", "false");
  });
  it("closes the drill when the granularity changes, because that period no longer exists", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("period-2026-03"));
    fireEvent.click(screen.getByRole("button", { name: "Yearly" }));
    expect(screen.queryByTestId("period-drill")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^period-20\d\d$/)).toHaveLength(2);
    fireEvent.click(screen.getByTestId("period-2026"));
    expect(screen.getByRole("region", { name: "2026 breakdown" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.queryByTestId("period-drill")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("period-2026-03"));
    fireEvent.click(screen.getByRole("button", { name: "Yearly" }));
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.queryByTestId("period-drill")).not.toBeInTheDocument();
    expect(screen.getByTestId("period-2026-03")).toHaveAttribute("aria-pressed", "false");
  });
  it("agrees with the ledger: the invested total of a month's drill is the sum of that month's purchase rows", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("period-2026-03"));
    expect(screen.getByTestId("drill-total-invested")).toHaveTextContent("Invested ₹50,575");
    expect(screen.getByTestId("drill-total-withdrawn")).toHaveTextContent("Withdrawn ₹23,500");
  });
});

describe("the ledger on the page", () => {
  it("expands a row in place", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("tile-withdrawn"));
    fireEvent.click(within(screen.getByTestId("ledger-row-t-0028")).getByRole("button"));
    expect(screen.getByTestId("ledger-detail-t-0028")).toHaveTextContent("t-0028");
    expect(screen.getByTestId("ledger-row-t-0028").nextElementSibling).toBe(screen.getByTestId("ledger-detail-t-0028"));
  });
  it("marks every control on the page with its effect (interactivity rule)", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(screen.getByTestId("period-2026-03"));
    fireEvent.click(screen.getByTestId("tile-invested"));
    expectInteractivity(container, 30);
  });
});
