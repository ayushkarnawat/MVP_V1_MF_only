import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PhoneEntry } from "./PhoneEntry";
import { OtpVerify } from "./OtpVerify";
import { EmailEntry } from "./EmailEntry";
import { GoogleButton } from "./GoogleButton";
import { requestEmailOtp, requestOtp, verifyEmailOtp, verifyGoogleCredential, verifyOtp } from "./api";
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

type Step = "entry" | "otp" | "email_otp";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.payload === "string") return err.payload;
  return fallback;
}

export function LinkAccountPrompt({ matchedEmail, existingMethod, pendingToken, onLinked, onCancel }: LinkAccountPromptProps) {
  const [step, setStep] = useState<Step>("entry");
  const [identifier, setIdentifier] = useState("");
  const [emailIdentifier, setEmailIdentifier] = useState("");
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

  const handleEmailOtpRequest = async (email: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestEmailOtp(email);
      setEmailIdentifier(email);
      setDevOtp(result.otp);
      setStep("email_otp");
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the code. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailOtpSubmit = async (otp: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyEmailOtp(emailIdentifier, otp, pendingToken);
      if (!("session_token" in result)) {
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
    <div className="space-y-1">
      <h2 className="font-display font-bold text-2xl text-[var(--color-ink)] tracking-tight">
        Link to existing account
      </h2>
      <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
        We found an account associated with <strong className="text-[var(--color-ink)] font-mono">{matchedEmail}</strong> — log in with your {existingMethod} to link this to it.
      </p>
    </div>
  );

  const cancelButton = (
    <button
      type="button"
      onClick={onCancel}
      className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] font-medium transition-colors cursor-pointer"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span>Back</span>
    </button>
  );

  if (existingMethod === "google") {
    return (
      <div className="w-full max-w-md mx-auto space-y-6 text-left box-border">
        {cancelButton}
        {banner}
        <div className="pt-2">
          <GoogleButton onCredential={handleGoogleCredential} />
        </div>
        {error && (
          <p role="alert" className="text-xs text-[var(--color-negative)] font-medium">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (existingMethod === "email") {
    if (step === "email_otp") {
      return (
        <OtpVerify
          phoneNumber={emailIdentifier}
          channel="email"
          onSubmit={handleEmailOtpSubmit}
          onResend={() => handleEmailOtpRequest(emailIdentifier)}
          onBack={() => goToStep("entry")}
          submitting={submitting}
          error={error}
          devOtp={devOtp}
        />
      );
    }
    return (
      <div className="space-y-4">
        {cancelButton}
        {banner}
        <EmailEntry context="link" onLogin={handleEmailOtpRequest} submitting={submitting} error={error} />
      </div>
    );
  }

  if (step === "entry") {
    return (
      <div className="space-y-4">
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
