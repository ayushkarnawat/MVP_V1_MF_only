import { useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { GroupedBarChart } from "@/components/ui/charts";
import { fundPageApi } from "../api";
import { SectionState } from "../components/SectionState";
import { Segmented } from "../components/Segmented";
import {
  DEFAULT_PERIOD,
  PERFORMANCE_PERIODS,
  periodReturnsNote,
} from "../fundCopy";
import { barLabel, formatDate, formatSignedPercent } from "../fundFormat";
import type {
  PeriodBucket,
  PeriodReturnsPeriod,
  PeriodReturnsResponse,
} from "../types";
import { useFundSection } from "../useFundSection";

export interface PeriodReturnsChartProps {
  schemeId: string;
}

const SERIES_CONFIG = [
  { key: "fund" as const, label: "Fund", color: "var(--c2)" },
  { key: "benchmark" as const, label: "Benchmark", color: "var(--c3)" },
  {
    key: "category" as const,
    label: "Category average",
    color: "var(--ui-text-muted)",
  },
];

export function PeriodReturnsChart({ schemeId }: PeriodReturnsChartProps) {
  const [period, setPeriod] = useState<PeriodReturnsPeriod>(DEFAULT_PERIOD);
  const [hidden, setHidden] = useState<
    Record<"fund" | "benchmark" | "category", boolean>
  >({
    fund: false,
    benchmark: false,
    category: false,
  });
  const [selected, setSelected] = useState<PeriodBucket | null>(null);

  const returns = useFundSection<PeriodReturnsResponse>(
    (signal) => fundPageApi.periodReturns(schemeId, period, signal),
    [schemeId, period]
  );

  const lastReadyRef = useRef<{
    schemeId: string;
    data: PeriodReturnsResponse;
  } | null>(null);

  if (returns.status === "ready" && returns.data) {
    lastReadyRef.current = { schemeId, data: returns.data };
  }

  const shown: PeriodReturnsResponse | null =
    returns.status === "ready" && returns.data
      ? returns.data
      : returns.status === "loading" &&
          lastReadyRef.current?.schemeId === schemeId
        ? lastReadyRef.current.data
        : null;

  const sectionStatus = shown ? "ready" : returns.status;

  const toggleHidden = (key: "fund" | "benchmark" | "category") => {
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderBody = (data: PeriodReturnsResponse) => {
    const present = SERIES_CONFIG.filter((s) =>
      data.buckets.some((b) => b[s.key] !== null)
    );
    const drawn = present.filter((s) => !hidden[s.key]);

    return (
      <div className="space-y-4">
        <ul
          aria-label="Period returns legend"
          className="flex flex-wrap items-center gap-4 text-xs"
        >
          {present.map((line) => (
            <li key={line.key}>
              <button
                type="button"
                aria-pressed={!hidden[line.key]}
                data-testid={`period-legend-${line.key}`}
                onClick={() => toggleHidden(line.key)}
                className={`inline-flex items-center gap-1.5 font-medium text-[var(--ui-text)] ${
                  hidden[line.key] ? "opacity-50" : ""
                }`}
              >
                <i
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: line.color }}
                />
                <span>{line.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <div
          data-testid="period-chart-wrap"
          {...(returns.status === "loading" ? { "aria-busy": "true" } : {})}
        >
          <GroupedBarChart
            buckets={data.buckets.map((bucket) => ({
              label: barLabel(data.bucket, bucket.label),
              values: drawn.map((s) =>
                bucket[s.key] === null ? 0 : Number(bucket[s.key])
              ),
            }))}
            seriesColors={drawn.map((s) => s.color)}
            formatValue={(value) => formatSignedPercent(String(value), 1)}
            ariaLabel={`Period returns for ${data.period}`}
            onBucketClick={(index) => {
              if (index >= 0 && index < data.buckets.length) {
                setSelected(data.buckets[index]);
              }
            }}
            height={230}
          />
        </div>

        <p
          data-testid="period-note"
          className="text-xs text-[var(--ui-text-muted)]"
        >
          {periodReturnsNote(data.bucket, data.period)}
        </p>
      </div>
    );
  };

  return (
    <section
      aria-labelledby="period-title"
      className="space-y-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3
          id="period-title"
          className="text-base font-semibold text-[var(--ui-text)]"
        >
          Period Returns
        </h3>
        <Segmented
          label="Period Returns range"
          options={PERFORMANCE_PERIODS.map((value) => ({
            value,
            label: value,
          }))}
          value={period}
          onChange={(val) => setPeriod(val as PeriodReturnsPeriod)}
        />
      </div>

      <SectionState
        status={sectionStatus}
        label="period returns"
        reason={returns.reason}
        onRetry={returns.retry}
      >
        {shown && renderBody(shown)}
      </SectionState>

      {selected !== null && (
        <Modal
          isOpen
          onClose={() => setSelected(null)}
          title={selected.label}
        >
          <dl className="divide-y divide-[var(--ui-divider)]">
            <div
              data-testid="bar-popup-row"
              className="flex justify-between gap-3 py-2 text-sm"
            >
              <dt className="text-[var(--ui-text-muted)]">Fund</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {selected.fund !== null
                  ? formatSignedPercent(selected.fund, 1)
                  : "—"}
              </dd>
            </div>
            <div
              data-testid="bar-popup-row"
              className="flex justify-between gap-3 py-2 text-sm"
            >
              <dt className="text-[var(--ui-text-muted)]">Benchmark</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {selected.benchmark !== null
                  ? formatSignedPercent(selected.benchmark, 1)
                  : "—"}
              </dd>
            </div>
            <div
              data-testid="bar-popup-row"
              className="flex justify-between gap-3 py-2 text-sm"
            >
              <dt className="text-[var(--ui-text-muted)]">
                Category average
              </dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {selected.category !== null
                  ? formatSignedPercent(selected.category, 1)
                  : "—"}
              </dd>
            </div>
            <div
              data-testid="bar-popup-row"
              className="flex justify-between gap-3 py-2 text-sm"
            >
              <dt className="text-[var(--ui-text-muted)]">Period</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {`${formatDate(selected.start)} to ${formatDate(selected.end)}`}
              </dd>
            </div>
          </dl>
        </Modal>
      )}
    </section>
  );
}
