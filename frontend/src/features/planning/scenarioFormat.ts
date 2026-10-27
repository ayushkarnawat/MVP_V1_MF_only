import { compareDecimalStrings, diffDecimalStrings, formatDecimal } from "@/lib/decimal";
import { formatPercent, formatRupees } from "@/lib/format";
import type { ResultShape, ScenarioSummary } from "./types";

export type Tone = "gain" | "loss" | "neutral";

export interface BarScale {
  zero: number;
  widths: number[];
  sides: ("left" | "right")[];
}

export function toneOf(value: string | null | undefined): Tone {
  if (value == null) return "neutral";
  const trimmed = value.trim();
  if (!/^[+-]?\d+(\.\d*)?$/.test(trimmed)) return "neutral";
  const cmp = compareDecimalStrings(trimmed, "0");
  if (cmp > 0) return "gain";
  if (cmp < 0) return "loss";
  return "neutral";
}

export function signedPct(value: string | null, digits = 1): string {
  if (value === null) return "—";
  const formatted = formatPercent(value, { digits, signed: true });
  if (formatted === "—") return "—";
  return formatted.replaceAll("-", "−");
}

export function signedRupees(value: string | null): string {
  if (value === null) return "—";
  const formatted = formatRupees(value);
  if (formatted === "—" || formatted === "₹0") return formatted;
  if (formatted.startsWith("-")) return "−" + formatted.slice(1);
  return "+" + formatted;
}

export function outperformedBy(portfolioPct: string | null, benchmarkPct: string | null): string | null {
  if (portfolioPct === null || benchmarkPct === null) return null;
  return formatDecimal(diffDecimalStrings(portfolioPct, benchmarkPct));
}

export function barScale(values: string[]): BarScale {
  const numbers = values.map(Number);
  const min = Math.min(0, ...numbers);
  const max = Math.max(0, ...numbers);
  const range = max - min || 1;
  const zero = max <= 0 ? 100 : min >= 0 ? 0 : (-min / range) * 100;
  const widths = numbers.map(n => (Math.abs(n) / range) * 100);
  const sides: ("left" | "right")[] = numbers.map(n => (n < 0 ? "left" : "right"));
  return { zero, widths, sides };
}

export function resolveShape(scenario: ScenarioSummary): ResultShape {
  if (scenario.scenario_type === "HYPOTHETICAL") return "hypothetical";
  if (scenario.had_redemption_freeze_schemes && scenario.had_redemption_freeze_schemes.length > 0) {
    return "redemption_freeze";
  }
  if (scenario.parent_scenario_id === null && scenario.has_phases) {
    return "multi_phase";
  }
  return "standard";
}

const KNOWN_BENCHMARKS: Record<string, string> = {
  nifty_50: "Nifty 50",
  nifty_500: "Nifty 500",
  nifty_largemidcap_250: "Nifty LargeMidcap 250",
  nifty_midcap_150: "Nifty Midcap 150",
  nifty_smallcap_250: "Nifty Smallcap 250",
};

export function benchmarkLabel(name: string): string {
  if (Object.hasOwn(KNOWN_BENCHMARKS, name)) {
    return KNOWN_BENCHMARKS[name];
  }
  if (name.includes("_")) {
    return name
      .split("_")
      .map(word => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : ""))
      .join(" ");
  }
  return name;
}

export function titleName(name: string): string {
  if (!name) return "";
  if (/[a-z]/.test(name)) return name;
  return name
    .toLowerCase()
    .split(" ")
    .map(word => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

export function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
