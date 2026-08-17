import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowRight, Loader2, Mail, Phone, ShieldCheck } from "lucide-react";
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
  // Sign up is the default state on application launch
  const [mode, setMode] = useState<"login" | "signup">("signup");
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
    <div className="w-full max-w-md mx-auto space-y-6 text-left box-border py-2">
      {/* 1. Header & Mode Switcher */}
      <div className="space-y-4">
        {/* Segmented Pill Control */}
        <div
          role="tablist"
          aria-label="Authentication mode"
          className="inline-flex p-1 rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] shadow-inner text-xs font-semibold w-full max-w-[240px]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            onClick={() => {
              setMode("signup");
              setValidationError(null);
            }}
            className={`relative flex-1 py-1.5 px-3 rounded-full transition-all duration-200 ease-out cursor-pointer text-center ${
              mode === "signup"
                ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-xs border border-[var(--color-border)]/60 font-semibold"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] font-medium"
            }`}
          >
            Sign up
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => {
              setMode("login");
              setValidationError(null);
            }}
            className={`relative flex-1 py-1.5 px-3 rounded-full transition-all duration-200 ease-out cursor-pointer text-center ${
              mode === "login"
                ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-xs border border-[var(--color-border)]/60 font-semibold"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] font-medium"
            }`}
          >
            Log in
          </button>
        </div>

        {/* Clean Editorial Headline */}
        <div className="space-y-1">
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-[var(--color-ink)] tracking-tight">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed font-body">
            {mode === "signup"
              ? "Start tracking and consolidating your mutual fund folios."
              : "Access your consolidated investments and portfolio analytics."}
          </p>
        </div>
      </div>

      {/* 2. Error Display */}
      {displayedError && (
        <div
          role="alert"
          className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)] text-xs text-[var(--color-negative)] font-medium font-body"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{displayedError}</span>
        </div>
      )}

      {/* 3. Form Content */}
      {mode === "signup" ? (
        /* Sign Up Experience (Default) */
        <div key="signup-mode" className="space-y-4 animate-in fade-in duration-200">
          <form onSubmit={handleSignupSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <label htmlFor="signup-email-input" className="text-xs font-semibold text-[var(--color-ink)] block font-body">
                Email address
              </label>
              <input
                id="signup-email-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full h-11 sm:h-12 min-h-[44px] sm:min-h-[48px] rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 px-3.5 text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none transition-all font-body"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="signup-password-input" className="text-xs font-semibold text-[var(--color-ink)] block font-body">
                Password
              </label>
              <input
                id="signup-password-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full h-11 sm:h-12 min-h-[44px] sm:min-h-[48px] rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 px-3.5 text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none transition-all font-body"
              />
              {passwordTooShort && (
                <p className="text-[11px] text-[var(--color-text-secondary)] font-body">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={submitting || !email.trim() || !password.trim()}
              aria-label="Create account"
              className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] hover:bg-[#16a34a] text-white font-semibold text-xs sm:text-sm shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/25 gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px] mt-1.5"
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
                setMode("login");
                setValidationError(null);
              }}
              className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-accent)] underline-offset-4 hover:underline cursor-pointer transition-colors"
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
                setMode("signup");
                setValidationError(null);
              }}
              className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-accent)] underline-offset-4 hover:underline cursor-pointer transition-colors"
            >
              Sign up
            </button>
          </div>
        </div>
      )}

      {/* 4. Trust Assurance */}
      <div className="flex items-center justify-center sm:justify-start gap-1.5 text-[11px] text-[var(--color-text-secondary)] pt-2 select-none font-body">
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        <span>256-bit encrypted · Read-only access · No spam</span>
      </div>
    </div>
  );
}
