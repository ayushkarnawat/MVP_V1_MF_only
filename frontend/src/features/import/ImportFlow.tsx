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
  defaultTab?: "request" | "upload" | "history";
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

export function ImportFlow({ householdMemberId, ctaLabel, onDone, defaultTab = "request" }: ImportFlowProps) {
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

  const renderStep = () => {
    if (step === "upload") {
      return (
        <TwoPathImportContainer
          memberId={householdMemberId}
          defaultTab={defaultTab}
          onUploadSubmit={handleUpload}
        />
      );
    }
    if (step === "parsing") {
      return <ParsingIndicator />;
    }
    if (step === "review" && preview) {
      return (
        <>
          {reviewNotice && <p role="alert">{reviewNotice}</p>}
          <ReviewTable preview={preview} confirming={confirming} onConfirm={handleConfirm} />
        </>
      );
    }
    if (step === "confirmed" && confirmResult) {
      return <ImportConfirmed result={confirmResult} onImportAnother={onDone ?? reset} ctaLabel={ctaLabel} />;
    }
    return <ImportError error={error ?? GENERIC_NETWORK_ERROR} onRetry={reset} />;
  };

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={step}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          duration: shouldReduceMotion ? 0.01 : 0.3,
          ease: [0.4, 0, 0.2, 1],
        }}
        className="w-full"
      >
        {renderStep()}
      </motion.div>
    </AnimatePresence>
  );
}
