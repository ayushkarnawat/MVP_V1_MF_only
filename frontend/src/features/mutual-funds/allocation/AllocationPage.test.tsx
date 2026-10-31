import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../fixtures";
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
import AllocationPage from "./AllocationPage";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];
const mount = (opts: Parameters<typeof renderInShell>[1] = {}) =>
  renderInShell(<AllocationPage />, { path: "/portfolio/mutual-funds/allocation", scope: { members }, ...opts });
const ready = async () => { await screen.findByRole("list", { name: "Look-through asset breakdown" }); await screen.findByTestId("manager-row-harsha-upadhyaya-kotak-mahindra-mf"); };

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  Element.prototype.scrollIntoView = vi.fn();
  const holdings = fx.aggregateHoldings();
  mocks.getHoldingsBundle.mockResolvedValue({ holdings: holdings.holdings, members: holdings.members, xirr: { lifetime: "0.1612", current: "0.1480", disclaimers: { lifetime: null, current: null } }, realized: null });
  mocks.getAnalyticsScope.mockResolvedValue(fb.analyticsMfB());
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});
afterEach(() => {
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

describe("the page", () => {
  it("has the Allocation header, the tab strip with this tab current, and the four cards in order", async () => {
    mount();
    await ready();
    expect(screen.getByRole("heading", { level: 1, name: "Allocation" })).toBeInTheDocument();
    expect(screen.getByText("How your money is spread — by asset class, market cap, category, fund house, and manager.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mutual Funds sections" }).querySelector("[data-tab=allocation] [aria-current=page]")).not.toBeNull();
    const cards = [...screen.getByTestId("allocation-cards").querySelectorAll("[data-testid^=card-]")].map(card => card.getAttribute("data-testid"));
    expect(cards).toEqual(["card-asset-class", "card-market-cap", "card-category-amc", "card-fund-manager"]);
    expect(screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent)).toEqual([
      "Look-Through Asset Allocation", "Market-Cap Allocation", "Portfolio Allocation", "Fund Manager Allocation",
    ]);
    expect(screen.getByTestId("card-asset-class")).toHaveAttribute("id", "asset-allocation");
    expect(screen.getByTestId("card-market-cap")).toHaveAttribute("id", "market-cap");
  });
  it("asks for the analytics once and the holdings once, and nothing else", async () => {
    mount();
    await ready();
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
    expect(mocks.getHoldingsBundle).toHaveBeenCalledTimes(1);
    expect(mocks.getAllocation).not.toHaveBeenCalled();
    expect(mocks.getSips).not.toHaveBeenCalled();
    expect(mocks.getHistoryPoints).not.toHaveBeenCalled();
  });
  it("asks for the selected member everywhere and reads the bare member payloads", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(fb.analyticsMfBMember());
    mount({ scope: { members, viewMode: "member", memberId: "m1" } });
    await ready();
    expect(mocks.getAnalyticsScope.mock.calls[0][0]).toBe("m1");
    expect(mocks.getHoldingsBundle.mock.calls[0][0]).toEqual({ viewMode: "member", memberId: "m1" });
    expect(within(screen.getByTestId("card-category-amc")).getByTestId("donut-centre-value")).toHaveTextContent("₹46.49 L");
  });
  it("shows a page error with Retry when every allocation section fails to load, and recovers", async () => {
    mocks.getAnalyticsScope.mockRejectedValue(new Error("x"));
    mount();
    expect(await screen.findByRole("heading", { name: "Couldn't load your allocation data" })).toBeInTheDocument();
    expect(screen.getByText("There was a problem reaching our servers. Your data is safe — this is just a connection issue.")).toBeInTheDocument();
    expect(screen.queryByTestId("allocation-cards")).not.toBeInTheDocument();
    mocks.getAnalyticsScope.mockResolvedValue(fb.analyticsMfB());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await ready();
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("combined");
  });
  it("lets one section fail with its own Retry while the others show", async () => {
    const response = fb.analyticsMfB();
    response.sections.cap_allocation = { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" };
    mocks.getAnalyticsScope.mockResolvedValue(response);
    mount();
    await ready();
    const card = within(screen.getByTestId("card-market-cap"));
    expect(card.getByText("This section failed to load, but the rest of the page is unaffected.")).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Category breakdown" })).toBeInTheDocument();
  });
  it("lets the category drill fail on its own when the holdings do not load", async () => {
    mocks.getHoldingsBundle.mockRejectedValue(new Error("x"));
    mount();
    await ready();
    fireEvent.click(within(screen.getByRole("list", { name: "Category breakdown" })).getByRole("button", { name: /Flexi Cap Fund/ }));
    expect(await screen.findByText("The funds in this slice couldn't be loaded.")).toBeInTheDocument();
    expect(within(screen.getByTestId("card-fund-manager")).getByRole("list", { name: "Fund manager cards" })).toBeInTheDocument();
  });
});

describe("across the cards", () => {
  it("shows a single-manager fund with the same rupee value in the category drill and in the manager detail", async () => {
    mount();
    await ready();
    fireEvent.click(within(screen.getByRole("list", { name: "Category breakdown" })).getByRole("button", { name: /Flexi Cap Fund/ }));
    const category = await screen.findByTestId("drill-fund-S-KOTAK");
    expect(category).toHaveTextContent("₹15,40,000");
    fireEvent.click(within(screen.getByTestId("manager-row-harsha-upadhyaya-kotak-mahindra-mf")).getByRole("button", { name: "Harsha Upadhyaya" }));
    expect(screen.getByTestId("manager-fund-harsha-upadhyaya-kotak-mahindra-mf-S-KOTAK")).toHaveTextContent("₹15,40,000");
    fireEvent.click(within(screen.getByTestId("manager-row-chirag-setalvad-hdfc-mf")).getByRole("button", { name: "Chirag Setalvad" }));
    expect(screen.getByTestId("manager-fund-chirag-setalvad-hdfc-mf-S-HDFC")).toHaveTextContent("₹13,10,000");
  });
  it("feeds each fund's XIRR from the benchmark section into the manager detail", async () => {
    mount();
    await ready();
    fireEvent.click(within(screen.getByTestId("manager-row-satish-ramanathan-jm-financial-mf")).getByRole("button", { name: "Satish Ramanathan" }));
    expect(screen.getByTestId("manager-fund-satish-ramanathan-jm-financial-mf-S-JM")).toHaveTextContent("XIRR 18.6%");
  });
  it("agrees on the portfolio total between the category card and the market-cap card", async () => {
    mount();
    await ready();
    expect(within(screen.getByTestId("card-category-amc")).getByTestId("donut-centre-value")).toHaveTextContent("₹46.49 L");
    expect(within(screen.getByTestId("card-market-cap")).getByTestId("donut-centre-value")).toHaveTextContent("₹46.49 L");
  });
  it("scrolls from the equity drill to the market-cap card", async () => {
    mount();
    await ready();
    fireEvent.click(within(screen.getByRole("list", { name: "Look-through asset breakdown" })).getByRole("button", { name: /Equity/ }));
    const scroll = vi.fn();
    screen.getByTestId("card-market-cap").scrollIntoView = scroll;
    fireEvent.click(screen.getByRole("button", { name: "See the stock-level split in Market-Cap Allocation" }));
    expect(scroll).toHaveBeenCalled();
  });
  it("lets each chart-type picker work on its own card", async () => {
    mount();
    await ready();
    const pickers = screen.getAllByRole("radiogroup", { name: "Chart type" });
    expect(pickers).toHaveLength(3);
    expect(within(screen.getByTestId("card-market-cap")).queryByRole("radiogroup", { name: "Chart type" })).not.toBeInTheDocument();
    fireEvent.click(within(pickers[0]).getByRole("radio", { name: "Bar Chart" }));
    expect(within(screen.getByTestId("card-category-amc")).getByRole("radio", { name: "Donut" })).toHaveAttribute("aria-checked", "true");
    expect(within(screen.getByTestId("card-fund-manager")).getByRole("radio", { name: "Cards" })).toHaveAttribute("aria-checked", "true");
  });
  it("marks every control on the page with its effect (interactivity rule)", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(within(screen.getByRole("list", { name: "Look-through asset breakdown" })).getByRole("button", { name: /Equity/ }));
    fireEvent.click(within(screen.getByRole("list", { name: "Market-cap breakdown" })).getByRole("button", { name: /Large Cap/ }));
    fireEvent.click(within(screen.getByRole("list", { name: "Category breakdown" })).getByRole("button", { name: /Flexi Cap Fund/ }));
    expectInteractivity(container, 40);
  });
});
