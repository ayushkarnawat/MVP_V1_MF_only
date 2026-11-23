import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateApiCache } from "../../lib/apiClient";
import { fetchSearchIndex } from "./searchApi";
import { clearSearchState, getSearchIndexState, loadSearchIndex } from "./searchIndexStore";
import type { SearchIndexResponse } from "./searchTypes";

vi.mock("./searchApi", () => ({ fetchSearchIndex: vi.fn() }));
const mocked = vi.mocked(fetchSearchIndex);

const index = (name: string): SearchIndexResponse => ({
  generated_at: "2026-11-23T10:00:00+05:30",
  funds: [{ scheme_id: name, name, amc_name: "Orchid AMC", sebi_category: null, plan_type: "direct", main_manager: null, holders: [] }],
});

afterEach(() => { clearSearchState(); vi.resetAllMocks(); });

// A data change (an import, a delete, a profile edit) clears the GET cache; the search index is a copy of household data
// and must follow it, or a fund added by an import would not be found until the next sign-in.
describe("the search index follows the GET cache", () => {
  it("clearing the GET cache marks the loaded index stale, so the next load fetches again", async () => {
    mocked.mockResolvedValueOnce(index("Before import")).mockResolvedValueOnce(index("After import"));
    await loadSearchIndex("token-a");
    expect(getSearchIndexState("token-a").data?.funds[0].name).toBe("Before import");
    await loadSearchIndex("token-a");
    expect(mocked).toHaveBeenCalledTimes(1); // still fresh
    invalidateApiCache();
    await loadSearchIndex("token-a");
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(getSearchIndexState("token-a").data?.funds[0].name).toBe("After import");
  });

  it("an index that was never loaded is not fetched by the invalidation alone", () => {
    invalidateApiCache();
    expect(mocked).not.toHaveBeenCalled();
  });
});
