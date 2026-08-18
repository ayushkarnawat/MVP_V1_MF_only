/**
 * Exact decimal-string arithmetic for money/units/NAV values that arrive
 * from the backend as strings (Python Decimal, JSON-serialized as `str` —
 * see every dashboard response schema). Summing these via `parseFloat`
 * accumulates IEEE-754 float error across additions; this works in integer
 * minor units instead, so the result is exact regardless of how many values
 * are summed. Parsing the *final* result to a number for display formatting
 * (a single, non-accumulating conversion) is fine — this module exists for
 * the accumulation step, not to ban Number() everywhere.
 */

function addDecimalStrings(a: string, b: string): string {
  const [aWhole, aFrac = ""] = (a || "0").split(".");
  const [bWhole, bFrac = ""] = (b || "0").split(".");
  const scale = Math.max(aFrac.length, bFrac.length);

  const toScaled = (whole: string, frac: string): bigint => {
    const negative = whole.startsWith("-");
    const digits = whole.replace("-", "") || "0";
    const scaled = BigInt(digits + frac.padEnd(scale, "0"));
    return negative ? -scaled : scaled;
  };

  const sumScaled = toScaled(aWhole, aFrac) + toScaled(bWhole, bFrac);
  const negative = sumScaled < 0n;
  const abs = negative ? -sumScaled : sumScaled;
  const divisor = 10n ** BigInt(scale);
  const wholePart = (abs / divisor).toString();
  const fracPart = scale > 0 ? `.${(abs % divisor).toString().padStart(scale, "0")}` : "";
  return `${negative ? "-" : ""}${wholePart}${fracPart}`;
}

export function sumDecimalStrings(values: string[]): string {
  return values.reduce((acc, v) => addDecimalStrings(acc, v || "0"), "0");
}

function subtractDecimalStrings(a: string, b: string): string {
  const [bWhole, bFrac = ""] = (b || "0").split(".");
  const negatedB = bWhole.startsWith("-")
    ? `${bWhole.slice(1)}${bFrac ? `.${bFrac}` : ""}`
    : `-${bWhole || "0"}${bFrac ? `.${bFrac}` : ""}`;
  return addDecimalStrings(a, negatedB);
}

/** Exact decimal-string subtraction (a - b), for display-only diffs (e.g.
 * TER savings, category outperformance) where the operands are already
 * rounded backend strings — avoids compounding float error before the
 * single, final Number() conversion for formatting. */
export function diffDecimalStrings(a: string, b: string): string {
  return subtractDecimalStrings(a || "0", b || "0");
}

/** Converts a raw decimal-fraction string (e.g. backend XIRR "0.1645", for
 * 16.45%) into an exact percentage display string ("16.45") by shifting the
 * decimal point 2 places right — not by multiplying as a float — so the
 * fraction-to-percent conversion never introduces error before display.
 * Rounds half-up beyond 2 fractional digits (xirr()'s Newton-Raphson output
 * is rarely round) rather than truncating, and normalizes signed zero. */
export function toPercentString(val: string): string {
  const negative = val.startsWith("-");
  const unsigned = negative ? val.slice(1) : val;
  const [whole, frac = ""] = (unsigned || "0").split(".");
  const paddedFrac = frac.padEnd(2, "0");
  const percentWhole = (whole + paddedFrac.slice(0, 2)).replace(/^0+(?=\d)/, "") || "0";
  const percentFracRest = paddedFrac.slice(2); // digits after the shifted decimal point
  const cents = percentFracRest.slice(0, 2).padEnd(2, "0");
  const roundUp = (percentFracRest.charAt(2) || "0") >= "5";

  // A single BigInt on "whole*100 + cents" makes a carry (e.g. 99 cents -> a
  // new whole digit) fall out for free, with no separate carry-propagation logic.
  const combined = BigInt(percentWhole) * 100n + BigInt(cents) + (roundUp ? 1n : 0n);
  if (combined === 0n) return "0.00"; // normalizes "-0.00" from a negative near-zero input
  const combinedStr = combined.toString().padStart(3, "0");
  const roundedWhole = combinedStr.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
  const roundedCents = combinedStr.slice(-2);
  return `${negative ? "-" : ""}${roundedWhole}.${roundedCents}`;
}

/** Formats a money value (string or number, already-summed/exact) as
 * Indian-locale currency digits with no decimal places, e.g. "1,23,456".
 * Callers prepend the ₹ symbol themselves. */
export function formatIndianCurrency(valStr: string | number): string {
  const num = typeof valStr === "string" ? parseFloat(valStr) : valStr;
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(num);
}
