import { useEffect, useState, useMemo } from "react";
import { HoldingsTable } from "../../components/HoldingsTable";
import { AllocationDonut } from "../../components/AllocationDonut";
import { EmptyState } from "../../components/EmptyState";
import { HoldingsTableSkeleton } from "../../components/Skeleton";
import { Badge } from "../../components/Badge";
import { FundDetailModal } from "./FundDetailModal";
import { DistributorComparisonModal } from "./DistributorComparisonModal";
import { CoverageGapBanner } from "../import/CoverageGapBanner";
import { OpeningBalanceModal } from "../import/OpeningBalanceModal";
import { getMemberCoverageGaps } from "../import/api";
import type { CoverageGapItem } from "../import/types";
import { sumDecimalStrings } from "../../lib/decimal";
import {
  getMemberHoldings,
  getMemberAllocation,
  getAggregateHoldings,
  getAggregateAllocation,
} from "./api";
import type { HoldingRow, AllocationSummary, FamilyMemberStatus } from "./types";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Users, AlertTriangle, BarChart2 } from "lucide-react";

export interface DashboardViewProps {
  viewMode: "aggregate" | "member";
  memberId: string | null;
  onAddDataForMember?: (memberId?: string) => void;
}

export function DashboardView({
  viewMode,
  memberId,
  onAddDataForMember,
}: DashboardViewProps) {
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [allocation, setAllocation] = useState<AllocationSummary | null>(null);
  const [membersStatus, setMembersStatus] = useState<FamilyMemberStatus[]>([]);
  const [coverageGaps, setCoverageGaps] = useState<CoverageGapItem[]>([]);
  const [selectedGap, setSelectedGap] = useState<CoverageGapItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allocationTab, setAllocationTab] = useState<"asset" | "amc">("asset");

  /* Modal state */
  const [selectedHolding, setSelectedHolding] = useState<HoldingRow | null>(null);
  const [comparisonModalState, setComparisonModalState] = useState<{
    isOpen: boolean;
    memberId: string;
    schemeId: string;
    schemeName: string;
  }>({ isOpen: false, memberId: "", schemeId: "", schemeName: "" });

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        if (viewMode === "aggregate") {
          const [holdingsRes, allocationRes] = await Promise.all([
            getAggregateHoldings(),
            getAggregateAllocation(),
          ]);
          if (isMounted) {
            setHoldings(holdingsRes.holdings);
            setMembersStatus(holdingsRes.members);
            setAllocation(allocationRes.allocation);
            setCoverageGaps([]);
            setLoading(false);
          }
        } else if (memberId) {
          const [holdingsRes, allocationRes, gapsRes] = await Promise.all([
            getMemberHoldings(memberId),
            getMemberAllocation(memberId),
            getMemberCoverageGaps(memberId).catch(() => []),
          ]);
          if (isMounted) {
            setHoldings(holdingsRes);
            setMembersStatus([]);
            setAllocation(allocationRes);
            setCoverageGaps(gapsRes);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setHoldings([]);
            setMembersStatus([]);
            setAllocation(null);
            setCoverageGaps([]);
            setLoading(false);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg =
            err instanceof Error
              ? err.message
              : "Failed to load dashboard data";
          setError(msg);
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [viewMode, memberId]);

  /* Portfolio Totals using exact decimal arithmetic */
  const totals = useMemo(() => {
    const currentVal = allocation
      ? parseFloat(allocation.total_value || "0")
      : 0;

    const investedVal = parseFloat(
      sumDecimalStrings(holdings.map((h) => h.amount_invested))
    );
    const profitVal = parseFloat(
      sumDecimalStrings(
        holdings.map((h) => h.unrealized_gain || h.current_profit_total)
      )
    );

    const gainPercentage =
      investedVal > 0 ? (profitVal / investedVal) * 100 : 0;

    return {
      currentVal,
      investedVal,
      profitVal,
      gainPercentage,
    };
  }, [holdings, allocation]);

  if (loading) {
    return (
      <div className="py-8 animate-pulse">
        <HoldingsTableSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <EmptyState
          title="Dashboard Unavailable"
          description={error}
          actionLabel="Try Again"
          onAction={() => window.location.reload()}
          icon={<AlertTriangle className="h-7 w-7 text-[var(--color-negative)]" />}
        />
      </div>
    );
  }

  // S21: Empty State — No Holdings Yet
  if (
    holdings.length === 0 &&
    (viewMode === "member" || membersStatus.every((m) => !m.has_data))
  ) {
    return (
      <EmptyState
        title="No Holdings Found"
        description="Track all your mutual fund investments, Direct vs Regular plan comparisons, and performance analytics in one clean view."
        actionLabel="+ Upload CAS Statement"
        onAction={() => onAddDataForMember?.(memberId || undefined)}
        icon={<BarChart2 className="h-7 w-7 text-[var(--color-accent)]" />}
      />
    );
  }

  const allocationItems =
    allocationTab === "asset"
      ? allocation?.by_asset_class || []
      : allocation?.by_amc || [];

  const isPositiveGain = totals.profitVal >= 0;

  return (
    <div className="flex flex-col space-y-10 animate-in fade-in duration-200">
      {/* Coverage Gap Warning Banner */}
      <CoverageGapBanner
        gaps={coverageGaps}
        onResolveGap={(gap) => setSelectedGap(gap)}
      />

      {/* Editorial Portfolio Hero */}
      <section className="pt-2 pb-6 border-b border-[var(--color-border)]">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          {/* Main Portfolio Stat */}
          <div className="flex flex-col space-y-1">
            <span className="text-[11px] font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase">
              Total Portfolio Value
            </span>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[var(--color-ink)] tabular-nums type-display">
              ₹{formatIndianCurrency(totals.currentVal)}
            </h1>
          </div>

          {/* Secondary Stats Flow */}
          <div className="flex items-center gap-8 sm:gap-12 flex-wrap">
            {/* Total Invested */}
            <div className="flex flex-col space-y-0.5">
              <span className="text-xs text-[var(--color-text-secondary)] font-medium">
                Total Invested
              </span>
              <span className="font-display text-lg sm:text-xl font-semibold text-[var(--color-ink)] tabular-nums type-data-large">
                ₹{formatIndianCurrency(totals.investedVal)}
              </span>
            </div>

            {/* Total Gain / Loss */}
            <div className="flex flex-col space-y-0.5">
              <span className="text-xs text-[var(--color-text-secondary)] font-medium">
                Total Gain / Loss
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-display text-lg sm:text-xl font-semibold tabular-nums type-data-large inline-flex items-center",
                    isPositiveGain
                      ? "text-[var(--color-positive)]"
                      : "text-[var(--color-negative)]"
                  )}
                >
                  {isPositiveGain ? (
                    <ArrowUpRight className="h-4 w-4 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 mr-0.5" />
                  )}
                  ₹{formatIndianCurrency(Math.abs(totals.profitVal))}
                </span>

                <span
                  className={cn(
                    "text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums type-caption",
                    isPositiveGain
                      ? "bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]"
                      : "bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)]"
                  )}
                >
                  {isPositiveGain ? "+" : ""}
                  {totals.gainPercentage.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* S22: Compact Pending Family Imports Strip (when in Aggregate View) */}
      {viewMode === "aggregate" &&
        membersStatus.some((m) => !m.has_data) && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="h-6 w-6 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] flex-shrink-0">
                <Users className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs font-semibold text-[var(--color-ink)]">
                Pending Family Imports
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {membersStatus
                  .filter((m) => !m.has_data)
                  .map((m) => (
                    <div
                      key={m.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-bg)] text-xs border border-[var(--color-border)]"
                    >
                      <span className="font-medium text-[var(--color-ink)]">
                        {m.name}
                      </span>
                      <Badge variant="warning">No CAS Data</Badge>
                      <button
                        className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline ml-1 cursor-pointer"
                        onClick={() => onAddDataForMember?.(m.id)}
                        type="button"
                      >
                        + Import
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

      {/* Portfolio Allocation Section (Open, Airy Composition) */}
      {allocationItems.length > 0 && (
        <section className="flex flex-col space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink)]">
              Portfolio Allocation
            </h2>

            {/* Segmented Tab Switcher */}
            <div className="inline-flex items-center p-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] self-start sm:self-auto shadow-2xs">
              <button
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-lg transition-colors duration-150 cursor-pointer",
                  allocationTab === "asset"
                    ? "bg-[var(--color-bg)] text-[var(--color-ink)] font-semibold shadow-xs"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
                )}
                onClick={() => setAllocationTab("asset")}
                type="button"
              >
                By Asset Class
              </button>
              <button
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-lg transition-colors duration-150 cursor-pointer",
                  allocationTab === "amc"
                    ? "bg-[var(--color-bg)] text-[var(--color-ink)] font-semibold shadow-xs"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
                )}
                onClick={() => setAllocationTab("amc")}
                type="button"
              >
                By AMC
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xs">
            <AllocationDonut
              data={allocationItems}
              totalValue={allocation?.total_value}
            />
          </div>
        </section>
      )}

      {/* Holdings Table Section */}
      <section className="flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink)]">
            Holdings ({holdings.length})
          </h2>
        </div>

        <HoldingsTable
          holdings={holdings}
          showMemberName={viewMode === "aggregate"}
          onSelectScheme={(schemeId) => {
            const h = holdings.find((row) => row.scheme_id === schemeId);
            if (h) setSelectedHolding(h);
          }}
        />
      </section>

      {/* S15: Fund Detail Modal */}
      <FundDetailModal
        isOpen={!!selectedHolding}
        onClose={() => setSelectedHolding(null)}
        holding={selectedHolding}
        onCompareDistributors={(schemeId, schemeName) => {
          // Captured now, before setSelectedHolding(null) below clears it —
          // both updates land in the same batch, so reading
          // selectedHolding?.household_member_id at render time would always
          // see null and silently fall back to the page-level memberId,
          // sending the wrong member's ID for any holding not owned by them.
          const ownerId = selectedHolding?.household_member_id || memberId;
          setSelectedHolding(null);
          setComparisonModalState({
            isOpen: true,
            memberId: ownerId,
            schemeId,
            schemeName,
          });
        }}
      />

      {/* S17: Distributor Comparison Modal */}
      {memberId && (
        <DistributorComparisonModal
          isOpen={comparisonModalState.isOpen}
          onClose={() =>
            setComparisonModalState({
              isOpen: false,
              memberId: "",
              schemeId: "",
              schemeName: "",
            })
          }
          memberId={comparisonModalState.memberId || memberId}
          schemeId={comparisonModalState.schemeId}
          schemeName={comparisonModalState.schemeName}
        />
      )}

      {/* Opening Balance Modal for Coverage Gap Resolution */}
      <OpeningBalanceModal
        isOpen={!!selectedGap}
        gap={selectedGap}
        onClose={() => setSelectedGap(null)}
        onResolved={() => {
          setSelectedGap(null);
          if (memberId) {
            getMemberHoldings(memberId).then(setHoldings).catch(() => {});
            getMemberAllocation(memberId).then(setAllocation).catch(() => {});
            getMemberCoverageGaps(memberId)
              .then(setCoverageGaps)
              .catch(() => {});
          }
        }}
      />
    </div>
  );
}

function formatIndianCurrency(val: number): string {
  if (isNaN(val)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(val);
}
