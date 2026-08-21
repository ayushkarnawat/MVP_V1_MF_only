import { useState } from "react";
import { motion } from "motion/react";
import type { ImportPreviewResponse, SchemeConfirmation } from "@/features/import/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  User,
  CreditCard,
  Layers,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import { SchemeLogo } from "@/components/SchemeLogo";

export interface MobileReviewViewProps {
  preview: ImportPreviewResponse;
  confirming: boolean;
  onConfirm: (confirmations: SchemeConfirmation[]) => void;
  onCancel?: () => void;
  reviewNotice?: string | null;
}

interface OverrideState {
  amfiCode: string;
  planType: "" | "direct" | "regular";
}

function needsAmfiOverride(matchStatus: string): boolean {
  return matchStatus !== "confirmed";
}

function needsPlanTypeOverride(planType: string): boolean {
  return planType === "unclassified";
}

export function MobileReviewView({
  preview,
  confirming,
  onConfirm,
  onCancel,
  reviewNotice,
}: MobileReviewViewProps) {
  const [overrides, setOverrides] = useState<Record<string, OverrideState>>({});
  const [activeTab, setActiveTab] = useState<"all" | "direct" | "regular">("all");

  const updateOverride = (tempId: string, patch: Partial<OverrideState>) => {
    setOverrides((prev) => {
      const current = prev[tempId] ?? { amfiCode: "", planType: "" };
      return { ...prev, [tempId]: { ...current, ...patch } };
    });
  };

  const allResolved = preview.schemes.every((scheme) => {
    const override = overrides[scheme.temp_id];
    if (needsAmfiOverride(scheme.match_status) && !override?.amfiCode?.trim()) {
      return false;
    }
    if (needsPlanTypeOverride(scheme.plan_type) && !override?.planType) {
      return false;
    }
    return true;
  });

  const handleConfirm = () => {
    const confirmations: SchemeConfirmation[] = preview.schemes
      .filter((scheme) => overrides[scheme.temp_id])
      .map((scheme) => {
        const override = overrides[scheme.temp_id];
        const confirmation: SchemeConfirmation = { temp_id: scheme.temp_id };
        if (override.amfiCode?.trim()) {
          confirmation.amfi_code = override.amfiCode.trim();
        }
        if (override.planType) {
          confirmation.plan_type_override = override.planType;
        }
        return confirmation;
      });
    onConfirm(confirmations);
  };

  const getEffectivePlanType = (scheme: (typeof preview.schemes)[0]) => {
    const override = overrides[scheme.temp_id];
    return override?.planType || scheme.plan_type;
  };

  const directSchemes = preview.schemes.filter((s) => getEffectivePlanType(s) === "direct");
  const regularSchemes = preview.schemes.filter((s) => getEffectivePlanType(s) === "regular");

  const filteredSchemes = preview.schemes.filter((scheme) => {
    if (activeTab === "direct") {
      return getEffectivePlanType(scheme) === "direct";
    }
    if (activeTab === "regular") {
      return getEffectivePlanType(scheme) === "regular";
    }
    return true;
  });

  const needsAttentionCount = preview.schemes.filter(
    (s) => needsAmfiOverride(s.match_status) || needsPlanTypeOverride(s.plan_type)
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="w-full min-w-0 max-w-md mx-auto space-y-4 pt-2 pb-24 text-left box-border relative"
    >
      {/* 1. Header Section */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="space-y-0.5">
            <span className="text-[9px] font-mono font-bold tracking-wider uppercase text-[var(--color-accent)] block">
              CAS REVIEW &amp; VERIFICATION
            </span>
            <h2 className="font-display font-bold text-base text-[var(--color-ink)]">
              Review CAS Import
            </h2>
          </div>
          <Badge variant="positive" className="uppercase tracking-wider gap-1 text-[10px]">
            <CheckCircle2 className="h-3 w-3" />
            <span>Verified</span>
          </Badge>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          Verify parsed funds and resolve any unclassified schemes before confirming.
        </p>
      </div>

      {/* Notice Alert if present */}
      {reviewNotice && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] font-medium"
        >
          {reviewNotice}
        </div>
      )}

      {/* 2. Investor Info Card Summary Grid */}
      <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] flex items-center gap-1">
              <User className="h-3 w-3 text-[var(--color-accent)]" /> Investor
            </span>
            <p className="font-semibold text-[var(--color-ink)] truncate">
              {preview.investor_name ?? "Not in CAS"}
            </p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] flex items-center gap-1">
              <CreditCard className="h-3 w-3 text-[var(--color-accent)]" /> Masked PAN
            </span>
            <p className="font-semibold text-[var(--color-ink)] font-mono">
              {preview.pan_masked ?? "Not in CAS"}
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
          <span className="text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1">
            <Layers className="h-3.5 w-3.5 text-[var(--color-accent)]" /> Total Transactions Found
          </span>
          <span className="font-bold text-[var(--color-ink)] tabular-nums">
            {preview.transaction_count}
          </span>
        </div>
      </div>

      {/* 3. Segmented Filter Tabs */}
      <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-1 border-b border-[var(--color-border)]">
        {/* All Schemes */}
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={cn(
            "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 flex-shrink-0 min-h-[32px]",
            activeTab === "all"
              ? "bg-[var(--color-accent)] text-white shadow-xs"
              : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]"
          )}
        >
          <span>All Schemes</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-white/20 dark:bg-black/20">
            {preview.schemes.length}
          </span>
        </button>

        {/* Direct */}
        <button
          type="button"
          onClick={() => setActiveTab("direct")}
          className={cn(
            "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 flex-shrink-0 min-h-[32px]",
            activeTab === "direct"
              ? "bg-[var(--color-accent)] text-white shadow-xs"
              : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]"
          )}
        >
          <CheckCircle2 className="h-3 w-3 text-[var(--color-positive)]" />
          <span>Direct</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-white/20 dark:bg-black/20">
            {directSchemes.length}
          </span>
        </button>

        {/* Regular */}
        <button
          type="button"
          onClick={() => setActiveTab("regular")}
          className={cn(
            "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 flex-shrink-0 min-h-[32px]",
            activeTab === "regular"
              ? "bg-[var(--color-accent)] text-white shadow-xs"
              : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)]"
          )}
        >
          <span>Regular</span>
          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-white/20 dark:bg-black/20">
            {regularSchemes.length}
          </span>
        </button>
      </div>

      {/* 4. Schemes List / Refined Empty State */}
      {filteredSchemes.length === 0 ? (
        <div className="p-6 text-center rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-2 my-3">
          <p className="font-display font-semibold text-xs text-[var(--color-ink)]">
            {activeTab === "direct"
              ? "No Direct schemes in this portfolio"
              : activeTab === "regular"
              ? "No Regular schemes in this portfolio"
              : "No schemes found"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSchemes.map((scheme) => {
            const override = overrides[scheme.temp_id] ?? { amfiCode: "", planType: "" };
            const needsAmfi = needsAmfiOverride(scheme.match_status);
            const needsPlan = needsPlanTypeOverride(scheme.plan_type);
            const needsAttention = needsAmfi || needsPlan;

            return (
              <div
                key={scheme.temp_id}
                className={cn(
                  "w-full p-4 rounded-2xl border transition-all duration-150 space-y-3 box-border",
                  needsAttention
                    ? "bg-[color-mix(in_srgb,var(--color-accent)_2%,var(--color-surface))] border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))]"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] shadow-xs"
                )}
              >
                {/* Card Header: Scheme/AMC Logo + Scheme Name & Transaction Count */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <SchemeLogo
                      fundLogoUrl={scheme.fund_logo_url || scheme.logo_url}
                      amcLogoUrl={scheme.amc_logo_url}
                      amcName={scheme.amc}
                      schemeName={scheme.name}
                      size="sm"
                    />
                    <div className="space-y-1 min-w-0 flex-1">
                      <h3 className="font-display font-semibold text-sm text-[var(--color-ink)] leading-snug break-words">
                        {scheme.name}
                      </h3>
                      <div className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1.5 flex-wrap">
                        <span>Folio: <strong className="text-[var(--color-ink)] font-medium">{scheme.folio}</strong></span>
                        <span>·</span>
                        <span className="truncate">{scheme.amc}</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[var(--color-bg)] text-[var(--color-ink)] border border-[var(--color-border)] tabular-nums flex-shrink-0">
                    {scheme.transaction_count} txns
                  </span>
                </div>

                {/* Status Badges Row */}
                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                  {scheme.match_status === "confirmed" ? (
                    <Badge variant="positive" className="gap-1 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                      <span>Matched {scheme.amfi_code ? `(${scheme.amfi_code})` : ""}</span>
                    </Badge>
                  ) : (
                    <Badge variant="neutral" className="gap-1 text-[10px]">
                      <HelpCircle className="h-3 w-3 flex-shrink-0" />
                      <span>AMFI Code Needed</span>
                    </Badge>
                  )}

                  {scheme.plan_type === "unclassified" ? (
                    <Badge variant="neutral" className="text-[10px]">Plan Unclassified</Badge>
                  ) : (
                    <Badge
                      variant={scheme.plan_type === "direct" ? "positive" : "neutral"}
                      className="capitalize text-[10px]"
                    >
                      {scheme.plan_type} Plan
                    </Badge>
                  )}
                </div>

                {/* Suggested Match Banner */}
                {scheme.suggested_name && (
                  <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-[var(--color-accent)] flex-shrink-0" />
                    <span>Suggested: <strong className="text-[var(--color-ink)] font-medium">{scheme.suggested_name}</strong></span>
                  </p>
                )}

                {/* Interactive Override Controls */}
                {needsAttention && (
                  <div className="pt-2 border-t border-[var(--color-border)]/60 space-y-3 text-xs">
                    {needsAmfi && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-[var(--color-ink)] block">
                          Enter 6-Digit AMFI Code
                        </label>
                        <Input
                          type="text"
                          placeholder="Enter 6-digit AMFI code"
                          value={override.amfiCode}
                          onChange={(e) =>
                            updateOverride(scheme.temp_id, { amfiCode: e.target.value })
                          }
                          className="h-11 text-xs bg-[var(--color-bg)] border-[var(--color-border)] rounded-xl min-h-[44px]"
                        />
                      </div>
                    )}

                    {needsPlan && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-[var(--color-ink)] block">
                          Select Plan Type
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateOverride(scheme.temp_id, { planType: "direct" })
                            }
                            className={cn(
                              "h-11 min-h-[44px] rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center active:scale-[0.98]",
                              override.planType === "direct"
                                ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)] shadow-xs"
                                : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-ink)]"
                            )}
                          >
                            Direct Plan
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateOverride(scheme.temp_id, { planType: "regular" })
                            }
                            className={cn(
                              "h-11 min-h-[44px] rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center active:scale-[0.98]",
                              override.planType === "regular"
                                ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)] shadow-xs"
                                : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-ink)]"
                            )}
                          >
                            Regular Plan
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Sticky Bottom Actions Bar */}
      <div className="fixed bottom-3 left-3 right-3 z-30 p-3 sm:p-4 rounded-2xl bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-border)] shadow-xl flex items-center gap-2 box-border">
        {onCancel && (
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={confirming}
            className="h-11 px-3 rounded-xl text-xs font-semibold min-h-[44px]"
          >
            Cancel
          </Button>
        )}

        <Button
          onClick={handleConfirm}
          disabled={!allResolved || confirming}
          className="flex-1 h-11 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs shadow-xs gap-2 cursor-pointer active:scale-[0.98] transition-all min-h-[44px]"
        >
          {confirming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving Portfolio...</span>
            </>
          ) : (
            <>
              <span>{allResolved ? "Confirm & Import Portfolio" : `Resolve ${needsAttentionCount} Scheme${needsAttentionCount !== 1 ? "s" : ""}`}</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}

