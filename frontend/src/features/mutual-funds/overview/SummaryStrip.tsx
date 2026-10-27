import { useState } from "react";
import { Modal } from "../../../components/Modal";
import { Skeleton } from "../../../components/ui/skeleton";
import { toPercentString } from "../../../lib/decimal";
import { formatPercent, formatRupees } from "../../../lib/format";
import { InfoMark } from "../common/SectionCard";
import {
  changeDirection,
  formatSignedPercent,
  formatSignedRupees,
  formatXirr,
  holdingTotals,
  sparkPoints,
  sparkTrend,
} from "../mfCopy";
import type { HistoryPoint, HoldingRow, Load, RealizedSummary, XirrBundle } from "../types";

export interface SummaryStripProps {
  holdings: Load<HoldingRow[]>;
  xirr: Load<XirrBundle>;
  realized: Load<RealizedSummary | null>;
  history: Load<HistoryPoint[]>;
  synopsis: string | null;
}

export function SummaryStrip({
  holdings,
  xirr,
  realized,
  history,
  synopsis,
}: SummaryStripProps) {
  const [basis, setBasis] = useState<"lifetime" | "current">("lifetime");
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);

  if (holdings.status === "loading") {
    return (
      <section
        role="status"
        aria-label="Loading summary"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </section>
    );
  }

  if (holdings.status === "error" || holdings.data === null) {
    return (
      <section className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4">
        <h4 className="text-base font-semibold text-[var(--ui-text)]">
          Couldn't load your portfolio summary
        </h4>
        <p className="mt-1 text-sm text-[var(--ui-text-muted)]">
          This section failed to load, but the rest of the page is unaffected.
        </p>
        <button
          type="button"
          onClick={holdings.retry}
          data-clickable=""
          data-effect="retry"
          className="mt-3 text-sm font-medium text-[var(--pos-text)] hover:underline"
        >
          Retry
        </button>
      </section>
    );
  }

  const totals = holdingTotals(holdings.data);

  const staleRows = holdings.data.filter(r => !r.nav_unavailable && r.stale_nav);
  const unpricedRows = holdings.data.filter(r => r.nav_unavailable);

  const unrealisedDir = changeDirection(totals.unrealised);
  const todayDir = changeDirection(totals.todayGain);

  const dirColor = (dir: "up" | "down" | "flat") => {
    if (dir === "up") return "text-[var(--pos-text)]";
    if (dir === "down") return "text-[var(--neg-text)]";
    return "text-[var(--ui-text-muted)]";
  };

  const currentXirrValue =
    xirr.data !== null
      ? basis === "lifetime"
        ? xirr.data.lifetime
        : xirr.data.current
      : null;

  const currentDisclaimer =
    xirr.data !== null
      ? basis === "lifetime"
        ? xirr.data.disclaimers.lifetime
        : xirr.data.disclaimers.current
      : null;

  const caption = basis === "lifetime" ? "Since inception" : "Current holdings";

  const renderSparkline = () => {
    if (history.status === "loading") {
      return (
        <span data-testid="sparkline-loading">
          <Skeleton className="h-[22px] w-[60px]" />
        </span>
      );
    }
    if (history.status === "error") {
      return (
        <div className="flex items-center gap-1.5 text-xs text-[var(--ui-text-muted)]">
          <span>Couldn't load trend</span>
          <button
            type="button"
            data-clickable=""
            data-effect="retry"
            onClick={history.retry}
            className="text-[var(--pos-text)] hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }
    if (!history.data || history.data.length < 2) {
      return null;
    }
    const trend = sparkTrend(history.data);
    const stroke =
      trend === "up"
        ? "var(--pos)"
        : trend === "down"
          ? "var(--neg)"
          : "var(--ui-text-muted)";

    return (
      <svg
        data-testid="sparkline"
        viewBox="0 0 72 26"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Portfolio value, last ${history.data.length} months`}
        className="h-[22px] w-[60px] overflow-visible"
      >
        <polyline
          points={sparkPoints(history.data)}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <section
        aria-label="Portfolio summary"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* 1. Total Portfolio Value */}
          <div
            role="group"
            aria-label="Total Portfolio Value"
            data-testid="metric-total-value"
            className="flex flex-col gap-1"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--ui-text-muted)]">
              <span>Total Portfolio Value</span>
              <InfoMark
                text="Sum of current value across all mutual fund holdings, family-combined or scoped to one member."
                testId="info-total-value"
              />
            </div>
            <div className="flex items-center gap-2">
              <span data-testid="value-total" className="text-xl font-bold text-[var(--ui-text)]">
                {formatRupees(totals.value)}
              </span>
              {renderSparkline()}
            </div>
            <div
              data-testid="today-gain"
              data-direction={todayDir}
              className={`text-xs ${dirColor(todayDir)}`}
            >
              Today: {formatSignedRupees(totals.todayGain)}
              {totals.todayPct !== null ? ` (${formatPercent(totals.todayPct, { digits: 2 })})` : ""}
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {totals.staleCount > 0 && (
                <span
                  role="note"
                  title={`Based on the last known NAV for: ${staleRows.map(r => r.scheme_name).join(", ")}`}
                  className="inline-flex rounded-md bg-[var(--warn-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--warn-text)]"
                >
                  {totals.staleCount} on last known NAV
                </span>
              )}
              {totals.unpricedCount > 0 && (
                <span
                  role="note"
                  title={`No NAV yet, left out of every total: ${unpricedRows.map(r => r.scheme_name).join(", ")}`}
                  className="inline-flex rounded-md bg-[var(--warn-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--warn-text)]"
                >
                  {totals.unpricedCount} not priced yet
                </span>
              )}
            </div>
          </div>

          {/* 2. Total Invested */}
          <div
            role="group"
            aria-label="Total Invested"
            data-testid="metric-invested"
            className="flex flex-col gap-1"
          >
            <div className="text-xs font-medium text-[var(--ui-text-muted)]">
              Total Invested
            </div>
            <span data-testid="value-invested" className="text-xl font-bold text-[var(--ui-text)]">
              {formatRupees(totals.invested)}
            </span>
          </div>

          {/* 3. Unrealised Gain */}
          <div
            role="group"
            aria-label="Unrealised Gain"
            data-testid="metric-unrealised"
            className="flex flex-col gap-1"
          >
            <div className="text-xs font-medium text-[var(--ui-text-muted)]">
              Unrealised Gain
            </div>
            <span
              data-testid="value-unrealised"
              data-direction={unrealisedDir}
              className={`text-xl font-bold ${dirColor(unrealisedDir)}`}
            >
              {formatSignedRupees(totals.unrealised)}
            </span>
            {totals.unrealisedPct !== null && (
              <div
                data-testid="delta-unrealised"
                className={`text-xs ${dirColor(unrealisedDir)}`}
              >
                {formatSignedPercent(totals.unrealisedPct, 1)}
              </div>
            )}
          </div>

          {/* 4. Realised Gain */}
          <div
            role="group"
            aria-label="Realised Gain"
            data-testid="metric-realised"
            className="flex flex-col gap-1"
          >
            <div className="text-xs font-medium text-[var(--ui-text-muted)]">
              Realised Gain
            </div>
            {realized.status === "loading" ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <span data-testid="value-realised" className="text-xl font-bold text-[var(--ui-text)]">
                {realized.status === "data" && realized.data !== null
                  ? formatRupees(realized.data.total)
                  : "—"}
              </span>
            )}
          </div>

          {/* 5. XIRR */}
          <div
            role="group"
            aria-label="XIRR"
            data-testid="metric-xirr"
            className="flex flex-col gap-1"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--ui-text-muted)]">
                <span>XIRR</span>
                <InfoMark
                  text="Annualised return since inception. May include an opening balance from before you started tracking in Unifolio."
                  testId="info-xirr"
                />
              </div>
              <div
                role="tablist"
                aria-label="XIRR basis"
                className="inline-flex rounded-lg border border-[var(--ui-divider)] p-0.5 text-[11px]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={basis === "lifetime"}
                  data-clickable=""
                  data-effect="switch"
                  onClick={() => {
                    setBasis("lifetime");
                    setIsDisclaimerOpen(false);
                  }}
                  className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
                    basis === "lifetime"
                      ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                      : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                  }`}
                >
                  Lifetime
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={basis === "current"}
                  data-clickable=""
                  data-effect="switch"
                  onClick={() => {
                    setBasis("current");
                    setIsDisclaimerOpen(false);
                  }}
                  className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
                    basis === "current"
                      ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                      : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                  }`}
                >
                  Current
                </button>
              </div>
            </div>

            {xirr.status === "loading" ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <span data-testid="value-xirr" className="text-xl font-bold text-[var(--ui-text)]">
                {xirr.status === "error" ? "—" : formatXirr(currentXirrValue)}
              </span>
            )}

            {currentDisclaimer ? (
              <button
                type="button"
                data-clickable=""
                data-effect="open"
                onClick={() => setIsDisclaimerOpen(true)}
                className="text-left text-xs text-[var(--ui-text-muted)] hover:underline"
              >
                {caption} — opening-balance disclaimer may apply ›
              </button>
            ) : (
              <div data-testid="xirr-caption" className="text-xs text-[var(--ui-text-muted)]">
                {caption}
              </div>
            )}
          </div>
        </div>
      </section>

      {synopsis !== null && (
        <p data-testid="synopsis" className="text-xs text-[var(--ui-text-muted)]">
          {synopsis}
        </p>
      )}

      {currentDisclaimer && (
        <Modal
          title="Why this return may be misleading"
          isOpen={isDisclaimerOpen}
          onClose={() => setIsDisclaimerOpen(false)}
        >
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-[var(--ui-text)]">
              This comes from how your uploaded CAS statement reports old holdings, not from anything wrong with your investments or your account.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3">
                <div className="text-xs text-[var(--ui-text-muted)]">
                  Shown {basis === "lifetime" ? "Lifetime" : "Current"} XIRR
                </div>
                <div data-testid="disclaimer-shown" className="mt-1 text-lg font-semibold text-[var(--ui-text)]">
                  {formatXirr(currentXirrValue)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3">
                <div className="text-xs text-[var(--ui-text-muted)]">
                  Without the undated portion
                </div>
                <div data-testid="disclaimer-alt" className="mt-1 text-lg font-semibold text-[var(--ui-text)]">
                  {currentDisclaimer.alt_xirr != null
                    ? formatXirr(currentDisclaimer.alt_xirr)
                    : "Not enough dated activity left"}
                </div>
              </div>
            </div>
            <p className="text-[var(--ui-text-muted)]">
              <span data-testid="disclaimer-share" className="font-semibold text-[var(--ui-text)]">
                {formatPercent(toPercentString(currentDisclaimer.opening_cost_share), { digits: 0 })}
              </span>{" "}
              of the money behind this return came from an opening balance: units you already held before the period your statement covers. We use the earliest date it covers instead of the real purchase date, which can make an old holding look like it grew enormously in a few months.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
