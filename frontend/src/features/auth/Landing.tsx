import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowRight, Mail, Phone } from "lucide-react";
import { GoogleButton } from "./GoogleButton";
import { isAccountExistsError } from "./validation";
import { HandDrawnUnderline } from "@/components/HandDrawnUnderline";

import { AuthIllustration } from "./AuthIllustration";

interface LandingProps {
  initialMode?: "login" | "signup";
  onModeChange?: (mode: "login" | "signup") => void;
  onStartPhoneSignup: () => void;
  onSelectEmail: () => void;
  onSelectPhone: () => void;
  onGoogleCredential: (idToken: string) => void;
  error: string | null;
  submitting: boolean;
}

export function Landing({
  initialMode = "signup",
  onModeChange,
  onStartPhoneSignup,
  onSelectEmail,
  onSelectPhone,
  onGoogleCredential,
  error,
  submitting,
}: LandingProps) {
  // Mode state initialized from prop to preserve auth context on back navigation
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  // Signup mode no longer collects email input; nothing sets this. Kept as a
  // constant (rather than removed) so the shared error-alert guard below
  // doesn't need a mode-specific branch.
  const validationError: string | null = null;

  const goToLogin = () => {
    setMode("login");
    onModeChange?.("login");
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
           (auth-flow-redesign, 2026-09-28): a single CTA into the existing
           phone step, no email input and no Google button on this screen.
           Google's backend path is untouched, just not offered here. */
        <div key="signup-mode" className="space-y-4 animate-in fade-in duration-200">
          <Button
            type="button"
            onClick={onStartPhoneSignup}
            disabled={submitting}
            aria-label="Continue with phone"
            className="w-full h-14 sm:h-[58px] px-8 rounded-full font-bold text-[15px] sm:text-base bg-[#22C55E] hover:bg-[#22C55E]/90 dark:bg-[#22C55E] dark:hover:bg-[#22C55E]/90 text-white shadow-xl shadow-[#22C55E]/25 dark:shadow-[#22C55E]/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5 border border-[#22C55E]/40 min-h-[52px]"
          >
            <span>Continue with phone</span>
            <ArrowRight className="h-4.5 w-4.5" />
          </Button>

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
