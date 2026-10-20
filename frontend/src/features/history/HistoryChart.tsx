import { useId, useRef, useState } from "react";
import type { HistoryPoint } from "./api";
import { compareDecimalStrings, diffDecimalStrings } from "@/lib/decimal";
import { indexFromClientX } from "@/lib/chartPointer";
import { formatExactDate, formatMonthYear } from "@/lib/dateRange";
import { movementRupees } from "@/features/analytics/PeriodBreakdownTable";

const W = 640, H = 240, PAD = 44, TOP = 20, BOTTOM = 30;
const valueText = (p: HistoryPoint) => p.valueText ?? (Number.isFinite(p.value) ? String(p.value) : "0");
const costText = (p: HistoryPoint) => p.investedText !== undefined ? p.investedText : p.invested == null ? null : String(p.invested);
const monthName = (iso: string) => (formatMonthYear(iso) ?? iso).replace(/^([A-Za-z]{3})[a-z]+ /, "$1 ");
function compact(value: string) {
  const whole = BigInt(value.split(".")[0] || "0");
  for (const [divisor, suffix] of [[10000000n, "Cr"], [100000n, "L"], [1000n, "K"]] as const) {
    if (whole >= divisor) return `₹${(whole + divisor / 2n) / divisor}${suffix}`;
  }
  return movementRupees(value);
}

export function HistoryChart({ points, onSelectMonth, selectedMonth }: { points: HistoryPoint[]; onSelectMonth: (month: string) => void; selectedMonth: string | null }) {
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const touched = useRef<string | null>(null);
  const ignoreClick = useRef(false);
  const touchStart = useRef<{ x: number; y: number; index: number; moved: boolean } | null>(null);
  const tooltipId = useId();
  if (points.length === 0) return null;
  const active = points.findIndex(p => p.month === activeMonth);
  const maxText = points.flatMap(p => [valueText(p), costText(p) ?? "0"]).reduce((a, b) => compareDecimalStrings(a, b) >= 0 ? a : b, "1");
  const coordinate = (value: number | null | undefined) => Number.isFinite(value) ? value as number : 0;
  const max = Math.max(...points.map(p => Math.max(coordinate(p.value), coordinate(p.invested))), 1);
  const x = (i: number) => points.length === 1 ? W / 2 : PAD + i * (W - PAD * 2) / (points.length - 1);
  const y = (v: number) => TOP + (1 - v / max) * (H - TOP - BOTTOM);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(coordinate(p.value))}`).join(" ");
  const hasCost = points.every(p => costText(p) !== null);
  const area = hasCost ? `M${x(0)},${y(0)} ${points.map((p, i) => `L${x(i)},${y(coordinate(p.invested))}`).join(" ")} L${x(points.length - 1)},${y(0)} Z` : null;
  const current = active >= 0 ? points[active] : null;
  const select = (index: number) => { if (points[index]) onSelectMonth(points[index].month); };
  const pointerIndex = (event: { clientX: number; currentTarget: SVGSVGElement }) => indexFromClientX(event.clientX, event.currentTarget.getBoundingClientRect(), points.length, W, PAD);
  return <div className="w-full space-y-2">
    <p className="text-xs text-[var(--color-text-secondary)]">Month-end values · latest {formatExactDate(points[points.length - 1].month) ?? points[points.length - 1].month}</p>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]" role="img" tabIndex={0} aria-label="Portfolio value by month" aria-describedby={current ? tooltipId : undefined}
      onPointerMove={event => {
        if (event.pointerType === "touch") {
          // Once a touch has travelled past the tap threshold it is a drag, even if it comes back.
          const start = touchStart.current;
          if (start && (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8)) start.moved = true;
          return;
        }
        setActiveMonth(points[pointerIndex(event)]?.month ?? null);
      }}
      onPointerDown={event => {
        ignoreClick.current = event.pointerType === "touch";
        if (event.pointerType !== "touch") return;
        touchStart.current = { x: event.clientX, y: event.clientY, index: pointerIndex(event), moved: false };
      }}
      onPointerCancel={() => { touchStart.current = null; }}
      onPointerUp={event => {
        const start = touchStart.current;
        touchStart.current = null;
        if (event.pointerType !== "touch" || !start || start.moved || Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) return;
        const index = start.index, month = points[index]?.month;
        if (!month) return;
        setActiveMonth(month);
        if (touched.current === month) select(index);
        touched.current = month;
      }}
      onClick={event => { if (ignoreClick.current) { ignoreClick.current = false; return; } const index = pointerIndex(event); setActiveMonth(points[index]?.month ?? null); select(index); }}
      onKeyDown={event => {
        const index = active >= 0 ? active : points.length - 1;
        if (["ArrowLeft", "ArrowRight", "Home", "End", "Enter", "Escape"].includes(event.key)) event.preventDefault();
        if (event.key === "ArrowLeft") setActiveMonth(points[Math.max(0, index - 1)].month);
        if (event.key === "ArrowRight") setActiveMonth(points[Math.min(points.length - 1, index + 1)].month);
        if (event.key === "Home") setActiveMonth(points[0].month);
        if (event.key === "End") setActiveMonth(points[points.length - 1].month);
        if (event.key === "Enter") select(index);
        if (event.key === "Escape") { setActiveMonth(null); touched.current = null; }
      }}>
      <text x="0" y={TOP + 5} fontSize="11" fill="var(--color-text-secondary)">{compact(maxText)}</text>
      <text x="0" y={H - BOTTOM} fontSize="11" fill="var(--color-text-secondary)">₹0</text>
      {area && <path d={area} fill="var(--color-accent)" fillOpacity={0.12} />}
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => <circle key={p.month} cx={x(i)} cy={y(coordinate(p.value))} r={p.month === selectedMonth ? 5 : p.partial ? 4.5 : 2} fill={p.partial ? "var(--color-surface)" : "var(--color-accent)"} stroke={p.partial ? "var(--color-warning)" : "none"} />)}
      {points.map((p, i) => (i === 0 || p.month.slice(0, 4) !== points[i - 1].month.slice(0, 4)) && <text key={p.month} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--color-text-secondary)">{p.month.slice(0, 4)}</text>)}
      {current && <g pointerEvents="none"><line x1={x(active)} x2={x(active)} y1={TOP} y2={H - BOTTOM} stroke="var(--color-text-secondary)" strokeDasharray="3 3" /><circle cx={x(active)} cy={y(coordinate(current.value))} r={5} fill="var(--color-accent)" /></g>}
    </svg>
    {current && <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs">
      <div role="tooltip" id={tooltipId}>
        <p className="font-semibold">{monthName(current.month)}</p>
        <p>Portfolio value {movementRupees(valueText(current))}</p>
        {costText(current) !== null && <><p>Cost of holdings {movementRupees(costText(current)!)}</p><p>Gain {movementRupees(diffDecimalStrings(valueText(current), costText(current)!))}</p></>}
        {current.partial && <p>No price for this month: {(current.missing ?? []).join(", ")}</p>}
      </div>
      <button type="button" className="mt-2 min-h-11 rounded-md border border-[var(--color-border)] px-3 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]" onClick={() => select(active)}>See details</button>
    </div>}
    <div className="flex gap-4 text-xs text-[var(--color-text-secondary)]"><span className="inline-flex items-center gap-2"><span aria-hidden="true" className="w-4 border-t-2 border-[var(--color-accent)]" />Portfolio value</span>{hasCost && <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3 w-4 bg-[var(--color-accent)]/15" />Cost of holdings</span>}</div>
    {points.some(p => p.partial) && <ul className="sr-only" aria-label="Months with a missing price">{points.filter(p => p.partial).map(p => <li key={p.month}>{monthName(p.month)}: {(p.missing ?? []).join(", ")} had no price this month</li>)}</ul>}
  </div>;
}
