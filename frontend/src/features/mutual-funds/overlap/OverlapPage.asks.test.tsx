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
import OverlapPage from "./OverlapPage";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }, { id: "m3", name: "Parents" }];
const mount = () => renderInShell(<OverlapPage />, { path: "/portfolio/mutual-funds/overlap", scope: { members } });
const EDGE = "S-HDFC~S-SBI";

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  mocks.getAnalyticsScope.mockResolvedValue(fa.analyticsAsksC());
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});

describe("the page with the additive overlap fields", () => {
  it("lists the pair at the low band in Top Pairs and shows the drivers in the Impact card, from one request", async () => {
    mount();
    await screen.findByTestId("stat-strip");
    const top = within(screen.getByTestId("card-top-pairs"));
    expect(top.getAllByTestId(/^pair-row-/).map(row => row.getAttribute("data-testid"))).toEqual([
      "pair-row-S-KOTAK~S-SBI", "pair-row-S-JM~S-SBI", "pair-row-S-JM~S-KOTAK", `pair-row-${EDGE}`,
    ]);
    const impact = within(screen.getByTestId("card-impact"));
    expect(impact.getByTestId("impact-drivers")).toBeInTheDocument();
    expect(impact.getByTestId("impact-pair-S-KOTAK~S-SBI")).toBeInTheDocument();
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
  it("selects the boundary pair from the table and keeps the default selection on the largest pair", async () => {
    mount();
    await screen.findByTestId("stat-strip");
    expect(screen.getByTestId("pair-row-S-KOTAK~S-SBI")).toHaveAttribute("data-selected", "true");
    fireEvent.click(screen.getByTestId(`pair-button-${EDGE}`));
    expect(screen.getByTestId(`pair-row-${EDGE}`)).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("pair-row-S-KOTAK~S-SBI")).toHaveAttribute("data-selected", "false");
  });
});
