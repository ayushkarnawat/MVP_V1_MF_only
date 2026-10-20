import { compareDecimalStrings } from "./decimal";

export type SortOrder = "asc" | "desc";

export function sortAllocationItems<T extends { label: string; percentage: string }>(items: T[], order: SortOrder): T[] {
  return [...items].sort((a, b) => {
    const difference = compareDecimalStrings(a.percentage, b.percentage);
    return difference === 0 ? a.label.localeCompare(b.label) : order === "asc" ? difference : -difference;
  });
}
