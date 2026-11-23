import { matchesItem } from "../../../components/search/matcher";
import { plainWords } from "../../../components/search/queryParser";
import type { FundBenchmarkRow } from "../types";

export function filterBenchmarkFunds(
  rows: FundBenchmarkRow[],
  text: string
): FundBenchmarkRow[] {
  const words = plainWords(text);
  if (words.length === 0) return rows;

  return rows.filter(
    row =>
      matchesItem(words, {
        fields: [
          { value: row.scheme_name, kind: "name" },
          { value: row.benchmark_index, kind: "text" },
        ],
      }) > 0
  );
}
