import { describe, expect, it } from "vitest";
import * as fa from "../fixtures/mfAsks";
import * as fc from "../fixtures/mfC";
import { findPair, impactPairs, inclusivePairs, pairKeyOf } from "./overlapLogic";

const keys = (pairs: { fund_a: { scheme_id: string }; fund_b: { scheme_id: string } }[]) => pairs.map(pair => `${pair.fund_a.scheme_id}~${pair.fund_b.scheme_id}`);

describe("inclusivePairs", () => {
  it("joins the strict list and the pairs at the low band and orders them by overlap, largest first", () => {
    expect(keys(inclusivePairs(fa.overlapSummaryWithAsks()))).toEqual(["S-KOTAK~S-SBI", "S-JM~S-SBI", "S-KOTAK~S-JM", "S-HDFC~S-SBI"]);
    expect(inclusivePairs(fa.overlapSummaryWithAsks()).map(pair => pair.overlap_pct)).toEqual(["40.60", "26.40", "23.70", "20.00"]);
  });
  it("equals the strict list on an old payload, and when the boundary list is null or empty", () => {
    const strict = fc.overlapSummary().pairs_above_low;
    expect(inclusivePairs(fc.overlapSummary())).toEqual(strict);
    const nulled = fc.overlapSummary();
    nulled.pairs_at_low_boundary = null;
    expect(inclusivePairs(nulled)).toEqual(strict);
    const empty = fc.overlapSummary();
    empty.pairs_at_low_boundary = [];
    expect(inclusivePairs(empty)).toEqual(strict);
  });
  it("sorts the merged list, not the two lists one after the other", () => {
    const data = fa.overlapSummaryWithAsks();
    data.pairs_at_low_boundary![0].overlap_pct = "25.00";
    expect(inclusivePairs(data).map(pair => pair.overlap_pct)).toEqual(["40.60", "26.40", "25.00", "23.70"]);
  });
  it("lists a pair once if both lists carry it", () => {
    const data = fa.overlapSummaryWithAsks();
    data.pairs_at_low_boundary!.push(structuredClone(data.pairs_above_low[1]));
    expect(inclusivePairs(data)).toHaveLength(4);
    expect(inclusivePairs(data).filter(pair => pairKeyOf(pair) === "S-JM~S-SBI")).toHaveLength(1);
  });
  it("works when only the boundary list has pairs, and returns an empty list when neither has", () => {
    const only = fa.overlapSummaryWithAsks();
    only.pairs_above_low = [];
    expect(keys(inclusivePairs(only))).toEqual(["S-HDFC~S-SBI"]);
    only.pairs_at_low_boundary = [];
    expect(inclusivePairs(only)).toEqual([]);
  });
  it("does not change the summary it is given", () => {
    const data = fa.overlapSummaryWithAsks();
    const before = structuredClone(data);
    inclusivePairs(data);
    expect(data).toEqual(before);
  });
});

describe("findPair with the boundary list", () => {
  it("finds a pair that is only in pairs_at_low_boundary", () => {
    const data = fa.overlapSummaryWithAsks();
    data.matrix = data.matrix.filter(pair => pairKeyOf(pair) !== "S-HDFC~S-SBI");
    expect(findPair(data, "S-HDFC~S-SBI")?.overlap_pct).toBe("20.00");
    expect(findPair(data, "S-JM~S-SBI")?.overlap_pct).toBe("26.40");
    expect(findPair(data, "S-NOPE~S-SBI")).toBeNull();
    expect(findPair(data, null)).toBeNull();
  });
  it("still works on an old payload", () => {
    expect(findPair(fc.overlapSummary(), "S-KOTAK~S-SBI")?.overlap_pct).toBe("40.60");
  });
});

describe("impactPairs", () => {
  it("returns the backend's impact pairs in their order, with their drivers", () => {
    const pairs = impactPairs(fa.overlapSummaryWithAsks());
    expect(pairs.map(pair => [pair.fund_a.scheme_id, pair.fund_b.scheme_id, pair.drivers.length])).toEqual([["S-KOTAK", "S-SBI", 5], ["S-JM", "S-SBI", 4], ["S-KOTAK", "S-JM", 4]]);
    expect(pairs[0].drivers[0]).toEqual({ isin: "INE040A01034", instrument_name: "HDFC Bank Ltd", contribution_pct: "7.80", share_of_pair_pct: "19.21182266009852216748768473" });
  });
  it("returns an empty list when the field is absent or null, and drops a pair without drivers", () => {
    expect(impactPairs(fc.overlapSummary())).toEqual([]);
    const nulled = fa.overlapSummaryWithAsks();
    nulled.impact_pairs = null;
    expect(impactPairs(nulled)).toEqual([]);
    const hollow = fa.overlapSummaryWithAsks();
    hollow.impact_pairs![1].drivers = [];
    expect(impactPairs(hollow).map(pair => pair.fund_b.scheme_id)).toEqual(["S-SBI", "S-JM"]);
  });
});
