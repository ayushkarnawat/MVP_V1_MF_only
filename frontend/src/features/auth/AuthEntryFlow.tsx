import { useState } from "react";
import { Landing } from "./Landing";
import { EmailEntry } from "./EmailEntry";
import { PhoneEntry } from "./PhoneEntry";
import { OtpVerify } from "./OtpVerify";
import { LinkAccountPrompt } from "./LinkAccountPrompt";
import { AuthShowcasePanel } from "./AuthShowcasePanel";
import { requestOtp, signupEmail, loginEmail, verifyGoogleCredential, verifyOtp } from "./api";
import { isLinkRequired, isPhoneRequired } from "./types";
import type { ExistingMethod } from "./types";
import { useAuth } from "./AuthContext";
import { ThemeToggle } from "../../components/ThemeToggle";
import { ApiError } from "../../lib/apiClient";

type Step = "landing" | "email" | "phone" | "otp" | "link_account";

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
  // steps — no extra Step value needed.
  const [phoneGateToken, setPhoneGateToken] = useState<string | null>(null);
  const [phoneGatePrefillEmail, setPhoneGatePrefillEmail] = useState<string | null>(null);

  // Account-linking state (Design Spec §4): set when a verification
  // returns link_required.
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);

  const goToStep = (next: Step) => {
    setError(null);
    setDevOtp(null);
    setStep(next);
  };

  const handleSelectEmail = () => {
    setPhoneGateToken(null);
    setPhoneGatePrefillEmail(null);
    goToStep("email");
  };

  const handleSelectPhone = () => {
    setPhoneGateToken(null);
    setPhoneGatePrefillEmail(null);
    goToStep("phone");
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

  const handleEmailSignup = async (email: string, password: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await signupEmail(email, password);
      // signupEmail always resolves to phone_required (Design Spec §4/§4a)
      // — transitions to mandatory phone gate.
      setPhoneGateToken(result.phone_required.token);
      setPhoneGatePrefillEmail(result.phone_required.prefill_email);
      goToStep("phone");
    } catch (err) {
      setError(errorMessage(err, "Couldn't create your account. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailLogin = async (email: string, password: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await loginEmail(email, password);
      await login(result.session_token);
    } catch (err) {
      // Covers both "wrong email or password" (401) and "please confirm
      // your email" (403) — the backend's own message already
      // distinguishes them correctly, no frontend branching needed.
      setError(errorMessage(err, "That didn't work. Try again."));
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
              onSignup={handleEmailSignup}
              onSelectEmail={handleSelectEmail}
              onSelectPhone={handleSelectPhone}
              onGoogleCredential={handleGoogleCredential}
              error={error}
              submitting={submitting}
            />
          )}
          {step === "email" && (
            <EmailEntry
              context="login"
              onLogin={handleEmailLogin}
              onSignup={handleEmailSignup}
              onBack={() => goToStep("landing")}
              submitting={submitting}
              error={error}
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
          {step === "link_account" && linkInfo && (
            <LinkAccountPrompt
              matchedEmail={linkInfo.matchedEmail}
              existingMethod={linkInfo.existingMethod}
              pendingToken={linkInfo.token}
              onLinked={async (result) => {
                try {
                  await login(result.session_token);
                } catch (err) {
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
