import { useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
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

        <div className="space-y-2">
          <h1 className="font-display font-bold text-[30px] xs:text-[32px] sm:text-[36px] text-[var(--color-ink)] tracking-tight leading-[1.08]">
            {isPhoneGate ? "One more step" : "Continue with phone"}
          </h1>
          <p className="text-[13px] sm:text-[14px] text-[#5C5C5C] dark:text-[#A3A3A3] font-normal leading-relaxed">
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
            "flex items-center rounded-2xl bg-white/90 dark:bg-[var(--color-surface)] border border-[var(--color-border)] transition-all h-13 sm:h-14 min-h-[50px] sm:min-h-[54px] shadow-xs",
            validationError
              ? "border-[var(--color-negative)] focus-within:border-[var(--color-negative)] focus-within:ring-2 focus-within:ring-[var(--color-negative)]/20"
              : "focus-within:border-[#10B981] focus-within:ring-2 focus-within:ring-[#10B981]/20",
          )}
        >
          <div className="px-3.5 sm:px-4 flex items-center gap-1.5 border-r border-[var(--color-border)] text-xs font-medium text-[var(--color-ink)] select-none bg-[var(--color-surface)]/50 h-full rounded-l-2xl flex-shrink-0">
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
          className="w-full h-14 sm:h-[58px] px-8 rounded-full font-bold text-[15px] sm:text-base bg-[#10B981] hover:bg-[#059669] dark:bg-[#10B981] dark:hover:bg-[#059669] text-white shadow-xl shadow-[#10B981]/25 dark:shadow-[#10B981]/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2.5 border border-[#10B981]/40 min-h-[52px]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
              <span>Sending verification code...</span>
            </>
          ) : (
            <>
              <span>Send verification code</span>
              <ArrowRight className="h-4.5 w-4.5" />
            </>
          )}
        </Button>
      </motion.div>
    </motion.form>
  );
}
