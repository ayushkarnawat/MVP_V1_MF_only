import { Info } from "lucide-react";
import { WealthGraph } from "@/components/wealth-graph/WealthGraph";
import { ChangeBadge } from "../components/ChangeBadge";
import type { DateRange } from "../components/DateRangeCalendar";
import { HideValuesButton } from "../components/HideValuesButton";
import { PartialDataBadge } from "../../../components/PartialDataBadge";
import { periodLabel, wealthCaption } from "../homeCopy";
import { formatRupees } from "../homeFormat";
import type {
  BenchmarkOptionOut,
  HomePeriod,
  WealthSeriesResponse,
} from "../types";

export interface WealthCardProps {
  status: "loading" | "error" | "data";
  data: WealthSeriesResponse | null;
  scope: "aggregate" | "member";
  memberName?: string | null;
  period: HomePeriod;
  onPeriodChange: (period: HomePeriod) => void;
  customRange: DateRange;
  onCustomRangeChange: (range: DateRange) => void;
  today: string;
  benchmarkOptions: BenchmarkOptionOut[];
  benchmarks: string[];
  onBenchmarksChange: (values: string[]) => void;
  hidden: boolean;
  onToggleHidden: () => void;
  onRetry: () => void;
  onImport: () => void;
  onInfo?: () => void;
  // The previous period's series is still on screen while the new one loads: dim it and say so.
  refreshing?: boolean;
}

export function WealthCard({
  status,
  data,
  scope,
  memberName,
  period,
  onPeriodChange,
  customRange,
  onCustomRangeChange,
  today,
  benchmarkOptions,
  benchmarks,
  onBenchmarksChange,
  hidden,
  onToggleHidden,
  onRetry,
  onImport,
  onInfo,
  refreshing = false,
}: WealthCardProps) {
  const captionText = wealthCaption(scope, memberName);

  const captionOnly = (
    <span
      data-testid="wealth-caption"
      className="text-sm font-medium text-[var(--ui-text-muted)]"
    >
      {captionText}
    </span>
  );

  const captionWithInfo = (
    <div className="flex items-center gap-2">
      {captionOnly}
      {onInfo && (
        <button
          type="button"
          aria-label="How is this calculated?"
          onClick={onInfo}
          className="rounded text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
        >
          <Info size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const isError = status === "error" || (status !== "loading" && !data);

  const headline =
    status === "data" && data && !data.empty ? (
      <>
        {/* Headline row */}
        <div className="flex items-baseline gap-3">
          <span
            data-testid="wealth-total"
            className="text-3xl font-bold tracking-tight text-[var(--ui-text)] tabular-nums"
          >
            {hidden ? "••••••" : formatRupees(data.end_value)}
          </span>
          <HideValuesButton hidden={hidden} onToggle={onToggleHidden} />
        </div>

        {/* Change row */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ChangeBadge
            amount={data.change_amount}
            pct={data.change_pct}
            hidden={hidden}
          />
          <span className="text-[var(--ui-text-muted)]">
            {refreshing ? "Updating…" : `Portfolio change ${periodLabel(period)}`}
          </span>
        </div>
      </>
    ) : undefined;

  return (
    <WealthGraph
      status={status}
      data={data}
      period={period}
      onPeriodChange={onPeriodChange}
      customRange={customRange}
      onCustomRangeChange={onCustomRangeChange}
      today={today}
      benchmarkOptions={benchmarkOptions}
      benchmarks={benchmarks}
      onBenchmarksChange={onBenchmarksChange}
      hideValues={hidden}
      refreshing={refreshing}
      onRetry={onRetry}
      onImport={onImport}
      headerLeft={isError ? captionOnly : captionWithInfo}
      headerRightExtra={
        data && data.partial ? <PartialDataBadge missingFunds={data.missing_funds} /> : undefined
      }
      headline={headline}
    />
  );
}
