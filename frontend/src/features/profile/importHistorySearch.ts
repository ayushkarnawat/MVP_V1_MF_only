import { matchesItem } from "../../components/search/matcher";
import { plainWords } from "../../components/search/queryParser";
import type { HouseholdImportHistoryItem } from "../import/types";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function dateForms(value: string | null): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "";
  const year = match[1];
  const monthIndex = Number(match[2]) - 1;
  const day = String(Number(match[3]));
  if (monthIndex < 0 || monthIndex >= 12) return "";
  const isoDate = `${year}-${match[2]}-${match[3]}`;
  return `${isoDate} ${day} ${SHORT_MONTHS[monthIndex]} ${year} ${FULL_MONTHS[monthIndex]} ${year}`;
}

function rowText(item: HouseholdImportHistoryItem): string {
  return [
    item.member_name,
    dateForms(item.statement_from_date),
    dateForms(item.statement_to_date),
    dateForms(item.uploaded_at),
    item.status.replaceAll("_", " "),
  ]
    .filter(Boolean)
    .join(" ");
}

/** Filters grouped import history rows by matching every query word against the group's combined text. */
// A whole date typed as 2026-10-20 is one thing to find, not the three loose numbers 2026, 10 and 20 (each of which
// would match somewhere else in a group). Whole ISO dates are matched as units; the remaining words as usual.
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

function isoDatesOf(item: HouseholdImportHistoryItem): string[] {
  return [item.statement_from_date, item.statement_to_date, item.uploaded_at]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.slice(0, 10));
}

export function filterImportGroups(
  groups: HouseholdImportHistoryItem[][],
  text: string,
): HouseholdImportHistoryItem[][] {
  const isoDates = text.match(ISO_DATE) ?? [];
  const words = plainWords(text.replace(ISO_DATE, " "));
  if (words.length === 0 && isoDates.length === 0) return groups;
  return groups.filter((group) => {
    const present = new Set(group.flatMap(isoDatesOf));
    if (!isoDates.every((date) => present.has(date))) return false;
    if (words.length === 0) return true;
    const combined = group.map(rowText).join(" ");
    return matchesItem(words, { fields: [{ value: combined, kind: "text" }] }) > 0;
  });
}
