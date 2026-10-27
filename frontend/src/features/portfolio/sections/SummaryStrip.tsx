import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent, formatRupees } from "@/lib/format";
import { toPercentString } from "@/lib/decimal";
import {
  changeDirection,
  formatSignedPercent,
  formatSignedRupees,
  formatXirr,
  partialChipText,
  todayGainLine,
} from "../portfolioFormat";
import { sparkPoints, sparkTrend } from "../portfolioCopy";
import type {
  PortfolioSummaryResponse,
  PortfolioValueSeriesResponse,
} from "../types";

export interface SummaryStripProps {
  status: "loading" | "error" | "data";
  data: PortfolioSummaryResponse | null;
  seriesStatus: "loading" | "error" | "data";
  series: PortfolioValueSeriesResponse | null;
  onRetry: () => void;
  onRetrySeries: () => void;
}

function dirColorClass(dir: "up" | "down" | "flat"): string {
  if (dir === "up") return "text-[var(--pos-text)]";
  if (dir === "down") return "text-[var(--neg-text)]";
  return "text-[var(--ui-text-muted)]";
}

function sparkStroke(trend: "up" | "down" | "flat"): string {
  if (trend === "up") return "var(--pos)";
  if (trend === "down") return "var(--neg)";
  return "var(--ui-text-muted)";
}

export function SummaryStrip({
  status,
  data,
  seriesStatus,
  series,
  onRetry,
  onRetrySeries,
}: SummaryStripProps) {
  const [basis, setBasis] = useState<"Lifetime" | "Current">("Lifetime");
  const [showExplanation, setShowExplanation] = useState(false);

  if (status === "loading") {
    return (
      <section
        role="status"
        aria-label="Loading summary"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-4"
      >
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 flex flex-col justify-between gap-3 min-h-[110px]"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </section>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-6">
        <h4 className="text-base font-semibold text-[var(--ui-text-default)]">
          Couldn't load your portfolio summary
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

  const caption = basis === "Lifetime" ? "Since inception" : "Current holdings";
  const disclaimer =
    basis === "Lifetime"
      ? data.lifetime_xirr_disclaimer
      : data.current_holdings_xirr_disclaimer;
  const shownXirr =
    basis === "Lifetime" ? data.lifetime_xirr : data.current_holdings_xirr;

  return (
    <section
      aria-label="Portfolio summary"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-4"
    >
      {/* 1. Total Portfolio Value */}
      <div
        role="group"
        aria-label="Total Portfolio Value"
        data-testid="metric-total-value"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 flex flex-col justify-between gap-2"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-[var(--ui-text-muted)]">
            Total Portfolio Value
          </span>
          <span
            data-testid="info-total-value"
            role="img"
            tabIndex={0}
            aria-label="Sum of current value across all valued holdings, family-combined or scoped to one member."
            title="Sum of current value across all valued holdings, family-combined or scoped to one member."
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--ui-divider)] text-[10px] text-[var(--ui-text-muted)] cursor-help"
          >
            i
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span
            data-testid="value-total"
            className="text-2xl font-extrabold tabular-nums text-[var(--ui-text-default)]"
          >
            {formatRupees(data.total_value)}
          </span>
          {seriesStatus === "loading" && (
            <span data-testid="sparkline-loading">
              <Skeleton className="h-[22px] w-[60px]" />
            </span>
          )}
          {(seriesStatus === "error" || (seriesStatus === "data" && !series)) && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--ui-text-muted)]">
              <span>Couldn't load trend</span>
              <button
                type="button"
                onClick={onRetrySeries}
                className="underline hover:text-[var(--ui-text-default)] cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
          {seriesStatus === "data" &&
            series &&
            !series.empty &&
            series.points.length >= 2 && (
              <svg
                data-testid="sparkline"
                viewBox="0 0 72 26"
                preserveAspectRatio="none"
                role="img"
                aria-label={`Portfolio value, last ${series.days} days`}
                className="h-[22px] w-[60px] shrink-0 overflow-visible"
              >
                <polyline
                  points={sparkPoints(series.points)}
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  stroke={sparkStroke(sparkTrend(series.points))}
                />
              </svg>
            )}
        </div>
        <div
          data-testid="today-gain"
          data-direction={changeDirection(data.today_gain)}
          className={`text-xs font-medium ${dirColorClass(changeDirection(data.today_gain))}`}
        >
          {todayGainLine(data.today_gain, data.today_pct)}
        </div>
        {partialChipText(data.missing_funds) !== "" && (
          <div className="mt-1">
            <span
              role="note"
              title={`Based on the last known NAV for: ${data.missing_funds.map((f) => f.name).join(", ")}`}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-xs text-[var(--warn-text)]"
            >
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{partialChipText(data.missing_funds)}</span>
            </span>
          </div>
        )}
      </div>

      {/* 2. Total Invested */}
      <div
        role="group"
        aria-label="Total Invested"
        data-testid="metric-invested"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 flex flex-col justify-between gap-2"
      >
        <span className="text-xs font-semibold text-[var(--ui-text-muted)]">
          Total Invested
        </span>
        <span
          data-testid="value-invested"
          className="text-2xl font-extrabold tabular-nums text-[var(--ui-text-default)]"
        >
          {formatRupees(data.total_invested)}
        </span>
        <div className="text-xs invisible" aria-hidden="true">
          placeholder
        </div>
      </div>

      {/* 3. Unrealised Gain */}
      <div
        role="group"
        aria-label="Unrealised Gain"
        data-testid="metric-unrealised"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 flex flex-col justify-between gap-2"
      >
        <span className="text-xs font-semibold text-[var(--ui-text-muted)]">
          Unrealised Gain
        </span>
        <span
          data-testid="value-unrealised"
          data-direction={changeDirection(data.unrealized_gain)}
          className={`text-2xl font-extrabold tabular-nums ${dirColorClass(changeDirection(data.unrealized_gain))}`}
        >
          {formatSignedRupees(data.unrealized_gain)}
        </span>
        {data.unrealized_pct !== null ? (
          <div
            data-testid="delta-unrealised"
            className={`text-xs font-medium ${dirColorClass(changeDirection(data.unrealized_gain))}`}
          >
            {formatSignedPercent(data.unrealized_pct, 1)}
          </div>
        ) : (
          <div className="text-xs invisible" aria-hidden="true">
            placeholder
          </div>
        )}
      </div>

      {/* 4. Realised Gain */}
      <div
        role="group"
        aria-label="Realised Gain"
        data-testid="metric-realised"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 flex flex-col justify-between gap-2"
      >
        <span className="text-xs font-semibold text-[var(--ui-text-muted)]">
          Realised Gain
        </span>
        <span
          data-testid="value-realised"
          className="text-2xl font-extrabold tabular-nums text-[var(--ui-text-default)]"
        >
          {formatRupees(data.realized_gain)}
        </span>
        <div className="text-xs invisible" aria-hidden="true">
          placeholder
        </div>
      </div>

      {/* 5. XIRR */}
      <div
        role="group"
        aria-label="XIRR"
        data-testid="metric-xirr"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 flex flex-col justify-between gap-2"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[var(--ui-text-muted)]">
              XIRR
            </span>
            <span
              data-testid="info-xirr"
              role="img"
              tabIndex={0}
              aria-label="Annualised return since inception. May include an opening balance from before you started tracking in Unifolio."
              title="Annualised return since inception. May include an opening balance from before you started tracking in Unifolio."
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--ui-divider)] text-[10px] text-[var(--ui-text-muted)] cursor-help"
            >
              i
            </span>
          </div>
          <div
            role="group"
            aria-label="XIRR basis"
            className="inline-flex rounded-lg border border-[var(--ui-divider)] p-0.5 bg-[var(--ui-surface)] text-xs"
          >
            <button
              type="button"
              aria-pressed={basis === "Lifetime"}
              onClick={() => setBasis("Lifetime")}
              className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                basis === "Lifetime"
                  ? "bg-[var(--ui-elevated)] text-[var(--ui-text-default)] shadow-xs"
                  : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text-default)]"
              }`}
            >
              Lifetime
            </button>
            <button
              type="button"
              aria-pressed={basis === "Current"}
              onClick={() => setBasis("Current")}
              className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                basis === "Current"
                  ? "bg-[var(--ui-elevated)] text-[var(--ui-text-default)] shadow-xs"
                  : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text-default)]"
              }`}
            >
              Current
            </button>
          </div>
        </div>
        <span
          data-testid="value-xirr"
          className="text-2xl font-extrabold tabular-nums text-[var(--ui-text-default)]"
        >
          {formatXirr(shownXirr)}
        </span>
        {disclaimer !== null ? (
          <button
            type="button"
            onClick={() => setShowExplanation(true)}
            className="text-xs text-[var(--ui-text-muted)] underline cursor-pointer hover:text-[var(--ui-text-default)] text-left"
          >
            {`${caption} — opening-balance disclaimer may apply ›`}
          </button>
        ) : (
          <div
            data-testid="xirr-caption"
            className="text-xs text-[var(--ui-text-muted)]"
          >
            {caption}
          </div>
        )}
      </div>

      {disclaimer !== null && (
        <Modal
          isOpen={showExplanation}
          onClose={() => setShowExplanation(false)}
          title="Why this return may be misleading"
        >
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-[var(--ui-text-muted)]">
              This comes from how your uploaded CAS statement reports old holdings, not from anything wrong with your investments or your account.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-surface)] p-3">
                <div className="text-xs text-[var(--ui-text-muted)]">
                  {`Shown ${basis} XIRR`}
                </div>
                <div
                  data-testid="disclaimer-shown"
                  className="text-xl font-bold tabular-nums text-[var(--ui-text-default)] mt-1"
                >
                  {formatXirr(shownXirr)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-surface)] p-3">
                <div className="text-xs text-[var(--ui-text-muted)]">
                  Without the undated portion
                </div>
                <div
                  data-testid="disclaimer-alt"
                  className="text-xl font-bold tabular-nums text-[var(--ui-text-default)] mt-1"
                >
                  {disclaimer.alt_xirr !== null && disclaimer.alt_xirr !== undefined
                    ? formatXirr(disclaimer.alt_xirr)
                    : "Not enough dated activity left"}
                </div>
              </div>
            </div>
            <p className="text-[var(--ui-text-muted)]">
              <span
                data-testid="disclaimer-share"
                className="font-semibold text-[var(--ui-text-default)]"
              >
                {formatPercent(toPercentString(disclaimer.opening_cost_share), {
                  digits: 0,
                })}
              </span>
              {" of the money behind this return came from an opening balance: units you already held before the period your statement covers. We use the earliest date it covers instead of the real purchase date, which can make an old holding look like it grew enormously in a few months."}
            </p>
          </div>
        </Modal>
      )}
    </section>
  );
}
