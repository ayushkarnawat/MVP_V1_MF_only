# Packet S6-P1-FE for Gemini (Antigravity): sign-up and sign-in foundations (four phases)
**Status:** READY FOR GEMINI (red tests committed on `ui-round-2`; reference solution written by the orchestrator in a scratch worktree and run green against every test below, 3 Nov 2026).
**Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Stage S6 Phase 1, Tasks 6.1 to 6.5. Spec: the planning page `Docs/orchestration/2026-11-02-auth-redesign-plan.html`, section "A · Spacing, centring and motion". Rules file: `Docs/orchestration/ui-common-rules-antigravity.md` (read it first; this packet adds to it). This is the first of five S6 packets (foundations, login, sign-up front, sign-up back, states). Nothing here changes a screen a user sees: the new parts sit **beside** the old ones until the later packets switch them on.
**Assets:** the eight sketches and the logo are already in `frontend/public/illustrations/auth/` (see its `README.md`). Do not touch them.

## What this run is, in one paragraph
Four phases in one run. **A:** the motion tokens and the `variant` prop (`"split"` desktop, `"legacy"` mobile) plus the sketch registry. **B:** the eight layout parts every new auth screen is built from (split card, left panel, step bar, field, alert, tabs, info card, status row). **C:** the code panel (six cells, countdown, the drawn-but-inactive "Get code via call"), the resend countdown hook and the phone and email masks. **D:** a development-only index page that shows every new screen with fake props. The tests are already written and committed and **fail now**; make them pass without editing any test.

## Rules (read twice)
1. **Scope.** Create the 17 files and edit the 4 files in section 3, nothing else. Every test file is already in place: **never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report.
2. **Run the phase checkpoint after every phase** and keep its real output for the report. Fix your code, not the test. **If a checkpoint is still red after two attempts, stop and report; do not start the next phase.**
3. **No new dependency, no `npm install`, no `package.json` change.** Icons come from `lucide-react`.
4. **Never run a git command that changes anything.** Read-only `git status`, `git diff`, `git log` are fine.
5. **Do not touch `backend/**`.**
6. **Nothing the user sees changes.** The old screens, the mobile screens and every existing test stay as they are. `AuthEntryFlow` and `OnboardingFlow` only gain an optional `variant` prop that they accept and do not use yet.
7. **Auth screens are light only** (the owner's rule): no dark-mode classes on the new parts.
8. **Plain words on screen.** Exactly the strings in this packet. No em-dashes. Colours only through the tokens in `auth-tokens.css` and the app tokens already in the files.
9. **Accessibility.** Every control is keyboard reachable with a visible focus; every error is announced; the six code cells are labelled; animation stops under `prefers-reduced-motion`.
10. **Style.** 2-space indentation, double quotes, semicolons, no `any`, no unused imports or locals (`tsc -b` is strict), no `console.`. **Do not add `oxlint-disable` or `eslint-disable` comments.** A file that exports a component must not also export a constant or hook (that is why `devScreens.tsx`, `DevTabsDemo.tsx` and `DevIndex.tsx` are separate files).
11. **If anything differs from this packet, stop and report it.**
12. **Run every command inside WSL** through the script in Step 0. A test that fails with "Unable to find an element ... timed out" under load: re-run that file alone before reporting it.

## Step 0: environment check (do this first, and report the output)
Work only in the Windows clone the prompt names. Run from that folder in PowerShell:
```
git status --short                 # expect: nothing printed (run this FIRST)
git branch --show-current          # expect: ui-round-2
git log --oneline -8               # expect: the line "ui-s6: red tests and packet for the S6 foundations (Gemini)" appears in the list
```
Every check goes through one command; replace `<mode and paths>`:
```
wsl.exe -d Ubuntu -- env CR6_SRC=/mnt/c/Users/Dell/<clone>/frontend CR6_DST=/home/delladiti/<clone>-chk bash /mnt/c/Users/Dell/<clone>/Docs/orchestration/cr-r6-fe-check.sh <mode and paths>
```
where `<clone>` is the folder name from the prompt, and `<mode and paths>` is `types`, `lint` or `test <paths under src/>`. Do **not** run `build` or the full suite (the orchestrator runs both), and do **not** run a test baseline: the committed tests are red on purpose (the orchestrator measured 16 failed files and 7 (of 224) failed tests in `features/auth` and `AppVariant.test.tsx`). Run only:
```
types                      # expect: 18 error lines, all in test files, all about a module or function this packet adds (the redesign components, `maskPhone` and `maskEmail`); none in a source file
```
If `types` shows an error in a source file, stop and report.

## Goal
Make every test in section 5 pass with the behaviour in section 4. **Non-goals:** any real screen (login, sign-up, onboarding), any flow change, any backend call, the mobile screens.

## 3. File map (all under `frontend/src/`)
**Create (17):** `styles/auth-tokens.css`; and under `features/auth/redesign/`: `sketches.ts`, `variant.ts`, `StepProgress.tsx`, `AuthField.tsx`, `AuthAlert.tsx`, `SegmentedTabs.tsx`, `InfoCard.tsx`, `StatusRow.tsx`, `AuthLeftPanel.tsx`, `AuthSplitCard.tsx`, `useResendCountdown.ts`, `OtpPanel.tsx`, `devIndexGuard.ts`, `devScreens.tsx`, `DevTabsDemo.tsx`, `DevIndex.tsx`.
**Edit (4):** `features/auth/validation.ts` (two functions appended), `features/auth/AuthEntryFlow.tsx` and `features/auth/OnboardingFlow.tsx` (one optional prop each), `App.tsx`.
**Do not touch:** every test file, `public/illustrations/**`, `components/ui/**`, `components/OtpStubBanner.tsx`, the old auth screens, `src/mobile/**`, `package.json`, `backend/**`.
If `git status` at the end shows a different list, stop and report.

## 4. Specifications

### Phase A: tokens, sketches and the variant prop (tasks 6.1 and 6.2)
Create `styles/auth-tokens.css` exactly:
```css
/* Tokens and motion for the redesigned sign-up and sign-in screens. Imported by the new auth components only. */
:root {
  --auth-mint-from: #E4FAEC;
  --auth-mint-to: #F6FEF9;
  --auth-card-shadow: 0 24px 60px -24px rgba(16, 24, 40, 0.18), 0 2px 6px rgba(16, 24, 40, 0.06);
  --auth-step-on: var(--pos, #16a34a);
  --auth-step-off: #D6EFDF;
}

.auth-left-panel {
  background: linear-gradient(160deg, var(--auth-mint-from) 0%, var(--auth-mint-to) 100%);
}

@keyframes authFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(calc(var(--auth-float-distance, 6px) * -1));
  }
}

@keyframes authFloatTilt {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(calc(var(--auth-float-distance, 5px) * -1)) rotate(1deg);
  }
}

@keyframes authBreathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.015);
  }
}

/* The whole sketch moves as one; only transform changes, so nothing shifts in the layout. */
.auth-sketch {
  animation: authFloat var(--auth-float-duration, 7s) ease-in-out infinite;
  will-change: transform;
}

.auth-sketch[data-motion="tilt"] {
  animation-name: authFloatTilt;
}

.auth-sketch[data-motion="breathe"] {
  animation-name: authBreathe;
}

@media (prefers-reduced-motion: reduce) {
  .auth-sketch {
    animation: none;
  }
}
```

Create `features/auth/redesign/sketches.ts` exactly:
```ts
export type SketchName = "laptop" | "phone" | "envelope" | "idCard" | "person" | "cards" | "wallet" | "tick";

export const LOGO_FILE = "unifolio-logo.webp";

export const SKETCH_FILES: Record<SketchName, string> = {
  laptop: "laptop-assets.webp",
  phone: "phone-code.webp",
  envelope: "envelope-code.webp",
  idCard: "id-card.webp",
  person: "person-thinking.webp",
  cards: "floating-cards.webp",
  wallet: "wallet-folder.webp",
  tick: "tick.webp",
};

export interface SketchMotion {
  motion: "float" | "tilt" | "breathe";
  /** How far it moves, in px (not used by breathe). */
  distance: number;
  /** One full cycle, in seconds. */
  duration: number;
}

// The design's motion table (Q62).
export const SKETCH_MOTION: Record<SketchName, SketchMotion> = {
  laptop: { motion: "float", distance: 6, duration: 7 },
  phone: { motion: "tilt", distance: 5, duration: 6.5 },
  envelope: { motion: "float", distance: 5, duration: 7 },
  idCard: { motion: "float", distance: 4, duration: 7.5 },
  person: { motion: "breathe", distance: 0, duration: 8 },
  cards: { motion: "float", distance: 6, duration: 8 },
  wallet: { motion: "float", distance: 6, duration: 7 },
  tick: { motion: "float", distance: 6, duration: 7 },
};

const BASE = "/illustrations/auth/";
export const sketchSrc = (name: SketchName): string => `${BASE}${SKETCH_FILES[name]}`;
export const logoSrc = (): string => `${BASE}${LOGO_FILE}`;
```

Create `features/auth/redesign/variant.ts` exactly:
```ts
export type AuthVariant = "split" | "legacy";

/** The split layout is for desktop; mobile keeps its own screens. Flipping this in one place is the rollback. */
export const variantFor = (isMobile: boolean): AuthVariant => (isMobile ? "legacy" : "split");
```

Apply these changes (unified diffs; lines starting with `-` go, lines starting with `+` come in):

`features/auth/AuthEntryFlow.tsx`:
```diff
--- a/frontend/src/features/auth/AuthEntryFlow.tsx
+++ b/frontend/src/features/auth/AuthEntryFlow.tsx
@@ -1,2 +1,3 @@
+import type { AuthVariant } from "./redesign/variant";
 import { useState } from "react";
 import { Button } from "@/components/ui/button";
@@ -44,4 +45,6 @@ export interface AuthEntryFlowProps {
   initialMode?: "login" | "signup";
   initialStep?: Step;
+  /** "split" is the redesigned desktop layout (built in later S6 tasks); "legacy" is today's screens. Defaults to legacy. */
+  variant?: AuthVariant;
 }
```

`features/auth/OnboardingFlow.tsx`:
```diff
--- a/frontend/src/features/auth/OnboardingFlow.tsx
+++ b/frontend/src/features/auth/OnboardingFlow.tsx
@@ -1,2 +1,3 @@
+import type { AuthVariant } from "./redesign/variant";
 import { useEffect, useState } from "react";
 import { useAuth } from "./AuthContext";
@@ -42,4 +43,6 @@ export function resumeStep(me: MeResponse | null | undefined): OnboardingStep {
 interface OnboardingFlowProps {
   isMobile?: boolean;
+  /** See AuthEntryFlow: "legacy" by default. */
+  variant?: AuthVariant;
 }
```

In `App.tsx`:
1. Add two imports after `import { OnboardingFlow } from "./features/auth/OnboardingFlow";`:
```tsx
import { variantFor } from "./features/auth/redesign/variant";
```
2. In `MobileInitialFlow`, pass `variant="legacy"` to both flows:
```tsx
            <AuthEntryFlow initialMode={authInitialMode} variant="legacy" />
          ) : (
            <OnboardingFlow isMobile={true} variant="legacy" />
```
3. In the desktop branch of `MainApp` (the two returns after the comment about the desktop web flow), pass the variant:
```tsx
    return <AuthEntryFlow initialMode={authInitialMode} variant={variantFor(false)} />;
  }

  if (!me.onboarding_completed) {
    return <OnboardingFlow isMobile={false} variant={variantFor(false)} />;
```
Nothing else in `App.tsx` changes in this phase.

**Checkpoint A:** `test src/features/auth/redesign/authMotion.test.ts src/features/auth/redesign/sketches.test.ts src/features/auth/redesign/variant.test.ts src/AppVariant.test.tsx src/App.test.tsx` (expect all pass).

### Phase B: the layout parts (task 6.3)
The structure (the design's rules): a card with 40 px padding on both panels and equal-height panels. The **right panel is three rows**: a 56 px top bar (Back on the left, the step bar on the right, identical on every screen), a content row that centres **one block, 360 px wide, both ways**, and a 56 px bottom row for the Log in or Sign up link or the shield line. Below 1024 px the panels stack. The left panel: logo top left, the sketch centred in the space left, then the headline, the paragraph, and the three rows (or an info card, or status rows) all sharing one left edge.

Create `features/auth/redesign/StepProgress.tsx` exactly:
```tsx
export interface StepProgressProps {
  step: number;
  total?: number;
  /** The last screen: the label says Done and every segment is full. */
  done?: boolean;
}

export function StepProgress({ step, total = 5, done = false }: StepProgressProps) {
  const current = Math.min(Math.max(Math.round(step), 1), total);
  const label = done ? "Done" : `Step ${current} of ${total}`;
  const filled = done ? total : current;
  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      <span className="text-xs font-medium text-[var(--ui-text-muted)]">{label}</span>
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            data-testid="step-segment"
            data-filled={index < filled}
            className="h-1 w-6 rounded-full"
            style={{ background: index < filled ? "var(--auth-step-on)" : "var(--auth-step-off)" }}
          />
        ))}
      </div>
    </div>
  );
}
```

Create `features/auth/redesign/AuthField.tsx` exactly:
```tsx
import type { InputHTMLAttributes, ReactNode } from "react";

export interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  icon?: ReactNode;
}

export function AuthField({ id, label, hint, error, icon, className, ...input }: AuthFieldProps) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-[var(--ui-text)]">
        {label}
      </label>
      <div className="relative">
        {icon ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-text-muted)]">{icon}</span> : null}
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`h-12 w-full rounded-xl border bg-white px-4 text-sm text-[var(--ui-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-step-on)] ${icon ? "pl-10" : ""} ${error ? "border-[var(--neg-text)]" : "border-[var(--ui-divider)]"} ${className ?? ""}`}
          {...input}
        />
      </div>
      {hint ? <p id={`${id}-hint`} className="text-xs text-[var(--ui-text-muted)]">{hint}</p> : null}
      {error ? <p id={`${id}-error`} role="alert" className="text-xs text-[var(--neg-text)]">{error}</p> : null}
    </div>
  );
}
```

Create `features/auth/redesign/AuthAlert.tsx` exactly:
```tsx
import type { ReactNode } from "react";

export interface AuthAlertProps {
  tone: "error" | "info";
  children: ReactNode;
  /** An optional green shortcut, such as "Sign up" under "No account found". */
  action?: { label: string; onClick: () => void };
}

export function AuthAlert({ tone, children, action }: AuthAlertProps) {
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`space-y-2 rounded-2xl border p-3.5 text-sm ${isError ? "border-[var(--neg-text)]/30 bg-[var(--neg-text)]/10 text-[var(--neg-text)]" : "border-[var(--auth-step-on)]/30 bg-[var(--auth-step-on)]/10 text-[var(--ui-text)]"}`}
    >
      <p>{children}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="w-full rounded-2xl border border-[var(--auth-step-on)]/30 bg-[var(--auth-step-on)]/10 p-2.5 text-xs font-bold text-[var(--pos-text)]"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
```

Create `features/auth/redesign/SegmentedTabs.tsx` exactly:
```tsx
import type { KeyboardEvent } from "react";

export interface SegmentedTabsProps<V extends string> {
  label: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
}

export function SegmentedTabs<V extends string>({ label, options, value, onChange }: SegmentedTabsProps<V>) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const last = options.length - 1;
    let to = from;
    if (event.key === "ArrowRight") to = from === last ? 0 : from + 1;
    else if (event.key === "ArrowLeft") to = from === 0 ? last : from - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = last;
    else return;
    event.preventDefault();
    onChange(options[to].value);
  };
  return (
    <div role="tablist" aria-label={label} className="grid grid-flow-col auto-cols-fr rounded-xl bg-[var(--ui-hover)] p-1">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${selected ? "bg-white text-[var(--ui-text)] shadow-sm" : "text-[var(--ui-text-muted)]"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

Create `features/auth/redesign/InfoCard.tsx` exactly:
```tsx
import { useId } from "react";
import type { ReactNode } from "react";

export interface InfoCardProps {
  title: string;
  children: ReactNode;
}

export function InfoCard({ title, children }: InfoCardProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-[var(--ui-divider)] bg-white/70 p-4 text-left">
      <h3 id={id} className="text-sm font-semibold text-[var(--ui-text)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--ui-text-muted)]">{children}</p>
    </section>
  );
}
```

Create `features/auth/redesign/StatusRow.tsx` exactly:
```tsx
import { Check, Loader2 } from "lucide-react";

export interface StatusRowProps {
  label: string;
  description?: string;
  state: "done" | "active" | "pending";
}

const STATE_WORDS = { done: "Done", active: "In progress", pending: "Not started" } as const;

export function StatusRow({ label, description, state }: StatusRowProps) {
  return (
    <div data-testid="status-row" data-state={state} className="flex items-start gap-3 text-left">
      <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[var(--auth-step-on)]">
        {state === "done" ? <Check size={14} /> : state === "active" ? <Loader2 size={14} className="animate-spin" /> : null}
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--ui-text)]">{label}<span className="sr-only">{STATE_WORDS[state]}</span></p>
        {description ? <p className="text-xs text-[var(--ui-text-muted)]">{description}</p> : null}
      </div>
    </div>
  );
}
```

Create `features/auth/redesign/AuthLeftPanel.tsx` exactly:
```tsx
import type { CSSProperties, ReactNode } from "react";
import "../../../styles/auth-tokens.css";
import { logoSrc, SKETCH_MOTION, sketchSrc, type SketchName } from "./sketches";

export interface AuthLeftPanelProps {
  sketch: SketchName;
  headline: ReactNode;
  paragraph: ReactNode;
  /** The three plain feature rows. */
  rows?: { text: string; icon?: ReactNode }[];
  /** Instead of the rows: an info card (sign-up screen 3). */
  infoCard?: ReactNode;
  /** Instead of the rows: status rows (the All set screen). */
  status?: ReactNode;
}

export function AuthLeftPanel({ sketch, headline, paragraph, rows, infoCard, status }: AuthLeftPanelProps) {
  const motion = SKETCH_MOTION[sketch];
  const vars = { "--auth-float-distance": `${motion.distance}px`, "--auth-float-duration": `${motion.duration}s` } as CSSProperties;
  return (
    <div data-testid="auth-left" className="auth-left-panel flex h-full flex-col rounded-2xl">
      <img src={logoSrc()} alt="Unifolio" className="h-8 w-auto self-start" />
      <div className="flex flex-1 items-center justify-center py-6">
        <img
          data-testid="auth-sketch"
          src={sketchSrc(sketch)}
          alt=""
          className="auth-sketch max-h-[300px] w-auto max-w-full"
          data-motion={motion.motion}
          style={vars}
        />
      </div>
      <div data-testid="auth-left-text" className="flex flex-col items-start text-left">
        <h2 className="text-[28px] font-bold leading-tight text-[var(--ui-text)]">{headline}</h2>
        <p className="mt-3 text-sm text-[var(--ui-text-muted)]">{paragraph}</p>
        {rows ? (
          <ul className="mt-6 space-y-4">
            {rows.map((row) => (
              <li key={row.text} className="flex items-center gap-3 text-sm text-[var(--ui-text)]">
                {row.icon}
                {row.text}
              </li>
            ))}
          </ul>
        ) : null}
        {infoCard ? <div className="mt-6 w-full">{infoCard}</div> : null}
        {status ? <div className="mt-6 w-full space-y-4">{status}</div> : null}
      </div>
    </div>
  );
}
```

Create `features/auth/redesign/AuthSplitCard.tsx` exactly:
```tsx
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { StepProgress } from "./StepProgress";

export interface AuthSplitCardProps {
  left: ReactNode;
  right: ReactNode;
  /** The step number for the top bar; leave out on screens with no step. */
  step?: number;
  /** The last screen: the bar says Done with every segment full. */
  done?: boolean;
  onBack?: () => void;
  /** The Log in or Sign up link, or the shield line. */
  bottom?: ReactNode;
}

// Two equal panels with 40 px padding. The right panel is three rows: a 56 px top bar that is identical on every
// screen, one 360 px block centred both ways, and a 56 px bottom row. Below 1024 px the panels stack.
export function AuthSplitCard({ left, right, step, done, onBack, bottom }: AuthSplitCardProps) {
  return (
    <div
      data-testid="auth-card"
      className="auth-card mx-auto grid w-full max-w-[1100px] grid-cols-1 overflow-hidden rounded-3xl bg-white lg:grid-cols-2"
      style={{ boxShadow: "var(--auth-card-shadow)" }}
    >
      <div data-testid="auth-left-slot" className="p-10">{left}</div>
      <div data-testid="auth-right" className="grid grid-rows-[3.5rem_1fr_3.5rem] p-10">
        <div data-testid="auth-topbar" className="flex h-14 items-center justify-between">
          <div>
            {onBack ? (
              <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]">
                <ArrowLeft size={16} aria-hidden="true" />
                Back
              </button>
            ) : null}
          </div>
          <div>{step !== undefined ? <StepProgress step={step} done={done} /> : null}</div>
        </div>
        <div data-testid="auth-content" className="flex items-center justify-center">
          <div data-testid="auth-block" className="w-full max-w-[360px]">{right}</div>
        </div>
        <div data-testid="auth-bottom" className="flex h-14 items-center justify-center text-sm">{bottom}</div>
      </div>
    </div>
  );
}
```

**Checkpoint B:** `test src/features/auth/redesign/StepProgress.test.tsx src/features/auth/redesign/AuthField.test.tsx src/features/auth/redesign/AuthAlert.test.tsx src/features/auth/redesign/SegmentedTabs.test.tsx src/features/auth/redesign/InfoCard.test.tsx src/features/auth/redesign/StatusRow.test.tsx src/features/auth/redesign/AuthLeftPanel.test.tsx src/features/auth/redesign/AuthSplitCard.test.tsx` (expect all pass).

### Phase C: the code panel, the countdown and the masks (task 6.4)
`maskPhone("+919876543210")` is `+91 ••••• 43210`; `maskEmail("siddharth@gmail.com")` is `si••••••@gmail.com` (two letters of the name, six dots, the whole domain; a name of two letters or fewer is shown as it is). The countdown starts at 60 after each send and is display only: the server still answers 429 `Please wait Ns` and that message is shown. **"Get code via call" is drawn and does nothing** (an `aria-disabled` span, not a button, no handler).

Create `features/auth/redesign/useResendCountdown.ts` exactly:
```ts
import { useCallback, useEffect, useState } from "react";

/** Display only: the server still answers 429 "Please wait Ns" and that message is shown as it is. */
export function useResendCountdown(start = 60) {
  const [seconds, setSeconds] = useState(start);
  const running = seconds > 0;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);
  const restart = useCallback(() => setSeconds(start), [start]);
  return { seconds, active: running, restart };
}

export function formatMmSs(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
```

Create `features/auth/redesign/OtpPanel.tsx` exactly:
```tsx
import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";
import { OtpStubBanner } from "@/components/OtpStubBanner";
import { AuthAlert } from "./AuthAlert";
import { formatMmSs, useResendCountdown } from "./useResendCountdown";

export interface OtpPanelProps {
  channel: "phone" | "email";
  /** What the code was sent to, already masked if it should be. */
  identity: string;
  submitLabel: string;
  devOtp: string | null;
  error: string | null;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onBack?: () => void;
  onEditIdentity?: () => void;
  editLabel?: string;
  submitting?: boolean;
  /** The "Get code via call" line is drawn but has no function (Q4). */
  showCall?: boolean;
}

export function OtpPanel({
  channel, identity, submitLabel, devOtp, error, onSubmit, onResend, onBack, onEditIdentity, editLabel = "Edit",
  submitting = false, showCall = true,
}: OtpPanelProps) {
  const [code, setCode] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const countdown = useResendCountdown(60);
  const shown = local ?? error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.length < 6) {
      setLocal("Please enter the complete 6-digit verification code.");
      return;
    }
    setLocal(null);
    onSubmit(code);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5 text-left">
      <div className="space-y-2">
        <h1 className="text-[26px] font-bold leading-tight text-[var(--ui-text)]">
          {channel === "email" ? "Verify your email address" : "Verify your mobile number"}
        </h1>
        <p className="text-sm text-[var(--ui-text-muted)]">We sent a 6-digit code to {identity}</p>
        {onEditIdentity ? (
          <button type="button" onClick={onEditIdentity} className="text-xs font-semibold text-[var(--pos-text)] hover:underline">
            {editLabel}
          </button>
        ) : null}
      </div>
      <OtpStubBanner code={devOtp} channel={channel} />
      <div className="space-y-2">
        <label htmlFor="otp-input" className="block text-[13px] font-medium text-[var(--ui-text)]">Verification code</label>
        <OtpInput
          id="otp-input"
          value={code}
          onChange={(next) => {
            setCode(next);
            if (local && next.length === 6) setLocal(null);
          }}
          disabled={submitting}
          autoFocus
        />
      </div>
      {shown ? <AuthAlert tone="error">{shown}</AuthAlert> : null}
      <Button type="submit" disabled={submitting} className="h-[52px] w-full rounded-full text-[15px] font-bold">
        {submitting ? (
          <>
            <Loader2 className="animate-spin" size={16} />
            <span>Verifying code...</span>
          </>
        ) : (
          submitLabel
        )}
      </Button>
      <div className="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
        <span>Didn&apos;t get the code?</span>
        <button
          type="button"
          disabled={countdown.active}
          onClick={() => {
            onResend();
            countdown.restart();
          }}
          className="font-semibold text-[var(--pos-text)] disabled:text-[var(--ui-disabled-text)]"
        >
          {countdown.active ? `Resend code in ${formatMmSs(countdown.seconds)}` : "Resend code"}
        </button>
      </div>
      {showCall ? (
        <div className="space-y-2 text-center text-xs text-[var(--ui-text-muted)]">
          <p>OR</p>
          <span aria-disabled="true" title="Coming soon" className="inline-block cursor-not-allowed opacity-60">
            Get code via call
          </span>
        </div>
      ) : null}
      {onBack ? (
        <button type="button" onClick={onBack} className="text-xs font-medium text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]">
          Back
        </button>
      ) : null}
    </form>
  );
}
```

Append to `features/auth/validation.ts` (unified diff):
```diff
--- a/frontend/src/features/auth/validation.ts
+++ b/frontend/src/features/auth/validation.ts
@@ -419,2 +419,19 @@ export function validatePersonName(raw: string): string | null {
   return null;
 }
+
+/** "+919876543210" -> "+91 ••••• 43210": keeps +91 and the last five digits (design Q6). */
+export function maskPhone(phone: string): string {
+  const digits = phone.replace(/\D/g, "");
+  if (digits.length === 0) return "";
+  if (digits.length < 10) return "•".repeat(digits.length);
+  return `+91 ••••• ${digits.slice(-5)}`;
+}
+
+/** "siddharth@gmail.com" -> "si••••••@gmail.com": two letters of the name and the whole domain (design Q6). */
+export function maskEmail(email: string): string {
+  const at = email.lastIndexOf("@");
+  if (at < 1) return email;
+  const name = email.slice(0, at);
+  if (name.length <= 2) return email;
+  return `${name.slice(0, 2)}••••••${email.slice(at)}`;
+}
```

**Checkpoint C:** `test src/features/auth/redesign/useResendCountdown.test.ts src/features/auth/redesign/OtpPanel.test.tsx src/features/auth/validation.test.ts` (expect all pass).

### Phase D: the development index (task 6.5)
`/dev/auth-screens` lists every new screen with fake props, so the owner can review all of them before any flow is wired. It exists **only in a development build** (the guard is `import.meta.env.DEV` plus the exact path) and is a separate chunk. Later packets add their screens to `devScreens.tsx`.

Create `features/auth/redesign/devIndexGuard.ts` exactly:
```ts
/** The dev index page exists only in a development build, and only at this one address. */
export const devIndexEnabled = (isDev: boolean, pathname: string): boolean =>
  isDev && pathname.replace(/\/+$/, "") === "/dev/auth-screens";
```

Create `features/auth/redesign/devScreens.tsx` exactly:
```tsx
import type { ReactNode } from "react";
import { AuthAlert } from "./AuthAlert";
import { AuthField } from "./AuthField";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthSplitCard } from "./AuthSplitCard";
import { InfoCard } from "./InfoCard";
import { OtpPanel } from "./OtpPanel";
import { DevTabsDemo } from "./DevTabsDemo";
import { StatusRow } from "./StatusRow";
import { StepProgress } from "./StepProgress";

export interface DevScreen {
  id: string;
  title: string;
  render: () => ReactNode;
}

const ROWS = [{ text: "All your accounts in one place." }, { text: "Your family, together." }, { text: "Private by design." }];
const noop = () => {};

// Every screen later phases build is added here with fake props, so the owner can review them before any flow is wired.
export const DEV_SCREENS: DevScreen[] = [
  {
    id: "split-card",
    title: "Split card layout",
    render: () => (
      <AuthSplitCard
        step={1}
        left={<AuthLeftPanel sketch="laptop" headline={<>One dashboard for your family&apos;s <span className="text-[var(--pos-text)]">financial life</span></>} paragraph="Pick up where you left off." rows={ROWS} />}
        right={<div className="space-y-5"><h1 className="text-[26px] font-bold">Let&apos;s get started</h1><AuthField id="dev-phone" label="Mobile number" hint="We will send a code." /></div>}
        bottom={<span>Already have an account? Log in</span>}
      />
    ),
  },
  {
    id: "otp-phone",
    title: "Code screen, mobile",
    render: () => (
      <AuthSplitCard
        step={2}
        onBack={noop}
        left={<AuthLeftPanel sketch="phone" headline="Quick and secure." paragraph="We sent a 6-digit code to +91 98765 43210." />}
        right={<OtpPanel channel="phone" identity="+91 ••••• 43210" submitLabel="Verify & Continue" devOtp="123456" error={null} onSubmit={noop} onResend={noop} onEditIdentity={noop} editLabel="Edit number" />}
      />
    ),
  },
  {
    id: "otp-email",
    title: "Code screen, email",
    render: () => (
      <AuthSplitCard
        step={3}
        onBack={noop}
        left={<AuthLeftPanel sketch="envelope" headline="Almost there." paragraph="Confirm your email so we can keep your account secure." infoCard={<InfoCard title="Why do we need your email?">To send you important updates.</InfoCard>} />}
        right={<OtpPanel channel="email" identity="si••••••@gmail.com" submitLabel="Verify & Continue" devOtp={null} error="That code has expired." onSubmit={noop} onResend={noop} onEditIdentity={noop} editLabel="Edit email address" showCall={false} />}
      />
    ),
  },
  {
    id: "step-progress",
    title: "Step bar",
    render: () => (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((step) => <StepProgress key={step} step={step} />)}
        <StepProgress step={5} done />
      </div>
    ),
  },
  {
    id: "alerts",
    title: "Alerts",
    render: () => (
      <div className="max-w-[360px] space-y-3">
        <AuthAlert tone="error" action={{ label: "Sign up", onClick: noop }}>No account found for this number.</AuthAlert>
        <AuthAlert tone="info">We sent a new code.</AuthAlert>
      </div>
    ),
  },
  { id: "tabs", title: "Email or mobile tabs", render: () => <div className="max-w-[360px]"><DevTabsDemo /></div> },
  {
    id: "status-rows",
    title: "Status rows",
    render: () => (
      <div className="max-w-[360px] space-y-4">
        <StatusRow label="Accounts connected" description="Your mutual funds are linked." state="done" />
        <StatusRow label="Importing your investment data" state="active" />
        <StatusRow label="Preparing your dashboard" state="pending" />
      </div>
    ),
  },
];
```

Create `features/auth/redesign/DevTabsDemo.tsx` exactly:
```tsx
import { useState } from "react";
import { SegmentedTabs } from "./SegmentedTabs";

/** A stateful demo of the tabs for the dev index (the tabs themselves are controlled). */
export function DevTabsDemo() {
  const [value, setValue] = useState<"email" | "phone">("email");
  return <SegmentedTabs label="Log in with" options={[{ value: "email", label: "Email" }, { value: "phone", label: "Mobile number" }]} value={value} onChange={setValue} />;
}
```

Create `features/auth/redesign/DevIndex.tsx` exactly:
```tsx
import { DEV_SCREENS } from "./devScreens";

/** Every new auth screen with fake props, at /dev/auth-screens, in a development build only. */
export function DevIndex() {
  return (
    <main className="mx-auto max-w-[1180px] space-y-10 p-6">
      <h1 className="text-2xl font-bold">Auth screens (development only)</h1>
      {DEV_SCREENS.map((screen) => (
        <section key={screen.id} data-testid="dev-screen" className="space-y-3">
          <h2 className="text-lg font-semibold">{screen.title}</h2>
          {screen.render()}
        </section>
      ))}
    </main>
  );
}
```

In `App.tsx` (phase D only):
1. Change the first React import to `import { lazy, Suspense, useState, useEffect } from "react";` and add `import { devIndexEnabled } from "./features/auth/redesign/devIndexGuard";` after the `variantFor` import.
2. Above `function useIsMobileViewport`, add:
```tsx
// The dev index of the new auth screens is a separate chunk, reachable only in a development build.
const DevIndex = lazy(() => import("./features/auth/redesign/DevIndex").then((m) => ({ default: m.DevIndex })));
```
3. At the very top of `function App()`, before the two existing `if` lines, add:
```tsx
  if (typeof window !== "undefined" && devIndexEnabled(import.meta.env.DEV, window.location.pathname)) {
    return (
      <Suspense fallback={null}>
        <DevIndex />
      </Suspense>
    );
  }
```

**Checkpoint D:** `test src/features/auth src/AppVariant.test.tsx src/App.test.tsx` (expect all pass), then `types` (no output) and `lint` (0 errors; the number of warnings must not go up).

## 5. Tests to satisfy (committed)
`features/auth/redesign/`: `authMotion.test.ts`, `sketches.test.ts`, `variant.test.ts`, `StepProgress.test.tsx`, `AuthField.test.tsx`, `AuthAlert.test.tsx`, `SegmentedTabs.test.tsx`, `InfoCard.test.tsx`, `StatusRow.test.tsx`, `AuthLeftPanel.test.tsx`, `AuthSplitCard.test.tsx`, `useResendCountdown.test.ts`, `OtpPanel.test.tsx`, `DevIndex.test.tsx`; `features/auth/validation.test.ts` (the mask tests); `AppVariant.test.tsx`.

## 6. Final checks (run all, report the real output)
```
types                      # expect: no output
lint                       # expect: 0 errors
test src/features/auth src/AppVariant.test.tsx src/App.test.tsx src/mobile src/shell src/features/legal
git status --short         # expect: exactly the 17 created and 4 edited source files of section 3 (no test)
```
Do **not** run `build` or the full suite. If one test fails only under load, re-run that file alone before reporting it.

## 7. Report (one block, from the rules file)
Add: the exact output of Step 0 (the git lines and the `types` result); the result of checkpoints A, B, C and D; the list of files created and edited (it must match section 3); every place you deviated from this packet and why; what you could not check (you cannot see the screen: the orchestrator opens `/dev/auth-screens` and takes the screenshots of every entry).
