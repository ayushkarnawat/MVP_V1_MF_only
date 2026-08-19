import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowRight, Loader2, Mail, Phone } from "lucide-react";
import { GoogleButton } from "./GoogleButton";
import { validateEmail } from "./validation";
import { cn } from "@/lib/utils";

interface LandingProps {
  onSignup: (email: string) => void;
  onSelectEmail: () => void;
  onSelectPhone: () => void;
  onGoogleCredential: (idToken: string) => void;
  error: string | null;
  submitting: boolean;
}

export function Landing({
  onSignup,
  onSelectEmail,
  onSelectPhone,
  onGoogleCredential,
  error,
  submitting,
}: LandingProps) {
  // Sign up is the default state on application launch
  const [mode, setMode] = useState<"login" | "signup">("signup");
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
      {/* 1. Header with cohesive spacing to email field */}
      <div className="mb-4 sm:mb-5">
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-[var(--color-ink)] tracking-tight">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        {mode === "login" && (
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed font-body mt-1">
            Access your consolidated investments and portfolio analytics.
          </p>
        )}
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
                  "w-full h-11 sm:h-12 min-h-[44px] sm:min-h-[48px] rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] px-3.5 text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none transition-all font-body",
                  validationError
                    ? "border-[var(--color-negative)] focus:border-[var(--color-negative)] focus:ring-2 focus:ring-[var(--color-negative)]/20"
                    : "focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20",
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
              className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90 text-white font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px] mt-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>Create account</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </form>

          {/* Toggle Helper Link */}
          <div className="text-center text-xs text-[var(--color-text-secondary)] pt-0.5 font-body">
            <span>Already have an account? </span>
            <button
              type="button"
              onClick={() => {
                setValidationError(null);
                setMode("login");
              }}
              className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-accent)] underline decoration-[var(--color-accent)] decoration-[1.5px] underline-offset-[4px] cursor-pointer transition-colors"
            >
              Log in
            </button>
          </div>

          {/* Subtle "or" Divider */}
          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-[var(--color-border)]/80" />
            <span className="flex-shrink mx-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              or
            </span>
            <div className="flex-grow border-t border-[var(--color-border)]/80" />
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
            className="w-full h-11 sm:h-12 rounded-xl border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-bg)] font-semibold text-xs sm:text-sm gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px] flex items-center justify-center font-body"
          >
            <Mail className="h-4 w-4 text-[var(--color-accent)]" />
            <span>Continue with Email</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onSelectPhone}
            disabled={submitting}
            className="w-full h-11 sm:h-12 rounded-xl border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-bg)] font-semibold text-xs sm:text-sm gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px] flex items-center justify-center font-body"
          >
            <Phone className="h-4 w-4 text-[var(--color-accent)]" />
            <span>Continue with Phone</span>
          </Button>

          {/* Toggle Helper Link */}
          <div className="text-center text-xs text-[var(--color-text-secondary)] pt-1 font-body">
            <span>Don&apos;t have an account? </span>
            <button
              type="button"
              onClick={() => {
                setValidationError(null);
                setMode("signup");
              }}
              className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-accent)] underline decoration-[var(--color-accent)] decoration-[1.5px] underline-offset-[4px] cursor-pointer transition-colors"
            >
              Sign up
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
