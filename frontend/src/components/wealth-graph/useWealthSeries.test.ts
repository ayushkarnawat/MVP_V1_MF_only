import { describe, expect, it } from "vitest";
import type { WealthScope } from "./types";
import { wealthSeriesPath } from "./useWealthSeries";

const AGGREGATE: WealthScope = { viewMode: "aggregate", memberId: null };
const MEMBER: WealthScope = { viewMode: "member", memberId: "m-1" };

describe("wealthSeriesPath", () => {
  it("benchmarks are sent as repeated parameters in order", () => {
    expect(
      wealthSeriesPath(AGGREGATE, {
        period: "1M",
        benchmarks: ["nifty_500", "nifty_50", "nifty_largemidcap_250"],
      }),
    ).toBe(
      "/household/aggregate/home/wealth-series?period=1M&benchmarks=nifty_500&benchmarks=nifty_50&benchmarks=nifty_largemidcap_250",
    );

    expect(
      wealthSeriesPath(MEMBER, {
        period: "1Y",
        benchmarks: ["nifty_smallcap_250", "nifty_midcap_150"],
      }),
    ).toBe(
      "/household-members/m-1/home/wealth-series?period=1Y&benchmarks=nifty_smallcap_250&benchmarks=nifty_midcap_150",
    );
  });

  it("no benchmarks parameter when the list is empty or absent", () => {
    expect(wealthSeriesPath(AGGREGATE, { period: "1M", benchmarks: [] })).toBe(
      "/household/aggregate/home/wealth-series?period=1M",
    );

    expect(wealthSeriesPath(AGGREGATE, { period: "1W" })).toBe(
      "/household/aggregate/home/wealth-series?period=1W",
    );
  });

  it("the old benchmark parameter is unchanged", () => {
    expect(
      wealthSeriesPath(MEMBER, {
        period: "custom",
        from: "2026-01-01",
        to: "2026-06-30",
        benchmark: "nifty_50",
      }),
    ).toBe(
      "/household-members/m-1/home/wealth-series?period=custom&from=2026-01-01&to=2026-06-30&benchmark=nifty_50",
    );
  });
});
