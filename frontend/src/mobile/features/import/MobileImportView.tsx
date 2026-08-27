import { useState, useEffect } from "react";
import { listHouseholdMembers } from "@/features/auth/api";
import { parseImport, confirmImport, ApiError } from "@/features/import/api";
import {
  hasCasResumeStep2,
  setCasResumeStep2,
  clearCasResumeStep2,
} from "@/features/import/casResumeState";
import type { HouseholdMember } from "@/features/auth/types";
import type {
  ImportPreviewResponse,
  ImportConfirmResponse,
  ParseErrorPayload,
  SchemeConfirmation,
} from "@/features/import/types";
import { ImportPathChoice } from "@/features/import/ImportPathChoice";
import { WaitingForCasView } from "@/features/import/WaitingForCasView";
import { ParsingIndicator } from "@/features/import/ParsingIndicator";
import { MobileRequestCamsView } from "./MobileRequestCamsView";
import { MobileUploadForm } from "./MobileUploadForm";
import { MobileReviewView } from "./MobileReviewView";
import { MobileImportHistory } from "./MobileImportHistory";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  History,
  User,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LayoutDashboard,
  UploadCloud,
  ArrowLeft,
} from "lucide-react";

export interface MobileImportViewProps {
  onNavigateDashboard?: () => void;
  defaultTab?: "request" | "upload" | "history" | "choice" | "waiting";
  defaultMemberId?: string;
}

export type MobileImportViewMode = "choice" | "request" | "waiting" | "upload" | "history";
type FlowStep = "flow" | "parsing" | "review" | "confirmed" | "error";

const GENERIC_NETWORK_ERROR: ParseErrorPayload = {
  code: "network_error",
  message: "Couldn't reach the server. Check your connection and try again.",
};

function toParseErrorPayload(err: unknown): ParseErrorPayload {
  if (err instanceof ApiError) {
    const payload = err.payload as ParseErrorPayload | string;
    return typeof payload === "string" ? { code: "error", message: payload } : payload;
  }
  return GENERIC_NETWORK_ERROR;
}

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

  const [step, setStep] = useState<FlowStep>("flow");
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResponse | null>(null);
  const [error, setError] = useState<ParseErrorPayload | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  /* Load household members */
  useEffect(() => {
    listHouseholdMembers()
      .then((data) => {
        if (data && data.length > 0) {
          setMembers(data);
          setSelectedMemberId((prev) => prev ?? defaultMemberId ?? data[0].id);
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

  const resetFlow = () => {
    clearCasResumeStep2(selectedMemberId);
    setStep("flow");
    setPreview(null);
    setConfirmResult(null);
    setError(null);
    setReviewNotice(null);
    setConfirming(false);
  };

  const handleUpload = async (file: File, password: string) => {
    clearCasResumeStep2(selectedMemberId);
    setStep("parsing");
    setError(null);
    try {
      const result = await parseImport(file, password);
      setPreview(result);
      setStep("review");
    } catch (err) {
      setError(toParseErrorPayload(err));
      setStep("error");
    }
  };

  const handleConfirm = async (confirmations: SchemeConfirmation[]) => {
    if (!preview || !selectedMemberId) return;
    setConfirming(true);
    setReviewNotice(null);
    try {
      const result = await confirmImport(preview.session_id, selectedMemberId, confirmations);
      clearCasResumeStep2(selectedMemberId);
      setConfirmResult(result);
      setStep("confirmed");
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        setReviewNotice(
          err.status === 404
            ? "This import session has expired. Please re-upload your CAS."
            : toParseErrorPayload(err).message
        );
      } else {
        setError(toParseErrorPayload(err));
        setStep("error");
      }
    } finally {
      setConfirming(false);
    }
  };

  const selectedMemberName =
    members.find((m) => m.id === selectedMemberId)?.name ?? "Self";

  /* 1. Parsing Indicator Screen */
  if (step === "parsing") {
    return (
      <div className="w-full flex-1 flex flex-col justify-center items-center min-h-[calc(100dvh-7rem)] sm:min-h-[500px] my-auto">
        <ParsingIndicator />
      </div>
    );
  }

  /* 2. Review Screen */
  if (step === "review" && preview) {
    return (
      <MobileReviewView
        preview={preview}
        confirming={confirming}
        onConfirm={handleConfirm}
        onCancel={resetFlow}
        reviewNotice={reviewNotice}
      />
    );
  }

  /* 3. Confirmed Success Screen */
  if (step === "confirmed" && confirmResult) {
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
              onClick={resetFlow}
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
  if (step === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4 animate-in fade-in duration-200">
        <div className="h-12 w-12 rounded-2xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)] flex items-center justify-center">
          <AlertCircle className="h-6 w-6" />
        </div>

        <div className="space-y-1.5 max-w-xs">
          <h3 className="font-display font-bold text-base text-[var(--color-ink)]">
            Import Failed
          </h3>
          <p className="text-xs text-[#5C5C5C] dark:text-[#A3A3A3] leading-relaxed">
            {error?.message || "We were unable to parse your statement. Please try again."}
          </p>
        </div>

        <Button
          onClick={resetFlow}
          className="h-11 px-6 rounded-full bg-[#22C55E] hover:bg-[#22C55E]/90 dark:bg-[#22C55E] dark:hover:bg-[#22C55E]/90 text-white font-bold text-xs gap-2 min-h-[44px] active:scale-95 shadow-md shadow-[#22C55E]/20 border-none mx-auto"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Try Again</span>
        </Button>
      </div>
    );
  }

  const activeMemberId = selectedMemberId || members[0]?.id || null;

  return (
    <div
      className={cn(
        "flex flex-col text-left box-border w-full flex-1",
        view === "choice" || view === "upload"
          ? "min-h-[calc(100dvh-7rem)] sm:min-h-0 justify-between sm:justify-start space-y-2 sm:space-y-4 my-auto"
          : "space-y-3.5 sm:space-y-4"
      )}
    >
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

        {view === "waiting" && (
          <WaitingForCasView
            importId={pendingImportId || "pending-import"}
            memberId={activeMemberId ?? ""}
            onCancelled={() => {
              if (activeMemberId) clearCasResumeStep2(activeMemberId);
              setPendingImportId(null);
              setView("choice");
            }}
            onUploadSubmit={handleUpload}
          />
        )}

        {view === "upload" && (
          <MobileUploadForm
            onBack={() => setView("choice")}
            onSubmit={handleUpload}
          />
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
            <MobileImportHistory memberId={activeMemberId} />
          </div>
        )}
      </div>
    </div>
  );
}
