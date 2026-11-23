import { matchesItem } from "../../../components/search/matcher";
import { parseQuery } from "../../../components/search/queryParser";
import type { SearchChip } from "../../../components/search/usePageSearchState";
import { compareDecimalStrings } from "../../../lib/decimal";
import { filterFor, type LedgerFilter, type LedgerRow } from "./transactionsLogic";

const MONTH_TO_MM: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** Maps a parsed query type word to its LedgerFilter, or null when unrecognised. */
export function typeWordToFilter(typeWord: string | undefined): LedgerFilter | null {
  switch (typeWord) {
    case "purchase":
      return "purchases";
    case "redemption":
      return "redemptions";
    case "switch":
      return "switches";
    default:
      return null;
  }
}

/** Filters pre-built ledger rows by search query text and active chips, preserving order. */
export function searchLedgerRows(rows: LedgerRow[], text: string, chips: SearchChip[]): LedgerRow[] {
  const parsed = parseQuery(text);
  const typeFilter = typeWordToFilter(parsed.typeWord);
  const memberChips = chips.filter(chip => chip.kind === "member");
  const periodChips = chips.filter(chip => chip.kind === "period");

  if (
    parsed.words.length === 0 &&
    typeFilter === null &&
    parsed.year === undefined &&
    parsed.amount === undefined &&
    memberChips.length === 0 &&
    periodChips.length === 0
  ) {
    return rows;
  }

  let datePrefix: string | null = null;
  if (parsed.year !== undefined) {
    const monthNum = parsed.month !== undefined ? MONTH_TO_MM[parsed.month] : undefined;
    datePrefix = monthNum ? `${parsed.year}-${monthNum}` : String(parsed.year);
  }

  return rows.filter(row => {
    if (typeFilter !== null && filterFor(row.kind) !== typeFilter) {
      return false;
    }
    if (datePrefix !== null && !row.entry.date.startsWith(datePrefix)) {
      return false;
    }
    if (parsed.amount !== undefined && compareDecimalStrings(row.entry.amount, parsed.amount) !== 0) {
      return false;
    }
    if (memberChips.length > 0 && !memberChips.some(chip => chip.value === row.entry.household_member_id)) {
      return false;
    }
    if (periodChips.length > 0 && !periodChips.some(chip => row.entry.date.startsWith(chip.value))) {
      return false;
    }
    if (parsed.words.length > 0) {
      const score = matchesItem(parsed.words, {
        fields: [
          { value: row.entry.scheme_name, kind: "name" },
          { value: row.entry.household_member_name, kind: "name" },
        ],
      });
      if (score === 0) return false;
    }
    return true;
  });
}
