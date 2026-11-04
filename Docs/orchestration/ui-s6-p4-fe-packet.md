# Packet S6-P4-FE for Gemini (Antigravity): sign-up screens 4 to 6, the return trip and the resume rule (three phases)
**Status:** READY FOR GEMINI (red tests committed on `ui-round-2`; reference solution written by the orchestrator in a scratch worktree on top of the S6 sign-up front commit and run green against every test below, 3 Nov 2026). **Do this packet only after the S6 sign-up front packet (`ui-s6-p3-fe-packet.md`) is committed on `ui-round-2`** (`ui-s6: Phase 3 sign-up front`): it uses the account details and email code screens, the stored name and the hand-over built there, and it edits files that packet changed.
**Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Stage S6 Phase 3 task 6.11 and Phase 4 tasks 6.12, 6.13 and 6.14. Spec: the planning page `Docs/orchestration/2026-11-02-auth-redesign-plan.html`, sections "Sign-up 4", "Sign-up 5", "Sign-up 6" and the state and resume section (decisions Q10, Q12 to Q19, Q26, Q63 to Q68). Fourth of five S6 packets.

## What this run is, in one paragraph
Three phases in one run. **A:** screen 4, "How do you usually invest?" and "What are you working towards?" on one screen, both answers required, no Skip, a Select all link. **B:** screen 5, "What would you like to connect first?" (only Mutual funds works, the rest are Coming soon), and screen 6, "You're all set!" (shown after the import and before onboarding is marked complete). **C:** the return trip (Back from screen 4 shows screen 3 with both fields editable; a changed name is saved, a changed email gets a new code and replaces the old one only after it is verified), the resume rule and the wiring of screens 3 to 6 in `OnboardingFlow` for the `"split"` variant on desktop only. Mobile keeps its own onboarding screens and its Skip, and so does the legacy variant. The tests are already written and committed and **fail now**; make them pass without editing any test.

## Rules (read twice)
1. **Scope.** Create the 9 files and edit the 5 files in section 3, nothing else. Every test file is already in place (one older test, `OnboardingFlow.split.test.tsx`, was updated by the orchestrator because the screen after the name is now screen 4): **never edit a test to make it pass.** If a test seems wrong, stop and describe it in the report.
2. **Run the phase checkpoint after every phase** and keep its real output for the report. Fix your code, not the test. **If a checkpoint is still red after two attempts, stop and report; do not start the next phase.**
3. **No new dependency, no `npm install`, no `package.json` change.**
4. **Never run a git command that changes anything.** Read-only `git status`, `git diff`, `git log` are fine.
5. **Do not touch `backend/**`, `public/illustrations/**`, or the mobile screens.**
6. **Behaviour is unchanged apart from what this packet names.** Screen 4 saves with one `updateMe({ investor_type, primary_goals, onboarding_step: "q2_investing" })`. The import screens are today's (`SoloCasUpload` and `ImportFlow`, not redesigned). The return trip uses the existing `listHouseholdMembers`, `updateMemberProfile`, `requestContactChange("email", address)` and `verifyContactChange("email", address, code)`; there is **no backend change**. Screens 5 and 6 are never written as the saved onboarding step. Mobile, the legacy variant, `Q1Name`, `Q2Investing`, `Q3Purpose` and the old `resumeStep` stay as they are.
7. **Auth screens are light only.** No dark-mode classes. Colours through the tokens already used in the foundation parts.
8. **Plain words on screen.** Exactly the strings in this packet. No em-dashes.
9. **Accessibility.** Every control keyboard reachable with a visible focus; errors announced (`role="alert"`); the two questions are a radio group and a checkbox group with names; a Coming soon row is drawn but ignores clicks and keys.
10. **Style.** 2-space indentation, double quotes, semicolons, no `any`, no unused imports or locals (`tsc -b` is strict), no `console.`. **Do not add `oxlint-disable` or `eslint-disable` comments.** A file that exports a component must not also export a constant or a function (that is why the copy lives in `finishCopy.ts` and the resume rule in `onboardingResume.ts`).
11. **If anything differs from this packet, stop and report it.**
12. **Run every command inside WSL** through the script in Step 0. A test that fails with "Unable to find an element ... timed out" under load: re-run that file alone before reporting it.

## Step 0: environment check (do this first, and report the output)
Work only in the Windows clone the prompt names. Run from that folder in PowerShell:
```
git status --short                 # expect: nothing printed (run this FIRST)
git branch --show-current          # expect: ui-round-2
git log --oneline -8               # expect: the line "ui-s6: red tests and packet for the S6 screens 4 to 6 (Gemini)" appears in the list, and "ui-s6: Phase 3 sign-up front" is below it
```
Every check goes through one command; replace `<mode and paths>`:
```
wsl.exe -d Ubuntu -- env CR6_SRC=/mnt/c/Users/Dell/<clone>/frontend CR6_DST=/home/delladiti/<clone>-chk bash /mnt/c/Users/Dell/<clone>/Docs/orchestration/cr-r6-fe-check.sh <mode and paths>
```
where `<clone>` is the folder name from the prompt, and `<mode and paths>` is `types`, `lint` or `test <paths under src/>`. Do **not** run `build` or the full suite, and do **not** run a test baseline: the committed tests are red on purpose (the orchestrator measured 9 failed files and 26 failed tests in `features/auth` with the sign-up front screens in place). Run only:
```
types                      # expect: 6 error lines, all in test files (cannot find the new modules AllSet, ConnectAccounts, DetailsEditor, InvestorProfile and onboardingResume, and the new onImported prop of SoloCasUpload); none in a source file
```
If `types` shows an error in a source file, stop and report. If `src/features/auth/redesign/AccountDetails.tsx` does not exist, the sign-up front screens are not on this branch: stop and report.

## Goal
Make every test in section 5 pass with the behaviour in section 4. **Non-goals:** the states, tablet and accessibility pass (the next packet), any backend change, the mobile screens, redesigning the statement import screens, removing the legacy onboarding code.

## 3. File map (all under `frontend/src/features/auth/`)
**Create (9):** under `redesign/`: `finishCopy.ts`, `OptionRow.tsx`, `ChipCheckbox.tsx`, `InvestorProfile.tsx` (phase A); `SourceRow.tsx`, `ConnectAccounts.tsx`, `AllSet.tsx` (phase B); `DetailsEditor.tsx` (phase C); and `onboardingResume.ts` next to `OnboardingFlow.tsx` (phase C).
**Edit (5):** `SoloCasUpload.tsx` (phase B); `redesign/AccountDetails.tsx`, `onboardingSteps.ts`, `OnboardingFlow.tsx`, `redesign/devScreens.tsx` (phase C).
**Do not touch:** every test file, the foundation, login and sign-up front parts other than the files above, `profile-v2/lib/onboardingOptions.ts` (Profile and the mobile screens keep their wording; the sign-up wording lives in `finishCopy.ts`), `public/illustrations/**`, `components/ui/**`, the legacy onboarding screens (`Q1Name.tsx`, `Q2Investing.tsx`, `Q3Purpose.tsx`), `src/mobile/**`, `package.json`, `backend/**`.
If `git status` at the end shows a different list, stop and report.

## 4. Specifications

### Phase A: screen 4, the investor profile (task 6.12)
- Step bar `Step 4 of 5`, Back in the top bar, the person-thinking sketch. Left panel: headline `Help us personalise your experience.` (green accent on `experience.`), the paragraph and the three rows with detail lines (`More relevant insights`, `A tailored experience`, `You're always in control`).
- Right panel: `How do you usually invest?` (`This helps us tailor your experience and insights.`) with four single-choice cards mapped to `beginner` (`I'm just getting started`), `self_directed` (`I manage my own investments`), `advisor_assisted` (`I work with a financial professional`), `mixed` (`A mix of both`), each with its one-line subtitle; then `What are you working towards?` with `(Select all that apply)`, a **Select all** link that becomes **Clear all** when all six are chosen, and the six goal chips from `GOAL_OPTIONS`; then `Continue`.
- **Nothing is pre-selected. There is no Skip. Both answers are required.** The button is always enabled. Pressing it with an unanswered question shows a small red line under that question (`Choose how you usually invest.` / `Choose at least one goal.`) announced with `role="alert"`, and moves focus to the first unanswered question. A failed save shows `Couldn't save your answers. Try again.` and the person can try again. A second click while saving does nothing.
- Answers saved before (a return from a later screen, or a resumed session) come back filled.

Create `features/auth/redesign/finishCopy.ts` exactly:
```ts
import type { InvestorType } from "../types";

// Copy for sign-up screens 4 to 6 (design slides 11 to 21, 2 and 3 Nov 2026).
export const PROFILE_HEADLINE_BEFORE = "Help us personalise your ";
export const PROFILE_HEADLINE_ACCENT = "experience.";
export const PROFILE_PARAGRAPH = "Tell us a little about how you invest and what you're working towards, so we can make your insights more relevant.";
export const PROFILE_ROWS = [
  { text: "More relevant insights", detail: "Explore insights that relate to your investments and goals." },
  { text: "A tailored experience", detail: "Get a more relevant experience based on your preferences." },
  { text: "You're always in control", detail: "Update your preferences anytime in settings." },
];

// The sign-up wording for the four investor types. Profile and the mobile screens keep the wording in
// profile-v2/lib/onboardingOptions.ts; only desktop sign-up uses this list.
export const INVESTOR_PROFILE_OPTIONS: ReadonlyArray<{ value: InvestorType; title: string; subtitle: string }> = [
  { value: "beginner", title: "I'm just getting started", subtitle: "I'm new to investing or still building my portfolio." },
  { value: "self_directed", title: "I manage my own investments", subtitle: "I choose and manage investments myself." },
  { value: "advisor_assisted", title: "I work with a financial professional", subtitle: "I invest with help from an advisor, distributor or family office." },
  { value: "mixed", title: "A mix of both", subtitle: "I manage some investments myself and get professional guidance for others." },
];

export const CONNECT_HEADLINE_BEFORE = "Bring your investments ";
export const CONNECT_HEADLINE_ACCENT = "together.";
export const CONNECT_PARAGRAPH = "Connect your accounts to see your family's investments in one place and understand how they fit together.";
export const CONNECT_ROWS = [
  { text: "Secure & Private", detail: "Secure connections designed to give you visibility into your investments." },
  { text: "Takes just a few minutes", detail: "Connect multiple accounts in one go." },
  { text: "All major asset types", detail: "Mutual funds, stocks, PMS, real estate, gold and more." },
];
export const CONNECT_SOURCES: ReadonlyArray<{ title: string; description: string; comingSoon: boolean }> = [
  { title: "Mutual funds", description: "Import your holdings via CAMS or MF Central", comingSoon: false },
  { title: "Stocks & ETFs", description: "Connect your demat accounts (NSDL / CDSL)", comingSoon: true },
  { title: "PMS & AIFs", description: "Add your PMS and alternative investments", comingSoon: true },
  { title: "Real estate", description: "Track the value of your properties", comingSoon: true },
  { title: "Gold", description: "Track your digital and physical gold", comingSoon: true },
  { title: "Bank accounts, loans & credit cards", description: "Track your cash, loans and credit cards", comingSoon: true },
];

export const ALL_SET_HEADLINE = "You're all set!";
export const ALL_SET_PARAGRAPH = "We're importing your investment data and getting your dashboard ready. This may take a few minutes.";
export const ALL_SET_STATUS = [
  { label: "Accounts connected", description: "Your account connections have been initiated.", state: "done" as const },
  { label: "Importing your investment data", description: "We're retrieving your holdings from the connected accounts.", state: "done" as const },
  { label: "Preparing your dashboard", description: "Your investments will come together in one view as your data becomes available.", state: "active" as const },
];
export const ALL_SET_FINISH_ERROR = "Your statement is saved, but we couldn't finish setting up your account. Try again.";
```

Create `features/auth/redesign/OptionRow.tsx` exactly:
```tsx
import { forwardRef } from "react";

export interface OptionRowProps {
  title: string;
  subtitle: string;
  selected: boolean;
  onSelect: () => void;
}

/** One answer of a single-choice question: a radio button drawn as a card. */
export const OptionRow = forwardRef<HTMLButtonElement, OptionRowProps>(function OptionRow({ title, subtitle, selected, onSelect }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`w-full rounded-2xl border p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-step-on)] ${
        selected ? "border-[var(--auth-step-on)] bg-[var(--auth-step-on)]/10" : "border-[var(--ui-divider)] bg-white"
      }`}
    >
      <span className="block text-sm font-semibold text-[var(--ui-text)]">{title}</span>
      <span className="mt-0.5 block text-xs text-[var(--ui-text-muted)]">{subtitle}</span>
    </button>
  );
});
```

Create `features/auth/redesign/ChipCheckbox.tsx` exactly:
```tsx
import { forwardRef } from "react";

export interface ChipCheckboxProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
}

/** One answer of a multiple-choice question: a checkbox drawn as a chip. */
export const ChipCheckbox = forwardRef<HTMLButtonElement, ChipCheckboxProps>(function ChipCheckbox({ label, checked, onToggle }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`rounded-full border px-3.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-step-on)] ${
        checked ? "border-[var(--auth-step-on)] bg-[var(--auth-step-on)]/10 font-semibold text-[var(--ui-text)]" : "border-[var(--ui-divider)] bg-white text-[var(--ui-text-muted)]"
      }`}
    >
      {label}
    </button>
  );
});
```

Create `features/auth/redesign/InvestorProfile.tsx` exactly:
```tsx
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GOAL_OPTIONS } from "@/features/profile-v2/lib/onboardingOptions";
import type { InvestorType, PrimaryGoal } from "../types";
import { AuthAlert } from "./AuthAlert";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { ChipCheckbox } from "./ChipCheckbox";
import {
  INVESTOR_PROFILE_OPTIONS, PROFILE_HEADLINE_ACCENT, PROFILE_HEADLINE_BEFORE, PROFILE_PARAGRAPH, PROFILE_ROWS,
} from "./finishCopy";
import { OptionRow } from "./OptionRow";

export interface InvestorProfileProps {
  /** Answers saved before (a return from a later screen, or a resumed session); empty for a new person. */
  initialInvestorType?: InvestorType | null;
  initialGoals?: PrimaryGoal[];
  /** May be async; a rejection is shown on the screen. */
  onSubmit: (values: { investorType: InvestorType; goals: PrimaryGoal[] }) => void | Promise<void>;
  /** Back to screen 3, where the name and the email can be changed. */
  onBack: () => void;
}

/** Sign-up screen 4. Both answers are required; nothing is pre-selected and there is no Skip (design Q12, Q67, Q68). */
export function InvestorProfile({ initialInvestorType = null, initialGoals = [], onSubmit, onBack }: InvestorProfileProps) {
  const [investorType, setInvestorType] = useState<InvestorType | null>(initialInvestorType);
  const [goals, setGoals] = useState<PrimaryGoal[]>(initialGoals);
  const [typeError, setTypeError] = useState(false);
  const [goalsError, setGoalsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const firstOption = useRef<HTMLButtonElement>(null);
  const firstChip = useRef<HTMLButtonElement>(null);

  const allGoals = GOAL_OPTIONS.map((option) => option.value);
  const allChosen = allGoals.every((goal) => goals.includes(goal));
  const toggleGoal = (goal: PrimaryGoal) => {
    setGoalsError(false);
    setGoals((current) => (current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal]));
  };

  const submit = async () => {
    if (saving) return;
    const missingType = investorType === null;
    const missingGoals = goals.length === 0;
    setTypeError(missingType);
    setGoalsError(missingGoals);
    if (investorType === null || missingGoals) {
      (missingType ? firstOption : firstChip).current?.focus();
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      await onSubmit({ investorType, goals });
    } catch {
      setSaveError("Couldn't save your answers. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthPage>
      <AuthSplitCard
        step={4}
        onBack={onBack}
        left={
          <AuthLeftPanel
            sketch="person"
            headline={<>{PROFILE_HEADLINE_BEFORE}<span className="text-[var(--pos-text)]">{PROFILE_HEADLINE_ACCENT}</span></>}
            paragraph={PROFILE_PARAGRAPH}
            rows={PROFILE_ROWS}
          />
        }
        right={
          <div className="space-y-6 text-left">
            <section className="space-y-3">
              <div className="space-y-1">
                <h1 className="text-[22px] font-bold leading-tight text-[var(--ui-text)]">How do you usually invest?</h1>
                <p className="text-sm text-[var(--ui-text-muted)]">This helps us tailor your experience and insights.</p>
              </div>
              <div role="radiogroup" aria-label="How do you usually invest?" className="space-y-2">
                {INVESTOR_PROFILE_OPTIONS.map((option, index) => (
                  <OptionRow
                    key={option.value}
                    ref={index === 0 ? firstOption : undefined}
                    title={option.title}
                    subtitle={option.subtitle}
                    selected={investorType === option.value}
                    onSelect={() => {
                      setInvestorType(option.value);
                      setTypeError(false);
                    }}
                  />
                ))}
              </div>
              {typeError ? <p role="alert" className="text-xs text-[var(--neg-text)]">Choose how you usually invest.</p> : null}
            </section>
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-bold text-[var(--ui-text)]">
                  What are you working towards? <span className="text-xs font-normal text-[var(--ui-text-muted)]">(Select all that apply)</span>
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setGoalsError(false);
                    setGoals(allChosen ? [] : [...allGoals]);
                  }}
                  className="shrink-0 text-xs font-semibold text-[var(--pos-text)] hover:underline"
                >
                  {allChosen ? "Clear all" : "Select all"}
                </button>
              </div>
              <div role="group" aria-label="What are you working towards?" className="flex flex-wrap gap-2">
                {GOAL_OPTIONS.map((option, index) => (
                  <ChipCheckbox
                    key={option.value}
                    ref={index === 0 ? firstChip : undefined}
                    label={option.title}
                    checked={goals.includes(option.value)}
                    onToggle={() => toggleGoal(option.value)}
                  />
                ))}
              </div>
              {goalsError ? <p role="alert" className="text-xs text-[var(--neg-text)]">Choose at least one goal.</p> : null}
            </section>
            {saveError ? <AuthAlert tone="error">{saveError}</AuthAlert> : null}
            <Button type="button" onClick={() => void submit()} disabled={saving} className="h-[52px] w-full rounded-full text-[15px] font-bold">
              {saving ? "Saving..." : "Continue"}
            </Button>
          </div>
        }
      />
    </AuthPage>
  );
}
```

**Checkpoint A:** `test src/features/auth/redesign/InvestorProfile.test.tsx` (expect all pass).

### Phase B: screens 5 and 6, and the import hook (tasks 6.13 and 6.14)
- **Screen 5, `What would you like to connect first?`** (step bar `Step 5 of 5`, Back to screen 4, the wallet sketch): left `Bring your investments together.` with the paragraph and three rows. Right: `You can always add more accounts later.`, six source rows. **Mutual funds** (`Import your holdings via CAMS or MF Central`) is the only active one and starts selected; the other five (`Stocks & ETFs`, `PMS & AIFs`, `Real estate`, `Gold`, `Bank accounts, loans & credit cards`) each carry a `Coming soon` pill, are marked `aria-disabled` and ignore clicks and keys. `Continue` goes on to today's statement import screens. **No skip.**
- **Screen 6, `You're all set!`** (step label `Done` with all five bars full, no Back, the tick sketch): left headline, paragraph and the three status rows (the first two ticked, the third in progress). Right: a tick, `Getting your accounts ready`, the card `Accounts being imported` with **only real rows** (one: `Mutual Funds`, `Imported via CAS statement`) and a `View details ›` link, the tip `While we fetch your data...`, and `Go to my dashboard`. Both buttons call `onFinish` once (a second click while it runs does nothing; the button says `Opening...`): `"home"` for the dashboard, `"import-history"` for View details. If `onFinish` fails, show `Your statement is saved, but we couldn't finish setting up your account. Try again.` and let the person click again. **No timed redirect.**
- `SoloCasUpload` gets one optional prop, `onImported`. When it is given, finishing the import calls it **instead of** marking onboarding complete (the All set screen writes the completion). Without it nothing changes (the existing retry state stays).

Create `features/auth/redesign/SourceRow.tsx` exactly:
```tsx
export interface SourceRowProps {
  title: string;
  description: string;
  comingSoon: boolean;
  selected: boolean;
  onSelect?: () => void;
}

/** One source on the Connect accounts screen. A "Coming soon" row is drawn but ignores clicks and keys (design Q14). */
export function SourceRow({ title, description, comingSoon, selected, onSelect }: SourceRowProps) {
  const body = (
    <>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-[var(--ui-text)]">{title}</span>
        <span className="mt-0.5 block text-xs text-[var(--ui-text-muted)]">{description}</span>
      </span>
      {comingSoon ? (
        <span className="shrink-0 rounded-full bg-[var(--ui-divider)] px-2.5 py-1 text-[11px] font-medium text-[var(--ui-text-muted)]">Coming soon</span>
      ) : null}
    </>
  );
  if (comingSoon) {
    return (
      <div role="radio" aria-checked={false} aria-disabled="true" className="flex w-full cursor-not-allowed items-center gap-3 rounded-2xl border border-[var(--ui-divider)] bg-white/60 p-3.5 text-left opacity-70">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-step-on)] ${
        selected ? "border-[var(--auth-step-on)] bg-[var(--auth-step-on)]/10" : "border-[var(--ui-divider)] bg-white"
      }`}
    >
      {body}
    </button>
  );
}
```

Create `features/auth/redesign/ConnectAccounts.tsx` exactly:
```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { CONNECT_HEADLINE_ACCENT, CONNECT_HEADLINE_BEFORE, CONNECT_PARAGRAPH, CONNECT_ROWS, CONNECT_SOURCES } from "./finishCopy";
import { SourceRow } from "./SourceRow";

export interface ConnectAccountsProps {
  /** Continue on Mutual funds: today's statement import screens follow. */
  onContinue: () => void;
  /** Back to screen 4, with the answers filled. */
  onBack: () => void;
}

/** Sign-up screen 5. Only Mutual funds works today; the others are drawn as Coming soon. There is no skip (design Q16). */
export function ConnectAccounts({ onContinue, onBack }: ConnectAccountsProps) {
  const [selected, setSelected] = useState("Mutual funds");
  return (
    <AuthPage>
      <AuthSplitCard
        step={5}
        onBack={onBack}
        left={
          <AuthLeftPanel
            sketch="wallet"
            headline={<>{CONNECT_HEADLINE_BEFORE}<span className="text-[var(--pos-text)]">{CONNECT_HEADLINE_ACCENT}</span></>}
            paragraph={CONNECT_PARAGRAPH}
            rows={CONNECT_ROWS}
          />
        }
        right={
          <div className="space-y-5 text-left">
            <div className="space-y-2">
              <h1 className="text-[26px] font-bold leading-tight text-[var(--ui-text)]">What would you like to connect first?</h1>
              <p className="text-sm text-[var(--ui-text-muted)]">You can always add more accounts later.</p>
            </div>
            <div role="radiogroup" aria-label="What would you like to connect first?" className="space-y-2">
              {CONNECT_SOURCES.map((source) => (
                <SourceRow
                  key={source.title}
                  title={source.title}
                  description={source.description}
                  comingSoon={source.comingSoon}
                  selected={selected === source.title}
                  onSelect={() => setSelected(source.title)}
                />
              ))}
            </div>
            <Button type="button" onClick={onContinue} className="h-[52px] w-full rounded-full text-[15px] font-bold">
              Continue
            </Button>
          </div>
        }
      />
    </AuthPage>
  );
}
```

Create `features/auth/redesign/AllSet.tsx` exactly:
```tsx
import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthAlert } from "./AuthAlert";
import { AuthLeftPanel } from "./AuthLeftPanel";
import { AuthPage } from "./AuthPage";
import { AuthSplitCard } from "./AuthSplitCard";
import { ALL_SET_FINISH_ERROR, ALL_SET_HEADLINE, ALL_SET_PARAGRAPH, ALL_SET_STATUS } from "./finishCopy";
import { StatusRow } from "./StatusRow";

export interface AllSetProps {
  /** Writes the completion and opens the chosen place. May be async; a rejection shows the retry message. */
  onFinish: (target: "home" | "import-history") => void | Promise<void>;
}

/** Sign-up screen 6. Shown after a real import, before onboarding is marked complete. No timed redirect (design Q18). */
export function AllSet({ onFinish }: AllSetProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const finish = async (target: "home" | "import-history") => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await onFinish(target);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <AuthPage>
      <AuthSplitCard
        step={5}
        done
        left={
          <AuthLeftPanel
            sketch="tick"
            headline={ALL_SET_HEADLINE}
            paragraph={ALL_SET_PARAGRAPH}
            status={ALL_SET_STATUS.map((row) => <StatusRow key={row.label} label={row.label} description={row.description} state={row.state} />)}
          />
        }
        right={
          <div className="space-y-5 text-left">
            <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--auth-step-on)] text-white">
              <Check size={24} />
            </span>
            <h1 className="text-[26px] font-bold leading-tight text-[var(--ui-text)]">Getting your accounts ready</h1>
            <section aria-labelledby="all-set-list" className="space-y-3 rounded-2xl border border-[var(--ui-divider)] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 id="all-set-list" className="text-sm font-semibold text-[var(--ui-text)]">Accounts being imported</h2>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void finish("import-history")}
                  className="text-xs font-semibold text-[var(--pos-text)] hover:underline disabled:opacity-60"
                >
                  View details ›
                </button>
              </div>
              <ul className="space-y-2">
                <li className="flex items-center gap-3 text-sm">
                  <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--auth-step-on)]/15 text-[var(--auth-step-on)]">
                    <Check size={14} />
                  </span>
                  <span>
                    <strong className="block font-semibold text-[var(--ui-text)]">Mutual Funds</strong>
                    <span className="block text-xs text-[var(--ui-text-muted)]">Imported via CAS statement</span>
                  </span>
                </li>
              </ul>
            </section>
            <section className="rounded-2xl bg-[var(--auth-step-on)]/10 p-4">
              <h2 className="text-sm font-semibold text-[var(--ui-text)]">While we fetch your data...</h2>
              <p className="mt-1 text-xs text-[var(--ui-text-muted)]">We&apos;ll analyse your portfolio, organise everything in one place and prepare personalised insights for you.</p>
            </section>
            {failed ? <AuthAlert tone="error">{ALL_SET_FINISH_ERROR}</AuthAlert> : null}
            <Button type="button" disabled={busy} onClick={() => void finish("home")} className="h-[52px] w-full rounded-full text-[15px] font-bold">
              {busy ? "Opening..." : "Go to my dashboard"}
            </Button>
          </div>
        }
      />
    </AuthPage>
  );
}
```

Apply this change to `features/auth/SoloCasUpload.tsx` (unified diff; lines starting with `-` go, lines starting with `+` come in):
```diff
--- a/frontend/src/features/auth/SoloCasUpload.tsx
+++ b/frontend/src/features/auth/SoloCasUpload.tsx
@@ -8,7 +8,12 @@ import { PRIMARY_BTN } from "../import/prompts/copy";
 interface SoloCasUploadProps {
   name: string;
+  /**
+   * Desktop sign-up: called when the import is done instead of marking onboarding complete, so the All set screen can
+   * show first. That screen writes the completion itself.
+   */
+  onImported?: () => void;
 }
 
-export function SoloCasUpload({ name }: SoloCasUploadProps) {
+export function SoloCasUpload({ name, onImported }: SoloCasUploadProps) {
   const { updateMe } = useAuth();
   const [memberId, setMemberId] = useState<string | null>(null);
@@ -70,4 +75,8 @@ export function SoloCasUpload({ name }: SoloCasUploadProps) {
   // back while the request is in flight; on success onboarding moves on.
   const handleDone = async () => {
+    if (onImported) {
+      onImported();
+      return;
+    }
     try {
       await updateMe({ onboarding_completed: true });
```

**Checkpoint B:** `test src/features/auth/redesign/ConnectAccounts.test.tsx src/features/auth/redesign/AllSet.test.tsx src/features/auth/SoloCasUpload.onImported.test.tsx src/features/auth/SoloCasUpload.test.tsx src/features/auth/SoloCasUpload.finish.test.tsx` (expect all pass).

### Phase C: the return trip, the resume rule and the wiring (task 6.11 and the end of 6.14)
- **Return trip (task 6.11).** Back from screen 4 shows screen 3 with the name and the email filled and **both editable**, the note `If you change it, we send a new code to the new address.` under the email, and Back to screen 4. On Continue only changed values trigger work: a changed **name** is saved on the self member (`updateMemberProfile(selfId, { name })`); a changed **email** (letter case does not count) calls `requestContactChange("email", newAddress)` and shows screen 3b for the NEW address; a correct code calls `verifyContactChange("email", newAddress, code)` and moves on to screen 4 with the answers kept. Back or Edit on 3b returns to screen 3 with the typed address kept; **the old email stays active until the code is verified**. A taken address or a 429 shows the backend's message inline. If both changed, the name is saved first and is not saved again after Back from 3b. Nothing changed: move on with no request. `DetailsEditor` does all of this; `AccountDetails` only gets the optional `emailNote` prop.
- **Resume (decisions Q26, Q64).** `resumeStepSplit(me, hasCompletedImport)` in `onboardingResume.ts`: no saved self name means screen 3; saved `q2_investing` and `q3_purpose` mean screen 4 (answers filled); saved `cas_upload` means screen 5, or screen 6 when an import has completed; `trust_primer` keeps its special case. `OnboardingFlow` reads the household import history **once**, only when the saved step is `cas_upload` (status `import_successful` counts as completed; a failed read means screen 5). Today's `resumeStep` is untouched and still serves mobile and legacy.
- **Wiring in `OnboardingFlow`** (split variant, desktop only): screen 3 (first visit: the name-only screen from the last packet; with a saved self name or after Back: `DetailsEditor`), screen 4, screen 5, today's import screens (the same wrapper as before, with `onImported`), screen 6. `onboardingSteps.ts` gets two client-side steps, `connect_accounts` and `all_set`, which are **never written** as the saved step. **All set** finishes by pushing the target address first (`/home`, or `paths.profileImportHistory()` for View details), then `updateMe({ onboarding_completed: true })`; if that fails the address is put back and the error propagates so the screen shows its retry message. The dev index gets three entries.

Create `features/auth/redesign/DetailsEditor.tsx` exactly:
```tsx
import { useState } from "react";
import { useAuth } from "../AuthContext";
import { listHouseholdMembers, updateMemberProfile } from "../api";
import { formatAuthErrorMessage } from "../validation";
import { AccountDetails } from "./AccountDetails";
import { EmailCode } from "./EmailCode";

export interface DetailsEditorProps {
  /** What is saved now. */
  initialName: string;
  initialEmail: string;
  /** Called once every changed value is saved (or nothing changed). */
  onDone: (saved: { name: string }) => void;
  /** Back to screen 4 without saving anything more. */
  onBack: () => void;
}

const EMAIL_NOTE = "If you change it, we send a new code to the new address.";

/**
 * Sign-up screen 3 again, reached by Back from screen 4 (design Q10, Q65, Q66). Both fields are filled and editable.
 * Only a changed value triggers work: a new name is saved on the self member; a new email gets a code at the new
 * address (screen 3b) and replaces the old one only after that code is verified, so the old email keeps working
 * until then.
 */
export function DetailsEditor({ initialName, initialEmail, onDone, onBack }: DetailsEditorProps) {
  const { requestContactChange, verifyContactChange } = useAuth();
  const [savedName, setSavedName] = useState(initialName);
  const [typed, setTyped] = useState({ name: initialName, email: initialEmail });
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  const submit = async ({ name, email }: { name: string; email: string }) => {
    setError(null);
    setTyped({ name, email });
    setSubmitting(true);
    try {
      let nameNow = savedName;
      if (name !== savedName) {
        const members = await listHouseholdMembers();
        const self = members.find((member) => member.relationship === "self");
        if (self) await updateMemberProfile(self.id, { name });
        setSavedName(name);
        nameNow = name;
      }
      if (!sameEmail(email, initialEmail)) {
        const result = await requestContactChange("email", email);
        setDevOtp(result.otp ?? null);
        setCodeError(null);
        setPendingEmail(email);
        return;
      }
      onDone({ name: nameNow });
    } catch (err) {
      setError(formatAuthErrorMessage(err, "Couldn't save your changes. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingEmail) {
    return (
      <EmailCode
        email={pendingEmail}
        devOtp={devOtp}
        error={codeError}
        submitting={submitting}
        onBack={() => setPendingEmail(null)}
        onEditEmail={() => setPendingEmail(null)}
        onResend={() => {
          setCodeError(null);
          requestContactChange("email", pendingEmail).then(
            (result) => setDevOtp(result.otp ?? null),
            (err) => setCodeError(formatAuthErrorMessage(err, "Couldn't resend the code. Try again.")),
          );
        }}
        onSubmit={(code) => {
          setCodeError(null);
          setSubmitting(true);
          verifyContactChange("email", pendingEmail, code).then(
            () => {
              setSubmitting(false);
              onDone({ name: savedName });
            },
            (err) => {
              setSubmitting(false);
              setCodeError(formatAuthErrorMessage(err, "That code didn't work. Try again."));
            },
          );
        }}
      />
    );
  }

  return (
    <AccountDetails
      initialName={typed.name}
      initialEmail={typed.email}
      emailNote={EMAIL_NOTE}
      error={error}
      submitting={submitting}
      onBack={onBack}
      onSubmit={submit}
    />
  );
}
```

Create `features/auth/onboardingResume.ts` exactly:
```ts
import type { OnboardingStep } from "./onboardingSteps";
import { ALL_GOALS } from "./Q3Purpose";
import type { MeResponse } from "./types";

// Where the split (desktop sign-up) flow resumes. Today's resumeStep keeps serving the mobile and legacy flows.
// Screen 3 is q1_name, screen 4 is q2_investing (q3_purpose is the old second half of it), screen 5 is
// connect_accounts and screen 6 is all_set. Screens 5 and 6 are never saved as the step: a saved cas_upload
// means "the import was started", and all_set is told apart by a completed import (one read at resume).
export function resumeStepSplit(me: MeResponse | null | undefined, hasCompletedImport: boolean): OnboardingStep {
  const step = me?.onboarding_step;
  if (!me?.self_name) return "q1_name";
  if (step === "trust_primer") {
    if (!me.investor_type) return "q2_investing";
    if (!me.primary_goals || !me.primary_goals.some((goal) => ALL_GOALS.includes(goal))) return "q2_investing";
    return "connect_accounts";
  }
  if (step === "q2_investing" || step === "q3_purpose") return "q2_investing";
  if (step === "cas_upload") return hasCompletedImport ? "all_set" : "connect_accounts";
  // q1_name, a missing or unknown step and "done" all land on screen 3, which shows the name and the email.
  return "q1_name";
}
```

Apply these changes (unified diffs):

`features/auth/redesign/AccountDetails.tsx` (the optional note):
```diff
--- a/frontend/src/features/auth/redesign/AccountDetails.tsx
+++ b/frontend/src/features/auth/redesign/AccountDetails.tsx
@@ -19,4 +19,6 @@ export interface AccountDetailsProps {
   /** Called with the cleaned name and the trimmed email. May be async; a rejection is shown on the screen. */
   onSubmit: (values: { name: string; email: string }) => void | Promise<void>;
+  /** Shown under the email field on the return trip, where a changed email gets a new code. */
+  emailNote?: string;
   /** Back to screen 1. Leave out when there is nothing to go back to. */
   onBack?: () => void;
@@ -28,5 +30,5 @@ const cleanName = (raw: string) => raw.replace(/[’‘]/g, "'").split(/\s+/).fi
 
 /** Sign-up screen 3: the PAN name and the email, together. */
-export function AccountDetails({ initialName = "", initialEmail = "", emailLocked = false, onSubmit, onBack, error = null, submitting = false }: AccountDetailsProps) {
+export function AccountDetails({ initialName = "", initialEmail = "", emailLocked = false, emailNote, onSubmit, onBack, error = null, submitting = false }: AccountDetailsProps) {
   const [name, setName] = useState(initialName);
   const [email, setEmail] = useState(initialEmail);
@@ -91,5 +93,5 @@ export function AccountDetails({ initialName = "", initialEmail = "", emailLocke
               type="email"
               placeholder="e.g. siddharth@gmail.com"
-              hint={emailLocked ? "This email address is verified." : "We'll use this for important updates about your account."}
+              hint={emailLocked ? "This email address is verified." : `We'll use this for important updates about your account.${emailNote ? ` ${emailNote}` : ""}`}
               autoComplete="email"
               value={email}
```

`features/auth/onboardingSteps.ts`:
```diff
--- a/frontend/src/features/auth/onboardingSteps.ts
+++ b/frontend/src/features/auth/onboardingSteps.ts
@@ -7,4 +7,7 @@ export const ONBOARDING_STEPS = [
   "q3_purpose",
   "cas_upload",
+  // Desktop sign-up screens 5 and 6. They are never written as the saved onboarding step.
+  "connect_accounts",
+  "all_set",
   "done",
 ] as const;
```

`features/auth/redesign/devScreens.tsx`:
```diff
--- a/frontend/src/features/auth/redesign/devScreens.tsx
+++ b/frontend/src/features/auth/redesign/devScreens.tsx
@@ -1,4 +1,6 @@
 import type { ReactNode } from "react";
 import { AccountDetails } from "./AccountDetails";
+import { AllSet } from "./AllSet";
+import { ConnectAccounts } from "./ConnectAccounts";
 import { AuthAlert } from "./AuthAlert";
 import { AuthField } from "./AuthField";
@@ -6,4 +8,5 @@ import { AuthLeftPanel } from "./AuthLeftPanel";
 import { AuthSplitCard } from "./AuthSplitCard";
 import { InfoCard } from "./InfoCard";
+import { InvestorProfile } from "./InvestorProfile";
 import { LoginCode } from "./LoginCode";
 import { LoginEntry } from "./LoginEntry";
@@ -108,4 +111,19 @@ export const DEV_SCREENS: DevScreen[] = [
     render: () => <EmailCode email="siddharth@gmail.com" devOtp={null} error="That code has expired." submitting={false} onSubmit={noop} onResend={noop} onBack={noop} onEditEmail={noop} />,
   },
+  {
+    id: "signup-profile",
+    title: "Sign-up, step 4 (investor profile)",
+    render: () => <InvestorProfile onSubmit={noop} onBack={noop} />,
+  },
+  {
+    id: "signup-connect",
+    title: "Sign-up, step 5 (Connect accounts)",
+    render: () => <ConnectAccounts onContinue={noop} onBack={noop} />,
+  },
+  {
+    id: "signup-all-set",
+    title: "Sign-up, step 6 (All set)",
+    render: () => <AllSet onFinish={noop} />,
+  },
   {
     id: "step-progress",
```

`features/auth/OnboardingFlow.tsx`:
```diff
--- a/frontend/src/features/auth/OnboardingFlow.tsx
+++ b/frontend/src/features/auth/OnboardingFlow.tsx
@@ -12,6 +12,13 @@ import { OnboardingCardStack } from "./OnboardingCardStack";
 import { SoloCasUpload } from "./SoloCasUpload";
 import { createHouseholdMember, listHouseholdMembers } from "./api";
+import { getHouseholdImportHistory } from "../import/api";
+import { paths } from "@/shell/nav/paths";
 import { AccountDetails } from "./redesign/AccountDetails";
+import { AllSet } from "./redesign/AllSet";
 import { AuthPage } from "./redesign/AuthPage";
+import { ConnectAccounts } from "./redesign/ConnectAccounts";
+import { DetailsEditor } from "./redesign/DetailsEditor";
+import { InvestorProfile } from "./redesign/InvestorProfile";
+import { resumeStepSplit } from "./onboardingResume";
 import { clearPendingSignup, readPendingSignup } from "./redesign/pendingSignup";
 import type { InvestorType, MeResponse, PrimaryGoal } from "./types";
@@ -54,5 +61,5 @@ export function OnboardingFlow({ isMobile = false, variant = "legacy" }: Onboard
   const { me, updateMe } = useAuth();
   const split = variant === "split" && !isMobile;
-  const [history, setHistory] = useState<HistoryState>(() => initHistory(resumeStep(me)));
+  const [history, setHistory] = useState<HistoryState>(() => initHistory(split ? resumeStepSplit(me, false) : resumeStep(me)));
   const [answers, setAnswers] = useState<OnboardingAnswers>(() => ({
     name: me?.self_name ?? "",
@@ -62,4 +69,28 @@ export function OnboardingFlow({ isMobile = false, variant = "legacy" }: Onboard
 
   const step = currentStep(history);
+  const jump = (next: OnboardingStep) => setHistory(initHistory(next));
+  // Back from screen 4 shows screen 3 again with both fields editable (the return trip).
+  const [editingDetails, setEditingDetails] = useState(false);
+
+  // Resume on screen 6: a saved cas_upload plus a completed import means only the last click was missing. One read of
+  // the import history, no new endpoint; if it fails the person starts from screen 5.
+  const [resuming, setResuming] = useState(() => split && me?.onboarding_step === "cas_upload" && Boolean(me?.self_name));
+  useEffect(() => {
+    if (!resuming) return;
+    let live = true;
+    getHouseholdImportHistory().then(
+      (items) => {
+        if (!live) return;
+        if (items.some((item) => item.status === "import_successful")) setHistory(initHistory("all_set"));
+        setResuming(false);
+      },
+      () => {
+        if (live) setResuming(false);
+      },
+    );
+    return () => {
+      live = false;
+    };
+  }, [resuming]);
 
   // Split sign-up: the name typed on screen 3 was kept in sessionStorage because the account did not exist yet. Now
@@ -107,5 +138,5 @@ export function OnboardingFlow({ isMobile = false, variant = "legacy" }: Onboard
 
   useEffect(() => {
-    if (step !== "done") {
+    if (step !== "done" && step !== "connect_accounts" && step !== "all_set") {
       void updateMe({ onboarding_step: step });
     }
@@ -128,5 +159,71 @@ export function OnboardingFlow({ isMobile = false, variant = "legacy" }: Onboard
   };
 
+  // All set: write the completion, then open the chosen place. The address is set first because the app switches to
+  // the signed-in shell (which reads the address) the moment the completion is saved; a failed save puts it back.
+  const finish = async (target: "home" | "import-history") => {
+    const previous = window.location.pathname + window.location.search;
+    window.history.pushState(null, "", target === "home" ? "/home" : paths.profileImportHistory());
+    try {
+      await updateMe({ onboarding_completed: true });
+    } catch (err) {
+      window.history.replaceState(null, "", previous);
+      throw err;
+    }
+  };
+
   const renderStep = () => {
+    if (split && resuming) {
+      return (
+        <AuthPage>
+          <p role="status" className="text-sm text-[var(--ui-text-muted)]">Setting up your profile...</p>
+        </AuthPage>
+      );
+    }
+    if (split && step === "q2_investing") {
+      return (
+        <InvestorProfile
+          initialInvestorType={answers.investorType}
+          initialGoals={answers.primaryGoals}
+          onBack={() => {
+            setEditingDetails(true);
+            jump("q1_name");
+          }}
+          onSubmit={async ({ investorType, goals }) => {
+            await updateMe({ investor_type: investorType, primary_goals: goals, onboarding_step: "q2_investing" });
+            setAnswers((a) => ({ ...a, investorType, primaryGoals: goals }));
+            jump("connect_accounts");
+          }}
+        />
+      );
+    }
+    if (split && step === "connect_accounts") {
+      return <ConnectAccounts onBack={() => jump("q2_investing")} onContinue={() => jump("cas_upload")} />;
+    }
+    if (split && step === "cas_upload") {
+      return (
+        <div className="w-full min-h-dvh bg-[var(--color-bg)] flex flex-col justify-start items-center p-2 sm:p-6 lg:p-8 box-border">
+          <div className="w-full max-w-[1600px] mx-auto">
+            <SoloCasUpload name={answers.name} onImported={() => jump("all_set")} />
+          </div>
+        </div>
+      );
+    }
+    if (split && step === "all_set") {
+      return <AllSet onFinish={finish} />;
+    }
+    if (step === "q1_name" && split && (editingDetails || me?.self_name)) {
+      return (
+        <DetailsEditor
+          initialName={answers.name || me?.self_name || ""}
+          initialEmail={me?.email ?? ""}
+          onBack={() => jump("q2_investing")}
+          onDone={({ name }) => {
+            setEditingDetails(false);
+            setAnswers((a) => ({ ...a, name }));
+            jump("q2_investing");
+          }}
+        />
+      );
+    }
     if (step === "q1_name" && split) {
       if (handover !== "idle") {
```

**Checkpoint C:** `test src/features/auth src/AppVariant.test.tsx src/App.test.tsx` (expect all pass), then `types` (no output) and `lint` (0 errors; the number of warnings must not go up).

## 5. Tests to satisfy (committed)
Phase A: `redesign/InvestorProfile.test.tsx`. Phase B: `redesign/ConnectAccounts.test.tsx`, `redesign/AllSet.test.tsx`, `SoloCasUpload.onImported.test.tsx`. Phase C: `redesign/DetailsEditor.test.tsx`, `onboardingResume.test.ts`, `redesign/devScreens.finish.test.tsx`, `OnboardingFlow.split.screens.test.tsx` (screens 4 to 6 and the resume cases through `OnboardingFlow`, and the return trip), and the updated older test `OnboardingFlow.split.test.tsx`.

## 6. Final checks (run all, report the real output)
```
types                      # expect: no output
lint                       # expect: 0 errors
test src/features/auth src/AppVariant.test.tsx src/App.test.tsx src/mobile src/shell src/features/legal
git status --short         # expect: exactly the 9 created and 5 edited source files of section 3 (no test)
```
Do **not** run `build` or the full suite. If one test fails only under load, re-run that file alone before reporting it.

## 7. Report (one block, from the rules file)
Add: the exact output of Step 0 (the git lines and the `types` result); the result of checkpoints A, B and C; the list of files created and edited (it must match section 3); every place you deviated from this packet and why; what you could not check (you cannot see the screen: the orchestrator opens the dev index and walks screens 4 to 6, the return trip and a reload on All set, and takes the screenshots).
