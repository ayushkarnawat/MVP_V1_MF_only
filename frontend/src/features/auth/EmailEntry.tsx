import { useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";
import { validateEmail } from "./validation";
import { cn } from "@/lib/utils";

interface EmailEntryProps {
  /** "login": direct email login from landing. "link": step-up re-authentication
    * against an account that already exists. "primary": legacy entry point with
    * both actions. Defaults to "login". */
  context?: "primary" | "login" | "link";
  onSignup?: (email: string) => void;
  onLogin: (email: string) => void;
  onBack?: () => void;
  submitting: boolean;
  error: string | null;
}

export function EmailEntry({ context = "login", onSignup, onLogin, onBack, submitting, error }: EmailEntryProps) {
  const [email, setEmail] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isTouched, setIsTouched] = useState(false);

  const isLink = context === "link";
  const isLoginOnly = context === "login" || context === "link";

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

  const submit = (event: FormEvent<HTMLFormElement>, action: "signup" | "login") => {
    event.preventDefault();
    setIsTouched(true);
    const res = validateEmail(email);
    if (!res.isValid) {
      setValidationError(res.error);
      return;
    }
    setValidationError(null);
    if (action === "signup") {
      onSignup?.(email.trim());
    } else {
      onLogin(email.trim());
    }
  };

  return (
    <motion.form
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      noValidate
      onSubmit={(event) => submit(event, isLoginOnly ? "login" : "signup")}
      className="w-full max-w-md mx-auto space-y-6 text-left box-border"
    >
      {/* 1. Navigation & Brand Heading */}
      <motion.div variants={staggerItemVariants} className="space-y-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] font-medium transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>
        )}

        <div className="space-y-1">
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-[var(--color-ink)] tracking-tight">
            {isLoginOnly ? "Log in with email" : "Continue with email"}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed font-body">
            {isLink
              ? "Enter your email — we'll send a code to link this to your account."
              : isLoginOnly
              ? "Enter your email and we'll send you a one-time code."
              : "Enter your email to get started, or log in if you already have an account."}
          </p>
        </div>
      </motion.div>

      {/* 2. Inputs Group */}
      <motion.div variants={staggerItemVariants} className="space-y-3.5">
        <div className="space-y-1.5">
          <label htmlFor="email-input" className="text-xs font-semibold text-[var(--color-ink)] block font-body">
            Email address
          </label>
          <input
            id="email-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => handleEmailChange(event.target.value)}
            onBlur={handleEmailBlur}
            className={cn(
              "w-full h-11 sm:h-12 min-h-[44px] rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] px-3.5 text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none transition-all font-body",
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
      </motion.div>

      {/* 3. Server Authentication Error Alert */}
      {error && !validationError && (
        <div
          role="alert"
          className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)] text-xs text-[var(--color-negative)] font-medium font-body animate-in fade-in duration-150"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4. Action Buttons */}
      <motion.div variants={staggerItemVariants} className="space-y-3 pt-1">
        <Button
          type="submit"
          disabled={submitting || !email.trim()}
          className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-sm gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Sending code...</span>
            </>
          ) : (
            <>
              <span>Send code</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </Button>

        {context === "primary" && (
          <Button
            type="button"
            variant="outline"
            disabled={submitting || !email.trim()}
            onClick={(event) => submit(event as unknown as FormEvent<HTMLFormElement>, "login")}
            className="w-full h-11 sm:h-12 rounded-xl border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-bg)] font-semibold text-xs sm:text-sm cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
          >
            Log in instead
          </Button>
        )}
      </motion.div>
    </motion.form>
  );
}
