import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchmarkOptionOut } from "../types";
import { BENCHMARK_STORAGE_KEY, pickBenchmark, readStoredBenchmark, writeStoredBenchmark } from "./benchmarkChoice";

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
