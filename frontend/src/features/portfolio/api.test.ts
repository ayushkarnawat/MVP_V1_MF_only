import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, ApiError, invalidateApiCache } from "../../lib/apiClient";
import {
  getPortfolioAllocation,
  getPortfolioSummary,
  getPortfolioValueSeries,
  portfolioPath,
} from "./api";
import { fixture } from "./fixtures";
import type { PortfolioScopeArg, PortfolioSummaryResponse } from "./types";

vi.mock("../auth/session", () => ({ getToken: () => "tok-123" }));

const AGGREGATE: PortfolioScopeArg = { viewMode: "aggregate", memberId: null };
const MEMBER: PortfolioScopeArg = { viewMode: "member", memberId: "m-1" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

beforeEach(() => invalidateApiCache());
afterEach(() => vi.unstubAllGlobals());

describe("portfolioPath", () => {
  it("builds the aggregate and member paths for every section", () => {
    for (const section of ["portfolio-summary", "portfolio-allocation", "portfolio-value-series"] as const) {
      expect(portfolioPath(AGGREGATE, section)).toBe(`/household/aggregate/${section}`);
      expect(portfolioPath(MEMBER, section)).toBe(`/household-members/m-1/${section}`);
    }
  });

  it("url-encodes the member id", () => {
    expect(portfolioPath({ viewMode: "member", memberId: "abc 123" }, "portfolio-summary"))
      .toBe("/household-members/abc%20123/portfolio-summary");
  });

  it("appends a query string and drops empty values", () => {
    expect(portfolioPath(AGGREGATE, "portfolio-value-series", { days: "30" }))
      .toBe("/household/aggregate/portfolio-value-series?days=30");
    expect(portfolioPath(AGGREGATE, "portfolio-value-series", { days: undefined })).toBe("/household/aggregate/portfolio-value-series");
    expect(portfolioPath(AGGREGATE, "portfolio-value-series", { days: "" })).toBe("/household/aggregate/portfolio-value-series");
  });

  it("refuses member scope without a member id", () => {
    expect(() => portfolioPath({ viewMode: "member", memberId: null }, "portfolio-summary")).toThrow("memberId is required");
  });
});

describe("fetchers", () => {
  it("getPortfolioSummary sends the bearer token to the aggregate path and returns the parsed body", async () => {
    const body = fixture<PortfolioSummaryResponse>("summary_family");
    const fetchMock = vi.fn().mockResolvedValue(json(body));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getPortfolioSummary(AGGREGATE);
    expect(result).toEqual(body);
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/household/aggregate/portfolio-summary`);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-123");
  });

  it("getPortfolioSummary uses the member path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(fixture("summary_member")));
    vi.stubGlobal("fetch", fetchMock);
    await getPortfolioSummary({ viewMode: "member", memberId: "m-9" });
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/household-members/m-9/portfolio-summary`);
  });

  it("getPortfolioAllocation calls its section", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json(fixture("allocation_family"))));
    vi.stubGlobal("fetch", fetchMock);
    await getPortfolioAllocation(AGGREGATE);
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/household/aggregate/portfolio-allocation`);
    await getPortfolioAllocation(MEMBER);
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/household-members/m-1/portfolio-allocation`);
  });

  it("getPortfolioValueSeries sends days as a query parameter", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json(fixture("series_family_30d"))));
    vi.stubGlobal("fetch", fetchMock);
    await getPortfolioValueSeries(AGGREGATE, 30);
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/household/aggregate/portfolio-value-series?days=30`);
    await getPortfolioValueSeries(MEMBER, 90);
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/household-members/m-1/portfolio-value-series?days=90`);
  });

  it("passes the abort signal to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(fixture("allocation_family")));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await getPortfolioAllocation(AGGREGATE, controller.signal);
    expect(lastCall(fetchMock).init.signal).toBe(controller.signal);
  });

  it("throws ApiError with the status and the server message on a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Household member not found." }, 404)));
    const failure = await getPortfolioSummary(MEMBER).catch(error => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.status).toBe(404);
    expect(failure.message).toBe("Household member not found.");
  });

  it("works without a token (no Authorization header)", async () => {
    vi.resetModules();
    vi.doMock("../auth/session", () => ({ getToken: () => null }));
    const fresh = await import("./api");
    const fetchMock = vi.fn().mockResolvedValue(json(fixture("summary_empty")));
    vi.stubGlobal("fetch", fetchMock);
    await fresh.getPortfolioSummary(AGGREGATE);
    expect(new Headers(lastCall(fetchMock).init.headers).has("Authorization")).toBe(false);
    vi.doUnmock("../auth/session");
  });
});
