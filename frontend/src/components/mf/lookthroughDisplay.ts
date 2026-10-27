/** Keep financial arithmetic exact; Number conversions belong only to SVG geometry. */
function parts(value: string): { units: bigint; scale: number } {
  const match = value.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!match) return { units: 0n, scale: 0 };
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? "0");
  const units = BigInt(match[2] + fraction) * 10n ** BigInt(Math.max(0, exponent - fraction.length));
  return { units: match[1] === "-" ? -units : units, scale: Math.max(0, fraction.length - exponent) };
}

function decimal(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  return `${negative ? "-" : ""}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`;
}

export function percentageProduct(fundWeight: string, stockWeight: string): string {
  const a = parts(fundWeight);
  const b = parts(stockWeight);
  return decimal(a.units * b.units, a.scale + b.scale + 2);
}

export function formatPercent(value: string, places = 2): string {
  const { units, scale } = parts(value);
  const abs = units < 0n ? -units : units;
  const divisor = 10n ** BigInt(Math.max(0, scale - places));
  const rounded = scale > places
    ? (abs + divisor / 2n) / divisor
    : abs * 10n ** BigInt(places - scale);
  return decimal(units < 0n && rounded !== 0n ? -rounded : rounded, places);
}

export function holdingsDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}
