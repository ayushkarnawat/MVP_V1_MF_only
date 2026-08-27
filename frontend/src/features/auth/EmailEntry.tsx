import { useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";
import { validateEmail } from "./validation";
import { cn } from "@/lib/utils";

import { AuthIllustration } from "./AuthIllustration";

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
      {/* Hand-drawn mobile illustration */}
      <div className="lg:hidden flex items-center justify-center h-[125px] xs:h-[142px] sm:h-[160px] mb-5 xs:mb-6 sm:mb-7">
        <AuthIllustration
          variant="email_entry"
          className="h-full mx-auto"
        />
      </div>

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

        <div>
          <h1 className="font-display font-bold text-[30px] xs:text-[32px] sm:text-[36px] text-[var(--color-ink)] tracking-tight leading-[1.08]">
            {isLoginOnly ? "Log in with email" : "Continue with email"}
          </h1>
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
          className="w-full h-14 sm:h-[58px] px-8 rounded-full font-bold text-[15px] sm:text-base bg-[#22C55E] hover:bg-[#22C55E]/90 dark:bg-[#22C55E] dark:hover:bg-[#22C55E]/90 text-white shadow-xl shadow-[#22C55E]/25 dark:shadow-[#22C55E]/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5 border border-[#22C55E]/40 min-h-[52px]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
              <span>Sending code...</span>
            </>
          ) : (
            <>
              <span>Send code</span>
              <ArrowRight className="h-4.5 w-4.5" />
            </>
          )}
        </Button>

        {context === "primary" && (
          <Button
            type="button"
            variant="outline"
            disabled={submitting || !email.trim()}
            onClick={(event) => submit(event as unknown as FormEvent<HTMLFormElement>, "login")}
            className="w-full h-13 sm:h-14 rounded-full border border-[var(--color-border)] bg-white/70 dark:bg-white/5 text-[var(--color-ink)] hover:bg-black/5 dark:hover:bg-white/10 font-semibold text-sm cursor-pointer active:scale-[0.98] transition-all min-h-[50px]"
          >
            Log in instead
          </Button>
        )}
      </motion.div>
    </motion.form>
  );
}
