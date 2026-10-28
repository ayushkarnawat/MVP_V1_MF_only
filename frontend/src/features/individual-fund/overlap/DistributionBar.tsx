import { useState } from "react";
import { formatPercent } from "@/lib/format";
import type { OverlapDistribution } from "../types";
import {
  barWidth,
  distributionSegments,
  stocks,
  type DistributionKey,
} from "./overlapLogic";

const SEGMENT_COLORS: Record<DistributionKey, string> = {
  unique_to_fund: "var(--c2)",
  common: "var(--c3)",
  unique_to_others: "var(--c4)",
};

export interface DistributionBarProps {
  distribution: OverlapDistribution;
}

export function DistributionBar({ distribution }: DistributionBarProps) {
  const [selected, setSelected] = useState<DistributionKey | null>(null);
  const segments = distributionSegments(distribution);

  const handleToggle = (key: DistributionKey) => {
    setSelected((prev) => (prev === key ? null : key));
  };

  const selectedSegment = segments.find((s) => s.key === selected);

  return (
    <div role="group" aria-label="Overlap distribution" className="space-y-3">
      <div aria-hidden="true" className="flex h-[3px] w-full overflow-hidden rounded-full bg-[var(--ui-divider)]">
        {segments.map((segment) => {
          const isSelected = selected === segment.key;
          const isDimmed = selected !== null && !isSelected;
          return (
            <div
              key={segment.key}
              data-testid={`distribution-segment-${segment.key}`}
              data-pct={segment.pct}
              data-selected={isSelected ? "true" : "false"}
              data-dimmed={isDimmed ? "true" : "false"}
              title={`${segment.label}: ${stocks(segment.count)}, ${formatPercent(segment.pct, { digits: 1 })}`}
              onClick={() => handleToggle(segment.key)}
              style={{
                width: `${barWidth(segment.pct, "100")}%`,
                background: SEGMENT_COLORS[segment.key],
              }}
              className={`h-full cursor-pointer transition-opacity ${isDimmed ? "opacity-25" : ""}`}
            />
          );
        })}
      </div>

      <ul className="space-y-1.5">
        {segments.map((segment) => {
          const isSelected = selected === segment.key;
          const isDimmed = selected !== null && !isSelected;
          return (
            <li key={segment.key}>
              <button
                type="button"
                aria-pressed={isSelected}
                data-testid={`distribution-row-${segment.key}`}
                onClick={() => handleToggle(segment.key)}
                className={`flex w-full items-center justify-between py-1 text-xs transition-opacity ${
                  isDimmed ? "opacity-60" : ""
                }`}
              >
                <span className="font-medium text-[var(--ui-text)]">{segment.label}</span>
                <span className="text-[var(--ui-text-muted)]">{`${stocks(segment.count)} · ${formatPercent(segment.pct, { digits: 1 })}`}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p data-testid="distribution-selected" aria-live="polite" className="text-xs text-[var(--ui-text-muted)]">
        {selectedSegment
          ? `${selectedSegment.label}: ${stocks(selectedSegment.count)}, ${formatPercent(selectedSegment.pct, { digits: 1 })} of the stocks across all your funds.`
          : ""}
      </p>
    </div>
  );
}
