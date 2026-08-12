import { useState, useEffect } from "react";
import type { ImportPreviewResponse, SchemeConfirmation } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  User,
  CreditCard,
  Layers,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  Loader2,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";

interface ReviewTableProps {
  preview: ImportPreviewResponse;
  confirming: boolean;
  onConfirm: (confirmations: SchemeConfirmation[]) => void;
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

export function ReviewTable({ preview, confirming, onConfirm }: ReviewTableProps) {
  const [overrides, setOverrides] = useState<Record<string, OverrideState>>({});
  const [isWarningsExpanded, setIsWarningsExpanded] = useState(false);
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
    <div className="w-full min-w-0 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pt-2 sm:pt-4 text-left box-border">
      {/* 1. Header Section */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)]">
            Review CAS Import
          </h1>
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] px-3 py-1 rounded-full">
            Statement Verified
          </span>
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

      {/* 3. Collapsible Parse Warnings (Default: Collapsed) */}
      {preview.parse_warnings && preview.parse_warnings.length > 0 && (
        <div className="rounded-2xl bg-[color-mix(in_srgb,var(--color-warning)_8%,transparent)] border border-[color-mix(in_srgb,var(--color-warning)_25%,transparent)] overflow-hidden transition-all duration-200">
          <button
            type="button"
            onClick={() => setIsWarningsExpanded((prev) => !prev)}
            aria-expanded={isWarningsExpanded}
            className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] transition-colors select-none"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-6 w-6 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_20%,transparent)] text-[var(--color-warning)] flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <span className="font-semibold text-xs sm:text-sm text-[var(--color-warning)] block truncate">
                  Import Warnings ({preview.parse_warnings.length})
                </span>
                <span className="text-[11px] text-[var(--color-text-secondary)]">
                  {isWarningsExpanded
                    ? "Click to collapse notices"
                    : `${preview.parse_warnings.length} non-blocking notice${preview.parse_warnings.length !== 1 ? "s" : ""} detected during statement parsing`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-warning)] flex-shrink-0">
              <span className="text-[11px] hidden sm:inline">
                {isWarningsExpanded ? "Hide" : "View"}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  isWarningsExpanded && "rotate-180"
                )}
              />
            </div>
          </button>

          {/* Collapsible Body */}
          <div
            className={cn(
              "px-4 pb-4 pt-1 border-t border-[color-mix(in_srgb,var(--color-warning)_20%,transparent)] transition-all",
              !isWarningsExpanded && "hidden"
            )}
          >
            <ul className="text-xs text-[var(--color-ink)] list-disc list-inside space-y-1.5 pt-2 pl-1">
              {preview.parse_warnings.map((warning, idx) => (
                <li key={idx} className="leading-relaxed">
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 4. Schemes Review Section */}
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
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-positive)_15%,transparent)] text-[var(--color-positive)]">
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                      <span>Matched {scheme.amfi_code ? `(${scheme.amfi_code})` : ""}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)]">
                      <HelpCircle className="h-3 w-3 flex-shrink-0" />
                      <span>AMFI Code Needed</span>
                    </span>
                  )}

                  {scheme.plan_type !== "unclassified" ? (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)] capitalize">
                      {scheme.plan_type} Plan
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)]">
                      Plan Unclassified
                    </span>
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
                        <select
                          role="combobox"
                          value={override.planType}
                          onChange={(event) =>
                            updateOverride(scheme.temp_id, {
                              planType: event.target.value as "" | "direct" | "regular",
                            })
                          }
                          className="w-full h-11 min-h-[44px] px-3 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl text-[var(--color-ink)] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] cursor-pointer"
                        >
                          <option value="">Select...</option>
                          <option value="direct">Direct</option>
                          <option value="regular">Regular</option>
                        </select>
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
            <table className="w-full min-w-[600px] text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/60 text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider select-none">
                  <th className="py-3 px-4 sm:px-6">Scheme &amp; Folio</th>
                  <th className="py-3 px-4">AMFI Match</th>
                  <th className="py-3 px-4">Plan Type</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Txns</th>
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
                      <td className="py-4 px-4 sm:px-6 max-w-xs sm:max-w-md">
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
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            {scheme.match_status === "confirmed" ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-positive)_15%,transparent)] text-[var(--color-positive)] font-semibold text-[11px]">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Matched {scheme.amfi_code ? `(${scheme.amfi_code})` : ""}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)] font-semibold text-[11px]">
                                <HelpCircle className="h-3 w-3" />
                                <span>{scheme.match_status}</span>
                              </span>
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
                                className="h-8 text-xs bg-[var(--color-bg)] border-[var(--color-border)] rounded-lg w-36 focus-visible:ring-[var(--color-accent)]"
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Plan Type */}
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold text-[11px] capitalize",
                              scheme.plan_type === "unclassified"
                                ? "bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)]"
                                : "bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)]"
                            )}
                          >
                            {scheme.plan_type}
                          </span>

                          {needsPlan && (
                            <div className="pt-1">
                              <select
                                role="combobox"
                                value={override.planType}
                                onChange={(event) =>
                                  updateOverride(scheme.temp_id, {
                                    planType: event.target.value as "" | "direct" | "regular",
                                  })
                                }
                                className="h-8 px-2.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[var(--color-ink)] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] cursor-pointer"
                              >
                                <option value="">Select...</option>
                                <option value="direct">Direct</option>
                                <option value="regular">Regular</option>
                              </select>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Transactions Count */}
                      <td className="py-4 px-4 sm:px-6 text-right align-top font-bold text-xs sm:text-sm text-[var(--color-ink)] tabular-nums">
                        <span className="px-2 py-0.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] font-semibold text-xs">
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

      {/* 5. Final Confirmation Action Footer */}
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
    </div>
  );
}
