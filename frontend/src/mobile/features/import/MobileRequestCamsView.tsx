import { useState } from "react";
import { requestCamsStatement, cancelImportRequest } from "@/features/import/api";
import { setCasResumeStep2, clearCasResumeStep2 } from "@/features/import/casResumeState";
import { MobileUploadForm } from "./MobileUploadForm";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  AlertTriangle,
  Loader2,
  Clock,
  Mail,
} from "lucide-react";

export interface MobileRequestCamsViewProps {
  memberId: string;
  pendingImportId?: string | null;
  onRequestInitiated: (importId: string, expiresAt: string) => void;
  onCancelled: () => void;
  onUploadSubmit: (file: File, password: string) => void;
}

export function MobileRequestCamsView({
  memberId,
  pendingImportId,
  onRequestInitiated,
  onCancelled,
  onUploadSubmit,
}: MobileRequestCamsViewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
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

  const handleCancel = async () => {
    if (!pendingImportId) return;
    setIsCancelling(true);
    setError(null);
    try {
      await cancelImportRequest(pendingImportId);
      clearCasResumeStep2(memberId);
      onCancelled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel request.");
    } finally {
      setIsCancelling(false);
    }
  };

  // If already waiting for CAMS statement email delivery
  if (pendingImportId) {
    return (
      <div className="space-y-4 text-left">
        {/* Waiting Status Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_20%,transparent)] shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-[var(--color-surface)] text-[var(--color-accent)] flex items-center justify-center shadow-2xs">
                <Clock className="h-3.5 w-3.5 animate-pulse" />
              </div>
              <span className="font-display font-bold text-xs sm:text-sm text-[var(--color-ink)]">
                Waiting for CAMS Email
              </span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isCancelling}
              className="text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-negative)] hover:bg-[var(--color-surface)] h-8 px-2.5 rounded-lg cursor-pointer min-h-[36px]"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  <span>Cancelling...</span>
                </>
              ) : (
                <span>Cancel</span>
              )}
            </Button>
          </div>

          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            CAMS sends the PDF to your registered email within 5–10 minutes. When it arrives, select or drop the PDF below.
          </p>
        </div>

        {/* Error Notice */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] font-medium"
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Upload form for when statement is received */}
        <MobileUploadForm onSubmit={onUploadSubmit} />
      </div>
    );
  }

  return (
    <div className="space-y-3 text-left">
      {/* Main Action & Settings Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]/60 shadow-xs space-y-3.5 text-left">
        {/* Header Section */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display font-semibold text-sm sm:text-base text-[var(--color-ink)] tracking-tight">
              Request your CAS
            </h3>
            <span className="text-[10px] font-bold text-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] px-2 py-0.5 rounded-md tracking-wider uppercase">
              RECOMMENDED
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Get your consolidated statement directly from CAMS.
          </p>
        </div>

        {/* Primary Green CTA Button */}
        <Button
          onClick={handleRequest}
          disabled={isLoading}
          className="w-full h-11 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.98] transition-all min-h-[44px]"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Initiating CAMS Request...</span>
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4" />
              <span>Open CAMS Mailback Portal</span>
            </>
          )}
        </Button>

        {/* Error Alert if any */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 p-2.5 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] font-medium"
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Minimal Row-Based Settings (No heavy boxed table) */}
        <div className="space-y-1.5 pt-2">
          <div className="text-[11px] font-medium text-[var(--color-text-secondary)]">
            Use these settings
          </div>
          <div className="space-y-0.5 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]/40">
              <span className="text-[11px] text-[var(--color-text-secondary)]">Statement</span>
              <span className="text-[11px] font-medium text-[var(--color-ink)]">Detailed statement</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]/40">
              <span className="text-[11px] text-[var(--color-text-secondary)]">Period</span>
              <span className="text-[11px] font-medium text-[var(--color-ink)]">10-year duration</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[11px] text-[var(--color-text-secondary)]">Folios</span>
              <span className="text-[11px] font-medium text-[var(--color-ink)]">Zero folios</span>
            </div>
          </div>
        </div>
      </div>

      {/* Outside Subtle Informational Section: Check your email */}
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[color-mix(in_srgb,var(--color-surface)_75%,transparent)] border border-[var(--color-border)]/50 text-left">
        <div className="h-7 w-7 rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0">
          <Mail className="h-3.5 w-3.5" />
        </div>
        <div className="space-y-0.5 min-w-0">
          <h4 className="text-xs font-semibold text-[var(--color-ink)] tracking-tight">
            Check your email
          </h4>
          <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
            CAMS will send the statement to your registered email.
          </p>
        </div>
      </div>
    </div>
  );
}
