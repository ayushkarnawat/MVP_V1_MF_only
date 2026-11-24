import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { DistributorComparisonModal } from "../../../components/mf/DistributorComparisonModal";
import { PostImportNotice } from "../../../components/mf/PostImportNotice";
import { SoldFundsSection } from "../../../components/mf/SoldFundsSection";
import { PageSearch } from "../../../components/search/PageSearch";
import { usePageSearchState, type SearchChip } from "../../../components/search/usePageSearchState";
import { Button } from "../../../components/ui/button";
import { Skeleton } from "../../../components/ui/skeleton";
import { WealthGraph } from "../../../components/wealth-graph/WealthGraph";
import type { WealthDateRange, WealthPeriod } from "../../../components/wealth-graph/types";
import { useWealthSeries } from "../../../components/wealth-graph/useWealthSeries";
import { useImport, useScope } from "../../../shell/scope/ScopeContext";
import { getWealthBenchmarks, getWealthSeries } from "../api";
import { pickBenchmarks, readStoredBenchmarks, writeStoredBenchmarks } from "../../../components/wealth-graph/benchmarkChoice";
import { PartialDataBadge } from "../../../components/PartialDataBadge";
import { istToday } from "../../../lib/homeToday";
import { useMfAnalytics } from "../data/analyticsStore";
import { useMfDashboard, useMfSection } from "../data/useMfDashboard";
import { MutualFundsFrame, useMfFrame } from "../frame/MutualFundsFrame";
import {
  buildOverviewInsights,
  buildSynopsis,
  monthlySipTotal,
  parseSortParams,
  type SortState,
} from "../mfCopy";
import { CoverageGapGate } from "./CoverageGapGate";
import { HoldingsTable, type SchemeXirrMeta } from "./HoldingsTable";
import { soldFundsScope } from "./legacyLogic";
import { filterHoldingRows } from "./overviewSearch";
import {
  AmcAllocationCard,
  FamilyMembersCard,
  QuickInsightsCard,
} from "./OverviewCards";
import { SipTimeline } from "./SipTimeline";
import { SummaryStrip } from "./SummaryStrip";

function OverviewWealthGraph({ holdingsReady }: { holdingsReady: boolean }) {
  const { viewMode, memberId, scopeKey, selectedMember } = useScope();
  const scope = { viewMode, memberId };
  const enabled = holdingsReady && (viewMode === "aggregate" || memberId !== null);

  const [period, setPeriod] = useState<WealthPeriod>("1Y");
  const [draftRange, setDraftRange] = useState<WealthDateRange>({ from: null, to: null });
  const [appliedRange, setAppliedRange] = useState<WealthDateRange | null>(null);
  const [chosenBenchmarks, setChosenBenchmarks] = useState<string[]>(() => readStoredBenchmarks());

  const benchmarks = useMfSection(
    signal => enabled ? getWealthBenchmarks(scope, signal) : Promise.resolve(null),
    [scopeKey, enabled],
  );
  const selectedBenchmarks = benchmarks.data
    ? pickBenchmarks(benchmarks.data.options, chosenBenchmarks, benchmarks.data.recommended_index)
    : [];
  const wealth = useWealthSeries(scope, period, appliedRange, selectedBenchmarks, {
    loadSeries: getWealthSeries,
    enabled: enabled && benchmarks.status !== "loading",
  });

  if (!enabled) return null;

  const scopeName = viewMode === "aggregate" ? "Family Combined" : selectedMember?.name;

  return (
    <div data-legacy="wealth-graph" className="contents">
      <section id="overview-value-over-time" aria-label="Value over time" className="scroll-mt-6">
        <WealthGraph
          status={wealth.status}
          data={wealth.data}
          period={period}
          onPeriodChange={next => {
            if (next !== "custom" || appliedRange) setPeriod(next);
          }}
          customRange={draftRange}
          onCustomRangeChange={range => {
            setDraftRange(range);
            if (range.from && range.to) {
              setAppliedRange(range);
              setPeriod("custom");
            }
          }}
          today={istToday()}
          benchmarkOptions={benchmarks.data?.options ?? []}
          benchmarks={selectedBenchmarks}
          onBenchmarksChange={indices => {
            setChosenBenchmarks(indices);
            writeStoredBenchmarks(indices);
          }}
          hideValues={false}
          refreshing={wealth.refreshing}
          onRetry={wealth.retry}
          headerLeft={
            <div>
              <h3 className="text-[15px] font-bold text-[var(--ui-text)]">Value over time</h3>
              <p className="text-xs text-[var(--ui-text-muted)]">{scopeName}</p>
            </div>
          }
          headerRightExtra={wealth.data?.partial ? <PartialDataBadge missingFunds={wealth.data.missing_funds ?? []} /> : undefined}
        />
      </section>
    </div>
  );
}

function OverviewBody({
  query,
  chips,
  onCounts,
}: {
  query: string;
  chips: SearchChip[];
  onCounts: (total: number, matched: number) => void;
}) {
  const { viewMode, memberId } = useScope();
  const { openImport } = useImport();
  const { openMira } = useMfFrame();
  const [params, setParams] = useSearchParams();
  const [distributorsOpen, setDistributorsOpen] = useState(false);

  const dash = useMfDashboard();
  const bench = useMfAnalytics("benchmark_funds");
  const importFor = viewMode === "member" ? memberId ?? undefined : undefined;

  const consolidated =
    viewMode === "aggregate" && dash.consolidated.status === "data" ? dash.consolidated.data : null;

  const { totalCount, matchedCount } = useMemo(() => {
    if (dash.holdings.status !== "data" || dash.holdings.data === null) {
      return { totalCount: 0, matchedCount: 0 };
    }
    if (consolidated != null) {
      return {
        totalCount: consolidated.length,
        matchedCount: filterHoldingRows(consolidated, query, chips).length,
      };
    }
    return {
      totalCount: dash.holdings.data.length,
      matchedCount: filterHoldingRows(dash.holdings.data, query, chips).length,
    };
  }, [dash.holdings.status, dash.holdings.data, consolidated, query, chips]);

  useEffect(() => {
    onCounts(totalCount, matchedCount);
  }, [onCounts, totalCount, matchedCount]);

  const sort = parseSortParams(params.toString());

  const onSort = useCallback(
    (next: SortState) => {
      const nextParams = new URLSearchParams(params);
      nextParams.set("sort", next.key);
      nextParams.set("dir", next.dir);
      setParams(nextParams, { replace: true });
    },
    [params, setParams]
  );

  const { xirrByScheme, xirrMetaByScheme } = useMemo(() => {
    const rates: Record<string, string | null | undefined> = {};
    const meta: Partial<Record<string, SchemeXirrMeta>> = {};
    if (bench.data?.funds) {
      for (const fund of bench.data.funds) {
        rates[fund.scheme_id] = fund.fund_xirr;
        meta[fund.scheme_id] = {
          xirr_as_of: fund.xirr_as_of,
          xirr_basis: fund.xirr_basis,
          since_purchase_return: fund.since_purchase_return,
          xirr_caution: fund.xirr_caution,
        };
      }
    }
    return { xirrByScheme: rates, xirrMetaByScheme: meta };
  }, [bench.data]);

  // An opening balance changes the holdings, the XIRR, the allocation and the stored analytics, so all of them reload.
  const refreshAfterOpeningBalance = () => {
    dash.holdings.retry();
    dash.allocation.retry();
    dash.coverageGaps.retry();
    dash.history.retry();
    bench.retry();
  };

  // Case 1: Page Error when both holdings and allocation failed
  if (dash.holdings.status === "error" && dash.allocation.status === "error") {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-8 text-center flex flex-col items-center gap-3"
      >
        <h3 className="text-lg font-semibold text-[var(--ui-text)]">
          Couldn't load your mutual funds
        </h3>
        <p className="text-sm text-[var(--ui-text-muted)] max-w-md">
          There was a problem reaching our servers. Your data is safe — this is just a connection issue.
        </p>
        <Button
          type="button"
          data-clickable=""
          data-effect="retry"
          onClick={() => {
            dash.holdings.retry();
            dash.allocation.retry();
          }}
          className="mt-2 rounded-xl px-4 py-2 text-sm font-semibold hover:opacity-95"
        >
          Retry
        </Button>
      </div>
    );
  }

  // Case 2: Empty state when holdings loaded and list is empty
  if (
    dash.holdings.status === "data" &&
    dash.holdings.data !== null &&
    dash.holdings.data.length === 0
  ) {
    return (
      <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-12 text-center flex flex-col items-center gap-3">
        <h3 className="text-lg font-semibold text-[var(--ui-text)]">No mutual funds yet</h3>
        <p className="text-sm text-[var(--ui-text-muted)] max-w-md">
          Import your family's CAS statement and every fund, its value, and its performance will show up here.
        </p>
        <Button
          type="button"
          data-clickable=""
          data-effect="open"
          onClick={() => openImport(importFor)}
          className="mt-2 rounded-full px-5 py-2.5 text-sm font-semibold hover:opacity-95"
        >
          Add your first investment
        </Button>
      </div>
    );
  }

  // Case 3: Normal content
  const sipTotal =
    dash.sips.status === "data" && dash.sips.data ? monthlySipTotal(dash.sips.data) : null;
  const bothPresent =
    dash.holdings.status === "data" &&
    dash.holdings.data !== null &&
    dash.allocation.status === "data" &&
    dash.allocation.data !== null;

  const synopsis = bothPresent
    ? buildSynopsis(dash.allocation.data!, dash.holdings.data!, sipTotal)
    : null;
  const insightsLines = bothPresent
    ? buildOverviewInsights(dash.allocation.data!, dash.holdings.data!, sipTotal)
    : null;
  const eitherLoading =
    dash.holdings.status === "loading" || dash.allocation.status === "loading";

  return (
    <div className="flex flex-col gap-[18px]">
      <CoverageGapGate gaps={dash.coverageGaps} onResolved={refreshAfterOpeningBalance} />
      <SummaryStrip
        holdings={dash.holdings}
        xirr={dash.xirr}
        realized={dash.realized}
        history={dash.history}
        synopsis={synopsis}
      />
      <OverviewWealthGraph holdingsReady={dash.holdings.status === "data" && dash.holdings.data !== null} />
      <SipTimeline sips={dash.sips} query={query} chips={chips} />
      <HoldingsTable
        holdings={dash.holdings}
        consolidated={consolidated}
        xirrByScheme={xirrByScheme}
        xirrMetaByScheme={xirrMetaByScheme}
        sort={sort}
        onSort={onSort}
        query={query}
        chips={chips}
        onAnalyse={openMira}
        onCompareDistributors={() => setDistributorsOpen(true)}
      />
      <div data-legacy="sold-funds" className="contents">
        <SoldFundsSection summary={dash.realized.data} memberId={soldFundsScope(viewMode, memberId)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AmcAllocationCard allocation={dash.allocation} holdings={dash.holdings} />
        <FamilyMembersCard holdings={dash.holdings} members={dash.members} />
        {insightsLines !== null ? (
          <QuickInsightsCard lines={insightsLines} />
        ) : eitherLoading ? (
          <section
            role="status"
            aria-label="Loading quick insights"
            className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
          >
            <Skeleton className="h-48 w-full rounded-xl" />
          </section>
        ) : null}
      </div>
      <div data-legacy="dialogs" className="contents">
        <DistributorComparisonModal
          isOpen={distributorsOpen}
          onClose={() => setDistributorsOpen(false)}
          viewMode={viewMode}
          memberId={memberId}
        />
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { userId } = useScope();
  const { text, chips } = usePageSearchState("overview");
  const [counts, setCounts] = useState({ total: 0, matched: 0 });
  const handleCounts = useCallback((total: number, matched: number) => {
    setCounts(prev => (prev.total === total && prev.matched === matched ? prev : { total, matched }));
  }, []);

  return (
    <MutualFundsFrame
      tab="overview"
      utility={
        <PageSearch
          pageKey="overview"
          noun="funds"
          total={counts.total}
          matched={counts.matched}
          chipsAllowed={["category", "member"]}
          userId={userId ?? null}
        />
      }
    >
      <div data-legacy="import-notice" className="contents">
        <PostImportNotice />
      </div>
      <OverviewBody query={text} chips={chips} onCounts={handleCounts} />
    </MutualFundsFrame>
  );
}
