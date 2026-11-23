import { matchesItem, normalise } from "../../../components/search/matcher";
import type { StockHoldingRow } from "../types";

/**
 * Filters equity stock rows by query text. Every normalised word must match
 * the stock name, an ISIN prefix, or any contributing fund's scheme name.
 */
export function filterStockRows(
  rows: StockHoldingRow[],
  text: string,
): StockHoldingRow[] {
  const norm = normalise(text);
  if (!norm) return rows;

  const words = norm.split(" ");

  return rows.filter((row) => {
    const isinNorm = row.isin ? normalise(row.isin) : "";
    const item = {
      fields: [
        { value: row.instrument_name, kind: "name" as const },
        ...row.contributing_funds.map((fund) => ({
          value: fund.scheme_name,
          kind: "name" as const,
        })),
      ],
    };

    return words.every(
      (word) =>
        (isinNorm !== "" && isinNorm.startsWith(word)) ||
        matchesItem([word], item) > 0,
    );
  });
}

/**
 * Returns a disclosure note when the stock list is truncated, or null otherwise.
 */
export function stockSearchNote(
  summary: { truncated: boolean; total_stock_count: number },
  shown: number,
): string | null {
  if (!summary.truncated) return null;
  return `Searching the largest ${shown} of ${summary.total_stock_count} stocks`;
}
