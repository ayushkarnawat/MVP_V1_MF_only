import { formatPercent } from "./homeFormat";
import type { ClassRowOut } from "./types";

export interface LiveClassRow {
  key: string;
  label: string;
  value: string;
  percentage: string;
  color: string;
}

interface ParsedDecimal {
  sign: 1 | -1;
  intPart: string;
  fracPart: string;
  isZero: boolean;
}

function parseDecimal(s: string): ParsedDecimal {
  let str = s.trim();
  if (str.startsWith("+")) {
    str = str.slice(1);
  }
  let sign: 1 | -1 = 1;
  if (str.startsWith("-")) {
    sign = -1;
    str = str.slice(1);
  }

  const [intRaw = "", fracRaw = ""] = str.split(".");
  const intTrimmed = intRaw.replace(/^0+/, "");
  const fracTrimmed = fracRaw.replace(/0+$/, "");

  const isZero = intTrimmed === "" && fracTrimmed === "";
  if (isZero) {
    return { sign: 1, intPart: "0", fracPart: "", isZero: true };
  }

  return {
    sign,
    intPart: intTrimmed === "" ? "0" : intTrimmed,
    fracPart: fracRaw,
    isZero: false,
  };
}

export function compareDecimalStrings(a: string, b: string): -1 | 0 | 1 {
  const da = parseDecimal(a);
  const db = parseDecimal(b);

  if (da.isZero && db.isZero) {
    return 0;
  }
  if (da.isZero) {
    return db.sign === 1 ? -1 : 1;
  }
  if (db.isZero) {
    return da.sign === 1 ? 1 : -1;
  }

  if (da.sign !== db.sign) {
    return da.sign === 1 ? 1 : -1;
  }

  let result: -1 | 0 | 1 = 0;
  if (da.intPart.length !== db.intPart.length) {
    result = da.intPart.length < db.intPart.length ? -1 : 1;
  } else if (da.intPart !== db.intPart) {
    result = da.intPart < db.intPart ? -1 : 1;
  } else {
    const maxFrac = Math.max(da.fracPart.length, db.fracPart.length);
    const fa = da.fracPart.padEnd(maxFrac, "0");
    const fb = db.fracPart.padEnd(maxFrac, "0");
    if (fa !== fb) {
      result = fa < fb ? -1 : 1;
    }
  }

  if (da.sign === -1) {
    return (result === 0 ? 0 : -result) as -1 | 0 | 1;
  }
  return result;
}

export function liveRows(classes: ClassRowOut[]): LiveClassRow[] {
  const live = classes.filter((c) => c.status === "live");
  const normalized = live.map((c) => ({
    key: c.key,
    label: c.label,
    value: c.value ?? "0",
    percentage: c.percentage ?? "0",
  }));

  const nonZero = normalized.filter(
    (row) => compareDecimalStrings(row.value, "0") !== 0
  );
  const zero = normalized.filter(
    (row) => compareDecimalStrings(row.value, "0") === 0
  );

  nonZero.sort((a, b) => compareDecimalStrings(b.value, a.value));

  const nonZeroWithColor: LiveClassRow[] = nonZero.map((row, index) => ({
    ...row,
    color: `var(--c${Math.min(index + 1, 8)})`,
  }));

  const zeroWithColor: LiveClassRow[] = zero.map((row) => ({
    ...row,
    color: "var(--ui-divider)",
  }));

  return [...nonZeroWithColor, ...zeroWithColor];
}

export function soonRows(classes: ClassRowOut[]): ClassRowOut[] {
  return classes.filter((c) => c.status === "coming_soon");
}

export function formatLegendPercent(p: string | null | undefined): string {
  if (p == null) {
    return "—";
  }
  return formatPercent(p, { digits: 1 });
}

export function memberColor(index: number): string {
  return `var(--c${(index % 8) + 1})`;
}

export function memberInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.charAt(0).toUpperCase();
}

export function memberTitleName(name: string): string {
  if (!name) {
    return "";
  }
  if (/[a-z]/.test(name)) {
    return name;
  }
  return name.toLowerCase().replace(/\b[a-z]/g, (char) => char.toUpperCase());
}
