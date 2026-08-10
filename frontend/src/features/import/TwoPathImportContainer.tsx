import { useState } from "react";
import { RequestCamsPath } from "./RequestCamsPath";
import { WaitingForCasView } from "./WaitingForCasView";
import { UploadForm } from "./UploadForm";
import { ImportHistoryList } from "./ImportHistoryList";
import type { CASImportStatusResponse } from "./types";

export interface TwoPathImportContainerProps {
  memberId: string;
  defaultTab?: "request" | "upload" | "history";
  onUploadSubmit: (file: File, password: string, sourceTab: string) => void;
  onUploadReceived?: (res: CASImportStatusResponse) => void;
}

export function TwoPathImportContainer({
  memberId,
  defaultTab = "request",
  onUploadSubmit,
  onUploadReceived,
}: TwoPathImportContainerProps) {
  const [activeTab, setActiveTab] = useState<"request" | "upload" | "history">(defaultTab);
  const [pendingImportId, setPendingImportId] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {/* Accessible Tab Navigation */}
      <div
        role="tablist"
        aria-label="Import Options"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--color-border)",
          gap: "var(--space-2)",
          marginBottom: "var(--space-2)",
        }}
      >
        <button
          role="tab"
          aria-selected={activeTab === "request"}
          onClick={() => setActiveTab("request")}
          style={{
            padding: "var(--space-3) var(--space-4)",
            background: "none",
            border: "none",
            borderBottom: activeTab === "request" ? "2px solid var(--color-primary)" : "2px solid transparent",
            color: activeTab === "request" ? "var(--color-primary)" : "var(--color-text-secondary)",
            fontWeight: activeTab === "request" ? 600 : 400,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Request from CAMS (Recommended)
        </button>

        <button
          role="tab"
          aria-selected={activeTab === "upload"}
          onClick={() => setActiveTab("upload")}
          style={{
            padding: "var(--space-3) var(--space-4)",
            background: "none",
            border: "none",
            borderBottom: activeTab === "upload" ? "2px solid var(--color-primary)" : "2px solid transparent",
            color: activeTab === "upload" ? "var(--color-primary)" : "var(--color-text-secondary)",
            fontWeight: activeTab === "upload" ? 600 : 400,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Upload Existing Statement
        </button>

        <button
          role="tab"
          aria-selected={activeTab === "history"}
          onClick={() => setActiveTab("history")}
          style={{
            padding: "var(--space-3) var(--space-4)",
            background: "none",
            border: "none",
            borderBottom: activeTab === "history" ? "2px solid var(--color-primary)" : "2px solid transparent",
            color: activeTab === "history" ? "var(--color-primary)" : "var(--color-text-secondary)",
            fontWeight: activeTab === "history" ? 600 : 400,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Import History
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "request" && (
        <div>
          {pendingImportId ? (
            <WaitingForCasView
              importId={pendingImportId}
              memberId={memberId}
              onCancelled={() => setPendingImportId(null)}
              onUploadReceived={(res) => onUploadReceived?.(res)}
            />
          ) : (
            <RequestCamsPath
              memberId={memberId}
              onRequestInitiated={(importId) => setPendingImportId(importId)}
            />
          )}
        </div>
      )}

      {activeTab === "upload" && (
        <div>
          <UploadForm
            onSubmit={(file, password) => onUploadSubmit(file, password, "upload")}
          />
        </div>
      )}

      {activeTab === "history" && (
        <div>
          <h3 className="type-h3" style={{ marginBottom: "var(--space-3)" }}>
            Past Import Statements
          </h3>
          <ImportHistoryList memberId={memberId} />
        </div>
      )}
    </div>
  );
}
