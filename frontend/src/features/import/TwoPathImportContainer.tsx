import { useState, useEffect } from "react";
import { RequestCamsPath } from "./RequestCamsPath";
import { WaitingForCasView } from "./WaitingForCasView";
import { UploadForm } from "./UploadForm";
import { ImportHistoryList } from "./ImportHistoryList";
import { MobileRequestCamsView } from "../../mobile/features/import/MobileRequestCamsView";
import {
  hasCasResumeStep2,
  setCasResumeStep2,
  clearCasResumeStep2,
} from "./casResumeState";
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
  const [activeTab, setActiveTab] = useState<"request" | "upload" | "history">(() => {
    if (defaultTab !== "request") return defaultTab;
    return hasCasResumeStep2(memberId) ? "upload" : "request";
  });
  const [pendingImportId, setPendingImportId] = useState<string | null>(null);

  useEffect(() => {
    if (defaultTab === "request" && hasCasResumeStep2(memberId)) {
      setActiveTab("upload");
    }
  }, [memberId, defaultTab]);

  useEffect(() => {
    const handleFocus = () => {
      if (hasCasResumeStep2(memberId)) {
        setActiveTab("upload");
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [memberId]);

  const handleRequestInitiated = (id: string) => {
    setPendingImportId(id);
    setCasResumeStep2(memberId);
    setActiveTab("upload");
  };

  const handleStep1Click = () => {
    clearCasResumeStep2(memberId);
    setActiveTab("request");
  };

  const handleUploadSubmit = (file: File, password: string, sourceTab: string) => {
    clearCasResumeStep2(memberId);
    onUploadSubmit(file, password, sourceTab);
  };

  return (
    <div className="flex flex-col space-y-6 w-full max-w-xl mx-auto">
      {/* Top Header & Secondary History Switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-0.5 pb-0.5">
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
        className="p-1 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex flex-row items-stretch gap-1 sm:gap-1.5"
      >
        {/* Step 1: Request from CAMS Tab */}
        <button
          role="tab"
          aria-selected={activeTab === "request"}
          onClick={handleStep1Click}
          type="button"
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 px-2.5 sm:px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer min-h-[38px] sm:min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
            activeTab === "request"
              ? "bg-[var(--color-bg)] text-[var(--color-ink)] shadow-xs border border-[var(--color-border)]/60"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)]/50"
          )}
          aria-label="Request from CAMS (Recommended)"
        >
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span
              className={cn(
                "h-4 w-4 sm:h-5 sm:w-5 rounded-full text-[9px] sm:text-[10px] font-bold flex items-center justify-center flex-shrink-0 transition-colors",
                activeTab === "request"
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-border)] text-[var(--color-text-secondary)]"
              )}
            >
              1
            </span>
            <span className="truncate hidden sm:inline">Step 1 — Request from CAMS</span>
            <span className="truncate sm:hidden">Step 1 · CAMS</span>
          </div>
        </button>

        {/* Step 2: Upload Existing Statement Tab */}
        <button
          role="tab"
          aria-selected={activeTab === "upload"}
          onClick={() => setActiveTab("upload")}
          type="button"
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 px-2.5 sm:px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer min-h-[38px] sm:min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
            activeTab === "upload"
              ? "bg-[var(--color-bg)] text-[var(--color-ink)] shadow-xs border border-[var(--color-border)]/60"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-bg)]/50"
          )}
          aria-label="Upload Existing Statement"
        >
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span
              className={cn(
                "h-4 w-4 sm:h-5 sm:w-5 rounded-full text-[9px] sm:text-[10px] font-bold flex items-center justify-center flex-shrink-0 transition-colors",
                activeTab === "upload"
                  ? "bg-[var(--color-accent)] text-white"
                  : "bg-[var(--color-border)] text-[var(--color-text-secondary)]"
              )}
            >
              2
            </span>
            <span className="truncate hidden sm:inline">Step 2 — Upload Existing Statement</span>
            <span className="truncate sm:hidden">Step 2 · Upload</span>
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
                onCancelled={() => {
                  clearCasResumeStep2(memberId);
                  setPendingImportId(null);
                }}
                onUploadSubmit={(file, password) => handleUploadSubmit(file, password, "request")}
                onUploadReceived={(res) => {
                  clearCasResumeStep2(memberId);
                  onUploadReceived?.(res);
                }}
              />
            ) : (
              <>
                {/* Desktop View: Restored Web Layout with Refined Spacing */}
                <div className="hidden sm:block">
                  <RequestCamsPath
                    memberId={memberId}
                    onRequestInitiated={handleRequestInitiated}
                  />
                </div>

                {/* Mobile View: Compact Apple-Inspired Layout */}
                <div className="block sm:hidden">
                  <MobileRequestCamsView
                    memberId={memberId}
                    pendingImportId={pendingImportId}
                    onRequestInitiated={handleRequestInitiated}
                    onCancelled={() => {
                      clearCasResumeStep2(memberId);
                      setPendingImportId(null);
                    }}
                    onUploadSubmit={(file, password) => handleUploadSubmit(file, password, "request")}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "upload" && (
          <UploadForm
            onSubmit={(file, password) => handleUploadSubmit(file, password, "upload")}
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
