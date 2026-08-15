import { useState } from "react";
import { PhoneEntry } from "./PhoneEntry";
import { OtpVerify } from "./OtpVerify";
import { EmailEntry } from "./EmailEntry";
import { EmailOtpVerify } from "./EmailOtpVerify";
import { GoogleButton } from "./GoogleButton";
import { requestOtp, sendEmailOtp, verifyEmailOtp, verifyGoogleCredential, verifyOtp } from "./api";
import { isLinkRequired, isPhoneRequired } from "./types";
import type { ExistingMethod, OtpVerifyResponse } from "./types";
import { ApiError } from "../../lib/apiClient";

interface LinkAccountPromptProps {
  matchedEmail: string;
  existingMethod: ExistingMethod;
  pendingToken: string;
  onLinked: (result: OtpVerifyResponse) => void;
}

type Step = "entry" | "otp";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.payload === "string") return err.payload;
  return fallback;
}

export function LinkAccountPrompt({ matchedEmail, existingMethod, pendingToken, onLinked }: LinkAccountPromptProps) {
  const [step, setStep] = useState<Step>("entry");
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const handleEntrySubmit = async (value: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = existingMethod === "phone" ? await requestOtp(value) : await sendEmailOtp(value);
      setIdentifier(value);
      setDevOtp(result.otp);
      setStep("otp");
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the code. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpSubmit = async (otp: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = existingMethod === "phone"
        ? await verifyOtp(identifier, otp, pendingToken)
        : await verifyEmailOtp(identifier, otp, pendingToken);
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

  if (existingMethod === "google") {
    return (
      <div className="w-full max-w-sm sm:max-w-md mx-auto space-y-3">
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

  if (step === "entry") {
    return (
      <div className="space-y-3">
        {banner}
        {existingMethod === "phone" ? (
          <PhoneEntry onSubmit={handleEntrySubmit} submitting={submitting} error={error} />
        ) : (
          <EmailEntry onSubmit={handleEntrySubmit} submitting={submitting} error={error} />
        )}
      </div>
    );
  }

  return existingMethod === "phone" ? (
    <OtpVerify
      phoneNumber={identifier}
      onSubmit={handleOtpSubmit}
      onResend={() => setStep("entry")}
      onBack={() => setStep("entry")}
      submitting={submitting}
      error={error}
      devOtp={devOtp}
    />
  ) : (
    <EmailOtpVerify
      email={identifier}
      onSubmit={handleOtpSubmit}
      onResend={() => setStep("entry")}
      onBack={() => setStep("entry")}
      submitting={submitting}
      error={error}
      devOtp={devOtp}
    />
  );
}
