import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, ApiError, invalidateApiCache } from "../../lib/apiClient";
import { fundPageApi, fundPagePath } from "./api";

const session = vi.hoisted(() => ({ token: "tok-123" as string | null }));
vi.mock("../auth/session", () => ({ getToken: () => session.token }));

const S = "7c9e5b0a-3f1d-4a52-8e6b-1d2f3a4b5c6d";
const M = "b2e1c0d4-7a11-4f6b-9c3e-0a1b2c3d4e5f";
const F = "a1d4c7e0-1111-4aaa-8bbb-000000000001";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const lastCall = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.at(-1) as [string, RequestInit];

beforeEach(() => {
  invalidateApiCache();
  session.token = "tok-123";
});
afterEach(() => vi.unstubAllGlobals());

describe("fundPagePath", () => {
  it("builds /fund-page/{id}/{route} and encodes the scheme id", () => {
    expect(fundPagePath(S, "risk")).toBe(`/fund-page/${S}/risk`);
    expect(fundPagePath("a b/c", "risk")).toBe("/fund-page/a%20b%2Fc/risk");
  });

  it("appends the query in the given order and drops empty values", () => {
    expect(fundPagePath(S, "returns", { mode: "current", scope: "combined" })).toBe(`/fund-page/${S}/returns?mode=current&scope=combined`);
    expect(fundPagePath(S, "returns", { mode: "current", scope: undefined })).toBe(`/fund-page/${S}/returns?mode=current`);
    expect(fundPagePath(S, "returns", { mode: "", scope: undefined })).toBe(`/fund-page/${S}/returns`);
  });

  it("encodes query values", () => {
    expect(fundPagePath(S, "summary", { scope: "a b&c" })).toBe(`/fund-page/${S}/summary?scope=a+b%26c`);
  });
});

const CALLS: [string, (signal: AbortSignal) => Promise<unknown>, string][] = [
  ["summary (combined)", signal => fundPageApi.summary(S, "combined", signal), `/fund-page/${S}/summary?scope=combined`],
  ["summary (member)", signal => fundPageApi.summary(S, M, signal), `/fund-page/${S}/summary?scope=${M}`],
  ["folioNumber", signal => fundPageApi.folioNumber(S, F, signal), `/fund-page/${S}/folios/${F}/number`],
  ["performance", signal => fundPageApi.performance(S, "3M", signal), `/fund-page/${S}/performance?period=3M`],
  ["returns (inception)", signal => fundPageApi.returns(S, "inception", "combined", signal), `/fund-page/${S}/returns?mode=inception&scope=combined`],
  ["returns (current, member)", signal => fundPageApi.returns(S, "current", M, signal), `/fund-page/${S}/returns?mode=current&scope=${M}`],
  ["risk", signal => fundPageApi.risk(S, signal), `/fund-page/${S}/risk`],
  ["composition", signal => fundPageApi.composition(S, signal), `/fund-page/${S}/portfolio-composition`],
  ["holdings", signal => fundPageApi.holdings(S, signal), `/fund-page/${S}/holdings`],
  ["manager", signal => fundPageApi.manager(S, signal), `/fund-page/${S}/manager`],
  ["score", signal => fundPageApi.score(S, M, signal), `/fund-page/${S}/score?scope=${M}`],
  ["categorySeries", signal => fundPageApi.categorySeries(S, "All", signal), `/fund-page/${S}/peers/series?period=All`],
  ["categoryReturns", signal => fundPageApi.categoryReturns(S, signal), `/fund-page/${S}/peers/returns`],
  ["rolling", signal => fundPageApi.rolling(S, 3, signal), `/fund-page/${S}/peers/rolling?window=3`],
  ["periodReturns", signal => fundPageApi.periodReturns(S, "5Y", signal), `/fund-page/${S}/peers/period-returns?period=5Y`],
  ["scatter", signal => fundPageApi.scatter(S, signal), `/fund-page/${S}/peers/scatter`],
  ["insights", signal => fundPageApi.insights(S, "combined", signal), `/fund-page/${S}/insights?scope=combined`],
];

describe("fundPageApi", () => {
  it.each(CALLS)("%s calls the exact path with the bearer token and the abort signal, and returns the JSON", async (_name, call, path) => {
    const body = { status: "ready", marker: path };
    const fetchMock = vi.fn().mockResolvedValue(json(body));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await expect(call(controller.signal)).resolves.toEqual(body);
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${API_BASE_URL}${path}`);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-123");
    expect(init.signal).toBe(controller.signal);
    expect(init.method === undefined || init.method === "GET").toBe(true);
  });

  it("sends no Authorization header without a token", async () => {
    session.token = null;
    const fetchMock = vi.fn().mockResolvedValue(json({ status: "ready" }));
    vi.stubGlobal("fetch", fetchMock);
    await fundPageApi.risk(S);
    expect(new Headers(lastCall(fetchMock)[1].headers).has("Authorization")).toBe(false);
  });

  it("returns an unavailable body as it is (HTTP 200), it is not an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ status: "unavailable", reason: "no_history" })));
    await expect(fundPageApi.risk(S)).resolves.toEqual({ status: "unavailable", reason: "no_history" });
  });

  it("throws an ApiError with the HTTP status for a non-ok answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Scheme not found." }, 404)));
    const error = await fundPageApi.summary(S, "combined").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
  });

  it("encodes the folio id and the scheme id in the path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ status: "ready" }));
    vi.stubGlobal("fetch", fetchMock);
    await fundPageApi.folioNumber("a/b", "c d");
    expect(lastCall(fetchMock)[0]).toBe(`${API_BASE_URL}/fund-page/a%2Fb/folios/c%20d/number`);
  });
});
