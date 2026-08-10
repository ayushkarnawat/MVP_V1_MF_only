import { useState } from "react";
import { Button } from "../../components/Button";
import { requestCamsStatement } from "./api";

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
      window.open(result.cams_url, "_blank");
      onRequestInitiated(result.import_id, result.expires_at);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to initiate CAMS request.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", maxWidth: "560px", margin: "0 auto" }}>
      <div>
        <h2 className="type-h2" style={{ margin: "0 0 var(--space-2) 0" }}>
          Request CAS Statement from CAMS
        </h2>
        <p className="type-body" style={{ color: "var(--color-text-secondary)", margin: 0 }}>
          CAMS generates a free Consolidated Account Statement across all your mutual funds and emails it directly to your registered email address.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "var(--color-primary-subtle, rgba(59, 130, 246, 0.1))",
              color: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            1
          </div>
          <div>
            <div className="type-body-medium">Open CAMS Mailback Portal</div>
            <div className="type-caption" style={{ color: "var(--color-text-muted)" }}>
              We'll open CAMS with prefilled settings: <strong>Detailed statement</strong>, <strong>10-year duration</strong>, and <strong>with zero folios</strong>.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "var(--color-primary-subtle, rgba(59, 130, 246, 0.1))",
              color: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            2
          </div>
          <div>
            <div className="type-body-medium">Enter your Email on CAMS</div>
            <div className="type-caption" style={{ color: "var(--color-text-muted)" }}>
              Provide the email address registered with your mutual fund folios.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "var(--color-primary-subtle, rgba(59, 130, 246, 0.1))",
              color: "var(--color-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            3
          </div>
          <div>
            <div className="type-body-medium">Check your Inbox</div>
            <div className="type-caption" style={{ color: "var(--color-text-muted)" }}>
              CAMS usually emails the statement PDF within 5 to 10 minutes.
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="type-caption" style={{ color: "var(--color-negative)", margin: 0 }} role="alert">
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <Button variant="primary" size="lg" onClick={handleRequest} disabled={isLoading}>
          {isLoading ? "Opening CAMS Portal..." : "Request Statement on CAMS →"}
        </Button>
        <span className="type-caption" style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
          Opens in a new browser tab. We never collect or store your credentials.
        </span>
      </div>
    </div>
  );
}
