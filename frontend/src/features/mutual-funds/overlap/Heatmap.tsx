import { useMemo } from "react";
import { formatPercent } from "../../../lib/format";
import type { AnalyticsCardProps } from "../allocation/allocationLogic";
import { SectionCard } from "../common/SectionCard";
import type { OverlapPair, OverlapSummary } from "../types";
import {
  type Band,
  bandLegendText,
  bandOf,
  barWidth,
  findPair,
  fundInitials,
  highestPair,
  pairKey,
  pairKeyOf,
} from "./overlapLogic";
import { PairDetail } from "./PairDetail";

export interface HeatmapProps extends AnalyticsCardProps<OverlapSummary> {
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export function Heatmap({
  state,
  data,
  onRetry,
  selectedKey,
  onSelect,
}: HeatmapProps) {
  const pairMap = useMemo(() => {
    const map = new Map<string, OverlapPair>();
    if (!data) return map;
    for (const p of data.matrix) {
      map.set(pairKeyOf(p), p);
    }
    return map;
  }, [data]);

  const largest = useMemo(() => {
    if (!data) return "0";
    const top = highestPair(data);
    return top ? top.overlap_pct : "0";
  }, [data]);

  const selectedPair = data ? findPair(data, selectedKey) : null;

  return (
    <SectionCard
      title="2. Overlap Heatmap"
      info="Every fund pair's overlap %, based on shared stock weight. Click a cell for its shared-stock list."
      state={state}
      onRetry={onRetry}
    >
      {data && (
        <div className="space-y-4">
          <p data-testid="heatmap-scope" className="text-xs text-[var(--ui-text-muted)]">
            {data.matrix_truncated
              ? `Top ${data.matrix_funds.length} funds by value, out of ${data.total_fund_count} covered funds`
              : "Covered funds, largest portfolio value first"}
          </p>

          <p className="text-xs text-[var(--ui-text-muted)]">
            Click any cell to see the stocks shared between that pair.
          </p>

          <ul aria-label="Overlap bands" className="flex flex-wrap items-center gap-2">
            {(["low", "moderate", "high"] as Band[]).map(band => {
              const bg =
                band === "low"
                  ? "var(--pos-bg)"
                  : band === "moderate"
                    ? "var(--warn-bg)"
                    : "var(--neg-bg)";
              const text =
                band === "low"
                  ? "var(--pos-text)"
                  : band === "moderate"
                    ? "var(--warn-text)"
                    : "var(--neg-text)";
              return (
                <li
                  key={band}
                  data-testid={`legend-${band}`}
                  data-band={band}
                  style={{ backgroundColor: bg, color: text }}
                  className="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold"
                >
                  {bandLegendText(band, data.bands)}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="overflow-x-auto">
              <table aria-label="Overlap heatmap" className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th aria-hidden="true" className="p-2" />
                    {data.matrix_funds.map(f => (
                      <th
                        key={f.scheme_id}
                        scope="col"
                        data-testid={`hm-col-${f.scheme_id}`}
                        title={f.scheme_name}
                        className="p-2 font-semibold text-[var(--ui-text)] text-center min-w-[52px]"
                      >
                        {fundInitials(f.scheme_name)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.matrix_funds.map(rf => (
                    <tr key={rf.scheme_id}>
                      <th
                        scope="row"
                        data-testid={`hm-row-${rf.scheme_id}`}
                        title={rf.scheme_name}
                        className="p-2 font-semibold text-[var(--ui-text)] text-left min-w-[52px]"
                      >
                        {fundInitials(rf.scheme_name)}
                      </th>
                      {data.matrix_funds.map(cf => {
                        if (rf.scheme_id === cf.scheme_id) {
                          return (
                            <td key={cf.scheme_id} className="p-1 text-center">
                              <span
                                data-testid={`cell-${rf.scheme_id}-${cf.scheme_id}`}
                                tabIndex={0}
                                title="A fund is not compared with itself."
                                data-tooltip="A fund is not compared with itself."
                                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-sm text-[var(--ui-text-muted)]"
                              >
                                —
                              </span>
                            </td>
                          );
                        }

                        const key = pairKey(rf.scheme_id, cf.scheme_id);
                        const p = pairMap.get(key);
                        if (!p) {
                          return (
                            <td key={cf.scheme_id} className="p-1 text-center">
                              <span className="inline-flex h-11 w-11 items-center justify-center text-sm text-[var(--ui-text-muted)]">
                                —
                              </span>
                            </td>
                          );
                        }

                        const overlap_pct = p.overlap_pct;
                        const band = bandOf(overlap_pct, data.bands);
                        const isSelected = selectedKey === key;
                        const tip = `${rf.scheme_name} × ${cf.scheme_name}: ${formatPercent(overlap_pct, { digits: 2 })} overlap`;

                        const cellBg =
                          band === "low"
                            ? "var(--pos-bg)"
                            : band === "moderate"
                              ? "var(--warn-bg)"
                              : "var(--neg-bg)";
                        const cellText =
                          band === "low"
                            ? "var(--pos-text)"
                            : band === "moderate"
                              ? "var(--warn-text)"
                              : "var(--neg-text)";

                        return (
                          <td key={cf.scheme_id} className="p-1 text-center">
                            <button
                              type="button"
                              data-testid={`cell-${rf.scheme_id}-${cf.scheme_id}`}
                              data-key={key}
                              data-band={band}
                              data-selected={isSelected}
                              aria-pressed={isSelected}
                              aria-label={tip}
                              title={tip}
                              data-clickable=""
                              data-effect="select"
                              onClick={() => onSelect(key)}
                              style={{ backgroundColor: cellBg, color: cellText }}
                              className={`relative flex h-11 w-11 flex-col items-center justify-center rounded-lg font-semibold transition-shadow ${
                                isSelected ? "ring-2 ring-offset-1 ring-[var(--ui-text)] shadow-sm" : "hover:opacity-90"
                              }`}
                            >
                              <span>{formatPercent(overlap_pct, { digits: 0 })}</span>
                              <div className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded-full bg-[var(--ui-divider)] overflow-hidden">
                                <span
                                  data-testid={`cell-bar-${rf.scheme_id}-${cf.scheme_id}`}
                                  style={{
                                    width: `${barWidth(overlap_pct, largest)}%`,
                                    backgroundColor: cellText,
                                  }}
                                  className="block h-full"
                                />
                              </div>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedPair && (
              <PairDetail
                pair={selectedPair}
                band={bandOf(selectedPair.overlap_pct, data.bands)}
              />
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
