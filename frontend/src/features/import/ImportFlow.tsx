import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { TwoPathImportContainer } from "./TwoPathImportContainer";
import { ParsingIndicator } from "./ParsingIndicator";
import { ReviewTable } from "./ReviewTable";
import { ImportError } from "./ImportError";
import { ImportConfirmed } from "./ImportConfirmed";
import { ApiError, confirmImport, parseImport } from "./api";
import { clearCasResumeStep2 } from "./casResumeState";
import { isTestEnv } from "@/lib/motion";
import type {
  ImportConfirmResponse,
  ImportPreviewResponse,
  ParseErrorPayload,
  SchemeConfirmation,
} from "./types";

type Step = "upload" | "parsing" | "review" | "error" | "confirmed";

interface ImportFlowProps {
  householdMemberId: string;
  ctaLabel?: string;
  onDone?: () => void;
  defaultTab?: "choice" | "request" | "upload" | "history" | "waiting";
}

const GENERIC_NETWORK_ERROR: ParseErrorPayload = {
  code: "network_error",
  message: "Couldn't reach the server. Check your connection and try again.",
};

function toParseErrorPayload(err: unknown): ParseErrorPayload {
  if (err instanceof ApiError) {
    // ApiError.payload is `unknown`; the import API only ever throws ParseErrorPayload | string.
    const payload = err.payload as ParseErrorPayload | string;
    return typeof payload === "string" ? { code: "error", message: payload } : payload;
  }
  return GENERIC_NETWORK_ERROR;
}

export function ImportFlow({ householdMemberId, ctaLabel, onDone, defaultTab }: ImportFlowProps) {
  const [step, setStep] = useState<Step>("upload");
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResponse | null>(null);
  const [error, setError] = useState<ParseErrorPayload | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const shouldReduceMotion = useReducedMotion() || isTestEnv;

  const reset = () => {
    clearCasResumeStep2(householdMemberId);
    setStep("upload");
    setPreview(null);
    setConfirmResult(null);
    setError(null);
    setReviewNotice(null);
    setConfirming(false);
  };

  const handleUpload = async (file: File, password: string) => {
    clearCasResumeStep2(householdMemberId);
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
    if (!preview) return;
    setConfirming(true);
    setReviewNotice(null);
    try {
      const result = await confirmImport(preview.session_id, householdMemberId, confirmations);
      clearCasResumeStep2(householdMemberId);
      setConfirmResult(result);
      setStep("confirmed");
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        setReviewNotice(
          err.status === 404
            ? "This import session has expired. Please re-upload your CAS."
            : toParseErrorPayload(err).message,
        );
      } else {
        setError(toParseErrorPayload(err));
        setStep("error");
      }
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="w-full min-h-full flex-1 flex flex-col justify-center items-center my-auto">
      <AnimatePresence mode="wait">
        {step === "upload" && (
          <motion.div
            key="upload"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="w-full flex-1 flex flex-col justify-center items-center my-auto"
          >
            <TwoPathImportContainer
              memberId={householdMemberId}
              defaultTab={defaultTab}
              onUploadSubmit={handleUpload}
            />
          </motion.div>
        )}

        {step === "parsing" && (
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

        {step === "review" && preview && (
          <motion.div
            key="review"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {reviewNotice && <p role="alert">{reviewNotice}</p>}
            <ReviewTable
              preview={preview}
              confirming={confirming}
              onConfirm={handleConfirm}
            />
          </motion.div>
        )}

        {step === "error" && (
          <motion.div
            key="error"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="w-full flex-1 flex flex-col justify-center items-center my-auto min-h-[calc(100dvh-3rem)] sm:min-h-[520px]"
          >
            <ImportError error={error ?? GENERIC_NETWORK_ERROR} onRetry={reset} />
          </motion.div>
        )}

        {step === "confirmed" && confirmResult && (
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
              onImportAnother={onDone ?? reset}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
