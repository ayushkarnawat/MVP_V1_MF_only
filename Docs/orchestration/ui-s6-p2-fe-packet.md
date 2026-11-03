# Packet S6-P2-FE for Gemini (Antigravity): the redesigned login screens (two phases)
**Status:** READY FOR GEMINI (red tests committed on `ui-round-2`; reference solution written by the orchestrator in a scratch worktree on top of the S6 foundations and run green against every test below, 3 Nov 2026). **Do this packet only after the S6 foundations packet (`ui-s6-p1-fe-packet.md`) is finished and committed on `ui-round-2`**: it uses the split card, the left panel, the code panel and the masks built there, and it edits two of those files.
**Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Stage S6 Phase 2, Tasks 6.6 and 6.7. Spec: the planning page `Docs/orchestration/2026-11-02-auth-redesign-plan.html`, sections "Login 1 · Welcome back", "Login 2 · Verify your mobile number", "Login 3 · Verify your email address" (decisions Q1 to Q6). Rules file: `Docs/orchestration/ui-common-rules-antigravity.md` (read it first; this packet adds to it). Second of five S6 packets.

## What this run is, in one paragraph
Two phases in one run. **A:** login screen 1, "Welcome back": two tabs (**Email** is the default, **Mobile number**), one field, **Get OTP**, an `OR` line and "New to Unifolio? Sign up", with the laptop sketch and the new left-panel copy (headline with a green accent, one paragraph, three rows with a detail line). The Google button is hidden behind one setting. **B:** the two code screens (mobile and email) with the masked identity and an Edit link in the left panel, wired into `AuthEntryFlow` for the `"split"` variant only. Today's behaviour is unchanged: the same API calls, the same error handling, the legacy variant and the whole of sign-up still render as before (later packets replace sign-up). The tests are already written and committed and **fail now**; make them pass without editing any test.

## Rules (read twice)
1. **Scope.** Create the 5 files and edit the 4 files in section 3, nothing else. Every test file is already in place: **never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report.
2. **Run the phase checkpoint after every phase** and keep its real output for the report. Fix your code, not the test. **If a checkpoint is still red after two attempts, stop and report; do not start the next phase.**
3. **No new dependency, no `npm install`, no `package.json` change.**
4. **Never run a git command that changes anything.** Read-only `git status`, `git diff`, `git log` are fine.
5. **Do not touch `backend/**`, `public/illustrations/**`, or the mobile screens.**
6. **Behaviour is unchanged.** Login still calls the existing handlers: `handleEmailLoginRequest(email)` for the Email tab and `handlePhoneSubmit(phone)` for the Mobile tab (so today's separate email and phone login steps are skipped), `handleEmailOtpSubmit`, `handlePhoneOtpSubmit`, `handleEmailOtpResend`. Existing validators (`validateEmail`, `validateIndianPhone`) and the error mapping stay. Only the `variant="split"` login path changes; `variant="legacy"`, sign-up, the phone and email gates, the link-account step and Google consent keep rendering through today's code.
7. **Auth screens are light only.** No dark-mode classes. Colours through the tokens already used in the foundation parts.
8. **Plain words on screen.** Exactly the strings in this packet. No em-dashes. The arrow in `Sign up →` is part of the design.
9. **Accessibility.** Every control keyboard reachable with a visible focus; errors announced; the code cells labelled; "Get code via call" stays a non-interactive, `aria-disabled` line (it has no function, design Q4).
10. **Style.** 2-space indentation, double quotes, semicolons, no `any`, no unused imports or locals (`tsc -b` is strict), no `console.`. **Do not add `oxlint-disable` or `eslint-disable` comments.** A file that exports a component must not also export a constant (that is why the copy lives in `loginCopy.ts`).
11. **If anything differs from this packet, stop and report it.**
12. **Run every command inside WSL** through the script in Step 0. A test that fails with "Unable to find an element ... timed out" under load: re-run that file alone before reporting it.

## Step 0: environment check (do this first, and report the output)
Work only in the Windows clone the prompt names. Run from that folder in PowerShell:
```
git status --short                 # expect: nothing printed (run this FIRST)
git branch --show-current          # expect: ui-round-2
git log --oneline -8               # expect: the line "ui-s6: red tests and packet for the S6 login screens (Gemini)" appears in the list, and the foundations commit "ui-s6: Phase 1 foundations" (or the one the prompt names) is below it
```
Every check goes through one command; replace `<mode and paths>`:
```
wsl.exe -d Ubuntu -- env CR6_SRC=/mnt/c/Users/Dell/<clone>/frontend CR6_DST=/home/delladiti/<clone>-chk bash /mnt/c/Users/Dell/<clone>/Docs/orchestration/cr-r6-fe-check.sh <mode and paths>
```
where `<clone>` is the folder name from the prompt, and `<mode and paths>` is `types`, `lint` or `test <paths under src/>`. Do **not** run `build` or the full suite, and do **not** run a test baseline: the committed tests are red on purpose (the orchestrator measured 5 failed files and 11 (of 299) failed tests in `features/auth` with the foundations in place). Run only:
```
types                      # expect: 4 error lines, all in test files (cannot find the new login modules, and the new `detail` row property); none in a source file
```
If `types` shows an error in a source file, stop and report. If `src/features/auth/redesign/OtpPanel.tsx` does not exist, the foundations are not on this branch: stop and report.

## Goal
Make every test in section 5 pass with the behaviour in section 4. **Non-goals:** sign-up screens, the onboarding screens, any backend change, the mobile screens, removing the legacy login code.

## 3. File map (all under `frontend/src/features/auth/`)
**Create (5), under `redesign/`:** `authConfig.ts`, `AuthPage.tsx`, `loginCopy.ts`, `LoginEntry.tsx`, `LoginCode.tsx`.
**Edit (4):** `redesign/AuthLeftPanel.tsx`, `redesign/OtpPanel.tsx`, `redesign/devScreens.tsx`, `AuthEntryFlow.tsx`.
**Do not touch:** every test file, `redesign/AuthSplitCard.tsx` and the other foundation parts, `public/illustrations/**`, `components/ui/**`, the legacy login screens, `src/mobile/**`, `package.json`, `backend/**`.
If `git status` at the end shows a different list, stop and report.

## 4. Specifications

### Phase A: login screen 1, Welcome back (task 6.6)
- `authConfig.ts`: one setting, `AUTH_SHOW_GOOGLE = false`. The Google component and the backend path stay in the repo (design Q1); turning the setting on shows the Google button under the `OR` line.
- Right panel: `Welcome back`, `Log in to continue to your Unifolio account.`, the tabs (**Email** default, design Q3), one field (label `Email address` with the placeholder `you@example.com`, or label `Mobile number` with the placeholder `98765 43210`), `Get OTP` (`Sending...` while sending), `OR`, and the bottom row `New to Unifolio? Sign up →`. A bad value shows the validator's own message inline under the field. A server error shows in the shared alert; **"No account found" shows the alert with a green `Sign up` shortcut**. A sign-in notice (for example after being signed out) shows as a polite status. Each tab keeps what was typed when you switch.
- **Back and the Sign up link do the same thing: both go to sign-up screen 1** (design Q2). Login has no step bar.
- Left panel (login 1 only): the laptop sketch, the headline `One dashboard for your family's financial life` (green accent on `financial life`), the paragraph `Pick up where you left off.`, and three rows each with a title and a detail line, all left-aligned.

Create `features/auth/redesign/authConfig.ts` exactly:
```ts
/** The Google button on login is hidden (design Q1). One setting turns it back on; the component and the backend path stay. */
export const AUTH_SHOW_GOOGLE = false;
```

Create `features/auth/redesign/AuthPage.tsx` exactly:
```tsx
import type { ReactNode } from "react";

/** The page the split card sits on: light only, centred, with room around the card. */
export function AuthPage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center bg-[#F4FAF6] p-6">{children}</div>;
}
```

Create `features/auth/redesign/loginCopy.ts` exactly:
```ts
// The login copy slide (3 Nov 2026): one headline with a green accent, one paragraph, three rows with a detail line.
export const LOGIN_HEADLINE_BEFORE = "One dashboard for your family's ";
export const LOGIN_HEADLINE_ACCENT = "financial life";

export const LOGIN_PARAGRAPH = "Pick up where you left off.";

export const LOGIN_ROWS = [
  { text: "All your investments", detail: "Mutual funds, stocks, PMS, real estate, gold and more." },
  { text: "Insights that matter", detail: "Understand performance, uncover overlap and spot potential risks." },
  { text: "Your family's wealth, together", detail: "See your family's investments in one place." },
];

export const CODE_SCREEN_PARAGRAPH = "Enter the code we sent to verify your identity and securely access your Unifolio account.";
```

Create `features/auth/redesign/LoginEntry.tsx` exactly:
```tsx
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { GoogleButton } from "../GoogleButton";
import { isNoAccountError, validateEmail, validateIndianPhone } from "../validation";
import { AuthAlert } from "./AuthAlert";
import { AUTH_SHOW_GOOGLE } from "./authConfig";
import { AuthField } from "./AuthField";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
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

const TABS = [{ value: "email", label: "Email" }, { value: "phone", label: "Mobile number" }] as const;

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
        return;
      }
      setFieldError(null);
      onSubmitEmail(emailValue.trim());
      return;
    }
    const result = validateIndianPhone(phoneValue);
    if (!result.isValid) {
      setFieldError(result.error);
      return;
    }
    setFieldError(null);
    onSubmitPhone(result.normalized);
  };

  return (
    <AuthPage>
      <AuthSplitCard
        onBack={onSignUp}
        left={
          <AuthLeftPanel
            sketch="laptop"
            headline={<>{LOGIN_HEADLINE_BEFORE}<span className="text-[var(--pos-text)]">{LOGIN_HEADLINE_ACCENT}</span></>}
            paragraph={LOGIN_PARAGRAPH}
            rows={LOGIN_ROWS}
          />
        }
        right={
          <form onSubmit={submit} noValidate className="space-y-5 text-left">
            <div className="space-y-2">
              <h1 className="text-[26px] font-bold leading-tight text-[var(--ui-text)]">Welcome back</h1>
              <p className="text-sm text-[var(--ui-text-muted)]">Log in to continue to your Unifolio account.</p>
            </div>
            {notice ? <AuthAlert tone="info">{notice}</AuthAlert> : null}
            <SegmentedTabs
              label="Log in with"
              options={TABS}
              value={tab}
              onChange={(next) => {
                setTab(next);
                setFieldError(null);
              }}
            />
            {tab === "email" ? (
              <AuthField id="login-email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" value={emailValue} error={fieldError} onChange={(event) => setEmailValue(event.target.value)} />
            ) : (
              <AuthField id="login-phone" label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phoneValue} error={fieldError} onChange={(event) => setPhoneValue(event.target.value)} />
            )}
            {error ? (
              isNoAccountError(error) ? (
                <AuthAlert tone="error" action={{ label: "Sign up", onClick: onSignUp }}>{error}</AuthAlert>
              ) : (
                <AuthAlert tone="error">{error}</AuthAlert>
              )
            ) : null}
            <Button type="submit" disabled={submitting} className="h-[52px] w-full rounded-full text-[15px] font-bold">
              {submitting ? "Sending..." : "Get OTP"}
            </Button>
            <p className="text-center text-xs text-[var(--ui-text-muted)]">OR</p>
            {showGoogle && onGoogleCredential ? <GoogleButton onCredential={onGoogleCredential} /> : null}
          </form>
        }
        bottom={
          <span className="text-[var(--ui-text-muted)]">
            New to Unifolio?{" "}
            <button type="button" onClick={onSignUp} className="font-semibold text-[var(--pos-text)] hover:underline">
              Sign up →
            </button>
          </span>
        }
      />
    </AuthPage>
  );
}
```

Apply this change to `features/auth/redesign/AuthLeftPanel.tsx` (rows can carry a detail line; unified diff):
```diff
--- a/frontend/src/features/auth/redesign/AuthLeftPanel.tsx
+++ b/frontend/src/features/auth/redesign/AuthLeftPanel.tsx
@@ -8,5 +8,5 @@ export interface AuthLeftPanelProps {
   paragraph: ReactNode;
   /** The three plain feature rows. */
-  rows?: { text: string; icon?: ReactNode }[];
+  rows?: { text: string; /** A smaller line under the title. */ detail?: string; icon?: ReactNode }[];
   /** Instead of the rows: an info card (sign-up screen 3). */
   infoCard?: ReactNode;
@@ -37,7 +37,14 @@ export function AuthLeftPanel({ sketch, headline, paragraph, rows, infoCard, sta
           <ul className="mt-6 space-y-4">
             {rows.map((row) => (
-              <li key={row.text} className="flex items-center gap-3 text-sm text-[var(--ui-text)]">
+              <li key={row.text} className="flex items-start gap-3 text-sm text-[var(--ui-text)]">
                 {row.icon}
-                {row.text}
+                {row.detail ? (
+                  <span>
+                    <strong className="block font-semibold">{row.text}</strong>
+                    <span className="block text-xs text-[var(--ui-text-muted)]">{row.detail}</span>
+                  </span>
+                ) : (
+                  row.text
+                )}
               </li>
             ))}
```

**Checkpoint A:** `test src/features/auth/redesign/LoginEntry.test.tsx src/features/auth/redesign/authConfig.test.ts` (expect all pass).

### Phase B: the code screens and the wiring (task 6.7)
- Mobile code screen: the phone sketch; left panel `Welcome back.`, `Enter the code we sent to verify your identity and securely access your Unifolio account.`, the masked number (`+91 ••••• 43210`) and **Edit number**. Email code screen: the envelope sketch, the masked address (`si••••••@gmail.com`) and **Edit email address**. Right panel (both): the code panel with the heading `Verify your mobile number` or `Verify your email address`, `Enter the 6-digit code sent to {masked}.`, six labelled cells, `Didn't receive the code? Resend code in 01:00`, `Verify and log in`, and the drawn-but-inactive `OR` and `Get code via call` (the email screen keeps it, as in the mockup). The test code strip shows only when the backend returns a code.
- `Edit` and `Back` return to login 1 **with the tab and the typed value kept**. A correct code logs in through the existing handler (then Home, or onboarding first if it was not finished, exactly as today). A wrong or expired code shows the shared alert. Resend respects the countdown; a 429 message from the server is shown as it is.
- Wiring in `AuthEntryFlow`: the new screens render only when `variant === "split"` and the mode is login and none of the gate, link-account or Google-consent states is active. The Log in link on today's sign-up screen leads to the new Welcome back screen. Sign-up mode is untouched.

Create `features/auth/redesign/LoginCode.tsx` exactly:
```tsx
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
            infoCard={
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--ui-text)]">{masked}</p>
                <button type="button" onClick={onEditIdentity} className="text-xs font-semibold text-[var(--pos-text)] hover:underline">
                  {channel === "phone" ? "Edit number" : "Edit email address"}
                </button>
              </div>
            }
          />
        }
        right={<OtpPanel channel={channel} identity={masked} submitLabel="Verify and log in" devOtp={devOtp} error={error} submitting={submitting} onSubmit={onSubmit} onResend={onResend} />}
      />
    </AuthPage>
  );
}
```

Apply these changes (unified diffs; lines starting with `-` go, lines starting with `+` come in):

`features/auth/redesign/OtpPanel.tsx` (two wording fixes from the design):
```diff
--- a/frontend/src/features/auth/redesign/OtpPanel.tsx
+++ b/frontend/src/features/auth/redesign/OtpPanel.tsx
@@ -50,5 +50,5 @@ export function OtpPanel({
           {channel === "email" ? "Verify your email address" : "Verify your mobile number"}
         </h1>
-        <p className="text-sm text-[var(--ui-text-muted)]">We sent a 6-digit code to {identity}</p>
+        <p className="text-sm text-[var(--ui-text-muted)]">Enter the 6-digit code sent to {identity}.</p>
         {onEditIdentity ? (
           <button type="button" onClick={onEditIdentity} className="text-xs font-semibold text-[var(--pos-text)] hover:underline">
@@ -83,5 +83,5 @@ export function OtpPanel({
       </Button>
       <div className="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
-        <span>Didn&apos;t get the code?</span>
+        <span>Didn&apos;t receive the code?</span>
         <button
           type="button"
```

`features/auth/redesign/devScreens.tsx` (three new entries for the dev index):
```diff
--- a/frontend/src/features/auth/redesign/devScreens.tsx
+++ b/frontend/src/features/auth/redesign/devScreens.tsx
@@ -5,4 +5,6 @@ import { AuthLeftPanel } from "./AuthLeftPanel";
 import { AuthSplitCard } from "./AuthSplitCard";
 import { InfoCard } from "./InfoCard";
+import { LoginCode } from "./LoginCode";
+import { LoginEntry } from "./LoginEntry";
 import { OtpPanel } from "./OtpPanel";
 import { DevTabsDemo } from "./DevTabsDemo";
@@ -57,4 +59,19 @@ export const DEV_SCREENS: DevScreen[] = [
     ),
   },
+  {
+    id: "login-entry",
+    title: "Login, step 1 (Welcome back)",
+    render: () => <LoginEntry error={null} submitting={false} onSubmitEmail={noop} onSubmitPhone={noop} onSignUp={noop} />,
+  },
+  {
+    id: "login-code-phone",
+    title: "Login, mobile code",
+    render: () => <LoginCode channel="phone" identity="+919876543210" devOtp="123456" error={null} submitting={false} onSubmit={noop} onResend={noop} onBack={noop} onEditIdentity={noop} />,
+  },
+  {
+    id: "login-code-email",
+    title: "Login, email code",
+    render: () => <LoginCode channel="email" identity="siddharth@gmail.com" devOtp={null} error="That code has expired." submitting={false} onSubmit={noop} onResend={noop} onBack={noop} onEditIdentity={noop} />,
+  },
   {
     id: "step-progress",
```

`features/auth/AuthEntryFlow.tsx`:
```diff
--- a/frontend/src/features/auth/AuthEntryFlow.tsx
+++ b/frontend/src/features/auth/AuthEntryFlow.tsx
@@ -19,4 +19,7 @@ import {
 } from "./api";
 import { isEmailRequired, isLinkRequired, isPhoneRequired } from "./types";
+import { AUTH_SHOW_GOOGLE } from "./redesign/authConfig";
+import { LoginCode } from "./redesign/LoginCode";
+import { LoginEntry } from "./redesign/LoginEntry";
 import type { ExistingMethod } from "./types";
 import { useAuth } from "./AuthContext";
@@ -52,4 +55,5 @@ export function AuthEntryFlow({
   initialMode = "signup",
   initialStep = "landing",
+  variant = "legacy",
 }: AuthEntryFlowProps = {}) {
   const { login } = useAuth();
@@ -68,4 +72,7 @@ export function AuthEntryFlow({
   const [error, setError] = useState<string | null>(null);
   const [devOtp, setDevOtp] = useState<string | null>(null);
+  // The split login screen keeps what was typed so Edit and Back from the code screens return to it filled.
+  const [loginTab, setLoginTab] = useState<"email" | "phone">("email");
+  const [loginValue, setLoginValue] = useState("");
 
   // Mandatory phone-gate state (Design Spec §1): set when a Google/email
@@ -650,4 +657,63 @@ export function AuthEntryFlow({
   };
 
+  // The split variant redraws login (screens 1 to 3). Everything else, including sign-up and the gate and link steps,
+  // still renders as before until later S6 tasks replace it.
+  const splitLogin =
+    variant === "split" && authMode === "login" && !googleConsentToken && !phoneGateToken && !emailGateToken && !linkInfo;
+  if (splitLogin && (step === "landing" || step === "email" || step === "phone")) {
+    return (
+      <LoginEntry
+        error={error}
+        notice={notice}
+        submitting={submitting}
+        initialTab={loginTab}
+        initialValue={loginValue}
+        showGoogle={AUTH_SHOW_GOOGLE}
+        onGoogleCredential={(idToken) => void handleGoogleCredential(idToken)}
+        onSignUp={handleGoToSignup}
+        onSubmitEmail={(email) => {
+          setLoginTab("email");
+          setLoginValue(email);
+          void handleEmailLoginRequest(email);
+        }}
+        onSubmitPhone={(phone) => {
+          setLoginTab("phone");
+          setLoginValue(phone);
+          void handlePhoneSubmit(phone);
+        }}
+      />
+    );
+  }
+  if (splitLogin && step === "email_otp" && emailOtpFlow === "login") {
+    return (
+      <LoginCode
+        channel="email"
+        identity={emailOtpEmail}
+        devOtp={devOtp}
+        error={error}
+        submitting={submitting}
+        onSubmit={(code) => void handleEmailOtpSubmit(code)}
+        onResend={() => void handleEmailOtpResend()}
+        onBack={() => goToStep("landing")}
+        onEditIdentity={() => goToStep("landing")}
+      />
+    );
+  }
+  if (splitLogin && step === "otp") {
+    return (
+      <LoginCode
+        channel="phone"
+        identity={identifier}
+        devOtp={devOtp}
+        error={error}
+        submitting={submitting}
+        onSubmit={(code) => void handlePhoneOtpSubmit(code)}
+        onResend={() => void handlePhoneSubmit(identifier)}
+        onBack={() => goToStep("landing")}
+        onEditIdentity={() => goToStep("landing")}
+      />
+    );
+  }
+
   return (
     <AuthShell
```

**Checkpoint B:** `test src/features/auth src/AppVariant.test.tsx` (expect all pass), then `types` (no output) and `lint` (0 errors; the number of warnings must not go up).

## 5. Tests to satisfy (committed)
Phase A: `redesign/LoginEntry.test.tsx`, `redesign/authConfig.test.ts`. Phase B: `redesign/LoginCode.test.tsx`, `redesign/loginCopy.test.tsx` (the left-panel detail line and the code panel wording), `AuthEntryFlow.split.test.tsx` (the whole login flow through `AuthEntryFlow`, including Edit and Back, no account found, and the Log in link).

## 6. Final checks (run all, report the real output)
```
types                      # expect: no output
lint                       # expect: 0 errors
test src/features/auth src/AppVariant.test.tsx src/App.test.tsx src/mobile src/shell src/features/legal
git status --short         # expect: exactly the 5 created and 4 edited source files of section 3 (no test)
```
Do **not** run `build` or the full suite. If one test fails only under load, re-run that file alone before reporting it.

## 7. Report (one block, from the rules file)
Add: the exact output of Step 0 (the git lines and the `types` result); the result of checkpoints A and B; the list of files created and edited (it must match section 3); every place you deviated from this packet and why; what you could not check (you cannot see the screen: the orchestrator opens the dev index and walks login by email and by mobile, and takes the screenshots).
