const MONTH_NAMES = [
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

export function daysInMonth(year: number, month: number): number {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (month === 2) return isLeap ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export function isoDate(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function minSelectableDate(today: string, years = 10): string {
  const [yStr, mStr, dStr] = today.split("-");
  const targetYear = Number(yStr) - years;
  const month = Number(mStr);
  const targetDay = Math.min(Number(dStr), daysInMonth(targetYear, month));
  return isoDate(targetYear, month, targetDay);
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = ((total % 12) + 12) % 12 + 1;
  return { year: newYear, month: newMonth };
}

export function leadingBlanks(year: number, month: number): number {
  const dayOfWeekUtc = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (dayOfWeekUtc + 6) % 7;
}

export function monthTitle(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
