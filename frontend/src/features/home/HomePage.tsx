import { useState } from "react";
import { PageSearch } from "@/components/search/PageSearch";
import { useWealthSeries } from "@/components/wealth-graph/useWealthSeries";
import { useImport, useScope } from "../../shell/scope/ScopeContext";
import { MiraComingSoonDialog } from "../../shell/mira/MiraComingSoonDialog";
import {
  getAllocation,
  getBenchmarks,
  getHomeSummary,
  getMovers,
  getMoversAll,
  getWealthSeries,
  getWorthALook,
} from "./api";
import {
  pickBenchmarks,
  readStoredBenchmarks,
  writeStoredBenchmarks,
} from "@/components/wealth-graph/benchmarkChoice";
import type { DateRange } from "./components/DateRangeCalendar";
import { istToday } from "../../lib/homeToday";
import { Allocation } from "./sections/Allocation";
import { Glance } from "./sections/Glance";
import { Greeting } from "./sections/Greeting";
import { Movers } from "./sections/Movers";
import { News } from "./sections/News";
import { WealthCard } from "./sections/WealthCard";
import { WorthALook } from "./sections/WorthALook";
import type {
  HomePeriod,
  HomeScopeArg,
  MoversView,
} from "./types";
import { useHomeSection } from "./useHomeSection";
import { useNews } from "./useNews";
import { useStaleWhileLoading } from "./useStaleWhileLoading";

export function HomePage({ today }: { today?: string } = {}) {
  const todayIso = today ?? istToday();
  const { viewMode, memberId, scopeKey, selectedMember, userId, setMember, setAggregate } = useScope();
  const { openImport } = useImport();
  const scope: HomeScopeArg = { viewMode, memberId };

  const [period, setPeriod] = useState<HomePeriod>("1M");
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);
  const [draftRange, setDraftRange] = useState<DateRange>({ from: null, to: null });
  const [chosenBenchmarks, setChosenBenchmarks] = useState<string[]>(() => readStoredBenchmarks());
  const [hidden, setHidden] = useState<boolean>(false);
  const [moversView, setMoversView] = useState<MoversView>("sector");
  const [miraOpen, setMiraOpen] = useState<boolean>(false);
  const [topMoverRequest, setTopMoverRequest] = useState<{ name: string; schemeId: string | null; token: number } | null>(null);

  const summary = useHomeSection(signal => getHomeSummary(scope, signal), [scopeKey]);
  const benchmarks = useHomeSection(signal => getBenchmarks(scope, signal), [scopeKey]);
  const allocation = useHomeSection(signal => getAllocation(scope, signal), [scopeKey]);
  const worth = useHomeSection(signal => getWorthALook(scope, signal), [scopeKey]);

  const benchmarkOptions = benchmarks.data?.options ?? [];
  const benchmarkSettled = benchmarks.status !== "loading";
  const selectedBenchmarks = benchmarks.data
    ? pickBenchmarks(benchmarks.data.options, chosenBenchmarks, benchmarks.data.recommended_index)
    : [];

  const wealth = useWealthSeries(
    scope,
    period,
    appliedRange,
    selectedBenchmarks,
    { loadSeries: getWealthSeries, enabled: benchmarkSettled },
  );

  const moversRaw = useHomeSection(signal => getMovers(scope, moversView, signal), [scopeKey, moversView]);
  const movers = useStaleWhileLoading(moversRaw, scopeKey);

  // Last, so the request goes out after the other sections' requests.
  const news = useNews(scope, scopeKey);

  const handlePeriodChange = (next: HomePeriod) => {
    if (next === "custom" && !appliedRange) {
      return;
    }
    setPeriod(next);
  };

  const handleRangeChange = (range: DateRange) => {
    setDraftRange(range);
    if (range.from && range.to) {
      setAppliedRange({ from: range.from, to: range.to });
      setPeriod("custom");
    }
  };

  // The greeting's top mover: show the Fund grouping and open that fund's popup in the movers card.
  const handleTopMover = () => {
    const name = summary.data?.top_contributor;
    if (!name) return;
    setMoversView("fund");
    const schemeId = summary.data?.top_contributor_scheme_id ?? null;
    setTopMoverRequest(previous => ({ name, schemeId, token: (previous?.token ?? 0) + 1 }));
  };

  const handleBenchmarksChange = (indices: string[]) => {
    setChosenBenchmarks(indices);
    writeStoredBenchmarks(indices);
  };

  const importForScope = () => {
    if (viewMode === "member" && memberId) {
      openImport(memberId);
    } else {
      openImport();
    }
  };

  const noHoldings = summary.status === "data" && summary.data !== null && !summary.data.has_holdings;

  const glanceStatus: "loading" | "error" | "data" =
    summary.status === "error"
      ? "error"
      : summary.status === "loading" || movers.status === "loading"
        ? "loading"
        : "data";

  return (
    <div data-testid="home-page" className="space-y-6">
      <div data-testid="home-greeting">
        <Greeting
          status={summary.status}
          summary={summary.data}
          onImport={openImport}
          onTopMover={handleTopMover}
          search={
            <PageSearch
              pageKey="home"
              noun="funds"
              total={0}
              matched={0}
              chipsAllowed={[]}
              jumpOnly
              userId={userId ?? null}
            />
          }
        />
      </div>

      <div data-testid="home-wealth">
        <WealthCard
          status={wealth.status}
          data={wealth.data}
          scope={viewMode}
          memberName={selectedMember?.name ?? null}
          period={period}
          onPeriodChange={handlePeriodChange}
          customRange={draftRange}
          onCustomRangeChange={handleRangeChange}
          today={todayIso}
          benchmarkOptions={benchmarkOptions}
          benchmarks={selectedBenchmarks}
          onBenchmarksChange={handleBenchmarksChange}
          hidden={hidden}
          onToggleHidden={() => setHidden(value => !value)}
          onRetry={wealth.retry}
          refreshing={wealth.refreshing}
          onImport={importForScope}
          onInfo={() => setMiraOpen(true)}
        />
      </div>

      {!noHoldings && (
        <>
          <div data-testid="home-grid" className="grid gap-6 xl:grid-cols-2">
            <div data-testid="home-glance" className="empty:hidden xl:col-start-1">
              <Glance
                status={glanceStatus}
                summary={summary.data}
                movers={movers.data}
                onOpen={() => setMiraOpen(true)}
              />
            </div>
            <div data-testid="home-allocation" className="xl:col-start-2 xl:row-span-2 xl:row-start-1">
              <Allocation
                status={allocation.status}
                data={allocation.data}
                scope={viewMode}
                memberName={selectedMember?.name ?? null}
                onSelectMember={setMember}
                onShowFamily={setAggregate}
                onRetry={allocation.retry}
              />
            </div>
            <div data-testid="home-movers" className="xl:col-start-1">
              <Movers
                status={movers.status}
                data={movers.data}
                view={moversView}
                onViewChange={setMoversView}
                onRetry={movers.retry}
                refreshing={movers.refreshing}
                openRequest={topMoverRequest}
                loadAll={nextView => getMoversAll(scope, nextView)}
                hideValues={hidden}
              />
            </div>
          </div>

          <div data-testid="home-worth" className="empty:hidden">
            <WorthALook
              status={worth.status}
              data={worth.data}
            />
          </div>

          <div data-testid="home-news" className="empty:hidden">
            <News
              status={news.status}
              data={news.data}
              refreshing={news.refreshing}
              onRefresh={news.refresh}
            />
          </div>
        </>
      )}

      <MiraComingSoonDialog open={miraOpen} onOpenChange={setMiraOpen} />
    </div>
  );
}

export default HomePage;
