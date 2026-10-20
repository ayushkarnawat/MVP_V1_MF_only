import { afterEach, describe, expect, it, vi } from "vitest";
import { getMemberHoldings } from "./api";

describe("dashboard api: getMemberHoldings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("passes both XIRR disclaimers through, and defaults them to null when absent", async () => {
    const disclaimer = { alt_xirr: "-0.0353", opening_cost_share: "0.9785" };
    const payload = (id: string, extra: object) => new Response(JSON.stringify({
      holdings: [], lifetime_xirr: "1.9397", current_holdings_xirr: "1.9397",
      realized_summary: { id }, ...extra,
    }), { status: 200 });
    // Distinct member ids: GETs are cached by URL.
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(payload("a", { lifetime_xirr_disclaimer: disclaimer, current_holdings_xirr_disclaimer: disclaimer }))
      .mockResolvedValueOnce(payload("b", {})));

    const withDisclaimer = await getMemberHoldings("member-with-disclaimer");
    expect(withDisclaimer.lifetime_xirr_disclaimer).toEqual(disclaimer);
    expect(withDisclaimer.current_holdings_xirr_disclaimer).toEqual(disclaimer);

    const without = await getMemberHoldings("member-without-disclaimer");
    expect(without.lifetime_xirr_disclaimer).toBeNull();
    expect(without.current_holdings_xirr_disclaimer).toBeNull();
  });
});
