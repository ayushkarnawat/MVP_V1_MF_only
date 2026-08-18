import { useState } from "react";
import { Landing } from "./Landing";
import { EmailEntry } from "./EmailEntry";
import { PhoneEntry } from "./PhoneEntry";
import { OtpVerify } from "./OtpVerify";
import { LinkAccountPrompt } from "./LinkAccountPrompt";
import { AuthShowcasePanel } from "./AuthShowcasePanel";
import { AuthShell } from "./AuthShell";
import type { AuthStep } from "./AuthShell";
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
import { ApiError } from "../../lib/apiClient";

type Step = AuthStep;

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

  const renderFormSlot = () => {
    switch (step) {
      case "landing":
        return (
          <Landing
            onSignup={handleEmailSignup}
            onSelectEmail={handleSelectEmail}
            onSelectPhone={handleSelectPhone}
            onGoogleCredential={handleGoogleCredential}
            error={error}
            submitting={submitting}
          />
        );

      case "email":
        return (
          <EmailEntry
            context="login"
            onLogin={handleEmailLoginRequest}
            onSignup={handleEmailSignup}
            onBack={() => goToStep("landing")}
            submitting={submitting}
            error={error}
          />
        );

      case "email_otp":
        return (
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
        );

      case "phone":
        return (
          <PhoneEntry
            context={phoneGateToken ? "phoneGate" : "primary"}
            phoneGatePrefillEmail={phoneGatePrefillEmail}
            onSubmit={handlePhoneSubmit}
            onBack={phoneGateToken ? undefined : () => goToStep("landing")}
            submitting={submitting}
            error={error}
          />
        );

      case "otp":
        return (
          <OtpVerify
            phoneNumber={identifier}
            onSubmit={handlePhoneOtpSubmit}
            onResend={() => goToStep("phone")}
            onBack={() => goToStep("phone")}
            submitting={submitting}
            error={error}
            devOtp={devOtp}
          />
        );

      case "link_account":
        return linkInfo ? (
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
        ) : null;
    }
  };

  return (
    <AuthShell
      step={step}
      formSlot={renderFormSlot()}
      visualSlot={<AuthShowcasePanel step={step} />}
    />
  );
}
