import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";
import { OtpStubBanner } from "@/components/OtpStubBanner";
import { AuthAlert } from "./AuthAlert";
import { formatMmSs, useResendCountdown } from "./useResendCountdown";

export interface OtpPanelProps {
  channel: "phone" | "email";
  /** What the code was sent to, already masked if it should be. */
  identity: string;
  submitLabel: string;
  devOtp: string | null;
  error: string | null;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onBack?: () => void;
  onEditIdentity?: () => void;
  editLabel?: string;
  submitting?: boolean;
  /** The "Get code via call" line is drawn but has no function (Q4). */
  showCall?: boolean;
}

export function OtpPanel({
  channel, identity, submitLabel, devOtp, error, onSubmit, onResend, onBack, onEditIdentity, editLabel = "Edit",
  submitting = false, showCall = true,
}: OtpPanelProps) {
  const [code, setCode] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const countdown = useResendCountdown(60);
  const shown = local ?? error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.length < 6) {
      setLocal("Please enter the complete 6-digit verification code.");
      return;
    }
    setLocal(null);
    onSubmit(code);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5 text-left">
      <div className="space-y-2">
        <h1 className="text-[26px] font-bold leading-tight text-[var(--ui-text)]">
          {channel === "email" ? "Verify your email address" : "Verify your mobile number"}
        </h1>
        <p className="text-sm text-[var(--ui-text-muted)]">Enter the 6-digit code sent to {identity}.</p>
        {onEditIdentity ? (
          <button type="button" onClick={onEditIdentity} className="text-xs font-semibold text-[var(--pos-text)] hover:underline">
            {editLabel}
          </button>
        ) : null}
      </div>
      <OtpStubBanner code={devOtp} channel={channel} />
      <div className="space-y-2">
        <label htmlFor="otp-input" className="block text-[13px] font-medium text-[var(--ui-text)]">Verification code</label>
        <OtpInput
          id="otp-input"
          value={code}
          onChange={(next) => {
            setCode(next);
            if (local && next.length === 6) setLocal(null);
          }}
          disabled={submitting}
          autoFocus
        />
      </div>
      {shown ? <AuthAlert tone="error">{shown}</AuthAlert> : null}
      <Button type="submit" disabled={submitting} className="h-[52px] w-full rounded-full text-[15px] font-bold">
        {submitting ? (
          <>
            <Loader2 className="animate-spin" size={16} />
            <span>Verifying code...</span>
          </>
        ) : (
          submitLabel
        )}
      </Button>
      <div className="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
        <span>Didn&apos;t receive the code?</span>
        <button
          type="button"
          disabled={countdown.active}
          onClick={() => {
            onResend();
            countdown.restart();
          }}
          className="font-semibold text-[var(--pos-text)] disabled:text-[var(--ui-disabled-text)]"
        >
          {countdown.active ? `Resend code in ${formatMmSs(countdown.seconds)}` : "Resend code"}
        </button>
      </div>
      {showCall ? (
        <div className="space-y-2 text-center text-xs text-[var(--ui-text-muted)]">
          <p>OR</p>
          <span aria-disabled="true" title="Coming soon" className="inline-block cursor-not-allowed opacity-60">
            Get code via call
          </span>
        </div>
      ) : null}
      {onBack ? (
        <button type="button" onClick={onBack} className="text-xs font-medium text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]">
          Back
        </button>
      ) : null}
    </form>
  );
}
