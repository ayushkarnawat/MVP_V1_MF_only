import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";
import {
  ALLOCATION_TABS, BETA_DASH_NOTE, COMING_SOON, COPY_FOLIO_FAILED, DEFAULT_PERIOD, PERFORMANCE_PERIODS, RISK_LIFE_WINDOW_NOTE,
  RISK_NO_HISTORY_TEXT, RISK_ROWS, SINCE_LAUNCH_NOTE, SLICE_SHARE_LABEL, TILE_TITLES, ageTagText, allocationNote, benchmarkNote,
  columnHeader, marketCapLabel, riskUnavailableText, scoreNoRingText, scoreSentence, stockCountText, unavailableText,
  DEFAULT_ROLLING_WINDOW, MANAGER_COMING_SOON_NOTE, NO_INSIGHTS_TEXT, ROLLING_WINDOWS, SCATTER_THIN_NOTE, SMART_INSIGHTS_SUBTITLE, TONE_ICONS,
  bucketWord, factTitle, periodReturnsNote, rollingUnavailableText, scatterCaption, tenureText,
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

describe("fundCopy: insights", () => {
  it("the fixed texts", () => {
    expect(NO_INSIGHTS_TEXT).toBe("Not enough data to draw insights yet");
    expect(SMART_INSIGHTS_SUBTITLE).toBe("Key insights, risks and opportunities based on your portfolio.");
    expect(SCATTER_THIN_NOTE).toBe("Few funds in this category, so this comparison is a rough guide.");
    expect(MANAGER_COMING_SOON_NOTE).toBe("Photo, biography and strategy are coming soon.");
  });

  it("each tone has its own icon (M4): trending-up, triangle-alert, circle-alert, info, minus", () => {
    expect(TONE_ICONS).toEqual({ pos: "trending-up", warn: "triangle-alert", neg: "circle-alert", info: "info", neu: "minus" });
  });

  it.each([
    ["long_term_vs_category", "Long-term performance"], ["peer_beat_years", "Long-term performance"], ["overlap", "Overlap in your portfolio"],
    ["manager_tenure", "Fund management"], ["expense_ratio_vs_category", "Fund costs"], ["top5_weight", "Top holdings"],
    ["top5_concentration", "Top holdings"], ["sector_concentration", "Sector mix"], ["market_cap_spread", "Market-cap mix"],
    ["volatility_vs_category", "Volatility"], ["lagging_years", "Recent years"], ["something_new", "Insight"], ["", "Insight"],
  ])("factTitle(%j) is %s", (id, expected) => {
    expect(factTitle(id)).toBe(expected);
  });

  it("the rolling windows are 1, 3 and 5 years and 3 is the default", () => {
    expect(ROLLING_WINDOWS).toEqual([{ value: 1, label: "1 Year" }, { value: 3, label: "3 Years" }, { value: 5, label: "5 Years" }]);
    expect(DEFAULT_ROLLING_WINDOW).toBe(3);
  });

  it("rollingUnavailableText says how much history is missing, and falls back to the shared wording", () => {
    expect(rollingUnavailableText("no_history", 5)).toBe("This fund has less than 5 years of history, so there are no 5-year rolling returns to show.");
    expect(rollingUnavailableText("no_history", 1)).toBe("This fund has less than 1 year of history, so there are no 1-year rolling returns to show.");
    expect(rollingUnavailableText("peers_unavailable", 3)).toBe(unavailableText("peers_unavailable"));
    expect(rollingUnavailableText(null, 3)).toBe("Not available right now.");
  });

  it.each([["week", "weekly"], ["month", "monthly"], ["quarter", "quarterly"], ["year", "yearly"]] as const)("bucketWord(%s) is %s", (bucket, expected) => {
    expect(bucketWord(bucket)).toBe(expected);
  });

  it("periodReturnsNote names the bucket and the period, and explains the year to date bar for yearly buckets", () => {
    expect(periodReturnsNote("week", "1M")).toBe("Bars are weekly for 1M.");
    expect(periodReturnsNote("month", "1Y")).toBe("Bars are monthly for 1Y.");
    expect(periodReturnsNote("quarter", "3Y")).toBe("Bars are quarterly for 3Y.");
    expect(periodReturnsNote("year", "5Y")).toBe("Bars are yearly for 5Y. The current year is shown year to date.");
    expect(periodReturnsNote("year", "All")).toBe("Bars are yearly for the whole history. The current year is shown year to date.");
  });

  it("tenureText prints the years, and nothing when there is no figure", () => {
    expect(tenureText("7.6")).toBe("7.6 years");
    expect(tenureText("0.5")).toBe("0.5 years");
    expect(tenureText("")).toBeNull();
    expect(tenureText(null)).toBeNull();
    expect(tenureText(undefined)).toBeNull();
  });

  it("scatterCaption gives the window and the number of funds compared", () => {
    expect(scatterCaption(5, "23 Oct 2023", "23 Oct 2026")).toBe("Returns and volatility from 23 Oct 2023 to 23 Oct 2026. 5 funds compared, including this one.");
    expect(scatterCaption(1, "23 Oct 2023", "23 Oct 2026")).toBe("Returns and volatility from 23 Oct 2023 to 23 Oct 2026. 1 fund compared, including this one.");
  });
});
