import { describe, expect, it } from "vitest";
import { olderHoldingsMarker, stripEntriesForTab, type StripDates } from "./stripEntries";

const dates: StripDates = {
  pricesIso: "2026-11-12",
  holdingsIso: "2026-09-30",
  ratiosIso: "2026-11-11",
  feesIso: "2026-10-31",
  marketCapListIso: "2026-07-01",
};

describe("stripEntriesForTab", () => {
  it("allocation lists prices, holdings and the market-cap list in that order", () => {
    expect(stripEntriesForTab("allocation", dates).map(({ kind, iso }) => ({ kind, iso }))).toEqual([
      { kind: "prices", iso: "2026-11-12" },
      { kind: "holdings", iso: "2026-09-30" },
      { kind: "marketCapList", iso: "2026-07-01" },
    ]);
  });

  it("other analytics lists prices, holdings, ratios and fees in that order", () => {
    expect(stripEntriesForTab("analytics", dates).map(({ kind, iso }) => ({ kind, iso }))).toEqual([
      { kind: "prices", iso: "2026-11-12" },
      { kind: "holdings", iso: "2026-09-30" },
      { kind: "ratios", iso: "2026-11-11" },
      { kind: "fees", iso: "2026-10-31" },
    ]);
  });

  it("overview, performance, holdings, transactions and overlap have no strip entries", () => {
    for (const tab of ["overview", "performance", "holdings", "transactions", "overlap"] as const) {
      expect(stripEntriesForTab(tab, dates)).toEqual([]);
    }
  });

  it("an entry without a date is left out and a tab never gains one", () => {
    for (const missing of [null, undefined, ""]) {
      expect(stripEntriesForTab("allocation", {
        ...dates, pricesIso: missing, holdingsIso: missing, marketCapListIso: missing,
      })).toEqual([]);
      expect(stripEntriesForTab("analytics", {
        ...dates, pricesIso: missing, holdingsIso: missing, ratiosIso: missing, feesIso: missing,
      })).toEqual([]);
      expect(stripEntriesForTab("allocation", { ...dates, holdingsIso: missing }).map(entry => entry.kind))
        .toEqual(["prices", "marketCapList"]);
      expect(stripEntriesForTab("analytics", { ...dates, pricesIso: missing }).map(entry => entry.kind))
        .toEqual(["holdings", "ratios", "fees"]);
    }
    expect(stripEntriesForTab("allocation", {})).toEqual([]);
    expect(stripEntriesForTab("analytics", {})).toEqual([]);
  });

  it("explain sentences are exactly the agreed words", () => {
    const explain = {
      prices: "Prices: the latest day on which most of your funds have a price. Changes every trading day.",
      holdings: "Holdings: what each fund held at its last monthly disclosure. Changes once a month.",
      ratios: "Ratios: stock P/E and P/B from NSE and BSE daily data. Changes every trading day.",
      fees: "Fees: each fund's expense ratio (TER) for its latest reference month. Changes about once a month.",
      marketCapList: "Market-cap list: the AMFI list that sorts stocks into large, mid and small. Changes twice a year.",
    };
    expect(stripEntriesForTab("allocation", dates).map(entry => entry.explain))
      .toEqual([explain.prices, explain.holdings, explain.marketCapList]);
    expect(stripEntriesForTab("analytics", dates).map(entry => entry.explain))
      .toEqual([explain.prices, explain.holdings, explain.ratios, explain.fees]);
  });
});

describe("olderHoldingsMarker", () => {
  it("older marker names only funds tagged older than 60 days and counts them", () => {
    expect(olderHoldingsMarker([
      { scheme_name: "Example Growth Fund", age_tag: "older_than_60_days" },
      { scheme_name: "Example Income Fund", age_tag: "on_cycle" },
      { scheme_name: "Example Balanced Fund", age_tag: null },
      { scheme_name: "Example Equity Fund", age_tag: "older_than_60_days" },
    ])).toEqual({
      label: "2 funds have older holdings",
      items: ["Example Growth Fund", "Example Equity Fund"],
    });
  });

  it("older marker is null when no fund is old", () => {
    expect(olderHoldingsMarker([])).toBeNull();
    expect(olderHoldingsMarker([
      { scheme_name: "Example Income Fund", age_tag: "on_cycle" },
      { scheme_name: "Example Balanced Fund", age_tag: null },
    ])).toBeNull();
  });

  it("singular label for one fund", () => {
    expect(olderHoldingsMarker([
      { scheme_name: "Example Growth Fund", age_tag: "older_than_60_days" },
    ])).toEqual({ label: "1 fund has older holdings", items: ["Example Growth Fund"] });
  });
});
