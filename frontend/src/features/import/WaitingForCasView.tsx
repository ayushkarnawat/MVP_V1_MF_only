import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UploadForm } from "./UploadForm";
import { cancelImportRequest, uploadCasImport } from "./api";
import type { CASImportStatusResponse } from "./types";
import { Clock, AlertTriangle, Loader2 } from "lucide-react";

interface WaitingForCasViewProps {
  importId: string;
  memberId: string;
  onCancelled: () => void;
  onUploadReceived: (res: CASImportStatusResponse) => void;
}

export function WaitingForCasView({
  importId,
  memberId,
  onCancelled,
  onUploadReceived,
}: WaitingForCasViewProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    setIsCancelling(true);
    setError(null);
    try {
      await cancelImportRequest(importId);
      onCancelled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel request.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleUpload = async (file: File, password: string) => {
    setError(null);
    try {
      const res = await uploadCasImport(file, password, memberId, "request");
      onUploadReceived(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    }
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {/* Waiting Status Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_20%,transparent)] shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-[var(--color-surface)] text-[var(--color-accent)] flex items-center justify-center shadow-2xs">
              <Clock className="h-3.5 w-3.5 animate-pulse" />
            </div>
            <span className="font-display font-bold text-sm sm:text-base text-[var(--color-ink)]">
              Waiting for CAMS Email Delivery
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isCancelling}
            className="text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-negative)] hover:bg-[var(--color-surface)] h-8 px-3 rounded-lg cursor-pointer"
          >
            {isCancelling ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                <span>Cancelling...</span>
              </>
            ) : (
              <span>Cancel Request</span>
            )}
          </Button>
        </div>

        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
          CAMS typically sends the statement PDF within 5 to 10 minutes. When it arrives in your inbox, download the PDF and drop it below to finish importing.
        </p>
      </div>

      {/* Error Notice */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] font-medium"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Immediate dropzone to ingest PDF once received */}
      <UploadForm onSubmit={handleUpload} />
    </div>
  );
}
