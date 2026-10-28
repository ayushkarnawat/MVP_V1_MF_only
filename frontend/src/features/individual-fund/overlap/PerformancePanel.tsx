import { useState } from "react";
import { LineAreaChart } from "@/components/ui/charts";
import { fundPageApi } from "../api";
import { SectionState } from "../components/SectionState";
import { Segmented } from "../components/Segmented";
import { DEFAULT_PERIOD, PERFORMANCE_PERIODS, unavailableText } from "../fundCopy";
import {
  alignToDates,
  axisLabel,
  changeDirection,
  formatDate,
  formatSignedPercent,
} from "../fundFormat";
import type { PerformancePeriod, PerformanceResponse } from "../types";
import { useFundSection } from "../useFundSection";

const SINCE_LAUNCH_NOTE =
  "One of these funds is younger than the selected period, so its line starts at its launch date.";

function returnClass(val: string | null | undefined): string {
  const dir = changeDirection(val);
  if (dir === "up") return "text-[var(--pos-text)]";
  if (dir === "down") return "text-[var(--neg-text)]";
  return "text-[var(--ui-text)]";
}

export interface PerformancePanelProps {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
}

export function PerformancePanel({
  aId,
  bId,
  aName,
  bName,
}: PerformancePanelProps) {
  const [period, setPeriod] = useState<PerformancePeriod>(DEFAULT_PERIOD);

  const a = useFundSection<PerformanceResponse>(
    (signal) => fundPageApi.performance(aId, period, signal),
    [aId, period]
  );
  const b = useFundSection<PerformanceResponse>(
    (signal) => fundPageApi.performance(bId, period, signal),
    [bId, period]
  );

  const status =
    a.status === "loading" || b.status === "loading"
      ? "loading"
      : a.status === "error" || b.status === "error"
        ? "error"
        : "ready";

  const handleRetry = () => {
    a.retry();
    b.retry();
  };

  const primary = a.data ?? b.data;
  const dates = primary ? primary.fund.map((p) => p.date) : [];

  const series = [];
  if (a.data) {
    series.push({
      key: "a",
      name: aName,
      color: "var(--c2)",
      area: true,
      values: alignToDates(a.data.fund, dates),
    });
  }
  if (b.data) {
    series.push({
      key: "b",
      name: bName,
      color: "var(--c3)",
      values: alignToDates(b.data.fund, dates),
    });
  }

  const retA = a.data?.period_returns.fund;
  const retB = b.data?.period_returns.fund;
  const retFmtA = retA ? formatSignedPercent(retA, 1) : "—";
  const retFmtB = retB ? formatSignedPercent(retB, 1) : "—";

  const hasYoungFund = Boolean(a.data?.since_launch || b.data?.since_launch);

  return (
    <div className="space-y-4">
      <Segmented
        label="Comparison period"
        options={PERFORMANCE_PERIODS.map((p) => ({ value: p, label: p }))}
        value={period}
        onChange={(val) => setPeriod(val as PerformancePeriod)}
      />

      <SectionState
        status={status}
        label="performance comparison"
        onRetry={handleRetry}
      >
        <div className="space-y-4">
          <ul aria-label="Chart legend" className="flex flex-wrap items-center gap-4 text-xs">
            <li data-testid="perf-legend-a" className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--c2)" }}
                aria-hidden="true"
              />
              <span className="text-[var(--ui-text-muted)]">{aName}</span>
              <b className={`font-semibold ${returnClass(retA)}`}>{retFmtA}</b>
            </li>
            <li data-testid="perf-legend-b" className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--c3)" }}
                aria-hidden="true"
              />
              <span className="text-[var(--ui-text-muted)]">{bName}</span>
              <b className={`font-semibold ${returnClass(retB)}`}>{retFmtB}</b>
            </li>
          </ul>

          {series.length > 0 && (
            <LineAreaChart
              series={series}
              labels={(i) => axisLabel(dates[i] ?? "", period)}
              tooltipLabel={(i) => formatDate(dates[i])}
              formatValue={(v) => formatSignedPercent(String(v), 1)}
              ariaLabel={`Performance comparison chart for ${period}`}
              height={250}
            />
          )}

          <table aria-label="Performance comparison" className="w-full text-left text-xs">
            <thead className="border-b border-[var(--ui-divider)]">
              <tr className="font-medium text-[var(--ui-text-muted)]">
                <th scope="col" className="pb-2 pr-4 font-medium">Period</th>
                <th scope="col" className="pb-2 pr-4 font-medium">{aName}</th>
                <th scope="col" className="pb-2 pl-4 font-medium">{bName}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ui-divider)]">
              <tr>
                <th scope="row" className="py-2.5 pr-4 font-medium text-[var(--ui-text)]">
                  {period === "All" ? "Return since launch" : `${period} return`}
                </th>
                <td
                  data-testid="perf-return-a"
                  className={`py-2.5 pr-4 tabular-nums ${returnClass(retA)}`}
                >
                  {retFmtA}
                </td>
                <td
                  data-testid="perf-return-b"
                  className={`py-2.5 pl-4 tabular-nums ${returnClass(retB)}`}
                >
                  {retFmtB}
                </td>
              </tr>
            </tbody>
          </table>

          {a.status === "unavailable" && (
            <p data-testid="perf-unavailable-a" className="text-xs text-[var(--ui-text-muted)]">
              {`${aName}: ${unavailableText(a.reason)}`}
            </p>
          )}

          {b.status === "unavailable" && (
            <p data-testid="perf-unavailable-b" className="text-xs text-[var(--ui-text-muted)]">
              {`${bName}: ${unavailableText(b.reason)}`}
            </p>
          )}

          {hasYoungFund && (
            <p data-testid="perf-note" className="text-xs text-[var(--ui-text-muted)]">
              {SINCE_LAUNCH_NOTE}
            </p>
          )}
        </div>
      </SectionState>
    </div>
  );
}
