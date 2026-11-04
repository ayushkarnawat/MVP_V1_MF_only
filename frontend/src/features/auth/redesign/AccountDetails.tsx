import { useState } from "react";
import type { FormEvent } from "react";
import { Mail, ShieldCheck, User } from "lucide-react";
import { formatAuthErrorMessage, validateEmail, validatePersonName } from "../validation";
import { AuthAlert } from "./AuthAlert";
import { AuthButton } from "./AuthButton";
import { AuthField } from "./AuthField";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { InfoCard } from "./InfoCard";
import { ACCOUNT_HEADLINE_ACCENT, ACCOUNT_HEADLINE_BEFORE, PAN_CARD_TEXT, PAN_CARD_TITLE } from "./signupCopy";

export interface AccountDetailsProps {
  initialName?: string;
  initialEmail?: string;
  /** The email is already verified (a refresh after the code): it is shown read-only and only the name is asked. */
  emailLocked?: boolean;
  /** Called with the cleaned name and the trimmed email. May be async; a rejection is shown on the screen. */
  onSubmit: (values: { name: string; email: string }) => void | Promise<void>;
  /** Shown under the email field on the return trip, where a changed email gets a new code. */
  emailNote?: string;
  /** Back to screen 1. Leave out when there is nothing to go back to. */
  onBack?: () => void;
  error?: string | null;
  submitting?: boolean;
}

const cleanName = (raw: string) => raw.replace(/[’‘]/g, "'").split(/\s+/).filter(Boolean).join(" ");

/** Sign-up screen 3: the PAN name and the email, together. */
export function AccountDetails({ initialName = "", initialEmail = "", emailLocked = false, emailNote, onSubmit, onBack, error = null, submitting = false }: AccountDetailsProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nameProblem = validatePersonName(name);
    const emailResult = emailLocked ? null : validateEmail(email.trim());
    const emailProblem = emailResult && !emailResult.isValid ? emailResult.error : null;
    setNameError(nameProblem);
    setEmailError(emailProblem);
    if (nameProblem || emailProblem) {
      document.getElementById(nameProblem ? "account-name" : "account-email")?.focus();
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      await onSubmit({ name: cleanName(name), email: email.trim() });
    } catch (err) {
      setSaveError(formatAuthErrorMessage(err, "Couldn't save your name. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const shownError = saveError ?? error;
  return (
    <AuthPage>
      <AuthSplitCard
        step={3}
        tone="white"
        bottomRule={false}
        onBack={onBack}
        left={
          <AuthLeftPanel
            sketch="idCard"
            headline={<>{ACCOUNT_HEADLINE_BEFORE}<span className="text-[var(--pos-text)]">{ACCOUNT_HEADLINE_ACCENT}</span></>}
            paragraph={null}
            infoCard={<InfoCard title={PAN_CARD_TITLE}>{PAN_CARD_TEXT}</InfoCard>}
          />
        }
        right={
          <form onSubmit={(event) => void submit(event)} noValidate className="auth-form">
            <div className="flex flex-col gap-[var(--auth-gap-sm)]">
              <h1 className="auth-h1">Create your account</h1>
              <p className="auth-sub">Tell us a few basic details to get started.</p>
            </div>
            <AuthField
              id="account-name"
              label="Full name (as per PAN card)"
              placeholder="e.g. Siddharth Surve"
              hint="Enter your name exactly as it appears on your PAN card."
              autoComplete="name"
              value={name}
              error={nameError}
              icon={<User size={20} />}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            <AuthField
              id="account-email"
              label="Email address"
              type="email"
              placeholder="e.g. siddharth@gmail.com"
              hint={emailLocked ? "This email address is verified." : `We'll use this for important updates about your account.${emailNote ? ` ${emailNote}` : ""}`}
              hintIcon={false}
              autoComplete="email"
              value={email}
              readOnly={emailLocked}
              error={emailError}
              icon={<Mail size={20} />}
              onChange={(event) => setEmail(event.target.value)}
            />
            {shownError ? <AuthAlert tone="error">{shownError}</AuthAlert> : null}
            <AuthButton type="submit" disabled={submitting || saving}>
              {saving ? "Saving..." : submitting ? "Sending..." : "Continue"}
            </AuthButton>
          </form>
        }
        bottom={
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--auth-muted)]">
            <ShieldCheck size={16} aria-hidden="true" />
            Your data is encrypted and protected.
          </span>
        }
      />
    </AuthPage>
  );
}
