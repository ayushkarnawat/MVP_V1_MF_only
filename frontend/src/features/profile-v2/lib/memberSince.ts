const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function memberSince(iso: string | null | undefined): string | null {
  if (iso === null || iso === undefined) {
    return null;
  }
  const trimmed = iso.trim();
  if (!trimmed) {
    return null;
  }

  const hasTime = /T\d{2}:\d{2}/.test(trimmed);
  const hasZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(trimmed);
  const parseTarget = hasTime && !hasZone ? `${trimmed}Z` : trimmed;

  const date = new Date(parseTarget);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const shifted = new Date(date.getTime() + 330 * 60 * 1000);
  return `${MONTHS[shifted.getUTCMonth()]} ${shifted.getUTCFullYear()}`;
}
