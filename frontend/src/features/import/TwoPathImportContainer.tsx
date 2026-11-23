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
  getChecklistState,
} from "./casResumeState";
import { cn } from "@/lib/utils";
import { History, ArrowLeft } from "lucide-react";
import type { UploadSurface } from "@/features/legal/panDisclaimerStore";
import { useCamsChecklist } from "./checklist/useCamsChecklist";
import { getChecklistStore } from "./checklist/checklistStore";
import { CamsChecklistHost, CamsChecklistHostedContext } from "./checklist/CamsChecklistHost";
import { checklistCopy } from "./checklist/checklistCopy";

export type ImportView = "choice" | "request" | "waiting" | "upload" | "history";

export interface TwoPathImportContainerProps {
  error?: string | null;
  errorCode?: string | null;
  requestCasVersion?: number;
  memberId: string;
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
  const checklistStore = getChecklistStore(memberId);
  const [view, setView] = useState<ImportView>(() => {
    if (defaultTab === "history") return "history";
    if (defaultTab === "upload") return "upload";
    if (defaultTab === "waiting") return "waiting";
    if (defaultTab === "request") return "request";
    if (getChecklistState(memberId)) return "request";
    return hasCasResumeStep2(memberId) ? "upload" : "choice";
  });
  const [pendingImportId, setPendingImportId] = useState<string | null>(null);

  useEffect(() => {
    const current = checklistStore.getSnapshot();
    const checklistOpen = current.mode !== "closed" && current.step !== "ready";
    if (!checklistOpen && !checklistStore.isOpening() && !getChecklistState(memberId) && (!defaultTab || defaultTab === "choice" || defaultTab === "request") && hasCasResumeStep2(memberId)) {
      setView("upload");
    }
  }, [memberId, defaultTab, checklistStore]);

  useEffect(() => {
    const handleFocus = () => {
      const current = checklistStore.getSnapshot();
      if (checklistStore.isOpening() || (current.mode !== "closed" && current.step !== "ready")) return;
      if (hasCasResumeStep2(memberId)) {
        setView("upload");
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [memberId, checklistStore]);

  useEffect(() => {
    if (checklist.finishedFromChecklist) setView("upload");
  }, [checklist.finishedFromChecklist]);

  useEffect(() => {
    if (requestCasVersion > 0) {
      checklistStore.clearFinishedFromChecklist();
      setView("request");
    }
  }, [requestCasVersion, checklistStore]);

  const showView = (next: ImportView) => {
    if (next !== "upload") checklistStore.clearFinishedFromChecklist();
    setView(next);
  };

  const handleRequestInitiated = (id: string) => {
    setPendingImportId(id);
    setCasResumeStep2(memberId);
    setView("waiting");
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
        view === "choice" || view === "upload"
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
          onClick={() => showView(view === "history" ? "choice" : "history")}
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
      <CamsChecklistHost memberId={memberId} />
      <div
        className={cn(
          "animate-in fade-in duration-200 w-full",
          (view === "choice" || view === "upload") && "flex-1 flex flex-col justify-center items-center my-auto"
        )}
      >
        {view === "choice" && (
          <ImportPathChoice
            onSelectRequest={() => showView("request")}
            onSelectUpload={() => showView("upload")}
          />
        )}

        {view === "request" && (
          <RequestCamsPath
            key={memberId}
            memberId={memberId}
            onBack={() => showView("choice")}
            onRequestInitiated={handleRequestInitiated}
          />
        )}

        {view === "waiting" && (
          <WaitingForCasView
            passwordError={errorCode === "wrong_password" ? error ?? undefined : undefined}
            serverFileError={errorCode && ["file_too_large", "unsupported_file", "invalid_file"].includes(errorCode) ? error ?? undefined : undefined}
            importId={pendingImportId || "pending-import"}
            onCancelled={() => {
              checklist.startOver();
              clearCasResumeStep2(memberId);
              setPendingImportId(null);
              setView("choice");
            }}
            onUploadSubmit={(file, password) => handleUploadSubmit(file, password, "request")}
            surface={surface}
          />
        )}

        {view === "upload" && (
          <>
          {checklist.finishedFromChecklist && (
            <p role="status" className="hidden md:block mb-3 rounded-lg border border-[var(--color-positive)] bg-[color-mix(in_srgb,var(--color-positive)_8%,transparent)] p-3 text-[var(--color-ink)]">{checklistCopy.uploadBanner}</p>
          )}
          <UploadForm
            passwordError={errorCode === "wrong_password" ? error ?? undefined : undefined}
            serverFileError={errorCode && ["file_too_large", "unsupported_file", "invalid_file"].includes(errorCode) ? error ?? undefined : undefined}
            surface={surface}
            onBack={() => showView("choice")}
            onSubmit={(file, password) => handleUploadSubmit(file, password, "upload")}
          />
          </>
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
