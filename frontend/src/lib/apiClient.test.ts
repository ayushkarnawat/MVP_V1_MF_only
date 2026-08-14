import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedFetch, invalidateApiCache } from "./apiClient";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("cachedFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    invalidateApiCache();
  });

  it("dedupes a repeated GET to the same url within the TTL window", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: 1 }));
    vi.stubGlobal("fetch", mockFetch);

    const first = await cachedFetch("http://api/x", { method: "GET" });
    const second = await cachedFetch("http://api/x", { method: "GET" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    await expect(first.json()).resolves.toEqual({ value: 1 });
    await expect(second.json()).resolves.toEqual({ value: 1 });
  });

  it("re-fetches once the TTL window has elapsed", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: 1 }));
    vi.stubGlobal("fetch", mockFetch);
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    await cachedFetch("http://api/x", { method: "GET" });
    nowSpy.mockReturnValue(1_000_000 + 61_000);
    await cachedFetch("http://api/x", { method: "GET" });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache non-GET requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: 1 }));
    vi.stubGlobal("fetch", mockFetch);

    await cachedFetch("http://api/x", { method: "POST" });
    await cachedFetch("http://api/x", { method: "POST" });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("error", { status: 500 }));
    vi.stubGlobal("fetch", mockFetch);

    await cachedFetch("http://api/x", { method: "GET" });
    await cachedFetch("http://api/x", { method: "GET" });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("invalidateApiCache forces the next GET to hit the network again", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ value: 1 }));
    vi.stubGlobal("fetch", mockFetch);

    await cachedFetch("http://api/x", { method: "GET" });
    invalidateApiCache();
    await cachedFetch("http://api/x", { method: "GET" });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
