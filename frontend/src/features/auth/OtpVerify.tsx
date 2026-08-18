import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";
import { ArrowLeft, ArrowRight, AlertCircle, ShieldCheck, Loader2, KeyRound } from "lucide-react";

interface OtpVerifyProps {
  /** The identifier the code was sent to -- a phone number for channel
   * "phone", an email address for channel "email". Kept as `phoneNumber`
   * for minimal diff against the existing phone-OTP call site rather than
   * renaming to a generic `identifier` across every caller. */
  phoneNumber: string;
  /** "phone" (default): existing mobile-OTP copy/behavior, unchanged.
   * "email": the inline email-OTP confirmation step (2026-08-17
   * email-otp-signup handoff spec §4) -- same component, different copy,
   * since the underlying 6-digit-code verify UX is identical either way. */
  channel?: "phone" | "email";
  onSubmit: (otp: string) => void;
  onResend: () => void;
  onBack?: () => void;
  submitting: boolean;
  error: string | null;
  devOtp: string | null;
}

export function OtpVerify({
  phoneNumber,
  channel = "phone",
  onSubmit,
  onResend,
  onBack,
  submitting,
  error,
  devOtp,
}: OtpVerifyProps) {
  const [otp, setOtp] = useState("");
  const isEmail = channel === "email";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(otp);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md mx-auto space-y-6 text-left box-border"
    >
      {/* 1. Brand Heading */}
      <div className="space-y-1">
        <h1 className="font-display font-bold text-2xl sm:text-3xl text-[var(--color-ink)] tracking-tight">
          {isEmail ? "Verify your email" : "Verify your number"}
        </h1>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
          We sent a 6-digit verification code to <strong className="text-[var(--color-ink)] font-mono">{phoneNumber}</strong>
        </p>
      </div>

      {/* 2. Dev OTP Helper Banner */}
      {devOtp && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_20%,transparent)] text-xs text-[var(--color-ink)]">
          <div className="flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-[var(--color-accent)] flex-shrink-0" />
            <span className="font-semibold text-[var(--color-accent)]">Local Dev OTP:</span>
          </div>
          <strong className="font-mono text-xs tracking-widest text-[var(--color-ink)] bg-[var(--color-surface)] px-2.5 py-0.5 rounded-lg border border-[var(--color-border)] shadow-xs">
            {devOtp}
          </strong>
        </div>
      )}

      {/* 3. OTP Input Field */}
      <div className="space-y-2">
        <label
          htmlFor="otp-input"
          className="text-xs font-semibold text-[var(--color-ink)] block"
        >
          Verification code
        </label>
        <OtpInput
          id="otp-input"
          value={otp}
          onChange={setOtp}
          disabled={submitting}
          autoFocus
        />
      </div>

      {/* 4. Error Alert */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)] text-xs text-[var(--color-negative)] font-medium"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 5. Actions Area */}
      <div className="space-y-3 pt-1">
        <Button
          type="submit"
          disabled={submitting || otp.length < 4}
          className="w-full h-11 sm:h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-sm gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Verifying code...</span>
            </>
          ) : (
            <>
              <span>Verify &amp; Continue</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </Button>

        <div className="flex items-center justify-between text-xs pt-1">
          <button
            type="button"
            onClick={onBack ?? onResend}
            className="inline-flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] font-medium transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isEmail ? "Change email" : "Change number"}</span>
          </button>

          <Button
            variant="ghost"
            type="button"
            onClick={onResend}
            className="h-auto p-0 text-xs font-semibold text-[var(--color-accent)] hover:text-[var(--color-accent)]/80 hover:bg-transparent cursor-pointer"
          >
            Resend code
          </Button>
        </div>
      </div>

      {/* 6. Security Footnote */}
      <div className="flex items-center justify-center sm:justify-start gap-1.5 text-[11px] text-[var(--color-text-secondary)] pt-2 select-none">
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        <span>256-bit encrypted · Read-only access · No spam</span>
      </div>
    </form>
  );
}
