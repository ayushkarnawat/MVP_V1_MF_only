import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fx from "./fixtures";

const mocks = vi.hoisted(() => ({ cachedFetch: vi.fn(), token: "tok-1" as string | null }));
vi.mock("../../lib/apiClient", async importOriginal => ({ ...(await importOriginal<typeof import("../../lib/apiClient")>()), cachedFetch: mocks.cachedFetch }));
vi.mock("../auth/session", () => ({ getToken: () => mocks.token }));

import { API_BASE_URL, ApiError } from "../../lib/apiClient";
import {
  getAllocation, getAnalyticsScope, getCoverageGaps, getHistoryPoints, getHoldingsBundle, getMonthDetail, getSips, getSipsMonthly,
  mfPath, retryAnalyticsScope,
} from "./api";

const AGG = { viewMode: "aggregate", memberId: null } as const;
const MEM = { viewMode: "member", memberId: "m 1" } as const;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const lastUrl = () => String(mocks.cachedFetch.mock.calls.at(-1)?.[0]);
const lastInit = () => mocks.cachedFetch.mock.calls.at(-1)?.[1] as RequestInit;

beforeEach(() => { mocks.cachedFetch.mockReset(); mocks.token = "tok-1"; });

describe("mfPath", () => {
  it("builds aggregate and member paths, encoding the member id", () => {
    expect(mfPath(AGG, "holdings")).toBe("/household/aggregate/holdings");
    expect(mfPath(MEM, "holdings")).toBe("/household-members/m%201/holdings");
    expect(mfPath(AGG, "sips/monthly")).toBe("/household/aggregate/sips/monthly");
  });
  it("refuses a member scope without a member id", () => {
    expect(() => mfPath({ viewMode: "member", memberId: null }, "holdings")).toThrow("memberId is required for member scope");
  });
});

describe("holdings bundle", () => {
  it("reads the aggregate response into holdings, members, XIRR with disclaimers, and realised gains", async () => {
    mocks.cachedFetch.mockResolvedValue(ok(fx.aggregateHoldings()));
    const bundle = await getHoldingsBundle(AGG);
    expect(lastUrl()).toBe(`${API_BASE_URL}/household/aggregate/holdings`);
    expect((lastInit().headers as Headers).get("Authorization")).toBe("Bearer tok-1");
    expect(bundle.holdings).toHaveLength(5);
    expect(bundle.members.map(m => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(bundle.xirr).toEqual({ lifetime: "0.1612", current: "0.1480", disclaimers: { lifetime: { alt_xirr: "0.1105", opening_cost_share: "0.3800" }, current: null } });
    expect(bundle.realized?.total).toBe("210000.00");
  });
  it("reads a member response and has no member list", async () => {
    mocks.cachedFetch.mockResolvedValue(ok(fx.memberHoldings()));
    const bundle = await getHoldingsBundle({ viewMode: "member", memberId: "m1" });
    expect(lastUrl()).toBe(`${API_BASE_URL}/household-members/m1/holdings`);
    expect(bundle.members).toEqual([]);
    expect(bundle.holdings.map(h => h.scheme_id)).toEqual(["S-KOTAK", "S-AXIS"]);
    expect(bundle.xirr.lifetime).toBe("0.1420");
  });
  it("treats absent XIRR, disclaimer and realised fields as null", async () => {
    mocks.cachedFetch.mockResolvedValue(ok({ members: [], holdings: [] }));
    expect(await getHoldingsBundle(AGG)).toEqual({ holdings: [], members: [], xirr: { lifetime: null, current: null, disclaimers: { lifetime: null, current: null } }, realized: null });
  });
  it("passes the abort signal and omits the header without a token", async () => {
    mocks.token = null;
    mocks.cachedFetch.mockResolvedValue(ok(fx.aggregateHoldings()));
    const controller = new AbortController();
    await getHoldingsBundle(AGG, controller.signal);
    expect(lastInit().signal).toBe(controller.signal);
    expect((lastInit().headers as Headers).has("Authorization")).toBe(false);
  });
  it("throws an ApiError carrying the status on a failed response", async () => {
    mocks.cachedFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ detail: "down" }), text: async () => "down", clone() { return this; } });
    await expect(getHoldingsBundle(AGG)).rejects.toBeInstanceOf(ApiError);
    await expect(getHoldingsBundle(AGG)).rejects.toMatchObject({ status: 503 });
  });
});

describe("other dashboard routes", () => {
  it("unwraps the aggregate allocation and reads the member one as is", async () => {
    mocks.cachedFetch.mockResolvedValueOnce(ok(fx.allocation()));
    expect((await getAllocation(AGG)).total_value).toBe("4649340.00");
    expect(lastUrl()).toBe(`${API_BASE_URL}/household/aggregate/allocation`);
    mocks.cachedFetch.mockResolvedValueOnce(ok(fx.allocation().allocation));
    expect((await getAllocation({ viewMode: "member", memberId: "m1" })).by_amc).toHaveLength(4);
    expect(lastUrl()).toBe(`${API_BASE_URL}/household-members/m1/allocation`);
  });
  it("asks for stopped SIPs only when told to, unwrapping the aggregate list", async () => {
    mocks.cachedFetch.mockResolvedValueOnce(ok(fx.sips()));
    expect(await getSips(AGG, true)).toHaveLength(5);
    expect(lastUrl()).toBe(`${API_BASE_URL}/household/aggregate/sips?include_stopped=true`);
    mocks.cachedFetch.mockResolvedValueOnce(ok(fx.sips().sips));
    await getSips({ viewMode: "member", memberId: "m1" }, false);
    expect(lastUrl()).toBe(`${API_BASE_URL}/household-members/m1/sips`);
  });
  it("reads one month of SIP instalments", async () => {
    mocks.cachedFetch.mockResolvedValueOnce(ok(fx.sipsMonthly()));
    expect(await getSipsMonthly(AGG, 2026, 10)).toHaveLength(2);
    expect(lastUrl()).toBe(`${API_BASE_URL}/household/aggregate/sips/monthly?year=2026&month=10`);
  });
  it("reads coverage gaps for one member", async () => {
    mocks.cachedFetch.mockResolvedValueOnce(ok(fx.coverageGaps()));
    expect(await getCoverageGaps("m1")).toHaveLength(1);
    expect(lastUrl()).toBe(`${API_BASE_URL}/household-members/m1/coverage-gaps`);
  });
  it("reads a month's detail", async () => {
    mocks.cachedFetch.mockResolvedValueOnce(ok(fx.monthDetail()));
    expect((await getMonthDetail(AGG, "2026-08-31")).funds).toHaveLength(2);
    expect(lastUrl()).toBe(`${API_BASE_URL}/household/aggregate/snapshots/2026-08-31`);
    mocks.cachedFetch.mockResolvedValueOnce(ok(fx.monthDetail()));
    await getMonthDetail({ viewMode: "member", memberId: "m1" }, "2026-08-31");
    expect(lastUrl()).toBe(`${API_BASE_URL}/household-members/m1/snapshots/2026-08-31`);
  });
});

describe("history points", () => {
  it("sums the members month by month, in month order, flagging partial months", async () => {
    mocks.cachedFetch.mockResolvedValueOnce(ok(fx.snapshots()));
    const points = await getHistoryPoints(AGG);
    expect(lastUrl()).toBe(`${API_BASE_URL}/household/aggregate/snapshots`);
    expect(points.map(p => p.month)).toEqual(["2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-31"]);
    expect(points.map(p => p.valueText)).toEqual(["1800000.00", "1860000.00", "1920000.00", "1990000.00", "2060000.00"]);
    expect(points[2]).toMatchObject({ partial: true, missing: ["HDFC Mid-Cap Opportunities Fund"], investedText: "1500000.00", value: 1920000, invested: 1500000 });
    expect(points[0].partial).toBe(false);
  });
  it("reads a member's list as is and gives no points for a member scope without an id", async () => {
    mocks.cachedFetch.mockResolvedValueOnce(ok(fx.snapshots().snapshots.filter(s => s.household_member_id === "m1")));
    const points = await getHistoryPoints({ viewMode: "member", memberId: "m1" });
    expect(lastUrl()).toBe(`${API_BASE_URL}/household-members/m1/snapshots`);
    expect(points).toHaveLength(5);
    expect(points[0].valueText).toBe("1200000.00");
  });
  it("has a null invested figure when any member's is missing", async () => {
    const data = fx.snapshots();
    data.snapshots[0].invested_value = null;
    mocks.cachedFetch.mockResolvedValueOnce(ok(data));
    const [first] = await getHistoryPoints(AGG);
    expect(first.invested).toBeNull();
    expect(first.investedText).toBeNull();
  });
});

describe("analytics scope", () => {
  it("fetches /analytics/{scope} and posts the retry", async () => {
    mocks.cachedFetch.mockResolvedValueOnce(ok(fx.analyticsCombined()));
    expect((await getAnalyticsScope("combined")).recomputing).toBe(false);
    expect(lastUrl()).toBe(`${API_BASE_URL}/analytics/combined`);
    mocks.cachedFetch.mockResolvedValueOnce(ok({ dispatched: true }));
    expect(await retryAnalyticsScope("m1")).toEqual({ dispatched: true });
    expect(lastUrl()).toBe(`${API_BASE_URL}/analytics/m1/retry`);
    expect(lastInit().method).toBe("POST");
  });
});
