import { matchesItem, normalise } from "../../../components/search/matcher";
import { plainWords } from "../../../components/search/queryParser";
import type { OverlapCommonStock, OverlapPair } from "../types";

/**
 * Filters overlap pairs by query text. Every normalised word must match
 * fund A's name, fund B's name, or any shared stock's instrument name.
 */
export function filterOverlapPairs(pairs: OverlapPair[], text: string): OverlapPair[] {
  const words = plainWords(text);
  if (words.length === 0) return pairs;

  return pairs.filter((pair) => {
    const item = {
      fields: [
        { value: pair.fund_a.scheme_name, kind: "name" as const },
        { value: pair.fund_b.scheme_name, kind: "name" as const },
        ...pair.common_stocks.map((stock) => ({
          value: stock.instrument_name,
          kind: "name" as const,
        })),
      ],
    };
    return matchesItem(words, item) > 0;
  });
}

/**
 * Filters shared stocks of an overlap pair by query text. Every normalised word
 * must match the stock's instrument name or an ISIN prefix.
 */
export function filterCommonStocks(
  stocks: OverlapCommonStock[],
  text: string,
): OverlapCommonStock[] {
  const words = plainWords(text);
  if (words.length === 0) return stocks;

  return stocks.filter((stock) => {
    const isinNorm = stock.isin ? normalise(stock.isin) : "";
    const item = {
      fields: [{ value: stock.instrument_name, kind: "name" as const }],
    };
    return words.every(
      (word) =>
        (isinNorm !== "" && isinNorm.startsWith(word)) ||
        matchesItem([word], item) > 0,
    );
  });
}
