import { useState, useEffect } from "react";
import { ImportPathChoice } from "./ImportPathChoice";
import { RequestCamsPath } from "./RequestCamsPath";
import { UploadForm } from "./UploadForm";
import { ImportHistoryList } from "./ImportHistoryList";
import {
  setCasResumeStep2,
  clearCasResumeStep2,
} from "./casResumeState";
import { usePendingCamsRequest } from "./usePendingCamsRequest";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { History, ArrowLeft } from "lucide-react";
import type { UploadSurface } from "@/features/legal/panDisclaimerStore";
import { useCamsChecklist } from "./checklist/useCamsChecklist";
import { CamsChecklistHost, CamsChecklistHostedContext } from "./checklist/CamsChecklistHost";
import "./checklist/checklist-tokens.css";

export type ImportView = "choice" | "request" | "upload" | "history";

export interface TwoPathImportContainerProps {
  error?: string | null;
  errorCode?: string | null;
  requestCasVersion?: number;
  memberId: string;
  memberName?: string;
  defaultTab?: "request" | "upload" | "history" | "choice" | "waiting";
  onUploadSubmit: (file: File, password: string, sourceTab: string) => void;
  /** Onboarding passes "onboarding_upload"; defaults to the in-app import surface. */
  surface?: UploadSurface;
}

export function TwoPathImportContainer(props: TwoPathImportContainerProps) {
  return <MemberImportContainer key={props.memberId} {...props} />;
}

function MemberImportContainer({
  error, errorCode, requestCasVersion = 0,
  memberId,
  defaultTab,
  onUploadSubmit,
  surface,
}: TwoPathImportContainerProps) {
  const checklist = useCamsChecklist(memberId);
  const pendingReq = usePendingCamsRequest(memberId);
  const [view, setView] = useState<ImportView | null>(() => {
    if (defaultTab === "history") return "history";
    if (defaultTab === "upload") return "upload";
    if (defaultTab === "waiting") return "upload";
    if (defaultTab === "request") return "request";
    if (defaultTab === "choice") return "choice";
    return null;
  });

  const effectiveView: ImportView | "loading" =
    view ??
    (pendingReq.status === "loading"
      ? "loading"
      : pendingReq.status === "waiting"
        ? "upload"
        : "choice");

  useEffect(() => {
    if (requestCasVersion > 0) {
      setView("request");
    }
  }, [requestCasVersion]);

  const showView = (next: ImportView) => {
    // "Back to import" from Import History always shows the choice screen, even when a request is open (owner decision, 26 Nov 2026).
    setView(next);
  };

  const handleRequestInitiated = () => {
    setCasResumeStep2(memberId);
    setView("upload");
    void pendingReq.refresh();
  };

  const handleUploadSubmit = (file: File, password: string, sourceTab: string) => {
    checklist.startOver();
    clearCasResumeStep2(memberId);
    onUploadSubmit(file, password, sourceTab);
  };

  return (
    <CamsChecklistHostedContext.Provider value={true}>
    <div
      className={cn(
        "flex flex-col w-full max-w-3xl mx-auto box-border flex-1",
        effectiveView === "choice" || effectiveView === "upload"
          ? "min-h-[calc(100dvh-2.5rem)] sm:min-h-[540px] justify-between sm:justify-center space-y-2 sm:space-y-6 my-auto"
          : "space-y-6"
      )}
    >
      {/* Top Header & Secondary History Switcher */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-0.5 pb-0.5 flex-shrink-0">
        <div className="space-y-0.5" />

        {/* Secondary Import History Action Button */}
        <button
          type="button"
          data-clickable="" data-effect="switch"
          onClick={() => showView(effectiveView === "history" ? "choice" : "history")}
          aria-label="Import History"
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
            effectiveView === "history"
              ? "bg-[var(--color-accent)] text-white shadow-xs"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)] border border-[var(--color-border)]"
          )}
        >
          <History className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Import History</span>
        </button>
      </div>

      {/* Main View Container */}
      <CamsChecklistHost memberId={memberId} />
      <div
        className={cn(
          "animate-in fade-in duration-200 w-full",
          (effectiveView === "choice" || effectiveView === "upload") && "flex-1 flex flex-col justify-center items-center my-auto"
        )}
      >
        {effectiveView === "loading" && (
          <Skeleton className="h-48 w-full rounded-2xl" aria-busy="true" />
        )}

        {effectiveView === "choice" && (
          <ImportPathChoice
            onSelectRequest={() => {
              // The floating checklist opens on THIS click, not on the Request button: Chrome lets one click
              // do only one of "open a new tab" and "open a floating window", and the Request button must open CAMS.
              checklist.open();
              showView("request");
            }}
            onSelectUpload={() => showView("upload")}
          />
        )}

        {effectiveView === "request" && (
          <RequestCamsPath
            key={memberId}
            memberId={memberId}
            onBack={() => {
              checklist.close();
              showView("choice");
            }}
            onRequestInitiated={handleRequestInitiated}
          />
        )}

        {effectiveView === "upload" && (
          <UploadForm
            passwordError={errorCode === "wrong_password" ? error ?? undefined : undefined}
            serverFileError={errorCode && ["file_too_large", "unsupported_file", "invalid_file"].includes(errorCode) ? error ?? undefined : undefined}
            surface={surface}
            onBack={() => showView("choice")}
            onSubmit={(file, password) => handleUploadSubmit(file, password, "upload")}
          />
        )}

        {effectiveView === "history" && (
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
                data-clickable="" data-effect="navigate"
                onClick={() => showView("choice")}
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
    </CamsChecklistHostedContext.Provider>
  );
}
