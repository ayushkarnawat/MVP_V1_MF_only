import { useState } from "react";
import { formatPercent, formatRupees } from "../../../lib/format";
import type { AnalyticsCardProps } from "../allocation/allocationLogic";
import { SectionCard } from "../common/SectionCard";
import { SlicedDonut } from "../common/charts";
import type { OverlapSummary, Slice } from "../types";
import { impactBreakdown } from "./overlapLogic";

const COLORS: Record<string, string> = {
  top3: "var(--neg)",
  other: "var(--warn-text)",
  unique: "var(--c2)",
};

export function ImpactDonut({
  state,
  data,
  onRetry,
}: AnalyticsCardProps<OverlapSummary>) {
  const [selectedKey, setSelectedKey] = useState<string | null>("top3");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const count = data ? Math.min(3, data.pairs_above_low.length) : 0;
  const rows = data ? impactBreakdown(data) : [];

  const slices: Slice[] = rows.map(r => ({
    key: r.key,
    label: r.label,
    value: r.value,
    pct: r.pct,
    color: COLORS[r.key] ?? "var(--c1)",
  }));

  const headline =
    rows.length > 0
      ? count === 1
        ? `${formatPercent(rows[0].pct, { digits: 1 })} of portfolio in top overlapping pair`
        : `${formatPercent(rows[0].pct, { digits: 1 })} of portfolio in top ${count} overlapping pairs`
      : "";

  return (
    <SectionCard
      title="4. Overlap Impact"
      info="How much of your portfolio sits in funds that overlap with another fund, and how much sits in funds that do not."
      state={state}
      onRetry={onRetry}
    >
      {data && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--ui-text-muted)]">
            How much of your portfolio sits in overlapping vs. unique holdings.
          </p>

          {count === 0 ? (
            <p data-testid="impact-empty" className="text-sm text-[var(--ui-text-muted)]">
              No fund pairs overlap above the low band, so none of your portfolio sits in overlapping funds.
            </p>
          ) : (
            <>
              <p data-testid="impact-headline" className="text-sm font-semibold text-[var(--ui-text)]">
                {headline}
              </p>

              <div className="flex flex-col items-center gap-6 md:flex-row md:items-center md:justify-around">
                <SlicedDonut
                  slices={slices}
                  selectedKey={selectedKey}
                  onSelect={setSelectedKey}
                  activeKey={activeKey}
                  onActiveChange={setActiveKey}
                  centre={{
                    label: "Portfolio",
                    value: formatRupees(data.total_portfolio_value),
                  }}
                  ariaLabel="Overlap impact chart"
                />

                <ul aria-label="Overlap impact" className="w-full max-w-sm space-y-2">
                  {slices.map(item => {
                    const isSelected = selectedKey === item.key;
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          data-testid={`impact-row-${item.key}`}
                          data-selected={isSelected}
                          data-clickable=""
                          data-effect="select"
                          onClick={() => setSelectedKey(item.key)}
                          className={`flex w-full items-center justify-between rounded-xl p-2.5 text-xs transition-colors ${
                            isSelected
                              ? "bg-[var(--ui-card)] font-medium shadow-sm ring-1 ring-[var(--ui-divider)]"
                              : "hover:bg-[var(--ui-row-hover)]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-[var(--ui-text)]">{item.label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span data-testid={`impact-pct-${item.key}`} className="font-semibold text-[var(--ui-text)]">
                              {formatPercent(item.pct, { digits: 1 })}
                            </span>
                            <span data-testid={`impact-value-${item.key}`} className="text-[var(--ui-text-muted)]">
                              {formatRupees(item.value)}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}
