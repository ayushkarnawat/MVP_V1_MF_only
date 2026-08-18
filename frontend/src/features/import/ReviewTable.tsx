import { useState, useEffect } from "react";
import { motion } from "motion/react";
import type { ImportPreviewResponse, SchemeConfirmation } from "./types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  User,
  CreditCard,
  Layers,
  FileCheck,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  Loader2,
  ShieldCheck,
} from "lucide-react";

interface ReviewTableProps {
  preview: ImportPreviewResponse;
  confirming: boolean;
  onConfirm: (confirmations: SchemeConfirmation[]) => void;
  /** Whose CAS this is, when known (e.g. sequential family review) — folded
   * into the main heading so it reads as primary info, not a secondary label. */
  memberName?: string;
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

function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    update(mediaQuery);
    const listener = (e: MediaQueryListEvent) => update(e);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, [breakpoint]);

  return isMobile;
}

export function ReviewTable({ preview, confirming, onConfirm, memberName }: ReviewTableProps) {
  const [overrides, setOverrides] = useState<Record<string, OverrideState>>({});
  const isMobile = useIsMobile(768);

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

  const unclassifiedCount = preview.schemes.filter(
    (s) => needsAmfiOverride(s.match_status) || needsPlanTypeOverride(s.plan_type)
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="w-full min-w-0 max-w-5xl mx-auto space-y-6 text-left box-border"
    >
      {/* 1. Header Section — pr-14 on the title row reserves room for the
          onboarding shell's absolutely-positioned top-right ThemeToggle
          (OnboardingFlow.tsx, top-4/right-4), which sits outside this
          component's own layout flow and would otherwise sit on top of a
          long member name; the row stacks below sm so a long name always
          gets its own full-width line to wrap within rather than competing
          with the "Statement Verified" badge for space. */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pr-14 sm:pr-0">
          <h1 className="font-display font-bold tracking-tight leading-tight text-xl sm:text-3xl text-[var(--color-ink)]">
            {memberName ? `Review ${memberName}'s CAS Import` : "Review CAS Import"}
          </h1>
          <Badge variant="positive" className="self-start sm:self-auto flex-shrink-0 uppercase tracking-wider">
            Statement Verified
          </Badge>
        </div>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Verify parsed mutual fund schemes and resolve any missing classifications before committing to your portfolio.
        </p>
      </div>

      {/* 2. Investor & Import Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Investor Name */}
        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider">
            <User className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span>Investor</span>
          </div>
          <p className="font-semibold text-xs sm:text-sm text-[var(--color-ink)] truncate">
            {preview.investor_name ?? "Not found in CAS"}
          </p>
        </div>

        {/* Masked PAN */}
        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider">
            <CreditCard className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span>PAN Number</span>
          </div>
          <p className="font-semibold text-xs sm:text-sm text-[var(--color-ink)] font-mono">
            {preview.pan_masked ?? "Not found in CAS"}
          </p>
        </div>

        {/* Transactions Found */}
        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider">
            <Layers className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span>Transactions</span>
          </div>
          <p className="font-bold text-xs sm:text-sm text-[var(--color-ink)] tabular-nums">
            {preview.transaction_count} found
          </p>
        </div>

        {/* Schemes Count */}
        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider">
            <FileCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span>Funds / Folios</span>
          </div>
          <p className="font-bold text-xs sm:text-sm text-[var(--color-ink)] tabular-nums">
            {preview.schemes.length} scheme{preview.schemes.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* 3. Schemes Review Section */}
      {isMobile ? (
        /* Mobile View (<768px): Stacked Touch Cards (No Table Headers) */
        <div className="w-full space-y-3 box-border">
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
                {/* 1. Scheme Name & 5. Transaction count */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <h3 className="font-display font-semibold text-sm sm:text-base text-[var(--color-ink)] leading-snug break-words">
                      {scheme.name}
                    </h3>
                    {/* 2. Folio + AMC */}
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

                {/* 3. AMFI Match Status & 4. Plan Type Badges */}
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

                {/* Classification Controls / Overrides (Clean inputs, 44px touch targets) */}
                {(needsAmfi || needsPlan) && (
                  <div className="pt-2 border-t border-[var(--color-border)]/60 space-y-3 text-xs">
                    {needsAmfi && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-[var(--color-ink)] block">
                          Enter 6-digit AMFI Code
                        </label>
                        <Input
                          type="text"
                          placeholder="AMFI code"
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
                        <Select
                          value={override.planType || undefined}
                          onValueChange={(value) =>
                            updateOverride(scheme.temp_id, {
                              planType: value as "direct" | "regular",
                            })
                          }
                        >
                          <SelectTrigger className="w-full h-11 min-h-[44px] gap-1.5 rounded-full border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-medium text-[var(--color-text-secondary)] [&>span]:line-clamp-1">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="direct">Direct</SelectItem>
                            <SelectItem value="regular">Regular</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop View (>=768px): Financial Table */
        <div className="w-full rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs overflow-hidden box-border">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/60 text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider select-none">
                  <th className="py-3.5 px-4 sm:px-5 w-[40%]">Scheme &amp; Folio</th>
                  <th className="py-3.5 px-4 sm:px-5 w-[30%]">AMFI Match</th>
                  <th className="py-3.5 px-4 sm:px-5 w-[18%]">Plan Type</th>
                  <th className="py-3.5 px-4 sm:px-5 w-[12%] text-right">Txns</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]/60 text-xs">
                {preview.schemes.map((scheme) => {
                  const override = overrides[scheme.temp_id] ?? { amfiCode: "", planType: "" };
                  const needsAmfi = needsAmfiOverride(scheme.match_status);
                  const needsPlan = needsPlanTypeOverride(scheme.plan_type);

                  return (
                    <tr
                      key={scheme.temp_id}
                      className="hover:bg-[var(--color-bg)]/50 transition-colors duration-150"
                    >
                      {/* Scheme Name & Folio / AMC */}
                      <td className="py-4 px-4 sm:px-5">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-xs sm:text-sm text-[var(--color-ink)] leading-snug">
                            {scheme.name}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1.5 flex-wrap">
                            <span>Folio: <strong className="text-[var(--color-ink)] font-medium">{scheme.folio}</strong></span>
                            <span>•</span>
                            <span>{scheme.amc}</span>
                          </div>
                        </div>
                      </td>

                      {/* AMFI Match */}
                      <td className="py-4 px-4 sm:px-5 align-top">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            {scheme.match_status === "confirmed" ? (
                              <Badge variant="positive">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Matched {scheme.amfi_code ? `(${scheme.amfi_code})` : ""}</span>
                              </Badge>
                            ) : (
                              <Badge variant="neutral">
                                <HelpCircle className="h-3 w-3" />
                                <span>{scheme.match_status}</span>
                              </Badge>
                            )}
                          </div>

                          {scheme.suggested_name && (
                            <div className="text-[11px] text-[var(--color-text-secondary)] italic leading-tight">
                              Suggested: {scheme.suggested_name}
                            </div>
                          )}

                          {needsAmfi && (
                            <div className="pt-1">
                              <Input
                                type="text"
                                placeholder="AMFI code"
                                value={override.amfiCode}
                                onChange={(event) =>
                                  updateOverride(scheme.temp_id, { amfiCode: event.target.value })
                                }
                                className="h-8 text-xs bg-[var(--color-bg)] border-[var(--color-border)] rounded-lg w-32 focus-visible:ring-[var(--color-accent)]"
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Plan Type */}
                      <td className="py-4 px-4 sm:px-5 align-top">
                        <div className="space-y-1.5">
                          <Badge
                            variant={
                              scheme.plan_type === "unclassified"
                                ? "neutral"
                                : scheme.plan_type === "direct"
                                ? "positive"
                                : "neutral"
                            }
                            className="capitalize"
                          >
                            {scheme.plan_type}
                          </Badge>

                          {needsPlan && (
                            <div className="pt-1">
                              <Select
                                value={override.planType || undefined}
                                onValueChange={(value) =>
                                  updateOverride(scheme.temp_id, {
                                    planType: value as "direct" | "regular",
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 w-28 gap-1.5 rounded-full border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-xs font-medium text-[var(--color-text-secondary)] [&>span]:line-clamp-1">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="direct">Direct</SelectItem>
                                  <SelectItem value="regular">Regular</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Transactions Count */}
                      <td className="py-4 px-4 sm:px-5 text-right align-top font-bold text-xs sm:text-sm text-[var(--color-ink)] tabular-nums">
                        <span className="px-2 py-0.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] font-semibold text-xs inline-block">
                          {scheme.transaction_count}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Final Confirmation Action Footer */}
      <div className="w-full p-5 sm:p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex items-center justify-between gap-4 flex-wrap box-border">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--color-positive)]" />
            <span className="font-semibold text-xs sm:text-sm text-[var(--color-ink)]">
              {allResolved
                ? "All schemes verified and ready to import"
                : `Please resolve ${unclassifiedCount} scheme${unclassifiedCount !== 1 ? "s" : ""} requiring classification`}
            </span>
          </div>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            Transactions will be saved to this member&apos;s portfolio upon confirmation.
          </p>
        </div>

        <Button
          type="button"
          disabled={!allResolved || confirming}
          onClick={handleConfirm}
          className="h-12 px-6 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[48px]"
        >
          {confirming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Confirming...</span>
            </>
          ) : (
            <>
              <span>Confirm Import</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
