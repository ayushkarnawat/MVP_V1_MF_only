import { useState } from "react";
import { PieChart, PieSlice } from "@/components/ui/charts";
import { formatPercent, formatRupees } from "@/lib/format";
import type { OverlapCompareResponse } from "../types";
import { stocks } from "./overlapLogic";

export type ImpactKey = "common_both" | "unique_a" | "unique_b" | "other_funds";

export interface ComparisonOverviewProps {
  data: OverlapCompareResponse;
}

export function ComparisonOverview({ data }: ComparisonOverviewProps) {
  const [selected, setSelected] = useState<ImpactKey | null>(null);

  const rows: {
    key: ImpactKey;
    label: string;
    baseColor: string;
    amount: string;
    pct: string;
  }[] = [
    {
      key: "common_both",
      label: "Common to both funds",
      baseColor: "var(--c2)",
      amount: data.impact.common_both.amount,
      pct: data.impact.common_both.pct,
    },
    {
      key: "unique_a",
      label: `Only in ${data.fund_a.scheme_name}`,
      baseColor: "var(--c3)",
      amount: data.impact.unique_a.amount,
      pct: data.impact.unique_a.pct,
    },
    {
      key: "unique_b",
      label: `Only in ${data.fund_b.scheme_name}`,
      baseColor: "var(--c4)",
      amount: data.impact.unique_b.amount,
      pct: data.impact.unique_b.pct,
    },
    {
      key: "other_funds",
      label: "Your other funds",
      baseColor: "var(--c6)",
      amount: data.impact.other_funds.amount,
      pct: data.impact.other_funds.pct,
    },
  ];

  const drawnRows = rows.filter((r) => Number(r.pct) > 0);
  const pieData = drawnRows.map((r) => ({
    label: r.label,
    value: Number(r.pct),
    color: selected === null || selected === r.key ? r.baseColor : "var(--ui-divider)",
    formattedValue: r.pct,
  }));

  const selectedRow = rows.find((r) => r.key === selected);
  const centreFigure = formatPercent(
    selectedRow ? selectedRow.pct : data.impact.common_both.pct,
    { digits: 1 }
  );
  const centreLabel = selectedRow
    ? selectedRow.label
    : "combined weight of common holdings";

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div
          data-testid="count-unique-a"
          className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
        >
          <dt className="text-xs font-medium text-[var(--ui-text-muted)]">
            Unique to {data.fund_a.scheme_name}
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
            {data.counts.unique_a}
          </dd>
        </div>

        <div
          data-testid="count-common"
          className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
        >
          <dt className="text-xs font-medium text-[var(--ui-text-muted)]">
            Common holdings
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
            {data.counts.common}
          </dd>
        </div>

        <div
          data-testid="count-unique-b"
          className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
        >
          <dt className="text-xs font-medium text-[var(--ui-text-muted)]">
            Unique to {data.fund_b.scheme_name}
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
            {data.counts.unique_b}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col items-center gap-6 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 sm:flex-row">
        <div
          data-testid="impact-donut"
          role="img"
          aria-label="Impact on your portfolio"
          className="relative h-[180px] w-[180px] shrink-0"
        >
          <PieChart
            data={pieData}
            size={180}
            innerRadius={62}
            padAngle={0.02}
            cornerRadius={3}
            className="h-full w-full"
          >
            {pieData.map((slice, index) => (
              <PieSlice key={slice.label} index={index} />
            ))}
          </PieChart>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-3 text-center">
            <span
              data-testid="impact-centre-figure"
              className="text-xl font-bold text-[var(--ui-text)]"
            >
              {centreFigure}
            </span>
            <span
              data-testid="impact-centre-label"
              className="text-[11px] text-[var(--ui-text-muted)] leading-tight line-clamp-2"
            >
              {centreLabel}
            </span>
          </div>
        </div>

        <div className="w-full flex-1 space-y-3">
          <ul aria-label="Impact on your portfolio" className="space-y-2">
            {rows.map((r) => {
              const isSelected = selected === r.key;
              const isDimmed = selected !== null && !isSelected;
              return (
                <li key={r.key}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    data-testid={`impact-row-${r.key}`}
                    data-dimmed={isDimmed ? "true" : "false"}
                    onClick={() =>
                      setSelected((prev) => (prev === r.key ? null : r.key))
                    }
                    className={`flex w-full items-center justify-between rounded-md py-1.5 text-xs transition-opacity ${
                      isDimmed ? "opacity-60" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium text-[var(--ui-text)]">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: r.baseColor }}
                        aria-hidden="true"
                      />
                      <span>{r.label}</span>
                    </span>
                    <span className="text-[var(--ui-text-muted)]">
                      {`${formatRupees(r.amount)} · ${formatPercent(r.pct, { digits: 1 })}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-[var(--ui-text-muted)]">
            {`${stocks(data.counts.common)} in common. Amounts are the value of those holdings across both funds, as a share of your portfolio.`}
          </p>
        </div>
      </div>
    </div>
  );
}
