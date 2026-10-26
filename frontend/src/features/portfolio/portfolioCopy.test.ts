import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";
import {
  bucketColor,
  bucketKey,
  bucketPath,
  isEmptyPortfolio,
  liveTotal,
  sliceRows,
  sortBuckets,
  sparkPoints,
  sparkTrend,
  visibleBuckets,
} from "./portfolioCopy";
import type { PortfolioAllocationResponse, PortfolioSummaryResponse, ValuePoint } from "./types";

const LABELS = ["Mutual Funds", "Direct Stocks", "US Stocks", "FDs & Bonds", "Debt", "Gold", "Real Estate", "Others"];
const family = () => fixture<PortfolioAllocationResponse>("allocation_family").buckets;
const points = (...values: string[]): ValuePoint[] => values.map((value, index) => ({ date: `2026-10-${String(index + 1).padStart(2, "0")}`, value }));

describe("bucketKey", () => {
  it("makes a lower-case dashed key and spells out the ampersand", () => {
    expect(LABELS.map(bucketKey)).toEqual([
      "mutual-funds", "direct-stocks", "us-stocks", "fds-and-bonds", "debt", "gold", "real-estate", "others",
    ]);
  });
});

describe("bucketColor", () => {
  it("gives every class a fixed kit colour variable, never a hex", () => {
    expect(LABELS.map(bucketColor)).toEqual([
      "var(--c1)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c2)", "var(--c6)", "var(--c7)", "var(--ui-text-muted)",
    ]);
    expect(bucketColor("Something else")).toBe("var(--ui-text-muted)");
  });
});

describe("bucketPath", () => {
  it("maps the eight classes to the shell paths and an unknown one to null", () => {
    expect(LABELS.map(bucketPath)).toEqual([
      "/portfolio/mutual-funds", "/portfolio/equity/direct-stocks", "/portfolio/equity/us-stocks",
      "/portfolio/equity/fds-bonds", "/portfolio/debt", "/portfolio/gold", "/portfolio/real-estate", "/portfolio/others",
    ]);
    expect(bucketPath("Something else")).toBeNull();
  });
});

describe("liveTotal", () => {
  it("adds the live classes exactly and ignores coming-soon ones", () => {
    expect(liveTotal(family())).toBe("5212.00");
    expect(liveTotal(fixture<PortfolioAllocationResponse>("allocation_empty").buckets)).toBe("0.00");
  });

  it("is 0 when nothing is live", () => {
    expect(liveTotal(family().filter(bucket => bucket.status === "coming_soon"))).toBe("0");
  });

  it("does not drift on amounts a float would get wrong", () => {
    const buckets = family();
    buckets[0] = { ...buckets[0], current_value: "0.10" };
    buckets[1] = { ...buckets[1], status: "live", current_value: "0.20" };
    expect(liveTotal(buckets)).toBe("0.30");
  });
});

describe("visibleBuckets", () => {
  it("keeps all eight, or only the live ones", () => {
    expect(visibleBuckets(family(), "all")).toHaveLength(8);
    expect(visibleBuckets(family(), "live").map(bucket => bucket.label)).toEqual(["Mutual Funds"]);
  });
});

describe("sortBuckets", () => {
  it("sorts ascending by allocation with missing percentages as zero, keeping the backend order among equals", () => {
    expect(sortBuckets(family(), "asc").map(bucket => bucket.label)).toEqual([
      "Direct Stocks", "US Stocks", "FDs & Bonds", "Debt", "Gold", "Real Estate", "Others", "Mutual Funds",
    ]);
  });

  it("sorts descending, again stable", () => {
    expect(sortBuckets(family(), "desc").map(bucket => bucket.label)).toEqual([
      "Mutual Funds", "Direct Stocks", "US Stocks", "FDs & Bonds", "Debt", "Gold", "Real Estate", "Others",
    ]);
  });

  it("compares exactly and does not change its input", () => {
    const buckets = family();
    buckets[0] = { ...buckets[0], percentage: "9.50" };
    buckets[1] = { ...buckets[1], status: "live", percentage: "10.25" };
    buckets[2] = { ...buckets[2], status: "live", percentage: "9.5" };
    const copy = structuredClone(buckets);
    const labels = sortBuckets(buckets, "desc").slice(0, 3).map(bucket => bucket.label);
    expect(labels).toEqual(["Direct Stocks", "Mutual Funds", "US Stocks"]);
    expect(buckets).toEqual(copy);
  });
});

describe("sliceRows", () => {
  it("gives one row per live class with a non-zero percentage, in the backend order", () => {
    expect(sliceRows(family())).toEqual([
      { key: "mutual-funds", label: "Mutual Funds", percentage: "100.00", value: "5212.00", color: "var(--c1)" },
    ]);
  });

  it("gives none for an empty portfolio", () => {
    expect(sliceRows(fixture<PortfolioAllocationResponse>("allocation_empty").buckets)).toEqual([]);
  });
});

describe("isEmptyPortfolio", () => {
  it("is true only when the value and the invested amount are both zero", () => {
    expect(isEmptyPortfolio(fixture<PortfolioSummaryResponse>("summary_empty"))).toBe(true);
    expect(isEmptyPortfolio(fixture<PortfolioSummaryResponse>("summary_family"))).toBe(false);
    expect(isEmptyPortfolio(fixture<PortfolioSummaryResponse>("summary_partial"))).toBe(false);
    const sold = { ...fixture<PortfolioSummaryResponse>("summary_empty"), total_invested: "100.00" };
    expect(isEmptyPortfolio(sold)).toBe(false);
  });
});

describe("sparkPoints", () => {
  it("scales the series into a 72 by 26 box with two units of padding, rounded to one decimal", () => {
    expect(sparkPoints(points("100", "150", "200"))).toBe("0,24 36,13 72,2");
    expect(sparkPoints(points("0", "10", "20", "30"))).toBe("0,24 24,16.7 48,9.3 72,2");
  });

  it("draws a flat series in the middle", () => {
    expect(sparkPoints(points("100.00", "100.00", "100.00"))).toBe("0,13 36,13 72,13");
  });

  it("is empty for fewer than two points", () => {
    expect(sparkPoints([])).toBe("");
    expect(sparkPoints(points("100"))).toBe("");
  });
});

describe("sparkTrend", () => {
  it("compares the last point with the first, exactly", () => {
    expect(sparkTrend(points("100.00", "90.00", "100.10"))).toBe("up");
    expect(sparkTrend(points("100.00", "120.00", "99.99"))).toBe("down");
    expect(sparkTrend(points("100.00", "130.00", "100.0"))).toBe("flat");
    expect(sparkTrend([])).toBe("flat");
  });
});
