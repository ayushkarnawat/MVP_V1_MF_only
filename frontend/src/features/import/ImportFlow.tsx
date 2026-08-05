import { useState } from "react";
import { UploadForm } from "./UploadForm";
import { ParsingIndicator } from "./ParsingIndicator";
import { ReviewTable } from "./ReviewTable";
import { ImportError } from "./ImportError";
import { ImportConfirmed } from "./ImportConfirmed";
import { ApiError, confirmImport, parseImport } from "./api";
import type {
  ImportConfirmResponse,
  ImportPreviewResponse,
  ParseErrorPayload,
  SchemeConfirmation,
} from "./types";

type Step = "upload" | "parsing" | "review" | "error" | "confirmed";

const GENERIC_NETWORK_ERROR: ParseErrorPayload = {
  code: "network_error",
  message: "Couldn't reach the server. Check your connection and try again.",
};

function toParseErrorPayload(err: unknown): ParseErrorPayload {
  if (err instanceof ApiError) {
    return typeof err.payload === "string" ? { code: "error", message: err.payload } : err.payload;
  }
  return GENERIC_NETWORK_ERROR;
}

export function ImportFlow() {
  const [step, setStep] = useState<Step>("upload");
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResponse | null>(null);
  const [error, setError] = useState<ParseErrorPayload | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const reset = () => {
    setStep("upload");
    setPreview(null);
    setConfirmResult(null);
    setError(null);
    setReviewNotice(null);
    setConfirming(false);
  };

  const handleUpload = async (file: File, password: string) => {
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
      const result = await confirmImport(preview.session_id, confirmations);
      setConfirmResult(result);
      setStep("confirmed");
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        setReviewNotice(
          err.status === 404
            ? "This import session has expired. Please re-upload your CAS."
            : typeof err.payload === "string"
              ? err.payload
              : err.payload.message,
        );
      } else {
        setError(toParseErrorPayload(err));
        setStep("error");
      }
    } finally {
      setConfirming(false);
    }
  };

  if (step === "upload") {
    return <UploadForm onSubmit={handleUpload} />;
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
    return <ImportConfirmed result={confirmResult} onImportAnother={reset} />;
  }
  return <ImportError error={error ?? GENERIC_NETWORK_ERROR} onRetry={reset} />;
}
