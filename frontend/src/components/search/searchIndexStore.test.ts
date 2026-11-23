import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSearchIndex } from "./searchApi";
import {
  clearSearchState,
  getSearchIndexState,
  invalidateSearchIndex,
  loadSearchIndex,
  retrySearchIndex,
  subscribeSearchIndex,
} from "./searchIndexStore";
import { pushRecentFund, pushRecentSearch, readRecentFunds, readRecentSearches } from "./recentSearches";
import type { SearchIndexResponse } from "./searchTypes";

vi.mock("./searchApi", () => ({
  fetchSearchIndex: vi.fn(),
}));

const mockedFetchSearchIndex = vi.mocked(fetchSearchIndex);

function makeIndex(fundName: string): SearchIndexResponse {
  return {
    generated_at: "2026-11-20T10:00:00+05:30",
    funds: [
      {
        scheme_id: `scheme-${fundName}`,
        name: fundName,
        amc_name: "Test AMC",
        sebi_category: "Flexi Cap",
        plan_type: "direct",
        main_manager: null,
        holders: [],
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("searchIndexStore", () => {
  afterEach(() => {
    clearSearchState();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("starts idle with null data", () => {
    expect(getSearchIndexState("tok-a")).toEqual({ status: "idle", data: null });
  });

  it("runs only one fetch for concurrent callers and skips once ready", async () => {
    const d = deferred<SearchIndexResponse>();
    mockedFetchSearchIndex.mockReturnValueOnce(d.promise);

    const p1 = loadSearchIndex("tok-a");
    const p2 = loadSearchIndex("tok-a");

    expect(getSearchIndexState("tok-a")).toEqual({ status: "loading", data: null });
    expect(mockedFetchSearchIndex).toHaveBeenCalledTimes(1);

    const payload = makeIndex("Alpha");
    d.resolve(payload);
    await Promise.all([p1, p2]);

    expect(getSearchIndexState("tok-a")).toEqual({ status: "ready", data: payload });

    await loadSearchIndex("tok-a");
    expect(mockedFetchSearchIndex).toHaveBeenCalledTimes(1);
  });

  it("keys state by token so token B never sees token A's data", async () => {
    const payloadA = makeIndex("Fund A");
    mockedFetchSearchIndex.mockResolvedValueOnce(payloadA);

    await loadSearchIndex("tok-a");

    expect(getSearchIndexState("tok-a")).toEqual({ status: "ready", data: payloadA });
    expect(getSearchIndexState("tok-b")).toEqual({ status: "idle", data: null });
  });

  it("drops a slow response for an old token when a newer token loads", async () => {
    const dA = deferred<SearchIndexResponse>();
    const dB = deferred<SearchIndexResponse>();
    mockedFetchSearchIndex.mockReturnValueOnce(dA.promise).mockReturnValueOnce(dB.promise);

    const pA = loadSearchIndex("tok-a");
    const pB = loadSearchIndex("tok-b");

    const payloadB = makeIndex("Fund B");
    dB.resolve(payloadB);
    await pB;

    dA.resolve(makeIndex("Fund A"));
    await pA;

    expect(getSearchIndexState("tok-b")).toEqual({ status: "ready", data: payloadB });
    expect(getSearchIndexState("tok-a")).toEqual({ status: "idle", data: null });
  });

  it("invalidateSearchIndex keeps old data until next loadSearchIndex refetches", async () => {
    const first = makeIndex("First");
    const second = makeIndex("Second");
    mockedFetchSearchIndex.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    await loadSearchIndex("tok-a");
    invalidateSearchIndex();

    expect(getSearchIndexState("tok-a")).toEqual({ status: "ready", data: first });

    await loadSearchIndex("tok-a");
    expect(mockedFetchSearchIndex).toHaveBeenCalledTimes(2);
    expect(getSearchIndexState("tok-a")).toEqual({ status: "ready", data: second });
  });

  it("sets status to error on failure and allows retrySearchIndex to recover", async () => {
    const recovered = makeIndex("Recovered");
    mockedFetchSearchIndex
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(recovered);

    await loadSearchIndex("tok-a");
    expect(getSearchIndexState("tok-a")).toEqual({ status: "error", data: null });

    await retrySearchIndex("tok-a");
    expect(mockedFetchSearchIndex).toHaveBeenCalledTimes(2);
    expect(getSearchIndexState("tok-a")).toEqual({ status: "ready", data: recovered });
  });

  it("clearSearchState drops all state, ignores in-flight answers, and clears recents", async () => {
    pushRecentSearch("user-1", "hdfc");
    pushRecentFund("user-1", "scheme-1");

    const d = deferred<SearchIndexResponse>();
    mockedFetchSearchIndex.mockReturnValueOnce(d.promise);

    const p = loadSearchIndex("tok-a");
    clearSearchState();

    expect(getSearchIndexState("tok-a")).toEqual({ status: "idle", data: null });
    expect(readRecentSearches("user-1")).toEqual([]);
    expect(readRecentFunds("user-1")).toEqual([]);

    d.resolve(makeIndex("Late"));
    await p;

    expect(getSearchIndexState("tok-a")).toEqual({ status: "idle", data: null });
  });

  it("notifies subscribers on state changes and supports unsubscribe", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSearchIndex(listener);
    mockedFetchSearchIndex.mockResolvedValueOnce(makeIndex("Sub"));

    await loadSearchIndex("tok-a");
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);

    const countBeforeUnsub = listener.mock.calls.length;
    unsubscribe();
    clearSearchState();
    expect(listener).toHaveBeenCalledTimes(countBeforeUnsub);
  });
});
