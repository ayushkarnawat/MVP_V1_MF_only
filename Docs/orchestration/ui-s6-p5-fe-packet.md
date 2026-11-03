# Packet S6-P5-FE for Gemini (Antigravity): states, tablet and accessibility for the redesigned auth screens (two phases)
**Status:** READY FOR GEMINI (red tests committed on `ui-round-2`; reference solution written by the orchestrator in a scratch worktree on top of the S6 sign-up back commit and run green against every test below, 3 Nov 2026). **Do this packet only after the S6 sign-up back packet (`ui-s6-p4-fe-packet.md`) is committed on `ui-round-2`** (`ui-s6: Phase 4 sign-up back`): it touches the screens built in packets 2 to 4.
**Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Stage S6 Phase 5, Task 6.15. Spec: the planning page `Docs/orchestration/2026-11-02-auth-redesign-plan.html`, sections "System", "Gaps" and the stage checks (decisions Q20, Q21). Last of five S6 packets.

## What this run is, in one paragraph
Seven small, separate fixes found by reading every redesigned screen against the plan's task 6.15 (tablet, accessibility, states). **A:** the page and the card: the document is forced onto the light theme while an auth screen is shown (design Q21: auth screens are light only, and today a dark system setting would make the text unreadable on the white card); the new screen's heading takes focus so a screen reader announces it; on a tablet (768 to 1023 px) the right panel stacks **above** the sketch and headline; the small grey text on the mint panel gets a darker grey so it reaches the 4.5:1 contrast of WCAG AA; the two login tabs point to their panel. **B:** on an invalid submit the first invalid field takes focus (login, sign-up screen 1 and screen 3), and screen 3 says `Sending...` while a code is requested. No behaviour, API call or copy changes beyond that. The tests are already written and committed and **fail now**; make them pass without editing any test.

## Rules (read twice)
1. **Scope.** Edit the 7 files in section 3, create nothing. Every test file is already in place: **never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report.
2. **Run the phase checkpoint after every phase** and keep its real output for the report. Fix your code, not the test. **If a checkpoint is still red after two attempts, stop and report; do not start the next phase.**
3. **No new dependency, no `npm install`, no `package.json` change.**
4. **Never run a git command that changes anything.** Read-only `git status`, `git diff`, `git log` are fine.
5. **Do not touch `backend/**`, `public/illustrations/**`, or the mobile screens.**
6. **Behaviour is unchanged.** No handler, API call, route, step or string changes except the ones named in section 4.
7. **Auth screens are light only.** No dark-mode classes (a guard test checks every file in `redesign/`).
8. **Style.** 2-space indentation, double quotes, semicolons, no `any`, no unused imports or locals (`tsc -b` is strict), no `console.`. **Do not add `oxlint-disable` or `eslint-disable` comments.**
9. **If anything differs from this packet, stop and report it.**
10. **Run every command inside WSL** through the script in Step 0. A test that fails with "Unable to find an element ... timed out" under load: re-run that file alone before reporting it.

## Step 0: environment check (do this first, and report the output)
Work only in the Windows clone the prompt names. Run from that folder in PowerShell:
```
git status --short                 # expect: nothing printed (run this FIRST)
git branch --show-current          # expect: ui-round-2
git log --oneline -8               # expect: the line "ui-s6: red tests and packet for the S6 states, tablet and accessibility pass (Gemini)" appears in the list, and "ui-s6: Phase 4 sign-up back" is below it
```
Every check goes through one command; replace `<mode and paths>`:
```
wsl.exe -d Ubuntu -- env CR6_SRC=/mnt/c/Users/Dell/<clone>/frontend CR6_DST=/home/delladiti/<clone>-chk bash /mnt/c/Users/Dell/<clone>/Docs/orchestration/cr-r6-fe-check.sh <mode and paths>
```
where `<clone>` is the folder name from the prompt, and `<mode and paths>` is `types`, `lint` or `test <paths under src/>`. Do **not** run `build` or the full suite, and do **not** run a test baseline: the committed tests are red on purpose (the orchestrator measured 4 failed files and 12 failed tests in `features/auth`). Run only:
```
types                      # expect: 1 error line, in a test file (the new panelId prop of SegmentedTabs does not exist yet); none in a source file
```
If `types` shows an error in a source file, stop and report. If `src/features/auth/redesign/AllSet.tsx` does not exist, the sign-up back screens are not on this branch: stop and report.

## Goal
Make every test in section 5 pass with the behaviour in section 4. **Non-goals:** Playwright or screenshot specs (the owner decided there is no screenshot setup; the orchestrator reviews the screens on the dev index instead), a dark theme for auth screens, any backend change, the mobile screens, a new colour for the green buttons (their contrast on white text is a design point the orchestrator raises with the owner).

## 3. File map (all under `frontend/src/`)
**Edit (7):** `features/auth/redesign/AuthPage.tsx`, `features/auth/redesign/AuthSplitCard.tsx`, `features/auth/redesign/SegmentedTabs.tsx`, `styles/auth-tokens.css` (phase A); `features/auth/redesign/LoginEntry.tsx`, `features/auth/redesign/SignupPhoneEntry.tsx`, `features/auth/redesign/AccountDetails.tsx` (phase B).
**Do not touch:** every test file and every other file.
If `git status` at the end shows a different list, stop and report.

## 4. Specifications

### Phase A: the page, the card, the contrast and the tabs
- **Light only (Q21).** `AuthPage` sets `data-theme="light"` on the document element while it is mounted and gives the previous value back when it unmounts (removing the attribute if there was none). Going from one auth screen to the next keeps it light.
- **Heading focus.** When `AuthPage` mounts and nothing has focus (`document.activeElement` is the body), the screen's `h1` gets `tabindex="-1"` and takes focus. A field that asked for focus (`autoFocus`) keeps it. A screen with no `h1` is fine.
- **Tablet.** `AuthSplitCard`: below 1024 px the right panel (the form) is above the left panel; from 1024 px they are side by side as before. Only the visual order changes (`order-*` classes); the left panel stays first in the markup.
- **Contrast.** `.auth-left-panel` sets `--ui-text-muted: #666666`, which is above 5:1 on both mint stops (the shared grey is 4.46:1 on the darker one).
- **Tabs.** `SegmentedTabs` gets an optional `panelId`: each tab gets the id `${panelId}-tab-${value}` and the selected tab gets `aria-controls={panelId}`. `LoginEntry` wraps its field in `<div id="login-panel" role="tabpanel">` and passes `panelId="login-panel"`. **The panel has no `aria-labelledby`** (naming it after the tab would give two things the same name as the field inside it, and the existing tests look the field up by that name).

Create nothing; replace `features/auth/redesign/AuthPage.tsx` with exactly this:
```tsx
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * The page the split card sits on: light only, centred, with room around the card.
 * Light only (design Q21): the document is put on the light theme while an auth screen is shown and given back
 * afterwards, so the tokens and the shared components (buttons, the code cells, the consent line) all stay light even
 * when the person's system or saved theme is dark.
 * When a new screen appears and nothing has focus, the heading takes focus so a screen reader announces the screen.
 */
export function AuthPage({ children }: { children: ReactNode }) {
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    return () => {
      if (previous === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previous);
    };
  }, []);

  useEffect(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const heading = page.current?.querySelector<HTMLElement>("h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, []);

  return (
    <div ref={page} className="flex min-h-dvh items-center justify-center bg-[#F4FAF6] p-6">
      {children}
    </div>
  );
}
```

Apply these changes (unified diffs; lines starting with `-` go, lines starting with `+` come in):

`features/auth/redesign/AuthSplitCard.tsx`:
```diff
--- a/frontend/src/features/auth/redesign/AuthSplitCard.tsx
+++ b/frontend/src/features/auth/redesign/AuthSplitCard.tsx
@@ -24,6 +24,6 @@ export function AuthSplitCard({ left, right, step, done, onBack, bottom }: AuthS
       style={{ boxShadow: "var(--auth-card-shadow)" }}
     >
-      <div data-testid="auth-left-slot" className="p-10">{left}</div>
-      <div data-testid="auth-right" className="grid grid-rows-[3.5rem_1fr_3.5rem] p-10">
+      <div data-testid="auth-left-slot" className="order-2 p-10 lg:order-1">{left}</div>
+      <div data-testid="auth-right" className="order-1 grid grid-rows-[3.5rem_1fr_3.5rem] p-10 lg:order-2">
         <div data-testid="auth-topbar" className="flex h-14 items-center justify-between">
           <div>
```

`features/auth/redesign/SegmentedTabs.tsx`:
```diff
--- a/frontend/src/features/auth/redesign/SegmentedTabs.tsx
+++ b/frontend/src/features/auth/redesign/SegmentedTabs.tsx
@@ -6,7 +6,9 @@ export interface SegmentedTabsProps<V extends string> {
   value: V;
   onChange: (value: V) => void;
+  /** The id of the panel the tabs switch. The selected tab points to it with `aria-controls`; each tab gets the id `${panelId}-tab-${value}`. The panel is left unnamed on purpose: naming it after the tab would give two things the same name as the field inside. */
+  panelId?: string;
 }
 
-export function SegmentedTabs<V extends string>({ label, options, value, onChange }: SegmentedTabsProps<V>) {
+export function SegmentedTabs<V extends string>({ label, options, value, onChange, panelId }: SegmentedTabsProps<V>) {
   const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
     const last = options.length - 1;
@@ -29,4 +31,6 @@ export function SegmentedTabs<V extends string>({ label, options, value, onChang
             type="button"
             role="tab"
+            id={panelId ? `${panelId}-tab-${option.value}` : undefined}
+            aria-controls={panelId && selected ? panelId : undefined}
             aria-selected={selected}
             tabIndex={selected ? 0 : -1}
```

`styles/auth-tokens.css`:
```diff
--- a/frontend/src/styles/auth-tokens.css
+++ b/frontend/src/styles/auth-tokens.css
@@ -10,4 +10,6 @@
 .auth-left-panel {
   background: linear-gradient(160deg, var(--auth-mint-from) 0%, var(--auth-mint-to) 100%);
+  /* The shared muted grey is 4.46:1 on the darker mint stop; this one is above 5:1 on both stops (WCAG AA is 4.5). */
+  --ui-text-muted: #666666;
 }
```

**Checkpoint A:** `test src/features/auth/redesign/AuthPage.test.tsx src/features/auth/redesign/authGuards.test.ts src/features/auth/redesign/AuthSplitCard.layout.test.tsx src/features/auth/redesign/AuthSplitCard.test.tsx src/features/auth/redesign/SegmentedTabs.test.tsx` (expect all pass).

### Phase B: focus on the first invalid field, and the right word
- On an invalid submit the first invalid field takes focus: login (the Email or the Mobile number field, whichever tab is open), sign-up screen 1 (the number), screen 3 (the name first, then the email). The message under the field and `aria-invalid` stay as they are.
- Screen 3's button says `Saving...` while the screen itself is saving (the name step) and `Sending...` while the parent is requesting the email code (`submitting` prop); `Continue` otherwise.

`features/auth/redesign/LoginEntry.tsx`:
```diff
--- a/frontend/src/features/auth/redesign/LoginEntry.tsx
+++ b/frontend/src/features/auth/redesign/LoginEntry.tsx
@@ -45,4 +45,5 @@ export function LoginEntry({
       if (!result.isValid) {
         setFieldError(result.error);
+        document.getElementById("login-email")?.focus();
         return;
       }
@@ -54,4 +55,5 @@ export function LoginEntry({
     if (!result.isValid) {
       setFieldError(result.error);
+      document.getElementById("login-phone")?.focus();
       return;
     }
@@ -82,4 +84,5 @@ export function LoginEntry({
               label="Log in with"
               options={TABS}
+              panelId="login-panel"
               value={tab}
               onChange={(next) => {
@@ -88,4 +91,5 @@ export function LoginEntry({
               }}
             />
+            <div id="login-panel" role="tabpanel">
             {tab === "email" ? (
               <AuthField id="login-email" label="Email address" type="email" autoComplete="email" placeholder="you@example.com" value={emailValue} error={fieldError} onChange={(event) => setEmailValue(event.target.value)} />
@@ -93,4 +97,5 @@ export function LoginEntry({
               <AuthField id="login-phone" label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phoneValue} error={fieldError} onChange={(event) => setPhoneValue(event.target.value)} />
             )}
+            </div>
             {error ? (
               isNoAccountError(error) ? (
```

`features/auth/redesign/SignupPhoneEntry.tsx`:
```diff
--- a/frontend/src/features/auth/redesign/SignupPhoneEntry.tsx
+++ b/frontend/src/features/auth/redesign/SignupPhoneEntry.tsx
@@ -35,4 +35,5 @@ export function SignupPhoneEntry({ onSubmit, onLogin, error, submitting, legalRe
     if (!result.isValid) {
       setFieldError(result.error);
+      document.getElementById("signup-phone")?.focus();
       return;
     }
```

`features/auth/redesign/AccountDetails.tsx`:
```diff
--- a/frontend/src/features/auth/redesign/AccountDetails.tsx
+++ b/frontend/src/features/auth/redesign/AccountDetails.tsx
@@ -45,5 +45,8 @@ export function AccountDetails({ initialName = "", initialEmail = "", emailLocke
     setNameError(nameProblem);
     setEmailError(emailProblem);
-    if (nameProblem || emailProblem) return;
+    if (nameProblem || emailProblem) {
+      document.getElementById(nameProblem ? "account-name" : "account-email")?.focus();
+      return;
+    }
     setSaveError(null);
     setSaving(true);
@@ -102,5 +105,5 @@ export function AccountDetails({ initialName = "", initialEmail = "", emailLocke
             {shownError ? <AuthAlert tone="error">{shownError}</AuthAlert> : null}
             <Button type="submit" disabled={submitting || saving} className="h-[52px] w-full rounded-full text-[15px] font-bold">
-              {submitting || saving ? "Saving..." : "Continue"}
+              {saving ? "Saving..." : submitting ? "Sending..." : "Continue"}
             </Button>
           </form>
```

**Checkpoint B:** `test src/features/auth src/AppVariant.test.tsx src/App.test.tsx` (expect all pass), then `types` (no output) and `lint` (0 errors; the number of warnings must not go up).

## 5. Tests to satisfy (committed)
Phase A: `redesign/AuthPage.test.tsx` (light only and heading focus), `redesign/authGuards.test.ts` (contrast of the text tokens on the mint stops, the reduced-motion rule, no dark-mode styles in `redesign/`, every screen sits on `AuthPage`, mobile never imports the redesigned screens), `redesign/AuthSplitCard.layout.test.tsx` (tablet order). Phase B: `redesign/authStates.test.tsx` (focus on the first invalid field, the tab panel, the shared alert for the code-screen errors, `Sending...` and `Verifying code...`).

## 6. Final checks (run all, report the real output)
```
types                      # expect: no output
lint                       # expect: 0 errors
test src/features/auth src/AppVariant.test.tsx src/App.test.tsx src/mobile src/shell src/features/legal
git status --short         # expect: exactly the 7 edited source files of section 3 (no test, nothing created)
```
Do **not** run `build` or the full suite. If one test fails only under load, re-run that file alone before reporting it.

## 7. Report (one block, from the rules file)
Add: the exact output of Step 0 (the git lines and the `types` result); the result of checkpoints A and B; the list of files edited (it must match section 3); every place you deviated from this packet and why; what you could not check (you cannot see the screen: the orchestrator opens the dev index at 1440, 1024 and 800 px wide with the system theme set to dark and walks every screen).
