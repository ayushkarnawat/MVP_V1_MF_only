import { type ComponentType, type KeyboardEvent, useState } from "react";
import { formatCompactRupees, formatPercent, formatRupees } from "../../../lib/format";
import type { Slice } from "../types";

export interface ChartTypeToggleProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ id: T; label: string; icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }> }>;
  onChange: (value: T) => void;
  label: string;
}

export function ChartTypeToggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: ChartTypeToggleProps<T>) {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextIdx = (index + 1) % options.length;
      onChange(options[nextIdx].id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prevIdx = (index - 1 + options.length) % options.length;
      onChange(options[prevIdx].id);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-[var(--ui-text-muted)]">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-[var(--ui-divider)] p-0.5">
        {options.map((opt, index) => {
          const checked = value === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={checked}
              data-clickable=""
              data-effect="switch"
              onClick={() => onChange(opt.id)}
              onKeyDown={e => handleKeyDown(e, index)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                checked
                  ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                  : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface BarListProps {
  items: Slice[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  formatValue: (slice: Slice) => string;
  ariaLabel?: string;
}

export function BarList({
  items,
  selectedKey,
  onSelect,
  formatValue,
  ariaLabel = "Breakdown",
}: BarListProps) {
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2">
      {items.map(item => {
        const selected = selectedKey === item.key;
        const pctNum = Math.min(100, Math.max(0, Number(item.pct)));
        return (
          <li key={item.key}>
            <button
              type="button"
              aria-pressed={selected}
              data-selected={selected}
              data-key={item.key}
              data-clickable=""
              data-effect="select"
              onClick={() => onSelect(item.key)}
              className={`group flex w-full flex-col gap-1 rounded-xl p-2 text-left transition-colors ${
                selected ? "bg-[var(--ui-row-hover)]" : "hover:bg-[var(--ui-row-hover)]"
              }`}
            >
              <div className="flex w-full items-center justify-between text-xs">
                <span className="font-medium text-[var(--ui-text)]">{item.label}</span>
                <span className="text-[var(--ui-text-muted)]">{formatValue(item)}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ui-divider)]">
                <span
                  data-testid={`bar-${item.key}`}
                  style={{ width: `${pctNum}%`, backgroundColor: item.color }}
                  className="block h-full rounded-full transition-all"
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// oxlint-disable-next-line react/only-export-components -- hook exported alongside chart components
export function useSelectedSlice(slices: Slice[]): {
  selectedKey: string | null;
  activeKey: string | null;
  select: (key: string) => void;
  clear: () => void;
  hover: (key: string | null) => void;
} {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const validSelectedKey = slices.some(s => s.key === selectedKey) ? selectedKey : null;

  return {
    selectedKey: validSelectedKey,
    activeKey,
    select: (key: string) => setSelectedKey(key),
    clear: () => setSelectedKey(null),
    hover: (key: string | null) => setActiveKey(key),
  };
}

export interface SlicedDonutProps {
  slices: Slice[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  activeKey: string | null;
  onActiveChange: (key: string | null) => void;
  centre: { label: string; value: string };
  ariaLabel?: string;
}

export function SlicedDonut({
  slices,
  selectedKey,
  onSelect,
  activeKey,
  onActiveChange,
  centre,
  ariaLabel = "Allocation chart",
}: SlicedDonutProps) {
  const R = 70;
  const GAP = 4;
  const POP = 7;
  const CIRCUMFERENCE = 2 * Math.PI * R;
  const round2 = (x: number) => Math.round(x * 100) / 100;

  const prefersReducedMotion =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  let cumulative = 0;

  const shownSlice =
    (activeKey ? slices.find(s => s.key === activeKey) : null) ??
    (selectedKey ? slices.find(s => s.key === selectedKey) : null);

  const hoveredSlice = activeKey ? slices.find(s => s.key === activeKey) ?? null : null;

  return (
    <div className="relative h-[236px] w-[236px] shrink-0">
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label={ariaLabel}
        className="h-full w-full overflow-visible"
      >
        <circle
          cx="100"
          cy="100"
          r={R}
          strokeWidth={28}
          stroke="var(--ui-divider)"
          fill="none"
        />
        {slices.map(slice => {
          const pct = Number(slice.pct);
          const length = (pct / 100) * CIRCUMFERENCE;
          const segment = slices.length > 1 ? Math.max(length - GAP, 2) : length;
          const start = -90 + cumulative * 3.6;
          const midDeg = start + (pct * 3.6) / 2;
          const midRad = (midDeg * Math.PI) / 180;
          cumulative += pct;

          const popped = activeKey === slice.key || selectedKey === slice.key;
          const focusKey = activeKey ?? selectedKey;
          const dim = focusKey !== null && focusKey !== slice.key;

          const dx = round2(Math.cos(midRad) * POP);
          const dy = round2(Math.sin(midRad) * POP);

          return (
            <g
              key={slice.key}
              data-testid={`slice-${slice.key}`}
              role="button"
              tabIndex={0}
              aria-pressed={selectedKey === slice.key}
              aria-label={`${slice.label} ${formatPercent(slice.pct, { digits: 1 })}`}
              data-clickable=""
              data-effect="select"
              data-selected={selectedKey === slice.key}
              data-popped={popped}
              data-dim={dim}
              data-motion={prefersReducedMotion ? "reduced" : "full"}
              style={{
                opacity: dim ? 0.38 : 1,
                transition: "transform 150ms ease, opacity 150ms ease",
                ...(popped && !prefersReducedMotion ? { transform: `translate(${dx}px, ${dy}px)` } : {}),
              }}
              onMouseEnter={() => onActiveChange(slice.key)}
              onFocus={() => onActiveChange(slice.key)}
              onMouseLeave={() => onActiveChange(null)}
              onBlur={() => onActiveChange(null)}
              onClick={() => onSelect(slice.key)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  if (e.key === " ") e.preventDefault();
                  onSelect(slice.key);
                }
              }}
            >
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={slice.color}
                strokeWidth={28}
                strokeDasharray={`${round2(segment)} ${round2(CIRCUMFERENCE - segment)}`}
                transform={`rotate(${round2(start)} 100 100)`}
              />
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-[42px] flex flex-col items-center justify-center text-center">
        <span data-testid="donut-centre-label" className="text-xs text-[var(--ui-text-muted)] line-clamp-1">
          {shownSlice ? shownSlice.label : centre.label}
        </span>
        <span data-testid="donut-centre-value" className="text-sm font-semibold text-[var(--ui-text)]">
          {shownSlice ? formatCompactRupees(shownSlice.value) : centre.value}
        </span>
        {shownSlice && (
          <span data-testid="donut-centre-pct" className="text-xs font-medium text-[var(--ui-text-muted)]">
            {formatPercent(shownSlice.pct, { digits: 1 })}
          </span>
        )}
      </div>

      <div
        data-testid="donut-popup"
        data-visible={hoveredSlice !== null}
        aria-hidden={hoveredSlice === null}
        className="pointer-events-none absolute top-0 right-0 w-[200px] rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 shadow-lg transition-opacity"
        style={{ opacity: hoveredSlice !== null ? 1 : 0 }}
      >
        {hoveredSlice && (
          <div className="flex flex-col gap-1 text-xs">
            <span className="font-bold text-[var(--ui-text)]">{hoveredSlice.label}</span>
            <div className="flex justify-between text-[var(--ui-text-muted)]">
              <span>Allocation</span>
              <span data-testid="popup-pct" className="font-medium text-[var(--ui-text)]">
                {formatPercent(hoveredSlice.pct, { digits: 1 })}
              </span>
            </div>
            <div className="flex justify-between text-[var(--ui-text-muted)]">
              <span>Current Value</span>
              <span data-testid="popup-value" className="font-medium text-[var(--ui-text)]">
                {formatRupees(hoveredSlice.value)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
