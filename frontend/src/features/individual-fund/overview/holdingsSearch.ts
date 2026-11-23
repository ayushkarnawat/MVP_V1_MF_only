import { matchesItem, normalise } from "@/components/search/matcher";
import type { HoldingRowOut } from "../types";

/** Filter holding rows so every query word matches name, ISIN prefix, or sector. */
export function filterHoldingRows(
  rows: HoldingRowOut[],
  text: string
): HoldingRowOut[] {
  const normalised = normalise(text);
  if (!normalised) return rows;
  // Plain words: a fund called "Nifty 500 Index" must be found by "500", which the query parser would read as an amount.
  const words = normalised.split(" ");

  return rows.filter((row) => {
    const isinNorm = row.isin ? normalise(row.isin) : "";
    const item = {
      fields: [
        { value: row.name, kind: "name" as const },
        { value: row.sector, kind: "text" as const },
      ],
    };
    return words.every(
      (word) =>
        (isinNorm !== "" && isinNorm.startsWith(word)) ||
        matchesItem([word], item) > 0
    );
  });
}
