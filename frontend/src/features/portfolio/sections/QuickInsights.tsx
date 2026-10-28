import { Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLink } from "@/shell/nav/AppLink";
import { paths } from "@/shell/nav/paths";
import { hasInsights, insightLines } from "../quickInsightsCopy";
import type { PortfolioInsightsResponse } from "../types";

export interface QuickInsightsProps {
  status: "loading" | "error" | "data";
  data: PortfolioInsightsResponse | null;
  onRetry: () => void;
}

export function QuickInsights({ status, data, onRetry }: QuickInsightsProps) {
  if (status === "loading") {
    return (
      <section
        role="status"
        aria-label="Loading quick insights"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 space-y-4"
      >
        <Skeleton className="h-6 w-36" />
        <div className="space-y-2.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </section>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-6">
        <h4 className="text-base font-semibold text-[var(--ui-text-default)]">
          Couldn't load your quick insights
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

  if (!hasInsights(data)) {
    return null;
  }

  const lines = insightLines(data.insights);

  return (
    <section
      aria-labelledby="insights-title"
      className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          id="insights-title"
          className="text-base font-semibold text-[var(--ui-text-default)]"
        >
          Quick Insights
        </h3>
        <span className="text-xs text-[var(--ui-text-muted)]">
          From your current holdings
        </span>
      </div>
      <ul aria-label="Quick insights" className="mt-4 space-y-2.5">
        {lines.map((line) => (
          <li
            key={line.id}
            data-testid={`insight-${line.id}`}
            className="flex items-start gap-[10px] text-[13px] leading-[1.5] text-[var(--ui-text-default)]"
          >
            <span
              data-testid="insight-check"
              aria-hidden="true"
              className="mt-[1px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full bg-[var(--pos)] text-white"
            >
              <Check className="h-[10px] w-[10px]" strokeWidth={3} />
            </span>
            <span>
              {line.parts.map((part, idx) =>
                part.bold ? (
                  <b key={idx} className="font-semibold text-[var(--ui-text-default)]">
                    {part.schemeId ? (
                      <AppLink
                        to={paths.mutualFunds.fund(part.schemeId)}
                        className="hover:underline"
                      >
                        {part.text}
                      </AppLink>
                    ) : (
                      part.text
                    )}
                  </b>
                ) : (
                  <span key={idx}>{part.text}</span>
                )
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
