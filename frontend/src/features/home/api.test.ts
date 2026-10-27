import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, ApiError, invalidateApiCache } from "../../lib/apiClient";
import {
  getAllocation,
  getBenchmarks,
  getHomeSummary,
  getMovers,
  getWealthSeries,
  getWorthALook,
  homePath,
} from "./api";
import type { HomeScopeArg, SummaryResponse } from "./types";

vi.mock("../auth/session", () => ({ getToken: () => "tok-123" }));

const AGGREGATE: HomeScopeArg = { viewMode: "aggregate", memberId: null };
const MEMBER: HomeScopeArg = { viewMode: "member", memberId: "m-1" };

const SUMMARY: SummaryResponse = {
  scope: "aggregate", member_id: null, nav_as_of: "2026-10-23", partial: false, missing_funds: [],
  computed_at: "2026-10-23T13:00:00Z", display_name: "Asha", greeting: "evening",
  scope_label: "Your family portfolio", change_amount: "38400.00", change_pct: "0.6012",
  direction: "up", status_phrase: "up", since_label: "today", since_date: "2026-10-22",
  top_contributor: "Large Cap Fund", members_connected: 2, members_total: 2,
  data_line: "Data from 2 of 2 family members", has_holdings: true, total_value: "21347320.00",
  members: [{ id: "m-1", name: "Asha Rao", has_data: true }],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

beforeEach(() => invalidateApiCache());
afterEach(() => vi.unstubAllGlobals());

describe("homePath", () => {
  it("builds the aggregate and member paths for every section", () => {
    for (const section of ["summary", "wealth-series", "allocation", "movers", "worth-a-look", "benchmarks"] as const) {
      expect(homePath(AGGREGATE, section)).toBe(`/household/aggregate/home/${section}`);
      expect(homePath(MEMBER, section)).toBe(`/household-members/m-1/home/${section}`);
    }
  });

  it("appends a query string in the given order and drops empty values", () => {
    expect(homePath(AGGREGATE, "movers", { by: "fund" })).toBe("/household/aggregate/home/movers?by=fund");
    expect(homePath(AGGREGATE, "wealth-series", { period: "1M", from: undefined, to: "", benchmark: "nifty_50" }))
      .toBe("/household/aggregate/home/wealth-series?period=1M&benchmark=nifty_50");
  });

  it("encodes query values", () => {
    expect(homePath(AGGREGATE, "movers", { by: "a b&c" })).toBe("/household/aggregate/home/movers?by=a+b%26c");
  });

  it("refuses member scope without a member id", () => {
    expect(() => homePath({ viewMode: "member", memberId: null }, "summary")).toThrow("memberId is required");
  });
});

describe("fetchers", () => {
  it("getHomeSummary sends the bearer token to the aggregate path and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(SUMMARY));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getHomeSummary(AGGREGATE);
    expect(result).toEqual(SUMMARY);
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/household/aggregate/home/summary`);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-123");
  });

  it("getHomeSummary uses the member path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ...SUMMARY, scope: "member", member_id: "m-9" }));
    vi.stubGlobal("fetch", fetchMock);
    await getHomeSummary({ viewMode: "member", memberId: "m-9" });
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/household-members/m-9/home/summary`);
  });

  it("getWealthSeries sends period, custom dates and benchmark as query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal("fetch", fetchMock);
    await getWealthSeries(AGGREGATE, { period: "custom", from: "2025-01-01", to: "2025-06-30", benchmark: "nifty_500" });
    expect(lastCall(fetchMock).url).toBe(
      `${API_BASE_URL}/household/aggregate/home/wealth-series?period=custom&from=2025-01-01&to=2025-06-30&benchmark=nifty_500`,
    );
  });

  it("getWealthSeries omits what was not given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal("fetch", fetchMock);
    await getWealthSeries(MEMBER, { period: "1D" });
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/household-members/m-1/home/wealth-series?period=1D`);
  });

  it("getMovers sends the view as 'by'", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal("fetch", fetchMock);
    await getMovers(AGGREGATE, "category");
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/household/aggregate/home/movers?by=category`);
  });

  it.each([
    ["getAllocation", getAllocation, "allocation"],
    ["getWorthALook", getWorthALook, "worth-a-look"],
    ["getBenchmarks", getBenchmarks, "benchmarks"],
  ] as const)("%s calls its section", async (_name, fetcher, section) => {
    const fetchMock = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal("fetch", fetchMock);
    await fetcher(AGGREGATE);
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/household/aggregate/home/${section}`);
  });

  it("passes the abort signal to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await getAllocation(AGGREGATE, controller.signal);
    expect(lastCall(fetchMock).init.signal).toBe(controller.signal);
  });

  it("throws ApiError with the status and the server message on a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Household member not found." }, 404)));
    const failure = await getHomeSummary(MEMBER).catch(error => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.status).toBe(404);
    expect(failure.message).toBe("Household member not found.");
  });

  it("surfaces a 422 validation message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: [{ msg: "custom dates are required" }] }, 422)));
    const failure = await getWealthSeries(AGGREGATE, { period: "custom" }).catch(error => error);
    expect(failure.status).toBe(422);
    expect(failure.message).toBe("custom dates are required");
  });

  it("works without a token (no Authorization header)", async () => {
    vi.resetModules();
    vi.doMock("../auth/session", () => ({ getToken: () => null }));
    const fresh = await import("./api");
    const fetchMock = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal("fetch", fetchMock);
    await fresh.getBenchmarks({ viewMode: "member", memberId: "no-token-member" });
    expect(new Headers(lastCall(fetchMock).init.headers).has("Authorization")).toBe(false);
    vi.doUnmock("../auth/session");
  });
});
