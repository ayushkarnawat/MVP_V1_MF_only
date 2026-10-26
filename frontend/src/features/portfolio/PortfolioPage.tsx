import { ChevronDown, Plus, TriangleAlert } from "lucide-react";
import { PageLayout } from "@/shell/layout/PageLayout";
import { useImport, useScope } from "@/shell/scope/ScopeContext";
import {
  getPortfolioAllocation,
  getPortfolioSummary,
  getPortfolioValueSeries,
} from "./api";
import { isEmptyPortfolio } from "./portfolioCopy";
import { memberTitleName } from "./portfolioFormat";
import { FamilyMembers } from "./sections/FamilyMembers";
import { InstrumentAllocation } from "./sections/InstrumentAllocation";
import { SummaryStrip } from "./sections/SummaryStrip";
import type { MemberValue, PortfolioScopeArg } from "./types";
import { usePortfolioSection } from "./usePortfolioSection";

const SERIES_DAYS = 30;

export default function PortfolioPage() {
  const {
    viewMode,
    memberId,
    members,
    selectedMember,
    scopeKey,
    setMember,
    setAggregate,
  } = useScope();
  const { openImport } = useImport();

  const scope: PortfolioScopeArg = { viewMode, memberId };

  const summary = usePortfolioSection(
    (signal) => getPortfolioSummary(scope, signal),
    [scopeKey]
  );

  const allocation = usePortfolioSection(
    (signal) => getPortfolioAllocation(scope, signal),
    [scopeKey]
  );

  const series = usePortfolioSection(
    (signal) => getPortfolioValueSeries(scope, SERIES_DAYS, signal),
    [scopeKey]
  );

  const family = usePortfolioSection<MemberValue[]>(
    async (signal) => {
      if (members.length < 2) {
        return [];
      }
      return Promise.all(
        members.map(async (member) => {
          const res = await getPortfolioSummary(
            { viewMode: "member", memberId: member.id },
            signal
          );
          return {
            id: member.id,
            name: member.name,
            value: res.total_value,
          };
        })
      );
    },
    [members.map((member) => member.id)]
  );

  const importFor = viewMode === "member" ? memberId ?? undefined : undefined;

  const subtitle =
    viewMode === "member" && selectedMember
      ? `View and manage ${memberTitleName(selectedMember.name)}'s portfolio across asset classes.`
      : "View and manage your complete family portfolio across asset classes.";

  const isPageError =
    summary.status === "error" && allocation.status === "error";

  const isEmpty =
    summary.status === "data" &&
    summary.data !== null &&
    isEmptyPortfolio(summary.data);

  return (
    <PageLayout
      title="All Investments"
      subtitle={subtitle}
      actions={
        <button
          type="button"
          onClick={() => openImport(importFor)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--pos)] px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-90 cursor-pointer"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Add Investment</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      }
    >
      <div className="flex flex-col gap-[18px]">
        {isPageError ? (
          <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-8 text-center flex flex-col items-center max-w-md mx-auto my-8">
            <div className="h-10 w-10 rounded-full bg-[var(--warn-bg)] flex items-center justify-center text-[var(--warn-text)] mb-3">
              <TriangleAlert className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--ui-text-default)]">
              Couldn't load your portfolio
            </h3>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)]">
              There was a problem reaching our servers. Your data is safe — this is just a connection issue.
            </p>
            <button
              type="button"
              onClick={() => {
                summary.retry();
                allocation.retry();
              }}
              className="mt-4 inline-flex items-center justify-center rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-medium text-[var(--ui-text-default)] hover:bg-[var(--ui-elevated)] cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : isEmpty ? (
          <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-8 text-center flex flex-col items-center max-w-md mx-auto my-8">
            <h3 className="text-lg font-semibold text-[var(--ui-text-default)]">
              Nothing here yet
            </h3>
            <p className="mt-2 text-sm text-[var(--ui-text-muted)]">
              Import your first CAS statement and your family's portfolio will show up here — total value, allocation, and gains, all in one place.
            </p>
            <button
              type="button"
              onClick={() => openImport(importFor)}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-90 cursor-pointer"
            >
              Add your first investment
            </button>
          </div>
        ) : (
          <>
            <SummaryStrip
              status={summary.status}
              data={summary.data}
              seriesStatus={series.status}
              series={series.data}
              onRetry={summary.retry}
              onRetrySeries={series.retry}
            />
            <InstrumentAllocation
              status={allocation.status}
              data={allocation.data}
              onRetry={allocation.retry}
            />
            <FamilyMembers
              status={family.status}
              rows={family.data}
              selectedId={viewMode === "member" ? memberId : null}
              onSelectMember={setMember}
              onShowFamily={setAggregate}
              onRetry={family.retry}
            />
          </>
        )}
      </div>
    </PageLayout>
  );
}
