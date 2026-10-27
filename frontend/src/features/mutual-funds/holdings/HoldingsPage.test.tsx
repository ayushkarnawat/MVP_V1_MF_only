import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
import HoldingsPage from "./HoldingsPage";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];
const mount = (opts: Parameters<typeof renderInShell>[1] = {}) =>
  renderInShell(<HoldingsPage />, { path: "/portfolio/mutual-funds/holdings", scope: { members }, ...opts });
const ready = () => screen.findByRole("table", { name: "All stock holdings" });

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  mocks.getAnalyticsScope.mockResolvedValue(fb.analyticsMfB());
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});

describe("the page", () => {
  it("has the Holdings header, the tab strip with this tab current, and the two cards in order", async () => {
    mount();
    await ready();
    expect(screen.getByRole("heading", { level: 1, name: "Holdings" })).toBeInTheDocument();
    expect(screen.getByText("The stocks behind your funds — by fund, and looked through across your whole portfolio.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" }).querySelector("[data-tab=holdings] [aria-current=page]")).not.toBeNull();
    const cards = [...screen.getByTestId("holdings-cards").querySelectorAll("[data-testid^=card-]")].map(card => card.getAttribute("data-testid"));
    expect(cards).toEqual(["card-top-holdings", "card-all-stocks"]);
    expect(screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent)).toEqual(["Top Holdings by Fund", "All Holdings Across Your Portfolio"]);
  });
  it("carries the all-holdings anchor on the portfolio-wide card for the Overlap page's links", async () => {
    mount();
    await ready();
    expect(screen.getByTestId("card-all-stocks")).toHaveAttribute("id", "all-holdings");
  });
  it("asks for the analytics once and for nothing else: every chip and sort is client side", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("chip-S-JM"));
    fireEvent.click(screen.getByRole("button", { name: "By name" }));
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
    expect(mocks.getHoldingsBundle).not.toHaveBeenCalled();
    expect(mocks.getAllocation).not.toHaveBeenCalled();
  });
  it("shares one payload between the two cards: the portfolio table lists every stock the fund table draws from", async () => {
    mount();
    await ready();
    const listed = within(screen.getByRole("list", { name: "Top holdings" })).getAllByRole("listitem").map(item => item.querySelector("span[title]")?.getAttribute("title"));
    const table = screen.getAllByTestId(/^stock-row-/).map(row => within(row).getAllByRole("button")[0].textContent);
    for (const name of listed) expect(table).toContain(name);
  });
  it("asks for the selected member and reads the bare member payload", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(fb.analyticsMfBMember());
    mount({ scope: { members, viewMode: "member", memberId: "m1" } });
    await ready();
    expect(mocks.getAnalyticsScope.mock.calls[0][0]).toBe("m1");
    expect(screen.getAllByTestId(/^stock-row-/)).toHaveLength(24);
  });
  it("shows a page error with Retry when the section cannot be fetched, and recovers", async () => {
    mocks.getAnalyticsScope.mockRejectedValue(new Error("x"));
    mount();
    expect(await screen.findByRole("heading", { name: "Couldn't load your holdings data" })).toBeInTheDocument();
    expect(screen.getByText("There was a problem reaching our servers. Your data is safe — this is just a connection issue.")).toBeInTheDocument();
    mocks.getAnalyticsScope.mockResolvedValue(fb.analyticsMfB());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await ready();
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("combined");
  });
  it("lets the stored section fail on its own: both cards keep their headings and each offers Retry", async () => {
    const response = fb.analyticsMfB();
    response.sections.stock_holdings = { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    expect(await screen.findAllByRole("button", { name: "Retry" })).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Top Holdings by Fund" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All Holdings Across Your Portfolio" })).toBeInTheDocument();
  });
  it("marks every control on the page with its effect (interactivity rule)", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(screen.getByTestId("chip-S-HDFC"));
    fireEvent.click(within(screen.getByTestId("stock-row-INE040A01034")).getByRole("button"));
    expectInteractivity(container, 25);
  });
});
