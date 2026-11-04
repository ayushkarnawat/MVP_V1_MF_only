import { Mail, Pencil } from "lucide-react";
import { maskEmail } from "../validation";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { OtpPanel } from "./OtpPanel";
import { EMAIL_CODE_HEADLINE, EMAIL_CODE_PARAGRAPH } from "./signupCopy";

export interface EmailCodeProps {
  /** The raw address the code was sent to; the screen masks it. */
  email: string;
  devOtp: string | null;
  error: string | null;
  submitting: boolean;
  onSubmit: (code: string) => void;
  onResend: () => void;
  /** Back and Edit email address both return to screen 3 with the typed values kept. */
  onBack: () => void;
  onEditEmail: () => void;
}

/** Sign-up screen 3b: the email check is a sub-step of step 3, so the bar still says Step 3 of 5. */
export function EmailCode({ email, devOtp, error, submitting, onSubmit, onResend, onBack, onEditEmail }: EmailCodeProps) {
  const masked = maskEmail(email);
  return (
    <AuthPage>
      <AuthSplitCard
        step={3}
        onBack={onBack}
        left={
          <AuthLeftPanel
            sketch="envelope"
            headline={EMAIL_CODE_HEADLINE}
            paragraph={EMAIL_CODE_PARAGRAPH}
            identity={
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[17px] font-medium text-[var(--auth-ink)]">
                  <Mail size={18} aria-hidden="true" className="shrink-0 text-[var(--auth-green-ink)]" />
                  <span>{masked}</span>
                </div>
                <button
                  type="button"
                  onClick={onEditEmail}
                  className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--auth-green-ink)] hover:underline"
                >
                  <Pencil size={16} aria-hidden="true" />
                  Edit email address
                </button>
              </div>
            }
          />
        }
        right={
          <OtpPanel
            channel="email"
            identity={masked}
            submitLabel="Verify & Continue"
            devOtp={devOtp}
            error={error}
            submitting={submitting}
            showCall={false}
            onSubmit={onSubmit}
            onResend={onResend}
          />
        }
      />
    </AuthPage>
  );
}
