import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";
import {
  ALLOCATION_TABS, BETA_DASH_NOTE, COMING_SOON, COPY_FOLIO_FAILED, DEFAULT_PERIOD, PERFORMANCE_PERIODS, RISK_LIFE_WINDOW_NOTE,
  RISK_NO_HISTORY_TEXT, RISK_ROWS, SINCE_LAUNCH_NOTE, SLICE_SHARE_LABEL, TILE_TITLES, ageTagText, allocationNote, benchmarkNote,
  columnHeader, marketCapLabel, riskUnavailableText, scoreNoRingText, scoreSentence, stockCountText, unavailableText,
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

describe("fundCopy: Risk Metrics", () => {
  it("lists the four rows in order with their labels and one-line definitions", () => {
    expect(RISK_ROWS.map(row => row.key)).toEqual(["volatility", "max_drawdown", "sharpe", "beta"]);
    expect(RISK_ROWS.map(row => row.label)).toEqual(["Volatility", "Maximum drawdown", "Sharpe ratio", "Beta (vs benchmark)"]);
    expect(RISK_ROWS.map(row => row.definition)).toEqual([
      "How much the fund's daily returns vary, annualised.",
      "The largest fall from a peak to a low in the window.",
      "Return above the risk-free rate for each unit of volatility.",
      "How far the fund moves with its benchmark: 1.0 moves with it.",
    ]);
  });

  it("has the fixed notes", () => {
    expect(RISK_NO_HISTORY_TEXT).toBe("Not enough history to show risk figures yet. About a year of prices is needed.");
    expect(RISK_LIFE_WINDOW_NOTE).toBe("This fund is younger than 3 years, so its whole history is used.");
    expect(BETA_DASH_NOTE).toBe("Not enough overlapping history with the benchmark.");
    expect(COPY_FOLIO_FAILED).toBe("Couldn't copy the folio number.");
  });

  it("riskUnavailableText words no_history for risk and defers to the shared wording otherwise", () => {
    expect(riskUnavailableText("no_history")).toBe(RISK_NO_HISTORY_TEXT);
    expect(riskUnavailableText("no_disclosure")).toBe(unavailableText("no_disclosure"));
    expect(riskUnavailableText(null)).toBe("Not available right now.");
  });
});

describe("fundCopy: holdings and allocation", () => {
  it("ageTagText explains only the older_than_60_days tag", () => {
    expect(ageTagText("older_than_60_days")).toBe("This disclosure is more than 60 days older than the latest price, so the holdings may have changed.");
    expect(ageTagText(null)).toBeNull();
    expect(ageTagText(undefined)).toBeNull();
    expect(ageTagText("something_else")).toBeNull();
  });

  it.each([[38, "38 stocks"], [1, "1 stock"], [0, "0 stocks"]])("stockCountText(%s) is %s", (count, expected) => {
    expect(stockCountText(count)).toBe(expected);
  });

  it("the allocation tabs are Market Cap, Sector and Asset Type", () => {
    expect(ALLOCATION_TABS).toEqual([
      { value: "market_cap", label: "Market Cap" }, { value: "sector", label: "Sector" }, { value: "asset_type", label: "Asset Type" },
    ]);
  });

  it.each([["Large", "Large Cap"], ["Mid", "Mid Cap"], ["Small Cap", "Small Cap"], ["small cap", "small cap"]])("marketCapLabel(%s) is %s", (label, expected) => {
    expect(marketCapLabel(label)).toBe(expected);
  });

  it("allocationNote words each tab, and the market-cap note names the unclassified share only when there is one", () => {
    expect(allocationNote("market_cap", "30 Sep 2026", "3.6%")).toBe(
      "Share of the classified equity part. Not shown: 3.6% of the fund (cash, debt, unlisted). Disclosure as of 30 Sep 2026."
    );
    expect(allocationNote("market_cap", "30 Sep 2026", null)).toBe("Share of the classified equity part. Disclosure as of 30 Sep 2026.");
    expect(allocationNote("sector", "30 Sep 2026", "3.6%")).toBe("Sector from the fund's disclosure, as of 30 Sep 2026.");
    expect(allocationNote("asset_type", "30 Sep 2026", null)).toBe("Share of the fund's portfolio, as of 30 Sep 2026.");
  });

  it("the slice dialog names the share by tab", () => {
    expect(SLICE_SHARE_LABEL).toEqual({ market_cap: "Share of classified equity", sector: "Share of the fund", asset_type: "Share of the fund" });
  });
});
