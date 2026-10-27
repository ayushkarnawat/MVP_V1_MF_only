import { useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/features/auth/AuthContext";
import type { ContactChangeChannel } from "@/features/auth/types";

export interface ContactChangeDialogProps {
  channel: ContactChangeChannel;
  onClose: () => void;
  onChanged: () => void;
}

export function ContactChangeDialog({
  channel,
  onClose,
  onChanged,
}: ContactChangeDialogProps) {
  const { requestContactChange, verifyContactChange } = useAuth();
  const noun = channel === "email" ? "email" : "mobile number";

  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [submitting, setSubmitting] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  const close = () => {
    tokenRef.current += 1;
    onClose();
  };

  const sendCode = async () => {
    const token = tokenRef.current;
    setSubmitting("send");
    setError(null);
    try {
      await requestContactChange(channel, identifier.trim());
      if (tokenRef.current !== token) return;
      setOtpSent(true);
    } catch {
      if (tokenRef.current !== token) return;
      setError("Could not send the verification code. Please try again.");
    } finally {
      if (tokenRef.current === token) setSubmitting(null);
    }
  };

  const verify = async () => {
    const token = tokenRef.current;
    setSubmitting("verify");
    setError(null);
    try {
      await verifyContactChange(channel, identifier.trim(), otp.trim());
      if (tokenRef.current !== token) return;
      onChanged();
    } catch {
      if (tokenRef.current !== token) return;
      setError("Could not verify the contact change. Please try again.");
    } finally {
      if (tokenRef.current === token) setSubmitting(null);
    }
  };

  return (
    <Modal isOpen onClose={close} title={`Change ${noun}`}>
      <div className="space-y-4">
        <label className="block space-y-1.5 text-sm font-semibold text-[var(--ui-text)]">
          New {noun}
          <input
            type={channel === "email" ? "email" : "tel"}
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            disabled={submitting !== null || otpSent}
            className="w-full rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-page)] px-3 py-2 text-sm text-[var(--ui-text)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          />
        </label>

        {otpSent ? (
          <>
            <p className="text-sm text-[var(--shell-text-body)]">
              We sent a code to your new {noun}.
            </p>
            <label className="block space-y-1.5 text-sm font-semibold text-[var(--ui-text)]">
              Verification code
              <input
                inputMode="numeric"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                disabled={submitting !== null}
                className="w-full rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-page)] px-3 py-2 text-sm tracking-[0.2em] text-[var(--ui-text)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
              />
            </label>
          </>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-[var(--neg-text)]">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            Cancel
          </button>
          {!otpSent ? (
            <button
              type="button"
              onClick={sendCode}
              disabled={!identifier.trim() || submitting !== null}
              className="rounded-lg bg-[var(--ui-text)] px-4 py-2 text-sm font-semibold text-[var(--ui-page)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              {submitting === "send" ? "Sending…" : "Send code"}
            </button>
          ) : (
            <button
              type="button"
              onClick={verify}
              disabled={!otp.trim() || submitting !== null}
              className="rounded-lg bg-[var(--ui-text)] px-4 py-2 text-sm font-semibold text-[var(--ui-page)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              {submitting === "verify" ? "Verifying…" : "Verify change"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
