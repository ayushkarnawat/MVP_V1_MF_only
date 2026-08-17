import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PhoneEntry } from "./PhoneEntry";
import { OtpVerify } from "./OtpVerify";
import { EmailEntry } from "./EmailEntry";
import { GoogleButton } from "./GoogleButton";
import { requestOtp, loginEmail, verifyGoogleCredential, verifyOtp } from "./api";
import { isLinkRequired, isPhoneRequired } from "./types";
import type { ExistingMethod, OtpVerifyResponse } from "./types";
import { ApiError } from "../../lib/apiClient";

interface LinkAccountPromptProps {
  matchedEmail: string;
  existingMethod: ExistingMethod;
  pendingToken: string;
  onLinked: (result: OtpVerifyResponse) => void;
  onCancel: () => void;
}

type Step = "entry" | "otp";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.payload === "string") return err.payload;
  return fallback;
}

export function LinkAccountPrompt({ matchedEmail, existingMethod, pendingToken, onLinked, onCancel }: LinkAccountPromptProps) {
  const [step, setStep] = useState<Step>("entry");
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const goToStep = (next: Step) => {
    setError(null);
    setDevOtp(null);
    setStep(next);
  };

  const handlePhoneEntrySubmit = async (phoneNumber: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestOtp(phoneNumber);
      setIdentifier(phoneNumber);
      setDevOtp(result.otp);
      setStep("otp");
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the code. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoneOtpSubmit = async (otp: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyOtp(identifier, otp, pendingToken);
      if (isLinkRequired(result) || isPhoneRequired(result)) {
        setError("Something went wrong linking your account. Please try again.");
        return;
      }
      onLinked(result);
    } catch (err) {
      setError(errorMessage(err, "That code didn't work. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailLogin = async (email: string, password: string) => {
    setSubmitting(true);
    setError(null);
    try {
      // loginEmail never returns link_required/phone_required (those are
      // signup-only outcomes) — a successful call always means a session.
      // pendingToken is threaded through here (unlike AuthEntryFlow's own
      // primary email login in Task 4, which never passes one) — this is
      // the one place email's step-up path differs from a normal login: it
      // tells the backend to also attach this pending Google/phone-gate
      // identity to whichever account the password just authenticated into.
      const result = await loginEmail(email, password, pendingToken);
      onLinked(result);
    } catch (err) {
      setError(errorMessage(err, "That didn't work. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleCredential = async (idToken: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyGoogleCredential(idToken, pendingToken);
      if (isLinkRequired(result) || isPhoneRequired(result)) {
        setError("Something went wrong linking your account. Please try again.");
        return;
      }
      onLinked(result);
    } catch (err) {
      setError(errorMessage(err, "Google sign-in didn't work. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const banner = (
    <p className="text-xs text-[var(--color-text-secondary)] text-center max-w-sm mx-auto">
      We found an account associated with <strong className="text-[var(--color-ink)]">{matchedEmail}</strong> — log
      in with your {existingMethod} to link this to it.
    </p>
  );

  const cancelButton = (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] font-medium transition-colors cursor-pointer text-xs"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back</span>
      </button>
    </div>
  );

  if (existingMethod === "google") {
    return (
      <div className="w-full max-w-sm sm:max-w-md mx-auto space-y-3">
        {cancelButton}
        {banner}
        <div className="p-5 sm:p-8 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)]/80 shadow-lg flex justify-center">
          <GoogleButton onCredential={handleGoogleCredential} />
        </div>
        {error && (
          <p role="alert" className="text-xs text-[var(--color-negative)] text-center">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (existingMethod === "email") {
    // Single-shot password login — no "entry then otp" transition needed,
    // unlike phone below.
    return (
      <div className="space-y-3">
        {cancelButton}
        {banner}
        <EmailEntry context="link" onLogin={handleEmailLogin} submitting={submitting} error={error} />
      </div>
    );
  }

  if (step === "entry") {
    return (
      <div className="space-y-3">
        {cancelButton}
        {banner}
        <PhoneEntry onSubmit={handlePhoneEntrySubmit} submitting={submitting} error={error} />
      </div>
    );
  }

  return (
    <OtpVerify
      phoneNumber={identifier}
      onSubmit={handlePhoneOtpSubmit}
      onResend={() => goToStep("entry")}
      onBack={() => goToStep("entry")}
      submitting={submitting}
      error={error}
      devOtp={devOtp}
    />
  );
}
