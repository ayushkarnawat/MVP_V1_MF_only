import {
  formatCompactRupees,
  formatDate,
  formatPercent,
  formatRupees,
  scoreBand,
} from "../../lib/format";

export {
  formatCompactRupees,
  formatDate,
  formatPercent,
  formatRupees,
  scoreBand,
};

export function changeDirection(value: string | null | undefined): "up" | "down" | "flat" {
  if (value == null) return "flat";
  const s = String(value).trim();
  if (!s) return "flat";
  const match = s.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  if (!match) return "flat";
  const sign = match[1];
  const allDigits = match[2] + (match[3] ?? "");
  if (/^0+$/.test(allDigits)) return "flat";
  if (sign === "-") return "down";
  return "up";
}

export function formatSignedRupees(value: string | null | undefined): string {
  const text = formatRupees(value);
  if (text === "—") return "—";
  if (text === "₹0") return "₹0";
  if (text.startsWith("-")) return text;
  return "+" + text;
}

export function formatSignedCompactRupees(value: string | null | undefined): string {
  const text = formatCompactRupees(value);
  if (text === "—") return "—";
  if (text === "₹0") return "₹0";
  if (text.startsWith("-")) return text;
  return "+" + text;
}

export function formatSignedPercent(value: string | null | undefined, digits = 2): string {
  return formatPercent(value, { digits, signed: true });
}

export function formatDayMonth(iso: string | null | undefined): string {
  const text = formatDate(iso);
  if (text === "—") return "—";
  const parts = text.split(" ");
  if (parts.length < 2) return "—";
  return `${parts[0]} ${parts[1]}`;
}

export function formatAsOf(iso: string | null | undefined): string | null {
  const dm = formatDayMonth(iso);
  if (dm === "—") return null;
  return `as of ${dm}`;
}

export function greetingLine(greeting: "morning" | "afternoon" | "evening", name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return `Good ${greeting}`;
  return `Good ${greeting}, ${trimmed}`;
}
