import { useState } from "react";
import { requestCamsStatement } from "./api";
import { setCasResumeStep2 } from "./casResumeState";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  AlertTriangle,
  Loader2,
} from "lucide-react";

interface RequestCamsPathProps {
  memberId: string;
  onRequestInitiated: (importId: string, expiresAt: string) => void;
}

export function RequestCamsPath({
  memberId,
  onRequestInitiated,
}: RequestCamsPathProps) {
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
    <div className="p-7 sm:p-8 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-7 text-left">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-display font-bold text-base sm:text-lg text-[var(--color-ink)]">
            Request CAS Statement from CAMS
          </h2>
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] px-2.5 py-0.5 rounded-full">
            Recommended
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
          CAMS generates a free Consolidated Account Statement across all your mutual funds and delivers it directly to your registered email address.
        </p>
      </div>

      {/* Cohesive Guided Timeline Sequence */}
      <div className="relative pl-8 space-y-7 before:absolute before:left-[13px] before:top-2.5 before:bottom-3.5 before:w-[1.5px] before:bg-[var(--color-border)]/80">
        {/* Step 1 */}
        <div className="relative space-y-1.5">
          <div className="absolute -left-8 top-0 h-6 w-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] font-display font-bold text-xs flex items-center justify-center shadow-2xs">
            1
          </div>
          <h4 className="font-semibold text-xs sm:text-sm text-[var(--color-ink)]">
            Open CAMS Mailback Portal
          </h4>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Click the button below to navigate to the official CAMS Online CAS request page in a new tab.
          </p>
        </div>

        {/* Step 2 */}
        <div className="relative space-y-2.5">
          <div className="absolute -left-8 top-0 h-6 w-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] font-display font-bold text-xs flex items-center justify-center shadow-2xs">
            2
          </div>
          <h4 className="font-semibold text-xs sm:text-sm text-[var(--color-ink)]">
            Select Statement Options on CAMS
          </h4>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            On the CAMS portal form, please manually choose the following required options:
          </p>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]/80 text-xs">
              <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider">
                Statement:
              </span>
              <span className="font-semibold text-[var(--color-ink)]">
                Detailed statement
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]/80 text-xs">
              <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider">
                Period:
              </span>
              <span className="font-semibold text-[var(--color-ink)]">
                10-year duration
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)]/80 text-xs">
              <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider">
                Folios:
              </span>
              <span className="font-semibold text-[var(--color-ink)]">
                with zero folios
              </span>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="relative space-y-1.5">
          <div className="absolute -left-8 top-0 h-6 w-6 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] font-display font-bold text-xs flex items-center justify-center shadow-2xs">
            3
          </div>
          <h4 className="font-semibold text-xs sm:text-sm text-[var(--color-ink)]">
            Enter Email &amp; Check Inbox
          </h4>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Enter your registered email and PAN. CAMS will email the encrypted PDF statement to you within 5 to 10 minutes.
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] font-medium"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Button */}
      <div className="pt-1">
        <Button
          onClick={handleRequest}
          disabled={isLoading}
          className="w-full h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[48px]"
          type="button"
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
    </div>
  );
}
