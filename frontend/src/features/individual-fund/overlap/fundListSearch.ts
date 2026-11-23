import { matchesItem, normalise } from "@/components/search/matcher";
import type { OverlapTopFund } from "../types";

/** Filter overlap candidate funds so every query word matches the fund name. */
export function filterOverlapFunds(
  funds: OverlapTopFund[],
  text: string
): OverlapTopFund[] {
  const normalised = normalise(text);
  if (!normalised) return funds;
  // Plain words: a fund called "Nifty 500 Index" must be found by "500", which the query parser would read as an amount.
  const words = normalised.split(" ");

  return funds.filter(
    (fund) =>
      matchesItem(words, {
        fields: [{ value: fund.scheme_name, kind: "name" }],
      }) > 0
  );
}
