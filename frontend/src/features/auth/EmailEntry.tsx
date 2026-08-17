import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";

interface EmailEntryProps {
  /** "link": step-up re-authentication against an account that already
   * exists — only a login action makes sense, never signup. Defaults to
   * "primary" (the landing-screen entry point, both actions available). */
  context?: "primary" | "link";
  onSignup?: (email: string, password: string) => void;
  onLogin: (email: string, password: string) => void;
  onBack?: () => void;
  submitting: boolean;
  error: string | null;
}

const MIN_PASSWORD_LENGTH = 8;

export function EmailEntry({ context = "primary", onSignup, onLogin, onBack, submitting, error }: EmailEntryProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const isLink = context === "link";
  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;

  const submit = (event: FormEvent<HTMLFormElement>, action: "signup" | "login") => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setValidationError(null);
    if (action === "signup") {
      onSignup?.(email, password);
    } else {
      onLogin(email, password);
    }
  };

  const displayedError = validationError ?? error;

  return (
    <form
      onSubmit={(event) => submit(event, isLink ? "login" : "signup")}
      className="w-full max-w-sm sm:max-w-md mx-auto p-5 sm:p-8 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)]/80 shadow-lg space-y-6 text-center box-border animate-in fade-in zoom-in-95 duration-200"
    >
      <div className="space-y-2.5">
        <div className="mx-auto h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_24%,transparent)] text-[var(--color-accent)] flex items-center justify-center">
          <svg
            viewBox="0 0 100 100"
            className="w-5 h-5 text-[var(--color-accent)] fill-none stroke-current stroke-[14] stroke-linecap-round"
            aria-label="Unifolio Logo Mark"
          >
            <path d="M 50 10 A 40 40 0 0 1 90 50" />
          </svg>
        </div>
        <div className="space-y-1">
          <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight">
            {isLink ? "Log in with email" : "Continue with email"}
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed max-w-xs mx-auto">
            {isLink
              ? "Enter your email and password to link this to your account."
              : "Enter your email and choose a password to get started, or log in if you already have an account."}
          </p>
        </div>
      </div>

      <div className="space-y-3 text-left">
        <div className="space-y-2">
          <label htmlFor="email-input" className="text-xs font-semibold text-[var(--color-ink)] block">
            Email address
          </label>
          <input
            id="email-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full h-11 sm:h-12 min-h-[44px] rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 px-3.5 text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none transition-all"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password-input" className="text-xs font-semibold text-[var(--color-ink)] block">
            Password
          </label>
          <input
            id="password-input"
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

      <div className="space-y-3 pt-1">
        <Button
          type="submit"
          disabled={submitting || !email.trim() || !password.trim()}
          className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{isLink ? "Logging in..." : "Creating account..."}</span>
            </>
          ) : (
            <span>{isLink ? "Log in" : "Create account"}</span>
          )}
        </Button>

        {!isLink && (
          <Button
            type="button"
            variant="outline"
            disabled={submitting || !email.trim() || !password.trim()}
            onClick={(event) => submit(event as unknown as FormEvent<HTMLFormElement>, "login")}
            className="w-full h-11 sm:h-12 rounded-xl border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-bg)] font-semibold text-xs sm:text-sm cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
          >
            Log in instead
          </Button>
        )}

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] font-medium transition-colors cursor-pointer text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] pt-1 select-none">
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        <span>256-bit encrypted · Read-only access · No spam</span>
      </div>
    </form>
  );
}
