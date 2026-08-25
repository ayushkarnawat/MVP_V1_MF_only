import { useState } from "react";
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
import { cn } from "@/lib/utils";
import {
  User,
  CreditCard,
  Layers,
  FileCheck,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  Sparkles,
  LayoutGrid,
  List,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { SchemeLogo } from "@/components/SchemeLogo";

interface ReviewTableProps {
  preview: ImportPreviewResponse;
  confirming: boolean;
  onConfirm: (confirmations: SchemeConfirmation[]) => void;
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

export function ReviewTable({ preview, confirming, onConfirm, memberName }: ReviewTableProps) {
  const [overrides, setOverrides] = useState<Record<string, OverrideState>>({});
  const [activeTab, setActiveTab] = useState<"all" | "direct" | "regular">("all");
  const [layoutMode, setLayoutMode] = useState<"grid" | "list">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("unifolio_review_layout_mode");
      if (saved === "grid" || saved === "list") return saved;
    }
    return "grid";
  });

  const handleLayoutChange = (mode: "grid" | "list") => {
    setLayoutMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("unifolio_review_layout_mode", mode);
    }
  };

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

  const effectiveLayoutMode = layoutMode === "list" ? "list" : "grid";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "w-full min-w-0 mx-auto space-y-6 text-left box-border relative pb-24 px-3 sm:px-6 lg:px-8 transition-all duration-300",
        effectiveLayoutMode === "grid" ? "max-w-[1600px]" : "max-w-5xl"
      )}
    >
      {/* 1. Header Section */}
      <div className="space-y-1">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pr-14 sm:pr-0">
          <div className="space-y-0.5">
            <h1 className="font-display font-bold tracking-tight leading-tight text-xl sm:text-3xl text-[var(--color-ink)]">
              {memberName ? `Review ${memberName}'s CAS Import` : "Review CAS Import"}
            </h1>
          </div>
          <Badge variant="positive" className="self-start sm:self-auto flex-shrink-0 uppercase tracking-wider gap-1">
            <CheckCircle2 className="h-3 w-3" />
            <span>Statement Verified</span>
          </Badge>
        </div>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
          Verify parsed mutual fund schemes and resolve any missing classifications before committing to your portfolio.
        </p>
      </div>

      {/* 2. Investor & Import Summary Cards (Grid) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
        {/* Investor Name */}
        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider">
            <User className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span>Investor</span>
          </div>
          <p className="font-semibold text-xs sm:text-sm text-[var(--color-ink)] truncate">
            {preview.investor_name ?? "Not found in CAS"}
          </p>
        </div>

        {/* Masked PAN */}
        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider">
            <CreditCard className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span>PAN Number</span>
          </div>
          <p className="font-semibold text-xs sm:text-sm text-[var(--color-ink)] font-mono">
            {preview.pan_masked ?? "Not found in CAS"}
          </p>
        </div>

        {/* Transactions Found */}
        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider">
            <Layers className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span>Transactions</span>
          </div>
          <p className="font-bold text-xs sm:text-sm text-[var(--color-ink)] tabular-nums">
            {preview.transaction_count} found
          </p>
        </div>

        {/* Schemes Count */}
        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider">
            <FileCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span>Funds / Folios</span>
          </div>
          <p className="font-bold text-xs sm:text-sm text-[var(--color-ink)] tabular-nums">
            {preview.schemes.length} scheme{preview.schemes.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* 3. Segmented Filter Tabs & Desktop Layout Mode Switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[var(--color-border)] pb-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {/* All Schemes */}
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 min-h-[36px]",
              activeTab === "all"
                ? "bg-[var(--color-accent)] text-white shadow-xs"
                : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-ink)]"
            )}
          >
            <span>All Schemes</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-white/20 dark:bg-black/20">
              {preview.schemes.length}
            </span>
          </button>

          {/* Direct */}
          <button
            type="button"
            onClick={() => setActiveTab("direct")}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 min-h-[36px]",
              activeTab === "direct"
                ? "bg-[var(--color-accent)] text-white shadow-xs"
                : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-ink)]"
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-positive)]" />
            <span>Direct</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-white/20 dark:bg-black/20">
              {directSchemes.length}
            </span>
          </button>

          {/* Regular */}
          <button
            type="button"
            onClick={() => setActiveTab("regular")}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 min-h-[36px]",
              activeTab === "regular"
                ? "bg-[var(--color-accent)] text-white shadow-xs"
                : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-ink)]"
            )}
          >
            <span>Regular</span>
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-white/20 dark:bg-black/20">
              {regularSchemes.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap ml-auto">
          <span className="text-xs text-[var(--color-text-secondary)]">
            Showing {filteredSchemes.length} of {preview.schemes.length} scheme{preview.schemes.length !== 1 ? "s" : ""}
          </span>

          {/* A/B Layout Mode Switcher (Desktop Only) */}
          <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
            <button
              type="button"
              aria-label="Grid View"
              onClick={() => handleLayoutChange("grid")}
              className={cn(
                "p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1",
                layoutMode === "grid"
                  ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-xs"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Grid</span>
            </button>
            <button
              type="button"
              aria-label="List View"
              onClick={() => handleLayoutChange("list")}
              className={cn(
                "p-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1",
                layoutMode === "list"
                  ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-xs"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
              )}
            >
              <List className="h-3.5 w-3.5" />
              <span>List</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. SCHEME CARDS AREA (GRID vs LIST) */}
      {filteredSchemes.length === 0 ? (
        <div className="p-8 sm:p-12 text-center rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-3 my-4">
          <div className="h-12 w-12 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_20%,transparent)] text-[var(--color-accent)] flex items-center justify-center mx-auto">
            <FileCheck className="h-6 w-6" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="font-display font-bold text-base text-[var(--color-ink)]">
              {activeTab === "direct"
                ? "No Direct schemes in this portfolio"
                : activeTab === "regular"
                ? "No Regular schemes in this portfolio"
                : "No schemes found"}
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              All mutual fund holdings parsed from this statement belong to other plan categories.
            </p>
          </div>
        </div>
      ) : layoutMode === "grid" ? (
        /* GRID VIEW (3-4 Columns) */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
          {filteredSchemes.map((scheme) => {
            const override = overrides[scheme.temp_id] ?? { amfiCode: "", planType: "" };
            const needsAmfi = needsAmfiOverride(scheme.match_status);
            const needsPlan = needsPlanTypeOverride(scheme.plan_type);
            const needsAttention = needsAmfi || needsPlan;

            return (
              <div
                key={scheme.temp_id}
                className={cn(
                  "w-full p-5 rounded-3xl border transition-all duration-200 flex flex-col justify-between space-y-4 box-border shadow-xs hover:shadow-md",
                  needsAttention
                    ? "bg-[color-mix(in_srgb,var(--color-accent)_2%,var(--color-surface))] border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))]"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border)]/80"
                )}
              >
                <div className="space-y-3">
                  {/* Top Bar: Folio Badge + Status Pill */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-lg bg-[var(--color-bg)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
                      Folio: {scheme.folio}
                    </span>

                    {needsAttention ? (
                      <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] border border-[color-mix(in_srgb,var(--color-accent)_24%,transparent)] flex-shrink-0">
                        Action Needed
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] text-[var(--color-positive)] border border-[color-mix(in_srgb,var(--color-positive)_24%,transparent)] flex-shrink-0">
                        Verified
                      </span>
                    )}
                  </div>

                  {/* Scheme Name & AMC Label with Scheme/AMC Logo */}
                  <div className="flex items-start gap-3">
                    <SchemeLogo
                      fundLogoUrl={scheme.fund_logo_url || scheme.logo_url}
                      amcLogoUrl={scheme.amc_logo_url}
                      amcName={scheme.amc}
                      schemeName={scheme.name}
                    />
                    <div className="space-y-1 min-w-0 flex-1">
                      <h3 className="font-display font-semibold text-base text-[var(--color-ink)] leading-snug line-clamp-2 min-h-[44px]">
                        {scheme.name}
                      </h3>
                      <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] pt-0.5">
                        <span className="truncate max-w-[180px] font-medium">{scheme.amc}</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[var(--color-bg)] text-[var(--color-ink)] border border-[var(--color-border)] tabular-nums flex-shrink-0">
                          {scheme.transaction_count} txns
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status & Plan Badges Row */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
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
                    <div className="p-3 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-secondary)] leading-tight flex items-start gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)] flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2">
                        Suggested: <strong className="text-[var(--color-ink)] font-medium">{scheme.suggested_name}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Interactive Classification / Override Form Controls */}
                {needsAttention && (
                  <div className="pt-3 border-t border-[var(--color-border)]/60 space-y-2.5 text-xs">
                    {needsAmfi && (
                      <div className="space-y-1">
                        <label htmlFor={`amfi-input-${scheme.temp_id}`} className="text-[10px] font-semibold text-[var(--color-ink)] block uppercase tracking-wider">
                          Enter 6-Digit AMFI Code
                        </label>
                        <Input
                          id={`amfi-input-${scheme.temp_id}`}
                          aria-label="AMFI Code"
                          type="text"
                          placeholder="Enter 6-digit AMFI code"
                          value={override.amfiCode}
                          onChange={(event) =>
                            updateOverride(scheme.temp_id, { amfiCode: event.target.value })
                          }
                          className="h-10 text-xs bg-[var(--color-bg)] border-[var(--color-border)] rounded-xl focus-visible:ring-[var(--color-accent)] min-h-[40px]"
                        />
                      </div>
                    )}

                    {needsPlan && (
                      <div className="space-y-1">
                        <label htmlFor={`plan-select-${scheme.temp_id}`} className="text-[10px] font-semibold text-[var(--color-ink)] block uppercase tracking-wider">
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
                          <SelectTrigger id={`plan-select-${scheme.temp_id}`} className="w-full h-10 min-h-[40px] gap-1.5 rounded-xl border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-medium text-[var(--color-ink)]">
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
        /* LIST VIEW (Previous Centered Single-Column Stack) */
        <div className="space-y-4">
          {filteredSchemes.map((scheme) => {
            const override = overrides[scheme.temp_id] ?? { amfiCode: "", planType: "" };
            const needsAmfi = needsAmfiOverride(scheme.match_status);
            const needsPlan = needsPlanTypeOverride(scheme.plan_type);
            const needsAttention = needsAmfi || needsPlan;

            return (
              <div
                key={scheme.temp_id}
                className={cn(
                  "w-full p-5 sm:p-6 rounded-3xl border transition-all duration-200 space-y-4 box-border shadow-xs hover:shadow-md",
                  needsAttention
                    ? "bg-[color-mix(in_srgb,var(--color-accent)_2%,var(--color-surface))] border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))]"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border)]/80"
                )}
              >
                {/* Header Row: Scheme/AMC Logo + Scheme Name & Transaction Count */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <SchemeLogo
                      fundLogoUrl={scheme.fund_logo_url || scheme.logo_url}
                      amcLogoUrl={scheme.amc_logo_url}
                      amcName={scheme.amc}
                      schemeName={scheme.name}
                    />
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display font-bold text-base sm:text-lg text-[var(--color-ink)] leading-snug break-words">
                          {scheme.name}
                        </h3>
                        {needsAttention && (
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] border border-[color-mix(in_srgb,var(--color-accent)_24%,transparent)] flex-shrink-0">
                            Classification Needed
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-[var(--color-text-secondary)] flex items-center gap-2 flex-wrap pt-0.5">
                        <span>Folio: <strong className="text-[var(--color-ink)] font-semibold">{scheme.folio}</strong></span>
                        <span>·</span>
                        <span className="truncate font-medium">{scheme.amc}</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-xs font-bold px-3 py-1 rounded-xl bg-[var(--color-bg)] text-[var(--color-ink)] border border-[var(--color-border)] tabular-nums flex-shrink-0 self-start">
                    {scheme.transaction_count} transaction{scheme.transaction_count !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Badges & Matching Status Row */}
                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                  {scheme.match_status === "confirmed" ? (
                    <Badge variant="positive" className="gap-1">
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                      <span>Matched {scheme.amfi_code ? `(${scheme.amfi_code})` : ""}</span>
                    </Badge>
                  ) : (
                    <Badge variant="neutral" className="gap-1">
                      <HelpCircle className="h-3 w-3 flex-shrink-0" />
                      <span>AMFI Code Needed</span>
                    </Badge>
                  )}

                  {scheme.plan_type === "unclassified" ? (
                    <Badge variant="neutral">Plan Unclassified</Badge>
                  ) : (
                    <Badge
                      variant={scheme.plan_type === "direct" ? "positive" : "neutral"}
                      className="capitalize"
                    >
                      {scheme.plan_type} Plan
                    </Badge>
                  )}
                </div>

                {/* Suggested Match Banner */}
                {scheme.suggested_name && (
                  <div className="p-3.5 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] leading-relaxed flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)] flex-shrink-0" />
                    <span>
                      Suggested match: <strong className="text-[var(--color-ink)] font-medium">{scheme.suggested_name}</strong>
                    </span>
                  </div>
                )}

                {/* Interactive Classification / Override Form Controls */}
                {needsAttention && (
                  <div className="pt-3 border-t border-[var(--color-border)]/60 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    {needsAmfi && (
                      <div className="space-y-1.5">
                        <label htmlFor={`amfi-input-list-${scheme.temp_id}`} className="text-[11px] font-semibold text-[var(--color-ink)] block">
                          Enter 6-Digit AMFI Code
                        </label>
                        <Input
                          id={`amfi-input-list-${scheme.temp_id}`}
                          aria-label="AMFI Code"
                          type="text"
                          placeholder="Enter 6-digit AMFI code"
                          value={override.amfiCode}
                          onChange={(event) =>
                            updateOverride(scheme.temp_id, { amfiCode: event.target.value })
                          }
                          className="h-11 text-xs bg-[var(--color-bg)] border-[var(--color-border)] rounded-xl focus-visible:ring-[var(--color-accent)] min-h-[44px]"
                        />
                      </div>
                    )}

                    {needsPlan && (
                      <div className="space-y-1.5">
                        <label htmlFor={`plan-select-list-${scheme.temp_id}`} className="text-[11px] font-semibold text-[var(--color-ink)] block">
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
                          <SelectTrigger id={`plan-select-list-${scheme.temp_id}`} className="w-full h-11 min-h-[44px] gap-1.5 rounded-xl border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs font-medium text-[var(--color-ink)]">
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
      )}

      {/* 5. STICKY BOTTOM ACTION FOOTER BAR */}
      <div className="sticky bottom-4 z-30 w-full p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-border)] shadow-xl flex items-center justify-between gap-4 flex-wrap box-border mt-6">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            {allResolved ? (
              <ShieldCheck className="h-4 w-4 text-[var(--color-positive)] flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-[var(--color-accent)] flex-shrink-0" />
            )}
            <span className="font-semibold text-xs sm:text-sm text-[var(--color-ink)] truncate">
              {allResolved
                ? "All schemes verified and ready to import"
                : `Please resolve ${needsAttentionCount} scheme${needsAttentionCount !== 1 ? "s" : ""} requiring classification`}
            </span>
          </div>
          <p className="text-[11px] text-[var(--color-text-secondary)] hidden sm:block">
            Transactions will be saved to this member&apos;s portfolio upon confirmation.
          </p>
        </div>

        <Button
          type="button"
          disabled={!allResolved || confirming}
          onClick={handleConfirm}
          className="h-12 px-6 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[48px] ml-auto"
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
