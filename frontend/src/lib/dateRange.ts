const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parts(iso: string | null | undefined) {
  const match = iso?.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || month < 1 || month > 12) return null;
  return { year, month, day: match[3] === undefined ? null : Number(match[3]) };
}

export function formatExactDate(iso: string | null | undefined): string | null {
  const date = parts(iso);
  if (!date || date.day === null) return null;
  const leap = date.year % 4 === 0 && (date.year % 100 !== 0 || date.year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (date.day < 1 || date.day > days[date.month - 1]) return null;
  return `${date.day} ${MONTHS[date.month - 1]} ${date.year}`;
}

export function formatMonthYear(iso: string | null | undefined): string | null {
  const date = parts(iso);
  return date ? `${MONTHS[date.month - 1]} ${date.year}` : null;
}

export function formatDateRange(start: string | null | undefined, end: string | null | undefined, ongoing: boolean): string | null {
  const first = formatExactDate(start) ?? formatMonthYear(start);
  const last = formatExactDate(end) ?? formatMonthYear(end);
  if (first && last) return first === last ? first : `${first} – ${last}`;
  if (first && ongoing) return `${first} – ongoing`;
  return first ?? last;
}
