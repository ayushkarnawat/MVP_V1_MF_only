import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { isEmailRequired, isLinkRequired, isPhoneRequired } from "./types";
import type { ExistingMethod } from "./types";
import { useAuth } from "./AuthContext";
import { acceptedFor, isConsentRequired } from "../legal/api";
import { ConsentCheckbox } from "../legal/ConsentCheckbox";
import { useLegalDocuments } from "../legal/useLegalDocuments";
import { formatAuthErrorMessage, isExpiredVerificationError } from "./validation";

type Step = AuthStep;

interface LinkInfo {
  token: string;
  matchedEmail: string;
  existingMethod: ExistingMethod;
}

const STALE_TERMS_MESSAGE = "Our terms were just updated. Please review and tick the box again.";
const CONSENT_TYPES = ["terms_of_service", "privacy_policy"] as const;

function errorMessage(err: unknown, fallback: string): string {
  return formatAuthErrorMessage(err, fallback);
}

export interface AuthEntryFlowProps {
  initialMode?: "login" | "signup";
  initialStep?: Step;
}

export function AuthEntryFlow({
  initialMode = "signup",
  initialStep = "landing",
}: AuthEntryFlowProps = {}) {
  const { login } = useAuth();
  const { docs, error: docsError, refetch } = useLegalDocuments();
  const [consent, setConsent] = useState(false);
  const accepted = docs ? acceptedFor(docs, [...CONSENT_TYPES]) : undefined;
  // Set when a Google tap returns consent_required (unknown Google account):
  // holds the id_token so Continue can retry it with accepted_documents.
  const [googleConsentToken, setGoogleConsentToken] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(initialStep);
  const [authMode, setAuthMode] = useState<"login" | "signup">(initialMode);
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  // Mandatory phone-gate state (Design Spec §1): set when a Google/email
  // verification returns phone_required. Reuses the existing "phone"/"otp"
  // steps — no extra Step value needed.
  const [phoneGateToken, setPhoneGateToken] = useState<string | null>(null);
  const [phoneGatePrefillEmail, setPhoneGatePrefillEmail] = useState<string | null>(null);

  // Phone-first email gate (auth-flow-redesign FR-3/FR-4, 2026-09-28): set
  // when a phone verification returns email_required -- the mirror image
  // of phoneGateToken/phoneGatePrefillEmail above, for the opposite
  // direction.
  const [emailGateToken, setEmailGateToken] = useState<string | null>(null);
  // Captured for parity with phoneGatePrefillEmail but not yet rendered --
  // EmailEntry's emailGate context has no prefill display (Task 11 didn't
  // add one); write-only until/unless that's added.
  const [, setEmailGatePrefillPhone] = useState<string | null>(null);

  // Inline email-OTP step (2026-08-17 remove-password-auth handoff spec §7):
  // shared by two flows, distinguished by emailOtpFlow. "signup": set when
  // signup_email returns email_otp_required -- runs BEFORE the phone gate,
  // no account exists yet, only a pending_identity_verifications row (has
  // an emailOtpToken). "login": set when an existing user requests a login
  // code -- no pending record at all (emailOtpToken stays null), verify
  // returns a session directly.
  const [emailOtpToken, setEmailOtpToken] = useState<string | null>(null);
  const [emailOtpEmail, setEmailOtpEmail] = useState<string>("");
  const [emailOtpFlow, setEmailOtpFlow] = useState<"signup" | "login" | "phone_first">("signup");

  // Account-linking state (Design Spec §4): set when a verification
  // returns link_required.
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);

  const goToStep = (next: Step) => {
    setError(null);
    setDevOtp(null);
    setStep(next);
  };

  const handleSelectEmail = () => {
    setAuthMode("login");
    setPhoneGateToken(null);
    setPhoneGatePrefillEmail(null);
    setEmailGateToken(null);
    setEmailGatePrefillPhone(null);
    setEmailOtpToken(null);
    setEmailOtpEmail("");
    goToStep("email");
  };

  const handleSelectPhone = () => {
    setAuthMode("login");
    setPhoneGateToken(null);
    setPhoneGatePrefillEmail(null);
    setEmailGateToken(null);
    setEmailGatePrefillPhone(null);
    goToStep("phone");
  };

  // "Log in" shortcut from an "already exists" error (email signup 409,
  // phone-gate 409) -- drops back to Landing in login mode rather than
  // leaving the caller stuck on a dead-end signup step.
  const handleGoToLogin = () => {
    setAuthMode("login");
    setPhoneGateToken(null);
    setPhoneGatePrefillEmail(null);
    setEmailGateToken(null);
    setEmailGatePrefillPhone(null);
    setEmailOtpToken(null);
    setEmailOtpEmail("");
    goToStep("landing");
  };

  // "Sign up instead" shortcut from a login-time "no account found" error.
  const handleGoToSignup = () => {
    setAuthMode("signup");
    setEmailOtpToken(null);
    setEmailOtpEmail("");
    goToStep("landing");
  };

  // I2 fix (final review, 2026-09-28): a dead pending_identity_verifications
  // token (expired, or already used) previously left the caller stuck on
  // the gate screen forever -- neither gate screen has a Back button
  // (Design Spec §1's mandatory-step intent), and the existing "Log in
  // instead" shortcuts only fire for an *account-exists* error, not an
  // expired token. Drops back to Landing with the message still shown,
  // mirroring LinkAccountPrompt's own recovery pattern below.
  const handleVerificationExpired = (message: string) => {
    setPhoneGateToken(null);
    setPhoneGatePrefillEmail(null);
    setEmailGateToken(null);
    setEmailGatePrefillPhone(null);
    setEmailOtpToken(null);
    setEmailOtpEmail("");
    goToStep("landing");
    setError(message);
  };

  // R9: a consent_required at the FINAL sign-up step means the pending
  // sign-up can't complete (the terms changed mid-flow) -- restart from a
  // fresh Landing in signup mode so the user re-reads and re-ticks.
  const restartSignupForConsent = async () => {
    setPhoneGateToken(null);
    setPhoneGatePrefillEmail(null);
    setEmailGateToken(null);
    setEmailGatePrefillPhone(null);
    setEmailOtpToken(null);
    setEmailOtpEmail("");
    setGoogleConsentToken(null);
    setAuthMode("signup");
    setConsent(false);
    goToStep("landing");
    await refetch();
    setError(STALE_TERMS_MESSAGE);
  };

  const handlePhoneSubmit = async (phone: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestOtp(phone, phoneGateToken ?? undefined, phoneGateToken ? undefined : authMode);
      setIdentifier(phone);
      goToStep("otp");
      setDevOtp(result.otp);
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the code. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  // Landing's own phone input, signup mode (2026-09-29 follow-up): submits
  // straight from Landing -- no separate "Continue with phone" click, no
  // intermediate "phone" step. Clears any stale gate tokens from an earlier
  // abandoned attempt before requesting the code, same as the old
  // handleSignupPhoneStart did before navigating.
  const handleSignupPhoneSubmit = (phone: string) => {
    setAuthMode("signup");
    setPhoneGateToken(null);
    setPhoneGatePrefillEmail(null);
    setEmailGateToken(null);
    setEmailGatePrefillPhone(null);
    return handlePhoneSubmit(phone);
  };

  const handleEmailSignup = async (email: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await signupEmail(email, consent ? accepted : undefined);
      setAuthMode("signup");
      // signupEmail always resolves to email_otp_required — transitions to
      // the inline email-OTP step, which runs before the mandatory phone
      // gate for a brand-new signup.
      setEmailOtpFlow("signup");
      setEmailOtpToken(result.email_otp_required.token);
      setEmailOtpEmail(result.email_otp_required.prefill_email);
      goToStep("email_otp");
      setDevOtp(result.email_otp_required.otp);
    } catch (err) {
      if (isConsentRequired(err)) {
        setError("Please agree to the Terms & Conditions and Privacy Policy to continue.");
        return;
      }
      setError(errorMessage(err, "Couldn't create your account. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailLoginRequest = async (email: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestEmailOtp(email, undefined, "login");
      setAuthMode("login");
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

  const handleEmailGateSubmit = async (email: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestEmailOtp(email, emailGateToken ?? undefined);
      setEmailOtpFlow("phone_first");
      setEmailOtpEmail(email);
      goToStep("email_otp");
      setDevOtp(result.otp);
    } catch (err) {
      const message = errorMessage(err, "Couldn't send the code. Try again.");
      if (isExpiredVerificationError(message)) {
        handleVerificationExpired(message);
        return;
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailOtpSubmit = async (otp: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyEmailOtp(
        emailOtpEmail,
        otp,
        emailOtpFlow === "phone_first" ? emailGateToken ?? undefined : emailOtpToken ?? undefined,
      );
      if ("session_token" in result) {
        await login(result.session_token);
        return;
      }
      if ("phone_required" in result) {
        // Only reachable for the email/Google-first direction -- phone-first's
        // email step always completes signup directly (session_token above).
        setPhoneGateToken(result.phone_required.token);
        setPhoneGatePrefillEmail(result.phone_required.prefill_email);
        goToStep("phone");
        return;
      }
      setError("Something unexpected happened. Please try again.");
    } catch (err) {
      if (isConsentRequired(err)) {
        await restartSignupForConsent();
        return;
      }
      const message = errorMessage(err, "That code didn't work. Try again.");
      if (isExpiredVerificationError(message)) {
        handleVerificationExpired(message);
        return;
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailOtpResend = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestEmailOtp(
        emailOtpEmail,
        emailOtpFlow === "phone_first" ? emailGateToken ?? undefined : undefined,
        emailOtpFlow === "login" ? "login" : undefined,
      );
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
      // Consent travels only with a phone-first sign-up (no pending token);
      // logins and the phone-gate completion never send it.
      const sendConsent = authMode === "signup" && !phoneGateToken && accepted;
      const result = sendConsent
        ? await verifyOtp(identifier, otp, undefined, "signup", accepted)
        : await verifyOtp(identifier, otp, phoneGateToken ?? undefined, phoneGateToken ? undefined : authMode);
      if (isEmailRequired(result)) {
        setEmailOtpFlow("phone_first");
        setEmailGateToken(result.email_required.token);
        setEmailGatePrefillPhone(result.email_required.prefill_phone);
        goToStep("email");
        return;
      }
      if (isLinkRequired(result) || isPhoneRequired(result)) {
        setError("Something unexpected happened. Please try again.");
        return;
      }
      await login(result.session_token);
    } catch (err) {
      if (isConsentRequired(err)) {
        await restartSignupForConsent();
        return;
      }
      setError(errorMessage(err, "That code didn't work. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleCredential = async (idToken: string, acceptedOverride?: typeof accepted) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = acceptedOverride
        ? await verifyGoogleCredential(idToken, undefined, acceptedOverride)
        : await verifyGoogleCredential(idToken);
      setGoogleConsentToken(null);
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
      if (isEmailRequired(result)) {
        // Google's backend path is unchanged by this redesign and never
        // actually returns this -- narrows the shared OtpVerifyResult type.
        setError("Something unexpected happened. Please try again.");
        return;
      }
      await login(result.session_token);
    } catch (err) {
      if (isConsentRequired(err)) {
        if (!acceptedOverride) {
          // Unknown Google account: ask for consent, then retry the same token.
          setConsent(false);
          setGoogleConsentToken(idToken);
        } else {
          await refetch();
          setConsent(false);
          setError(STALE_TERMS_MESSAGE);
        }
        return;
      }
      setError(errorMessage(err, "Google sign-in didn't work. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const renderGoogleConsent = (token: string) => (
    <div className="w-full max-w-md mx-auto text-left space-y-4 py-1">
      <h1 className="font-display font-bold text-[30px] sm:text-[36px] text-[var(--color-ink)] tracking-tight leading-[1.08]">
        Create your Unifolio account
      </h1>
      <p className="text-sm text-[#5C5C5C] dark:text-[#A3A3A3] font-body">It looks like you’re new here.</p>
      {error && (
        <p role="alert" className="text-xs font-medium text-[var(--color-negative)] font-body">
          {error}
        </p>
      )}
      <ConsentCheckbox
        checked={consent}
        onChange={setConsent}
        docs={docs}
        types={[...CONSENT_TYPES]}
        loadError={docsError}
        onRetry={() => void refetch()}
      />
      <Button
        type="button"
        disabled={submitting || !consent || !accepted}
        onClick={() => void handleGoogleCredential(token, accepted)}
        className="w-full h-14 rounded-full font-bold text-base bg-[#22C55E] hover:bg-[#22C55E]/90 text-white cursor-pointer"
      >
        Continue
      </Button>
      <button
        type="button"
        onClick={() => {
          setGoogleConsentToken(null);
          setConsent(false);
          setError(null);
        }}
        className="block mx-auto text-xs font-bold text-[#22C55E] hover:underline cursor-pointer py-1"
      >
        Back
      </button>
    </div>
  );

  const renderFormSlot = () => {
    if (googleConsentToken) return renderGoogleConsent(googleConsentToken);
    switch (step) {
      case "landing":
        return (
          <Landing
            initialMode={authMode}
            onModeChange={(newMode) => {
              setError(null);
              setDevOtp(null);
              setAuthMode(newMode);
            }}
            onSubmitPhone={handleSignupPhoneSubmit}
            onSelectEmail={handleSelectEmail}
            onSelectPhone={handleSelectPhone}
            onGoogleCredential={handleGoogleCredential}
            error={error}
            submitting={submitting}
            consentChecked={consent}
            onConsentChange={setConsent}
            legalDocs={docs}
            legalLoadError={docsError}
            onLegalRetry={() => void refetch()}
          />
        );

      case "email":
        return emailGateToken ? (
          <EmailEntry
            context="emailGate"
            onSignup={handleEmailGateSubmit}
            onLogin={handleEmailGateSubmit}
            submitting={submitting}
            error={error}
          />
        ) : (
          <EmailEntry
            context="login"
            onLogin={handleEmailLoginRequest}
            onSignup={handleEmailSignup}
            onGoToSignup={handleGoToSignup}
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
            onBack={() => {
              if (emailOtpFlow === "login" || emailOtpFlow === "phone_first" || authMode === "login") {
                goToStep("email");
              } else {
                goToStep("landing");
              }
            }}
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
            onGoToLogin={phoneGateToken ? handleGoToLogin : undefined}
            onGoToSignup={phoneGateToken ? undefined : handleGoToSignup}
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
            onGoToLogin={phoneGateToken ? handleGoToLogin : undefined}
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

  // Roadmap progression logic:
  // Login flow (2 Milestones): Step 1 Phone / Email entry (0) -> Step 2 OTP verification (1)
  // Signup flow (4 Milestones): Landing (0) -> Email (1) -> Phone (2) -> Phone OTP (3)
  const getStepIndex = (): number => {
    if (authMode === "login") {
      switch (step) {
        case "landing":
        case "email":
        case "phone":
          return 0;

        case "email_otp":
        case "otp":
          return 1;

        default:
          return 0;
      }
    }

    switch (step) {
      case "landing":
        return 0;

      case "email":
        if (emailGateToken) {
          // I6 fix (final review, 2026-09-28): was 2, colliding with
          // phone-first's own "otp" step below -- the indicator never
          // moved between phone-OTP and the email gate. Distinct index:
          // phone(0) -> phone otp(1) -> email gate(2) -> email otp(3).
          return 2;
        }
        return 1;

      case "email_otp":
        if (emailOtpFlow === "phone_first") {
          return 3;
        }
        return emailOtpFlow === "signup" ? 1 : 2;

      case "phone":
        if (phoneGateToken) {
          return emailOtpEmail ? 2 : 1;
        }
        // Defensive fallback only: Landing's own phone input (2026-09-29
        // follow-up) submits straight to handlePhoneSubmit without ever
        // navigating to this step for phone-first signup, so step is never
        // actually "phone" here in signup mode without a phoneGateToken.
        return 0;

      case "otp":
        if (phoneGateToken) {
          return emailOtpEmail ? 3 : 2;
        }
        return 1; // phone-first's own OTP step (reached directly from Landing)

      case "link_account":
        return 3;

      default:
        return 0;
    }
  };

  return (
    <AuthShell
      step={step}
      stepIndex={getStepIndex()}
      authMode={authMode}
      formSlot={renderFormSlot()}
      visualSlot={<AuthShowcasePanel step={step} />}
    />
  );
}
