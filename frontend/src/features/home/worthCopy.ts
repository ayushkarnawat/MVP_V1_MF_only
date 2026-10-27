import { formatDate, formatPercent, scoreBand } from "./homeFormat";
import { sumDecimals } from "./moversCopy";
import type { WorthCardOut } from "./types";

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && isFinite(value)) {
    return String(value);
  }
  return null;
}

export function formatMonthYear(iso: string | null | undefined): string {
  const formatted = formatDate(iso);
  if (formatted === "—") return "—";
  const parts = formatted.trim().split(/\s+/);
  if (parts.length < 3) return "—";
  return `${parts[1]} ${parts[2]}`;
}

export function percentPointDifference(a: string, b: string): string {
  const trimmedB = b.trim();
  let negatedB: string;
  if (trimmedB.startsWith("-")) {
    negatedB = trimmedB.slice(1);
  } else if (trimmedB.startsWith("+")) {
    negatedB = "-" + trimmedB.slice(1);
  } else {
    negatedB = "-" + trimmedB;
  }
  return sumDecimals([a, negatedB]);
}

export function worthChip(kind: WorthCardOut["kind"]): string {
  switch (kind) {
    case "weak_fund":
    case "underperforming":
      return "Performance";
    case "high_expense":
      return "Cost";
    case "concentration":
      return "Concentration";
  }
}

export function worthHeadline(card: WorthCardOut): string {
  const fund = card.scheme_name?.trim() ? card.scheme_name.trim() : "This fund";

  switch (card.kind) {
    case "weak_fund":
      return `${fund} is among the weakest in its category`;
    case "underperforming":
      return `${fund} is lagging its category`;
    case "high_expense":
      return `${fund} costs more than its category`;
    case "concentration": {
      const top = str(card.evidence?.top5_pct);
      const earlier = str(card.evidence?.earlier_top5_pct);
      if (top != null && earlier != null) {
        const diff = percentPointDifference(top, earlier);
        if (!diff.startsWith("-") && diff !== "0.00") {
          return "Your portfolio is becoming more concentrated";
        }
      }
      return "A large share of your portfolio sits in a few stocks";
    }
  }
}

export function scoreChip(
  card: WorthCardOut,
): { text: string; color: string } | null {
  if (card.kind !== "weak_fund") return null;
  const raw = card.evidence?.final_score;
  if (raw == null) return null;
  if (typeof raw === "string" && !raw.trim()) return null;
  const num = Number(raw);
  if (!isFinite(num) || isNaN(num)) return null;
  const band = scoreBand(num);
  return { text: `Score: ${band.word}`, color: band.color };
}

export function worthDetail(card: WorthCardOut): string {
  if (card.kind === "weak_fund") {
    const share = str(card.evidence?.share_pct);
    if (share != null) {
      return `This fund is ${formatPercent(share, { digits: 1 })} of your portfolio and sits in the lowest group for its category.`;
    }
  } else if (card.kind === "high_expense") {
    const gap = str(card.evidence?.gap_pp);
    if (gap != null) {
      return `${gap} percentage points above the average for the same plan type.`;
    }
  }
  return "";
}

export function costScale(
  ter: string,
  avg: string,
): { tick: number; dot: number } {
  const t = Math.max(0, Number(ter) || 0);
  const a = Math.max(0, Number(avg) || 0);
  const scaleMax = Math.max(1.5, t, a);
  const tick = Math.round((a / scaleMax) * 1000) / 10;
  const dot = Math.round((t / scaleMax) * 1000) / 10;
  return { tick, dot };
}

export function comparisonBars(
  fund: string,
  category: string,
): {
  fund: { width: number; side: "gain" | "loss" };
  category: { width: number; side: "gain" | "loss" };
} {
  const fVal = Number(fund) || 0;
  const cVal = Number(category) || 0;
  const fAbs = Math.abs(fVal);
  const cAbs = Math.abs(cVal);
  const scale = Math.max(fAbs, cAbs, 1);

  const fWidth = Math.round((fAbs / scale) * 500) / 10;
  const cWidth = Math.round((cAbs / scale) * 500) / 10;

  return {
    fund: { width: fWidth, side: fVal < 0 ? "loss" : "gain" },
    category: { width: cWidth, side: cVal < 0 ? "loss" : "gain" },
  };
}

export function concentrationTrend(
  evidence: Record<string, unknown>,
): { chip: string; earlier: string } | null {
  const top = str(evidence.top5_pct);
  const earlier = str(evidence.earlier_top5_pct);
  if (top == null || earlier == null) {
    return null;
  }

  const diff = percentPointDifference(top, earlier);
  const isNeg = diff.startsWith("-");
  const absDiff = isNeg ? diff.slice(1) : diff;
  const parts = absDiff.split(".");
  let points = BigInt(parts[0] || "0");
  if (parts[1] && parts[1][0] >= "5") {
    points += 1n;
  }

  const chip =
    points === 0n ? "No change" : isNeg ? `▼ ${points} pts` : `▲ ${points} pts`;
  const earlierText = `${formatPercent(earlier, { digits: 0 })} earlier`;

  return { chip, earlier: earlierText };
}
