import { useState, useEffect, useRef } from "react";
import { listHouseholdMembers } from "@/features/auth/api";
import { invalidateApiCache } from "@/lib/apiClient";
import {
  hasCasResumeStep2,
  setCasResumeStep2,
  clearCasResumeStep2,
} from "@/features/import/casResumeState";
import type { HouseholdMember } from "@/features/auth/types";
import { ImportPathChoice } from "@/features/import/ImportPathChoice";
import { WaitingForCasView } from "@/features/import/WaitingForCasView";
import { ParsingIndicator } from "@/features/import/ParsingIndicator";
import { useImportOrchestration } from "@/features/import/useImportOrchestration";
import { MobileRequestCamsView } from "./MobileRequestCamsView";
import { ImportError } from "@/features/import/ImportError";
import { MobileUploadForm } from "./MobileUploadForm";
import { MobileReviewView } from "./MobileReviewView";
import { MobileImportHistory } from "./MobileImportHistory";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  History,
  User,
  CheckCircle2,
  LayoutDashboard,
  UploadCloud,
  ArrowLeft,
  AlertTriangle,
  X,
} from "lucide-react";

export interface MobileImportViewProps {
  onNavigateDashboard?: (notice?: { text: string; details?: string[] }) => void;
  defaultTab?: "request" | "upload" | "history" | "choice" | "waiting";
  defaultMemberId?: string;
}

export type MobileImportViewMode = "choice" | "request" | "waiting" | "upload" | "history";

export function MobileImportView({
  onNavigateDashboard,
  defaultTab,
  defaultMemberId,
}: MobileImportViewProps) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(defaultMemberId ?? null);
  const [view, setView] = useState<MobileImportViewMode>(() => {
    if (defaultTab === "history") return "history";
    if (defaultTab === "upload") return "upload";
    if (defaultTab === "waiting") return "waiting";
    if (defaultTab === "request") return "request";
    if (defaultMemberId && hasCasResumeStep2(defaultMemberId)) return "upload";
    return "choice";
  });
  const [pendingImportId, setPendingImportId] = useState<string | null>(null);

  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

  const {
    flow, uploadMessage, edits, nameAnswers, confirming, reviewPeople, setCancelOpen,
    cancelImport, upload, runConfirm, dialogs: orchestrationDialogs,
  } = useImportOrchestration(selectedMemberId ?? "");
  const { stage, preview, confirmResult } = flow;
  const error = flow.error;

  const duplicateClosed = useRef(false);
  useEffect(() => {
    if (stage !== "confirmed") duplicateClosed.current = false;
    if (stage === "confirmed" && flow.errorCode === "already_imported" && !duplicateClosed.current) {
      duplicateClosed.current = true;
      onNavigateDashboard?.({ text: "This statement was already imported" });
    }
  }, [stage, flow.errorCode, onNavigateDashboard]);

  /* Load household members */
  useEffect(() => {
    listHouseholdMembers()
      .then((data) => {
        if (data && data.length > 0) {
          setMembers(data);
          setSelectedMemberId((prev) => {
            const wanted = prev ?? defaultMemberId;
            const found = data.find((m) => m.id === wanted);
            return found ? found.id : wanted ? wanted : data[0].id;
          });
        }
      })
      .catch(() => {});
  }, [defaultMemberId]);

  useEffect(() => {
    if (selectedMemberId && (!defaultTab || defaultTab === "choice" || defaultTab === "request") && hasCasResumeStep2(selectedMemberId)) {
      setView("upload");
    }
  }, [selectedMemberId, defaultTab]);

  useEffect(() => {
    const handleFocus = () => {
      if (selectedMemberId && hasCasResumeStep2(selectedMemberId)) {
        setView("upload");
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [selectedMemberId]);

  const reloadMembers = async (): Promise<HouseholdMember[]> => {
    invalidateApiCache();
    try {
      const fresh = await listHouseholdMembers();
      setMembers(fresh);
      return fresh;
    } catch {
      // Keep the list we have.
      return members;
    }
  };

  const resetFlow = async () => {
    setDismissedWarnings(new Set());
    await cancelImport();
  };

  const handleUpload = async (file: File, password: string) => {
    if (!selectedMemberId) return;
    // Whatever sends the user back to the upload screen, they land on the form they just used.
    if (view !== "waiting") setView("upload");
    await upload(file, password);
  };

  const selectedMemberName =
    members.find((m) => m.id === selectedMemberId)?.name ?? "Self";

  // Dialogs shared by every screen.
  const flowDialogs = <>{orchestrationDialogs}</>;

  const activeMemberId = selectedMemberId || members[0]?.id || null;
  const renderStage = () => {
  /* 1. Parsing Indicator Screen */
  if (stage === "parsing") {
    return (
      <div className="w-full flex-1 flex flex-col justify-center items-center min-h-[calc(100dvh-7rem)] sm:min-h-[500px] my-auto">
        {flowDialogs}
        <ParsingIndicator />
      </div>
    );
  }

  /* 2. Review Screen */
  if (stage === "review" && preview) {
    return (
      <div className="w-full max-w-md mx-auto">
        {flowDialogs}
        <MobileReviewView
          preview={preview}
          people={reviewPeople}
          edits={edits}
          nameAnswers={nameAnswers}
          confirming={confirming}
          onConfirmImports={(people, moved) => void runConfirm(people, moved)}
          onCancel={() => setCancelOpen(true)}
        />
      </div>
    );
  }

  /* 2b. Name notices and the people popup sit over a blank screen while the user answers them. */
  if (stage === "notices" || stage === "people") {
    return <div className="w-full min-h-[50vh]">{flowDialogs}</div>;
  }

  /* 3. Confirmed Success Screen */
  if (stage === "confirmed" && confirmResult) {
    const addedText = `${confirmResult.added} new transaction${confirmResult.added === 1 ? "" : "s"} added`;
    const skippedText =
      confirmResult.skipped > 0
        ? `, ${confirmResult.skipped} duplicate${confirmResult.skipped === 1 ? "" : "s"} skipped`
        : "";

    return (
      <div className="w-full min-w-0 max-w-md mx-auto space-y-4 pt-2 sm:pt-3 text-left box-border animate-in fade-in duration-200 min-h-[calc(100dvh-7rem)] sm:min-h-[500px] flex flex-col justify-center items-center my-auto">
        <div className="w-full p-5 sm:p-6 rounded-2xl bg-white/80 dark:bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-4 text-center box-border my-auto">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-[#22C55E]/15 text-[#22C55E] flex items-center justify-center shadow-2xs">
            <CheckCircle2 className="h-6 w-6 stroke-[2.2]" />
          </div>

          <div className="space-y-1.5 max-w-xs mx-auto">
            <h3 className="font-display font-bold text-lg sm:text-xl text-[var(--color-ink)] tracking-tight">
              Import Complete
            </h3>
            <p className="text-xs text-[#5C5C5C] dark:text-[#A3A3A3] leading-relaxed">
              <strong className="text-[var(--color-ink)] font-semibold">{addedText}</strong>
              {skippedText}. Your portfolio and holdings have been updated.
            </p>
          </div>

          {confirmResult.warnings
            .filter((warning) => !dismissedWarnings.has(warning))
            .map((warning) => (
              <div
                key={warning}
                role="status"
                className="w-full rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-3 text-left flex items-start gap-2"
              >
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]"
                />
                <p className="m-0 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  {warning}
                </p>
                <button
                  type="button"
                  aria-label="Dismiss warning"
                  onClick={() =>
                    setDismissedWarnings((current) => new Set(current).add(warning))
                  }
                  className="ml-auto shrink-0 rounded-lg p-1 text-[var(--color-text-secondary)]"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            ))}

          <div className="w-full space-y-2 pt-1">
            {onNavigateDashboard && (
              <Button
                onClick={() => {
                  clearCasResumeStep2(selectedMemberId);
                  onNavigateDashboard();
                }}
                className="w-full h-13 sm:h-13.5 rounded-full bg-[#22C55E] hover:bg-[#22C55E]/90 dark:bg-[#22C55E] dark:hover:bg-[#22C55E]/90 text-white font-bold text-xs sm:text-sm shadow-lg shadow-[#22C55E]/25 gap-2 cursor-pointer active:scale-[0.98] transition-all min-h-[48px] border-none"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Go to Dashboard</span>
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => void resetFlow()}
              className="w-full h-13 sm:h-13.5 rounded-full border border-[var(--color-border)] bg-transparent hover:bg-black/5 dark:hover:bg-white/5 text-[var(--color-ink)] text-xs sm:text-sm font-bold gap-2 cursor-pointer active:scale-[0.98] transition-all min-h-[48px]"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Import Another CAS</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* 4. Error Screen */
  if (stage === "error") {
    return <ImportError code={flow.errorCode ?? "parse_failed"} message={error ?? "Import failed"}
      onUploadAnother={() => void resetFlow()}
      onRequestCas={() => void resetFlow().then(() => setView("request"))} />;
  }


  return (
    <div
      className={cn(
        "flex flex-col text-left box-border w-full",
        view === "choice"
          ? "flex-1 min-h-[calc(100dvh-7rem)] sm:min-h-0 justify-between sm:justify-start space-y-2 sm:space-y-4 my-auto"
          : "space-y-3.5 sm:space-y-4"
      )}
    >
      {flowDialogs}
      {/* Top Header with Member Selector & Subtle Secondary History Toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap px-0.5 flex-shrink-0">
        {/* Member Selector / Indicator */}
        {members.length > 1 ? (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 max-w-full">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelectedMemberId(m.id);
                  setPendingImportId(null);
                }}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 flex-shrink-0 min-h-[32px]",
                  (selectedMemberId ?? members[0]?.id) === m.id
                    ? "bg-[#22C55E] text-white shadow-2xs"
                    : "bg-white/80 dark:bg-[var(--color-surface)] text-[#5C5C5C] dark:text-[#A3A3A3] border border-[var(--color-border)] hover:text-[var(--color-ink)]"
                )}
              >
                <User className="h-3 w-3" />
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-medium text-[#5C5C5C] dark:text-[#A3A3A3] shadow-2xs">
            <User className="h-3.5 w-3.5 text-[#22C55E]" />
            <span>
              Importing for{" "}
              <strong className="text-[var(--color-ink)] font-semibold">
                {selectedMemberName}
              </strong>
            </span>
          </div>
        )}

        {/* Subtle Secondary Import History Action Button */}
        <button
          type="button"
          onClick={() => setView((prev) => (prev === "history" ? "choice" : "history"))}
          aria-label="Import History"
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-150 cursor-pointer min-h-[32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] ml-auto",
            view === "history"
              ? "bg-[#22C55E] text-white shadow-xs"
              : "text-[#5C5C5C] dark:text-[#A3A3A3] hover:text-[var(--color-ink)] hover:bg-black/5 dark:hover:bg-white/5 border border-[var(--color-border)] bg-white/80 dark:bg-[var(--color-surface)] shadow-2xs"
          )}
        >
          <History className="h-3.5 w-3.5 flex-shrink-0" />
          <span>History</span>
        </button>
      </div>

      {/* Main View Display */}
      <div
        className={cn(
          "animate-in fade-in duration-150 w-full",
          (view === "choice" || view === "upload") && "flex-1 flex flex-col justify-center items-center my-auto"
        )}
      >
        {view === "choice" && (
          <ImportPathChoice
            onSelectRequest={() => setView("request")}
            onSelectUpload={() => setView("upload")}
          />
        )}

        {view === "request" && (
          <MobileRequestCamsView
            memberId={activeMemberId ?? ""}
            onBack={() => setView("choice")}
            onRequestInitiated={(id) => {
              setPendingImportId(id);
              if (activeMemberId) setCasResumeStep2(activeMemberId);
              setView("waiting");
            }}
          />
        )}

        {(view === "upload" || view === "waiting") && uploadMessage && (
          <p role="status" className="mb-3 max-w-md text-center text-xs text-[var(--color-ink)]">
            {uploadMessage}
          </p>
        )}

        {view === "history" && activeMemberId && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setView("choice")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5C5C5C] dark:text-[#A3A3A3] hover:text-[var(--color-ink)] transition-colors cursor-pointer py-1 min-h-[32px]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to import</span>
            </button>
            <MobileImportHistory
              memberId={activeMemberId}
              onMembersChanged={async (removed) => {
                const rest = await reloadMembers();
                // The viewed person was removed with their last data: fall back to someone who is left.
                if (removed.includes(activeMemberId) && rest.length > 0) setSelectedMemberId(rest[0].id);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
  };
  return <>
    {renderStage()}
    {view === "waiting" && ["upload", "prompt", "parsing"].includes(stage) && <div hidden={stage === "parsing"} className="w-full max-w-md mx-auto">
          <WaitingForCasView
            passwordError={flow.errorCode === "wrong_password" ? error ?? undefined : undefined}
            serverFileError={flow.errorCode && ["file_too_large", "unsupported_file", "invalid_file"].includes(flow.errorCode) ? error ?? undefined : undefined}
            importId={pendingImportId || "pending-import"}
            onCancelled={() => {
              if (activeMemberId) clearCasResumeStep2(activeMemberId);
              setPendingImportId(null);
              setView("choice");
            }}
            onUploadSubmit={handleUpload}
            surface="mobile_upload"
          />
    </div>}

    {view === "upload" && ["upload", "prompt", "parsing"].includes(stage) && <div hidden={stage === "parsing"} className="w-full max-w-md mx-auto">
      <MobileUploadForm onBack={view === "upload" ? () => setView("choice") : undefined} onSubmit={handleUpload}
        passwordError={flow.errorCode === "wrong_password" ? error ?? undefined : undefined}
        serverFileError={flow.errorCode && ["file_too_large", "unsupported_file", "invalid_file"].includes(flow.errorCode) ? error ?? undefined : undefined} />
    </div>}
  </>;

}
