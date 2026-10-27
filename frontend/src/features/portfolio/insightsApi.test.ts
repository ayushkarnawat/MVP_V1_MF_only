import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, ApiError, invalidateApiCache } from "../../lib/apiClient";
import { getPortfolioInsights, portfolioPath } from "./api";
import { fixture } from "./fixtures/insights";
import type { PortfolioInsightsResponse, PortfolioScopeArg } from "./types";

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

describe("portfolioPath for the insights section", () => {
  it("builds the aggregate and the member path, with no query string", () => {
    expect(portfolioPath(AGGREGATE, "portfolio-insights")).toBe("/household/aggregate/portfolio-insights");
    expect(portfolioPath(MEMBER, "portfolio-insights")).toBe("/household-members/m-1/portfolio-insights");
  });

  it("url-encodes the member id and refuses member scope without one", () => {
    expect(portfolioPath({ viewMode: "member", memberId: "abc 123" }, "portfolio-insights"))
      .toBe("/household-members/abc%20123/portfolio-insights");
    expect(() => portfolioPath({ viewMode: "member", memberId: null }, "portfolio-insights")).toThrow("memberId is required");
  });
});

describe("getPortfolioInsights", () => {
  it("sends the bearer token to the aggregate path and returns the parsed body", async () => {
    const body = fixture<PortfolioInsightsResponse>("insights_family");
    const fetchMock = vi.fn().mockResolvedValue(json(body));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getPortfolioInsights(AGGREGATE);
    expect(result).toEqual(body);
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE_URL}/household/aggregate/portfolio-insights`);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-123");
  });

  it("calls the member path for a member scope", async () => {
    const body = fixture<PortfolioInsightsResponse>("insights_member");
    const fetchMock = vi.fn().mockResolvedValue(json(body));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getPortfolioInsights(MEMBER)).toEqual(body);
    expect(lastCall(fetchMock).url).toBe(`${API_BASE_URL}/household-members/m-1/portfolio-insights`);
  });

  it("passes the abort signal to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(fixture("insights_family")));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await getPortfolioInsights(AGGREGATE, controller.signal);
    expect(lastCall(fetchMock).init.signal).toBe(controller.signal);
  });

  it("throws an ApiError with the status and the server's detail on a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Household member not found." }, 404)));
    const error = await getPortfolioInsights(MEMBER).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).message).toBe("Household member not found.");
  });

  it("is async: a member scope without an id rejects instead of throwing synchronously", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const pending = getPortfolioInsights({ viewMode: "member", memberId: null });
    await expect(pending).rejects.toThrow("memberId is required");
  });
});
