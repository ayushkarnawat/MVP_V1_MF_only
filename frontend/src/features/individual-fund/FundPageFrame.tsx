import { useRef, type ReactNode } from "react";
import { ChevronRight, Ellipsis, Plus } from "lucide-react";
import { ApiError } from "@/lib/apiClient";
import { DISABLED } from "@/lib/clickable";
import { SchemeLogo } from "@/components/SchemeLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { AppLink } from "@/shell/nav/AppLink";
import { paths } from "@/shell/nav/paths";
import { fundPageApi } from "./api";
import { useFundPageScope, useFundSection } from "./useFundSection";
import { COMING_SOON } from "./fundCopy";
import { planPill, shortCategory } from "./fundFormat";
import type { SummaryResponse } from "./types";

export type FundTab = "overview" | "overlap" | "insights";

export interface FundPageContext {
  schemeId: string;
  scope: string;
  summary: SummaryResponse;
  refreshing: boolean;
}

export interface FundPageFrameProps {
  schemeId: string;
  tab: FundTab;
  aboveTabs?: (ctx: FundPageContext) => ReactNode;
  children: (ctx: FundPageContext) => ReactNode;
}

export function FundPageFrame({
  schemeId,
  tab,
  aboveTabs,
  children,
}: FundPageFrameProps) {
  const scope = useFundPageScope();

  const summary = useFundSection<SummaryResponse>(
    (signal) => fundPageApi.summary(schemeId, scope, signal),
    [schemeId, scope]
  );

  const lastReadyRef = useRef<{
    schemeId: string;
    data: SummaryResponse;
  } | null>(null);

  if (summary.status === "ready" && summary.data) {
    lastReadyRef.current = { schemeId, data: summary.data };
  }

  const data: SummaryResponse | null =
    summary.status === "ready" && summary.data
      ? summary.data
      : summary.status === "loading" &&
          lastReadyRef.current?.schemeId === schemeId
        ? lastReadyRef.current.data
        : null;

  const renderInitialBreadcrumb = () => (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 text-sm text-[var(--ui-text-muted)]">
        <li>
          <AppLink to={paths.portfolio()}>Investments</AppLink>
        </li>
        <li aria-hidden="true">
          <ChevronRight size={14} />
        </li>
        <li>
          <AppLink to={paths.mutualFunds.root()}>Mutual Funds</AppLink>
        </li>
      </ol>
    </nav>
  );

  if (!data) {
    if (
      summary.status === "error" &&
      summary.error instanceof ApiError &&
      summary.error.status === 404
    ) {
      return (
        <section className="space-y-6 font-body text-[var(--shell-text)]">
          {renderInitialBreadcrumb()}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold font-display text-[var(--ui-text)]">
              Fund not found
            </h1>
            <p className="text-sm text-[var(--ui-text-muted)]">
              We couldn't find this fund in your portfolio. It may have been
              removed, or the link may be wrong.
            </p>
            <div className="pt-2">
              <AppLink
                to={paths.mutualFunds.root()}
                className="text-sm font-semibold text-[var(--c2)] hover:underline"
              >
                Back to Mutual Funds
              </AppLink>
            </div>
          </div>
        </section>
      );
    }

    if (summary.status === "error") {
      return (
        <section className="space-y-6 font-body text-[var(--shell-text)]">
          {renderInitialBreadcrumb()}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold font-display text-[var(--ui-text)]">
              Couldn't load this fund
            </h1>
            <p className="text-sm text-[var(--ui-text-muted)]">
              There was a problem reaching our servers. Your data is safe — this
              is just a connection issue.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={summary.retry}
                className="rounded px-3 py-1.5 text-xs font-semibold bg-[var(--ui-card)] text-[var(--ui-text)] hover:opacity-90 border border-[var(--ui-divider)]"
              >
                Retry
              </button>
            </div>
          </div>
        </section>
      );
    }

    // loading
    return (
      <section className="space-y-6 font-body text-[var(--shell-text)]">
        {renderInitialBreadcrumb()}
        <div role="status" aria-label="Loading fund" className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-32 w-full" />
        </div>
      </section>
    );
  }

  const ctx: FundPageContext = {
    schemeId,
    scope,
    summary: data,
    refreshing: summary.status !== "ready",
  };

  const scheme = data.scheme;
  const pills = [
    planPill(scheme.plan),
    shortCategory(scheme.category),
    scheme.amc_name,
  ].filter(Boolean);

  return (
    <section
      data-testid="fund-page"
      className="space-y-6 font-body text-[var(--shell-text)]"
    >
      {/* 1. Breadcrumb */}
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 text-sm text-[var(--ui-text-muted)]">
          <li>
            <AppLink to={paths.portfolio()}>Investments</AppLink>
          </li>
          <li aria-hidden="true">
            <ChevronRight size={14} />
          </li>
          <li>
            <AppLink to={paths.mutualFunds.root()}>Mutual Funds</AppLink>
          </li>
          <li aria-hidden="true">
            <ChevronRight size={14} />
          </li>
          {tab === "overview" ? (
            <li>
              <span aria-current="page" className="text-[var(--ui-text)] font-medium">
                {scheme.name}
              </span>
            </li>
          ) : (
            <>
              <li>
                <AppLink to={paths.mutualFunds.fund(schemeId)}>
                  {scheme.name}
                </AppLink>
              </li>
              <li aria-hidden="true">
                <ChevronRight size={14} />
              </li>
              <li>
                <span aria-current="page" className="text-[var(--ui-text)] font-medium">
                  {tab === "overlap" ? "Overlap" : "Insights"}
                </span>
              </li>
            </>
          )}
        </ol>
      </nav>

      {/* 2. Header */}
      <header
        data-testid="fund-header"
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div className="flex items-start gap-4">
          <SchemeLogo
            amcName={scheme.amc_name}
            schemeName={scheme.name}
            size="lg"
          />
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold font-display text-[var(--ui-text)]">
              {scheme.name}
            </h1>
            <ul
              aria-label="Fund details"
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              {pills.map((pill) => (
                <li
                  key={pill}
                  data-testid="fund-pill"
                  className="rounded-md border border-[var(--ui-divider)] bg-[var(--ui-card)] px-2 py-0.5 text-[var(--ui-text-muted)]"
                >
                  {pill}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-disabled="true"
            title={COMING_SOON}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${DISABLED}`}
          >
            <Plus size={14} aria-hidden="true" />
            <span>Add Investment</span>
          </button>
          <button
            type="button"
            aria-disabled="true"
            aria-label="More"
            title={COMING_SOON}
            className={`inline-flex items-center justify-center rounded-lg p-1.5 ${DISABLED}`}
          >
            <Ellipsis size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* 3. Above tabs */}
      {aboveTabs?.(ctx)}

      {/* 4. Tab strip */}
      <nav aria-label="Fund sections" className="border-b border-[var(--ui-divider)]">
        <div className="flex gap-6 text-sm font-medium">
          <AppLink
            to={paths.mutualFunds.fund(schemeId)}
            className="pb-3 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] transition-colors border-b-2 border-transparent"
            activeClassName="text-[var(--ui-text)] !border-[var(--ui-focus)]"
          >
            Overview
          </AppLink>
          <AppLink
            to={paths.mutualFunds.fundOverlap(schemeId)}
            className="pb-3 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] transition-colors border-b-2 border-transparent"
            activeClassName="text-[var(--ui-text)] !border-[var(--ui-focus)]"
          >
            Overlap
          </AppLink>
          <AppLink
            to={paths.mutualFunds.fundInsights(schemeId)}
            className="pb-3 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] transition-colors border-b-2 border-transparent"
            activeClassName="text-[var(--ui-text)] !border-[var(--ui-focus)]"
          >
            Insights
          </AppLink>
        </div>
      </nav>

      {/* 5. Children */}
      {children(ctx)}
    </section>
  );
}
