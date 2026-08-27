import { useState } from "react";
import { requestCamsStatement } from "@/features/import/api";
import { setCasResumeStep2 } from "@/features/import/casResumeState";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

export interface MobileRequestCamsViewProps {
  memberId: string;
  onBack?: () => void;
  onRequestInitiated: (importId: string, expiresAt: string) => void;
}

export function MobileRequestCamsView({
  memberId,
  onBack,
  onRequestInitiated,
}: MobileRequestCamsViewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await requestCamsStatement(memberId);
      setCasResumeStep2(memberId);
      window.open(result.cams_url, "_blank");
      onRequestInitiated(result.import_id, result.expires_at);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to initiate CAMS request.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-4 text-left box-border">
      {/* Back Link */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5C5C5C] dark:text-[#A3A3A3] hover:text-[var(--color-ink)] transition-colors cursor-pointer py-1 -ml-1 min-h-[36px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to import options</span>
        </button>
      )}

      {/* Header Section */}
      <div className="space-y-1">
        <h3 className="font-display font-bold text-[18px] sm:text-[20px] text-[var(--color-ink)] tracking-tight leading-tight">
          Request from CAMS
        </h3>
        <p className="text-[12.5px] sm:text-[13px] text-[#5C5C5C] dark:text-[#A3A3A3] leading-relaxed font-normal font-body">
          CAMS generates a free Consolidated Account Statement across all your mutual funds and emails it to you directly.
        </p>
      </div>

      {/* Cohesive Group: 3 Required CAMS Selections */}
      <div className="p-3 sm:p-3.5 rounded-xl bg-[#22C55E]/[0.05] dark:bg-[#22C55E]/[0.08] border border-[#22C55E]/25 space-y-2">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E] flex-shrink-0" />
          <span className="text-[11px] sm:text-xs font-semibold text-[#22C55E] block font-body">
            On the CAMS form, select these three options
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          <div className="p-2 rounded-lg bg-white/90 dark:bg-[var(--color-surface)] border border-[#22C55E]/20 text-center space-y-0.5 shadow-2xs">
            <span className="text-[9.5px] text-[#5C5C5C] dark:text-[#A3A3A3] block uppercase tracking-wider font-body font-semibold">Statement</span>
            <span className="text-[11px] font-bold text-[var(--color-ink)] block leading-tight font-body">Detailed statement</span>
          </div>
          <div className="p-2 rounded-lg bg-white/90 dark:bg-[var(--color-surface)] border border-[#22C55E]/20 text-center space-y-0.5 shadow-2xs">
            <span className="text-[9.5px] text-[#5C5C5C] dark:text-[#A3A3A3] block uppercase tracking-wider font-body font-semibold">Period</span>
            <span className="text-[11px] font-bold text-[var(--color-ink)] block leading-tight font-body">10-year duration</span>
          </div>
          <div className="p-2 rounded-lg bg-white/90 dark:bg-[var(--color-surface)] border border-[#22C55E]/20 text-center space-y-0.5 shadow-2xs">
            <span className="text-[9.5px] text-[#5C5C5C] dark:text-[#A3A3A3] block uppercase tracking-wider font-body font-semibold">Folios</span>
            <span className="text-[11px] font-bold text-[var(--color-ink)] block leading-tight font-body">with zero folios</span>
          </div>
        </div>
      </div>

      {/* 3 Numbered Guided Steps */}
      <div className="relative pl-6 space-y-3 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-[var(--color-border)]/80">
        {/* Step 1 */}
        <div className="relative space-y-0.5">
          <div className="absolute -left-6 top-0 h-4.5 w-4.5 rounded-full bg-white dark:bg-[var(--color-surface)] border border-[#22C55E]/60 text-[#22C55E] font-mono font-bold text-[9px] flex items-center justify-center shadow-2xs">
            1
          </div>
          <p className="text-xs text-[var(--color-ink)] leading-relaxed font-medium">
            Tapping below opens the official CAMS site in a new tab.
          </p>
        </div>

        {/* Step 2 */}
        <div className="relative space-y-0.5">
          <div className="absolute -left-6 top-0 h-4.5 w-4.5 rounded-full bg-white dark:bg-[var(--color-surface)] border border-[#22C55E]/60 text-[#22C55E] font-mono font-bold text-[9px] flex items-center justify-center shadow-2xs">
            2
          </div>
          <p className="text-xs text-[var(--color-ink)] leading-relaxed font-medium">
            Select the above three options on the form.
          </p>
        </div>

        {/* Step 3 */}
        <div className="relative space-y-0.5">
          <div className="absolute -left-6 top-0 h-4.5 w-4.5 rounded-full bg-white dark:bg-[var(--color-surface)] border border-[#22C55E]/60 text-[#22C55E] font-mono font-bold text-[9px] flex items-center justify-center shadow-2xs">
            3
          </div>
          <p className="text-xs text-[var(--color-ink)] leading-relaxed font-medium">
            Enter your email and set a password for your CAS file — that&apos;s all CAMS needs from you.
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] font-medium"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Button */}
      <Button
        onClick={handleRequest}
        disabled={isLoading}
        className="w-full h-13 sm:h-13.5 rounded-full bg-[#22C55E] hover:bg-[#22C55E]/90 dark:bg-[#22C55E] dark:hover:bg-[#22C55E]/90 text-white font-bold text-[14px] sm:text-[15px] shadow-lg shadow-[#22C55E]/25 gap-2 cursor-pointer active:scale-[0.98] transition-all min-h-[48px] border-none"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Opening CAMS Portal...</span>
          </>
        ) : (
          <>
            <span>Request Statement on CAMS</span>
            <ExternalLink className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
