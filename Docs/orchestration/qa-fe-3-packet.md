# Packet QA-FE-3 for Gemini (Antigravity): Head of Family polish (C1 fix details from the list, C2 review step, C3 sign-in notice, C4 real refusal reasons)

**Status:** READY FOR GEMINI, **after QA-FE-1 and QA-FE-2 are merged** (this packet touches `AuthAlert.tsx`, which QA-FE-2 also changes; the orchestrator syncs your clone to the merged head before you start). The red tests are committed. Your job is to make them green by changing **only** the files each task lists, so the changed dialogs look exactly like the mockups and **every other screen stays exactly as it is today**.
**Rules file (read first; this packet adds to it and wins where they differ):** `Docs/orchestration/ui-common-rules-antigravity.md`. **Spec:** `Docs/superpowers/specs/2026-11-06-qa-fixes-design.html`, sections C1 to C4. **Plan:** `Docs/superpowers/plans/2026-11-06-qa-fixes-implementation.md`, Tasks 8 to 11.
You cannot see the screen. The orchestrator screenshots your result next to the mockups and sends back exact differences. Where this packet gives a class, size or token use it; where it says nothing, keep what the file does today.
**Security-sensitive screen.** `ChangeHeadDialog.tsx` decides who can sign in. **No eligibility rule moves into the client**: the server still decides who is eligible (the list comes from the server and is re-read after every edit), still checks the four codes and enforces the locks. The client only classifies reasons to choose a row's look. Any doubt about identity, eligibility or what is sent to the server: STOP and ask (rule 11 of the rules file).

## Where to work
- Only in the worker clone named in your prompt (`qa-fe`). You never run a git command that changes anything.
- Checks (PowerShell):
```
wsl.exe -d Ubuntu -- env CR6_SRC="/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/frontend" CR6_DST=/home/delladiti/qa-fe-worker bash "/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/Docs/orchestration/cr-r6-fe-check.sh" test src/features/profile-v2 src/features/auth src/features/dashboard/members
wsl.exe -d Ubuntu -- env CR6_SRC="/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/frontend" CR6_DST=/home/delladiti/qa-fe-worker bash "/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/Docs/orchestration/cr-r6-fe-check.sh" types
wsl.exe -d Ubuntu -- env CR6_SRC="/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/frontend" CR6_DST=/home/delladiti/qa-fe-worker bash "/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/Docs/orchestration/cr-r6-fe-check.sh" lint
```
- **Before you start** red: `headEligibility.test.ts` and `refusal.test.ts` (fail to load: modules missing); all of `ChangeHeadDialog.fix.test.tsx` but one; 7 tests in `ChangeHeadDialog.test.tsx` (the changed ones); 3 each in `DeleteMemberDialog.refusal.test.tsx` and `DeleteAccountDialog.refusal.test.tsx`; 3 in `signInNotice.test.tsx`. Everything else under those folders passes. Keep it all green.

## Hard rules for this packet
1. **The red test files are fixed.** Do not edit, weaken or delete a test. If one seems wrong, say which and why under Open questions and make the rest pass.
2. **Only the files listed in each task may change.** The orchestrator diffs your clone against an allowed-files list.
3. **Unchanged UI stays byte-identical.** Do not touch: step 2 ("Enter the four codes") of `ChangeHeadDialog`, the countdown logic, the cancel/complete/expiry handling, `features/dashboard/members/CompleteProfileDialog.tsx` (it is reused **unchanged**), the Family page except the one prop in T1, the other profile-v2 pages and dialogs, `mobile/**`.
4. No new dependency, no `package.json`/lockfile change, no `any`, no `console.`, no em dashes in user-visible text, no new user-visible words beyond the ones written here. Never guess a pronoun for a person (the server's sentences are used as sent). A `.tsx` file that exports a component must not also export a constant or hook.
5. Colours only through app tokens (`--ui-*`, `--shell-*`, `--pos*`, `--auth-*` on sign-in). The mockups are drawn in dark and light; the app has no blue "info" token, so the calm notice is **neutral** (see the token map).
6. Never log a code, an email or a phone number.

### Token map (mockup to app)
| Mockup | Use |
|---|---|
| dialog / row background (`--m-card`) | `bg-[var(--ui-card)]` (rows) and the Modal's own surface (unchanged) |
| border / divider (`--m-line`) | `border-[var(--ui-divider)]` |
| text / muted | `text-[var(--ui-text)]` / `text-[var(--ui-text-muted)]` |
| green chip ("Add details") | `border border-[var(--pos)]/35 bg-[var(--pos-bg)] text-[var(--pos-text)]` |
| blue info box (`alert-info`) | neutral: `border border-[var(--ui-divider)] bg-[var(--ui-card)] text-[var(--ui-text)]` with a lucide `Info` icon in `text-[var(--ui-text-muted)]` (a known difference from the blue mockup; the owner signs it off) |

---

## T1. Fix a member's missing details from the Choose head list (C1)

**Files you may change:** `frontend/src/features/profile-v2/components/ChangeHeadDialog.tsx`, `frontend/src/features/profile-v2/pages/FamilyPage.tsx` (one prop). **New file:** `frontend/src/features/profile-v2/lib/headEligibility.ts`.
**Tests that must go green:** `lib/headEligibility.test.ts`, `components/ChangeHeadDialog.fix.test.tsx`, the changed test `ineligible_members_are_greyed_with_the_reason` in `ChangeHeadDialog.test.tsx`. **Must stay green:** all other tests in `ChangeHeadDialog.test.tsx`, `FamilyPage*.test.tsx`, `features/dashboard/members`.

### Today and what changes
Members with a reason are greyed and cannot be clicked, so to add a missing email the person closes the dialog, goes to Family, edits the member and comes back. Now a member whose reasons are **all fixable here** is a clickable row; clicking it opens the **existing Complete profile dialog** (unchanged); when its sequence ends the Choose head list is re-read from the server and an eligible member is selected for the person.

### The mockups. Real HTML from the approved spec (dark shown; use the token map)
```html
<!-- BEFORE: greyed, dead end -->
<div class="row dis"><div class="flex between"><b>Suresh Raman Iyer</b><span class="muted sm">Not set</span></div><div class="muted sm">Add an email address and a phone number first.</div></div>
<!-- AFTER: the list -->
<div class="row"><div class="flex between"><b>Suresh Raman Iyer</b><span class="chip">Add details</span></div><div class="muted sm">Needs an email address and a phone number.</div></div>
<div class="row"><div class="flex between"><b>Aarav Suresh Iyer</b><span class="muted sm">Sibling</span></div></div>              <!-- eligible: unchanged radio row -->
<div class="row dis"><div class="flex between"><b>Meera Iyer</b><span class="muted sm">Parent</span></div><div class="muted sm">A statement is being imported. Finish it first.</div></div>   <!-- not fixable: unchanged -->
<!-- AFTER: a fixable member is clicked -->  the existing Complete profile dialog opens here, unchanged; the Choose head dialog is hidden while it is open.
  On close: list reloaded. Suresh is now eligible, so he is selected and Next is enabled.
```
Row metrics are today's row: `rounded-xl border p-3 text-sm`, name 14 px 600, the right text 12 px.

### `lib/headEligibility.ts` (new, hook-free `.ts`)
```ts
export const FIXABLE_REASONS: ReadonlySet<string>   // exactly: no_email, no_phone, no_pan, label_missing, same_email_as_head, same_phone_as_head, email_in_use, phone_in_use
export function isFixable(reasons: readonly string[]): boolean   // true only when there is at least one reason and every reason is in FIXABLE_REASONS
export function fixableHint(reasons: readonly string[]): string  // "Needs " + the things joined "a, b and c" + "."
```
`fixableHint` maps reasons to a thing, says each thing once, in this fixed order: `an email address` (no_email), `a phone number` (no_phone), `their PAN` (no_pan), `their relationship to you` (label_missing), `a different email address` (same_email_as_head, email_in_use), `a different phone number` (same_phone_as_head, phone_in_use). Joined with commas and "and" before the last (`Needs an email address, a phone number, their PAN and their relationship to you.`). The test file has every case.

### `ChangeHeadDialog.tsx`
1. **Props:** add optional `onMembersChanged?: () => void`. `FamilyPage.tsx` passes it: `onMembersChanged={() => { refreshEverywhere(); load(); }}` (both already exist in that file; it keeps the Family list and the shell's member list fresh while this dialog is open).
2. **Row look, by case** (in the step 1 `eligibility.map`):
   - **Eligible** (`reasons.length === 0`): unchanged radio row.
   - **Fixable** (`isFixable(item.reasons)`): a `<button type="button" data-testid="head-fixable-row" disabled={startCodeSent || step1Submitting !== null} onClick={() => setDetailsFor(item.member_id)} className="flex w-full items-start gap-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-left text-sm hover:bg-[var(--ui-row-hover)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]">`. Inside: `<span className="min-w-0 flex-1">` with a row `<span className="flex items-center justify-between gap-2"><span className="truncate font-semibold text-[var(--ui-text)]">{memberName}</span><span className="shrink-0 rounded-full border border-[var(--pos)]/35 bg-[var(--pos-bg)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--pos-text)]">Add details</span></span>` and below `<span className="mt-1 block text-xs text-[var(--ui-text-muted)]">{fixableHint(item.reasons)}</span>`. It is **not** a radio (it cannot be chosen until it is fixed).
   - **Not fixable** (any reason outside the fixable set, even if others are fixable): today's disabled radio row, but the sentence shown is for the **first reason that is not fixable** (today it shows `item.reasons[0]`); same `REASON_SENTENCES` lookup and the same fallback sentence.
3. **State and flow:**
   - `const [detailsFor, setDetailsFor] = useState<string | null>(null)` and `const pendingSelect = useRef<string | null>(null)`.
   - When `detailsFor` is set, the component **returns `<CompleteProfileDialog ... />` instead of its own `<Modal>`** (all hooks stay above that return; never render both: this app's Modal has its own focus trap and Escape handler and two together fight). Props: `key={detailsFor}`, `member={members.find(m => m.id === detailsFor)}` (if it is not found, clear `detailsFor` and render the normal dialog), `accountPhone={me?.phone_number}`, `accountEmail={me?.email}` (read `me` from the `useAuth()` you already call), `onSaved={() => onMembersChanged?.()}`, `onMerged={() => onMembersChanged?.()}`, `onClose={() => { pendingSelect.current = detailsFor; setDetailsFor(null); loadEligibility(); }}`. Import it from `@/features/dashboard/members/CompleteProfileDialog`. Do not pass `onChangeInAccountInfo`.
   - `loadEligibility()` keeps its behaviour and, when its response arrives (and the component is still mounted): set the list; then `setSelectedMemberId(prev => ...)`: keep `prev` only if that member is still in the new list with no reasons, otherwise `null`; then, if `pendingSelect.current` names a member now in the list with no reasons and `!startCodeSent`, select that member; finally clear `pendingSelect`. A member merged away is simply absent from the new list. A member who still has a reason is not selected and shows the remaining reason on the row.
   - Once the start code has been sent, all rows (fixable ones too) stay disabled, as today.
4. Nothing else in step 1, 2 or 3 changes in this task (T2 and T3 touch step 3 and the notice).

---

## T2. The review step before confirming a head change (C2)

**File you may change:** `frontend/src/features/profile-v2/components/ChangeHeadDialog.tsx`. **New file:** `frontend/src/features/profile-v2/components/InfoNotice.tsx` (also used by T4).
**Tests that must go green:** the changed tests `preview_labels_and_review_notes_are_shown`, `a_member_whose_label_does_not_change_but_needs_a_check_gets_one_plain_sentence`, and the two new ones at the end of `ChangeHeadDialog.test.tsx`. **Must stay green:** every other test there (especially the countdown ones: the text `9:50 left` must stay one element).

### The mockup (real HTML, dark; map colours with the token map)
```html
<div class="dialog"><div class="flex between"><h5 style="margin:0">Priya Rohan Kulkarni becomes Head of Family</h5><span class="chip mute">7:42 left</span></div>
  <div class="row" style="margin-top:10px"><div class="muted sm">Signs in from now with</div><b>priya@example.com</b> · <b>+91 98765 43210</b></div>
  <div class="row"><div class="muted sm" style="margin-bottom:4px">What changes</div>
    <div class="flex between"><span>Rohan Vijay Kulkarni</span><span class="muted sm">Head of Family → Spouse</span></div>
    <div class="flex between"><span>Priya Rohan Kulkarni</span><span class="muted sm">Spouse → Head of Family</span></div></div>
  <div class="alert-info" style="margin-bottom:8px"><b>You will be signed out.</b> So will everyone else on this account. Rohan can no longer sign in.</div>
  <div class="muted sm" style="margin-bottom:8px">All portfolio data stays exactly as it is.</div>
  <div class="flex" style="justify-content:flex-end;gap:8px"><span class="btn q">Back</span><span class="btn g">Confirm the change</span></div></div>
```
Before: a stack of sentences ("Priya will sign in with ...", "Rohan stays as a member ...", "You and everyone else ... signed out", "All portfolio data stays ...") and a bullet list of label changes.

### `InfoNotice.tsx` (new): `export function InfoNotice({ children, role, testId }: { children: ReactNode; role?: "status"; testId?: string })`
`<div role={role} data-testid={testId} className="flex items-start gap-2 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-sm text-[var(--ui-text)]"><Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true" /><div className="min-w-0">{children}</div></div>` (lucide `Info`).

### Step 3 markup (replace the content of the `else` branch up to, not including, the error line and the buttons row)
The error line (`step3Error`), the "Try again" button and the whole footer (Cancel this change, Back, Confirm the change) are **unchanged**. Replace the top (the old countdown paragraph) and the preview block with:
1. **Header, always shown** (even while the summary loads): `<div className="flex items-start justify-between gap-3"><p data-testid="head-review-title" className="text-base font-semibold leading-snug text-[var(--ui-text)]">{newName} becomes Head of Family</p><span className="shrink-0 rounded-full border border-[var(--ui-divider)] px-2.5 py-0.5 text-xs font-medium text-[var(--ui-text-muted)]">{formatCountdown(remainingSeconds)} left</span></div>`, where `newName` is `cleanName(preview.new_head.name)` once the preview is there, else `resolvedNewHeadName`. The chip text is exactly `M:SS left` in one element.
2. While `previewLoading && !preview`: the existing `Loading summary…` line. When `preview` is there, these blocks in order, in `<div className="space-y-3">`:
   - **Signs in:** `<div data-testid="head-review-signin" className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3"><p className="text-xs text-[var(--ui-text-muted)]">Signs in from now with</p><p className="mt-0.5 text-sm text-[var(--ui-text)]"><strong className="font-semibold">{email}</strong><span className="text-[var(--ui-text-muted)]"> · </span><strong className="font-semibold">{phone_number}</strong></p></div>`.
   - **What changes:** `<div data-testid="head-review-changes" className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3"><p className="mb-1 text-xs text-[var(--ui-text-muted)]">What changes</p><ul className="divide-y divide-[var(--ui-divider)]">` then one `<li data-testid="head-review-change" className="py-1.5 text-sm">` per change, in the **same order and with the same rules as today's list** (the old head's own row first when `preview.old_head_new_label` is set; then `preview.members.filter(hasLabelChange)`): inside, `<div className="flex items-start justify-between gap-3"><span className="min-w-0 break-words text-[var(--ui-text)]">{name}</span><span className="shrink-0 text-xs text-[var(--ui-text-muted)]">{before} → {after}</span></div>` (the right side is **one string** `` `${before} → ${after}` ``, with `previewLabelText` for both; the old head's row uses `previewLabelText("self", null)` and `previewLabelText(preview.old_head_new_label, null)`). A member whose label does not change but needs a check (today's one-sentence case: `before === after && review_recommended && !cleared`): the right side is just `{before}` (no arrow) and a second line `<p className="mt-0.5 text-xs text-[var(--ui-text-muted)]">Please check this one after the change.</p>`. For other rows keep today's extra lines as muted paragraphs of the same classes: `Please check this one after the change.` when `review_recommended`, and `` `Their note '${member.label_before_other}' will be removed.` `` when `cleared && label_before_other`. Names go through `cleanName`.
   - **Signed out:** `<InfoNotice testId="head-review-signout"><strong className="font-semibold">You will be signed out.</strong> So will everyone else on this account. {cleanName(preview.old_head.name)} can no longer sign in.</InfoNotice>`.
   - **Reassurance:** `<p className="text-xs text-[var(--ui-text-muted)]">All portfolio data stays exactly as it is.</p>`.
3. The old sentences ("will sign in with", "stays as a member and will no longer sign in", "You and everyone else on this account will be signed out.") are removed (the tests check they are gone).

---

## T3. The notice on the sign-in page after a head change (C3)

**Files you may change:** `frontend/src/features/auth/session.ts`, `features/auth/AuthEntryFlow.tsx`, `features/auth/redesign/LoginEntry.tsx`, `features/auth/redesign/AuthAlert.tsx`, `features/profile-v2/components/ChangeHeadDialog.tsx`.
**Tests that must go green:** `src/features/auth/signInNotice.test.tsx`; in `ChangeHeadDialog.test.tsx`: `success_calls_logout` and the two `complete_that_..._takes_the_success_path` tests. **Must stay green:** everything under `src/features/auth` (the existing `LoginEntry` notice test with a plain sentence included).

### The mockup (real HTML, light; the sign-in page is always light)
```html
<!-- BEFORE -->  <div style="font-size:13px;color:#1D4ED8">The Head of Family has been changed. Sign in with the new Head's email or phone number.</div><h6>Welcome back</h6>
<!-- AFTER -->
<div class="infocard"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="#1D4ED8" stroke-width="1.6"/><path d="M10 9v5M10 6v.1" stroke="#1D4ED8" stroke-width="1.8" stroke-linecap="round"/></svg>
  <div><b>Head of Family changed</b><div style="font-size:12.5px">Sign in with pr••••@gmail.com or +91 ••••• 43210. Rohan can no longer sign in.</div></div></div>
<h6>Welcome back</h6>
/* .infocard { display:flex; gap:10px; border:1px solid #B2CCFF; background:#EEF4FF; color:#1B2A57; border-radius:14px; padding:11px 12px; margin-bottom:14px } */
```
The sign-in page already has an **info tone** alert (`AuthAlert tone="info"`, green-tinted tokens). Keep that tone for this card (the mockup's blue is not an app token; a known difference the owner signs off).

### Changes
- **`session.ts`:** `export interface SignInNotice { title: string; body: string }`; the stored value is `string | SignInNotice | null`; `setSignInNotice(notice: string | SignInNotice | null)` and `getSignInNotice(): string | SignInNotice | null`. Still memory only (a module variable), still cleared by `setToken` (unchanged). Nothing is written to browser storage.
- **`AuthAlert.tsx`:** new optional prop `title?: string`. Without it the component renders exactly as today (one `<p className="text-[14px]">`, no icon). With it: inside the same outer element (same role, same classes) render `<div className="flex items-start gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--auth-green-ink)]" aria-hidden="true" /><div className="min-w-0 space-y-0.5"><p data-testid="auth-alert-title" className="text-[14.5px] font-bold">{title}</p><p className="text-[13px]">{children}</p></div></div>` where `Icon` is lucide `Info` for the info tone and `CircleAlert` for the error tone. The optional action button stays below, unchanged. (QA-FE-2 already changed this file's error colours; keep them.)
- **`AuthEntryFlow.tsx`:** the `notice` state becomes `string | SignInNotice | null` (its three uses are unchanged otherwise) and is passed on to `LoginEntry`.
- **`LoginEntry.tsx`:** `notice?: string | SignInNotice | null`. A string renders exactly as today (`<AuthAlert tone="info">{notice}</AuthAlert>`); an object renders `<AuthAlert tone="info" title={notice.title}>{notice.body}</AuthAlert>` in the same place above the form.
- **`ChangeHeadDialog.tsx`, `finishSignedOut`:** use `maskEmail` and `maskPhone` from `@/features/auth/validation`. When `preview` is available: `setSignInNotice({ title: "Head of Family changed", body: `Sign in with ${maskEmail(preview.new_head.email)} or ${maskPhone(preview.new_head.phone_number)}. ${cleanName(preview.old_head.name)} can no longer sign in.` })`. When it is not (the session-gone path after a lost reply), store the existing `SIGN_IN_NOTICE` sentence exactly as today. Never store or show an unmasked email or number.

---

## T4. Show the real reason when a delete is refused (C4)

**Files you may change:** `frontend/src/features/profile-v2/components/DeleteMemberDialog.tsx`, `DeleteAccountDialog.tsx`. **New file:** `frontend/src/features/auth/refusal.ts`. (`InfoNotice.tsx` comes from T2.)
**Tests that must go green:** `src/features/auth/refusal.test.ts`, `DeleteMemberDialog.refusal.test.tsx`, `DeleteAccountDialog.refusal.test.tsx`. **Must stay green:** the existing `DeleteMemberDialog.test.tsx` and `DeleteAccountDialog.test.tsx` (the generic failure message and buttons are unchanged).

### Why
Both screens catch every error and say "Could not delete this member. Please try again." / "Could not schedule account deletion. Please try again." even when the server refuses on purpose until a date. The back end now answers `409 { code, message, available_after }` (the message already names the date, in India time). The dialogs must show **the server's sentence** as a calm notice with one OK.

### The mockups (real HTML, dark; use the token map)
```html
<!-- member, BEFORE -->  <h5>Delete Riya Sharma from your family?</h5> ... <div class="alert-red">Could not delete this member. Please try again.</div> ... [Keep] [Delete member]
<!-- member, AFTER -->   <h5>Riya Sharma can't be removed yet</h5>
  <div class="alert-info">She was part of a recent Head of Family change. You can remove her on <b>12 Nov 2026</b>.</div>   [OK]
<!-- account, BEFORE --> <h5>Confirm account deletion</h5> ... <div class="alert-red">Could not schedule account deletion. Please try again.</div> ... [Cancel] [Confirm deletion]
<!-- account, AFTER -->  <h5>You can't delete this account yet</h5>
  <div class="alert-info">The Head of Family was changed in the last 24 hours. You can delete the account after the undo window closes on <b>6 Nov 2026, 3:33 PM IST</b>.</div>   [OK]
```
Differences from the mockup, accepted: the sentence is the server's own (neutral wording, no "She", the date is not bold).

### `features/auth/refusal.ts` (new, hook-free)
```ts
export interface Refusal { code: "member_in_recent_head_change" | "head_change_undo_window"; message: string; availableAfter: string | null }
export function readRefusal(err: unknown): Refusal | null
```
Non-null only when the status is **409** (read it the way `ChangeHeadDialog.errorStatus` does: an object with a numeric `status`, so look-alike errors work), the payload (`payload` property, an object) has one of the two codes above and a non-empty string `message`. `availableAfter` is the payload's `available_after` string or `null`. Anything else (other statuses, other codes, a plain-string 409 like "Account deletion is already scheduled.", network errors, non-errors) is `null`. The test file has every case.

### The two dialogs
- In the existing `catch`, call `readRefusal(err)`. When it matches **this dialog's** code (`member_in_recent_head_change` in `DeleteMemberDialog`, `head_change_undo_window` in `DeleteAccountDialog`), store it in new state `refusal` instead of setting the generic error. Any other failure sets the generic message exactly as today.
- While `refusal` is set: the Modal `title` is `` `${cleanName(member.name) || "This person"} can't be removed yet` `` (member dialog) or `You can't delete this account yet` (account dialog); the body is **only** `<InfoNotice role="status" testId="refusal-notice">{refusal.message}</InfoNotice>`; the old explanatory paragraphs, the generic error and the destructive and Keep/Cancel buttons are not rendered. The footer is **one** button `OK` (a `<button type="button" onClick={onClose}>` styled like today's Keep/Cancel button in that file), no way to try again. The close cross and Escape (the Modal's own) still call `onClose`.
- Do not clear a refusal on a timer; do not retry. The account dialog's survey step is untouched (the refusal only appears after Confirm deletion).

---

## Report (one block, nothing else)
Failing counts before and after, with the exact commands; `git status --short` (only the files named above); every file edited outside the lists and why (there should be none); decisions this packet did not cover; what you could not check (you cannot see the screen: say so); Open questions.

## What the orchestrator checks after you
Screenshots at 1440x810 and 1920x1080 of the Choose head list with "Add details" rows, the review step, the sign-in page with the card, and both refusal dialogs (the refusals on a throwaway account after a real head change), next to the mockups; the neighbouring screens against the baseline; the diff against the allowed-files list; and a **second, scoped review of `ChangeHeadDialog.tsx`** (identity and eligibility handling) before this is called done.
