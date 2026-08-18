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
} from "lucide-react";

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="w-full min-w-0 max-w-md mx-auto space-y-4 pt-2 sm:pt-3 pb-6 text-left box-border"
    >
      {/* 1. Header Info */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-display font-bold text-base text-[var(--color-ink)]">
            Review CAS Import
          </h2>
          <Badge variant="positive" className="uppercase tracking-wider">
            Statement Verified
          </Badge>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)]">
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

      {/* 2. Investor Info Card */}
      <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] flex items-center gap-1">
              <User className="h-3 w-3" /> Investor
            </span>
            <p className="font-semibold text-[var(--color-ink)] truncate">
              {preview.investor_name ?? "Not in CAS"}
            </p>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] flex items-center gap-1">
              <CreditCard className="h-3 w-3" /> Masked PAN
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

      {/* Schemes Review List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="font-bold text-[var(--color-ink)] font-display">
            Schemes Found
          </span>
          <span className="text-[11px] text-[var(--color-text-secondary)]">
            {preview.schemes.length} scheme{preview.schemes.length !== 1 ? "s" : ""}
          </span>
        </div>

        {preview.schemes.map((scheme) => {
          const override = overrides[scheme.temp_id] ?? { amfiCode: "", planType: "" };
          const needsAmfi = needsAmfiOverride(scheme.match_status);
          const needsPlan = needsPlanTypeOverride(scheme.plan_type);

          return (
            <div
              key={scheme.temp_id}
              className="w-full p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-3 box-border"
            >
              {/* Card Header: Scheme Name & Transaction Count */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <h3 className="font-display font-semibold text-sm sm:text-base text-[var(--color-ink)] leading-snug break-words">
                    {scheme.name}
                  </h3>
                  <div className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1.5 flex-wrap">
                    <span>Folio: <strong className="text-[var(--color-ink)] font-medium">{scheme.folio}</strong></span>
                    <span>·</span>
                    <span className="truncate">{scheme.amc}</span>
                  </div>
                </div>

                <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[var(--color-bg)] text-[var(--color-text-secondary)] border border-[var(--color-border)]/80 tabular-nums flex-shrink-0">
                  {scheme.transaction_count} txns
                </span>
              </div>

              {/* Status Badges Row */}
              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                {scheme.match_status === "confirmed" ? (
                  <Badge variant="positive">
                    <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                    <span>Matched {scheme.amfi_code ? `(${scheme.amfi_code})` : ""}</span>
                  </Badge>
                ) : (
                  <Badge variant="neutral">
                    <HelpCircle className="h-3 w-3 flex-shrink-0" />
                    <span>AMFI Code Needed</span>
                  </Badge>
                )}

                {scheme.plan_type === "unclassified" ? (
                  <Badge variant="neutral">Plan Unclassified</Badge>
                ) : (
                  <Badge variant={scheme.plan_type === "direct" ? "positive" : "neutral"} className="capitalize">
                    {scheme.plan_type} Plan
                  </Badge>
                )}
              </div>

              {/* Suggested Scheme Name: Subtle secondary text beneath match status (no heavy box) */}
              {scheme.suggested_name && (
                <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed pt-0.5">
                  <span className="text-[var(--color-text-secondary)]/80">Suggested match:</span>{" "}
                  <span className="text-[var(--color-ink)]/90 font-medium">{scheme.suggested_name}</span>
                </p>
              )}

              {/* Interactive Override Controls (44px touch targets) */}
              {(needsAmfi || needsPlan) && (
                <div className="pt-2 border-t border-[var(--color-border)]/60 space-y-3 text-xs">
                  {needsAmfi && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-[var(--color-ink)] block">
                        Enter 6-digit AMFI Code
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g. 120503"
                        value={override.amfiCode}
                        onChange={(e) =>
                          updateOverride(scheme.temp_id, { amfiCode: e.target.value })
                        }
                        className="h-11 text-xs bg-[var(--color-surface)] border-[var(--color-border)] rounded-xl min-h-[44px]"
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
                              ? "bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)] shadow-xs"
                              : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-ink)]"
                          )}
                        >
                          Direct
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateOverride(scheme.temp_id, { planType: "regular" })
                          }
                          className={cn(
                            "h-11 min-h-[44px] rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center active:scale-[0.98]",
                            override.planType === "regular"
                              ? "bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)] shadow-xs"
                              : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-ink)]"
                          )}
                        >
                          Regular
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

      {/* Sticky Bottom Actions Bar */}
      <div className="sticky bottom-0 z-30 w-full pt-3 pb-3 bg-[var(--color-bg)]/95 backdrop-blur-md border-t border-[var(--color-border)] flex items-center gap-3 mt-6 box-border">
        {onCancel && (
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={confirming}
            className="h-12 px-4 rounded-xl text-xs font-semibold min-h-[48px]"
          >
            Cancel
          </Button>
        )}

        <Button
          onClick={handleConfirm}
          disabled={!allResolved || confirming}
          className="flex-1 h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs shadow-xs gap-2 cursor-pointer active:scale-[0.98] transition-all min-h-[48px]"
        >
          {confirming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving Portfolio...</span>
            </>
          ) : (
            <>
              <span>Confirm &amp; Import Portfolio</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
