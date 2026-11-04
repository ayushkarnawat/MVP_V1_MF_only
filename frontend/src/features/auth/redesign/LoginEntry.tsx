import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Mail, Phone } from "lucide-react";
import { GoogleButton } from "../GoogleButton";
import { isNoAccountError, validateEmail, validateIndianPhone } from "../validation";
import { AuthAlert } from "./AuthAlert";
import { AuthButton } from "./AuthButton";
import { AUTH_SHOW_GOOGLE } from "./authConfig";
import { AuthField } from "./AuthField";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { LOGIN_ROW_ICONS } from "./authRowIcons";
import { LOGIN_HEADLINE_ACCENT, LOGIN_HEADLINE_BEFORE, LOGIN_PARAGRAPH, LOGIN_ROWS } from "./loginCopy";
import { SegmentedTabs } from "./SegmentedTabs";

export interface LoginEntryProps {
  onSubmitEmail: (email: string) => void;
  /** Called with the normalised phone number. */
  onSubmitPhone: (phone: string) => void;
  /** Back and the Sign up link both go to sign-up screen 1 (design Q2). */
  onSignUp: () => void;
  error: string | null;
  submitting: boolean;
  notice?: string | null;
  initialTab?: "email" | "phone";
  initialValue?: string;
  showGoogle?: boolean;
  onGoogleCredential?: (idToken: string) => void;
}

const TABS = [
  { value: "email", label: "Email", icon: <Mail size={18} aria-hidden="true" /> },
  { value: "phone", label: "Mobile number", icon: <Phone size={18} aria-hidden="true" /> },
] as const;

export function LoginEntry({
  onSubmitEmail, onSubmitPhone, onSignUp, error, submitting, notice, initialTab = "email", initialValue = "",
  showGoogle = AUTH_SHOW_GOOGLE, onGoogleCredential,
}: LoginEntryProps) {
  const [tab, setTab] = useState<"email" | "phone">(initialTab);
  const [emailValue, setEmailValue] = useState(initialTab === "email" ? initialValue : "");
  const [phoneValue, setPhoneValue] = useState(initialTab === "phone" ? initialValue : "");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (tab === "email") {
      const result = validateEmail(emailValue.trim());
      if (!result.isValid) {
        setFieldError(result.error);
        document.getElementById("login-email")?.focus();
        return;
      }
      setFieldError(null);
      onSubmitEmail(emailValue.trim());
      return;
    }
    const result = validateIndianPhone(phoneValue);
    if (!result.isValid) {
      setFieldError(result.error);
      document.getElementById("login-phone")?.focus();
      return;
    }
    setFieldError(null);
    onSubmitPhone(result.normalized);
  };

  return (
    <AuthPage>
      <AuthSplitCard
        layout="wide"
        bottomRule={false}
        onBack={onSignUp}
        left={
          <AuthLeftPanel
            sketch="laptop"
            headline={<>{LOGIN_HEADLINE_BEFORE}<span className="text-[var(--pos-text)]">{LOGIN_HEADLINE_ACCENT}</span></>}
            paragraph={LOGIN_PARAGRAPH}
            rows={LOGIN_ROWS}
            rowIcons={LOGIN_ROW_ICONS}
          />
        }
        right={
          <form onSubmit={submit} noValidate className="auth-form">
            <div className="flex flex-col gap-[var(--auth-gap-sm)]">
              <h1 className="auth-h1">Welcome back</h1>
              <p className="auth-sub">Log in to continue to your Unifolio account.</p>
            </div>
            {notice ? <AuthAlert tone="info">{notice}</AuthAlert> : null}
            <SegmentedTabs
              label="Log in with"
              options={TABS}
              panelId="login-panel"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setFieldError(null);
              }}
            />
            <div id="login-panel" role="tabpanel">
              {tab === "email" ? (
                <AuthField
                  id="login-email"
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={emailValue}
                  error={fieldError}
                  icon={<Mail size={20} />}
                  onChange={(event) => setEmailValue(event.target.value)}
                />
              ) : (
                <AuthField
                  id="login-phone"
                  label="Mobile number"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="98765 43210"
                  value={phoneValue}
                  error={fieldError}
                  icon={<Phone size={20} />}
                  onChange={(event) => setPhoneValue(event.target.value)}
                />
              )}
            </div>
            {error ? (
              isNoAccountError(error) ? (
                <AuthAlert tone="error" action={{ label: "Sign up", onClick: onSignUp }}>{error}</AuthAlert>
              ) : (
                <AuthAlert tone="error">{error}</AuthAlert>
              )
            ) : null}
            <AuthButton type="submit" disabled={submitting}>
              {submitting ? "Sending..." : "Get OTP"}
            </AuthButton>
            <div className="auth-or" role="separator"><span>OR</span></div>
            {showGoogle && onGoogleCredential ? <GoogleButton onCredential={onGoogleCredential} /> : null}
          </form>
        }
        bottom={
          <span className="text-[var(--ui-text-muted)]">
            New to Unifolio?{" "}
            <button
              type="button"
              onClick={onSignUp}
              aria-label="Sign up →"
              className="inline-flex items-center gap-1 font-semibold text-[var(--auth-green-ink)] hover:underline"
            >
              Sign up <ArrowRight size={16} aria-hidden="true" />
            </button>
          </span>
        }
      />
    </AuthPage>
  );
}
