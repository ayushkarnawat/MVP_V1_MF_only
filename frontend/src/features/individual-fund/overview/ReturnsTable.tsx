import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/format";
import { useScope } from "@/shell/scope/ScopeContext";
import { fundPageApi } from "../api";
import { useFundSection } from "../useFundSection";
import { SectionState } from "../components/SectionState";
import { Segmented } from "../components/Segmented";
import { columnHeader, unavailableText } from "../fundCopy";
import { changeDirection } from "../fundFormat";
import type {
  CategoryReturnsResponse,
  CurrentReturnsResponse,
  InceptionReturnsResponse,
  ReturnsMode,
  ReturnsResponse,
} from "../types";

export interface ReturnsTableProps {
  schemeId: string;
  scope: string;
  fundName: string;
}

const MODE_OPTIONS: readonly { value: ReturnsMode; label: string }[] = [
  { value: "inception", label: "Inception" },
  { value: "current", label: "Current" },
];

export function ReturnsTable({ schemeId, scope, fundName }: ReturnsTableProps) {
  const { selectedMember } = useScope();
  const [mode, setMode] = useState<ReturnsMode>("inception");
  const [wantCurrent, setWantCurrent] = useState(false);

  const handleModeChange = (nextMode: ReturnsMode) => {
    setMode(nextMode);
    if (nextMode === "current") {
      setWantCurrent(true);
    }
  };

  const inception = useFundSection<ReturnsResponse>(
    (signal) => fundPageApi.returns(schemeId, "inception", scope, signal),
    [schemeId, scope]
  );

  const current = useFundSection<ReturnsResponse>(
    (signal) => fundPageApi.returns(schemeId, "current", scope, signal),
    [schemeId, scope],
    { enabled: wantCurrent }
  );

  const category = useFundSection<CategoryReturnsResponse>(
    (signal) => fundPageApi.categoryReturns(schemeId, signal),
    [schemeId]
  );

  const active = mode === "current" ? current : inception;

  const renderTable = (data: ReturnsResponse) => {
    if (data.mode === "inception") {
      const incData = data as InceptionReturnsResponse;
      const benchmarkNoteText =
        incData.rows.benchmark === null
          ? incData.benchmark_reason === "no_benchmark"
            ? "No benchmark applies to this fund type."
            : incData.benchmark_reason === "no_history"
              ? "Benchmark history is not available yet."
              : null
          : null;

      return (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-divider)]">
                  <th scope="col" className="py-2 pr-4 font-normal text-[var(--ui-text-muted)]">
                    <span className="sr-only">Series</span>
                  </th>
                  {incData.columns.map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className="py-2 px-3 text-right font-normal text-[var(--ui-text-muted)]"
                    >
                      {columnHeader(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ui-divider)]">
                {/* 1. Fund row */}
                <tr data-testid="row-fund">
                  <th
                    scope="row"
                    className="py-2.5 pr-4 font-medium text-[var(--ui-text)]"
                  >
                    {fundName}
                  </th>
                  {incData.columns.map((col) => {
                    const val = incData.rows.fund[col];
                    if (val == null) {
                      return (
                        <td
                          key={col}
                          data-testid={`cell-fund-${col}`}
                          title="No history for this period yet."
                          className="py-2.5 px-3 text-right text-[var(--ui-disabled-text)]"
                        >
                          —
                        </td>
                      );
                    }
                    const dir = changeDirection(val);
                    const dirColor =
                      dir === "up"
                        ? "text-[var(--pos-text)]"
                        : dir === "down"
                          ? "text-[var(--neg-text)]"
                          : "";
                    return (
                      <td
                        key={col}
                        data-testid={`cell-fund-${col}`}
                        data-direction={dir}
                        className={`py-2.5 px-3 text-right font-medium tabular-nums ${dirColor}`}
                      >
                        {formatPercent(val, { digits: 1 })}
                      </td>
                    );
                  })}
                </tr>

                {/* 2. Benchmark row */}
                {incData.rows.benchmark !== null && (
                  <tr data-testid="row-benchmark">
                    <th
                      scope="row"
                      className="py-2.5 pr-4 font-normal text-[var(--ui-text-muted)]"
                    >
                      {incData.benchmark_label || "Benchmark"}
                    </th>
                    {incData.columns.map((col) => {
                      const val = incData.rows.benchmark![col];
                      if (val == null) {
                        return (
                          <td
                            key={col}
                            data-testid={`cell-benchmark-${col}`}
                            title="No history for this period yet."
                            className="py-2.5 px-3 text-right text-[var(--ui-disabled-text)]"
                          >
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={col}
                          data-testid={`cell-benchmark-${col}`}
                          className="py-2.5 px-3 text-right tabular-nums text-[var(--ui-text)]"
                        >
                          {formatPercent(val, { digits: 1 })}
                        </td>
                      );
                    })}
                  </tr>
                )}

                {/* 3. Category row */}
                <tr data-testid="row-category">
                  <th
                    scope="row"
                    className="py-2.5 pr-4 font-normal text-[var(--ui-text-muted)]"
                  >
                    <span>Category average</span>
                    {category.status === "error" && (
                      <button
                        type="button"
                        aria-label="Retry category returns"
                        onClick={category.retry}
                        className="ml-2 text-xs text-[var(--c2)] hover:underline"
                      >
                        Retry
                      </button>
                    )}
                  </th>
                  {incData.columns.map((col) => {
                    if (category.status === "loading") {
                      return (
                        <td
                          key={col}
                          data-testid={`cell-category-${col}`}
                          data-state="pending"
                          className="py-2.5 px-3 text-right"
                        >
                          <Skeleton className="h-4 w-12 ml-auto" />
                        </td>
                      );
                    }
                    if (category.status === "error") {
                      return (
                        <td
                          key={col}
                          data-testid={`cell-category-${col}`}
                          title="Category figures could not be loaded"
                          className="py-2.5 px-3 text-right text-[var(--ui-disabled-text)]"
                        >
                          —
                        </td>
                      );
                    }
                    if (category.status === "unavailable") {
                      return (
                        <td
                          key={col}
                          data-testid={`cell-category-${col}`}
                          title={unavailableText(category.reason)}
                          className="py-2.5 px-3 text-right text-[var(--ui-disabled-text)]"
                        >
                          —
                        </td>
                      );
                    }
                    if (category.status === "ready" && category.data) {
                      const val = category.data.category[col];
                      if (val == null) {
                        return (
                          <td
                            key={col}
                            data-testid={`cell-category-${col}`}
                            title="No history for this period yet."
                            className="py-2.5 px-3 text-right text-[var(--ui-disabled-text)]"
                          >
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={col}
                          data-testid={`cell-category-${col}`}
                          className="py-2.5 px-3 text-right tabular-nums text-[var(--ui-text)]"
                        >
                          {formatPercent(val, { digits: 1 })}
                        </td>
                      );
                    }
                    return null;
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <p data-testid="returns-note" className="text-xs text-[var(--ui-text-muted)]">
            Up to 1 year absolute; over 1 year annualised.
          </p>

          {benchmarkNoteText && (
            <p
              data-testid="returns-benchmark-note"
              className="text-xs text-[var(--ui-text-muted)]"
            >
              {benchmarkNoteText}
            </p>
          )}
        </div>
      );
    }

    // Current returns
    const curData = data as CurrentReturnsResponse;
    return (
      <div className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-divider)]">
                <th scope="col" className="py-2 pr-4 font-normal text-[var(--ui-text-muted)]">
                  <span className="sr-only">Series</span>
                </th>
                {curData.columns.map((col) => (
                  <th
                    key={col}
                    scope="col"
                    className="py-2 px-3 text-right font-normal text-[var(--ui-text-muted)]"
                  >
                    {columnHeader(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ui-divider)]">
              {/* 1. Fund holding row */}
              <tr data-testid="row-fund">
                <th
                  scope="row"
                  className="py-2.5 pr-4 font-medium text-[var(--ui-text)]"
                >
                  Your holding (XIRR)
                </th>
                {curData.columns.map((col) => {
                  const val = curData.rows.holding_xirr[col];
                  if (val == null) {
                    return (
                      <td
                        key={col}
                        data-testid={`cell-fund-${col}`}
                        title="You have not held this fund for this long."
                        className="py-2.5 px-3 text-right text-[var(--ui-disabled-text)]"
                      >
                        —
                      </td>
                    );
                  }
                  const dir = changeDirection(val);
                  const dirColor =
                    dir === "up"
                      ? "text-[var(--pos-text)]"
                      : dir === "down"
                        ? "text-[var(--neg-text)]"
                        : "";
                  return (
                    <td
                      key={col}
                      data-testid={`cell-fund-${col}`}
                      data-direction={dir}
                      className={`py-2.5 px-3 text-right font-medium tabular-nums ${dirColor}`}
                    >
                      {formatPercent(val, { digits: 1 })}
                    </td>
                  );
                })}
              </tr>

              {/* 2. Benchmark same flows row */}
              {curData.rows.benchmark_same_flows !== null && (
                <tr data-testid="row-benchmark">
                  <th
                    scope="row"
                    className="py-2.5 pr-4 font-normal text-[var(--ui-text-muted)]"
                  >
                    Benchmark, same cash flows
                  </th>
                  {curData.columns.map((col) => {
                    const val = curData.rows.benchmark_same_flows![col];
                    if (val == null) {
                      return (
                        <td
                          key={col}
                          data-testid={`cell-benchmark-${col}`}
                          title="You have not held this fund for this long."
                          className="py-2.5 px-3 text-right text-[var(--ui-disabled-text)]"
                        >
                          —
                        </td>
                      );
                    }
                    return (
                      <td
                        key={col}
                        data-testid={`cell-benchmark-${col}`}
                        className="py-2.5 px-3 text-right tabular-nums text-[var(--ui-text)]"
                      >
                        {formatPercent(val, { digits: 1 })}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p data-testid="returns-note" className="text-xs text-[var(--ui-text-muted)]">
          Periods longer than you have held the fund are dashed.
        </p>
      </div>
    );
  };

  return (
    <section
      aria-labelledby="returns-title"
      className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="returns-title" className="text-base font-semibold text-[var(--ui-text)]">
          Returns
        </h3>
        <Segmented
          label="Returns basis"
          options={MODE_OPTIONS}
          value={mode}
          onChange={handleModeChange}
        />
      </div>

      {mode === "current" &&
      current.status === "unavailable" &&
      current.reason === "not_held" ? (
        <p data-testid="returns-not-held" className="text-sm text-[var(--ui-text-muted)]">
          {`Not held by ${selectedMember?.name ?? "this member"}. Inception returns are still shown.`}
        </p>
      ) : (
        <SectionState
          status={active.status}
          label="returns"
          reason={active.reason}
          onRetry={active.retry}
        >
          {active.data ? renderTable(active.data) : null}
        </SectionState>
      )}
    </section>
  );
}
