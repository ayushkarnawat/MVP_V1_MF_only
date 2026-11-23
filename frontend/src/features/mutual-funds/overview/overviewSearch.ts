import { matchesItem, type SearchableField } from "../../../components/search/matcher";
import { parseQuery } from "../../../components/search/queryParser";
import type { SearchChip } from "../../../components/search/usePageSearchState";
import type { SipRow } from "../types";

export interface SearchableHolding {
  scheme_name: string;
  amc_name?: string;
  category?: string | null;
  sebi_category?: string | null;
  household_member_id?: string;
  household_member_name?: string;
  children?: Array<{ household_member_id: string; household_member_name: string }>;
}

function holdingFields(row: SearchableHolding): SearchableField[] {
  const fields: SearchableField[] = [{ value: row.scheme_name, kind: "name" }];
  if (row.amc_name) fields.push({ value: row.amc_name, kind: "alias" });
  if (row.category) fields.push({ value: row.category, kind: "text" });
  if (row.sebi_category) fields.push({ value: row.sebi_category, kind: "text" });
  if (row.household_member_name) fields.push({ value: row.household_member_name, kind: "name" });
  if (row.children) {
    for (const child of row.children) {
      if (child.household_member_name) {
        fields.push({ value: child.household_member_name, kind: "name" });
      }
    }
  }
  return fields;
}

export function filterHoldingRows<T extends SearchableHolding>(
  rows: T[],
  text: string,
  chips: SearchChip[],
): T[] {
  const { words } = parseQuery(text);
  const categoryChips = chips.filter((chip) => chip.kind === "category");
  const memberChips = chips.filter((chip) => chip.kind === "member");

  if (words.length === 0 && categoryChips.length === 0 && memberChips.length === 0) {
    return rows;
  }

  return rows.filter((row) => {
    if (words.length > 0 && matchesItem(words, { fields: holdingFields(row) }) <= 0) {
      return false;
    }
    if (categoryChips.length > 0) {
      const cat = row.category?.toLowerCase();
      const sebiCat = row.sebi_category?.toLowerCase();
      const matchesCategory = categoryChips.some((chip) => {
        const target = chip.value.toLowerCase();
        return cat === target || sebiCat === target;
      });
      if (!matchesCategory) return false;
    }
    if (memberChips.length > 0) {
      const matchesMember = memberChips.some(
        (chip) =>
          row.household_member_id === chip.value ||
          (row.children?.some((child) => child.household_member_id === chip.value) ?? false),
      );
      if (!matchesMember) return false;
    }
    return true;
  });
}

export function filterSipRows(rows: SipRow[], text: string, chips: SearchChip[]): SipRow[] {
  const { words } = parseQuery(text);
  const memberChips = chips.filter((chip) => chip.kind === "member");

  if (words.length === 0 && memberChips.length === 0) {
    return rows;
  }

  return rows.filter((row) => {
    if (words.length > 0) {
      const fields: SearchableField[] = [
        { value: row.scheme_name, kind: "name" },
        { value: row.household_member_name, kind: "name" },
      ];
      if (matchesItem(words, { fields }) <= 0) return false;
    }
    if (memberChips.length > 0 && !memberChips.some((chip) => row.household_member_id === chip.value)) {
      return false;
    }
    return true;
  });
}
