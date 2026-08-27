import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowRight, Loader2, Mail, Phone } from "lucide-react";
import { GoogleButton } from "./GoogleButton";
import { validateEmail } from "./validation";
import { cn } from "@/lib/utils";
import { HandDrawnUnderline } from "@/components/HandDrawnUnderline";

import { AuthIllustration } from "./AuthIllustration";

interface LandingProps {
  initialMode?: "login" | "signup";
  onModeChange?: (mode: "login" | "signup") => void;
  onSignup: (email: string) => void;
  onSelectEmail: () => void;
  onSelectPhone: () => void;
  onGoogleCredential: (idToken: string) => void;
  error: string | null;
  submitting: boolean;
}

export function Landing({
  initialMode = "signup",
  onModeChange,
  onSignup,
  onSelectEmail,
  onSelectPhone,
  onGoogleCredential,
  error,
  submitting,
}: LandingProps) {
  // Mode state initialized from prop to preserve auth context on back navigation
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isTouched, setIsTouched] = useState(false);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (isTouched || validationError) {
      const res = validateEmail(value);
      setValidationError(res.isValid ? null : res.error);
    }
  };

  const handleEmailBlur = () => {
    setIsTouched(true);
    if (email.trim().length > 0) {
      const res = validateEmail(email);
      setValidationError(res.isValid ? null : res.error);
    }
  };

  const handleSignupSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsTouched(true);
    const res = validateEmail(email);
    if (!res.isValid) {
      setValidationError(res.error);
      return;
    }
    setValidationError(null);
    onSignup(email.trim());
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
        <div
          role="alert"
          className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)] text-xs text-[var(--color-negative)] font-medium font-body animate-in fade-in duration-150 mb-3.5"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 3. Form Content */}
      {mode === "signup" ? (
        /* Sign Up Experience (Default) */
        <div key="signup-mode" className="space-y-4 animate-in fade-in duration-200">
          <form onSubmit={handleSignupSubmit} noValidate className="space-y-3.5">
            <div className="space-y-1.5">
              <label htmlFor="signup-email-input" className="text-xs font-semibold text-[var(--color-ink)] block font-body">
                Email address
              </label>
              <input
                id="signup-email-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => handleEmailChange(event.target.value)}
                onBlur={handleEmailBlur}
                className={cn(
                  "w-full h-13 sm:h-14 min-h-[50px] sm:min-h-[54px] rounded-2xl bg-white/90 dark:bg-[var(--color-surface)] border border-[var(--color-border)] px-4 text-sm text-[var(--color-ink)] placeholder:text-[#5C5C5C]/50 dark:placeholder:text-[#A3A3A3]/50 focus:outline-none focus-visible:outline-none transition-all font-body box-border shadow-xs",
                  validationError
                    ? "border-[var(--color-negative)] focus:border-[var(--color-negative)] focus:ring-2 focus:ring-[var(--color-negative)]/20"
                    : "focus:border-[#22C55E] focus:ring-2 focus:ring-[#22C55E]/20",
                )}
                autoFocus
              />
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

            <Button
              type="submit"
              disabled={submitting || !email.trim()}
              aria-label="Create account"
              className="w-full h-14 sm:h-[58px] px-8 rounded-full font-bold text-[15px] sm:text-base bg-[#22C55E] hover:bg-[#22C55E]/90 dark:bg-[#22C55E] dark:hover:bg-[#22C55E]/90 text-white shadow-xl shadow-[#22C55E]/25 dark:shadow-[#22C55E]/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5 border border-[#22C55E]/40 min-h-[52px] mt-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>Create account</span>
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
              onClick={() => {
                setValidationError(null);
                setMode("login");
                onModeChange?.("login");
              }}
              className="font-bold text-[#22C55E] hover:underline cursor-pointer transition-colors focus-visible:outline-none py-1"
            >
              <HandDrawnUnderline>Log in</HandDrawnUnderline>
            </button>
          </div>

          {/* Subtle "or" Divider */}
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-[var(--color-border)]/60" />
            <span className="flex-shrink mx-3 text-[11px] font-medium uppercase tracking-wider text-[#5C5C5C]/70 dark:text-[#A3A3A3]/70">
              or
            </span>
            <div className="flex-grow border-t border-[var(--color-border)]/60" />
          </div>

          {/* Alternative Methods */}
          <div className="space-y-2.5">
            <GoogleButton onCredential={onGoogleCredential} />
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
                setValidationError(null);
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
