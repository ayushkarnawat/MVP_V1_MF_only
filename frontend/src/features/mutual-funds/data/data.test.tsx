import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "../fixtures";
import { ScopeContext } from "../../../shell/scope/ScopeContext";
import type { ScopeValue } from "../../../shell/scope/scopeTypes";
import type { AnalyticsScopeResponse } from "../types";

const mocks = vi.hoisted(() => ({
  token: "t1" as string | null,
  getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn(), getHoldingsBundle: vi.fn(), getAllocation: vi.fn(),
  getSips: vi.fn(), getCoverageGaps: vi.fn(), getHistoryPoints: vi.fn(),
}));
vi.mock("../../auth/session", () => ({ getToken: () => mocks.token }));
vi.mock("../api", () => mocks);

import { analyticsStore, useMfAnalytics } from "./analyticsStore";
import { useMfDashboard } from "./useMfDashboard";

const settled = () => fx.analyticsCombined();
const unsettled = (): AnalyticsScopeResponse => ({ scope: "combined", recomputing: true, sections: { benchmark_funds: { payload: null, computed_at: null, failed_at: null } } });
const bundle = () => { const r = fx.aggregateHoldings(); return { holdings: r.holdings, members: r.members, xirr: { lifetime: r.lifetime_xirr!, current: r.current_holdings_xirr!, disclaimers: { lifetime: r.lifetime_xirr_disclaimer!, current: null } }, realized: r.realized_summary! }; };

beforeEach(() => { mocks.token = "t1"; Object.values(mocks).forEach(m => { if (typeof m === "function" && "mockReset" in m) m.mockReset(); }); analyticsStore.invalidate(); });
afterEach(() => { vi.useRealTimers(); });

describe("analyticsStore", () => {
  it("makes one request per scope however many callers ask at once", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(settled());
    await Promise.all([analyticsStore.refresh("combined"), analyticsStore.refresh("combined"), analyticsStore.refresh("combined")]);
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
    expect(mocks.getAnalyticsScope.mock.calls[0][0]).toBe("combined");
    const snap = analyticsStore.getSnapshot("combined");
    expect(snap.sections.benchmark_funds?.payload).not.toBeNull();
    expect(snap).toMatchObject({ recomputing: false, fetchError: null });
    expect(typeof snap.loadedAt).toBe("number");
  });
  it("gives a stable empty snapshot for a scope never fetched", () => {
    const a = analyticsStore.getSnapshot("never");
    expect(a).toEqual({ sections: {}, recomputing: false, fetchError: null, loadedAt: null });
    expect(analyticsStore.getSnapshot("never")).toBe(a);
  });
  it("polls every 3 seconds while a section is unsettled and stops once all are settled", async () => {
    vi.useFakeTimers();
    mocks.getAnalyticsScope.mockResolvedValueOnce(unsettled()).mockResolvedValue(settled());
    const unsubscribe = analyticsStore.subscribe("combined", () => {});
    await vi.advanceTimersByTimeAsync(10);
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2900);
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
  it("keeps polling while the backend reports recomputing even if every section holds a payload", async () => {
    vi.useFakeTimers();
    mocks.getAnalyticsScope.mockResolvedValueOnce({ ...settled(), recomputing: true }).mockResolvedValue(settled());
    const unsubscribe = analyticsStore.subscribe("combined", () => {});
    await vi.advanceTimersByTimeAsync(3100);
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
  it("does not poll with no subscriber, even when the answer arrives after the last one left", async () => {
    vi.useFakeTimers();
    let answer: (value: AnalyticsScopeResponse) => void = () => {};
    mocks.getAnalyticsScope.mockReturnValue(new Promise<AnalyticsScopeResponse>(resolve => { answer = resolve; }));
    const unsubscribe = analyticsStore.subscribe("combined", () => {});
    unsubscribe();
    answer(unsettled());
    await vi.advanceTimersByTimeAsync(20000);
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
  it("keeps the payload across an unsubscribe and a resubscribe without fetching again", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(settled());
    const off = analyticsStore.subscribe("combined", () => {});
    await waitFor(() => expect(analyticsStore.getSnapshot("combined").loadedAt).not.toBeNull());
    off();
    const again = analyticsStore.subscribe("combined", () => {});
    expect(analyticsStore.getSnapshot("combined").sections.investment_withdrawal).toBeDefined();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
    again();
  });
  it("invalidate(scope) forces a refetch on the next subscribe and invalidate() clears every scope", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(settled());
    await analyticsStore.refresh("combined"); await analyticsStore.refresh("m1");
    analyticsStore.invalidate("combined");
    expect(analyticsStore.getSnapshot("combined").loadedAt).toBeNull();
    expect(analyticsStore.getSnapshot("m1").loadedAt).not.toBeNull();
    const off = analyticsStore.subscribe("combined", () => {});
    await waitFor(() => expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(3));
    off();
    analyticsStore.invalidate();
    expect(analyticsStore.getSnapshot("m1").loadedAt).toBeNull();
  });
  it("never shows one session's payload to another (the cache is keyed by the token as well)", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(settled());
    await analyticsStore.refresh("combined");
    mocks.token = "t2";
    expect(analyticsStore.getSnapshot("combined").loadedAt).toBeNull();
    mocks.token = "t1";
    expect(analyticsStore.getSnapshot("combined").loadedAt).not.toBeNull();
  });
  it("records a fetch error and keeps the earlier payload", async () => {
    mocks.getAnalyticsScope.mockResolvedValueOnce(settled()).mockRejectedValueOnce(new Error("boom"));
    await analyticsStore.refresh("combined");
    await analyticsStore.refresh("combined");
    const snap = analyticsStore.getSnapshot("combined");
    expect(snap.fetchError).toBe("boom");
    expect(snap.sections.benchmark_funds?.payload).not.toBeNull();
  });
  it("notifies subscribers when a snapshot changes", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(settled());
    const cb = vi.fn();
    const off = analyticsStore.subscribe("combined", cb);
    await waitFor(() => expect(cb).toHaveBeenCalled());
    off();
  });
});

function scopeWrapper(holder: { value: Partial<ScopeValue> }) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const v = holder.value;
    const full: ScopeValue = { viewMode: "aggregate", memberId: null, members: [], scopeKey: v.viewMode === "member" ? `member:${v.memberId}` : "aggregate", setMember: () => {}, setAggregate: () => {}, refreshMembers: () => {}, ...v };
    return <ScopeContext.Provider value={full}>{children}</ScopeContext.Provider>;
  };
}

describe("useMfAnalytics", () => {
  it("unwraps the combined wrapper with each section's aggregate field", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(settled());
    const holder = { value: {} as Partial<ScopeValue> };
    const bench = renderHook(() => useMfAnalytics("benchmark_funds"), { wrapper: scopeWrapper(holder) });
    const money = renderHook(() => useMfAnalytics("investment_withdrawal"), { wrapper: scopeWrapper(holder) });
    expect(bench.result.current.status).toBe("loading");
    await waitFor(() => expect(bench.result.current.status).toBe("ready"));
    expect(bench.result.current.data?.funds).toHaveLength(4);
    await waitFor(() => expect(money.result.current.status).toBe("ready"));
    expect(money.result.current.data?.absolute_gain).toBe("1071340.00");
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
  it("returns a member payload as it is and asks for that member's scope", async () => {
    const bare = { funds: [], overall_portfolio_xirr: "0.1", overall_broad_market_xirr: null };
    mocks.getAnalyticsScope.mockResolvedValue({ scope: "m1", recomputing: false, sections: { benchmark_funds: { payload: bare, computed_at: "x", failed_at: null } } });
    const { result } = renderHook(() => useMfAnalytics("benchmark_funds"), { wrapper: scopeWrapper({ value: { viewMode: "member", memberId: "m1" } }) });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toEqual(bare);
    expect(mocks.getAnalyticsScope.mock.calls[0][0]).toBe("m1");
  });
  it("reports a section that failed permanently as failed and a missing payload with a fetch error as error", async () => {
    mocks.getAnalyticsScope.mockResolvedValue({ scope: "combined", recomputing: false, sections: { benchmark_funds: { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" } } });
    const failed = renderHook(() => useMfAnalytics("benchmark_funds"), { wrapper: scopeWrapper({ value: {} }) });
    await waitFor(() => expect(failed.result.current.status).toBe("failed"));
    expect(failed.result.current.data).toBeNull();
    analyticsStore.invalidate();
    mocks.getAnalyticsScope.mockRejectedValue(new Error("offline"));
    const broken = renderHook(() => useMfAnalytics("investment_withdrawal"), { wrapper: scopeWrapper({ value: {} }) });
    await waitFor(() => expect(broken.result.current.status).toBe("error"));
  });
  it("retry asks the backend to recompute and then refetches", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(settled());
    mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
    const { result } = renderHook(() => useMfAnalytics("benchmark_funds"), { wrapper: scopeWrapper({ value: {} }) });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => { result.current.retry(); });
    await waitFor(() => expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(2));
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("combined");
  });
  it("shows the stored payload at once when a tab mounts again", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(settled());
    const first = renderHook(() => useMfAnalytics("benchmark_funds"), { wrapper: scopeWrapper({ value: {} }) });
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    first.unmount();
    const second = renderHook(() => useMfAnalytics("benchmark_funds"), { wrapper: scopeWrapper({ value: {} }) });
    expect(second.result.current.status).toBe("ready");
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
});

describe("useMfDashboard", () => {
  function ready() {
    mocks.getHoldingsBundle.mockResolvedValue(bundle());
    mocks.getAllocation.mockResolvedValue(fx.allocation().allocation);
    mocks.getSips.mockResolvedValue(fx.sips().sips);
    mocks.getHistoryPoints.mockResolvedValue([]);
    mocks.getCoverageGaps.mockResolvedValue(fx.coverageGaps());
  }
  it("loads every part from the family scope with one request for the holdings-derived parts", async () => {
    ready();
    const { result } = renderHook(() => useMfDashboard(), { wrapper: scopeWrapper({ value: {} }) });
    expect(result.current.holdings.status).toBe("loading");
    await waitFor(() => expect(result.current.sips.status).toBe("data"));
    await waitFor(() => expect(result.current.allocation.status).toBe("data"));
    expect(result.current.holdings.data).toHaveLength(5);
    expect(result.current.xirr.data?.lifetime).toBe("0.1612");
    expect(result.current.realized.data?.total).toBe("210000.00");
    expect(result.current.members.data).toHaveLength(3);
    expect(result.current.sips.data).toHaveLength(5);
    expect(mocks.getHoldingsBundle).toHaveBeenCalledTimes(1);
    expect(mocks.getHoldingsBundle.mock.calls[0][0]).toEqual({ viewMode: "aggregate", memberId: null });
    expect(mocks.getSips.mock.calls[0].slice(0, 2)).toEqual([{ viewMode: "aggregate", memberId: null }, true]);
    expect(mocks.getCoverageGaps).not.toHaveBeenCalled();
    expect(result.current.coverageGaps).toMatchObject({ status: "data", data: [] });
  });
  it("lets each part fail on its own", async () => {
    ready();
    mocks.getAllocation.mockRejectedValue(new Error("allocation down"));
    const { result } = renderHook(() => useMfDashboard(), { wrapper: scopeWrapper({ value: {} }) });
    await waitFor(() => expect(result.current.allocation.status).toBe("error"));
    await waitFor(() => expect(result.current.holdings.status).toBe("data"));
    expect(result.current.sips.status).not.toBe("error");
  });
  it("reads coverage gaps for a member scope only", async () => {
    ready();
    const { result } = renderHook(() => useMfDashboard(), { wrapper: scopeWrapper({ value: { viewMode: "member", memberId: "m1" } }) });
    await waitFor(() => expect(result.current.coverageGaps.status).toBe("data"));
    expect(mocks.getCoverageGaps.mock.calls[0][0]).toBe("m1");
    expect(result.current.coverageGaps.data).toHaveLength(1);
  });
  it("cancels in-flight requests when the scope changes and never shows the previous member's data", async () => {
    ready();
    const signals: AbortSignal[] = [];
    mocks.getHoldingsBundle.mockImplementation((scope: { memberId: string | null }, signal: AbortSignal) => { signals.push(signal); return scope.memberId === "m2" ? new Promise(() => {}) : Promise.resolve(bundle()); });
    const holder = { value: { viewMode: "member", memberId: "m1" } as Partial<ScopeValue> };
    const { result, rerender } = renderHook(() => useMfDashboard(), { wrapper: scopeWrapper(holder) });
    await waitFor(() => expect(result.current.holdings.status).toBe("data"));
    holder.value = { viewMode: "member", memberId: "m2" };
    rerender();
    expect(signals[0].aborted).toBe(true);
    expect(result.current.holdings).toMatchObject({ status: "loading", data: null });
    expect(result.current.xirr).toMatchObject({ status: "loading", data: null });
    expect(result.current.allocation.data).toBeNull();
  });
  it("retries one part without reloading the others", async () => {
    ready();
    mocks.getAllocation.mockRejectedValueOnce(new Error("x")).mockResolvedValue(fx.allocation().allocation);
    const { result } = renderHook(() => useMfDashboard(), { wrapper: scopeWrapper({ value: {} }) });
    await waitFor(() => expect(result.current.allocation.status).toBe("error"));
    await waitFor(() => expect(result.current.holdings.status).toBe("data"));
    act(() => result.current.allocation.retry());
    await waitFor(() => expect(result.current.allocation.status).toBe("data"));
    expect(mocks.getAllocation).toHaveBeenCalledTimes(2);
    expect(mocks.getHoldingsBundle).toHaveBeenCalledTimes(1);
  });
});
