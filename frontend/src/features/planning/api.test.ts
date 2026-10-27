import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, invalidateApiCache } from "@/lib/apiClient";
import * as session from "../auth/session";
import { getScenarioResult, listScenarios } from "./api";
import { curatedList, standardResult } from "./testData";

const path = (url: string) => new URL(url).pathname + new URL(url).search;

beforeEach(() => { vi.spyOn(session, "getToken").mockReturnValue("tok-1"); });
afterEach(() => { invalidateApiCache(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("listScenarios", () => {
  it("asks for the curated list or the full list", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json(curatedList())));
    vi.stubGlobal("fetch", fetcher);
    await listScenarios(true);
    await listScenarios(false);
    expect(fetcher.mock.calls.map(([url]) => path(url))).toEqual(["/scenarios?curated=true", "/scenarios"]);
  });

  it("sends the token and the abort signal, and returns the rows untouched", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(curatedList()));
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    expect(await listScenarios(true, signal)).toEqual(curatedList());
    const options = fetcher.mock.calls[0][1];
    expect(options.headers.get("Authorization")).toBe("Bearer tok-1");
    expect(options.signal).toBe(signal);
  });

  it("sends no Authorization header without a token", async () => {
    vi.spyOn(session, "getToken").mockReturnValue(null);
    const fetcher = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetcher);
    await listScenarios(false);
    expect(fetcher.mock.calls[0][1].headers.has("Authorization")).toBe(false);
  });
});

describe("getScenarioResult", () => {
  it("requests the family result without a query", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(standardResult()));
    vi.stubGlobal("fetch", fetcher);
    const result = await getScenarioResult("abc");
    expect(path(fetcher.mock.calls[0][0])).toBe("/scenarios/abc/results");
    expect(result.rupee_impact).toBe("-655.98");
    expect(typeof result.portfolio_impact_pct).toBe("string");
  });

  it("adds member_id only when a member is given", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json(standardResult())));
    vi.stubGlobal("fetch", fetcher);
    // cachedFetch answers a repeated GET from memory, so each call starts from an empty cache
    await getScenarioResult("abc", undefined, "m1");
    invalidateApiCache();
    await getScenarioResult("abc", undefined, undefined);
    invalidateApiCache();
    await getScenarioResult("abc", undefined, "");
    expect(fetcher.mock.calls.map(([url]) => path(url))).toEqual([
      "/scenarios/abc/results?member_id=m1", "/scenarios/abc/results", "/scenarios/abc/results",
    ]);
  });

  it("URL-encodes the scenario id and the member id", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json(standardResult())));
    vi.stubGlobal("fetch", fetcher);
    await getScenarioResult("a/b c", undefined, "m 1&x=2");
    expect(fetcher.mock.calls[0][0]).toContain("/scenarios/a%2Fb%20c/results?member_id=m%201%26x%3D2");
  });

  it("passes the signal and the token", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(standardResult()));
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    await getScenarioResult("abc", signal, "m1");
    const options = fetcher.mock.calls[0][1];
    expect(options.signal).toBe(signal);
    expect(options.headers.get("Authorization")).toBe("Bearer tok-1");
  });

  it("throws an ApiError carrying the status and the server's detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "Household member not found." }, { status: 404 })));
    const failure = getScenarioResult("abc", undefined, "m9");
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 404, message: "Household member not found." });
  });
});
