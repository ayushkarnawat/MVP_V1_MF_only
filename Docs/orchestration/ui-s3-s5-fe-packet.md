# Packet S3-S5-FE for Gemini (Antigravity): name mismatch adds a family member, Complete profile after the import, the head with no data, and the six life goals (four phases)
**Status:** READY FOR GEMINI (red tests committed on `leapswitch-redesign`; reference solution written by the orchestrator in a scratch clone on top of the finished S2 packet and run green against every test below, 3 Nov 2026). Do this packet **after** the S2 packet (`ui-s2-fe-packet.md`) is finished and committed: phase B edits `useImportOrchestration.tsx`, which the S2 packet also edits.
**Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Tasks 3.3, 3.4, 3.5 (stage S3) and 5.3 (stage S5). Rules file: `Docs/orchestration/ui-common-rules-antigravity.md` (read it first; this packet adds to it).
**Backend contract (built by Codex, in the repo or arriving):** `POST /imports/sessions/{session_id}/resolve-add-as-family` with an empty JSON body returns the next preview, or a 409 with the usual prompt error (same shape as `resolve-name`); `PersonConfirmResult.created: bool` (true when the person became a new household member in that confirm); `PATCH /auth/me` accepts `primary_goals` made of the six new codes only. You never call the backend for real: every test mocks it.

## What this run is, in one paragraph
Four phases in one run. **A:** the name-mismatch pop-up stops asking "is that you?" and instead says whose account it is and offers **Add {name} as a family member** or **Upload a different file**; the account holder is never renamed. **B:** after the import, every person the import created gets the existing Complete profile dialog, one after another, skippable. **C:** one test (and a regression run) that the account holder with no data shows "No data yet" in the family view; fix only what the test proves. **D:** the four old goals become the six life goals (Profile dialog, chips, the mobile goals screen, fixtures). The tests are already committed and **fail now** (except phase C's, which should pass); make them pass without editing any test. Do the phases in order, each with its checkpoint.

## Rules (read twice)
1. **Scope.** Create no new file. Edit the files listed in section 3, nothing else. Every test file and fixture is already in place: **never edit a test or a fixture to make it pass.** If a test seems wrong, stop and describe it in the report.
2. **Run the phase checkpoint after every phase** and keep its real output for the report. Fix your code, not the test. **If a checkpoint is still red after two attempts, stop and report; do not start the next phase.**
3. **No new dependency, no `npm install`, no `package.json` change.** The six goal icons use `lucide-react`, already installed.
4. **Never run a git command that changes anything.** Read-only `git status`, `git diff`, `git log` are fine.
5. **Do not touch `backend/**`.**
6. **Identity rule (do not weaken it).** Nothing in phase A may rename the account holder. The old `resolveName` call and the `{ kind: "name" }` answer stay in the code (the backend keeps `resolve-name` for old clients), but **nothing calls them from the dialog any more**.
7. **Plain words on screen.** Exactly the strings in this packet. No em-dashes. Apostrophes in the dialog text are the typographic `’` shown here.
8. **Mobile.** The only mobile change is the goals screen (phase D, `Q3Purpose.tsx`). Do not touch anything else under `src/mobile`.
9. **Style.** 2-space indentation, double quotes, semicolons, no `any`, no unused imports or locals (`tsc -b` is strict), no `console.`. Do not add `oxlint-disable` comments.
10. **If anything differs from this packet, stop and report it.**
11. **Run every command inside WSL** through the script shown in Step 0. A test that fails with "Unable to find an element ... timed out" under load: re-run that file alone before reporting it.

## Step 0: environment check (do this first, and report the output)
Work only in `C:\Users\Dell\ui-r2-fe`. Run from that folder in PowerShell:
```
git status --short                 # expect: nothing printed (run this FIRST)
git branch --show-current          # expect: leapswitch-redesign
git log --oneline -8              # expect: the line "ui-s3: red tests and packet for the S3 and S5 frontend work (Gemini)" appears in the list (the finished S2 work and other commits may sit above it)
```
Every check goes through one command; replace `<mode and paths>`:
```
wsl.exe -d Ubuntu -- env CR6_SRC=/mnt/c/Users/Dell/ui-r2-fe/frontend CR6_DST=/home/delladiti/ui-r2-fe-chk bash /mnt/c/Users/Dell/ui-r2-fe/Docs/orchestration/cr-r6-fe-check.sh <mode and paths>
```
`<mode and paths>` is `types`, `lint` or `test <paths under src/>`. Do **not** run `build` or the full suite: the orchestrator runs both at the gate. Do **not** run a test baseline before you start: the committed tests are red on purpose (the orchestrator measured 11 failed files and 51 failed tests across the import, home, auth, profile, dashboard, legal, components and mobile folders). Run only:
```
types                      # expect: 23 error lines, all in *.test.ts(x), all about something this packet adds (`resolveAddAsFamily`, `onAddAsFamily`, the six goal codes); none in a source file
```
If `types` shows an error in a source file, stop and report.

## Goal
Make every test listed in section 5 pass with the behaviour in section 4, and keep the rest of the suite as it was. **Non-goals:** the sign-up redesign (stage S6), the Returns toggle, any new screen, any change to `CompleteProfileDialog` itself, the backend, the web sign-up goal screen (there is none; `Q3Purpose` is the goals screen).

## 3. File map (all under `frontend/src/`)
**Edit (9), no new files:**
- Phase A: `features/import/prompts/NameMismatchDialog.tsx` (rewritten), `features/import/prompts/PromptHost.tsx`, `features/import/useImportFlow.ts`, `features/import/api.ts`
- Phase B: `features/import/useImportOrchestration.tsx`
- Phase C: none expected
- Phase D: `features/auth/types.ts`, `features/profile-v2/lib/onboardingOptions.ts`, `features/profile-v2/components/GoalsDialog.tsx`, `features/auth/Q3Purpose.tsx`

**Do not touch:** every `*.test.ts(x)` file, every fixture (`features/profile-v2/fixtures/me.ts` is already updated), `features/dashboard/members/**`, `features/profile-v2/lib/goalChips.ts` (it already collapses a full set into "All of it", and now does so for all six), `src/shell/**`, `package.json`, anything under `backend/`.
If `git status` at the end shows a different list, stop and report.

## 4. Specifications

### Phase A: the name-mismatch pop-up (task 3.3)
- Title `This is {enteredName}’s account` (the account holder). Body `You uploaded {statementName}’s file. Do you want to add {statementName} as a family member, or upload a different file?`. Primary button `Add {statementName} as a family member`; secondary `Upload a different file`, which is also what the close button does (it discards the session). **No "Yes, that’s me" button** and no list of people. A server error shows in the pop-up as it does today.
- `PromptHost` sends `{ kind: "addAsFamily" }` for the `self_name_mismatch` prompt; `useImportFlow` turns that into the new API call; the call is `POST resolve-add-as-family` with an empty body.

Replace `features/import/prompts/NameMismatchDialog.tsx` entirely with:
```tsx
import { PromptDialog } from "./PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN } from "./copy";

export interface NameMismatchDialogProps {
  isOpen: boolean;
  /** The account holder's name. It is never changed here. */
  enteredName: string;
  /** The person the statement is in. */
  statementName: string;
  /** Inline error from the server. */
  error?: string | null;
  onAddAsFamily: () => void;
  /** Also the way out of ×. */
  onUploadDifferent: () => void;
}

// U2: first import, no person in the file is compatible with the account holder's name.
// The account holder is never renamed: the person on the statement is added as a family member instead.
export function NameMismatchDialog({
  isOpen,
  enteredName,
  statementName,
  error,
  onAddAsFamily,
  onUploadDifferent,
}: NameMismatchDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`This is ${enteredName}’s account`}
      body={`You uploaded ${statementName}’s file. Do you want to add ${statementName} as a family member, or upload a different file?`}
      onClose={onUploadDifferent}
      footer={
        <>
          <button type="button" onClick={onAddAsFamily} className={PRIMARY_BTN}>
            {`Add ${statementName} as a family member`}
          </button>
          <button type="button" onClick={onUploadDifferent} className={SECONDARY_BTN}>
            Upload a different file
          </button>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </PromptDialog>
  );
}
```

Apply these changes exactly (unified diffs; lines starting with `-` go, lines starting with `+` come in). Do not change anything else in those files.

`features/import/prompts/PromptHost.tsx`:
```diff
--- a/frontend/src/features/import/prompts/PromptHost.tsx
+++ b/frontend/src/features/import/prompts/PromptHost.tsx
@@ -124,5 +124,5 @@ export function PromptHost({
           statementName={str(d.statement_name)}
           error={error}
-          onUseName={(name) => onResolve({ kind: "name", name })}
+          onAddAsFamily={() => onResolve({ kind: "addAsFamily" })}
           onUploadDifferent={() => discard()}
         />
```

`features/import/useImportFlow.ts`:
```diff
--- a/frontend/src/features/import/useImportFlow.ts
+++ b/frontend/src/features/import/useImportFlow.ts
@@ -7,4 +7,5 @@ import {
   parseImport,
   resolveName,
+  resolveAddAsFamily,
   resolvePan,
   resolveSamePerson,
@@ -33,4 +34,5 @@ export type ImportFlowStage =
 export type PromptAction =
   | { kind: "name"; name: string }
+  | { kind: "addAsFamily" }
   | { kind: "self"; personKey: string | null }
   | { kind: "pan" }
@@ -188,4 +190,7 @@ export function useImportFlow(householdMemberId: string) {
             next = await resolveName(sessionId, action.name);
             break;
+          case "addAsFamily":
+            next = await resolveAddAsFamily(sessionId);
+            break;
           case "self":
             next = await resolveSelf(sessionId, action.personKey);
```

`features/import/api.ts`:
```diff
--- a/frontend/src/features/import/api.ts
+++ b/frontend/src/features/import/api.ts
@@ -101,4 +101,9 @@ export function resolveName(sessionId: string, name: string): Promise<ImportPrev
 }
 
+/** U2, new answer: add the people on the statement as family members; the account holder is not touched. */
+export function resolveAddAsFamily(sessionId: string): Promise<ImportPreviewResponse> {
+  return postSession(sessionId, "resolve-add-as-family", {});
+}
+
 /** U3: pick which statement person is Me; null = "None of these". */
 export function resolveSelf(sessionId: string, personKey: string | null): Promise<ImportPreviewResponse> {
```

**Checkpoint A:** `test src/features/import` (expect all pass).

### Phase B: Complete profile after the import (task 3.4)
After the confirm, for each person in the response with `created === true`, show the existing Complete profile dialog for that member, one after another, so the user can set the relationship and the other details. A person that already existed is not asked. **The notice and the hand-over to the page (`onDone`) wait until the last dialog is closed** (Skip, Save, or a merge all close it). If no person was created (a sign-up import, an old response) nothing changes. If the member list cannot be loaded, skip the dialogs and finish as before. The members come from the existing `getHouseholdMembers()` (`features/auth/api`). Nothing new is drawn.

Apply this change exactly (unified diff of `features/import/useImportOrchestration.tsx`; it sits on top of the S2 change in the same file, so match by the surrounding lines, not by line numbers):
```diff
--- a/frontend/src/features/import/useImportOrchestration.tsx
+++ b/frontend/src/features/import/useImportOrchestration.tsx
@@ -8,4 +8,7 @@ import { clearCasResumeStep2 } from "./casResumeState";
 import { buildConfirmBody } from "./confirmBody";
 import { buildImportNotice, type ImportNotice } from "./importNotice";
+import { getHouseholdMembers } from "../auth/api";
+import type { HouseholdMember } from "../auth/types";
+import { CompleteProfileDialog } from "../dashboard/members/CompleteProfileDialog";
 import { UnidentifiedFundsDialog } from "./UnidentifiedFundsDialog";
 import type { ImportPreviewResponse, PersonConfirmation, PersonPreview, SchemeConfirmation } from "./types";
@@ -50,4 +53,17 @@ export function useImportOrchestration(
   const autoAttempt = useRef<ImportPreviewResponse | null>(null);
   const completionSent = useRef(false);
+  // Members this import created: each gets the Complete profile dialog, one after another, before onDone runs.
+  const [profileQueue, setProfileQueue] = useState<HouseholdMember[]>([]);
+  const pendingNotice = useRef<ImportNotice | null>(null);
+  const finishAfterProfiles = useCallback(() => {
+    const notice = pendingNotice.current;
+    pendingNotice.current = null;
+    if (notice) onDone?.(notice);
+  }, [onDone]);
+  const nextProfile = () => {
+    const rest = profileQueue.slice(1);
+    setProfileQueue(rest);
+    if (rest.length === 0) finishAfterProfiles();
+  };
 
   useEffect(() => {
@@ -62,6 +78,19 @@ export function useImportOrchestration(
     }
     if (!result) return;
-    onDone?.(buildImportNotice(result));
-  }, [flow.confirmResult, flow.errorCode, householdMemberId, onDone]);
+    const notice = buildImportNotice(result);
+    const createdIds = result.people.filter((p) => p.created === true).map((p) => p.member_id);
+    if (createdIds.length === 0) {
+      onDone?.(notice);
+      return;
+    }
+    pendingNotice.current = notice;
+    getHouseholdMembers()
+      .then((members) => {
+        const queue = createdIds.flatMap((id) => members.find((m) => m.id === id) ?? []);
+        if (queue.length === 0) finishAfterProfiles();
+        else setProfileQueue(queue);
+      })
+      .catch(() => finishAfterProfiles());
+  }, [flow.confirmResult, flow.errorCode, householdMemberId, onDone, finishAfterProfiles]);
 
   useEffect(() => {
@@ -194,4 +223,13 @@ export function useImportOrchestration(
         onUploadAgain={() => void cancelImport()}
       />
+      {profileQueue.length > 0 && (
+        <CompleteProfileDialog
+          key={profileQueue[0].id}
+          member={profileQueue[0]}
+          onSaved={() => {}}
+          onMerged={nextProfile}
+          onClose={nextProfile}
+        />
+      )}
       <CancelImportDialog
         isOpen={cancelOpen}
```

**Checkpoint B:** `test src/features/import src/features/dashboard` (expect all pass).

### Phase C: the account holder with no data (task 3.5)
No source edit is expected. The test `Greeting: the account holder with no data` in `features/home/sections/Greeting.test.tsx` is already written. Run it with the rest of Home and Mutual Funds. **If it fails**, report what you found and what the smallest fix would be; do not edit anything under `features/home` without saying so first.
**Checkpoint C:** `test src/features/home src/features/mutual-funds`.

### Phase D: the six life goals (task 5.3)
- The goal codes become `wealth_creation`, `retirement`, `childrens_education`, `buy_home`, `financial_freedom`, `tax_planning`, shown as **Build my wealth**, **Plan for retirement**, **Fund my children’s education** (typed with a plain apostrophe in code: `Fund my children's education`), **Buy a home**, **Achieve financial freedom**, **Plan my taxes**. The old subtitles are gone. `GOAL_OPTIONS` is the one list for the Profile dialog, the chips and the mobile goals screen.
- Profile dialog: all six can be chosen; "Why choose? All of it." stays and now ticks all six; the line above the list reads `Select all that apply`.
- Mobile goals screen (`Q3Purpose`): the six options from the shared list with one small icon each (`lucide-react`: `TrendingUp`, `Armchair`, `GraduationCap`, `House`, `Plane`, `Receipt`; these are stand-ins, the owner replaces them with the drawings later), no subtitles, up to six, the All of it shortcut selects all six, Skip stays, and it sends only the new codes.

Apply these changes exactly:

`features/auth/types.ts`:
```diff
--- a/frontend/src/features/auth/types.ts
+++ b/frontend/src/features/auth/types.ts
@@ -1,8 +1,10 @@
 export type InvestorType = "self_directed" | "advisor_assisted" | "mixed" | "beginner";
 export type PrimaryGoal =
-  | "consolidated_view"
-  | "understand_holdings"
-  | "family_management"
-  | "performance_comparison";
+  | "wealth_creation"
+  | "retirement"
+  | "childrens_education"
+  | "buy_home"
+  | "financial_freedom"
+  | "tax_planning";
 export type Relationship = "self" | "spouse" | "parent" | "child" | "sibling" | "other";
```

`features/profile-v2/lib/onboardingOptions.ts`:
```diff
--- a/frontend/src/features/profile-v2/lib/onboardingOptions.ts
+++ b/frontend/src/features/profile-v2/lib/onboardingOptions.ts
@@ -4,5 +4,4 @@ export interface GoalOption {
   value: PrimaryGoal;
   title: string;
-  subtitle: string;
 }
 
@@ -13,25 +12,12 @@ export interface InvestorOption {
 }
 
+// The single list for sign-up, the mobile goals screen and Profile. The labels come from the signed-off design.
 export const GOAL_OPTIONS: ReadonlyArray<GoalOption> = [
-  {
-    value: "consolidated_view",
-    title: "Consolidated portfolio view",
-    subtitle: "See all my mutual funds across every broker and fund house in one place",
-  },
-  {
-    value: "understand_holdings",
-    title: "Understand true performance",
-    subtitle: "See your true returns after fees, taxes and plan type",
-  },
-  {
-    value: "family_management",
-    title: "Family wealth tracking",
-    subtitle: "Managing investments for family members under one dashboard",
-  },
-  {
-    value: "performance_comparison",
-    title: "Compare distributor fees",
-    subtitle: "Compare returns and costs across different distributors",
-  },
+  { value: "wealth_creation", title: "Build my wealth" },
+  { value: "retirement", title: "Plan for retirement" },
+  { value: "childrens_education", title: "Fund my children's education" },
+  { value: "buy_home", title: "Buy a home" },
+  { value: "financial_freedom", title: "Achieve financial freedom" },
+  { value: "tax_planning", title: "Plan my taxes" },
 ];
```

`features/profile-v2/components/GoalsDialog.tsx`:
```diff
--- a/frontend/src/features/profile-v2/components/GoalsDialog.tsx
+++ b/frontend/src/features/profile-v2/components/GoalsDialog.tsx
@@ -57,5 +57,5 @@ export function GoalsDialog({ stored, onClose }: GoalsDialogProps) {
       <div className="space-y-4">
         <p className="text-sm text-[var(--shell-text-body)]">
-          Pick all that apply. These are your onboarding answers.
+          Select all that apply
         </p>
 
@@ -76,7 +76,4 @@ export function GoalsDialog({ stored, onClose }: GoalsDialogProps) {
                   {option.title}
                 </span>
-                <span className="block text-xs text-[var(--ui-text-muted)]">
-                  {option.subtitle}
-                </span>
               </span>
             </label>
```

`features/auth/Q3Purpose.tsx`:
```diff
--- a/frontend/src/features/auth/Q3Purpose.tsx
+++ b/frontend/src/features/auth/Q3Purpose.tsx
@@ -1,6 +1,7 @@
 import { useState } from "react";
 import { motion } from "motion/react";
-import { ArrowLeft, ArrowRight, Check } from "lucide-react";
+import { ArrowLeft, ArrowRight, Armchair, Check, GraduationCap, House, Plane, Receipt, TrendingUp, type LucideIcon } from "lucide-react";
 import { Button } from "@/components/ui/button";
+import { GOAL_OPTIONS } from "@/features/profile-v2/lib/onboardingOptions";
 import type { PrimaryGoal } from "./types";
 import { OnboardingIllustration } from "./OnboardingIllustration";
@@ -29,83 +30,14 @@ interface Q3PurposeProps {
 }
 
-interface PurposeOption {
-  value: PrimaryGoal;
-  title: string;
-  subtitle: string;
-  renderIllustration: () => React.ReactNode;
-}
+const GOAL_ICONS: Record<PrimaryGoal, LucideIcon> = {
+  wealth_creation: TrendingUp,
+  retirement: Armchair,
+  childrens_education: GraduationCap,
+  buy_home: House,
+  financial_freedom: Plane,
+  tax_planning: Receipt,
+};
 
-const OPTIONS: PurposeOption[] = [
-  {
-    value: "consolidated_view",
-    title: "Consolidated portfolio view",
-    subtitle: "See all my mutual funds across every broker and fund house in one place",
-    renderIllustration: () => (
-      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
-        <path d="M24 5 V8 M12 8 L15 11 M36 8 L33 11" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinecap="round" />
-        <rect x="10" y="12" width="28" height="9" rx="3" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="2" />
-        <circle cx="24" cy="16.5" r="1.5" fill="currentColor" />
-        <rect x="10" y="21" width="28" height="9" rx="3" fill="color-mix(in srgb, var(--color-accent) 15%, transparent)" stroke="currentColor" strokeWidth="2" />
-        <circle cx="24" cy="25.5" r="1.5" fill="var(--color-accent)" />
-        <rect x="8" y="30" width="32" height="11" rx="3" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2" />
-        <rect x="20" y="34" width="8" height="3" rx="1.5" fill="var(--color-accent)" stroke="currentColor" strokeWidth="1.5" />
-        <path d="M12 34 H16" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
-      </svg>
-    ),
-  },
-  {
-    value: "understand_holdings",
-    title: "Understand true performance",
-    subtitle: "See your true returns after fees, taxes and plan type",
-    renderIllustration: () => (
-      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
-        <path d="M16 26 L20 18 H28 L32 26 L24 34 Z" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
-        <path d="M20 18 L24 26 L28 18 M16 26 H32 M24 26 V34" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
-        <circle cx="23" cy="21" r="11" stroke="currentColor" strokeWidth="2.25" fill="color-mix(in srgb, var(--color-accent) 15%, transparent)" />
-        <path d="M16 16 C18 13 22 12 25 13" stroke="var(--color-accent)" strokeWidth="1.75" strokeLinecap="round" />
-        <path d="M31 29 L41 39" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
-        <circle cx="40" cy="38" r="2" fill="var(--color-accent)" />
-        <path d="M35 10 V14 M33 12 H37" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
-        <circle cx="11" cy="14" r="1.5" fill="var(--color-accent)" />
-      </svg>
-    ),
-  },
-  {
-    value: "family_management",
-    title: "Family wealth tracking",
-    subtitle: "Managing investments for family members under one dashboard",
-    renderIllustration: () => (
-      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
-        <path d="M9 22 C9 13.5 15.5 8 24 8 C32.5 8 39 13.5 39 22 C34 20 29 22 24 20 C19 22 14 20 9 22 Z" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
-        <path d="M24 5 V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
-        <path d="M24 20 V33 C24 35.5 22 37 20 37 C18 37 16.5 35.5 16.5 34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
-        <circle cx="16" cy="27" r="4.5" fill="color-mix(in srgb, var(--color-accent) 30%, transparent)" stroke="currentColor" strokeWidth="1.75" />
-        <circle cx="16" cy="27" r="1.5" fill="var(--color-accent)" />
-        <circle cx="32" cy="27" r="4.5" fill="color-mix(in srgb, var(--color-accent) 25%, transparent)" stroke="currentColor" strokeWidth="1.75" />
-        <circle cx="32" cy="27" r="1.5" fill="var(--color-accent)" />
-        <path d="M30 13 L33 11 M35 15 L38 14" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
-      </svg>
-    ),
-  },
-  {
-    value: "performance_comparison",
-    title: "Compare distributor fees",
-    subtitle: "Compare returns and costs across different distributors",
-    renderIllustration: () => (
-      <svg viewBox="0 0 48 48" className="w-10 h-10 sm:w-11 sm:h-11 select-none" fill="none">
-        <path d="M24 9 V37 M18 37 H30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
-        <circle cx="24" cy="11" r="2.5" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1.75" />
-        <path d="M10 15 L38 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
-        <path d="M10 15 L7 24 M10 15 L15 24" stroke="currentColor" strokeWidth="1.5" />
-        <path d="M6 24 C6 24 11 27 16 24 Z" fill="color-mix(in srgb, var(--color-accent) 30%, transparent)" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
-        <circle cx="11" cy="22" r="2" fill="var(--color-accent)" />
-        <path d="M38 19 L33 30 M38 19 L43 30" stroke="currentColor" strokeWidth="1.5" />
-        <path d="M32 30 C32 30 38 33 44 30 Z" fill="color-mix(in srgb, var(--color-accent) 20%, transparent)" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
-        <rect x="36" y="26" width="4" height="4" rx="1" fill="var(--color-accent)" stroke="currentColor" strokeWidth="1.25" />
-        <path d="M7 11 L5 9 M10 8 L9 5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" />
-      </svg>
-    ),
-  },
-];
+const OPTIONS = GOAL_OPTIONS.map((option) => ({ ...option, Icon: GOAL_ICONS[option.value] }));
 
 export const ALL_GOALS: PrimaryGoal[] = OPTIONS.map((o) => o.value);
@@ -122,5 +54,5 @@ export function Q3Purpose({
   const [picked, setPicked] = useState<PrimaryGoal[]>(selectedValues);
   const allPicked = ALL_GOALS.every((g) => picked.includes(g));
-  // "Why choose? All of it." is purely a UI shortcut: it saves the four real goal values, no fifth value (decision Q7).
+  // "Why choose? All of it." is purely a UI shortcut: it saves the six real goal values, no seventh value (decision Q7).
   const toggleAll = () => setPicked(allPicked ? [] : [...ALL_GOALS]);
   const toggle = (v: PrimaryGoal) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
@@ -166,5 +98,5 @@ export function Q3Purpose({
               )}
             >
-              {option.renderIllustration()}
+              <option.Icon className="h-5 w-5" aria-hidden="true" />
             </div>
 
@@ -181,7 +113,4 @@ export function Q3Purpose({
                 {option.title}
               </strong>
-              <span className="block text-[11px] sm:text-xs text-[#5C5C5C] dark:text-[#A3A3A3] leading-snug font-normal">
-                {option.subtitle}
-              </span>
             </div>
```

**Checkpoint D:** `test src/features/auth src/features/profile-v2 src/features/legal src/App.test.tsx src/mobile` (expect all pass), then `types` (no output) and `lint` (0 errors).

## 5. Tests to satisfy (committed)
Phase A: `features/import/prompts/prompts.test.tsx` ("U2 NameMismatchDialog" block and the PromptHost mapping), `features/import/useImportFlow.test.ts` (the two `addAsFamily` tests), `features/import/api.test.ts` (the `resolve-add-as-family` row), `features/import/ImportFlow.test.tsx` (the two U2 tests now click "Add ... as a family member").
Phase B: `features/import/ImportFlow.test.tsx` ("Complete profile after the import" block).
Phase C: `features/home/sections/Greeting.test.tsx` ("the account holder with no data").
Phase D: `features/profile-v2/lib/onboardingOptions.test.ts`, `goalChips.test.ts`, `components/GoalsDialog.test.tsx`, `components/FinancialDetailsCard.test.tsx`, `pages/PersonalInfoPage.test.tsx`, `fixtures/me.ts` and `features/auth/Q3Purpose.test.tsx`, `OnboardingFlow.test.tsx`, `features/legal/ReconsentGate.test.tsx` (new codes in expected payloads).

## 6. Final checks (run all, report the real output)
```
types                      # expect: no output
lint                       # expect: 0 errors
test src/features/import src/features/home src/features/auth src/features/profile-v2 src/features/dashboard src/features/legal src/features/mutual-funds src/components src/mobile src/shell src/App.test.tsx
git status --short         # expect: exactly the 9 edited source files of section 3 (no test, no fixture)
```
Do **not** run `build` or the full suite; the orchestrator runs them. If one test fails only under load, re-run that file alone before reporting it.

## 7. Report (one block, from the rules file)
Add: the exact output of Step 0 (the git lines and the `types` result); the result of checkpoints A, B, C and D; the list of files edited (it must match section 3); every place you deviated from this packet and why; what you could not check (you cannot see the screen: the orchestrator takes the screenshots of the name-mismatch pop-up, the Complete profile dialog after an import, the family view Home with the head showing No data yet, the Profile goals dialog and chips, and the mobile goals screen).
