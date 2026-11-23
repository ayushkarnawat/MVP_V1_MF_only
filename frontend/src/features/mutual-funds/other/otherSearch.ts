import { matchesItem, type SearchableField } from "../../../components/search/matcher";
import { parseQuery } from "../../../components/search/queryParser";

export interface SearchableFundRow {
  scheme_name: string;
  category_name?: string | null;
  category?: string | null;
  sebi_category?: string | null;
  plan_type?: string | null;
}

function rowFields(row: SearchableFundRow): SearchableField[] {
  const fields: SearchableField[] = [{ value: row.scheme_name, kind: "name" }];
  if (row.category_name) fields.push({ value: row.category_name, kind: "text" });
  if (row.category) fields.push({ value: row.category, kind: "text" });
  if (row.sebi_category) fields.push({ value: row.sebi_category, kind: "text" });
  if (row.plan_type) fields.push({ value: row.plan_type, kind: "text" });
  return fields;
}

export function filterFundRows<T extends SearchableFundRow>(rows: T[], text: string): T[] {
  const { words } = parseQuery(text);
  if (words.length === 0) return rows;
  return rows.filter((row) => matchesItem(words, { fields: rowFields(row) }) > 0);
}
