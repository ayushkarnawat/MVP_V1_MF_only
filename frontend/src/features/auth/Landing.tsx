import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowRight, Loader2, Mail, Phone } from "lucide-react";
import { GoogleButton } from "./GoogleButton";
import { cn } from "@/lib/utils";
import { isAccountExistsError, validateIndianPhone } from "./validation";
import { HandDrawnUnderline } from "@/components/HandDrawnUnderline";

import { AuthIllustration } from "./AuthIllustration";
import { ConsentCheckbox } from "../legal/ConsentCheckbox";
import type { LegalDocument } from "../legal/types";

interface LandingProps {
  initialMode?: "login" | "signup";
  onModeChange?: (mode: "login" | "signup") => void;
  onSubmitPhone: (phoneNumber: string) => void;
  onSelectEmail: () => void;
  onSelectPhone: () => void;
  onGoogleCredential: (idToken: string) => void;
  error: string | null;
  submitting: boolean;
  consentChecked: boolean;
  onConsentChange: (v: boolean) => void;
  legalDocs: LegalDocument[] | null;
  legalLoadError?: boolean;
  onLegalRetry?: () => void;
}

export function Landing({
  initialMode = "signup",
  onModeChange,
  onSubmitPhone,
  onSelectEmail,
  onSelectPhone,
  onGoogleCredential,
  error,
  submitting,
  consentChecked,
  onConsentChange,
  legalDocs,
  legalLoadError,
  onLegalRetry,
}: LandingProps) {
  // Mode state initialized from prop to preserve auth context on back navigation
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isTouched, setIsTouched] = useState(false);

  const goToLogin = () => {
    setMode("login");
    onModeChange?.("login");
  };

  const handlePhoneChange = (value: string) => {
    setPhoneNumber(value);
    if (isTouched || validationError) {
      const res = validateIndianPhone(value);
      setValidationError(res.isValid ? null : res.error);
    }
  };

  const handlePhoneBlur = () => {
    setIsTouched(true);
    if (phoneNumber.trim().length > 0) {
      const res = validateIndianPhone(phoneNumber);
      setValidationError(res.isValid ? null : res.error);
    }
  };

  const handlePhoneSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsTouched(true);
    const res = validateIndianPhone(phoneNumber);
    if (!res.isValid) {
      setValidationError(res.error);
      return;
    }
    setValidationError(null);
    onSubmitPhone(res.normalized);
  };

  return (
    <div className="w-full max-w-md mx-auto text-left box-border py-1">
      {/* Hand-drawn mobile illustration */}
      <div className="lg:hidden flex items-center justify-center h-[125px] xs:h-[142px] sm:h-[160px] mb-5 xs:mb-6 sm:mb-7">
        <AuthIllustration
          variant={mode === "signup" ? "create_account" : "welcome_back"}
          className="h-full mx-auto"
        />
      </div>

      {/* 1. Header with direct flow to input / buttons */}
      <div className="mb-5 sm:mb-6">
        <h1 className="font-display font-bold text-[30px] xs:text-[32px] sm:text-[36px] text-[var(--color-ink)] tracking-tight leading-[1.08]">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
      </div>

      {/* 2. Server Authentication Error Alert */}
      {error && !validationError && (
        <div className="space-y-2 mb-3.5">
          <div
            role="alert"
            className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)] text-xs text-[var(--color-negative)] font-medium font-body animate-in fade-in duration-150"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
          {isAccountExistsError(error) && (
            <button
              type="button"
              onClick={goToLogin}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-[#22C55E]/10 border border-[#22C55E]/30 text-xs font-bold text-[#22C55E] hover:bg-[#22C55E]/15 transition-colors cursor-pointer animate-in fade-in duration-150"
            >
              Log in instead
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 3. Form Content */}
      {mode === "signup" ? (
        /* Sign Up Experience (Default) -- phone-first, sequential
           (auth-flow-redesign, 2026-09-28; merged onto Landing directly per
           2026-09-29 follow-up): the phone number input and its submit
           action live right here, no separate "Continue with phone" click
           and no intermediate screen -- no email input and no Google button
           on this screen either. Google's backend path is untouched, just
           not offered here. */
        <div key="signup-mode" className="space-y-4 animate-in fade-in duration-200">
          <form onSubmit={handlePhoneSubmit} noValidate className="space-y-3.5">
            <div className="space-y-1.5">
              <label htmlFor="signup-phone-input" className="text-xs font-semibold text-[var(--color-ink)] block font-body">
                Mobile number
              </label>
              <div
                className={cn(
                  "flex items-center rounded-2xl bg-white/90 dark:bg-[var(--color-surface)] border border-[var(--color-border)] transition-all h-13 sm:h-14 min-h-[50px] sm:min-h-[54px] shadow-xs",
                  validationError
                    ? "border-[var(--color-negative)] focus-within:border-[var(--color-negative)] focus-within:ring-2 focus-within:ring-[var(--color-negative)]/20"
                    : "focus-within:border-[#22C55E] focus-within:ring-2 focus-within:ring-[#22C55E]/20",
                )}
              >
                <div className="px-3.5 sm:px-4 flex items-center gap-1.5 border-r border-[var(--color-border)] text-xs font-medium text-[var(--color-ink)] select-none bg-[var(--color-surface)]/50 h-full rounded-l-2xl flex-shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">IN</span>
                  <span className="font-semibold">+91</span>
                </div>
                <input
                  id="signup-phone-input"
                  type="tel"
                  placeholder="98765 43210"
                  value={phoneNumber}
                  onChange={(event) => handlePhoneChange(event.target.value)}
                  onBlur={handlePhoneBlur}
                  className="flex-1 min-w-0 bg-transparent px-3.5 text-sm text-[var(--color-ink)] placeholder:text-[#5C5C5C]/50 dark:placeholder:text-[#A3A3A3]/50 focus:outline-none focus:ring-0 focus:border-transparent outline-none border-none shadow-none font-mono rounded-r-2xl"
                  autoFocus
                />
              </div>
              {/* Direct Inline Field Validation Error */}
              {validationError && (
                <div
                  role="alert"
                  className="flex items-center gap-1.5 text-xs text-[var(--color-negative)] font-medium font-body pt-0.5 animate-in fade-in duration-150"
                >
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}
            </div>

            <ConsentCheckbox
              checked={consentChecked}
              onChange={onConsentChange}
              docs={legalDocs}
              types={["terms_of_service", "privacy_policy"]}
              loadError={legalLoadError}
              onRetry={onLegalRetry}
            />

            <Button
              type="submit"
              disabled={submitting || !phoneNumber.trim() || !consentChecked}
              className="w-full h-14 sm:h-[58px] px-8 rounded-full font-bold text-[15px] sm:text-base bg-[#22C55E] hover:bg-[#22C55E]/90 dark:bg-[#22C55E] dark:hover:bg-[#22C55E]/90 text-white shadow-xl shadow-[#22C55E]/25 dark:shadow-[#22C55E]/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5 border border-[#22C55E]/40 min-h-[52px] mt-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <span>Get OTP</span>
                  <ArrowRight className="h-4.5 w-4.5" />
                </>
              )}
            </Button>
          </form>

          {/* Toggle Helper Link */}
          <div className="text-center text-xs text-[#5C5C5C] dark:text-[#A3A3A3] pt-1.5 font-body">
            <span>Already have an account? </span>
            <button
              type="button"
              onClick={goToLogin}
              className="font-bold text-[#22C55E] hover:underline cursor-pointer transition-colors focus-visible:outline-none py-1"
            >
              <HandDrawnUnderline>Log in</HandDrawnUnderline>
            </button>
          </div>
        </div>
      ) : (
        /* Log In Experience */
        <div key="login-mode" className="space-y-3.5 animate-in fade-in duration-200">
          <GoogleButton onCredential={onGoogleCredential} />

          <Button
            type="button"
            variant="outline"
            onClick={onSelectEmail}
            disabled={submitting}
            className="w-full h-13 sm:h-14 rounded-full border border-[var(--color-border)] bg-white/70 dark:bg-white/5 text-[var(--color-ink)] hover:bg-black/5 dark:hover:bg-white/10 font-semibold text-sm gap-2.5 cursor-pointer active:scale-[0.98] transition-all min-h-[50px] flex items-center justify-center font-body shadow-xs"
          >
            <Mail className="h-4 w-4 text-[var(--color-accent)]" />
            <span>Continue with Email</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onSelectPhone}
            disabled={submitting}
            className="w-full h-13 sm:h-14 rounded-full border border-[var(--color-border)] bg-white/70 dark:bg-white/5 text-[var(--color-ink)] hover:bg-black/5 dark:hover:bg-white/10 font-semibold text-sm gap-2.5 cursor-pointer active:scale-[0.98] transition-all min-h-[50px] flex items-center justify-center font-body shadow-xs"
          >
            <Phone className="h-4 w-4 text-[var(--color-accent)]" />
            <span>Continue with Phone</span>
          </Button>

          {/* Toggle Helper Link */}
          <div className="text-center text-xs text-[#5C5C5C] dark:text-[#A3A3A3] pt-1.5 font-body">
            <span>Don&apos;t have an account? </span>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                onModeChange?.("signup");
              }}
              className="font-bold text-[#22C55E] hover:underline cursor-pointer transition-colors focus-visible:outline-none py-1"
            >
              <HandDrawnUnderline>Sign up</HandDrawnUnderline>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
