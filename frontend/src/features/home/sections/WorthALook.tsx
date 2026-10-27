import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent, formatSignedPercent } from "../homeFormat";
import type { WorthCardOut, WorthResponse } from "../types";
import {
  comparisonBars,
  concentrationTrend,
  costScale,
  formatMonthYear,
  scoreChip,
  worthChip,
  worthDetail,
  worthHeadline,
} from "../worthCopy";

export interface WorthALookProps {
  status: "loading" | "error" | "data";
  data: WorthResponse | null;
}

function str(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && isFinite(value)) {
    return String(value);
  }
  return null;
}

interface StockItem {
  name: string;
  exposure: string;
}

function parseStocks(raw: unknown): StockItem[] {
  if (!Array.isArray(raw)) return [];
  const result: StockItem[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const name = str((item as Record<string, unknown>).name);
      const exposure = str((item as Record<string, unknown>).exposure_pct);
      if (name != null && exposure != null) {
        result.push({ name, exposure });
      }
    }
  }
  return result;
}

function UnderperformingVisual({
  evidence,
}: {
  evidence: Record<string, unknown>;
}) {
  const fundVal = str(evidence.fund_1y_pct);
  const catVal = str(evidence.category_avg_1y_pct);
  if (fundVal == null || catVal == null) return null;

  const { fund: fBar, category: cBar } = comparisonBars(fundVal, catVal);

  return (
    <div className="space-y-2 pt-1">
      <div className="text-xs font-medium text-[var(--ui-text-muted)]">
        Last 1 year
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-[var(--ui-text-muted)]">
            This fund
          </span>
          <div
            aria-hidden="true"
            className="relative h-2 flex-1 rounded bg-[var(--ui-divider)]"
          >
            <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-[var(--ui-border-hover)] opacity-40" />
            <i
              data-testid="compare-fund"
              data-side={fBar.side}
              style={{
                width: `${fBar.width}%`,
                backgroundColor:
                  fBar.side === "loss" ? "var(--neg-text)" : "var(--pos-text)",
                ...(fBar.side === "loss" ? { right: "50%" } : { left: "50%" }),
              }}
              className="absolute top-0 bottom-0 rounded-sm"
            />
          </div>
          <span
            className="w-12 shrink-0 text-right font-semibold tabular-nums"
            style={{
              color:
                fBar.side === "loss" ? "var(--neg-text)" : "var(--pos-text)",
            }}
          >
            {formatSignedPercent(fundVal, 1)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-[var(--ui-text-muted)]">
            Category
          </span>
          <div
            aria-hidden="true"
            className="relative h-2 flex-1 rounded bg-[var(--ui-divider)]"
          >
            <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-[var(--ui-border-hover)] opacity-40" />
            <i
              data-testid="compare-category"
              data-side={cBar.side}
              style={{
                width: `${cBar.width}%`,
                backgroundColor:
                  cBar.side === "loss" ? "var(--neg-text)" : "var(--pos-text)",
                ...(cBar.side === "loss" ? { right: "50%" } : { left: "50%" }),
              }}
              className="absolute top-0 bottom-0 rounded-sm"
            />
          </div>
          <span
            className="w-12 shrink-0 text-right font-semibold tabular-nums"
            style={{
              color:
                cBar.side === "loss" ? "var(--neg-text)" : "var(--pos-text)",
            }}
          >
            {formatSignedPercent(catVal, 1)}
          </span>
        </div>
      </div>
    </div>
  );
}

function HighExpenseVisual({
  evidence,
}: {
  evidence: Record<string, unknown>;
}) {
  const ter = str(evidence.ter);
  const avg = str(evidence.category_avg_ter);
  if (ter == null || avg == null) return null;

  const { tick, dot } = costScale(ter, avg);

  return (
    <div className="space-y-2 pt-1">
      <div
        aria-hidden="true"
        className="relative h-2 w-full rounded bg-[var(--ui-divider)]"
      >
        <i
          data-testid="cost-tick"
          style={{ left: `${tick}%` }}
          className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-[var(--ui-text-muted)]"
        />
        <i
          data-testid="cost-dot"
          style={{ left: `${dot}%`, backgroundColor: "var(--warn-text)" }}
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        />
      </div>
      <div className="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
        <span>{`Category average ${formatPercent(avg, { digits: 2 })}`}</span>
        <span className="font-semibold text-[var(--warn-text)]">{`This fund ${formatPercent(ter, { digits: 2 })}`}</span>
      </div>
    </div>
  );
}

function ConcentrationVisual({
  evidence,
}: {
  evidence: Record<string, unknown>;
}) {
  const top5Pct = str(evidence.top5_pct);
  const holdingsAsOf = str(evidence.holdings_as_of);
  const stocks = parseStocks(evidence.stocks);
  const trend = concentrationTrend(evidence);

  return (
    <div className="space-y-3 pt-1">
      <div className="text-xs text-[var(--ui-text-muted)]">
        {`Approximate · holdings as of ${formatMonthYear(holdingsAsOf)}`}
      </div>

      <div className="flex flex-wrap items-baseline gap-2">
        {top5Pct != null ? (
          <span
            data-testid="concentration-pct"
            className="text-2xl font-bold text-[var(--ui-text)]"
          >
            {formatPercent(top5Pct, { digits: 0 })}
          </span>
        ) : null}
        <span className="text-xs text-[var(--ui-text-muted)]">
          {`of your portfolio value sits in just ${stocks.length} stocks`}
        </span>
      </div>

      {trend ? (
        <div className="flex items-center gap-2">
          <span
            data-testid="concentration-trend"
            className="rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-xs font-medium text-[var(--warn-text)]"
          >
            {trend.chip}
          </span>
          <span className="text-xs text-[var(--ui-text-muted)]">
            {trend.earlier}
          </span>
        </div>
      ) : null}

      {stocks.length > 0 ? (
        <div
          aria-hidden="true"
          className="flex h-2 w-full overflow-hidden rounded bg-[var(--ui-divider)]"
        >
          {stocks.map((stock, index) => {
            const colorVar = `var(--c${index + 1})`;
            return (
              <i
                key={stock.name}
                data-testid={`stock-segment-${index}`}
                data-color={colorVar}
                style={{
                  width: `${Number(stock.exposure)}%`,
                  backgroundColor: colorVar,
                }}
              />
            );
          })}
        </div>
      ) : null}

      {stocks.length > 0 ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-[var(--ui-text-muted)]">
          {stocks.map((stock, index) => {
            const colorVar = `var(--c${index + 1})`;
            return (
              <li key={stock.name} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: colorVar }}
                />
                <span>
                  {`${stock.name} `}
                  <strong className="font-semibold text-[var(--ui-text)]">
                    {formatPercent(stock.exposure, { digits: 1 })}
                  </strong>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function WorthCard({ card }: { card: WorthCardOut }) {
  const score = scoreChip(card);
  const headline = worthHeadline(card);
  const detail = worthDetail(card);

  const linkText =
    card.kind === "weak_fund" || card.kind === "underperforming"
      ? "Review this fund"
      : card.kind === "high_expense"
        ? "See how costs compare"
        : "See what is driving it";

  return (
    <div
      data-testid={`worth-card-${card.kind}`}
      className="flex flex-col justify-between rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
    >
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-xs font-medium text-[var(--warn-text)]">
            {worthChip(card.kind)}
          </span>
          {score ? (
            <span
              data-score-color={score.color}
              style={{ color: score.color }}
              className="rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-xs font-medium"
            >
              {score.text}
            </span>
          ) : null}
        </div>

        <h3 className="text-base font-semibold text-[var(--ui-text)]">
          {headline}
        </h3>

        {detail ? (
          <p className="text-xs text-[var(--ui-text-muted)] leading-relaxed">
            {detail}
          </p>
        ) : null}

        {card.kind === "underperforming" ? (
          <UnderperformingVisual evidence={card.evidence} />
        ) : card.kind === "high_expense" ? (
          <HighExpenseVisual evidence={card.evidence} />
        ) : card.kind === "concentration" ? (
          <ConcentrationVisual evidence={card.evidence} />
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[var(--ui-divider)] pt-3 text-xs">
        <span />
        <span
          aria-disabled="true"
          title="Coming soon"
          className="inline-flex cursor-not-allowed items-center gap-1 text-[var(--ui-disabled-text)]"
        >
          <span>{linkText}</span>
          <ArrowRight
            size={14}
            className="text-[var(--ui-text-muted)]"
            aria-hidden="true"
          />
        </span>
      </div>
    </div>
  );
}

export function WorthALook({ status, data }: WorthALookProps) {
  if (status === "loading") {
    return (
      <section
        role="status"
        aria-label="Loading worth a look"
        className="space-y-4"
      >
        <Skeleton className="h-6 w-32" />
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
      </section>
    );
  }

  if (status === "error" || !data) {
    return (
      <section className="space-y-2">
        <h3 className="text-base font-semibold text-[var(--ui-text)]">
          Worth a look
        </h3>
        <p className="text-sm text-[var(--ui-text-muted)]">
          Could not check right now.
        </p>
      </section>
    );
  }

  if (data.state === "unavailable") {
    return null;
  }

  if (data.state === "nothing_flagged") {
    return (
      <section className="space-y-2">
        <h3 className="text-base font-semibold text-[var(--ui-text)]">
          Worth a look
        </h3>
        <p className="text-sm text-[var(--ui-text-muted)]">
          Nothing needs attention.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold text-[var(--ui-text)]">
        Worth a look
      </h3>
      <div className="grid gap-3 md:grid-cols-3">
        {data.cards.map(card => (
          <WorthCard key={`${card.kind}-${card.rank}`} card={card} />
        ))}
      </div>
    </section>
  );
}
