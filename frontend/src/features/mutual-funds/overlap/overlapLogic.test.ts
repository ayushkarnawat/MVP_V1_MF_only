import { describe, expect, it } from "vitest";
import { compareDecimalStrings, sumDecimalStrings } from "../../../lib/decimal";
import * as fc from "../fixtures/mfC";
import type { OverlapFund, OverlapPair, OverlapSummary, StockHoldingRow } from "../types";
import {
  equityStockHoldings, analysedCount, bandLegendText, bandOf, barWidth, buildOverlapInsights, combinedWeight, commonStocks, COMMON_LIMIT,
  excludedNote, findPair, fundInitials, highestPair, IMPACT_PAIRS, impactBreakdown, PAIR_LIMIT, pairCount,
  pairKey, pairKeyOf, pairsWithOverlap, riskBand, riskNote, sortedPairs,
} from "./overlapLogic";

const KOTAK = "S-KOTAK";
const SBI = "S-SBI";
const JM = "S-JM";

const fund = (id: string, value: string): OverlapFund => ({ scheme_id: id, scheme_name: `Fund ${id}`, current_value: value });
const pair = (a: OverlapFund, b: OverlapFund, overlap: string): OverlapPair => ({ fund_a: a, fund_b: b, overlap_pct: overlap, common_stocks: [], common_total: 0 });

/** Six funds A to F worth 100, 200, 300, 400, 500 and 600 in a portfolio of 3,000 (the other 900 is in no pair). */
function synthetic(): OverlapSummary {
  const funds = ["A", "B", "C", "D", "E", "F"].map((letter, index) => fund(letter, `${(index + 1) * 100}.00`));
  const [a, b, c, d, e, f] = funds;
  const summary = fc.overlapSummary();
  summary.matrix_funds = funds;
  summary.matrix = [];
  summary.pairs_above_low = [pair(a, b, "21.00"), pair(c, d, "55.00"), pair(e, f, "33.00"), pair(a, c, "28.00"), pair(b, e, "25.00")];
  summary.total_portfolio_value = "3000.00";
  return summary;
}

describe("bandOf and bandLegendText", () => {
  it("bands at the edges: below the low band is low, from the low band moderate, from the high band high", () => {
    const bands = { low: "20", high: "40" };
    expect(["0", "19.99", "20", "20.00", "39.99", "40", "40.00", "100"].map(pct => bandOf(pct, bands))).toEqual(
      ["low", "low", "moderate", "moderate", "moderate", "high", "high", "high"]);
  });
  it("reads the thresholds from the bands it is given, never from constants", () => {
    const bands = { low: "10", high: "30" };
    expect(["9.99", "10", "29.99", "30"].map(pct => bandOf(pct, bands))).toEqual(["low", "moderate", "moderate", "high"]);
  });
  it("words the legend from the bands, whole numbers, an en dash and the greater-or-equal sign", () => {
    const bands = { low: "20", high: "40" };
    expect(bandLegendText("low", bands)).toBe("Low < 20%");
    expect(bandLegendText("moderate", bands)).toBe("Moderate 20–40%");
    expect(bandLegendText("high", bands)).toBe("High ≥ 40%");
    expect(bandLegendText("moderate", { low: "10", high: "30" })).toBe("Moderate 10–30%");
  });
});

describe("pair keys, order and counts", () => {
  it("gives a pair and its mirror the same key, whichever way round the ids come", () => {
    expect(pairKey(KOTAK, SBI)).toBe(pairKey(SBI, KOTAK));
    expect(pairKey(KOTAK, SBI)).toBe("S-KOTAK~S-SBI");
    expect(pairKey("b", "a")).toBe("a~b");
  });
  it("keys a pair by its two fund ids", () => {
    const top = fc.overlapSummary().matrix[2];
    expect(pairKeyOf(top)).toBe("S-KOTAK~S-SBI");
  });
  it("sorts pairs largest overlap first, ties by the two fund names, without touching the input", () => {
    const [x, y, z] = [fund("a", "1"), fund("b", "1"), fund("c", "1")];
    const input = [pair(y, z, "30.00"), pair(x, z, "30.00"), pair(x, y, "45.00"), pair(x, y, "30.00")];
    const sorted = sortedPairs(input);
    expect(sorted.map(p => `${p.fund_a.scheme_id}${p.fund_b.scheme_id}${p.overlap_pct}`)).toEqual(["ab45.00", "ab30.00", "ac30.00", "bc30.00"]);
    expect(input[0].overlap_pct).toBe("30.00");
    expect(input[0].fund_a.scheme_id).toBe("b");
  });
  it("counts the possible pairs as n choose 2, zero below two funds", () => {
    expect([0, 1, 2, 3, 4, 12].map(pairCount)).toEqual([0, 0, 1, 3, 6, 66]);
  });
  it("counts the grid's pairs at the low band or above, at the exact edge included", () => {
    const summary = fc.overlapSummary();
    expect(pairsWithOverlap(summary)).toBe(3);
    summary.matrix[3].overlap_pct = "20.00";
    expect(pairsWithOverlap(summary)).toBe(4);
    summary.matrix[3].overlap_pct = "19.99";
    expect(pairsWithOverlap(summary)).toBe(3);
  });
  it("counts from the grid, not from the list of pairs above the low band", () => {
    const summary = fc.overlapSummary();
    summary.pairs_above_low = [];
    expect(pairsWithOverlap(summary)).toBe(3);
  });
});

describe("the highest pair, finding a pair and the risk", () => {
  it("takes the highest pair of the grid", () => {
    const summary = fc.overlapSummary();
    expect(pairKeyOf(highestPair(summary)!)).toBe("S-KOTAK~S-SBI");
    summary.pairs_above_low = [];
    expect(pairKeyOf(highestPair(summary)!)).toBe("S-KOTAK~S-SBI");
    summary.matrix = [];
    expect(highestPair(summary)).toBeNull();
  });
  it("finds a pair in the grid first, then among the pairs above the low band, and nothing for no key or an unknown key", () => {
    const summary = fc.overlapSummary();
    const outside = pair(fund("X", "1"), fund("Y", "1"), "33.00");
    summary.pairs_above_low.push(outside);
    expect(findPair(summary, "S-JM~S-SBI")?.overlap_pct).toBe("26.40");
    expect(findPair(summary, "X~Y")).toBe(outside);
    expect(findPair(summary, "nothing")).toBeNull();
    expect(findPair(summary, null)).toBeNull();
  });
  it("bands the risk from the highest pair and words it", () => {
    const summary = fc.overlapSummary();
    expect(riskBand(summary)).toBe("high");
    summary.matrix[2].overlap_pct = "39.99";
    expect(riskBand(summary)).toBe("moderate");
    summary.matrix[2].overlap_pct = "19.99";
    summary.matrix.forEach(p => { if (p.overlap_pct !== "19.99") p.overlap_pct = "5.00"; });
    expect(riskBand(summary)).toBe("low");
    summary.matrix = [];
    expect(riskBand(summary)).toBeNull();
    expect(riskNote(null)).toBe("needs at least two funds");
    expect(riskNote("low")).toBe("no fund pair shares meaningful exposure");
    expect(riskNote("moderate")).toBe("a few fund pairs share meaningful exposure");
    expect(riskNote("high")).toBe("some fund pairs duplicate a large share of each other's holdings");
  });
  it("words the excluded funds, singular and plural", () => {
    expect(excludedNote(0)).toBe("all your funds have stock holdings to look through");
    expect(excludedNote(1)).toBe("1 fund excluded — no stock holdings to look through");
    expect(excludedNote(3)).toBe("3 funds excluded — no stock holdings to look through");
  });
  it("counts the funds analysed against all, an excluded fund listed in two ways counting once", () => {
    const summary = fc.overlapSummary();
    expect(analysedCount(summary)).toEqual({ analysed: 4, of: 7, excluded: 3 });
    summary.coverage.not_available_from_amc.push({ scheme_id: "S-HDOV", scheme_name: "HDFC Overnight Fund" });
    expect(analysedCount(summary)).toEqual({ analysed: 4, of: 7, excluded: 3 });
    summary.total_fund_count = 9;
    expect(analysedCount(summary)).toEqual({ analysed: 9, of: 12, excluded: 3 });
  });
});

describe("fundInitials", () => {
  it("is the first letters of up to three words, a closing word Fund dropped, in capitals", () => {
    expect(fundInitials("Kotak Multi Cap Fund")).toBe("KMC");
    expect(fundInitials("SBI Bluechip Fund")).toBe("SB");
    expect(fundInitials("HDFC Mid-Cap Opportunities Fund")).toBe("HMO");
    expect(fundInitials("JM Flexi Cap Fund")).toBe("JFC");
    expect(fundInitials("Aditya Birla Sun Life Flexi Cap Fund")).toBe("ABS");
    expect(fundInitials("axis bluechip")).toBe("AB");
    expect(fundInitials("Fund")).toBe("F");
  });
});

describe("combinedWeight", () => {
  it("is the two funds' value as a share of the portfolio, four places, exact", () => {
    const top = fc.overlapSummary().matrix[2];
    expect(combinedWeight(top, "4649340.00")).toBe("50.7457");
    expect(combinedWeight(fc.overlapSummary().matrix[1], "4649340.00")).toBe("54.2012");
  });
  it("is null when the portfolio value is not positive", () => {
    expect(combinedWeight(fc.overlapSummary().matrix[2], "0.00")).toBeNull();
  });
});

describe("impactBreakdown", () => {
  it("uses the funds of the top three pairs, the funds of the others not already counted, and everything else", () => {
    const rows = impactBreakdown(fc.overlapSummary());
    expect(rows.map(row => [row.key, row.label])).toEqual([["top3", "Top 3 overlapping pairs"], ["other", "Other overlapping pairs"], ["unique", "Unique holdings"]]);
    expect(rows.map(row => row.value)).toEqual(["3339340.00", "0", "1310000.00"]);
    expect(rows.map(row => row.pct)).toEqual(["71.8240", "0.0000", "28.1760"]);
  });
  it("counts a fund once however many pairs it is in, and never again in the other row", () => {
    expect(IMPACT_PAIRS).toBe(3);
    // by overlap: C-D 55, E-F 33 and A-C 28 are the top three (funds C, D, E, F and A = 1,900); B-E 25 adds B (200); A-B 21 adds nothing new
    const rows = impactBreakdown(synthetic());
    expect(rows.map(row => row.value)).toEqual(["1900.00", "200.00", "900.00"]);
    expect(rows.map(row => row.pct)).toEqual(["63.3333", "6.6667", "30.0000"]);
  });
  it("adds up to the portfolio value and to exactly 100 percent, whatever the rounding", () => {
    for (const summary of [fc.overlapSummary(), synthetic()]) {
      const rows = impactBreakdown(summary);
      expect(compareDecimalStrings(sumDecimalStrings(rows.map(row => row.value)), summary.total_portfolio_value)).toBe(0);
      expect(sumDecimalStrings(rows.map(row => row.pct))).toBe("100.0000");
    }
  });
  it("makes the last row 100 minus the other two, so thirds that each round down still add up to exactly 100", () => {
    const funds = ["A", "B", "C", "D"].map(letter => fund(letter, "1000.00"));
    const summary = fc.overlapSummary();
    summary.matrix_funds = funds;
    summary.pairs_above_low = [pair(funds[0], funds[1], "50.00"), pair(funds[0], funds[2], "45.00"), pair(funds[1], funds[2], "44.00"), pair(funds[0], funds[3], "30.00")];
    summary.total_portfolio_value = "7000.00";
    const rows = impactBreakdown(summary);
    expect(rows.map(row => row.value)).toEqual(["3000.00", "1000.00", "3000.00"]);
    expect(rows.map(row => row.pct)).toEqual(["42.8571", "14.2857", "42.8572"]);
  });
  it("puts the whole portfolio in unique holdings when no pair overlaps", () => {
    const summary = fc.overlapSummary();
    summary.pairs_above_low = [];
    expect(impactBreakdown(summary).map(row => [row.value, row.pct])).toEqual([["0", "0.0000"], ["0", "0.0000"], ["4649340.00", "100.0000"]]);
  });
});

describe("buildOverlapInsights", () => {
  it("writes three sentences from the payload's own numbers", () => {
    expect(buildOverlapInsights(fc.overlapSummary())).toEqual([
      "Kotak Multi Cap Fund and SBI Bluechip Fund share 41% overlap — together they account for 51% of your portfolio, so a correction in their shared holdings would hit both at once.",
      "Funds in your top 3 overlapping pairs hold 71.8% of your portfolio value.",
      "HDFC Mid-Cap Opportunities Fund has the lowest overlap with the rest of your portfolio — it is doing the most diversification work.",
    ]);
  });
  it("says nothing when no pair is above the low band", () => {
    const summary = fc.overlapSummary();
    summary.pairs_above_low = [];
    expect(buildOverlapInsights(summary)).toEqual([]);
  });
  it("says the top overlapping pair, singular, when only one pair is above the low band, and skips the lowest-overlap sentence for two funds", () => {
    const summary = fc.overlapSummary();
    summary.pairs_above_low = [summary.matrix[2]];
    summary.matrix_funds = summary.matrix_funds.filter(f => f.scheme_id === KOTAK || f.scheme_id === SBI);
    summary.matrix = [summary.matrix[2]];
    const sentences = buildOverlapInsights(summary);
    expect(sentences).toHaveLength(2);
    expect(sentences[1]).toBe("Funds in your top overlapping pair hold 50.7% of your portfolio value.");
  });
  it("counts two pairs as top 2 overlapping pairs", () => {
    const summary = fc.overlapSummary();
    summary.pairs_above_low = summary.pairs_above_low.slice(0, 2);
    expect(buildOverlapInsights(summary)[1]).toBe("Funds in your top 2 overlapping pairs hold 71.8% of your portfolio value.");
  });
  it("finds the fund with the lowest total overlap, ties by name", () => {
    const summary = fc.overlapSummary();
    summary.matrix.forEach(p => { p.overlap_pct = "10.00"; });
    summary.matrix[2].overlap_pct = "40.60";
    expect(buildOverlapInsights(summary)[2]).toContain("HDFC Mid-Cap Opportunities Fund has the lowest overlap");
    summary.matrix.forEach(p => { p.overlap_pct = "10.00"; });
    expect(buildOverlapInsights(summary)[2]).toContain("HDFC Mid-Cap Opportunities Fund has the lowest overlap");
    summary.matrix_funds[0].scheme_name = "AAA First Fund";
    summary.matrix.forEach(p => { if (p.fund_a.scheme_id === KOTAK) p.fund_a.scheme_name = "AAA First Fund"; });
    expect(buildOverlapInsights(summary)[2]).toContain("AAA First Fund has the lowest overlap");
  });
});

describe("commonStocks", () => {
  it("lists the equity stocks held by two or more funds, the largest portfolio exposure first", () => {
    const common = commonStocks(fc.stockHoldings());
    expect(common).toHaveLength(13);
    expect(common.slice(0, 10).map(stock => stock.row.instrument_name)).toEqual([
      "HDFC Bank Ltd", "ICICI Bank Ltd", "Reliance Industries Ltd", "Infosys Ltd", "Larsen & Toubro Ltd", "ITC Ltd", "Coforge Ltd",
      "Maruti Suzuki India Ltd", "Asian Paints Ltd", "Kotak Mahindra Bank Ltd",
    ]);
    expect(common.slice(10).map(stock => stock.row.instrument_name)).toEqual(["Hindustan Unilever Ltd", "Bajaj Auto Ltd", "Nestle India Ltd"]);
    expect(common[0].key).toBe("INE040A01034");
    expect(COMMON_LIMIT).toBe(10);
    expect(PAIR_LIMIT).toBe(5);
  });
  it("orders each stock's funds by what they add to its exposure, not by their weight in the stock", () => {
    const hdfcBank = commonStocks(fc.stockHoldings())[0];
    expect(hdfcBank.funds.map(f => f.scheme_id)).toEqual([KOTAK, SBI, JM]);
  });
  it("leaves out a stock held by one fund, and anything that is not equity, and an empty or missing summary", () => {
    const data = fc.stockHoldings();
    const debt: StockHoldingRow = { ...data.rows[0], isin: "IN-DEBT", instrument_name: "A Bond", asset_type: "debt" };
    data.rows.push(debt);
    const names = commonStocks(data).map(stock => stock.row.instrument_name);
    expect(names).not.toContain("A Bond");
    expect(names).not.toContain("Max Healthcare Institute Ltd");
    expect(commonStocks(null)).toEqual([]);
    data.rows = [];
    expect(commonStocks(data)).toEqual([]);
  });
  it("keys a stock without an ISIN by its name", () => {
    const data = fc.stockHoldings();
    data.rows[0].isin = null;
    expect(commonStocks(data)[0].key).toBe("HDFC Bank Ltd");
  });
});

describe("barWidth", () => {
  it("is the share of the largest value, two places, geometry only", () => {
    expect(barWidth("5.7011", "5.7011")).toBe("100");
    expect(barWidth("2.85055", "5.7011")).toBe("50");
    expect(barWidth("1.0000", "3.0000")).toBe("33.33");
    expect(barWidth("0.5", "0")).toBe("0");
  });
});

it("T1.4 counts the equity funds analysed and names all funds not shown once", () => {
  const summary = Object.assign(fc.overlapSummary(), {
    excluded_funds: [{ name: "Debt", reason: "This is a debt fund, so it isn't counted in an equity overlap." }],
  });
  summary.total_fund_count = 2;
  expect(analysedCount(summary)).toEqual({ analysed: 2, of: 3, excluded: 1 });
});


it("T1.4 common holdings contains only the selected equity funds, including funds beyond the capped matrix", () => {
  const stocks = { ...fc.stockHoldings(), rows: [] as StockHoldingRow[] };
  const summary = fc.overlapSummary();
  summary.equity_funds = [fund("a", "100"), fund("b", "100"), fund("rank15", "100")];
  const row = fc.stockHoldings().rows[0];
  stocks.rows = [{ ...row, contributing_funds: ["a", "b", "rank15", "debt"].map(id => ({
    ...row.contributing_funds[0], scheme_id: id, scheme_name: id,
  })) }];
  const selected = equityStockHoldings(stocks, summary)!;
  expect(selected.rows[0].contributing_funds.map(f => f.scheme_id)).toEqual(["a", "b", "rank15"]);
  expect(stocks.rows[0].contributing_funds).toHaveLength(4);
  delete summary.equity_funds;
  expect(equityStockHoldings(stocks, summary)).toBe(stocks); // old payload keeps its previous view
});
