import { describe, expect, it } from "vitest";
import type { PortfolioValueSeriesResponse } from "../types";
import { FIXTURE_NAMES, fixture } from "./index";

// The contract guard: if the backend moves a field, the regenerated fixtures stop matching these lists and this
// test fails before any page does. Keep the lists in step with types.ts.
const ENVELOPE = ["scope", "member_id", "nav_as_of", "partial", "missing_funds", "computed_at"];
const EXTRAS: Record<string, string[]> = {
  summary: [
    "members", "total_value", "total_invested", "unrealized_gain", "unrealized_pct", "realized_gain", "today_gain",
    "today_pct", "previous_nav_date", "lifetime_xirr", "current_holdings_xirr", "lifetime_xirr_disclaimer",
    "current_holdings_xirr_disclaimer",
  ],
  allocation: ["members", "buckets"],
  series: ["members", "days", "start", "end", "empty", "points"],
};
const BUCKET_LABELS = ["Mutual Funds", "Direct Stocks", "US Stocks", "FDs & Bonds", "Debt", "Gold", "Real Estate", "Others"];

describe("Portfolio golden fixtures", () => {
  it("has the 10 files the backend generates", () => {
    expect(FIXTURE_NAMES).toHaveLength(10);
    expect(FIXTURE_NAMES).toContain("series_family_30d");
  });

  it("throws for a name that does not exist", () => {
    expect(() => fixture("nope")).toThrow("unknown Portfolio fixture: nope");
  });

  it("returns a copy, so a test can change it without affecting another", () => {
    const first = fixture<{ total_value: string }>("summary_family");
    first.total_value = "changed";
    expect(fixture<{ total_value: string }>("summary_family").total_value).toBe("5212.00");
  });

  it.each(FIXTURE_NAMES)("%s has exactly the contract's fields", name => {
    const group = name.split("_")[0];
    const body = fixture<Record<string, unknown>>(name);
    expect(Object.keys(body).sort()).toEqual([...ENVELOPE, ...EXTRAS[group]].sort());
  });

  it("lists the eight instrument classes in the signed-off order, only Mutual Funds live", () => {
    for (const name of ["allocation_family", "allocation_member", "allocation_empty"]) {
      const body = fixture<{ buckets: { label: string; status: string }[] }>(name);
      expect(body.buckets.map(bucket => bucket.label)).toEqual(BUCKET_LABELS);
      expect(body.buckets.filter(bucket => bucket.status === "live").map(bucket => bucket.label)).toEqual(["Mutual Funds"]);
    }
  });

  it("serialises money and percentages as strings, XIRR as a decimal fraction string and dates as ISO text", () => {
    const summary = fixture<Record<string, unknown>>("summary_family");
    for (const key of ["total_value", "total_invested", "unrealized_gain", "unrealized_pct", "today_gain", "lifetime_xirr"]) {
      expect(typeof summary[key]).toBe("string");
    }
    expect(Number(summary.lifetime_xirr)).toBeLessThan(5);
    expect(summary.computed_at).toMatch(/Z$/);
    const series = fixture<PortfolioValueSeriesResponse>("series_family_30d");
    expect(series.points.every(point => typeof point.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(point.date))).toBe(true);
    expect(series.points).toHaveLength(30);
  });

  it("keeps a member's response free of the members list and the family's with it", () => {
    expect(fixture<{ members: unknown }>("summary_member").members).toBeNull();
    expect(fixture<{ members: unknown[] }>("summary_family").members).toHaveLength(2);
  });
});
