import { useState } from "react";
import { Button } from "../../components/Button";
import { UploadForm } from "./UploadForm";
import { cancelImportRequest, uploadCasImport } from "./api";
import type { CASImportStatusResponse } from "./types";

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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", maxWidth: "560px", margin: "0 auto" }}>
      <div
        style={{
          background: "rgba(59, 130, 246, 0.08)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="type-body-medium" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            ⏳ Waiting for CAMS Email Delivery
          </span>
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isCancelling}>
            {isCancelling ? "Cancelling..." : "Cancel Request"}
          </Button>
        </div>

        <p className="type-caption" style={{ color: "var(--color-text-secondary)", margin: 0 }}>
          CAMS typically sends the statement PDF within 5 to 10 minutes. When it arrives in your inbox, download the PDF and drop it below to finish importing.
        </p>
      </div>

      {error && (
        <p className="type-caption" style={{ color: "var(--color-negative)", margin: 0 }} role="alert">
          {error}
        </p>
      )}

      {/* Immediate dropzone to ingest PDF once received */}
      <UploadForm onSubmit={handleUpload} />
    </div>
  );
}
