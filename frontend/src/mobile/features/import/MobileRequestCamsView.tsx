import { useState } from "react";
import { requestCamsStatement } from "@/features/import/api";
import { setCasResumeStep2 } from "@/features/import/casResumeState";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  AlertTriangle,
  Loader2,
  ArrowLeft,
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
    <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-4 text-left">
      {/* Back Link */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] transition-colors cursor-pointer py-1 -ml-1 min-h-[36px]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to import options</span>
        </button>
      )}

      {/* Header Section */}
      <div className="space-y-1">
        <h3 className="font-display font-bold text-base text-[var(--color-ink)] tracking-tight">
          Request from CAMS
        </h3>
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          CAMS generates a free Consolidated Account Statement across all your mutual funds and emails it to you directly.
        </p>
      </div>

      {/* Consolidated Reference Card */}
      <div className="p-3.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]/80 space-y-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] block font-mono">
          On the CAMS form, select these three options
        </span>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-[var(--color-border)]/40">
            <span className="text-[11px] text-[var(--color-text-secondary)]">Statement</span>
            <span className="text-[11px] font-semibold text-[var(--color-ink)]">Detailed statement</span>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-[var(--color-border)]/40">
            <span className="text-[11px] text-[var(--color-text-secondary)]">Period</span>
            <span className="text-[11px] font-semibold text-[var(--color-ink)]">10-year duration</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-[11px] text-[var(--color-text-secondary)]">Folios</span>
            <span className="text-[11px] font-semibold text-[var(--color-ink)]">with zero folios</span>
          </div>
        </div>
      </div>

      {/* 3 Guided Steps */}
      <div className="relative pl-6 space-y-3.5 before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-[var(--color-border)]/80">
        {/* Step 1 */}
        <div className="relative space-y-0.5">
          <div className="absolute -left-6 top-0 h-4.5 w-4.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] font-mono font-bold text-[9px] flex items-center justify-center shadow-2xs">
            1
          </div>
          <p className="text-xs text-[var(--color-ink)] leading-relaxed font-medium">
            Tapping below opens the official CAMS site in a new tab.
          </p>
        </div>

        {/* Step 2 */}
        <div className="relative space-y-0.5">
          <div className="absolute -left-6 top-0 h-4.5 w-4.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] font-mono font-bold text-[9px] flex items-center justify-center shadow-2xs">
            2
          </div>
          <p className="text-xs text-[var(--color-ink)] leading-relaxed font-medium">
            Select the above three options on the form.
          </p>
        </div>

        {/* Step 3 */}
        <div className="relative space-y-0.5">
          <div className="absolute -left-6 top-0 h-4.5 w-4.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] font-mono font-bold text-[9px] flex items-center justify-center shadow-2xs">
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
        className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.98] transition-all min-h-[44px]"
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
