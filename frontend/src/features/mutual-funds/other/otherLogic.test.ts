import { describe, expect, it } from "vitest";
import * as fc from "../fixtures/mfCother";
import type { FundScoreRow, FundTerRow, ValuationSummary } from "../types";
import {
  assessFactor, barWidths, categoryOutperform, componentText, costLine, deltaSentence, displayTier, GROUP_TITLES, isScored, noTerNote,
  normalizeFraction, ordinal, percentileTier, percentileWidth, periodsFor, pinPercent, pinPositions, planState, pointsText,
  portfolioVerdict, ratioRows, ratioState, ratioText, rankLine, RANK_WEIGHTS, rankWeightsSentence, rawPercent, savingsLine,
  shortCategory, splitNeighbors, terBadge, terLadderRows, terScaleMax, terText, terTotals, tierCaption, TIER_STYLE, tierTone,
  unscoredReason, verdictWord, whatThisMeans, whySentence, wholePercentile,
} from "./otherLogic";

const score = (id: string): FundScoreRow => fc.scoreSummary().funds.find(fund => fund.scheme_id === id)!;
const rank = (id: string) => fc.fundRanking().funds.find(fund => fund.scheme_id === id)!;
const valuation = (): ValuationSummary => fc.valuationSummary();
const fundRow = (over: Partial<FundTerRow>): FundTerRow => ({ scheme_id: "X", scheme_name: "X Fund", plan_type: "direct", ter: "0.50", value: "100.00", cost_1y: null, cost_3y: null, cost_5y: null, ...over });

describe("the four group titles", () => {
  it("are exactly the signed-off names", () => {
    expect(GROUP_TITLES).toEqual({ cost: "Cost & Valuation", scorer: "Fund Quality Scorer", category: "SEBI Category Ranking & Peer Comparison", ranking: "Fund Ranking" });
  });
});

describe("number text", () => {
  it("expands exponent notation by moving digits, never by converting", () => {
    expect(normalizeFraction("1.5E-2")).toBe("0.015");
    expect(normalizeFraction("-1.5E-2")).toBe("-0.015");
    expect(normalizeFraction("2E1")).toBe("20");
    expect(normalizeFraction("0.1510")).toBe("0.1510");
  });
  it("shows a decimal-fraction return as a percentage with one decimal, signed on request", () => {
    expect(rawPercent("0.1510")).toBe("15.1%");
    expect(rawPercent("0.1510", { signed: true })).toBe("+15.1%");
    expect(rawPercent("-0.0270", { signed: true })).toBe("-2.7%");
    expect(rawPercent("0.0000", { signed: true })).toBe("0.0%");
    expect(rawPercent("0.0284", { digits: 2 })).toBe("2.84%");
    expect(rawPercent("1.5E-2")).toBe("1.5%");
    expect(rawPercent(null)).toBe("—");
    expect(rawPercent(undefined)).toBe("—");
  });
  it("shows a TER (already a percent) with two decimals and a ratio with one decimal and an x", () => {
    expect(terText("0.58")).toBe("0.58%");
    expect(terText("1.4")).toBe("1.40%");
    expect(terText(null)).toBe("—");
    expect(ratioText("23.40")).toBe("23.4x");
    expect(ratioText("4.10")).toBe("4.1x");
    expect(ratioText("4.15")).toBe("4.2x");
    expect(ratioText(null)).toBe("—");
  });
  it("gives the gap between two returns in percentage points, exactly", () => {
    expect(pointsText("0.1840", "0.1520")).toBe("+3.2pp");
    expect(pointsText("0.1510", "0.1300")).toBe("+2.1pp");
    expect(pointsText("0.1080", "0.1260")).toBe("-1.8pp");
    expect(pointsText("0.1000", "0.1000")).toBe("0.0pp");
    expect(pointsText("0.1000", "1.5E-1")).toBe("-5.0pp");
    expect(pointsText(null, "0.1")).toBe("—");
    expect(pointsText("0.1", undefined)).toBe("—");
  });
  it("writes ordinals, including the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th", "112th"]);
  });
  it("rounds a percentile to a whole number half up, by its digits", () => {
    expect(["59.3", "59.5", "59.49", "0", "100", "99.5", "7"].map(wholePercentile)).toEqual([59, 60, 59, 0, 100, 100, 7]);
  });
});

describe("percentile tiers", () => {
  it("switch at exactly 33 and 66", () => {
    expect(["100", "66", "65.99", "50", "33", "32.99", "0"].map(percentileTier)).toEqual(["high", "high", "mid", "mid", "mid", "low", "low"]);
  });
  it("use the palette tokens: green, amber and red", () => {
    expect(TIER_STYLE).toEqual({
      high: { fill: "var(--pos)", bg: "var(--pos-bg)", text: "var(--pos-text)" },
      mid: { fill: "var(--warn-text)", bg: "var(--warn-bg)", text: "var(--warn-text)" },
      low: { fill: "var(--neg)", bg: "var(--neg-bg)", text: "var(--neg-text)" },
    });
  });
  it("sizes a percentile bar from 2 to 100", () => {
    expect(["0", "1.5", "2", "59.3", "100", "120"].map(percentileWidth)).toEqual(["2", "2", "2", "59.3", "100", "100"]);
  });
});

describe("TER logic", () => {
  it("tells a plan with a TER from one with none and one that is not held", () => {
    const ter = fc.terDirectRegular();
    expect(planState(ter.direct)).toBe("bar");
    expect(planState(ter.regular)).toBe("no-ter");
    expect(planState({ ...ter.regular, total_value: "0" })).toBe("none-held");
    expect(planState({ ...ter.regular, total_value: "0.00" })).toBe("none-held");
    expect(planState(undefined)).toBe("none-held");
  });
  it("orders the ladder cheapest first and the funds without a TER last, with bar widths against the highest TER", () => {
    const rows = terLadderRows(fc.terSummary());
    expect(rows.map(row => row.fund.scheme_id)).toEqual(["S-KOTAK", "S-JM", "S-HDFC", "S-SBI"]);
    expect(rows.map(row => row.width)).toEqual(["81.69", "90.14", "100", "0"]);
    expect(rows.map(row => row.hasTer)).toEqual([true, true, true, false]);
  });
  it("calls a TER at or below the weighted TER below and above it above, and a missing one none", () => {
    expect(terLadderRows(fc.terSummary()).map(row => row.tone)).toEqual(["below", "below", "above", "none"]);
    const noWeighted = { ...fc.terSummary(), weighted_ter: null };
    expect(terLadderRows(noWeighted).map(row => row.tone)).toEqual(["below", "below", "below", "none"]);
  });
  it("breaks ties by name, and orders unpriced funds by value then name", () => {
    const ter = { ...fc.terSummary(), funds: [
      fundRow({ scheme_id: "B", scheme_name: "Bravo", ter: "0.50" }), fundRow({ scheme_id: "A", scheme_name: "Alpha", ter: "0.50" }),
      fundRow({ scheme_id: "U1", scheme_name: "Zulu", ter: null, value: "50.00" }), fundRow({ scheme_id: "U2", scheme_name: "Yankee", ter: null, value: "500.00" }),
      fundRow({ scheme_id: "U3", scheme_name: "Xray", ter: null, value: "50.00" }),
    ] };
    expect(terLadderRows(ter).map(row => row.fund.scheme_id)).toEqual(["A", "B", "U2", "U3", "U1"]);
  });
  it("has an empty ladder without funds and does not divide by zero when every TER is 0", () => {
    expect(terLadderRows({ ...fc.terSummary(), funds: undefined })).toEqual([]);
    expect(terLadderRows({ ...fc.terSummary(), funds: [fundRow({ ter: "0" })] })[0].width).toBe("0");
  });
  it("labels the plan, and adds the rupee saving only for a Direct fund that has a positive one", () => {
    const funds = fc.terSummaryWithSavings().funds!;
    expect(terBadge(funds[0])).toBe("Direct · saves ₹12,782/yr");
    expect(terBadge(fc.terSummary().funds![0])).toBe("Direct");
    expect(terBadge(funds[3])).toBe("Regular");
    expect(terBadge(fundRow({ plan_type: null }))).toBeNull();
    expect(terBadge(fundRow({ plan_type: "unclassified" }))).toBeNull();
    expect(terBadge(fundRow({ plan_type: "regular", annual_ter_saving: "500.00" }))).toBe("Regular");
    expect(terBadge(fundRow({ annual_ter_saving: "0.00" }))).toBe("Direct");
    expect(terBadge(fundRow({ annual_ter_saving: null }))).toBe("Direct");
  });
  it("builds the savings line only from the backend's annual_ter_saving, summed exactly over the Direct funds", () => {
    expect(savingsLine(fc.terSummary().funds)).toBeNull();
    expect(savingsLine(undefined)).toBeNull();
    expect(savingsLine(fc.terSummaryWithSavings().funds)).toBe(
      "Your 3 Direct-plan holdings are already saving an estimated ₹29,595/yr combined versus the Regular-plan version of the same schemes — see each fund's own saving below.");
    expect(savingsLine([fundRow({ annual_ter_saving: "12782.00" })])).toBe(
      "Your 1 Direct-plan holding is already saving an estimated ₹12,782/yr combined versus the Regular-plan version of the same scheme — see each fund's own saving below.");
    expect(savingsLine([fundRow({ plan_type: "regular", annual_ter_saving: "900.00" })])).toBeNull();
    expect(savingsLine([fundRow({ annual_ter_saving: "0.00" })])).toBeNull();
  });
  it("totals the funds that have a TER and takes the projected costs from the summary", () => {
    expect(terTotals(fc.terSummary())).toEqual({ count: 3, value: "3830000.00", cost1y: "24505.00", cost3y: "73515.00", cost5y: "122525.00" });
    expect(terTotals({ ...fc.terSummary(), funds: [fundRow({ ter: null })] })).toBeNull();
    expect(terTotals({ ...fc.terSummary(), funds: undefined })).toBeNull();
  });
  it("counts the funds without a TER in singular and plural", () => {
    expect(noTerNote(fc.terSummary().funds)).toBe("1 fund without a TER is not included in the projected totals above.");
    expect(noTerNote([fundRow({ ter: null }), fundRow({ ter: null })])).toBe("2 funds without a TER are not included in the projected totals above.");
    expect(noTerNote([fundRow({})])).toBeNull();
    expect(noTerNote(undefined)).toBeNull();
  });
  it("scales the gauge to at least 2.5 percent and to the largest TER shown", () => {
    const ter = fc.terSummary();
    const both = fc.terDirectRegularBoth();
    expect(terScaleMax(ter, null)).toBe(2.5);
    expect(terScaleMax(ter, both)).toBe(2.5);
    expect(terScaleMax({ ...ter, weighted_ter: "3.10" }, null)).toBe(3.1);
    expect(terScaleMax(ter, { ...both, regular: { ...both.regular, weighted_ter: "4.00" } })).toBe(4);
    expect(terScaleMax({ ...ter, weighted_ter: null }, null)).toBe(2.5);
  });
  it("places a pin as a share of the scale, clamped to the track", () => {
    expect([pinPercent("0.64", 2.5), pinPercent("1.42", 2.5), pinPercent("5", 2.5), pinPercent("0", 2.5), pinPercent("0.64", 5)]).toEqual([25.6, 56.8, 100, 0, 12.8]);
  });
  it("finds a fund's 1Y, 3Y and 5Y returns in the category-ranking section, or nothing", () => {
    const ranking = fc.categoryRanking();
    expect(periodsFor(ranking, "S-KOTAK")?.["3y"]?.fund_return).toBe("0.1510");
    expect(periodsFor(ranking, "S-SBI")).toBeNull();
    expect(periodsFor(ranking, "S-NOPE")).toBeNull();
    expect(periodsFor(null, "S-KOTAK")).toBeNull();
    ranking.funds[0].periods = { "1y": { fund_return: null, category_avg: "0.1", peers: 3 } };
    expect(periodsFor(ranking, "S-KOTAK")).toBeNull();
  });
});

describe("valuation logic", () => {
  it("is hidden by the coverage rule before the data rule, and otherwise ok", () => {
    const data = valuation();
    expect(ratioState(data, "pe")).toBe("ok");
    expect(ratioState({ ...data, hide_headlines: true }, "pe")).toBe("hidden");
    expect(ratioState({ ...data, hide_headlines: true, pe: { ...data.pe, enough_data: false } }, "pe")).toBe("hidden");
    expect(ratioState({ ...data, pb: { ...data.pb, enough_data: false } }, "pb")).toBe("not_enough");
    expect(ratioState({ ...data, pb: { ...data.pb, enough_data: false } }, "pe")).toBe("ok");
    expect(ratioState({ ...data, pe: { ...data.pe, ratio: null } }, "pe")).toBe("not_enough");
  });
  it("lists you, then the indices, with the three fixed series colours", () => {
    const rows = ratioRows(valuation(), "pe");
    expect(rows.map(row => [row.key, row.label, row.short, row.color, row.ratio])).toEqual([
      ["you", "You", "You", "var(--pos)", "23.40"], ["nifty_50", "Nifty 50", "N50", "var(--c2)", "20.50"], ["nifty_500", "Nifty 500", "N500", "var(--c4)", "21.90"],
    ]);
    expect(ratioRows(valuation(), "pb").map(row => row.ratio)).toEqual(["4.10", "3.60", "3.80"]);
    expect(ratioRows({ ...valuation(), hide_headlines: true }, "pe").map(row => row.ratio)).toEqual([null, "20.50", "21.90"]);
  });
  it("places spectrum pins from 8 to 92 across the panel's own range", () => {
    expect(pinPositions(ratioRows(valuation(), "pe"))).toEqual({ you: 92, nifty_50: 8, nifty_500: 48.55 });
    expect(pinPositions(ratioRows(valuation(), "pb"))).toEqual({ you: 92, nifty_50: 8, nifty_500: 41.6 });
    expect(pinPositions(ratioRows({ ...valuation(), hide_headlines: true }, "pe"))).toEqual({ you: null, nifty_50: 8, nifty_500: 92 });
    const equal = valuation();
    equal.indices.forEach(index => { index.pe_ratio = "23.40"; });
    expect(pinPositions(ratioRows(equal, "pe"))).toEqual({ you: 50, nifty_50: 50, nifty_500: 50 });
  });
  it("sizes bars against the panel's own largest ratio, and gives a missing ratio no bar", () => {
    expect(barWidths(ratioRows(valuation(), "pe"))).toEqual({ you: "100", nifty_50: "87.61", nifty_500: "93.59" });
    expect(barWidths(ratioRows({ ...valuation(), hide_headlines: true }, "pe"))).toEqual({ you: "0", nifty_50: "93.61", nifty_500: "100" });
    const none = valuation();
    none.indices.forEach(index => { index.pe_ratio = null; });
    expect(barWidths(ratioRows({ ...none, hide_headlines: true }, "pe"))).toEqual({ you: "0", nifty_50: "0", nifty_500: "0" });
  });
  it("writes the narrative from the payload's deltas, rounded half up to one decimal", () => {
    expect(deltaSentence(valuation(), "pe")).toBe("Your portfolio is 14.2% more expensive on earnings than Nifty 50, and 6.9% more expensive than Nifty 500.");
    expect(deltaSentence(valuation(), "pb")).toBe("Your portfolio is 13.9% more expensive on book value than Nifty 50, and 7.9% more expensive than Nifty 500.");
  });
  it("says cheaper for a negative delta, level for zero, and skips a missing delta", () => {
    const data = valuation();
    data.indices[0].pe_delta_pct = "-3.40";
    data.indices[1].pe_delta_pct = "1.20";
    expect(deltaSentence(data, "pe")).toBe("Your portfolio is 3.4% cheaper on earnings than Nifty 50, and 1.2% more expensive than Nifty 500.");
    data.indices[0].pe_delta_pct = "0.00";
    data.indices[1].pe_delta_pct = "-0.00";
    expect(deltaSentence(data, "pe")).toBe("Your portfolio is level with Nifty 50 on earnings, and level with Nifty 500.");
    data.indices[0].pe_delta_pct = null;
    data.indices[1].pe_delta_pct = "6.85";
    expect(deltaSentence(data, "pe")).toBe("Your portfolio is 6.9% more expensive on earnings than Nifty 500.");
    data.indices[1].pe_delta_pct = null;
    expect(deltaSentence(data, "pe")).toBeNull();
  });
  it("writes no narrative while the portfolio ratio is hidden", () => {
    expect(deltaSentence({ ...valuation(), hide_headlines: true }, "pe")).toBeNull();
    const data = valuation();
    data.pb.enough_data = false;
    expect(deltaSentence(data, "pb")).toBeNull();
    expect(deltaSentence(data, "pe")).not.toBeNull();
  });
});

describe("score logic", () => {
  it("flips the backend tier so Tier 1 is the best", () => {
    expect([5, 4, 3, 2, 1].map(displayTier)).toEqual([1, 2, 3, 4, 5]);
    expect([1, 2, 3, 4, 5].map(tierTone)).toEqual(["high", "high", "mid", "low", "low"]);
    expect([1, 2, 3, 4, 5].map(tierCaption)).toEqual(["Top Tier Performer", "Top Tier Performer", "Average Category Rank", "Below Category Average", "Below Category Average"]);
  });
  it("gives the closing sentence for each tier and the tier 3 one for an unknown tier", () => {
    expect(whatThisMeans(1)).toBe("A strong choice within its category based on historical data — suitable if you're comfortable with typical risk for this fund type.");
    expect(whatThisMeans(2)).toBe("A solid, dependable option within its category based on historical data.");
    expect(whatThisMeans(3)).toBe("An average performer within its category — worth comparing against a few alternatives before deciding.");
    expect(whatThisMeans(4)).toBe("A below-average performer within its category — consider reviewing whether it still fits your goals.");
    expect(whatThisMeans(5)).toBe("One of the weaker performers within its category based on historical data — worth a closer look before adding more.");
    expect(whatThisMeans(9)).toBe(whatThisMeans(3));
  });
  it("labels the portfolio score at 70 and 50", () => {
    expect(["100", "70", "69.9", "50", "49.9", "0"].map(value => portfolioVerdict(value))).toEqual([
      { label: "High Quality Portfolio", tone: "high" }, { label: "High Quality Portfolio", tone: "high" },
      { label: "Moderate Quality Portfolio", tone: "mid" }, { label: "Moderate Quality Portfolio", tone: "mid" },
      { label: "Needs Review", tone: "low" }, { label: "Needs Review", tone: "low" },
    ]);
  });
  it("names a percentile Excellent from 80, Strong from 50, Weak from 20 and Poor below", () => {
    expect(["100", "80", "79.9", "50", "49.9", "20", "19.9", "0"].map(verdictWord)).toEqual(["excellent", "excellent", "strong", "strong", "weak", "weak", "poor", "poor"]);
  });
  it("assesses a factor: green strength from 50, orange watch-out from 20, red below, with the factor's own sentence", () => {
    expect(assessFactor("return", "88")).toEqual({ key: "return", bucket: "strength", dot: "green", verdict: "excellent", sentence: "Strong long-term performance — has consistently outperformed similar funds." });
    expect(assessFactor("risk", "50")).toMatchObject({ bucket: "strength", dot: "green", verdict: "strong", sentence: "Reasonable downside protection compared to similar funds." });
    expect(assessFactor("consistency", "49.9")).toMatchObject({ bucket: "watchout", dot: "orange", verdict: "weak", sentence: "Inconsistent — has beaten its category median in less than half of 12-month periods." });
    expect(assessFactor("return", "19.9")).toMatchObject({ bucket: "watchout", dot: "red", verdict: "poor", sentence: "Long-term performance has lagged most similar funds." });
    expect(assessFactor("risk", "10").sentence).toBe("Weak downside protection — has historically lost more than most peers in falling markets.");
    expect(assessFactor("risk", "30").sentence).toBe("Below-average downside protection — has historically fallen more than peers in weak markets.");
    expect(assessFactor("risk", "90").sentence).toBe("Strong downside protection — has historically lost less than peers in falling markets.");
    expect(assessFactor("consistency", "85").sentence).toBe("Very consistent — has beaten its category median in most 12-month periods.");
  });
  it("explains the tier in one sentence from the strongest and weakest factor and the cost nudge", () => {
    expect(whySentence(score("S-KOTAK"))).toBe("Scores well mainly due to strong long-term performance and low cost.");
    expect(whySentence(score("S-JM"))).toBe("Scores well mainly due to strong long-term performance.");
    expect(whySentence(score("S-HDFC"))).toBe("Performs roughly in line with similar funds, with strength in consistent outperformance of peers balanced by weaker downside protection.");
    const worse = { ...score("S-HDFC"), risk_adjusted_tier: 2 };
    expect(whySentence(worse)).toBe("Held back mainly by weaker downside protection and higher-than-average cost.");
    expect(whySentence({ ...worse, cost_adjustment: "0.00" })).toBe("Held back mainly by weaker downside protection.");
    const tied = { ...score("S-HDFC"), return_percentile: "60", risk_percentile: "60", consistency_hit_rate: "60" };
    expect(whySentence(tied)).toBe("Performs roughly in line with similar funds, with strength in strong long-term performance balanced by weaker long-term performance.");
    expect(whySentence({ ...score("S-HDFC"), risk_percentile: null })).toBeNull();
    expect(whySentence({ ...score("S-HDFC"), risk_adjusted_tier: null })).toBeNull();
  });
  it("describes the cost adjustment", () => {
    expect(costLine("0.25")).toBe("Cost bonus: +0.25 for a below-category expense ratio.");
    expect(costLine("-0.25")).toBe("Cost penalty: -0.25 for an above-category expense ratio.");
    expect(costLine("0.10")).toBe("Cost bonus: +0.10 for a below-category expense ratio.");
    expect(costLine("0.00")).toBe("Cost: category-median TER, no adjustment.");
    expect(costLine(null)).toBe("Cost: no adjustment recorded.");
  });
  it("calls a fund scored only when it has a score and a tier and no unavailable or short-history flag", () => {
    expect(isScored(score("S-KOTAK"))).toBe(true);
    expect(isScored(score("S-SBI"))).toBe(false);
    expect(isScored({ ...score("S-KOTAK"), category_unavailable: true })).toBe(false);
    expect(isScored({ ...score("S-KOTAK"), final_score: null })).toBe(false);
    expect(isScored({ ...score("S-KOTAK"), risk_adjusted_tier: null })).toBe(false);
    expect(unscoredReason({ ...score("S-SBI"), category_unavailable: true })).toBe("SEBI category data is not available for this fund.");
    expect(unscoredReason(score("S-SBI"))).toBe("This fund does not have enough historical NAV data to evaluate downside risk and 12-month rolling consistency.");
  });
});

describe("category and fund ranking logic", () => {
  it("says outperforming or trailing over 3Y with the gap in points", () => {
    const funds = fc.categoryRanking().funds;
    expect(categoryOutperform(funds[0])).toBe("Outperforming its Flexi Cap Fund category average over 3Y by 2.1pp.");
    expect(categoryOutperform(funds[2])).toBe("Trailing its Flexi Cap Fund category average over 3Y by 1.8pp.");
    expect(categoryOutperform({ ...funds[0], category_avg_return: funds[0].scheme_return })).toBe("Outperforming its Flexi Cap Fund category average over 3Y by 0.0pp.");
    expect(categoryOutperform(funds[3])).toBeNull();
    expect(categoryOutperform({ ...funds[0], sebi_category: null })).toBeNull();
  });
  it("weighs the composite 25, 25, 20, 15 and 15, summing to exactly 100, in this order", () => {
    expect(RANK_WEIGHTS.map(item => [item.key, item.label, item.weight, item.unit])).toEqual([
      ["return_3y", "3Y return", 25, "fraction"], ["return_5y", "5Y return", 25, "fraction"], ["category_relative", "Category-relative", 20, "fraction"],
      ["low_volatility", "Low volatility", 15, "fraction"], ["low_ter", "Low TER", 15, "percent"],
    ]);
    expect(RANK_WEIGHTS.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    expect(rankWeightsSentence()).toBe("Overall rank = composite score: 3Y return 25%, 5Y return 25%, category-relative 20%, low volatility 15%, low TER 15%.");
  });
  it("shortens a category name", () => {
    expect(shortCategory("Equity Scheme - Mid Cap Fund")).toBe("Mid Cap");
    expect(shortCategory("Large Cap Fund")).toBe("Large Cap");
    expect(shortCategory(null)).toBe("");
  });
  it("writes the rank line: rank, ranked count, universe, and the top share unless the category is thin", () => {
    expect(rankLine(rank("S-KOTAK"))).toBe("#4 of 28 ranked · 40 in category · Top 11%");
    expect(rankLine(rank("S-JM"))).toBe("#11 of 42 ranked · 51 in category · Top 24%");
    expect(rankLine(rank("S-HDFC"))).toBe("3rd of 4 ranked Mid Cap funds · 14 in category");
    expect(rankLine({ ...rank("S-KOTAK"), percentile: null })).toBe("#4 of 28 ranked · 40 in category");
    expect(rankLine({ ...rank("S-KOTAK"), percentile: "99.5" })).toBe("#4 of 28 ranked · 40 in category · Top 0%");
  });
  it("writes a component: percentile as an ordinal and the raw figure as a return or, for TER, a percent", () => {
    expect(componentText({ percentile: "91.0", raw: "0.1510" }, "fraction")).toBe("91st pct · 15.1%");
    expect(componentText({ percentile: "61.0", raw: "0.58" }, "percent")).toBe("61st pct · 0.58%");
    expect(componentText({ percentile: "42.0", raw: "-0.0250" }, "fraction")).toBe("42nd pct · -2.5%");
    expect(componentText({ percentile: null, raw: "0.1" }, "fraction")).toBe("— · 10.0%");
    expect(componentText({ percentile: "11.0", raw: null }, "fraction")).toBe("11th pct");
    expect(componentText({ percentile: null, raw: null }, "percent")).toBe("—");
  });
  it("splits the named neighbours above and below the fund, nearest rank first, and never includes the fund itself", () => {
    const fund = rank("S-KOTAK");
    const split = splitNeighbors(fund);
    expect(split.above.map(n => n.category_rank)).toEqual([3]);
    expect(split.below.map(n => n.category_rank)).toEqual([5]);
    const messy = { ...fund, neighbors: [
      { scheme_id: "a", scheme_name: "A", category_rank: 6, composite_score: "1" }, { scheme_id: "b", scheme_name: "B", category_rank: 2, composite_score: "1" },
      { scheme_id: "c", scheme_name: "C", category_rank: 4, composite_score: "1" }, { scheme_id: "d", scheme_name: "D", category_rank: 3, composite_score: "1" },
      { scheme_id: "e", scheme_name: "E", category_rank: 5, composite_score: "1" },
    ] };
    const sorted = splitNeighbors(messy);
    expect(sorted.above.map(n => n.category_rank)).toEqual([2, 3]);
    expect(sorted.below.map(n => n.category_rank)).toEqual([5, 6]);
    expect(splitNeighbors({ ...fund, category_rank: null })).toEqual({ above: [], below: [] });
  });
});
