import type { MoverBarOut, MoversView } from "./types";

function parseToPaise(val: string | null | undefined): bigint {
  if (val == null) return 0n;
  const s = String(val).trim();
  if (!s) return 0n;
  const match = s.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  if (!match) return 0n;
  const isNegative = match[1] === "-";
  const intPart = BigInt(match[2]);
  const fracRaw = match[3] ?? "";
  const frac3 = (fracRaw + "000").slice(0, 3);
  let paise = intPart * 100n + BigInt(frac3.slice(0, 2));
  if (frac3[2] >= "5") {
    paise += 1n;
  }
  return isNegative ? -paise : paise;
}

export function sumDecimals(values: string[]): string {
  let totalPaise = 0n;
  for (const v of values) {
    totalPaise += parseToPaise(v);
  }
  const isNegative = totalPaise < 0n;
  const absPaise = isNegative ? -totalPaise : totalPaise;
  const whole = absPaise / 100n;
  const frac = (absPaise % 100n).toString().padStart(2, "0");
  return `${isNegative ? "-" : ""}${whole.toString()}.${frac}`;
}

export function splitShares(
  gains: MoverBarOut[],
  losses: MoverBarOut[],
  othersChange: string,
): { gained: string; lost: string; gainedPct: number } {
  const othersPaise = parseToPaise(othersChange);

  const gainValues = gains.map(b => b.change);
  if (othersPaise > 0n) {
    gainValues.push(othersChange);
  }
  const gainedSum = sumDecimals(gainValues);
  const gained = gainedSum.startsWith("-") ? "0.00" : gainedSum;

  const lossValues = losses.map(b => b.change);
  if (othersPaise < 0n) {
    lossValues.push(othersChange);
  }
  const lossSum = sumDecimals(lossValues);
  const lost = lossSum.startsWith("-") ? lossSum.slice(1) : lossSum;

  const gPaise = parseToPaise(gained);
  const lPaise = parseToPaise(lost);
  const totalPaise = gPaise + lPaise;

  if (totalPaise === 0n) {
    return { gained, lost, gainedPct: 0 };
  }

  const pct = (Number(gPaise) / Number(totalPaise)) * 100;
  const gainedPct = Math.round(pct * 10) / 10;

  return { gained, lost, gainedPct };
}

export function barHalfWidth(change: string, maxAbs: number): number {
  const abs = Math.abs(Number(change));
  if (abs <= 0 || maxAbs <= 0 || !isFinite(abs) || !isFinite(maxAbs)) {
    return 0;
  }
  return Math.min(50, Math.round((abs / maxAbs) * 500) / 10);
}

export function groupLabel(view: MoversView): string {
  switch (view) {
    case "sector":
      return "Sector";
    case "category":
      return "Category";
    case "fund":
      return "Fund";
  }
}

export function barSubtitle(bar: MoverBarOut): string {
  const count = bar.funds ? bar.funds.length : 0;
  if (count === 0) return "";
  if (count === 1) return "1 fund";
  return `${count} funds`;
}

export function othersLabel(count: number): string {
  if (count === 1) return "1 other";
  return `${count} others`;
}
