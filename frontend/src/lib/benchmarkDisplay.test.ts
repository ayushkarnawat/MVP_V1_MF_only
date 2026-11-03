import { describe, expect, it } from "vitest";
import {
  BENCHMARK_SOURCE_LABELS,
  BENCHMARK_PRINTED_LABEL,
  BENCHMARK_SOURCE_EXPLANATIONS,
  BENCHMARK_FLOW_METHOD,
  BENCHMARK_PERIOD_METHOD,
  benchmarkChoiceDetails,
  benchmarkDisplayName,
  benchmarkKeyName,
  benchmarkSourceExplanation,
} from "./benchmarkDisplay";

describe("benchmark display words", () => {
  it("uses the owner's four source labels and scans every new fixed string for plain words", () => {
    expect(Object.values(BENCHMARK_SOURCE_LABELS)).toEqual([
      "From the fund's factsheet",
      "Closest index we hold",
      "Chosen by the fund's category",
      "No benchmark",
    ]);
    expect([
      ...Object.values(BENCHMARK_SOURCE_LABELS),
      BENCHMARK_PRINTED_LABEL,
      ...Object.values(BENCHMARK_SOURCE_EXPLANATIONS),
      BENCHMARK_FLOW_METHOD,
      BENCHMARK_PERIOD_METHOD,
    ].join(" ")).not.toMatch(/\b(?:TRI|proxy|fallback)\b/i);
  });

  it("spells out the return label in a declared name", () => {
    expect(benchmarkDisplayName("NIFTY 500 TRI")).toBe("NIFTY 500 Total Return");
  });

  it("formats arbitrage fund index key as Nifty 50 Arbitrage", () => {
    expect(benchmarkKeyName("nifty_50_arbitrage")).toBe("Nifty 50 Arbitrage");
  });

  it("each source value renders its one-sentence explanation", () => {
    expect(benchmarkSourceExplanation("factsheet")).toBe(
      "This is the index named in the fund's own factsheet."
    );
    expect(benchmarkSourceExplanation("closest")).toBe(
      "The fund's factsheet names an index we do not hold, so we show the closest index we do hold. Figures can differ a little from the fund's own comparison."
    );
    expect(benchmarkSourceExplanation("category")).toBe(
      "The factsheet does not name an index we can use, so we show the standard index for funds in this category."
    );
    expect(benchmarkSourceExplanation("printed")).toBe(
      "We cannot build this index ourselves. These returns are printed in the fund house's factsheet."
    );
    expect(benchmarkSourceExplanation("none")).toBe(
      "We could not find a fair benchmark for this fund."
    );
  });

  it("benchmarkChoiceDetails produces the full line under the benchmark name for every source case", () => {
    expect(benchmarkChoiceDetails("factsheet").fullLine).toBe(
      "How this benchmark was chosen: From the fund's factsheet. This is the index named in the fund's own factsheet."
    );
    expect(benchmarkChoiceDetails("closest").fullLine).toBe(
      "How this benchmark was chosen: Closest index we hold. The fund's factsheet names an index we do not hold, so we show the closest index we do hold. Figures can differ a little from the fund's own comparison."
    );
    expect(benchmarkChoiceDetails("category").fullLine).toBe(
      "How this benchmark was chosen: Chosen by the fund's category. The factsheet does not name an index we can use, so we show the standard index for funds in this category."
    );
    expect(benchmarkChoiceDetails("none", true).fullLine).toBe(
      "How this benchmark was chosen: As printed in the fund house's factsheet. We cannot build this index ourselves. These returns are printed in the fund house's factsheet."
    );
    expect(benchmarkChoiceDetails("none", false).fullLine).toBe(
      "How this benchmark was chosen: No benchmark. We could not find a fair benchmark for this fund."
    );
    // Fallback for null or unknown source
    expect(benchmarkChoiceDetails(null).fullLine).toBe(
      "How this benchmark was chosen: No benchmark. We could not find a fair benchmark for this fund."
    );
  });
});
