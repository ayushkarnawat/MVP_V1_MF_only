import { useState } from "react";
import { Landing } from "./Landing";
import { EmailEntry } from "./EmailEntry";
import { PhoneEntry } from "./PhoneEntry";
import { OtpVerify } from "./OtpVerify";
import { LinkAccountPrompt } from "./LinkAccountPrompt";
import { AuthShowcasePanel } from "./AuthShowcasePanel";
import {
  requestEmailOtp,
  requestOtp,
  signupEmail,
  verifyEmailOtp,
  verifyGoogleCredential,
  verifyOtp,
} from "./api";
import { isLinkRequired, isPhoneRequired } from "./types";
import type { ExistingMethod } from "./types";
import { useAuth } from "./AuthContext";
import { ThemeToggle } from "../../components/ThemeToggle";
import { ApiError } from "../../lib/apiClient";

type Step = "landing" | "email" | "phone" | "otp" | "email_otp" | "link_account";

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

  // Inline email-OTP step (2026-08-17 remove-password-auth handoff spec §7):
  // shared by two flows, distinguished by emailOtpFlow. "signup": set when
  // signup_email returns email_otp_required -- runs BEFORE the phone gate,
  // no account exists yet, only a pending_identity_verifications row (has
  // an emailOtpToken). "login": set when an existing user requests a login
  // code -- no pending record at all (emailOtpToken stays null), verify
  // returns a session directly.
  const [emailOtpToken, setEmailOtpToken] = useState<string | null>(null);
  const [emailOtpEmail, setEmailOtpEmail] = useState<string>("");
  const [emailOtpFlow, setEmailOtpFlow] = useState<"signup" | "login">("signup");

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
    setEmailOtpToken(null);
    setEmailOtpEmail("");
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

  const handleEmailSignup = async (email: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await signupEmail(email);
      // signupEmail always resolves to email_otp_required — transitions to
      // the inline email-OTP step, which runs before the mandatory phone
      // gate for a brand-new signup.
      setEmailOtpFlow("signup");
      setEmailOtpToken(result.email_otp_required.token);
      setEmailOtpEmail(result.email_otp_required.prefill_email);
      goToStep("email_otp");
      setDevOtp(result.email_otp_required.otp);
    } catch (err) {
      setError(errorMessage(err, "Couldn't create your account. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailLoginRequest = async (email: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestEmailOtp(email);
      // No pending record at all for a login attempt -- verify below is
      // told which flow this is via emailOtpFlow, not by token presence.
      setEmailOtpFlow("login");
      setEmailOtpToken(null);
      setEmailOtpEmail(email);
      goToStep("email_otp");
      setDevOtp(result.otp);
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
      const result = await verifyEmailOtp(emailOtpEmail, otp, emailOtpToken ?? undefined);
      if (emailOtpFlow === "login") {
        if (!("session_token" in result)) {
          setError("Something unexpected happened. Please try again.");
          return;
        }
        await login(result.session_token);
        return;
      }
      // Signup flow: success hands back the same PhoneRequiredResponse
      // shape the phone gate already knows how to consume.
      if (!("phone_required" in result)) {
        setError("Something unexpected happened. Please try again.");
        return;
      }
      setPhoneGateToken(result.phone_required.token);
      setPhoneGatePrefillEmail(result.phone_required.prefill_email);
      goToStep("phone");
    } catch (err) {
      setError(errorMessage(err, "That code didn't work. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailOtpResend = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestEmailOtp(emailOtpEmail);
      setDevOtp(result.otp);
    } catch (err) {
      setError(errorMessage(err, "Couldn't resend the code. Try again."));
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
                  onLogin={handleEmailLoginRequest}
                  onSignup={handleEmailSignup}
                  onBack={() => goToStep("landing")}
                  submitting={submitting}
                  error={error}
                />
              </div>
            )}

            {step === "email_otp" && (
              <div key="step-email-otp" className="animate-in fade-in duration-200">
                <OtpVerify
                  phoneNumber={emailOtpEmail}
                  channel="email"
                  onSubmit={handleEmailOtpSubmit}
                  onResend={handleEmailOtpResend}
                  onBack={() => goToStep("email")}
                  submitting={submitting}
                  error={error}
                  devOtp={devOtp}
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
