import { compareDecimalStrings, toPercentString } from "@/lib/decimal";

/** Expand Python Decimal exponent notation using digits only, before exact math. */
export function normalizeReturnFraction(value: string): string {
  const match = value.match(/^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
  if (!match) return value;
  const digits = match[2] + (match[3] ?? "");
  // The exponent is a digit-position count, never a conversion of the return value.
  const point = match[2].length + Number(match[4]);
  const unsigned = point <= 0 ? `0.${"0".repeat(-point)}${digits}`
    : point >= digits.length ? digits.padEnd(point, "0")
    : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return `${match[1] === "-" ? "-" : ""}${unsigned}`;
}

/** Raw return fraction to the existing signed, two-place percentage display. */
export function formatRawFractionPercent(value: string | null): string {
  if (value === null) return "N/A";
  const percent = toPercentString(normalizeReturnFraction(value));
  return `${compareDecimalStrings(percent, "0") > 0 ? "+" : ""}${percent}%`;
}
