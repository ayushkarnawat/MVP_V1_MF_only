import { useState, useEffect } from "react";
import { ImportPathChoice } from "./ImportPathChoice";
import { RequestCamsPath } from "./RequestCamsPath";
import { WaitingForCasView } from "./WaitingForCasView";
import { UploadForm } from "./UploadForm";
import { ImportHistoryList } from "./ImportHistoryList";
import {
  hasCasResumeStep2,
  setCasResumeStep2,
  clearCasResumeStep2,
} from "./casResumeState";
import type { CASImportStatusResponse } from "./types";
import { cn } from "@/lib/utils";
import { History, ArrowLeft } from "lucide-react";

export type ImportView = "choice" | "request" | "waiting" | "upload" | "history";

export interface TwoPathImportContainerProps {
  memberId: string;
  defaultTab?: "request" | "upload" | "history" | "choice" | "waiting";
  onUploadSubmit: (file: File, password: string, sourceTab: string) => void;
  onUploadReceived?: (res: CASImportStatusResponse) => void;
}

export function TwoPathImportContainer({
  memberId,
  defaultTab,
  onUploadSubmit,
  onUploadReceived,
}: TwoPathImportContainerProps) {
  const [view, setView] = useState<ImportView>(() => {
    if (defaultTab === "history") return "history";
    if (defaultTab === "upload") return "upload";
    if (defaultTab === "waiting") return "waiting";
    if (defaultTab === "request") return "request";
    return hasCasResumeStep2(memberId) ? "upload" : "choice";
  });
  const [pendingImportId, setPendingImportId] = useState<string | null>(null);

  useEffect(() => {
    if ((!defaultTab || defaultTab === "choice" || defaultTab === "request") && hasCasResumeStep2(memberId)) {
      setView("upload");
    }
  }, [memberId, defaultTab]);

  useEffect(() => {
    const handleFocus = () => {
      if (hasCasResumeStep2(memberId)) {
        setView("upload");
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [memberId]);

  const handleRequestInitiated = (id: string) => {
    setPendingImportId(id);
    setCasResumeStep2(memberId);
    setView("waiting");
  };

  const handleUploadSubmit = (file: File, password: string, sourceTab: string) => {
    clearCasResumeStep2(memberId);
    onUploadSubmit(file, password, sourceTab);
  };

  return (
    <div className="flex flex-col space-y-6 w-full max-w-3xl mx-auto">
      {/* Top Header & Secondary History Switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-0.5 pb-0.5">
        <div className="space-y-0.5" />

        {/* Secondary Import History Action Button */}
        <button
          type="button"
          onClick={() => setView((prev) => (prev === "history" ? "choice" : "history"))}
          aria-label="Import History"
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
            view === "history"
              ? "bg-[var(--color-accent)] text-white shadow-xs"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)] border border-[var(--color-border)]"
          )}
        >
          <History className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Import History</span>
        </button>
      </div>

      {/* Main View Container */}
      <div className="animate-in fade-in duration-200">
        {view === "choice" && (
          <ImportPathChoice
            onSelectRequest={() => setView("request")}
            onSelectUpload={() => setView("upload")}
          />
        )}

        {view === "request" && (
          <RequestCamsPath
            memberId={memberId}
            onBack={() => setView("choice")}
            onRequestInitiated={handleRequestInitiated}
          />
        )}

        {view === "waiting" && (
          <WaitingForCasView
            importId={pendingImportId || "pending-import"}
            memberId={memberId}
            onCancelled={() => {
              clearCasResumeStep2(memberId);
              setPendingImportId(null);
              setView("choice");
            }}
            onUploadSubmit={(file, password) => handleUploadSubmit(file, password, "request")}
            onUploadReceived={(res) => {
              clearCasResumeStep2(memberId);
              onUploadReceived?.(res);
            }}
          />
        )}

        {view === "upload" && (
          <UploadForm
            onBack={() => setView("choice")}
            onSubmit={(file, password) => handleUploadSubmit(file, password, "upload")}
          />
        )}

        {view === "history" && (
          <div className="p-5 sm:p-7 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-4 text-left">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-[var(--color-ink)]">
                  Import History
                </h2>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Past CAS statements processed for this member
                </p>
              </div>

              <button
                type="button"
                onClick={() => setView("choice")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] transition-colors cursor-pointer py-1 min-h-[36px]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to import</span>
              </button>
            </div>
            <ImportHistoryList memberId={memberId} />
          </div>
        )}
      </div>
    </div>
  );
}
