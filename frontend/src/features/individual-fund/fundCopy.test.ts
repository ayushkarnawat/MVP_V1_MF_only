import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";
import {
  COMING_SOON, DEFAULT_PERIOD, PERFORMANCE_PERIODS, SINCE_LAUNCH_NOTE, TILE_TITLES, benchmarkNote, columnHeader, scoreNoRingText,
  scoreSentence, unavailableText,
} from "./fundCopy";
import type { ScoreResponse } from "./types";

describe("fundCopy", () => {
  it("the period chips are 1M to All in order and the default is 1Y", () => {
    expect([...PERFORMANCE_PERIODS]).toEqual(["1M", "3M", "6M", "1Y", "3Y", "5Y", "All"]);
    expect(DEFAULT_PERIOD).toBe("1Y");
  });

  it.each([
    ["no_history", "No price history yet for this fund."],
    ["no_benchmark", "No benchmark applies to this fund."],
    ["no_disclosure", "Holdings not available yet for this fund house."],
    ["no_manager_data", "Manager details not available for this fund house."],
    ["peers_unavailable", "Category comparison is not available for this fund yet."],
    ["not_held", "You don't hold this fund in this view."],
    ["something_new", "Not available right now."],
    [null, "Not available right now."],
    [undefined, "Not available right now."],
  ])("unavailableText(%s)", (reason, expected) => {
    expect(unavailableText(reason)).toBe(expected);
  });

  it("benchmarkNote explains a missing benchmark line, and says nothing otherwise", () => {
    expect(benchmarkNote("no_benchmark")).toBe("No benchmark applies to this fund type, so only the fund line is shown.");
    expect(benchmarkNote("no_history")).toBe("Benchmark history is not available yet, so only the fund line is shown.");
    expect(benchmarkNote(null)).toBeNull();
    expect(benchmarkNote("other")).toBeNull();
  });

  it("the since-launch note and the Coming soon word are fixed", () => {
    expect(SINCE_LAUNCH_NOTE).toBe("This fund is younger than the selected period, so the chart starts at its launch date.");
    expect(COMING_SOON).toBe("Coming soon");
  });

  it.each([
    ["1M", "1M"], ["5Y", "5Y"], ["since_inception", "Since inception"], ["since_first_investment", "Since first investment"],
  ])("columnHeader(%s) is %s", (column, expected) => {
    expect(columnHeader(column)).toBe(expected);
  });

  it("each score band has its own sentence", () => {
    const words = ["Excellent", "Strong", "Good", "Average", "Weak", "Poor"];
    const sentences = words.map(scoreSentence);
    expect(sentences.every(text => text.length > 10)).toBe(true);
    expect(new Set(sentences).size).toBe(6);
    expect(scoreSentence("Strong")).toBe("Consistent performance, reasonable costs and strong portfolio quality.");
    expect(scoreSentence("Unknown")).toBe("");
  });

  it("scoreNoRingText explains why a score has no ring, in a fixed order, and is null for a normal score", () => {
    const base = fixture<ScoreResponse>("score_stored");
    expect(scoreNoRingText(base)).toBeNull();
    expect(scoreNoRingText({ ...base, insufficient_history: true })).toBe("Not enough history to score this fund yet.");
    expect(scoreNoRingText({ ...base, category_unavailable: true })).toBe("This fund has no category to compare it with.");
    expect(scoreNoRingText({ ...base, thin_category: true })).toBe("Too few funds in this category for a reliable score.");
    expect(scoreNoRingText({ ...base, final_score: null })).toBe("No score available yet.");
    expect(scoreNoRingText({ ...base, insufficient_history: true, thin_category: true })).toBe("Not enough history to score this fund yet.");
  });

  it("tile titles", () => {
    expect(TILE_TITLES).toEqual({ value: "Current value", invested: "Invested", gain: "Total gain", xirr: "XIRR", ter: "Expense ratio" });
  });
});
