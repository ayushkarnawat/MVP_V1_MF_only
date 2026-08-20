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
  Loader2,
  RefreshCw,
  LayoutDashboard,
  UploadCloud,
  ShieldCheck,
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-5 animate-in fade-in duration-200">
        <div className="relative flex items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] flex items-center justify-center text-[var(--color-accent)]">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
        <div className="space-y-1.5 max-w-xs">
          <h3 className="font-display font-bold text-base text-[var(--color-ink)]">
            Decrypting &amp; Parsing Statement
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Extracting folios, validating mutual fund transactions, and matching AMFI codes...
          </p>
        </div>
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
      <div className="w-full min-w-0 max-w-md mx-auto space-y-4 pt-2 sm:pt-3 text-left box-border animate-in fade-in duration-200">
        <div className="p-5 sm:p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-5 text-center box-border">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-positive)_24%,transparent)] text-[var(--color-positive)] flex items-center justify-center shadow-2xs">
            <CheckCircle2 className="h-7 w-7 stroke-[2.2]" />
          </div>

          <div className="space-y-1.5 max-w-xs mx-auto">
            <h3 className="font-display font-bold text-lg sm:text-xl text-[var(--color-ink)] tracking-tight">
              Import Complete
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              <strong className="text-[var(--color-ink)] font-semibold">{addedText}</strong>
              {skippedText}. Your portfolio and holdings have been updated.
            </p>
          </div>

          <div className="w-full space-y-2.5 pt-1">
            {onNavigateDashboard && (
              <Button
                onClick={() => {
                  clearCasResumeStep2(selectedMemberId);
                  onNavigateDashboard();
                }}
                className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.98] transition-all min-h-[44px] sm:min-h-[48px]"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Go to Dashboard</span>
              </Button>
            )}

            <Button
              variant="outline"
              onClick={resetFlow}
              className="w-full h-11 sm:h-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-surface)] text-[var(--color-ink)] text-xs sm:text-sm font-semibold gap-2 cursor-pointer active:scale-[0.98] transition-all min-h-[44px] sm:min-h-[48px]"
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-5 animate-in fade-in duration-200">
        <div className="h-14 w-14 rounded-full bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)] flex items-center justify-center">
          <AlertCircle className="h-7 w-7" />
        </div>

        <div className="space-y-1.5 max-w-xs">
          <h3 className="font-display font-bold text-base text-[var(--color-ink)]">
            Import Failed
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            {error?.message || "We were unable to parse your statement. Please try again."}
          </p>
        </div>

        <Button
          onClick={resetFlow}
          className="h-11 px-5 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs gap-2 min-h-[44px] active:scale-95"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Try Again</span>
        </Button>
      </div>
    );
  }

  const activeMemberId = selectedMemberId || members[0]?.id || null;

  /* 5. Main Flow Screen (Choice, Request, Waiting, Upload, History) */
  return (
    <div className="flex flex-col space-y-4 text-left">
      {/* Top Header with Member Selector & History Toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap px-0.5">
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
                  "px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 flex-shrink-0 min-h-[32px]",
                  (selectedMemberId ?? members[0]?.id) === m.id
                    ? "bg-[var(--color-ink)] text-[var(--color-bg)] shadow-2xs"
                    : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:text-[var(--color-ink)]"
                )}
              >
                <User className="h-3 w-3" />
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)]">
            <User className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span>
              Importing for{" "}
              <strong className="text-[var(--color-ink)] font-semibold">
                {selectedMemberName}
              </strong>
            </span>
          </div>
        )}

        {/* Import History Action Button */}
        <button
          type="button"
          onClick={() => setView((prev) => (prev === "history" ? "choice" : "history"))}
          aria-label="Import History"
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer min-h-[32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ml-auto",
            view === "history"
              ? "bg-[var(--color-ink)] text-[var(--color-bg)] shadow-xs"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)] border border-[var(--color-border)]"
          )}
        >
          <History className="h-3.5 w-3.5 flex-shrink-0" />
          <span>History</span>
        </button>
      </div>

      {/* Main View Display */}
      <div className="animate-in fade-in duration-150">
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
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] transition-colors cursor-pointer py-1 min-h-[32px]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to import</span>
            </button>
            <MobileImportHistory memberId={activeMemberId} />
          </div>
        )}
      </div>

      {/* Trust & Security Tag */}
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-[var(--color-text-secondary)] pt-1 text-center select-none">
        <ShieldCheck className="h-3 w-3 text-[var(--color-positive)] flex-shrink-0" />
        <span>256-bit encrypted · Read-only access · No spam</span>
      </div>
    </div>
  );
}
