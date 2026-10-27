import { formatPercent } from "../../../lib/format";
import type { OverlapSummary } from "../types";
import {
  analysedCount,
  BAND_WORD,
  excludedNote,
  highestPair,
  pairCount,
  pairsWithOverlap,
  riskBand as getRiskBand,
  riskNote,
} from "./overlapLogic";

export interface StatStripProps {
  summary: OverlapSummary;
}

export function StatStrip({ summary }: StatStripProps) {
  const low = formatPercent(summary.bands.low, { digits: 0 });
  const high = formatPercent(summary.bands.high, { digits: 0 });
  const grid = summary.matrix_funds.length;
  const { analysed, of, excluded } = analysedCount(summary);

  const top = highestPair(summary);
  const band = getRiskBand(summary);

  const fundsTip = "Funds with published holdings that could be looked through, out of all the funds we tried to analyse.";
  const pairsTip = "Pairs of your funds whose overlap is at or above the moderate band, out of every possible pair in the grid.";
  const highestTip = "The pair of funds that shares the largest part of its stock holdings.";
  const riskTip = `Banded from the highest overlap: Low below ${low}, Moderate from ${low} to below ${high}, High from ${high} up.`;

  const riskBg =
    band === "low"
      ? "var(--pos-bg)"
      : band === "moderate"
        ? "var(--warn-bg)"
        : band === "high"
          ? "var(--neg-bg)"
          : undefined;

  return (
    <div data-testid="stat-strip" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Funds analysed */}
      <div
        data-testid="stat-funds"
        tabIndex={0}
        title={fundsTip}
        data-tooltip={fundsTip}
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
      >
        <p className="text-xs font-medium text-[var(--ui-text-muted)]">Funds analysed</p>
        <p data-testid="stat-funds-value" className="mt-1 text-2xl font-bold text-[var(--ui-text)]">
          {analysed} of {of}
        </p>
        <p data-testid="stat-funds-note" className="mt-1 text-xs text-[var(--ui-text-muted)]">
          {excludedNote(excluded)}
        </p>
      </div>

      {/* 2. Fund pairs with overlap */}
      <div
        data-testid="stat-pairs"
        tabIndex={0}
        title={pairsTip}
        data-tooltip={pairsTip}
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
      >
        <p className="text-xs font-medium text-[var(--ui-text-muted)]">Fund pairs with overlap</p>
        <p data-testid="stat-pairs-value" className="mt-1 text-2xl font-bold text-[var(--ui-text)]">
          {pairsWithOverlap(summary)} of {pairCount(grid)}
        </p>
        <p data-testid="stat-pairs-note" className="mt-1 text-xs text-[var(--ui-text-muted)]">
          at moderate (≥{low}) or higher — possible pairs across your {grid} equity funds
        </p>
      </div>

      {/* 3. Highest overlap */}
      <div
        data-testid="stat-highest"
        tabIndex={0}
        title={highestTip}
        data-tooltip={highestTip}
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
      >
        <p className="text-xs font-medium text-[var(--ui-text-muted)]">Highest overlap</p>
        <p data-testid="stat-highest-value" className="mt-1 text-2xl font-bold text-[var(--ui-text)]">
          {top ? formatPercent(top.overlap_pct, { digits: 0 }) : "—"}
        </p>
        <p data-testid="stat-highest-note" className="mt-1 text-xs text-[var(--ui-text-muted)]">
          {top ? `${top.fund_a.scheme_name} × ${top.fund_b.scheme_name}` : "needs at least two funds"}
        </p>
      </div>

      {/* 4. Overlap risk */}
      <div
        data-testid="stat-risk"
        tabIndex={0}
        title={riskTip}
        data-tooltip={riskTip}
        data-band={band ?? undefined}
        style={riskBg ? { backgroundColor: riskBg } : undefined}
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
      >
        <p className="text-xs font-medium text-[var(--ui-text-muted)]">Overlap risk</p>
        <p data-testid="stat-risk-value" className="mt-1 text-2xl font-bold text-[var(--ui-text)]">
          {band ? BAND_WORD[band] : "—"}
        </p>
        <p data-testid="stat-risk-note" className="mt-1 text-xs text-[var(--ui-text-muted)]">
          {riskNote(band)}
        </p>
      </div>
    </div>
  );
}
