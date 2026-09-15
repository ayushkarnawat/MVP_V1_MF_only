import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Display-only proper-casing for badge/status text (e.g. "DIRECT" or
 * "direct" -> "Direct") — CSS text-transform: capitalize can't fix an
 * all-caps source since it never lowercases the rest of the word, so
 * this covers that case. Never mutates the underlying value. */
export function toTitleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** Formats an ISO `YYYY-MM-DD` date string as `DD-MM-YYYY` (Indian convention). */
export function formatDdMmYyyy(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year}`;
}
