import { useState } from "react";
import type { FormEvent } from "react";
import { Phone } from "lucide-react";
import { OtpInput } from "@/components/ui/otp-input";
import { OtpStubBanner } from "@/components/OtpStubBanner";
import { AuthAlert } from "./AuthAlert";
import { AuthButton } from "./AuthButton";
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
  /** Replaces the heading, which is otherwise "Verify your mobile number" or "Verify your email address". */
  title?: string;
  /** Replaces "Enter the 6-digit code sent to {identity}." */
  description?: string;
  /** A green shortcut under the error, such as "Log in instead". */
  errorAction?: { label: string; onClick: () => void };
}

export function OtpPanel({
  channel, identity, submitLabel, devOtp, error, onSubmit, onResend, onBack, onEditIdentity, editLabel = "Edit",
  submitting = false, showCall = true, title, description, errorAction,
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
    <form onSubmit={submit} noValidate className="auth-form">
      <div className="flex flex-col gap-[var(--auth-gap-sm)]">
        <h1 className="auth-h1">
          {title ?? (channel === "email" ? "Verify your email address" : "Verify your mobile number")}
        </h1>
        <p className="auth-sub">{description ?? `Enter the 6-digit code sent to ${identity}.`}</p>
        {onEditIdentity ? (
          <button type="button" onClick={onEditIdentity} className="text-xs font-semibold text-[var(--auth-green-ink)] hover:underline">
            {editLabel}
          </button>
        ) : null}
      </div>
      <OtpStubBanner code={devOtp} channel={channel} />
      <div>
        <label htmlFor="otp-input" className="auth-label mb-2">Verification code</label>
        <OtpInput
          id="otp-input"
          value={code}
          onChange={(next) => {
            setCode(next);
            if (local && next.length === 6) setLocal(null);
          }}
          disabled={submitting}
          cellClassName="auth-otp-cell"
          className="gap-[var(--auth-gap-sm)]"
          autoFocus
        />
      </div>
      {shown ? (
        <AuthAlert tone="error" action={local ? undefined : errorAction}>{shown}</AuthAlert>
      ) : null}
      <AuthButton type="submit" disabled={submitting} arrow={!submitting}>
        {submitting ? "Verifying code..." : submitLabel}
      </AuthButton>
      <div className="flex items-center gap-1.5 text-[13px] text-[var(--auth-muted)]">
        <span>Didn&apos;t receive the code?</span>{" "}
        <button
          type="button"
          disabled={countdown.active}
          onClick={() => {
            onResend();
            countdown.restart();
          }}
          className="font-semibold text-[var(--auth-green-ink)] disabled:text-[var(--auth-green-ink)] cursor-pointer disabled:cursor-default"
        >
          {countdown.active ? `Resend code in ${formatMmSs(countdown.seconds)}` : "Resend code"}
        </button>
      </div>
      {showCall ? (
        <>
          <div className="auth-or" role="separator"><span>OR</span></div>
          <span
            aria-disabled="true"
            title="Coming soon"
            className="auth-btn-quiet cursor-not-allowed opacity-70 flex items-center justify-center gap-2.5"
          >
            <Phone size={18} aria-hidden="true" />
            Get code via call
          </span>
        </>
      ) : null}
      {onBack ? (
        <button type="button" onClick={onBack} className="text-xs font-medium text-[var(--auth-muted)] hover:text-[var(--auth-ink)]">
          Back
        </button>
      ) : null}
    </form>
  );
}
