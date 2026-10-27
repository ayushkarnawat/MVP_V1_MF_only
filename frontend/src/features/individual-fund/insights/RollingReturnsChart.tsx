import { useRef, useState } from "react";
import { LineAreaChart } from "@/components/ui/charts";
import { formatPercent } from "@/lib/format";
import { fundPageApi } from "../api";
import { SectionState } from "../components/SectionState";
import {
  DEFAULT_ROLLING_WINDOW,
  ROLLING_WINDOWS,
  rollingUnavailableText,
} from "../fundCopy";
import { axisLabel, fillGaps, formatDate } from "../fundFormat";
import type { RollingResponse, RollingWindow } from "../types";
import { useFundSection } from "../useFundSection";

export interface RollingReturnsChartProps {
  schemeId: string;
}

const LINE_CONFIG = [
  { key: "fund" as const, label: "Fund", color: "var(--c2)" },
  { key: "benchmark" as const, label: "Benchmark", color: "var(--c3)" },
  {
    key: "category" as const,
    label: "Category average",
    color: "var(--ui-text-muted)",
  },
];

export function RollingReturnsChart({ schemeId }: RollingReturnsChartProps) {
  const [windowYears, setWindowYears] = useState<RollingWindow>(
    DEFAULT_ROLLING_WINDOW
  );
  const [hidden, setHidden] = useState<
    Record<"fund" | "benchmark" | "category", boolean>
  >({
    fund: false,
    benchmark: false,
    category: false,
  });

  const rolling = useFundSection<RollingResponse>(
    (signal) => fundPageApi.rolling(schemeId, windowYears, signal),
    [schemeId, windowYears]
  );

  const lastReadyRef = useRef<{
    schemeId: string;
    data: RollingResponse;
  } | null>(null);

  if (rolling.status === "ready" && rolling.data) {
    lastReadyRef.current = { schemeId, data: rolling.data };
  }

  const shown: RollingResponse | null =
    rolling.status === "ready" && rolling.data
      ? rolling.data
      : rolling.status === "loading" &&
          lastReadyRef.current?.schemeId === schemeId
        ? lastReadyRef.current.data
        : null;

  const sectionStatus = shown ? "ready" : rolling.status;

  const toggleHidden = (key: "fund" | "benchmark" | "category") => {
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderBody = (data: RollingResponse) => {
    const points = data.points;
    const values = {
      fund: fillGaps(points.map((p) => p.fund)),
      benchmark: fillGaps(points.map((p) => p.benchmark)),
      category: fillGaps(points.map((p) => p.category)),
    };

    const drawnLines = LINE_CONFIG.filter(
      (line) => line.key === "fund" || values[line.key] !== null
    );

    const years = data.window_years;

    return (
      <div className="space-y-4">
        <ul
          aria-label="Rolling returns legend"
          className="flex flex-wrap items-center gap-4 text-xs"
        >
          {drawnLines.map((line) => (
            <li key={line.key}>
              <button
                type="button"
                aria-pressed={!hidden[line.key]}
                data-testid={`rolling-legend-${line.key}`}
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
          data-testid="rolling-chart-wrap"
          {...(rolling.status === "loading" ? { "aria-busy": "true" } : {})}
        >
          <LineAreaChart
            series={drawnLines.map((line) => ({
              key: line.key,
              name: line.label,
              color: line.color,
              values: values[line.key] ?? [],
              visible: !hidden[line.key],
              ...(line.key === "fund" ? { area: true } : {}),
            }))}
            labels={(index) => axisLabel(points[index]?.date ?? "", "1Y")}
            tooltipLabel={(index) =>
              `${formatDate(points[index]?.date)}, ${years}-year window`
            }
            formatValue={(value) =>
              formatPercent(String(value), { digits: 1 })
            }
            ariaLabel={`Rolling returns, ${years}-year window`}
            height={230}
          />
        </div>
      </div>
    );
  };

  return (
    <section
      aria-labelledby="rolling-title"
      className="space-y-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3
          id="rolling-title"
          className="text-base font-semibold text-[var(--ui-text)]"
        >
          Rolling Returns
        </h3>
        <select
          aria-label="Rolling window"
          value={windowYears}
          onChange={(e) =>
            setWindowYears(Number(e.target.value) as RollingWindow)
          }
          className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3 py-1.5 text-xs text-[var(--ui-text)]"
        >
          {ROLLING_WINDOWS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {rolling.status === "unavailable" ? (
        <p
          data-testid="rolling-note"
          className="text-sm text-[var(--ui-text-muted)]"
        >
          {rollingUnavailableText(rolling.reason, windowYears)}
        </p>
      ) : (
        <SectionState
          status={sectionStatus}
          label="rolling returns"
          reason={rolling.reason}
          onRetry={rolling.retry}
        >
          {shown && renderBody(shown)}
        </SectionState>
      )}
    </section>
  );
}
