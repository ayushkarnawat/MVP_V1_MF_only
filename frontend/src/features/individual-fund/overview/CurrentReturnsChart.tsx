import type { ReactNode } from "react";
import { Clock } from "lucide-react";
import { GroupedBarChart } from "@/components/ui/charts";
import { benchmarkDisplayName } from "@/lib/benchmarkDisplay";
import { formatPercent } from "@/lib/format";
import { useScope } from "@/shell/scope/ScopeContext";
import { SectionState } from "../components/SectionState";
import { columnHeader } from "../fundCopy";
import type { CurrentReturnsResponse, ReturnsResponse } from "../types";
import type { FundSection } from "../useFundSection";

export interface CurrentReturnsChartProps {
  /** The Current returns the page already fetched for the table. */
  current: FundSection<ReturnsResponse>;
  fundName: string;
  /** The Model Portfolio Returns | Actual XIRR toggle, drawn above the legend. */
  toggleSlot: ReactNode;
  onShowModel: () => void;
}

const NO_BENCHMARK_NOTE: Record<string, string> = {
  no_benchmark: "No benchmark applies to this fund type, so only your holding is shown.",
  no_history: "Benchmark history is not available yet, so only your holding is shown.",
};

function Legend({ items }: { items: { color: string; name: string }[] }) {
  return (
    <ul aria-label="Chart legend" className="flex flex-wrap items-center gap-3 text-xs">
      {items.map((item) => (
        <li key={item.name} className="inline-flex items-center gap-1.5 px-2 py-1">
          <i aria-hidden="true" style={{ background: item.color }} className="inline-block h-2 w-2 rounded-full" />
          <span className="text-[var(--ui-text-muted)]">{item.name}</span>
        </li>
      ))}
    </ul>
  );
}

function Bars({ data, fundName }: { data: CurrentReturnsResponse; fundName: string }) {
  const bench = data.rows.benchmark_same_flows;
  const buckets = data.columns.map((col) => {
    const holding = data.rows.holding_xirr[col];
    const other = bench ? bench[col] : null;
    // The chart draws a missing value as a zero-height bar; the dash in the label says it is missing, not zero.
    const missing = holding == null && other == null;
    return {
      label: missing ? `${columnHeader(col)} —` : columnHeader(col),
      values: bench ? [holding == null ? 0 : Number(holding), other == null ? 0 : Number(other)] : [holding == null ? 0 : Number(holding)],
    };
  });
  const benchName = `${benchmarkDisplayName(data.benchmark_label || "Benchmark")}, same cash flows`;
  const note = bench === null ? NO_BENCHMARK_NOTE[data.benchmark_reason ?? ""] : null;
  return (
    <div className="space-y-4">
      <Legend items={[{ color: "var(--c2)", name: "Your holding (XIRR)" }, ...(bench ? [{ color: "var(--c3)", name: benchName }] : [])]} />
      <GroupedBarChart
        buckets={buckets}
        seriesColors={bench ? ["var(--c2)", "var(--c3)"] : ["var(--c2)"]}
        formatValue={(value) => formatPercent(String(value), { digits: 1 })}
        ariaLabel={`Actual XIRR for ${fundName}`}
        height={250}
      />
      {note && <p data-testid="current-chart-note" className="text-xs text-[var(--ui-text-muted)]">{note}</p>}
    </div>
  );
}

export function CurrentReturnsChart({ current, fundName, toggleSlot, onShowModel }: CurrentReturnsChartProps) {
  const { selectedMember } = useScope();
  const notHeld = current.status === "unavailable" && current.reason === "not_held";
  return (
    <section aria-labelledby="perf-title" className="space-y-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4">
      <div data-testid="perf-toggle-slot">{toggleSlot}</div>
      <h3 id="perf-title" className="text-base font-semibold text-[var(--ui-text)]">
        Performance
      </h3>
      {notHeld ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-[var(--ui-divider)] p-5">
          <Clock className="h-5 w-5 text-[var(--ui-text-muted)]" aria-hidden="true" />
          <p className="font-semibold text-[var(--ui-text)]">
            {selectedMember ? `${selectedMember.name} does not hold this fund` : "No one in your family holds this fund"}
          </p>
          <p className="text-sm text-[var(--ui-text-muted)]">
            Actual XIRR uses your own purchases of a fund. Model Portfolio Returns shows how the fund itself has done.
          </p>
          <button type="button" onClick={onShowModel} className="rounded-lg border border-[var(--ui-divider)] px-3 py-1.5 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)]">
            Show Model Portfolio Returns
          </button>
        </div>
      ) : (
        <SectionState status={current.status} label="returns" reason={current.reason} onRetry={current.retry}>
          {current.data && current.data.mode === "current" ? <Bars data={current.data} fundName={fundName} /> : null}
        </SectionState>
      )}
    </section>
  );
}
