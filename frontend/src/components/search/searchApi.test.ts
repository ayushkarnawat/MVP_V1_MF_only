import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, ApiError, cachedFetch } from "@/lib/apiClient";
import { fetchSearchIndex } from "./searchApi";
import type { SearchIndexResponse } from "./searchTypes";

vi.mock("@/lib/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/apiClient")>();
  return {
    ...actual,
    cachedFetch: vi.fn(),
  };
});

const mockedCachedFetch = vi.mocked(cachedFetch);

const SAMPLE_INDEX: SearchIndexResponse = {
  generated_at: "2026-11-20T10:00:00+05:30",
  funds: [
    {
      scheme_id: "INF179K01XQ0",
      name: "HDFC Flexi Cap Fund",
      amc_name: "HDFC Mutual Fund",
      sebi_category: "Flexi Cap",
      plan_type: "direct",
      main_manager: "Roshi Jain",
      holders: [
        {
          member_id: "m-1",
          member_name: "Asha",
          state: "open",
          sip: { status: "active", next_due_date: "2026-12-05" },
        },
      ],
    },
  ],
};

describe("fetchSearchIndex", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends GET /household/search-index with cache no-store and bearer header", async () => {
    mockedCachedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_INDEX), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchSearchIndex("tok-123");

    expect(result).toEqual(SAMPLE_INDEX);
    expect(mockedCachedFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockedCachedFetch.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/household/search-index`);
    expect(options?.cache).toBe("no-store");
    const headers = new Headers(options?.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok-123");
  });

  it("omits Authorization header when token is null", async () => {
    mockedCachedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_INDEX), { status: 200 }),
    );

    await fetchSearchIndex(null);

    const [, options] = mockedCachedFetch.mock.calls[0];
    expect(options?.cache).toBe("no-store");
    const headers = new Headers(options?.headers);
    expect(headers.get("Authorization")).toBeNull();
  });

  it("forwards AbortSignal to cachedFetch", async () => {
    mockedCachedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_INDEX), { status: 200 }),
    );
    const controller = new AbortController();

    await fetchSearchIndex("tok-123", controller.signal);

    const [, options] = mockedCachedFetch.mock.calls[0];
    expect(options?.signal).toBe(controller.signal);
  });

  it("throws ApiError on a non-OK response", async () => {
    mockedCachedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(fetchSearchIndex("bad-tok")).rejects.toMatchObject({
      name: "Error",
      status: 401,
      payload: "Not authenticated",
    });

    mockedCachedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Server error" }), { status: 500 }),
    );

    await expect(fetchSearchIndex("tok-123")).rejects.toBeInstanceOf(ApiError);
  });
});
