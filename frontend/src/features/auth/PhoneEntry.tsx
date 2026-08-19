import { useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, AlertCircle, ShieldCheck, Loader2 } from "lucide-react";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";
import { validateIndianPhone } from "./validation";
import { cn } from "@/lib/utils";

interface PhoneEntryProps {
  /** "phoneGate": completing the mandatory phone step after a Google/email
    * signup with no existing account match — different copy, no back button
    * (Design Spec §1; Frontend Spec §3). Defaults to the plain entry copy. */
  context?: "primary" | "phoneGate";
  phoneGatePrefillEmail?: string | null;
  onSubmit: (phoneNumber: string) => void;
  onBack?: () => void;
  submitting: boolean;
  error: string | null;
}

export function PhoneEntry({
  context = "primary",
  phoneGatePrefillEmail,
  onSubmit,
  onBack,
  submitting,
  error,
}: PhoneEntryProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isTouched, setIsTouched] = useState(false);

  const isPhoneGate = context === "phoneGate";

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsTouched(true);
    const res = validateIndianPhone(phoneNumber);
    if (!res.isValid) {
      setValidationError(res.error);
      return;
    }
    setValidationError(null);
    onSubmit(res.normalized);
  };

  return (
    <motion.form
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      noValidate
      onSubmit={handleSubmit}
      className="w-full max-w-md mx-auto space-y-6 text-left box-border"
    >
      {/* 1. Header & Context Indicator */}
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
            {isPhoneGate ? "One more step" : "Continue with phone"}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed font-body">
            {isPhoneGate
              ? `Verify your mobile number to finish creating your account${
                  phoneGatePrefillEmail ? ` for ${phoneGatePrefillEmail}` : ""
                }.`
              : "Enter your mobile number to receive a secure one-time passcode."}
          </p>
        </div>
      </motion.div>

      {/* 2. Premium Phone Input */}
      <motion.div variants={staggerItemVariants} className="space-y-1.5">
        <label
          htmlFor="phone-input"
          className="text-xs font-semibold text-[var(--color-ink)] block font-body"
        >
          Mobile number
        </label>
        <div
          className={cn(
            "flex items-center rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] transition-all overflow-hidden h-11 sm:h-12 min-h-[44px]",
            validationError
              ? "border-[var(--color-negative)] focus-within:border-[var(--color-negative)] focus-within:ring-2 focus-within:ring-[var(--color-negative)]/20"
              : "focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent)]/20",
          )}
        >
          <div className="px-3 sm:px-3.5 flex items-center gap-1.5 border-r border-[var(--color-border)] text-xs font-medium text-[var(--color-ink)] select-none bg-[var(--color-surface)]/50 h-full">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">IN</span>
            <span className="font-semibold">+91</span>
          </div>
          <input
            id="phone-input"
            type="tel"
            placeholder="98765 43210"
            value={phoneNumber}
            onChange={(event) => handlePhoneChange(event.target.value)}
            onBlur={handlePhoneBlur}
            className="flex-1 bg-transparent px-3.5 text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none font-mono"
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

      {/* 4. Action Button */}
      <motion.div variants={staggerItemVariants} className="space-y-3 pt-1">
        <Button
          type="submit"
          disabled={submitting || !phoneNumber.trim()}
          className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-sm gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Sending verification code...</span>
            </>
          ) : (
            <>
              <span>Send verification code</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </motion.div>

      {/* 5. Trust Footnote */}
      <motion.div variants={staggerItemVariants} className="flex items-center justify-center sm:justify-start gap-1.5 text-[11px] text-[var(--color-text-secondary)] pt-2 select-none font-body">
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        <span>256-bit encrypted · Read-only access · No spam</span>
      </motion.div>
    </motion.form>
  );
}
