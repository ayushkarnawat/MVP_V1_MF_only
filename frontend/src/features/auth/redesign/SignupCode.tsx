import { Pencil } from "lucide-react";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { OtpPanel } from "./OtpPanel";
import { formatPhoneSpaced, SIGNUP_CODE_DESCRIPTION, SIGNUP_CODE_HEADLINE, SIGNUP_CODE_LEAD, SIGNUP_CODE_TITLE } from "./signupCopy";

export interface SignupCodeProps {
  /** The normalised number the code was sent to; shown in full (the user just typed it). */
  phone: string;
  devOtp: string | null;
  error: string | null;
  submitting: boolean;
  onSubmit: (code: string) => void;
  onResend: () => void;
  /** Back and Edit number both return to screen 1 with the number kept. */
  onBack: () => void;
  onEditNumber: () => void;
  /** Shortcut shown under an "account already exists" error. */
  onLogin: () => void;
}

/** Sign-up screen 2. */
export function SignupCode({ phone, devOtp, error, submitting, onSubmit, onResend, onBack, onEditNumber, onLogin }: SignupCodeProps) {
  const shown = formatPhoneSpaced(phone);
  return (
    <AuthPage>
      <AuthSplitCard
        step={2}
        onBack={onBack}
        left={
          <AuthLeftPanel
            sketch="phone"
            headline={SIGNUP_CODE_HEADLINE}
            paragraph={SIGNUP_CODE_LEAD}
            identity={
              <div className="space-y-2">
                <p className="text-[17px] font-medium text-[var(--auth-ink)]">{shown}</p>
                <button
                  type="button"
                  onClick={onEditNumber}
                  className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--auth-green-ink)] hover:underline"
                >
                  <Pencil size={16} aria-hidden="true" />
                  Edit number
                </button>
              </div>
            }
          />
        }
        right={
          <OtpPanel
            channel="phone"
            identity={shown}
            title={SIGNUP_CODE_TITLE}
            description={SIGNUP_CODE_DESCRIPTION}
            submitLabel="Verify & Continue"
            devOtp={devOtp}
            error={error}
            errorAction={/already exists/i.test(error ?? "") ? { label: "Log in instead", onClick: onLogin } : undefined}
            submitting={submitting}
            onSubmit={onSubmit}
            onResend={onResend}
          />
        }
      />
    </AuthPage>
  );
}
