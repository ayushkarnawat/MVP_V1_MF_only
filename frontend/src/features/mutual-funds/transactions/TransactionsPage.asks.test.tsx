import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fa from "../fixtures/mfAsks";
import { renderInShell } from "../../../shell/testing";

const mocks = vi.hoisted(() => ({
  getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn(), getHoldingsBundle: vi.fn(), getAllocation: vi.fn(), getSips: vi.fn(),
  getSipsMonthly: vi.fn(), getCoverageGaps: vi.fn(), getHistoryPoints: vi.fn(), getMonthDetail: vi.fn(),
}));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);

import { analyticsStore } from "../data/analyticsStore";
import TransactionsPage from "./TransactionsPage";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];
const mount = () => renderInShell(<TransactionsPage />, { path: "/portfolio/mutual-funds/transactions", scope: { members } });

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  mocks.getAnalyticsScope.mockResolvedValue(fa.analyticsAsksB());
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});

describe("the page with the additive ledger fields", () => {
  it("names the fund and the date in the missed-instalment tooltip", async () => {
    mount();
    const badge = await screen.findByTestId("sip-missed");
    expect(badge).toHaveAttribute("title", "HDFC Mid-Cap Opportunities Fund — SIP due 05 Oct 2026 was not debited");
  });
  it("shows units, NAV and folio when a ledger row is opened, from the one analytics request", async () => {
    mount();
    await screen.findByTestId("tile-invested-value");
    fireEvent.click(within(screen.getByTestId("ledger-row-t-0067")).getByRole("button"));
    const detail = screen.getByTestId("ledger-detail-t-0067");
    expect(detail).toHaveTextContent("200.000");
    expect(detail).toHaveTextContent("₹81.22");
    expect(detail).toHaveTextContent("XXXX7890");
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
});
