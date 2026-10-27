import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invalidateApiCache } from "./apiClient";
import { getAnalyticsScope as legacyGet } from "../features/analytics/api";
import * as session from "../features/auth/session";
import { getAnalyticsScope as mfGet } from "../features/mutual-funds/api";

// A failed section is a 200 body, so the 60s GET cache would otherwise replay it after a
// Retry POST and the polling loop would never see the recompute.
beforeEach(() => {
  invalidateApiCache();
  vi.spyOn(session, "getToken").mockReturnValue("tok");
});
afterEach(() => vi.unstubAllGlobals());

for (const [name, get] of [["mutual-funds", mfGet], ["legacy analytics", legacyGet]] as const) {
  it(`${name}: GET /analytics/{scope} is never served from the URL cache`, async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ scope: "combined", recomputing: false, state: "failed" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ scope: "combined", recomputing: true, state: "fresh" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const first = (await get("combined")) as unknown as { state: string };
    const second = (await get("combined")) as unknown as { state: string };
    expect(first.state).toBe("failed");
    expect(second.state).toBe("fresh");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
}