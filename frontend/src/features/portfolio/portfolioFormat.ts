import { formatPercent, formatRupees } from "@/lib/format";
import { toPercentString } from "@/lib/decimal";
import type { MissingFund } from "./types";

export function changeDirection(value: string | null | undefined): "up" | "down" | "flat" {
  if (value == null) return "flat";
  const s = value.trim();
  if (!s) return "flat";
  const match = s.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  if (!match) return "flat";
  const sign = match[1];
  const whole = match[2];
  const frac = match[3] ?? "";
  const allZero = /^[0]*$/.test(whole) && /^[0]*$/.test(frac);
  if (allZero) return "flat";
  return sign === "-" ? "down" : "up";
}

export function formatSignedRupees(value: string | null | undefined): string {
  const formatted = formatRupees(value);
  if (formatted === "—" || formatted === "₹0" || formatted.startsWith("-")) {
    return formatted;
  }
  return `+${formatted}`;
}

export function formatSignedPercent(value: string | null | undefined, digits = 2): string {
  return formatPercent(value, { digits, signed: true });
}

export function formatXirr(value: string | null | undefined): string {
  if (value == null) return "—";
  return formatPercent(toPercentString(value), { digits: 1 });
}

export function todayGainLine(gain: string, pct: string | null): string {
  const gainStr = formatSignedRupees(gain);
  if (pct == null) {
    return `Today's Gain: ${gainStr}`;
  }
  return `Today's Gain: ${gainStr} (${formatPercent(pct, { digits: 2 })})`;
}

export function partialChipText(missing: MissingFund[]): string {
  if (!missing || missing.length === 0) return "";
  return `${missing.length} on last known NAV`;
}

function toPaise(s: string): bigint | null {
  const match = s.trim().match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  if (!match) return null;
  const isNeg = match[1] === "-";
  const whole = match[2];
  const frac = (match[3] ?? "").padEnd(2, "0").slice(0, 2);
  const paise = BigInt(whole + frac);
  return isNeg ? -paise : paise;
}

export function shareOf(value: string, total: string): string | null {
  const vParsed = toPaise(value);
  const tParsed = toPaise(total);
  if (vParsed == null || tParsed == null) return null;
  if (tParsed <= 0n) return null;
  const vEffective = vParsed < 0n ? 0n : vParsed;

  const scaled = (vEffective * 1000000n + tParsed / 2n) / tParsed;
  const whole = (scaled / 10000n).toString();
  const frac = (scaled % 10000n).toString().padStart(4, "0");
  return `${whole}.${frac}`;
}

export function memberTitleName(name: string): string {
  if (!name) return "";
  if (/[a-z]/.test(name)) return name;
  return name
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

export function memberInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const initials = words.slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return initials || "?";
}

export function memberColor(index: number): string {
  return `var(--c${(index % 8) + 1})`;
}
