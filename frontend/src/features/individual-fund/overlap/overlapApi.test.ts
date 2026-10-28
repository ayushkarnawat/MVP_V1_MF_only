import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, ApiError, invalidateApiCache } from "../../../lib/apiClient";
import { fundPageApi } from "../api";

const session = vi.hoisted(() => ({ token: "tok-123" as string | null }));
vi.mock("../../auth/session", () => ({ getToken: () => session.token }));

const S = "7c9e5b0a-3f1d-4a52-8e6b-1d2f3a4b5c6d";
const O = "8d3f6c1b-4a2e-4b63-9f7c-2e3a4b5c6d7e";
const M = "b2e1c0d4-7a11-4f6b-9c3e-0a1b2c3d4e5f";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const lastCall = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.at(-1) as [string, RequestInit];

beforeEach(() => {
  invalidateApiCache();
  session.token = "tok-123";
});
afterEach(() => vi.unstubAllGlobals());

const CALLS: [string, (signal: AbortSignal) => Promise<unknown>, string][] = [
  ["overlap (combined)", signal => fundPageApi.overlap(S, "combined", signal), `/fund-page/${S}/overlap?scope=combined`],
  ["overlap (member)", signal => fundPageApi.overlap(S, M, signal), `/fund-page/${S}/overlap?scope=${M}`],
  ["overlapCompare (combined)", signal => fundPageApi.overlapCompare(S, O, "combined", signal), `/fund-page/${S}/overlap/${O}?scope=combined`],
  ["overlapCompare (member)", signal => fundPageApi.overlapCompare(S, O, M, signal), `/fund-page/${S}/overlap/${O}?scope=${M}`],
];

describe("fundPageApi overlap routes (16 and 17)", () => {
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
  });

  it("encodes both ids in the path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ status: "unavailable", reason: "no_disclosure" }));
    vi.stubGlobal("fetch", fetchMock);
    await fundPageApi.overlapCompare("a b/c", "d e/f", "combined");
    expect(lastCall(fetchMock)[0]).toBe(`${API_BASE_URL}/fund-page/a%20b%2Fc/overlap/d%20e%2Ff?scope=combined`);
  });

  it("passes an unavailable body through and raises ApiError on an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ status: "unavailable", reason: "not_held" })));
    await expect(fundPageApi.overlap(S, "combined")).resolves.toEqual({ status: "unavailable", reason: "not_held" });
    invalidateApiCache();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: "Not found" }, 404)));
    await expect(fundPageApi.overlapCompare(S, O, "combined")).rejects.toBeInstanceOf(ApiError);
  });
});
