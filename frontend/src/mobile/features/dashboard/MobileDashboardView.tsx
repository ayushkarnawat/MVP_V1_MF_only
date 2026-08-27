import { useState, useEffect, useMemo } from "react";
import {
  getAggregateHoldings,
  getAggregateAllocation,
  getMemberHoldings,
  getMemberAllocation,
} from "@/features/dashboard/api";
import { getMemberCoverageGaps } from "@/features/import/api";
import { listHouseholdMembers } from "@/features/auth/api";
import type {
  HoldingRow,
  AllocationSummary,
  FamilyMemberStatus,
} from "@/features/dashboard/types";
import type { HouseholdMember } from "@/features/auth/types";
import type { CoverageGapItem } from "@/features/import/types";
import { AllocationDonut } from "@/components/AllocationDonut";
import { Badge } from "@/components/Badge";
import { MobileHoldingCardSummary } from "../holdings/MobileHoldingCardSummary";
import { MobileFundDetailView } from "../holdings/MobileFundDetailView";
import { MobileDistributorComparisonView } from "../holdings/MobileDistributorComparisonView";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ArrowDownRight,
  ArrowUpRight,
  Users,
  AlertTriangle,
  UploadCloud,
  Search,
  BarChart2,
} from "lucide-react";

import { motion } from "motion/react";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

// Mobile-only legend/segment order for "By Asset Class" — web keeps the
// backend's natural array order.
const ASSET_CLASS_ORDER = ["Equity", "Hybrid", "Other"];

export interface MobileDashboardViewProps {
  onNavigateAnalytics?: () => void;
  onNavigateImport?: (memberId?: string) => void;
  onDetailViewToggle?: (isOpen: boolean) => void;
}

export function MobileDashboardView({
  onNavigateImport,
  onDetailViewToggle,
}: MobileDashboardViewProps) {
  const [viewMode, setViewMode] = useState<"aggregate" | "member">("aggregate");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [membersStatus, setMembersStatus] = useState<FamilyMemberStatus[]>([]);
  const [allocation, setAllocation] = useState<AllocationSummary | null>(null);
  const [coverageGaps, setCoverageGaps] = useState<CoverageGapItem[]>([]);
  const [allocationTab, setAllocationTab] = useState<"asset" | "amc">("asset");
  // Local, display-only filter for the Holdings list in Family Combined
  // view — independent of viewMode/selectedMemberId above, which control
  // the whole screen's data-fetch context, not just what's shown in this list.
  const [holdingsMemberFilter, setHoldingsMemberFilter] = useState<string>("all");
  const [isDistributorComparisonOpen, setIsDistributorComparisonOpen] = useState(false);

  useEffect(() => {
    setHoldingsMemberFilter("all");
  }, [viewMode]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedHolding, setSelectedHolding] = useState<HoldingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Fetch initial household members list */
  useEffect(() => {
    let isMounted = true;
    listHouseholdMembers()
      .then((data) => {
        if (isMounted && data.length > 0) {
          setMembers(data);
          setSelectedMemberId(data[0].id);
        }
      })
      .catch(() => { });

    return () => {
      isMounted = false;
    };
  }, []);

  /* Fetch dashboard data depending on viewMode & memberId */
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setCoverageGaps([]);

    const fetchData = async () => {
      try {
        if (viewMode === "aggregate") {
          const [holdingsRes, allocationRes] = await Promise.all([
            getAggregateHoldings(controller.signal),
            getAggregateAllocation(controller.signal),
          ]);
          if (isMounted) {
            setHoldings(holdingsRes.holdings);
            setMembersStatus(holdingsRes.members);
            setAllocation(allocationRes.allocation);
            setCoverageGaps([]);
            setLoading(false);
          }
        } else if (selectedMemberId) {
          const [holdingsRes, allocationRes] = await Promise.all([
            getMemberHoldings(selectedMemberId, controller.signal),
            getMemberAllocation(selectedMemberId, controller.signal),
          ]);
          if (isMounted) {
            setHoldings(holdingsRes);
            setAllocation(allocationRes);
            setLoading(false);
          }

          getMemberCoverageGaps(selectedMemberId, controller.signal)
            .then((gapsRes) => {
              if (isMounted) setCoverageGaps(gapsRes);
            })
            .catch(() => { });
          getAggregateHoldings(controller.signal)
            .then((aggRes) => {
              if (isMounted) setMembersStatus(aggRes.members || []);
            })
            .catch(() => { });
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
            err instanceof Error ? err.message : "Failed to load dashboard data";
          setError(msg);
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [viewMode, selectedMemberId]);

  /* Calculate summary totals */
  const totals = useMemo(() => {
    let currentVal = 0;
    let investedVal = 0;
    let profitVal = 0;

    for (const h of holdings) {
      const c = parseFloat(h.current_value) || 0;
      const inv = parseFloat(h.amount_invested) || 0;
      const p = parseFloat(h.unrealized_gain || h.current_profit_total || "0") || 0;
      currentVal += c;
      investedVal += inv;
      profitVal += p;
    }

    const gainPercentage = investedVal > 0 ? (profitVal / investedVal) * 100 : 0;

    return {
      currentVal,
      investedVal,
      profitVal,
      gainPercentage,
    };
  }, [holdings]);

  const hasFamily = members.length > 1;
  const isPositiveGain = totals.profitVal >= 0;

  const filteredHoldings = useMemo(() => {
    const byMember =
      holdingsMemberFilter === "all"
        ? holdings
        : holdings.filter((h) => h.household_member_id === holdingsMemberFilter);
    if (!searchTerm.trim()) return byMember;
    const q = searchTerm.toLowerCase();
    return byMember.filter(
      (h) =>
        h.scheme_name.toLowerCase().includes(q) ||
        (h.amc_name && h.amc_name.toLowerCase().includes(q))
    );
  }, [holdings, searchTerm, holdingsMemberFilter]);

  const handleSelectHolding = (item: HoldingRow | null) => {
    setSelectedHolding(item);
    onDetailViewToggle?.(item !== null);
  };

  /* Dedicated Full-Screen Fund Details View */
  if (selectedHolding) {
    return (
      <MobileFundDetailView
        holding={selectedHolding}
        onBack={() => handleSelectHolding(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col space-y-4 py-2 animate-pulse" aria-label="Loading dashboard">
        <div className="h-6 w-32 bg-[var(--color-border)] rounded-md" />
        <div className="h-32 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 flex flex-col justify-between">
          <div className="h-4 w-28 bg-[var(--color-border)] rounded" />
          <div className="h-8 w-48 bg-[var(--color-border)] rounded-lg" />
          <div className="h-4 w-40 bg-[var(--color-border)] rounded" />
        </div>
        <div className="h-60 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl" />
        <div className="space-y-3 pt-2">
          <div className="h-20 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl" />
          <div className="h-20 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-center space-y-3 my-4">
        <div className="h-10 w-10 mx-auto rounded-full bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)] flex items-center justify-center">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h3 className="font-display font-bold text-sm text-[var(--color-ink)]">
          Could not load dashboard
        </h3>
        <p className="text-xs text-[var(--color-text-secondary)]">{error}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setViewMode(viewMode)}
          className="mt-2 text-xs font-semibold"
        >
          Retry
        </Button>
      </div>
    );
  }

  /* S21: Empty State if user has 0 holdings */
  if (holdings.length === 0) {
    return (
      <div className="flex flex-col space-y-4 animate-in fade-in duration-200">
        {/* Family vs Member Toggle (if multi-member) */}
        {hasFamily && (
          <div className="flex flex-col space-y-2">
            <div className="inline-flex items-center p-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs w-full">
              <button
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer text-center",
                  viewMode === "aggregate"
                    ? "bg-[var(--color-bg)] text-[var(--color-ink)] font-semibold shadow-xs"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
                )}
                onClick={() => setViewMode("aggregate")}
                type="button"
              >
                Family Combined
              </button>
              <button
                className={cn(
                  "flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer text-center",
                  viewMode === "member"
                    ? "bg-[var(--color-bg)] text-[var(--color-ink)] font-semibold shadow-xs"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
                )}
                onClick={() => setViewMode("member")}
                type="button"
              >
                Per Member
              </button>
            </div>

            {/* Member Dropdown Picker (if in per-member mode) */}
            {viewMode === "member" && members.length > 0 && (
              <Select
                value={selectedMemberId || undefined}
                onValueChange={setSelectedMemberId}
              >
                <SelectTrigger
                  className="w-full h-10 gap-1.5 rounded-full border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] [&>span]:line-clamp-1"
                  aria-label="Select household member"
                >
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.relationship})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Pending Family Imports Strip (when members have no CAS data) */}
        {membersStatus.some((m) => !m.has_data) && (
          <div className="p-3.5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
                <span className="text-xs font-semibold text-[var(--color-ink)]">
                  Pending Family Imports
                </span>
              </div>
              <button
                onClick={() => onNavigateImport?.()}
                className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline cursor-pointer"
                type="button"
              >
                + Add Data
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {membersStatus
                .filter((m) => !m.has_data)
                .map((m) => (
                  <div
                    key={m.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning,#f59e0b)]" />
                    <span>{m.name}</span>
                    <Badge variant="warning">No CAS Data</Badge>
                    <button
                      className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline ml-0.5 cursor-pointer"
                      onClick={() => onNavigateImport?.(m.id)}
                      type="button"
                    >
                      + Import
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs text-center space-y-4 my-6">
          <div className="h-12 w-12 mx-auto rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-accent)] flex items-center justify-center">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display font-bold text-base text-[var(--color-ink)]">
              No Holdings Found
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)] max-w-xs mx-auto leading-relaxed">
              Upload a consolidated CAS PDF statement to automatically track your mutual fund portfolio and allocations.
            </p>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => onNavigateImport?.(viewMode === "member" ? selectedMemberId || undefined : undefined)}
            className="w-full font-semibold h-11 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 shadow-xs"
          >
            + Upload CAS Statement
          </Button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col space-y-5"
    >
      {/* Top View Selector Bar (Family vs Member) */}
      {hasFamily && (
        <motion.div variants={staggerItemVariants} className="flex flex-col space-y-2">
          <div className="inline-flex items-center p-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs w-full">
            <button
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer text-center",
                viewMode === "aggregate"
                  ? "bg-[var(--color-bg)] text-[var(--color-ink)] font-semibold shadow-xs"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
              )}
              onClick={() => setViewMode("aggregate")}
              type="button"
            >
              Family Combined
            </button>
            <button
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer text-center",
                viewMode === "member"
                  ? "bg-[var(--color-bg)] text-[var(--color-ink)] font-semibold shadow-xs"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
              )}
              onClick={() => setViewMode("member")}
              type="button"
            >
              Per Member
            </button>
          </div>

          {/* Member Dropdown Picker (if in per-member mode) */}
          {viewMode === "member" && members.length > 0 && (
            <Select
              value={selectedMemberId || undefined}
              onValueChange={setSelectedMemberId}
            >
              <SelectTrigger
                className="w-full h-10 gap-1.5 rounded-full border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] [&>span]:line-clamp-1"
                aria-label="Select household member"
              >
                <SelectValue placeholder="Select member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.relationship})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </motion.div>
      )}

      {/* Coverage Gap Alert Strip */}
      {coverageGaps.length > 0 && (
        <motion.div
          variants={staggerItemVariants}
          className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-warning,#f59e0b)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-warning,#f59e0b)_30%,transparent)] text-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-[var(--color-warning,#f59e0b)] flex-shrink-0" />
            <span className="font-medium text-[var(--color-ink)] truncate">
              {coverageGaps.length} missing transaction gap{coverageGaps.length > 1 ? "s" : ""}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-[var(--color-accent)] flex-shrink-0">
            Review →
          </span>
        </motion.div>
      )}

      {/* 1. Editorial Portfolio Hero Card */}
      <motion.section
        variants={staggerItemVariants}
        className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)] block">
          Total Portfolio Value
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[var(--color-ink)] tabular-nums mt-1">
          ₹{formatCurrency(totals.currentVal)}
        </h1>

        <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-[var(--color-border)]/60 text-xs">
          <div className="flex flex-col">
            <span className="text-[11px] text-[var(--color-text-secondary)] font-medium">
              Total Invested
            </span>
            <span className="font-display text-sm font-semibold text-[var(--color-ink)] tabular-nums mt-0.5">
              ₹{formatCurrency(totals.investedVal)}
            </span>
          </div>

          <div className="flex flex-col items-end">
            <span className="text-[11px] text-[var(--color-text-secondary)] font-medium">
              Total Gain / Loss
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={cn(
                  "font-semibold tabular-nums text-xs inline-flex items-center",
                  isPositiveGain
                    ? "text-[var(--color-positive)]"
                    : "text-[var(--color-negative)]"
                )}
              >
                {isPositiveGain ? (
                  <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5 mr-0.5" />
                )}
                ₹{formatCurrency(Math.abs(totals.profitVal))}
              </span>
              <span
                className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.2 rounded-full tabular-nums",
                  isPositiveGain
                    ? "bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)]"
                    : "bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)]"
                )}
              >
                {isPositiveGain ? "+" : ""}
                {totals.gainPercentage.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </motion.section>

      {/* 2. S22: Pending Family Imports Strip */}
      {membersStatus.some((m) => !m.has_data) && (
        <motion.div
          variants={staggerItemVariants}
          className="p-3.5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
              <span className="text-xs font-semibold text-[var(--color-ink)]">
                Pending Family Imports
              </span>
            </div>
            <button
              onClick={() => onNavigateImport?.()}
              className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline cursor-pointer"
              type="button"
            >
              + Add Data
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {membersStatus
              .filter((m) => !m.has_data)
              .map((m) => (
                <div
                  key={m.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning,#f59e0b)]" />
                  <span>{m.name}</span>
                  <Badge variant="warning">No CAS Data</Badge>
                  <button
                    className="text-[11px] font-semibold text-[var(--color-accent)] hover:underline ml-0.5 cursor-pointer"
                    onClick={() => onNavigateImport?.(m.id)}
                    type="button"
                  >
                    + Import
                  </button>
                </div>
              ))}
          </div>
        </motion.div>
      )}

      {/* 3. Portfolio Allocation Card */}
      {allocation && (
        <motion.section
          variants={staggerItemVariants}
          className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-sm font-bold text-[var(--color-ink)]">
              Portfolio Allocation
            </span>

            {/* Asset vs AMC Segment Switcher */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] shadow-2xs">
              <button
                className={cn(
                  "px-2.5 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer",
                  allocationTab === "asset"
                    ? "bg-[var(--color-surface)] text-[var(--color-ink)] font-semibold shadow-xs"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
                )}
                onClick={() => setAllocationTab("asset")}
                type="button"
              >
                Asset
              </button>
              <button
                className={cn(
                  "px-2.5 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer",
                  allocationTab === "amc"
                    ? "bg-[var(--color-surface)] text-[var(--color-ink)] font-semibold shadow-xs"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
                )}
                onClick={() => setAllocationTab("amc")}
                type="button"
              >
                AMC
              </button>
            </div>
          </div>

          {/* Allocation Donut Chart */}
          <AllocationDonut
            data={
              allocationTab === "asset"
                ? [...allocation.by_asset_class].sort(
                  (a, b) =>
                    ASSET_CLASS_ORDER.indexOf(a.label) -
                    ASSET_CLASS_ORDER.indexOf(b.label)
                )
                : allocation.by_amc
            }
            title={allocationTab === "asset" ? "By Asset Class" : "By AMC"}
            enableTapHighlight
          />
        </motion.section>
      )}

      {/* 4. Complete Holdings Section (with search & summary-first cards) */}
      <motion.section variants={staggerItemVariants} className="space-y-3 pt-1">
        {/* Search Input Bar */}
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-secondary)] pointer-events-none" />
          <Input
            type="text"
            placeholder="Search funds or AMCs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-11 text-xs bg-[var(--color-surface)] border-[var(--color-border)] rounded-xl focus-visible:ring-[var(--color-accent)] shadow-2xs"
          />
        </div>

        {/* Holdings Header Bar */}
        <div className="flex items-center justify-between gap-2 px-1 text-xs flex-wrap">
          <span className="font-display text-sm font-bold text-[var(--color-ink)]">
            Holdings
          </span>

          <div className="flex items-center gap-2 flex-wrap">
            {viewMode === "aggregate" && membersStatus.length > 0 && (
              <Select value={holdingsMemberFilter} onValueChange={setHoldingsMemberFilter}>
                <SelectTrigger
                  className="h-8 w-auto min-w-[130px] gap-1.5 rounded-full border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] [&>span]:line-clamp-1"
                  aria-label="Filter holdings by family member"
                >
                  <SelectValue placeholder="All Members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  {membersStatus.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className="text-xs font-semibold text-[var(--color-text-secondary)] tabular-nums">
              {filteredHoldings.length} holding{filteredHoldings.length !== 1 ? "s" : ""}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsDistributorComparisonOpen(true)}
              className="h-7 gap-1 rounded-full px-2.5 text-[11px]"
            >
              <BarChart2 className="h-3.5 w-3.5" />
              <span>Compare Distributors</span>
            </Button>
          </div>
        </div>

        {/* Summary-First Holding Cards List */}
        {filteredHoldings.length > 0 ? (
          <div className="space-y-2.5">
            {filteredHoldings.map((h) => (
              <MobileHoldingCardSummary
                key={h.scheme_id + (h.household_member_id || "")}
                holding={h}
                onSelect={(item) => handleSelectHolding(item)}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] space-y-1">
            <p className="font-semibold text-[var(--color-ink)]">No matching funds</p>
            <p>No holdings found matching &ldquo;{searchTerm}&rdquo;</p>
          </div>
        )}
      </motion.section>

      <MobileDistributorComparisonView
        isOpen={isDistributorComparisonOpen}
        onClose={() => setIsDistributorComparisonOpen(false)}
        viewMode={viewMode}
        memberId={selectedMemberId}
      />
    </motion.div>
  );
}

function formatCurrency(val: number): string {
  if (isNaN(val)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(val);
}
