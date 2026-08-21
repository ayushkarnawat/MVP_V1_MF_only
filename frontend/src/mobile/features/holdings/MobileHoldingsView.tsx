import { useState, useEffect, useMemo } from "react";
import {
  getAggregateHoldings,
  getMemberHoldings,
} from "@/features/dashboard/api";
import { listHouseholdMembers } from "@/features/auth/api";
import type { HoldingRow } from "@/features/dashboard/types";
import type { HouseholdMember } from "@/features/auth/types";
import { MobileHoldingCardSummary } from "./MobileHoldingCardSummary";
import { MobileFundDetailView } from "./MobileFundDetailView";
import { MobileDistributorComparisonView } from "./MobileDistributorComparisonView";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search, ChevronDown, AlertTriangle, UploadCloud, BarChart2 } from "lucide-react";

export interface MobileHoldingsViewProps {
  onNavigateImport?: () => void;
  onDetailViewToggle?: (isOpen: boolean) => void;
}

export function MobileHoldingsView({
  onNavigateImport,
  onDetailViewToggle,
}: MobileHoldingsViewProps) {
  const [viewMode, setViewMode] = useState<"aggregate" | "member">("aggregate");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedHolding, setSelectedHolding] = useState<HoldingRow | null>(null);
  const [isDistributorComparisonOpen, setIsDistributorComparisonOpen] = useState(false);
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
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  /* Fetch holdings depending on viewMode & memberId */
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        if (viewMode === "aggregate") {
          const res = await getAggregateHoldings();
          if (isMounted) {
            setHoldings(res.holdings);
            setLoading(false);
          }
        } else if (selectedMemberId) {
          const res = await getMemberHoldings(selectedMemberId);
          if (isMounted) {
            setHoldings(res);
            setLoading(false);
          }
        } else {
          if (isMounted) {
            setHoldings([]);
            setLoading(false);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg =
            err instanceof Error ? err.message : "Failed to load holdings";
          setError(msg);
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [viewMode, selectedMemberId]);

  const hasFamily = members.length > 1;

  const filteredHoldings = useMemo(() => {
    if (!searchTerm.trim()) return holdings;
    const q = searchTerm.toLowerCase();
    return holdings.filter(
      (h) =>
        h.scheme_name.toLowerCase().includes(q) ||
        (h.amc_name && h.amc_name.toLowerCase().includes(q))
    );
  }, [holdings, searchTerm]);

  const handleSelectHolding = (item: HoldingRow | null) => {
    setSelectedHolding(item);
    onDetailViewToggle?.(item !== null);
  };

  /* Full-Screen Dedicated Fund Details View */
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
      <div className="flex flex-col space-y-3 py-2 animate-pulse" aria-label="Loading holdings">
        <div className="h-10 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl" />
        <div className="h-8 w-40 bg-[var(--color-border)] rounded-md" />
        <div className="space-y-2.5 pt-1">
          <div className="h-20 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl" />
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
          Could not load holdings
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

  if (holdings.length === 0) {
    return (
      <div className="flex flex-col space-y-4 animate-in fade-in duration-200">
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
              <div className="relative">
                <select
                  value={selectedMemberId || ""}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="w-full appearance-none pl-3 pr-8 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] cursor-pointer shadow-2xs"
                  aria-label="Select household member"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.relationship})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-secondary)] pointer-events-none opacity-70" />
              </div>
            )}
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
              Upload a consolidated CAS statement to track all mutual fund schemes and folio balances.
            </p>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={onNavigateImport}
            className="w-full font-semibold h-11 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 shadow-xs"
          >
            + Upload CAS Statement
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4 animate-in fade-in duration-200">
      {/* Top Controls: Family Switcher + Member Select */}
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

          {/* Member Picker */}
          {viewMode === "member" && members.length > 0 && (
            <div className="relative">
              <select
                value={selectedMemberId || ""}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] cursor-pointer shadow-2xs"
                aria-label="Select household member"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.relationship})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-secondary)] pointer-events-none opacity-70" />
            </div>
          )}
        </div>
      )}

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
          All Holdings
        </span>
        <div className="flex items-center gap-2">
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

      <MobileDistributorComparisonView
        isOpen={isDistributorComparisonOpen}
        onClose={() => setIsDistributorComparisonOpen(false)}
        viewMode={viewMode}
        memberId={selectedMemberId}
      />
    </div>
  );
}
