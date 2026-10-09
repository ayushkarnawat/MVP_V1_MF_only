// frontend/src/features/analytics/FundRankingSection.tsx
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toPercentString } from "@/lib/decimal";
import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";
import type { FundRankingComponent, FundRankingRow, FundRankingSummary } from "./types";

export interface FundRankingSectionProps {
  data: FundRankingSummary | null;
  isLoading?: boolean;
  className?: string;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// Returns, category-relative and downside deviation arrive as fractions ("0.241");
// TER is already a percent ("0.75" = 0.75%, scheme_ter is Numeric(5, 2)).
function formatRaw(raw: string, unit: "fraction" | "percent"): string {
  return unit === "percent" ? `${raw}%` : `${toPercentString(raw)}%`;
}

function shortCategory(name: string | null): string {
  if (!name) return "";
  const tail = name.includes(" - ") ? name.slice(name.indexOf(" - ") + 3) : name;
  return tail.replace(/\s+Fund$/, "");
}

// D1: under 5 ranked funds a percentile only restates the rank, so it's dropped.
// Percentiles are non-negative Decimal strings. Round for display using
// decimal digits, then convert only the bounded integer ordinal to Number.
function roundPercentile(value: string): number {
  const [whole, fraction = ""] = value.split(".");
  return Number(BigInt(whole) + (fraction.charAt(0) >= "5" ? 1n : 0n));
}

function rankLine(fund: FundRankingRow): string {
  const counts = `${fund.category_universe_size} in category`;
  if (fund.thin_category) {
    return `${ordinal(fund.category_rank ?? 0)} of ${fund.category_size} ranked ${shortCategory(fund.category_name)} funds · ${counts}`;
  }
  const top = fund.percentile !== null ? ` · Top ${100 - roundPercentile(fund.percentile)}%` : "";
  return `#${fund.category_rank} of ${fund.category_size} ranked · ${counts}${top}`;
}

function ComponentRow({ label, weight, component, unit = "fraction" }: { label: string; weight: string; component: FundRankingComponent; unit?: "fraction" | "percent" }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[var(--color-text-secondary)]">{label} ({weight})</span>
      <span className="font-semibold text-[var(--color-ink)] tabular-nums">
        {component.percentile !== null ? `${ordinal(roundPercentile(component.percentile))} pct` : "—"}
        {component.raw !== null ? ` · ${formatRaw(component.raw, unit)}` : ""}
      </span>
    </div>
  );
}

function FundLeaderboardCard({ fund }: { fund: FundRankingRow }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  if (fund.category_unavailable) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4 sm:p-5 flex items-center justify-between">
        <span className="font-display text-sm font-bold text-[var(--color-ink)]">{fund.scheme_name}</span>
        <Badge variant="warning" className="text-[10px] font-semibold px-2 py-0">Category Unavailable</Badge>
      </div>
    );
  }

  if (fund.insufficient_history) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4 sm:p-5 space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-bold text-[var(--color-ink)]">{fund.scheme_name}</span>
          <Badge variant="warning" className="text-[10px] font-semibold px-2 py-0">Insufficient History</Badge>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Not ranked yet — needs 3 years of NAV history to be eligible.
        </p>
      </div>
    );
  }

  if (fund.too_few_peers) {
    // D2: no rank below 3 ranked funds; show the fund's own numbers instead.
    const r3 = fund.components.return_3y.raw;
    const ter = fund.components.low_ter.raw;
    const n = fund.category_size;
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4 sm:p-5 space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-bold text-[var(--color-ink)]">{fund.scheme_name}</span>
          <Badge variant="outline">Not enough peers</Badge>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Not enough peers to rank: {n} {n === 1 ? "fund" : "funds"} in this category {n === 1 ? "has" : "have"} a 3-year record ({fund.category_universe_size} in category).
        </p>
        <p className="text-xs font-semibold text-[var(--color-ink)] tabular-nums">
          3Y return {r3 !== null ? formatRaw(r3, "fraction") : "—"} · Expense ratio {ter !== null ? formatRaw(ter, "percent") : "—"}
        </p>
      </div>
    );
  }

  const above = fund.neighbors.filter((n) => fund.category_rank !== null && n.category_rank < fund.category_rank).sort((a, b) => a.category_rank - b.category_rank);
  const below = fund.neighbors.filter((n) => fund.category_rank !== null && n.category_rank > fund.category_rank).sort((a, b) => a.category_rank - b.category_rank);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 overflow-hidden">
      <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((prev) => !prev)} className="w-full text-left p-4 sm:p-5 space-y-3">
        <span className="flex items-center justify-between flex-wrap gap-2">
          <span className="block">
            <span className="font-display text-sm font-bold text-[var(--color-ink)]">{fund.scheme_name}</span>
            <span className="block text-xs text-[var(--color-text-secondary)]">
              {fund.category_name}
            </span>
            {fund.ranked_as && (
              <span className="block text-xs text-[var(--color-text-secondary)]">Ranked on {fund.ranked_as}</span>
            )}
          </span>
          <span className="flex items-center gap-2">
            {fund.thin_category && <Badge variant="outline" className="text-[10px] border-[var(--color-warning)] text-[var(--color-warning)] px-2 py-0">Thin Category ({fund.category_size} peers)</Badge>}
            <span className="text-xs font-semibold text-[var(--color-ink)] tabular-nums">{rankLine(fund)}</span>
          </span>
        </span>
        {fund.thin_category && (
          <span className="block text-xs text-[var(--color-text-secondary)]">
            Only {fund.category_size} {shortCategory(fund.category_name)} funds have a 3-year record, so this compares your fund with very few others.
          </span>
        )}
        <span className="block space-y-1">
          {above.map((n) => (
            <span key={n.scheme_id} className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
              <span>#{n.category_rank} {n.scheme_name}</span>
              <span className="tabular-nums">{n.composite_score}</span>
            </span>
          ))}
          <span className="flex items-center justify-between text-xs font-bold text-[var(--color-ink)] bg-[var(--color-accent)]/10 rounded-lg px-2 py-1">
            <span>#{fund.category_rank} {fund.scheme_name} (you)</span>
            <span className="tabular-nums">{fund.composite_score}</span>
          </span>
          {below.map((n) => (
            <span key={n.scheme_id} className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
              <span>#{n.category_rank} {n.scheme_name}</span>
              <span className="tabular-nums">{n.composite_score}</span>
            </span>
          ))}
        </span>
      </button>
      {expanded && (
        <div id={detailsId} className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-2 border-t border-[var(--color-border)]/60 pt-3">
          <ComponentRow label="3Y return" weight="25%" component={fund.components.return_3y} />
          <ComponentRow label="5Y return" weight="25%" component={fund.components.return_5y} />
          <ComponentRow label="Category-relative" weight="20%" component={fund.components.category_relative} />
          <ComponentRow label="Low volatility" weight="15%" component={fund.components.low_volatility} />
          <ComponentRow label="Low TER" weight="15%" component={fund.components.low_ter} unit="percent" />
        </div>
      )}
    </div>
  );
}

export function FundRankingSection({ data, isLoading = false, className }: FundRankingSectionProps) {
  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-4", className)}>
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  const funds = data?.funds ?? [];

  return (
    <section className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6 shadow-2xs space-y-6 transition-colors duration-200", className)}>
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)]">Fund Ranking</h2>
        <Trophy className="h-4 w-4 text-[var(--color-accent)]" />
      </div>

      {funds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">No fund ranking data available</p>
        </div>
      ) : (
        <div className="space-y-3">
          {funds.map((fund) => (
            <FundLeaderboardCard key={fund.scheme_id} fund={fund} />
          ))}
        </div>
      )}
    </section>
  );
}
