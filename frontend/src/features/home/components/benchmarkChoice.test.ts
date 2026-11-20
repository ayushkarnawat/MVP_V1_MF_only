import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchmarkOptionOut } from "../types";
import {
  BENCHMARK_STORAGE_KEY,
  MAX_BENCHMARKS,
  pickBenchmark,
  pickBenchmarks,
  readStoredBenchmark,
  readStoredBenchmarks,
  writeStoredBenchmark,
  writeStoredBenchmarks,
} from "./benchmarkChoice";

const OPTIONS: BenchmarkOptionOut[] = [
  { index: "nifty_50", label: "Nifty 50", recommended: false },
  { index: "nifty_500", label: "Nifty 500", recommended: true },
  { index: "nifty_midcap_150", label: "Nifty Midcap 150", recommended: false },
];

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("pickBenchmark", () => {
  it("uses the stored choice when it is one of the options", () => {
    expect(pickBenchmark(OPTIONS, "nifty_midcap_150", "nifty_500")).toBe("nifty_midcap_150");
  });

  it("falls back to the recommended pick when nothing is stored or the stored one is not offered", () => {
    expect(pickBenchmark(OPTIONS, null, "nifty_500")).toBe("nifty_500");
    expect(pickBenchmark(OPTIONS, "nifty_next_50", "nifty_500")).toBe("nifty_500");
  });

  it("falls back to the first option when the recommendation is not offered either", () => {
    expect(pickBenchmark(OPTIONS, null, "nifty_100")).toBe("nifty_50");
  });

  it("returns null when there are no options", () => {
    expect(pickBenchmark([], "nifty_50", "nifty_50")).toBeNull();
  });
});

describe("stored benchmark choice", () => {
  it("round-trips through localStorage under the documented key", () => {
    expect(readStoredBenchmark()).toBeNull();
    writeStoredBenchmark("nifty_50");
    expect(localStorage.getItem(BENCHMARK_STORAGE_KEY)).toBe("nifty_50");
    expect(BENCHMARK_STORAGE_KEY).toBe("home.benchmark");
    expect(readStoredBenchmark()).toBe("nifty_50");
  });

  it("never throws when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    expect(readStoredBenchmark()).toBeNull();
    expect(() => writeStoredBenchmark("nifty_50")).not.toThrow();
  });
});

const ALL_OPTIONS: BenchmarkOptionOut[] = [
  { index: "nifty_50", label: "Nifty 50", recommended: false },
  { index: "nifty_500", label: "Nifty 500", recommended: true },
  { index: "nifty_largemidcap_250", label: "Nifty LargeMidcap 250", recommended: false },
  { index: "nifty_midcap_150", label: "Nifty Midcap 150", recommended: false },
  { index: "nifty_smallcap_250", label: "Nifty Smallcap 250", recommended: false },
];

describe("stored benchmark list and pickBenchmarks", () => {
  it("stored choice is a list and an old single stored value still loads", () => {
    expect(readStoredBenchmarks()).toEqual([]);

    writeStoredBenchmarks(["nifty_50", "nifty_500"]);
    expect(localStorage.getItem(BENCHMARK_STORAGE_KEY)).toBe(JSON.stringify(["nifty_50", "nifty_500"]));
    expect(readStoredBenchmarks()).toEqual(["nifty_50", "nifty_500"]);

    // Legacy single plain-string value still loads as a 1-element list
    localStorage.setItem(BENCHMARK_STORAGE_KEY, "nifty_50");
    expect(readStoredBenchmarks()).toEqual(["nifty_50"]);

    // Non-list JSON or malformed JSON gives an empty list
    localStorage.setItem(BENCHMARK_STORAGE_KEY, '{"bad":true}');
    expect(readStoredBenchmarks()).toEqual([]);
    localStorage.setItem(BENCHMARK_STORAGE_KEY, "[broken");
    expect(readStoredBenchmarks()).toEqual([]);
  });

  it("unknown stored index falls back to the recommended one", () => {
    expect(pickBenchmarks(OPTIONS, ["nifty_next_50"], "nifty_500")).toEqual(["nifty_500"]);
    expect(pickBenchmarks(OPTIONS, [], "nifty_500")).toEqual(["nifty_500"]);
    expect(pickBenchmarks(OPTIONS, ["nifty_next_50"], "nifty_100")).toEqual(["nifty_50"]);
    expect(pickBenchmarks([], ["nifty_50"], "nifty_50")).toEqual([]);
  });

  it("more than three stored are cut to three, order kept", () => {
    expect(MAX_BENCHMARKS).toBe(3);
    expect(
      pickBenchmarks(
        ALL_OPTIONS,
        ["nifty_smallcap_250", "nifty_50", "nifty_midcap_150", "nifty_500"],
        "nifty_500",
      ),
    ).toEqual(["nifty_smallcap_250", "nifty_50", "nifty_midcap_150"]);

    expect(
      pickBenchmarks(
        ALL_OPTIONS,
        ["unknown_index", "nifty_500", "nifty_50"],
        "nifty_500",
      ),
    ).toEqual(["nifty_500", "nifty_50"]);
  });

  it("blocked storage returns an empty list and writing does not throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    expect(readStoredBenchmarks()).toEqual([]);
    expect(() => writeStoredBenchmarks(["nifty_50"])).not.toThrow();
  });
});
