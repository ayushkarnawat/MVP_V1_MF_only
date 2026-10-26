import { useId } from "react";
import { coversCaption } from "../planningCopy";
import { signedPct, signedRupees, slugify, toneOf } from "../scenarioFormat";
import type { ScenarioAssetClass } from "../types";
import { DivergingBars, type BarRow, type BarTone } from "./DivergingBars";

export interface AssetClassChartProps {
  rows: ScenarioAssetClass[];
  coveredValue: string | null;
  totalValue: string | null;
}

export function AssetClassChart({ rows, coveredValue, totalValue }: AssetClassChartProps) {
  const titleId = useId();

  if (rows.length === 0) {
    return null;
  }

  const caption = coversCaption(coveredValue, totalValue);

  const barRows: BarRow[] = rows.map(row => {
    const money = signedRupees(row.rupee_impact);
    const percent = row.pct === null ? null : signedPct(row.pct);
    const text = percent === null ? money : `${money} ${percent}`;
    const name = percent === null ? `${row.bucket}, ${money}` : `${row.bucket}, ${money}, ${percent}`;
    const tone: BarTone = toneOf(row.rupee_impact) === "loss" ? "loss" : "gain";
    return {
      key: slugify(row.bucket),
      label: row.bucket,
      value: row.rupee_impact,
      text,
      name,
      tone,
    };
  });

  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4"
    >
      <h3
        id={titleId}
        className="mb-3 font-heading text-sm font-semibold text-[var(--ui-text)]"
      >
        Impact by asset class
      </h3>
      <DivergingBars rows={barRows} ariaLabel="Impact by asset class" />
      {caption !== null && (
        <p className="mt-2.5 text-[11.5px] text-[var(--ui-text-muted)]">
          {caption}
        </p>
      )}
    </section>
  );
}
