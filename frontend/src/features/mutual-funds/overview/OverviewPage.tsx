import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { DistributorComparisonModal } from "../../../components/mf/DistributorComparisonModal";
import { FundDetailModal } from "../../../components/mf/FundDetailModal";
import { PostImportNotice } from "../../../components/mf/PostImportNotice";
import { SoldFundsSection } from "../../../components/mf/SoldFundsSection";
import { Skeleton } from "../../../components/ui/skeleton";
import { useImport, useScope } from "../../../shell/scope/ScopeContext";
import { useMfAnalytics } from "../data/analyticsStore";
import { useMfDashboard } from "../data/useMfDashboard";
import { MutualFundsFrame, useMfFrame } from "../frame/MutualFundsFrame";
import { FundLink } from "../common/FundLink";
import {
  buildOverviewInsights,
  buildSynopsis,
  monthlySipTotal,
  parseSortParams,
  type SortState,
} from "../mfCopy";
import type { HoldingRow } from "../types";
import { CoverageGapGate } from "./CoverageGapGate";
import { HoldingsTable } from "./HoldingsTable";
import { findHolding, soldFundsScope } from "./legacyLogic";
import {
  AmcAllocationCard,
  FamilyMembersCard,
  QuickInsightsCard,
} from "./OverviewCards";
import { SipTimeline } from "./SipTimeline";
import { SummaryStrip } from "./SummaryStrip";

function OverviewBody({ query }: { query: string }) {
  const { viewMode, memberId } = useScope();
  const { openImport } = useImport();
  const { openMira } = useMfFrame();
  const [params, setParams] = useSearchParams();
  // Row click opens the old Fund Details popup (Q12, the mockup's interim target) until the Individual Fund page ships.
  const [openRow, setOpenRow] = useState<HoldingRow | null>(null);
  const [distributorsOpen, setDistributorsOpen] = useState(false);

  const dash = useMfDashboard();
  const bench = useMfAnalytics("benchmark_funds");
  const importFor = viewMode === "member" ? memberId ?? undefined : undefined;

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

  const xirrByScheme: Record<string, string | null | undefined> = useMemo(() => {
    const map: Record<string, string | null | undefined> = {};
    if (bench.data?.funds) {
      for (const fund of bench.data.funds) {
        map[fund.scheme_id] = fund.fund_xirr;
      }
    }
    return map;
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
        <button
          type="button"
          data-clickable=""
          data-effect="retry"
          onClick={() => {
            dash.holdings.retry();
            dash.allocation.retry();
          }}
          className="mt-2 inline-flex items-center justify-center rounded-xl bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          Retry
        </button>
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
        <button
          type="button"
          data-clickable=""
          data-effect="open"
          onClick={() => openImport(importFor)}
          className="mt-2 inline-flex items-center justify-center rounded-full bg-[var(--pos)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          Add your first investment
        </button>
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
      <SipTimeline sips={dash.sips} />
      <HoldingsTable
        holdings={dash.holdings}
        xirrByScheme={xirrByScheme}
        sort={sort}
        onSort={onSort}
        query={query}
        onAnalyse={openMira}
        onOpenFund={(schemeId, rowMemberId) =>
          setOpenRow(findHolding(dash.holdings.data, schemeId, rowMemberId))
        }
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
        <FundDetailModal
          isOpen={openRow !== null}
          onClose={() => setOpenRow(null)}
          holding={openRow}
          actions={
            openRow?.scheme_id ? (
              <p className="mt-4 text-sm">
                <FundLink schemeId={openRow.scheme_id} className="font-medium text-[var(--c2)] hover:underline">
                  Open fund page
                </FundLink>
              </p>
            ) : undefined
          }
        />
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
  const [query, setQuery] = useState("");

  return (
    <MutualFundsFrame
      tab="overview"
      utility={
        <input
          aria-label="Search investments"
          placeholder="Search investments..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3 py-1.5 text-xs text-[var(--ui-text)] placeholder:text-[var(--ui-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--pos)]"
        />
      }
    >
      <div data-legacy="import-notice" className="contents">
        <PostImportNotice />
      </div>
      <OverviewBody query={query} />
    </MutualFundsFrame>
  );
}
