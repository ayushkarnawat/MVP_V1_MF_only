import { cn } from "@/lib/utils";
import type { LookthroughCoverage, LookthroughFundAge } from "@/features/analytics/types";
import { formatPercent } from "./lookthroughDisplay";

export function fundAgeText(fund: LookthroughFundAge): string | null {
  if (fund.age_tag === "older_than_60_days") return "older than 60 days";
  if (fund.age_tag === "on_cycle") return fund.cadence === "half_yearly" ? "on its half-yearly cycle" : `on its ${fund.cadence.replaceAll("_", "-")} cycle`;
  return null;
}

export interface CoverageBannerProps {
  coverage: LookthroughCoverage;
  excludedShare: string;
  className?: string;
}

export function CoverageBanner({ coverage, excludedShare, className }: CoverageBannerProps) {
  return (
    <aside aria-label="Portfolio disclosure coverage" className={cn("rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-xs text-[var(--color-text-secondary)] space-y-2 break-words", className)}>
      <p className="font-semibold text-[var(--color-ink)]">Based on {formatPercent(coverage.covered_value_pct, 1)}% of your portfolio</p>
      <ul className="space-y-1">
        {coverage.not_published_yet.map((fund) => <li key={`pending-${fund.scheme_id}`}>{fund.scheme_name} — not published yet</li>)}
        {coverage.not_available_from_amc.map((fund) => <li key={`unavailable-${fund.scheme_id}`}>{fund.scheme_name} — not available from this AMC</li>)}
        {coverage.missing_value_schemes.map((fund) => <li key={`value-${fund.scheme_id}`}>{fund.scheme_name} — value unavailable; coverage is based on the funds we can value</li>)}
        {coverage.funds.filter((fund) => fundAgeText(fund)).map((fund) => <li key={`age-${fund.scheme_id}`}>{fund.scheme_name} — {fundAgeText(fund)}</li>)}
      </ul>
      <p>Derivative and other positions excluded from this view: {formatPercent(excludedShare)}% (net disclosed share).</p>
    </aside>
  );
}
