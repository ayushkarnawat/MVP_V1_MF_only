import { useState } from "react";
import { Landing } from "./Landing";
import { PhoneEntry } from "./PhoneEntry";
import { OtpVerify } from "./OtpVerify";
import { EmailEntry } from "./EmailEntry";
import { EmailOtpVerify } from "./EmailOtpVerify";
import { LinkAccountPrompt } from "./LinkAccountPrompt";
import { AuthShowcasePanel } from "./AuthShowcasePanel";
import { requestOtp, sendEmailOtp, verifyEmailOtp, verifyGoogleCredential, verifyOtp } from "./api";
import { isLinkRequired, isPhoneRequired } from "./types";
import type { ExistingMethod } from "./types";
import { useAuth } from "./AuthContext";
import { ThemeToggle } from "../../components/ThemeToggle";
import { ApiError } from "../../lib/apiClient";

type Step = "landing" | "phone" | "otp" | "email" | "email_otp" | "link_account";

interface LinkInfo {
  token: string;
  matchedEmail: string;
  existingMethod: ExistingMethod;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.payload === "string") {
    return err.payload;
  }
  return fallback;
}

export function AuthEntryFlow() {
  const { login } = useAuth();
  const [step, setStep] = useState<Step>("landing");
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  // Mandatory phone-gate state (Design Spec §1): set when a Google/email
  // verification returns phone_required. Reuses the existing "phone"/"otp"
  // steps — no fifth Step value needed.
  const [phoneGateToken, setPhoneGateToken] = useState<string | null>(null);
  const [phoneGatePrefillEmail, setPhoneGatePrefillEmail] = useState<string | null>(null);

  // Account-linking state (Design Spec §4): set when a verification
  // returns link_required.
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);

  // Helper to navigate between steps while clearing stale error/devOtp state.
  // Used for back/resend/forward navigation, not for mid-async-operation
  // state changes (those use raw setError(null) at handler entry).
  const goToStep = (next: Step) => {
    setError(null);
    setDevOtp(null);
    setStep(next);
  };

  const handleSelectPhone = () => {
    setPhoneGateToken(null);
    setPhoneGatePrefillEmail(null);
    goToStep("phone");
  };

  const handleSelectEmail = () => {
    // Defensive parity with handleSelectPhone: unreachable today (there is no
    // route back to the landing screen while a phone gate is pending), but a
    // stale gate token must never leak into a fresh email attempt if a future
    // change adds an escape hatch.
    setPhoneGateToken(null);
    setPhoneGatePrefillEmail(null);
    goToStep("email");
  };

  const handlePhoneSubmit = async (phone: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestOtp(phone);
      setIdentifier(phone);
      goToStep("otp");
      setDevOtp(result.otp);
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the code. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (email: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await sendEmailOtp(email);
      setIdentifier(email);
      goToStep("email_otp");
      setDevOtp(result.otp);
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
      const result = await verifyOtp(identifier, otp, phoneGateToken ?? undefined);
      if (isLinkRequired(result) || isPhoneRequired(result)) {
        // Phone never produces either of these itself (Design Spec §1) —
        // a defensive guard against a backend contract mismatch, not an
        // expected path.
        setError("Something unexpected happened. Please try again.");
        return;
      }
      await login(result.session_token);
    } catch (err) {
      setError(errorMessage(err, "That code didn't work. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailOtpSubmit = async (otp: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyEmailOtp(identifier, otp);
      if (isPhoneRequired(result)) {
        setPhoneGateToken(result.phone_required.token);
        setPhoneGatePrefillEmail(result.phone_required.prefill_email);
        goToStep("phone");
        return;
      }
      if (isLinkRequired(result)) {
        setLinkInfo({
          token: result.link_required.token,
          matchedEmail: result.link_required.matched_email,
          existingMethod: result.link_required.existing_method,
        });
        goToStep("link_account");
        return;
      }
      await login(result.session_token);
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
      const result = await verifyGoogleCredential(idToken);
      if (isPhoneRequired(result)) {
        setPhoneGateToken(result.phone_required.token);
        setPhoneGatePrefillEmail(result.phone_required.prefill_email);
        goToStep("phone");
        return;
      }
      if (isLinkRequired(result)) {
        setLinkInfo({
          token: result.link_required.token,
          matchedEmail: result.link_required.matched_email,
          existingMethod: result.link_required.existing_method,
        });
        goToStep("link_account");
        return;
      }
      await login(result.session_token);
    } catch (err) {
      setError(errorMessage(err, "Google sign-in didn't work. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh w-full bg-[var(--color-bg)] flex flex-col justify-center items-center p-3.5 sm:p-6 lg:p-8 box-border text-left overflow-y-auto relative">
      {/* Light / Dark Theme Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-5xl mx-auto my-auto grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
        <div className="order-2 lg:order-1">
          {step === "landing" && (
            <Landing
              onSelectPhone={handleSelectPhone}
              onSelectEmail={handleSelectEmail}
              onGoogleCredential={handleGoogleCredential}
              error={error}
              submitting={submitting}
            />
          )}
          {step === "phone" && (
            <PhoneEntry
              context={phoneGateToken ? "phoneGate" : "primary"}
              phoneGatePrefillEmail={phoneGatePrefillEmail}
              onSubmit={handlePhoneSubmit}
              onBack={phoneGateToken ? undefined : () => goToStep("landing")}
              submitting={submitting}
              error={error}
            />
          )}
          {step === "otp" && (
            <OtpVerify
              phoneNumber={identifier}
              onSubmit={handlePhoneOtpSubmit}
              onResend={() => goToStep("phone")}
              onBack={() => goToStep("phone")}
              submitting={submitting}
              error={error}
              devOtp={devOtp}
            />
          )}
          {step === "email" && (
            <EmailEntry
              onSubmit={handleEmailSubmit}
              onBack={() => goToStep("landing")}
              submitting={submitting}
              error={error}
            />
          )}
          {step === "email_otp" && (
            <EmailOtpVerify
              email={identifier}
              onSubmit={handleEmailOtpSubmit}
              onResend={() => goToStep("email")}
              onBack={() => goToStep("email")}
              submitting={submitting}
              error={error}
              devOtp={devOtp}
            />
          )}
          {step === "link_account" && linkInfo && (
            <LinkAccountPrompt
              matchedEmail={linkInfo.matchedEmail}
              existingMethod={linkInfo.existingMethod}
              pendingToken={linkInfo.token}
              onLinked={async (result) => {
                try {
                  await login(result.session_token);
                } catch (err) {
                  // login() can still fail after the token is stored (getMe
                  // throwing, say). Surface it on the landing screen — the
                  // link step has no place left to render it once we leave,
                  // and floating the rejection would be silent.
                  const message = errorMessage(err, "Something went wrong finishing sign-in. Try again.");
                  setLinkInfo(null);
                  goToStep("landing");
                  setError(message);
                }
              }}
              onCancel={() => {
                setLinkInfo(null);
                goToStep("landing");
              }}
            />
          )}
        </div>
        <div className="order-1 lg:order-2 hidden lg:block h-full">
          <AuthShowcasePanel />
        </div>
      </div>
    </div>
  );
}
