import { useState, useEffect } from "react";
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
import { ReviewExpiryBanner } from "@/features/import/ReviewExpiryBanner";
import { MobileImportHistory } from "./MobileImportHistory";
import { cn } from "@/lib/utils";
import {
  History,
  User,
  ArrowLeft,
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

  const {
    flow, uploadMessage,
    cancelImport, upload, dialogs: orchestrationDialogs,
  } = useImportOrchestration(selectedMemberId ?? "", onNavigateDashboard);
  const { stage, preview } = flow;
  const error = flow.error;

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
  if (stage === "parsing" || stage === "confirming") {
    return (
      <div className="w-full flex-1 flex flex-col justify-center items-center min-h-[calc(100dvh-7rem)] sm:min-h-[500px] my-auto">
        {flowDialogs}
        <ParsingIndicator />
      </div>
    );
  }

  // Notices, people and fallback are dialogs shared with the web flow.
  if (stage === "notices" || stage === "people" || stage === "fallback") {
    return <div className="w-full min-h-[50vh]">
      {flowDialogs}
      {(stage === "people" || stage === "fallback") && preview && (
        <ReviewExpiryBanner key={preview.session_id} expiresAt={preview.expires_at} />
      )}
    </div>;
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
