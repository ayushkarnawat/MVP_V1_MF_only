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
