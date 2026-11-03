# Packet S6-P3-FE for Gemini (Antigravity): the redesigned sign-up front screens (two phases)
**Status:** READY FOR GEMINI (red tests committed on `ui-round-2`; reference solution written by the orchestrator in a scratch worktree on top of the S6 login commit and run green against every test below, 3 Nov 2026). **Do this packet only after the S6 login packet is committed on `ui-round-2`** (it is: `ui-s6: Phase 2 login screens`): it uses the login copy, the code panel and the split card built there, and it edits files that packet changed.
**Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Stage S6 Phase 3, Tasks 6.8, 6.9 and 6.10. Spec: the planning page `Docs/orchestration/2026-11-02-auth-redesign-plan.html`, sections "Sign-up 1 Let's get started", "Sign-up 2 Verify your number", "Sign-up 3 Create your account" and the derived "Sign-up 3b Verify your email address" (decisions Q7 to Q11). Third of five S6 packets. **Task 6.11 (changing the email on the way back from the investor profile screen) moves to the next packet:** it needs screen 4, which does not exist yet.

## What this run is, in one paragraph
Two phases in one run. **A:** sign-up screen 1 ("Let's get started": a fixed +91 field, Get OTP, the one place the Terms and Privacy line appears, "Already have an account? Log in") and screen 2 ("Verify your number": the code panel with the number shown in full). **B:** screen 3 ("Create your account": the PAN-card name **and** the email on one screen), screen 3b (the email code, still "Step 3 of 5"), the small store that keeps the typed name until the account exists, and the hand-over that creates the self member from that name once the account is there. All of it is wired into `AuthEntryFlow` and `OnboardingFlow` for the `"split"` variant only. Behaviour is unchanged: the same API calls in the same order (phone code, then the email gate, then the email code, which creates the account), the legacy variant and the mobile screens render as before. The tests are already written and committed and **fail now**; make them pass without editing any test.

## Rules (read twice)
1. **Scope.** Create the 6 files and edit the 4 files in section 3, nothing else. Every test file is already in place (three older tests were updated by the orchestrator because sign-up screen 1 changed: `AuthEntryFlow.split.test.tsx`, `App.test.tsx`): **never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report.
2. **Run the phase checkpoint after every phase** and keep its real output for the report. Fix your code, not the test. **If a checkpoint is still red after two attempts, stop and report; do not start the next phase.**
3. **No new dependency, no `npm install`, no `package.json` change.**
4. **Never run a git command that changes anything.** Read-only `git status`, `git diff`, `git log` are fine.
5. **Do not touch `backend/**`, `public/illustrations/**`, or the mobile screens.**
6. **Behaviour is unchanged.** Sign-up still calls the existing handlers: `handleSignupPhoneSubmit` (the accepted Terms and Privacy versions travel with the request), `handlePhoneOtpSubmit`, `handleEmailGateSubmit(email)`, `handleEmailOtpSubmit`, `handleEmailOtpResend`. The account is created when the email code is verified (the backend requires it), so the typed name waits in `sessionStorage` until then. Only `variant="split"` changes: the legacy variant, the email-first and Google sign-up paths, the phone and email gates, the link-account step and the re-consent screens keep rendering through today's code.
7. **Auth screens are light only.** No dark-mode classes. Colours through the tokens already used in the foundation parts.
8. **Plain words on screen.** Exactly the strings in this packet. No em-dashes.
9. **Accessibility.** Every control keyboard reachable with a visible focus; errors announced; the code cells labelled; "Get code via call" stays a non-interactive, `aria-disabled` line (it has no function, design Q4).
10. **Style.** 2-space indentation, double quotes, semicolons, no `any`, no unused imports or locals (`tsc -b` is strict), no `console.`. **Do not add `oxlint-disable` or `eslint-disable` comments.** A file that exports a component must not also export a constant or a function (that is why the copy lives in `signupCopy.ts` and the store in `pendingSignup.ts`).
11. **If anything differs from this packet, stop and report it.**
12. **Run every command inside WSL** through the script in Step 0. A test that fails with "Unable to find an element ... timed out" under load: re-run that file alone before reporting it.

## Step 0: environment check (do this first, and report the output)
Work only in the Windows clone the prompt names. Run from that folder in PowerShell:
```
git status --short                 # expect: nothing printed (run this FIRST)
git branch --show-current          # expect: ui-round-2
git log --oneline -8               # expect: the line "ui-s6: red tests and packet for the S6 sign-up front screens (Gemini)" appears in the list, and "ui-s6: Phase 2 login screens" is below it
```
Every check goes through one command; replace `<mode and paths>`:
```
wsl.exe -d Ubuntu -- env CR6_SRC=/mnt/c/Users/Dell/<clone>/frontend CR6_DST=/home/delladiti/<clone>-chk bash /mnt/c/Users/Dell/<clone>/Docs/orchestration/cr-r6-fe-check.sh <mode and paths>
```
where `<clone>` is the folder name from the prompt, and `<mode and paths>` is `types`, `lint` or `test <paths under src/>`. Do **not** run `build` or the full suite, and do **not** run a test baseline: the committed tests are red on purpose (the orchestrator measured 12 failed files and 26 failed tests in `features/auth` plus `App.test.tsx` with the login screens in place). Run only:
```
types                      # expect: 9 error lines, all in test files (cannot find the six new sign-up modules, and the three new OtpPanel props title, description and errorAction); none in a source file
```
If `types` shows an error in a source file, stop and report. If `src/features/auth/redesign/LoginEntry.tsx` does not exist, the login screens are not on this branch: stop and report.

## Goal
Make every test in section 5 pass with the behaviour in section 4. **Non-goals:** the investor profile, connect and all-set screens, the email change on the way back (next packet), any backend change, the mobile screens, removing the legacy sign-up code.

## 3. File map (all under `frontend/src/features/auth/`)
**Create (6), under `redesign/`:** `signupCopy.ts`, `SignupPhoneEntry.tsx`, `SignupCode.tsx` (phase A); `pendingSignup.ts`, `AccountDetails.tsx`, `EmailCode.tsx` (phase B).
**Edit (4):** `redesign/OtpPanel.tsx` (phase A); `redesign/devScreens.tsx`, `AuthEntryFlow.tsx`, `OnboardingFlow.tsx` (phase B).
**Do not touch:** every test file, `redesign/AuthSplitCard.tsx` and the other foundation and login parts, `public/illustrations/**`, `components/ui/**`, the legacy sign-up screens (`Landing.tsx`, `PhoneEntry.tsx`, `EmailEntry.tsx`, `OtpVerify.tsx`, `Q1Name.tsx`), `SoloCasUpload.tsx`, `src/mobile/**`, `package.json`, `backend/**`.
If `git status` at the end shows a different list, stop and report.

## 4. Specifications

### Phase A: screens 1 and 2 (tasks 6.8 and 6.9)
- **Screen 1, `Let's get started`** (step bar `Step 1 of 5`, **no Back**): the laptop sketch; left panel = the same headline, rows and detail lines as login (`One dashboard for your family's financial life`, green accent on `financial life`) with the paragraph `Bring your family's investments together, uncover deeper insights, and make more informed financial decisions.` Right panel: `Let's get started`, `Enter your mobile number to create your Unifolio account.`, a **fixed `+91`** box (no drop-down, no chevron: design Q8) and the number field, `Get OTP`, then the line `By continuing, you agree to our Terms & Conditions and Privacy Policy.` (the existing `ConsentNotice`; **this is the only screen where it appears**, design Q11), and at the bottom `Already have an account? Log in`. `Get OTP` stays disabled until the Terms and Privacy documents have loaded (their versions travel with the request). A bad number shows the validator's message under the field. The 409 "account already exists" error shows in the shared alert with a green `Log in instead` shortcut.
- **Screen 2, `Verify your number`** (step bar `Step 2 of 5`, Back in the top bar): the phone sketch; left panel `Quick and secure.`, `We've sent a 6-digit verification code to`, the number **in full** (`+91 98765 43210`, not masked: the user just typed it) and **Edit number**. Right panel = the code panel with the heading `Verify your number`, the line `Enter the 6-digit code we sent to your mobile number.`, six labelled cells, the resend countdown, `Verify & Continue` and the drawn-but-inactive `OR` and `Get code via call`. Back and Edit number return to screen 1 **with the number kept**. The same "account already exists" error shows the `Log in instead` shortcut here too. To make this possible the code panel (`OtpPanel`) gets three optional props: `title`, `description` and `errorAction`; with none set it behaves exactly as today.

Create `features/auth/redesign/signupCopy.ts` exactly:
```ts
// Sign-up copy (design slides 2 to 10, 2 and 3 Nov 2026).
export const SIGNUP_PARAGRAPH = "Bring your family's investments together, uncover deeper insights, and make more informed financial decisions.";

export const SIGNUP_CODE_HEADLINE = "Quick and secure.";
export const SIGNUP_CODE_LEAD = "We've sent a 6-digit verification code to";
export const SIGNUP_CODE_TITLE = "Verify your number";
export const SIGNUP_CODE_DESCRIPTION = "Enter the 6-digit code we sent to your mobile number.";

export const ACCOUNT_HEADLINE_BEFORE = "Let's start with the ";
export const ACCOUNT_HEADLINE_ACCENT = "basics.";
export const PAN_CARD_TITLE = "Why do we need your PAN name?";
export const PAN_CARD_TEXT = "It helps us correctly match your investments across your accounts and avoid duplicates.";

export const EMAIL_CODE_HEADLINE = "Almost there.";
export const EMAIL_CODE_PARAGRAPH = "Confirm your email so we can keep your account secure and send you important updates.";

/** "+919876543210" -> "+91 98765 43210". The sign-up code screen shows the number in full: the user has just typed it. */
export function formatPhoneSpaced(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (digits.length !== 10) return phone;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}
```

Create `features/auth/redesign/SignupPhoneEntry.tsx` exactly:
```tsx
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
```

Create `features/auth/redesign/SignupCode.tsx` exactly:
```tsx
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
            infoCard={
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--ui-text)]">{shown}</p>
                <button type="button" onClick={onEditNumber} className="text-xs font-semibold text-[var(--pos-text)] hover:underline">
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
```

Apply this change to `features/auth/redesign/OtpPanel.tsx` (unified diff; lines starting with `-` go, lines starting with `+` come in):
```diff
--- a/frontend/src/features/auth/redesign/OtpPanel.tsx
+++ b/frontend/src/features/auth/redesign/OtpPanel.tsx
@@ -23,9 +23,15 @@ export interface OtpPanelProps {
   /** The "Get code via call" line is drawn but has no function (Q4). */
   showCall?: boolean;
+  /** Replaces the heading, which is otherwise "Verify your mobile number" or "Verify your email address". */
+  title?: string;
+  /** Replaces "Enter the 6-digit code sent to {identity}." */
+  description?: string;
+  /** A green shortcut under the error, such as "Log in instead". */
+  errorAction?: { label: string; onClick: () => void };
 }
 
 export function OtpPanel({
   channel, identity, submitLabel, devOtp, error, onSubmit, onResend, onBack, onEditIdentity, editLabel = "Edit",
-  submitting = false, showCall = true,
+  submitting = false, showCall = true, title, description, errorAction,
 }: OtpPanelProps) {
   const [code, setCode] = useState("");
@@ -48,7 +54,7 @@ export function OtpPanel({
       <div className="space-y-2">
         <h1 className="text-[26px] font-bold leading-tight text-[var(--ui-text)]">
-          {channel === "email" ? "Verify your email address" : "Verify your mobile number"}
+          {title ?? (channel === "email" ? "Verify your email address" : "Verify your mobile number")}
         </h1>
-        <p className="text-sm text-[var(--ui-text-muted)]">Enter the 6-digit code sent to {identity}.</p>
+        <p className="text-sm text-[var(--ui-text-muted)]">{description ?? `Enter the 6-digit code sent to ${identity}.`}</p>
         {onEditIdentity ? (
           <button type="button" onClick={onEditIdentity} className="text-xs font-semibold text-[var(--pos-text)] hover:underline">
@@ -71,5 +77,7 @@ export function OtpPanel({
         />
       </div>
-      {shown ? <AuthAlert tone="error">{shown}</AuthAlert> : null}
+      {shown ? (
+        <AuthAlert tone="error" action={local ? undefined : errorAction}>{shown}</AuthAlert>
+      ) : null}
       <Button type="submit" disabled={submitting} className="h-[52px] w-full rounded-full text-[15px] font-bold">
         {submitting ? (
```

**Checkpoint A:** `test src/features/auth/redesign/SignupPhoneEntry.test.tsx src/features/auth/redesign/SignupCode.test.tsx src/features/auth/redesign/signupCopy.test.ts src/features/auth/redesign/OtpPanel.overrides.test.tsx src/features/auth/redesign/OtpPanel.test.tsx` (expect all pass).

### Phase B: screens 3 and 3b, the stored name and the wiring (task 6.10)
- **Screen 3, `Create your account`** (step bar `Step 3 of 5`, Back goes to screen 1): the id-card sketch; left headline `Let's start with the basics.` (green accent on `basics.`) and, instead of a paragraph, the info card `Why do we need your PAN name?` / `It helps us correctly match your investments across your accounts and avoid duplicates.` Right panel: `Create your account`, `Tell us a few basic details to get started.`, the field `Full name (as per PAN card)` (placeholder `e.g. Siddharth Surve`, hint `Enter your name exactly as it appears on your PAN card.`, checked with `validatePersonName`), the field `Email address` (**required**, no "(optional)", placeholder `e.g. siddharth@gmail.com`, hint `We'll use this for important updates about your account.`, checked with `validateEmail`), `Continue`, and under the card's bottom row the shield line `Your data is encrypted and protected.` The Terms and Privacy line is **not** repeated here.
- **Screen 3b, the email code** (shown after Continue; step bar still `Step 3 of 5`, because the email check is a sub-step of step 3): the envelope sketch; left `Almost there.`, `Confirm your email so we can keep your account secure and send you important updates.`, the masked address (`as••••••@example.com`) and **Edit email address**; right = the code panel (`Verify your email address`, `Enter the 6-digit code sent to {masked}.`, six cells, countdown, `Verify & Continue`, **no** `Get code via call` on this screen). Back and Edit email address return to screen 3 with the name and the email kept.
- **Flow.** After a correct phone code the backend answers `email_required` with a pending token (today's behaviour): that now opens screen 3 instead of today's "One more step" screen. Continue on screen 3 saves `{ name, phone }` in `sessionStorage` (key `unifolio.pendingSignup`, inside try/catch) and calls the existing `handleEmailGateSubmit(email)`. A correct email code calls the existing `handleEmailOtpSubmit`, which creates the account and the session.
- **Hand-over in `OnboardingFlow`** (split variant, desktop, when the first step is the name step): if the stored phone equals the signed-in phone, create the **self member once** (list the household members first, create only if there is no self member; a double mount creates one), clear the store, and move straight on to today's investing question. A stored name for another phone is ignored and cleared. If nothing is stored (the page was refreshed after the code) or saving fails, show screen 3 with **only the name asked** and the verified email read-only (`This email address is verified.`); a failed save shows `Couldn't save your name. Try again.` with the name still filled and the stored name kept. `sessionStorage` failing must never break a screen. The legacy variant and the mobile flow never read the store.

Create `features/auth/redesign/pendingSignup.ts` exactly:
```ts
// The name typed on sign-up screen 3 waits here until the account exists (the backend creates it only once the email
// code is verified). sessionStorage can be blocked or full, so every access is wrapped and a failure is silent.
const KEY = "unifolio.pendingSignup";

export interface PendingSignup {
  name: string;
  /** Normalised +91 number the sign-up started with; a stored name for another number is ignored. */
  phone: string;
}

export function savePendingSignup(value: PendingSignup): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Nothing to do: the name step simply asks again after a refresh.
  }
}

export function readPendingSignup(): PendingSignup | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSignup> | null;
    return parsed && typeof parsed.name === "string" && typeof parsed.phone === "string" && parsed.name.trim()
      ? { name: parsed.name, phone: parsed.phone }
      : null;
  } catch {
    return null;
  }
}

export function clearPendingSignup(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // See above.
  }
}
```

Create `features/auth/redesign/AccountDetails.tsx` exactly:
```tsx
import { useState } from "react";
import type { FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAuthErrorMessage, validateEmail, validatePersonName } from "../validation";
import { AuthAlert } from "./AuthAlert";
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
  /** Back to screen 1. Leave out when there is nothing to go back to. */
  onBack?: () => void;
  error?: string | null;
  submitting?: boolean;
}

const cleanName = (raw: string) => raw.replace(/[’‘]/g, "'").split(/\s+/).filter(Boolean).join(" ");

/** Sign-up screen 3: the PAN name and the email, together. */
export function AccountDetails({ initialName = "", initialEmail = "", emailLocked = false, onSubmit, onBack, error = null, submitting = false }: AccountDetailsProps) {
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
    if (nameProblem || emailProblem) return;
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
          <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5 text-left">
            <div className="space-y-2">
              <h1 className="text-[26px] font-bold leading-tight text-[var(--ui-text)]">Create your account</h1>
              <p className="text-sm text-[var(--ui-text-muted)]">Tell us a few basic details to get started.</p>
            </div>
            <AuthField
              id="account-name"
              label="Full name (as per PAN card)"
              placeholder="e.g. Siddharth Surve"
              hint="Enter your name exactly as it appears on your PAN card."
              autoComplete="name"
              value={name}
              error={nameError}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            <AuthField
              id="account-email"
              label="Email address"
              type="email"
              placeholder="e.g. siddharth@gmail.com"
              hint={emailLocked ? "This email address is verified." : "We'll use this for important updates about your account."}
              autoComplete="email"
              value={email}
              readOnly={emailLocked}
              error={emailError}
              onChange={(event) => setEmail(event.target.value)}
            />
            {shownError ? <AuthAlert tone="error">{shownError}</AuthAlert> : null}
            <Button type="submit" disabled={submitting || saving} className="h-[52px] w-full rounded-full text-[15px] font-bold">
              {submitting || saving ? "Saving..." : "Continue"}
            </Button>
          </form>
        }
        bottom={
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--ui-text-muted)]">
            <ShieldCheck size={14} aria-hidden="true" />
            Your data is encrypted and protected.
          </span>
        }
      />
    </AuthPage>
  );
}
```

Create `features/auth/redesign/EmailCode.tsx` exactly:
```tsx
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
            infoCard={
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--ui-text)]">{masked}</p>
                <button type="button" onClick={onEditEmail} className="text-xs font-semibold text-[var(--pos-text)] hover:underline">
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
```

Apply these changes (unified diffs):

`features/auth/redesign/devScreens.tsx` (six new entries for the dev index):
```diff
--- a/frontend/src/features/auth/redesign/devScreens.tsx
+++ b/frontend/src/features/auth/redesign/devScreens.tsx
@@ -1,3 +1,4 @@
 import type { ReactNode } from "react";
+import { AccountDetails } from "./AccountDetails";
 import { AuthAlert } from "./AuthAlert";
 import { AuthField } from "./AuthField";
@@ -9,4 +10,7 @@ import { LoginEntry } from "./LoginEntry";
 import { OtpPanel } from "./OtpPanel";
 import { DevTabsDemo } from "./DevTabsDemo";
+import { EmailCode } from "./EmailCode";
+import { SignupCode } from "./SignupCode";
+import { SignupPhoneEntry } from "./SignupPhoneEntry";
 import { StatusRow } from "./StatusRow";
 import { StepProgress } from "./StepProgress";
@@ -74,4 +78,34 @@ export const DEV_SCREENS: DevScreen[] = [
     render: () => <LoginCode channel="email" identity="siddharth@gmail.com" devOtp={null} error="That code has expired." submitting={false} onSubmit={noop} onResend={noop} onBack={noop} onEditIdentity={noop} />,
   },
+  {
+    id: "signup-phone",
+    title: "Sign-up, step 1 (Let's get started)",
+    render: () => <SignupPhoneEntry error={null} submitting={false} legalReady onSubmit={noop} onLogin={noop} />,
+  },
+  {
+    id: "signup-phone-exists",
+    title: "Sign-up, step 1, account already exists",
+    render: () => <SignupPhoneEntry error="An account with this mobile number already exists." submitting={false} legalReady onSubmit={noop} onLogin={noop} />,
+  },
+  {
+    id: "signup-code",
+    title: "Sign-up, step 2 (mobile code)",
+    render: () => <SignupCode phone="+919876543210" devOtp="123456" error={null} submitting={false} onSubmit={noop} onResend={noop} onBack={noop} onEditNumber={noop} onLogin={noop} />,
+  },
+  {
+    id: "signup-account",
+    title: "Sign-up, step 3 (Create your account)",
+    render: () => <AccountDetails onSubmit={noop} onBack={noop} />,
+  },
+  {
+    id: "signup-account-locked",
+    title: "Sign-up, step 3, name only (email already verified)",
+    render: () => <AccountDetails initialEmail="siddharth@gmail.com" emailLocked onSubmit={noop} />,
+  },
+  {
+    id: "signup-email-code",
+    title: "Sign-up, step 3 (email code)",
+    render: () => <EmailCode email="siddharth@gmail.com" devOtp={null} error="That code has expired." submitting={false} onSubmit={noop} onResend={noop} onBack={noop} onEditEmail={noop} />,
+  },
   {
     id: "step-progress",
```

`features/auth/AuthEntryFlow.tsx`:
```diff
--- a/frontend/src/features/auth/AuthEntryFlow.tsx
+++ b/frontend/src/features/auth/AuthEntryFlow.tsx
@@ -19,7 +19,12 @@ import {
 } from "./api";
 import { isEmailRequired, isLinkRequired, isPhoneRequired } from "./types";
+import { AccountDetails } from "./redesign/AccountDetails";
 import { AUTH_SHOW_GOOGLE } from "./redesign/authConfig";
+import { EmailCode } from "./redesign/EmailCode";
 import { LoginCode } from "./redesign/LoginCode";
 import { LoginEntry } from "./redesign/LoginEntry";
+import { savePendingSignup } from "./redesign/pendingSignup";
+import { SignupCode } from "./redesign/SignupCode";
+import { SignupPhoneEntry } from "./redesign/SignupPhoneEntry";
 import type { ExistingMethod } from "./types";
 import { useAuth } from "./AuthContext";
@@ -75,4 +80,7 @@ export function AuthEntryFlow({
   const [loginTab, setLoginTab] = useState<"email" | "phone">("email");
   const [loginValue, setLoginValue] = useState("");
+  // The split sign-up screen 3 keeps what was typed so Back and Edit from the email code return to it filled.
+  const [signupName, setSignupName] = useState("");
+  const [signupEmailInput, setSignupEmailInput] = useState("");
 
   // Mandatory phone-gate state (Design Spec §1): set when a Google/email
@@ -716,4 +724,69 @@ export function AuthEntryFlow({
   }
 
+  // The split variant redraws phone-first sign-up (screens 1 to 3b). The email-first and Google sign-up paths, the
+  // gate and link-account steps keep rendering as before.
+  const splitSignup = variant === "split" && authMode === "signup" && !googleConsentToken && !phoneGateToken && !linkInfo;
+  if (splitSignup && (step === "landing" || step === "phone")) {
+    return (
+      <SignupPhoneEntry
+        error={error}
+        submitting={submitting}
+        legalReady={Boolean(docs)}
+        legalLoadError={docsError}
+        onLegalRetry={() => void refetch()}
+        initialValue={identifier}
+        onSubmit={(phone) => void handleSignupPhoneSubmit(phone)}
+        onLogin={handleGoToLogin}
+      />
+    );
+  }
+  if (splitSignup && step === "otp") {
+    return (
+      <SignupCode
+        phone={identifier}
+        devOtp={devOtp}
+        error={error}
+        submitting={submitting}
+        onSubmit={(code) => void handlePhoneOtpSubmit(code)}
+        onResend={() => void handlePhoneSubmit(identifier)}
+        onBack={() => goToStep("landing")}
+        onEditNumber={() => goToStep("landing")}
+        onLogin={handleGoToLogin}
+      />
+    );
+  }
+  if (splitSignup && step === "email" && emailGateToken) {
+    return (
+      <AccountDetails
+        initialName={signupName}
+        initialEmail={signupEmailInput}
+        error={error}
+        submitting={submitting}
+        onBack={() => goToStep("landing")}
+        onSubmit={({ name, email }) => {
+          setSignupName(name);
+          setSignupEmailInput(email);
+          // The account is created when the email code is verified, so the name waits in sessionStorage until then.
+          savePendingSignup({ name, phone: identifier });
+          void handleEmailGateSubmit(email);
+        }}
+      />
+    );
+  }
+  if (splitSignup && step === "email_otp" && emailOtpFlow === "phone_first") {
+    return (
+      <EmailCode
+        email={emailOtpEmail}
+        devOtp={devOtp}
+        error={error}
+        submitting={submitting}
+        onSubmit={(code) => void handleEmailOtpSubmit(code)}
+        onResend={() => void handleEmailOtpResend()}
+        onBack={() => goToStep("email")}
+        onEditEmail={() => goToStep("email")}
+      />
+    );
+  }
+
   return (
     <AuthShell
```

`features/auth/OnboardingFlow.tsx`:
```diff
--- a/frontend/src/features/auth/OnboardingFlow.tsx
+++ b/frontend/src/features/auth/OnboardingFlow.tsx
@@ -1,4 +1,4 @@
 import type { AuthVariant } from "./redesign/variant";
-import { useEffect, useState } from "react";
+import { useEffect, useRef, useState } from "react";
 import { useAuth } from "./AuthContext";
 import { currentStep, goBack, goNext, initHistory, isSkipped, markAnswered, skipToNext } from "./onboardingHistory";
@@ -11,5 +11,8 @@ import { ALL_GOALS, Q3Purpose } from "./Q3Purpose";
 import { OnboardingCardStack } from "./OnboardingCardStack";
 import { SoloCasUpload } from "./SoloCasUpload";
-import { createHouseholdMember } from "./api";
+import { createHouseholdMember, listHouseholdMembers } from "./api";
+import { AccountDetails } from "./redesign/AccountDetails";
+import { AuthPage } from "./redesign/AuthPage";
+import { clearPendingSignup, readPendingSignup } from "./redesign/pendingSignup";
 import type { InvestorType, MeResponse, PrimaryGoal } from "./types";
 
@@ -48,6 +51,7 @@ interface OnboardingFlowProps {
 }
 
-export function OnboardingFlow({ isMobile = false }: OnboardingFlowProps) {
+export function OnboardingFlow({ isMobile = false, variant = "legacy" }: OnboardingFlowProps) {
   const { me, updateMe } = useAuth();
+  const split = variant === "split" && !isMobile;
   const [history, setHistory] = useState<HistoryState>(() => initHistory(resumeStep(me)));
   const [answers, setAnswers] = useState<OnboardingAnswers>(() => ({
@@ -59,4 +63,47 @@ export function OnboardingFlow({ isMobile = false }: OnboardingFlowProps) {
   const step = currentStep(history);
 
+  // Split sign-up: the name typed on screen 3 was kept in sessionStorage because the account did not exist yet. Now
+  // it does, so the self member is created from it (list first, so a reload never makes a second one) and the flow
+  // moves on. A stored name for another phone number is dropped. If saving fails, or nothing is stored (a refresh),
+  // the name screen is shown with the verified email read-only.
+  const [handover, setHandover] = useState<"checking" | "saving" | "idle">(() => {
+    if (!split || step !== "q1_name") return "idle";
+    const pending = readPendingSignup();
+    return pending && pending.phone === me?.phone_number ? "saving" : "checking";
+  });
+  const [handoverError, setHandoverError] = useState<string | null>(null);
+  const handoverStarted = useRef(false);
+  useEffect(() => {
+    if (handover === "checking") {
+      const pending = readPendingSignup();
+      if (pending && pending.phone !== me?.phone_number) clearPendingSignup();
+      setHandover("idle");
+      return;
+    }
+    if (handover !== "saving" || handoverStarted.current) return;
+    handoverStarted.current = true;
+    const pending = readPendingSignup();
+    if (!pending) {
+      setHandover("idle");
+      return;
+    }
+    void (async () => {
+      try {
+        const members = await listHouseholdMembers();
+        if (!members.some((member) => member.relationship === "self")) {
+          await createHouseholdMember(pending.name, "self");
+        }
+        clearPendingSignup();
+        setAnswers((a) => ({ ...a, name: pending.name }));
+        setHistory((h) => goNext(markAnswered(h), "q2_investing"));
+        setHandover("idle");
+      } catch {
+        setAnswers((a) => ({ ...a, name: pending.name }));
+        setHandoverError("Couldn't save your name. Try again.");
+        setHandover("idle");
+      }
+    })();
+  }, [handover, me?.phone_number]);
+
   useEffect(() => {
     if (step !== "done") {
@@ -76,4 +123,5 @@ export function OnboardingFlow({ isMobile = false }: OnboardingFlowProps) {
   const submitName = async (name: string) => {
     await createHouseholdMember(name, "self");
+    clearPendingSignup();
     setAnswers((a) => ({ ...a, name }));
     advance("q2_investing");
@@ -81,4 +129,23 @@ export function OnboardingFlow({ isMobile = false }: OnboardingFlowProps) {
 
   const renderStep = () => {
+    if (step === "q1_name" && split) {
+      if (handover !== "idle") {
+        return (
+          <AuthPage>
+            <p role="status" className="text-sm text-[var(--ui-text-muted)]">Setting up your profile...</p>
+          </AuthPage>
+        );
+      }
+      return (
+        <AccountDetails
+          initialName={answers.name}
+          initialEmail={me?.email ?? ""}
+          emailLocked
+          error={handoverError}
+          onSubmit={({ name }) => submitName(name)}
+        />
+      );
+    }
+
     if (step === "q1_name") {
       return isMobile ? (
```

**Checkpoint B:** `test src/features/auth src/AppVariant.test.tsx src/App.test.tsx` (expect all pass), then `types` (no output) and `lint` (0 errors; the number of warnings must not go up).

## 5. Tests to satisfy (committed)
Phase A: `redesign/SignupPhoneEntry.test.tsx`, `redesign/SignupCode.test.tsx`, `redesign/signupCopy.test.ts`, `redesign/OtpPanel.overrides.test.tsx`. Phase B: `redesign/AccountDetails.test.tsx`, `redesign/EmailCode.test.tsx`, `redesign/pendingSignup.test.ts`, `redesign/devScreens.signup.test.tsx`, `AuthEntryFlow.signup.split.test.tsx` (the whole sign-up flow through `AuthEntryFlow`, including Edit, Back, the account-exists shortcut and the stored name), `OnboardingFlow.split.test.tsx` (the hand-over), and the two updated older tests `AuthEntryFlow.split.test.tsx` and `App.test.tsx`.

## 6. Final checks (run all, report the real output)
```
types                      # expect: no output
lint                       # expect: 0 errors
test src/features/auth src/AppVariant.test.tsx src/App.test.tsx src/mobile src/shell src/features/legal
git status --short         # expect: exactly the 6 created and 4 edited source files of section 3 (no test)
```
Do **not** run `build` or the full suite. If one test fails only under load, re-run that file alone before reporting it.

## 7. Report (one block, from the rules file)
Add: the exact output of Step 0 (the git lines and the `types` result); the result of checkpoints A and B; the list of files created and edited (it must match section 3); every place you deviated from this packet and why; what you could not check (you cannot see the screen: the orchestrator opens the dev index and walks sign-up screens 1 to 3b, and takes the screenshots).
