import { useState } from "react";
import type { FormEvent } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, AlertCircle, ShieldCheck, Loader2 } from "lucide-react";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";

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
  const isPhoneGate = context === "phoneGate";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(phoneNumber);
  };

  return (
    <motion.form
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
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
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
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
          className="text-xs font-semibold text-[var(--color-ink)] block"
        >
          Mobile number
        </label>
        <div className="flex items-center rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)] focus-within:ring-2 focus-within:ring-[var(--color-accent)]/20 transition-all overflow-hidden h-11 sm:h-12 min-h-[44px]">
          <div className="px-3 sm:px-3.5 flex items-center gap-1.5 border-r border-[var(--color-border)] text-xs font-medium text-[var(--color-ink)] select-none bg-[var(--color-surface)]/50 h-full">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">IN</span>
            <span className="font-semibold">+91</span>
          </div>
          <input
            id="phone-input"
            type="tel"
            placeholder="98765 43210"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            className="flex-1 bg-transparent px-3.5 text-xs sm:text-sm text-[var(--color-ink)] placeholder:text-[var(--color-text-secondary)]/50 focus:outline-none font-mono"
            autoFocus
          />
        </div>
      </motion.div>

      {/* 3. Error Alert */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)] text-xs text-[var(--color-negative)] font-medium"
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
      <motion.div variants={staggerItemVariants} className="flex items-center justify-center sm:justify-start gap-1.5 text-[11px] text-[var(--color-text-secondary)] pt-2 select-none">
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        <span>256-bit encrypted · Read-only access · No spam</span>
      </motion.div>
    </motion.form>
  );
}
