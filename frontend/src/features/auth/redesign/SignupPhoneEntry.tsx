import { useState } from "react";
import type { FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { ConsentNotice } from "../../legal/ConsentNotice";
import { isAccountExistsError, validateIndianPhone } from "../validation";
import { AuthAlert } from "./AuthAlert";
import { AuthButton } from "./AuthButton";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { LOGIN_ROW_ICONS } from "./authRowIcons";
import { LOGIN_HEADLINE_ACCENT, LOGIN_HEADLINE_BEFORE, LOGIN_ROWS } from "./loginCopy";
import { SIGNUP_PARAGRAPH } from "./signupCopy";

export interface SignupPhoneEntryProps {
  /** Called with the normalised +91 number. */
  onSubmit: (phone: string) => void;
  onLogin: () => void;
  error: string | null;
  submitting: boolean;
  /** False until the Terms and Privacy documents have loaded: their versions travel with the request. */
  legalReady: boolean;
  legalLoadError?: boolean;
  onLegalRetry?: () => void;
  /** The number typed before, so Back from the code screen returns here with it filled. */
  initialValue?: string;
}

/** Sign-up screen 1. Clicking Get OTP is the agreement to the Terms and Privacy Policy (the only place the line appears). */
export function SignupPhoneEntry({ onSubmit, onLogin, error, submitting, legalReady, legalLoadError, onLegalRetry, initialValue = "" }: SignupPhoneEntryProps) {
  const [value, setValue] = useState(initialValue.replace(/^\+91/, ""));
  const [fieldError, setFieldError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateIndianPhone(value);
    if (!result.isValid) {
      setFieldError(result.error);
      document.getElementById("signup-phone")?.focus();
      return;
    }
    setFieldError(null);
    onSubmit(result.normalized);
  };

  return (
    <AuthPage>
      <AuthSplitCard
        step={1}
        layout="wide"
        left={
          <AuthLeftPanel
            sketch="laptop"
            headline={<>{LOGIN_HEADLINE_BEFORE}<span className="text-[var(--pos-text)]">{LOGIN_HEADLINE_ACCENT}</span></>}
            paragraph={SIGNUP_PARAGRAPH}
            rows={LOGIN_ROWS}
            rowIcons={LOGIN_ROW_ICONS}
          />
        }
        right={
          <form onSubmit={submit} noValidate className="auth-form">
            <div className="flex flex-col gap-[var(--auth-gap-sm)]">
              <h1 className="auth-h1">Let&apos;s get started</h1>
              <p className="auth-sub">Enter your mobile number to create your Unifolio account.</p>
            </div>
            <div>
              <label htmlFor="signup-phone" className="auth-label mb-2">Mobile number</label>
              <div className="auth-field" data-invalid={fieldError ? "true" : undefined}>
                <span data-testid="country-code" className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--auth-ink)]">
                  +91 <ChevronDown size={16} aria-hidden="true" data-testid="country-chevron" />
                </span>
                <span aria-hidden className="h-6 w-px bg-[var(--auth-line)]" />
                <input
                  id="signup-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  value={value}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? "signup-phone-error" : undefined}
                  onChange={(event) => setValue(event.target.value)}
                  autoFocus
                />
              </div>
              {fieldError ? <p id="signup-phone-error" role="alert" className="mt-1.5 text-[13px] text-[var(--neg-text)]">{fieldError}</p> : null}
            </div>
            {error ? (
              isAccountExistsError(error) ? (
                <AuthAlert tone="error" action={{ label: "Log in instead", onClick: onLogin }}>{error}</AuthAlert>
              ) : (
                <AuthAlert tone="error">{error}</AuthAlert>
              )
            ) : null}
            <AuthButton type="submit" disabled={submitting || !legalReady} arrow={!submitting}>
              {submitting ? "Sending..." : "Get OTP"}
            </AuthButton>
            <ConsentNotice loadError={legalLoadError} onRetry={onLegalRetry} className="!text-left [&_p]:!text-[13px] [&_p]:!text-[var(--auth-muted)] [&_a]:!text-[var(--auth-green-ink)]" />
          </form>
        }
        bottom={
          <span className="text-[var(--ui-text-muted)]">
            Already have an account?{" "}
            <button type="button" onClick={onLogin} className="font-semibold text-[var(--pos-text)] hover:underline">
              Log in
            </button>
          </span>
        }
      />
    </AuthPage>
  );
}
