import { Modal } from "@/components/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { getMemberMonthDetail, getAggregateMonthDetail } from "../dashboard/api";
import type { MonthDetail } from "../dashboard/types";
import { HistoryDetailModal } from "./HistoryDetailModal";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMonthYear } from "@/lib/dateRange";
import { cn } from "@/lib/utils";
import { fetchHistory, type HistoryPoint } from "./api";
import { HistoryChart } from "./HistoryChart";

type Range = "1Y" | "3Y" | "5Y" | "All";
const MONTHS: Record<Range, number | null> = { "1Y": 12, "3Y": 36, "5Y": 60, All: null };

function monthLabel(iso: string): string {
  return (formatMonthYear(iso) ?? iso).replace(/^([A-Za-z]{3})[a-z]+ /, "$1 ");
}

export interface HistoryViewProps {
  viewMode: "aggregate" | "member";
  memberId: string | null;
  memberName?: string;
  ranges?: Range[];
}

/** #12: the Portfolio history page (desktop tab; reused full-screen on mobile). */
export function HistoryView({ viewMode, memberId, memberName, ranges = ["1Y", "3Y", "5Y", "All"] }: HistoryViewProps) {
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);
  const [error, setError] = useState(false);
  const scopeKey = JSON.stringify([viewMode, memberId]);
  const [selection, setSelection] = useState<{ scope: string; month: string } | null>(null);
  const selectedMonth = selection?.scope === scopeKey ? selection.month : null;
  const [attempt, setAttempt] = useState(0);
  const setSelectedMonth = useCallback((month: string | null) => {
    setSelection(month ? { scope: scopeKey, month } : null);
    if (month) setAttempt(value => value + 1);
  }, [scopeKey]);
  const [monthResult, setMonthResult] = useState<{ key: string; detail: MonthDetail | null; error: boolean } | null>(null);
  const requestKey = JSON.stringify([viewMode, memberId, selectedMonth, attempt]);
  const detail = monthResult?.key === requestKey ? monthResult.detail : null;
  const detailError = monthResult?.key === requestKey && monthResult.error;
  const [range, setRange] = useState<Range>("All");

  useEffect(() => {
    let alive = true;
    setPoints(null);
    setSelectedMonth(null);
    setError(false);
    fetchHistory(viewMode, memberId)
      .then((p) => { if (alive) setPoints(p); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [viewMode, memberId, setSelectedMonth]);

  useEffect(() => {
    if (!selectedMonth) return;
    const controller = new AbortController();
    let alive = true;
    const request = viewMode === "aggregate"
      ? getAggregateMonthDetail(selectedMonth, controller.signal)
      : memberId ? getMemberMonthDetail(memberId, selectedMonth, controller.signal) : Promise.reject(new Error("No member selected"));
    request.then(value => { if (alive) setMonthResult({ key: requestKey, detail: value, error: false }); })
      .catch(() => { if (alive) setMonthResult({ key: requestKey, detail: null, error: true }); });
    return () => { alive = false; controller.abort(); };
  }, [viewMode, memberId, selectedMonth, attempt, requestKey]);

  const shown = useMemo(() => {
    if (!points) return [];
    const n = MONTHS[range];
    return n === null ? points : points.slice(-n);
  }, [points, range]);

  const who = viewMode === "aggregate" ? "Family" : memberName ?? "Member";
  return (
    <section className="flex flex-col space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--color-ink)]">Portfolio history</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">{who} · monthly value at each month-end</p>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Range">
          {ranges.map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)} aria-pressed={range === r}
              className={cn("rounded-full px-3 py-1 text-xs font-semibold border cursor-pointer",
                range === r ? "bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)]")}>
              {r}
            </button>
          ))}
        </div>
      </div>
      {points === null && !error && <p className="text-sm text-[var(--color-text-secondary)]">Updating history…</p>}
      {error && <p className="text-sm text-[var(--color-negative)]">History couldn’t be loaded. Please try again.</p>}
      {points !== null && points.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">No history yet. Upload a statement to see your portfolio month by month.</p>
      )}
      {shown.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <HistoryChart points={shown} selectedMonth={selectedMonth} onSelectMonth={setSelectedMonth} />
          <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
            History starts {monthLabel(points![0].month)} (earliest statement uploaded). Hollow dot = a fund had no price that month.
          </p>
        </div>
      )}
      {selectedMonth && (detail
        ? <HistoryDetailModal key={requestKey} detail={detail} viewMode={viewMode} onClose={() => setSelectedMonth(null)} />
        : <Modal isOpen variant="sheet" title={formatMonthYear(selectedMonth) ?? selectedMonth} onClose={() => setSelectedMonth(null)}>
          {detailError ? <div><p role="alert">Couldn't load this month. Try again.</p><button type="button" className="mt-3 min-h-11 rounded-md border border-[var(--color-border)] px-4" onClick={() => setAttempt(value => value + 1)}>Retry</button></div>
            : <div className="space-y-3"><p role="status">Loading month…</p><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>}
        </Modal>)}
    </section>
  );
}
