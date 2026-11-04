import { Mail, Pencil, Phone } from "lucide-react";
import { maskEmail, maskPhone } from "../validation";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { CODE_SCREEN_PARAGRAPH } from "./loginCopy";
import { OtpPanel } from "./OtpPanel";

export interface LoginCodeProps {
  channel: "phone" | "email";
  /** The raw number or address the code was sent to; the screen masks it. */
  identity: string;
  devOtp: string | null;
  error: string | null;
  submitting: boolean;
  onSubmit: (code: string) => void;
  onResend: () => void;
  /** Back and Edit both return to login 1 with the typed value kept. */
  onBack: () => void;
  onEditIdentity: () => void;
}

/** Login screens 2 and 3: a thin wrapper that puts the masked identity and Edit in the left panel. */
export function LoginCode({ channel, identity, devOtp, error, submitting, onSubmit, onResend, onBack, onEditIdentity }: LoginCodeProps) {
  const masked = channel === "phone" ? maskPhone(identity) : maskEmail(identity);
  return (
    <AuthPage>
      <AuthSplitCard
        onBack={onBack}
        left={
          <AuthLeftPanel
            sketch={channel === "phone" ? "phone" : "envelope"}
            headline="Welcome back."
            paragraph={CODE_SCREEN_PARAGRAPH}
            identity={
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[17px] font-medium text-[var(--auth-ink)]">
                  {channel === "phone" ? (
                    <Phone size={18} aria-hidden="true" className="shrink-0 text-[var(--auth-green-ink)]" />
                  ) : (
                    <Mail size={18} aria-hidden="true" className="shrink-0 text-[var(--auth-green-ink)]" />
                  )}
                  <span>{masked}</span>
                </div>
                <button
                  type="button"
                  onClick={onEditIdentity}
                  className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--auth-green-ink)] hover:underline"
                >
                  <Pencil size={16} aria-hidden="true" />
                  {channel === "phone" ? "Edit number" : "Edit email address"}
                </button>
              </div>
            }
          />
        }
        right={
          <OtpPanel
            channel={channel}
            identity={masked}
            submitLabel="Verify and log in"
            devOtp={devOtp}
            error={error}
            submitting={submitting}
            onSubmit={onSubmit}
            onResend={onResend}
          />
        }
      />
    </AuthPage>
  );
}
