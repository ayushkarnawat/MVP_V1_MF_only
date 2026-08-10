import { useEffect, useState } from "react";
import { Badge } from "../../components/Badge";
import { getMemberImportHistory } from "./api";
import type { CASImportStatusResponse } from "./types";

interface ImportHistoryListProps {
  memberId: string;
}

export function ImportHistoryList({ memberId }: ImportHistoryListProps) {
  const [history, setHistory] = useState<CASImportStatusResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    getMemberImportHistory(memberId)
      .then((items) => {
        if (isMounted) {
          setHistory(items);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load import history.");
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [memberId]);

  if (isLoading) {
    return <div className="type-caption" style={{ color: "var(--color-text-muted)" }}>Loading import history...</div>;
  }

  if (error) {
    return <div className="type-caption" style={{ color: "var(--color-negative)" }}>{error}</div>;
  }

  if (history.length === 0) {
    return (
      <div style={{ padding: "var(--space-4)", textAlign: "center", color: "var(--color-text-secondary)" }}>
        No previous imports found for this member.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {history.map((item) => {
        const isSuccess = item.status === "import_successful";
        const dateRange =
          item.statement_from_date && item.statement_to_date
            ? `${item.statement_from_date} to ${item.statement_to_date}`
            : `Uploaded ${new Date(item.uploaded_at).toLocaleDateString()}`;

        return (
          <div
            key={item.import_id}
            style={{
              padding: "var(--space-3) var(--space-4)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-3)",
            }}
          >
            <div>
              <div className="type-body-medium" style={{ color: "var(--color-text-primary)" }}>
                {dateRange}
              </div>
              <div className="type-caption" style={{ color: "var(--color-text-muted)" }}>
                {item.source_cas_type ? item.source_cas_type.toUpperCase() : "CAS"} Statement • {new Date(item.uploaded_at).toLocaleDateString()}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              {isSuccess ? (
                <div style={{ textAlign: "right" }}>
                  <Badge variant="positive">Imported</Badge>
                  <div className="type-caption" style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>
                    {item.new_transactions_count ?? 0} new transactions
                    {item.duplicate_transactions_count ? `, ${item.duplicate_transactions_count} duplicates` : ""}
                  </div>
                </div>
              ) : (
                <Badge variant={item.status === "password_required" ? "warning" : "neutral"}>
                  {item.status.replace("_", " ")}
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
