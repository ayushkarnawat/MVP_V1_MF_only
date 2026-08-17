import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, Mail, Phone, ShieldCheck } from "lucide-react";
import { GoogleButton } from "./GoogleButton";

interface LandingProps {
  onSignup: (email: string, password: string) => void;
  onSelectEmail: () => void;
  onSelectPhone: () => void;
  onGoogleCredential: (idToken: string) => void;
  error: string | null;
  submitting: boolean;
}

const MIN_PASSWORD_LENGTH = 8;

export function Landing({
  onSignup,
  onSelectEmail,
  onSelectPhone,
  onGoogleCredential,
  error,
  submitting,
}: LandingProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  const handleSignupSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setValidationError(null);
    onSignup(email, password);
  };

  const displayedError = validationError ?? error;

  return (
    <div className="w-full max-w-sm sm:max-w-md mx-auto p-5 sm:p-8 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)]/80 shadow-lg space-y-5 text-center box-border animate-in fade-in zoom-in-95 duration-200">
      {/* 1. Brand Header */}
      <div className="space-y-2.5">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)] text-[var(--color-accent)] flex items-center justify-center shadow-xs">
          <svg
            viewBox="0 0 100 100"
            className="w-6 h-6 text-[var(--color-accent)] fill-none stroke-current stroke-[14] stroke-linecap-round"
            aria-label="Unifolio Logo Mark"
          >
            <path d="M 50 10 A 40 40 0 0 1 90 50" />
          </svg>
        </div>
        <div className="space-y-1">
          <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight">
            Unifolio
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed max-w-xs mx-auto">
            {mode === "login"
              ? "Log in or sign up to track your investments in one place."
              : "Create an account to get a unified view of your portfolio."}
          </p>
        </div>
      </div>

      {/* 2. Redesigned Log in / Sign up Segmented Pill Toggle */}
      <div
        role="tablist"
        aria-label="Authentication mode"
        className="flex items-center p-1 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)]/80 gap-1 text-xs max-w-[280px] sm:max-w-[320px] mx-auto w-full"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          onClick={() => {
            setMode("login");
            setValidationError(null);
          }}
          className={`flex-1 py-2 px-3 rounded-full font-semibold transition-all duration-200 ease-out cursor-pointer text-center ${
            mode === "login"
              ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-xs border border-[var(--color-border)]/60"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] font-medium"
          }`}
        >
          Log in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          onClick={() => {
            setMode("signup");
            setValidationError(null);
          }}
          className={`flex-1 py-2 px-3 rounded-full font-semibold transition-all duration-200 ease-out cursor-pointer text-center ${
            mode === "signup"
              ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-xs border border-[var(--color-border)]/60"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] font-medium"
          }`}
        >
          Sign up
        </button>
      </div>

      {/* 3. Mode Content */}
      {mode === "login" ? (
        /* Dedicated Log in Options View */
        <div className="space-y-3 pt-1">
          {displayedError && (
            <div
              role="alert"
              className="flex items-center gap-2 p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)] text-xs text-[var(--color-negative)] font-medium text-left"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{displayedError}</span>
            </div>
          )}

          <GoogleButton onCredential={onGoogleCredential} />

          <Button
            type="button"
            variant="outline"
            onClick={onSelectEmail}
            disabled={submitting}
            className="w-full h-11 sm:h-12 rounded-xl border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-bg)] font-semibold text-xs sm:text-sm gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px] flex items-center justify-center"
          >
            <Mail className="h-4 w-4" />
            <span>Continue with Email</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onSelectPhone}
            disabled={submitting}
            className="w-full h-11 sm:h-12 rounded-xl border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-bg)] font-semibold text-xs sm:text-sm gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px] flex items-center justify-center"
          >
            <Phone className="h-4 w-4" />
            <span>Continue with Phone</span>
          </Button>
        </div>
      ) : (
        /* Dedicated Sign up Form View */
        <div className="space-y-4">
          <form onSubmit={handleSignupSubmit} className="space-y-3.5 text-left">
            <div className="space-y-1.5">
              <label htmlFor="signup-email-input" className="text-xs font-semibold text-[var(--color-ink)] block">
                Email address
              </label>
              <input
                id="signup-email-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full h-11 sm:h-12 min-h-[44px] rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 px-3.5 text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none transition-all"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="signup-password-input" className="text-xs font-semibold text-[var(--color-ink)] block">
                Password
              </label>
              <input
                id="signup-password-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full h-11 sm:h-12 min-h-[44px] rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 px-3.5 text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none transition-all"
              />
              {passwordTooShort && (
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </div>

            {displayedError && (
              <div
                role="alert"
                className="flex items-center gap-2 p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)] text-xs text-[var(--color-negative)] font-medium text-left"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{displayedError}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || !email.trim() || !password.trim()}
              className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px] mt-1"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <span>Create account</span>
              )}
            </Button>
          </form>

          {/* Subtle "or" Divider */}
          <div className="relative flex items-center py-0.5">
            <div className="flex-grow border-t border-[var(--color-border)]/80" />
            <span className="flex-shrink mx-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              or
            </span>
            <div className="flex-grow border-t border-[var(--color-border)]/80" />
          </div>

          {/* Alternative Signup Methods */}
          <div className="space-y-2.5">
            <GoogleButton onCredential={onGoogleCredential} />

            <Button
              type="button"
              variant="outline"
              onClick={onSelectPhone}
              disabled={submitting}
              className="w-full h-11 sm:h-12 rounded-xl border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-bg)] font-semibold text-xs sm:text-sm gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
            >
              <Phone className="h-4 w-4" />
              <span>Continue with Phone</span>
            </Button>
          </div>
        </div>
      )}

      {/* 4. Trust & Security Footer */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] pt-1 select-none">
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        <span>256-bit encrypted · Read-only access · No spam</span>
      </div>
    </div>
  );
}
