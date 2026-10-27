// frontend/src/lib/format.ts

export interface PercentOptions {
  digits?: number;
  signed?: boolean;
}

export type ScoreBand = {
  word: string;
  color: string;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDecimal(value: string | null | undefined): { isNegative: boolean; intPartStr: string; fracPartStr: string } | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const match = s.match(/^([+-]?)(\d+)(?:\.(\d*))?$/);
  if (!match) return null;
  return {
    isNegative: match[1] === "-",
    intPartStr: match[2],
    fracPartStr: match[3] ?? "",
  };
}

function roundToWhole(parsed: { isNegative: boolean; intPartStr: string; fracPartStr: string }): { isNegative: boolean; whole: bigint } {
  let whole = BigInt(parsed.intPartStr);
  if (parsed.fracPartStr.length > 0 && parsed.fracPartStr[0] >= "5") {
    whole += 1n;
  }
  const isNegative = whole > 0n && parsed.isNegative;
  return { isNegative, whole };
}

function formatIndianInteger(n: bigint): string {
  const s = n.toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

export function formatRupees(value: string | null | undefined): string {
  const parsed = parseDecimal(value);
  if (!parsed) return "—";
  const { isNegative, whole } = roundToWhole(parsed);
  if (whole === 0n) return "₹0";
  const formatted = formatIndianInteger(whole);
  return isNegative ? `-₹${formatted}` : `₹${formatted}`;
}

export function formatCompactRupees(value: string | null | undefined): string {
  const parsed = parseDecimal(value);
  if (!parsed) return "—";
  const { isNegative, whole: r } = roundToWhole(parsed);

  if (r < 100000n) {
    return formatRupees(value);
  }

  const prefix = isNegative ? "-₹" : "₹";

  if (r < 10000000n) {
    const remLakh = r % 1000n;
    const hundredthsLakh = r / 1000n + (remLakh >= 500n ? 1n : 0n);
    if (hundredthsLakh < 10000n) {
      const intPart = hundredthsLakh / 100n;
      const fracPart = (hundredthsLakh % 100n).toString().padStart(2, "0");
      return `${prefix}${intPart}.${fracPart} L`;
    }
  }

  const remCr = r % 100000n;
  const hundredthsCr = r / 100000n + (remCr >= 50000n ? 1n : 0n);
  const intPart = hundredthsCr / 100n;
  const fracPart = (hundredthsCr % 100n).toString().padStart(2, "0");
  return `${prefix}${intPart}.${fracPart} Cr`;
}

export function formatPercent(value: string | null | undefined, options?: PercentOptions): string {
  const parsed = parseDecimal(value);
  if (!parsed) return "—";

  const digits = options?.digits ?? 1;
  const signed = options?.signed ?? false;

  let scaled: bigint;
  if (digits === 0) {
    scaled = BigInt(parsed.intPartStr);
    if (parsed.fracPartStr.length > 0 && parsed.fracPartStr[0] >= "5") {
      scaled += 1n;
    }
  } else {
    const frac = parsed.fracPartStr;
    if (frac.length > digits) {
      const kept = frac.slice(0, digits);
      const checkDigit = frac[digits];
      scaled = BigInt(parsed.intPartStr + kept);
      if (checkDigit >= "5") {
        scaled += 1n;
      }
    } else {
      const padded = frac.padEnd(digits, "0");
      scaled = BigInt(parsed.intPartStr + padded);
    }
  }

  let formattedNum: string;
  if (digits === 0) {
    formattedNum = scaled.toString();
  } else {
    const divisor = 10n ** BigInt(digits);
    const intPart = scaled / divisor;
    const fracPart = (scaled % divisor).toString().padStart(digits, "0");
    formattedNum = `${intPart}.${fracPart}`;
  }

  if (scaled === 0n) {
    return `${formattedNum}%`;
  }
  if (parsed.isNegative) {
    return `-${formattedNum}%`;
  }
  if (signed) {
    return `+${formattedNum}%`;
  }
  return `${formattedNum}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (iso == null) return "—";
  const s = String(iso).trim();
  if (s.length < 10) return "—";
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (!match) return "—";
  const year = match[1];
  const monthStr = match[2];
  const day = match[3];
  const monthNum = Number(monthStr);
  if (monthNum < 1 || monthNum > 12) return "—";
  return `${day} ${MONTH_NAMES[monthNum - 1]} ${year}`;
}

export function scoreBand(finalScore: number): ScoreBand {
  if (typeof finalScore !== "number" || !isFinite(finalScore)) {
    return { word: "Poor", color: "#C1272D" };
  }
  if (finalScore >= 85) return { word: "Excellent", color: "#15803D" };
  if (finalScore >= 70) return { word: "Strong", color: "#22C55E" };
  if (finalScore >= 55) return { word: "Good", color: "#65A30D" };
  if (finalScore >= 40) return { word: "Average", color: "#CA8A04" };
  if (finalScore >= 25) return { word: "Weak", color: "#EA580C" };
  return { word: "Poor", color: "#C1272D" };
}
