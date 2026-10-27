import { BarChart3, ChevronRight, PieChart, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCompactRupees, formatPercent, formatRupees } from "../../../lib/format";
import { BarList, ChartTypeToggle, SlicedDonut, useSelectedSlice } from "../common/charts";
import { SectionCard } from "../common/SectionCard";
import { formatXirr } from "../mfCopy";
import type { FundManagerAllocationSummary } from "../types";
import {
  type AnalyticsCardProps,
  chartPct,
  managerKey,
  managerSlices,
} from "./allocationLogic";
import { DrillPanel } from "./DrillPanel";

const CHART_OPTIONS = [
  { id: "table" as const, label: "Table", icon: Table2 },
  { id: "donut" as const, label: "Donut", icon: PieChart },
  { id: "bar" as const, label: "Bar Chart", icon: BarChart3 },
];

export interface FundManagerCardProps extends AnalyticsCardProps<FundManagerAllocationSummary> {
  xirrByScheme: Record<string, string | null | undefined>;
}

export function FundManagerCard({
  state,
  data,
  onRetry,
  xirrByScheme,
}: FundManagerCardProps) {
  const [view, setView] = useState<"table" | "donut" | "bar">("table");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const groups = data?.manager_groups ?? [];
  const unavailable = data?.unavailable_schemes ?? [];

  const slices = useMemo(() => {
    return managerSlices(data?.manager_groups ?? []);
  }, [data?.manager_groups]);

  const { selectedKey, activeKey, select, hover } = useSelectedSlice(slices);

  const selectedSlice = selectedKey
    ? slices.find(s => s.key === selectedKey) ?? null
    : null;

  const selectedGroup = selectedKey
    ? groups.find(g => managerKey(g) === selectedKey) ?? null
    : null;

  const isEmpty = groups.length === 0 && unavailable.length === 0;

  return (
    <SectionCard
      title="Fund Manager Allocation"
      state={state}
      onRetry={onRetry}
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-[var(--ui-text-muted)]">
          Who is actually running your money, aggregated across your whole portfolio.
        </p>

        {isEmpty || !data ? (
          <div className="flex flex-col gap-1 py-4 text-xs text-[var(--ui-text-muted)]">
            <p className="font-medium text-[var(--ui-text)]">
              No fund manager data available
            </p>
            <p>
              We haven't matched fund manager records for your current holdings yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ChartTypeToggle
              label="Chart type"
              value={view}
              options={CHART_OPTIONS}
              onChange={setView}
            />

            {/* Table view */}
            {view === "table" && (
              <div className="overflow-x-auto">
                <table
                  aria-label="Fund manager allocation"
                  className="w-full text-left text-xs"
                >
                  <caption className="text-left text-xs text-[var(--ui-text-muted)] pb-2">
                    Funds with more than one manager are divided equally between them.
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--ui-divider)] text-[var(--ui-text-muted)]">
                      <th className="pb-2 font-medium">Fund manager</th>
                      <th className="pb-2 font-medium">AMC</th>
                      <th className="pb-2 font-medium">Current value</th>
                      <th className="pb-2 font-medium">% of overall portfolio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ui-divider)]">
                    {groups.map(group => {
                      const key = managerKey(group);
                      const isOpen = openKey === key;

                      return (
                        <tr
                          key={key}
                          data-testid={`manager-row-${key}`}
                          className="group"
                        >
                          <th scope="row" className="py-2.5 font-normal text-[var(--ui-text)]">
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              data-clickable=""
                              data-effect="expand"
                              onClick={() => setOpenKey(isOpen ? null : key)}
                              className="flex items-center gap-1.5 text-left font-medium hover:text-[var(--pos-text)]"
                            >
                              <ChevronRight
                                aria-hidden="true"
                                className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                                  isOpen ? "rotate-90" : ""
                                }`}
                              />
                              <span>{group.manager_name}</span>
                            </button>
                          </th>
                          <td className="py-2.5 text-[var(--ui-text-muted)]">
                            {group.amc_name || "—"}
                          </td>
                          <td className="py-2.5 text-[var(--ui-text)] font-medium">
                            {formatRupees(group.total_household_value)}
                          </td>
                          <td className="py-2.5 text-[var(--ui-text-muted)] font-medium">
                            {formatPercent(group.percentage, { digits: 1 })}
                          </td>
                        </tr>
                      );
                    }).flatMap((el, idx) => {
                      const group = groups[idx];
                      const key = managerKey(group);
                      const isOpen = openKey === key;

                      if (!isOpen) return [el];

                      const detailRow = (
                        <tr
                          key={`detail-${key}`}
                          data-testid={`manager-detail-${key}`}
                          className="bg-[var(--ui-card)]"
                        >
                          <td colSpan={4} className="p-3">
                            <ul
                              aria-label={`${group.manager_name} funds`}
                              className="flex flex-col gap-1.5"
                            >
                              {group.funds.map(fund => (
                                <li
                                  key={fund.scheme_id}
                                  data-testid={`manager-fund-${key}-${fund.scheme_id}`}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span
                                    title={fund.scheme_name}
                                    className="font-medium text-[var(--ui-text)] truncate max-w-md"
                                  >
                                    {fund.scheme_name}
                                  </span>
                                  <span className="text-[var(--ui-text-muted)]">
                                    {formatRupees(fund.household_value)} · XIRR{" "}
                                    {formatXirr(xirrByScheme[fund.scheme_id])}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      );

                      return [el, detailRow];
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[var(--ui-divider)] font-semibold text-[var(--ui-text)]">
                      <th scope="row" className="pt-3">
                        Covered by manager data
                      </th>
                      <td className="pt-3"></td>
                      <td data-testid="covered-value" className="pt-3">
                        {formatRupees(data.covered_value)}
                      </td>
                      <td data-testid="covered-pct" className="pt-3">
                        {formatPercent(data.covered_percentage, { digits: 1 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Donut view */}
            {view === "donut" && (
              <div className="flex flex-wrap items-center gap-8">
                <SlicedDonut
                  slices={slices.map(s => ({ ...s, pct: chartPct(s.pct) }))}
                  selectedKey={selectedKey}
                  onSelect={select}
                  activeKey={activeKey}
                  onActiveChange={hover}
                  centre={{
                    label: "Covered",
                    value: formatCompactRupees(data.covered_value),
                  }}
                  ariaLabel="Fund manager chart"
                />

                <ul
                  aria-label="Fund manager breakdown"
                  className="flex flex-col gap-2 min-w-[200px]"
                >
                  {slices.map(slice => {
                    const isSelected = selectedKey === slice.key;
                    return (
                      <li
                        key={slice.key}
                        data-testid={`legend-${slice.key}`}
                        onMouseEnter={() => hover(slice.key)}
                        onMouseLeave={() => hover(null)}
                      >
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          data-clickable=""
                          data-effect="select"
                          onClick={() => select(slice.key)}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg p-2 text-xs transition-colors ${
                            isSelected
                              ? "bg-[var(--ui-row-hover)] font-semibold"
                              : "hover:bg-[var(--ui-row-hover)]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              style={{ backgroundColor: slice.color }}
                              className="h-3 w-3 rounded-full shrink-0"
                            />
                            <span className="text-[var(--ui-text)]">{slice.label}</span>
                          </div>
                          <span className="font-medium text-[var(--ui-text-muted)]">
                            {formatPercent(slice.pct, { digits: 1 })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Bar view */}
            {view === "bar" && (
              <BarList
                items={slices.map(s => ({ ...s, pct: chartPct(s.pct) }))}
                selectedKey={selectedKey}
                onSelect={select}
                formatValue={item => {
                  const sl = slices.find(s => s.key === item.key);
                  return formatPercent(sl?.pct ?? item.pct, { digits: 1 });
                }}
                ariaLabel="Fund manager breakdown"
              />
            )}

            {/* Drill panel for donut and bar views */}
            {view !== "table" && selectedSlice && selectedGroup && (
              <DrillPanel
                title={`${selectedSlice.label} — funds managed`}
                color={selectedSlice.color}
              >
                <ul className="flex flex-col gap-2 text-xs">
                  {selectedGroup.funds.map(fund => (
                    <li
                      key={fund.scheme_id}
                      data-testid={`drill-fund-${fund.scheme_id}`}
                      className="flex items-center justify-between rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-2.5"
                    >
                      <span
                        title={fund.scheme_name}
                        className="truncate font-medium text-[var(--ui-text)] max-w-sm"
                      >
                        {fund.scheme_name}
                      </span>
                      <span className="shrink-0 font-medium text-[var(--ui-text-muted)]">
                        {formatRupees(fund.household_value)}
                      </span>
                    </li>
                  ))}
                </ul>
              </DrillPanel>
            )}

            {/* Unavailable schemes banner */}
            {unavailable.length > 0 && (
              <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--warn-bg)] p-3 text-xs text-[var(--warn-text)] flex flex-col gap-1.5">
                <p className="font-semibold">
                  Fund manager data for these schemes isn't available yet.
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {unavailable.map(s => (
                    <li key={s.scheme_id}>
                      {s.scheme_name} ({s.amc_name})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
