import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fc from "../fixtures/mfC";
import * as fo from "../fixtures/mfCother";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { AnalyticsScopeResponse } from "../types";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);

import { analyticsStore } from "../data/analyticsStore";
import { CostValuationGroup } from "./CostValuationGroup";

const members = [{ id: "m1", name: "Siddharth" }, { id: "m2", name: "Aarohi" }];
const FAILED = { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" };
const UNSETTLED = { payload: null, computed_at: null, failed_at: null };
const mount = (response: AnalyticsScopeResponse = fc.analyticsMfC(), scope: Parameters<typeof renderInShell>[1] = {}) => {
  mocks.getAnalyticsScope.mockResolvedValue(response);
  return renderInShell(<CostValuationGroup />, { path: "/portfolio/mutual-funds/analytics", scope: { members }, ...scope });
};
const ready = () => screen.findByTestId("ter-body");

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});

describe("the two cards", () => {
  it("shows the TER card and the valuation card, in that order, each with its own heading and info mark", async () => {
    mount();
    await ready();
    await screen.findByTestId("valuation-body");
    expect(screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent)).toEqual(["Total Expense Ratio (TER) & Cost Analysis", "Portfolio Valuation vs. Benchmarks"]);
    expect(screen.getByRole("img", { name: "AUM-weighted annual management fee across your portfolio, split by Direct vs. Regular plans, with a per-fund cost breakdown." })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Your portfolio's look-through P\/E and P\/B compared to Nifty 50 and Nifty 500/ })).toBeInTheDocument();
    expect(screen.getByTestId("card-ter")).toContainElement(screen.getByTestId("ter-weighted"));
    expect(screen.getByTestId("card-valuation")).toContainElement(screen.getByTestId("panel-pe"));
  });
  it("draws both cards from the one analytics request", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("ladder-toggle-S-KOTAK"));
    fireEvent.click(screen.getByRole("radio", { name: "Bar Chart" }));
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
    expect(mocks.getAnalyticsScope.mock.calls[0][0]).toBe("combined");
  });
  it("fills a ladder row's returns from the category-ranking section of the same payload", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByTestId("ladder-toggle-S-HDFC"));
    expect(["1y", "3y", "5y"].map(key => screen.getByTestId(`ladder-return-S-HDFC-${key}`).textContent)).toEqual(["19.0%", "14.4%", "17.9%"]);
  });
  it("shows the Direct and Regular spectrum from the ter_direct_regular section", async () => {
    mount();
    await ready();
    expect(screen.getByTestId("pin-direct")).toHaveTextContent("Direct 0.64%");
  });
  it("shows the savings line when the TER section carries annual_ter_saving, and not otherwise", async () => {
    const withSavings = fc.analyticsMfC();
    withSavings.sections.ter = { payload: { members: [], ter: fo.terSummaryWithSavings() }, computed_at: "2026-10-26T01:00:00Z", failed_at: null };
    const { unmount } = mount(withSavings);
    expect(await screen.findByTestId("ter-savings")).toHaveTextContent("₹29,595/yr");
    unmount();
    analyticsStore.invalidate();
    mount();
    await ready();
    expect(screen.queryByTestId("ter-savings")).not.toBeInTheDocument();
  });
});

describe("each card fails, loads and retries on its own", () => {
  it("keeps the TER card whole when the valuation section fails, and offers one Retry that asks for a recompute", async () => {
    const response = fc.analyticsMfC();
    response.sections.valuation = FAILED;
    mount(response);
    await ready();
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
    expect(within(screen.getByTestId("card-valuation")).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Portfolio Valuation vs. Benchmarks" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("combined");
  });
  it("keeps the valuation card whole when the TER section fails", async () => {
    const response = fc.analyticsMfC();
    response.sections.ter = FAILED;
    mount(response);
    await screen.findByTestId("valuation-body");
    expect(within(screen.getByTestId("card-ter")).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByTestId("ter-body")).not.toBeInTheDocument();
  });
  it("shows a loading status for a section that has not settled, and the other card as soon as it has", async () => {
    const response = fc.analyticsMfC();
    response.sections.valuation = UNSETTLED;
    mount(response);
    await ready();
    expect(screen.getByRole("status", { name: "Loading Portfolio Valuation vs. Benchmarks" })).toBeInTheDocument();
    expect(screen.queryByTestId("valuation-body")).not.toBeInTheDocument();
  });
  it("still draws the TER card, saying the Direct and Regular comparison is unavailable, when only that section fails", async () => {
    const response = fc.analyticsMfC();
    response.sections.ter_direct_regular = FAILED;
    mount(response);
    await ready();
    expect(screen.getByTestId("ter-comparison-missing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
  it("still draws the ladder, with 'No return data on file' in each row, when only the category ranking fails", async () => {
    const response = fc.analyticsMfC();
    response.sections.category_ranking = FAILED;
    mount(response);
    await ready();
    fireEvent.click(screen.getByTestId("ladder-toggle-S-KOTAK"));
    expect(screen.getByTestId("ladder-detail-S-KOTAK")).toHaveTextContent("No return data on file for this fund.");
  });
});

describe("member scope", () => {
  it("asks for the selected member and reads the bare member payloads", async () => {
    mount(fc.analyticsMfCMember(), { scope: { members, viewMode: "member", memberId: "m1" } });
    expect(await ready()).toBeInTheDocument();
    expect(mocks.getAnalyticsScope.mock.calls[0][0]).toBe("m1");
    expect(screen.getByTestId("ter-weighted")).toHaveTextContent("0.64%");
    expect(screen.getByTestId("pin-direct")).toBeInTheDocument();
    expect(await screen.findByTestId("delta-pe")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ladder-toggle-S-KOTAK"));
    expect(screen.getByTestId("ladder-return-S-KOTAK-3y")).toHaveTextContent("15.1%");
  });
});

describe("every control", () => {
  it("is marked with its effect and exposes its state", async () => {
    const { container } = mount();
    await ready();
    fireEvent.click(screen.getByTestId("ladder-toggle-S-KOTAK"));
    expectInteractivity(container, 6);
  });
});
