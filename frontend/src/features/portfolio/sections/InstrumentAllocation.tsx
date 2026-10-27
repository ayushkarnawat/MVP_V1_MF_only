import { useState } from "react";
import { ArrowUpDown, ChevronRight, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { AppLink } from "@/shell/nav/AppLink";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactRupees, formatPercent, formatRupees } from "@/lib/format";
import { InstrumentDonut } from "../components/InstrumentDonut";
import {
  bucketColor,
  bucketKey,
  bucketPath,
  liveTotal,
  sliceRows,
  sortBuckets,
  visibleBuckets,
} from "../portfolioCopy";
import {
  formatSignedRupees,
  formatXirr,
  partialChipText,
} from "../portfolioFormat";
import type { PortfolioAllocationResponse } from "../types";

export interface InstrumentAllocationProps {
  status: "loading" | "error" | "data";
  data: PortfolioAllocationResponse | null;
  onRetry: () => void;
}

export function InstrumentAllocation({
  status,
  data,
  onRetry,
}: InstrumentAllocationProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "live">("all");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [filterOpen, setFilterOpen] = useState(false);

  if (status === "loading") {
    return (
      <section
        role="status"
        aria-label="Loading allocation"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
      >
        <div className="flex flex-col sm:flex-row items-center gap-8">
          <Skeleton className="h-[236px] w-[236px] rounded-full shrink-0" />
          <div className="flex-1 w-full space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-6">
        <h4 className="text-base font-semibold text-[var(--ui-text-default)]">
          Couldn't load your asset allocation
        </h4>
        <p className="mt-1 text-sm text-[var(--ui-text-muted)]">
          This section failed to load, but the rest of the page is unaffected.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center justify-center rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-surface)] px-3 py-1.5 text-sm font-medium text-[var(--ui-text-default)] hover:bg-[var(--ui-elevated)] cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const active =
    activeKey !== null
      ? data.buckets.find((b) => bucketKey(b.label) === activeKey) ?? null
      : null;

  let centerLabel = "Total Portfolio";
  let centerValue = formatCompactRupees(liveTotal(data.buckets));
  let centerPct: string | null = null;

  if (active !== null) {
    centerLabel = active.label;
    if (active.status === "live") {
      centerValue = formatCompactRupees(active.current_value);
      centerPct = formatPercent(active.percentage, { digits: 1 });
    } else {
      centerValue = "—";
      centerPct = null;
    }
  }

  const displayedBuckets = sortBuckets(
    visibleBuckets(data.buckets, filter),
    order
  );

  return (
    <section
      aria-labelledby="allocation-title"
      className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 relative"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h3
            id="allocation-title"
            className="text-base font-semibold text-[var(--ui-text-default)]"
          >
            Asset Allocation
          </h3>
          {partialChipText(data.missing_funds) !== "" && (
            <span
              role="note"
              title={`Based on the last known NAV for: ${data.missing_funds.map((f) => f.name).join(", ")}`}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-xs text-[var(--warn-text)]"
            >
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{partialChipText(data.missing_funds)}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Filter dropdown */}
          <div className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-surface)] px-2.5 py-1 text-xs font-medium text-[var(--ui-text-default)] hover:bg-[var(--ui-elevated)] cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Filter</span>
            </button>

            {filterOpen && (
              <ul
                role="listbox"
                aria-label="Filter asset classes"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setFilterOpen(false);
                }}
                className="absolute right-0 top-full mt-1.5 z-30 w-40 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-1 shadow-lg"
              >
                <li
                  role="option"
                  aria-selected={filter === "all"}
                  tabIndex={0}
                  onClick={() => {
                    setFilter("all");
                    setFilterOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      if (e.key === " ") e.preventDefault();
                      setFilter("all");
                      setFilterOpen(false);
                    }
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                    filter === "all"
                      ? "bg-[var(--ui-surface)] text-[var(--ui-text-default)]"
                      : "text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface)] hover:text-[var(--ui-text-default)]"
                  }`}
                >
                  All asset classes
                </li>
                <li
                  role="option"
                  aria-selected={filter === "live"}
                  tabIndex={0}
                  onClick={() => {
                    setFilter("live");
                    setFilterOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      if (e.key === " ") e.preventDefault();
                      setFilter("live");
                      setFilterOpen(false);
                    }
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                    filter === "live"
                      ? "bg-[var(--ui-surface)] text-[var(--ui-text-default)]"
                      : "text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface)] hover:text-[var(--ui-text-default)]"
                  }`}
                >
                  Live only
                </li>
              </ul>
            )}
          </div>

          {/* Sort button */}
          <button
            type="button"
            aria-label={
              order === "asc"
                ? "Sort: allocation low to high"
                : "Sort: allocation high to low"
            }
            onClick={() => setOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-surface)] px-2.5 py-1 text-xs font-medium text-[var(--ui-text-default)] hover:bg-[var(--ui-elevated)] cursor-pointer"
          >
            <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Sort</span>
          </button>
        </div>
      </div>

      <div className="relative flex flex-row flex-wrap items-center gap-8 mt-6">
        <InstrumentDonut
          rows={sliceRows(data.buckets)}
          centerLabel={centerLabel}
          centerValue={centerValue}
          centerPct={centerPct}
          activeKey={activeKey}
          onActiveChange={setActiveKey}
        />

        <ul aria-label="Asset classes" className="flex-1 min-w-[280px] flex flex-col gap-1.5">
          {displayedBuckets.map((bucket) => {
            const key = bucketKey(bucket.label);
            const color = bucketColor(bucket.label);
            const isLive = bucket.status === "live";

            if (isLive) {
              return (
                <li
                  key={key}
                  data-testid={`legend-${key}`}
                  data-color={color}
                  data-status={bucket.status}
                  onMouseEnter={() => setActiveKey(key)}
                  onMouseLeave={() => setActiveKey(null)}
                  onFocus={() => setActiveKey(key)}
                  onBlur={() => setActiveKey(null)}
                >
                  <AppLink
                    to={bucketPath(bucket.label) ?? ""}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-xl hover:bg-[var(--ui-surface)] transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold text-[var(--ui-text-default)]">
                        {bucket.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums text-[var(--ui-text-default)]">
                        {formatPercent(bucket.percentage, { digits: 1 })}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 text-[var(--ui-text-muted)] group-hover:text-[var(--ui-text-default)] transition-colors"
                        aria-hidden="true"
                      />
                    </div>
                  </AppLink>
                </li>
              );
            }

            return (
              <li
                key={key}
                data-testid={`legend-${key}`}
                data-color={color}
                data-status={bucket.status}
                aria-disabled="true"
                tabIndex={0}
                onMouseEnter={() => setActiveKey(key)}
                onMouseLeave={() => setActiveKey(null)}
                onFocus={() => setActiveKey(key)}
                onBlur={() => setActiveKey(null)}
              >
                <div className="flex items-center justify-between w-full px-3 py-2 rounded-xl opacity-60 cursor-not-allowed">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold text-[var(--ui-text-default)]">
                      {bucket.label}
                    </span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--ui-surface)] text-[var(--ui-text-muted)]">
                      Coming soon
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums text-[var(--ui-text-muted)]">
                      —
                    </span>
                    <ChevronRight
                      className="h-4 w-4 text-[var(--ui-text-muted)]"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Hover/Focus Popup */}
        <div
          data-testid="alloc-popup"
          data-visible={active !== null ? "true" : "false"}
          aria-hidden={active !== null ? "false" : "true"}
          className={`absolute top-0 right-0 z-20 w-[220px] rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-3 shadow-lg pointer-events-none transition-opacity duration-150 ${
            active !== null ? "opacity-100" : "opacity-0"
          }`}
        >
          {active !== null && (
            <>
              <div className="text-sm font-bold text-[var(--ui-text-default)]">
                {active.label}
              </div>
              {active.status === "live" ? (
                <div className="mt-2.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ui-text-muted)]">Allocation</span>
                    <span
                      data-testid="popup-allocation"
                      className="font-semibold tabular-nums text-[var(--ui-text-default)]"
                    >
                      {formatPercent(active.percentage, { digits: 1 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ui-text-muted)]">Current Value</span>
                    <span
                      data-testid="popup-value"
                      className="font-semibold tabular-nums text-[var(--ui-text-default)]"
                    >
                      {formatRupees(active.current_value)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ui-text-muted)]">Invested</span>
                    <span
                      data-testid="popup-invested"
                      className="font-semibold tabular-nums text-[var(--ui-text-default)]"
                    >
                      {formatRupees(active.invested)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ui-text-muted)]">Gain/Loss</span>
                    <span
                      data-testid="popup-gain"
                      className="font-semibold tabular-nums text-[var(--ui-text-default)]"
                    >
                      {formatSignedRupees(active.gain_loss)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ui-text-muted)]">XIRR</span>
                    <span
                      data-testid="popup-xirr"
                      className="font-semibold tabular-nums text-[var(--ui-text-default)]"
                    >
                      {formatXirr(active.xirr)}
                    </span>
                  </div>
                </div>
              ) : (
                <p
                  data-testid="popup-soon"
                  className="text-xs text-[var(--ui-text-muted)] mt-1"
                >
                  Not tracked yet — coming soon.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
