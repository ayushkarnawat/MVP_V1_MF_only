import { useState } from "react";
import { RequestCamsPath } from "./RequestCamsPath";
import { WaitingForCasView } from "./WaitingForCasView";
import { UploadForm } from "./UploadForm";
import { ImportHistoryList } from "./ImportHistoryList";
import type { CASImportStatusResponse } from "./types";
import { cn } from "@/lib/utils";
import { History } from "lucide-react";

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
    <div className="flex flex-col space-y-5 w-full max-w-xl mx-auto">
      {/* Top Header & Secondary History Switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-0.5">
        <div className="space-y-0.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)] block">
            CAS Import Flow
          </span>
        </div>

        {/* Secondary Import History Action Tab */}
        <button
          role="tab"
          aria-selected={activeTab === "history"}
          onClick={() => setActiveTab("history")}
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
            activeTab === "history"
              ? "bg-[var(--color-ink)] text-[var(--color-bg)] shadow-xs"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)] border border-[var(--color-border)]"
          )}
          aria-label="Import History"
        >
          <History className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Import History</span>
        </button>
      </div>

      {/* Primary Two-Step Segmented Navigation */}
      <div
        role="tablist"
        aria-label="Import Options"
        className="p-1 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex flex-col sm:flex-row items-stretch gap-1"
      >
        {/* Step 1: Request from CAMS Tab */}
        <button
          role="tab"
          aria-selected={activeTab === "request"}
          onClick={() => setActiveTab("request")}
          type="button"
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
            activeTab === "request"
              ? "bg-[var(--color-bg)] text-[var(--color-ink)] shadow-xs"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)]/50"
          )}
          aria-label="Request from CAMS (Recommended)"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0",
                activeTab === "request"
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-border)] text-[var(--color-text-secondary)]"
              )}
            >
              1
            </span>
            <span className="truncate">Step 1 — Request from CAMS</span>
          </div>
        </button>

        {/* Step 2: Upload Existing Statement Tab */}
        <button
          role="tab"
          aria-selected={activeTab === "upload"}
          onClick={() => setActiveTab("upload")}
          type="button"
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
            activeTab === "upload"
              ? "bg-[var(--color-bg)] text-[var(--color-ink)] shadow-xs"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)]/50"
          )}
          aria-label="Upload Existing Statement"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0",
                activeTab === "upload"
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-border)] text-[var(--color-text-secondary)]"
              )}
            >
              2
            </span>
            <span className="truncate">Step 2 — Upload Existing Statement</span>
          </div>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="animate-in fade-in duration-200">
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
                onRequestInitiated={(id) => setPendingImportId(id)}
              />
            )}
          </div>
        )}

        {activeTab === "upload" && (
          <UploadForm
            onSubmit={(file, password) => onUploadSubmit(file, password, "upload")}
          />
        )}

        {activeTab === "history" && (
          <div className="p-5 sm:p-7 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-[var(--color-ink)]">
                  Import History
                </h2>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Past CAS statements processed for this member
                </p>
              </div>
            </div>
            <ImportHistoryList memberId={memberId} />
          </div>
        )}
      </div>
    </div>
  );
}
