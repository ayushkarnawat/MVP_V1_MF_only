import { describe, expect, it } from "vitest";
import * as fb from "../fixtures/mfB";
import {
  barPercent,
  buildEntities,
  DEFAULT_INDICES,
  fundDifference,
  fundsForWindow,
  fundWindow,
  INDEX_DEFS,
  layoutRaceTrack,
  miniTrack,
  signedXirr,
  windowUnavailableText,
  windowView,
  WINDOW_DEFS,
} from "./benchmarkLogic";

describe("benchmark constants", () => {
  it("lists the eight indices in the fixed order with their chip labels, and Nifty 500 as the default", () => {
    expect(INDEX_DEFS.map(def => [def.key, def.label])).toEqual([
      ["nifty_50", "Nifty 50"], ["nifty_500", "Nifty 500"], ["nifty_largemidcap_250", "LargeMidcap 250"], ["nifty_midcap_150", "Midcap 150"],
      ["nifty_next_50", "Nifty Next 50"], ["nifty_smallcap_250", "Smallcap 250"], ["nifty_100", "Nifty 100"], ["nifty_200", "Nifty 200"],
    ]);
    expect(DEFAULT_INDICES).toEqual(["nifty_500"]);
  });
  it("lists the four windows with Since Inception last", () => {
    expect(WINDOW_DEFS.map(def => [def.id, def.label])).toEqual([["1Y", "1Y"], ["3Y", "3Y"], ["5Y", "5Y"], ["SI", "Since Inception"]]);
  });
});

describe("signedXirr", () => {
  it("shows a decimal fraction as a signed percentage with one place and never multiplies a float", () => {
    expect(signedXirr("0.1612")).toBe("+16.1%");
    expect(signedXirr("0.1405")).toBe("+14.1%");
    expect(signedXirr("-0.0270")).toBe("-2.7%");
    expect(signedXirr("0.0000")).toBe("0.0%");
  });
  it("shows a dash for a missing value, never 0%", () => {
    expect(signedXirr(null)).toBe("—");
    expect(signedXirr(undefined)).toBe("—");
  });
});

describe("windowView", () => {
  it("reads one window of the payload: the real start date, the portfolio rate and a map of index rates", () => {
    const view = windowView(fb.benchmarkSummary(), "1Y");
    expect(view).toMatchObject({ available: true, reason: "ok", startDate: "2025-09-30", portfolio: "0.1830" });
    expect(view.indices.nifty_500).toBe("0.1405");
    expect(view.indices.nifty_smallcap_250).toBe("0.2105");
    expect(Object.keys(view.indices)).toHaveLength(8);
  });
  it("keeps a null index rate as null", () => {
    expect(windowView(fb.benchmarkSummary(), "SI").indices.nifty_200).toBeNull();
  });
  it("marks a window with too little history unavailable, with no numbers", () => {
    expect(windowView(fb.benchmarkSummary(), "5Y")).toEqual({ available: false, reason: "not_enough_history", startDate: null, portfolio: null, indices: {} });
  });
  it("tells an opening balance inside the window apart from too little history", () => {
    const summary = fb.benchmarkSummary();
    const row = summary.windows!.find(item => item.window === "3Y")!;
    row.available = false;
    row.start_date = null;
    row.unavailable_reason = "opening_balance_in_window";
    expect(windowView(summary, "3Y").reason).toBe("opening_balance_in_window");
  });
  it("falls back to the old top-level numbers for Since Inception when the payload has no windows", () => {
    const view = windowView(fb.benchmarkSummaryWithoutWindows(), "SI");
    expect(view).toMatchObject({ available: true, reason: "ok", startDate: null, portfolio: "0.1612" });
    expect(view.indices.nifty_50).toBe("0.1043");
    expect(view.indices.nifty_500).toBe("0.1102");
    expect(view.indices.nifty_next_50).toBeUndefined();
  });
  it("calls every other window of such a payload 'recomputing'", () => {
    for (const window of ["1Y", "3Y", "5Y"] as const) {
      expect(windowView(fb.benchmarkSummaryWithoutWindows(), window)).toMatchObject({ available: false, reason: "recomputing" });
    }
  });
  it("copes with an empty object and with no payload at all", () => {
    expect(windowView({} as never, "SI")).toMatchObject({ available: true, portfolio: null, indices: {} });
    expect(windowView(null, "SI")).toMatchObject({ available: false, reason: "not_enough_history" });
  });
});

describe("windowUnavailableText", () => {
  it("gives one sentence per reason", () => {
    expect(windowUnavailableText("not_enough_history")).toBe("Not enough history for this window yet.");
    expect(windowUnavailableText("recomputing")).toBe("This window is still being recalculated and will appear after the next analytics refresh.");
    expect(windowUnavailableText("opening_balance_in_window")).toBe(
      "Unavailable: an opening balance from your statement falls inside this window, so money added and starting value cannot be told apart.",
    );
  });
});

describe("buildEntities", () => {
  it("puts the portfolio first, then the selected indices in the fixed order whatever order they were picked in", () => {
    const entities = buildEntities(fb.benchmarkSummary(), "SI", ["nifty_smallcap_250", "nifty_500"]);
    expect(entities.map(entity => entity.key)).toEqual(["portfolio", "nifty_500", "nifty_smallcap_250"]);
    expect(entities.map(entity => entity.label)).toEqual(["Your Portfolio", "Nifty 500", "Smallcap 250"]);
    expect(entities.map(entity => entity.xirr)).toEqual(["0.1612", "0.1102", "0.1620"]);
  });
  it("re-slices to the chosen window", () => {
    expect(buildEntities(fb.benchmarkSummary(), "1Y", ["nifty_500"]).map(entity => entity.xirr)).toEqual(["0.1830", "0.1405"]);
  });
  it("gives an index with no rate a null, not zero", () => {
    expect(buildEntities(fb.benchmarkSummary(), "SI", ["nifty_200"])[1]).toEqual({ key: "nifty_200", label: "Nifty 200", xirr: null });
  });
});

describe("layoutRaceTrack", () => {
  const entity = (key: string, xirr: string | null) => ({ key: key as never, xirr });
  it("spreads the values over 5 to 95 percent, alternates the label side and puts the crown on the highest", () => {
    const markers = layoutRaceTrack([entity("portfolio", "0.2000"), entity("nifty_50", "0.1000"), entity("nifty_500", "0.1500")]);
    expect(markers.map(marker => [marker.key, marker.x, marker.offset, marker.above, marker.crown])).toEqual([
      ["nifty_50", 5, 0, true, false],
      ["nifty_500", 50, 0, false, false],
      ["portfolio", 95, 0, true, true],
    ]);
  });
  it("nudges two close values apart across the axis but never moves either one along it", () => {
    const markers = layoutRaceTrack([entity("nifty_50", "0.1000"), entity("nifty_500", "0.1005"), entity("portfolio", "0.2000")]);
    expect(markers.map(marker => marker.x)).toEqual([5, 5.45, 95]);
    expect(markers.map(marker => marker.offset)).toEqual([0, 15, 0]);
  });
  it("alternates the nudge up and down along a crowd, bigger when closer", () => {
    const markers = layoutRaceTrack([entity("a", "0.1000"), entity("b", "0.1010"), entity("c", "0.1020"), entity("d", "0.2000")]);
    expect(markers.map(marker => marker.x)).toEqual([5, 5.9, 6.8, 95]);
    expect(markers.map(marker => marker.offset)).toEqual([0, 15, -15, 0]);
  });
  it("nudges at a gap just under 8 percent and not at exactly 8", () => {
    const exact = layoutRaceTrack([entity("a", "0.0000"), entity("b", "0.0889"), entity("c", "1.0000")]);
    expect(exact.map(marker => marker.x)).toEqual([5, 13, 95]);
    expect(exact[1].offset).toBe(0);
    const under = layoutRaceTrack([entity("a", "0.0000"), entity("b", "0.0888"), entity("c", "1.0000")]);
    expect(under.map(marker => marker.x)).toEqual([5, 12.99, 95]);
    expect(under[1].offset).toBe(6);
  });
  it("leaves out an entity with no value", () => {
    const markers = layoutRaceTrack([entity("portfolio", "0.1612"), entity("nifty_200", null), entity("nifty_500", "0.1102")]);
    expect(markers.map(marker => marker.key)).toEqual(["nifty_500", "portfolio"]);
    expect(layoutRaceTrack([entity("a", null)])).toEqual([]);
    expect(layoutRaceTrack([])).toEqual([]);
  });
  it("puts a single value, or equal values, in the middle, and gives the crown to the first on a tie", () => {
    expect(layoutRaceTrack([entity("portfolio", "0.1000")])).toEqual([{ key: "portfolio", x: 50, offset: 0, above: true, crown: true }]);
    const tied = layoutRaceTrack([entity("nifty_50", "0.1000"), entity("nifty_500", "0.1000")]);
    expect(tied.map(marker => marker.x)).toEqual([50, 50]);
    expect(tied.filter(marker => marker.crown).map(marker => marker.key)).toEqual(["nifty_50"]);
  });
  it("handles negative rates", () => {
    const markers = layoutRaceTrack([entity("portfolio", "0.0500"), entity("nifty_50", "-0.0500")]);
    expect(markers.map(marker => [marker.key, marker.x, marker.crown])).toEqual([["nifty_50", 5, false], ["portfolio", 95, true]]);
  });
});

describe("barPercent", () => {
  const entities = [{ xirr: "0.1612" }, { xirr: "0.0806" }, { xirr: null }];
  it("scales each rate against the largest one", () => {
    expect(barPercent("0.1612", entities)).toBe("100");
    expect(barPercent("0.0806", entities)).toBe("50");
  });
  it("gives a missing rate, or an all-zero set, no bar", () => {
    expect(barPercent(null, entities)).toBe("0");
    expect(barPercent("0.0000", [{ xirr: "0.0000" }])).toBe("0");
  });
});

describe("per-fund windows", () => {
  const kotak = () => fb.fundBenchmark().funds[0];
  it("reads a window of a fund and its benchmark", () => {
    expect(fundWindow(kotak(), "1Y")).toEqual({ fund: "0.1010", benchmark: "0.1405" });
    expect(fundWindow(kotak(), "5Y")).toEqual({ fund: null, benchmark: null });
  });
  it("uses the top-level numbers for Since Inception when the fund has no windows, and nothing for the others", () => {
    const old = fb.fundBenchmarkWithoutWindows().funds[0];
    expect(fundWindow(old, "SI")).toEqual({ fund: "0.1420", benchmark: "0.1690" });
    expect(fundWindow(old, "1Y")).toEqual({ fund: null, benchmark: null });
  });
  it("subtracts exactly, in percentage points, and gives null when either side is missing", () => {
    expect(fundDifference({ fund: "0.1420", benchmark: "0.1690" })).toBe("-2.70");
    expect(fundDifference({ fund: "0.1860", benchmark: "0.1280" })).toBe("5.80");
    expect(fundDifference({ fund: null, benchmark: "0.1" })).toBeNull();
    expect(fundDifference({ fund: "0.1", benchmark: null })).toBeNull();
  });
  it("keeps only the funds that have an XIRR in the window, in the given order", () => {
    const funds = fb.fundBenchmark().funds;
    expect(fundsForWindow(funds, "SI").map(item => item.fund.scheme_id)).toEqual(["S-KOTAK", "S-JM", "S-HDFC", "S-SBI", "S-PPFAS", "S-UTI"]);
    expect(fundsForWindow(funds, "3Y").map(item => item.fund.scheme_id)).toEqual(["S-KOTAK", "S-JM", "S-HDFC", "S-SBI", "S-UTI"]);
    expect(fundsForWindow(funds, "5Y")).toEqual([]);
  });
  it("places the fund and its benchmark on a mini track from their two values", () => {
    expect(miniTrack({ fund: "0.1420", benchmark: "0.1690" })).toEqual({ fund: 5, benchmark: 95 });
    expect(miniTrack({ fund: "0.1860", benchmark: "0.1280" })).toEqual({ fund: 95, benchmark: 5 });
    expect(miniTrack({ fund: "0.1", benchmark: "0.1" })).toEqual({ fund: 50, benchmark: 50 });
    expect(miniTrack({ fund: "0.1", benchmark: null })).toBeNull();
  });
});
