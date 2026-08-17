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
    <div className="min-h-dvh w-full bg-[var(--color-bg)] text-[var(--color-ink)] flex items-center justify-center p-3 sm:p-6 md:p-8 lg:p-10 relative box-border overflow-x-hidden selection:bg-[var(--color-accent)]/20">
      {/* Theme Toggle (Discreet Canvas Top-Right) */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-30">
        <ThemeToggle />
      </div>

      {/* Main Single Centered Rounded Container */}
      <div className="w-full max-w-6xl rounded-3xl bg-[var(--color-surface)] shadow-xl shadow-black/[0.04] dark:shadow-black/50 border border-[var(--color-border)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px] relative">
        {/* Left ~50% Section: Clean Light Authentication Area */}
        <div className="lg:col-span-6 xl:col-span-5 p-6 sm:p-10 md:p-12 lg:p-14 flex flex-col justify-between h-full bg-[var(--color-surface)]">
          {/* Top Unifolio Brand Logo */}
          <div className="text-left select-none pb-4 flex items-center gap-2">
            <span className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight">
              Unifolio
            </span>
            <svg
              viewBox="0 0 100 100"
              className="w-4 h-4 text-[var(--color-accent)] fill-none stroke-current stroke-[14] stroke-linecap-round"
              aria-label="Unifolio Logo Glyph"
            >
              <path d="M 50 10 A 40 40 0 0 1 90 50" />
            </svg>
          </div>

          {/* Form Step Experience */}
          <div className="my-auto w-full">
            {step === "landing" && (
              <div key="step-landing" className="animate-in fade-in duration-200">
                <Landing
                  onSignup={handleEmailSignup}
                  onSelectEmail={handleSelectEmail}
                  onSelectPhone={handleSelectPhone}
                  onGoogleCredential={handleGoogleCredential}
                  error={error}
                  submitting={submitting}
                />
              </div>
            )}

            {step === "email" && (
              <div key="step-email" className="animate-in fade-in duration-200">
                <EmailEntry
                  context="login"
                  onLogin={handleEmailLogin}
                  onSignup={handleEmailSignup}
                  onBack={() => goToStep("landing")}
                  submitting={submitting}
                  error={error}
                />
              </div>
            )}

            {step === "phone" && (
              <div key="step-phone" className="animate-in fade-in duration-200">
                <PhoneEntry
                  context={phoneGateToken ? "phoneGate" : "primary"}
                  phoneGatePrefillEmail={phoneGatePrefillEmail}
                  onSubmit={handlePhoneSubmit}
                  onBack={phoneGateToken ? undefined : () => goToStep("landing")}
                  submitting={submitting}
                  error={error}
                />
              </div>
            )}

            {step === "otp" && (
              <div key="step-otp" className="animate-in fade-in duration-200">
                <OtpVerify
                  phoneNumber={identifier}
                  onSubmit={handlePhoneOtpSubmit}
                  onResend={() => goToStep("phone")}
                  onBack={() => goToStep("phone")}
                  submitting={submitting}
                  error={error}
                  devOtp={devOtp}
                />
              </div>
            )}

            {step === "link_account" && linkInfo && (
              <div key="step-link-account" className="animate-in fade-in duration-200">
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
              </div>
            )}
          </div>

          {/* Clean Bottom Assurance */}
          <div className="pt-4 text-left text-[11px] text-[var(--color-text-secondary)] select-none font-body">
            SEBI registered scheme universe · 256-bit AES encryption
          </div>
        </div>

        {/* Right ~50% Section: Unifolio Wealth Intelligence Visual Section */}
        <div className="lg:col-span-6 xl:col-span-7 p-3 sm:p-4 lg:p-4 hidden lg:flex h-full">
          <AuthShowcasePanel />
        </div>
      </div>
    </div>
  );
}
