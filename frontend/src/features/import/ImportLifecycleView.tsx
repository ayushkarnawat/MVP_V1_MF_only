import { useState } from "react";
import type { FormEvent } from "react";
import { Lock, AlertTriangle } from "lucide-react";
import { Button } from "../../components/Button";
import { ImportConfirmed } from "./ImportConfirmed";
import { ImportError } from "./ImportError";
import { ParsingIndicator } from "./ParsingIndicator";
import { retryCasImportPassword } from "./api";
import type { CASImportStatusResponse } from "./types";

interface ImportLifecycleViewProps {
  importId: string;
  initialStatus: CASImportStatusResponse;
  onDone?: () => void;
  onReset?: () => void;
}

export function ImportLifecycleView({
  importId,
  initialStatus,
  onDone,
  onReset,
}: ImportLifecycleViewProps) {
  const [statusObj, setStatusObj] = useState<CASImportStatusResponse>(initialStatus);
  const [retryPassword, setRetryPassword] = useState("");
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const handlePasswordRetry = async (e: FormEvent) => {
    e.preventDefault();
    if (!retryPassword) return;
    setIsRetrying(true);
    setRetryError(null);
    try {
      const updated = await retryCasImportPassword(importId, retryPassword);
      setStatusObj(updated);
    } catch (err: unknown) {
      setRetryError(err instanceof Error ? err.message : "Password retry failed. Please try again.");
    } finally {
      setIsRetrying(false);
    }
  };

  const currentStatus = statusObj.status;

  if (currentStatus === "import_successful") {
    return (
      <ImportConfirmed
        result={{
          added: statusObj.new_transactions_count ?? 0,
          skipped: statusObj.duplicate_transactions_count ?? 0,
          import_id: statusObj.import_id,
        }}
        onImportAnother={onDone ?? onReset ?? (() => {})}
      />
    );
  }

  if (currentStatus === "password_required") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: "480px", margin: "0 auto" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-2)" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "color-mix(in srgb, var(--color-accent) 12%, transparent)", color: "var(--color-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Lock style={{ width: "24px", height: "24px" }} />
            </div>
          </div>
          <h2 className="type-h2" style={{ marginTop: "var(--space-2)" }}>Password Required</h2>
          <p className="type-body" style={{ color: "var(--color-text-secondary)" }}>
            {statusObj.error_message || "Incorrect PDF password. CAS passwords are usually your PAN in uppercase."}
          </p>
        </div>

        <form onSubmit={handlePasswordRetry} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <label htmlFor="retry-cas-password" className="type-body-medium">
              Re-enter PDF Password
            </label>
            <input
              id="retry-cas-password"
              type="password"
              placeholder="e.g. ABCDE1234F"
              value={retryPassword}
              onChange={(e) => setRetryPassword(e.target.value)}
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
                fontFamily: "inherit",
              }}
              required
            />
          </div>

          {retryError && (
            <p className="type-caption" style={{ color: "var(--color-negative)", margin: 0 }} role="alert">
              {retryError}
            </p>
          )}

          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
            {onReset && (
              <Button variant="ghost" type="button" onClick={onReset}>
                Cancel
              </Button>
            )}
            <Button variant="primary" type="submit" disabled={isRetrying || !retryPassword.trim()}>
              {isRetrying ? "Unlocking..." : "Retry Unlock →"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  if (currentStatus === "validation_failed") {
    const isSummary = statusObj.error_code === "summary_cas";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", textAlign: "center", maxWidth: "480px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-2)" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "color-mix(in srgb, var(--color-negative) 12%, transparent)", color: "var(--color-negative)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle style={{ width: "24px", height: "24px" }} />
          </div>
        </div>
        <h2 className="type-h2">{isSummary ? "Summary Statement Uploaded" : "Statement Validation Failed"}</h2>
        <p className="type-body" style={{ color: "var(--color-text-secondary)" }}>
          {statusObj.error_message || "This file could not be parsed as a Detailed CAS statement."}
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
          {onReset && (
            <Button variant="secondary" onClick={onReset}>
              Try Another File
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (currentStatus === "import_failed") {
    return (
      <ImportError
        error={{
          code: statusObj.error_code || "import_failed",
          message: statusObj.error_message || "We couldn't complete this import. Please try again.",
        }}
        onRetry={onReset ?? (() => {})}
      />
    );
  }

  // processing / upload_started / retry_pending
  return <ParsingIndicator />;
}
