import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { TwoPathImportContainer } from "./TwoPathImportContainer";
import { ParsingIndicator } from "./ParsingIndicator";
import { ImportError } from "./ImportError";
import { ImportConfirmed } from "./ImportConfirmed";
import { MemberRibbonReview } from "./MemberRibbonReview";
import { ReviewExpiryBanner } from "./ReviewExpiryBanner";
import { useImportOrchestration } from "./useImportOrchestration";
import { isTestEnv } from "@/lib/motion";
import type { UploadSurface } from "@/features/legal/panDisclaimerStore";

interface ImportFlowProps {
  householdMemberId: string;
  ctaLabel?: string;
  onDone?: () => void;
  defaultTab?: "choice" | "request" | "upload" | "history" | "waiting";
  /** Which screen the upload came from, for the PAN disclaimer record. */
  surface?: UploadSurface;
}

export function ImportFlow({ householdMemberId, ctaLabel, onDone, defaultTab, surface }: ImportFlowProps) {
  const {
    flow, uploadMessage, edits, nameAnswers, confirming, reviewPeople, setCancelOpen,
    cancelImport, upload, runConfirm, dialogs,
  } = useImportOrchestration(householdMemberId);
  const { stage, preview, confirmResult, error } = flow;
  // After a discard, re-mount the upload container straight on the upload form
  // instead of the request/upload choice screen.
  const [uploadTab, setUploadTab] = useState(defaultTab);

  const shouldReduceMotion = useReducedMotion() || isTestEnv;

  const handleUpload = async (file: File, password: string) => {
    // Whatever sends the user back to the upload screen (a discard, an expiry, a
    // failed parse), they should land on the form they just used, not the choice screen.
    setUploadTab("upload");
    await upload(file, password);
  };

  const view =
    stage === "upload" || stage === "prompt"
      ? "upload"
      : stage === "notices" || stage === "people"
        ? "waiting"
        : stage;
  const showRibbons = stage === "review" && preview !== null;

  return (
    <div className="w-full min-h-full flex-1 flex flex-col justify-center items-center my-auto">
      {dialogs}

      {(stage === "people" || stage === "review") && preview && (
        <div className="w-full px-4 pb-3">
          <ReviewExpiryBanner key={preview.session_id} expiresAt={preview.expires_at} />
        </div>
      )}

      <AnimatePresence mode="wait">
        {view === "upload" && (
          <motion.div
            key="upload"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="w-full flex-1 flex flex-col justify-center items-center my-auto"
          >
            {uploadMessage && (
              <p role="status" className="mb-3 max-w-md text-center text-sm text-[var(--color-ink)]">
                {uploadMessage}
              </p>
            )}
            <TwoPathImportContainer
              memberId={householdMemberId}
              defaultTab={uploadTab}
              onUploadSubmit={handleUpload}
              surface={surface}
            />
          </motion.div>
        )}

        {view === "parsing" && (
          <motion.div
            key="parsing"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="w-full flex-1 flex flex-col justify-center items-center my-auto min-h-[calc(100dvh-3rem)] sm:min-h-[520px]"
          >
            <ParsingIndicator />
          </motion.div>
        )}

        {view === "review" && showRibbons && preview && (
          <motion.div
            key="review"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            <MemberRibbonReview
              key={preview.session_id}
              preview={preview}
              people={reviewPeople}
              edits={edits}
              nameAnswers={nameAnswers}
              confirming={confirming}
              onConfirmImports={(people, moved) => void runConfirm(people, moved)}
              onCancel={() => setCancelOpen(true)}
            />
          </motion.div>
        )}

        {view === "error" && (
          <motion.div
            key="error"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="w-full flex-1 flex flex-col justify-center items-center my-auto min-h-[calc(100dvh-3rem)] sm:min-h-[520px]"
          >
            <ImportError
              error={{ code: "error", message: error ?? "Couldn't reach the server. Check your connection and try again." }}
              onRetry={() => void cancelImport()}
            />
          </motion.div>
        )}

        {view === "confirmed" && confirmResult && (
          <motion.div
            key="confirmed"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="w-full flex-1 flex flex-col justify-center items-center my-auto min-h-[calc(100dvh-3rem)] sm:min-h-[520px]"
          >
            <ImportConfirmed
              result={confirmResult}
              ctaLabel={ctaLabel}
              onImportAnother={
                onDone ??
                (() => {
                  setUploadTab(defaultTab);
                  void cancelImport();
                })
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
