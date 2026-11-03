import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConsentNotice } from "../../legal/ConsentNotice";
import { isAccountExistsError, validateIndianPhone } from "../validation";
import { AuthAlert } from "./AuthAlert";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
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
        left={
          <AuthLeftPanel
            sketch="laptop"
            headline={<>{LOGIN_HEADLINE_BEFORE}<span className="text-[var(--pos-text)]">{LOGIN_HEADLINE_ACCENT}</span></>}
            paragraph={SIGNUP_PARAGRAPH}
            rows={LOGIN_ROWS}
          />
        }
        right={
          <form onSubmit={submit} noValidate className="space-y-5 text-left">
            <div className="space-y-2">
              <h1 className="text-[26px] font-bold leading-tight text-[var(--ui-text)]">Let&apos;s get started</h1>
              <p className="text-sm text-[var(--ui-text-muted)]">Enter your mobile number to create your Unifolio account.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="signup-phone" className="block text-[13px] font-medium text-[var(--ui-text)]">Mobile number</label>
              <div className="flex h-12 items-center rounded-xl border border-[var(--ui-divider)] bg-white focus-within:ring-2 focus-within:ring-[var(--auth-step-on)]">
                <span className="flex h-full items-center border-r border-[var(--ui-divider)] px-4 text-sm font-semibold text-[var(--ui-text)]">+91</span>
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
                  className="h-full min-w-0 flex-1 bg-transparent px-4 text-sm text-[var(--ui-text)] outline-none"
                  autoFocus
                />
              </div>
              {fieldError ? <p id="signup-phone-error" role="alert" className="text-xs text-[var(--neg-text)]">{fieldError}</p> : null}
            </div>
            {error ? (
              isAccountExistsError(error) ? (
                <AuthAlert tone="error" action={{ label: "Log in instead", onClick: onLogin }}>{error}</AuthAlert>
              ) : (
                <AuthAlert tone="error">{error}</AuthAlert>
              )
            ) : null}
            <Button type="submit" disabled={submitting || !legalReady} className="h-[52px] w-full rounded-full text-[15px] font-bold">
              {submitting ? "Sending..." : "Get OTP"}
            </Button>
            <ConsentNotice loadError={legalLoadError} onRetry={onLegalRetry} />
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
