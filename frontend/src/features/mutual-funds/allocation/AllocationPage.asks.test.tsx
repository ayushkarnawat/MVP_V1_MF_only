import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../fixtures";
import * as fa from "../fixtures/mfAsks";
import { renderInShell } from "../../../shell/testing";

const mocks = vi.hoisted(() => ({
  getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn(), getHoldingsBundle: vi.fn(), getAllocation: vi.fn(), getSips: vi.fn(),
  getSipsMonthly: vi.fn(), getCoverageGaps: vi.fn(), getHistoryPoints: vi.fn(), getMonthDetail: vi.fn(),
}));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);

import { analyticsStore } from "../data/analyticsStore";
import AllocationPage from "./AllocationPage";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];
const mount = () => renderInShell(<AllocationPage />, { path: "/portfolio/mutual-funds/allocation", scope: { members } });

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  Element.prototype.scrollIntoView = vi.fn();
  const holdings = fx.aggregateHoldings();
  mocks.getHoldingsBundle.mockResolvedValue({ holdings: holdings.holdings, members: holdings.members, xirr: { lifetime: "0.1612", current: "0.1480", disclaimers: { lifetime: null, current: null } }, realized: null });
  mocks.getAnalyticsScope.mockResolvedValue(fa.analyticsAsksB());
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});
afterEach(() => {
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

describe("the Asset Class drill on the page", () => {
  it("lists the contributing funds of a class from the one analytics payload", async () => {
    mount();
    const legend = within(await screen.findByRole("list", { name: "Look-through asset breakdown" }));
    fireEvent.click(legend.getByRole("button", { name: /Debt/ }));
    const list = within(screen.getByRole("list", { name: "Contributing funds" }));
    expect(list.getAllByRole("listitem").map(item => item.getAttribute("data-testid"))).toEqual(["drill-fund-S-HDOV", "drill-fund-S-SBI", "drill-fund-S-KOTAK"]);
    expect(screen.getByTestId("drill-fund-value-S-HDOV")).toHaveTextContent("₹5,52,500 · 76.5% of Debt");
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
});
