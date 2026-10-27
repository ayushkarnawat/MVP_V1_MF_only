import { useState } from "react";
import { PieChart, PieSlice, type PieData } from "@/components/ui/charts";
import {
  formatCompactRupees,
  formatDate,
  formatPercent,
} from "@/lib/format";
import { SectionState } from "../components/SectionState";
import { Segmented } from "../components/Segmented";
import {
  ALLOCATION_TABS,
  allocationNote,
  marketCapLabel,
  type AllocationTab,
} from "../fundCopy";
import { changeDirection } from "../fundFormat";
import type { CompositionResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { SliceDialog, type SelectedSlice } from "./holdingDialogs";

export interface FundAllocationProps {
  composition: FundSection<CompositionResponse>;
  currentValue: string | null;
}

const COLORS = [
  "var(--c2)",
  "var(--c3)",
  "var(--c4)",
  "var(--c6)",
  "var(--c5)",
  "var(--c7)",
  "var(--c1)",
];

export function FundAllocation({
  composition,
  currentValue,
}: FundAllocationProps) {
  const [tab, setTab] = useState<AllocationTab>("market_cap");
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<SelectedSlice | null>(null);

  const { data } = composition;

  let rawRows: { key: string; label: string; pct: string }[] = [];
  if (data?.allocation) {
    if (tab === "market_cap") {
      rawRows = (data.allocation.market_cap ?? [])
        .filter((item) => changeDirection(item.pct) === "up")
        .map((item) => ({
          key: item.label,
          label: marketCapLabel(item.label),
          pct: item.pct,
        }));
    } else if (tab === "sector") {
      rawRows = (data.allocation.sector ?? [])
        .filter((item) => changeDirection(item.pct) === "up")
        .map((item) => ({
          key: item.label,
          label: item.label,
          pct: item.pct,
        }));
    } else if (tab === "asset_type") {
      rawRows = (data.allocation.asset_type ?? [])
        .filter((item) => changeDirection(item.pct) === "up")
        .map((item) => ({
          key: item.key,
          label: item.label,
          pct: item.pct,
        }));
    }
  }

  const pieData: PieData[] = rawRows.map((row, index) => ({
    label: row.label,
    value: Number(row.pct),
    color: COLORS[index % COLORS.length],
    formattedValue: row.pct,
  }));

  const handleChartClick = () => {
    if (hovered !== null && rawRows[hovered]) {
      const row = rawRows[hovered];
      setSelected({ tab, label: row.label, pct: row.pct });
    }
  };

  let centreValue: string;
  let centreLabel: string;
  if (hovered !== null && rawRows[hovered]) {
    centreValue = formatPercent(rawRows[hovered].pct, { digits: 1 });
    centreLabel = rawRows[hovered].label;
  } else if (currentValue !== null) {
    centreValue = formatCompactRupees(currentValue);
    centreLabel = "Current value";
  } else {
    centreValue = "100%";
    centreLabel = "of the fund";
  }

  const unclassified =
    data &&
    tab === "market_cap" &&
    changeDirection(data.unclassified_pct) !== "flat"
      ? formatPercent(data.unclassified_pct, { digits: 1 })
      : null;

  return (
    <section
      aria-labelledby="alloc-title"
      className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <h3
          id="alloc-title"
          className="text-base font-semibold text-[var(--ui-text)]"
        >
          Fund Allocation
        </h3>
        <Segmented<AllocationTab>
          label="Allocation view"
          options={ALLOCATION_TABS}
          value={tab}
          onChange={(nextTab) => {
            setTab(nextTab);
            setHovered(null);
          }}
        />
      </div>

      <SectionState
        status={composition.status}
        label="allocation"
        reason={composition.reason}
        onRetry={composition.retry}
      >
        {data ? (
          rawRows.length === 0 ? (
            <div className="space-y-3">
              <p
                data-testid="alloc-empty"
                className="py-2 text-sm text-[var(--ui-text-muted)]"
              >
                No allocation data for this view.
              </p>
              <p
                data-testid="alloc-note"
                className="border-t border-[var(--ui-divider)] pt-3 text-xs text-[var(--ui-text-muted)]"
              >
                {allocationNote(
                  tab,
                  formatDate(data.holdings_as_of),
                  unclassified
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
                <div
                  data-testid="alloc-chart"
                  role="group"
                  aria-label="Fund allocation chart"
                  onClick={handleChartClick}
                  className="relative h-[200px] w-[200px] shrink-0 cursor-pointer"
                >
                  <PieChart
                    data={pieData}
                    size={200}
                    innerRadius={68}
                    padAngle={0.03}
                    cornerRadius={3}
                    hoverOffset={7}
                    hoveredIndex={hovered}
                    onHoverChange={setHovered}
                    className="h-full w-full"
                  >
                    {rawRows.map((slice, index) => (
                      <PieSlice
                        key={slice.label}
                        index={index}
                        hoverEffect="translate"
                        hoverOffset={7}
                      />
                    ))}
                  </PieChart>

                  <div
                    data-testid="alloc-centre"
                    className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
                  >
                    <span
                      data-testid="alloc-centre-value"
                      className="text-base font-bold text-[var(--ui-text)]"
                    >
                      {centreValue}
                    </span>
                    <span
                      data-testid="alloc-centre-label"
                      className="max-w-[100px] truncate text-xs text-[var(--ui-text-muted)]"
                    >
                      {centreLabel}
                    </span>
                  </div>
                </div>

                <ul
                  aria-label="Allocation breakdown"
                  className="w-full min-w-0 flex-1 space-y-1.5"
                >
                  {rawRows.map((row, index) => {
                    const colour = COLORS[index % COLORS.length];
                    return (
                      <li key={row.key}>
                        <button
                          type="button"
                          data-testid={`alloc-row-${index}`}
                          data-active={hovered === index}
                          onClick={() =>
                            setSelected({
                              tab,
                              label: row.label,
                              pct: row.pct,
                            })
                          }
                          onMouseEnter={() => setHovered(index)}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => setHovered(index)}
                          onBlur={() => setHovered(null)}
                          className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-sm transition-opacity duration-150 hover:bg-[var(--ui-row-hover)] ${
                            hovered !== null && hovered !== index
                              ? "opacity-60"
                              : ""
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <i
                              aria-hidden="true"
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: colour }}
                            />
                            <span className="truncate text-left text-[var(--ui-text)]">
                              {row.label}
                            </span>
                          </div>
                          <b className="shrink-0 font-semibold text-[var(--ui-text)]">
                            {formatPercent(row.pct, { digits: 1 })}
                          </b>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <p
                data-testid="alloc-note"
                className="border-t border-[var(--ui-divider)] pt-3 text-xs text-[var(--ui-text-muted)]"
              >
                {allocationNote(
                  tab,
                  formatDate(data.holdings_as_of),
                  unclassified
                )}
              </p>
            </div>
          )
        ) : null}
      </SectionState>

      <SliceDialog
        slice={selected}
        top10={data?.top10 ?? []}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
