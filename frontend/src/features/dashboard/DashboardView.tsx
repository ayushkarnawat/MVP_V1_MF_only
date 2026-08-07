import { useEffect, useState, useMemo } from "react";
import { HoldingsTable } from "../../components/HoldingsTable";
import { AllocationDonut } from "../../components/AllocationDonut";
import { EmptyState } from "../../components/EmptyState";
import { HoldingsTableSkeleton } from "../../components/Skeleton";
import { Badge } from "../../components/Badge";
import { FundDetailModal } from "./FundDetailModal";
import { DistributorComparisonModal } from "./DistributorComparisonModal";
import {
  getMemberHoldings,
  getMemberAllocation,
  getAggregateHoldings,
  getAggregateAllocation,
} from "./api";
import type { HoldingRow, AllocationSummary, FamilyMemberStatus } from "./types";
import styles from "./DashboardView.module.css";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allocationTab, setAllocationTab] = useState<"asset" | "amc">("asset");

  /* Modal state */
  const [selectedHolding, setSelectedHolding] = useState<HoldingRow | null>(null);
  const [comparisonModalState, setComparisonModalState] = useState<{
    isOpen: boolean;
    schemeId: string;
    schemeName: string;
  }>({ isOpen: false, schemeId: "", schemeName: "" });

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
            setLoading(false);
          }
        } else if (memberId) {
          const [holdingsRes, allocationRes] = await Promise.all([
            getMemberHoldings(memberId),
            getMemberAllocation(memberId),
          ]);
          if (isMounted) {
            setHoldings(holdingsRes);
            setMembersStatus([]);
            setAllocation(allocationRes);
            setLoading(false);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : "Failed to load dashboard data";
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

  /* Portfolio Totals */
  const totals = useMemo(() => {
    let currentVal = 0;
    let investedVal = 0;
    let profitVal = 0;

    holdings.forEach((h) => {
      currentVal += parseFloat(h.current_value || "0");
      investedVal += parseFloat(h.amount_invested || "0");
      profitVal += parseFloat(h.unrealized_gain || h.current_profit_total || "0");
    });

    const gainPercentage = investedVal > 0 ? (profitVal / investedVal) * 100 : 0;

    return {
      currentVal,
      investedVal,
      profitVal,
      gainPercentage,
    };
  }, [holdings]);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <HoldingsTableSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <EmptyState
          title="Dashboard Unavailable"
          description={error}
          actionLabel="Try Again"
          onAction={() => window.location.reload()}
          icon="⚠️"
        />
      </div>
    );
  }

  // S21: Empty State — No Holdings Yet
  if (holdings.length === 0 && (viewMode === "member" || membersStatus.every((m) => !m.has_data))) {
    return (
      <EmptyState
        title="No Holdings Found"
        description="Track all your mutual fund investments, Direct vs Regular plan comparisons, and performance analytics in one clean view."
        actionLabel="+ Upload CAS Statement"
        onAction={() => onAddDataForMember?.(memberId || undefined)}
        icon="📊"
      />
    );
  }

  const allocationItems =
    allocationTab === "asset"
      ? allocation?.by_asset_class || []
      : allocation?.by_amc || [];

  return (
    <div className={styles.container}>
      {/* Hero Portfolio Summary Card */}
      <div className={styles.heroCard}>
        <div className={styles.heroPrimary}>
          <span className={styles.heroLabel}>Total Portfolio Value</span>
          <h1 className={`type-display ${styles.heroValue}`}>
            ₹{formatIndianCurrency(totals.currentVal)}
          </h1>
        </div>

        <div className={styles.heroMetrics}>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Total Invested</span>
            <span className="type-data-large">
              ₹{formatIndianCurrency(totals.investedVal)}
            </span>
          </div>

          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Total Gain / Loss</span>
            <div className={styles.gainRow}>
              <span
                className={`type-data-large ${
                  totals.profitVal >= 0 ? styles.positiveText : styles.negativeText
                }`}
              >
                {totals.profitVal >= 0 ? "↑ " : "↓ "}₹
                {formatIndianCurrency(Math.abs(totals.profitVal))}
              </span>
              <span
                className={`${styles.gainBadge} ${
                  totals.profitVal >= 0 ? styles.positiveBadge : styles.negativeBadge
                }`}
              >
                {totals.profitVal >= 0 ? "+" : ""}
                {totals.gainPercentage.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* S22: Family Member Placeholders Section (when in Aggregate View) */}
      {viewMode === "aggregate" && membersStatus.some((m) => !m.has_data) && (
        <div className={styles.placeholderSection}>
          <h3 className={`type-h2 ${styles.sectionTitle}`}>Pending Family Imports</h3>
          <div className={styles.placeholderGrid}>
            {membersStatus
              .filter((m) => !m.has_data)
              .map((m) => (
                <div key={m.id} className={styles.placeholderCard}>
                  <div className={styles.placeholderInfo}>
                    <span className={`type-body-medium ${styles.placeholderName}`}>
                      {m.name}
                    </span>
                    <Badge variant="warning">No CAS Data</Badge>
                  </div>
                  <button
                    className={styles.addMemberDataBtn}
                    onClick={() => onAddDataForMember?.(m.id)}
                    type="button"
                  >
                    + Import CAS
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Allocation Donut Chart Section */}
      {allocationItems.length > 0 && (
        <div className={styles.allocationSection}>
          <div className={styles.sectionHeader}>
            <h3 className={`type-h2 ${styles.sectionTitle}`}>Portfolio Allocation</h3>
            <div className={styles.tabToggleGroup}>
              <button
                className={`${styles.tabBtn} ${
                  allocationTab === "asset" ? styles.tabActive : ""
                }`}
                onClick={() => setAllocationTab("asset")}
                type="button"
              >
                By Asset Class
              </button>
              <button
                className={`${styles.tabBtn} ${
                  allocationTab === "amc" ? styles.tabActive : ""
                }`}
                onClick={() => setAllocationTab("amc")}
                type="button"
              >
                By AMC
              </button>
            </div>
          </div>

          <AllocationDonut
            data={allocationItems}
            totalValue={allocation?.total_value}
          />
        </div>
      )}

      {/* Holdings Table Section */}
      <div className={styles.holdingsSection}>
        <div className={styles.sectionHeader}>
          <h3 className={`type-h2 ${styles.sectionTitle}`}>
            Holdings ({holdings.length})
          </h3>
        </div>

        <HoldingsTable
          holdings={holdings}
          showMemberName={viewMode === "aggregate"}
          onSelectScheme={(schemeId) => {
            const h = holdings.find((row) => row.scheme_id === schemeId);
            if (h) setSelectedHolding(h);
          }}
        />
      </div>

      {/* S15: Fund Detail Modal */}
      <FundDetailModal
        isOpen={!!selectedHolding}
        onClose={() => setSelectedHolding(null)}
        holding={selectedHolding}
        onCompareDistributors={(schemeId, schemeName) => {
          setSelectedHolding(null);
          setComparisonModalState({
            isOpen: true,
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
            setComparisonModalState({ isOpen: false, schemeId: "", schemeName: "" })
          }
          memberId={selectedHolding?.household_member_id || memberId}
          schemeId={comparisonModalState.schemeId}
          schemeName={comparisonModalState.schemeName}
        />
      )}
    </div>
  );
}

function formatIndianCurrency(val: number): string {
  if (isNaN(val)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(val);
}
